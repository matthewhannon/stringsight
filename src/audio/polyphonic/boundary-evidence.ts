import type { AcousticChordHop, ChordBoundaryEvidence } from './chord-observations';
import { CHORD_TEMPLATE_CATALOG } from './chords';

export type BoundaryEvidenceOptions = {
  readonly attackThreshold?: number;
  readonly distanceThreshold?: number;
  readonly noveltyThreshold?: number;
  readonly persistentChangeMs?: number;
};

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const normalized = (values: ArrayLike<number>): number[] => {
  const total = Array.from(values).reduce((sum, value) => sum + Math.max(0, value), 0);
  return Array.from(values, (value) => (total <= Number.EPSILON ? 0 : Math.max(0, value) / total));
};

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 1) + (sorted[middle] ?? 1)) / 2
    : (sorted[middle] ?? 1);
};

export const harmonicHellingerDistance = (
  reference: ArrayLike<number>,
  current: ArrayLike<number>,
): number => {
  const left = normalized(reference);
  const right = normalized(current);
  const squaredDistance = left.reduce(
    (sum, value, index) => sum + (Math.sqrt(value) - Math.sqrt(right[index] ?? 0)) ** 2,
    0,
  );
  return clampUnit(Math.sqrt(squaredDistance) / Math.SQRT2);
};

/** Positive pitch-class activation that cannot be explained by scaled decay of the reference. */
export const unexplainedNovelToneStrength = (
  reference: ArrayLike<number>,
  current: ArrayLike<number>,
): number => {
  const referenceValues = Array.from(reference, (value) => Math.max(0, value));
  const currentValues = Array.from(current, (value) => Math.max(0, value));
  const referenceMaximum = Math.max(0, ...referenceValues);
  const sharedRatios = referenceValues.flatMap((value, index) => {
    const currentValue = currentValues[index] ?? 0;
    return value >= referenceMaximum * 0.08 && currentValue > 0 ? [currentValue / value] : [];
  });
  const decayScale = Math.max(0, median(sharedRatios));
  const totalCurrent = currentValues.reduce((sum, value) => sum + value, 0);
  const unexplained = currentValues.reduce(
    (sum, value, index) => sum + Math.max(0, value - decayScale * (referenceValues[index] ?? 0)),
    0,
  );
  return totalCurrent <= Number.EPSILON ? 0 : clampUnit(unexplained / totalCurrent);
};

export function computeChordBoundaryEvidence(
  reference: AcousticChordHop,
  current: AcousticChordHop,
  persistenceMs: number,
  options: BoundaryEvidenceOptions = {},
): ChordBoundaryEvidence {
  const distanceThreshold = options.distanceThreshold ?? 0.22;
  const noveltyThreshold = options.noveltyThreshold ?? 0.12;
  const attackThreshold = options.attackThreshold ?? 0.2;
  const persistentChangeMs = options.persistentChangeMs ?? 400;
  const harmonicDistance = harmonicHellingerDistance(
    reference.harmony.longChroma,
    current.harmony.shortChroma,
  );
  const novelToneStrength = unexplainedNovelToneStrength(
    reference.harmony.pitchClassActivations,
    current.harmony.pitchClassActivations,
  );
  const currentBest = (current.harmony.shortCandidates ?? current.harmony.topCandidates)[0];
  const acceptedSymbol = reference.harmony.topCandidates[0]?.symbol;
  const acceptedIndex = CHORD_TEMPLATE_CATALOG.findIndex(({ symbol }) => symbol === acceptedSymbol);
  const activeScores = current.harmony.shortTemplateScores ?? current.harmony.templateScores;
  const acceptedScore = acceptedIndex < 0 ? undefined : activeScores[acceptedIndex];
  const candidateMargin =
    currentBest === undefined || acceptedScore === undefined
      ? 0
      : currentBest.score - acceptedScore;
  const hasHarmonicChange =
    harmonicDistance >= distanceThreshold &&
    novelToneStrength >= noveltyThreshold &&
    candidateMargin > 0;
  const attackSupported = current.attack.strength >= attackThreshold && hasHarmonicChange;
  const persistentSupported = persistenceMs >= persistentChangeMs && hasHarmonicChange;
  const mode = attackSupported
    ? 'attack-change'
    : persistentSupported
      ? 'persistent-change'
      : 'none';
  const attackComponent = current.attack.strength;
  const distanceComponent = clampUnit(harmonicDistance / Math.max(0.01, distanceThreshold * 2));
  const noveltyComponent = clampUnit(novelToneStrength / Math.max(0.01, noveltyThreshold * 2));
  const persistenceComponent = clampUnit(persistenceMs / Math.max(1, persistentChangeMs));
  const score = clampUnit(
    0.3 * attackComponent +
      0.3 * distanceComponent +
      0.25 * noveltyComponent +
      0.15 * persistenceComponent,
  );
  return {
    atMs:
      mode === 'attack-change'
        ? (current.attack.peakTimeMs ?? current.support.shortStartMs)
        : current.support.shortStartMs,
    attackStrength: current.attack.strength,
    candidateMargin,
    harmonicDistance,
    mode,
    novelToneStrength,
    persistenceMs,
    score,
  };
}
