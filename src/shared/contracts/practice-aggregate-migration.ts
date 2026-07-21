import { z } from 'zod';

import {
  MEDIA_AVAILABILITY_STATE_CONTRACT_VERSION,
  MEDIA_IDENTITY_CONTRACT_VERSION,
  MediaAvailabilityStateSchema,
  MediaIdentitySchema,
  OBSERVED_EVIDENCE_SNAPSHOT_CONTRACT_VERSION,
  ObservedEvidenceSnapshotSchema,
  PRACTICE_ASSESSMENT_CONTRACT_VERSION,
  PRACTICE_TAKE_CONTRACT_VERSION,
  PracticeAssessmentSchema,
  PracticeTakeSchema,
  REFERENCE_SCORE_MEDIA_SYNC_MAP_CONTRACT_VERSION,
  REFERENCE_VIDEO_CONTRACT_VERSION,
  ReferenceScoreMediaSyncMapSchema,
  ReferenceVideoSchema,
  TAKE_CAPTURE_MEDIA_SYNC_MAP_CONTRACT_VERSION,
  TAKE_VIDEO_ATTACHMENT_STATE_CONTRACT_VERSION,
  TAKE_VIDEO_CONTRACT_VERSION,
  TakeCaptureMediaSyncMapSchema,
  TakeVideoAttachmentStateSchema,
  TakeVideoSchema,
  type MediaAvailabilityState,
  type MediaIdentity,
  type ObservedEvidenceSnapshot,
  type PracticeAssessment,
  type PracticeTake,
  type ReferenceScoreMediaSyncMap,
  type ReferenceVideo,
  type TakeCaptureMediaSyncMap,
  type TakeVideo,
  type TakeVideoAttachmentState,
} from './practice';
import {
  PRACTICE_IMPORT_DRAFT_VERSION,
  PRACTICE_IMPORT_REPORT_VERSION,
  PRACTICE_IMPORT_REVIEW_BUNDLE_VERSION,
  PracticeImportDraftSchema,
  PracticeImportReportSchema,
  PracticeImportReviewBundleSchema,
  type PracticeImportDraft,
  type PracticeImportReport,
  type PracticeImportReviewBundle,
} from './practice-import';
import { PracticeMigrationError } from './practice-migration';

export const PRACTICE_AGGREGATE_KINDS = Object.freeze([
  'observed-evidence-snapshot',
  'practice-take',
  'media-identity',
  'media-availability-state',
  'reference-video',
  'take-video',
  'take-video-attachment-state',
  'reference-score-media-sync-map',
  'take-capture-media-sync-map',
  'practice-assessment',
  'practice-import-draft',
  'practice-import-report',
  'practice-import-review-bundle',
] as const);

export const PracticeAggregateKindSchema = z.enum(PRACTICE_AGGREGATE_KINDS);
export type PracticeAggregateKind = z.infer<typeof PracticeAggregateKindSchema>;

export type PracticeAggregateByKind = {
  readonly 'media-availability-state': MediaAvailabilityState;
  readonly 'media-identity': MediaIdentity;
  readonly 'observed-evidence-snapshot': ObservedEvidenceSnapshot;
  readonly 'practice-assessment': PracticeAssessment;
  readonly 'practice-import-draft': PracticeImportDraft;
  readonly 'practice-import-report': PracticeImportReport;
  readonly 'practice-import-review-bundle': PracticeImportReviewBundle;
  readonly 'practice-take': PracticeTake;
  readonly 'reference-score-media-sync-map': ReferenceScoreMediaSyncMap;
  readonly 'reference-video': ReferenceVideo;
  readonly 'take-capture-media-sync-map': TakeCaptureMediaSyncMap;
  readonly 'take-video': TakeVideo;
  readonly 'take-video-attachment-state': TakeVideoAttachmentState;
};

export type PracticeAggregateVersionField = 'bundleVersion' | 'contractVersion';

