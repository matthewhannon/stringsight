import { describe, expect, it } from 'vitest';

import {
  CURRENT_PRACTICE_AGGREGATE_VERSIONS,
  PRACTICE_AGGREGATE_KINDS,
  PRACTICE_AGGREGATE_MIGRATION_REGISTRY,
  PRACTICE_AGGREGATE_VERSION_FIELDS,
  SUPPORTED_PRACTICE_AGGREGATE_VERSIONS,
  allSupportedPracticeAggregateVersionsReachCurrent,
  migrateMediaAvailabilityState,
  migrateMediaIdentity,
  migratePracticeAggregate,
  type PracticeAggregateKind,
} from './practice-aggregate-migration';
import { PracticeMigrationError } from './practice-migration';

function hash(projectionId: string, digest = 'a') {
  return qualifiedHash('media-fixture', projectionId, digest);
}

function qualifiedHash(schemaId: string, projectionId: string, digest = 'a') {
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1 as const,
    digestHex: digest.repeat(64),
    projectionId,
    projectionVersion: 1 as const,
    schemaId,
    schemaVersion: 1 as const,
  };
}

function mediaIdentity() {
  return {
    contentHash: hash('media-content'),
    contractVersion: 1,
    formatMetadataHash: hash('media-format', 'b'),
    id: 'media-1',
    mediaKind: 'reference-video' as const,
  };
}

function mediaAvailabilityState() {
  return {
    availability: 'available' as const,
    contractVersion: 1,
    locator: 'opfs://media-1',
    mediaId: 'media-1',
    provenance: 'Persisted by the local media store.',
    stateRevision: 2,
    updatedAt: '2026-07-20T12:00:00Z',
  };
}

const documentContentHash = () => qualifiedHash('practice-document', 'practice-document-content');
const expectedEventsHash = () =>
  qualifiedHash('practice-document', 'practice-expected-events', 'b');
const evidenceSnapshotHash = () =>
  qualifiedHash('observed-evidence-snapshot', 'observed-evidence-snapshot', 'c');
const takeCoreHash = () => qualifiedHash('practice-take', 'practice-take-core', 'd');
const referenceMapHash = () =>
  qualifiedHash('reference-score-media-sync-map', 'reference-score-media-sync-map', 'e');
const takeMapHash = () =>
  qualifiedHash('take-capture-media-sync-map', 'take-capture-media-sync-map', 'f');
const assessmentHash = () => qualifiedHash('practice-assessment', 'practice-assessment', '1');
const sourceIdentityHash = () =>
  qualifiedHash('practice-import-source', 'practice-import-source-identity', '2');

function documentRevision() {
  return {
    contentHash: documentContentHash(),
    documentId: 'document-1',
    revisionId: 'revision-1',
    revisionNumber: 1,
  };
}

function observedEvidenceSnapshot() {
  return {
    contractVersion: 1,
    correctedProjectionHash: qualifiedHash('session', 'corrected-events'),
    correctionCount: 0,
    correctionPrefixHash: qualifiedHash('session', 'correction-prefix'),
    createdAt: '2026-07-20T12:00:00Z',
    detectorVersions: { onset: '1.0.0', pitch: '1.0.0' },
    expectedPcmHash: null,
    id: 'snapshot-1',
    rawEventCount: 1,
    rawEvidenceHash: qualifiedHash('session', 'raw-evidence'),
    sessionId: 'session-1',
    sessionProjectionHash: qualifiedHash('session', 'session-projection'),
  };
}

