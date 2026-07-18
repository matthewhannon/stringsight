import { sessionTimestampMs } from '../../shared';
import {
  DEFAULT_CHUNK_FRAMES,
  PCM_CHUNK_SCHEMA_VERSION,
  type CapturedRecording,
  type PcmChunk,
} from './contracts';
import { analyzePcm } from './signal';

export type ReplayOptions = {
  chunkFrames?: number;
  onChunk: (chunk: PcmChunk) => void;
  realtime?: boolean;
  signal?: AbortSignal;
};

const wait = async (durationMs: number, signal?: AbortSignal): Promise<void> => {
  if (signal?.aborted === true) throw new DOMException('Replay cancelled.', 'AbortError');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, durationMs);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Replay cancelled.', 'AbortError'));
      },
      { once: true },
    );
  });
};

export async function replayRecording(
  recording: CapturedRecording,
  options: ReplayOptions,
): Promise<void> {
  const chunkFrames = options.chunkFrames ?? DEFAULT_CHUNK_FRAMES;
  if (!Number.isInteger(chunkFrames) || chunkFrames <= 0) {
    throw new RangeError('Replay chunk size must be a positive integer.');
  }

  let sequence = 0;
  for (let startFrame = 0; startFrame < recording.frameCount; startFrame += chunkFrames) {
    if (options.signal?.aborted === true) {
      throw new DOMException('Replay cancelled.', 'AbortError');
    }
    const endFrame = Math.min(recording.frameCount, startFrame + chunkFrames);
    const data = recording.data.slice(startFrame, endFrame);
    const diagnostics = analyzePcm(data);
    const durationMs = (data.length / recording.sampleRate) * 1_000;
    options.onChunk({
      channelCount: 1,
      data,
      diagnostics: { ...diagnostics, discontinuity: false },
      durationMs,
      frameCount: data.length,
      sampleRate: recording.sampleRate,
      schemaVersion: PCM_CHUNK_SCHEMA_VERSION,
      sequence,
      source: 'replay',
      startMs: sessionTimestampMs(
        recording.startedAtMs + (startFrame / recording.sampleRate) * 1_000,
      ),
      startSampleFrame: startFrame,
    });
    sequence += 1;
    if (options.realtime === true && endFrame < recording.frameCount) {
      await wait(durationMs, options.signal);
    }
  }
}
