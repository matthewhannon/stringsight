import { z } from 'zod';

import {
  ConfidenceSchema,
  CONTRACT_SCHEMA_VERSION,
  DiagnosticsSchema,
  IdentifierSchema,
  ProvenanceSchema,
  SessionTimestampMsSchema,
  ranksAreSequential,
} from './common';

export const NormalizedPointSchema = z.object({
  confidence: ConfidenceSchema.optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  z: z.number().optional(),
});

export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;

export const FretboardGeometrySchema = z.object({
  corners: z.tuple([
    NormalizedPointSchema,
    NormalizedPointSchema,
    NormalizedPointSchema,
    NormalizedPointSchema,
  ]),
  orientation: z.enum(['nut-left', 'nut-right', 'unknown']),
  visibleFrets: z.array(z.number().int().min(0).max(36)).max(37),
});

export type FretboardGeometry = z.infer<typeof FretboardGeometrySchema>;

export const HandLandmarkSchema = z.object({
  index: z.number().int().min(0).max(20),
  point: NormalizedPointSchema,
});

export const FretRangeHypothesisSchema = z
  .object({
    endFret: z.number().int().min(0).max(36),
    probability: ConfidenceSchema,
    rank: z.number().int().positive(),
    startFret: z.number().int().min(0).max(36),
  })
  .refine(({ endFret, startFret }) => endFret >= startFret, {
    message: 'endFret must not be earlier than startFret.',
    path: ['endFret'],
  });

export type FretRangeHypothesis = z.infer<typeof FretRangeHypothesisSchema>;

export const FretAlignmentHypothesisSchema = z.object({
  absoluteFretAtReference: z.number().int().min(0).max(36),
  anchors: z.array(z.enum(['nut', 'single-dot', 'double-dot', 'geometry', 'audio'])).min(1),
  probability: ConfidenceSchema,
  rank: z.number().int().positive(),
  referencePosition: z.number().min(0).max(1),
});

export type FretAlignmentHypothesis = z.infer<typeof FretAlignmentHypothesisSchema>;

const RankedFretRangesSchema = z
  .array(FretRangeHypothesisSchema)
  .refine(ranksAreSequential, 'Fret range ranks must be sequential from 1.');

const RankedAlignmentsSchema = z
  .array(FretAlignmentHypothesisSchema)
  .refine(ranksAreSequential, 'Alignment ranks must be sequential from 1.');

export const VisualPositionEstimateSchema = z.object({
  absoluteFretAlignments: RankedAlignmentsSchema,
  diagnostics: DiagnosticsSchema.default({}),
  fretRanges: RankedFretRangesSchema,
  fretboardConfidence: ConfidenceSchema,
  geometry: FretboardGeometrySchema.optional(),
  handConfidence: ConfidenceSchema,
  handLandmarks: z.array(HandLandmarkSchema).max(21),
  id: IdentifierSchema,
  observedAtMs: SessionTimestampMsSchema,
  provenance: ProvenanceSchema,
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  trackingState: z.enum(['searching', 'tracking', 'ambiguous', 'lost']),
});

export type VisualPositionEstimate = z.infer<typeof VisualPositionEstimateSchema>;
