import { describe, expect, it } from 'vitest';

import { StreamingAttackDetector } from './attack-detector';

const SAMPLE_RATE = 16_000;

const sine = (frames: number, gain: number, startFrame = 0): Float32Array =>
  Float32Array.from(
    { length: frames },
    (_, frame) => gain * Math.sin((2 * Math.PI * 220 * (frame + startFrame)) / SAMPLE_RATE),
  );

const attackSignal = (gain: number): Float32Array => {
  const output = new Float32Array(SAMPLE_RATE * 2);
  output.set(sine(SAMPLE_RATE, gain * 0.02), 0);
  let seed = 17;
  for (let frame = SAMPLE_RATE; frame < SAMPLE_RATE + 320; frame += 1) {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    output[frame] = ((seed / 2 ** 32) * 2 - 1) * gain;
  }
  output.set(sine(SAMPLE_RATE - 320, gain * 0.5, SAMPLE_RATE + 320), SAMPLE_RATE + 320);
  return output;
};

const analyze = (samples: Float32Array) => {
  const detector = new StreamingAttackDetector(SAMPLE_RATE);
  detector.push(samples, 0);
  return detector.consumeUntil((samples.length / SAMPLE_RATE) * 1_000);
};

describe('streaming attack detector', () => {
  it('does not report an attack for a steady harmonic signal', () => {
    expect(analyze(sine(SAMPLE_RATE * 3, 0.08))).toMatchObject({
      peakTimeMs: null,
      strength: 0,
    });
  });

  it('locates one broadband attack after a stable baseline', () => {
    const attack = analyze(attackSignal(0.18));

    expect(attack.peakTimeMs).toBeGreaterThanOrEqual(990);
    expect(attack.peakTimeMs).toBeLessThanOrEqual(1_080);
    expect(attack.spectralFluxZ).toBeGreaterThan(5);
    expect(attack.strength).toBeGreaterThan(0.5);
  });

  it('normalizes attack strength across a broad input gain range', () => {
    const quiet = analyze(attackSignal(0.05));
    const loud = analyze(attackSignal(0.4));

    expect(quiet.peakTimeMs).not.toBeNull();
    expect(loud.peakTimeMs).not.toBeNull();
    expect(Math.abs(quiet.strength - loud.strength)).toBeLessThan(0.2);
  });

  it('resets spectral history and pending frames at a discontinuity', () => {
    const detector = new StreamingAttackDetector(SAMPLE_RATE);
    detector.push(attackSignal(0.2), 0);
    detector.push(sine(SAMPLE_RATE, 0.03), 5_000, true);

    expect(detector.consumeUntil(6_000)).toMatchObject({ peakTimeMs: null, strength: 0 });
  });
});
