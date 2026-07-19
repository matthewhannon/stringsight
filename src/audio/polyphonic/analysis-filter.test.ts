import { describe, expect, it } from 'vitest';

import { ChordAnalysisBandPassFilter } from './analysis-filter';

const SAMPLE_RATE = 16_000;
const sine = (frequencyHz: number): Float32Array =>
  Float32Array.from({ length: SAMPLE_RATE }, (_, frame) =>
    Math.sin((2 * Math.PI * frequencyHz * frame) / SAMPLE_RATE),
  );
const tailRms = (samples: Float32Array): number => {
  const tail = samples.slice(SAMPLE_RATE / 4);
  return Math.sqrt(tail.reduce((sum, sample) => sum + sample * sample, 0) / tail.length);
};

describe('chord analysis band-pass', () => {
  it('passes guitar fundamentals while attenuating handling and high-frequency pick noise', () => {
    const process = (frequencyHz: number) =>
      tailRms(new ChordAnalysisBandPassFilter(SAMPLE_RATE).process(sine(frequencyHz)));
    const guitar = process(196);
    expect(guitar).toBeGreaterThan(0.65);
    expect(process(20)).toBeLessThan(guitar * 0.15);
    expect(process(7_000)).toBeLessThan(guitar * 0.15);
  });

  it('resets state at a stream discontinuity and validates its cutoffs', () => {
    const filter = new ChordAnalysisBandPassFilter(SAMPLE_RATE);
    filter.process(sine(196).slice(0, 1_000));
    expect(filter.process(Float32Array.of(0), true)[0]).toBe(0);
    expect(() => new ChordAnalysisBandPassFilter(0)).toThrow(/cutoff/i);
    expect(() => new ChordAnalysisBandPassFilter(SAMPLE_RATE, { lowPassHz: 8_000 })).toThrow(
      /cutoff/i,
    );
  });
});
