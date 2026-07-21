import { z } from 'zod';

import { assertCanonicalJsonDataDomain } from '../shared/canonical-json';
import { IdentifierSchema } from '../shared/contracts/common';
import {
  GuitarEventSchema,
  GuitarNoteSchema,
  KeyMapSchema,
  LoopPresetSchema,
  MeterMapSchema,
  MusicalDurationSchema,
  MusicalTickSchema,
  PracticeDocumentSchema,
  PracticeDocumentContentHashSchema,
  PracticeExpectedEventsHashSchema,
  PracticeGuitarConfigurationSchema,
  PracticeTrackSchema,
  PracticeVoiceEventSchema,
  PracticeVoiceSchema,
  TempoMapSchema,
  WrittenPitchSchema,
  type PracticeDocument,
  type WrittenPitch,
} from '../shared/contracts/practice';
import { hashExpectedEvents, hashPracticeDocumentContent } from '../shared/practice-identity';
import { createPracticeNativeEnvelope } from '../shared/practice-native';

const MAX_TRANSACTION_COMMANDS = 512;
const MAX_BATCH_EVENT_IDS = 2_000;
const MAX_BATCH_NOTE_IDS = 4_000;
const MAX_TRANSACTION_EVENT_PAYLOADS = 2_000;
const MAX_TRANSACTION_NOTE_PAYLOADS = 4_000;

const StrictCommandBaseSchema = z.object({}).strict();

const TargetVoiceSchema = z
  .object({
    trackId: IdentifierSchema,
    voiceId: IdentifierSchema,
  })
  .strict();

const TargetEventSchema = TargetVoiceSchema.extend({ eventId: IdentifierSchema }).strict();

const TargetNoteSchema = TargetEventSchema.extend({ noteId: IdentifierSchema }).strict();

const UniqueIdentifierListSchema = (maximum: number) =>
  z
    .array(IdentifierSchema)
    .min(1)
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, 'IDs must be unique.');

const InsertEventCommandSchema = StrictCommandBaseSchema.extend({
  event: PracticeVoiceEventSchema,
  kind: z.literal('insert-event'),
  target: TargetVoiceSchema,
}).strict();

const ReplaceEventCommandSchema = StrictCommandBaseSchema.extend({
  event: PracticeVoiceEventSchema,
  kind: z.literal('replace-event'),
  target: TargetEventSchema,
}).strict();

const DeleteEventCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('delete-event'),
  target: TargetEventSchema,
}).strict();

const MoveEventCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('move-event'),
  target: TargetEventSchema,
  tick: MusicalTickSchema,
}).strict();

const SetEventDurationCommandSchema = StrictCommandBaseSchema.extend({
  durationTicks: MusicalDurationSchema,
  kind: z.literal('set-event-duration'),
  target: TargetEventSchema,
}).strict();

const SetNotePositionCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('set-note-position'),
  position: GuitarNoteSchema.shape.position,
  target: TargetNoteSchema,
  writtenPitch: WrittenPitchSchema,
}).strict();

const SetNoteSoundingDurationCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('set-note-sounding-duration'),
  soundingDurationTicks: MusicalDurationSchema,
  target: TargetNoteSchema,
}).strict();

const SetNoteSemanticsCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('set-note-semantics'),
  semantics: GuitarNoteSchema.shape.semantics,
  target: TargetNoteSchema,
}).strict();

const SetEventExpressionCommandSchema = StrictCommandBaseSchema.extend({
  articulations: GuitarEventSchema.shape.articulations.optional(),
  dynamic: GuitarEventSchema.shape.dynamic.nullable().optional(),
  kind: z.literal('set-event-expression'),
  target: TargetEventSchema,
})
  .strict()
  .refine(({ articulations, dynamic }) => articulations !== undefined || dynamic !== undefined, {
    message: 'Expression command must change articulations, dynamics, or both.',
  });

const AddTrackCommandSchema = StrictCommandBaseSchema.extend({
  insertIndex: z.number().int().nonnegative().max(16).optional(),
  kind: z.literal('add-track'),
  track: PracticeTrackSchema,
}).strict();

const RemoveTrackCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('remove-track'),
  trackId: IdentifierSchema,
}).strict();

const RenameTrackCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('rename-track'),
  name: z.string().trim().min(1).max(120),
  trackId: IdentifierSchema,
}).strict();

