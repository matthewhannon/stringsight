import { describe, expect, it } from 'vitest';

import { NoteEventSchema } from '../../shared';
import { EnergyOnsetDetector } from './onset';
import { StreamingMonophonicPipeline } from './pipeline';
import {
  createRankedPitchCandidates,
  estimateYinPitch,
  frequencyToMidi,
  midiToFrequency,
  midiToNoteName,
} from './pitch';
import { StreamingMonophonicAnalyzer } from './streaming';
import { StreamingAnalysisResampler } from './resample';

function sineWave(
  frequencyHz: number,
  sampleRate: number,
  frameCount: number,
  amplitude = 0.5,
): Float32Array {
  return Float32Array.from(
    { length: frameCount },
    (_, frame) => Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRate) * amplitude,
  );
}

function monophonicFixture(
  sampleRate: number,
  notes: readonly { durationMs: number; frequencyHz: number | null }[],
): Float32Array {
  const samples: number[] = [];
  for (const note of notes) {
    const frames = Math.round((note.durationMs / 1_000) * sampleRate);
    for (let frame = 0; frame < frames; frame += 1) {
      const attack = Math.min(1, frame / Math.max(1, Math.round(sampleRate * 0.008)));
      samples.push(
        note.frequencyHz === null
          ? 0
          : Math.sin((2 * Math.PI * note.frequencyHz * frame) / sampleRate) * 0.35 * attack,
      );
    }
  }
  return Float32Array.from(samples);
}

describe('pitch conversions', () => {
  it('maps frequencies, MIDI notes, note names, and octave boundaries', () => {
    expect(frequencyToMidi(440)).toBe(69);
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(40)).toBeCloseTo(82.4069, 3);
    expect(midiToNoteName(40)).toBe('E2');
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(88)).toBe('E6');
  });

  it('returns sequential ranked candidates with explicit octave ambiguity', () => {
    const candidates = createRankedPitchCandidates(440, 0.95);
    expect(candidates.map(({ midi, rank }) => ({ midi, rank }))).toEqual([
      { midi: 69, rank: 1 },
      { midi: 57, rank: 2 },
      { midi: 81, rank: 3 },
    ]);
    expect(candidates[0]).toMatchObject({ centsOffset: 0, noteName: 'A4', pitchClass: 'A' });
    expect(candidates[1]?.evidence).toContain('known-octave-ambiguity');
  });
});

describe('YIN-style pitch estimation', () => {
  it.each([
    [82.4069, 'E2'],
    [110, 'A2'],
    [440, 'A4'],
    [1_318.51, 'E6'],
  ] as const)('estimates %s Hz (%s) across the evaluated guitar range', (frequencyHz, noteName) => {
    const estimate = estimateYinPitch(sineWave(frequencyHz, 48_000, 4_096), 48_000);
    expect(estimate).not.toBeNull();
    const estimatedFrequency = estimate?.frequencyHz ?? 0;
    expect(Math.abs(1_200 * Math.log2(estimatedFrequency / frequencyHz))).toBeLessThan(1);
    expect(estimate?.clarity).toBeGreaterThan(0.95);
    expect(
      createRankedPitchCandidates(estimatedFrequency, estimate?.clarity ?? 0)[0]?.noteName,
    ).toBe(noteName);
  });

  it('finds the fundamental in a deterministic harmonic signal', () => {
    const sampleRate = 16_000;
    const samples = Float32Array.from({ length: 2_048 }, (_, frame) => {
      const phase = (2 * Math.PI * 220 * frame) / sampleRate;
      return Math.sin(phase) * 0.35 + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 3) * 0.1;
    });
    const estimate = estimateYinPitch(samples, sampleRate);
    expect(estimate?.frequencyHz).toBeCloseTo(220, 1);
  });

  it('refuses silence instead of forcing a pitch', () => {
    expect(estimateYinPitch(new Float32Array(4_096), 48_000)).toBeNull();
  });
});

