import { z } from 'zod';

import {
  CONTRACT_SCHEMA_VERSION,
  ConfidenceSchema,
  NoteEventSchema,
  ProvenanceSchema,
  SessionTimestampMsSchema,
  WORKER_PROTOCOL_VERSION,
} from '../../shared';
import { PcmChunkSchema } from '../capture/contracts';

export const MONOPHONIC_ANALYZER_VERSION = '0.2.1';

export const AnalysisStateSchema = z.enum([
  'silence',
  'transient',
  'tracking',
  'uncertain',
  'bend-or-vibrato',
]);

export type AnalysisState = z.infer<typeof AnalysisStateSchema>;

export const OnsetObservationSchema = z.object({
  atMs: SessionTimestampMsSchema,
  confidence: ConfidenceSchema,
  id: z.string().min(1).max(160),
  provenance: ProvenanceSchema,
  rms: z.number().min(0).max(1),
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  strengthDb: z.number().nonnegative(),
});

export type OnsetObservation = z.infer<typeof OnsetObservationSchema>;

export const AnalysisWorkerInitializeSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('initialize'),
});

export const AnalysisWorkerChunkSchema = z.object({
  chunk: PcmChunkSchema,
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  type: z.literal('chunk'),
});

export const AnalysisWorkerFinishSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  type: z.literal('finish'),
});

export const AnalysisWorkerResetSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('reset'),
});

export const AnalysisWorkerInboundSchema = z.discriminatedUnion('type', [
  AnalysisWorkerInitializeSchema,
  AnalysisWorkerChunkSchema,
  AnalysisWorkerFinishSchema,
  AnalysisWorkerResetSchema,
]);

export type AnalysisWorkerInbound = z.infer<typeof AnalysisWorkerInboundSchema>;

export const AnalysisWorkerReadySchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('ready'),
});

export const AnalysisWorkerUpdateSchema = z.object({
  analysisSampleRate: z.number().int().positive(),
  events: z.array(NoteEventSchema),
  inputSampleRate: z.number().int().positive(),
  onsets: z.array(OnsetObservationSchema),
  processingLatencyMs: z.number().nonnegative(),
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  sourceTimestampMs: SessionTimestampMsSchema,
  state: AnalysisStateSchema,
  type: z.literal('update'),
});

export const AnalysisWorkerFailureSchema = z.object({
  message: z.string().min(1).max(500),
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('failure'),
});

export const AnalysisWorkerCompleteSchema = z.object({
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  runId: z.string().min(1).max(160),
  type: z.literal('complete'),
});

export const AnalysisWorkerOutboundSchema = z.discriminatedUnion('type', [
  AnalysisWorkerReadySchema,
  AnalysisWorkerUpdateSchema,
  AnalysisWorkerFailureSchema,
  AnalysisWorkerCompleteSchema,
]);

export type AnalysisWorkerOutbound = z.infer<typeof AnalysisWorkerOutboundSchema>;
