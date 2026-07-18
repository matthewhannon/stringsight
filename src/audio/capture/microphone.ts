import captureWorkletUrl from '../worklets/pcm-capture.worklet.ts?worker&url';
import {
  createAppError,
  createSessionClock,
  mapAudioContextTime,
  sessionTimestampMs,
  type AppError,
  type AudioClockAnchor,
  type SessionClock,
} from '../../shared';
import {
  DEFAULT_CHUNK_FRAMES,
  InitialCaptureSnapshot,
  PCM_CHUNK_SCHEMA_VERSION,
  SILENCE_RMS_THRESHOLD,
  WorkletOutboundMessageSchema,
  type CapturedRecording,
  type CaptureSnapshot,
  type PcmChunk,
  type TransportInboundMessage,
  type TransportOutboundMessage,
  type WorkletChunkMessage,
} from './contracts';
import { replayRecording } from './replay';
import { downsampleWaveform } from './signal';

export type MicrophoneCaptureOptions = {
  chunkFrames?: number;
  maxInFlightChunks?: number;
  maxRecordingSeconds?: number;
};

type SnapshotListener = (snapshot: CaptureSnapshot) => void;
type ChunkListener = (chunk: PcmChunk) => void;

const getMediaDevices = (): MediaDevices | undefined =>
  typeof navigator === 'undefined' ? undefined : Reflect.get(navigator, 'mediaDevices');

const browserSupportsCapture = (): boolean => {
  const mediaDevices = getMediaDevices();
  return (
    typeof mediaDevices?.getUserMedia === 'function' &&
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof Worker !== 'undefined'
  );
};

const booleanSetting = (value: boolean | string | undefined): boolean | null =>
  typeof value === 'boolean' ? value : null;
const numberSetting = (value: number | undefined): number | null => value ?? null;

function captureError(error: unknown, occurredAtMs: number): AppError {
  const exception = error instanceof DOMException ? error : null;
  const permissionDenied =
    exception?.name === 'NotAllowedError' || exception?.name === 'SecurityError';
  const noDevice =
    exception?.name === 'NotFoundError' || exception?.name === 'OverconstrainedError';
  const deviceBusy = exception?.name === 'NotReadableError' || exception?.name === 'AbortError';
  return createAppError({
    category: permissionDenied ? 'permission' : noDevice || deviceBusy ? 'device' : 'processing',
    code: permissionDenied
      ? 'microphone-permission-denied'
      : noDevice
        ? 'microphone-unavailable'
        : deviceBusy
          ? 'microphone-not-readable'
          : 'audio-capture-failed',
    details: { browserError: exception?.name ?? 'unknown' },
    id: `audio-capture-${String(Math.round(occurredAtMs))}`,
    message: permissionDenied
      ? 'Microphone access is blocked. Allow access in your browser settings, then try again.'
      : noDevice
        ? 'No matching microphone is available. Connect or select another input and retry.'
        : deviceBusy
          ? 'The microphone could not be opened. Close other audio apps or select another input.'
          : 'StringSight could not start audio capture. You can retry without losing other work.',
    occurredAtMs: sessionTimestampMs(Math.max(0, occurredAtMs)),
    retryable: true,
    severity: 'error',
    subsystem: 'audio-capture',
    userAction: permissionDenied ? 'grant-permission' : noDevice ? 'select-device' : 'retry',
  });
}

export class MicrophoneCapture {
  private readonly chunkFrames: number;
  private readonly chunkListeners = new Set<ChunkListener>();
  private readonly maxInFlightChunks: number;
  private readonly maxRecordingSeconds: number;
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private audioAnchor: AudioClockAnchor | null = null;
  private audioContext: AudioContext | null = null;
  private expectedSequence = 0;
  private expectedStartFrame: number | null = null;
  private finalizationReject: ((reason?: unknown) => void) | null = null;
  private finalizationResolve: ((recording: CapturedRecording) => void) | null = null;
  private gainNode: GainNode | null = null;
  private inFlightChunks = 0;
  private mediaStream: MediaStream | null = null;
  private pendingDiscontinuity = false;
  private recording: CapturedRecording | null = null;
  private replayController: AbortController | null = null;
  private sessionClock: SessionClock | null = null;
  private snapshot: CaptureSnapshot;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stopPromise: Promise<CapturedRecording> | null = null;
  private transportWorker: Worker | null = null;
  private workletNode: AudioWorkletNode | null = null;