describe('16 kHz streaming analysis path', () => {
  it('preserves guitar pitch while suppressing content above the analysis Nyquist band', () => {
    const sampleRate = 48_000;
    const resampler = new StreamingAnalysisResampler(sampleRate);
    const guitarTone = resampler.push(sineWave(440, sampleRate, sampleRate)).samples.slice(256);
    const guitarRms = Math.sqrt(
      guitarTone.reduce((sum, sample) => sum + sample * sample, 0) / guitarTone.length,
    );

    resampler.reset();
    const ultrasonicTone = resampler
      .push(sineWave(12_000, sampleRate, sampleRate))
      .samples.slice(256);
    const ultrasonicRms = Math.sqrt(
      ultrasonicTone.reduce((sum, sample) => sum + sample * sample, 0) / ultrasonicTone.length,
    );

    expect(resampler.outputSampleRate).toBe(16_000);
    expect(guitarRms).toBeGreaterThan(0.3);
    expect(ultrasonicRms).toBeLessThan(guitarRms * 0.12);
  });

  it('keeps sample timing and pitch stable across arbitrary input chunks', () => {
    const source = monophonicFixture(48_000, [
      { durationMs: 100, frequencyHz: null },
      { durationMs: 320, frequencyHz: 110 },
      { durationMs: 100, frequencyHz: null },
    ]);
    const pipeline = new StreamingMonophonicPipeline(48_000, 'downsampled-a2');
    const boundaries = [0, 2_017, 7_001, source.length];
    const results = boundaries
      .slice(0, -1)
      .map((start, index) =>
        pipeline.push(source.slice(start, boundaries[index + 1]), (start / 48_000) * 1_000),
      );
    const finalized = results
      .flatMap((result) => result.events)
      .find((event) => event.lifecycle === 'finalized');

    expect(results.every((result) => result.analysisSampleRate === 16_000)).toBe(true);
    expect(results.every((result) => result.inputSampleRate === 48_000)).toBe(true);
    expect(results.flatMap((result) => result.onsets)[0]?.atMs).toBeCloseTo(100, 0);
    expect(finalized?.candidates[0]?.noteName).toBe('A2');
  });
});

describe('adaptive energy onset detection', () => {
  it('detects attacks while enforcing the refractory interval', () => {
    const detector = new EnergyOnsetDetector();
    expect(detector.process(0.001, 0)).toBeNull();
    const first = detector.process(0.08, 100);
    expect(first).toMatchObject({ rms: 0.08 });
    expect(first?.strengthDb).toBeGreaterThan(7);
    expect(detector.process(0.2, 130)).toBeNull();
    for (let atMs = 150; atMs <= 450; atMs += 20) {
      expect(detector.process(0.001, atMs)).toBeNull();
    }
    expect(detector.process(0.1, 500)).not.toBeNull();
  });

  it('does not turn sustained low-string energy fluctuation into repeated attacks', () => {
    const detector = new EnergyOnsetDetector();
    for (let atMs = 0; atMs < 100; atMs += 5) {
      expect(detector.process(0.001, atMs)).toBeNull();
    }
    expect(detector.process(0.08, 100)).not.toBeNull();

    for (let atMs = 105; atMs <= 600; atMs += 5) {
      const phaseDependentRms = Math.floor(atMs / 5) % 2 === 0 ? 0.018 : 0.08;
      expect(detector.process(phaseDependentRms, atMs)).toBeNull();
    }
  });

  it('adapts its silence threshold without treating a steady signal as repeated onsets', () => {
    const detector = new EnergyOnsetDetector();
    for (let index = 0; index < 20; index += 1) {
      expect(detector.process(0.002, index * 5)).toBeNull();
    }
    expect(detector.process(0.04, 100)).not.toBeNull();
    for (let index = 1; index < 20; index += 1) {
      expect(detector.process(0.04, 100 + index * 5)).toBeNull();
    }
    expect(detector.silenceThreshold).toBeGreaterThanOrEqual(0.003);
  });
});

