import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { InitialCaptureSnapshot } from '../audio/capture';
import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  SessionSchema,
} from '../shared';
import { createReplacementCorrection, exportSessionJson } from '../session';
import type { AudioSessionSnapshot } from './audioSessionController';
import { SessionReviewPanel } from './SessionReviewPanel';

const session = SessionSchema.parse({
  corrections: [],
  createdAt: '2026-07-19T12:00:00.000Z',
  events: {
    audio: [
      ChordEventSchema.parse({
        candidates: [
          {
            confidence: 0.91,
            pitchClasses: ['G', 'B', 'D'],
            quality: 'major',
            rank: 1,
            root: 'G',
            score: 0.91,
            symbol: 'G',
          },
          {
            confidence: 0.08,
            pitchClasses: ['G', 'C', 'D'],
            quality: 'suspended-4',
            rank: 2,
            root: 'G',
            score: 0.08,
            symbol: 'Gsus4',
          },
        ],
        id: 'chord-1',
        kind: 'chord',
        lifecycle: 'finalized',
        provenance: {
          algorithm: 'test-decoder',
          generatedAtMs: 1000,
          runId: 'run-1',
          subsystem: 'polyphonic-analysis',
          version: '1.0.0',
        },
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        time: { endMs: 1000, startMs: 0 },
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
  title: 'Review fixture',
  updatedAt: '2026-07-19T12:01:00.000Z',
});

const snapshot: AudioSessionSnapshot = {
  capture: InitialCaptureSnapshot,
  keyInterpretations: [],
  pendingRevision: false,
  savedSessions: [],
  scaleInterpretations: [],
  session,
  storageError: null,
  storageState: 'idle',
};

const noteEvent = NoteEventSchema.parse({
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
});

const noteSession = SessionSchema.parse({
  ...session,
  events: { ...session.events, audio: [noteEvent, ...session.events.audio] },
  title: '  Symbols & spaces!  ',
});

const controllerFor = (currentSnapshot: AudioSessionSnapshot, appendCorrection = vi.fn()) => ({
  appendCorrection,
  currentSnapshot,
  deleteSavedSession: vi.fn(() => Promise.resolve()),
  loadSavedSession: vi.fn(() => Promise.resolve()),
  refreshSavedSessions: vi.fn(() => Promise.resolve()),
  replaceWithImportedSession: vi.fn(),
  revertCorrection: vi.fn(),
  saveSession: vi.fn(() => Promise.resolve()),
  subscribe: vi.fn(() => () => undefined),
});

describe('SessionReviewPanel', () => {
  it('shows raw evidence separately and sends typed correction commands to the controller', async () => {
    const appendCorrection = vi.fn();
    const controller = {
      appendCorrection,
      currentSnapshot: snapshot,
      deleteSavedSession: vi.fn(() => Promise.resolve()),
      loadSavedSession: vi.fn(() => Promise.resolve()),
      refreshSavedSessions: vi.fn(() => Promise.resolve()),
      replaceWithImportedSession: vi.fn(),
      revertCorrection: vi.fn(),
      saveSession: vi.fn(() => Promise.resolve()),
      subscribe: vi.fn(() => () => undefined),
    };
    const user = userEvent.setup();
    render(<SessionReviewPanel controller={controller} embedded />);

    expect(screen.getByText('Raw evidence is never overwritten')).toBeVisible();
    expect(screen.getByRole('button', { name: /export midi/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Gchord.*finalized/i }));
    expect(screen.getByText('Gsus4', { exact: false })).toBeVisible();
    const input = screen.getByRole('textbox', { name: /correct chord symbol/i });
    await user.clear(input);
    await user.type(input, 'Em7');
    await user.click(screen.getByRole('button', { name: /apply correction/i }));

    expect(appendCorrection).toHaveBeenCalledWith(
      { chordSymbol: 'Em7', eventId: 'chord-1' },
      undefined,
    );
  });

  it('renders null-session, saving, and storage-error states without enabling exports', async () => {
    const currentSnapshot = {
      ...snapshot,
      session: null,
      storageError: 'Storage is unavailable',
      storageState: 'saving' as const,
    };
    const controller = controllerFor(currentSnapshot);
    render(<SessionReviewPanel controller={controller} />);
    expect(screen.getByText('No completed session')).toBeVisible();
    expect(screen.getByText(/record or import audio/i)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Storage is unavailable');
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeDisabled();
    expect(screen.getByText('No locally saved sessions.')).toBeVisible();
    await waitFor(() => expect(controller.refreshSavedSessions).toHaveBeenCalledOnce());
  });

  it('validates note corrections, preserves a trimmed reason, and exposes thrown errors', async () => {
    const user = userEvent.setup();
    const appendCorrection = vi.fn();
    const controller = controllerFor({ ...snapshot, session: noteSession }, appendCorrection);
    const { rerender } = render(<SessionReviewPanel controller={controller} embedded />);
    await user.click(screen.getByRole('button', { name: /A4note.*finalized/i }));
    const midi = screen.getByRole('spinbutton', { name: /correct midi note/i });
    await user.clear(midi);
    await user.type(midi, '128');
    await user.click(screen.getByRole('button', { name: /apply correction/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/whole MIDI note number/);

    await user.clear(midi);
    await user.type(midi, '67');
    await user.type(screen.getByRole('textbox', { name: /reason/i }), '  clearer pitch  ');
    await user.click(screen.getByRole('button', { name: /apply correction/i }));
    expect(appendCorrection).toHaveBeenCalledWith({ eventId: 'note-1', midi: 67 }, 'clearer pitch');

    appendCorrection.mockImplementationOnce(() => {
      throw new Error('Correction write failed');
    });
    await user.click(screen.getByRole('button', { name: /apply correction/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Correction write failed');

    rerender(<SessionReviewPanel controller={controller} embedded />);
  });

  it('renders correction problems and permits reverting a corrected event', async () => {
    const user = userEvent.setup();
    const correction = createReplacementCorrection(
      noteSession,
      { eventId: 'note-1', midi: 67 },
      { createdAtMs: 700, id: 'correction-1' },
    );
    const orphan = {
      author: 'user',
      chordSymbol: 'C',
      createdAtMs: 800,
      eventId: 'missing',
      id: 'orphan-1',
      operation: 'replace',
    } as const;
    const corrected = SessionSchema.parse({
      ...noteSession,
      corrections: [correction, orphan],
    });
    const controller = controllerFor({ ...snapshot, session: corrected });
    render(<SessionReviewPanel controller={controller} embedded />);
    expect(screen.getByText('Correction history needs attention')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /G4note.*finalized/i }));
    await user.click(screen.getByRole('button', { name: 'Use original' }));
    expect(controller.revertCorrection).toHaveBeenCalledWith('note-1');
  });

  it('loads and deletes saved sessions and describes recording availability', async () => {
    const user = userEvent.setup();
    const savedSessions = [
      {
        createdAt: session.createdAt,
        durationMs: 1_000,
        hasRecording: true,
        id: 'saved-a',
        title: 'With audio',
        updatedAt: session.updatedAt,
      },
      {
        createdAt: session.createdAt,
        durationMs: null,
        hasRecording: false,
        id: 'saved-b',
        title: 'Without audio',
        updatedAt: session.updatedAt,
      },
    ];
    const controller = controllerFor({ ...snapshot, savedSessions });
    render(<SessionReviewPanel controller={controller} embedded />);
    expect(screen.getByText('Replayable audio included')).toBeVisible();
    expect(screen.getByText('Structured session only')).toBeVisible();
    const loadButton = screen.getAllByRole('button', { name: 'Load' }).at(0);
    const deleteButton = screen.getAllByRole('button', { name: 'Delete' }).at(1);
    if (loadButton === undefined || deleteButton === undefined) {
      throw new Error('Expected saved-session action buttons.');
    }
    await user.click(loadButton);
    await user.click(deleteButton);
    expect(controller.loadSavedSession).toHaveBeenCalledWith('saved-a');
    expect(controller.deleteSavedSession).toHaveBeenCalledWith('saved-b');
  });

  it('imports valid JSON, reports invalid imports, and ignores an empty file selection', async () => {
    const controller = controllerFor(snapshot);
    const { container } = render(<SessionReviewPanel controller={controller} embedded />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error('Expected the session import input.');
    const valid = new File(['ignored'], 'session.json', { type: 'application/json' });
    Object.defineProperty(valid, 'text', {
      value: () => Promise.resolve(exportSessionJson(session)),
    });
    fireEvent.change(input, { target: { files: [valid] } });
    await waitFor(() =>
      expect(controller.replaceWithImportedSession).toHaveBeenCalledWith(session),
    );

    const invalid = new File(['ignored'], 'broken.json', { type: 'application/json' });
    Object.defineProperty(invalid, 'text', { value: () => Promise.resolve('{') });
    fireEvent.change(input, { target: { files: [invalid] } });
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.change(input, { target: { files: [] } });
    expect(controller.replaceWithImportedSession).toHaveBeenCalledTimes(1);
  });

  it('downloads JSON and MIDI using a safe filename', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <SessionReviewPanel
        controller={controllerFor({ ...snapshot, session: noteSession })}
        embedded
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    await user.click(screen.getByRole('button', { name: 'Export MIDI' }));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
