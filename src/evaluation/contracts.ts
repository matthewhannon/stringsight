import { z } from 'zod';

const TimestampMsSchema = z.number().nonnegative();
const IdentifierSchema = z.string().min(1).max(160);
const RelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/') && !value.includes('..'), {
    message: 'Media paths must be relative and may not traverse parent directories.',
  });

export const EVALUATION_CORPUS_SCHEMA_VERSION = 1 as const;
export const EVALUATION_PREDICTION_SCHEMA_VERSION = 1 as const;
export const EVALUATION_REPORT_SCHEMA_VERSION = 1 as const;

export const TimedIntervalSchema = z
  .object({
    endMs: TimestampMsSchema,
    startMs: TimestampMsSchema,
  })
  .refine(({ endMs, startMs }) => endMs >= startMs, {
    message: 'endMs must not be earlier than startMs.',
    path: ['endMs'],
  });

export const TabPositionSchema = z.object({
  fret: z.number().int().min(0).max(36),
  midi: z.number().int().min(0).max(127),
  string: z.number().int().min(1).max(6),
});

export const GroundTruthNoteSchema = TimedIntervalSchema.extend({
  fret: z.number().int().min(0).max(36).optional(),
  midi: z.number().int().min(0).max(127),
  string: z.number().int().min(1).max(6).optional(),
  velocity: z.number().min(0).max(1),
});

export const GroundTruthChordSchema = TimedIntervalSchema.extend({
  pitchClasses: z.array(z.number().int().min(0).max(11)).min(2).max(12),
  symbol: z.string().min(1).max(32),
});

export const FretRegionSchema = z
  .object({
    atMs: TimestampMsSchema,
    endFret: z.number().int().min(0).max(36),
    startFret: z.number().int().min(0).max(36),
  })
  .refine(({ endFret, startFret }) => endFret >= startFret, {
    message: 'endFret must not be earlier than startFret.',
    path: ['endFret'],
  });

export const FixtureConditionsSchema = z.object({
  dynamics: z.enum(['soft', 'medium', 'loud']),
  frameRate: z.number().positive().optional(),
  guitarType: z.enum(['steel-acoustic', 'nylon-acoustic', 'clean-electric']),
  imageHeight: z.number().int().positive().optional(),
  imageWidth: z.number().int().positive().optional(),
  inputProfile: z.enum(['direct', 'near-microphone', 'room-microphone', 'laptop-microphone']),
  lighting: z.enum(['bright', 'normal', 'dim']).optional(),
  neckPosition: z.enum(['open-low', 'middle', 'upper']),
  noise: z.enum(['quiet', 'room', 'fan']),
  occlusion: z.enum(['none', 'partial']).optional(),
  perspective: z.enum(['straight', 'moderate', 'strong']).optional(),
  sampleRate: z.number().int().positive().optional(),
});

export const EvaluationFixtureSchema = z
  .object({
    conditions: FixtureConditionsSchema,
    durationMs: z.number().positive(),
    groundTruth: z.object({
      chords: z.array(GroundTruthChordSchema),
      fretRegions: z.array(FretRegionSchema),
      notes: z.array(GroundTruthNoteSchema),
      onsetsMs: z.array(TimestampMsSchema),
      tablature: z.array(TabPositionSchema),
    }),
    id: IdentifierSchema,
    media: z.object({
      audio: RelativePathSchema.optional(),
      videoFrames: z.array(RelativePathSchema).min(1).optional(),
    }),
    modalities: z.array(z.enum(['audio', 'video'])).min(1),
    source: z.discriminatedUnion('kind', [
      z.object({
        generatorVersion: z.string().min(1),
        kind: z.literal('procedural'),
        license: z.literal('MIT'),
        seed: z.number().int().nonnegative(),
      }),
      z.object({
        consentConfirmed: z.literal(true),
        kind: z.literal('recorded'),
        license: z.enum(['private-evaluation-only', 'project-evaluation', 'redistributable']),
        recordedAt: z.iso.datetime({ offset: true }),
        recordingId: IdentifierSchema,
      }),
    ]),
    split: z.enum(['development', 'held-out']),
    tags: z.array(z.string().min(1)),
  })
  .superRefine((fixture, context) => {
    if (fixture.modalities.includes('audio') && fixture.media.audio === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Audio fixtures require an audio media path.',
        path: ['media', 'audio'],
      });
    }

    if (fixture.modalities.includes('video') && fixture.media.videoFrames === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Video fixtures require frame media paths.',
        path: ['media', 'videoFrames'],
      });
    }

    for (const [index, note] of fixture.groundTruth.notes.entries()) {
      if (note.endMs > fixture.durationMs) {
        context.addIssue({
          code: 'custom',
          message: 'Note extends beyond fixture duration.',
          path: ['groundTruth', 'notes', index, 'endMs'],
        });
      }
    }
  });

