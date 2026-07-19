import type {
  EvaluationTolerances,
  FretRegion,
  GroundTruthChord,
  GroundTruthNote,
  PredictedChord,
  PredictedChordSet,
  PredictedNote,
  PredictedNoteSet,
} from './contracts';

export type EventMatchMetrics = {
  f1: number;
  falseNegatives: number;
  falsePositives: number;
  matched: number;
  meanAbsoluteErrorMs: number | null;
  precision: number;
  recall: number;
};

export type ChordMetrics = {
  accuracy: number;
  correct: number;
  total: number;
};

export type RankedSetMetrics = {
  correctTop1: number;
  correctTop3: number;
  top1Accuracy: number;
  top3Recall: number;
  total: number;
};

export type FretMetrics = {
  coverage: number;
  matched: number;
  maxMidpointErrorFrets: number | null;
  meanIntersectionOverUnion: number | null;
  meanMidpointErrorFrets: number | null;
  total: number;
};

export type LatencyMetrics = {
  count: number;
  maxMs: number | null;
  meanMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
};

const divide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

const f1 = (precision: number, recall: number): number =>
  precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

function eventMetrics(
  truthCount: number,
  predictionCount: number,
  errorsMs: readonly number[],
): EventMatchMetrics {
  const matched = errorsMs.length;
  const precision = divide(matched, predictionCount);
  const recall = divide(matched, truthCount);

  return {
    f1: f1(precision, recall),
    falseNegatives: truthCount - matched,
    falsePositives: predictionCount - matched,
    matched,
    meanAbsoluteErrorMs:
      matched === 0 ? null : errorsMs.reduce((total, value) => total + value, 0) / matched,
    precision,
    recall,
  };
}

function greedyTimeMatches(
  truthTimes: readonly number[],
  predictionTimes: readonly number[],
  toleranceMs: number,
): number[] {
  const candidates = truthTimes.flatMap((truthTime, truthIndex) =>
    predictionTimes.map((predictionTime, predictionIndex) => ({
      errorMs: Math.abs(predictionTime - truthTime),
      predictionIndex,
      truthIndex,
    })),
  );
  candidates.sort((left, right) => left.errorMs - right.errorMs);

  const usedTruth = new Set<number>();
  const usedPredictions = new Set<number>();
  const errors: number[] = [];
  for (const candidate of candidates) {
    if (candidate.errorMs > toleranceMs) break;
    if (usedTruth.has(candidate.truthIndex) || usedPredictions.has(candidate.predictionIndex)) {
      continue;
    }
    usedTruth.add(candidate.truthIndex);
    usedPredictions.add(candidate.predictionIndex);
    errors.push(candidate.errorMs);
  }
  return errors;
}

export function scoreOnsets(
  truth: readonly number[],
  predictions: readonly number[],
  toleranceMs: number,
): EventMatchMetrics {
  return eventMetrics(
    truth.length,
    predictions.length,
    greedyTimeMatches(truth, predictions, toleranceMs),
  );
}

export function scoreNotes(
  truth: readonly GroundTruthNote[],
  predictions: readonly PredictedNote[],
  toleranceMs: number,
): EventMatchMetrics {
  const errors: number[] = [];
  const usedTruth = new Set<number>();
  const usedPredictions = new Set<number>();
  const candidates = truth.flatMap((truthNote, truthIndex) =>
    predictions
      .map((prediction, predictionIndex) => ({
        errorMs: Math.abs(prediction.startMs - truthNote.startMs),
        midiMatches: prediction.midi === truthNote.midi,
        predictionIndex,
        truthIndex,
      }))
      .filter((candidate) => candidate.midiMatches),
  );
  candidates.sort((left, right) => left.errorMs - right.errorMs);

  for (const candidate of candidates) {
    if (candidate.errorMs > toleranceMs) break;
    if (usedTruth.has(candidate.truthIndex) || usedPredictions.has(candidate.predictionIndex)) {
      continue;
    }
    usedTruth.add(candidate.truthIndex);
    usedPredictions.add(candidate.predictionIndex);
    errors.push(candidate.errorMs);
  }

  return eventMetrics(truth.length, predictions.length, errors);
}

const normalizedChordSymbol = (symbol: string): string =>
  symbol.trim().replaceAll('♭', 'b').replaceAll('♯', '#').toLowerCase();

const overlapMs = (
  left: { startMs: number; endMs: number },
  right: { startMs: number; endMs: number },
): number => Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));

const sameNumberSet = (left: readonly number[], right: readonly number[]): boolean => {
  const normalizedLeft = [...new Set(left)].sort((a, b) => a - b);
  const normalizedRight = [...new Set(right)].sort((a, b) => a - b);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
};

