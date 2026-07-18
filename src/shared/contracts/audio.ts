import { z } from 'zod';

import {
  ConfidenceSchema,
  CONTRACT_SCHEMA_VERSION,
  DiagnosticsSchema,
  IdentifierSchema,
  LifecycleSchema,
  PitchClassSchema,
  ProvenanceSchema,
  TimeRangeSchema,
  ranksAreSequential,
} from './common';

export const PitchCandidateSchema = z.object({
  centsOffset: z.number().min(-100).max(100),
  confidence: ConfidenceSchema,
  evidence: z.array(z.string().min(1).max(120)).default([]),
  frequencyHz: z.number().positive(),
  midi: z.number().int().min(0).max(127),
  noteName: z.string().regex(/^[A-G](?:#|b)?-?\d$/),
  pitchClass: PitchClassSchema,
  rank: z.number().int().positive(),
  score: z.number(),
});

export type PitchCandidate = z.infer<typeof PitchCandidateSchema>;

const RankedPitchCandidatesSchema = z
  .array(PitchCandidateSchema)
  .min(1)
  .refine(ranksAreSequential, 'Pitch candidate ranks must be sequential from 1.');

export const NoteEventSchema = z.object({
  candidates: RankedPitchCandidatesSchema,
  diagnostics: DiagnosticsSchema.default({}),
  id: IdentifierSchema,
  kind: z.literal('note'),
  lifecycle: LifecycleSchema,
  provenance: ProvenanceSchema,
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  time: TimeRangeSchema,
});

export type NoteEvent = z.infer<typeof NoteEventSchema>;

export const ChordQualitySchema = z.enum([
  'major',
  'minor',
  'dominant-7',
  'major-7',
  'minor-7',
  'suspended-2',
  'suspended-4',
  'diminished',
  'power',
  'unknown',
]);

export type ChordQuality = z.infer<typeof ChordQualitySchema>;

export const ChordCandidateSchema = z.object({
  bass: PitchClassSchema.optional(),
  confidence: ConfidenceSchema,
  pitchClasses: z.array(PitchClassSchema).min(2).max(12),
  quality: ChordQualitySchema,
  rank: z.number().int().positive(),
  root: PitchClassSchema,
  score: z.number(),
  symbol: z.string().min(1).max(32),
});

export type ChordCandidate = z.infer<typeof ChordCandidateSchema>;

const RankedChordCandidatesSchema = z
  .array(ChordCandidateSchema)
  .min(1)
  .refine(ranksAreSequential, 'Chord candidate ranks must be sequential from 1.');

export const ChordEventSchema = z.object({
  candidates: RankedChordCandidatesSchema,
  diagnostics: DiagnosticsSchema.default({}),
  id: IdentifierSchema,
  kind: z.literal('chord'),
  lifecycle: LifecycleSchema,
  provenance: ProvenanceSchema,
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  time: TimeRangeSchema,
});

export type ChordEvent = z.infer<typeof ChordEventSchema>;

export const AudioEventSchema = z.discriminatedUnion('kind', [NoteEventSchema, ChordEventSchema]);

export type AudioEvent = z.infer<typeof AudioEventSchema>;
