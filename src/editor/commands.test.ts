import { describe, expect, it } from 'vitest';

import {
  PracticeDocumentContentHashSchema,
  PracticeDocumentSchema,
  PracticeExpectedEventsHashSchema,
  type PracticeDocument,
} from '../shared/contracts/practice';
import { hashExpectedEvents, hashPracticeDocumentContent } from '../shared/practice-identity';
import {
  EditorCommandSchema,
  EditorTransactionSchema,
  executeEditorCommand,
  executeEditorTransaction,
  type EditorTransactionResult,
} from './commands';

function hash(projectionId: string, fill = 'a') {
  const schemaId =
    projectionId === 'practice-document-content' || projectionId === 'practice-expected-events'
      ? 'practice-document'
      : projectionId;
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1 as const,
    digestHex: fill.repeat(64),
    projectionId,
    projectionVersion: 1 as const,
    schemaId,
    schemaVersion: 1 as const,
  };
}

function documentFixtureSeed(): PracticeDocument {
  return PracticeDocumentSchema.parse({
    contractVersion: 1,
    durationTicks: 3_840,
    expectedProjectionHash: hash('practice-expected-events', 'b'),
    guitar: {
      capoFret: 0,
      handedness: 'right',
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: '12-tet',
      tuning: [
        { openMidi: 64, stringNumber: 1 },
        { openMidi: 59, stringNumber: 2 },
        { openMidi: 55, stringNumber: 3 },
        { openMidi: 50, stringNumber: 4 },
        { openMidi: 45, stringNumber: 5 },
        { openMidi: 40, stringNumber: 6 },
      ],
    },
    importProvenance: null,
    keyMap: [{ fifths: 0, mode: 'major', tick: 0 }],
    loopPresets: [],
    metadata: {
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Editor fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: hash('practice-document-content'),
      documentId: 'document-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [
      {
        id: 'track-1',
        name: 'Guitar',
        voices: [
          {
            events: [
              {
                articulations: [],
                id: 'event-1',
                kind: 'guitar-event',
                notatedDurationTicks: 480,
                notes: [
                  {
                    id: 'note-1',
                    position: { stringNumber: 1, tabFret: 0 },
                    semantics: [],
                    soundingDurationTicks: 480,
                    writtenPitch: { accidental: 0, octave: 4, step: 'E' },
                  },
                ],
                tick: 0,
              },
              { durationTicks: 480, id: 'rest-1', kind: 'rest', tick: 960 },
            ],
            id: 'voice-1',
            name: 'Primary',
          },
        ],
      },
    ],
  });
}

const trustedDocumentFixture = documentFixtureSeed();
trustedDocumentFixture.revision.contentHash = PracticeDocumentContentHashSchema.parse(
  await hashPracticeDocumentContent(trustedDocumentFixture),
);
trustedDocumentFixture.expectedProjectionHash = PracticeExpectedEventsHashSchema.parse(
  await hashExpectedEvents(trustedDocumentFixture),
);

function documentFixture(): PracticeDocument {
  return structuredClone(trustedDocumentFixture);
}

const revision = (overrides: Record<string, unknown> = {}) => ({
  baseRevisionId: 'revision-1',
  revisionId: 'revision-2',
  revisionNumber: 2,
  updatedAt: '2026-07-20T12:01:00Z',
  ...overrides,
});

function accepted(result: EditorTransactionResult): PracticeDocument {
  if (result.kind === 'rejected') {
    throw new Error(`Expected accepted editor result: ${JSON.stringify(result.issues)}`);
  }
  return result.document;
}

