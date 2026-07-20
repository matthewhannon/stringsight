import { z } from 'zod';

import {
  CONTRACT_SCHEMA_VERSION,
  DiagnosticsSchema,
  SessionTimestampMsSchema,
  type AppError,
} from '../../shared';

export const PCM_CHUNK_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;
export const DEFAULT_CHUNK_FRAMES = 2_048;
export const DEFAULT_MAX_RECORDING_SECONDS = 5 * 60;
export const MONITOR_WAVEFORM_SAMPLES = 64;
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
  contextStartSampleFrame: z.number().int().nonnegative().optional(),
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

export const WorkletMonitorSummaryMessageSchema = z.object({
  clippingSamples: z.number().int().nonnegative(),
  frameCount: z.number().int().positive(),
  inputChannelMode: z.enum(['mono', 'averaged']).default('mono'),
  inputChannelCount: z.number().int().positive().default(1),
  peak: z.number().min(0).max(1),
  rms: z.number().min(0).max(1),
  sampleRate: z.number().int().positive(),
  type: z.literal('monitor-summary'),
  waveform: z
    .instanceof(Float32Array)
    .refine((samples) => samples.length === MONITOR_WAVEFORM_SAMPLES),
});

export const WorkletOutboundMessageSchema = z.discriminatedUnion('type', [
  WorkletChunkMessageSchema,
  WorkletMonitorSummaryMessageSchema,
  z.object({ type: z.literal('recording-started') }),
  z.object({ type: z.literal('recording-paused') }),
  z.object({ type: z.literal('recording-resumed') }),
  z.object({ type: z.literal('recording-stopped') }),
  z.object({ type: z.literal('recording-limit-reached') }),
]);

export type WorkletChunkMessage = z.infer<typeof WorkletChunkMessageSchema>;
export type WorkletMonitorSummaryMessage = z.infer<typeof WorkletMonitorSummaryMessageSchema>;

export type WorkletInboundMessage =
  | { maxRecordingFrames: number; type: 'start-recording' }
  | { type: 'pause-recording' }
  | { type: 'resume-recording' }
  | { type: 'stop-recording' };

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
  | { bufferedFrames: number; type: 'limit-reached' }
  | { message: string; type: 'failure' };

export type MicrophoneConnectionState =
  'unsupported' | 'disconnected' | 'connecting' | 'monitoring' | 'failed';

export type CaptureOperationState =
  'idle' | 'recording' | 'paused' | 'finalizing' | 'replaying' | 'failed';

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
  connectionState: MicrophoneConnectionState;
  device: CaptureDeviceDiagnostics | null;
  discontinuityCount: number;
  droppedChunks: number;
  elapsedMs: number;
  error: AppError | null;
  inputChannelMode: 'mono' | 'averaged' | null;
  peak: number;
  rms: number;
  silenceDurationMs: number;
  transportLatencyMs: number;
  maxTransportLatencyMs: number;
  operationState: CaptureOperationState;
  warning: 'clipping' | 'silence' | 'device-ended' | 'maximum-duration-reached' | null;
  waveform: readonly number[];
};

export const InitialCaptureSnapshot: CaptureSnapshot = {
  bufferedDurationMs: 0,
  clippingSamples: 0,
  connectionState: 'disconnected',
  device: null,
  discontinuityCount: 0,
  droppedChunks: 0,
  elapsedMs: 0,
  error: null,
  inputChannelMode: null,
  peak: 0,
  rms: 0,
  silenceDurationMs: 0,
  transportLatencyMs: 0,
  maxTransportLatencyMs: 0,
  operationState: 'idle',
  warning: null,
  waveform: [],
};

export type TransportDiagnosticDetails = z.infer<typeof DiagnosticsSchema>;
