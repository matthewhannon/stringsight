import { describe, expect, it } from 'vitest';

import { matchChordTemplates } from './chords';
import { computeHarmonicChroma } from './harmonic-chroma';

const SAMPLE_RATE = 16_000;
const WINDOW_FRAMES = 12_288;

const addChord = (
  output: Float32Array,
  midiNotes: readonly number[],
  startFrame = 0,
  endFrame = output.length,
  tuningCents = 0,
): void => {
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    output[frame] = midiNotes.reduce((sum, midi, index) => {
      const frequencyHz = 440 * 2 ** ((midi - 69 + tuningCents / 100) / 12);
      return (
        sum + Math.sin((2 * Math.PI * frequencyHz * frame) / SAMPLE_RATE) * (0.16 / (index + 1))
      );
    }, 0);
  }
};

const topSymbol = (values: readonly number[]): string | undefined =>
  matchChordTemplates({ bass: values, energy: 0.1, values })[0]?.symbol;

describe('harmonic chord frontend', () => {
  it('returns no pitch evidence for silence', () => {
    const observation = computeHarmonicChroma(new Float32Array(WINDOW_FRAMES), SAMPLE_RATE);

    expect(observation.energy).toBe(0);
    expect(observation.tuningCents).toBe(0);
    expect(observation.values.every((value) => value === 0)).toBe(true);
  });

  it('estimates tuning before folding a detuned chord into pitch classes', () => {
    const samples = new Float32Array(WINDOW_FRAMES);
    addChord(samples, [43, 47, 50, 55, 59, 67], 0, samples.length, 27);

    const observation = computeHarmonicChroma(samples, SAMPLE_RATE);

    expect(observation.tuningCents).toBeGreaterThan(18);
    expect(observation.tuningCents).toBeLessThan(35);
    expect(topSymbol(observation.values)).toBe('G');
  });

  it('suppresses broadband pick attack evidence while retaining the sustained chord', () => {
    const samples = new Float32Array(WINDOW_FRAMES);
    addChord(samples, [43, 47, 50, 55, 59, 67]);
    let seed = 7;
    for (let frame = 0; frame < 1_400; frame += 1) {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      const noise = (seed / 2 ** 32) * 2 - 1;
      samples[frame] = (samples[frame] ?? 0) + noise * 0.45 * (1 - frame / 1_400);
    }

    const observation = computeHarmonicChroma(samples, SAMPLE_RATE);

    expect(observation.transientRatio).toBeGreaterThan(0);
    expect(topSymbol(observation.values)).toBe('G');
  });

  it('keeps short-time change evidence separate from the pooled chord label', () => {
    const samples = new Float32Array(WINDOW_FRAMES);
    addChord(samples, [43, 47, 50, 55, 59, 67], 0, 8_192);
    addChord(samples, [48, 52, 55, 60, 64], 8_192);

    const observation = computeHarmonicChroma(samples, SAMPLE_RATE);

    expect(topSymbol(observation.changeValues)).toBe('C');
    expect(observation.changeValues).not.toEqual(observation.values);
    expect(observation.bass).toHaveLength(12);
    expect(observation.treble).toHaveLength(12);
  });

  it('validates its analysis layout and supports an explicit smaller layout', () => {
    const samples = new Float32Array(4_096);
    addChord(samples, [48, 52, 55]);

    expect(() => computeHarmonicChroma(samples, 0)).toThrow(/sample rate/i);
    expect(() => computeHarmonicChroma(new Float32Array(100), SAMPLE_RATE)).toThrow(/valid frame/i);
    expect(() => computeHarmonicChroma(samples, SAMPLE_RATE, { hopSize: 0 })).toThrow(
      /valid frame/i,
    );
    expect(() =>
      computeHarmonicChroma(samples, SAMPLE_RATE, { maxNoteMidi: 60, minNoteMidi: 61 }),
    ).toThrow(/valid frame/i);

    const observation = computeHarmonicChroma(samples, SAMPLE_RATE, {
      fftSize: 4_096,
      frameSize: 2_048,
      hopSize: 512,
      maxNoteMidi: 76,
      maxSpectrumMidi: 100,
      minNoteMidi: 45,
    });
    expect(topSymbol(observation.values)).toBe('C');
    expect(observation.noteMidiRange).toEqual({ max: 76, min: 45 });
  });
});