describe('streaming monophonic event tracking', () => {
  const sampleRate = 16_000;
  const samples = monophonicFixture(sampleRate, [
    { durationMs: 100, frequencyHz: null },
    { durationMs: 320, frequencyHz: 110 },
    { durationMs: 100, frequencyHz: null },
  ]);

  it('emits a timed onset, provisional updates, and a finalized ranked note event', () => {
    const analyzer = new StreamingMonophonicAnalyzer(sampleRate, 'single-a2');
    const result = analyzer.push(samples, 0);
    const finalized = result.events.find((event) => event.lifecycle === 'finalized');

    expect(result.onsets).toHaveLength(1);
    expect(result.onsets[0]?.atMs).toBeCloseTo(100, 0);
    expect(result.events.some((event) => event.lifecycle === 'provisional')).toBe(true);
    expect(finalized?.candidates[0]).toMatchObject({ midi: 45, noteName: 'A2', rank: 1 });
    expect(finalized?.candidates.map((candidate) => candidate.rank)).toEqual([1, 2]);
    expect(finalized?.time.startMs).toBeCloseTo(100, 0);
    expect(finalized?.time.endMs).toBeGreaterThan(390);
    expect(NoteEventSchema.safeParse(finalized).success).toBe(true);
    expect(result.state).toBe('silence');
  });

  it('produces equivalent finalized output across arbitrary PCM chunk boundaries', () => {
    const analyzer = new StreamingMonophonicAnalyzer(sampleRate, 'chunked-a2');
    const first = samples.slice(0, 1_777);
    const second = samples.slice(1_777, 5_123);
    const third = samples.slice(5_123);
    const results = [
      analyzer.push(first, 0),
      analyzer.push(second, (first.length / sampleRate) * 1_000),
      analyzer.push(third, ((first.length + second.length) / sampleRate) * 1_000),
    ];
    const finalized = results
      .flatMap((result) => result.events)
      .find((event) => event.lifecycle === 'finalized');
    const onsets = results.flatMap((result) => result.onsets);

    expect(onsets).toHaveLength(1);
    expect(finalized?.candidates[0]?.midi).toBe(45);
    expect(finalized?.time.startMs).toBeCloseTo(100, 0);
  });

  it('finalizes the previous note when a distinct attack starts', () => {
    const phrase = monophonicFixture(sampleRate, [
      { durationMs: 80, frequencyHz: null },
      { durationMs: 240, frequencyHz: 110 },
      { durationMs: 90, frequencyHz: null },
      { durationMs: 240, frequencyHz: 130.8128 },
      { durationMs: 100, frequencyHz: null },
    ]);
    const analyzer = new StreamingMonophonicAnalyzer(sampleRate, 'phrase');
    const result = analyzer.push(phrase, 0);
    const finalized = result.events.filter((event) => event.lifecycle === 'finalized');

    expect(result.onsets).toHaveLength(2);
    expect(finalized.map((event) => event.candidates[0]?.noteName)).toEqual(['A2', 'C3']);
    expect(finalized[0]?.time.endMs).toBeLessThanOrEqual(finalized[1]?.time.startMs ?? 0);
  });

  it('preserves sustained pitch movement as bend-or-vibrato uncertainty', () => {
    const movingPitch = monophonicFixture(sampleRate, [
      { durationMs: 80, frequencyHz: null },
      { durationMs: 240, frequencyHz: 110 },
      { durationMs: 260, frequencyHz: 115 },
      { durationMs: 100, frequencyHz: null },
    ]);
    const analyzer = new StreamingMonophonicAnalyzer(sampleRate, 'bend');
    const result = analyzer.push(movingPitch, 0);

    expect(result.events.some((event) => event.diagnostics.pitchState === 'bend-or-vibrato')).toBe(
      true,
    );
    expect(result.events.filter((event) => event.lifecycle === 'finalized')).toHaveLength(1);
  });
});
