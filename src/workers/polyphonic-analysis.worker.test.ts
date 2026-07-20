import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PolyphonicWorkerInbound, PolyphonicWorkerOutbound } from '../audio/polyphonic';
import type { PcmChunk } from '../audio/capture';
import { sessionTimestampMs, WORKER_PROTOCOL_VERSION } from '../shared';

const modelAnalyze = vi.hoisted(() => vi.fn());

vi.mock('../audio/polyphonic/basic-pitch-model', () => ({
  BasicPitchModelRunner: class {
    readonly analyze = modelAnalyze;
  },
}));

type TestWorkerScope = {
  onmessage: ((event: MessageEvent<PolyphonicWorkerInbound>) => void) | null;
  postMessage: (message: PolyphonicWorkerOutbound) => void;
};

const pcmChunk = (stream: 'monitoring' | 'recording'): PcmChunk => ({
  channelCount: 1,
  data: new Float32Array(4_800).fill(0.01),
  diagnostics: {
    clippingSamples: 0,
    discontinuity: false,
    peak: 0.01,
    rms: 0.01,
    silent: false,
  },
  durationMs: 100,
  frameCount: 4_800,
  sampleRate: 48_000,
  schemaVersion: 1,
  sequence: 0,
  source: 'microphone',
  startMs: sessionTimestampMs(0),
  startSampleFrame: 0,
  stream,
});

afterEach(() => {
  modelAnalyze.mockReset();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('polyphonic analysis worker monitoring retention', () => {
  it('never invokes the finalized model during monitoring', async () => {
    const posted: PolyphonicWorkerOutbound[] = [];
    const scope: TestWorkerScope = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };
    vi.stubGlobal('self', scope);
    await import('./polyphonic-analysis.worker');
    const send = (message: PolyphonicWorkerInbound) =>
      scope.onmessage?.(new MessageEvent('message', { data: message }));

    send({
      analysisMode: 'monitoring',
      chordAnalysisProfile: 'accurate',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'monitoring-1',
      type: 'initialize',
    });
    send({
      chunk: pcmChunk('monitoring'),
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: 'chunk',
    });
    send({ protocolVersion: WORKER_PROTOCOL_VERSION, type: 'finish' });

    expect(modelAnalyze).not.toHaveBeenCalled();
    expect(posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: 'monitoring-1', type: 'update' }),
        expect.objectContaining({ runId: 'monitoring-1', type: 'complete' }),
      ]),
    );
  });

  it('rejects recording PCM from a monitoring worker', async () => {
    const posted: PolyphonicWorkerOutbound[] = [];
    const scope: TestWorkerScope = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };
    vi.stubGlobal('self', scope);
    await import('./polyphonic-analysis.worker');
    const send = (message: PolyphonicWorkerInbound) =>
      scope.onmessage?.(new MessageEvent('message', { data: message }));

    send({
      analysisMode: 'monitoring',
      chordAnalysisProfile: 'accurate',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'monitoring-1',
      type: 'initialize',
    });
    send({
      chunk: pcmChunk('recording'),
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: 'chunk',
    });

    expect(posted.at(-1)).toMatchObject({
      message: 'Polyphonic analysis received PCM for the wrong analysis mode.',
      runId: 'monitoring-1',
      type: 'failure',
    });
    expect(modelAnalyze).not.toHaveBeenCalled();
  });

  it('keeps the recording path finalizable and invokes the model only at finish', async () => {
    modelAnalyze.mockResolvedValue({
      backend: 'cpu',
      inferenceMs: 2,
      loadMs: 3,
      notes: [],
      outputFrameCount: 0,
      windowCount: 1,
    });
    const posted: PolyphonicWorkerOutbound[] = [];
    const scope: TestWorkerScope = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };
    vi.stubGlobal('self', scope);
    await import('./polyphonic-analysis.worker');
    const send = (message: PolyphonicWorkerInbound) =>
      scope.onmessage?.(new MessageEvent('message', { data: message }));

    send({
      analysisMode: 'session',
      chordAnalysisProfile: 'accurate',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: 'microphone-1',
      type: 'initialize',
    });
    send({
      chordAnalysisProfile: 'responsive',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: 'set-profile',
    });
    send({
      chunk: pcmChunk('recording'),
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: 'chunk',
    });
    expect(modelAnalyze).not.toHaveBeenCalled();

    send({ protocolVersion: WORKER_PROTOCOL_VERSION, type: 'finish' });

    await vi.waitFor(() => expect(modelAnalyze).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(posted.at(-1)).toMatchObject({ runId: 'microphone-1', type: 'complete' }),
    );
    expect(posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chordAnalysisProfile: 'responsive',
          eventUpdateMode: 'replace',
          modelState: 'ready',
          runId: 'microphone-1',
          type: 'update',
        }),
      ]),
    );
  });
});
