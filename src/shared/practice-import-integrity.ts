import {
  PracticeImportReviewBundleSchema,
  parseImmutablePracticeImportReviewBundle,
} from './contracts/practice-import';
import type { QualifiedHash } from './contracts/practice';
import { assertCanonicalJsonDataDomain } from './canonical-json';
import {
  hashExpectedEvents,
  hashPracticeDocumentContent,
  hashPracticeImportSourceIdentity,
  type PracticeQualifiedHash,
} from './practice-identity';

export type PracticeImportIntegrityErrorCode =
  | 'candidate-content-hash-mismatch'
  | 'candidate-expected-events-hash-mismatch'
  | 'source-identity-hash-mismatch';

export class PracticeImportIntegrityError extends Error {
  readonly code: PracticeImportIntegrityErrorCode;

  constructor(code: PracticeImportIntegrityErrorCode, message: string) {
    super(message);
    this.name = 'PracticeImportIntegrityError';
    this.code = code;
  }
}

const hashesEqual = (left: QualifiedHash, right: PracticeQualifiedHash): boolean =>
  left.digestHex === right.digestHex &&
  left.projectionId === right.projectionId &&
  left.projectionVersion === right.projectionVersion &&
  left.schemaId === right.schemaId &&
  left.schemaVersion === right.schemaVersion;

/** Structurally validates a review bundle, then recomputes every identity under importer control. */
export async function verifyPracticeImportReviewBundle(
  input: unknown,
): Promise<ReturnType<typeof parseImmutablePracticeImportReviewBundle>> {
  assertCanonicalJsonDataDomain(input);
  const bundle = PracticeImportReviewBundleSchema.parse(input);
  const [sourceIdentityHash, contentHash, expectedEventsHash] = await Promise.all([
    hashPracticeImportSourceIdentity(bundle.draft.source),
    hashPracticeDocumentContent(bundle.draft.candidateDocument),
    hashExpectedEvents(bundle.draft.candidateDocument),
  ]);
  if (
    !hashesEqual(bundle.draft.sourceIdentityHash, sourceIdentityHash) ||
    !hashesEqual(bundle.report.sourceIdentityHash, sourceIdentityHash)
  ) {
    throw new PracticeImportIntegrityError(
      'source-identity-hash-mismatch',
      'Import source metadata and raw-byte digest do not match the qualified source identity.',
    );
  }
  if (
    !hashesEqual(bundle.draft.candidateDocumentContentHash, contentHash) ||
    !hashesEqual(bundle.draft.candidateDocument.revision.contentHash, contentHash)
  ) {
    throw new PracticeImportIntegrityError(
      'candidate-content-hash-mismatch',
      'Import candidate content does not match its qualified document identity.',
    );
  }
  if (!hashesEqual(bundle.draft.candidateDocument.expectedProjectionHash, expectedEventsHash)) {
    throw new PracticeImportIntegrityError(
      'candidate-expected-events-hash-mismatch',
      'Import candidate expected events do not match their qualified projection identity.',
    );
  }
  return parseImmutablePracticeImportReviewBundle(bundle);
}
