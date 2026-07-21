import { describe, expect, it } from 'vitest';

import { MusicalDurationSchema, MusicalTickSchema } from '../shared/contracts/practice';
import { createBlankPracticeDocument, createNextPracticeDocumentRevision } from './native';
import { inspectPracticeDocument } from './inspection';

async function inspectionDocument() {
  const first = await createBlankPracticeDocument({
    createdAt: '2026-07-20T12:00:00Z',
    documentId: 'document-1',
    revisionId: 'revision-1',
    title: 'Accessible etude',
  });
  const draft = structuredClone(first) as unknown as {
    metadata: typeof first.metadata;
    tracks: {
      voices: {
        events: unknown[];
        name?: string;
      }[];
    }[];
  };
  const voice = draft.tracks[0]?.voices[0];
  if (voice === undefined) throw new Error('Blank document must contain its initial voice.');
  voice.name = 'Lead voice';
  voice.events = [
    {
      articulations: [{ articulation: 'accent', semantic: 'accent' }],
      id: 'event-1',
      kind: 'guitar-event',
      notatedDurationTicks: 480,
      notes: [
        {
          id: 'note-1',
          position: { stringNumber: 1, tabFret: 0 },
          semantics: [{ semantic: 'vibrato' }],
          soundingDurationTicks: 480,
          writtenPitch: { accidental: 0, octave: 4, step: 'E' },
        },
      ],
      tick: 0,
    },
    { durationTicks: 480, id: 'rest-1', kind: 'rest', tick: 480 },
  ];
  return createNextPracticeDocumentRevision(first, draft, {
    revisionId: 'revision-2',
    updatedAt: '2026-07-20T12:01:00Z',
  });
}

