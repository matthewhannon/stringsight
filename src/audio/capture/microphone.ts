import captureWorkletUrl from '../worklets/pcm-capture.worklet.ts?worker&url';
import { createAppError, sessionTimestampMs, type AppError } from '../../shared';
import {
  DEFAULT_CHUNK_FRAMES,
  DEFAULT_MAX_RECORDING_SECONDS,
  MONITOR_WAVEFORM_SAMPLES,
  CapturedRecordingSchema,
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
  type WorkletInboundMessage,
  type WorkletMonitorSummaryMessage,
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
type WorkletConfirmation = 'recording-started' | 'recording-paused' | 'recording-resumed';

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
          : 'StringSight could not complete the audio operation. You can retry without losing other work.',
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
  private audioContext: AudioContext | null = null;
  private expectedSequence = 0;
  private expectedStartFrame: number | null = null;
  private finalizationReject: ((reason?: unknown) => void) | null = null;
  private finalizationResolve: ((recording: CapturedRecording) => void) | null = null;
  private gainNode: GainNode | null = null;
  private inFlightChunks = 0;
  private mediaStream: MediaStream | null = null;
  private pendingControl: {
    reject: (reason?: unknown) => void;
    resolve: () => void;
    type: WorkletConfirmation;
  } | null = null;
  private pendingDiscontinuity = false;
  private recording: CapturedRecording | null = null;
  private replayController: AbortController | null = null;
  private snapshot: CaptureSnapshot;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stopPromise: Promise<CapturedRecording> | null = null;
  private transportWorker: Worker | null = null;
  private workletNode: AudioWorkletNode | null = null;

  constructor(options: MicrophoneCaptureOptions = {}) {
    this.chunkFrames = options.chunkFrames ?? DEFAULT_CHUNK_FRAMES;
    this.maxInFlightChunks = options.maxInFlightChunks ?? 8;
    this.maxRecordingSeconds = options.maxRecordingSeconds ?? DEFAULT_MAX_RECORDING_SECONDS;
    this.snapshot = {
      ...InitialCaptureSnapshot,
      connectionState: browserSupportsCapture() ? 'disconnected' : 'unsupported',
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

  async connect(deviceId?: string): Promise<void> {
    if (!browserSupportsCapture()) {
      this.update({ connectionState: 'unsupported' });
      return;
    }
    if (this.snapshot.connectionState === 'monitoring') return;
    if (this.snapshot.connectionState === 'connecting') return;
    this.update({ connectionState: 'connecting', error: null, warning: null });
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
      this.mediaStream = await mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      this.audioContext = new AudioContext({ latencyHint: 'interactive' });
      await this.audioContext.audioWorklet.addModule(captureWorkletUrl);
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();

      const track = this.mediaStream.getAudioTracks()[0];
      if (track === undefined) {
        throw new DOMException('No audio track was returned.', 'NotFoundError');
      }
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

      this.workletNode = new AudioWorkletNode(this.audioContext, 'stringsight-pcm-capture', {
        channelCountMode: 'max',
        channelInterpretation: 'discrete',
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          chunkFrames: this.chunkFrames,
          monitorWaveformSamples: MONITOR_WAVEFORM_SAMPLES,
        },
      });
      this.workletNode.port.onmessage = this.handleWorkletMessage;
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;
      this.sourceNode
        .connect(this.workletNode)
        .connect(this.gainNode)
        .connect(this.audioContext.destination);
      this.update({ connectionState: 'monitoring' });
    } catch (error) {
      await this.cleanupAudioGraph();
      this.update({
        connectionState: 'failed',
        error: captureError(error, this.snapshot.elapsedMs),
      });
    }
  }

  async startRecording(): Promise<void> {
    if (this.snapshot.connectionState !== 'monitoring' || this.workletNode === null) {
      throw new Error('Connect the microphone before recording.');
    }
    if (!['idle', 'failed'].includes(this.snapshot.operationState)) {
      throw new Error('Stop the current audio operation before recording another take.');
    }
    this.resetRecordingState();
    try {
      const sampleRate = this.audioContext?.sampleRate;
      if (sampleRate === undefined) throw new Error('The microphone audio context is unavailable.');
      await this.initializeTransport(sampleRate, 0, new Date().toISOString());
      await this.sendWorkletControl(
        {
          maxRecordingFrames: Math.ceil(sampleRate * this.maxRecordingSeconds),
          type: 'start-recording',
        },
        'recording-started',
      );
      this.update({ error: null, operationState: 'recording', warning: null });
    } catch (error) {
      this.failTransport(
        error instanceof Error ? error : new Error('The recording transport could not start.'),
      );
    }
  }

  stop(): Promise<CapturedRecording> {
    if (this.stopPromise !== null) return this.stopPromise;
    if (!['recording', 'paused'].includes(this.snapshot.operationState)) {
      if (this.recording !== null) return Promise.resolve(this.recording);
      return Promise.reject(new Error('No active recording can be stopped.'));
    }
    this.stopPromise = new Promise<CapturedRecording>((resolve, reject) => {
      this.finalizationResolve = resolve;
      this.finalizationReject = reject;
    });
    this.update({ operationState: 'finalizing' });
    try {
      this.workletNode?.port.postMessage({
        type: 'stop-recording',
      } satisfies WorkletInboundMessage);
    } catch (error) {
      this.failTransport(error instanceof Error ? error : new Error('Audio finalization failed.'));
    }
    return this.stopPromise;
  }

  async pause(): Promise<void> {
    if (this.snapshot.operationState !== 'recording') {
      throw new Error('Only an active recording can be paused.');
    }
    await this.sendWorkletControl({ type: 'pause-recording' }, 'recording-paused');
    this.update({ operationState: 'paused' });
  }

  async resume(): Promise<void> {
    if (this.snapshot.operationState !== 'paused') {
      throw new Error('Only a paused recording can be resumed.');
    }
    await this.sendWorkletControl({ type: 'resume-recording' }, 'recording-resumed');
    this.update({ operationState: 'recording' });
  }

  async disconnect(): Promise<void> {
    try {
      if (
        this.snapshot.operationState === 'recording' ||
        this.snapshot.operationState === 'paused'
      ) {
        await this.stop();
      } else if (this.snapshot.operationState === 'finalizing' && this.stopPromise !== null) {
        await this.stopPromise;
      } else if (this.snapshot.operationState === 'replaying') {
        this.stopReplay();
      }
    } catch {
      // Transport failures are already represented in the snapshot; disconnect must still release hardware.
    } finally {
      this.releaseTransportWorker();
      await this.cleanupAudioGraph();
      this.update({
        connectionState: browserSupportsCapture() ? 'disconnected' : 'unsupported',
        device: null,
        inputChannelMode: null,
        operationState: 'idle',
        peak: 0,
        rms: 0,
        silenceDurationMs: 0,
        waveform: [],
      });
    }
  }

  loadRecording(recording: CapturedRecording): void {
    if (!['idle', 'failed'].includes(this.snapshot.operationState)) {
      throw new Error('Stop the current audio operation before loading a recording.');
    }
    const parsed = CapturedRecordingSchema.parse(recording);
    this.resetRecordingState();
    this.recording = parsed;
    this.update({
      bufferedDurationMs: parsed.durationMs,
      error: null,
      operationState: 'idle',
      warning: null,
    });
  }

  clearRecording(): void {
    if (!['idle', 'failed'].includes(this.snapshot.operationState)) {
      throw new Error('Stop the current audio operation before clearing its recording.');
    }
    this.resetRecordingState();
    this.update({ operationState: 'idle' });
  }

  async replay(): Promise<void> {
    if (this.recording === null) throw new Error('No recording is available for replay.');
    if (!['idle', 'failed'].includes(this.snapshot.operationState)) {
      throw new Error('Stop the current audio operation before replaying a recording.');
    }
    const recording = this.recording;
    this.replayController?.abort();
    this.replayController = new AbortController();
    this.update({
      elapsedMs: 0,
      operationState: 'replaying',
      peak: 0,
      rms: 0,
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
            waveform: downsampleWaveform(chunk.data, MONITOR_WAVEFORM_SAMPLES),
          });
        },
        realtime: true,
        signal: this.replayController.signal,
      });
      this.update({ operationState: 'idle' });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
      this.update({ operationState: 'idle' });
    } finally {
      this.replayController = null;
    }
  }

  stopReplay(): void {
    this.replayController?.abort();
  }

  async dispose(): Promise<void> {
    this.stopReplay();
    this.pendingControl?.reject(new Error('Microphone capture was disposed.'));
    this.pendingControl = null;
    this.releaseTransportWorker();
    await this.cleanupAudioGraph();
    this.snapshotListeners.clear();
    this.chunkListeners.clear();
  }

  private readonly handleTrackEnded = () => {
    void this.handleDeviceEnded();
  };

  private async handleDeviceEnded(): Promise<void> {
    this.update({ warning: 'device-ended' });
    try {
      if (
        this.snapshot.operationState === 'recording' ||
        this.snapshot.operationState === 'paused'
      ) {
        await this.stop();
      } else if (this.snapshot.operationState === 'finalizing' && this.stopPromise !== null) {
        await this.stopPromise;
      }
    } finally {
      await this.cleanupAudioGraph();
      this.update({ connectionState: 'disconnected', device: null, inputChannelMode: null });
    }
  }

  private sendWorkletControl(
    message: WorkletInboundMessage,
    expected: WorkletConfirmation,
  ): Promise<void> {
    if (this.workletNode === null)
      return Promise.reject(new Error('The audio worklet is unavailable.'));
    if (this.pendingControl !== null) {
      return Promise.reject(new Error('Another audio worklet control is still pending.'));
    }
    return new Promise<void>((resolve, reject) => {
      this.pendingControl = { reject, resolve, type: expected };
      try {
        this.workletNode?.port.postMessage(message);
      } catch (error) {
        this.pendingControl = null;
        reject(error instanceof Error ? error : new Error('The audio worklet control failed.'));
      }
    });
  }

  private readonly handleWorkletMessage = (event: MessageEvent<unknown>) => {
    const parsed = WorkletOutboundMessageSchema.safeParse(event.data);
    if (!parsed.success) {
      const error = new Error('The audio worklet emitted an invalid message.');
      if (
        this.snapshot.operationState === 'recording' ||
        this.snapshot.operationState === 'finalizing'
      ) {
        this.failTransport(error);
      } else {
        void this.failConnection(error);
      }
      return;
    }
    const message = parsed.data;
    if (
      message.type === 'recording-started' ||
      message.type === 'recording-paused' ||
      message.type === 'recording-resumed'
    ) {
      if (this.pendingControl?.type === message.type) {
        this.pendingControl.resolve();
        this.pendingControl = null;
      }
      return;
    }
    if (message.type === 'recording-stopped') {
      this.transportWorker?.postMessage({ type: 'finish' } satisfies TransportInboundMessage);
      return;
    }
    if (message.type === 'recording-limit-reached') {
      this.finalizeAtDurationLimit();
      return;
    }
    if (message.type === 'monitor-summary') {
      this.handleMonitorSummary(message);
      return;
    }
    this.handlePcmChunk(message);
  };

  private handleMonitorSummary(message: WorkletMonitorSummaryMessage): void {
    const durationMs = (message.frameCount / message.sampleRate) * 1_000;
    const silent = message.rms < SILENCE_RMS_THRESHOLD;
    const silenceDurationMs = silent ? this.snapshot.silenceDurationMs + durationMs : 0;
    const preserveLimitWarning = this.snapshot.warning === 'maximum-duration-reached';
    this.update({
      inputChannelMode: message.inputChannelMode,
      peak: message.peak,
      rms: message.rms,
      silenceDurationMs,
      warning: preserveLimitWarning
        ? 'maximum-duration-reached'
        : message.clippingSamples > 0
          ? 'clipping'
          : silenceDurationMs >= 2_000
            ? 'silence'
            : null,
      waveform: Array.from(message.waveform),
    });
  }

  private handlePcmChunk(message: WorkletChunkMessage): void {
    const recordingStream = message.stream === 'recording';
    const sequenceDiscontinuity = recordingStream && message.sequence !== this.expectedSequence;
    const frameDiscontinuity =
      recordingStream &&
      this.expectedStartFrame !== null &&
      message.startSampleFrame !== this.expectedStartFrame;
    const discontinuity =
      recordingStream && (this.pendingDiscontinuity || sequenceDiscontinuity || frameDiscontinuity);
    if (recordingStream) {
      this.expectedSequence = message.sequence + 1;
      this.expectedStartFrame = message.startSampleFrame + message.frameCount;
    }
    const startMs = sessionTimestampMs((message.startSampleFrame / message.sampleRate) * 1_000);
    const durationMs = (message.frameCount / message.sampleRate) * 1_000;
    const contextStartSampleFrame =
      message.contextStartSampleFrame ??
      Math.max(
        0,
        Math.round((this.audioContext?.currentTime ?? 0) * message.sampleRate) - message.frameCount,
      );
    const contextEndSeconds = (contextStartSampleFrame + message.frameCount) / message.sampleRate;
    const transportLatencyMs = Math.max(
      0,
      ((this.audioContext?.currentTime ?? contextEndSeconds) - contextEndSeconds) * 1_000,
    );
    const silent = message.rms < SILENCE_RMS_THRESHOLD;
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
      stream: message.stream,
    };
    for (const listener of this.chunkListeners) listener(chunk);
    if (!recordingStream) return;
    this.update({
      clippingSamples: this.snapshot.clippingSamples + message.clippingSamples,
      discontinuityCount: this.snapshot.discontinuityCount + (discontinuity ? 1 : 0),
      elapsedMs: startMs + durationMs,
      transportLatencyMs,
      maxTransportLatencyMs: Math.max(this.snapshot.maxTransportLatencyMs, transportLatencyMs),
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
    this.releaseTransportWorker();
    const worker = new Worker(new URL('../../workers/audio-transport.worker.ts', import.meta.url), {
      name: 'stringsight-audio-transport',
      type: 'module',
    });
    this.transportWorker = worker;
    await new Promise<void>((resolve, reject) => {
      let initialized = false;
      const failInitialization = (error: Error) => {
        if (this.transportWorker === worker) this.releaseTransportWorker();
        reject(error);
      };
      worker.onerror = () =>
        failInitialization(new Error('Audio transport worker failed to load.'));
      worker.onmessageerror = () =>
        failInitialization(new Error('Audio transport worker returned unreadable data.'));
      worker.onmessage = (event: MessageEvent<TransportOutboundMessage>) => {
        if (!initialized && event.data.type === 'ready') {
          initialized = true;
          worker.onerror = () =>
            this.failTransport(new Error('The audio transport worker failed.'));
          worker.onmessageerror = () =>
            this.failTransport(new Error('The audio transport worker returned unreadable data.'));
          resolve();
          return;
        }
        if (!initialized && event.data.type === 'failure') {
          failInitialization(new Error(event.data.message));
          return;
        }
        this.handleTransportMessage(event.data);
      };
      worker.postMessage({
        maxRecordingFrames: Math.ceil(sampleRate * this.maxRecordingSeconds),
        recordedAt,
        sampleRate,
        startedAtMs,
        type: 'initialize',
      } satisfies TransportInboundMessage);
    });
  }

  private handleTransportMessage(message: TransportOutboundMessage): void {
    if (message.type === 'ready') return;
    if (message.type === 'acknowledged') {
      this.inFlightChunks = Math.max(0, this.inFlightChunks - 1);
      const sampleRate = this.audioContext?.sampleRate ?? this.snapshot.device?.sampleRate ?? 0;
      this.update({
        bufferedDurationMs: sampleRate === 0 ? 0 : (message.bufferedFrames / sampleRate) * 1_000,
        discontinuityCount: Math.max(this.snapshot.discontinuityCount, message.discontinuityCount),
      });
      return;
    }
    if (message.type === 'limit-reached') {
      this.finalizeAtDurationLimit();
      return;
    }
    if (message.type === 'finalized') {
      this.recording = message.recording;
      this.update({ bufferedDurationMs: message.recording.durationMs, operationState: 'idle' });
      this.finalizationResolve?.(message.recording);
      this.finalizationResolve = null;
      this.finalizationReject = null;
      this.stopPromise = null;
      this.releaseTransportWorker();
      return;
    }
    this.failTransport(new Error(message.message));
  }

  private finalizeAtDurationLimit(): void {
    if (this.snapshot.operationState === 'finalizing') return;
    this.stopPromise ??= new Promise<CapturedRecording>((resolve, reject) => {
      this.finalizationResolve = resolve;
      this.finalizationReject = reject;
    });
    void this.stopPromise.catch(() => undefined);
    this.update({ operationState: 'finalizing', warning: 'maximum-duration-reached' });
    this.transportWorker?.postMessage({ type: 'finish' } satisfies TransportInboundMessage);
  }

  private failTransport(error: Error): void {
    this.pendingControl?.reject(error);
    this.pendingControl = null;
    try {
      this.workletNode?.port.postMessage({
        type: 'stop-recording',
      } satisfies WorkletInboundMessage);
    } catch {
      // Worker release below is mandatory even if the worklet port has already failed.
    }
    this.releaseTransportWorker();
    this.inFlightChunks = 0;
    this.pendingDiscontinuity = false;
    this.update({ error: captureError(error, this.snapshot.elapsedMs), operationState: 'failed' });
    this.finalizationReject?.(error);
    this.finalizationResolve = null;
    this.finalizationReject = null;
    this.stopPromise = null;
  }

  private async failConnection(error: Error): Promise<void> {
    await this.cleanupAudioGraph();
    this.update({
      connectionState: 'failed',
      error: captureError(error, this.snapshot.elapsedMs),
    });
  }

  private releaseTransportWorker(): void {
    const worker = this.transportWorker;
    this.transportWorker = null;
    if (worker === null) return;
    try {
      worker.postMessage({ type: 'reset' } satisfies TransportInboundMessage);
    } catch {
      // A terminal worker may reject messages; termination still releases its retained chunks.
    } finally {
      worker.terminate();
    }
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

  private resetRecordingState(): void {
    this.recording = null;
    this.expectedSequence = 0;
    this.expectedStartFrame = null;
    this.inFlightChunks = 0;
    this.pendingDiscontinuity = false;
    this.stopPromise = null;
    this.snapshot = {
      ...this.snapshot,
      bufferedDurationMs: 0,
      clippingSamples: 0,
      discontinuityCount: 0,
      droppedChunks: 0,
      elapsedMs: 0,
      error: null,
      maxTransportLatencyMs: 0,
      operationState: 'idle',
      transportLatencyMs: 0,
      warning: null,
    };
  }

  private update(patch: Partial<CaptureSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.snapshotListeners) listener(this.snapshot);
  }
}
