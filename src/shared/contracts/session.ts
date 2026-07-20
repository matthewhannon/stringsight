import { z } from 'zod';

import { AudioEventSchema } from './audio';
import {
  CONTRACT_SCHEMA_VERSION,
  IdentifierSchema,
  PitchClassSchema,
  SessionTimestampMsSchema,
} from './common';
import { FusedEventSchema, GuitarPositionSchema } from './fusion';
import { VisualPositionEstimateSchema } from './vision';

export const StandardTuningSchema = z.tuple([
  z.literal(40),
  z.literal(45),
  z.literal(50),
  z.literal(55),
  z.literal(59),
  z.literal(64),
]);

export const SessionSettingsSchema = z.object({
  handedness: z.enum(['right', 'left']),
  maxFret: z.number().int().min(12).max(36),
  remoteAnalysisEnabled: z.boolean(),
  tuningMidiLowToHigh: z.tuple([
    z.number().int().min(0).max(127),
    z.number().int().min(0).max(127),
    z.number().int().min(0).max(127),
    z.number().int().min(0).max(127),
    z.number().int().min(0).max(127),
    z.number().int().min(0).max(127),
  ]),
  visionEnabled: z.boolean(),
});

export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

export const CorrectedChordSymbolSchema = z
  .string()
  .trim()
  .regex(
    /^[A-G](?:#|b)?(?:maj7|m7|sus2|sus4|dim|m|7|5)?(?:\/[A-G](?:#|b)?)?$/,
    'Chord symbol is outside the supported StringSight chord vocabulary.',
  );

export const CorrectionSchema = z
  .object({
    author: z.literal('user'),
    chordSymbol: CorrectedChordSymbolSchema.optional(),
    createdAtMs: SessionTimestampMsSchema,
    eventId: IdentifierSchema,
    id: IdentifierSchema,
    note: z
      .object({
        midi: z.number().int().min(0).max(127),
        pitchClass: PitchClassSchema,
      })
      .optional(),
    operation: z.enum(['replace', 'revert']).default('replace'),
    positions: z.array(GuitarPositionSchema).min(1).max(6).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine(({ chordSymbol, note, operation, positions }, context) => {
    const replacementCount = [chordSymbol, note, positions].filter(
      (replacement) => replacement !== undefined,
    ).length;
    if (operation === 'replace' && replacementCount !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'A replacement correction must provide exactly one corrected value.',
        path: ['operation'],
      });
    }
    if (operation === 'revert' && replacementCount !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'A revert correction cannot also provide a replacement value.',
        path: ['operation'],
      });
    }
  });

export type Correction = z.infer<typeof CorrectionSchema>;

export const SessionRecordingMetadataSchema = z.object({
  channelCount: z.literal(1),
  discontinuityCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  frameCount: z.number().int().nonnegative(),
  recordedAt: z.iso.datetime({ offset: true }),
  sampleRate: z.number().int().positive(),
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  startedAtMs: SessionTimestampMsSchema,
});

export type SessionRecordingMetadata = z.infer<typeof SessionRecordingMetadataSchema>;

export const SessionSchema = z
  .object({
    corrections: z.array(CorrectionSchema),
    createdAt: z.iso.datetime({ offset: true }),
    events: z.object({
      audio: z.array(AudioEventSchema),
      fused: z.array(FusedEventSchema),
      visual: z.array(VisualPositionEstimateSchema),
    }),
    id: IdentifierSchema,
    recording: SessionRecordingMetadataSchema.nullable().default(null),
    schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
    settings: SessionSettingsSchema,
    status: z.enum(['idle', 'recording', 'paused', 'processing', 'complete', 'failed']),
    title: z.string().min(1).max(120),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .refine(({ createdAt, updatedAt }) => Date.parse(updatedAt) >= Date.parse(createdAt), {
    message: 'updatedAt must not be earlier than createdAt.',
    path: ['updatedAt'],
  });

export type Session = z.infer<typeof SessionSchema>;