describe('runtime-validated editor commands', () => {
  it('rejects unknown, fractional, undeclared, and empty command payloads', () => {
    expect(EditorCommandSchema.safeParse({ kind: 'unknown-command' }).success).toBe(false);
    expect(
      EditorCommandSchema.safeParse({
        kind: 'move-event',
        target: { eventId: 'event-1', trackId: 'track-1', voiceId: 'voice-1' },
        tick: 1.5,
      }).success,
    ).toBe(false);
    expect(
      EditorCommandSchema.safeParse({
        debug: true,
        kind: 'delete-event',
        target: { eventId: 'event-1', trackId: 'track-1', voiceId: 'voice-1' },
      }).success,
    ).toBe(false);
    expect(EditorTransactionSchema.safeParse({ ...revision(), commands: [] }).success).toBe(false);
  });

  it('returns structured issues for invalid runtime command input', async () => {
    const result = await executeEditorCommand(
      documentFixture(),
      {
        kind: 'move-event',
        target: { eventId: 'event-1', trackId: 'track-1', voiceId: 'voice-1' },
        tick: 1.5,
      },
      revision(),
    );
    expect(result).toMatchObject({
      issues: [{ code: 'transaction-invalid', commandIndex: 0 }],
      kind: 'rejected',
    });
  });

  it('updates metadata, maps, loops, identities, and revision atomically and deterministically', async () => {
    const source = documentFixture();
    const original = structuredClone(source);
    const transaction = {
      ...revision(),
      commands: [
        { artist: 'Ada', kind: 'set-metadata', title: 'Revised exercise' },
        {
          entries: [
            { microsecondsPerQuarter: 500_000, tick: 0 },
            { microsecondsPerQuarter: 400_000, tick: 1_920 },
          ],
          kind: 'set-tempo-map',
        },
        {
          entries: [
            { denominator: 4, grouping: [4], numerator: 4, tick: 0 },
            { denominator: 8, grouping: [3, 3], numerator: 6, tick: 1_920 },
          ],
          kind: 'set-meter-map',
        },
        {
          entries: [
            { fifths: 0, mode: 'major', tick: 0 },
            { fifths: 2, mode: 'major', tick: 1_920 },
          ],
          kind: 'set-key-map',
        },
        {
          kind: 'upsert-loop-preset',
          preset: {
            id: 'loop-1',
            name: 'Second half',
            range: { endTickExclusive: 3_840, startTick: 1_920 },
          },
        },
      ],
    };

    const first = accepted(await executeEditorTransaction(source, transaction));
    const second = accepted(await executeEditorTransaction(source, transaction));

    expect(first).toEqual(second);
    expect(first.metadata).toMatchObject({ artist: 'Ada', title: 'Revised exercise' });
    expect(first.revision).toMatchObject({ revisionId: 'revision-2', revisionNumber: 2 });
    expect(first.revision.contentHash.projectionId).toBe('practice-document-content');
    expect(first.expectedProjectionHash.projectionId).toBe('practice-expected-events');
    await expect(hashPracticeDocumentContent(first)).resolves.toEqual(first.revision.contentHash);
    await expect(hashExpectedEvents(first)).resolves.toEqual(first.expectedProjectionHash);
    expect(first.loopPresets).toHaveLength(1);
    expect(PracticeDocumentSchema.safeParse(first).success).toBe(true);
    expect(source).toEqual(original);
  });

  it('inserts, replaces, moves, resizes, and deletes events and rests', async () => {
    const result = await executeEditorTransaction(documentFixture(), {
      ...revision(),
      commands: [
        {
          event: { durationTicks: 240, id: 'rest-2', kind: 'rest', tick: 1_440 },
          kind: 'insert-event',
          target: { trackId: 'track-1', voiceId: 'voice-1' },
        },
        {
          event: { durationTicks: 240, id: 'rest-3', kind: 'rest', tick: 1_680 },
          kind: 'replace-event',
          target: { eventId: 'rest-2', trackId: 'track-1', voiceId: 'voice-1' },
        },
        {
          kind: 'move-event',
          target: { eventId: 'rest-1', trackId: 'track-1', voiceId: 'voice-1' },
          tick: 2_400,
        },
        {
          durationTicks: 120,
          kind: 'set-event-duration',
          target: { eventId: 'rest-3', trackId: 'track-1', voiceId: 'voice-1' },
        },
        {
          kind: 'delete-event',
          target: { eventId: 'rest-1', trackId: 'track-1', voiceId: 'voice-1' },
        },
      ],
    });
    const document = accepted(result);
    expect(document.tracks[0]?.voices[0]?.events.map(({ id }) => id)).toEqual([
      'event-1',
      'rest-3',
    ]);
    expect(document.tracks[0]?.voices[0]?.events[1]).toMatchObject({ durationTicks: 120 });
  });

  it('adds, renames, and removes tracks and voices without inventing IDs', async () => {
    const result = await executeEditorTransaction(documentFixture(), {
      ...revision(),
      commands: [
        {
          kind: 'add-track',
          track: {
            id: 'track-2',
            name: 'Harmony',
            voices: [{ events: [], id: 'voice-2' }],
          },
        },
        { kind: 'rename-track', name: 'Harmony guitar', trackId: 'track-2' },
        {
          kind: 'add-voice',
          trackId: 'track-2',
          voice: { events: [], id: 'voice-3' },
        },
        { kind: 'rename-voice', name: 'Upper', trackId: 'track-2', voiceId: 'voice-3' },
        { kind: 'remove-voice', trackId: 'track-2', voiceId: 'voice-3' },
        { kind: 'remove-track', trackId: 'track-1' },
      ],
    });
    const document = accepted(result);
    expect(document.tracks).toEqual([
      { id: 'track-2', name: 'Harmony guitar', voices: [{ events: [], id: 'voice-2' }] },
    ]);
  });

  it('applies guitar configuration, pitch-consistent positions, durations, expression, and reciprocal techniques', async () => {
    const result = await executeEditorTransaction(documentFixture(), {
      ...revision(),
      commands: [
        {
          event: {
            articulations: [],
            id: 'event-2',
            kind: 'guitar-event',
            notatedDurationTicks: 480,
            notes: [
              {
                id: 'note-2',
                position: { stringNumber: 1, tabFret: 2 },
                semantics: [],
                soundingDurationTicks: 480,
                writtenPitch: { accidental: 1, octave: 4, step: 'F' },
              },
            ],
            tick: 480,
          },
          kind: 'insert-event',
          target: { trackId: 'track-1', voiceId: 'voice-1' },
        },
        {
          guitar: { ...documentFixture().guitar, capoFret: 1 },
          kind: 'set-guitar-configuration',
        },
        {
          kind: 'set-note-position',
          position: { stringNumber: 1, tabFret: 0 },
          target: {
            eventId: 'event-1',
            noteId: 'note-1',
            trackId: 'track-1',
            voiceId: 'voice-1',
          },
          writtenPitch: { accidental: 0, octave: 4, step: 'F' },
        },
        {
          kind: 'set-note-position',
          position: { stringNumber: 1, tabFret: 1 },
          target: {
            eventId: 'event-2',
            noteId: 'note-2',
            trackId: 'track-1',
            voiceId: 'voice-1',
          },
          writtenPitch: { accidental: 1, octave: 4, step: 'F' },
        },
        {
          kind: 'set-note-sounding-duration',
          soundingDurationTicks: 420,
          target: {
            eventId: 'event-1',
            noteId: 'note-1',
            trackId: 'track-1',
            voiceId: 'voice-1',
          },
        },
        {
          kind: 'set-note-semantics',
          semantics: [{ direction: 'start', semantic: 'hammer-on', targetNoteId: 'note-2' }],
          target: {
            eventId: 'event-1',
            noteId: 'note-1',
            trackId: 'track-1',
            voiceId: 'voice-1',
          },
        },
        {
          kind: 'set-note-semantics',
          semantics: [{ direction: 'stop', semantic: 'hammer-on', targetNoteId: 'note-1' }],
          target: {
            eventId: 'event-2',
            noteId: 'note-2',
            trackId: 'track-1',
            voiceId: 'voice-1',
          },
        },
        {
          articulations: [{ articulation: 'accent', semantic: 'accent' }],
          dynamic: { semantic: 'dynamics-mf', value: 'mf' },
          kind: 'set-event-expression',
          target: { eventId: 'event-1', trackId: 'track-1', voiceId: 'voice-1' },
        },
      ],
    });
    const document = accepted(result);
    const event = document.tracks[0]?.voices[0]?.events[0];
    expect(event).toMatchObject({ articulations: [{ semantic: 'accent' }] });
    if (event?.kind !== 'guitar-event')
      throw new Error('Fixture event must remain guitar content.');
    expect(event.dynamic).toEqual({ semantic: 'dynamics-mf', value: 'mf' });
    expect(event.notes[0]).toMatchObject({
      soundingDurationTicks: 420,
      writtenPitch: { accidental: 0, octave: 4, step: 'F' },
    });
  });

  it('pastes caller-identified events, quantizes deterministically, and transposes from guitar position truth', async () => {
    const result = await executeEditorTransaction(documentFixture(), {
      ...revision(),
      commands: [
        {
          events: [
            {
              articulations: [],
              id: 'event-pasted',
              kind: 'guitar-event',
              notatedDurationTicks: 240,
              notes: [
                {
                  id: 'note-pasted',
                  position: { stringNumber: 2, tabFret: 0 },
                  semantics: [],
                  soundingDurationTicks: 240,
                  writtenPitch: { accidental: 0, octave: 3, step: 'B' },
                },
              ],
              tick: 0,
            },
          ],
          kind: 'paste-events',
          sourceStartTick: 0,
          target: { trackId: 'track-1', voiceId: 'voice-1' },
          targetStartTick: 1_900,
        },
        {
          eventIds: ['event-pasted'],
          gridTicks: 480,
          kind: 'quantize-events',
          mode: 'nearest',
        },
        { kind: 'transpose-notes', noteIds: ['note-pasted'], semitones: 2 },
      ],
    });
    const document = accepted(result);
    const event = document.tracks[0]?.voices[0]?.events.find(({ id }) => id === 'event-pasted');
    expect(event?.tick).toBe(1_920);
    if (event?.kind !== 'guitar-event') throw new Error('Pasted event must be guitar content.');
    expect(event.notes[0]).toMatchObject({
      position: { stringNumber: 2, tabFret: 2 },
      writtenPitch: { accidental: 1, octave: 4, step: 'C' },
    });
  });
});

