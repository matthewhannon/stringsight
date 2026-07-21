import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { InitialCaptureSnapshot } from '../audio/capture';
import { ChordEventSchema, CONTRACT_SCHEMA_VERSION, SessionSchema } from '../shared';
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
});
