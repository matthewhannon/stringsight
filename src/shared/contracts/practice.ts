import { z } from 'zod';

import { ConfidenceSchema, IdentifierSchema } from './common';
import {
  AccentSemanticSchema,
  BoundedBendSemanticSchema,
  DeadNoteSemanticSchema,
  DynamicsMfSemanticSchema,
  HammerOnSemanticSchema,
  LetRingSemanticSchema,
  NaturalHarmonicSemanticSchema,
  PalmMuteSemanticSchema,
  PullOffSemanticSchema,
  SlideSemanticSchema,
  SlurSemanticSchema,
  StaccatoSemanticSchema,
  TieSemanticSchema,
  VibratoSemanticSchema,
} from './practice-semantics';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const MAX_TEXT_LENGTH = 500;
const MAX_ANCHOR_COUNT = 10_000;
// At 500 records, the worst-case assessment (all ambiguous records, 16 candidates each,
// 16 observed IDs and full timing provenance per candidate) remains below canonical JSON's
// 350,000-node ceiling, including the qualified hashing envelope.
const MAX_ASSESSMENT_RECORD_COUNT = 500;
const MAX_ASSESSMENT_AMBIGUOUS_CANDIDATE_COUNT = 16;
const MAX_CAPTURE_EPOCH_COUNT = 2_000;
const MAX_CAPTURE_DISCONTINUITY_COUNT = 2_000;
const MAX_DOCUMENT_EVENT_COUNT = 2_000;
const MAX_DOCUMENT_EVENT_COUNT_PER_VOICE = 2_000;
const MAX_DOCUMENT_NOTE_COUNT = 4_000;
const MAX_DOCUMENT_SEMANTIC_COUNT = 10_000;
const MAX_DOCUMENT_TRACK_COUNT = 16;
const MAX_IDENTIFIER_RECORD_ENTRIES = 128;
const MAX_LOOP_PRESET_COUNT = 1_000;
const MAX_MAP_ENTRY_COUNT = 5_000;
const MAX_TOTAL_MAP_ENTRY_COUNT = 5_000;
const MAX_WARNING_COUNT = 256;

const StrictIdentifierRecordSchema = z
  .record(IdentifierSchema, IdentifierSchema)
  .refine((record) => Object.keys(record).length <= MAX_IDENTIFIER_RECORD_ENTRIES, {
    message: `Identifier records may contain at most ${String(MAX_IDENTIFIER_RECORD_ENTRIES)} entries.`,
  });

export const PracticeContractVersionSchema = z.literal(1);
export const PRACTICE_DOCUMENT_CONTRACT_VERSION = 1 as const;
export const OBSERVED_EVIDENCE_SNAPSHOT_CONTRACT_VERSION = 1 as const;
export const PRACTICE_TAKE_CONTRACT_VERSION = 1 as const;
export const MEDIA_IDENTITY_CONTRACT_VERSION = 1 as const;
export const MEDIA_AVAILABILITY_STATE_CONTRACT_VERSION = 1 as const;
export const REFERENCE_VIDEO_CONTRACT_VERSION = 1 as const;
export const TAKE_VIDEO_CONTRACT_VERSION = 1 as const;
export const TAKE_VIDEO_ATTACHMENT_STATE_CONTRACT_VERSION = 1 as const;
export const REFERENCE_SCORE_MEDIA_SYNC_MAP_CONTRACT_VERSION = 1 as const;
export const TAKE_CAPTURE_MEDIA_SYNC_MAP_CONTRACT_VERSION = 1 as const;
export const PRACTICE_ASSESSMENT_CONTRACT_VERSION = 1 as const;

export const PRACTICE_ASSESSMENT_LIMITS = Object.freeze({
  maximumAmbiguousCandidatesPerRecord: MAX_ASSESSMENT_AMBIGUOUS_CANDIDATE_COUNT,
  maximumOutcomeRecords: MAX_ASSESSMENT_RECORD_COUNT,
} as const);

export const MusicalTickSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_SAFE_INTEGER)
  .brand<'MusicalTick'>();

export type MusicalTick = z.infer<typeof MusicalTickSchema>;

export const MusicalDurationSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_SAFE_INTEGER)
  .brand<'MusicalDuration'>();

export type MusicalDuration = z.infer<typeof MusicalDurationSchema>;

export const PpqSchema = z.literal(960).brand<'Ppq'>();

export type Ppq = z.infer<typeof PpqSchema>;

export const QualifiedHashSchema = z
  .object({
    algorithm: z.literal('sha256'),
    canonicalizationId: z.literal('stringsight-canonical-json'),
    canonicalizationVersion: z.literal(1),
    digestHex: z.string().regex(/^[0-9a-f]{64}$/, 'digestHex must be a lowercase SHA-256 digest.'),
    schemaId: IdentifierSchema,
    schemaVersion: z.number().int().positive(),
    projectionId: IdentifierSchema,
    projectionVersion: z.number().int().positive(),
  })
  .strict();

export type QualifiedHash = z.infer<typeof QualifiedHashSchema>;

function qualifiedHashesExactlyMatch(left: QualifiedHash, right: QualifiedHash): boolean {
  return (
    left.digestHex === right.digestHex &&
    left.projectionId === right.projectionId &&
    left.projectionVersion === right.projectionVersion &&
    left.schemaId === right.schemaId &&
    left.schemaVersion === right.schemaVersion
  );
}

const qualifiedHashFor = <const SchemaId extends string, const ProjectionId extends string>(
  schemaId: SchemaId,
  projectionId: ProjectionId,
) =>
  QualifiedHashSchema.extend({
    projectionId: z.literal(projectionId),
    projectionVersion: z.literal(1),
    schemaId: z.literal(schemaId),
    schemaVersion: z.literal(1),
  }).strict();

export const PracticeDocumentContentHashSchema = qualifiedHashFor(
  'practice-document',
  'practice-document-content',
);
export const PracticeExpectedEventsHashSchema = qualifiedHashFor(
  'practice-document',
  'practice-expected-events',
);
export const PracticeDocumentRevisionHashSchema = qualifiedHashFor(
  'practice-document-revision',
  'practice-document-revision',
);
export const ObservedEvidenceSnapshotHashSchema = qualifiedHashFor(
  'observed-evidence-snapshot',
  'observed-evidence-snapshot',
);
export const PracticeTakeCoreHashSchema = qualifiedHashFor('practice-take', 'practice-take-core');
export const ReferenceScoreMediaSyncMapHashSchema = qualifiedHashFor(
  'reference-score-media-sync-map',
  'reference-score-media-sync-map',
);
export const TakeCaptureMediaSyncMapHashSchema = qualifiedHashFor(
  'take-capture-media-sync-map',
  'take-capture-media-sync-map',
);
export const PracticeAssessmentHashSchema = qualifiedHashFor(
  'practice-assessment',
  'practice-assessment',
);
export const AssessmentAlignmentProvenanceHashSchema = qualifiedHashFor(
  'assessment-alignment-provenance',
  'assessment-alignment-provenance',
);

export const DocumentRevisionIdentitySchema = z
  .object({
    contentHash: PracticeDocumentContentHashSchema,
    documentId: IdentifierSchema,
    revisionId: IdentifierSchema,
    revisionNumber: z.number().int().positive().max(MAX_SAFE_INTEGER),
  })
  .strict();

export type DocumentRevisionIdentity = z.infer<typeof DocumentRevisionIdentitySchema>;

export const MusicalRangeSchema = z
  .object({
    endTickExclusive: MusicalTickSchema,
    startTick: MusicalTickSchema,
  })
  .strict()
  .refine(({ endTickExclusive, startTick }) => endTickExclusive > startTick, {
    message: 'A musical range must be non-empty and half-open.',
    path: ['endTickExclusive'],
  });

export type MusicalRange = z.infer<typeof MusicalRangeSchema>;

const TickMapEntrySchema = z.object({ tick: MusicalTickSchema }).strict();

function orderedTickMap(entries: readonly { tick: number }[]): boolean {
  return entries.every(
    (entry, index) => index === 0 || entry.tick > (entries[index - 1]?.tick ?? -1),
  );
}

function startsAtTickZero(entries: readonly { tick: number }[]): boolean {
  return entries[0]?.tick === 0;
}

export const TempoMapEntrySchema = TickMapEntrySchema.extend({
  microsecondsPerQuarter: z.number().int().min(1).max(60_000_000),
}).strict();

export type TempoMapEntry = z.infer<typeof TempoMapEntrySchema>;

export const TempoMapSchema = z
  .array(TempoMapEntrySchema)
  .min(1)
  .max(MAX_MAP_ENTRY_COUNT)
  .refine(startsAtTickZero, 'The tempo map must start at tick zero.')
  .refine(orderedTickMap, 'Tempo-map ticks must be strictly increasing and unique.');

