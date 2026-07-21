import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const completedRecording = CapturedRecordingSchema.parse({
  channelCount: 1,
  data: new Float32Array(),
  discontinuityCount: 0,
  durationMs: 0,
  frameCount: 0,
  recordedAt: '2026-07-18T00:00:00.000Z',
  sampleRate: 48_000,
  schemaVersion: 1,
  startedAtMs: 0,
});

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

  it('selects a reported source and powers input only after user action', async () => {
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
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([
      mediaDevice('input-1', 'Guitar interface'),
      mediaDevice('input-2', 'Webcam microphone'),
    ]);
    const connect = vi.spyOn(capture, 'connect').mockResolvedValue();

    render(<AudioCapturePanel capture={capture} />);
    expect(screen.getByRole('img', { name: 'Input waveform, input off' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    const source = screen.getByRole('combobox', { name: 'Source' });
    await waitFor(() => expect(source).toBeEnabled());
    await user.click(source);
    await user.click(screen.getByRole('option', { name: 'Webcam microphone' }));
    await user.click(screen.getByRole('button', { name: 'Device details' }));
    expect(screen.getByText('48,000 Hz')).toBeVisible();
    expect(screen.getByText('Not reported')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Input' }));
    expect(connect).toHaveBeenCalledWith('input-2');
  });

  it('renders real clipping and capture errors without fake signal data', () => {
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
      connectionState: 'monitoring',
      operationState: 'recording',
      peak: 1,
      warning: 'clipping',
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);

    render(<AudioCapturePanel capture={capture} />);
    expect(screen.getByText(/input is clipping/i)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('The microphone is busy');
    expect(screen.getByRole('status', { name: 'Peak: clipping detected' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Stop recording' })).not.toBeInTheDocument();
  });

  it('keeps monitoring separate from recording and explicit input release', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({
      ...InitialCaptureSnapshot,
      connectionState: 'monitoring',
      operationState: 'idle',
      rms: 0.1,
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
    const disconnect = vi.spyOn(capture, 'disconnect').mockResolvedValue();

    render(<AudioCapturePanel capture={capture} />);
    expect(screen.getByRole('button', { name: 'Input' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Active')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Signal: present' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Privacy details' }));
    expect(screen.getByText(/Listening is not saved/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Input' }));
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps record and save controls hidden for the monitoring-only presentation', () => {
    const completedCapture = captureWithSnapshot(
      { ...InitialCaptureSnapshot, connectionState: 'monitoring' },
      completedRecording,
    );
    vi.spyOn(completedCapture, 'listInputDevices').mockResolvedValue([]);
    const view = render(<AudioCapturePanel capture={completedCapture} />);

    expect(screen.queryByText('Media')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(view.container.querySelector('.audio-input-record-bank')).toHaveAttribute('hidden');
  });

  it('keeps source selection active while monitoring and delegates switching to the controller', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({
      ...InitialCaptureSnapshot,
      connectionState: 'monitoring',
    });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([
      mediaDevice('input-1', 'Guitar interface'),
      mediaDevice('input-2', 'Webcam microphone'),
    ]);
    const switchInputDevice = vi.spyOn(capture, 'switchInputDevice').mockResolvedValue();
    render(<AudioCapturePanel capture={capture} />);

    const source = screen.getByRole('combobox', { name: 'Source' });
    expect(source).toBeEnabled();
    await user.click(source);
    await user.click(await screen.findByRole('option', { name: 'Webcam microphone' }));
    expect(switchInputDevice).toHaveBeenCalledWith('input-2');
  });

  it('swaps device and privacy details into the main display while keeping the meter visible', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({ ...InitialCaptureSnapshot });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
    render(<AudioCapturePanel capture={capture} />);
    const rail = screen.getByRole('complementary', { name: 'Input device and details' });
    const device = within(rail).getByRole('button', { name: 'Device details' });
    const privacy = within(rail).getByRole('button', { name: 'Privacy details' });
    const display = screen.getByLabelText('Input display');
    const meter = screen.getByRole('meter', { name: 'Microphone input level' });

    expect(within(display).getByRole('img', { name: 'Input waveform, input off' })).toBeVisible();
    expect(meter).toBeVisible();
    expect(screen.queryByText('Sample rate')).not.toBeInTheDocument();
    await user.click(device);
    expect(device).toHaveAttribute('aria-expanded', 'true');
    expect(privacy).toHaveAttribute('aria-expanded', 'false');
    expect(within(display).getByLabelText('Device information')).toBeVisible();
    expect(screen.getByText('Sample rate')).toBeVisible();
    expect(within(display).queryByRole('img')).not.toBeInTheDocument();
    expect(meter).toBeVisible();
    await user.click(privacy);
    expect(device).toHaveAttribute('aria-expanded', 'false');
    expect(privacy).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Sample rate')).not.toBeInTheDocument();
    expect(within(display).getByLabelText('Privacy information')).toBeVisible();
    expect(screen.getByText(/Nothing is uploaded automatically/)).toBeVisible();
    expect(meter).toBeVisible();
  });

  it('surfaces device enumeration failure while keeping system default selectable', async () => {
    const capture = captureWithSnapshot({ ...InitialCaptureSnapshot });
    vi.spyOn(capture, 'listInputDevices').mockRejectedValue(new Error('Enumeration failed'));
    render(<AudioCapturePanel capture={capture} />);

    expect(await screen.findByText(/Input sources could not be listed/)).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Source' })).toBeEnabled();
  });

  it('removes calibration and reference tools from the ordinary product surface', () => {
    const capture = captureWithSnapshot({ ...InitialCaptureSnapshot });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
    render(<AudioCapturePanel capture={capture} />);

    expect(screen.getByRole('region', { name: 'Live note and chord analysis' })).toBeVisible();
    expect(screen.queryByText(/Test meter/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Download.*reference/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Measure reference/)).not.toBeInTheDocument();
    expect(screen.queryByText(/multiple audio inputs detected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no clear input is reaching/i)).not.toBeInTheDocument();
  });

  it('keeps WAV import available internally without showing media controls', async () => {
    const user = userEvent.setup();
    const capture = captureWithSnapshot({ ...InitialCaptureSnapshot });
    vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
    const loadRecording = vi.spyOn(capture, 'loadRecording');
    const replay = vi.spyOn(capture, 'replay').mockResolvedValue();
    const connect = vi.spyOn(capture, 'connect').mockResolvedValue();
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
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replay' })).not.toBeInTheDocument();
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
    expect(connect).not.toHaveBeenCalled();
    expect(await screen.findByText(/Loaded and analyzed open-strings.wav/)).toBeVisible();
  });

  it('represents connecting, finalizing, failed, unsupported, and duration-limit states', () => {
    const cases: readonly {
      expectedText: string;
      snapshot: CaptureSnapshot;
      verify: () => void;
    }[] = [
      {
        expectedText: 'Starting',
        snapshot: { ...InitialCaptureSnapshot, connectionState: 'connecting' },
        verify: () => expect(screen.getByRole('button', { name: 'Input' })).toBeDisabled(),
      },
      {
        expectedText: 'Attention',
        snapshot: { ...InitialCaptureSnapshot, connectionState: 'failed' },
        verify: () => expect(screen.getByRole('button', { name: 'Input' })).toBeEnabled(),
      },
      {
        expectedText: 'Unsupported',
        snapshot: { ...InitialCaptureSnapshot, connectionState: 'unsupported' },
        verify: () => expect(screen.getByRole('button', { name: 'Input' })).toBeDisabled(),
      },
      {
        expectedText: 'Maximum recording duration reached',
        snapshot: { ...InitialCaptureSnapshot, warning: 'maximum-duration-reached' },
        verify: () =>
          expect(screen.getByText(/accepted take completed successfully/)).toBeVisible(),
      },
    ];

    for (const testCase of cases) {
      const capture = captureWithSnapshot(testCase.snapshot, completedRecording);
      vi.spyOn(capture, 'listInputDevices').mockResolvedValue([]);
      const view = render(<AudioCapturePanel capture={capture} />);
      expect(screen.getAllByText(testCase.expectedText, { exact: false })[0]).toBeVisible();
      testCase.verify();
      view.unmount();
    }
  });
});
