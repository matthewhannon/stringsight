import { confidence, type ChordCandidate, type ChordQuality, type PitchClass } from '../../shared';
import type { ChromaObservation } from './chroma';

const PITCH_CLASSES: readonly PitchClass[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

type ChordTemplate = {
  intervals: readonly number[];
  quality: ChordQuality;
  suffix: string;
  weights: readonly number[];
};

type ChordTemplateObservation = ChromaObservation & {
  noteActivations?: readonly number[];
  noteMidiRange?: { max: number; min: number };
};

const CHORD_TEMPLATES: readonly ChordTemplate[] = [
  { intervals: [0, 4, 7], quality: 'major', suffix: '', weights: [1, 0.95, 0.82] },
  { intervals: [0, 3, 7], quality: 'minor', suffix: 'm', weights: [1, 0.95, 0.82] },
  {
    intervals: [0, 4, 7, 10],
    quality: 'dominant-7',
    suffix: '7',
    weights: [1, 0.95, 0.82, 0.78],
  },
  {
    intervals: [0, 4, 7, 11],
    quality: 'major-7',
    suffix: 'maj7',
    weights: [1, 0.95, 0.82, 0.78],
  },
  {
    intervals: [0, 3, 7, 10],
    quality: 'minor-7',
    suffix: 'm7',
    weights: [1, 0.95, 0.82, 0.78],
  },
  { intervals: [0, 2, 7], quality: 'suspended-2', suffix: 'sus2', weights: [1, 0.9, 0.82] },
  { intervals: [0, 5, 7], quality: 'suspended-4', suffix: 'sus4', weights: [1, 0.9, 0.82] },
  { intervals: [0, 3, 6], quality: 'diminished', suffix: 'dim', weights: [1, 0.95, 0.85] },
  { intervals: [0, 7], quality: 'power', suffix: '5', weights: [1, 0.9] },
];

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));
const ROOT_EVIDENCE_WEIGHT = 0.1;
const ROOT_BASS_EVIDENCE_WEIGHT = 0.16;
const TEMPLATE_COVERAGE_WEIGHT = 0.15;
const STRONGEST_ROOT_BASS_BONUS = 0.015;
const SEVENTH_COMPLEXITY_PENALTY = 0.012;
const MINIMUM_SEVENTH_TO_ROOT_RATIO = 0.55;
const WEAK_SEVENTH_PENALTY_WEIGHT = 0.05;
const REGISTER_MISMATCH_TOLERANCE = 0.35;
const REGISTER_MISMATCH_PENALTY_WEIGHT = 0.12;
const MAXIMUM_EXTENSION_LOW_REGISTER_SHARE_FOR_MISMATCH = 0.2;

const strongestPitchClass = (values: readonly number[]): number | null => {
  let bestIndex = -1;
  let bestValue = 0;
  for (const [index, value] of values.entries()) {
    if (value > bestValue) {
      bestIndex = index;
      bestValue = value;
    }
  }
  return bestIndex < 0 || bestValue < 0.18 ? null : bestIndex;
};

const cosineSimilarity = (left: readonly number[], right: readonly number[]): number => {
  let dot = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftSquare += leftValue ** 2;
    rightSquare += rightValue ** 2;
  }
  return leftSquare === 0 || rightSquare === 0 ? 0 : dot / Math.sqrt(leftSquare * rightSquare);
};

const lowRegisterShare = (
  observation: ChordTemplateObservation,
  pitchClassIndexes: readonly number[],
): number | null => {
  if (observation.noteActivations === undefined || observation.noteMidiRange === undefined) {
    return null;
  }
  const pitchClasses = new Set(pitchClassIndexes);
  let lowActivation = 0;
  let totalActivation = 0;
  observation.noteActivations.forEach((activation, index) => {
    const midi = (observation.noteMidiRange?.min ?? 40) + index;
    if (
      !pitchClasses.has(
        ((midi % PITCH_CLASSES.length) + PITCH_CLASSES.length) % PITCH_CLASSES.length,
      )
    ) {
      return;
    }
    totalActivation += activation;
    if (midi <= 76) lowActivation += activation;
  });
  return totalActivation <= Number.EPSILON ? null : lowActivation / totalActivation;
};