function rankedSetMetrics(
  total: number,
  correctTop1: number,
  correctTop3: number,
): RankedSetMetrics {
  return {
    correctTop1,
    correctTop3,
    top1Accuracy: divide(correctTop1, total),
    top3Recall: divide(correctTop3, total),
    total,
  };
}

export function scoreChords(
  truth: readonly GroundTruthChord[],
  predictions: readonly PredictedChord[],
  minimumOverlapMs: number,
): ChordMetrics {
  let correct = 0;
  for (const chord of truth) {
    const best = predictions
      .map((prediction) => ({ overlap: overlapMs(chord, prediction), prediction }))
      .filter(({ overlap }) => overlap >= minimumOverlapMs)
      .sort((left, right) => right.overlap - left.overlap)[0];
    if (
      best !== undefined &&
      normalizedChordSymbol(best.prediction.symbol) === normalizedChordSymbol(chord.symbol)
    ) {
      correct += 1;
    }
  }
  return { accuracy: divide(correct, truth.length), correct, total: truth.length };
}

export function scoreRankedChords(
  truth: readonly GroundTruthChord[],
  predictions: readonly PredictedChordSet[],
  minimumOverlapMs: number,
): RankedSetMetrics {
  let correctTop1 = 0;
  let correctTop3 = 0;
  for (const chord of truth) {
    const best = predictions
      .map((prediction) => ({ overlap: overlapMs(chord, prediction), prediction }))
      .filter(({ overlap }) => overlap >= minimumOverlapMs)
      .sort((left, right) => right.overlap - left.overlap)[0]?.prediction;
    if (best === undefined) continue;
    const expected = normalizedChordSymbol(chord.symbol);
    if (normalizedChordSymbol(best.candidates[0]?.symbol ?? '') === expected) correctTop1 += 1;
    if (
      best.candidates.slice(0, 3).some(({ symbol }) => normalizedChordSymbol(symbol) === expected)
    ) {
      correctTop3 += 1;
    }
  }
  return rankedSetMetrics(truth.length, correctTop1, correctTop3);
}

export function scorePitchClassSets(
  truth: readonly GroundTruthChord[],
  predictions: readonly PredictedNoteSet[],
  minimumOverlapMs: number,
): RankedSetMetrics {
  let correctTop1 = 0;
  let correctTop3 = 0;
  for (const chord of truth) {
    const best = predictions
      .map((prediction) => ({ overlap: overlapMs(chord, prediction), prediction }))
      .filter(({ overlap }) => overlap >= minimumOverlapMs)
      .sort((left, right) => right.overlap - left.overlap)[0]?.prediction;
    if (best === undefined) continue;
    const matches = (midis: readonly number[]): boolean =>
      sameNumberSet(
        chord.pitchClasses,
        midis.map((midi) => midi % 12),
      );
    if (matches(best.candidates[0]?.midis ?? [])) correctTop1 += 1;
    if (best.candidates.slice(0, 3).some(({ midis }) => matches(midis))) correctTop3 += 1;
  }
  return rankedSetMetrics(truth.length, correctTop1, correctTop3);
}

export function scoreMidiSets(
  truthChords: readonly GroundTruthChord[],
  truthNotes: readonly GroundTruthNote[],
  predictions: readonly PredictedNoteSet[],
  minimumOverlapMs: number,
): RankedSetMetrics {
  let correctTop1 = 0;
  let correctTop3 = 0;
  for (const chord of truthChords) {
    const expectedMidis = truthNotes
      .filter((note) => overlapMs(chord, note) >= minimumOverlapMs)
      .map(({ midi }) => midi);
    const best = predictions
      .map((prediction) => ({ overlap: overlapMs(chord, prediction), prediction }))
      .filter(({ overlap }) => overlap >= minimumOverlapMs)
      .sort((left, right) => right.overlap - left.overlap)[0]?.prediction;
    if (best === undefined || expectedMidis.length === 0) continue;
    const matches = (midis: readonly number[]): boolean => sameNumberSet(expectedMidis, midis);
    if (matches(best.candidates[0]?.midis ?? [])) correctTop1 += 1;
    if (best.candidates.slice(0, 3).some(({ midis }) => matches(midis))) correctTop3 += 1;
  }
  return rankedSetMetrics(truthChords.length, correctTop1, correctTop3);
}

const fretMidpoint = (region: FretRegion): number => (region.startFret + region.endFret) / 2;

