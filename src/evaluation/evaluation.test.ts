import { describe, expect, it } from 'vitest';

import {
  DEFAULT_EVALUATION_TOLERANCES,
  EvaluationCorpusSchema,
  EvaluationPredictionsSchema,
  evaluateCorpus,
  scoreChords,
  scoreFretRegions,
  scoreLatency,
  scoreNotes,
  scoreOnsets,
  type EvaluationCorpus,
  type EvaluationPredictions,
  type FretRegion,
  type GroundTruthNote,
  type PredictedNote,
} from './index';

const baseFixture = {
  conditions: {
    dynamics: 'medium',
    frameRate: 2,
    guitarType: 'clean-electric',
    imageHeight: 360,
    imageWidth: 640,
    inputProfile: 'direct',
    lighting: 'normal',
    neckPosition: 'middle',
    noise: 'quiet',
    occlusion: 'partial',
    perspective: 'moderate',
    sampleRate: 16_000,
  },
  durationMs: 1_000,
  groundTruth: {
    chords: [{ endMs: 800, pitchClasses: [0, 4, 7], startMs: 100, symbol: 'C' }],
    fretRegions: [{ atMs: 300, endFret: 5, startFret: 3 }],
    notes: [{ endMs: 500, fret: 3, midi: 48, startMs: 100, string: 5, velocity: 0.8 }],
    onsetsMs: [100],
    tablature: [{ fret: 3, midi: 48, string: 5 }],
  },
  id: 'fixture-development',
  media: {
    audio: 'audio/fixture.wav',
    videoFrames: ['video/fixture/frame.svg'],
  },
  modalities: ['audio', 'video'],
  source: {
    generatorVersion: '1.0.0',
    kind: 'procedural',
    license: 'MIT',
    seed: 1,
  },
  split: 'development',
  tags: ['fixture'],
} as const;

function corpus(): EvaluationCorpus {
  return EvaluationCorpusSchema.parse({
    corpusId: 'corpus-1',
    description: 'Test corpus.',
    fixtures: [baseFixture, { ...baseFixture, id: 'fixture-held-out', split: 'held-out' }],
    generator: { name: 'stringsight-procedural-generator', version: '1.0.0' },
    schemaVersion: 1,
  });
}

function predictions(): EvaluationPredictions {
  return EvaluationPredictionsSchema.parse({
    corpusId: 'corpus-1',
    fixtures: [
      {
        audioFretRegions: [{ atMs: 300, endFret: 8, startFret: 6 }],
        audioNotes: [{ confidence: 0.7, endMs: 500, midi: 48, startMs: 120 }],
        chords: [{ confidence: 0.8, endMs: 800, startMs: 110, symbol: 'c' }],
        fixtureId: 'fixture-development',
        fusedFretRegions: [{ atMs: 300, endFret: 6, startFret: 4 }],
        fusedNotes: [{ confidence: 0.9, endMs: 500, midi: 48, startMs: 105 }],
        latencySamples: [
          { latencyMs: 20, path: 'live-audio' },
          { latencyMs: 40, path: 'live-audio' },
        ],
        onsetsMs: [110],
      },
    ],
    generatedAt: '2026-07-17T00:00:00Z',
    schemaVersion: 1,
    system: { name: 'test-system', version: '1.0.0' },
  });
}