const MeterDenominatorSchema = z
  .number()
  .int()
  .min(1)
  .max(64)
  .refine((value) => (value & (value - 1)) === 0, 'Meter denominator must be a power of two.');

export const MeterMapEntrySchema = TickMapEntrySchema.extend({
  denominator: MeterDenominatorSchema,
  grouping: z.array(z.number().int().positive()).min(1).max(32),
  numerator: z.number().int().positive().max(32),
})
  .strict()
  .refine(
    ({ grouping, numerator }) => grouping.reduce((sum, value) => sum + value, 0) === numerator,
    {
      message: 'Meter grouping must sum to the numerator.',
      path: ['grouping'],
    },
  );

export type MeterMapEntry = z.infer<typeof MeterMapEntrySchema>;

export const MeterMapSchema = z
  .array(MeterMapEntrySchema)
  .min(1)
  .max(MAX_MAP_ENTRY_COUNT)
  .refine(startsAtTickZero, 'The meter map must start at tick zero.')
  .refine(orderedTickMap, 'Meter-map ticks must be strictly increasing and unique.');

export const KeyMapEntrySchema = TickMapEntrySchema.extend({
  fifths: z.number().int().min(-7).max(7),
  mode: z.enum(['major', 'minor']),
}).strict();

export type KeyMapEntry = z.infer<typeof KeyMapEntrySchema>;

export const KeyMapSchema = z
  .array(KeyMapEntrySchema)
  .min(1)
  .max(MAX_MAP_ENTRY_COUNT)
  .refine(startsAtTickZero, 'The key map must start at tick zero.')
  .refine(orderedTickMap, 'Key-map ticks must be strictly increasing and unique.');

export const PracticeGuitarStringSchema = z
  .object({
    openMidi: z.number().int().min(0).max(127),
    stringNumber: z.number().int().positive().max(12),
  })
  .strict();

export const PracticeGuitarConfigurationSchema = z
  .object({
    capoFret: z.number().int().nonnegative().max(36),
    handedness: z.enum(['left', 'right']),
    maxPhysicalFret: z.number().int().min(1).max(36),
    scaleLengthMm: z.number().positive().max(2_000),
    temperament: z.literal('12-tet'),
    tuning: z.array(PracticeGuitarStringSchema).min(1).max(12),
  })
  .strict()
  .superRefine(({ capoFret, maxPhysicalFret, tuning }, context) => {
    if (capoFret > maxPhysicalFret) {
      context.addIssue({
        code: 'custom',
        message: 'capoFret must not exceed maxPhysicalFret.',
        path: ['capoFret'],
      });
    }
    tuning.forEach(({ openMidi, stringNumber }, index) => {
      if (stringNumber !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: 'Tuning must use canonical string-one-first order.',
          path: ['tuning', index, 'stringNumber'],
        });
      }
      if (openMidi + maxPhysicalFret > 127) {
        context.addIssue({
          code: 'custom',
          message: 'The configured fretboard exceeds the MIDI range.',
          path: ['tuning', index, 'openMidi'],
        });
      }
    });
  });

export type PracticeGuitarConfiguration = z.infer<typeof PracticeGuitarConfigurationSchema>;

export const WrittenPitchSchema = z
  .object({
    accidental: z.number().int().min(-2).max(2),
    octave: z.number().int().min(-1).max(9),
    step: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
  })
  .strict();

export type WrittenPitch = z.infer<typeof WrittenPitchSchema>;

