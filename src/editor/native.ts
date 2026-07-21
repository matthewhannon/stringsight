import { z } from 'zod';

import { assertCanonicalJsonDataDomain, canonicalJsonStringify } from '../shared/canonical-json';
import { IdentifierSchema } from '../shared/contracts/common';
import {
  PracticeDocumentSchema,
  type PracticeDocument,
  type QualifiedHash,
} from '../shared/contracts/practice';
import type { PracticeNativeEnvelope } from '../shared/contracts/practice-migration';
import { hashExpectedEvents, hashPracticeDocumentContent } from '../shared/practice-identity';
import {
  createPracticeNativeEnvelope,
  verifyPracticeNativeEnvelope,
} from '../shared/practice-native';

export const PRACTICE_EDITOR_NATIVE_LIMITS = Object.freeze({
  maximumEnvelopeBytes: 32 * 1024 * 1024,
} as const);

const placeholderHash = (schemaId: string, projectionId: string): QualifiedHash => ({
  algorithm: 'sha256',
  canonicalizationId: 'stringsight-canonical-json',
  canonicalizationVersion: 1,
  digestHex: '0'.repeat(64),
  projectionId,
  projectionVersion: 1,
  schemaId,
  schemaVersion: 1,
});

const CreateBlankPracticeDocumentRequestSchema = z
  .object({
    artist: z.string().trim().max(120).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    documentId: IdentifierSchema,
    revisionId: IdentifierSchema,
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export type CreateBlankPracticeDocumentRequest = z.input<
  typeof CreateBlankPracticeDocumentRequestSchema
>;

const CreateNextPracticeRevisionRequestSchema = z
  .object({
    revisionId: IdentifierSchema,
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type CreateNextPracticeRevisionRequest = z.input<
  typeof CreateNextPracticeRevisionRequestSchema
>;

async function recomputeDocumentIdentities(input: unknown): Promise<PracticeDocument> {
  const candidate = PracticeDocumentSchema.parse(input);
  candidate.expectedProjectionHash = (await hashExpectedEvents(
    candidate,
  )) as typeof candidate.expectedProjectionHash;
  candidate.revision.contentHash = (await hashPracticeDocumentContent(
    candidate,
  )) as typeof candidate.revision.contentHash;
  return PracticeDocumentSchema.parse(candidate);
}

export async function createBlankPracticeDocument(
  requestInput: unknown,
): Promise<PracticeDocument> {
  assertCanonicalJsonDataDomain(requestInput);
  const request = CreateBlankPracticeDocumentRequestSchema.parse(requestInput);
  return recomputeDocumentIdentities({
    contractVersion: 1,
    durationTicks: 960,
    expectedProjectionHash: placeholderHash('practice-document', 'practice-expected-events'),
    guitar: {
      capoFret: 0,
      handedness: 'right',
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: '12-tet',
      tuning: [
        { openMidi: 64, stringNumber: 1 },
        { openMidi: 59, stringNumber: 2 },
        { openMidi: 55, stringNumber: 3 },
        { openMidi: 50, stringNumber: 4 },
        { openMidi: 45, stringNumber: 5 },
        { openMidi: 40, stringNumber: 6 },
      ],
    },
    importProvenance: null,
    keyMap: [{ fifths: 0, mode: 'major', tick: 0 }],
    loopPresets: [],
    metadata: {
      ...(request.artist === undefined ? {} : { artist: request.artist }),
      createdAt: request.createdAt,
      title: request.title,
      updatedAt: request.createdAt,
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: placeholderHash('practice-document', 'practice-document-content'),
      documentId: request.documentId,
      revisionId: request.revisionId,
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [{ id: 'track-1', name: 'Guitar', voices: [{ events: [], id: 'voice-1' }] }],
  });
}

/** Finalizes caller-authored content as the exact next revision of a trusted native document. */
export async function createNextPracticeDocumentRevision(
  previousInput: unknown,
  draftInput: unknown,
  requestInput: unknown,
): Promise<PracticeDocument> {
  assertCanonicalJsonDataDomain(previousInput);
  assertCanonicalJsonDataDomain(draftInput);
  assertCanonicalJsonDataDomain(requestInput);
  const request = CreateNextPracticeRevisionRequestSchema.parse(requestInput);
  const previous = (await createPracticeNativeEnvelope(previousInput, request.updatedAt)).document;
  const draft = PracticeDocumentSchema.parse(draftInput);

  if (request.revisionId === previous.revision.revisionId) {
    throw new RangeError('A new Practice Document revision must use a new revision ID.');
  }
  if (draft.revision.documentId !== previous.revision.documentId) {
    throw new RangeError('A Practice Document revision cannot change document identity.');
  }
  if (draft.metadata.createdAt !== previous.metadata.createdAt) {
    throw new RangeError('A Practice Document revision cannot change its creation timestamp.');
  }
  if (Date.parse(request.updatedAt) < Date.parse(previous.metadata.updatedAt)) {
    throw new RangeError('A Practice Document revision timestamp cannot move backwards.');
  }

  draft.metadata.updatedAt = request.updatedAt;
  draft.revision = {
    contentHash: placeholderHash(
      'practice-document',
      'practice-document-content',
    ) as typeof draft.revision.contentHash,
    documentId: previous.revision.documentId,
    revisionId: request.revisionId,
    revisionNumber: previous.revision.revisionNumber + 1,
  };
  draft.expectedProjectionHash = placeholderHash(
    'practice-document',
    'practice-expected-events',
  ) as typeof draft.expectedProjectionHash;
  return recomputeDocumentIdentities(draft);
}

export type PracticeNativeByteStorage = Readonly<{
  kind: 'bytes';
  read(key: string): Promise<Uint8Array>;
  write(key: string, value: Uint8Array): Promise<void>;
}>;

export type PracticeNativeTextStorage = Readonly<{
  kind: 'text';
  read(key: string): Promise<string>;
  write(key: string, value: string): Promise<void>;
}>;

export type PracticeNativeStorage = PracticeNativeByteStorage | PracticeNativeTextStorage;

export type PracticeNativeSaveFailureCode =
  'envelope-too-large' | 'invalid-document' | 'storage-write-failed';

export type PracticeNativeSaveResult =
  | Readonly<{
      byteLength: number;
      envelope: PracticeNativeEnvelope;
      key: string;
      kind: 'saved';
      revisionNumber: number;
    }>
  | Readonly<{
      code: PracticeNativeSaveFailureCode;
      kind: 'failed';
      message: string;
      operation: 'save';
    }>;

export type PracticeNativeOpenFailureCode =
  | 'envelope-too-large'
  | 'invalid-storage-payload'
  | 'storage-read-failed'
  | 'text-decode-failed'
  | 'verification-failed';

export type PracticeNativeOpenResult =
  | Readonly<{
      document: PracticeDocument;
      envelope: PracticeNativeEnvelope;
      key: string;
      kind: 'opened';
      revisionNumber: number;
    }>
  | Readonly<{
      code: PracticeNativeOpenFailureCode;
      kind: 'failed';
      message: string;
      operation: 'open';
    }>;

const failureMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown native document failure.';

const isUint8Array = (value: unknown): value is Uint8Array =>
  ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]';

const saveFailure = (
  code: PracticeNativeSaveFailureCode,
  error: unknown,
): PracticeNativeSaveResult =>
  Object.freeze({ code, kind: 'failed', message: failureMessage(error), operation: 'save' });

const openFailure = (
  code: PracticeNativeOpenFailureCode,
  error: unknown,
): PracticeNativeOpenResult =>
  Object.freeze({ code, kind: 'failed', message: failureMessage(error), operation: 'open' });

export async function savePracticeDocument(
  storage: PracticeNativeStorage,
  key: string,
  documentInput: unknown,
  exportedAt: string,
): Promise<PracticeNativeSaveResult> {
  let envelope: PracticeNativeEnvelope;
  let text: string;
  let bytes: Uint8Array;
  try {
    envelope = await createPracticeNativeEnvelope(documentInput, exportedAt);
    text = canonicalJsonStringify(envelope);
    bytes = new TextEncoder().encode(text);
  } catch (error) {
    return saveFailure('invalid-document', error);
  }
  if (bytes.byteLength > PRACTICE_EDITOR_NATIVE_LIMITS.maximumEnvelopeBytes) {
    return saveFailure('envelope-too-large', new RangeError('Native envelope exceeds byte limit.'));
  }
  try {
    if (storage.kind === 'bytes') await storage.write(key, bytes);
    else await storage.write(key, text);
  } catch (error) {
    return saveFailure('storage-write-failed', error);
  }
  return Object.freeze({
    byteLength: bytes.byteLength,
    envelope,
    key,
    kind: 'saved',
    revisionNumber: envelope.document.revision.revisionNumber,
  });
}

export async function openPracticeDocument(
  storage: PracticeNativeStorage,
  key: string,
): Promise<PracticeNativeOpenResult> {
  let text: string;
  try {
    if (storage.kind === 'bytes') {
      const bytes = await storage.read(key);
      if (!isUint8Array(bytes)) {
        return openFailure('invalid-storage-payload', new TypeError('Storage returned non-bytes.'));
      }
      if (bytes.byteLength > PRACTICE_EDITOR_NATIVE_LIMITS.maximumEnvelopeBytes) {
        return openFailure(
          'envelope-too-large',
          new RangeError('Native envelope exceeds byte limit.'),
        );
      }
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (error) {
        return openFailure('text-decode-failed', error);
      }
    } else {
      text = await storage.read(key);
      if (typeof text !== 'string') {
        return openFailure('invalid-storage-payload', new TypeError('Storage returned non-text.'));
      }
      const byteLength = new TextEncoder().encode(text).byteLength;
      if (byteLength > PRACTICE_EDITOR_NATIVE_LIMITS.maximumEnvelopeBytes) {
        return openFailure(
          'envelope-too-large',
          new RangeError('Native envelope exceeds byte limit.'),
        );
      }
    }
  } catch (error) {
    return openFailure('storage-read-failed', error);
  }

  let input: unknown;
  try {
    input = JSON.parse(text);
    const { envelope } = await verifyPracticeNativeEnvelope(input);
    return Object.freeze({
      document: envelope.document,
      envelope,
      key,
      kind: 'opened',
      revisionNumber: envelope.document.revision.revisionNumber,
    });
  } catch (error) {
    return openFailure('verification-failed', error);
  }
}