export function matchChordTemplates(
  observation: ChordTemplateObservation,
  candidateLimit = 5,
): ChordCandidate[] {
  const bassIndex = strongestPitchClass(observation.bass);
  const scored = CHORD_TEMPLATES.flatMap((template) =>
    PITCH_CLASSES.map((root, rootIndex) => {
      const pitchClassIndexes = template.intervals.map(
        (interval) => (rootIndex + interval) % PITCH_CLASSES.length,
      );
      const templateVector = Array.from({ length: PITCH_CLASSES.length }, () => 0);
      pitchClassIndexes.forEach((pitchClass, index) => {
        templateVector[pitchClass] = template.weights[index] ?? 1;
      });
      const similarity = cosineSimilarity(observation.values, templateVector);
      const templateCoverage = pitchClassIndexes.reduce(
        (sum, pitchClassIndex) => sum + (observation.values[pitchClassIndex] ?? 0),
        0,
      );
      const rootEvidence = observation.values[rootIndex] ?? 0;
      const rootBassEvidence = observation.bass[rootIndex] ?? 0;
      const bassBonus = bassIndex === rootIndex ? STRONGEST_ROOT_BASS_BONUS : 0;
      const isSeventh = template.intervals.length === 4;
      const seventhInterval = template.intervals[3];
      const seventhEvidence =
        isSeventh && seventhInterval !== undefined
          ? (observation.values[(rootIndex + seventhInterval) % PITCH_CLASSES.length] ?? 0)
          : 0;
      const seventhToRootRatio = seventhEvidence / Math.max(0.05, rootEvidence);
      const weakSeventhPenalty = isSeventh
        ? Math.max(0, MINIMUM_SEVENTH_TO_ROOT_RATIO - seventhToRootRatio) *
          WEAK_SEVENTH_PENALTY_WEIGHT
        : 0;
      const coreRegisterShare = isSeventh
        ? lowRegisterShare(observation, pitchClassIndexes.slice(0, 3))
        : null;
      const extensionRegisterShare =
        isSeventh && pitchClassIndexes[3] !== undefined
          ? lowRegisterShare(observation, [pitchClassIndexes[3]])
          : null;
      const registerMismatchPenalty =
        coreRegisterShare === null ||
        extensionRegisterShare === null ||
        extensionRegisterShare > MAXIMUM_EXTENSION_LOW_REGISTER_SHARE_FOR_MISMATCH
          ? 0
          : Math.max(0, coreRegisterShare - extensionRegisterShare - REGISTER_MISMATCH_TOLERANCE) *
            REGISTER_MISMATCH_PENALTY_WEIGHT;
      const complexityPenalty = isSeventh ? SEVENTH_COMPLEXITY_PENALTY : 0;
      const score =
        similarity +
        templateCoverage * TEMPLATE_COVERAGE_WEIGHT +
        rootEvidence * ROOT_EVIDENCE_WEIGHT +
        rootBassEvidence * ROOT_BASS_EVIDENCE_WEIGHT +
        bassBonus -
        complexityPenalty -
        weakSeventhPenalty -
        registerMismatchPenalty;
      return {
        bassIndex,
        pitchClassIndexes,
        quality: template.quality,
        root,
        score,
        suffix: template.suffix,
      };
    }),
  );
  scored.sort((left, right) => right.score - left.score);
  const strongestScore = scored[0]?.score ?? 0;
  const nextScore = scored[1]?.score ?? 0;
  const strongestMargin = Math.max(0, strongestScore - nextScore);
  const strongestConfidence =
    clampUnit((strongestScore - 0.35) / 0.65) * (0.72 + Math.min(0.28, strongestMargin * 3));

  return scored.slice(0, Math.max(1, candidateLimit)).map((candidate, index) => {
    const scoreGap = Math.max(0, strongestScore - candidate.score);
    const candidateConfidence =
      index === 0 ? strongestConfidence : strongestConfidence * Math.exp(-4 * scoreGap);
    return {
      ...(candidate.bassIndex === null ? {} : { bass: PITCH_CLASSES[candidate.bassIndex] }),
      confidence: confidence(clampUnit(candidateConfidence)),
      pitchClasses: candidate.pitchClassIndexes.map(
        (pitchClass) => PITCH_CLASSES[pitchClass] ?? 'C',
      ),
      quality: candidate.quality,
      rank: index + 1,
      root: candidate.root,
      score: candidate.score,
      symbol: `${candidate.root}${candidate.suffix}`,
    };
  });
}