const GuitarNoteSemanticSchema = z.union([
  TieSemanticSchema,
  SlurSemanticSchema,
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

const GuitarPositionSchema = z
  .object({
    stringNumber: z.number().int().positive().max(12),
    tabFret: z.number().int().nonnegative().max(36),
  })
  .strict();

const RationalTupletSchema = z
  .object({
    actualNotes: z.literal(3),
    normalNotes: z.literal(2),
  })
  .strict();

export const GuitarNoteSchema = z
  .object({
    id: IdentifierSchema,
    position: GuitarPositionSchema,
    semantics: z.array(GuitarNoteSemanticSchema).max(16).default([]),
    soundingDurationTicks: MusicalDurationSchema,
    writtenPitch: WrittenPitchSchema,
  })
  .strict()
  .refine(
    ({ semantics }) =>
      new Set(
        semantics.map((semantic) =>
          'targetNoteId' in semantic
            ? `${semantic.semantic}:${semantic.direction}:${semantic.targetNoteId}`
            : semantic.semantic,
        ),
      ).size === semantics.length,
    { message: 'Note semantics must not contain duplicate entries.', path: ['semantics'] },
  );

type GuitarNote = z.infer<typeof GuitarNoteSchema>;

export const GuitarEventSchema = z
  .object({
    id: IdentifierSchema,
    articulations: z
      .array(z.union([AccentSemanticSchema, StaccatoSemanticSchema]))
      .max(2)
      .default([]),
    dynamic: DynamicsMfSemanticSchema.optional(),
    kind: z.literal('guitar-event'),
    notatedDurationTicks: MusicalDurationSchema,
    notes: z.array(GuitarNoteSchema).min(1).max(12),
    tick: MusicalTickSchema,
    tuplet: RationalTupletSchema.optional(),
  })
  .strict()
  .refine(
    ({ notes }) =>
      new Set(notes.map(({ position }) => position.stringNumber)).size === notes.length,
    { message: 'A guitar event cannot use the same string more than once.', path: ['notes'] },
  )
  .refine(({ notes }) => new Set(notes.map(({ id }) => id)).size === notes.length, {
    message: 'Guitar-note IDs must be unique within an event.',
    path: ['notes'],
  });

export const RestEventSchema = z
  .object({
    durationTicks: MusicalDurationSchema,
    id: IdentifierSchema,
    kind: z.literal('rest'),
    tick: MusicalTickSchema,
    tuplet: RationalTupletSchema.optional(),
  })
  .strict();

export const PracticeVoiceEventSchema = z.discriminatedUnion('kind', [
  GuitarEventSchema,
  RestEventSchema,
]);

export type PracticeVoiceEvent = z.infer<typeof PracticeVoiceEventSchema>;

function eventEnd(event: PracticeVoiceEvent): number {
  return event.tick + (event.kind === 'rest' ? event.durationTicks : event.notatedDurationTicks);
}

export const PracticeVoiceSchema = z
  .object({
    events: z.array(PracticeVoiceEventSchema).max(MAX_DOCUMENT_EVENT_COUNT_PER_VOICE),
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine(({ events }, context) => {
    const ids = new Set<string>();
    events.forEach((event, index) => {
      if (ids.has(event.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Voice event IDs must be unique.',
          path: ['events', index, 'id'],
        });
      }
      ids.add(event.id);
      const previous = events[index - 1];
      if (previous !== undefined && event.tick < eventEnd(previous)) {
        context.addIssue({
          code: 'custom',
          message: 'Voice events must be ordered and must not overlap.',
          path: ['events', index, 'tick'],
        });
      }
    });
  });

export const PracticeTrackSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(120),
    voices: z.array(PracticeVoiceSchema).min(1).max(2),
  })
  .strict()
  .refine(({ voices }) => new Set(voices.map(({ id }) => id)).size === voices.length, {
    message: 'Voice IDs must be unique within a track.',
    path: ['voices'],
  });

export const LoopPresetSchema = z
  .object({
    id: IdentifierSchema,
    name: z.string().trim().min(1).max(120),
    range: MusicalRangeSchema,
  })
  .strict();

const PracticeDocumentMetadataSchema = z
  .object({
    artist: z.string().trim().max(120).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    title: z.string().trim().min(1).max(120),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(({ createdAt, updatedAt }) => Date.parse(updatedAt) >= Date.parse(createdAt), {
    message: 'updatedAt must not be earlier than createdAt.',
    path: ['updatedAt'],
  });

const ImportProvenanceReferenceSchema = z
  .object({
    adapterId: IdentifierSchema,
    adapterVersion: IdentifierSchema,
    importReportId: IdentifierSchema,
    sourceFormat: IdentifierSchema,
    sourceHash: QualifiedHashSchema,
  })
  .strict();

function writtenPitchMidi(pitch: WrittenPitch): number {
  const semitones: Readonly<Record<WrittenPitch['step'], number>> = {
    A: 9,
    B: 11,
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
  };
  return (pitch.octave + 1) * 12 + semitones[pitch.step] + pitch.accidental;
}

export const PracticeDocumentSchema = z
  .object({
    contractVersion: z.literal(PRACTICE_DOCUMENT_CONTRACT_VERSION),
    durationTicks: MusicalDurationSchema,
    expectedProjectionHash: PracticeExpectedEventsHashSchema,
    guitar: PracticeGuitarConfigurationSchema,
    importProvenance: ImportProvenanceReferenceSchema.nullable().default(null),
    keyMap: KeyMapSchema,
    loopPresets: z.array(LoopPresetSchema).max(MAX_LOOP_PRESET_COUNT).default([]),
    metadata: PracticeDocumentMetadataSchema,
    meterMap: MeterMapSchema,
    ppq: PpqSchema,
    revision: DocumentRevisionIdentitySchema,
    tempoMap: TempoMapSchema,
    tracks: z.array(PracticeTrackSchema).min(1).max(MAX_DOCUMENT_TRACK_COUNT),
  })
  .strict()
  .superRefine((document, context) => {
    const { durationTicks, guitar } = document;
    const checkMapBounds = (mapName: 'keyMap' | 'meterMap' | 'tempoMap'): void => {
      document[mapName].forEach(({ tick }, index) => {
        if (tick >= durationTicks) {
          context.addIssue({
            code: 'custom',
            message: 'Map entries must be inside document duration.',
            path: [mapName, index, 'tick'],
          });
        }
      });
    };
    checkMapBounds('tempoMap');
    checkMapBounds('meterMap');
    checkMapBounds('keyMap');
    if (
      document.tempoMap.length + document.meterMap.length + document.keyMap.length >
      MAX_TOTAL_MAP_ENTRY_COUNT
    ) {
      context.addIssue({
        code: 'custom',
        message: `Practice maps may contain at most ${String(MAX_TOTAL_MAP_ENTRY_COUNT)} total entries.`,
        path: ['tempoMap'],
      });
    }

    const semanticIds = new Set<string>();
    let documentEventCount = 0;
    let documentNoteCount = 0;
    let documentSemanticCount = 0;
    const noteFacts = new Map<
      string,
      {
        readonly midi: number;
        readonly note: GuitarNote;
        readonly path: readonly (number | string)[];
        readonly tick: number;
        readonly trackId: string;
        readonly voiceId: string;
      }
    >();
    document.tracks.forEach((track, trackIndex) => {
      if (semanticIds.has(track.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Track IDs must be document-unique.',
          path: ['tracks', trackIndex, 'id'],
        });
      }
      semanticIds.add(track.id);
      track.voices.forEach((voice, voiceIndex) => {
        if (semanticIds.has(voice.id)) {
          context.addIssue({
            code: 'custom',
            message: 'Voice IDs must be document-unique.',
            path: ['tracks', trackIndex, 'voices', voiceIndex, 'id'],
          });
        }
        semanticIds.add(voice.id);
        voice.events.forEach((event, eventIndex) => {
          documentEventCount += 1;
          const eventPath = [
            'tracks',
            trackIndex,
            'voices',
            voiceIndex,
            'events',
            eventIndex,
          ] as const;
          if (semanticIds.has(event.id)) {
            context.addIssue({
              code: 'custom',
              message: 'Event IDs must be document-unique.',
              path: [...eventPath, 'id'],
            });
          }
          semanticIds.add(event.id);
          if (eventEnd(event) > durationTicks) {
            context.addIssue({
              code: 'custom',
              message: 'Event exceeds document duration.',
              path: [...eventPath, 'tick'],
            });
          }
          if (event.kind === 'guitar-event') {
            event.notes.forEach((note, noteIndex) => {
              documentNoteCount += 1;
              documentSemanticCount += note.semantics.length;
              const tuning = guitar.tuning[note.position.stringNumber - 1];
              const notePath = [...eventPath, 'notes', noteIndex] as const;
              if (tuning === undefined) {
                context.addIssue({
                  code: 'custom',
                  message: 'Guitar string does not exist.',
                  path: [...notePath, 'position', 'stringNumber'],
                });
                return;
              }
              if (note.position.tabFret + guitar.capoFret > guitar.maxPhysicalFret) {
                context.addIssue({
                  code: 'custom',
                  message: 'Guitar position exceeds the physical fretboard.',
                  path: [...notePath, 'position', 'tabFret'],
                });
              }
              const derivedMidi = tuning.openMidi + guitar.capoFret + note.position.tabFret;
              if (writtenPitchMidi(note.writtenPitch) !== derivedMidi) {
                context.addIssue({
                  code: 'custom',
                  message: 'Written pitch must match pitch derived from guitar position.',
                  path: [...notePath, 'writtenPitch'],
                });
              }
              if (event.tick + note.soundingDurationTicks > durationTicks) {
                context.addIssue({
                  code: 'custom',
                  message: 'Per-string sounding duration exceeds document duration.',
                  path: [...notePath, 'soundingDurationTicks'],
                });
              }
              if (semanticIds.has(note.id)) {
                context.addIssue({
                  code: 'custom',
                  message: 'Guitar-note IDs must be document-unique.',
                  path: [...notePath, 'id'],
                });
              }
              semanticIds.add(note.id);
              noteFacts.set(note.id, {
                midi: derivedMidi,
                note,
                path: notePath,
                tick: event.tick,
                trackId: track.id,
                voiceId: voice.id,
              });
            });
          }
        });
      });
    });
    document.loopPresets.forEach(({ id, range }, index) => {
      if (range.endTickExclusive > durationTicks) {
        context.addIssue({
          code: 'custom',
          message: 'Loop range exceeds document duration.',
          path: ['loopPresets', index, 'range'],
        });
      }
      if (semanticIds.has(id)) {
        context.addIssue({
          code: 'custom',
          message: 'Loop preset IDs must be document-unique.',
          path: ['loopPresets', index, 'id'],
        });
      }
      semanticIds.add(id);
    });
    for (const [count, maximum, path, label] of [
      [documentEventCount, MAX_DOCUMENT_EVENT_COUNT, ['tracks'], 'events'],
      [documentNoteCount, MAX_DOCUMENT_NOTE_COUNT, ['tracks'], 'notes'],
      [documentSemanticCount, MAX_DOCUMENT_SEMANTIC_COUNT, ['tracks'], 'note semantics'],
    ] as const) {
      if (count > maximum) {
        context.addIssue({
          code: 'custom',
          message: `Practice documents may contain at most ${String(maximum)} ${label}.`,
          path: [...path],
        });
      }
    }
    noteFacts.forEach((source, sourceId) => {
      const endpointCounts = new Map<string, number>();
      source.note.semantics.forEach((semantic, semanticIndex) => {
        if (!('targetNoteId' in semantic)) return;
        const path = [...source.path, 'semantics', semanticIndex, 'targetNoteId'];
        const endpointKey = `${semantic.semantic}:${semantic.direction}`;
        const endpointCount = (endpointCounts.get(endpointKey) ?? 0) + 1;
        endpointCounts.set(endpointKey, endpointCount);
        // Bounded v1 permits one start and one stop per relationship kind, including slurs.
        if (endpointCount > 1) {
          context.addIssue({
            code: 'custom',
            message: 'A note may have at most one endpoint per relationship kind and direction.',
            path,
          });
        }
        const target = noteFacts.get(semantic.targetNoteId);
        if (target === undefined) {
          context.addIssue({
            code: 'custom',
            message: 'Related technique target must reference a note in this document.',
            path,
          });
          return;
        }
        if (semantic.targetNoteId === sourceId) {
          context.addIssue({
            code: 'custom',
            message: 'A related technique cannot target its own note.',
            path,
          });
        }
        if (source.trackId !== target.trackId || source.voiceId !== target.voiceId) {
          context.addIssue({
            code: 'custom',
            message: 'Related technique endpoints must remain in the same track and voice.',
            path,
          });
        }
        const oppositeDirection = semantic.direction === 'start' ? 'stop' : 'start';
        const reciprocalCount = target.note.semantics.filter(
          (candidate) =>
            'targetNoteId' in candidate &&
            candidate.semantic === semantic.semantic &&
            candidate.direction === oppositeDirection &&
            candidate.targetNoteId === sourceId,
        ).length;
        if (reciprocalCount !== 1) {
          context.addIssue({
            code: 'custom',
            message: 'Related techniques require one reciprocal endpoint of the same kind.',
            path,
          });
        }
        const directionIsTemporal =
          semantic.direction === 'start' ? source.tick < target.tick : source.tick > target.tick;
        if (!directionIsTemporal) {
          context.addIssue({
            code: 'custom',
            message: 'Related technique endpoints must follow their declared temporal direction.',
            path,
          });
        }
        if (semantic.direction !== 'start') return;
        if (semantic.semantic === 'ties' && source.midi !== target.midi) {
          context.addIssue({
            code: 'custom',
            message: 'Tied notes must have identical pitch.',
            path,
          });
        }
        if (['hammer-on', 'pull-off', 'slide'].includes(semantic.semantic)) {
          if (source.note.position.stringNumber !== target.note.position.stringNumber) {
            context.addIssue({
              code: 'custom',
              message: 'Hammer-ons, pull-offs, and slides must remain on one string.',
              path,
            });
          }
          const fretDelta = target.note.position.tabFret - source.note.position.tabFret;
          const directionIsPhysical =
            semantic.semantic === 'hammer-on'
              ? fretDelta > 0
              : semantic.semantic === 'pull-off'
                ? fretDelta < 0
                : fretDelta !== 0;
          if (!directionIsPhysical) {
            context.addIssue({
              code: 'custom',
              message: 'Related technique fret direction is physically inconsistent.',
              path,
            });
          }
        }
      });
    });
  });

export type PracticeDocument = z.infer<typeof PracticeDocumentSchema>;

export const ObservedEvidenceSnapshotSchema = z
  .object({
    contractVersion: z.literal(OBSERVED_EVIDENCE_SNAPSHOT_CONTRACT_VERSION),
    correctedProjectionHash: QualifiedHashSchema,
    correctionCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    correctionPrefixHash: QualifiedHashSchema,
    createdAt: z.iso.datetime({ offset: true }),
    detectorVersions: StrictIdentifierRecordSchema,
    expectedPcmHash: QualifiedHashSchema.nullable(),
    id: IdentifierSchema,
    rawEventCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    rawEvidenceHash: QualifiedHashSchema,
    sessionId: IdentifierSchema,
    sessionProjectionHash: QualifiedHashSchema,
  })
  .strict();

export const CaptureEpochSchema = z
  .object({
    appliedAudioFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    captureGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    endLogicalFrameExclusive: z.number().int().nonnegative().max(MAX_SAFE_INTEGER).nullable(),
    id: IdentifierSchema,
    captureStreamId: IdentifierSchema.nullable().default(null),
    runtimeId: IdentifierSchema.nullable().default(null),
    runtimeGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    sampleRate: z.number().int().positive().max(MAX_SAFE_INTEGER).nullable().default(null),
    scheduledAudioFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    scoreStartTick: MusicalTickSchema,
    segmentIndex: z.number().int().nonnegative().max(MAX_SAFE_INTEGER).default(0),
    startLogicalFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    transportGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
  })
  .strict()
  .superRefine(
    (
      { appliedAudioFrame, endLogicalFrameExclusive, scheduledAudioFrame, startLogicalFrame },
      context,
    ) => {
      if (endLogicalFrameExclusive !== null && endLogicalFrameExclusive < startLogicalFrame) {
        context.addIssue({
          code: 'custom',
          message: 'Capture epoch end must not precede its start.',
          path: ['endLogicalFrameExclusive'],
        });
      }
      if (appliedAudioFrame < scheduledAudioFrame) {
        context.addIssue({
          code: 'custom',
          message: 'Applied audio frame must not precede its scheduled boundary.',
          path: ['appliedAudioFrame'],
        });
      }
    },
  );

export const CaptureBoundaryKindSchema = z.enum([
  'recording-start',
  'pause',
  'resume',
  'stop',
  'discontinuity',
]);

export const CaptureClockAnchorSchema = z
  .object({
    appliedAudioFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    boundary: CaptureBoundaryKindSchema,
    captureGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    captureStreamId: IdentifierSchema,
    epochId: IdentifierSchema,
    id: IdentifierSchema,
    lateByFrames: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    logicalFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    runtimeGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    runtimeId: IdentifierSchema,
    scheduledAudioFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    scorePhase: z.enum(['count-in', 'playing', 'paused', 'stopped']),
    scoreTick: MusicalTickSchema,
    transportGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
  })
  .strict()
  .refine(
    ({ appliedAudioFrame, lateByFrames, scheduledAudioFrame }) =>
      appliedAudioFrame - scheduledAudioFrame === lateByFrames,
    {
      message: 'lateByFrames must equal appliedAudioFrame minus scheduledAudioFrame.',
      path: ['lateByFrames'],
    },
  );

export const CaptureDiscontinuitySchema = z
  .object({
    afterEpochId: IdentifierSchema.nullable(),
    beforeEpochId: IdentifierSchema.nullable(),
    detail: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    discardedOverlapFrames: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    id: IdentifierSchema,
    kind: z.enum([
      'pause',
      'bounded-gap',
      'overlap',
      'device-change',
      'sample-rate-change',
      'runtime-reset',
      'capture-reset',
      'transport-generation-change',
      'recoverable-error',
    ]),
    logicalFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    missingFrames: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    wallTimeExcluded: z.boolean(),
  })
  .strict()
  .superRefine((discontinuity, context) => {
    if (discontinuity.beforeEpochId === null && discontinuity.afterEpochId === null) {
      context.addIssue({
        code: 'custom',
        message: 'A discontinuity must bind at least one capture epoch.',
        path: ['beforeEpochId'],
      });
    }
    if (
      discontinuity.beforeEpochId !== null &&
      discontinuity.beforeEpochId === discontinuity.afterEpochId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'A discontinuity cannot bind the same epoch on both sides.',
        path: ['afterEpochId'],
      });
    }
    if (discontinuity.kind === 'bounded-gap' && discontinuity.missingFrames === 0) {
      context.addIssue({
        code: 'custom',
        message: 'A bounded gap must report missing frames.',
        path: ['missingFrames'],
      });
    }
    if (discontinuity.kind === 'overlap' && discontinuity.discardedOverlapFrames === 0) {
      context.addIssue({
        code: 'custom',
        message: 'An overlap must report discarded frames.',
        path: ['discardedOverlapFrames'],
      });
    }
    if (discontinuity.kind === 'pause' && !discontinuity.wallTimeExcluded) {
      context.addIssue({
        code: 'custom',
        message: 'Pause wall time must be explicitly excluded from logical recording frames.',
        path: ['wallTimeExcluded'],
      });
    }
  });

