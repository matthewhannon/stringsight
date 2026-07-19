import type { ChordCandidate } from '../../shared';
import type { ChordAnalysisProfile } from './contracts';
import type { ChordBoundaryEvidence } from './chord-observations';

export type ChordObservation = {
  candidates: readonly ChordCandidate[];
  boundaryBefore?: ChordBoundaryEvidence;
  endMs: number;
  evidenceConfidence?: number;
  requireBoundaryForTransition?: boolean;
  sequenceBreakBefore?: boolean;
  startMs: number;
};

export type DecodedChordSpan = ChordObservation & {
  selected: ChordCandidate;
};

const PROFILE_PARAMETERS: Record<
  ChordAnalysisProfile,
  {
    emissionScale: number;
    transitionPenalty: number;
  }
> = {
  accurate: {
    emissionScale: 4,
    transitionPenalty: 0.2,
  },
  responsive: {
    emissionScale: 4,
    transitionPenalty: 0.1,
  },
};

const emissionScore = (
  candidate: ChordCandidate,
  durationMs: number,
  profile: ChordAnalysisProfile,
): number => {
  const parameters = PROFILE_PARAMETERS[profile];
  const durationSeconds = Math.max(0.04, durationMs / 1_000);
  return candidate.score * durationSeconds * parameters.emissionScale;
};

const transitionPenalty = (
  basePenalty: number,
  boundary: ChordBoundaryEvidence | undefined,
  requireBoundary: boolean,
): number => {
  if (boundary?.mode === 'attack-change') return basePenalty * 0.15;
  if (boundary?.mode === 'persistent-change') return basePenalty * 0.25;
  if (requireBoundary) return 1_000_000;
  return basePenalty;
};

/**
 * Jointly selects one chord label per observation. Unlike top-1 polling, a label change must
 * recover a profile-specific transition cost, so short note-decoder flicker remains inside the
 * surrounding chord. The accurate profile intentionally spends more look-ahead on stability.
 */
export function decodeChordSequence(
  observations: readonly ChordObservation[],
  profile: ChordAnalysisProfile = 'accurate',
): DecodedChordSpan[] {
  if (observations.length === 0) return [];
  const symbols = [
    ...new Set(
      observations.flatMap((observation) => observation.candidates.map(({ symbol }) => symbol)),
    ),
  ];
  if (symbols.length === 0) return [];
  const candidateByObservation = observations.map(
    (observation) =>
      new Map(observation.candidates.map((candidate) => [candidate.symbol, candidate])),
  );
  const scores = observations.map(() => symbols.map(() => Number.NEGATIVE_INFINITY));
  const backPointers = observations.map(() => symbols.map(() => -1));
  const parameters = PROFILE_PARAMETERS[profile];
  const firstObservation = observations[0];
  const firstScoreRow = scores[0];
  if (firstObservation === undefined || firstScoreRow === undefined) return [];

  symbols.forEach((symbol, stateIndex) => {
    const candidate = candidateByObservation[0]?.get(symbol);
    if (candidate !== undefined) {
      firstScoreRow[stateIndex] = emissionScore(
        candidate,
        firstObservation.endMs - firstObservation.startMs,
        profile,
      );
    }
  });

  for (let observationIndex = 1; observationIndex < observations.length; observationIndex += 1) {
    const observation = observations[observationIndex];
    const scoreRow = scores[observationIndex];
    const backPointerRow = backPointers[observationIndex];
    if (observation === undefined || scoreRow === undefined || backPointerRow === undefined)
      continue;
    symbols.forEach((symbol, stateIndex) => {
      const candidate = candidateByObservation[observationIndex]?.get(symbol);
      if (candidate === undefined) return;
      let bestPreviousScore = Number.NEGATIVE_INFINITY;
      let bestPreviousState = -1;
      symbols.forEach((previousSymbol, previousState) => {
        const previousScore =
          scores[observationIndex - 1]?.[previousState] ?? Number.NEGATIVE_INFINITY;
        const transitionCost =
          previousSymbol === symbol
            ? 0
            : transitionPenalty(
                parameters.transitionPenalty,
                observation.boundaryBefore,
                observation.requireBoundaryForTransition ?? false,
              );
        const score = previousScore - transitionCost;
        if (score > bestPreviousScore) {
          bestPreviousScore = score;
          bestPreviousState = previousState;
        }
      });
      scoreRow[stateIndex] =
        bestPreviousScore +
        emissionScore(candidate, observation.endMs - observation.startMs, profile);
      backPointerRow[stateIndex] = bestPreviousState;
    });
  }

  const finalScores = scores.at(-1);
  if (finalScores === undefined) return [];
  let state = finalScores.reduce(
    (best, score, index, row) => (score > (row[best] ?? Number.NEGATIVE_INFINITY) ? index : best),
    0,
  );
  const path = Array.from({ length: observations.length }, () => 0);
  for (
    let observationIndex = observations.length - 1;
    observationIndex >= 0;
    observationIndex -= 1
  ) {
    path[observationIndex] = state;
    state = backPointers[observationIndex]?.[state] ?? -1;
    if (state < 0 && observationIndex > 0) state = path[observationIndex] ?? 0;
  }

  return observations.map((observation, index) => {
    const symbol = symbols[path[index] ?? 0];
    if (symbol === undefined) throw new Error('Temporal chord path referenced an unknown state.');
    const selected = candidateByObservation[index]?.get(symbol) ?? observation.candidates[0];
    if (selected === undefined) throw new Error('Chord observation did not contain a candidate.');
    return { ...observation, selected };
  });
}
