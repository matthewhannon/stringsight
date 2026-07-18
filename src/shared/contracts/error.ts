import { z } from 'zod';

import {
  CONTRACT_SCHEMA_VERSION,
  DiagnosticsSchema,
  IdentifierSchema,
  SessionTimestampMsSchema,
  SubsystemSchema,
  type Diagnostics,
  type SessionTimestampMs,
  type Subsystem,
} from './common';

export const ErrorCategorySchema = z.enum([
  'permission',
  'device',
  'unsupported',
  'validation',
  'model-load',
  'processing',
  'timeout',
  'cancelled',
  'storage',
  'network',
  'rate-limit',
  'internal',
]);

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorSeveritySchema = z.enum(['info', 'warning', 'error', 'fatal']);

export const UserActionSchema = z.enum([
  'none',
  'retry',
  'grant-permission',
  'select-device',
  'reposition-camera',
  'reduce-quality',
  'free-storage',
  'check-network',
  'contact-support',
]);

export const AppErrorSchema = z.object({
  category: ErrorCategorySchema,
  code: z.string().min(1).max(100),
  details: DiagnosticsSchema.default({}),
  id: IdentifierSchema,
  message: z.string().min(1).max(500),
  occurredAtMs: SessionTimestampMsSchema,
  retryable: z.boolean(),
  schemaVersion: z.literal(CONTRACT_SCHEMA_VERSION),
  severity: ErrorSeveritySchema,
  subsystem: SubsystemSchema,
  userAction: UserActionSchema,
});

export type AppError = z.infer<typeof AppErrorSchema>;

export type CreateAppErrorInput = {
  category: ErrorCategory;
  code: string;
  details?: Diagnostics;
  id: string;
  message: string;
  occurredAtMs: SessionTimestampMs;
  retryable: boolean;
  severity: z.infer<typeof ErrorSeveritySchema>;
  subsystem: Subsystem;
  userAction: z.infer<typeof UserActionSchema>;
};

export function createAppError(input: CreateAppErrorInput): AppError {
  return AppErrorSchema.parse({
    ...input,
    details: input.details ?? {},
    schemaVersion: CONTRACT_SCHEMA_VERSION,
  });
}
