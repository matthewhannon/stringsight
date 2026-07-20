import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CapturedRecordingSchema,
  MicrophoneCapture,
  PcmChunkSchema,
  amplitudeToDbfs,
  analyzePcm,
  createCalibrationTone,
  createCalibrationReferenceRecording,
  decodePcmWav,
  decodePcmWavRecording,
  dbfsToAmplitude,
  dbfsToMeterPercent,
  downsampleWaveform,
  encodeMonoPcm16Wav,
  averageChannelSample,
  measureCalibrationTone,
  replayRecording,
  type CaptureSnapshot,
  type PcmChunk,
  type TransportInboundMessage,
  type TransportOutboundMessage,
} from './index';

class FakeAudioNode {
  disconnected = false;

  connect<T>(destination: T): T {
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeTrack extends EventTarget {
  label = 'Fake guitar input';
  stopped = false;

  getSettings() {
    return {
      autoGainControl: false,
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      sampleRate: 48_000,
    };
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  audioWorklet = { addModule: vi.fn(async () => Promise.resolve()) };
  baseLatency = 0.01;
  currentTime = 1;
  destination = new FakeAudioNode();
  sampleRate = 48_000;
  state: AudioContextState = 'running';

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  createMediaStreamSource(): FakeAudioNode {
    return new FakeAudioNode();
  }

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
}

type PortMessageHandler = ((event: MessageEvent<unknown>) => void) | null;

class FakeAudioWorkletNode extends FakeAudioNode {
  static instances: FakeAudioWorkletNode[] = [];
  port = {
    onmessage: null as PortMessageHandler,
    postMessage: (message: unknown) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) return;
      if (message.type === 'start-recording') {
        queueMicrotask(() => this.emit({ type: 'recording-started' }));
      } else if (message.type === 'pause-recording') {
        queueMicrotask(() => this.emit({ type: 'recording-paused' }));
      } else if (message.type === 'resume-recording') {
        queueMicrotask(() => this.emit({ type: 'recording-resumed' }));
      } else if (message.type === 'stop-recording') {
        queueMicrotask(() => this.emit({ type: 'recording-stopped' }));
      }
    },
  };

  constructor() {
    super();
    FakeAudioWorkletNode.instances.push(this);
  }

  emit(data: unknown): void {
    this.port.onmessage?.(new MessageEvent('message', { data }));
  }
}

class FakeWorker {
  static acknowledgeChunks = true;
  static instances: FakeWorker[] = [];
  chunks: PcmChunk[] = [];
  onerror: ((event: Event) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<TransportOutboundMessage>) => void) | null = null;
  recordedAt = '';
  sampleRate = 48_000;
  startedAtMs = 0;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: TransportInboundMessage): void {
    if (message.type === 'initialize') {
      this.recordedAt = message.recordedAt;
      this.sampleRate = message.sampleRate;
      this.startedAtMs = message.startedAtMs;
      queueMicrotask(() => this.emit({ type: 'ready' }));
      return;
    }
    if (message.type === 'chunk') {
      this.chunks.push({ ...message.chunk, data: message.chunk.data.slice() });
      if (FakeWorker.acknowledgeChunks) {
        const bufferedFrames = this.chunks.reduce((total, chunk) => total + chunk.frameCount, 0);
        queueMicrotask(() =>
          this.emit({
            bufferedFrames,
            discontinuityCount: this.chunks.filter((chunk) => chunk.diagnostics.discontinuity)
              .length,
            sequence: message.chunk.sequence,
            type: 'acknowledged',
          }),
        );
      }
      return;
    }
    if (message.type === 'finish') {
      const frameCount = this.chunks.reduce((total, chunk) => total + chunk.frameCount, 0);
      const data = new Float32Array(frameCount);
      let offset = 0;
      for (const chunk of this.chunks) {
        data.set(chunk.data, offset);
        offset += chunk.frameCount;
      }
      queueMicrotask(() =>
        this.emit({
          recording: CapturedRecordingSchema.parse({
            channelCount: 1,
            data,
            discontinuityCount: this.chunks.filter((chunk) => chunk.diagnostics.discontinuity)
              .length,
            durationMs: (frameCount / this.sampleRate) * 1_000,
            frameCount,
            recordedAt: this.recordedAt,
            sampleRate: this.sampleRate,
            schemaVersion: 1,
            startedAtMs: this.startedAtMs,
          }),
          type: 'finalized',
        }),
      );
      return;
    }
    this.chunks = [];
  }

  emit(message: TransportOutboundMessage): void {
    this.onmessage?.(new MessageEvent('message', { data: message }));
  }

  terminate(): void {
    this.terminated = true;
  }
}

