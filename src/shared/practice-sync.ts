import {
  PracticeTakeSchema,
  ReferenceScoreMediaSyncMapSchema,
  TakeCaptureMediaSyncMapSchema,
  type PracticeTake,
  type QualifiedHash,
  type ReferenceScoreMediaSyncMap,
  type TakeCaptureMediaSyncMap,
} from './contracts/practice';
import { hashReferenceScoreMediaSyncMap } from './practice-identity';

export type RationalValue = Readonly<{
  denominator: bigint;
  numerator: bigint;
}>;

export type OutsideDomainPolicy = 'clamp-preview' | 'unmapped';

export type SyncUnmappedReason =
  'after-domain' | 'before-domain' | 'explicit-gap' | 'generation-discontinuity';

export type SyncUnmappedResult = Readonly<{
  kind: 'unmapped';
  reason: SyncUnmappedReason;
  segmentIndex: number | null;
}>;

export type ReferenceForwardResult =
  | SyncUnmappedResult
  | Readonly<{
      clampedPreview: boolean;
      exactAnchor: boolean;
      kind: 'mapped';
      mediaPtsMicroseconds: number;
      segmentIndex: number;
    }>;

export type ReferenceInverseResult =
  | SyncUnmappedResult
  | Readonly<{
      clampedPreview: boolean;
      exactAnchor: boolean;
      kind: 'mapped';
      roundedScoreTick: number;
      scoreTick: RationalValue;
      segmentIndex: number;
    }>;

export type CompiledReferenceSyncMap = Readonly<{
  map: ReferenceScoreMediaSyncMap;
}>;

export type ReferenceSourceIdentity = Readonly<{
  documentContentHash: QualifiedHash;
  documentId: string;
  expectedProjectionHash: QualifiedHash;
  mediaContentHash: QualifiedHash;
  mediaId: string;
  normalizedTimelineId: string;
  revisionId: string;
  revisionNumber: number;
}>;

export type ReferenceStaleField =
  | 'document-content-hash'
  | 'document-id'
  | 'expected-projection-hash'
  | 'media-content-hash'
  | 'media-id'
  | 'normalized-timeline-id'
  | 'revision-id'
  | 'revision-number';

export type StalenessResult<Field extends string> =
  Readonly<{ kind: 'current' }> | Readonly<{ kind: 'stale'; mismatches: readonly Field[] }>;

type ReferenceRevisionRequest = Readonly<{
  anchors: readonly Readonly<{ mediaPtsMicroseconds: number; scoreTick: number }>[];
  documentRevision: unknown;
  expectedProjectionHash: QualifiedHash;
  gapSegmentIndices: readonly number[];
  id: string;
}>;

export type ReferenceReauthorRequest = ReferenceRevisionRequest &
  Readonly<{
    mediaContentHash?: QualifiedHash;
    mediaId?: string;
    normalizedTimelineId?: string;
  }>;

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value);
};

const assertLookupInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
};

const greatestCommonDivisor = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
};

const rational = (numerator: bigint, denominator: bigint): RationalValue => {
  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
};