  constructor(options: MicrophoneCaptureOptions = {}) {
    this.chunkFrames = options.chunkFrames ?? DEFAULT_CHUNK_FRAMES;
    this.maxInFlightChunks = options.maxInFlightChunks ?? 8;
    this.maxRecordingSeconds = options.maxRecordingSeconds ?? 30 * 60;
    this.snapshot = {
      ...InitialCaptureSnapshot,
      state: browserSupportsCapture() ? 'idle' : 'unsupported',
    };
  }

  get currentRecording(): CapturedRecording | null {
    return this.recording;
  }

  get currentSnapshot(): CaptureSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  subscribeToChunks(listener: ChunkListener): () => void {
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  async listInputDevices(): Promise<MediaDeviceInfo[]> {
    const mediaDevices = getMediaDevices();
    if (typeof mediaDevices?.enumerateDevices !== 'function') return [];
    const devices = await mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }

  async start(deviceId?: string): Promise<void> {
    if (!browserSupportsCapture()) {
      this.update({ state: 'unsupported' });
      return;
    }
    if (this.snapshot.state === 'recording' || this.snapshot.state === 'starting') return;

    this.resetSessionState();
    this.update({ error: null, state: 'requesting-permission', warning: null });
    try {
      const audioConstraints: MediaTrackConstraints = {
        autoGainControl: false,
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
      };
      if (deviceId !== undefined && deviceId.length > 0) {
        audioConstraints.deviceId = { exact: deviceId };
      }
      const mediaDevices = getMediaDevices();
      if (mediaDevices === undefined) throw new Error('Media devices are unavailable.');
      this.mediaStream = await mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      this.update({ state: 'starting' });
      this.sessionClock = createSessionClock();
      this.audioContext = new AudioContext({ latencyHint: 'interactive' });
      await this.audioContext.audioWorklet.addModule(captureWorkletUrl);
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();

      const track = this.mediaStream.getAudioTracks()[0];
      if (track === undefined)
        throw new DOMException('No audio track was returned.', 'NotFoundError');
      const settings = track.getSettings();
      this.update({
        device: {
          autoGainControl: booleanSetting(settings.autoGainControl),
          channelCount: numberSetting(settings.channelCount),
          deviceLabel: track.label || 'Microphone',
          echoCancellation: booleanSetting(settings.echoCancellation),
          latencySeconds: numberSetting(this.audioContext.baseLatency),
          noiseSuppression: booleanSetting(settings.noiseSuppression),
          requestedDeviceId: deviceId ?? null,
          sampleRate: numberSetting(settings.sampleRate ?? this.audioContext.sampleRate),
        },
      });
      track.addEventListener('ended', this.handleTrackEnded, { once: true });

      this.audioAnchor = {
        audioContextSeconds: this.audioContext.currentTime,
        sessionTimestampMs: this.sessionClock.now(),
      };
      await this.initializeTransport(
        this.audioContext.sampleRate,
        this.audioAnchor.sessionTimestampMs,
        new Date().toISOString(),
      );
      this.workletNode = new AudioWorkletNode(this.audioContext, 'stringsight-pcm-capture', {
        channelCountMode: 'max',
        channelInterpretation: 'discrete',
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { chunkFrames: this.chunkFrames },
      });
      this.workletNode.port.onmessage = this.handleWorkletMessage;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.sourceNode
        .connect(this.workletNode)
        .connect(this.gainNode)
        .connect(this.audioContext.destination);
      this.update({ state: 'recording' });
    } catch (error) {
      await this.cleanupAudioGraph();
      const occurredAtMs = this.sessionClock?.now() ?? sessionTimestampMs(0);
      this.update({ error: captureError(error, occurredAtMs), state: 'failed' });
    }
  }

  stop(): Promise<CapturedRecording> {
    if (this.stopPromise !== null) return this.stopPromise;
    if (this.workletNode === null) {
      if (this.recording !== null) return Promise.resolve(this.recording);
      return Promise.reject(new Error('No active recording can be stopped.'));
    }

    this.update({ state: 'stopping' });
    this.stopPromise = new Promise<CapturedRecording>((resolve, reject) => {
      this.finalizationResolve = resolve;
      this.finalizationReject = reject;
    });
    this.workletNode.port.postMessage({ type: 'flush' });
    return this.stopPromise;
  }

  async replay(): Promise<void> {
    if (this.recording === null) throw new Error('No recording is available for replay.');
    const recording = this.recording;
    this.replayController?.abort();
    this.replayController = new AbortController();
    this.update({
      elapsedMs: 0,
      peak: 0,
      rms: 0,
      state: 'replaying',
      warning: null,
      waveform: [],
    });
    try {
      await replayRecording(recording, {
        onChunk: (chunk) => {
          for (const listener of this.chunkListeners) listener(chunk);
          this.update({
            elapsedMs: chunk.startMs - recording.startedAtMs + chunk.durationMs,
            peak: chunk.diagnostics.peak,
            rms: chunk.diagnostics.rms,
            waveform: downsampleWaveform(chunk.data),
          });
        },
        realtime: true,
        signal: this.replayController.signal,
      });
      this.update({ state: 'ready-to-replay' });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
      this.update({ state: 'ready-to-replay' });
    } finally {
      this.replayController = null;
    }
  }

  stopReplay(): void {
    this.replayController?.abort();
  }

  async dispose(): Promise<void> {
    this.stopReplay();
    this.transportWorker?.postMessage({ type: 'reset' } satisfies TransportInboundMessage);
    this.transportWorker?.terminate();
    this.transportWorker = null;
    await this.cleanupAudioGraph();
    this.snapshotListeners.clear();
    this.chunkListeners.clear();
  }

  private readonly handleTrackEnded = () => {
    this.update({ warning: 'device-ended' });
    if (this.snapshot.state === 'recording') void this.stop();
  };

  private readonly handleWorkletMessage = (event: MessageEvent<unknown>) => {
    const parsed = WorkletOutboundMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      this.failTransport(new Error('The audio worklet emitted an invalid message.'));
      return;
    }
    const message = parsed.data;
    if (message.type === 'flushed') {
      void this.cleanupAudioGraph();
      this.transportWorker?.postMessage({ type: 'finish' } satisfies TransportInboundMessage);
      return;
    }
    this.handlePcmChunk(message);
  };

