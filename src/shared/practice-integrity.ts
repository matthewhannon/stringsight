import { z } from 'zod';

import {
  AssessmentAlignmentProvenanceSchema,
  MediaAvailabilityStateSchema,
  MediaIdentitySchema,
  ObservedEvidenceSnapshotSchema,
  PracticeAssessmentSchema,
  PracticeDocumentSchema,
  PracticeTakeSchema,
  ReferenceScoreMediaSyncMapSchema,
  ReferenceVideoSchema,
  TakeCaptureMediaSyncMapSchema,
  TakeVideoAttachmentStateSchema,
  TakeVideoSchema,
  type DocumentRevisionIdentity,
  type QualifiedHash,
} from './contracts/practice';
import { assertCanonicalJsonDataDomain, hashCanonicalJson } from './canonical-json';
import {
  hashExpectedEvents,
  hashObservedEvidenceSnapshot,
  hashPracticeAssessment,
  hashPracticeDocumentContent,
  hashPracticeTakeCore,
  hashReferenceScoreMediaSyncMap,
  hashTakeCaptureMediaSyncMap,
  materializeExpectedEvents,
  type PracticeQualifiedHash,
} from './practice-identity';
import { validateTakeMapAgainstCaptureEpochs } from './practice-sync';

const MAX_GRAPH_AGGREGATES = 10_000;

export const PracticeAggregateGraphSchema = z
  .object({
    assessments: z.array(PracticeAssessmentSchema).max(MAX_GRAPH_AGGREGATES),
    document: PracticeDocumentSchema,
    evidenceSnapshots: z.array(ObservedEvidenceSnapshotSchema).max(MAX_GRAPH_AGGREGATES),
    mediaAvailability: z.array(MediaAvailabilityStateSchema).max(MAX_GRAPH_AGGREGATES),
    mediaIdentities: z.array(MediaIdentitySchema).max(MAX_GRAPH_AGGREGATES),
    referenceMaps: z.array(ReferenceScoreMediaSyncMapSchema).max(MAX_GRAPH_AGGREGATES),
    referenceVideos: z.array(ReferenceVideoSchema).max(MAX_GRAPH_AGGREGATES),
    takeMaps: z.array(TakeCaptureMediaSyncMapSchema).max(MAX_GRAPH_AGGREGATES),
    takeVideoAttachments: z.array(TakeVideoAttachmentStateSchema).max(MAX_GRAPH_AGGREGATES),
    takeVideos: z.array(TakeVideoSchema).max(MAX_GRAPH_AGGREGATES),
    takes: z.array(PracticeTakeSchema).max(MAX_GRAPH_AGGREGATES),
  })
  .strict();

export type PracticeAggregateGraph = z.infer<typeof PracticeAggregateGraphSchema>;

export type PracticeIntegrityIssueCode =
  | 'binding-mismatch'
  | 'duplicate-id'
  | 'expected-timing-mismatch'
  | 'hash-mismatch'
  | 'missing-reference'
  | 'range-outside-document'
  | 'range-outside-take'
  | 'sync-map-invalid';

export type PracticeIntegrityIssue = Readonly<{
  code: PracticeIntegrityIssueCode;
  message: string;
  path: string;
}>;

export type PracticeIntegrityResult =
  | Readonly<{ graph: PracticeAggregateGraph; kind: 'valid' }>
  | Readonly<{ issues: readonly PracticeIntegrityIssue[]; kind: 'invalid' }>;

const hashesEqual = (left: QualifiedHash, right: PracticeQualifiedHash | QualifiedHash): boolean =>
  left.digestHex === right.digestHex &&
  left.projectionId === right.projectionId &&
  left.projectionVersion === right.projectionVersion &&
  left.schemaId === right.schemaId &&
  left.schemaVersion === right.schemaVersion;

const revisionsEqual = (left: DocumentRevisionIdentity, right: DocumentRevisionIdentity): boolean =>
  left.documentId === right.documentId &&
  left.revisionId === right.revisionId &&
  left.revisionNumber === right.revisionNumber &&
  hashesEqual(left.contentHash, right.contentHash);