export const PRACTICE_AGGREGATE_VERSION_FIELDS = Object.freeze({
  'media-availability-state': 'contractVersion',
  'media-identity': 'contractVersion',
  'observed-evidence-snapshot': 'contractVersion',
  'practice-assessment': 'contractVersion',
  'practice-import-draft': 'contractVersion',
  'practice-import-report': 'contractVersion',
  'practice-import-review-bundle': 'bundleVersion',
  'practice-take': 'contractVersion',
  'reference-score-media-sync-map': 'contractVersion',
  'reference-video': 'contractVersion',
  'take-capture-media-sync-map': 'contractVersion',
  'take-video': 'contractVersion',
  'take-video-attachment-state': 'contractVersion',
} as const satisfies Readonly<Record<PracticeAggregateKind, PracticeAggregateVersionField>>);

export const CURRENT_PRACTICE_AGGREGATE_VERSIONS = Object.freeze({
  'media-availability-state': MEDIA_AVAILABILITY_STATE_CONTRACT_VERSION,
  'media-identity': MEDIA_IDENTITY_CONTRACT_VERSION,
  'observed-evidence-snapshot': OBSERVED_EVIDENCE_SNAPSHOT_CONTRACT_VERSION,
  'practice-assessment': PRACTICE_ASSESSMENT_CONTRACT_VERSION,
  'practice-import-draft': PRACTICE_IMPORT_DRAFT_VERSION,
  'practice-import-report': PRACTICE_IMPORT_REPORT_VERSION,
  'practice-import-review-bundle': PRACTICE_IMPORT_REVIEW_BUNDLE_VERSION,
  'practice-take': PRACTICE_TAKE_CONTRACT_VERSION,
  'reference-score-media-sync-map': REFERENCE_SCORE_MEDIA_SYNC_MAP_CONTRACT_VERSION,
  'reference-video': REFERENCE_VIDEO_CONTRACT_VERSION,
  'take-capture-media-sync-map': TAKE_CAPTURE_MEDIA_SYNC_MAP_CONTRACT_VERSION,
  'take-video': TAKE_VIDEO_CONTRACT_VERSION,
  'take-video-attachment-state': TAKE_VIDEO_ATTACHMENT_STATE_CONTRACT_VERSION,
} as const satisfies Readonly<Record<PracticeAggregateKind, 1>>);

const SUPPORTED_VERSION_ONE = Object.freeze([1] as const);

export const SUPPORTED_PRACTICE_AGGREGATE_VERSIONS = Object.freeze({
  'media-availability-state': SUPPORTED_VERSION_ONE,
  'media-identity': SUPPORTED_VERSION_ONE,
  'observed-evidence-snapshot': SUPPORTED_VERSION_ONE,
  'practice-assessment': SUPPORTED_VERSION_ONE,
  'practice-import-draft': SUPPORTED_VERSION_ONE,
  'practice-import-report': SUPPORTED_VERSION_ONE,
  'practice-import-review-bundle': SUPPORTED_VERSION_ONE,
  'practice-take': SUPPORTED_VERSION_ONE,
  'reference-score-media-sync-map': SUPPORTED_VERSION_ONE,
  'reference-video': SUPPORTED_VERSION_ONE,
  'take-capture-media-sync-map': SUPPORTED_VERSION_ONE,
  'take-video': SUPPORTED_VERSION_ONE,
  'take-video-attachment-state': SUPPORTED_VERSION_ONE,
} as const satisfies Readonly<Record<PracticeAggregateKind, readonly [1]>>);

type AnyAggregateSchema = z.ZodType<PracticeAggregateByKind[PracticeAggregateKind]>;

const PRACTICE_AGGREGATE_SCHEMAS = Object.freeze({
  'media-availability-state': MediaAvailabilityStateSchema,
  'media-identity': MediaIdentitySchema,
  'observed-evidence-snapshot': ObservedEvidenceSnapshotSchema,
  'practice-assessment': PracticeAssessmentSchema,
  'practice-import-draft': PracticeImportDraftSchema,
  'practice-import-report': PracticeImportReportSchema,
  'practice-import-review-bundle': PracticeImportReviewBundleSchema,
  'practice-take': PracticeTakeSchema,
  'reference-score-media-sync-map': ReferenceScoreMediaSyncMapSchema,
  'reference-video': ReferenceVideoSchema,
  'take-capture-media-sync-map': TakeCaptureMediaSyncMapSchema,
  'take-video': TakeVideoSchema,
  'take-video-attachment-state': TakeVideoAttachmentStateSchema,
} as const satisfies Readonly<Record<PracticeAggregateKind, AnyAggregateSchema>>);

