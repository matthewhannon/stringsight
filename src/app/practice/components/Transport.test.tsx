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

const renderTransport = (audio: PracticeAudioModel, playing = false, tempo = 96) => {
  const callbacks = {
    onCountInToggle: vi.fn(),
    onLoopToggle: vi.fn(),
    onMetronomeToggle: vi.fn(),
    onPlayingChange: vi.fn(),
    onTempoChange: vi.fn(),
  };
  render(
    <Transport
      audio={audio}
      countIn={false}
      looping={false}
      metronome={false}
      {...callbacks}
      playing={playing}
      tempo={tempo}
    />,
  );
  return callbacks;
};

describe('Transport', () => {
  it('shows disconnected placeholder state and dispatches playback/options/tempo actions', async () => {
    const user = userEvent.setup();
    const callbacks = renderTransport(audioModel(), false, 40);
    expect(screen.getByRole('button', { name: 'Connect microphone to record' })).toBeDisabled();
    expect(screen.getByText('00:31.8')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Play placeholder reference' }));
    await user.click(screen.getByRole('button', { name: 'Loop range' }));
    await user.click(screen.getByRole('button', { name: 'Metronome' }));
    await user.click(screen.getByRole('button', { name: /Count-in/ }));
    await user.click(screen.getByRole('button', { name: 'Decrease tempo' }));
    expect(callbacks.onPlayingChange).toHaveBeenCalledWith(true);
    expect(callbacks.onLoopToggle).toHaveBeenCalledOnce();
    expect(callbacks.onMetronomeToggle).toHaveBeenCalledOnce();
    expect(callbacks.onCountInToggle).toHaveBeenCalledOnce();
    expect(callbacks.onTempoChange).toHaveBeenCalledWith(40);
  });

  it('records from an enabled idle state and caps tempo increases', async () => {
    const user = userEvent.setup();
    const audio = audioModel('idle', 1_234, true);
    const callbacks = renderTransport(audio, true, 180);
    expect(screen.getByRole('button', { name: 'Record take' })).toBeEnabled();
    expect(screen.getByText('00:01.2')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Record take' }));
    await user.click(screen.getByRole('button', { name: 'Pause placeholder playback' }));
    await user.click(screen.getByRole('button', { name: 'Increase tempo' }));
    expect(audio.toggleRecord).toHaveBeenCalledOnce();
    expect(callbacks.onPlayingChange).toHaveBeenCalledWith(false);
    expect(callbacks.onTempoChange).toHaveBeenCalledWith(180);
  });

  it.each(['recording', 'paused'] as const)('shows %s as an active local recording', (state) => {
    renderTransport(audioModel(state, 61_250, true));
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeEnabled();
    expect(screen.getByText('01:01.2')).toBeVisible();
    expect(screen.getByText('Recording locally')).toBeVisible();
  });
});