const indexUnique = <T>(
  values: readonly T[],
  id: (value: T) => string,
  collection: string,
  issues: PracticeIntegrityIssue[],
): Map<string, T> => {
  const result = new Map<string, T>();
  values.forEach((value, index) => {
    const key = id(value);
    if (result.has(key)) {
      issues.push({
        code: 'duplicate-id',
        message: `${collection} IDs must be unique within an aggregate graph.`,
        path: `#/${collection}/${String(index)}/id`,
      });
    } else {
      result.set(key, value);
    }
  });
  return result;
};

const pushBinding = (
  condition: boolean,
  path: string,
  message: string,
  issues: PracticeIntegrityIssue[],
): void => {
  if (!condition) issues.push({ code: 'binding-mismatch', message, path });
};

const pushHash = (
  actual: QualifiedHash,
  computed: PracticeQualifiedHash,
  path: string,
  issues: PracticeIntegrityIssue[],
): void => {
  if (!hashesEqual(actual, computed)) {
    issues.push({
      code: 'hash-mismatch',
      message: 'Stored qualified identity does not match its canonical projection.',
      path,
    });
  }
};

type ExpectedIdentityEntry = Readonly<{
  eventTick: number;
  noteTicks: ReadonlyMap<string, number>;
}>;

const expectedIdentityIndex = (
  document: PracticeAggregateGraph['document'],
): ReadonlyMap<string, ExpectedIdentityEntry> => {
  const expected = materializeExpectedEvents(document);
  const identities = new Map<string, ExpectedIdentityEntry>();
  expected.tracks.forEach((track) =>
    track.voices.forEach((voice) =>
      voice.events.forEach((event) => {
        identities.set(event.id, {
          eventTick: event.tick,
          noteTicks: new Map(event.notes.map((note) => [note.id, event.tick])),
        });
      }),
    ),
  );
  return identities;
};

const expectedIdentityTick = (
  index: ReadonlyMap<string, ExpectedIdentityEntry>,
  eventId: string,
  noteId: string | null,
): number | undefined => {
  const event = index.get(eventId);
  return noteId === null ? event?.eventTick : event?.noteTicks.get(noteId);
};

export async function hashAssessmentAlignmentProvenance(input: unknown): Promise<QualifiedHash> {
  assertCanonicalJsonDataDomain(input);
  const alignment = AssessmentAlignmentProvenanceSchema.parse(input);
  const hash = await hashCanonicalJson(alignment, {
    projectionVersion: 'assessment-alignment-provenance/v1',
    schemaVersion: 'assessment-alignment-provenance/v1',
  });
  return {
    algorithm: 'sha256',
    canonicalizationId: 'stringsight-canonical-json',
    canonicalizationVersion: 1,
    digestHex: hash.digestHex,
    projectionId: 'assessment-alignment-provenance',
    projectionVersion: 1,
    schemaId: 'assessment-alignment-provenance',
    schemaVersion: 1,
  };
}

/**
 * Validates the cryptographic and referential seam among every durable Item 11 aggregate.
 * Mutable availability is checked for identity membership but deliberately excluded from hashes.
 */