export const TakeCalibrationProvenanceSchema = z
  .object({
    inputLatencyFrames: z.number().int().nonnegative().max(MAX_SAFE_INTEGER).nullable(),
    measuredAt: z.iso.datetime({ offset: true }).nullable(),
    methodId: IdentifierSchema.nullable(),
    methodVersion: IdentifierSchema.nullable(),
    status: z.enum(['measured', 'estimated', 'unavailable']),
    uncertaintyFrames: z.number().int().nonnegative().max(MAX_SAFE_INTEGER).nullable(),
    warnings: z.array(z.string().trim().min(1).max(MAX_TEXT_LENGTH)).max(MAX_WARNING_COUNT),
  })
  .strict()
  .superRefine((provenance, context) => {
    const detailed = provenance.status !== 'unavailable';
    for (const field of [
      'inputLatencyFrames',
      'measuredAt',
      'methodId',
      'methodVersion',
      'uncertaintyFrames',
    ] as const) {
      if (detailed !== (provenance[field] !== null)) {
        context.addIssue({
          code: 'custom',
          message: detailed
            ? 'Measured or estimated calibration requires complete provenance.'
            : 'Unavailable calibration cannot claim measured values.',
          path: [field],
        });
      }
    }
  });

export const TakeMicrophoneRecordingProvenanceSchema = z
  .object({
    channelCount: z.literal(1),
    contentHash: QualifiedHashSchema,
    finalizedAt: z.iso.datetime({ offset: true }),
    formatMetadataHash: QualifiedHashSchema,
    frameCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    logicalLocator: z.string().trim().min(1).max(2_048),
    mediaId: IdentifierSchema,
    pcmEnvelopeHash: QualifiedHashSchema,
    sampleRate: z.number().int().positive().max(MAX_SAFE_INTEGER),
  })
  .strict();

export const TakeVideoCaptureProvenanceSchema = z
  .object({
    audioTrackCount: z.literal(0),
    captureGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    contentHash: QualifiedHashSchema,
    finalizedAt: z.iso.datetime({ offset: true }),
    firstObservedTimestampMicroseconds: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_SAFE_INTEGER)
      .nullable(),
    formatMetadataHash: QualifiedHashSchema,
    lastObservedTimestampMicroseconds: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_SAFE_INTEGER)
      .nullable(),
    mediaId: IdentifierSchema,
    timestampPrecision: z.enum(['exact-observation', 'estimated', 'unavailable']),
    timestampStrategyId: IdentifierSchema,
    uncertaintyMicroseconds: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    videoTrackCount: z.literal(1),
  })
  .strict()
  .superRefine((provenance, context) => {
    const timestampsAvailable = provenance.timestampPrecision !== 'unavailable';
    if (
      timestampsAvailable !== (provenance.firstObservedTimestampMicroseconds !== null) ||
      timestampsAvailable !== (provenance.lastObservedTimestampMicroseconds !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Timestamp availability must match the declared take-video precision.',
        path: ['timestampPrecision'],
      });
    }
    if (
      provenance.firstObservedTimestampMicroseconds !== null &&
      provenance.lastObservedTimestampMicroseconds !== null &&
      provenance.lastObservedTimestampMicroseconds < provenance.firstObservedTimestampMicroseconds
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Take-video timestamps must be ordered.',
        path: ['lastObservedTimestampMicroseconds'],
      });
    }
  });

const LoopPassPolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single-pass') }).strict(),
  z
    .object({
      kind: z.literal('fixed-count'),
      passCount: z.number().int().min(2).max(MAX_SAFE_INTEGER),
    })
    .strict(),
  z.object({ kind: z.literal('until-stopped') }).strict(),
]);

export const PracticeTakeSchema = z
  .object({
    calibration: TakeCalibrationProvenanceSchema.default({
      inputLatencyFrames: null,
      measuredAt: null,
      methodId: null,
      methodVersion: null,
      status: 'unavailable',
      uncertaintyFrames: null,
      warnings: [],
    }),
    captureEpochs: z.array(CaptureEpochSchema).min(1).max(MAX_CAPTURE_EPOCH_COUNT),
    clockAnchors: z
      .array(CaptureClockAnchorSchema)
      .max(MAX_CAPTURE_EPOCH_COUNT * 2)
      .default([]),
    contractVersion: z.literal(PRACTICE_TAKE_CONTRACT_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    documentRevision: DocumentRevisionIdentitySchema,
    evidenceSnapshotHash: ObservedEvidenceSnapshotHashSchema,
    evidenceSnapshotId: IdentifierSchema,
    expectedProjectionHash: PracticeExpectedEventsHashSchema,
    id: IdentifierSchema,
    countInConfigurationHash: QualifiedHashSchema.nullable(),
    discontinuities: z
      .array(CaptureDiscontinuitySchema)
      .max(MAX_CAPTURE_DISCONTINUITY_COUNT)
      .default([]),
    loopPassPolicy: LoopPassPolicySchema,
    metronomeEnabled: z.boolean(),
    microphoneMediaHash: QualifiedHashSchema.nullable(),
    microphoneMediaId: IdentifierSchema.nullable(),
    microphoneRecordingProvenance: TakeMicrophoneRecordingProvenanceSchema.nullable().default(null),
    practiceSpeed: z
      .object({ denominator: z.number().int().positive(), numerator: z.number().int().positive() })
      .strict(),
    range: MusicalRangeSchema,
    referenceConfigurationHash: QualifiedHashSchema.nullable(),
    provenanceCompleteness: z.enum(['legacy-summary', 'complete']).default('legacy-summary'),
    sampleRate: z.number().int().positive(),
    status: z.enum(['finalized', 'finalized-with-warnings', 'failed-preserved']),
    takeCoreHash: PracticeTakeCoreHashSchema,
    takeVideoCaptureProvenance: TakeVideoCaptureProvenanceSchema.nullable().default(null),
    warnings: z.array(z.string().trim().min(1).max(MAX_TEXT_LENGTH)).max(MAX_WARNING_COUNT),
  })
  .strict()
  .superRefine((take, context) => {
    const {
      captureEpochs,
      clockAnchors,
      discontinuities,
      microphoneMediaHash,
      microphoneMediaId,
      microphoneRecordingProvenance,
    } = take;
    if ((microphoneMediaHash === null) !== (microphoneMediaId === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Microphone media ID and hash must be present or absent together.',
        path: ['microphoneMediaId'],
      });
    }
    const epochIds = new Set<string>();
    const epochIndexById = new Map<string, number>();
    captureEpochs.forEach((epoch, index) => {
      if (epochIds.has(epoch.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Capture epoch IDs must be unique.',
          path: ['captureEpochs', index, 'id'],
        });
      }
      epochIds.add(epoch.id);
      epochIndexById.set(epoch.id, index);
      if (epoch.sampleRate !== null && epoch.sampleRate !== take.sampleRate) {
        context.addIssue({
          code: 'custom',
          message: 'Capture epoch sample rate must match the immutable take sample rate.',
          path: ['captureEpochs', index, 'sampleRate'],
        });
      }
      if (
        epoch.scoreStartTick < take.range.startTick ||
        epoch.scoreStartTick >= take.range.endTickExclusive
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Capture epoch score start must lie inside the selected half-open take range.',
          path: ['captureEpochs', index, 'scoreStartTick'],
        });
      }
      const previous = captureEpochs[index - 1];
      if (
        previous !== undefined &&
        (previous.endLogicalFrameExclusive === null ||
          epoch.startLogicalFrame < previous.endLogicalFrameExclusive)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Capture epochs must be ordered, closed, and non-overlapping.',
          path: ['captureEpochs', index, 'startLogicalFrame'],
        });
      }
    });
    if (captureEpochs.at(-1)?.endLogicalFrameExclusive === null) {
      context.addIssue({
        code: 'custom',
        message: 'An immutable PracticeTake must close its final capture epoch.',
        path: ['captureEpochs', captureEpochs.length - 1, 'endLogicalFrameExclusive'],
      });
    }

    if (microphoneRecordingProvenance !== null) {
      if (
        microphoneMediaId !== microphoneRecordingProvenance.mediaId ||
        microphoneMediaHash === null ||
        !qualifiedHashesExactlyMatch(microphoneMediaHash, microphoneRecordingProvenance.contentHash)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Microphone recording provenance must match the take media identity.',
          path: ['microphoneRecordingProvenance'],
        });
      }
      if (microphoneRecordingProvenance.sampleRate !== take.sampleRate) {
        context.addIssue({
          code: 'custom',
          message: 'Microphone recording sample rate must match the take sample rate.',
          path: ['microphoneRecordingProvenance', 'sampleRate'],
        });
      }
      if (Date.parse(microphoneRecordingProvenance.finalizedAt) < Date.parse(take.createdAt)) {
        context.addIssue({
          code: 'custom',
          message: 'Microphone recording cannot finalize before its take is created.',
          path: ['microphoneRecordingProvenance', 'finalizedAt'],
        });
      }
      const finalLogicalFrame = captureEpochs.at(-1)?.endLogicalFrameExclusive;
      if (
        finalLogicalFrame !== null &&
        finalLogicalFrame !== undefined &&
        microphoneRecordingProvenance.frameCount !== finalLogicalFrame
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Recording frame count must equal the closed logical recording duration.',
          path: ['microphoneRecordingProvenance', 'frameCount'],
        });
      }
    }

    if (
      take.takeVideoCaptureProvenance !== null &&
      Date.parse(take.takeVideoCaptureProvenance.finalizedAt) < Date.parse(take.createdAt)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Take video cannot finalize before its take is created.',
        path: ['takeVideoCaptureProvenance', 'finalizedAt'],
      });
    }
    if (
      take.takeVideoCaptureProvenance !== null &&
      !captureEpochs.some(
        ({ captureGeneration }) =>
          captureGeneration === take.takeVideoCaptureProvenance?.captureGeneration,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Take-video capture generation must identify one of the take capture epochs.',
        path: ['takeVideoCaptureProvenance', 'captureGeneration'],
      });
    }

    const anchorIds = new Set<string>();
    clockAnchors.forEach((anchor, index) => {
      if (anchorIds.has(anchor.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Clock anchor IDs must be unique.',
          path: ['clockAnchors', index, 'id'],
        });
      }
      anchorIds.add(anchor.id);
      if (
        anchor.scoreTick < take.range.startTick ||
        anchor.scoreTick > take.range.endTickExclusive
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Clock anchor score tick must lie on or inside the selected take boundaries.',
          path: ['clockAnchors', index, 'scoreTick'],
        });
      }
      const epochIndex = epochIndexById.get(anchor.epochId);
      if (epochIndex === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Clock anchor must reference a capture epoch.',
          path: ['clockAnchors', index, 'epochId'],
        });
      } else {
        const epoch = captureEpochs[epochIndex];
        if (
          epoch !== undefined &&
          (anchor.captureGeneration !== epoch.captureGeneration ||
            anchor.runtimeGeneration !== epoch.runtimeGeneration ||
            anchor.transportGeneration !== epoch.transportGeneration ||
            (epoch.captureStreamId !== null && anchor.captureStreamId !== epoch.captureStreamId) ||
            (epoch.runtimeId !== null && anchor.runtimeId !== epoch.runtimeId))
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Clock anchor generations and epoch identities must match its capture epoch.',
            path: ['clockAnchors', index, 'epochId'],
          });
        }
        if (
          epoch !== undefined &&
          (anchor.logicalFrame < epoch.startLogicalFrame ||
            (epoch.endLogicalFrameExclusive !== null &&
              anchor.logicalFrame > epoch.endLogicalFrameExclusive))
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Clock anchor logical frame must lie on its capture epoch boundary or span.',
            path: ['clockAnchors', index, 'logicalFrame'],
          });
        }
      }
      const previous = clockAnchors[index - 1];
      if (previous !== undefined && anchor.logicalFrame < previous.logicalFrame) {
        context.addIssue({
          code: 'custom',
          message: 'Clock anchors must be ordered by non-decreasing logical frame.',
          path: ['clockAnchors', index, 'logicalFrame'],
        });
      }
    });

    const discontinuityIds = new Set<string>();
    discontinuities.forEach((discontinuity, index) => {
      if (discontinuityIds.has(discontinuity.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Capture discontinuity IDs must be unique.',
          path: ['discontinuities', index, 'id'],
        });
      }
      discontinuityIds.add(discontinuity.id);
      const beforeIndex =
        discontinuity.beforeEpochId === null
          ? undefined
          : epochIndexById.get(discontinuity.beforeEpochId);
      const afterIndex =
        discontinuity.afterEpochId === null
          ? undefined
          : epochIndexById.get(discontinuity.afterEpochId);
      if (discontinuity.beforeEpochId !== null && beforeIndex === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Discontinuity beforeEpochId must reference this take.',
          path: ['discontinuities', index, 'beforeEpochId'],
        });
      }
      if (discontinuity.afterEpochId !== null && afterIndex === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'Discontinuity afterEpochId must reference this take.',
          path: ['discontinuities', index, 'afterEpochId'],
        });
      }
      if (beforeIndex !== undefined && afterIndex !== undefined && beforeIndex >= afterIndex) {
        context.addIssue({
          code: 'custom',
          message: 'Discontinuity epoch references must follow capture order.',
          path: ['discontinuities', index, 'afterEpochId'],
        });
      }
      if (beforeIndex !== undefined && afterIndex !== undefined) {
        const beforeEpoch = captureEpochs[beforeIndex];
        const afterEpoch = captureEpochs[afterIndex];
        if (
          beforeEpoch?.endLogicalFrameExclusive !== discontinuity.logicalFrame ||
          afterEpoch === undefined
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Discontinuity logical frame must close its preceding epoch.',
            path: ['discontinuities', index, 'logicalFrame'],
          });
        } else {
          const expectedAfterStart =
            discontinuity.logicalFrame +
            (discontinuity.kind === 'bounded-gap' ? discontinuity.missingFrames : 0);
          if (afterEpoch.startLogicalFrame !== expectedAfterStart) {
            context.addIssue({
              code: 'custom',
              message:
                'Following epoch must account exactly for excluded wall time or missing frames.',
              path: ['discontinuities', index, 'afterEpochId'],
            });
          }
        }
      }
    });

    if (take.provenanceCompleteness === 'complete') {
      captureEpochs.forEach((epoch, index) => {
        if (
          epoch.segmentIndex !== index ||
          epoch.runtimeId === null ||
          epoch.captureStreamId === null ||
          epoch.sampleRate === null
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Complete take provenance requires sequential, fully identified capture epochs.',
            path: ['captureEpochs', index],
          });
        }
      });
      if (
        clockAnchors.length < 2 ||
        clockAnchors[0]?.boundary !== 'recording-start' ||
        clockAnchors.at(-1)?.boundary !== 'stop'
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Complete take provenance requires recording-start and stop clock anchors.',
          path: ['clockAnchors'],
        });
      }
      const anchoredEpochIds = new Set(clockAnchors.map(({ epochId }) => epochId));
      captureEpochs.forEach(({ id }, index) => {
        if (!anchoredEpochIds.has(id)) {
          context.addIssue({
            code: 'custom',
            message: 'Complete take provenance requires a clock anchor for every capture epoch.',
            path: ['captureEpochs', index, 'id'],
          });
        }
      });
      discontinuities.forEach(({ logicalFrame }, index) => {
        if (!clockAnchors.some((anchor) => anchor.logicalFrame === logicalFrame)) {
          context.addIssue({
            code: 'custom',
            message: 'Complete discontinuities require an observed clock anchor at their boundary.',
            path: ['discontinuities', index, 'logicalFrame'],
          });
        }
      });
      if (take.status !== 'failed-preserved' && microphoneRecordingProvenance === null) {
        context.addIssue({
          code: 'custom',
          message: 'A completely finalized take requires microphone recording provenance.',
          path: ['microphoneRecordingProvenance'],
        });
      }
    }
  });