describe('atomic editor rejection', () => {
  it('rejects hash-tampered sources instead of laundering them into a new revision', async () => {
    const source = documentFixture();
    source.metadata.title = 'Tampered without rehashing';

    const result = await executeEditorCommand(
      source,
      { kind: 'set-metadata', title: 'Attempted laundering' },
      revision(),
    );
    expect(result).toMatchObject({
      issues: [{ code: 'input-document-invalid' }],
      kind: 'rejected',
    });
  });

  it('rejects accessors at public unknown boundaries without invoking them', async () => {
    const source = documentFixture();
    let getterCalls = 0;
    Object.defineProperty(source.metadata, 'title', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'Accessor title';
      },
    });
    const sourceResult = await executeEditorCommand(
      source,
      { kind: 'set-metadata', title: 'Safe title' },
      revision(),
    );
    expect(sourceResult).toMatchObject({
      issues: [{ code: 'input-document-invalid' }],
      kind: 'rejected',
    });

    const command = {};
    Object.defineProperty(command, 'kind', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'set-metadata';
      },
    });
    const commandResult = await executeEditorCommand(documentFixture(), command, revision());
    expect(commandResult).toMatchObject({
      issues: [{ code: 'transaction-invalid' }],
      kind: 'rejected',
    });

    const accessorRevision = revision();
    Object.defineProperty(accessorRevision, 'revisionId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'revision-2';
      },
    });
    const revisionResult = await executeEditorCommand(
      documentFixture(),
      { kind: 'set-metadata', title: 'Safe title' },
      accessorRevision,
    );
    expect(revisionResult).toMatchObject({
      issues: [{ code: 'transaction-invalid' }],
      kind: 'rejected',
    });
    expect(getterCalls).toBe(0);
  });

  it('rejects aggregate transaction event payloads before command parsing', async () => {
    const paste = (prefix: string) =>
      Array.from({ length: 1_001 }, (_, index) => ({
        durationTicks: 1,
        id: `${prefix}-${String(index)}`,
        kind: 'rest' as const,
        tick: index,
      }));
    const result = await executeEditorTransaction(documentFixture(), {
      ...revision(),
      commands: [
        {
          events: paste('first'),
          kind: 'paste-events',
          sourceStartTick: 0,
          target: { trackId: 'track-1', voiceId: 'voice-1' },
          targetStartTick: 0,
        },
        {
          events: paste('second'),
          kind: 'paste-events',
          sourceStartTick: 0,
          target: { trackId: 'track-1', voiceId: 'voice-1' },
          targetStartTick: 0,
        },
      ],
    });
    expect(result).toMatchObject({ issues: [{ code: 'resource-limit' }], kind: 'rejected' });
  });

  it('rolls back earlier commands when a later target is missing', async () => {
    const source = documentFixture();
    const original = structuredClone(source);
    const result = await executeEditorTransaction(source, {
      ...revision(),
      commands: [
        { kind: 'set-metadata', title: 'Must roll back' },
        {
          kind: 'delete-event',
          target: { eventId: 'missing', trackId: 'track-1', voiceId: 'voice-1' },
        },
      ],
    });
    expect(result).toMatchObject({
      issues: [{ code: 'command-target-not-found', commandIndex: 1 }],
      kind: 'rejected',
    });
    expect(source).toEqual(original);
  });

  it('rejects final overlap, pitch inconsistency, and incomplete relationship edits without mutation', async () => {
    const overlapSource = documentFixture();
    const overlap = await executeEditorCommand(
      overlapSource,
      {
        kind: 'move-event',
        target: { eventId: 'rest-1', trackId: 'track-1', voiceId: 'voice-1' },
        tick: 240,
      },
      revision(),
    );
    expect(overlap).toMatchObject({ kind: 'rejected' });
    expect(overlapSource.tracks[0]?.voices[0]?.events[1]?.tick).toBe(960);

    const pitch = await executeEditorCommand(
      documentFixture(),
      {
        kind: 'set-note-position',
        position: { stringNumber: 1, tabFret: 1 },
        target: {
          eventId: 'event-1',
          noteId: 'note-1',
          trackId: 'track-1',
          voiceId: 'voice-1',
        },
        writtenPitch: { accidental: 0, octave: 4, step: 'E' },
      },
      revision(),
    );
    expect(pitch).toMatchObject({ kind: 'rejected' });

    const incompleteRelation = await executeEditorCommand(
      documentFixture(),
      {
        kind: 'set-note-semantics',
        semantics: [{ direction: 'start', semantic: 'slurs', targetNoteId: 'missing-note' }],
        target: {
          eventId: 'event-1',
          noteId: 'note-1',
          trackId: 'track-1',
          voiceId: 'voice-1',
        },
      },
      revision(),
    );
    expect(incompleteRelation).toMatchObject({ kind: 'rejected' });
  });

  it('rejects negative paste and transpose derivations before they can escape', async () => {
    const paste = await executeEditorCommand(
      documentFixture(),
      {
        events: [{ durationTicks: 120, id: 'pasted-rest', kind: 'rest', tick: 0 }],
        kind: 'paste-events',
        sourceStartTick: 480,
        target: { trackId: 'track-1', voiceId: 'voice-1' },
        targetStartTick: 0,
      },
      revision(),
    );
    expect(paste).toMatchObject({ issues: [{ code: 'derived-value-invalid' }], kind: 'rejected' });

    const transpose = await executeEditorCommand(
      documentFixture(),
      { kind: 'transpose-notes', noteIds: ['note-1'], semitones: -1 },
      revision(),
    );
    expect(transpose).toMatchObject({
      issues: [{ code: 'derived-value-invalid' }],
      kind: 'rejected',
    });
  });

  it('rejects stale or non-monotonic revisions before applying commands', async () => {
    const command = { kind: 'set-metadata', title: 'No write' };
    const stale = await executeEditorCommand(
      documentFixture(),
      command,
      revision({ baseRevisionId: 'revision-old' }),
    );
    expect(stale).toMatchObject({ issues: [{ code: 'stale-base-revision' }], kind: 'rejected' });

    const conflict = await executeEditorCommand(
      documentFixture(),
      command,
      revision({ revisionNumber: 3 }),
    );
    expect(conflict).toMatchObject({ issues: [{ code: 'revision-conflict' }], kind: 'rejected' });
  });

  it('enforces stable ID and document resource ceilings at the final atomic boundary', async () => {
    const duplicate = await executeEditorCommand(
      documentFixture(),
      {
        event: { durationTicks: 120, id: 'event-1', kind: 'rest', tick: 1_500 },
        kind: 'insert-event',
        target: { trackId: 'track-1', voiceId: 'voice-1' },
      },
      revision(),
    );
    expect(duplicate).toMatchObject({ kind: 'rejected' });

    const commands = Array.from({ length: 16 }, (_, index) => ({
      kind: 'add-track',
      track: {
        id: `track-extra-${String(index)}`,
        name: `Track ${String(index)}`,
        voices: [{ events: [], id: `voice-extra-${String(index)}` }],
      },
    }));
    const overLimit = await executeEditorTransaction(documentFixture(), {
      ...revision(),
      commands,
    });
    expect(overLimit).toMatchObject({ issues: [{ code: 'resource-limit' }], kind: 'rejected' });
  });

  it('rejects a duration shrink or removal that would invalidate the canonical document', async () => {
    const duration = await executeEditorCommand(
      documentFixture(),
      { durationTicks: 1_000, kind: 'set-document-duration' },
      revision(),
    );
    expect(duration).toMatchObject({ kind: 'rejected' });

    const track = await executeEditorCommand(
      documentFixture(),
      { kind: 'remove-track', trackId: 'track-1' },
      revision(),
    );
    expect(track).toMatchObject({ kind: 'rejected' });

    const voice = await executeEditorCommand(
      documentFixture(),
      { kind: 'remove-voice', trackId: 'track-1', voiceId: 'voice-1' },
      revision(),
    );
    expect(voice).toMatchObject({ kind: 'rejected' });
  });
});
