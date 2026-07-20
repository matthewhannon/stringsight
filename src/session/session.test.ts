import { describe, expect, it } from 'vitest';

import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  SessionSchema,
  type Session,
} from '../shared';
import {
  canExportSessionMidi,
  correctionProblems,
  createReplacementCorrection,
  createRevertCorrection,
  exportSessionJson,
  exportSessionMidi,
  importSessionJson,
  projectReviewEvents,
} from './index';

const baseSession = (): Session =>
  SessionSchema.parse({
    corrections: [],
    createdAt: '2026-07-19T12:00:00.000Z',
    events: {
      audio: [
        NoteEventSchema.parse({
          candidates: [
            {
              centsOffset: 0,
              confidence: 0.92,
              evidence: ['fundamental'],
              frequencyHz: 440,
              midi: 69,
              noteName: 'A4',
              pitchClass: 'A',
              rank: 1,
              score: 0.92,
            },
          ],
          id: 'note-1',
          kind: 'note',
          lifecycle: 'finalized',
          provenance: {
            algorithm: 'fixture',
            generatedAtMs: 600,
            runId: 'run-1',
            subsystem: 'audio-analysis',
            version: '1.2.3',
          },
          schemaVersion: CONTRACT_SCHEMA_VERSION,
          time: { endMs: 600, startMs: 100 },
        }),
        ChordEventSchema.parse({
          candidates: [
            {
              confidence: 0.8,
              pitchClasses: ['G', 'B', 'D'],
              quality: 'major',
              rank: 1,
              root: 'G',
              score: 0.8,
              symbol: 'G',
            },
            {
              confidence: 0.15,
              pitchClasses: ['G', 'C', 'D'],
              quality: 'suspended-4',
              rank: 2,
              root: 'G',
              score: 0.15,
              symbol: 'Gsus4',
            },
          ],
          id: 'chord-1',
          kind: 'chord',
          lifecycle: 'finalized',
          provenance: {
            algorithm: 'fixture',
            generatedAtMs: 1200,
            runId: 'run-1',
            subsystem: 'polyphonic-analysis',
            version: '1.2.3',
          },
          schemaVersion: CONTRACT_SCHEMA_VERSION,
          time: { endMs: 1200, startMs: 600 },
        }),
      ],
      fused: [],
      visual: [],
    },
    id: 'session-1',
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    settings: {
      handedness: 'right',
      maxFret: 24,
      remoteAnalysisEnabled: false,
      tuningMidiLowToHigh: [40, 45, 50, 55, 59, 64],
      visionEnabled: false,
    },
    status: 'complete',
    title: 'Fixture session',
    updatedAt: '2026-07-19T12:01:00.000Z',
  });

describe('session review projection', () => {
  it('layers append-only corrections and reverts without changing detector events', () => {
    const raw = baseSession();
    const correction = createReplacementCorrection(
      raw,
      { chordSymbol: 'Em7', eventId: 'chord-1' },
      { createdAtMs: 1200, id: 'correction-1' },
    );
    const corrected = SessionSchema.parse({ ...raw, corrections: [correction] });

    expect(
      projectReviewEvents(corrected).find(({ rawEvent }) => rawEvent.id === 'chord-1'),
    ).toMatchObject({
      correctedLabel: 'Em7',
      rawLabel: 'G',
      state: 'corrected',
    });
    expect(corrected.events.audio).toEqual(raw.events.audio);

    const revert = createRevertCorrection(corrected, 'chord-1', {
      createdAtMs: 1200,
      id: 'correction-2',
    });
    const reverted = SessionSchema.parse({
      ...corrected,
      corrections: [...corrected.corrections, revert],
    });
    expect(
      projectReviewEvents(reverted).find(({ rawEvent }) => rawEvent.id === 'chord-1'),
    ).toMatchObject({
      correctedLabel: 'G',
      state: 'raw',
    });
    expect(reverted.corrections).toHaveLength(2);
  });

  it('reports orphaned corrections instead of silently dropping their history', () => {
    const session = baseSession();
    const orphan = {
      author: 'user',
      chordSymbol: 'C',
      createdAtMs: 1,
      eventId: 'missing-event',
      id: 'orphan-1',
      operation: 'replace',
    } as const;
    const positionOnly = {
      author: 'user',
      createdAtMs: 2,
      eventId: 'note-1',
      id: 'future-position-1',
      operation: 'replace',
      positions: [{ confidence: 1, fret: 5, midi: 69, string: 1 }],
    } as const;
    const parsed = SessionSchema.parse({ ...session, corrections: [orphan, positionOnly] });
    expect(correctionProblems(parsed)).toEqual([
      {
        correctionId: 'orphan-1',
        message: 'The source event is no longer present in this session.',
      },
      {
        correctionId: 'future-position-1',
        message:
          'Fretboard-position corrections require a fused event and are not part of audio review.',
      },
    ]);
  });
});

describe('session export', () => {
  it('round-trips raw predictions, provenance, confidence, timing, and corrections through JSON', () => {
    const session = baseSession();
    const correction = createReplacementCorrection(
      session,
      { eventId: 'note-1', midi: 67 },
      { createdAtMs: 1200, id: 'correction-1' },
    );
    const corrected = SessionSchema.parse({ ...session, corrections: [correction] });
    const restored = importSessionJson(
      exportSessionJson(corrected, new Date('2026-07-19T13:00:00.000Z')),
    );
    expect(restored).toEqual(corrected);
  });

  it('exports timed note evidence as MIDI and refuses chord-only sessions', () => {
    const session = baseSession();
    expect(canExportSessionMidi(session)).toBe(true);
    const midi = exportSessionMidi(session);
    expect(new TextDecoder().decode(midi.slice(0, 4))).toBe('MThd');
    const chordOnly = SessionSchema.parse({
      ...session,
      events: {
        ...session.events,
        audio: session.events.audio.filter(({ kind }) => kind === 'chord'),
      },
    });
    expect(canExportSessionMidi(chordOnly)).toBe(false);
    expect(() => exportSessionMidi(chordOnly)).toThrow(/no finalized note events/i);
  });
});
