import type { ChordCandidate } from '../../shared';
import type { ChordAnalysisProfile } from './contracts';

export type ChordObservation = {
  candidates: readonly ChordCandidate[];
  endMs: number;
  evidenceConfidence?: number;
  startMs: number;
};

export type DecodedChordSpan = ChordObservation & {
  selected: ChordCandidate;
};

const PROFILE_PARAMETERS: Record<
  ChordAnalysisProfile,
  {
    emissionScale: number;
    extensionPrior: number;
    transitionPenalty: number;
    weakExtensionPenalty: number;
  }
> = {
  accurate: {
    emissionScale: 4,
    extensionPrior: 0.08,
    transitionPenalty: 0.32,
    weakExtensionPenalty: 0.16,
  },
  responsive: {
    emissionScale: 4,
    extensionPrior: 0.025,
    transitionPenalty: 0.12,
    weakExtensionPenalty: 0.08,
  },
};

const isSeventh = (candidate: ChordCandidate): boolean =>
  candidate.quality === 'dominant-7' ||
  candidate.quality === 'major-7' ||
  candidate.quality === 'minor-7';

const emissionScore = (
  candidate: ChordCandidate,
  durationMs: number,
  profile: ChordAnalysisProfile,
  evidenceConfidence = 1,
): number => {
  const parameters = PROFILE_PARAMETERS[profile];
  const durationSeconds = Math.max(0.04, durationMs / 1_000);
  const complexityPrior = isSeventh(candidate)
    ? parameters.extensionPrior +
      (1 - Math.max(0, Math.min(1, evidenceConfidence))) * parameters.weakExtensionPenalty
    : 0;
  return (candidate.score - complexityPrior) * durationSeconds * parameters.emissionScale;
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
        firstObservation.evidenceConfidence,
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
        const transitionCost = previousSymbol === symbol ? 0 : parameters.transitionPenalty;
        const score = previousScore - transitionCost;
        if (score > bestPreviousScore) {
          bestPreviousScore = score;
          bestPreviousState = previousState;
        }
      });
      scoreRow[stateIndex] =
        bestPreviousScore +
        emissionScore(
          candidate,
          observation.endMs - observation.startMs,
          profile,
          observation.evidenceConfidence,
        );
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
