import { WORKER_PROTOCOL_VERSION, type NoteEvent } from '../../shared';
import { type MicrophoneCapture, type PcmChunk } from '../capture';
import {
  AnalysisWorkerOutboundSchema,
  type AnalysisState,
  type AnalysisWorkerInbound,
  type OnsetObservation,
} from './contracts';

export type AudioAnalysisSnapshot = {
  analysisMode: AnalysisStreamMode;
  analysisSampleRate: number | null;
  currentEvent: NoteEvent | null;
  droppedChunks: number;
  error: string | null;
  events: readonly NoteEvent[];
  maxProcessingLatencyMs: number;
  inputSampleRate: number | null;
  onsets: readonly OnsetObservation[];
  processingLatencyMs: number;
  runComplete: boolean;
  runId: string | null;
  state: AnalysisState;
};

export const InitialAudioAnalysisSnapshot: AudioAnalysisSnapshot = {
  analysisMode: 'session',
  analysisSampleRate: null,
  currentEvent: null,
  droppedChunks: 0,
  error: null,
  events: [],
  maxProcessingLatencyMs: 0,
  inputSampleRate: null,
  onsets: [],
  processingLatencyMs: 0,
  runComplete: false,
  runId: null,
  state: 'silence',
};

type SnapshotListener = () => void;
type WorkerFactory = () => Worker;
export type AnalysisStreamMode = 'monitoring' | 'session';

export const MONITORING_NOTE_EVENT_LIMIT = 12;
export const MONITORING_ONSET_LIMIT = 24;

const pcmStream = (chunk: PcmChunk): 'monitoring' | 'recording' | 'replay' =>
  chunk.stream ?? (chunk.source === 'replay' ? 'replay' : 'recording');

const defaultWorkerFactory = (): Worker =>
  new Worker(new URL('../../workers/audio-analysis.worker.ts', import.meta.url), {
    name: 'stringsight-audio-analysis',
    type: 'module',
  });

export class AudioAnalysisController {
  private readonly capture: MicrophoneCapture;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly maxInFlightChunks: number;
  private readonly maxMonitoringEvents: number;
  private readonly maxMonitoringOnsets: number;
  private readonly streamMode: AnalysisStreamMode;
  private readonly unsubscribeCaptureChunks: () => void;
  private readonly unsubscribeCaptureState: () => void;
  private readonly workerFactory: WorkerFactory;
  private inFlightChunks = 0;
  private previousOperationState: string;
  private previousMonitoringEligible: boolean;
  private runCounter = 0;
  private snapshot: AudioAnalysisSnapshot = InitialAudioAnalysisSnapshot;
  private worker: Worker | null = null;

  constructor(
    capture: MicrophoneCapture,
    options: {
      maxInFlightChunks?: number;
      maxMonitoringEvents?: number;
      maxMonitoringOnsets?: number;
      streamMode?: AnalysisStreamMode;
      workerFactory?: WorkerFactory;
    } = {},
  ) {
    this.capture = capture;
    this.maxInFlightChunks = options.maxInFlightChunks ?? 8;
    this.maxMonitoringEvents = Math.max(
      1,
      Math.floor(options.maxMonitoringEvents ?? MONITORING_NOTE_EVENT_LIMIT),
    );
    this.maxMonitoringOnsets = Math.max(
      1,
      Math.floor(options.maxMonitoringOnsets ?? MONITORING_ONSET_LIMIT),
    );
    this.streamMode = options.streamMode ?? 'session';
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.previousOperationState = capture.currentSnapshot.operationState;
    this.previousMonitoringEligible = this.monitoringEligible();
    if (this.streamMode === 'monitoring') {
      this.snapshot = { ...InitialAudioAnalysisSnapshot, analysisMode: 'monitoring' };
    }
    this.unsubscribeCaptureChunks = capture.subscribeToChunks(this.handleChunk);
    this.unsubscribeCaptureState = capture.subscribe(this.handleCaptureState);
  }

