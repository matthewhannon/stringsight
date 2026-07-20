import { WORKER_PROTOCOL_VERSION, type ChordEvent, type NoteSetEvent } from '../../shared';
import { type MicrophoneCapture, type PcmChunk } from '../capture';
import {
  PolyphonicWorkerOutboundSchema,
  type ChordAnalysisProfile,
  type PolyphonicModelState,
  type PolyphonicWorkerInbound,
} from './contracts';
import type { PolyphonicAnalysisState } from './streaming';

export type PolyphonicAnalysisSnapshot = {
  analysisMode: AnalysisStreamMode;
  analysisSampleRate: number | null;
  chordEvents: readonly ChordEvent[];
  chordAnalysisProfile: ChordAnalysisProfile;
  chroma: readonly number[];
  currentChord: ChordEvent | null;
  currentNoteSet: NoteSetEvent | null;
  droppedChunks: number;
  energy: number;
  error: string | null;
  inputSampleRate: number | null;
  maxProcessingLatencyMs: number;
  modelBackend: 'cpu' | 'wasm' | null;
  modelInferenceMs: number | null;
  modelLoadMs: number | null;
  modelState: PolyphonicModelState;
  modelWindowCount: number;
  noteSetEvents: readonly NoteSetEvent[];
  processingLatencyMs: number;
  runComplete: boolean;
  runId: string | null;
  state: PolyphonicAnalysisState;
};

const emptyChroma = (): number[] => Array.from({ length: 12 }, () => 0);

export const InitialPolyphonicAnalysisSnapshot: PolyphonicAnalysisSnapshot = {
  analysisMode: 'session',
  analysisSampleRate: null,
  chordEvents: [],
  chordAnalysisProfile: 'accurate',
  chroma: emptyChroma(),
  currentChord: null,
  currentNoteSet: null,
  droppedChunks: 0,
  energy: 0,
  error: null,
  inputSampleRate: null,
  maxProcessingLatencyMs: 0,
  modelBackend: null,
  modelInferenceMs: null,
  modelLoadMs: null,
  modelState: 'not-loaded',
  modelWindowCount: 0,
  noteSetEvents: [],
  processingLatencyMs: 0,
  runComplete: false,
  runId: null,
  state: 'silence',
};

type SnapshotListener = () => void;
type WorkerFactory = () => Worker;
export type AnalysisStreamMode = 'monitoring' | 'session';

export const MONITORING_CHORD_EVENT_LIMIT = 12;

const pcmStream = (chunk: PcmChunk): 'monitoring' | 'recording' | 'replay' =>
  chunk.stream ?? (chunk.source === 'replay' ? 'replay' : 'recording');

const defaultWorkerFactory = (): Worker =>
  new Worker(new URL('../../workers/polyphonic-analysis.worker.ts', import.meta.url), {
    name: 'stringsight-polyphonic-analysis',
    type: 'module',
  });

export class PolyphonicAnalysisController {
  private readonly capture: MicrophoneCapture;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly maxInFlightChunks: number;
  private readonly maxMonitoringEvents: number;
  private readonly streamMode: AnalysisStreamMode;
  private readonly unsubscribeCaptureChunks: () => void;
  private readonly unsubscribeCaptureState: () => void;
  private readonly workerFactory: WorkerFactory;
  private inFlightChunks = 0;
  private pendingDiscontinuity = false;
  private previousOperationState: string;
  private previousMonitoringEligible: boolean;
  private runCounter = 0;
  private snapshot: PolyphonicAnalysisSnapshot = InitialPolyphonicAnalysisSnapshot;
  private chordAnalysisProfile: ChordAnalysisProfile = 'accurate';
  private worker: Worker | null = null;

  constructor(
    capture: MicrophoneCapture,
    options: {
      maxInFlightChunks?: number;
      maxMonitoringEvents?: number;
      streamMode?: AnalysisStreamMode;
      workerFactory?: WorkerFactory;
    } = {},
  ) {
    this.capture = capture;
    this.maxInFlightChunks = options.maxInFlightChunks ?? 8;
    this.maxMonitoringEvents = Math.max(
      1,
      Math.floor(options.maxMonitoringEvents ?? MONITORING_CHORD_EVENT_LIMIT),
    );
    this.streamMode = options.streamMode ?? 'session';
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.previousOperationState = capture.currentSnapshot.operationState;
    this.previousMonitoringEligible = this.monitoringEligible();
    if (this.streamMode === 'monitoring') {
      this.snapshot = {
        ...InitialPolyphonicAnalysisSnapshot,
        analysisMode: 'monitoring',
        chroma: emptyChroma(),
      };
    }
    this.unsubscribeCaptureChunks = capture.subscribeToChunks(this.handleChunk);
    this.unsubscribeCaptureState = capture.subscribe(this.handleCaptureState);
  }

