import { describe, expect, it } from 'vitest';

import type { QualifiedHash } from './contracts/practice';
import { hashReferenceScoreMediaSyncMap } from './practice-identity';
import {
  compileReferenceSyncMap,
  detectReferenceMapStaleness,
  detectTakeMapStaleness,
  mapReferenceMediaToTick,
  mapReferenceTickToMedia,
  mapTakeLogicalFrameToMedia,
  mapTakeMediaToLogicalFrame,
  reauthorReferenceSyncMap,
  rebaseReferenceSyncMap,
  roundRationalTiesToEven,
  validateTakeMapAgainstCaptureEpochs,
} from './practice-sync';

const hash = (schemaId: string, projectionId: string, fill = 'a'): QualifiedHash => ({
  algorithm: 'sha256',
  canonicalizationId: 'stringsight-canonical-json',
  canonicalizationVersion: 1,
  digestHex: fill.repeat(64),
  projectionId,
  projectionVersion: 1,
  schemaId,
  schemaVersion: 1,
});

const documentContentHash = (fill = 'a') =>
  hash('practice-document', 'practice-document-content', fill);
const expectedHash = () => hash('practice-document', 'practice-expected-events');
const takeCoreHash = (fill = 'a') => hash('practice-take', 'practice-take-core', fill);
const referenceMapHash = (fill = 'a') =>
  hash('reference-score-media-sync-map', 'reference-score-media-sync-map', fill);
const takeMapHash = () => hash('take-capture-media-sync-map', 'take-capture-media-sync-map');
const evidenceHash = () => hash('observed-evidence-snapshot', 'observed-evidence-snapshot');

const revision = (revisionId = 'revision-1', fill = 'a') => ({
  contentHash: documentContentHash(fill),
  documentId: 'document-1',
  revisionId,
  revisionNumber: revisionId === 'revision-1' ? 1 : 2,
});

const referenceMap = () => ({
  anchors: [
    { mediaPtsMicroseconds: 0, scoreTick: 0 },
    { mediaPtsMicroseconds: 6, scoreTick: 4 },
    { mediaPtsMicroseconds: 14, scoreTick: 8 },
  ],
  boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped',
  contractVersion: 1,
  documentRevision: revision(),
  expectedProjectionHash: expectedHash(),
  gapSegmentIndices: [] as number[],
  historySequence: 0,
  id: 'reference-map-1',
  mapHash: referenceMapHash(),
  mediaContentHash: hash('media-asset', 'media-content'),
  mediaId: 'reference-media-1',
  normalizedTimelineId: 'reference-timeline-1',
  parentMap: null,
  provenance: 'authored',
});

const takeMap = () => ({
  anchors: [
    {
      captureGeneration: 1,
      captureEpochId: 'epoch-1',
      logicalAudioFrame: 0,
      mediaPtsMicroseconds: 0,
      runtimeGeneration: 1,
      transportGeneration: 1,
    },
    {
      captureGeneration: 1,
      captureEpochId: 'epoch-1',
      logicalAudioFrame: 100,
      mediaPtsMicroseconds: 1_000,
      runtimeGeneration: 1,
      transportGeneration: 1,
    },
    {
      captureGeneration: 2,
      captureEpochId: 'epoch-2',
      logicalAudioFrame: 200,
      mediaPtsMicroseconds: 2_000,
      runtimeGeneration: 2,
      transportGeneration: 2,
    },
    {
      captureGeneration: 2,
      captureEpochId: 'epoch-2',
      logicalAudioFrame: 300,
      mediaPtsMicroseconds: 3_000,
      runtimeGeneration: 2,
      transportGeneration: 2,
    },
  ],
  boundaryPolicy: 'generation-segments-only',
  captureEpochIds: ['epoch-1', 'epoch-2'],
  contractVersion: 1,
  id: 'take-map-1',
  mapHash: takeMapHash(),
  takeCoreHash: takeCoreHash(),
  takeId: 'take-1',
  timestampStrategyId: 'video-frame-callback',
  uncertaintyMicroseconds: 2_000,
  videoContentHash: hash('media-asset', 'media-content'),
  videoMediaId: 'take-video-1',
});

