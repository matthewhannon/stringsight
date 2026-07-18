import { z } from 'zod';

import {
  CONTRACT_SCHEMA_VERSION,
  DiagnosticsSchema,
  SessionTimestampMsSchema,
  type AppError,
} from '../../shared';

export const PCM_CHUNK_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;
export const DEFAULT_CHUNK_FRAMES = 2_048;
export const SILENCE_RMS_THRESHOLD = 0.003;
export const CLIPPING_THRESHOLD = 0.995;

export const PcmDiagnosticsSchema = z.object({
  clippingSamples: z.number().int().nonnegative(),
  discontinuity: z.boolean(),
  peak: z.number().min(0).max(1),
  rms: z.number().min(0).max(1),
  silent: z.boolean(),
});

export type PcmDiagnostics = z.infer<typeof PcmDiagnosticsSchema>;

export const PcmChunkSchema = z.object({
  channelCount: z.literal(1),
  data: z.instanceof(Float32Array),
  diagnostics: PcmDiagnosticsSchema,
  durationMs: z.number().nonnegative(),
  frameCount: z.number().int().positive(),
  sampleRate: z.number().int().positive(),
  schemaVersion: z.literal(PCM_CHUNK_SCHEMA_VERSION),
  sequence: z.number().int().nonnegative(),
  source: z.enum(['microphone', 'replay']),
  startMs: SessionTimestampMsSchema,
  startSampleFrame: z.number().int().nonnegative(),
});

export type PcmChunk = z.infer<typeof PcmChunkSchema>;

export const CapturedRecordingSchema = z.object({
  channelCount: z.literal(1),
  data: z.instanceof(Float32Array),
  discontinuityCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  frameCount: z.number().int().nonnegative(),
  recordedAt: z.iso.datetime({ offset: true }),
  sampleRate: z.number().int().positive(),
  schemaVersion: z.literal(PCM_CHUNK_SCHEMA_VERSION),
  startedAtMs: SessionTimestampMsSchema,
});

export type CapturedRecording = z.infer<typeof CapturedRecordingSchema>;

export const WorkletChunkMessageSchema = z.object({
  clippingSamples: z.number().int().nonnegative(),
  data: z.instanceof(Float32Array),
  frameCount: z.number().int().positive(),
  inputChannelMode: z.enum(['mono', 'averaged']).default('mono'),
  inputChannelCount: z.number().int().positive().default(1),
  peak: z.number().min(0).max(1),
  rms: z.number().min(0).max(1),
  sampleRate: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
  startSampleFrame: z.number().int().nonnegative(),
  type: z.literal('chunk'),
});

export const WorkletFlushedMessageSchema = z.object({
  type: z.literal('flushed'),
});

export const WorkletOutboundMessageSchema = z.discriminatedUnion('type', [
  WorkletChunkMessageSchema,
  WorkletFlushedMessageSchema,
]);

export type WorkletChunkMessage = z.infer<typeof WorkletChunkMessageSchema>;

export type TransportInboundMessage =
  | {
      maxRecordingFrames: number;
      recordedAt: string;
      sampleRate: number;
      startedAtMs: number;
      type: 'initialize';
    }
  | { chunk: PcmChunk; type: 'chunk' }
  | { type: 'finish' }
  | { type: 'reset' };

export type TransportOutboundMessage =
  | { type: 'ready' }
  | {
      bufferedFrames: number;
      discontinuityCount: number;
      sequence: number;
      type: 'acknowledged';
    }
  | { recording: CapturedRecording; type: 'finalized' }
  | { message: string; type: 'failure' };

export type CaptureState =
  | 'idle'
  | 'requesting-permission'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'ready-to-replay'
  | 'replaying'
  | 'unsupported'
  | 'failed';

export type CaptureDeviceDiagnostics = {
  autoGainControl: boolean | null;
  channelCount: number | null;
  deviceLabel: string;
  echoCancellation: boolean | null;
  latencySeconds: number | null;
  noiseSuppression: boolean | null;
  requestedDeviceId: string | null;
  sampleRate: number | null;
};

export type CaptureSnapshot = {
  bufferedDurationMs: number;
  clippingSamples: number;
  device: CaptureDeviceDiagnostics | null;
  discontinuityCount: number;
  droppedChunks: number;
  elapsedMs: number;
  error: AppError | null;
  inputChannelMode: 'mono' | 'averaged' | null;
  peak: number;
  rms: number;
  silenceDurationMs: number;
  state: CaptureState;
  transportLatencyMs: number;
  maxTransportLatencyMs: number;
  warning: 'clipping' | 'silence' | 'device-ended' | null;
  waveform: readonly number[];
};

export const InitialCaptureSnapshot: CaptureSnapshot = {
  bufferedDurationMs: 0,
  clippingSamples: 0,
  device: null,
  discontinuityCount: 0,
  droppedChunks: 0,
  elapsedMs: 0,
  error: null,
  inputChannelMode: null,
  peak: 0,
  rms: 0,
  silenceDurationMs: 0,
  state: 'idle',
  transportLatencyMs: 0,
  maxTransportLatencyMs: 0,
  warning: null,
  waveform: [],
};

export type TransportDiagnosticDetails = z.infer<typeof DiagnosticsSchema>;
