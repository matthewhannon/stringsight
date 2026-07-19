import { confidence, type Confidence, type PitchClass } from '../shared';
import { aggregatePitchClassEvidence, type WeightedPitchClass } from './chord-interpretation';
import { keyForPitchClass, keysAreEnharmonic, type Key, type KeyMode } from './key';
import { PITCH_CLASSES, spellPitchClass, toPitchClass, type AccidentalPreference } from './pitch';
import { buildScale, SCALE_DEFINITIONS, type Scale } from './scale';

export type TimedPitchClassEvidence = {
  readonly confidence: number;
  readonly eventId: string;
  readonly pitchClasses: readonly WeightedPitchClass[];
  readonly time: {
    readonly endMs: number;
    readonly startMs: number;
  };
};

export type ScaleKeyInterpretationEvidence = {
  readonly contribution: number;
  readonly description: string;
  readonly kind: 'continuity' | 'coverage' | 'fit' | 'tonic';
};

type RankedWindowInterpretation = {
  readonly confidence: Confidence;
  readonly evidence: readonly ScaleKeyInterpretationEvidence[];
  readonly rank: number;
  readonly score: number;
  readonly sourceEventIds: readonly string[];
};

export type RankedScaleInterpretation = RankedWindowInterpretation & {
  readonly scale: Scale;
};

export type RankedKeyInterpretation = RankedWindowInterpretation & {
  readonly key: Key;
};

type WindowInterpretationOptions = {
  readonly candidateLimit?: number;
  readonly continuityStrength?: number;
  readonly spellingPreference?: AccidentalPreference;
};

export type ScaleInterpretationOptions = WindowInterpretationOptions & {
  readonly previousScale?: Scale;
};

export type KeyInterpretationOptions = WindowInterpretationOptions & {
  readonly previousKey?: Key;
};

type AggregatedWindowEvidence = {
  readonly normalized: ReadonlyMap<PitchClass, number>;
  readonly sourceEventIds: readonly string[];
  readonly totals: ReadonlyMap<PitchClass, number>;
  readonly totalWeight: number;
};

type ScoredScale = Omit<RankedScaleInterpretation, 'confidence' | 'rank'>;
type ScoredKey = Omit<RankedKeyInterpretation, 'confidence' | 'rank'>;

const FIT_WEIGHT = 0.6;
const COVERAGE_WEIGHT = 0.25;
const TONIC_WEIGHT = 0.15;
const EXACT_CONTINUITY_BONUS = 0.06;
const EQUIVALENT_SCALE_CONTINUITY_BONUS = 0.03;
const RELATIVE_KEY_CONTINUITY_BONUS = 0.04;
const ADJACENT_KEY_CONTINUITY_BONUS = 0.02;

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const validateOptions = (
  options: WindowInterpretationOptions,
): { limit: number; strength: number } => {
  const limit = options.candidateLimit ?? 5;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Interpretation candidate limit must be a positive integer.');
  }
  const strength = options.continuityStrength ?? 1;
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    throw new RangeError('Continuity strength must be a finite value from 0 through 1.');
  }
  return { limit, strength };
};

const aggregateWindowEvidence = (
  events: readonly TimedPitchClassEvidence[],
): AggregatedWindowEvidence | null => {
  const totals = new Map<PitchClass, number>();
  const sourceEventIds: string[] = [];
  const seenEventIds = new Set<string>();
  events.forEach((event) => {
    if (event.eventId.length === 0 || seenEventIds.has(event.eventId)) {
      throw new RangeError('Timed pitch-class evidence requires unique, nonempty event IDs.');
    }
    if (
      !Number.isFinite(event.time.startMs) ||
      !Number.isFinite(event.time.endMs) ||
      event.time.startMs < 0 ||
      event.time.endMs < event.time.startMs
    ) {
      throw new RangeError('Timed pitch-class evidence requires a valid nonnegative time range.');
    }
    if (!Number.isFinite(event.confidence) || event.confidence < 0 || event.confidence > 1) {
      throw new RangeError('Timed pitch-class evidence confidence must be from 0 through 1.');
    }
    seenEventIds.add(event.eventId);
    sourceEventIds.push(event.eventId);
    const localEvidence = aggregatePitchClassEvidence(event.pitchClasses, 'Pitch-class');
    const durationWeight = Math.max(1, event.time.endMs - event.time.startMs) * event.confidence;
    localEvidence.forEach((weight, pitchClass) => {
      totals.set(pitchClass, (totals.get(pitchClass) ?? 0) + weight * durationWeight);
    });
  });
  const totalWeight = [...totals.values()].reduce((sum, value) => sum + value, 0);
  if (totalWeight <= Number.EPSILON) return null;
  const strongestWeight = Math.max(...totals.values());
  const normalized = new Map<PitchClass, number>();
  PITCH_CLASSES.forEach((pitchClass) => {
    normalized.set(pitchClass, (totals.get(pitchClass) ?? 0) / strongestWeight);
  });
  return { normalized, sourceEventIds, totalWeight, totals };
};

const pitchClassSetsAreEqual = (
  left: readonly PitchClass[],
  right: readonly PitchClass[],
): boolean => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size && [...leftSet].every((pitchClass) => rightSet.has(pitchClass))
  );
};

const scaleContinuity = (scale: Scale, previous: Scale | undefined): number => {
  if (previous === undefined) return 0;
  if (
    scale.quality === previous.quality &&
    toPitchClass(scale.root) === toPitchClass(previous.root)
  ) {
    return EXACT_CONTINUITY_BONUS;
  }
  return pitchClassSetsAreEqual(scale.pitchClasses, previous.pitchClasses)
    ? EQUIVALENT_SCALE_CONTINUITY_BONUS
    : 0;
};