const take = () => ({
  captureEpochs: [
    {
      appliedAudioFrame: 10,
      captureGeneration: 1,
      endLogicalFrameExclusive: 200,
      id: 'epoch-1',
      runtimeGeneration: 1,
      scheduledAudioFrame: 8,
      scoreStartTick: 0,
      startLogicalFrame: 0,
      transportGeneration: 1,
    },
    {
      appliedAudioFrame: 210,
      captureGeneration: 2,
      endLogicalFrameExclusive: 301,
      id: 'epoch-2',
      runtimeGeneration: 2,
      scheduledAudioFrame: 208,
      scoreStartTick: 480,
      startLogicalFrame: 200,
      transportGeneration: 2,
    },
  ],
  contractVersion: 1,
  countInConfigurationHash: null,
  createdAt: '2026-07-20T12:00:00Z',
  documentRevision: revision(),
  evidenceSnapshotHash: evidenceHash(),
  evidenceSnapshotId: 'snapshot-1',
  expectedProjectionHash: expectedHash(),
  id: 'take-1',
  loopPassPolicy: { kind: 'single-pass' },
  metronomeEnabled: false,
  microphoneMediaHash: null,
  microphoneMediaId: null,
  practiceSpeed: { denominator: 1, numerator: 1 },
  range: { endTickExclusive: 960, startTick: 0 },
  referenceConfigurationHash: null,
  sampleRate: 48_000,
  status: 'finalized',
  takeCoreHash: takeCoreHash(),
  warnings: [],
});

describe('reference score/media piecewise mapping', () => {
  it('interpolates deterministically with ties-to-even and stable boundary ownership', () => {
    const compiled = compileReferenceSyncMap(referenceMap());
    expect(mapReferenceTickToMedia(compiled, 1)).toMatchObject({
      kind: 'mapped',
      mediaPtsMicroseconds: 2,
      segmentIndex: 0,
    });
    expect(mapReferenceTickToMedia(compiled, 3)).toMatchObject({
      kind: 'mapped',
      mediaPtsMicroseconds: 4,
      segmentIndex: 0,
    });
    expect(mapReferenceTickToMedia(compiled, 4)).toMatchObject({
      exactAnchor: true,
      kind: 'mapped',
      segmentIndex: 1,
    });
    expect(mapReferenceTickToMedia(compiled, 8)).toMatchObject({
      exactAnchor: true,
      kind: 'mapped',
      segmentIndex: 1,
    });
  });

  it('returns an exact rational inverse and ties-to-even integer selection', () => {
    const result = mapReferenceMediaToTick(compileReferenceSyncMap(referenceMap()), 3);
    expect(result).toEqual({
      clampedPreview: false,
      exactAnchor: false,
      kind: 'mapped',
      roundedScoreTick: 2,
      scoreTick: { denominator: 1n, numerator: 2n },
      segmentIndex: 0,
    });
    expect(roundRationalTiesToEven(1n, 2n)).toBe(0n);
    expect(roundRationalTiesToEven(3n, 2n)).toBe(2n);
    expect(roundRationalTiesToEven(5n, 2n)).toBe(2n);
  });

  it('never interpolates across explicit gaps while keeping both anchors exact', () => {
    const input = referenceMap();
    input.gapSegmentIndices = [1];
    const compiled = compileReferenceSyncMap(input);
    expect(mapReferenceTickToMedia(compiled, 6)).toEqual({
      kind: 'unmapped',
      reason: 'explicit-gap',
      segmentIndex: 1,
    });
    expect(mapReferenceMediaToTick(compiled, 10)).toEqual({
      kind: 'unmapped',
      reason: 'explicit-gap',
      segmentIndex: 1,
    });
    expect(mapReferenceTickToMedia(compiled, 4)).toMatchObject({ exactAnchor: true });
    expect(mapReferenceTickToMedia(compiled, 8)).toMatchObject({ exactAnchor: true });
  });

  it('reports domain misses and labels preview-only clamps', () => {
    const compiled = compileReferenceSyncMap(referenceMap());
    expect(mapReferenceTickToMedia(compiled, 9)).toEqual({
      kind: 'unmapped',
      reason: 'after-domain',
      segmentIndex: null,
    });
    expect(mapReferenceMediaToTick(compiled, 15)).toEqual({
      kind: 'unmapped',
      reason: 'after-domain',
      segmentIndex: null,
    });
    expect(mapReferenceTickToMedia(compiled, 9, 'clamp-preview')).toMatchObject({
      clampedPreview: true,
      kind: 'mapped',
      mediaPtsMicroseconds: 14,
    });
  });

  it('rejects invalid maps, gaps, and lookup coordinates at trust boundaries', () => {
    const reversed = referenceMap();
    reversed.anchors[1] = { mediaPtsMicroseconds: 0, scoreTick: 4 };
    expect(() => compileReferenceSyncMap(reversed)).toThrow();
    const inverseAmbiguous = referenceMap();
    inverseAmbiguous.anchors[1] = { mediaPtsMicroseconds: 1, scoreTick: 4 };
    expect(() => compileReferenceSyncMap(inverseAmbiguous)).toThrow(/integer-invertible/);
    const duplicateGaps = referenceMap();
    duplicateGaps.gapSegmentIndices = [1, 1];
    expect(() => compileReferenceSyncMap(duplicateGaps)).toThrow();
    const unadvancedHistory = {
      ...referenceMap(),
      parentMap: { id: 'parent-map', mapHash: referenceMapHash('b') },
      provenance: 'rebased',
    };
    expect(() => compileReferenceSyncMap(unadvancedHistory)).toThrow(/advance history/);
    expect(() => mapReferenceTickToMedia(compileReferenceSyncMap(referenceMap()), 0.5)).toThrow(
      RangeError,
    );
  });

  it('deeply freezes the detached compiled map after validation', () => {
    const input = referenceMap();
    const compiled = compileReferenceSyncMap(input);
    expect(Object.isFrozen(compiled.map)).toBe(true);
    expect(Object.isFrozen(compiled.map.anchors)).toBe(true);
    expect(Object.isFrozen(compiled.map.anchors[0])).toBe(true);
    expect(Object.isFrozen(compiled.map.gapSegmentIndices)).toBe(true);
    input.gapSegmentIndices.push(0);
    expect(mapReferenceTickToMedia(compiled, 2)).toMatchObject({ kind: 'mapped' });
    expect(() => compiled.map.gapSegmentIndices.push(0)).toThrow(TypeError);
  });
});

