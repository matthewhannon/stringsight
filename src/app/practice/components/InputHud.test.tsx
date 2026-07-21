import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { InitialAudioAnalysisSnapshot } from '../../../audio/analysis';
import { InitialCaptureSnapshot } from '../../../audio/capture';
import { InitialPolyphonicAnalysisSnapshot } from '../../../audio/polyphonic';
import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  createAppError,
  sessionTimestampMs,
} from '../../../shared';
import type { PracticeAudioModel } from '../usePracticeAudio';
import { InputHud } from './InputHud';

const noteEvent = NoteEventSchema.parse({
  candidates: [
    {
      centsOffset: -52,
      confidence: 0.9,
      evidence: ['test'],
      frequencyHz: 438,
      midi: 69,
      noteName: 'A4',
      pitchClass: 'A',
      rank: 1,
      score: 0.9,
    },
  ],
  diagnostics: { centsSpread: 2, pitchState: 'tracking' },
  id: 'note-1',
  kind: 'note',
  lifecycle: 'provisional',
  provenance: {
    algorithm: 'test',
    generatedAtMs: 100,
    runId: 'run-1',
    subsystem: 'audio-analysis',
    version: '1',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 200, startMs: 100 },
});

const chordEvent = ChordEventSchema.parse({
  candidates: [
    {
      confidence: 0.86,
      pitchClasses: ['A', 'C', 'E'],
      quality: 'minor',
      rank: 1,
      root: 'A',
      score: 0.86,
      symbol: 'Am',
    },
  ],
  id: 'chord-1',
  kind: 'chord',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'test',
    generatedAtMs: 100,
    runId: 'run-1',
    subsystem: 'polyphonic-analysis',
    version: '1',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 200, startMs: 100 },
});

const audioModel = (overrides: Partial<PracticeAudioModel> = {}): PracticeAudioModel => ({
  actionError: null,
  capabilities: {
    canConnect: true,
    canDisconnect: false,
    canPause: false,
    canRecord: false,
    canReplay: false,
    canResume: false,
    canStop: false,
    canStopReplay: false,
  },
  capture: InitialCaptureSnapshot,
  chordAnalysis: InitialPolyphonicAnalysisSnapshot,
  connect: vi.fn(),
  devices: [],
  disconnect: vi.fn(),
  noteAnalysis: InitialAudioAnalysisSnapshot,
  pauseOrResume: vi.fn(),
  refreshDevices: vi.fn(),
  replay: vi.fn(),
  selectedDeviceId: '',
  session: {
    capture: InitialCaptureSnapshot,
    keyInterpretations: [],
    pendingRevision: false,
    savedSessions: [],
    scaleInterpretations: [],
    session: null,
    storageError: null,
    storageState: 'idle',
  },
  setSelectedDeviceId: vi.fn(),
  stopReplay: vi.fn(),
  toggleRecord: vi.fn(),
  ...overrides,
});

const renderHud = (audio: PracticeAudioModel, detailsOpen = false, settingsOpen = false) => {
  const onDetailsToggle = vi.fn();
  const onSettingsToggle = vi.fn();
  render(
    <InputHud
      audio={audio}
      detailsOpen={detailsOpen}
      onDetailsToggle={onDetailsToggle}
      onSettingsToggle={onSettingsToggle}
      settingsOpen={settingsOpen}
    />,
  );
  return { onDetailsToggle, onSettingsToggle };
};