  get currentSnapshot(): AudioAnalysisSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(source: 'microphone' | 'monitoring' | 'replay' = 'microphone'): void {
    this.runCounter += 1;
    const runId = `${source}-${String(this.runCounter)}`;
    this.inFlightChunks = 0;
    this.snapshot = { ...InitialAudioAnalysisSnapshot, analysisMode: this.streamMode, runId };
    this.ensureWorker();
    this.worker?.postMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId,
      type: 'reset',
    } satisfies AnalysisWorkerInbound);
    this.emit();
  }

  dispose(): void {
    this.unsubscribeCaptureChunks();
    this.unsubscribeCaptureState();
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
  }

  private readonly handleCaptureState = () => {
    const nextState = this.capture.currentSnapshot.operationState;
    if (
      this.streamMode === 'session' &&
      nextState === 'idle' &&
      (this.previousOperationState === 'finalizing' || this.previousOperationState === 'replaying')
    ) {
      this.worker?.postMessage({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'finish',
      } satisfies AnalysisWorkerInbound);
    }
    const monitoringEligible = this.monitoringEligible();
    if (
      this.streamMode === 'monitoring' &&
      !monitoringEligible &&
      this.previousMonitoringEligible
    ) {
      this.clearMonitoringRun();
    }
    this.previousOperationState = nextState;
    this.previousMonitoringEligible = monitoringEligible;
  };

  private readonly handleChunk = (chunk: PcmChunk) => {
    const stream = pcmStream(chunk);
    if (
      this.streamMode === 'monitoring'
        ? stream !== 'monitoring' || !this.monitoringEligible()
        : stream === 'monitoring'
    ) {
      return;
    }
    if (this.streamMode === 'monitoring') {
      if (chunk.sequence === 0 || this.snapshot.runId === null) {
        this.reset('monitoring');
      }
    } else if (chunk.sequence === 0) {
      this.reset(chunk.source);
    }
    if (this.inFlightChunks >= this.maxInFlightChunks) {
      this.update({ droppedChunks: this.snapshot.droppedChunks + 1 });
      return;
    }
    this.ensureWorker();
    const data = chunk.data.slice();
    const analysisChunk: PcmChunk = { ...chunk, data };
    this.inFlightChunks += 1;
    this.worker?.postMessage(
      {
        chunk: analysisChunk,
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'chunk',
      } satisfies AnalysisWorkerInbound,
      [data.buffer],
    );
  };

  private monitoringEligible(): boolean {
    const capture = this.capture.currentSnapshot;
    return (
      capture.connectionState === 'monitoring' &&
      ['failed', 'idle', 'paused'].includes(capture.operationState)
    );
  }

  private clearMonitoringRun(): void {
    this.inFlightChunks = 0;
    this.snapshot = { ...InitialAudioAnalysisSnapshot, analysisMode: 'monitoring' };
    if (this.worker !== null) {
      this.runCounter += 1;
      this.worker.postMessage({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        runId: `monitoring-cleared-${String(this.runCounter)}`,
        type: 'reset',
      } satisfies AnalysisWorkerInbound);
    }
    this.emit();
  }

  private ensureWorker(): void {
    if (this.worker !== null) return;
    this.worker = this.workerFactory();
    this.worker.onmessage = this.handleWorkerMessage;
    this.worker.onerror = () => this.update({ error: 'The audio analysis worker failed.' });
    const runId = this.snapshot.runId ?? 'audio-analysis-0';
    this.worker.postMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId,
      type: 'initialize',
    } satisfies AnalysisWorkerInbound);
  }

  private readonly handleWorkerMessage = (event: MessageEvent<unknown>) => {
    const parsed = AnalysisWorkerOutboundSchema.safeParse(event.data);
    if (!parsed.success) {
      this.update({ error: 'The audio analysis worker returned invalid data.' });
      return;
    }
    const message = parsed.data;
    if (this.snapshot.runId === null || message.runId !== this.snapshot.runId) return;
    if (message.type === 'ready') return;
    if (message.type === 'complete') {
      this.update({ runComplete: true });
      return;
    }
    if (message.type === 'failure') {
      this.update({ error: message.message });
      return;
    }
    this.inFlightChunks = Math.max(0, this.inFlightChunks - 1);
    const allEvents =
      message.events.length === 0
        ? this.snapshot.events
        : this.mergeEvents(this.snapshot.events, message.events, (event) => event.time.startMs);
    const events =
      this.streamMode === 'monitoring' && allEvents.length > this.maxMonitoringEvents
        ? allEvents.slice(-this.maxMonitoringEvents)
        : allEvents;
    const allOnsets =
      message.onsets.length === 0
        ? this.snapshot.onsets
        : this.mergeEvents(this.snapshot.onsets, message.onsets, (onset) => onset.atMs);
    const onsets =
      this.streamMode === 'monitoring' && allOnsets.length > this.maxMonitoringOnsets
        ? allOnsets.slice(-this.maxMonitoringOnsets)
        : allOnsets;
    this.update({
      analysisSampleRate: message.analysisSampleRate,
      currentEvent: events.at(-1) ?? null,
      error: null,
      events,
      maxProcessingLatencyMs: Math.max(
        this.snapshot.maxProcessingLatencyMs,
        message.processingLatencyMs,
      ),
      inputSampleRate: message.inputSampleRate,
      onsets,
      processingLatencyMs: message.processingLatencyMs,
      state: message.state,
    });
  };

  private mergeEvents<TEvent extends { id: string }>(
    existing: readonly TEvent[],
    updates: readonly TEvent[],
    timestamp: (event: TEvent) => number,
  ): TEvent[] {
    const byId = new Map(existing.map((event) => [event.id, event]));
    for (const event of updates) byId.set(event.id, event);
    return [...byId.values()].sort((left, right) => timestamp(left) - timestamp(right));
  }

  private update(patch: Partial<AudioAnalysisSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
