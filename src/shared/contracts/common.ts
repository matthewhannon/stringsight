import { z } from 'zod';

export const CONTRACT_SCHEMA_VERSION = 1 as const;
export const WORKER_PROTOCOL_VERSION = 1 as const;

export const IdentifierSchema = z.string().min(1).max(160);

export const SessionTimestampMsSchema = z.number().nonnegative().brand<'SessionTimestampMs'>();

export type SessionTimestampMs = z.infer<typeof SessionTimestampMsSchema>;

export const ConfidenceSchema = z.number().min(0).max(1).brand<'Confidence'>();

export type Confidence = z.infer<typeof ConfidenceSchema>;

export const TimeRangeSchema = z
  .object({
    endMs: SessionTimestampMsSchema.optional(),
    startMs: SessionTimestampMsSchema,
  })
  .refine(({ endMs, startMs }) => endMs === undefined || endMs >= startMs, {
    message: 'endMs must not be earlier than startMs.',
    path: ['endMs'],
  });

export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const SubsystemSchema = z.enum([
  'app',
  'audio-capture',
  'audio-analysis',
  'polyphonic-analysis',
  'vision-capture',
  'fretboard-analysis',
  'hand-analysis',
  'music-theory',
  'fusion',
  'persistence',
  'remote-analysis',
]);

export type Subsystem = z.infer<typeof SubsystemSchema>;

export const ProvenanceSchema = z.object({
  algorithm: z.string().min(1).max(120),
  generatedAtMs: SessionTimestampMsSchema,
  runId: IdentifierSchema,
  subsystem: SubsystemSchema,
  version: z.string().min(1).max(80),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

export const DiagnosticValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const DiagnosticsSchema = z.record(z.string(), DiagnosticValueSchema);

export type Diagnostics = z.infer<typeof DiagnosticsSchema>;

export const LifecycleSchema = z.enum(['provisional', 'finalized', 'corrected']);

export type Lifecycle = z.infer<typeof LifecycleSchema>;

export const EvidenceReferenceSchema = z.object({
  eventId: IdentifierSchema,
  source: SubsystemSchema,
  weight: ConfidenceSchema,
});

export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const PitchClassSchema = z.enum([
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
]);

export type PitchClass = z.infer<typeof PitchClassSchema>;

export function sessionTimestampMs(value: number): SessionTimestampMs {
  return SessionTimestampMsSchema.parse(value);
}

export function confidence(value: number): Confidence {
  return ConfidenceSchema.parse(value);
}

export function ranksAreSequential(candidates: readonly { rank: number }[]): boolean {
  return candidates.every((candidate, index) => candidate.rank === index + 1);
}