  get currentSnapshot(): PolyphonicAnalysisSnapshot {
    return this.snapshot;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setChordAnalysisProfile(profile: ChordAnalysisProfile): void {
    this.chordAnalysisProfile = profile;
    this.update({ chordAnalysisProfile: profile });
    this.ensureWorker();
    this.worker?.postMessage({
      chordAnalysisProfile: profile,
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: 'set-profile',
    } satisfies PolyphonicWorkerInbound);
  }

  reset(source: 'microphone' | 'monitoring' | 'replay' = 'microphone'): void {
    this.runCounter += 1;
    const runId = `${source}-${String(this.runCounter)}`;
    this.inFlightChunks = 0;
    this.pendingDiscontinuity = false;
    this.snapshot = {
      ...InitialPolyphonicAnalysisSnapshot,
      analysisMode: this.streamMode,
      chordAnalysisProfile: this.chordAnalysisProfile,
      chroma: emptyChroma(),
      runId,
    };
    this.ensureWorker();
    this.worker?.postMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      analysisMode: this.streamMode,
      chordAnalysisProfile: this.chordAnalysisProfile,
      runId,
      type: 'reset',
    } satisfies PolyphonicWorkerInbound);
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
      } satisfies PolyphonicWorkerInbound);
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
      this.pendingDiscontinuity = true;
      this.update({ droppedChunks: this.snapshot.droppedChunks + 1 });
      return;
    }
    this.ensureWorker();
    const data = chunk.data.slice();
    const forwardedChunk = this.pendingDiscontinuity
      ? {
          ...chunk,
          data,
          diagnostics: { ...chunk.diagnostics, discontinuity: true },
        }
      : { ...chunk, data };
    this.pendingDiscontinuity = false;
    this.inFlightChunks += 1;
    this.worker?.postMessage(
      {
        chunk: forwardedChunk,
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'chunk',
      } satisfies PolyphonicWorkerInbound,
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
    this.pendingDiscontinuity = false;
    this.snapshot = {
      ...InitialPolyphonicAnalysisSnapshot,
      analysisMode: 'monitoring',
      chordAnalysisProfile: this.chordAnalysisProfile,
      chroma: emptyChroma(),
    };
    if (this.worker !== null) {
      this.runCounter += 1;
      this.worker.postMessage({
        chordAnalysisProfile: this.chordAnalysisProfile,
        analysisMode: this.streamMode,
        protocolVersion: WORKER_PROTOCOL_VERSION,
        runId: `monitoring-cleared-${String(this.runCounter)}`,
        type: 'reset',
      } satisfies PolyphonicWorkerInbound);
    }
    this.emit();
  }

  private ensureWorker(): void {
    if (this.worker !== null) return;
    this.worker = this.workerFactory();
    this.worker.onmessage = this.handleWorkerMessage;
    this.worker.onerror = () => this.update({ error: 'The polyphonic analysis worker failed.' });
    this.worker.postMessage({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      analysisMode: this.streamMode,
      chordAnalysisProfile: this.chordAnalysisProfile,
      runId: this.snapshot.runId ?? 'polyphonic-analysis-0',
      type: 'initialize',
    } satisfies PolyphonicWorkerInbound);
  }

  private readonly handleWorkerMessage = (event: MessageEvent<unknown>) => {
    const parsed = PolyphonicWorkerOutboundSchema.safeParse(event.data);
    if (!parsed.success) {
      this.update({ error: 'The polyphonic analysis worker returned invalid data.' });
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
    const chordEvents =
      message.eventUpdateMode === 'replace'
        ? [...message.chordEvents]
        : this.mergeEvents(this.snapshot.chordEvents, message.chordEvents);
    const retainedChordEvents =
      this.streamMode === 'monitoring' ? chordEvents.slice(-this.maxMonitoringEvents) : chordEvents;
    const noteSetEvents =
      message.eventUpdateMode === 'replace'
        ? [...message.noteSetEvents]
        : this.mergeEvents(this.snapshot.noteSetEvents, message.noteSetEvents);
    this.update({
      analysisSampleRate: message.analysisSampleRate,
      chordAnalysisProfile: message.chordAnalysisProfile,
      chordEvents: retainedChordEvents,
      chroma: message.chroma,
      currentChord: retainedChordEvents.at(-1) ?? null,
      currentNoteSet: noteSetEvents.at(-1) ?? null,
      energy: message.energy,
      error: null,
      inputSampleRate: message.inputSampleRate,
      maxProcessingLatencyMs: Math.max(
        this.snapshot.maxProcessingLatencyMs,
        message.processingLatencyMs,
      ),
      modelBackend: message.modelBackend,
      modelInferenceMs: message.modelInferenceMs,
      modelLoadMs: message.modelLoadMs,
      modelState: message.modelState,
      modelWindowCount: message.modelWindowCount,
      noteSetEvents,
      processingLatencyMs: message.processingLatencyMs,
      state: message.state,
    });
  };

  private mergeEvents<TEvent extends { id: string; time: { startMs: number } }>(
    existing: readonly TEvent[],
    updates: readonly TEvent[],
  ): TEvent[] {
    const byId = new Map(existing.map((event) => [event.id, event]));
    for (const event of updates) byId.set(event.id, event);
    return [...byId.values()].sort((left, right) => left.time.startMs - right.time.startMs);
  }

  private update(patch: Partial<PolyphonicAnalysisSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