const fretIntersectionOverUnion = (truth: FretRegion, prediction: FretRegion): number => {
  const intersection = Math.max(
    0,
    Math.min(truth.endFret, prediction.endFret) -
      Math.max(truth.startFret, prediction.startFret) +
      1,
  );
  const union =
    Math.max(truth.endFret, prediction.endFret) -
    Math.min(truth.startFret, prediction.startFret) +
    1;
  return divide(intersection, union);
};

export function scoreFretRegions(
  truth: readonly FretRegion[],
  predictions: readonly FretRegion[],
  toleranceMs: number,
): FretMetrics {
  const midpointErrors: number[] = [];
  const intersectionOverUnions: number[] = [];
  for (const region of truth) {
    const nearest = predictions
      .map((prediction) => ({
        errorMs: Math.abs(prediction.atMs - region.atMs),
        prediction,
      }))
      .filter(({ errorMs }) => errorMs <= toleranceMs)
      .sort((left, right) => left.errorMs - right.errorMs)[0];
    if (nearest !== undefined) {
      midpointErrors.push(Math.abs(fretMidpoint(nearest.prediction) - fretMidpoint(region)));
      intersectionOverUnions.push(fretIntersectionOverUnion(region, nearest.prediction));
    }
  }

  return {
    coverage: divide(midpointErrors.length, truth.length),
    matched: midpointErrors.length,
    maxMidpointErrorFrets: midpointErrors.length === 0 ? null : Math.max(...midpointErrors),
    meanIntersectionOverUnion:
      intersectionOverUnions.length === 0
        ? null
        : intersectionOverUnions.reduce((total, value) => total + value, 0) /
          intersectionOverUnions.length,
    meanMidpointErrorFrets:
      midpointErrors.length === 0
        ? null
        : midpointErrors.reduce((total, value) => total + value, 0) / midpointErrors.length,
    total: truth.length,
  };
}

const percentile = (sorted: readonly number[], fraction: number): number | null => {
  if (sorted.length === 0) return null;
  const index = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, index)] ?? null;
};

export function scoreLatency(samples: readonly number[]): LatencyMetrics {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    count: sorted.length,
    maxMs: sorted.length === 0 ? null : (sorted[sorted.length - 1] ?? null),
    meanMs:
      sorted.length === 0
        ? null
        : sorted.reduce((total, value) => total + value, 0) / sorted.length,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
  };
}

export function scoreFixture(
  truth: {
    chords: readonly GroundTruthChord[];
    fretRegions: readonly FretRegion[];
    notes: readonly GroundTruthNote[];
    onsetsMs: readonly number[];
  },
  prediction: {
    audioFretRegions: readonly FretRegion[];
    audioNotes: readonly PredictedNote[];
    chords: readonly PredictedChord[];
    fusedFretRegions: readonly FretRegion[];
    fusedNotes: readonly PredictedNote[];
    noteSets: readonly PredictedNoteSet[];
    onsetsMs: readonly number[];
    rankedChords: readonly PredictedChordSet[];
  },
  tolerances: EvaluationTolerances,
) {
  const audioNotes = scoreNotes(truth.notes, prediction.audioNotes, tolerances.noteOnsetMs);
  const fusedNotes = scoreNotes(truth.notes, prediction.fusedNotes, tolerances.noteOnsetMs);
  const audioFret = scoreFretRegions(
    truth.fretRegions,
    prediction.audioFretRegions,
    tolerances.fretSampleToleranceMs,
  );
  const fusedFret = scoreFretRegions(
    truth.fretRegions,
    prediction.fusedFretRegions,
    tolerances.fretSampleToleranceMs,
  );

  return {
    audioFret,
    audioNotes,
    chords: scoreChords(truth.chords, prediction.chords, tolerances.chordMinimumOverlapMs),
    fusedFret,
    fusedNotes,
    fusionImprovement: {
      fretMidpointErrorReduction:
        audioFret.meanMidpointErrorFrets === null || fusedFret.meanMidpointErrorFrets === null
          ? null
          : audioFret.meanMidpointErrorFrets - fusedFret.meanMidpointErrorFrets,
      noteF1Delta: fusedNotes.f1 - audioNotes.f1,
    },
    midiSets: scoreMidiSets(
      truth.chords,
      truth.notes,
      prediction.noteSets,
      tolerances.chordMinimumOverlapMs,
    ),
    onsets: scoreOnsets(truth.onsetsMs, prediction.onsetsMs, tolerances.onsetMs),
    pitchClassSets: scorePitchClassSets(
      truth.chords,
      prediction.noteSets,
      tolerances.chordMinimumOverlapMs,
    ),
    rankedChords: scoreRankedChords(
      truth.chords,
      prediction.rankedChords,
      tolerances.chordMinimumOverlapMs,
    ),
  };
}
