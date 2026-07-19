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

export const PolyphonicNoteSchema = z.object({
  confidence: ConfidenceSchema,
  evidence: z.array(z.string().min(1).max(120)).default([]),
  frameConfidence: ConfidenceSchema,
  midi: z.number().int().min(0).max(127),
  noteName: z.string().regex(/^[A-G](?:#|b)?-?\d$/),
  onsetConfidence: ConfidenceSchema,
  pitchClass: PitchClassSchema,
});

export type PolyphonicNote = z.infer<typeof PolyphonicNoteSchema>;

const OrderedUniquePolyphonicNotesSchema = z
  .array(PolyphonicNoteSchema)
  .min(2)
  .max(6)
  .refine(
    (notes) =>
      notes.every((note, index) => index === 0 || note.midi > (notes[index - 1]?.midi ?? 127)),
    'Polyphonic notes must be unique and ordered by ascending MIDI pitch.',
  );

export const NoteSetCandidateSchema = z.object({
  confidence: ConfidenceSchema,
  evidence: z.array(z.string().min(1).max(120)).default([]),
  notes: OrderedUniquePolyphonicNotesSchema,
  rank: z.number().int().positive(),
  score: z.number(),
});

export type NoteSetCandidate = z.infer<typeof NoteSetCandidateSchema>;

const RankedNoteSetCandidatesSchema = z
  .array(NoteSetCandidateSchema)
  .min(1)
  .refine(ranksAreSequential, 'Note-set candidate ranks must be sequential from 1.');

export const NoteSetEventSchema = z.object({
  candidates: RankedNoteSetCandidatesSchema,
  diagnostics: DiagnosticsSchema.default({}),
  id: IdentifierSchema,
  kind: z.literal('note-set'),
  lifecycle: LifecycleSchema,
  provenance: ProvenanceSchema,
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  time: TimeRangeSchema,
});

export type NoteSetEvent = z.infer<typeof NoteSetEventSchema>;

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

export const ObservedPitchClassSchema = z.object({
  pitchClass: PitchClassSchema,
  weight: ConfidenceSchema,
});

export type ObservedPitchClass = z.infer<typeof ObservedPitchClassSchema>;

const UniqueObservedPitchClassesSchema = z
  .array(ObservedPitchClassSchema)
  .max(12)
  .refine(
    (values) => new Set(values.map(({ pitchClass }) => pitchClass)).size === values.length,
    'Observed pitch classes must be unique.',
  );

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
  observedPitchClasses: UniqueObservedPitchClassesSchema.default([]),
  provenance: ProvenanceSchema,
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  time: TimeRangeSchema,
});

export type ChordEvent = z.infer<typeof ChordEventSchema>;

export const AudioEventSchema = z.discriminatedUnion('kind', [
  NoteEventSchema,
  NoteSetEventSchema,
  ChordEventSchema,
]);

export type AudioEvent = z.infer<typeof AudioEventSchema>;