export type PracticeAggregateMigrationTraceEntry<
  K extends PracticeAggregateKind = PracticeAggregateKind,
> = {
  readonly aggregateKind: K;
  readonly fromVersion: number;
  readonly operation: 'validate-current';
  readonly registryIndex: 0;
  readonly toVersion: 1;
};

export type PracticeAggregateMigrationResult<K extends PracticeAggregateKind> = {
  readonly aggregate: PracticeAggregateByKind[K];
  readonly aggregateKind: K;
  readonly fromVersion: number;
  readonly toVersion: 1;
  readonly trace: readonly PracticeAggregateMigrationTraceEntry<K>[];
};

export type PracticeAggregateMigrationRegistryEntry<K extends PracticeAggregateKind> = {
  readonly aggregateKind: K;
  readonly migrate: (input: unknown) => PracticeAggregateByKind[K];
  readonly toVersion: 1;
  readonly versionField: PracticeAggregateVersionField;
};

function malformedCurrentVersion(
  aggregateKind: PracticeAggregateKind,
  issues: readonly z.core.$ZodIssue[] = [],
): PracticeMigrationError {
  return new PracticeMigrationError(
    'malformed-current-version',
    `${aggregateKind} version 1 failed runtime validation.`,
    1,
    issues,
  );
}

function parseAndDetachCurrentAggregate<K extends PracticeAggregateKind>(
  aggregateKind: K,
  input: unknown,
): PracticeAggregateByKind[K] {
  let detachedInput: unknown;
  try {
    detachedInput = structuredClone(input);
  } catch {
    throw malformedCurrentVersion(aggregateKind);
  }

  const result = PRACTICE_AGGREGATE_SCHEMAS[aggregateKind].safeParse(detachedInput);
  if (!result.success) throw malformedCurrentVersion(aggregateKind, result.error.issues);
  return result.data as PracticeAggregateByKind[K];
}

function registryEntry<K extends PracticeAggregateKind>(
  aggregateKind: K,
): Readonly<PracticeAggregateMigrationRegistryEntry<K>> {
  return Object.freeze({
    aggregateKind,
    migrate: (input: unknown) => parseAndDetachCurrentAggregate(aggregateKind, input),
    toVersion: CURRENT_PRACTICE_AGGREGATE_VERSIONS[aggregateKind],
    versionField: PRACTICE_AGGREGATE_VERSION_FIELDS[aggregateKind],
  });
}

export const PRACTICE_AGGREGATE_MIGRATION_REGISTRY = Object.freeze({
  'media-availability-state': Object.freeze({
    1: registryEntry('media-availability-state'),
  }),
  'media-identity': Object.freeze({ 1: registryEntry('media-identity') }),
  'observed-evidence-snapshot': Object.freeze({
    1: registryEntry('observed-evidence-snapshot'),
  }),
  'practice-assessment': Object.freeze({ 1: registryEntry('practice-assessment') }),
  'practice-import-draft': Object.freeze({ 1: registryEntry('practice-import-draft') }),
  'practice-import-report': Object.freeze({ 1: registryEntry('practice-import-report') }),
  'practice-import-review-bundle': Object.freeze({
    1: registryEntry('practice-import-review-bundle'),
  }),
  'practice-take': Object.freeze({ 1: registryEntry('practice-take') }),
  'reference-score-media-sync-map': Object.freeze({
    1: registryEntry('reference-score-media-sync-map'),
  }),
  'reference-video': Object.freeze({ 1: registryEntry('reference-video') }),
  'take-capture-media-sync-map': Object.freeze({
    1: registryEntry('take-capture-media-sync-map'),
  }),
  'take-video': Object.freeze({ 1: registryEntry('take-video') }),
  'take-video-attachment-state': Object.freeze({
    1: registryEntry('take-video-attachment-state'),
  }),
} as const);