describe('reference map source identity and immutable revision operations', () => {
  it('reports every stale revision/media field in deterministic order', () => {
    const current = referenceMap();
    expect(
      detectReferenceMapStaleness(current, {
        documentContentHash: current.documentRevision.contentHash,
        documentId: current.documentRevision.documentId,
        expectedProjectionHash: current.expectedProjectionHash,
        mediaContentHash: current.mediaContentHash,
        mediaId: current.mediaId,
        normalizedTimelineId: current.normalizedTimelineId,
        revisionId: current.documentRevision.revisionId,
        revisionNumber: current.documentRevision.revisionNumber,
      }),
    ).toEqual({ kind: 'current' });
    expect(
      detectReferenceMapStaleness(current, {
        documentContentHash: documentContentHash('b'),
        documentId: 'other-document',
        expectedProjectionHash: hash('practice-document', 'practice-expected-events', 'b'),
        mediaContentHash: hash('media-asset', 'media-content', 'b'),
        mediaId: 'other-media',
        normalizedTimelineId: 'other-timeline',
        revisionId: 'other-revision',
        revisionNumber: 99,
      }),
    ).toEqual({
      kind: 'stale',
      mismatches: [
        'document-id',
        'revision-id',
        'revision-number',
        'document-content-hash',
        'expected-projection-hash',
        'media-id',
        'media-content-hash',
        'normalized-timeline-id',
      ],
    });
  });

  it('rebases to a new revision/hash and appends immutable history without mutating source', async () => {
    const input = referenceMap();
    input.gapSegmentIndices = [1];
    input.mapHash = await hashReferenceScoreMediaSyncMap(input);
    const source = compileReferenceSyncMap(input);
    const rebased = await rebaseReferenceSyncMap(source, {
      anchors: [
        { mediaPtsMicroseconds: 0, scoreTick: 0 },
        { mediaPtsMicroseconds: 10, scoreTick: 5 },
        { mediaPtsMicroseconds: 18, scoreTick: 9 },
      ],
      documentRevision: revision('revision-2', 'b'),
      expectedProjectionHash: hash('practice-document', 'practice-expected-events', 'b'),
      gapSegmentIndices: [0],
      id: 'reference-map-2',
    });
    expect(source.map.provenance).toBe('authored');
    expect(source.map.id).toBe('reference-map-1');
    expect(rebased.map).toMatchObject({ id: 'reference-map-2', provenance: 'rebased' });
    expect(rebased.map.mapHash.digestHex).not.toBe(source.map.mapHash.digestHex);
    expect(rebased.map.gapSegmentIndices).toEqual([0]);
    expect(rebased.map.historySequence).toBe(1);
    expect(rebased.map.parentMap).toEqual({
      id: 'reference-map-1',
      mapHash: source.map.mapHash,
    });
  });

  it('re-authors against explicit new score/media sources and rejects ID reuse', async () => {
    const input = referenceMap();
    input.mapHash = await hashReferenceScoreMediaSyncMap(input);
    const source = compileReferenceSyncMap(input);
    await expect(
      reauthorReferenceSyncMap(source, {
        anchors: source.map.anchors,
        documentRevision: revision('revision-2', 'b'),
        expectedProjectionHash: hash('practice-document', 'practice-expected-events', 'b'),
        gapSegmentIndices: [],
        id: source.map.id,
      }),
    ).rejects.toThrow(/new map ID/);
    const reauthored = await reauthorReferenceSyncMap(source, {
      anchors: [
        { mediaPtsMicroseconds: 100, scoreTick: 0 },
        { mediaPtsMicroseconds: 1_100, scoreTick: 10 },
      ],
      documentRevision: revision('revision-2', 'b'),
      expectedProjectionHash: hash('practice-document', 'practice-expected-events', 'b'),
      gapSegmentIndices: [],
      id: 'reference-map-3',
      mediaContentHash: hash('media-asset', 'media-content', 'c'),
      mediaId: 'replacement-media',
      normalizedTimelineId: 'replacement-timeline',
    });
    expect(reauthored.map).toMatchObject({
      id: 'reference-map-3',
      mediaId: 'replacement-media',
      normalizedTimelineId: 'replacement-timeline',
      provenance: 're-authored',
    });
    expect(reauthored.map.historySequence).toBe(1);
    expect(reauthored.map.parentMap?.id).toBe(source.map.id);
  });

  it('rejects revision history when the parent self-hash is not canonical', async () => {
    const source = compileReferenceSyncMap(referenceMap());
    await expect(
      rebaseReferenceSyncMap(source, {
        anchors: source.map.anchors,
        documentRevision: source.map.documentRevision,
        expectedProjectionHash: source.map.expectedProjectionHash,
        gapSegmentIndices: [],
        id: 'reference-map-with-unverified-parent',
      }),
    ).rejects.toThrow(/canonically verified parent/);
  });
});

