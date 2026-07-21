import { z } from 'zod';

import {
  PracticeDocumentSchema,
  PracticeDocumentContentHashSchema,
  PracticeDocumentRevisionHashSchema,
  type PracticeDocument,
  type QualifiedHash,
} from './practice';

export const CURRENT_PRACTICE_DOCUMENT_VERSION = 1 as const;
export const CURRENT_PRACTICE_INTERCHANGE_VERSION = 1 as const;
export const SUPPORTED_PRACTICE_DOCUMENT_VERSIONS = Object.freeze([1] as const);
export const SUPPORTED_PRACTICE_INTERCHANGE_VERSIONS = Object.freeze([1] as const);

export type PracticeMigrationErrorCode =
  | 'malformed-current-version'
  | 'missing-version'
  | 'unsupported-future-version'
  | 'unsupported-version';

export class PracticeMigrationError extends Error {
  readonly code: PracticeMigrationErrorCode;
  readonly issues: readonly z.core.$ZodIssue[];
  readonly receivedVersion: number | undefined;

  constructor(
    code: PracticeMigrationErrorCode,
    message: string,
    receivedVersion?: number,
    issues: readonly z.core.$ZodIssue[] = [],
  ) {
    super(message);
    this.name = 'PracticeMigrationError';
    this.code = code;
    this.receivedVersion = receivedVersion;
    this.issues = issues;
  }
}

export type PracticeMigrationTraceEntry = {
  readonly fromVersion: number;
  readonly operation: 'validate-current';
  readonly registryIndex: number;
  readonly toVersion: typeof CURRENT_PRACTICE_DOCUMENT_VERSION;
};

export type PracticeDocumentMigrationResult = {
  readonly document: PracticeDocument;
  readonly fromVersion: number;
  readonly toVersion: typeof CURRENT_PRACTICE_DOCUMENT_VERSION;
  readonly trace: readonly PracticeMigrationTraceEntry[];
};

type PracticeDocumentMigrator = (input: unknown) => PracticeDocument;

type PracticeDocumentMigrationRegistryEntry = {
  readonly migrate: PracticeDocumentMigrator;
  readonly toVersion: typeof CURRENT_PRACTICE_DOCUMENT_VERSION;
};

function parseAndDetachCurrentDocument(input: unknown): PracticeDocument {
  const result = PracticeDocumentSchema.safeParse(input);
  if (!result.success) {
    throw new PracticeMigrationError(
      'malformed-current-version',
      'PracticeDocument version 1 failed runtime validation.',
      CURRENT_PRACTICE_DOCUMENT_VERSION,
      result.error.issues,
    );
  }
  return structuredClone(result.data);
}

export const PRACTICE_DOCUMENT_MIGRATION_REGISTRY: Readonly<
  Record<
    (typeof SUPPORTED_PRACTICE_DOCUMENT_VERSIONS)[number],
    PracticeDocumentMigrationRegistryEntry
  >
> = Object.freeze({
  1: Object.freeze({
    migrate: parseAndDetachCurrentDocument,
    toVersion: CURRENT_PRACTICE_DOCUMENT_VERSION,
  }),
});

function readOwnVersion(input: unknown, key: 'contractVersion' | 'interchangeVersion'): number {
  if (typeof input !== 'object' || input === null || !Object.hasOwn(input, key)) {
    throw new PracticeMigrationError('missing-version', `Practice payload must declare ${key}.`);
  }

  let version: unknown;
  try {
    version = Reflect.get(input, key);
  } catch {
    throw new PracticeMigrationError(
      'missing-version',
      `Practice payload has an unreadable ${key}.`,
    );
  }
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new PracticeMigrationError('missing-version', `${key} must be an integer.`);
  }
  return version;
}

function unsupportedVersion(version: number, currentVersion: number, boundary: string): never {
  if (version > currentVersion) {
    throw new PracticeMigrationError(
      'unsupported-future-version',
      `${boundary} version ${String(version)} is newer than supported version ${String(currentVersion)}.`,
      version,
    );
  }
  throw new PracticeMigrationError(
    'unsupported-version',
    `${boundary} version ${String(version)} is not supported; no implicit legacy migration exists.`,
    version,
  );
}

