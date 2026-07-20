import { describe, expect, it, vi } from 'vitest';

import {
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  WORKER_PROTOCOL_VERSION,
  sessionTimestampMs,
} from '../../shared';
import {
  InitialCaptureSnapshot,
  MicrophoneCapture,
  PcmChunkSchema,
  type CaptureSnapshot,
  type PcmChunk,
} from '../capture';
import { AnalysisWorkerUpdateSchema } from './contracts';
import { AudioAnalysisController } from './controller';

class FakeAnalysisWorker {
  messages: unknown[] = [];
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  terminated = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  emit(message: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: message }));
  }

  terminate(): void {
    this.terminated = true;
  }
}

const noteEvent = NoteEventSchema.parse({
  candidates: [
    {
      centsOffset: 0,
      confidence: 0.9,
      evidence: ['yin-periodicity'],
      frequencyHz: 110,
      midi: 45,
      noteName: 'A2',
      pitchClass: 'A',
      rank: 1,
      score: 0.9,
    },
  ],
  id: 'microphone-1-note-1',
  kind: 'note',
  lifecycle: 'provisional',
  provenance: {
    algorithm: 'yin-energy-monophonic',
    generatedAtMs: 185,
    runId: 'microphone-1',
    subsystem: 'audio-analysis',
    version: '0.1.0',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { startMs: 100 },
});

const pcmChunk = (sequence = 0): PcmChunk =>
  PcmChunkSchema.parse({
    channelCount: 1,
    data: new Float32Array([0, 0.1, -0.1, 0]),
    diagnostics: {
      clippingSamples: 0,
      discontinuity: false,
      peak: 0.1,
      rms: 0.07,
      silent: false,
    },
    durationMs: 4,
    frameCount: 4,
    sampleRate: 1_000,
    schemaVersion: 1,
    sequence,
    source: 'microphone',
    startMs: sessionTimestampMs(sequence * 4),
    startSampleFrame: sequence * 4,
  });

const messageType = (message: unknown): unknown =>
  typeof message === 'object' && message !== null && 'type' in message ? message.type : undefined;

describe('AudioAnalysisController', () => {
  it('routes chunks through the worker and publishes validated event upserts', () => {
    const capture = new MicrophoneCapture();
    let chunkListener: ((chunk: PcmChunk) => void) | null = null;
    let stateListener: (() => void) | null = null;
    let captureSnapshot: CaptureSnapshot = {
      ...InitialCaptureSnapshot,
      operationState: 'idle',
    };
    Object.defineProperty(capture, 'currentSnapshot', { get: () => captureSnapshot });
    const unsubscribeChunks = vi.fn();
    const unsubscribeState = vi.fn();
    vi.spyOn(capture, 'subscribeToChunks').mockImplementation((listener) => {
      chunkListener = listener;
      return unsubscribeChunks;
    });
    vi.spyOn(capture, 'subscribe').mockImplementation((listener) => {
      stateListener = () => listener(captureSnapshot);
      return unsubscribeState;
    });
    const worker = new FakeAnalysisWorker();
    const controller = new AudioAnalysisController(capture, {
      maxInFlightChunks: 1,
      workerFactory: () => worker as unknown as Worker,
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(chunkListener).not.toBeNull();
    const sendChunk = chunkListener as unknown as (chunk: PcmChunk) => void;
    sendChunk(pcmChunk());
    expect(worker.messages.map(messageType)).toEqual(['initialize', 'reset', 'chunk']);
    expect(controller.currentSnapshot.runId).toBe('microphone-1');

    sendChunk(pcmChunk(1));
    expect(controller.currentSnapshot.droppedChunks).toBe(1);

    worker.emit({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'ready',
    });
    const updateMessage = AnalysisWorkerUpdateSchema.parse({
      analysisSampleRate: 16_000,
      events: [noteEvent],
      inputSampleRate: 48_000,
      onsets: [
        {
          atMs: 100,
          confidence: 0.92,
          id: 'microphone-1-onset-1',
          provenance: {
            algorithm: 'adaptive-energy-envelope-rise',
            generatedAtMs: 105,
            runId: 'microphone-1',
            subsystem: 'audio-analysis',
            version: '0.1.0',
          },
          rms: 0.1,
          schemaVersion: CONTRACT_SCHEMA_VERSION,
          strengthDb: 18,
        },
      ],
      processingLatencyMs: 2.5,
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      sourceTimestampMs: 200,
      state: 'tracking',
      type: 'update',
    });
    worker.emit(updateMessage);
    expect(controller.currentSnapshot).toMatchObject({
      analysisSampleRate: 16_000,
      currentEvent: { id: noteEvent.id },
      maxProcessingLatencyMs: 2.5,
      inputSampleRate: 48_000,
      processingLatencyMs: 2.5,
      state: 'tracking',
    });
    expect(controller.currentSnapshot.events).toHaveLength(1);
    expect(controller.currentSnapshot.onsets).toHaveLength(1);
    worker.emit({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'complete',
    });
    expect(controller.currentSnapshot.runComplete).toBe(true);

    controller.reset('replay');
    worker.emit(updateMessage);
    expect(controller.currentSnapshot).toMatchObject({
      events: [],
      runComplete: false,
      runId: 'replay-2',
    });

    captureSnapshot = { ...captureSnapshot, operationState: 'finalizing' };
    const notifyState = stateListener as unknown as () => void;
    notifyState();
    captureSnapshot = { ...captureSnapshot, operationState: 'idle' };
    notifyState();
    expect(worker.messages.some((message) => messageType(message) === 'finish')).toBe(true);

    worker.emit({ invalid: true });
    expect(controller.currentSnapshot.error).toMatch(/invalid data/i);
    worker.emit({
      message: 'DSP failed.',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'replay-2',
      type: 'failure',
    });
    expect(controller.currentSnapshot.error).toBe('DSP failed.');
    worker.onerror?.(new Event('error'));
    expect(controller.currentSnapshot.error).toMatch(/worker failed/i);

    controller.dispose();
    expect(unsubscribeChunks).toHaveBeenCalled();
    expect(unsubscribeState).toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
    expect(listener).toHaveBeenCalled();
  });

  it('keeps monitoring runs bounded and isolated from recording chunks', () => {
    const capture = new MicrophoneCapture();
    let chunkListener: ((chunk: PcmChunk) => void) | null = null;
    let stateListener: (() => void) | null = null;
    let captureSnapshot: CaptureSnapshot = {
      ...InitialCaptureSnapshot,
      connectionState: 'monitoring',
    };
    Object.defineProperty(capture, 'currentSnapshot', { get: () => captureSnapshot });
    vi.spyOn(capture, 'subscribeToChunks').mockImplementation((listener) => {
      chunkListener = listener;
      return vi.fn();
    });
    vi.spyOn(capture, 'subscribe').mockImplementation((listener) => {
      stateListener = () => listener(captureSnapshot);
      return vi.fn();
    });
    const worker = new FakeAnalysisWorker();
    const controller = new AudioAnalysisController(capture, {
      maxMonitoringRunMs: 10,
      streamMode: 'monitoring',
      workerFactory: () => worker as unknown as Worker,
    });
    const sendChunk = chunkListener as unknown as (chunk: PcmChunk) => void;

    sendChunk({ ...pcmChunk(), stream: 'recording' });
    expect(worker.messages).toEqual([]);
    sendChunk({ ...pcmChunk(), stream: 'monitoring' });
    expect(controller.currentSnapshot.runId).toBe('monitoring-1');
    expect(worker.messages.map(messageType)).toEqual(['initialize', 'reset', 'chunk']);

    sendChunk({
      ...pcmChunk(1),
      startMs: sessionTimestampMs(12),
      stream: 'monitoring',
    });
    expect(controller.currentSnapshot.runId).toBe('monitoring-2');
    expect(worker.messages.map(messageType)).toEqual([
      'initialize',
      'reset',
      'chunk',
      'reset',
      'chunk',
    ]);

    captureSnapshot = { ...captureSnapshot, operationState: 'recording' };
    const notifyState = stateListener as unknown as () => void;
    notifyState();
    expect(controller.currentSnapshot.runId).toBeNull();
    expect(worker.messages.at(-1)).toMatchObject({ type: 'reset' });
    controller.dispose();
  });
});