describe('renderer-independent structured score inspection', () => {
  it('builds a semantic tree for document, tracks, voices, events, notes, and rests', async () => {
    const inspection = inspectPracticeDocument(await inspectionDocument());

    expect(inspection.tree.kind).toBe('document');
    expect(inspection.tree.label).toBe('Score: Accessible etude');
    expect(inspection.tree.children[0]?.kind).toBe('track');
    expect(inspection.tree.children[0]?.children[0]?.kind).toBe('voice');
    expect(inspection.tree.children[0]?.children[0]?.children.map(({ kind }) => kind)).toEqual([
      'event',
      'rest',
    ]);
    expect(
      inspection.tree.children[0]?.children[0]?.children[0]?.children.map(({ kind }) => kind),
    ).toEqual(['note']);
  });

  it('exposes stable depth-first keyboard order, labels, and semantic focus targets', async () => {
    const document = await inspectionDocument();
    const first = inspectPracticeDocument(document);
    const second = inspectPracticeDocument(structuredClone(document));

    expect(first).toEqual(second);
    expect(first.rows.map(({ rowId }) => rowId)).toEqual([
      'document:document-1',
      'track:track-1',
      'voice:track-1:voice-1',
      'event:track-1:voice-1:event-1',
      'note:track-1:voice-1:event-1:note-1',
      'event:track-1:voice-1:rest-1',
    ]);
    expect(first.rows.map(({ navigationIndex }) => navigationIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(first.rows[0]?.previousRowId).toBeNull();
    expect(first.rows[0]?.nextRowId).toBe('track:track-1');
    expect(first.rows.at(-1)?.nextRowId).toBeNull();
    expect(first.rows.at(-1)?.previousRowId).toBe('note:track-1:voice-1:event-1:note-1');

    const note = first.rows.find(({ kind }) => kind === 'note');
    expect(note?.label).toContain('E 4, string 1, fret 0');
    expect(note?.label).toContain('techniques vibrato');
    expect(note?.focusTarget).toEqual({
      documentId: 'document-1',
      eventId: 'event-1',
      kind: 'note',
      noteId: 'note-1',
      trackId: 'track-1',
      voiceId: 'voice-1',
    });
    expect(first.rows.find(({ kind }) => kind === 'rest')?.label).toBe(
      'Rest 2, bar 1, beat 1 plus 480 ticks, tick 480, duration 480 ticks',
    );
  });

  it('deep-freezes inspection output without renderer or layout assumptions', async () => {
    const inspection = inspectPracticeDocument(await inspectionDocument());

    expect(Object.isFrozen(inspection)).toBe(true);
    expect(Object.isFrozen(inspection.rows)).toBe(true);
    expect(Object.isFrozen(inspection.tree)).toBe(true);
    expect(Object.isFrozen(inspection.tree.children)).toBe(true);
    expect(() => (inspection.rows as unknown as unknown[]).pop()).toThrow(TypeError);
    for (const row of inspection.rows) {
      expect(row).not.toHaveProperty('bounds');
      expect(row).not.toHaveProperty('canvas');
      expect(row).not.toHaveProperty('svg');
    }
  });

  it('keeps composite row identities collision-free for delimiter-bearing semantic IDs', async () => {
    const document = structuredClone(await inspectionDocument());
    const seedTrack = document.tracks[0];
    const seedVoice = seedTrack?.voices[0];
    if (seedTrack === undefined || seedVoice === undefined) throw new Error('Missing seed voice.');
    document.tracks = [
      {
        ...seedTrack,
        id: 'a:b',
        name: 'First',
        voices: [{ ...seedVoice, events: [], id: 'c' }],
      },
      {
        ...seedTrack,
        id: 'a',
        name: 'Second',
        voices: [{ ...seedVoice, events: [], id: 'b:c' }],
      },
    ];

    const rowIds = inspectPracticeDocument(document).rows.map(({ rowId }) => rowId);
    expect(new Set(rowIds).size).toBe(rowIds.length);
    expect(rowIds).toContain('voice:a%3Ab:c');
    expect(rowIds).toContain('voice:a:b%3Ac');

    const delimiterDocument = structuredClone(await inspectionDocument());
    delimiterDocument.revision.documentId = 'document:1';
    const track = delimiterDocument.tracks[0];
    const voice = track?.voices[0];
    const event = voice?.events[0];
    if (track === undefined || voice === undefined || event?.kind !== 'guitar-event') {
      throw new Error('Missing delimiter fixture event.');
    }
    track.id = 'track:1';
    voice.id = 'voice:1';
    event.id = 'event:1';
    const note = event.notes[0];
    if (note === undefined) throw new Error('Missing delimiter fixture note.');
    note.id = 'note:1';
    expect(inspectPracticeDocument(delimiterDocument).rows.map(({ rowId }) => rowId)).toEqual([
      'document:document%3A1',
      'track:track%3A1',
      'voice:track%3A1:voice%3A1',
      'event:track%3A1:voice%3A1:event%3A1',
      'note:track%3A1:voice%3A1:event%3A1:note%3A1',
      'event:track%3A1:voice%3A1:rest-1',
    ]);

    delimiterDocument.revision.documentId = 'document-\ud800';
    track.id = 'track-\udc00';
    voice.id = 'voice-\ud800';
    event.id = 'event-\udc00';
    note.id = 'note-\ud800';
    const surrogateRows = inspectPracticeDocument(delimiterDocument).rows.map(({ rowId }) => rowId);
    expect(new Set(surrogateRows).size).toBe(surrogateRows.length);
    expect(surrogateRows).toContain('document:document-%uD800');
    expect(surrogateRows).toContain('note:track-%uDC00:voice-%uD800:event-%uDC00:note-%uD800');
  });

  it('describes material articulation, dynamic, tuplet, bend, and relation values', async () => {
    const first = structuredClone(await inspectionDocument());
    first.durationTicks = MusicalDurationSchema.parse(1_440);
    const firstEvent = first.tracks[0]?.voices[0]?.events[0];
    const firstRest = first.tracks[0]?.voices[0]?.events[1];
    if (firstEvent?.kind !== 'guitar-event' || firstRest?.kind !== 'rest') {
      throw new Error('Missing semantic label fixtures.');
    }
    firstEvent.articulations = [{ articulation: 'accent', semantic: 'accent' }];
    firstEvent.dynamic = { semantic: 'dynamics-mf', value: 'mf' };
    firstEvent.tuplet = { actualNotes: 3, normalNotes: 2 };
    firstRest.tuplet = { actualNotes: 3, normalNotes: 2 };
    const firstNote = firstEvent.notes[0];
    if (firstNote === undefined) throw new Error('Missing semantic label note.');
    firstNote.semantics = [
      { semantic: 'bend-bounded', semitones: 0.5 },
      { direction: 'start', semantic: 'slide', targetNoteId: 'target-note' },
    ];
    first.tracks[0]?.voices[0]?.events.push({
      articulations: [],
      id: 'target-event',
      kind: 'guitar-event',
      notatedDurationTicks: MusicalDurationSchema.parse(480),
      notes: [
        {
          id: 'target-note',
          position: { stringNumber: 1, tabFret: 2 },
          semantics: [{ direction: 'stop', semantic: 'slide', targetNoteId: 'note-1' }],
          soundingDurationTicks: MusicalDurationSchema.parse(480),
          writtenPitch: { accidental: 1, octave: 4, step: 'F' },
        },
      ],
      tick: MusicalTickSchema.parse(960),
    });

    const second = structuredClone(first);
    const secondEvent = second.tracks[0]?.voices[0]?.events[0];
    if (secondEvent?.kind !== 'guitar-event') throw new Error('Missing second label event.');
    secondEvent.articulations = [{ articulation: 'staccato', semantic: 'staccato' }];
    const secondNote = secondEvent.notes[0];
    if (secondNote === undefined) throw new Error('Missing second label note.');
    secondNote.semantics = [{ semantic: 'bend-bounded', semitones: 2 }];
    const secondVoice = second.tracks[0]?.voices[0];
    if (secondVoice === undefined) throw new Error('Missing second label voice.');
    secondVoice.events = secondVoice.events.slice(0, 2);

    const firstInspection = inspectPracticeDocument(first);
    const secondInspection = inspectPracticeDocument(second);
    const firstEventLabel = firstInspection.rows.find(({ kind }) => kind === 'event')?.label;
    const firstNoteLabel = firstInspection.rows.find(({ kind }) => kind === 'note')?.label;
    const firstRestLabel = firstInspection.rows.find(({ kind }) => kind === 'rest')?.label;
    expect(firstEventLabel).toContain('tuplet 3 in the time of 2');
    expect(firstEventLabel).toContain('dynamic mf');
    expect(firstEventLabel).toContain('articulations accent');
    expect(firstRestLabel).toContain('tuplet 3 in the time of 2');
    expect(firstNoteLabel).toContain('bend 0.5 semitones');
    expect(firstNoteLabel).toContain('slide start, related note target-note');
    expect(secondInspection.rows.find(({ kind }) => kind === 'event')?.label).toContain(
      'articulations staccato',
    );
    expect(secondInspection.rows.find(({ kind }) => kind === 'note')?.label).toContain(
      'bend 2 semitones',
    );
    expect(firstEventLabel).not.toBe(
      secondInspection.rows.find(({ kind }) => kind === 'event')?.label,
    );
    expect(firstNoteLabel).not.toBe(
      secondInspection.rows.find(({ kind }) => kind === 'note')?.label,
    );
  });

  it('rejects malformed and accessor-backed documents without invoking getters', async () => {
    const document = await inspectionDocument();
    const malformed = structuredClone(document) as unknown as {
      tracks: { voices: { events: unknown[] }[] }[];
    };
    malformed.tracks[0]?.voices[0]?.events.push({
      durationTicks: 1,
      id: 'rest-1',
      kind: 'rest',
      tick: 959,
    });
    expect(() => inspectPracticeDocument(malformed)).toThrow();

    let getterCalls = 0;
    Object.defineProperty(document.metadata, 'title', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'Accessor title';
      },
    });
    expect(() => inspectPracticeDocument(document)).toThrow(
      expect.objectContaining({ code: 'ACCESSOR_PROPERTY' }),
    );
    expect(getterCalls).toBe(0);
  });
});
