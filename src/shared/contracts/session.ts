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

export const CorrectionSchema = z.object({
  author: z.literal('user'),
  chordSymbol: z.string().min(1).max(32).optional(),
  createdAtMs: SessionTimestampMsSchema,
  eventId: IdentifierSchema,
  id: IdentifierSchema,
  note: z
    .object({
      midi: z.number().int().min(0).max(127),
      pitchClass: PitchClassSchema,
    })
    .optional(),
  positions: z.array(GuitarPositionSchema).max(6).optional(),
  reason: z.string().max(500).optional(),
});

export type Correction = z.infer<typeof CorrectionSchema>;

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
