import { z } from 'zod';

import { AppErrorSchema } from './error';
import {
  DiagnosticsSchema,
  IdentifierSchema,
  SessionTimestampMsSchema,
  SubsystemSchema,
  WORKER_PROTOCOL_VERSION,
} from './common';

const WorkerMessageBaseSchema = z.object({
  issuedAtMs: SessionTimestampMsSchema,
  protocolVersion: z.literal(WORKER_PROTOCOL_VERSION),
  requestId: IdentifierSchema,
  subsystem: SubsystemSchema,
});

export const WorkerRequestSchema = WorkerMessageBaseSchema.extend({
  operation: z.string().min(1).max(100),
  payload: z.unknown(),
  type: z.literal('request'),
});

export const WorkerCancelSchema = WorkerMessageBaseSchema.extend({
  reason: z.string().max(240).optional(),
  targetRequestId: IdentifierSchema,
  type: z.literal('cancel'),
});

export const WorkerInboundMessageSchema = z.discriminatedUnion('type', [
  WorkerRequestSchema,
  WorkerCancelSchema,
]);

export const WorkerReadySchema = WorkerMessageBaseSchema.extend({
  capabilities: z.array(z.string().min(1).max(100)),
  type: z.literal('ready'),
});

export const WorkerProgressSchema = WorkerMessageBaseSchema.extend({
  diagnostics: DiagnosticsSchema.default({}),
  progress: z.number().min(0).max(1),
  type: z.literal('progress'),
});

export const WorkerResultSchema = WorkerMessageBaseSchema.extend({
  diagnostics: DiagnosticsSchema.default({}),
  result: z.unknown(),
  type: z.literal('result'),
});

export const WorkerFailureSchema = WorkerMessageBaseSchema.extend({
  error: AppErrorSchema,
  type: z.literal('failure'),
});

export const WorkerCancelledSchema = WorkerMessageBaseSchema.extend({
  targetRequestId: IdentifierSchema,
  type: z.literal('cancelled'),
});

export const WorkerOutboundMessageSchema = z.discriminatedUnion('type', [
  WorkerReadySchema,
  WorkerProgressSchema,
  WorkerResultSchema,
  WorkerFailureSchema,
  WorkerCancelledSchema,
]);

type WorkerRequestBase = z.infer<typeof WorkerRequestSchema>;
type WorkerResultBase = z.infer<typeof WorkerResultSchema>;

export type WorkerRequest<TPayload = unknown> = Omit<WorkerRequestBase, 'payload'> & {
  payload: TPayload;
};

export type WorkerCancel = z.infer<typeof WorkerCancelSchema>;

export type WorkerInboundMessage<TPayload = unknown> = WorkerRequest<TPayload> | WorkerCancel;

export type WorkerResult<TResult = unknown> = Omit<WorkerResultBase, 'result'> & {
  result: TResult;
};

export type WorkerOutboundMessage<TResult = unknown> =
  | z.infer<typeof WorkerReadySchema>
  | z.infer<typeof WorkerProgressSchema>
  | WorkerResult<TResult>
  | z.infer<typeof WorkerFailureSchema>
  | z.infer<typeof WorkerCancelledSchema>;

export type TransferableWorkerMessage<TMessage> = {
  message: TMessage;
  transfer: Transferable[];
};
