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
const MAX_CAPTURE_EPOCH_COUNT = 2_000;
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
    runtimeGeneration: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    scheduledAudioFrame: z.number().int().nonnegative().max(MAX_SAFE_INTEGER),
    scoreStartTick: MusicalTickSchema,
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
    captureEpochs: z.array(CaptureEpochSchema).min(1).max(MAX_CAPTURE_EPOCH_COUNT),
    contractVersion: z.literal(PRACTICE_TAKE_CONTRACT_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    documentRevision: DocumentRevisionIdentitySchema,
    evidenceSnapshotHash: ObservedEvidenceSnapshotHashSchema,
    evidenceSnapshotId: IdentifierSchema,
    expectedProjectionHash: PracticeExpectedEventsHashSchema,
    id: IdentifierSchema,
    countInConfigurationHash: QualifiedHashSchema.nullable(),
    loopPassPolicy: LoopPassPolicySchema,
    metronomeEnabled: z.boolean(),
    microphoneMediaHash: QualifiedHashSchema.nullable(),
    microphoneMediaId: IdentifierSchema.nullable(),
    practiceSpeed: z
      .object({ denominator: z.number().int().positive(), numerator: z.number().int().positive() })
      .strict(),
    range: MusicalRangeSchema,
    referenceConfigurationHash: QualifiedHashSchema.nullable(),
    sampleRate: z.number().int().positive(),
    status: z.enum(['finalized', 'finalized-with-warnings', 'failed-preserved']),
    takeCoreHash: PracticeTakeCoreHashSchema,
    warnings: z.array(z.string().trim().min(1).max(MAX_TEXT_LENGTH)).max(MAX_WARNING_COUNT),
  })
  .strict()
  .superRefine(({ captureEpochs, microphoneMediaHash, microphoneMediaId }, context) => {
    if ((microphoneMediaHash === null) !== (microphoneMediaId === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Microphone media ID and hash must be present or absent together.',
        path: ['microphoneMediaId'],
      });
    }
    const epochIds = new Set<string>();
    captureEpochs.forEach((epoch, index) => {
      if (epochIds.has(epoch.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Capture epoch IDs must be unique.',
          path: ['captureEpochs', index, 'id'],
        });
      }
      epochIds.add(epoch.id);
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
    contractVersion: z.literal(REFERENCE_SCORE_MEDIA_SYNC_MAP_CONTRACT_VERSION),
    documentRevision: DocumentRevisionIdentitySchema,
    id: IdentifierSchema,
    mapHash: ReferenceScoreMediaSyncMapHashSchema,
    mediaContentHash: QualifiedHashSchema,
    mediaId: IdentifierSchema,
    provenance: z.enum(['authored', 'rebased', 're-authored']),
  })
  .strict()
  .refine(
    ({ anchors }) =>
      anchors.every(
        (anchor, index) =>
          index === 0 ||
          (anchor.scoreTick > (anchors[index - 1]?.scoreTick ?? -1) &&
            anchor.mediaPtsMicroseconds > (anchors[index - 1]?.mediaPtsMicroseconds ?? -1)),
      ),
    {
      message:
        'Reference-map score ticks and media PTS must both be strictly increasing and unique.',
      path: ['anchors'],
    },
  );

export const TakeCaptureMediaSyncMapSchema = z
  .object({
    anchors: z
      .array(
        z
          .object({
            captureGeneration: z.number().int().nonnegative(),
            logicalAudioFrame: z.number().int().nonnegative(),
            mediaPtsMicroseconds: z.number().int().nonnegative(),
            runtimeGeneration: z.number().int().nonnegative(),
            transportGeneration: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(2)
      .max(MAX_ANCHOR_COUNT),
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

export const PracticeAssessmentSchema = z
  .object({
    algorithmId: IdentifierSchema,
    algorithmVersion: IdentifierSchema,
    alignmentProvenanceHash: QualifiedHashSchema,
    ambiguousCount: z.number().int().nonnegative(),
    assessmentHash: PracticeAssessmentHashSchema,
    confidence: ConfidenceSchema,
    contractVersion: z.literal(PRACTICE_ASSESSMENT_CONTRACT_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    documentRevision: DocumentRevisionIdentitySchema,
    evidenceSnapshotHash: ObservedEvidenceSnapshotHashSchema,
    evidenceSnapshotId: IdentifierSchema,
    expectedProjectionHash: PracticeExpectedEventsHashSchema,
    id: IdentifierSchema,
    matchedCount: z.number().int().nonnegative(),
    takeCoreHash: PracticeTakeCoreHashSchema,
    takeId: IdentifierSchema,
    unmatchedExpectedCount: z.number().int().nonnegative(),
    unmatchedObservedCount: z.number().int().nonnegative(),
  })
  .strict();

export type ObservedEvidenceSnapshot = z.infer<typeof ObservedEvidenceSnapshotSchema>;
export type PracticeTake = z.infer<typeof PracticeTakeSchema>;
export type MediaIdentity = z.infer<typeof MediaIdentitySchema>;
export type MediaAvailabilityState = z.infer<typeof MediaAvailabilityStateSchema>;
export type ReferenceVideo = z.infer<typeof ReferenceVideoSchema>;
export type TakeVideo = z.infer<typeof TakeVideoSchema>;
export type TakeVideoAttachmentState = z.infer<typeof TakeVideoAttachmentStateSchema>;
export type ReferenceScoreMediaSyncMap = z.infer<typeof ReferenceScoreMediaSyncMapSchema>;
export type TakeCaptureMediaSyncMap = z.infer<typeof TakeCaptureMediaSyncMapSchema>;
export type PracticeAssessment = z.infer<typeof PracticeAssessmentSchema>;
