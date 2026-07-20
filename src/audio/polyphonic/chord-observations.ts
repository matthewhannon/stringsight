import type { ChordCandidate } from '../../shared';

/** Shared activity gate used by both causal and full-run chord-boundary inference. */
export const POLYPHONIC_ACTIVITY_OPEN_THRESHOLD = 0.012;
export const CHORD_CHANGE_ACTIVITY_PEAK_RATIO = 0.2;
export const CHORD_ATTACK_EVIDENCE_THRESHOLD = 0.2;
export const CHORD_LOW_DEFINITION_MATCH_STRENGTH = 0.55;

export type AttackObservation = {
  readonly energyRiseDb: number;
  readonly peakTimeMs: number | null;
  readonly percussiveRatio: number;
  readonly spectralFluxZ: number;
  readonly strength: number;
};

export type HarmonicEvidence = {
  readonly activationTotal: number;
  readonly bassChroma: Float32Array;
  readonly longChroma: Float32Array;
  readonly pitchClassActivations: Float32Array;
  readonly shortChroma: Float32Array;
  readonly shortTemplateScores?: Float32Array;
  readonly shortCandidates?: readonly ChordCandidate[];
  readonly templateScores: Float32Array;
  readonly topCandidates: readonly ChordCandidate[];
  readonly trebleChroma: Float32Array;
  readonly tuningCents: number;
};

export type ChordBoundaryEvidence = {
  readonly atMs: number;
  readonly attackStrength: number;
  readonly candidateMargin: number;
  readonly harmonicDistance: number;
  readonly mode: 'attack-change' | 'none' | 'persistent-change';
  readonly novelToneStrength: number;
  readonly persistenceMs: number;
  readonly score: number;
};

export type AcousticChordHop = {
  readonly activityEnergy: number;
  readonly attack: AttackObservation;
  readonly boundaryBefore?: ChordBoundaryEvidence;
  readonly discontinuity: boolean;
  readonly featureTimeMs: number;
  readonly harmony: HarmonicEvidence;
  readonly sequence: number;
  readonly support: {
    readonly endMs: number;
    readonly longStartMs: number;
    readonly shortStartMs: number;
  };
  readonly time: { readonly endMs: number; readonly startMs: number };
};

export const EMPTY_ATTACK_OBSERVATION: AttackObservation = {
  energyRiseDb: 0,
  peakTimeMs: null,
  percussiveRatio: 0,
  spectralFluxZ: 0,
  strength: 0,
};
