import { describe, expect, it } from 'vitest';

import type { AcousticChordHop } from './chord-observations';
import {
  computeChordBoundaryEvidence,
  harmonicHellingerDistance,
  unexplainedNovelToneStrength,
} from './boundary-evidence';
import { matchChordTemplates, scoreChordTemplates } from './chords';

const hop = (
  values: readonly number[],
  activations: readonly number[],
  options: { attack?: number; endMs?: number } = {},
): AcousticChordHop => {
  const bass = values;
  const observation = { bass, energy: 0.1, values };
  const endMs = options.endMs ?? 1_000;
  return {
    activityEnergy: 0.1,
    attack: {
      energyRiseDb: options.attack === undefined ? 0 : 4,
      peakTimeMs: options.attack === undefined ? null : endMs - 100,
      percussiveRatio: 0,
      spectralFluxZ: options.attack === undefined ? 0 : 7,
      strength: options.attack ?? 0,
    },
    discontinuity: false,
    featureTimeMs: endMs,
    harmony: {
      activationTotal: activations.reduce((sum, value) => sum + value, 0),
      bassChroma: Float32Array.from(bass),
      longChroma: Float32Array.from(values),
      pitchClassActivations: Float32Array.from(activations),
      shortChroma: Float32Array.from(values),
      templateScores: scoreChordTemplates(observation),
      topCandidates: matchChordTemplates(observation),
      trebleChroma: Float32Array.from(values),
      tuningCents: 0,
    },
    sequence: 1,
    support: { endMs, longStartMs: endMs - 768, shortStartMs: endMs - 320 },
    time: { endMs, startMs: endMs - 80 },
  };
};

describe('chord boundary evidence', () => {
  const cMajor = [0.34, 0, 0, 0, 0.33, 0, 0, 0.33, 0, 0, 0, 0];
  const gMajor = [0, 0, 0.3, 0, 0, 0, 0, 0.36, 0, 0, 0, 0.34];

  it('treats proportional decay as neither harmonic distance nor novel tone evidence', () => {
    expect(
      harmonicHellingerDistance(
        cMajor,
        cMajor.map((value) => value * 0.25),
      ),
    ).toBeCloseTo(0, 8);
    expect(
      unexplainedNovelToneStrength(
        cMajor,
        cMajor.map((value) => value * 0.25),
      ),
    ).toBeCloseTo(0, 8);
  });

  it('marks attack-supported replacement tones as an attacked chord change', () => {
    const evidence = computeChordBoundaryEvidence(
      hop(cMajor, cMajor),
      hop(gMajor, gMajor, { attack: 0.9, endMs: 1_400 }),
      160,
    );

    expect(evidence.mode).toBe('attack-change');
    expect(evidence.harmonicDistance).toBeGreaterThan(0.2);
    expect(evidence.novelToneStrength).toBeGreaterThan(0.1);
    expect(evidence.atMs).toBe(1_300);
  });

  it('requires longer persistence when a real harmonic change has no attack', () => {
    const reference = hop(cMajor, cMajor);
    const current = hop(gMajor, gMajor, { endMs: 1_500 });

    expect(computeChordBoundaryEvidence(reference, current, 160).mode).toBe('none');
    expect(computeChordBoundaryEvidence(reference, current, 480).mode).toBe('persistent-change');
  });
});
