import {
  migratePracticeDocument,
  migratePracticeNativeEnvelope,
  PracticeNativeEnvelopeSchema,
  type PracticeNativeEnvelope,
  type PracticeNativeEnvelopeMigrationResult,
} from './contracts/practice-migration';
import type { PracticeDocument, QualifiedHash } from './contracts/practice';
import {
  hashDocumentRevision,
  hashExpectedEvents,
  hashPracticeDocumentContent,
  type PracticeQualifiedHash,
} from './practice-identity';
import { assertCanonicalJsonDataDomain } from './canonical-json';

export type PracticeNativeIntegrityErrorCode =
  | 'document-content-hash-mismatch'
  | 'expected-events-hash-mismatch'
  | 'revision-identity-hash-mismatch';

export class PracticeNativeIntegrityError extends Error {
  readonly code: PracticeNativeIntegrityErrorCode;

  constructor(code: PracticeNativeIntegrityErrorCode, message: string) {
    super(message);
    this.name = 'PracticeNativeIntegrityError';
    this.code = code;
  }
}

function constantTimeDigestEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function qualifiedHashesEqual(left: QualifiedHash, right: PracticeQualifiedHash): boolean {
  const qualifiersMatch =
    left.schemaId === right.schemaId &&
    left.schemaVersion === right.schemaVersion &&
    left.projectionId === right.projectionId &&
    left.projectionVersion === right.projectionVersion;
  return qualifiersMatch && constantTimeDigestEqual(left.digestHex, right.digestHex);
}

async function verifyDocumentIdentities(
  document: PracticeDocument,
  revisionIdentityHash: QualifiedHash,
): Promise<void> {
  const [contentHash, expectedHash, computedRevisionHash] = await Promise.all([
    hashPracticeDocumentContent(document),
    hashExpectedEvents(document),
    hashDocumentRevision(document.revision),
  ]);
  if (!qualifiedHashesEqual(document.revision.contentHash, contentHash)) {
    throw new PracticeNativeIntegrityError(
      'document-content-hash-mismatch',
      'Practice Document content does not match its qualified content hash.',
    );
  }
  if (!qualifiedHashesEqual(document.expectedProjectionHash, expectedHash)) {
    throw new PracticeNativeIntegrityError(
      'expected-events-hash-mismatch',
      'Practice Document expected events do not match their qualified projection hash.',
    );
  }
  if (!qualifiedHashesEqual(revisionIdentityHash, computedRevisionHash)) {
    throw new PracticeNativeIntegrityError(
      'revision-identity-hash-mismatch',
      'Practice Document revision identity does not match its qualified hash.',
    );
  }
}

/** Creates native interchange only from a document whose embedded identities recompute exactly. */
export async function createPracticeNativeEnvelope(
  documentInput: unknown,
  exportedAt: string,
): Promise<PracticeNativeEnvelope> {
  assertCanonicalJsonDataDomain(documentInput);
  const { document } = migratePracticeDocument(documentInput);
  const revisionIdentityHash = await hashDocumentRevision(document.revision);
  await verifyDocumentIdentities(document, revisionIdentityHash);
  return PracticeNativeEnvelopeSchema.parse({
    document,
    documentContentHash: document.revision.contentHash,
    exportedAt,
    interchangeVersion: 1,
    kind: 'stringsight-practice-document',
    revisionIdentityHash,
  });
}

/** Structurally migrates and then cryptographically verifies every native interchange identity. */
export async function verifyPracticeNativeEnvelope(
  input: unknown,
): Promise<PracticeNativeEnvelopeMigrationResult> {
  assertCanonicalJsonDataDomain(input);
  const migrated = migratePracticeNativeEnvelope(input);
  await verifyDocumentIdentities(
    migrated.envelope.document,
    migrated.envelope.revisionIdentityHash,
  );
  return migrated;
}
