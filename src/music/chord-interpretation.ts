import { confidence, type Confidence, type PitchClass } from '../shared';
import { buildChord, CHORD_DEFINITIONS, type Chord, type ChordDefinition } from './chord';
import type { Key } from './key';
import { spellPitchClassInKey } from './key';
import {
  PITCH_CLASSES,
  spellPitchClass,
  transposePitchClass,
  type AccidentalPreference,
} from './pitch';

export type WeightedPitchClass = {
  readonly pitchClass: PitchClass;
  readonly weight: number;
};

export type ChordEvidenceWindow = {
  readonly bass?: readonly WeightedPitchClass[];
  readonly pitchClasses: readonly WeightedPitchClass[];
  readonly sourceEventIds: readonly string[];
};

export type ChordInterpretationEvidence = {
  readonly contribution: number;
  readonly description: string;
  readonly kind: 'bass' | 'extra-tones' | 'matched-tones' | 'missing-tones' | 'root';
  readonly pitchClasses: readonly PitchClass[];
};

export type RankedChordInterpretation = {
  readonly chord: Chord;
  readonly confidence: Confidence;
  readonly evidence: readonly ChordInterpretationEvidence[];
  readonly extraPitchClasses: readonly PitchClass[];
  readonly matchedPitchClasses: readonly PitchClass[];
  readonly missingPitchClasses: readonly PitchClass[];
  readonly rank: number;
  readonly score: number;
  readonly sourceEventIds: readonly string[];
};

export type ChordInterpretationOptions = {
  readonly candidateLimit?: number;
  readonly key?: Key;
  readonly spellingPreference?: AccidentalPreference;
};

type ScoredInterpretation = Omit<RankedChordInterpretation, 'confidence' | 'rank'>;

const PRESENCE_THRESHOLD = 0.15;
const COVERAGE_WEIGHT = 0.45;
const PRECISION_WEIGHT = 0.3;
const ROOT_WEIGHT = 0.15;
const ROOT_BASS_BONUS = 0.1;
const INVERSION_BASS_BONUS = 0.07;
const NON_CHORD_BASS_PENALTY = 0.08;
const MISSING_TONE_PENALTY = 0.04;

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

export const aggregatePitchClassEvidence = (
  observations: readonly WeightedPitchClass[],
  label: string,
): ReadonlyMap<PitchClass, number> => {
  const totals = new Map<PitchClass, number>();
  observations.forEach(({ pitchClass, weight }) => {
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) {
      throw new RangeError(`${label} weights must be finite values from 0 through 1.`);
    }
    totals.set(pitchClass, Math.min(1, (totals.get(pitchClass) ?? 0) + weight));
  });
  return totals;
};

const strongestPitchClass = (evidence: ReadonlyMap<PitchClass, number>): PitchClass | undefined => {
  let strongest: PitchClass | undefined;
  let strongestWeight = 0;
  PITCH_CLASSES.forEach((pitchClass) => {
    const weight = evidence.get(pitchClass) ?? 0;
    if (weight >= PRESENCE_THRESHOLD && weight > strongestWeight) {
      strongest = pitchClass;
      strongestWeight = weight;
    }
  });
  return strongest;
};

const chordPitchClasses = (root: PitchClass, definition: ChordDefinition): PitchClass[] =>
  definition.intervals.map((chordInterval) => transposePitchClass(root, chordInterval.semitones));

const describePitchClasses = (pitchClasses: readonly PitchClass[]): string =>
  pitchClasses.length === 0 ? 'none' : pitchClasses.join(', ');