  private handlePcmChunk(message: WorkletChunkMessage): void {
    if (this.audioAnchor === null) return;
    const sequenceDiscontinuity = message.sequence !== this.expectedSequence;
    const frameDiscontinuity =
      this.expectedStartFrame !== null && message.startSampleFrame !== this.expectedStartFrame;
    const discontinuity = this.pendingDiscontinuity || sequenceDiscontinuity || frameDiscontinuity;
    this.expectedSequence = message.sequence + 1;
    this.expectedStartFrame = message.startSampleFrame + message.frameCount;
    const startMs = mapAudioContextTime(
      message.startSampleFrame / message.sampleRate,
      this.audioAnchor,
    );
    const durationMs = (message.frameCount / message.sampleRate) * 1_000;
    const transportLatencyMs = Math.max(
      0,
      (this.sessionClock?.now() ?? startMs) - (startMs + durationMs),
    );
    const silent = message.rms < SILENCE_RMS_THRESHOLD;
    const silenceDurationMs = silent ? this.snapshot.silenceDurationMs + durationMs : 0;
    const chunk: PcmChunk = {
      channelCount: 1,
      data: message.data,
      diagnostics: {
        clippingSamples: message.clippingSamples,
        discontinuity,
        peak: message.peak,
        rms: message.rms,
        silent,
      },
      durationMs,
      frameCount: message.frameCount,
      sampleRate: message.sampleRate,
      schemaVersion: PCM_CHUNK_SCHEMA_VERSION,
      sequence: message.sequence,
      source: 'microphone',
      startMs,
      startSampleFrame: message.startSampleFrame,
    };
    for (const listener of this.chunkListeners) listener(chunk);
    const waveform = downsampleWaveform(message.data);
    this.update({
      clippingSamples: this.snapshot.clippingSamples + message.clippingSamples,
      discontinuityCount: this.snapshot.discontinuityCount + (discontinuity ? 1 : 0),
      elapsedMs: startMs - this.audioAnchor.sessionTimestampMs + durationMs,
      inputChannelMode: message.inputChannelMode,
      peak: message.peak,
      rms: message.rms,
      silenceDurationMs,
      transportLatencyMs,
      maxTransportLatencyMs: Math.max(this.snapshot.maxTransportLatencyMs, transportLatencyMs),
      warning:
        message.clippingSamples > 0 ? 'clipping' : silenceDurationMs >= 2_000 ? 'silence' : null,
      waveform,
    });

    if (this.inFlightChunks >= this.maxInFlightChunks) {
      this.pendingDiscontinuity = true;
      this.update({ droppedChunks: this.snapshot.droppedChunks + 1 });
      return;
    }
    this.pendingDiscontinuity = false;
    this.inFlightChunks += 1;
    this.transportWorker?.postMessage({ chunk, type: 'chunk' } satisfies TransportInboundMessage, [
      chunk.data.buffer,
    ]);
  }