let fakeTrack = new FakeTrack();
const fakeStream = {
  getAudioTracks: () => [fakeTrack],
  getTracks: () => [fakeTrack],
} as unknown as MediaStream;
const getUserMedia = vi.fn<(constraints: MediaStreamConstraints) => Promise<MediaStream>>(() =>
  Promise.resolve(fakeStream),
);
const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>(() =>
  Promise.resolve([
    {
      deviceId: 'fake-input',
      groupId: 'fake-group',
      kind: 'audioinput',
      label: 'Fake input',
      toJSON: () => ({}),
    },
    {
      deviceId: 'camera',
      groupId: 'fake-group',
      kind: 'videoinput',
      label: 'Fake camera',
      toJSON: () => ({}),
    },
  ]),
);

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioWorkletNode.instances = [];
  FakeWorker.instances = [];
  FakeWorker.acknowledgeChunks = true;
  fakeTrack = new FakeTrack();
  getUserMedia.mockClear();
  enumerateDevices.mockClear();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { enumerateDevices, getUserMedia },
  });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PCM signal utilities', () => {
  it('averages every available input channel without switching sources', () => {
    const left = new Float32Array([0.8, 0.2, -0.4]);
    const right = new Float32Array([0.2, 0.6, 0.4]);
    expect(averageChannelSample([left, right], 0)).toBeCloseTo(0.5);
    expect(averageChannelSample([left, right], 1)).toBeCloseTo(0.4);
    expect(averageChannelSample([left, right], 2)).toBeCloseTo(0);
    expect(averageChannelSample([], 0)).toBe(0);
  });

  it('maps normalized amplitudes to a logarithmic dBFS meter', () => {
    expect(amplitudeToDbfs(1)).toBe(0);
    expect(amplitudeToDbfs(0.1)).toBeCloseTo(-20);
    expect(amplitudeToDbfs(0.01)).toBeCloseTo(-40);
    expect(amplitudeToDbfs(0)).toBe(-80);
    expect(dbfsToMeterPercent(-60)).toBe(0);
    expect(dbfsToMeterPercent(-30)).toBe(50);
    expect(dbfsToMeterPercent(0)).toBe(100);
    expect(dbfsToMeterPercent(-80)).toBe(0);
  });

  it('generates a PCM calibration tone with an exact known peak level', () => {
    const samples = createCalibrationTone({ peakDbfs: -24 });
    const result = analyzePcm(samples);
    expect(samples).toHaveLength(4_800);
    expect(result.peak).toBeCloseTo(dbfsToAmplitude(-24), 6);
    expect(amplitudeToDbfs(result.peak)).toBeCloseTo(-24, 5);
    expect(result.rms).toBeCloseTo(dbfsToAmplitude(-24) / Math.sqrt(2), 5);
    expect(result.clippingSamples).toBe(0);
  });

  it('creates and measures a downloadable calibration reference independently of phase', () => {
    const reference = createCalibrationReferenceRecording({ peakDbfs: -24 });
    expect(reference.sampleRate).toBe(48_000);
    expect(reference.durationMs).toBe(5_000);
    expect(reference.frameCount).toBe(240_000);
    expect(reference.data.slice(0, 24_000).every((sample) => sample === 0)).toBe(true);

    const shiftedAndAttenuated = new Float32Array(reference.data.length + 137);
    for (let index = 0; index < reference.data.length; index += 1) {
      shiftedAndAttenuated[index + 137] = (reference.data[index] ?? 0) * 0.5;
    }
    const measurement = measureCalibrationTone({
      data: shiftedAndAttenuated,
      sampleRate: reference.sampleRate,
    });
    expect(measurement.detected).toBe(true);
    expect(measurement.observedPeakDbfs).toBeCloseTo(-30.02, 1);
    expect(measurement.deltaDb).toBeCloseTo(-6.02, 1);
  });

  it('rejects an invalid calibration measurement and reports missing reference audio', () => {
    expect(() =>
      measureCalibrationTone({ data: new Float32Array(10), sampleRate: 48_000 }),
    ).toThrow(/shorter/);
    const measurement = measureCalibrationTone({
      data: new Float32Array(12_000),
      sampleRate: 48_000,
    });
    expect(measurement.detected).toBe(false);
    expect(measurement.observedPeakDbfs).toBe(-80);
  });

  it('computes RMS, peak, clipping, and silence without exceeding normalized bounds', () => {
    expect(analyzePcm(new Float32Array([0, 0, 0]))).toEqual({
      clippingSamples: 0,
      peak: 0,
      rms: 0,
      silent: true,
    });
    const result = analyzePcm(new Float32Array([-1, 0.5, 1]));
    expect(result.clippingSamples).toBe(2);
    expect(result.peak).toBe(1);
    expect(result.rms).toBeCloseTo(Math.sqrt(0.75));
    expect(result.silent).toBe(false);
  });

  it('downsamples by retaining the strongest signed sample in each bucket', () => {
    expect(downsampleWaveform(new Float32Array([0.1, -0.8, 0.2, 0.6]), 2)).toEqual([
      expect.closeTo(-0.8),
      expect.closeTo(0.6),
    ]);
    expect(downsampleWaveform(new Float32Array(), 10)).toEqual([]);
    expect(downsampleWaveform(new Float32Array([1]), 0)).toEqual([]);
  });
});