export const EvaluationCorpusSchema = z
  .object({
    corpusId: IdentifierSchema,
    description: z.string().min(1),
    fixtures: z.array(EvaluationFixtureSchema).min(1),
    generator: z.object({
      name: z.literal('stringsight-procedural-generator'),
      version: z.string().min(1),
    }),
    schemaVersion: z.literal(EVALUATION_CORPUS_SCHEMA_VERSION),
  })
  .superRefine(({ fixtures }, context) => {
    const ids = new Set<string>();
    fixtures.forEach((fixture, index) => {
      if (ids.has(fixture.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate fixture id: ${fixture.id}`,
          path: ['fixtures', index, 'id'],
        });
      }
      ids.add(fixture.id);
    });
  });

export type EvaluationCorpus = z.infer<typeof EvaluationCorpusSchema>;
export type EvaluationFixture = z.infer<typeof EvaluationFixtureSchema>;
export type GroundTruthNote = z.infer<typeof GroundTruthNoteSchema>;
export type GroundTruthChord = z.infer<typeof GroundTruthChordSchema>;
export type FretRegion = z.infer<typeof FretRegionSchema>;

export const PredictedNoteSchema = TimedIntervalSchema.extend({
  confidence: z.number().min(0).max(1),
  midi: z.number().int().min(0).max(127),
});

export const PredictedChordSchema = TimedIntervalSchema.extend({
  confidence: z.number().min(0).max(1),
  symbol: z.string().min(1).max(32),
});

const RankedNoteSetCandidateSchema = z.object({
  confidence: z.number().min(0).max(1),
  midis: z
    .array(z.number().int().min(0).max(127))
    .min(2)
    .max(6)
    .refine(
      (midis) => midis.every((midi, index) => index === 0 || midi > (midis[index - 1] ?? 127)),
      'Note-set MIDI pitches must be unique and ordered.',
    ),
  rank: z.number().int().positive(),
});

export const PredictedNoteSetSchema = TimedIntervalSchema.extend({
  candidates: z
    .array(RankedNoteSetCandidateSchema)
    .min(1)
    .refine(
      (candidates) => candidates.every(({ rank }, index) => rank === index + 1),
      'Note-set ranks must be sequential from 1.',
    ),
});

const RankedChordPredictionCandidateSchema = z.object({
  confidence: z.number().min(0).max(1),
  rank: z.number().int().positive(),
  symbol: z.string().min(1).max(32),
});

export const PredictedChordSetSchema = TimedIntervalSchema.extend({
  candidates: z
    .array(RankedChordPredictionCandidateSchema)
    .min(1)
    .refine(
      (candidates) => candidates.every(({ rank }, index) => rank === index + 1),
      'Chord ranks must be sequential from 1.',
    ),
});

export const LatencySampleSchema = z.object({
  latencyMs: z.number().nonnegative(),
  path: z.enum(['live-audio', 'finalized-audio', 'vision', 'fusion']),
});

export const FixturePredictionSchema = z.object({
  audioFretRegions: z.array(FretRegionSchema),
  audioNotes: z.array(PredictedNoteSchema),
  chords: z.array(PredictedChordSchema),
  fixtureId: IdentifierSchema,
  fusedFretRegions: z.array(FretRegionSchema),
  fusedNotes: z.array(PredictedNoteSchema),
  latencySamples: z.array(LatencySampleSchema),
  noteSets: z.array(PredictedNoteSetSchema).default([]),
  onsetsMs: z.array(TimestampMsSchema),
  rankedChords: z.array(PredictedChordSetSchema).default([]),
});

export const EvaluationPredictionsSchema = z.object({
  corpusId: IdentifierSchema,
  fixtures: z.array(FixturePredictionSchema),
  generatedAt: z.iso.datetime({ offset: true }),
  schemaVersion: z.literal(EVALUATION_PREDICTION_SCHEMA_VERSION),
  system: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
});

export type EvaluationPredictions = z.infer<typeof EvaluationPredictionsSchema>;
export type FixturePrediction = z.infer<typeof FixturePredictionSchema>;
export type PredictedNote = z.infer<typeof PredictedNoteSchema>;
export type PredictedChord = z.infer<typeof PredictedChordSchema>;
export type PredictedNoteSet = z.infer<typeof PredictedNoteSetSchema>;
export type PredictedChordSet = z.infer<typeof PredictedChordSetSchema>;

export const EvaluationTolerancesSchema = z.object({
  chordMinimumOverlapMs: z.number().nonnegative(),
  fretSampleToleranceMs: z.number().nonnegative(),
  noteOnsetMs: z.number().nonnegative(),
  onsetMs: z.number().nonnegative(),
});

export type EvaluationTolerances = z.infer<typeof EvaluationTolerancesSchema>;

export const DEFAULT_EVALUATION_TOLERANCES: EvaluationTolerances = {
  chordMinimumOverlapMs: 50,
  fretSampleToleranceMs: 100,
  noteOnsetMs: 50,
  onsetMs: 50,
};