  private async initializeTransport(
    sampleRate: number,
    startedAtMs: number,
    recordedAt: string,
  ): Promise<void> {
    this.transportWorker?.terminate();
    this.transportWorker = new Worker(
      new URL('../../workers/audio-transport.worker.ts', import.meta.url),
      { name: 'stringsight-audio-transport', type: 'module' },
    );
    await new Promise<void>((resolve, reject) => {
      if (this.transportWorker === null) {
        reject(new Error('Audio transport worker was not created.'));
        return;
      }
      this.transportWorker.onerror = () =>
        reject(new Error('Audio transport worker failed to load.'));
      this.transportWorker.onmessage = (event: MessageEvent<TransportOutboundMessage>) => {
        if (event.data.type === 'ready') {
          resolve();
          return;
        }
        this.handleTransportMessage(event.data);
      };
      this.transportWorker.postMessage({
        maxRecordingFrames: Math.ceil(sampleRate * this.maxRecordingSeconds),
        recordedAt,
        sampleRate,
        startedAtMs,
        type: 'initialize',
      } satisfies TransportInboundMessage);
    });
  }

  private handleTransportMessage(message: TransportOutboundMessage): void {
    if (message.type === 'acknowledged') {
      this.inFlightChunks = Math.max(0, this.inFlightChunks - 1);
      const sampleRate = this.audioContext?.sampleRate ?? this.snapshot.device?.sampleRate ?? 0;
      this.update({
        bufferedDurationMs: sampleRate === 0 ? 0 : (message.bufferedFrames / sampleRate) * 1_000,
        discontinuityCount: Math.max(this.snapshot.discontinuityCount, message.discontinuityCount),
      });
      return;
    }
    if (message.type === 'finalized') {
      this.recording = message.recording;
      this.update({
        bufferedDurationMs: message.recording.durationMs,
        state: 'ready-to-replay',
      });
      this.finalizationResolve?.(message.recording);
      this.finalizationResolve = null;
      this.finalizationReject = null;
      this.stopPromise = null;
      this.transportWorker?.terminate();
      this.transportWorker = null;
      return;
    }
    if (message.type === 'failure') this.failTransport(new Error(message.message));
  }

  private failTransport(error: Error): void {
    const occurredAtMs = this.sessionClock?.now() ?? sessionTimestampMs(0);
    const appError = captureError(error, occurredAtMs);
    this.update({ error: appError, state: 'failed' });
    this.finalizationReject?.(error);
    this.finalizationResolve = null;
    this.finalizationReject = null;
    this.stopPromise = null;
    void this.cleanupAudioGraph();
  }

  private async cleanupAudioGraph(): Promise<void> {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.gainNode?.disconnect();
    this.workletNode = null;
    this.sourceNode = null;
    this.gainNode = null;
    for (const track of this.mediaStream?.getTracks() ?? []) track.stop();
    this.mediaStream = null;
    if (this.audioContext !== null && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
  }

  private resetSessionState(): void {
    this.recording = null;
    this.audioAnchor = null;
    this.expectedSequence = 0;
    this.expectedStartFrame = null;
    this.inFlightChunks = 0;
    this.pendingDiscontinuity = false;
    this.stopPromise = null;
    this.snapshot = {
      ...InitialCaptureSnapshot,
      state: this.snapshot.state,
    };
  }

  private update(patch: Partial<CaptureSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.snapshotListeners) listener(this.snapshot);
  }
}
