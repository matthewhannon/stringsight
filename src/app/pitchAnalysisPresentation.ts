import type { AnalysisState } from '../audio/analysis';

export type PitchConfidenceLevel = 'High' | 'Low' | 'Medium';

export const pitchConfidenceLevel = (confidence: number): PitchConfidenceLevel => {
  if (confidence >= 0.65) return 'High';
  if (confidence >= 0.4) return 'Medium';
  return 'Low';
};

export const pitchCorrectionInstruction = (cents: number): string => {
  if (Math.abs(cents) <= 2) return 'Hold this pitch';
  const direction = cents > 0 ? 'Lower' : 'Raise';
  return Math.abs(cents) <= 25 ? `${direction} pitch slightly` : `${direction} pitch`;
};

export const pitchSignalLabel = (state: AnalysisState, hasCandidate: boolean): string => {
  if (!hasCandidate) return state === 'uncertain' ? 'Signal lost' : 'Listening';
  if (state === 'uncertain') return 'Unstable signal';
  if (state === 'bend-or-vibrato') return 'Pitch moving';
  if (state === 'transient') return 'Signal settling';
  if (state === 'silence') return 'Signal ended';
  return 'Stable signal';
};