export async function verifyPracticeAggregateGraph(
  input: unknown,
): Promise<PracticeIntegrityResult> {
  assertCanonicalJsonDataDomain(input);
  const parsed = PracticeAggregateGraphSchema.parse(input);
  const issues: PracticeIntegrityIssue[] = [];
  const evidenceById = indexUnique(
    parsed.evidenceSnapshots,
    ({ id }) => id,
    'evidenceSnapshots',
    issues,
  );
  indexUnique(parsed.assessments, ({ id }) => id, 'assessments', issues);
  const mediaById = indexUnique(parsed.mediaIdentities, ({ id }) => id, 'mediaIdentities', issues);
  const referenceMapById = indexUnique(
    parsed.referenceMaps,
    ({ id }) => id,
    'referenceMaps',
    issues,
  );
  indexUnique(parsed.referenceVideos, ({ id }) => id, 'referenceVideos', issues);
  const takeById = indexUnique(parsed.takes, ({ id }) => id, 'takes', issues);
  const takeMapById = indexUnique(parsed.takeMaps, ({ id }) => id, 'takeMaps', issues);
  const takeVideoById = indexUnique(parsed.takeVideos, ({ id }) => id, 'takeVideos', issues);

  const [documentContentHash, expectedProjectionHash] = await Promise.all([
    hashPracticeDocumentContent(parsed.document),
    hashExpectedEvents(parsed.document),
  ]);
  pushHash(
    parsed.document.revision.contentHash,
    documentContentHash,
    '#/document/revision/contentHash',
    issues,
  );
  pushHash(
    parsed.document.expectedProjectionHash,
    expectedProjectionHash,
    '#/document/expectedProjectionHash',
    issues,
  );

  const evidenceHashes = new Map<string, PracticeQualifiedHash>();
  await Promise.all(
    parsed.evidenceSnapshots.map(async (snapshot, index) => {
      const computed = await hashObservedEvidenceSnapshot(snapshot);
      evidenceHashes.set(snapshot.id, computed);
      void index;
    }),
  );

  const takeHashes = new Map<string, PracticeQualifiedHash>();
  await Promise.all(
    parsed.takes.map(async (take, index) => {
      const path = `#/takes/${String(index)}`;
      const computed = await hashPracticeTakeCore(take);
      takeHashes.set(take.id, computed);
      pushHash(take.takeCoreHash, computed, `${path}/takeCoreHash`, issues);
      pushBinding(
        revisionsEqual(take.documentRevision, parsed.document.revision),
        `${path}/documentRevision`,
        'Take must bind the exact practiced document revision.',
        issues,
      );
      pushBinding(
        hashesEqual(take.expectedProjectionHash, parsed.document.expectedProjectionHash),
        `${path}/expectedProjectionHash`,
        'Take must bind the practiced document expected-event projection.',
        issues,
      );
      if (take.range.endTickExclusive > parsed.document.durationTicks) {
        issues.push({
          code: 'range-outside-document',
          message: 'Take range must lie within the practiced document duration.',
          path: `${path}/range/endTickExclusive`,
        });
      }
      const snapshot = evidenceById.get(take.evidenceSnapshotId);
      if (snapshot === undefined) {
        issues.push({
          code: 'missing-reference',
          message: 'Take evidence snapshot is absent from the aggregate graph.',
          path: `${path}/evidenceSnapshotId`,
        });
      } else {
        const computedEvidenceHash = evidenceHashes.get(snapshot.id);
        pushBinding(
          computedEvidenceHash !== undefined &&
            hashesEqual(take.evidenceSnapshotHash, computedEvidenceHash),
          `${path}/evidenceSnapshotHash`,
          'Take evidence hash must identify its bound immutable snapshot.',
          issues,
        );
      }
      if (take.microphoneMediaId !== null) {
        const media = mediaById.get(take.microphoneMediaId);
        pushBinding(
          media?.mediaKind === 'microphone-audio' &&
            take.microphoneMediaHash !== null &&
            hashesEqual(take.microphoneMediaHash, media.contentHash) &&
            (take.microphoneRecordingProvenance === null ||
              hashesEqual(
                take.microphoneRecordingProvenance.formatMetadataHash,
                media.formatMetadataHash,
              )),
          `${path}/microphoneMediaId`,
          'Take microphone media must bind matching microphone-audio content and format identities.',
          issues,
        );
      }
      if (take.takeVideoCaptureProvenance !== null) {
        const media = mediaById.get(take.takeVideoCaptureProvenance.mediaId);
        pushBinding(
          media?.mediaKind === 'take-video' &&
            hashesEqual(take.takeVideoCaptureProvenance.contentHash, media.contentHash) &&
            hashesEqual(
              take.takeVideoCaptureProvenance.formatMetadataHash,
              media.formatMetadataHash,
            ),
          `${path}/takeVideoCaptureProvenance/mediaId`,
          'Take video provenance must bind matching take-video content and format identities.',
          issues,
        );
        const matchingTakeVideo = parsed.takeVideos.some(
          (video) =>
            video.takeId === take.id &&
            video.videoMediaId === take.takeVideoCaptureProvenance?.mediaId &&
            hashesEqual(video.videoContentHash, take.takeVideoCaptureProvenance.contentHash),
        );
        pushBinding(
          matchingTakeVideo,
          `${path}/takeVideoCaptureProvenance`,
          'Embedded take-video provenance must have one congruent immutable TakeVideo aggregate.',
          issues,
        );
      }
    }),
  );

  await Promise.all(
    parsed.referenceMaps.map(async (map, index) => {
      const path = `#/referenceMaps/${String(index)}`;
      pushHash(map.mapHash, await hashReferenceScoreMediaSyncMap(map), `${path}/mapHash`, issues);
      pushBinding(
        revisionsEqual(map.documentRevision, parsed.document.revision) &&
          hashesEqual(map.expectedProjectionHash, parsed.document.expectedProjectionHash),
        `${path}/documentRevision`,
        'Reference map must bind the exact document revision and expected timeline.',
        issues,
      );
      if (map.anchors.some(({ scoreTick }) => scoreTick > parsed.document.durationTicks)) {
        issues.push({
          code: 'range-outside-document',
          message: 'Reference-map anchors cannot exceed document duration.',
          path: `${path}/anchors`,
        });
      }
      const media = mediaById.get(map.mediaId);
      pushBinding(
        media?.mediaKind === 'reference-video' &&
          hashesEqual(map.mediaContentHash, media.contentHash),
        `${path}/mediaId`,
        'Reference map must bind a matching reference-video identity.',
        issues,
      );
      if (map.parentMap !== null) {
        const parent = referenceMapById.get(map.parentMap.id);
        if (parent === undefined) {
          issues.push({
            code: 'missing-reference',
            message: 'Reference-map parent is absent from the aggregate graph.',
            path: `${path}/parentMap/id`,
          });
        } else {
          pushBinding(
            hashesEqual(map.parentMap.mapHash, parent.mapHash) &&
              map.historySequence === parent.historySequence + 1,
            `${path}/parentMap`,
            'Reference-map history must bind the exact parent and advance one sequence.',
            issues,
          );
        }
      }
    }),
  );

  await Promise.all(
    parsed.takeMaps.map(async (map, index) => {
      const path = `#/takeMaps/${String(index)}`;
      pushHash(map.mapHash, await hashTakeCaptureMediaSyncMap(map), `${path}/mapHash`, issues);
      const take = takeById.get(map.takeId);
      const computedTakeHash = takeHashes.get(map.takeId);
      pushBinding(
        take !== undefined &&
          computedTakeHash !== undefined &&
          hashesEqual(map.takeCoreHash, computedTakeHash),
        `${path}/takeId`,
        'Take media map must bind its exact immutable take core.',
        issues,
      );
      const media = mediaById.get(map.videoMediaId);
      pushBinding(
        media?.mediaKind === 'take-video' && hashesEqual(map.videoContentHash, media.contentHash),
        `${path}/videoMediaId`,
        'Take media map must bind a matching take-video identity.',
        issues,
      );
      if (take !== undefined) {
        const validation = validateTakeMapAgainstCaptureEpochs(map, take);
        if (validation.kind === 'invalid') {
          issues.push({
            code: 'sync-map-invalid',
            message: validation.issues.map(({ code }) => code).join(', '),
            path: `${path}/anchors`,
          });
        }
      }
    }),
  );

  const expectedIdentities = expectedIdentityIndex(parsed.document);
  await Promise.all(
    parsed.assessments.map(async (assessment, index) => {
      const path = `#/assessments/${String(index)}`;
      pushHash(
        assessment.assessmentHash,
        await hashPracticeAssessment(assessment),
        `${path}/assessmentHash`,
        issues,
      );
      const take = takeById.get(assessment.takeId);
      const takeHash = takeHashes.get(assessment.takeId);
      pushBinding(
        take !== undefined &&
          takeHash !== undefined &&
          hashesEqual(assessment.takeCoreHash, takeHash),
        `${path}/takeId`,
        'Assessment must bind its exact immutable take core.',
        issues,
      );
      const evidence = evidenceById.get(assessment.evidenceSnapshotId);
      const evidenceHash = evidenceHashes.get(assessment.evidenceSnapshotId);
      const takeEvidenceMatches =
        take === undefined
          ? false
          : take.evidenceSnapshotId === assessment.evidenceSnapshotId &&
            hashesEqual(take.evidenceSnapshotHash, assessment.evidenceSnapshotHash);
      pushBinding(
        evidence !== undefined &&
          evidenceHash !== undefined &&
          hashesEqual(assessment.evidenceSnapshotHash, evidenceHash) &&
          takeEvidenceMatches,
        `${path}/evidenceSnapshotId`,
        'Assessment must bind the exact immutable evidence snapshot already bound by its take.',
        issues,
      );
      pushBinding(
        revisionsEqual(assessment.documentRevision, parsed.document.revision) &&
          hashesEqual(assessment.expectedProjectionHash, parsed.document.expectedProjectionHash),
        `${path}/documentRevision`,
        'Assessment must bind the assessed document revision and expected projection.',
        issues,
      );
      if (assessment.correctionProvenance !== null && evidence !== undefined) {
        pushBinding(
          assessment.correctionProvenance.correctionCount === evidence.correctionCount &&
            hashesEqual(
              assessment.correctionProvenance.correctionPrefixHash,
              evidence.correctionPrefixHash,
            ),
          `${path}/correctionProvenance`,
          'Assessment correction provenance must match the immutable evidence cutoff.',
          issues,
        );
      }
      if (assessment.alignment !== null) {
        pushHash(
          assessment.alignmentProvenanceHash,
          await hashAssessmentAlignmentProvenance(assessment.alignment),
          `${path}/alignmentProvenanceHash`,
          issues,
        );
      }
      if (assessment.records.mode === 'complete') {
        const expectedRecords = [
          ...assessment.records.matches.map(({ expected, timing }) => ({ expected, timing })),
          ...assessment.records.unmatchedExpected.map(({ expected }) => ({
            expected,
            timing: null,
          })),
          ...assessment.records.ambiguous.flatMap(({ candidates }) =>
            candidates.map(({ expected, timing }) => ({ expected, timing })),
          ),
        ];
        const finalLogicalFrame = take?.captureEpochs.at(-1)?.endLogicalFrameExclusive;
        expectedRecords.forEach(({ expected, timing }, expectedIndex) => {
          const tick = expectedIdentityTick(expectedIdentities, expected.eventId, expected.noteId);
          if (tick === undefined) {
            issues.push({
              code: 'missing-reference',
              message: 'Assessment expected identity is absent from the bound expected projection.',
              path: `${path}/records/expected/${String(expectedIndex)}`,
            });
          }
          if (timing !== null && tick !== undefined && timing.expectedTick !== tick) {
            issues.push({
              code: 'expected-timing-mismatch',
              message: 'Assessment expected timing must equal the bound expected-event tick.',
              path: `${path}/records/expected/${String(expectedIndex)}/timing/expectedTick`,
            });
          }
          if (
            timing !== null &&
            finalLogicalFrame !== null &&
            finalLogicalFrame !== undefined &&
            timing.observedLogicalFrame >= finalLogicalFrame
          ) {
            issues.push({
              code: 'range-outside-take',
              message: 'Assessment observed timing must lie inside the take logical-frame span.',
              path: `${path}/records/expected/${String(expectedIndex)}/timing/observedLogicalFrame`,
            });
          }
        });
        // ObservedEvidenceSnapshot v1 intentionally retains counts and qualified source hashes,
        // not the event-ID collection itself. Cross-checking observed IDs would invent evidence;
        // membership must be enforced by a future resolver over the bound immutable projection.
      }
    }),
  );

  parsed.mediaAvailability.forEach(({ mediaId }, index) => {
    if (!mediaById.has(mediaId)) {
      issues.push({
        code: 'missing-reference',
        message: 'Media availability state must reference an immutable media identity.',
        path: `#/mediaAvailability/${String(index)}/mediaId`,
      });
    }
  });

  parsed.referenceVideos.forEach((video, index) => {
    const map = referenceMapById.get(video.syncMapId);
    const media = mediaById.get(video.mediaId);
    pushBinding(
      map !== undefined &&
        hashesEqual(video.syncMapHash, map.mapHash) &&
        revisionsEqual(video.documentRevision, map.documentRevision) &&
        video.mediaId === map.mediaId &&
        hashesEqual(video.mediaContentHash, map.mediaContentHash),
      `#/referenceVideos/${String(index)}/syncMapId`,
      'Reference video must bind its exact revision-bound sync map.',
      issues,
    );
    pushBinding(
      media?.mediaKind === 'reference-video' &&
        hashesEqual(video.mediaContentHash, media.contentHash),
      `#/referenceVideos/${String(index)}/mediaId`,
      'Reference video must bind its matching media identity.',
      issues,
    );
  });

  parsed.takeVideos.forEach((video, index) => {
    const take = takeById.get(video.takeId);
    const takeHash = takeHashes.get(video.takeId);
    const media = mediaById.get(video.videoMediaId);
    pushBinding(
      takeHash !== undefined && hashesEqual(video.takeCoreHash, takeHash),
      `#/takeVideos/${String(index)}/takeId`,
      'Take video must bind its exact immutable take core.',
      issues,
    );
    pushBinding(
      media?.mediaKind === 'take-video' && hashesEqual(video.videoContentHash, media.contentHash),
      `#/takeVideos/${String(index)}/videoMediaId`,
      'Take video must bind its matching media identity.',
      issues,
    );
    const embeddedVideoMatches =
      take === undefined
        ? false
        : take.takeVideoCaptureProvenance === null ||
          (take.takeVideoCaptureProvenance.mediaId === video.videoMediaId &&
            hashesEqual(take.takeVideoCaptureProvenance.contentHash, video.videoContentHash));
    pushBinding(
      embeddedVideoMatches,
      `#/takeVideos/${String(index)}/videoMediaId`,
      'TakeVideo must agree with the embedded video provenance of its immutable take.',
      issues,
    );
  });

  parsed.takeVideoAttachments.forEach((attachment, index) => {
    const takeVideo = takeVideoById.get(attachment.takeVideoId);
    if (takeVideo === undefined) {
      issues.push({
        code: 'missing-reference',
        message: 'Take-video attachment must reference an immutable TakeVideo.',
        path: `#/takeVideoAttachments/${String(index)}/takeVideoId`,
      });
    }
    if (attachment.selectedMapId !== null) {
      const map = takeMapById.get(attachment.selectedMapId);
      pushBinding(
        map !== undefined &&
          takeVideo !== undefined &&
          attachment.selectedMapHash !== null &&
          hashesEqual(attachment.selectedMapHash, map.mapHash) &&
          map.takeId === takeVideo.takeId &&
          map.videoMediaId === takeVideo.videoMediaId,
        `#/takeVideoAttachments/${String(index)}/selectedMapId`,
        'Take-video attachment must select an exact immutable take-media map.',
        issues,
      );
    }
  });

  return issues.length === 0
    ? { graph: parsed, kind: 'valid' }
    : { issues: Object.freeze(issues), kind: 'invalid' };
}
