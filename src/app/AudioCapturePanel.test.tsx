import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InitialCaptureSnapshot, MicrophoneCapture, type CaptureSnapshot } from '../audio/capture';
import { createAppError, sessionTimestampMs } from '../shared';
import { AudioCapturePanel } from './AudioCapturePanel';
import { defaultMicrophoneCapture } from './audioCaptureController';

const mediaDevice = (deviceId: string, label: string): MediaDeviceInfo => ({
  deviceId,
  groupId: 'group-1',
  kind: 'audioinput',
  label,
  toJSON: () => ({}),
});

function captureWithSnapshot(
  snapshot: CaptureSnapshot,
  recording: MicrophoneCapture['currentRecording'] = null,
): MicrophoneCapture {
  const capture = new MicrophoneCapture();
  Object.defineProperty(capture, 'currentSnapshot', { get: () => snapshot });
  Object.defineProperty(capture, 'currentRecording', { get: () => recording });
  return capture;
}

describe('AudioCapturePanel', () => {
  it('does not dispose the shared capture controller during Strict Mode remount checks', () => {
    const dispose = vi.spyOn(defaultMicrophoneCapture, 'dispose');
    const view = render(
      <StrictMode>
        <AudioCapturePanel />
      </StrictMode>,
    );
    expect(dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('selects a reported microphone and starts only after user action', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({
      ...InitialCaptureSnapshot,
      device: {
        autoGainControl: true,
        channelCount: 1,
        deviceLabel: 'Interface input',
        echoCancellation: false,
        latencySeconds: 0.01,
        noiseSuppression: null,
        requestedDeviceId: null,
        sampleRate: 48_000,
      },
      state: 'idle',
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([
      mediaDevice('input-1', 'Guitar interface'),
      mediaDevice('input-2', 'Webcam microphone'),
    ]);
    const start = vi.spyOn(capture, 'start').mockResolvedValue();

    render(<AudioCapturePanel capture={capture} />);
    expect(screen.getByText('48,000 Hz')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Guitar interface' })).toBeVisible(),
    );
    await user.selectOptions(screen.getByLabelText('Input device'), 'input-2');
    await user.click(screen.getByRole('button', { name: 'Start microphone' }));
    expect(start).toHaveBeenCalledWith('input-2');
  });

  it('renders actionable clipping and capture errors', () => {
    const capture = captureWithSnapshot({
      ...InitialCaptureSnapshot,
      error: createAppError({
        category: 'device',
        code: 'microphone-not-readable',
        id: 'error-1',
        message: 'The microphone is busy.',
        occurredAtMs: sessionTimestampMs(0),
        retryable: true,
        severity: 'error',
        subsystem: 'audio-capture',
        userAction: 'select-device',
      }),
      state: 'recording',
      warning: 'clipping',
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);

    render(<AudioCapturePanel capture={capture} />);
    expect(screen.getByText(/input is clipping/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('The microphone is busy');
    expect(screen.getByRole('button', { name: 'Start microphone' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
  });

  it('runs a known-level software meter check without opening the microphone', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({
      ...InitialCaptureSnapshot,
      device: {
        autoGainControl: false,
        channelCount: 2,
        deviceLabel: 'Stereo interface',
        echoCancellation: false,
        latencySeconds: 0.01,
        noiseSuppression: false,
        requestedDeviceId: null,
        sampleRate: 48_000,
      },
      inputChannelMode: 'averaged',
      state: 'idle',
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
    const start = vi.spyOn(capture, 'start').mockResolvedValue();

    render(<AudioCapturePanel capture={capture} />);
    await user.click(screen.getByRole('button', { name: 'Test meter (−24 dBFS)' }));

    expect(screen.getByText(/Software meter check/)).toHaveTextContent('synthetic -24 dBFS signal');
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', '-24.0 dBFS');
    expect(screen.getByText('-24.0 dBFS')).toBeInTheDocument();
    expect(screen.getByText('Channel handling').nextElementSibling).toHaveTextContent(
      'Averaged to mono',
    );
    expect(start).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Return to microphone' }));
    expect(screen.queryByText(/Software meter check/)).not.toBeInTheDocument();
  });

  it('gives device-neutral guidance when multiple inputs are available', async () => {
    const capture = captureWithSnapshot({ ...InitialCaptureSnapshot, state: 'idle' });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([
      mediaDevice('interface-1', 'USB Interface Input 1'),
      mediaDevice('interface-2', 'USB Interface Input 2'),
    ]);

    render(<AudioCapturePanel capture={capture} />);
    await waitFor(() => expect(screen.getByText(/multiple audio inputs detected/i)).toBeVisible());
    expect(screen.getByText(/interface channel, or channel pair/i)).toBeVisible();
    expect(screen.getByLabelText('Input device')).toHaveValue('');
  });
});