export function roundRationalTiesToEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) {
    throw new RangeError(
      'Ties-to-even input must have a non-negative numerator and positive denominator.',
    );
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = remainder * 2n;
  if (doubled < denominator) return quotient;
  if (doubled > denominator) return quotient + 1n;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

const toSafeNumber = (value: bigint, label: string): number => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe integer range.`);
  }
  return Number(value);
};

const interpolateInteger = (
  input: number,
  inputStart: number,
  inputEnd: number,
  outputStart: number,
  outputEnd: number,
): number => {
  const numerator =
    BigInt(outputStart) * BigInt(inputEnd - inputStart) +
    BigInt(input - inputStart) * BigInt(outputEnd - outputStart);
  return toSafeNumber(
    roundRationalTiesToEven(numerator, BigInt(inputEnd - inputStart)),
    'Interpolated coordinate',
  );
};

const interpolateRational = (
  input: number,
  inputStart: number,
  inputEnd: number,
  outputStart: number,
  outputEnd: number,
): RationalValue =>
  rational(
    BigInt(outputStart) * BigInt(inputEnd - inputStart) +
      BigInt(input - inputStart) * BigInt(outputEnd - outputStart),
    BigInt(inputEnd - inputStart),
  );

const upperBound = <T>(
  values: readonly T[],
  target: number,
  coordinate: (value: T) => number,
): number => {
  let lower = 0;
  let upper = values.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    const value = values[middle];
    if (value !== undefined && coordinate(value) <= target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
};

export function compileReferenceSyncMap(input: unknown): CompiledReferenceSyncMap {
  const map = ReferenceScoreMediaSyncMapSchema.parse(input);
  if (map.provenance !== 'authored' && (map.parentMap === null || map.historySequence === 0)) {
    throw new RangeError(
      'A revised reference map must bind its immediate parent and advance history.',
    );
  }
  map.anchors.slice(0, -1).forEach((anchor, segmentIndex) => {
    const next = map.anchors[segmentIndex + 1];
    if (
      next !== undefined &&
      !map.gapSegmentIndices.includes(segmentIndex) &&
      next.mediaPtsMicroseconds - anchor.mediaPtsMicroseconds < next.scoreTick - anchor.scoreTick
    ) {
      throw new RangeError(
        'Mapped reference segments must be strictly integer-invertible over score ticks.',
      );
    }
  });
  return Object.freeze({ map: deepFreeze(map) });
}

const isGap = (map: CompiledReferenceSyncMap, segmentIndex: number): boolean =>
  map.map.gapSegmentIndices.includes(segmentIndex);

const outsideReferenceForward = (
  map: CompiledReferenceSyncMap,
  reason: 'after-domain' | 'before-domain',
  policy: OutsideDomainPolicy,
): ReferenceForwardResult => {
  if (policy === 'unmapped') return { kind: 'unmapped', reason, segmentIndex: null };
  const anchorIndex = reason === 'before-domain' ? 0 : map.map.anchors.length - 1;
  const anchor = map.map.anchors[anchorIndex];
  if (anchor === undefined) throw new Error('Validated reference map has no boundary anchor.');
  return {
    clampedPreview: true,
    exactAnchor: false,
    kind: 'mapped',
    mediaPtsMicroseconds: anchor.mediaPtsMicroseconds,
    segmentIndex: reason === 'before-domain' ? 0 : map.map.anchors.length - 2,
  };
};

export function mapReferenceTickToMedia(
  compiled: CompiledReferenceSyncMap,
  scoreTick: number,
  outsidePolicy: OutsideDomainPolicy = 'unmapped',
): ReferenceForwardResult {
  assertLookupInteger(scoreTick, 'scoreTick');
  const { anchors } = compiled.map;
  const insertion = upperBound(anchors, scoreTick, (anchor) => anchor.scoreTick);
  const lowerIndex = insertion - 1;
  const lower = anchors[lowerIndex];
  if (lower === undefined) return outsideReferenceForward(compiled, 'before-domain', outsidePolicy);
  if (lower.scoreTick === scoreTick) {
    return {
      clampedPreview: false,
      exactAnchor: true,
      kind: 'mapped',
      mediaPtsMicroseconds: lower.mediaPtsMicroseconds,
      segmentIndex: Math.min(lowerIndex, anchors.length - 2),
    };
  }
  const upper = anchors[insertion];
  if (upper === undefined) return outsideReferenceForward(compiled, 'after-domain', outsidePolicy);
  if (isGap(compiled, lowerIndex)) {
    return { kind: 'unmapped', reason: 'explicit-gap', segmentIndex: lowerIndex };
  }
  return {
    clampedPreview: false,
    exactAnchor: false,
    kind: 'mapped',
    mediaPtsMicroseconds: interpolateInteger(
      scoreTick,
      lower.scoreTick,
      upper.scoreTick,
      lower.mediaPtsMicroseconds,
      upper.mediaPtsMicroseconds,
    ),
    segmentIndex: lowerIndex,
  };
}

const outsideReferenceInverse = (
  map: CompiledReferenceSyncMap,
  reason: 'after-domain' | 'before-domain',
  policy: OutsideDomainPolicy,
): ReferenceInverseResult => {
  if (policy === 'unmapped') return { kind: 'unmapped', reason, segmentIndex: null };
  const anchorIndex = reason === 'before-domain' ? 0 : map.map.anchors.length - 1;
  const anchor = map.map.anchors[anchorIndex];
  if (anchor === undefined) throw new Error('Validated reference map has no boundary anchor.');
  return {
    clampedPreview: true,
    exactAnchor: false,
    kind: 'mapped',
    roundedScoreTick: anchor.scoreTick,
    scoreTick: rational(BigInt(anchor.scoreTick), 1n),
    segmentIndex: reason === 'before-domain' ? 0 : map.map.anchors.length - 2,
  };
};

export function mapReferenceMediaToTick(
  compiled: CompiledReferenceSyncMap,
  mediaPtsMicroseconds: number,
  outsidePolicy: OutsideDomainPolicy = 'unmapped',
): ReferenceInverseResult {
  assertLookupInteger(mediaPtsMicroseconds, 'mediaPtsMicroseconds');
  const { anchors } = compiled.map;
  const insertion = upperBound(
    anchors,
    mediaPtsMicroseconds,
    (anchor) => anchor.mediaPtsMicroseconds,
  );
  const lowerIndex = insertion - 1;
  const lower = anchors[lowerIndex];
  if (lower === undefined) return outsideReferenceInverse(compiled, 'before-domain', outsidePolicy);
  if (lower.mediaPtsMicroseconds === mediaPtsMicroseconds) {
    return {
      clampedPreview: false,
      exactAnchor: true,
      kind: 'mapped',
      roundedScoreTick: lower.scoreTick,
      scoreTick: rational(BigInt(lower.scoreTick), 1n),
      segmentIndex: Math.min(lowerIndex, anchors.length - 2),
    };
  }
  const upper = anchors[insertion];
  if (upper === undefined) return outsideReferenceInverse(compiled, 'after-domain', outsidePolicy);
  if (isGap(compiled, lowerIndex)) {
    return { kind: 'unmapped', reason: 'explicit-gap', segmentIndex: lowerIndex };
  }
  const scoreTick = interpolateRational(
    mediaPtsMicroseconds,
    lower.mediaPtsMicroseconds,
    upper.mediaPtsMicroseconds,
    lower.scoreTick,
    upper.scoreTick,
  );
  return {
    clampedPreview: false,
    exactAnchor: false,
    kind: 'mapped',
    roundedScoreTick: toSafeNumber(
      roundRationalTiesToEven(scoreTick.numerator, scoreTick.denominator),
      'Rounded score tick',
    ),
    scoreTick,
    segmentIndex: lowerIndex,
  };
}

const hashesEqual = (left: QualifiedHash, right: QualifiedHash): boolean =>
  left.digestHex === right.digestHex &&
  left.projectionId === right.projectionId &&
  left.projectionVersion === right.projectionVersion &&
  left.schemaId === right.schemaId &&
  left.schemaVersion === right.schemaVersion;

export function detectReferenceMapStaleness(
  input: unknown,
  source: ReferenceSourceIdentity,
): StalenessResult<ReferenceStaleField> {
  const map = ReferenceScoreMediaSyncMapSchema.parse(input);
  const mismatches: ReferenceStaleField[] = [];
  if (map.documentRevision.documentId !== source.documentId) mismatches.push('document-id');
  if (map.documentRevision.revisionId !== source.revisionId) mismatches.push('revision-id');
  if (map.documentRevision.revisionNumber !== source.revisionNumber)
    mismatches.push('revision-number');
  if (!hashesEqual(map.documentRevision.contentHash, source.documentContentHash))
    mismatches.push('document-content-hash');
  if (!hashesEqual(map.expectedProjectionHash, source.expectedProjectionHash))
    mismatches.push('expected-projection-hash');
  if (map.mediaId !== source.mediaId) mismatches.push('media-id');
  if (!hashesEqual(map.mediaContentHash, source.mediaContentHash))
    mismatches.push('media-content-hash');
  if (map.normalizedTimelineId !== source.normalizedTimelineId)
    mismatches.push('normalized-timeline-id');
  return mismatches.length === 0
    ? { kind: 'current' }
    : { kind: 'stale', mismatches: Object.freeze(mismatches) };
}

const reviseReferenceMap = async (
  source: CompiledReferenceSyncMap,
  request: ReferenceReauthorRequest,
  operation: 're-author' | 'rebase',
): Promise<CompiledReferenceSyncMap> => {
  if (request.id === source.map.id) throw new RangeError('A revised map must use a new map ID.');
  const computedParentHash = await hashReferenceScoreMediaSyncMap(source.map);
  if (!hashesEqual(source.map.mapHash, computedParentHash)) {
    throw new RangeError('A revised map must bind a canonically verified parent map hash.');
  }
  const draft = ReferenceScoreMediaSyncMapSchema.parse({
    anchors: request.anchors,
    boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped',
    contractVersion: 1,
    documentRevision: request.documentRevision,
    expectedProjectionHash: request.expectedProjectionHash,
    gapSegmentIndices: request.gapSegmentIndices,
    historySequence: source.map.historySequence + 1,
    id: request.id,
    mapHash: source.map.mapHash,
    mediaContentHash: request.mediaContentHash ?? source.map.mediaContentHash,
    mediaId: request.mediaId ?? source.map.mediaId,
    normalizedTimelineId: request.normalizedTimelineId ?? source.map.normalizedTimelineId,
    parentMap: { id: source.map.id, mapHash: source.map.mapHash },
    provenance: operation === 'rebase' ? 'rebased' : 're-authored',
  });
  const mapHash = await hashReferenceScoreMediaSyncMap(draft);
  const map = ReferenceScoreMediaSyncMapSchema.parse({ ...draft, mapHash });
  return compileReferenceSyncMap(map);
};

export function rebaseReferenceSyncMap(
  source: CompiledReferenceSyncMap,
  request: ReferenceRevisionRequest,
): Promise<CompiledReferenceSyncMap> {
  return reviseReferenceMap(source, request, 'rebase');
}

export function reauthorReferenceSyncMap(
  source: CompiledReferenceSyncMap,
  request: ReferenceReauthorRequest,
): Promise<CompiledReferenceSyncMap> {
  return reviseReferenceMap(source, request, 're-author');
}

export type TakeForwardResult =
  | SyncUnmappedResult
  | Readonly<{
      captureGeneration: number;
      captureEpochId: string;
      clampedPreview: boolean;
      exactAnchor: boolean;
      kind: 'mapped';
      mediaPtsMicroseconds: number;
      runtimeGeneration: number;
      segmentIndex: number;
      transportGeneration: number;
      uncertaintyMicroseconds: number;
    }>;

export type TakeInverseResult =
  | SyncUnmappedResult
  | Readonly<{
      captureGeneration: number;
      captureEpochId: string;
      clampedPreview: boolean;
      exactAnchor: boolean;
      kind: 'mapped';
      logicalAudioFrame: RationalValue;
      roundedLogicalAudioFrame: number;
      runtimeGeneration: number;
      segmentIndex: number;
      transportGeneration: number;
      uncertaintyMicroseconds: number;
    }>;

const generationsMatch = (
  left: TakeCaptureMediaSyncMap['anchors'][number],
  right: TakeCaptureMediaSyncMap['anchors'][number],
): boolean =>
  left.captureEpochId === right.captureEpochId &&
  left.captureGeneration === right.captureGeneration &&
  left.runtimeGeneration === right.runtimeGeneration &&
  left.transportGeneration === right.transportGeneration;

const assertTakeSegmentsIntegerInvertible = (map: TakeCaptureMediaSyncMap): void => {
  map.anchors.slice(0, -1).forEach((anchor, segmentIndex) => {
    const next = map.anchors[segmentIndex + 1];
    if (
      next !== undefined &&
      generationsMatch(anchor, next) &&
      next.mediaPtsMicroseconds - anchor.mediaPtsMicroseconds <
        next.logicalAudioFrame - anchor.logicalAudioFrame
    ) {
      throw new RangeError(
        'Same-generation take-map segments must be strictly integer-invertible over logical frames.',
      );
    }
  });
};

const takeMappedFields = (
  map: TakeCaptureMediaSyncMap,
  anchor: TakeCaptureMediaSyncMap['anchors'][number],
) => ({
  captureGeneration: anchor.captureGeneration,
  captureEpochId: anchor.captureEpochId,
  runtimeGeneration: anchor.runtimeGeneration,
  transportGeneration: anchor.transportGeneration,
  uncertaintyMicroseconds: map.uncertaintyMicroseconds,
});

export function mapTakeLogicalFrameToMedia(
  input: unknown,
  logicalAudioFrame: number,
): TakeForwardResult {
  assertLookupInteger(logicalAudioFrame, 'logicalAudioFrame');
  const map = TakeCaptureMediaSyncMapSchema.parse(input);
  assertTakeSegmentsIntegerInvertible(map);
  const insertion = upperBound(
    map.anchors,
    logicalAudioFrame,
    (anchor) => anchor.logicalAudioFrame,
  );
  const lowerIndex = insertion - 1;
  const lower = map.anchors[lowerIndex];
  if (lower === undefined) return { kind: 'unmapped', reason: 'before-domain', segmentIndex: null };
  if (lower.logicalAudioFrame === logicalAudioFrame) {
    return {
      ...takeMappedFields(map, lower),
      clampedPreview: false,
      exactAnchor: true,
      kind: 'mapped',
      mediaPtsMicroseconds: lower.mediaPtsMicroseconds,
      segmentIndex: Math.min(lowerIndex, map.anchors.length - 2),
    };
  }
  const upper = map.anchors[insertion];
  if (upper === undefined) return { kind: 'unmapped', reason: 'after-domain', segmentIndex: null };
  if (!generationsMatch(lower, upper)) {
    return { kind: 'unmapped', reason: 'generation-discontinuity', segmentIndex: lowerIndex };
  }
  return {
    ...takeMappedFields(map, lower),
    clampedPreview: false,
    exactAnchor: false,
    kind: 'mapped',
    mediaPtsMicroseconds: interpolateInteger(
      logicalAudioFrame,
      lower.logicalAudioFrame,
      upper.logicalAudioFrame,
      lower.mediaPtsMicroseconds,
      upper.mediaPtsMicroseconds,
    ),
    segmentIndex: lowerIndex,
  };
}

export function mapTakeMediaToLogicalFrame(
  input: unknown,
  mediaPtsMicroseconds: number,
): TakeInverseResult {
  assertLookupInteger(mediaPtsMicroseconds, 'mediaPtsMicroseconds');
  const map = TakeCaptureMediaSyncMapSchema.parse(input);
  assertTakeSegmentsIntegerInvertible(map);
  const insertion = upperBound(
    map.anchors,
    mediaPtsMicroseconds,
    (anchor) => anchor.mediaPtsMicroseconds,
  );
  const lowerIndex = insertion - 1;
  const lower = map.anchors[lowerIndex];
  if (lower === undefined) return { kind: 'unmapped', reason: 'before-domain', segmentIndex: null };
  if (lower.mediaPtsMicroseconds === mediaPtsMicroseconds) {
    return {
      ...takeMappedFields(map, lower),
      clampedPreview: false,
      exactAnchor: true,
      kind: 'mapped',
      logicalAudioFrame: rational(BigInt(lower.logicalAudioFrame), 1n),
      roundedLogicalAudioFrame: lower.logicalAudioFrame,
      segmentIndex: Math.min(lowerIndex, map.anchors.length - 2),
    };
  }
  const upper = map.anchors[insertion];
  if (upper === undefined) return { kind: 'unmapped', reason: 'after-domain', segmentIndex: null };
  if (!generationsMatch(lower, upper)) {
    return { kind: 'unmapped', reason: 'generation-discontinuity', segmentIndex: lowerIndex };
  }
  const frame = interpolateRational(
    mediaPtsMicroseconds,
    lower.mediaPtsMicroseconds,
    upper.mediaPtsMicroseconds,
    lower.logicalAudioFrame,
    upper.logicalAudioFrame,
  );
  return {
    ...takeMappedFields(map, lower),
    clampedPreview: false,
    exactAnchor: false,
    kind: 'mapped',
    logicalAudioFrame: frame,
    roundedLogicalAudioFrame: toSafeNumber(
      roundRationalTiesToEven(frame.numerator, frame.denominator),
      'Rounded logical audio frame',
    ),
    segmentIndex: lowerIndex,
  };
}

export type TakeMapStaleField =
  'take-core-hash' | 'take-id' | 'video-content-hash' | 'video-media-id';

export function detectTakeMapStaleness(
  input: unknown,
  source: Readonly<{
    takeCoreHash: QualifiedHash;
    takeId: string;
    videoContentHash: QualifiedHash;
    videoMediaId: string;
  }>,
): StalenessResult<TakeMapStaleField> {
  const map = TakeCaptureMediaSyncMapSchema.parse(input);
  const mismatches: TakeMapStaleField[] = [];
  if (map.takeId !== source.takeId) mismatches.push('take-id');
  if (!hashesEqual(map.takeCoreHash, source.takeCoreHash)) mismatches.push('take-core-hash');
  if (map.videoMediaId !== source.videoMediaId) mismatches.push('video-media-id');
  if (!hashesEqual(map.videoContentHash, source.videoContentHash))
    mismatches.push('video-content-hash');
  return mismatches.length === 0
    ? { kind: 'current' }
    : { kind: 'stale', mismatches: Object.freeze(mismatches) };
}

export type TakeEpochIssueCode =
  | 'anchor-outside-capture-epoch'
  | 'declared-capture-epoch-not-referenced'
  | 'duplicate-anchor-epoch-membership'
  | 'referenced-capture-epoch-not-declared'
  | 'take-core-hash-mismatch'
  | 'take-id-mismatch';

export type TakeEpochValidationResult =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{
      issues: readonly Readonly<{
        anchorIndex: number | null;
        captureEpochId: string | null;
        code: TakeEpochIssueCode;
      }>[];
      kind: 'invalid';
    }>;

const anchorMatchesEpoch = (
  anchor: TakeCaptureMediaSyncMap['anchors'][number],
  epoch: PracticeTake['captureEpochs'][number],
): boolean =>
  anchor.captureEpochId === epoch.id &&
  anchor.logicalAudioFrame >= epoch.startLogicalFrame &&
  (epoch.endLogicalFrameExclusive === null ||
    anchor.logicalAudioFrame < epoch.endLogicalFrameExclusive) &&
  anchor.captureGeneration === epoch.captureGeneration &&
  anchor.runtimeGeneration === epoch.runtimeGeneration &&
  anchor.transportGeneration === epoch.transportGeneration;

export function validateTakeMapAgainstCaptureEpochs(
  mapInput: unknown,
  takeInput: unknown,
): TakeEpochValidationResult {
  const map = TakeCaptureMediaSyncMapSchema.parse(mapInput);
  const take = PracticeTakeSchema.parse(takeInput);
  const issues: {
    anchorIndex: number | null;
    captureEpochId: string | null;
    code: TakeEpochIssueCode;
  }[] = [];
  if (map.takeId !== take.id)
    issues.push({ anchorIndex: null, captureEpochId: null, code: 'take-id-mismatch' });
  if (!hashesEqual(map.takeCoreHash, take.takeCoreHash))
    issues.push({ anchorIndex: null, captureEpochId: null, code: 'take-core-hash-mismatch' });
  const referencedEpochIds = new Set<string>();
  map.anchors.forEach((anchor, anchorIndex) => {
    const matches = take.captureEpochs.filter((epoch) => anchorMatchesEpoch(anchor, epoch));
    if (matches.length === 0)
      issues.push({ anchorIndex, captureEpochId: null, code: 'anchor-outside-capture-epoch' });
    if (matches.length > 1)
      issues.push({ anchorIndex, captureEpochId: null, code: 'duplicate-anchor-epoch-membership' });
    const epoch = matches[0];
    if (epoch !== undefined) {
      referencedEpochIds.add(epoch.id);
      if (!map.captureEpochIds.includes(epoch.id)) {
        issues.push({
          anchorIndex,
          captureEpochId: epoch.id,
          code: 'referenced-capture-epoch-not-declared',
        });
      }
    }
  });
  map.captureEpochIds.forEach((epochId) => {
    if (!referencedEpochIds.has(epochId)) {
      issues.push({
        anchorIndex: null,
        captureEpochId: epochId,
        code: 'declared-capture-epoch-not-referenced',
      });
    }
  });
  return issues.length === 0
    ? { kind: 'valid' }
    : { kind: 'invalid', issues: Object.freeze(issues.map((issue) => Object.freeze(issue))) };
}
