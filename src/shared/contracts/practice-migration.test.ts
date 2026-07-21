import { describe, expect, it } from 'vitest';

import {
  CURRENT_PRACTICE_DOCUMENT_VERSION,
  PRACTICE_DOCUMENT_MIGRATION_REGISTRY,
  PracticeMigrationError,
  PracticeNativeEnvelopeSchema,
  SUPPORTED_PRACTICE_DOCUMENT_VERSIONS,
  allSupportedPracticeVersionsReachCurrent,
  migratePracticeDocument,
  migratePracticeNativeEnvelope,
} from './practice-migration';

function hash(projectionId: string, digestCharacter = 'a') {
  const schemaId =
    projectionId === 'practice-document-content' || projectionId === 'practice-expected-events'
      ? 'practice-document'
      : projectionId === 'practice-document-revision'
        ? 'practice-document-revision'
        : 'practice-fixture';
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1,
    digestHex: digestCharacter.repeat(64),
    schemaId,
    schemaVersion: 1,
    projectionId,
    projectionVersion: 1,
  };
}

function currentDocument() {
  return {
    contractVersion: 1,
    durationTicks: 960,
    expectedProjectionHash: hash('practice-expected-events', 'b'),
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
      title: 'Migration fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: hash('practice-document-content'),
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
  };
}

function nativeEnvelope() {
  const document = currentDocument();
  return {
    document,
    documentContentHash: document.revision.contentHash,
    exportedAt: '2026-07-20T13:00:00Z',
    interchangeVersion: 1,
    kind: 'stringsight-practice-document',
    revisionIdentityHash: hash('practice-document-revision', 'c'),
  };
}

function expectMigrationError(action: () => unknown, code: PracticeMigrationError['code']): void {
  try {
    action();
    throw new Error('Expected migration to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(PracticeMigrationError);
    if (error instanceof PracticeMigrationError) expect(error.code).toBe(code);
  }
}

describe('Practice contract migration boundary', () => {
  it('explicitly registers every supported version and routes it to current', () => {
    expect(SUPPORTED_PRACTICE_DOCUMENT_VERSIONS).toEqual([1]);
    expect(Object.keys(PRACTICE_DOCUMENT_MIGRATION_REGISTRY)).toEqual(['1']);
    expect(allSupportedPracticeVersionsReachCurrent()).toBe(true);
    expect(CURRENT_PRACTICE_DOCUMENT_VERSION).toBe(1);
  });

  it('validates current v1 and reports a deterministic ordered identity trace', () => {
    const result = migratePracticeDocument(currentDocument());

    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(1);
    expect(result.trace).toEqual([
      { fromVersion: 1, operation: 'validate-current', registryIndex: 0, toVersion: 1 },
    ]);
  });

  it('deep-detaches migrated documents from caller-owned input', () => {
    const input = currentDocument();
    const result = migratePracticeDocument(input);

    expect(result.document).not.toBe(input);
    expect(result.document.metadata).not.toBe(input.metadata);
    expect(result.document.tracks).not.toBe(input.tracks);
    input.metadata.title = 'Mutated after migration';
    input.tracks[0]?.voices[0]?.events.push({
      durationTicks: 1,
      id: 'rest-2',
      kind: 'rest',
      tick: 0,
    });

    expect(result.document.metadata.title).toBe('Migration fixture');
    expect(result.document.tracks[0]?.voices[0]?.events).toHaveLength(1);
  });

  it('rejects a missing, non-integer, legacy, and future document version distinctly', () => {
    const input = currentDocument();
    const missing: Record<string, unknown> = structuredClone(input);
    delete missing.contractVersion;

    expectMigrationError(() => migratePracticeDocument(missing), 'missing-version');
    expectMigrationError(
      () => migratePracticeDocument({ ...input, contractVersion: 1.5 }),
      'missing-version',
    );
    expectMigrationError(
      () => migratePracticeDocument({ ...input, contractVersion: 0 }),
      'unsupported-version',
    );
    expectMigrationError(
      () => migratePracticeDocument({ ...input, contractVersion: 2 }),
      'unsupported-future-version',
    );
  });

  it('does not treat malformed v1 content as a migration opportunity', () => {
    const input = currentDocument();
    input.tempoMap = [];

    expectMigrationError(() => migratePracticeDocument(input), 'malformed-current-version');
  });

  it('validates and deep-detaches the versioned native envelope', () => {
    const input = nativeEnvelope();
    expect(PracticeNativeEnvelopeSchema.safeParse(input).success).toBe(true);

    const result = migratePracticeNativeEnvelope(input);
    expect(result.trace).toEqual([
      { fromVersion: 1, operation: 'validate-current', registryIndex: 0, toVersion: 1 },
    ]);
    expect(result.envelope).not.toBe(input);
    expect(result.envelope.document).not.toBe(input.document);
  });

  it('rejects an envelope whose qualified content hash does not match its document', () => {
    const input = nativeEnvelope();
    input.documentContentHash = hash('practice-document-content', 'd');

    expectMigrationError(() => migratePracticeNativeEnvelope(input), 'malformed-current-version');
  });

  it('rejects unknown native envelope versions before parsing their body', () => {
    expectMigrationError(
      () => migratePracticeNativeEnvelope({ interchangeVersion: 0 }),
      'unsupported-version',
    );
    expectMigrationError(
      () => migratePracticeNativeEnvelope({ interchangeVersion: 99 }),
      'unsupported-future-version',
    );
  });

  it('rejects inherited version fields rather than trusting prototype state', () => {
    const inherited = Object.create({ contractVersion: 1 }) as Record<string, unknown>;
    Object.assign(inherited, currentDocument(), { contractVersion: undefined });
    delete inherited.contractVersion;

    expectMigrationError(() => migratePracticeDocument(inherited), 'missing-version');
  });
});