export const MediaIdentitySchema = z
  .object({
    contractVersion: z.literal(MEDIA_IDENTITY_CONTRACT_VERSION),
    contentHash: QualifiedHashSchema,
    formatMetadataHash: QualifiedHashSchema,
    id: IdentifierSchema,
    mediaKind: z.enum(['microphone-audio', 'reference-video', 'take-video']),
  })
  .strict();

export const MediaAvailabilityStateSchema = z
  .object({
    availability: z.enum([
      'available',
      'external',
      'missing',
      'deleted-by-user',
      'evicted',
      'unsupported',
      'corrupt',
    ]),
    contractVersion: z.literal(MEDIA_AVAILABILITY_STATE_CONTRACT_VERSION),
    locator: z.string().trim().min(1).max(2_048).nullable(),
    mediaId: IdentifierSchema,
    provenance: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    stateRevision: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    ({ availability, locator }) =>
      availability === 'available' || availability === 'external'
        ? locator !== null
        : locator === null,
    { message: 'Only available or external media may expose a locator.', path: ['locator'] },
  );

export const ReferenceVideoSchema = z
  .object({
    contractVersion: z.literal(REFERENCE_VIDEO_CONTRACT_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    documentRevision: DocumentRevisionIdentitySchema,
    id: IdentifierSchema,
    mediaContentHash: QualifiedHashSchema,
    mediaId: IdentifierSchema,
    syncMapHash: ReferenceScoreMediaSyncMapHashSchema,
    syncMapId: IdentifierSchema,
  })
  .strict();

export const TakeVideoSchema = z
  .object({
    contractVersion: z.literal(TAKE_VIDEO_CONTRACT_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    id: IdentifierSchema,
    takeCoreHash: PracticeTakeCoreHashSchema,
    takeId: IdentifierSchema,
    videoContentHash: QualifiedHashSchema,
    videoMediaId: IdentifierSchema,
  })
  .strict();

export const TakeVideoAttachmentStateSchema = z
  .object({
    contractVersion: z.literal(TAKE_VIDEO_ATTACHMENT_STATE_CONTRACT_VERSION),
    selectedMapHash: TakeCaptureMediaSyncMapHashSchema.nullable(),
    selectedMapId: IdentifierSchema.nullable(),
    stateRevision: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    takeVideoId: IdentifierSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine(
    ({ selectedMapHash, selectedMapId }) => (selectedMapHash === null) === (selectedMapId === null),
    {
      message: 'Selected take-video map ID and hash must be present or absent together.',
      path: ['selectedMapId'],
    },
  );

export const ReferenceScoreMediaSyncMapSchema = z
  .object({
    anchors: z
      .array(
        z
          .object({
            mediaPtsMicroseconds: z.number().int().nonnegative(),
            scoreTick: MusicalTickSchema,
          })
          .strict(),
      )
      .min(2)
      .max(MAX_ANCHOR_COUNT),
    boundaryPolicy: z.literal('anchors-mapped-gap-interiors-unmapped'),
    contractVersion: z.literal(REFERENCE_SCORE_MEDIA_SYNC_MAP_CONTRACT_VERSION),
    documentRevision: DocumentRevisionIdentitySchema,
    expectedProjectionHash: PracticeExpectedEventsHashSchema,
    gapSegmentIndices: z
      .array(
        z
          .number()
          .int()
          .nonnegative()
          .max(MAX_ANCHOR_COUNT - 2),
      )
      .max(MAX_ANCHOR_COUNT - 1),
    historySequence: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    id: IdentifierSchema,
    mapHash: ReferenceScoreMediaSyncMapHashSchema,
    mediaContentHash: QualifiedHashSchema,
    mediaId: IdentifierSchema,
    normalizedTimelineId: IdentifierSchema,
    parentMap: z
      .object({
        id: IdentifierSchema,
        mapHash: ReferenceScoreMediaSyncMapHashSchema,
      })
      .strict()
      .nullable(),
    provenance: z.enum(['authored', 'rebased', 're-authored']),
  })
  .strict()
  .superRefine(
    ({ anchors, gapSegmentIndices, historySequence, id, parentMap, provenance }, context) => {
      if (
        !anchors.every(
          (anchor, index) =>
            index === 0 ||
            (anchor.scoreTick > (anchors[index - 1]?.scoreTick ?? -1) &&
              anchor.mediaPtsMicroseconds > (anchors[index - 1]?.mediaPtsMicroseconds ?? -1)),
        )
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Reference-map score ticks and media PTS must both be strictly increasing and unique.',
          path: ['anchors'],
        });
      }
      gapSegmentIndices.forEach((segmentIndex, index) => {
        if (
          segmentIndex >= anchors.length - 1 ||
          (index > 0 && segmentIndex <= (gapSegmentIndices[index - 1] ?? -1))
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Gap segment indices must be unique, increasing, and identify adjacent anchor pairs.',
            path: ['gapSegmentIndices', index],
          });
        }
      });
      const authored = provenance === 'authored';
      if (
        (authored && (parentMap !== null || historySequence !== 0)) ||
        (!authored && (parentMap === null || historySequence === 0))
      ) {
        context.addIssue({
          code: 'custom',
          message:
            'Authored maps begin history; revised maps must bind a parent and advance history.',
          path: ['parentMap'],
        });
      }
      if (parentMap?.id === id) {
        context.addIssue({
          code: 'custom',
          message: 'A reference sync map cannot name itself as its parent.',
          path: ['parentMap', 'id'],
        });
      }
    },
  );

export const TakeCaptureMediaSyncMapSchema = z
  .object({
    anchors: z
      .array(
        z
          .object({
            captureGeneration: z.number().int().nonnegative(),
            captureEpochId: IdentifierSchema,
            logicalAudioFrame: z.number().int().nonnegative(),
            mediaPtsMicroseconds: z.number().int().nonnegative(),
            runtimeGeneration: z.number().int().nonnegative(),
            transportGeneration: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(2)
      .max(MAX_ANCHOR_COUNT),
    boundaryPolicy: z.literal('generation-segments-only'),
    captureEpochIds: z
      .array(IdentifierSchema)
      .min(1)
      .max(MAX_CAPTURE_EPOCH_COUNT)
      .refine(
        (ids) => ids.every((id, index) => index === 0 || id > (ids[index - 1] ?? '')),
        'Capture epoch IDs must be unique and sorted.',
      ),
    contractVersion: z.literal(TAKE_CAPTURE_MEDIA_SYNC_MAP_CONTRACT_VERSION),
    id: IdentifierSchema,
    mapHash: TakeCaptureMediaSyncMapHashSchema,
    takeCoreHash: PracticeTakeCoreHashSchema,
    takeId: IdentifierSchema,
    timestampStrategyId: IdentifierSchema,
    uncertaintyMicroseconds: z.number().int().nonnegative(),
    videoContentHash: QualifiedHashSchema,
    videoMediaId: IdentifierSchema,
  })
  .strict()
  .refine(
    ({ anchors }) =>
      anchors.every(
        (anchor, index) =>
          index === 0 ||
          (anchor.logicalAudioFrame > (anchors[index - 1]?.logicalAudioFrame ?? -1) &&
            anchor.mediaPtsMicroseconds > (anchors[index - 1]?.mediaPtsMicroseconds ?? -1)),
      ),
    {
      message: 'Take-map audio frames and media PTS must both be strictly increasing.',
      path: ['anchors'],
    },
  );

const AssessmentObservedEventIdsSchema = z
  .array(IdentifierSchema)
  .min(1)
  .max(16)
  .refine((ids) => new Set(ids).size === ids.length, 'Observed event IDs must be unique.');

export const AssessmentTimingProvenanceSchema = z
  .object({
    clockMappingId: IdentifierSchema,
    confidence: ConfidenceSchema,
    expectedTick: MusicalTickSchema,
    observedLogicalFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    signedErrorMicroseconds: z.number().int().min(-MAX_SAFE_INTEGER).max(MAX_SAFE_INTEGER),
    source: z.enum(['exact-logical-frame', 'session-millisecond-estimate']),
    uncertaintyMicroseconds: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
  })
  .strict();

const AssessmentExpectedIdentitySchema = z
  .object({
    eventId: IdentifierSchema,
    noteId: IdentifierSchema.nullable(),
  })
  .strict();

export const PracticeAssessmentMatchSchema = z
  .object({
    confidence: ConfidenceSchema,
    expected: AssessmentExpectedIdentitySchema,
    id: IdentifierSchema,
    observedEventIds: AssessmentObservedEventIdsSchema,
    pitchOutcome: z.enum(['correct', 'substitution', 'partial']),
    timing: AssessmentTimingProvenanceSchema.nullable(),
  })
  .strict();

export const PracticeAssessmentUnmatchedExpectedSchema = z
  .object({
    confidence: ConfidenceSchema,
    expected: AssessmentExpectedIdentitySchema,
    id: IdentifierSchema,
    reason: z.enum(['missed', 'unassessable', 'outside-evidence']),
  })
  .strict();

export const PracticeAssessmentUnmatchedObservedSchema = z
  .object({
    confidence: ConfidenceSchema,
    id: IdentifierSchema,
    observedEventId: IdentifierSchema,
    reason: z.enum(['extra', 'outside-range', 'unmappable']),
  })
  .strict();

export const PracticeAssessmentAmbiguousCandidateSchema = z
  .object({
    confidence: ConfidenceSchema,
    expected: AssessmentExpectedIdentitySchema,
    observedEventIds: AssessmentObservedEventIdsSchema,
    timing: AssessmentTimingProvenanceSchema.nullable(),
  })
  .strict();

export const PracticeAssessmentAmbiguousSchema = z
  .object({
    candidates: z
      .array(PracticeAssessmentAmbiguousCandidateSchema)
      .min(2)
      .max(MAX_ASSESSMENT_AMBIGUOUS_CANDIDATE_COUNT),
    id: IdentifierSchema,
    reason: z.enum(['multiple-expected', 'multiple-observed', 'timing-overlap', 'low-confidence']),
  })
  .strict()
  .refine(
    ({ candidates }) =>
      candidates.every((candidate, index) =>
        candidates
          .slice(0, index)
          .every(
            (previous) =>
              previous.expected.eventId !== candidate.expected.eventId ||
              previous.expected.noteId !== candidate.expected.noteId ||
              previous.observedEventIds.length !== candidate.observedEventIds.length ||
              previous.observedEventIds.some(
                (observedId, observedIndex) =>
                  observedId !== candidate.observedEventIds[observedIndex],
              ),
          ),
      ),
    { message: 'Ambiguous assessment candidates must be distinct.', path: ['candidates'] },
  );

const CompletePracticeAssessmentRecordsSchema = z
  .object({
    ambiguous: z.array(PracticeAssessmentAmbiguousSchema).max(MAX_ASSESSMENT_RECORD_COUNT),
    matches: z.array(PracticeAssessmentMatchSchema).max(MAX_ASSESSMENT_RECORD_COUNT),
    mode: z.literal('complete'),
    unmatchedExpected: z
      .array(PracticeAssessmentUnmatchedExpectedSchema)
      .max(MAX_ASSESSMENT_RECORD_COUNT),
    unmatchedObserved: z
      .array(PracticeAssessmentUnmatchedObservedSchema)
      .max(MAX_ASSESSMENT_RECORD_COUNT),
  })
  .strict();

const PracticeAssessmentRecordsSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('legacy-summary') }).strict(),
  CompletePracticeAssessmentRecordsSchema,
]);

