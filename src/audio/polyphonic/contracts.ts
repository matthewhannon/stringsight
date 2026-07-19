import { z } from 'zod';

import {
  ChordEventSchema,
  NoteSetEventSchema,
  SessionTimestampMsSchema,
  WORKER_PROTOCOL_VERSION,
} from '../../shared';
import { PcmChunkSchema } from '../capture/contracts';

export const PolyphonicAnalysisStateSchema = z.enum([
  'silence',
  'warming',
  'tracking',
  'uncertain',
]);

export const PolyphonicModelStateSchema = z.enum(['not-loaded', 'loading', 'ready', 'failed']);
export const ChordAnalysisProfileSchema = z.enum(['accurate', 'responsive']);

export type ChordAnalysisProfile = z.infer<typeof ChordAnalysisProfileSchema>;
export type PolyphonicModelState = z.infer<typeof PolyphonicModelStateSchema>;

const InitializeSchema = z.object({
  chordAnalysisProfile: ChordAnalysisProfileSchema,
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('initialize'),
});

const ResetSchema = InitializeSchema.extend({ type: z.literal('reset') });

const ChunkSchema = z.object({
  chunk: PcmChunkSchema,
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  type: z.literal('chunk'),
});

const FinishSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  type: z.literal('finish'),
});

const SetProfileSchema = z.object({
  chordAnalysisProfile: ChordAnalysisProfileSchema,
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  type: z.literal('set-profile'),
});

export const PolyphonicWorkerInboundSchema = z.discriminatedUnion('type', [
  InitializeSchema,
  ResetSchema,
  ChunkSchema,
  FinishSchema,
  SetProfileSchema,
]);

export type PolyphonicWorkerInbound = z.infer<typeof PolyphonicWorkerInboundSchema>;

const ReadySchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('ready'),
});

export const PolyphonicWorkerUpdateSchema = z.object({
  analysisSampleRate: z.number().int().positive(),
  chordAnalysisProfile: ChordAnalysisProfileSchema,
  chordEvents: z.array(ChordEventSchema),
  chroma: z.array(z.number().min(0).max(1)).length(12),
  energy: z.number().nonnegative(),
  eventUpdateMode: z.enum(['replace', 'upsert']),
  inputSampleRate: z.number().int().positive(),
  modelBackend: z.enum(['wasm', 'cpu']).nullable(),
  modelInferenceMs: z.number().nonnegative().nullable(),
  modelLoadMs: z.number().nonnegative().nullable(),
  modelState: PolyphonicModelStateSchema,
  modelWindowCount: z.number().int().nonnegative(),
  noteSetEvents: z.array(NoteSetEventSchema),
  processingLatencyMs: z.number().nonnegative(),
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  sourceTimestampMs: SessionTimestampMsSchema,
  state: PolyphonicAnalysisStateSchema,
  type: z.literal('update'),
});

const FailureSchema = z.object({
  message: z.string().min(1).max(500),
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('failure'),
});

export const PolyphonicWorkerOutboundSchema = z.discriminatedUnion('type', [
  ReadySchema,
  PolyphonicWorkerUpdateSchema,
  FailureSchema,
]);

export type PolyphonicWorkerOutbound = z.infer<typeof PolyphonicWorkerOutboundSchema>;
