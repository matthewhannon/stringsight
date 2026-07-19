import { describe, expect, it, vi } from 'vitest';

import { ChordEventSchema, CONTRACT_SCHEMA_VERSION, WORKER_PROTOCOL_VERSION } from '../../shared';
import {
  InitialCaptureSnapshot,
  MicrophoneCapture,
  PcmChunkSchema,
  type PcmChunk,
} from '../capture';
import { PolyphonicAnalysisController } from './controller';

class FakeWorker {
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

const pcmChunk = PcmChunkSchema.parse({
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
  sequence: 0,
  source: 'microphone',
  startMs: 0,
  startSampleFrame: 0,
});

const chordEvent = ChordEventSchema.parse({
  candidates: [
    {
      bass: 'C',
      confidence: 0.85,
      pitchClasses: ['C', 'E', 'G'],
      quality: 'major',
      rank: 1,
      root: 'C',
      score: 0.9,
      symbol: 'C',
    },
  ],
  id: 'microphone-1-chord-1',
  kind: 'chord',
  lifecycle: 'provisional',
  provenance: {
    algorithm: 'windowed-spectrum-chord-templates',
    generatedAtMs: 400,
    runId: 'microphone-1',
    subsystem: 'polyphonic-analysis',
    version: '0.1.0',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 400, startMs: 320 },
});

describe('PolyphonicAnalysisController', () => {
  it('routes capture chunks, validates updates, upserts events, and rejects stale runs', () => {
    const capture = new MicrophoneCapture();
    let chunkListener: ((chunk: PcmChunk) => void) | null = null;
    vi.spyOn(capture, 'subscribeToChunks').mockImplementation((listener) => {
      chunkListener = listener;
      return vi.fn();
    });
    vi.spyOn(capture, 'subscribe').mockImplementation(() => vi.fn());
    Object.defineProperty(capture, 'currentSnapshot', {
      get: () => InitialCaptureSnapshot,
    });
    const worker = new FakeWorker();
    const controller = new PolyphonicAnalysisController(capture, {
      maxInFlightChunks: 1,
      workerFactory: () => worker as unknown as Worker,
    });
    controller.setChordAnalysisProfile('responsive');
    expect(controller.currentSnapshot.chordAnalysisProfile).toBe('responsive');
    expect(worker.messages.at(-1)).toMatchObject({
      chordAnalysisProfile: 'responsive',
      type: 'set-profile',
    });

    const sendChunk = chunkListener as unknown as (chunk: PcmChunk) => void;
    sendChunk(pcmChunk);
    expect(controller.currentSnapshot.runId).toBe('microphone-1');
    expect(worker.messages).toHaveLength(4);
    sendChunk(PcmChunkSchema.parse({ ...pcmChunk, sequence: 1 }));
    expect(controller.currentSnapshot.droppedChunks).toBe(1);

    worker.emit({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'ready',
    });

    worker.emit({
      analysisSampleRate: 16_000,
      chordAnalysisProfile: 'accurate',
      chordEvents: [chordEvent],
      chroma: [0.3, 0, 0, 0, 0.3, 0, 0, 0.4, 0, 0, 0, 0],
      energy: 0.1,
      eventUpdateMode: 'upsert',
      inputSampleRate: 48_000,
      modelBackend: 'wasm',
      modelInferenceMs: 120,
      modelLoadMs: 480,
      modelState: 'ready',
      modelWindowCount: 2,
      noteSetEvents: [],
      processingLatencyMs: 5,
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      sourceTimestampMs: 400,
      state: 'tracking',
      type: 'update',
    });
    expect(controller.currentSnapshot).toMatchObject({
      currentChord: { id: chordEvent.id },
      maxProcessingLatencyMs: 5,
      modelBackend: 'wasm',
      modelState: 'ready',
      state: 'tracking',
    });
    sendChunk(PcmChunkSchema.parse({ ...pcmChunk, sequence: 2, startMs: 8, startSampleFrame: 8 }));
    expect(worker.messages.at(-1)).toMatchObject({
      chunk: {
        diagnostics: { discontinuity: true },
        sequence: 2,
        startMs: 8,
      },
      type: 'chunk',
    });
    worker.emit({
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'complete',
    });
    expect(controller.currentSnapshot.runComplete).toBe(true);
    worker.emit({
      analysisSampleRate: 16_000,
      chordAnalysisProfile: 'accurate',
      chordEvents: [],
      chroma: [0.3, 0, 0, 0, 0.3, 0, 0, 0.4, 0, 0, 0, 0],
      energy: 0.1,
      eventUpdateMode: 'replace',
      inputSampleRate: 48_000,
      modelBackend: 'wasm',
      modelInferenceMs: 120,
      modelLoadMs: 480,
      modelState: 'ready',
      modelWindowCount: 2,
      noteSetEvents: [],
      processingLatencyMs: 6,
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      sourceTimestampMs: 400,
      state: 'tracking',
      type: 'update',
    });
    expect(controller.currentSnapshot).toMatchObject({
      chordEvents: [],
      currentChord: null,
      maxProcessingLatencyMs: 6,
    });
    worker.emit({
      message: 'Provisional analyzer failed.',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'failure',
    });
    expect(controller.currentSnapshot.error).toBe('Provisional analyzer failed.');
    worker.onerror?.(new Event('error'));
    expect(controller.currentSnapshot.error).toMatch(/worker failed/i);

    controller.reset('replay');
    worker.emit({
      message: 'stale failure',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'failure',
    });
    expect(controller.currentSnapshot).toMatchObject({
      error: null,
      runComplete: false,
      runId: 'replay-2',
    });
    worker.emit({ invalid: true });
    expect(controller.currentSnapshot.error).toMatch(/invalid data/i);

    controller.dispose();
    expect(worker.terminated).toBe(true);
  });
});
