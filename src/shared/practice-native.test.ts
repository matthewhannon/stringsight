import { describe, expect, it } from 'vitest';

import type { PracticeDocument, QualifiedHash } from './contracts/practice';
import { hashExpectedEvents, hashPracticeDocumentContent } from './practice-identity';
import {
  PracticeNativeIntegrityError,
  createPracticeNativeEnvelope,
  verifyPracticeNativeEnvelope,
} from './practice-native';

const placeholderHash = (
  schemaId: string,
  projectionId: string,
  digestHex = '0'.repeat(64),
): QualifiedHash => ({
  algorithm: 'sha256',
  canonicalizationId: 'stringsight-canonical-json',
  canonicalizationVersion: 1,
  digestHex,
  projectionId,
  projectionVersion: 1,
  schemaId,
  schemaVersion: 1,
});

const unhashedDocument = (): PracticeDocument =>
  ({
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
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Native identity fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: placeholderHash('practice-document', 'practice-document-content'),
      documentId: 'document-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [
      {
        id: 'track-1',
        name: 'Guitar',
        voices: [
          {
            events: [{ durationTicks: 960, id: 'rest-1', kind: 'rest', tick: 0 }],
            id: 'voice-1',
          },
        ],
      },
    ],
  }) as unknown as PracticeDocument;

async function validHashedDocument(): Promise<PracticeDocument> {
  const document = unhashedDocument();
  document.revision.contentHash = (await hashPracticeDocumentContent(
    document,
  )) as typeof document.revision.contentHash;
  document.expectedProjectionHash = (await hashExpectedEvents(
    document,
  )) as typeof document.expectedProjectionHash;
  return document;
}

describe('verified native Practice Document interchange', () => {
  it('creates and verifies a fully qualified envelope', async () => {
    const envelope = await createPracticeNativeEnvelope(
      await validHashedDocument(),
      '2026-07-20T13:00:00Z',
    );
    await expect(verifyPracticeNativeEnvelope(envelope)).resolves.toMatchObject({
      envelope: { document: { metadata: { title: 'Native identity fixture' } } },
      fromVersion: 1,
      toVersion: 1,
    });
  });

  it('rejects content tampering even when duplicated envelope hashes still agree', async () => {
    const envelope = await createPracticeNativeEnvelope(
      await validHashedDocument(),
      '2026-07-20T13:00:00Z',
    );
    const tampered = structuredClone(envelope);
    tampered.document.metadata.title = 'Tampered title';
    await expect(verifyPracticeNativeEnvelope(tampered)).rejects.toMatchObject({
      code: 'document-content-hash-mismatch',
    } satisfies Partial<PracticeNativeIntegrityError>);
  });

  it('rejects an incorrect embedded expected-event digest during creation', async () => {
    const document = await validHashedDocument();
    document.expectedProjectionHash = {
      ...document.expectedProjectionHash,
      digestHex: 'f'.repeat(64),
    };
    await expect(
      createPracticeNativeEnvelope(document, '2026-07-20T13:00:00Z'),
    ).rejects.toMatchObject({ code: 'expected-events-hash-mismatch' });
  });
});
