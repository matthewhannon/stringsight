import { z } from 'zod';

import { IdentifierSchema } from './common';
import { PRACTICE_SEMANTIC_IDS } from './practice-support';

export const MAX_BOUNDED_BEND_SEMITONES = 2 as const;

export const PRACTICE_NATIVE_SEMANTIC_IDS = Object.freeze(
  PRACTICE_SEMANTIC_IDS.slice(0, 18),
) as readonly [
  'pitch-key',
  'ties',
  'slurs',
  'tuplet-3-2',
  'two-voices',
  'dynamics-mf',
  'accent',
  'staccato',
  'per-string-sounding-duration',
  'hammer-on',
  'pull-off',
  'slide',
  'bend-bounded',
  'vibrato',
  'let-ring',
  'palm-mute',
  'dead-note',
  'natural-harmonic',
];

export const PracticeNativeSemanticIdSchema = z.enum(PRACTICE_NATIVE_SEMANTIC_IDS);
export type PracticeNativeSemanticId = z.infer<typeof PracticeNativeSemanticIdSchema>;

export const RelationEndpointDirectionSchema = z.enum(['start', 'stop']);
export type RelationEndpointDirection = z.infer<typeof RelationEndpointDirectionSchema>;

const relationEndpoint = {
  direction: RelationEndpointDirectionSchema,
  targetNoteId: IdentifierSchema,
} as const;

export const PitchKeySemanticSchema = z.object({ semantic: z.literal('pitch-key') }).strict();

export const TieSemanticSchema = z
  .object({ semantic: z.literal('ties'), ...relationEndpoint })
  .strict();

export const SlurSemanticSchema = z
  .object({ semantic: z.literal('slurs'), ...relationEndpoint })
  .strict();

export const Tuplet32SemanticSchema = z
  .object({
    actualNotes: z.literal(3),
    normalNotes: z.literal(2),
    semantic: z.literal('tuplet-3-2'),
  })
  .strict();

export const TwoVoicesSemanticSchema = z
  .object({ semantic: z.literal('two-voices'), voice: z.union([z.literal(1), z.literal(2)]) })
  .strict();

export const DynamicsMfSemanticSchema = z
  .object({ semantic: z.literal('dynamics-mf'), value: z.literal('mf') })
  .strict();

export const AccentSemanticSchema = z
  .object({ articulation: z.literal('accent'), semantic: z.literal('accent') })
  .strict();

export const StaccatoSemanticSchema = z
  .object({ articulation: z.literal('staccato'), semantic: z.literal('staccato') })
  .strict();

export const PerStringSoundingDurationSemanticSchema = z
  .object({
    semantic: z.literal('per-string-sounding-duration'),
    soundingDurationTicks: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const HammerOnSemanticSchema = z
  .object({ semantic: z.literal('hammer-on'), ...relationEndpoint })
  .strict();

export const PullOffSemanticSchema = z
  .object({ semantic: z.literal('pull-off'), ...relationEndpoint })
  .strict();

export const SlideSemanticSchema = z
  .object({ semantic: z.literal('slide'), ...relationEndpoint })
  .strict();

export const BoundedBendSemanticSchema = z
  .object({
    semantic: z.literal('bend-bounded'),
    semitones: z.number().min(0.5).max(MAX_BOUNDED_BEND_SEMITONES).multipleOf(0.5),
  })
  .strict();

export const VibratoSemanticSchema = z.object({ semantic: z.literal('vibrato') }).strict();
export const LetRingSemanticSchema = z.object({ semantic: z.literal('let-ring') }).strict();
export const PalmMuteSemanticSchema = z.object({ semantic: z.literal('palm-mute') }).strict();
export const DeadNoteSemanticSchema = z.object({ semantic: z.literal('dead-note') }).strict();
export const NaturalHarmonicSemanticSchema = z
  .object({ semantic: z.literal('natural-harmonic') })
  .strict();

export const PracticeNativeSemanticSchema = z.discriminatedUnion('semantic', [
  PitchKeySemanticSchema,
  TieSemanticSchema,
  SlurSemanticSchema,
  Tuplet32SemanticSchema,
  TwoVoicesSemanticSchema,
  DynamicsMfSemanticSchema,
  AccentSemanticSchema,
  StaccatoSemanticSchema,
  PerStringSoundingDurationSemanticSchema,
  HammerOnSemanticSchema,
  PullOffSemanticSchema,
  SlideSemanticSchema,
  BoundedBendSemanticSchema,
  VibratoSemanticSchema,
  LetRingSemanticSchema,
  PalmMuteSemanticSchema,
  DeadNoteSemanticSchema,
  NaturalHarmonicSemanticSchema,
]);

export type PracticeNativeSemantic = z.infer<typeof PracticeNativeSemanticSchema>;
