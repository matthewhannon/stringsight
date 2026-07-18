import { z } from 'zod';

import {
  ConfidenceSchema,
  CONTRACT_SCHEMA_VERSION,
  DiagnosticsSchema,
  EvidenceReferenceSchema,
  IdentifierSchema,
  LifecycleSchema,
  PitchClassSchema,
  ProvenanceSchema,
  TimeRangeSchema,
  ranksAreSequential,
} from './common';

export const GuitarPositionSchema = z.object({
  confidence: ConfidenceSchema,
  finger: z.number().int().min(1).max(4).optional(),
  fret: z.number().int().min(0).max(36),
  midi: z.number().int().min(0).max(127),
  string: z.number().int().min(1).max(6),
});

export type GuitarPosition = z.infer<typeof GuitarPositionSchema>;

export const GuitarStateCandidateSchema = z.object({
  chordSymbol: z.string().min(1).max(32).optional(),
  confidence: ConfidenceSchema,
  evidence: z.array(EvidenceReferenceSchema).min(1),
  midiNotes: z.array(z.number().int().min(0).max(127)).min(1).max(12),
  pitchClasses: z.array(PitchClassSchema).min(1).max(12),
  positions: z.array(GuitarPositionSchema).max(6),
  rank: z.number().int().positive(),
  score: z.number(),
  transitionCost: z.number().nonnegative(),
});

export type GuitarStateCandidate = z.infer<typeof GuitarStateCandidateSchema>;

const RankedGuitarStatesSchema = z
  .array(GuitarStateCandidateSchema)
  .min(1)
  .refine(ranksAreSequential, 'Guitar state ranks must be sequential from 1.');

export const FusedEventSchema = z.object({
  audioOnlyFallback: z.boolean(),
  candidates: RankedGuitarStatesSchema,
  diagnostics: DiagnosticsSchema.default({}),
  fallbackReason: z.string().min(1).max(240).optional(),
  id: IdentifierSchema,
  kind: z.enum(['note', 'chord', 'phrase']),
  lifecycle: LifecycleSchema,
  provenance: ProvenanceSchema,
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  sourceEventIds: z.array(IdentifierSchema).min(1),
  time: TimeRangeSchema,
  visualEstimateIds: z.array(IdentifierSchema),
});

export type FusedEvent = z.infer<typeof FusedEventSchema>;