describe('evaluation schemas', () => {
  it('accepts a fully attributed, multimodal corpus', () => {
    const parsed = corpus();
    expect(parsed.fixtures).toHaveLength(2);
    expect(parsed.fixtures[0]).toMatchObject({ split: 'development' });
  });

  it('rejects duplicate fixture identifiers', () => {
    const valid = corpus();
    expect(
      EvaluationCorpusSchema.safeParse({
        ...valid,
        fixtures: [valid.fixtures[0], valid.fixtures[0]],
      }).success,
    ).toBe(false);
  });

  it('rejects missing modality assets and truth outside fixture duration', () => {
    expect(
      EvaluationCorpusSchema.safeParse({
        corpusId: 'invalid-corpus',
        description: 'Invalid corpus.',
        fixtures: [
          {
            ...baseFixture,
            groundTruth: {
              ...baseFixture.groundTruth,
              notes: [{ ...baseFixture.groundTruth.notes[0], endMs: 2_000 }],
            },
            media: {},
          },
        ],
        generator: { name: 'stringsight-procedural-generator', version: '1.0.0' },
        schemaVersion: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects path traversal and reversed intervals', () => {
    expect(
      EvaluationCorpusSchema.safeParse({
        corpusId: 'invalid-corpus',
        description: 'Invalid corpus.',
        fixtures: [
          {
            ...baseFixture,
            groundTruth: {
              ...baseFixture.groundTruth,
              chords: [{ endMs: 10, pitchClasses: [0, 4, 7], startMs: 20, symbol: 'C' }],
            },
            media: { ...baseFixture.media, audio: '../private.wav' },
          },
        ],
        generator: { name: 'stringsight-procedural-generator', version: '1.0.0' },
        schemaVersion: 1,
      }).success,
    ).toBe(false);
  });
});

describe('event metrics', () => {
  const truthNotes: GroundTruthNote[] = [
    { endMs: 200, midi: 40, startMs: 100, velocity: 0.8 },
    { endMs: 400, midi: 43, startMs: 300, velocity: 0.7 },
  ];

  it('scores perfect note and onset predictions', () => {
    const predictedNotes: PredictedNote[] = truthNotes.map((note) => ({
      confidence: 1,
      endMs: note.endMs,
      midi: note.midi,
      startMs: note.startMs,
    }));
    expect(scoreNotes(truthNotes, predictedNotes, 50)).toMatchObject({
      f1: 1,
      falseNegatives: 0,
      falsePositives: 0,
      meanAbsoluteErrorMs: 0,
    });
    expect(scoreOnsets([100, 300], [110, 290], 10)).toMatchObject({
      f1: 1,
      matched: 2,
      meanAbsoluteErrorMs: 10,
    });
  });

  it('does not match the wrong pitch, duplicate predictions, or out-of-tolerance events', () => {
    expect(
      scoreNotes(
        truthNotes,
        [
          { confidence: 0.8, endMs: 200, midi: 41, startMs: 100 },
          { confidence: 0.8, endMs: 200, midi: 40, startMs: 100 },
          { confidence: 0.7, endMs: 200, midi: 40, startMs: 105 },
        ],
        20,
      ),
    ).toMatchObject({ matched: 1, falseNegatives: 1, falsePositives: 2 });
    expect(scoreOnsets([100], [151], 50)).toMatchObject({ matched: 0, f1: 0 });
  });

  it('scores chord overlap and normalizes accidental symbols', () => {
    expect(
      scoreChords(
        [{ endMs: 500, pitchClasses: [1, 5, 8], startMs: 100, symbol: 'D♭' }],
        [{ confidence: 0.8, endMs: 450, startMs: 120, symbol: 'db' }],
        50,
      ),
    ).toEqual({ accuracy: 1, correct: 1, total: 1 });
    expect(
      scoreChords(
        [{ endMs: 500, pitchClasses: [0, 4, 7], startMs: 100, symbol: 'C' }],
        [{ confidence: 0.8, endMs: 120, startMs: 0, symbol: 'C' }],
        50,
      ).accuracy,
    ).toBe(0);
  });
});

describe('fret and latency metrics', () => {
  it('reports fret coverage, midpoint error, overlap, and maximum error', () => {
    const truth: FretRegion[] = [
      { atMs: 100, endFret: 4, startFret: 2 },
      { atMs: 300, endFret: 9, startFret: 7 },
    ];
    const result = scoreFretRegions(truth, [{ atMs: 105, endFret: 6, startFret: 4 }], 20);
    expect(result).toMatchObject({
      coverage: 0.5,
      matched: 1,
      maxMidpointErrorFrets: 2,
      meanIntersectionOverUnion: 0.2,
      meanMidpointErrorFrets: 2,
    });
  });

  it('uses null for unavailable fret and latency statistics', () => {
    expect(scoreFretRegions([{ atMs: 10, endFret: 2, startFret: 1 }], [], 5)).toMatchObject({
      coverage: 0,
      maxMidpointErrorFrets: null,
      meanIntersectionOverUnion: null,
      meanMidpointErrorFrets: null,
    });
    expect(scoreLatency([])).toEqual({
      count: 0,
      maxMs: null,
      meanMs: null,
      p50Ms: null,
      p95Ms: null,
    });
  });

  it('computes nearest-rank percentiles', () => {
    expect(scoreLatency([100, 20, 40, 80, 60])).toEqual({
      count: 5,
      maxMs: 100,
      meanMs: 60,
      p50Ms: 60,
      p95Ms: 100,
    });
  });
});

describe('evaluation reports', () => {
  it('keeps splits isolated and reports missing fixtures as failures', () => {
    const report = evaluateCorpus(corpus(), predictions(), {
      generatedAt: '2026-07-17T00:00:00.000Z',
      tolerances: DEFAULT_EVALUATION_TOLERANCES,
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.results.development.fixtureCount).toBe(1);
    expect(report.results.heldOut.fixtureCount).toBe(1);
    expect(report.results.development.metrics.audioNotes.f1).toBe(1);
    expect(report.results.heldOut.metrics.audioNotes.f1).toBe(0);
    expect(report.results.development.metrics.fusionImprovement).toMatchObject({
      fretMidpointErrorReduction: 2,
      noteF1Delta: 0,
    });
    expect(report.results.development.latency['live-audio']).toMatchObject({
      count: 2,
      p50Ms: 20,
      p95Ms: 40,
    });
    expect(report.diagnostics.missingPredictionIds).toEqual(['fixture-held-out']);
  });

  it('reports unknown fixture predictions without mixing them into scores', () => {
    const validPredictions = predictions();
    const [firstPrediction] = validPredictions.fixtures;
    if (firstPrediction === undefined) throw new Error('Expected a fixture prediction.');
    const report = evaluateCorpus(corpus(), {
      ...validPredictions,
      fixtures: [
        ...validPredictions.fixtures,
        { ...firstPrediction, fixtureId: 'unknown-fixture' },
      ],
    });
    expect(report.diagnostics.unknownPredictionIds).toEqual(['unknown-fixture']);
    expect(report.results.all.fixtureCount).toBe(2);
  });

  it('rejects corpus mismatches and duplicate prediction identifiers', () => {
    const validPredictions = predictions();
    const [firstPrediction] = validPredictions.fixtures;
    if (firstPrediction === undefined) throw new Error('Expected a fixture prediction.');
    expect(() =>
      evaluateCorpus(corpus(), { ...validPredictions, corpusId: 'another-corpus' }),
    ).toThrow('does not match');
    expect(() =>
      evaluateCorpus(corpus(), {
        ...validPredictions,
        fixtures: [firstPrediction, firstPrediction],
      }),
    ).toThrow('Duplicate prediction fixture id');
  });
});