const keyContinuity = (key: Key, previous: Key | undefined): number => {
  if (previous === undefined) return 0;
  if (keysAreEnharmonic(key, previous)) return EXACT_CONTINUITY_BONUS;
  if (key.fifths === previous.fifths) return RELATIVE_KEY_CONTINUITY_BONUS;
  return Math.abs(key.fifths - previous.fifths) === 1 ? ADJACENT_KEY_CONTINUITY_BONUS : 0;
};

const scorePitchCollection = (
  pitchClasses: readonly PitchClass[],
  tonic: PitchClass,
  evidence: AggregatedWindowEvidence,
  continuity: number,
): { details: ScaleKeyInterpretationEvidence[]; score: number } => {
  const collection = new Set(pitchClasses);
  const inCollectionWeight = [...evidence.totals.entries()].reduce(
    (sum, [pitchClass, weight]) => sum + (collection.has(pitchClass) ? weight : 0),
    0,
  );
  const fit = inCollectionWeight / evidence.totalWeight;
  const coverage =
    pitchClasses.reduce((sum, pitchClass) => sum + (evidence.normalized.get(pitchClass) ?? 0), 0) /
    pitchClasses.length;
  const tonicEvidence = evidence.normalized.get(tonic) ?? 0;
  return {
    details: [
      {
        contribution: fit * FIT_WEIGHT,
        description: `${(fit * 100).toFixed(1)}% of weighted evidence fits the pitch collection.`,
        kind: 'fit',
      },
      {
        contribution: coverage * COVERAGE_WEIGHT,
        description: `${(coverage * 100).toFixed(1)}% normalized collection coverage.`,
        kind: 'coverage',
      },
      {
        contribution: tonicEvidence * TONIC_WEIGHT,
        description: `Normalized tonic evidence: ${tonicEvidence.toFixed(3)}.`,
        kind: 'tonic',
      },
      {
        contribution: continuity,
        description:
          continuity > 0
            ? 'Prior interpretation supplies a bounded continuity bonus.'
            : 'No continuity bonus applies.',
        kind: 'continuity',
      },
    ],
    score:
      fit * FIT_WEIGHT + coverage * COVERAGE_WEIGHT + tonicEvidence * TONIC_WEIGHT + continuity,
  };
};

const addRanksAndConfidence = <Candidate extends ScoredScale | ScoredKey>(
  candidates: readonly Candidate[],
  limit: number,
): (Candidate & Pick<RankedWindowInterpretation, 'confidence' | 'rank'>)[] => {
  const strongestScore = candidates[0]?.score ?? 0;
  const runnerUpScore = candidates[1]?.score ?? 0;
  const strongestMargin = Math.max(0, strongestScore - runnerUpScore);
  return candidates.slice(0, limit).map((candidate, index) => {
    const relativeScore = Math.exp(-4 * Math.max(0, strongestScore - candidate.score));
    const absoluteConfidence = clampUnit((candidate.score - 0.2) / 0.8);
    const marginMultiplier = index === 0 ? 0.8 + Math.min(0.2, strongestMargin * 2) : 0.8;
    return {
      ...candidate,
      confidence: confidence(clampUnit(absoluteConfidence * relativeScore * marginMultiplier)),
      rank: index + 1,
    };
  });
};

export function rankScaleInterpretations(
  events: readonly TimedPitchClassEvidence[],
  options: ScaleInterpretationOptions = {},
): RankedScaleInterpretation[] {
  const { limit, strength } = validateOptions(options);
  const windowEvidence = aggregateWindowEvidence(events);
  if (windowEvidence === null) return [];
  const preference = options.spellingPreference ?? 'sharps';
  const scored = PITCH_CLASSES.flatMap((root) =>
    Object.values(SCALE_DEFINITIONS).map((definition) => {
      const scale = buildScale(spellPitchClass(root, preference), definition.quality);
      const continuity = scaleContinuity(scale, options.previousScale) * strength;
      const { details, score } = scorePitchCollection(
        scale.pitchClasses,
        root,
        windowEvidence,
        continuity,
      );
      return {
        evidence: details,
        scale,
        score,
        sourceEventIds: [...windowEvidence.sourceEventIds],
      };
    }),
  ).sort(
    (left, right) => right.score - left.score || left.scale.name.localeCompare(right.scale.name),
  );
  return addRanksAndConfidence(scored, limit);
}

export function rankKeyInterpretations(
  events: readonly TimedPitchClassEvidence[],
  options: KeyInterpretationOptions = {},
): RankedKeyInterpretation[] {
  const { limit, strength } = validateOptions(options);
  const windowEvidence = aggregateWindowEvidence(events);
  if (windowEvidence === null) return [];
  const preference = options.spellingPreference ?? 'sharps';
  const modes: readonly KeyMode[] = ['major', 'minor'];
  const scored = PITCH_CLASSES.flatMap((tonic) =>
    modes.map((mode) => {
      const key = keyForPitchClass(tonic, mode, preference);
      const continuity = keyContinuity(key, options.previousKey) * strength;
      const { details, score } = scorePitchCollection(
        key.scale.pitchClasses,
        tonic,
        windowEvidence,
        continuity,
      );
      return {
        evidence: details,
        key,
        score,
        sourceEventIds: [...windowEvidence.sourceEventIds],
      };
    }),
  ).sort((left, right) => right.score - left.score || left.key.name.localeCompare(right.key.name));
  return addRanksAndConfidence(scored, limit);
}
