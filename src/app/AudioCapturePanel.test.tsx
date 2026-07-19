import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  CapturedRecordingSchema,
  InitialCaptureSnapshot,
  MicrophoneCapture,
  encodeMonoPcm16Wav,
  type CaptureSnapshot,
} from '../audio/capture';
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

  it('exposes pause, resume, and stop controls for an active session', async () => {
    const user = userEvent.setup();
    const recordingCapture = captureWithSnapshot({
      ...InitialCaptureSnapshot,
      state: 'recording',
    });
    vi.spyOn(recordingCapture, 'listInputDevices').mockResolvedValue([]);
    const pause = vi.spyOn(recordingCapture, 'pause').mockResolvedValue();
    const recordingView = render(<AudioCapturePanel capture={recordingCapture} />);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pause).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled();
    recordingView.unmount();

    const pausedCapture = captureWithSnapshot({ ...InitialCaptureSnapshot, state: 'paused' });
    vi.spyOn(pausedCapture, 'listInputDevices').mockResolvedValue([]);
    const resume = vi.spyOn(pausedCapture, 'resume').mockResolvedValue();
    const stop = vi.spyOn(pausedCapture, 'stop').mockResolvedValue(
      CapturedRecordingSchema.parse({
        channelCount: 1,
        data: new Float32Array(),
        discontinuityCount: 0,
        durationMs: 0,
        frameCount: 0,
        recordedAt: '2026-07-18T00:00:00.000Z',
        sampleRate: 48_000,
        schemaVersion: 1,
        startedAtMs: 0,
      }),
    );
    render(<AudioCapturePanel capture={pausedCapture} />);

    expect(screen.getByText('Paused')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(resume).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Start microphone' })).toBeDisabled();
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

  it('loads a WAV and analyzes it through recording replay without opening a microphone', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({ ...InitialCaptureSnapshot, state: 'idle' });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
    const loadRecording = vi.spyOn(capture, 'loadRecording');
    const replay = vi.spyOn(capture, 'replay').mockResolvedValue();
    const start = vi.spyOn(capture, 'start').mockResolvedValue();
    const bytes = encodeMonoPcm16Wav(
      CapturedRecordingSchema.parse({
        channelCount: 1,
        data: new Float32Array([0, 0.5, 0]),
        discontinuityCount: 0,
        durationMs: 3,
        frameCount: 3,
        recordedAt: '2026-07-18T00:00:00.000Z',
        sampleRate: 1_000,
        schemaVersion: 1,
        startedAtMs: 0,
      }),
    );
    const file = new File([bytes], 'open-strings.wav', {
      lastModified: Date.parse('2026-07-18T00:00:00.000Z'),
      type: 'audio/wav',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(bytes.buffer.slice(0)),
    });

    const view = render(<AudioCapturePanel capture={capture} />);
    expect(screen.getByRole('button', { name: 'Load & analyze WAV' })).toBeVisible();
    const fileInput = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    if (fileInput === null) throw new Error('Recording file input was not rendered.');
    await user.upload(fileInput, file);

    await waitFor(() => expect(loadRecording).toHaveBeenCalledOnce());
    expect(loadRecording.mock.calls[0]?.[0]).toMatchObject({
      frameCount: 3,
      recordedAt: '2026-07-18T00:00:00.000Z',
      sampleRate: 1_000,
    });
    expect(replay).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(await screen.findByText(/Loaded and analyzed open-strings.wav/)).toBeVisible();
  });
});
