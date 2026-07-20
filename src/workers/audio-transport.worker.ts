/// <reference lib="webworker" />

import {
  CapturedRecordingSchema,
  PcmChunkSchema,
  type PcmChunk,
  type TransportInboundMessage,
  type TransportOutboundMessage,
} from '../audio/capture';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let chunks: PcmChunk[] = [];
let bufferedFrames = 0;
let discontinuityCount = 0;
let expectedSequence = 0;
let expectedStartFrame: number | null = null;
let maxRecordingFrames = 0;
let recordedAt = '';
let sampleRate = 0;
let startedAtMs = 0;

function post(message: TransportOutboundMessage, transfer: Transferable[] = []): void {
  workerScope.postMessage(message, transfer);
}

function reset(): void {
  chunks = [];
  bufferedFrames = 0;
  discontinuityCount = 0;
  expectedSequence = 0;
  expectedStartFrame = null;
  maxRecordingFrames = 0;
  recordedAt = '';
  sampleRate = 0;
  startedAtMs = 0;
}

function acceptChunk(candidate: PcmChunk): void {
  const parsed = PcmChunkSchema.parse(candidate);
  if (sampleRate === 0) throw new Error('Transport worker has not been initialized.');
  if (parsed.sampleRate !== sampleRate) throw new Error('PCM sample rate changed during capture.');
  const remainingFrames = Math.max(0, maxRecordingFrames - bufferedFrames);
  if (remainingFrames === 0) {
    post({ bufferedFrames, type: 'limit-reached' });
    return;
  }
  const acceptedFrames = Math.min(parsed.frameCount, remainingFrames);
  const chunk =
    acceptedFrames === parsed.frameCount
      ? parsed
      : PcmChunkSchema.parse({
          ...parsed,
          data: parsed.data.slice(0, acceptedFrames),
          durationMs: (acceptedFrames / parsed.sampleRate) * 1_000,
          frameCount: acceptedFrames,
        });

  const sequenceDiscontinuity = chunk.sequence !== expectedSequence;
  const frameDiscontinuity =
    expectedStartFrame !== null && chunk.startSampleFrame !== expectedStartFrame;
  if (chunk.diagnostics.discontinuity || sequenceDiscontinuity || frameDiscontinuity) {
    discontinuityCount += 1;
  }
  chunks.push(chunk);
  bufferedFrames += chunk.frameCount;
  expectedSequence = chunk.sequence + 1;
  expectedStartFrame = chunk.startSampleFrame + chunk.frameCount;
  post({
    bufferedFrames,
    discontinuityCount,
    sequence: chunk.sequence,
    type: 'acknowledged',
  });
  if (acceptedFrames < parsed.frameCount || bufferedFrames === maxRecordingFrames) {
    post({ bufferedFrames, type: 'limit-reached' });
  }
}

function finalize(): void {
  const data = new Float32Array(bufferedFrames);
  let writeOffset = 0;
  for (const chunk of chunks) {
    data.set(chunk.data, writeOffset);
    writeOffset += chunk.frameCount;
  }
  const recording = CapturedRecordingSchema.parse({
    channelCount: 1,
    data,
    discontinuityCount,
    durationMs: sampleRate === 0 ? 0 : (bufferedFrames / sampleRate) * 1_000,
    frameCount: bufferedFrames,
    recordedAt,
    sampleRate,
    schemaVersion: 1,
    startedAtMs,
  });
  post({ recording, type: 'finalized' }, [recording.data.buffer]);
  reset();
}

workerScope.onmessage = (event: MessageEvent<TransportInboundMessage>) => {
  try {
    const message = event.data;
    if (message.type === 'initialize') {
      reset();
      maxRecordingFrames = message.maxRecordingFrames;
      recordedAt = message.recordedAt;
      sampleRate = message.sampleRate;
      startedAtMs = message.startedAtMs;
      post({ type: 'ready' });
      return;
    }
    if (message.type === 'chunk') {
      acceptChunk(message.chunk);
      return;
    }
    if (message.type === 'finish') {
      finalize();
      return;
    }
    reset();
  } catch (error) {
    reset();
    post({
      message: error instanceof Error ? error.message : 'Unknown audio transport failure.',
      type: 'failure',
    });
  }
};