function practiceTake() {
  return {
    captureEpochs: [
      {
        appliedAudioFrame: 100,
        captureGeneration: 1,
        endLogicalFrameExclusive: 48_000,
        id: 'epoch-1',
        runtimeGeneration: 1,
        scheduledAudioFrame: 96,
        scoreStartTick: 0,
        startLogicalFrame: 0,
        transportGeneration: 1,
      },
    ],
    contractVersion: 1,
    countInConfigurationHash: null,
    createdAt: '2026-07-20T12:00:00Z',
    documentRevision: documentRevision(),
    evidenceSnapshotHash: evidenceSnapshotHash(),
    evidenceSnapshotId: 'snapshot-1',
    expectedProjectionHash: expectedEventsHash(),
    id: 'take-1',
    loopPassPolicy: { kind: 'single-pass' as const },
    metronomeEnabled: true,
    microphoneMediaHash: hash('media-content'),
    microphoneMediaId: 'media-1',
    practiceSpeed: { denominator: 1, numerator: 1 },
    range: { endTickExclusive: 960, startTick: 0 },
    referenceConfigurationHash: null,
    sampleRate: 48_000,
    status: 'finalized' as const,
    takeCoreHash: takeCoreHash(),
    warnings: [],
  };
}

function referenceVideo() {
  return {
    contractVersion: 1,
    createdAt: '2026-07-20T12:00:00Z',
    documentRevision: documentRevision(),
    id: 'reference-video-1',
    mediaContentHash: hash('media-content'),
    mediaId: 'media-1',
    syncMapHash: referenceMapHash(),
    syncMapId: 'reference-map-1',
  };
}

function takeVideo() {
  return {
    contractVersion: 1,
    createdAt: '2026-07-20T12:00:00Z',
    id: 'take-video-1',
    takeCoreHash: takeCoreHash(),
    takeId: 'take-1',
    videoContentHash: hash('video-content'),
    videoMediaId: 'video-media-1',
  };
}

function takeVideoAttachmentState() {
  return {
    contractVersion: 1,
    selectedMapHash: takeMapHash(),
    selectedMapId: 'take-map-1',
    stateRevision: 1,
    takeVideoId: 'take-video-1',
    updatedAt: '2026-07-20T12:01:00Z',
  };
}

function referenceScoreMediaSyncMap() {
  return {
    anchors: [
      { mediaPtsMicroseconds: 0, scoreTick: 0 },
      { mediaPtsMicroseconds: 1_000_000, scoreTick: 960 },
    ],
    boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped' as const,
    contractVersion: 1,
    documentRevision: documentRevision(),
    expectedProjectionHash: expectedEventsHash(),
    gapSegmentIndices: [],
    historySequence: 0,
    id: 'reference-map-1',
    mapHash: referenceMapHash(),
    mediaContentHash: hash('media-content'),
    mediaId: 'media-1',
    normalizedTimelineId: 'expected-events-v1',
    parentMap: null,
    provenance: 'authored' as const,
  };
}

function takeCaptureMediaSyncMap() {
  return {
    anchors: [
      {
        captureEpochId: 'epoch-1',
        captureGeneration: 1,
        logicalAudioFrame: 0,
        mediaPtsMicroseconds: 0,
        runtimeGeneration: 1,
        transportGeneration: 1,
      },
      {
        captureEpochId: 'epoch-1',
        captureGeneration: 1,
        logicalAudioFrame: 48_000,
        mediaPtsMicroseconds: 1_000_000,
        runtimeGeneration: 1,
        transportGeneration: 1,
      },
    ],
    boundaryPolicy: 'generation-segments-only' as const,
    captureEpochIds: ['epoch-1'],
    contractVersion: 1,
    id: 'take-map-1',
    mapHash: takeMapHash(),
    takeCoreHash: takeCoreHash(),
    takeId: 'take-1',
    timestampStrategyId: 'container-timestamps',
    uncertaintyMicroseconds: 1_000,
    videoContentHash: hash('video-content'),
    videoMediaId: 'video-media-1',
  };
}

function practiceAssessment() {
  return {
    algorithmId: 'alignment-v1',
    algorithmVersion: '1.0.0',
    alignmentProvenanceHash: hash('alignment-provenance'),
    ambiguousCount: 0,
    assessmentHash: assessmentHash(),
    confidence: 0.9,
    contractVersion: 1,
    createdAt: '2026-07-20T12:02:00Z',
    documentRevision: documentRevision(),
    evidenceSnapshotHash: evidenceSnapshotHash(),
    evidenceSnapshotId: 'snapshot-1',
    expectedProjectionHash: expectedEventsHash(),
    id: 'assessment-1',
    matchedCount: 1,
    takeCoreHash: takeCoreHash(),
    takeId: 'take-1',
    unmatchedExpectedCount: 0,
    unmatchedObservedCount: 0,
  };
}

