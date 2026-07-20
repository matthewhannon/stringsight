import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PcmChunk,
  TransportInboundMessage,
  TransportOutboundMessage,
} from '../audio/capture/contracts';
import { sessionTimestampMs } from '../shared';

type TestWorkerScope = {
  onmessage: ((event: MessageEvent<TransportInboundMessage>) => void) | null;
  postMessage: (message: TransportOutboundMessage, transfer?: Transferable[]) => void;
};

const chunk = (frameCount: number, sampleRate = 1_000): PcmChunk => ({
  channelCount: 1 as const,
  data: new Float32Array(frameCount).fill(0.25),
  diagnostics: {
    clippingSamples: 0,
    discontinuity: false,
    peak: 0.25,
    rms: 0.25,
    silent: false,
  },
  durationMs: (frameCount / sampleRate) * 1_000,
  frameCount,
  sampleRate,
  schemaVersion: 1 as const,
  sequence: 0,
  source: 'microphone' as const,
  startMs: sessionTimestampMs(0),
  startSampleFrame: 0,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('audio transport worker retention and limits', () => {
  it('clears retained chunks after a terminal worker failure', async () => {
    const posted: TransportOutboundMessage[] = [];
    const scope: TestWorkerScope = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };
    vi.stubGlobal('self', scope);
    await import('./audio-transport.worker');
    const send = (message: TransportInboundMessage) =>
      scope.onmessage?.(new MessageEvent('message', { data: message }));

    send({
      maxRecordingFrames: 10,
      recordedAt: '2026-07-19T00:00:00.000Z',
      sampleRate: 1_000,
      startedAtMs: 0,
      type: 'initialize',
    });
    send({ chunk: chunk(2), type: 'chunk' });
    send({
      chunk: {
        ...chunk(1),
        diagnostics: { ...chunk(1).diagnostics, discontinuity: true },
        sequence: 3,
        startSampleFrame: 9,
      },
      type: 'chunk',
    });
    send({ chunk: chunk(2, 2_000), type: 'chunk' });
    expect(posted.at(-1)).toMatchObject({ type: 'failure' });

    posted.length = 0;
    send({ type: 'finish' });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'failure' });
  });

  it('accepts only the configured frame limit and finalizes it successfully', async () => {
    const posted: TransportOutboundMessage[] = [];
    const scope: TestWorkerScope = {
      onmessage: null,
      postMessage: (message) => posted.push(message),
    };
    vi.stubGlobal('self', scope);
    await import('./audio-transport.worker');
    const send = (message: TransportInboundMessage) =>
      scope.onmessage?.(new MessageEvent('message', { data: message }));

    send({
      maxRecordingFrames: 3,
      recordedAt: '2026-07-19T00:00:00.000Z',
      sampleRate: 1_000,
      startedAtMs: 0,
      type: 'initialize',
    });
    send({ chunk: chunk(5), type: 'chunk' });
    send({ chunk: chunk(1), type: 'chunk' });
    expect(posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bufferedFrames: 3, type: 'acknowledged' }),
        expect.objectContaining({ bufferedFrames: 3, type: 'limit-reached' }),
      ]),
    );
    send({ type: 'finish' });
    const finalized = posted.find((message) => message.type === 'finalized');
    expect(finalized).toMatchObject({
      recording: { durationMs: 3, frameCount: 3 },
      type: 'finalized',
    });
    send({ type: 'reset' });
  });
});