describe('InputHud', () => {
  it.each([
    [
      {
        error: createAppError({
          category: 'device',
          code: 'capture-failed',
          id: 'capture-error',
          message: 'Capture failed',
          occurredAtMs: sessionTimestampMs(0),
          retryable: true,
          severity: 'error',
          subsystem: 'audio-capture',
          userAction: 'retry',
        }),
      },
      'Capture failed',
    ],
    [{ warning: 'clipping' }, 'Clipping detected'],
    [{ warning: 'device-ended' }, 'Microphone disconnected'],
    [{ warning: 'silence' }, 'No clear input detected'],
    [{ warning: 'maximum-duration-reached' }, 'Recording limit reached'],
    [{ operationState: 'recording' }, 'Recording locally'],
    [{ operationState: 'paused' }, 'Recording paused'],
    [{ operationState: 'finalizing' }, 'Finalizing take'],
    [{ operationState: 'replaying' }, 'Replaying take'],
    [{ connectionState: 'monitoring' }, 'Connected'],
    [{ connectionState: 'connecting' }, 'Connecting'],
    [{ connectionState: 'failed' }, 'Needs attention'],
    [{ connectionState: 'unsupported' }, 'Unsupported'],
  ] as const)('labels capture state %#', (capture, label) => {
    renderHud(audioModel({ capture: { ...InitialCaptureSnapshot, ...capture } }));
    expect(screen.getByText(label)).toBeVisible();
  });

  it('prioritizes action errors and renders the disconnected empty state', () => {
    renderHud(audioModel({ actionError: 'Action failed' }));
    expect(screen.getByText('Action failed')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Connect input to begin')).toBeVisible();
    expect(screen.getAllByText(/Listening|â€”/).length).toBeGreaterThan(0);
  });

  it('renders named-device note/chord evidence, clipping, and open-state actions', async () => {
    const user = userEvent.setup();
    const capture = {
      ...InitialCaptureSnapshot,
      connectionState: 'monitoring' as const,
      device: {
        autoGainControl: false,
        channelCount: 1,
        deviceLabel: 'Studio input',
        echoCancellation: false,
        latencySeconds: 0.01,
        noiseSuppression: false,
        requestedDeviceId: 'mic-1',
        sampleRate: 48_000,
      },
      peak: 1.4,
      warning: 'clipping' as const,
    };
    const actions = renderHud(
      audioModel({
        capture,
        chordAnalysis: { ...InitialPolyphonicAnalysisSnapshot, currentChord: chordEvent },
        noteAnalysis: { ...InitialAudioAnalysisSnapshot, currentEvent: noteEvent },
      }),
      true,
      true,
    );

    expect(screen.getByText('Studio input')).toBeVisible();
    expect(screen.getByText('Am')).toBeVisible();
    expect(screen.getByText(/86% match strength/)).toBeVisible();
    expect(screen.getByText('A4')).toBeVisible();
    expect(screen.getByText(/^-52/)).toBeVisible();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      '100 percent, clipping detected',
    );
    await user.click(screen.getByRole('button', { name: 'Hide analysis' }));
    await user.click(screen.getByRole('button', { name: 'Input settings' }));
    expect(actions.onDetailsToggle).toHaveBeenCalledOnce();
    expect(actions.onSettingsToggle).toHaveBeenCalledOnce();
  });

  it('handles empty device labels, unavailable confidence, and positive cents', () => {
    const noCandidateChord = { ...chordEvent, candidates: [] };
    const positiveNote = NoteEventSchema.parse({
      ...noteEvent,
      candidates: [{ ...noteEvent.candidates[0], centsOffset: 7 }],
    });
    renderHud(
      audioModel({
        capture: {
          ...InitialCaptureSnapshot,
          connectionState: 'monitoring',
          device: {
            autoGainControl: null,
            channelCount: 1,
            deviceLabel: '',
            echoCancellation: null,
            latencySeconds: null,
            noiseSuppression: null,
            requestedDeviceId: 'mic',
            sampleRate: 44_100,
          },
        },
        chordAnalysis: { ...InitialPolyphonicAnalysisSnapshot, currentChord: noCandidateChord },
        noteAnalysis: { ...InitialAudioAnalysisSnapshot, currentEvent: positiveNote },
      }),
    );
    expect(screen.getByText('Default microphone')).toBeVisible();
    expect(screen.getByText(/confidence unavailable/)).toBeVisible();
    expect(screen.getByText(/^\+7/)).toBeVisible();
  });
});