export const AssessmentAlignmentProvenanceSchema = z
  .object({
    algorithmId: IdentifierSchema,
    algorithmVersion: IdentifierSchema,
    clockMappingId: IdentifierSchema,
    maximumTimingUncertaintyMicroseconds: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    parametersHash: QualifiedHashSchema,
    timingToleranceMicroseconds: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
  })
  .strict();

export const AssessmentCorrectionProvenanceSchema = z
  .object({
    correctionCount: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    correctionPrefixHash: QualifiedHashSchema,
    evidenceSnapshotId: IdentifierSchema,
  })
  .strict();

export const PracticeAssessmentSchema = z
  .object({
    algorithmId: IdentifierSchema,
    algorithmVersion: IdentifierSchema,
    alignment: AssessmentAlignmentProvenanceSchema.nullable().default(null),
    alignmentProvenanceHash: QualifiedHashSchema,
    ambiguousCount: z.number().int().nonnegative(),
    assessmentHash: PracticeAssessmentHashSchema,
    confidence: ConfidenceSchema,
    contractVersion: z.literal(PRACTICE_ASSESSMENT_CONTRACT_VERSION),
    correctionProvenance: AssessmentCorrectionProvenanceSchema.nullable().default(null),
    createdAt: z.iso.datetime({ offset: true }),
    documentRevision: DocumentRevisionIdentitySchema,
    evidenceSnapshotHash: ObservedEvidenceSnapshotHashSchema,
    evidenceSnapshotId: IdentifierSchema,
    expectedProjectionHash: PracticeExpectedEventsHashSchema,
    id: IdentifierSchema,
    matchedCount: z.number().int().nonnegative(),
    records: PracticeAssessmentRecordsSchema.default({ mode: 'legacy-summary' }),
    takeCoreHash: PracticeTakeCoreHashSchema,
    takeId: IdentifierSchema,
    unmatchedExpectedCount: z.number().int().nonnegative(),
    unmatchedObservedCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (assessment.alignment !== null) {
      if (
        assessment.alignment.algorithmId !== assessment.algorithmId ||
        assessment.alignment.algorithmVersion !== assessment.algorithmVersion
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Alignment provenance must name the assessment algorithm and version.',
          path: ['alignment'],
        });
      }
    }
    if (
      assessment.correctionProvenance !== null &&
      assessment.correctionProvenance.evidenceSnapshotId !== assessment.evidenceSnapshotId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Correction provenance must bind the assessment evidence snapshot.',
        path: ['correctionProvenance', 'evidenceSnapshotId'],
      });
    }
    if (assessment.records.mode === 'legacy-summary') return;
    const { ambiguous, matches, unmatchedExpected, unmatchedObserved } = assessment.records;
    const outcomeRecordCount =
      ambiguous.length + matches.length + unmatchedExpected.length + unmatchedObserved.length;
    if (outcomeRecordCount > MAX_ASSESSMENT_RECORD_COUNT) {
      context.addIssue({
        code: 'custom',
        message: `Complete assessments may contain at most ${String(MAX_ASSESSMENT_RECORD_COUNT)} outcome records in total.`,
        path: ['records'],
      });
    }
    for (const [count, records, path] of [
      [assessment.matchedCount, matches, 'matches'],
      [assessment.ambiguousCount, ambiguous, 'ambiguous'],
      [assessment.unmatchedExpectedCount, unmatchedExpected, 'unmatchedExpected'],
      [assessment.unmatchedObservedCount, unmatchedObserved, 'unmatchedObserved'],
    ] as const) {
      if (count !== records.length) {
        context.addIssue({
          code: 'custom',
          message: 'Assessment summary count must equal its immutable record count.',
          path: ['records', path],
        });
      }
    }
    if (assessment.alignment === null || assessment.correctionProvenance === null) {
      context.addIssue({
        code: 'custom',
        message: 'Complete assessment records require alignment and correction provenance.',
        path: ['records'],
      });
    }
    if (
      !AssessmentAlignmentProvenanceHashSchema.safeParse(assessment.alignmentProvenanceHash).success
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Complete assessment alignment provenance must use the registered v1 qualified identity.',
        path: ['alignmentProvenanceHash'],
      });
    }
    if (assessment.alignment !== null) {
      const alignment = assessment.alignment;
      const timingRecords = [
        ...matches.flatMap(({ timing }) => (timing === null ? [] : [timing])),
        ...ambiguous.flatMap(({ candidates }) =>
          candidates.flatMap(({ timing }) => (timing === null ? [] : [timing])),
        ),
      ];
      timingRecords.forEach((timing, index) => {
        if (timing.clockMappingId !== alignment.clockMappingId) {
          context.addIssue({
            code: 'custom',
            message: 'Assessment timing must use the bound alignment clock mapping.',
            path: ['records', 'timing', index, 'clockMappingId'],
          });
        }
        if (timing.uncertaintyMicroseconds > alignment.maximumTimingUncertaintyMicroseconds) {
          context.addIssue({
            code: 'custom',
            message: 'Assessment timing uncertainty exceeds its declared alignment maximum.',
            path: ['records', 'timing', index, 'uncertaintyMicroseconds'],
          });
        }
      });
    }
    const recordIds = [
      ...matches.map(({ id }) => id),
      ...ambiguous.map(({ id }) => id),
      ...unmatchedExpected.map(({ id }) => id),
      ...unmatchedObserved.map(({ id }) => id),
    ];
    if (new Set(recordIds).size !== recordIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Assessment record IDs must be unique across every outcome.',
        path: ['records'],
      });
    }
    const expectedOutcomeGroups = [
      ...matches.map(({ expected }) => [expected]),
      ...unmatchedExpected.map(({ expected }) => [expected]),
      ...ambiguous.map(({ candidates }) => candidates.map(({ expected }) => expected)),
    ];
    const expectedSeen = new Map<string, Set<string | null>>();
    expectedOutcomeGroups.forEach((group, groupIndex) => {
      const groupIdentities = new Map<string, Set<string | null>>();
      group.forEach(({ eventId, noteId }) => {
        const notes = groupIdentities.get(eventId) ?? new Set<string | null>();
        notes.add(noteId);
        groupIdentities.set(eventId, notes);
      });
      groupIdentities.forEach((noteIds, eventId) => {
        const seenNotes = expectedSeen.get(eventId);
        if (seenNotes !== undefined && [...noteIds].some((noteId) => seenNotes.has(noteId))) {
          context.addIssue({
            code: 'custom',
            message:
              'An expected identity cannot appear in more than one terminal or ambiguous outcome.',
            path: ['records', 'expectedOutcomeGroups', groupIndex],
          });
        }
        const nextSeen = seenNotes ?? new Set<string | null>();
        noteIds.forEach((noteId) => nextSeen.add(noteId));
        expectedSeen.set(eventId, nextSeen);
      });
    });

    const observedOutcomeGroups = [
      ...matches.map(({ observedEventIds }) => observedEventIds),
      ...unmatchedObserved.map(({ observedEventId }) => [observedEventId]),
      ...ambiguous.map(({ candidates }) =>
        candidates.flatMap(({ observedEventIds }) => observedEventIds),
      ),
    ];
    const observedSeen = new Set<string>();
    observedOutcomeGroups.forEach((group, groupIndex) => {
      const groupIds = new Set(group);
      if ([...groupIds].some((observedId) => observedSeen.has(observedId))) {
        context.addIssue({
          code: 'custom',
          message:
            'An observed identity cannot appear in more than one terminal or ambiguous outcome.',
          path: ['records', 'observedOutcomeGroups', groupIndex],
        });
      }
      groupIds.forEach((observedId) => observedSeen.add(observedId));
    });
  });