describe('recording replay', () => {
  const recording = CapturedRecordingSchema.parse({
    channelCount: 1,
    data: new Float32Array([0, 0.25, -0.5, 1, 0.5]),
    discontinuityCount: 0,
    durationMs: 5,
    frameCount: 5,
    recordedAt: '2026-07-18T00:00:00.000Z',
    sampleRate: 1_000,
    schemaVersion: 1,
    startedAtMs: 100,
  });

  it('emits contiguous replay chunks through the live PCM contract', async () => {
    const chunks: PcmChunk[] = [];
    await replayRecording(recording, { chunkFrames: 2, onChunk: (chunk) => chunks.push(chunk) });
    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.sequence)).toEqual([0, 1, 2]);
    expect(chunks.map((chunk) => chunk.startSampleFrame)).toEqual([0, 2, 4]);
    expect(chunks.map((chunk) => chunk.startMs)).toEqual([100, 102, 104]);
    expect(chunks.every((chunk) => PcmChunkSchema.safeParse(chunk).success)).toBe(true);
    expect(Array.from(chunks[2]?.data ?? [])).toEqual([0.5]);
  });

  it('decodes exported PCM WAV recordings back into the capture contract', () => {
    const decoded = decodePcmWavRecording(encodeMonoPcm16Wav(recording), {
      recordedAt: '2026-07-18T01:00:00.000Z',
      startedAtMs: 0,
    });
    expect(decoded).toMatchObject({
      channelCount: 1,
      durationMs: 5,
      frameCount: 5,
      recordedAt: '2026-07-18T01:00:00.000Z',
      sampleRate: 1_000,
      startedAtMs: 0,
    });
    expect(Array.from(decoded.data)).toEqual([
      0,
      expect.closeTo(0.25, 4),
      expect.closeTo(-0.5, 4),
      expect.closeTo(1, 4),
      expect.closeTo(0.5, 4),
    ]);
  });

  it('averages every channel of an imported stereo PCM WAV deterministically', () => {
    const buffer = new ArrayBuffer(52);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const write = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };
    write(0, 'RIFF');
    view.setUint32(4, 44, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 48_000, true);
    view.setUint32(28, 192_000, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, 8, true);
    view.setInt16(44, 32_767, true);
    view.setInt16(46, -32_768, true);
    view.setInt16(48, 16_384, true);
    view.setInt16(50, 16_384, true);

    const decoded = decodePcmWav(bytes);
    expect(decoded.inputChannelCount).toBe(2);
    expect(Array.from(decoded.data)).toEqual([expect.closeTo(0, 4), expect.closeTo(0.5, 4)]);
  });

  it('rejects malformed and unsupported WAV input', () => {
    expect(() => decodePcmWav(new Uint8Array([1, 2, 3]))).toThrow(/RIFF\/WAVE/);
    const encoded = encodeMonoPcm16Wav(recording);
    encoded[20] = 6;
    expect(() => decodePcmWav(encoded)).toThrow(/Unsupported WAV audio format/);
  });

  it('rejects invalid chunk sizes and respects cancellation', async () => {
    await expect(
      replayRecording(recording, { chunkFrames: 0, onChunk: () => undefined }),
    ).rejects.toThrow(RangeError);
    const controller = new AbortController();
    controller.abort();
    await expect(
      replayRecording(recording, { onChunk: () => undefined, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('paces realtime replay and can cancel between chunks', async () => {
    const chunks: PcmChunk[] = [];
    await replayRecording(recording, {
      chunkFrames: 2,
      onChunk: (chunk) => chunks.push(chunk),
      realtime: true,
    });
    expect(chunks).toHaveLength(3);

    const controller = new AbortController();
    await expect(
      replayRecording(recording, {
        chunkFrames: 2,
        onChunk: () => controller.abort(),
        realtime: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('microphone capture orchestration', () => {
  it('loads a validated recording for replay without microphone permission', async () => {
    const capture = new MicrophoneCapture();
    const recording = decodePcmWavRecording(
      encodeMonoPcm16Wav(
        CapturedRecordingSchema.parse({
          channelCount: 1,
          data: new Float32Array([0, 0.25, 0]),
          discontinuityCount: 0,
          durationMs: 3,
          frameCount: 3,
          recordedAt: '2026-07-18T00:00:00.000Z',
          sampleRate: 1_000,
          schemaVersion: 1,
          startedAtMs: 0,
        }),
      ),
    );
    const chunks: PcmChunk[] = [];
    capture.subscribeToChunks((chunk) => chunks.push(chunk));
    capture.loadRecording(recording);
    expect(capture.currentSnapshot).toMatchObject({
      bufferedDurationMs: 3,
      connectionState: 'disconnected',
      operationState: 'idle',
    });
    await capture.replay();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ sampleRate: 1_000, source: 'replay' });
    expect(getUserMedia).not.toHaveBeenCalled();

    capture.clearRecording();
    expect(capture.currentRecording).toBeNull();
    expect(capture.currentSnapshot).toMatchObject({
      bufferedDurationMs: 0,
      operationState: 'idle',
    });
  });

  it('captures, reports actual settings, finalizes, and replays through the same contract', async () => {
    const capture = new MicrophoneCapture();
    const snapshots: CaptureSnapshot[] = [];
    const chunks: PcmChunk[] = [];
    capture.subscribe((snapshot) => snapshots.push(snapshot));
    capture.subscribeToChunks((chunk) => chunks.push(chunk));

    expect((await capture.listInputDevices()).map((device) => device.deviceId)).toEqual([
      'fake-input',
    ]);
    await capture.connect('fake-input');
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'monitoring',
      device: {
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        requestedDeviceId: 'fake-input',
        sampleRate: 48_000,
      },
      operationState: 'idle',
    });
    expect(FakeWorker.instances).toHaveLength(0);
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      frameCount: 2_048,
      inputChannelCount: 1,
      inputChannelMode: 'mono',
      peak: 0.2,
      rms: 0.1,
      sampleRate: 48_000,
      type: 'monitor-summary',
      waveform: new Float32Array(64),
    });
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      data: new Float32Array(2_048).fill(0.1),
      frameCount: 2_048,
      inputChannelCount: 1,
      inputChannelMode: 'mono',
      peak: 0.1,
      rms: 0.1,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      stream: 'monitoring',
      type: 'chunk',
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ stream: 'monitoring' });
    expect(FakeWorker.instances).toHaveLength(0);
    expect(capture.currentSnapshot.waveform).toHaveLength(64);
    await capture.startRecording();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(capture.currentSnapshot.operationState).toBe('recording');
    const requestedConstraints = getUserMedia.mock.calls[0]?.[0];
    expect(requestedConstraints?.video).toBe(false);
    expect(requestedConstraints?.audio).toMatchObject({
      autoGainControl: false,
      deviceId: { exact: 'fake-input' },
      echoCancellation: false,
      noiseSuppression: false,
    });

    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 1,
      data: new Float32Array([0.1, 1, -0.2, 0]),
      frameCount: 4,
      inputChannelMode: 'averaged',
      inputChannelCount: 2,
      peak: 1,
      rms: 0.51,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      type: 'chunk',
    });
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 1,
      frameCount: 4,
      inputChannelCount: 2,
      inputChannelMode: 'averaged',
      peak: 1,
      rms: 0.51,
      sampleRate: 48_000,
      type: 'monitor-summary',
      waveform: new Float32Array(64),
    });
    await flushMicrotasks();
    expect(capture.currentSnapshot).toMatchObject({
      bufferedDurationMs: (4 / 48_000) * 1_000,
      clippingSamples: 1,
      inputChannelMode: 'averaged',
      peak: 1,
      warning: 'clipping',
    });
    expect(chunks.find(({ stream }) => stream === 'recording')).toMatchObject({
      source: 'microphone',
      startMs: 0,
      startSampleFrame: 0,
    });

    const recording = await capture.stop();
    expect(recording.frameCount).toBe(4);
    expect(Array.from(recording.data)).toEqual([expect.closeTo(0.1), 1, expect.closeTo(-0.2), 0]);
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'monitoring',
      operationState: 'idle',
    });
    await capture.replay();
    expect(chunks.at(-1)).toMatchObject({ source: 'replay', sequence: 0 });
    expect(capture.currentSnapshot.operationState).toBe('idle');
    expect(snapshots.some((snapshot) => snapshot.operationState === 'recording')).toBe(true);
    await capture.dispose();
  });

  it('maps denied permission into a recoverable application error', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const capture = new MicrophoneCapture();
    await capture.connect();
    expect(capture.currentSnapshot).toMatchObject({
      error: {
        category: 'permission',
        code: 'microphone-permission-denied',
        retryable: true,
        userAction: 'grant-permission',
      },
      connectionState: 'failed',
    });
  });

  it('pauses, resumes, and safely finalizes a paused recording', async () => {
    const capture = new MicrophoneCapture();
    await capture.connect();
    await capture.startRecording();

    expect(() => capture.clearRecording()).toThrow('Stop the current audio operation');

    await capture.pause();
    expect(capture.currentSnapshot.operationState).toBe('paused');
    await expect(capture.pause()).rejects.toThrow('Only an active recording');

    await capture.resume();
    expect(capture.currentSnapshot.operationState).toBe('recording');
    await expect(capture.resume()).rejects.toThrow('Only a paused recording');

    await capture.pause();
    const recording = await capture.stop();
    expect(recording.frameCount).toBe(0);
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'monitoring',
      operationState: 'idle',
    });
    await capture.dispose();
  });

  it.each([
    ['NotFoundError', 'microphone-unavailable', 'select-device'],
    ['NotReadableError', 'microphone-not-readable', 'retry'],
    ['UnknownError', 'audio-capture-failed', 'retry'],
  ] as const)('maps %s into its recovery category', async (name, code, userAction) => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Capture failed', name));
    const capture = new MicrophoneCapture();
    await capture.connect();
    expect(capture.currentSnapshot.error).toMatchObject({ code, userAction });
  });

  it('rejects stop and replay when no recording exists', async () => {
    const capture = new MicrophoneCapture();
    await expect(capture.stop()).rejects.toThrow('No active recording');
    await expect(capture.replay()).rejects.toThrow('No recording');
    await expect(capture.pause()).rejects.toThrow('Only an active recording');
    await expect(capture.resume()).rejects.toThrow('Only a paused recording');
    capture.stopReplay();
  });

  it('enforces connection and operation preconditions without reopening the device', async () => {
    const capture = new MicrophoneCapture();
    await expect(capture.startRecording()).rejects.toThrow('Connect the microphone');
    await capture.connect();
    await capture.connect();
    expect(getUserMedia).toHaveBeenCalledOnce();

    await capture.startRecording();
    await expect(capture.startRecording()).rejects.toThrow('Stop the current audio operation');
    expect(() => capture.loadRecording(createCalibrationReferenceRecording())).toThrow(
      'Stop the current audio operation',
    );
    const recording = await capture.stop();
    await expect(capture.stop()).resolves.toBe(recording);
    await capture.disconnect();
    await capture.disconnect();
    expect(capture.currentRecording).toBe(recording);
  });

  it('closes a monitoring connection after an invalid worklet message', async () => {
    const capture = new MicrophoneCapture();
    await capture.connect();
    FakeAudioWorkletNode.instances[0]?.emit({ unexpected: true });
    await flushMicrotasks();

    expect(fakeTrack.stopped).toBe(true);
    expect(FakeAudioContext.instances[0]?.state).toBe('closed');
    expect(capture.currentSnapshot.connectionState).toBe('failed');
  });

  it('makes backpressure loss and invalid worklet messages visible', async () => {
    FakeWorker.acknowledgeChunks = false;
    const capture = new MicrophoneCapture({ maxInFlightChunks: 1 });
    await capture.connect();
    await capture.startRecording();
    const worklet = FakeAudioWorkletNode.instances[0];
    const message = {
      clippingSamples: 0,
      data: new Float32Array([0.1, 0.2]),
      frameCount: 2,
      peak: 0.2,
      rms: 0.16,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      type: 'chunk',
    } as const;
    worklet?.emit(message);
    worklet?.emit({
      ...message,
      data: message.data.slice(),
      sequence: 1,
      startSampleFrame: 2,
    });
    expect(capture.currentSnapshot.droppedChunks).toBe(1);
    worklet?.emit({ unexpected: true });
    expect(capture.currentSnapshot).toMatchObject({ operationState: 'failed' });
  });

  it('detects sequence discontinuity and finalizes when the input device ends', async () => {
    const capture = new MicrophoneCapture();
    await capture.connect();
    await capture.startRecording();
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      data: new Float32Array([0, 0]),
      frameCount: 2,
      peak: 0,
      rms: 0,
      sampleRate: 48_000,
      sequence: 2,
      startSampleFrame: 10,
      type: 'chunk',
    });
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      frameCount: 2,
      inputChannelCount: 1,
      inputChannelMode: 'mono',
      peak: 0,
      rms: 0,
      sampleRate: 48_000,
      type: 'monitor-summary',
      waveform: new Float32Array(64),
    });
    expect(capture.currentSnapshot).toMatchObject({
      discontinuityCount: 1,
      silenceDurationMs: (2 / 48_000) * 1_000,
    });
    fakeTrack.dispatchEvent(new Event('ended'));
    await flushMicrotasks();
    await flushMicrotasks();
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'disconnected',
      operationState: 'idle',
    });
  });

  it('surfaces transport-worker failures during capture', async () => {
    const capture = new MicrophoneCapture();
    await capture.connect();
    await capture.startRecording();
    const worker = FakeWorker.instances[0];
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      data: new Float32Array([0.1, -0.1]),
      frameCount: 2,
      peak: 0.1,
      rms: 0.1,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      type: 'chunk',
    });
    worker?.emit({ message: 'Worker failed.', type: 'failure' });
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'monitoring',
      operationState: 'failed',
    });
    expect(worker?.terminated).toBe(true);
    expect(worker?.chunks).toEqual([]);
  });

  it('auto-finalizes the accepted take at the configured duration limit', async () => {
    const capture = new MicrophoneCapture({ maxRecordingSeconds: 0.001 });
    await capture.connect();
    await capture.startRecording();
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      data: new Float32Array(48).fill(0.1),
      frameCount: 48,
      peak: 0.1,
      rms: 0.1,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      type: 'chunk',
    });
    FakeAudioWorkletNode.instances[0]?.emit({ type: 'recording-limit-reached' });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(capture.currentRecording).toMatchObject({ durationMs: 1, frameCount: 48 });
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'monitoring',
      operationState: 'idle',
      warning: 'maximum-duration-reached',
    });
  });

  it('honors a defensive duration-limit signal from the transport worker', async () => {
    const capture = new MicrophoneCapture();
    await capture.connect();
    await capture.startRecording();
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      data: new Float32Array([0.1, 0.1]),
      frameCount: 2,
      peak: 0.1,
      rms: 0.1,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      type: 'chunk',
    });
    FakeWorker.instances[0]?.emit({ bufferedFrames: 2, type: 'limit-reached' });
    await flushMicrotasks();
    await flushMicrotasks();

    expect(capture.currentSnapshot).toMatchObject({
      operationState: 'idle',
      warning: 'maximum-duration-reached',
    });
    expect(capture.currentRecording?.frameCount).toBe(2);
  });

  it('disconnects the graph while preserving a completed recording', async () => {
    const capture = new MicrophoneCapture();
    await capture.connect();
    await capture.startRecording();
    FakeAudioWorkletNode.instances[0]?.emit({
      clippingSamples: 0,
      data: new Float32Array([0.25, -0.25]),
      frameCount: 2,
      peak: 0.25,
      rms: 0.25,
      sampleRate: 48_000,
      sequence: 0,
      startSampleFrame: 0,
      type: 'chunk',
    });
    const recording = await capture.stop();
    expect(fakeTrack.stopped).toBe(false);

    await capture.disconnect();

    expect(fakeTrack.stopped).toBe(true);
    expect(FakeAudioContext.instances[0]?.state).toBe('closed');
    expect(capture.currentRecording).toBe(recording);
    expect(capture.currentSnapshot).toMatchObject({
      connectionState: 'disconnected',
      operationState: 'idle',
    });
  });

  it('reports unsupported environments without requesting permission', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const capture = new MicrophoneCapture();
    expect(capture.currentSnapshot.connectionState).toBe('unsupported');
    await capture.connect();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
