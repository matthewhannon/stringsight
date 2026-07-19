/// <reference lib="webworker" />

import {
  AnalysisWorkerInboundSchema,
  StreamingMonophonicPipeline,
  type AnalysisWorkerOutbound,
} from '../audio/analysis';
import { sessionTimestampMs, WORKER_PROTOCOL_VERSION } from '../shared';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let analyzer: StreamingMonophonicPipeline | null = null;
let lastSourceTimestampMs = 0;
let runId = 'audio-analysis';
let sampleRate = 0;

function post(message: AnalysisWorkerOutbound): void {
  workerScope.postMessage(message);
}

function reset(nextRunId: string): void {
  analyzer = null;
  lastSourceTimestampMs = 0;
  runId = nextRunId;
  sampleRate = 0;
}

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const message = AnalysisWorkerInboundSchema.parse(event.data);
    if (message.type === 'initialize' || message.type === 'reset') {
      reset(message.runId);
      post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId, type: 'ready' });
      return;
    }
    if (message.type === 'chunk') {
      if (analyzer === null) {
        sampleRate = message.chunk.sampleRate;
        analyzer = new StreamingMonophonicPipeline(sampleRate, runId);
      }
      if (message.chunk.sampleRate !== sampleRate) {
        throw new Error('Audio sample rate changed during an analysis run.');
      }
      const startedAt = performance.now();
      const result = analyzer.push(
        message.chunk.data,
        message.chunk.startMs,
        message.chunk.diagnostics.discontinuity,
      );
      lastSourceTimestampMs = result.sourceTimestampMs;
      post({
        ...result,
        processingLatencyMs: Math.max(0, performance.now() - startedAt),
        protocolVersion: WORKER_PROTOCOL_VERSION,
        runId,
        sourceTimestampMs: sessionTimestampMs(result.sourceTimestampMs),
        type: 'update',
      });
      return;
    }
    if (analyzer === null) {
      post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId, type: 'complete' });
      return;
    }
    const startedAt = performance.now();
    const result = analyzer.finish(lastSourceTimestampMs);
    post({
      ...result,
      processingLatencyMs: Math.max(0, performance.now() - startedAt),
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId,
      sourceTimestampMs: sessionTimestampMs(result.sourceTimestampMs),
      type: 'update',
    });
    post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId, type: 'complete' });
  } catch (error) {
    post({
      message: error instanceof Error ? error.message : 'Unknown audio analysis failure.',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId,
      type: 'failure',
    });
  }
};