const AddVoiceCommandSchema = StrictCommandBaseSchema.extend({
  insertIndex: z.number().int().nonnegative().max(2).optional(),
  kind: z.literal('add-voice'),
  trackId: IdentifierSchema,
  voice: PracticeVoiceSchema,
}).strict();

const RemoveVoiceCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('remove-voice'),
  trackId: IdentifierSchema,
  voiceId: IdentifierSchema,
}).strict();

const RenameVoiceCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('rename-voice'),
  name: z.string().trim().min(1).max(120).nullable(),
  trackId: IdentifierSchema,
  voiceId: IdentifierSchema,
}).strict();

const SetMetadataCommandSchema = StrictCommandBaseSchema.extend({
  artist: z.string().trim().max(120).nullable().optional(),
  kind: z.literal('set-metadata'),
  title: z.string().trim().min(1).max(120).optional(),
})
  .strict()
  .refine(({ artist, title }) => artist !== undefined || title !== undefined, {
    message: 'Metadata command must change title, artist, or both.',
  });

const SetTempoMapCommandSchema = StrictCommandBaseSchema.extend({
  entries: TempoMapSchema,
  kind: z.literal('set-tempo-map'),
}).strict();

const SetMeterMapCommandSchema = StrictCommandBaseSchema.extend({
  entries: MeterMapSchema,
  kind: z.literal('set-meter-map'),
}).strict();

const SetKeyMapCommandSchema = StrictCommandBaseSchema.extend({
  entries: KeyMapSchema,
  kind: z.literal('set-key-map'),
}).strict();

const SetGuitarConfigurationCommandSchema = StrictCommandBaseSchema.extend({
  guitar: PracticeGuitarConfigurationSchema,
  kind: z.literal('set-guitar-configuration'),
}).strict();

const UpsertLoopPresetCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('upsert-loop-preset'),
  preset: LoopPresetSchema,
}).strict();

const RemoveLoopPresetCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('remove-loop-preset'),
  presetId: IdentifierSchema,
}).strict();

const SetDocumentDurationCommandSchema = StrictCommandBaseSchema.extend({
  durationTicks: MusicalDurationSchema,
  kind: z.literal('set-document-duration'),
}).strict();

const PasteEventsCommandSchema = StrictCommandBaseSchema.extend({
  events: z.array(PracticeVoiceEventSchema).min(1).max(MAX_BATCH_EVENT_IDS),
  kind: z.literal('paste-events'),
  sourceStartTick: MusicalTickSchema,
  target: TargetVoiceSchema,
  targetStartTick: MusicalTickSchema,
}).strict();

const TransposeNotesCommandSchema = StrictCommandBaseSchema.extend({
  kind: z.literal('transpose-notes'),
  noteIds: UniqueIdentifierListSchema(MAX_BATCH_NOTE_IDS),
  semitones: z
    .number()
    .int()
    .min(-24)
    .max(24)
    .refine((value) => value !== 0, {
      message: 'Transpose interval must be non-zero.',
    }),
}).strict();

const QuantizeEventsCommandSchema = StrictCommandBaseSchema.extend({
  eventIds: UniqueIdentifierListSchema(MAX_BATCH_EVENT_IDS),
  gridTicks: MusicalDurationSchema,
  kind: z.literal('quantize-events'),
  mode: z.enum(['ceil', 'floor', 'nearest']),
}).strict();

export const EditorCommandSchema = z.discriminatedUnion('kind', [
  InsertEventCommandSchema,
  ReplaceEventCommandSchema,
  DeleteEventCommandSchema,
  MoveEventCommandSchema,
  SetEventDurationCommandSchema,
  SetNotePositionCommandSchema,
  SetNoteSoundingDurationCommandSchema,
  SetNoteSemanticsCommandSchema,
  SetEventExpressionCommandSchema,
  AddTrackCommandSchema,
  RemoveTrackCommandSchema,
  RenameTrackCommandSchema,
  AddVoiceCommandSchema,
  RemoveVoiceCommandSchema,
  RenameVoiceCommandSchema,
  SetMetadataCommandSchema,
  SetTempoMapCommandSchema,
  SetMeterMapCommandSchema,
  SetKeyMapCommandSchema,
  SetGuitarConfigurationCommandSchema,
  UpsertLoopPresetCommandSchema,
  RemoveLoopPresetCommandSchema,
  SetDocumentDurationCommandSchema,
  PasteEventsCommandSchema,
  TransposeNotesCommandSchema,
  QuantizeEventsCommandSchema,
]);