describe('take capture/media piecewise mapping', () => {
  it('maps within one generation and returns rational inverse provenance', () => {
    expect(mapTakeLogicalFrameToMedia(takeMap(), 50)).toMatchObject({
      captureGeneration: 1,
      kind: 'mapped',
      mediaPtsMicroseconds: 500,
      uncertaintyMicroseconds: 2_000,
    });
    expect(mapTakeMediaToLogicalFrame(takeMap(), 500)).toMatchObject({
      captureGeneration: 1,
      kind: 'mapped',
      logicalAudioFrame: { denominator: 1n, numerator: 50n },
      roundedLogicalAudioFrame: 50,
    });
  });

  it('never interpolates across generations and assigns exact anchors to their generation', () => {
    expect(mapTakeLogicalFrameToMedia(takeMap(), 150)).toEqual({
      kind: 'unmapped',
      reason: 'generation-discontinuity',
      segmentIndex: 1,
    });
    expect(mapTakeMediaToLogicalFrame(takeMap(), 1_500)).toEqual({
      kind: 'unmapped',
      reason: 'generation-discontinuity',
      segmentIndex: 1,
    });
    expect(mapTakeLogicalFrameToMedia(takeMap(), 100)).toMatchObject({
      captureGeneration: 1,
      exactAnchor: true,
    });
    expect(mapTakeLogicalFrameToMedia(takeMap(), 200)).toMatchObject({
      captureGeneration: 2,
      exactAnchor: true,
    });
  });

  it('never interpolates across capture epochs when generation tuples repeat', () => {
    const map = takeMap();
    const third = map.anchors[2];
    const fourth = map.anchors[3];
    if (third === undefined || fourth === undefined) throw new Error('Fixture epochs are missing.');
    for (const anchor of [third, fourth]) {
      anchor.captureGeneration = 1;
      anchor.runtimeGeneration = 1;
      anchor.transportGeneration = 1;
    }
    expect(mapTakeLogicalFrameToMedia(map, 150)).toEqual({
      kind: 'unmapped',
      reason: 'generation-discontinuity',
      segmentIndex: 1,
    });
    expect(mapTakeMediaToLogicalFrame(map, 1_500)).toEqual({
      kind: 'unmapped',
      reason: 'generation-discontinuity',
      segmentIndex: 1,
    });
  });

  it('detects stale take/video identity without treating it as corrupt', () => {
    const map = takeMap();
    expect(
      detectTakeMapStaleness(map, {
        takeCoreHash: map.takeCoreHash,
        takeId: map.takeId,
        videoContentHash: map.videoContentHash,
        videoMediaId: map.videoMediaId,
      }),
    ).toEqual({ kind: 'current' });
    expect(
      detectTakeMapStaleness(map, {
        takeCoreHash: takeCoreHash('b'),
        takeId: 'other-take',
        videoContentHash: hash('media-asset', 'media-content', 'b'),
        videoMediaId: 'other-video',
      }),
    ).toEqual({
      kind: 'stale',
      mismatches: ['take-id', 'take-core-hash', 'video-media-id', 'video-content-hash'],
    });
  });

  it('validates every anchor against take capture epochs and generation identities', () => {
    expect(validateTakeMapAgainstCaptureEpochs(takeMap(), take())).toEqual({ kind: 'valid' });
    const wrongGeneration = takeMap();
    const anchor = wrongGeneration.anchors[1];
    if (anchor === undefined) throw new Error('Fixture must contain a second anchor.');
    anchor.runtimeGeneration = 99;
    expect(validateTakeMapAgainstCaptureEpochs(wrongGeneration, take())).toEqual({
      issues: [
        {
          anchorIndex: 1,
          captureEpochId: null,
          code: 'anchor-outside-capture-epoch',
        },
      ],
      kind: 'invalid',
    });
    const wrongEpoch = takeMap();
    const wrongEpochAnchor = wrongEpoch.anchors[1];
    if (wrongEpochAnchor === undefined) throw new Error('Fixture must contain a second anchor.');
    wrongEpochAnchor.captureEpochId = 'epoch-2';
    expect(validateTakeMapAgainstCaptureEpochs(wrongEpoch, take())).toMatchObject({
      issues: [{ anchorIndex: 1, code: 'anchor-outside-capture-epoch' }],
      kind: 'invalid',
    });
    const missingDeclaration = takeMap();
    missingDeclaration.captureEpochIds = ['epoch-1'];
    expect(validateTakeMapAgainstCaptureEpochs(missingDeclaration, take())).toMatchObject({
      issues: [
        {
          anchorIndex: 2,
          captureEpochId: 'epoch-2',
          code: 'referenced-capture-epoch-not-declared',
        },
        {
          anchorIndex: 3,
          captureEpochId: 'epoch-2',
          code: 'referenced-capture-epoch-not-declared',
        },
      ],
      kind: 'invalid',
    });
    const extraDeclaration = takeMap();
    extraDeclaration.captureEpochIds = ['epoch-1', 'epoch-2', 'epoch-never-referenced'];
    expect(validateTakeMapAgainstCaptureEpochs(extraDeclaration, take())).toMatchObject({
      issues: [
        {
          anchorIndex: null,
          captureEpochId: 'epoch-never-referenced',
          code: 'declared-capture-epoch-not-referenced',
        },
      ],
      kind: 'invalid',
    });
  });

  it('rejects malformed take maps and invalid lookup coordinates', () => {
    const reversed = takeMap();
    const anchor = reversed.anchors[1];
    if (anchor === undefined) throw new Error('Fixture must contain a second anchor.');
    anchor.mediaPtsMicroseconds = 0;
    expect(() => mapTakeMediaToLogicalFrame(reversed, 0)).toThrow();
    expect(() => mapTakeLogicalFrameToMedia(takeMap(), -1)).toThrow(RangeError);
    const nonCanonicalEpochOrder = takeMap();
    nonCanonicalEpochOrder.captureEpochIds = ['epoch-2', 'epoch-1'];
    expect(() => mapTakeLogicalFrameToMedia(nonCanonicalEpochOrder, 0)).toThrow(/sorted/);
  });
});