export function migratePracticeDocument(input: unknown): PracticeDocumentMigrationResult {
  const fromVersion = readOwnVersion(input, 'contractVersion');
  if (fromVersion !== CURRENT_PRACTICE_DOCUMENT_VERSION) {
    return unsupportedVersion(fromVersion, CURRENT_PRACTICE_DOCUMENT_VERSION, 'PracticeDocument');
  }

  const registryEntry = PRACTICE_DOCUMENT_MIGRATION_REGISTRY[fromVersion];
  return {
    document: registryEntry.migrate(input),
    fromVersion,
    toVersion: registryEntry.toVersion,
    trace: Object.freeze([
      Object.freeze({
        fromVersion,
        operation: 'validate-current' as const,
        registryIndex: 0,
        toVersion: CURRENT_PRACTICE_DOCUMENT_VERSION,
      }),
    ]),
  };
}

function hashesMatch(left: QualifiedHash, right: QualifiedHash): boolean {
  return (
    left.digestHex === right.digestHex &&
    left.schemaId === right.schemaId &&
    left.schemaVersion === right.schemaVersion &&
    left.projectionId === right.projectionId &&
    left.projectionVersion === right.projectionVersion
  );
}

export const PracticeNativeEnvelopeSchema = z
  .object({
    document: PracticeDocumentSchema,
    documentContentHash: PracticeDocumentContentHashSchema,
    exportedAt: z.iso.datetime({ offset: true }),
    interchangeVersion: z.literal(CURRENT_PRACTICE_INTERCHANGE_VERSION),
    kind: z.literal('stringsight-practice-document'),
    revisionIdentityHash: PracticeDocumentRevisionHashSchema,
  })
  .strict()
  .superRefine(({ document, documentContentHash }, context) => {
    if (!hashesMatch(documentContentHash, document.revision.contentHash)) {
      context.addIssue({
        code: 'custom',
        message: 'Envelope documentContentHash must match the embedded revision content hash.',
        path: ['documentContentHash'],
      });
    }
  });

export type PracticeNativeEnvelope = z.infer<typeof PracticeNativeEnvelopeSchema>;

export type PracticeNativeEnvelopeMigrationResult = {
  readonly envelope: PracticeNativeEnvelope;
  readonly fromVersion: number;
  readonly toVersion: typeof CURRENT_PRACTICE_INTERCHANGE_VERSION;
  readonly trace: readonly PracticeMigrationTraceEntry[];
};

export function migratePracticeNativeEnvelope(
  input: unknown,
): PracticeNativeEnvelopeMigrationResult {
  const fromVersion = readOwnVersion(input, 'interchangeVersion');
  if (fromVersion !== CURRENT_PRACTICE_INTERCHANGE_VERSION) {
    return unsupportedVersion(
      fromVersion,
      CURRENT_PRACTICE_INTERCHANGE_VERSION,
      'Practice interchange',
    );
  }

  const result = PracticeNativeEnvelopeSchema.safeParse(input);
  if (!result.success) {
    throw new PracticeMigrationError(
      'malformed-current-version',
      'Practice interchange version 1 failed runtime validation.',
      fromVersion,
      result.error.issues,
    );
  }

  return {
    envelope: structuredClone(result.data),
    fromVersion,
    toVersion: CURRENT_PRACTICE_INTERCHANGE_VERSION,
    trace: Object.freeze([
      Object.freeze({
        fromVersion,
        operation: 'validate-current' as const,
        registryIndex: 0,
        toVersion: CURRENT_PRACTICE_DOCUMENT_VERSION,
      }),
    ]),
  };
}

export function allSupportedPracticeVersionsReachCurrent(): boolean {
  return SUPPORTED_PRACTICE_DOCUMENT_VERSIONS.every((version) =>
    Object.hasOwn(PRACTICE_DOCUMENT_MIGRATION_REGISTRY, version),
  );
}