const scoreInterpretation = (
  root: PitchClass,
  definition: ChordDefinition,
  pitchEvidence: ReadonlyMap<PitchClass, number>,
  bassEvidence: ReadonlyMap<PitchClass, number>,
  sourceEventIds: readonly string[],
  options: ChordInterpretationOptions,
): ScoredInterpretation => {
  const expectedPitchClasses = chordPitchClasses(root, definition);
  const expectedSet = new Set(expectedPitchClasses);
  const observedPitchClasses = PITCH_CLASSES.filter(
    (pitchClass) => (pitchEvidence.get(pitchClass) ?? 0) >= PRESENCE_THRESHOLD,
  );
  const matchedPitchClasses = expectedPitchClasses.filter(
    (pitchClass) => (pitchEvidence.get(pitchClass) ?? 0) >= PRESENCE_THRESHOLD,
  );
  const missingPitchClasses = expectedPitchClasses.filter(
    (pitchClass) => (pitchEvidence.get(pitchClass) ?? 0) < PRESENCE_THRESHOLD,
  );
  const extraPitchClasses = observedPitchClasses.filter(
    (pitchClass) => !expectedSet.has(pitchClass),
  );
  const matchedWeight = expectedPitchClasses.reduce(
    (sum, pitchClass) => sum + (pitchEvidence.get(pitchClass) ?? 0),
    0,
  );
  const extraWeight = extraPitchClasses.reduce(
    (sum, pitchClass) => sum + (pitchEvidence.get(pitchClass) ?? 0),
    0,
  );
  const coverage = matchedWeight / expectedPitchClasses.length;
  const precision = matchedWeight / Math.max(Number.EPSILON, matchedWeight + extraWeight);
  const rootEvidence = pitchEvidence.get(root) ?? 0;
  const strongestBass = strongestPitchClass(bassEvidence);
  const bassIsChordTone = strongestBass !== undefined && expectedSet.has(strongestBass);
  const bassContribution =
    strongestBass === undefined
      ? 0
      : strongestBass === root
        ? ROOT_BASS_BONUS
        : bassIsChordTone
          ? INVERSION_BASS_BONUS
          : -NON_CHORD_BASS_PENALTY;
  const missingPenalty = missingPitchClasses.length * MISSING_TONE_PENALTY;
  const score =
    coverage * COVERAGE_WEIGHT +
    precision * PRECISION_WEIGHT +
    rootEvidence * ROOT_WEIGHT +
    bassContribution -
    missingPenalty;
  const rootSpelling =
    options.key === undefined
      ? spellPitchClass(root, options.spellingPreference ?? 'sharps')
      : spellPitchClassInKey(root, options.key);
  const chord = buildChord(
    rootSpelling,
    definition.quality,
    bassIsChordTone ? strongestBass : undefined,
  );
  const evidence: ChordInterpretationEvidence[] = [
    {
      contribution: coverage * COVERAGE_WEIGHT,
      description: `Matched chord tones: ${describePitchClasses(matchedPitchClasses)}.`,
      kind: 'matched-tones',
      pitchClasses: matchedPitchClasses,
    },
    {
      contribution: -missingPenalty,
      description: `Missing chord tones: ${describePitchClasses(missingPitchClasses)}.`,
      kind: 'missing-tones',
      pitchClasses: missingPitchClasses,
    },
    {
      contribution: precision * PRECISION_WEIGHT,
      description: `Non-chord tones: ${describePitchClasses(extraPitchClasses)}.`,
      kind: 'extra-tones',
      pitchClasses: extraPitchClasses,
    },
    {
      contribution: rootEvidence * ROOT_WEIGHT,
      description: `Root evidence for ${root}: ${rootEvidence.toFixed(3)}.`,
      kind: 'root',
      pitchClasses: [root],
    },
  ];
  if (strongestBass !== undefined) {
    evidence.push({
      contribution: bassContribution,
      description: bassIsChordTone
        ? `Bass evidence supports ${strongestBass}${strongestBass === root ? ' as the root' : ' as an inversion'}.`
        : `Bass evidence at ${strongestBass} is outside the chord.`,
      kind: 'bass',
      pitchClasses: [strongestBass],
    });
  }
  return {
    chord,
    evidence,
    extraPitchClasses,
    matchedPitchClasses,
    missingPitchClasses,
    score,
    sourceEventIds: [...sourceEventIds],
  };
};

export function rankChordInterpretations(
  window: ChordEvidenceWindow,
  options: ChordInterpretationOptions = {},
): RankedChordInterpretation[] {
  const candidateLimit = options.candidateLimit ?? 5;
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1) {
    throw new RangeError('Chord interpretation candidate limit must be a positive integer.');
  }
  if (
    window.sourceEventIds.length === 0 ||
    window.sourceEventIds.some((eventId) => eventId.length === 0)
  ) {
    throw new RangeError('Chord interpretation requires nonempty source event IDs.');
  }
  const pitchEvidence = aggregatePitchClassEvidence(window.pitchClasses, 'Pitch-class');
  const bassEvidence = aggregatePitchClassEvidence(window.bass ?? [], 'Bass');
  const activePitchClassCount = PITCH_CLASSES.filter(
    (pitchClass) => (pitchEvidence.get(pitchClass) ?? 0) >= PRESENCE_THRESHOLD,
  ).length;
  if (activePitchClassCount < 2) return [];

  const scored = PITCH_CLASSES.flatMap((root) =>
    Object.values(CHORD_DEFINITIONS).map((definition) =>
      scoreInterpretation(
        root,
        definition,
        pitchEvidence,
        bassEvidence,
        window.sourceEventIds,
        options,
      ),
    ),
  ).sort(
    (left, right) =>
      right.score - left.score ||
      left.missingPitchClasses.length - right.missingPitchClasses.length ||
      left.extraPitchClasses.length - right.extraPitchClasses.length ||
      left.chord.symbol.localeCompare(right.chord.symbol),
  );

  const strongestScore = scored[0]?.score ?? 0;
  const runnerUpScore = scored[1]?.score ?? 0;
  const strongestMargin = Math.max(0, strongestScore - runnerUpScore);
  return scored.slice(0, candidateLimit).map((candidate, index) => {
    const relativeScore = Math.exp(-4 * Math.max(0, strongestScore - candidate.score));
    const absoluteConfidence = clampUnit((candidate.score - 0.2) / 0.8);
    const marginMultiplier = index === 0 ? 0.8 + Math.min(0.2, strongestMargin * 2) : 0.8;
    return {
      ...candidate,
      confidence: confidence(clampUnit(absoluteConfidence * relativeScore * marginMultiplier)),
      rank: index + 1,
    };
  });
}
