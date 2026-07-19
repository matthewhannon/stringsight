import { WORKER_PROTOCOL_VERSION, type NoteEvent } from '../../shared';
import { type MicrophoneCapture, type PcmChunk } from '../capture';
import {
  AnalysisWorkerOutboundSchema,
  type AnalysisState,
  type AnalysisWorkerInbound,
  type OnsetObservation,
} from './contracts';

export type AudioAnalysisSnapshot = {
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

const defaultWorkerFactory = (): Worker =>
  new Worker(new URL('../../workers/audio-analysis.worker.ts', import.meta.url), {
    name: 'stringsight-audio-analysis',
    type: 'module',
  });

export class AudioAnalysisController {
  private readonly capture: MicrophoneCapture;
  private readonly listeners = new Set<SnapshotListener>();
  private readonly maxInFlightChunks: number;
  private readonly unsubscribeCaptureChunks: () => void;
  private readonly unsubscribeCaptureState: () => void;
  private readonly workerFactory: WorkerFactory;
  private inFlightChunks = 0;
  private previousCaptureState: string;
  private runCounter = 0;
  private snapshot: AudioAnalysisSnapshot = InitialAudioAnalysisSnapshot;
  private worker: Worker | null = null;

  constructor(
    capture: MicrophoneCapture,
    options: { maxInFlightChunks?: number; workerFactory?: WorkerFactory } = {},
  ) {
    this.capture = capture;
    this.maxInFlightChunks = options.maxInFlightChunks ?? 8;
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.previousCaptureState = capture.currentSnapshot.state;
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

  reset(source: 'microphone' | 'replay' = 'microphone'): void {
    this.runCounter += 1;
    const runId = `${source}-${String(this.runCounter)}`;
    this.inFlightChunks = 0;
    this.snapshot = { ...InitialAudioAnalysisSnapshot, runId };
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
    const nextState = this.capture.currentSnapshot.state;
    if (
      nextState === 'ready-to-replay' &&
      (this.previousCaptureState === 'stopping' || this.previousCaptureState === 'replaying')
    ) {
      this.worker?.postMessage({
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: 'finish',
      } satisfies AnalysisWorkerInbound);
    }
    this.previousCaptureState = nextState;
  };

  private readonly handleChunk = (chunk: PcmChunk) => {
    if (chunk.sequence === 0) this.reset(chunk.source);
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
    const eventsById = new Map(this.snapshot.events.map((noteEvent) => [noteEvent.id, noteEvent]));
    for (const noteEvent of message.events) eventsById.set(noteEvent.id, noteEvent);
    const onsetsById = new Map(this.snapshot.onsets.map((onset) => [onset.id, onset]));
    for (const onset of message.onsets) onsetsById.set(onset.id, onset);
    const events = [...eventsById.values()].sort(
      (left, right) => left.time.startMs - right.time.startMs,
    );
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
      onsets: [...onsetsById.values()].sort((left, right) => left.atMs - right.atMs),
      processingLatencyMs: message.processingLatencyMs,
      state: message.state,
    });
  };

  private update(patch: Partial<AudioAnalysisSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
