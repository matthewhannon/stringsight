import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { InitialAudioAnalysisSnapshot } from '../../../audio/analysis';
import { InitialCaptureSnapshot } from '../../../audio/capture';
import { InitialPolyphonicAnalysisSnapshot } from '../../../audio/polyphonic';
import type { PracticeAudioModel } from '../usePracticeAudio';
import { Transport } from './Transport';

const audioModel = (
  operationState: PracticeAudioModel['capture']['operationState'] = 'idle',
  elapsedMs = 0,
  recordEnabled = false,
): PracticeAudioModel => ({
  actionError: null,
  capabilities: {
    canConnect: !recordEnabled,
    canDisconnect: recordEnabled,
    canPause: operationState === 'recording',
    canRecord: recordEnabled && operationState === 'idle',
    canReplay: false,
    canResume: operationState === 'paused',
    canStop: operationState === 'recording' || operationState === 'paused',
    canStopReplay: false,
  },
  capture: { ...InitialCaptureSnapshot, elapsedMs, operationState },
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
});

describe('Transport', () => {
  it('shows passive readiness without false playback, seeking, or marker controls', () => {
    render(<Transport audio={audioModel()} />);

    expect(screen.getByText('Recording starts from the microphone controls')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /play|previous|next|marker|seek/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /loop|metronome|count-in/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('exposes recording only when the real capture capability is available', async () => {
    const user = userEvent.setup();
    const audio = audioModel('idle', 0, true);
    render(<Transport audio={audio} />);

    const record = screen.getByRole('button', { name: 'Record take' });
    expect(record.querySelector('svg')).not.toBeNull();
    await user.click(record);
    expect(audio.toggleRecord).toHaveBeenCalledOnce();
  });

  it.each(['recording', 'paused'] as const)('shows %s as an active local recording', (state) => {
    render(<Transport audio={audioModel(state, 61_250, true)} />);
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeEnabled();
    expect(screen.getByText('01:01.2')).toBeVisible();
    expect(screen.getByText('Recording on this device')).toBeVisible();
  });
});
