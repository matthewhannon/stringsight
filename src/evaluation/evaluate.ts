import {
  DEFAULT_EVALUATION_TOLERANCES,
  EVALUATION_REPORT_SCHEMA_VERSION,
  type EvaluationCorpus,
  type EvaluationFixture,
  type EvaluationPredictions,
  type EvaluationTolerances,
  type FixturePrediction,
  type FretRegion,
  type GroundTruthChord,
  type GroundTruthNote,
  type PredictedChord,
  type PredictedChordSet,
  type PredictedNote,
  type PredictedNoteSet,
} from './contracts';
import { scoreFixture, scoreLatency } from './metrics';

type EvaluationSplit = 'development' | 'held-out' | 'all';

const shiftInterval = <T extends { startMs: number; endMs: number }>(
  interval: T,
  offsetMs: number,
): T => ({ ...interval, endMs: interval.endMs + offsetMs, startMs: interval.startMs + offsetMs });

const shiftFretRegion = (region: FretRegion, offsetMs: number): FretRegion => ({
  ...region,
  atMs: region.atMs + offsetMs,
});

function emptyPrediction(fixtureId: string): FixturePrediction {
  return {
    audioFretRegions: [],
    audioNotes: [],
    chords: [],
    fixtureId,
    fusedFretRegions: [],
    fusedNotes: [],
    latencySamples: [],
    noteSets: [],
    onsetsMs: [],
    rankedChords: [],
  };
}

function fixturesForSplit(
  fixtures: readonly EvaluationFixture[],
  split: EvaluationSplit,
): EvaluationFixture[] {
  return split === 'all' ? [...fixtures] : fixtures.filter((fixture) => fixture.split === split);
}

function evaluateSplit(
  fixtures: readonly EvaluationFixture[],
  predictionsByFixture: ReadonlyMap<string, FixturePrediction>,
  tolerances: EvaluationTolerances,
) {
  const truth = {
    chords: [] as GroundTruthChord[],
    fretRegions: [] as FretRegion[],
    notes: [] as GroundTruthNote[],
    onsetsMs: [] as number[],
  };
  const prediction = {
    audioFretRegions: [] as FretRegion[],
    audioNotes: [] as PredictedNote[],
    chords: [] as PredictedChord[],
    fusedFretRegions: [] as FretRegion[],
    fusedNotes: [] as PredictedNote[],
    noteSets: [] as PredictedNoteSet[],
    onsetsMs: [] as number[],
    rankedChords: [] as PredictedChordSet[],
  };
  const latencyByPath = new Map<string, number[]>();
  const perFixture: {
    fixtureId: string;
    metrics: ReturnType<typeof scoreFixture>;
    predictionPresent: boolean;
  }[] = [];

  fixtures.forEach((fixture, fixtureIndex) => {
    const fixturePrediction = predictionsByFixture.get(fixture.id) ?? emptyPrediction(fixture.id);
    const offsetMs = fixtureIndex * 1_000_000;
    truth.notes.push(...fixture.groundTruth.notes.map((note) => shiftInterval(note, offsetMs)));
    truth.chords.push(...fixture.groundTruth.chords.map((chord) => shiftInterval(chord, offsetMs)));
    truth.onsetsMs.push(...fixture.groundTruth.onsetsMs.map((onset) => onset + offsetMs));
    truth.fretRegions.push(
      ...fixture.groundTruth.fretRegions.map((region) => shiftFretRegion(region, offsetMs)),
    );
    prediction.audioNotes.push(
      ...fixturePrediction.audioNotes.map((note) => shiftInterval(note, offsetMs)),
    );
    prediction.fusedNotes.push(
      ...fixturePrediction.fusedNotes.map((note) => shiftInterval(note, offsetMs)),
    );
    prediction.chords.push(
      ...fixturePrediction.chords.map((chord) => shiftInterval(chord, offsetMs)),
    );
    prediction.noteSets.push(
      ...fixturePrediction.noteSets.map((noteSet) => shiftInterval(noteSet, offsetMs)),
    );
    prediction.rankedChords.push(
      ...fixturePrediction.rankedChords.map((chord) => shiftInterval(chord, offsetMs)),
    );
    prediction.onsetsMs.push(...fixturePrediction.onsetsMs.map((onset) => onset + offsetMs));
    prediction.audioFretRegions.push(
      ...fixturePrediction.audioFretRegions.map((region) => shiftFretRegion(region, offsetMs)),
    );
    prediction.fusedFretRegions.push(
      ...fixturePrediction.fusedFretRegions.map((region) => shiftFretRegion(region, offsetMs)),
    );
    for (const sample of fixturePrediction.latencySamples) {
      const values = latencyByPath.get(sample.path) ?? [];
      values.push(sample.latencyMs);
      latencyByPath.set(sample.path, values);
    }
    perFixture.push({
      fixtureId: fixture.id,
      metrics: scoreFixture(fixture.groundTruth, fixturePrediction, tolerances),
      predictionPresent: predictionsByFixture.has(fixture.id),
    });
  });

  const latency = Object.fromEntries(
    [...latencyByPath.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, samples]) => [path, scoreLatency(samples)]),
  );

  return {
    fixtureCount: fixtures.length,
    latency,
    metrics: scoreFixture(truth, prediction, tolerances),
    perFixture,
  };
}

export function evaluateCorpus(
  corpus: EvaluationCorpus,
  predictions: EvaluationPredictions,
  options: {
    generatedAt?: string;
    tolerances?: EvaluationTolerances;
  } = {},
) {
  if (corpus.corpusId !== predictions.corpusId) {
    throw new Error(
      `Prediction corpus '${predictions.corpusId}' does not match '${corpus.corpusId}'.`,
    );
  }

  const predictionIds = new Set<string>();
  for (const prediction of predictions.fixtures) {
    if (predictionIds.has(prediction.fixtureId)) {
      throw new Error(`Duplicate prediction fixture id: ${prediction.fixtureId}`);
    }
    predictionIds.add(prediction.fixtureId);
  }
  const corpusIds = new Set(corpus.fixtures.map((fixture) => fixture.id));
  const unknownPredictionIds = [...predictionIds].filter((id) => !corpusIds.has(id)).sort();
  const missingPredictionIds = [...corpusIds].filter((id) => !predictionIds.has(id)).sort();
  const predictionsByFixture = new Map(
    predictions.fixtures.map((prediction) => [prediction.fixtureId, prediction]),
  );
  const tolerances = options.tolerances ?? DEFAULT_EVALUATION_TOLERANCES;

  return {
    corpus: {
      corpusId: corpus.corpusId,
      generatorVersion: corpus.generator.version,
      schemaVersion: corpus.schemaVersion,
    },
    diagnostics: {
      missingPredictionIds,
      unknownPredictionIds,
    },
    evaluatorVersion: '1.0.0',
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    predictionSystem: predictions.system,
    results: {
      all: evaluateSplit(corpus.fixtures, predictionsByFixture, tolerances),
      development: evaluateSplit(
        fixturesForSplit(corpus.fixtures, 'development'),
        predictionsByFixture,
        tolerances,
      ),
      heldOut: evaluateSplit(
        fixturesForSplit(corpus.fixtures, 'held-out'),
        predictionsByFixture,
        tolerances,
      ),
    },
    schemaVersion: EVALUATION_REPORT_SCHEMA_VERSION,
    tolerances,
  };
}

export type EvaluationReport = ReturnType<typeof evaluateCorpus>;