export type ObservedEvidenceSnapshot = z.infer<typeof ObservedEvidenceSnapshotSchema>;
export type CaptureClockAnchor = z.infer<typeof CaptureClockAnchorSchema>;
export type CaptureDiscontinuity = z.infer<typeof CaptureDiscontinuitySchema>;
export type TakeCalibrationProvenance = z.infer<typeof TakeCalibrationProvenanceSchema>;
export type TakeMicrophoneRecordingProvenance = z.infer<
  typeof TakeMicrophoneRecordingProvenanceSchema
>;
export type TakeVideoCaptureProvenance = z.infer<typeof TakeVideoCaptureProvenanceSchema>;
export type PracticeTake = z.infer<typeof PracticeTakeSchema>;
export type MediaIdentity = z.infer<typeof MediaIdentitySchema>;
export type MediaAvailabilityState = z.infer<typeof MediaAvailabilityStateSchema>;
export type ReferenceVideo = z.infer<typeof ReferenceVideoSchema>;
export type TakeVideo = z.infer<typeof TakeVideoSchema>;
export type TakeVideoAttachmentState = z.infer<typeof TakeVideoAttachmentStateSchema>;
export type ReferenceScoreMediaSyncMap = z.infer<typeof ReferenceScoreMediaSyncMapSchema>;
export type TakeCaptureMediaSyncMap = z.infer<typeof TakeCaptureMediaSyncMapSchema>;
export type PracticeAssessment = z.infer<typeof PracticeAssessmentSchema>;
export type PracticeAssessmentMatch = z.infer<typeof PracticeAssessmentMatchSchema>;
export type PracticeAssessmentUnmatchedExpected = z.infer<
  typeof PracticeAssessmentUnmatchedExpectedSchema
>;
export type PracticeAssessmentUnmatchedObserved = z.infer<
  typeof PracticeAssessmentUnmatchedObservedSchema
>;
export type PracticeAssessmentAmbiguous = z.infer<typeof PracticeAssessmentAmbiguousSchema>;