export type EditorCommand = z.infer<typeof EditorCommandSchema>;

export const EditorRevisionAdvanceSchema = z
  .object({
    baseRevisionId: IdentifierSchema,
    revisionId: IdentifierSchema,
    revisionNumber: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type EditorRevisionAdvance = z.infer<typeof EditorRevisionAdvanceSchema>;

export const EditorTransactionSchema = EditorRevisionAdvanceSchema.extend({
  commands: z.array(EditorCommandSchema).min(1).max(MAX_TRANSACTION_COMMANDS),
}).strict();

export type EditorTransaction = z.infer<typeof EditorTransactionSchema>;

export type EditorIssueCode =
  | 'command-target-not-found'
  | 'command-target-wrong-kind'
  | 'derived-value-invalid'
  | 'final-document-invalid'
  | 'input-document-invalid'
  | 'interaction-invalid'
  | 'resource-limit'
  | 'revision-conflict'
  | 'stale-base-revision'
  | 'transaction-invalid';

export type EditorIssue = Readonly<{
  code: EditorIssueCode;
  commandIndex: number | null;
  message: string;
  path: readonly (number | string)[];
}>;

export type EditorTransactionResult =
  | Readonly<{ document: PracticeDocument; kind: 'accepted' }>
  | Readonly<{ issues: readonly EditorIssue[]; kind: 'rejected' }>;

class EditorCommandFailure extends Error {
  readonly code: EditorIssueCode;
  readonly path: readonly (number | string)[];

  constructor(code: EditorIssueCode, message: string, path: readonly (number | string)[] = []) {
    super(message);
    this.name = 'EditorCommandFailure';
    this.code = code;
    this.path = path;
  }
}

type MutableDocument = PracticeDocument;
type MutableTrack = MutableDocument['tracks'][number];
type MutableVoice = MutableTrack['voices'][number];
type MutableEvent = MutableVoice['events'][number];
type MutableGuitarEvent = Extract<MutableEvent, { kind: 'guitar-event' }>;
type MutableGuitarNote = MutableGuitarEvent['notes'][number];

const commandFailure = (
  code: EditorIssueCode,
  message: string,
  path: readonly (number | string)[] = [],
): never => {
  throw new EditorCommandFailure(code, message, path);
};

const findTrack = (document: MutableDocument, trackId: string): MutableTrack => {
  const track = document.tracks.find(({ id }) => id === trackId);
  return (
    track ??
    commandFailure('command-target-not-found', `Track ${trackId} does not exist.`, ['trackId'])
  );
};

const findVoice = (document: MutableDocument, target: z.infer<typeof TargetVoiceSchema>) => {
  const track = findTrack(document, target.trackId);
  const voice = track.voices.find(({ id }) => id === target.voiceId);
  if (voice === undefined) {
    return commandFailure(
      'command-target-not-found',
      `Voice ${target.voiceId} does not exist in track ${target.trackId}.`,
      ['target', 'voiceId'],
    );
  }
  return { track, voice };
};

const findEvent = (document: MutableDocument, target: z.infer<typeof TargetEventSchema>) => {
  const { track, voice } = findVoice(document, target);
  const eventIndex = voice.events.findIndex(({ id }) => id === target.eventId);
  const event = voice.events[eventIndex];
  if (event === undefined) {
    return commandFailure(
      'command-target-not-found',
      `Event ${target.eventId} does not exist in voice ${target.voiceId}.`,
      ['target', 'eventId'],
    );
  }
  return { event, eventIndex, track, voice };
};

const findGuitarEvent = (document: MutableDocument, target: z.infer<typeof TargetEventSchema>) => {
  const located = findEvent(document, target);
  if (located.event.kind !== 'guitar-event') {
    return commandFailure(
      'command-target-wrong-kind',
      `Event ${target.eventId} is not a guitar event.`,
      ['target', 'eventId'],
    );
  }
  return { ...located, event: located.event };
};

const findNote = (document: MutableDocument, target: z.infer<typeof TargetNoteSchema>) => {
  const located = findGuitarEvent(document, target);
  const note = located.event.notes.find(({ id }) => id === target.noteId);
  if (note === undefined) {
    return commandFailure(
      'command-target-not-found',
      `Note ${target.noteId} does not exist in event ${target.eventId}.`,
      ['target', 'noteId'],
    );
  }
  return { ...located, note };
};

const findEventById = (document: MutableDocument, eventId: string) => {
  for (const track of document.tracks) {
    for (const voice of track.voices) {
      const event = voice.events.find((candidate) => candidate.id === eventId);
      if (event !== undefined) return { event, voice };
    }
  }
  return commandFailure('command-target-not-found', `Event ${eventId} does not exist.`, [
    'eventIds',
  ]);
};

const findNoteById = (document: MutableDocument, noteId: string): MutableGuitarNote => {
  for (const track of document.tracks) {
    for (const voice of track.voices) {
      for (const event of voice.events) {
        if (event.kind !== 'guitar-event') continue;
        const note = event.notes.find((candidate) => candidate.id === noteId);
        if (note !== undefined) return note;
      }
    }
  }
  return commandFailure('command-target-not-found', `Note ${noteId} does not exist.`, ['noteIds']);
};

const sortVoiceEvents = (voice: MutableVoice): void => {
  voice.events.sort(
    (left, right) =>
      left.tick - right.tick || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
};

const insertAt = <T>(values: T[], value: T, index: number | undefined): void => {
  if (index !== undefined && index > values.length) {
    return commandFailure(
      'derived-value-invalid',
      `Insert index ${String(index)} exceeds collection length ${String(values.length)}.`,
      ['insertIndex'],
    );
  }
  if (index === undefined || index === values.length) values.push(value);
  else values.splice(index, 0, value);
};

const canonicalWrittenPitch = (midi: number): WrittenPitch => {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    return commandFailure(
      'derived-value-invalid',
      `Derived MIDI pitch ${String(midi)} lies outside 0..127.`,
    );
  }
  // Transpose operates on the canonical guitar position and respells deterministically with
  // naturals/sharps. Enharmonic authoring choices require an explicit later spelling command.
  const spellings = [
    { accidental: 0, step: 'C' },
    { accidental: 1, step: 'C' },
    { accidental: 0, step: 'D' },
    { accidental: 1, step: 'D' },
    { accidental: 0, step: 'E' },
    { accidental: 0, step: 'F' },
    { accidental: 1, step: 'F' },
    { accidental: 0, step: 'G' },
    { accidental: 1, step: 'G' },
    { accidental: 0, step: 'A' },
    { accidental: 1, step: 'A' },
    { accidental: 0, step: 'B' },
  ] as const;
  const spelling = spellings[midi % 12];
  if (spelling === undefined) {
    return commandFailure('derived-value-invalid', 'Could not spell derived MIDI pitch.');
  }
  return WrittenPitchSchema.parse({ ...spelling, octave: Math.floor(midi / 12) - 1 });
};

const quantizeTick = (
  tick: number,
  gridTicks: number,
  mode: 'ceil' | 'floor' | 'nearest',
): number => {
  const quotient = tick / gridTicks;
  // Nearest-grid ties advance to the later grid line; this is stable for non-negative ticks.
  const gridIndex =
    mode === 'floor'
      ? Math.floor(quotient)
      : mode === 'ceil'
        ? Math.ceil(quotient)
        : Math.round(quotient);
  return gridIndex * gridTicks;
};

const applyCommand = (document: MutableDocument, command: EditorCommand): void => {
  switch (command.kind) {
    case 'insert-event': {
      const { voice } = findVoice(document, command.target);
      voice.events.push(structuredClone(command.event));
      sortVoiceEvents(voice);
      return;
    }
    case 'replace-event': {
      const { eventIndex, voice } = findEvent(document, command.target);
      voice.events[eventIndex] = structuredClone(command.event);
      sortVoiceEvents(voice);
      return;
    }
    case 'delete-event': {
      const { eventIndex, voice } = findEvent(document, command.target);
      voice.events.splice(eventIndex, 1);
      return;
    }
    case 'move-event': {
      const { event, voice } = findEvent(document, command.target);
      event.tick = command.tick;
      sortVoiceEvents(voice);
      return;
    }
    case 'set-event-duration': {
      const { event } = findEvent(document, command.target);
      if (event.kind === 'rest') event.durationTicks = command.durationTicks;
      else event.notatedDurationTicks = command.durationTicks;
      return;
    }
    case 'set-note-position': {
      const { note } = findNote(document, command.target);
      note.position = structuredClone(command.position);
      note.writtenPitch = structuredClone(command.writtenPitch);
      return;
    }
    case 'set-note-sounding-duration': {
      const { note } = findNote(document, command.target);
      note.soundingDurationTicks = command.soundingDurationTicks;
      return;
    }
    case 'set-note-semantics': {
      const { note } = findNote(document, command.target);
      note.semantics = structuredClone(command.semantics);
      return;
    }
    case 'set-event-expression': {
      const { event } = findGuitarEvent(document, command.target);
      if (command.articulations !== undefined) {
        event.articulations = structuredClone(command.articulations);
      }
      if (command.dynamic !== undefined) {
        if (command.dynamic === null) delete event.dynamic;
        else event.dynamic = structuredClone(command.dynamic);
      }
      return;
    }
    case 'add-track': {
      insertAt(document.tracks, structuredClone(command.track), command.insertIndex);
      return;
    }
    case 'remove-track': {
      const index = document.tracks.findIndex(({ id }) => id === command.trackId);
      if (index < 0) {
        return commandFailure(
          'command-target-not-found',
          `Track ${command.trackId} does not exist.`,
          ['trackId'],
        );
      }
      document.tracks.splice(index, 1);
      return;
    }
    case 'rename-track': {
      findTrack(document, command.trackId).name = command.name;
      return;
    }
    case 'add-voice': {
      const track = findTrack(document, command.trackId);
      insertAt(track.voices, structuredClone(command.voice), command.insertIndex);
      return;
    }
    case 'remove-voice': {
      const track = findTrack(document, command.trackId);
      const index = track.voices.findIndex(({ id }) => id === command.voiceId);
      if (index < 0) {
        return commandFailure(
          'command-target-not-found',
          `Voice ${command.voiceId} does not exist in track ${command.trackId}.`,
          ['voiceId'],
        );
      }
      track.voices.splice(index, 1);
      return;
    }
    case 'rename-voice': {
      const { voice } = findVoice(document, command);
      if (command.name === null) delete voice.name;
      else voice.name = command.name;
      return;
    }
    case 'set-metadata': {
      if (command.title !== undefined) document.metadata.title = command.title;
      if (command.artist !== undefined) {
        if (command.artist === null) delete document.metadata.artist;
        else document.metadata.artist = command.artist;
      }
      return;
    }
    case 'set-tempo-map':
      document.tempoMap = structuredClone(command.entries);
      return;
    case 'set-meter-map':
      document.meterMap = structuredClone(command.entries);
      return;
    case 'set-key-map':
      document.keyMap = structuredClone(command.entries);
      return;
    case 'set-guitar-configuration':
      document.guitar = structuredClone(command.guitar);
      return;
    case 'upsert-loop-preset': {
      const index = document.loopPresets.findIndex(({ id }) => id === command.preset.id);
      if (index < 0) document.loopPresets.push(structuredClone(command.preset));
      else document.loopPresets[index] = structuredClone(command.preset);
      return;
    }
    case 'remove-loop-preset': {
      const index = document.loopPresets.findIndex(({ id }) => id === command.presetId);
      if (index < 0) {
        return commandFailure(
          'command-target-not-found',
          `Loop preset ${command.presetId} does not exist.`,
          ['presetId'],
        );
      }
      document.loopPresets.splice(index, 1);
      return;
    }
    case 'set-document-duration':
      document.durationTicks = command.durationTicks;
      return;
    case 'paste-events': {
      const { voice } = findVoice(document, command.target);
      const offset = command.targetStartTick - command.sourceStartTick;
      const pasted = structuredClone(command.events);
      pasted.forEach((event, index) => {
        const tick = event.tick + offset;
        if (!Number.isSafeInteger(tick) || tick < 0) {
          return commandFailure(
            'derived-value-invalid',
            'Paste would place an event before tick zero or beyond safe integer precision.',
            ['events', index, 'tick'],
          );
        }
        event.tick = MusicalTickSchema.parse(tick);
      });
      voice.events.push(...pasted);
      sortVoiceEvents(voice);
      return;
    }
    case 'transpose-notes': {
      const notes = command.noteIds.map((noteId) => findNoteById(document, noteId));
      notes.forEach((note, index) => {
        const tabFret = note.position.tabFret + command.semitones;
        if (!Number.isSafeInteger(tabFret) || tabFret < 0) {
          return commandFailure(
            'derived-value-invalid',
            'Transpose would move a note below the open string.',
            ['noteIds', index],
          );
        }
        const tuning = document.guitar.tuning[note.position.stringNumber - 1];
        if (tuning === undefined) {
          return commandFailure(
            'derived-value-invalid',
            'Transpose target string is absent from the guitar configuration.',
            ['noteIds', index],
          );
        }
        const midi = tuning.openMidi + document.guitar.capoFret + tabFret;
        note.position.tabFret = tabFret;
        note.writtenPitch = canonicalWrittenPitch(midi);
      });
      return;
    }
    case 'quantize-events': {
      const located = command.eventIds.map((eventId) => findEventById(document, eventId));
      const touchedVoices = new Set<MutableVoice>();
      located.forEach(({ event, voice }, index) => {
        const tick = quantizeTick(event.tick, command.gridTicks, command.mode);
        if (!Number.isSafeInteger(tick) || tick < 0) {
          return commandFailure(
            'derived-value-invalid',
            'Quantized tick lies outside safe non-negative integer time.',
            ['eventIds', index],
          );
        }
        event.tick = MusicalTickSchema.parse(tick);
        touchedVoices.add(voice);
      });
      touchedVoices.forEach(sortVoiceEvents);
      return;
    }
  }
};

const issueFromZod = (
  issue: z.core.$ZodIssue,
  code: 'final-document-invalid' | 'input-document-invalid' | 'transaction-invalid',
  commandIndex: number | null,
): EditorIssue => ({
  code:
    issue.code === 'too_big' || issue.message.toLowerCase().includes('at most')
      ? 'resource-limit'
      : code,
  commandIndex,
  message: issue.message,
  path: Object.freeze(
    issue.path.map((segment) =>
      typeof segment === 'symbol' ? (segment.description ?? segment.toString()) : segment,
    ),
  ),
});

const rejected = (issues: readonly EditorIssue[]): EditorTransactionResult => ({
  issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
  kind: 'rejected',
});

const unknownMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown editor input failure.';

const recordValue = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

function transactionPayloadCounts(transactionInput: unknown): Readonly<{
  events: number;
  notes: number;
}> {
  const transaction = recordValue(transactionInput);
  const commands =
    transaction === null || !Array.isArray(transaction.commands) ? [] : transaction.commands;
  let events = 0;
  let notes = 0;
  const countEvent = (eventInput: unknown): void => {
    const event = recordValue(eventInput);
    if (event === null) return;
    events += 1;
    if (Array.isArray(event.notes)) notes += event.notes.length;
  };
  const countVoice = (voiceInput: unknown): void => {
    const voice = recordValue(voiceInput);
    if (voice !== null && Array.isArray(voice.events)) voice.events.forEach(countEvent);
  };
  for (const commandInput of commands) {
    const command = recordValue(commandInput);
    if (command === null) continue;
    if (command.event !== undefined) countEvent(command.event);
    if (Array.isArray(command.events)) command.events.forEach(countEvent);
    if (command.voice !== undefined) countVoice(command.voice);
    const track = recordValue(command.track);
    if (track !== null && Array.isArray(track.voices)) track.voices.forEach(countVoice);
  }
  return { events, notes };
}

export async function executeEditorTransaction(
  documentInput: unknown,
  transactionInput: unknown,
): Promise<EditorTransactionResult> {
  try {
    assertCanonicalJsonDataDomain(documentInput);
  } catch (error) {
    return rejected([
      {
        code: 'input-document-invalid',
        commandIndex: null,
        message: unknownMessage(error),
        path: [],
      },
    ]);
  }
  const documentResult = PracticeDocumentSchema.safeParse(documentInput);
  if (!documentResult.success) {
    return rejected(
      documentResult.error.issues.map((issue) =>
        issueFromZod(issue, 'input-document-invalid', null),
      ),
    );
  }
  try {
    assertCanonicalJsonDataDomain(transactionInput);
  } catch (error) {
    return rejected([
      {
        code: 'transaction-invalid',
        commandIndex: null,
        message: unknownMessage(error),
        path: [],
      },
    ]);
  }
  const payloadCounts = transactionPayloadCounts(transactionInput);
  if (
    payloadCounts.events > MAX_TRANSACTION_EVENT_PAYLOADS ||
    payloadCounts.notes > MAX_TRANSACTION_NOTE_PAYLOADS
  ) {
    return rejected([
      {
        code: 'resource-limit',
        commandIndex: null,
        message: `A transaction may carry at most ${String(MAX_TRANSACTION_EVENT_PAYLOADS)} events and ${String(MAX_TRANSACTION_NOTE_PAYLOADS)} notes.`,
        path: ['commands'],
      },
    ]);
  }
  const transactionResult = EditorTransactionSchema.safeParse(transactionInput);
  if (!transactionResult.success) {
    return rejected(
      transactionResult.error.issues.map((issue) => {
        const commandIndex =
          issue.path[0] === 'commands' && typeof issue.path[1] === 'number' ? issue.path[1] : null;
        return issueFromZod(issue, 'transaction-invalid', commandIndex);
      }),
    );
  }

  const source = documentResult.data;
  const transaction = transactionResult.data;
  try {
    await createPracticeNativeEnvelope(source, source.metadata.updatedAt);
  } catch (error) {
    return rejected([
      {
        code: 'input-document-invalid',
        commandIndex: null,
        message: unknownMessage(error),
        path: ['revision'],
      },
    ]);
  }
  if (transaction.baseRevisionId !== source.revision.revisionId) {
    return rejected([
      {
        code: 'stale-base-revision',
        commandIndex: null,
        message: 'Transaction base revision does not match the current document revision.',
        path: ['baseRevisionId'],
      },
    ]);
  }
  if (
    transaction.revisionId === source.revision.revisionId ||
    transaction.revisionNumber !== source.revision.revisionNumber + 1 ||
    Date.parse(transaction.updatedAt) < Date.parse(source.metadata.updatedAt)
  ) {
    return rejected([
      {
        code: 'revision-conflict',
        commandIndex: null,
        message:
          'Accepted edits require a new revision ID, the next revision number, and a monotonic updatedAt.',
        path: ['revisionId'],
      },
    ]);
  }

  const working = structuredClone(source);
  for (const [commandIndex, command] of transaction.commands.entries()) {
    try {
      applyCommand(working, command);
    } catch (error) {
      if (error instanceof EditorCommandFailure) {
        return rejected([
          {
            code: error.code,
            commandIndex,
            message: error.message,
            path: ['commands', commandIndex, ...error.path],
          },
        ]);
      }
      throw error;
    }
  }

  working.metadata.updatedAt = transaction.updatedAt;
  working.revision.revisionId = transaction.revisionId;
  working.revision.revisionNumber = transaction.revisionNumber;

  const candidateResult = PracticeDocumentSchema.safeParse(working);
  if (!candidateResult.success) {
    return rejected(
      candidateResult.error.issues.map((issue) =>
        issueFromZod(issue, 'final-document-invalid', null),
      ),
    );
  }

  const candidate = candidateResult.data;
  const [contentHash, expectedProjectionHash] = await Promise.all([
    hashPracticeDocumentContent(candidate),
    hashExpectedEvents(candidate),
  ]);
  candidate.revision.contentHash = PracticeDocumentContentHashSchema.parse(contentHash);
  candidate.expectedProjectionHash = PracticeExpectedEventsHashSchema.parse(expectedProjectionHash);
  const finalDocument = PracticeDocumentSchema.parse(candidate);
  return { document: finalDocument, kind: 'accepted' };
}

export async function executeEditorCommand(
  documentInput: unknown,
  commandInput: unknown,
  revisionInput: unknown,
): Promise<EditorTransactionResult> {
  try {
    assertCanonicalJsonDataDomain(revisionInput);
  } catch (error) {
    return rejected([
      {
        code: 'transaction-invalid',
        commandIndex: null,
        message: unknownMessage(error),
        path: [],
      },
    ]);
  }
  const revisionResult = EditorRevisionAdvanceSchema.safeParse(revisionInput);
  if (!revisionResult.success) {
    return rejected(
      revisionResult.error.issues.map((issue) => issueFromZod(issue, 'transaction-invalid', null)),
    );
  }
  return executeEditorTransaction(documentInput, {
    ...revisionResult.data,
    commands: [commandInput],
  });
}