const importAdapter = { adapterId: 'adapter-1', adapterVersion: '1.0.0' };

function importSource() {
  return {
    byteLength: 1_024,
    fileName: 'exercise.gp',
    format: 'guitar-pro' as const,
    formatVersion: 'GP8',
    mediaType: 'application/octet-stream',
    sha256Hex: '3'.repeat(64),
    sourceId: 'source-1',
  };
}

function importResources() {
  return {
    budget: {
      maximumOutputEvents: 100,
      maximumSourceBytes: 2_048,
      maximumSourceEvents: 100,
      maximumWallClockMs: 1_000,
    },
    usage: {
      outputEventCount: 1,
      sourceBytes: 1_024,
      sourceEventCount: 4,
      wallClockMs: 10,
    },
  };
}

function importedDocument() {
  return {
    contractVersion: 1,
    durationTicks: 960,
    expectedProjectionHash: expectedEventsHash(),
    guitar: {
      capoFret: 0,
      handedness: 'right' as const,
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: '12-tet' as const,
      tuning: [
        { openMidi: 64, stringNumber: 1 },
        { openMidi: 59, stringNumber: 2 },
        { openMidi: 55, stringNumber: 3 },
        { openMidi: 50, stringNumber: 4 },
        { openMidi: 45, stringNumber: 5 },
        { openMidi: 40, stringNumber: 6 },
      ],
    },
    importProvenance: {
      ...importAdapter,
      importReportId: 'report-1',
      sourceFormat: 'guitar-pro',
      sourceHash: sourceIdentityHash(),
    },
    keyMap: [{ fifths: 0, mode: 'major' as const, tick: 0 }],
    loopPresets: [],
    metadata: {
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Imported exercise',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: documentRevision(),
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [
      {
        id: 'track-1',
        name: 'Guitar',
        voices: [
          {
            events: [{ durationTicks: 960, id: 'rest-1', kind: 'rest' as const, tick: 0 }],
            id: 'voice-1',
          },
        ],
      },
    ],
  };
}

function practiceImportDraft() {
  return {
    adapter: importAdapter,
    candidateDocument: importedDocument(),
    candidateDocumentContentHash: documentContentHash(),
    contractVersion: 1,
    createdAt: '2026-07-20T12:00:01Z',
    direction: 'score-to-draft' as const,
    draftId: 'draft-1',
    reportId: 'report-1',
    resources: importResources(),
    route: 'gp8-basic-fixture-v1' as const,
    source: importSource(),
    sourceIdentityHash: sourceIdentityHash(),
  };
}

function practiceImportReport() {
  return {
    adapter: importAdapter,
    contractVersion: 1,
    diagnostics: [],
    direction: 'score-to-draft' as const,
    dispositionCounts: {
      approximated: 0,
      blocking: 0,
      converted: 0,
      dropped: 0,
      preserved: 1,
      unsupported: 0,
    },
    draftBinding: {
      candidateDocumentContentHash: documentContentHash(),
      draftId: 'draft-1',
    },
    finalizedAt: '2026-07-20T12:00:02Z',
    findings: [
      {
        action: 'none' as const,
        affectedCount: 1,
        code: 'import.gp8-basic.fixture-backed' as const,
        disposition: 'preserved' as const,
        schemaVersion: 1,
        severity: 'info' as const,
      },
    ],
    highestSeverity: 'info' as const,
    outcome: 'reviewable' as const,
    reportAction: 'accept-draft' as const,
    reportId: 'report-1',
    resources: importResources(),
    route: 'gp8-basic-fixture-v1' as const,
    source: importSource(),
    sourceIdentityHash: sourceIdentityHash(),
    startedAt: '2026-07-20T12:00:00Z',
  };
}

function practiceImportReviewBundle() {
  return {
    bundleVersion: 1,
    draft: practiceImportDraft(),
    report: practiceImportReport(),
  };
}

function validAggregateFixtures(): Record<PracticeAggregateKind, unknown> {
  return {
    'media-availability-state': mediaAvailabilityState(),
    'media-identity': mediaIdentity(),
    'observed-evidence-snapshot': observedEvidenceSnapshot(),
    'practice-assessment': practiceAssessment(),
    'practice-import-draft': practiceImportDraft(),
    'practice-import-report': practiceImportReport(),
    'practice-import-review-bundle': practiceImportReviewBundle(),
    'practice-take': practiceTake(),
    'reference-score-media-sync-map': referenceScoreMediaSyncMap(),
    'reference-video': referenceVideo(),
    'take-capture-media-sync-map': takeCaptureMediaSyncMap(),
    'take-video': takeVideo(),
    'take-video-attachment-state': takeVideoAttachmentState(),
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

describe('durable practice aggregate migration registry', () => {
  it('publishes a frozen explicit v1 route for every durable aggregate kind', () => {
    expect(PRACTICE_AGGREGATE_KINDS).toHaveLength(13);
    expect(Object.keys(PRACTICE_AGGREGATE_MIGRATION_REGISTRY).sort()).toEqual(
      [...PRACTICE_AGGREGATE_KINDS].sort(),
    );
    for (const aggregateKind of PRACTICE_AGGREGATE_KINDS) {
      expect(CURRENT_PRACTICE_AGGREGATE_VERSIONS[aggregateKind]).toBe(1);
      expect(SUPPORTED_PRACTICE_AGGREGATE_VERSIONS[aggregateKind]).toEqual([1]);
      expect(Object.keys(PRACTICE_AGGREGATE_MIGRATION_REGISTRY[aggregateKind])).toEqual(['1']);
      expect(Object.isFrozen(PRACTICE_AGGREGATE_MIGRATION_REGISTRY[aggregateKind])).toBe(true);
      expect(Object.isFrozen(PRACTICE_AGGREGATE_MIGRATION_REGISTRY[aggregateKind][1])).toBe(true);
    }
    expect(Object.isFrozen(PRACTICE_AGGREGATE_MIGRATION_REGISTRY)).toBe(true);
    expect(allSupportedPracticeAggregateVersionsReachCurrent()).toBe(true);
  });

  it('routes every current-version aggregate through runtime validation', () => {
    for (const aggregateKind of PRACTICE_AGGREGATE_KINDS) {
      const versionField = PRACTICE_AGGREGATE_VERSION_FIELDS[aggregateKind];
      expectMigrationError(
        () => migratePracticeAggregate(aggregateKind, { [versionField]: 1 }),
        'malformed-current-version',
      );
    }
  });

  it('migrates one valid current payload through every registered aggregate route', () => {
    const fixtures = validAggregateFixtures();

    for (const aggregateKind of PRACTICE_AGGREGATE_KINDS) {
      const input = fixtures[aggregateKind];
      const result = migratePracticeAggregate(aggregateKind, input);

      expect(result.aggregateKind, aggregateKind).toBe(aggregateKind);
      expect(result.fromVersion, aggregateKind).toBe(1);
      expect(result.toVersion, aggregateKind).toBe(1);
      expect(result.aggregate, aggregateKind).not.toBe(input);
      expect(result.trace, aggregateKind).toEqual([
        {
          aggregateKind,
          fromVersion: 1,
          operation: 'validate-current',
          registryIndex: 0,
          toVersion: 1,
        },
      ]);
      expect(Object.isFrozen(result.trace), aggregateKind).toBe(true);
      expect(Object.isFrozen(result.trace[0]), aggregateKind).toBe(true);

      const inputRecord = input as Record<string, unknown>;
      const outputRecord = result.aggregate as unknown as Record<string, unknown>;
      const nestedKey = Object.keys(inputRecord).find((key) => {
        const value = inputRecord[key];
        return typeof value === 'object' && value !== null;
      });
      if (nestedKey !== undefined) {
        expect(outputRecord[nestedKey], `${aggregateKind}.${nestedKey}`).not.toBe(
          inputRecord[nestedKey],
        );
      }
    }

    const take = migratePracticeAggregate('practice-take', fixtures['practice-take']).aggregate;
    expect(take.calibration).toEqual({
      inputLatencyFrames: null,
      measuredAt: null,
      methodId: null,
      methodVersion: null,
      status: 'unavailable',
      uncertaintyFrames: null,
      warnings: [],
    });
    expect(take.clockAnchors).toEqual([]);
    expect(take.discontinuities).toEqual([]);
    expect(take.microphoneRecordingProvenance).toBeNull();
    expect(take.provenanceCompleteness).toBe('legacy-summary');
    expect(take.takeVideoCaptureProvenance).toBeNull();

    const assessment = migratePracticeAggregate(
      'practice-assessment',
      fixtures['practice-assessment'],
    ).aggregate;
    expect(assessment.alignment).toBeNull();
    expect(assessment.correctionProvenance).toBeNull();
    expect(assessment.records).toEqual({ mode: 'legacy-summary' });

    const report = migratePracticeAggregate(
      'practice-import-report',
      fixtures['practice-import-report'],
    ).aggregate;
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.findings)).toBe(true);

    const bundle = migratePracticeAggregate(
      'practice-import-review-bundle',
      fixtures['practice-import-review-bundle'],
    ).aggregate;
    expect(Object.isFrozen(bundle)).toBe(false);
    expect(Object.isFrozen(bundle.report)).toBe(true);
    expect(allSupportedPracticeAggregateVersionsReachCurrent()).toBe(true);
  });

  it('deep-detaches valid aggregates and emits a deterministic identity trace', () => {
    const input = mediaIdentity();
    const result = migrateMediaIdentity(input);

    expect(result.aggregateKind).toBe('media-identity');
    expect(result.aggregate).not.toBe(input);
    expect(result.aggregate.contentHash).not.toBe(input.contentHash);
    expect(result.trace).toEqual([
      {
        aggregateKind: 'media-identity',
        fromVersion: 1,
        operation: 'validate-current',
        registryIndex: 0,
        toVersion: 1,
      },
    ]);
    expect(Object.isFrozen(result.trace)).toBe(true);
    expect(Object.isFrozen(result.trace[0])).toBe(true);

    input.contentHash.digestHex = 'c'.repeat(64);
    expect(result.aggregate.contentHash.digestHex).toBe('a'.repeat(64));
  });

  it('returns each aggregate schema output, including canonicalized validation data', () => {
    const result = migrateMediaAvailabilityState(mediaAvailabilityState());

    expect(result.aggregate).toEqual(mediaAvailabilityState());
    expect(result.aggregateKind).toBe('media-availability-state');
  });

  it('distinguishes missing, malformed, legacy, and future versions', () => {
    expectMigrationError(() => migrateMediaIdentity({}), 'missing-version');
    expectMigrationError(
      () => migrateMediaIdentity({ ...mediaIdentity(), contractVersion: 1.5 }),
      'missing-version',
    );
    expectMigrationError(
      () => migrateMediaIdentity({ ...mediaIdentity(), contractVersion: 0 }),
      'unsupported-version',
    );
    expectMigrationError(
      () => migrateMediaIdentity({ ...mediaIdentity(), contractVersion: 2 }),
      'unsupported-future-version',
    );
    expectMigrationError(
      () => migratePracticeAggregate('practice-import-review-bundle', { bundleVersion: 0 }),
      'unsupported-version',
    );
    expectMigrationError(
      () => migratePracticeAggregate('practice-import-review-bundle', { bundleVersion: 2 }),
      'unsupported-future-version',
    );
  });

  it('rejects inherited, unreadable, and uncloneable current-version state', () => {
    const inherited = Object.create({ contractVersion: 1 }) as Record<string, unknown>;
    expectMigrationError(() => migrateMediaIdentity(inherited), 'missing-version');

    const unreadable = Object.defineProperty({}, 'contractVersion', {
      get: () => {
        throw new Error('unreadable');
      },
    });
    expectMigrationError(() => migrateMediaIdentity(unreadable), 'missing-version');

    expectMigrationError(
      () => migrateMediaIdentity({ ...mediaIdentity(), uncloneable: () => undefined }),
      'malformed-current-version',
    );
  });
});