function readOwnVersion(input: unknown, key: PracticeAggregateVersionField): number {
  if (typeof input !== 'object' || input === null || !Object.hasOwn(input, key)) {
    throw new PracticeMigrationError('missing-version', `Practice aggregate must declare ${key}.`);
  }

  let version: unknown;
  try {
    version = Reflect.get(input, key);
  } catch {
    throw new PracticeMigrationError(
      'missing-version',
      `Practice aggregate has an unreadable ${key}.`,
    );
  }
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new PracticeMigrationError('missing-version', `${key} must be an integer.`);
  }
  return version;
}

function unsupportedVersion(
  aggregateKind: PracticeAggregateKind,
  version: number,
  currentVersion: number,
): never {
  if (version > currentVersion) {
    throw new PracticeMigrationError(
      'unsupported-future-version',
      `${aggregateKind} version ${String(version)} is newer than supported version ${String(currentVersion)}.`,
      version,
    );
  }
  throw new PracticeMigrationError(
    'unsupported-version',
    `${aggregateKind} version ${String(version)} is not supported; no implicit legacy migration exists.`,
    version,
  );
}

export function migratePracticeAggregate<K extends PracticeAggregateKind>(
  aggregateKind: K,
  input: unknown,
): PracticeAggregateMigrationResult<K> {
  const currentVersion = CURRENT_PRACTICE_AGGREGATE_VERSIONS[aggregateKind];
  const fromVersion = readOwnVersion(input, PRACTICE_AGGREGATE_VERSION_FIELDS[aggregateKind]);
  if (fromVersion !== currentVersion) {
    return unsupportedVersion(aggregateKind, fromVersion, currentVersion);
  }

  const registryEntry = PRACTICE_AGGREGATE_MIGRATION_REGISTRY[aggregateKind][1];
  return {
    aggregate: registryEntry.migrate(input) as PracticeAggregateByKind[K],
    aggregateKind,
    fromVersion,
    toVersion: currentVersion,
    trace: Object.freeze([
      Object.freeze({
        aggregateKind,
        fromVersion,
        operation: 'validate-current' as const,
        registryIndex: 0 as const,
        toVersion: currentVersion,
      }),
    ]),
  };
}

export function allSupportedPracticeAggregateVersionsReachCurrent(): boolean {
  return PRACTICE_AGGREGATE_KINDS.every((aggregateKind) =>
    SUPPORTED_PRACTICE_AGGREGATE_VERSIONS[aggregateKind].every((version) =>
      Object.hasOwn(PRACTICE_AGGREGATE_MIGRATION_REGISTRY[aggregateKind], version),
    ),
  );
}

export const migrateObservedEvidenceSnapshot = (input: unknown) =>
  migratePracticeAggregate('observed-evidence-snapshot', input);
export const migratePracticeTake = (input: unknown) =>
  migratePracticeAggregate('practice-take', input);
export const migrateMediaIdentity = (input: unknown) =>
  migratePracticeAggregate('media-identity', input);
export const migrateMediaAvailabilityState = (input: unknown) =>
  migratePracticeAggregate('media-availability-state', input);
export const migrateReferenceVideo = (input: unknown) =>
  migratePracticeAggregate('reference-video', input);
export const migrateTakeVideo = (input: unknown) => migratePracticeAggregate('take-video', input);
export const migrateTakeVideoAttachmentState = (input: unknown) =>
  migratePracticeAggregate('take-video-attachment-state', input);
export const migrateReferenceScoreMediaSyncMap = (input: unknown) =>
  migratePracticeAggregate('reference-score-media-sync-map', input);
export const migrateTakeCaptureMediaSyncMap = (input: unknown) =>
  migratePracticeAggregate('take-capture-media-sync-map', input);
export const migratePracticeAssessment = (input: unknown) =>
  migratePracticeAggregate('practice-assessment', input);
export const migratePracticeImportDraft = (input: unknown) =>
  migratePracticeAggregate('practice-import-draft', input);
export const migratePracticeImportReport = (input: unknown) =>
  migratePracticeAggregate('practice-import-report', input);
export const migratePracticeImportReviewBundle = (input: unknown) =>
  migratePracticeAggregate('practice-import-review-bundle', input);
