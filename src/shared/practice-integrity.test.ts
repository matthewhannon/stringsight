import { describe, expect, it } from 'vitest';

import type { QualifiedHash } from './contracts/practice';
import {
  hashExpectedEvents,
  hashObservedEvidenceSnapshot,
  hashPracticeAssessment,
  hashPracticeDocumentContent,
  hashPracticeTakeCore,
  hashReferenceScoreMediaSyncMap,
  hashTakeCaptureMediaSyncMap,
} from './practice-identity';
import {
  hashAssessmentAlignmentProvenance,
  verifyPracticeAggregateGraph,
} from './practice-integrity';

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

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

const placeholder = {
  assessment: () => hash('practice-assessment', 'practice-assessment'),
  content: () => hash('practice-document', 'practice-document-content'),
  evidence: () => hash('observed-evidence-snapshot', 'observed-evidence-snapshot'),
  expected: () => hash('practice-document', 'practice-expected-events'),
  referenceMap: () => hash('reference-score-media-sync-map', 'reference-score-media-sync-map'),
  take: () => hash('practice-take', 'practice-take-core'),
  takeMap: () => hash('take-capture-media-sync-map', 'take-capture-media-sync-map'),
};

async function validGraph() {
  const document = {
    contractVersion: 1,
    durationTicks: 960,
    expectedProjectionHash: placeholder.expected(),
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
      title: 'Aggregate integrity fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: placeholder.content(),
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
            events: [
              {
                id: 'event-1',
                kind: 'guitar-event',
                notatedDurationTicks: 960,
                notes: [
                  {
                    id: 'note-1',
                    position: { stringNumber: 1, tabFret: 0 },
                    semantics: [],
                    soundingDurationTicks: 960,
                    writtenPitch: { accidental: 0, octave: 4, step: 'E' },
                  },
                ],
                tick: 0,
              },
            ],
            id: 'voice-1',
          },
        ],
      },
    ],
  };
  document.revision.contentHash = await hashPracticeDocumentContent(document);
  document.expectedProjectionHash = await hashExpectedEvents(document);

  const evidence = {
    contractVersion: 1,
    correctedProjectionHash: hash('corrected-evidence', 'corrected-evidence'),
    correctionCount: 1,
    correctionPrefixHash: hash('correction-prefix', 'correction-prefix'),
    createdAt: '2026-07-20T12:01:00Z',
    detectorVersions: { audio: 'v1' },
    expectedPcmHash: null,
    id: 'evidence-1',
    rawEventCount: 1,
    rawEvidenceHash: hash('raw-evidence', 'raw-evidence'),
    sessionId: 'session-1',
    sessionProjectionHash: hash('session', 'session-projection'),
  };
  const evidenceHash = await hashObservedEvidenceSnapshot(evidence);

  const microphoneContentHash = hash('media-asset', 'media-content', 'b');
  const microphoneFormatHash = hash('media-asset', 'media-format', 'b');
  const referenceContentHash = hash('media-asset', 'media-content', 'c');
  const takeVideoContentHash = hash('media-asset', 'media-content', 'd');
  const takeVideoFormatHash = hash('media-asset', 'media-format', 'd');
  const mediaIdentities = [
    {
      contentHash: microphoneContentHash,
      contractVersion: 1,
      formatMetadataHash: microphoneFormatHash,
      id: 'microphone-media-1',
      mediaKind: 'microphone-audio',
    },
    {
      contentHash: referenceContentHash,
      contractVersion: 1,
      formatMetadataHash: hash('media-asset', 'media-format', 'c'),
      id: 'reference-media-1',
      mediaKind: 'reference-video',
    },
    {
      contentHash: takeVideoContentHash,
      contractVersion: 1,
      formatMetadataHash: takeVideoFormatHash,
      id: 'take-video-media-1',
      mediaKind: 'take-video',
    },
  ];

  const take = {
    captureEpochs: [
      {
        appliedAudioFrame: 0,
        captureGeneration: 1,
        endLogicalFrameExclusive: 48_000,
        id: 'epoch-1',
        runtimeGeneration: 1,
        scheduledAudioFrame: 0,
        scoreStartTick: 0,
        startLogicalFrame: 0,
        transportGeneration: 1,
      },
    ],
    contractVersion: 1,
    countInConfigurationHash: null,
    createdAt: '2026-07-20T12:02:00Z',
    documentRevision: document.revision,
    evidenceSnapshotHash: evidenceHash,
    evidenceSnapshotId: evidence.id,
    expectedProjectionHash: document.expectedProjectionHash,
    id: 'take-1',
    loopPassPolicy: { kind: 'single-pass' },
    metronomeEnabled: true,
    microphoneMediaHash: microphoneContentHash,
    microphoneMediaId: 'microphone-media-1',
    microphoneRecordingProvenance: {
      channelCount: 1,
      contentHash: microphoneContentHash,
      finalizedAt: '2026-07-20T12:03:00Z',
      formatMetadataHash: microphoneFormatHash,
      frameCount: 48_000,
      logicalLocator: 'recordings/take-1.pcm',
      mediaId: 'microphone-media-1',
      pcmEnvelopeHash: hash('media-asset', 'pcm-envelope'),
      sampleRate: 48_000,
    },
    practiceSpeed: { denominator: 1, numerator: 1 },
    range: { endTickExclusive: 960, startTick: 0 },
    referenceConfigurationHash: null,
    sampleRate: 48_000,
    status: 'finalized',
    takeCoreHash: placeholder.take(),
    takeVideoCaptureProvenance: {
      audioTrackCount: 0,
      captureGeneration: 1,
      contentHash: takeVideoContentHash,
      finalizedAt: '2026-07-20T12:03:00Z',
      firstObservedTimestampMicroseconds: 0,
      formatMetadataHash: takeVideoFormatHash,
      lastObservedTimestampMicroseconds: 1_000_000,
      mediaId: 'take-video-media-1',
      timestampPrecision: 'estimated',
      timestampStrategyId: 'video-frame-callback',
      uncertaintyMicroseconds: 2_000,
      videoTrackCount: 1,
    },
    warnings: [],
  };
  take.takeCoreHash = await hashPracticeTakeCore(take);

  const referenceMap = {
    anchors: [
      { mediaPtsMicroseconds: 0, scoreTick: 0 },
      { mediaPtsMicroseconds: 1_000_000, scoreTick: 960 },
    ],
    boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped',
    contractVersion: 1,
    documentRevision: document.revision,
    expectedProjectionHash: document.expectedProjectionHash,
    gapSegmentIndices: [],
    historySequence: 0,
    id: 'reference-map-1',
    mapHash: placeholder.referenceMap(),
    mediaContentHash: referenceContentHash,
    mediaId: 'reference-media-1',
    normalizedTimelineId: 'expected-events-v1',
    parentMap: null,
    provenance: 'authored',
  };
  referenceMap.mapHash = await hashReferenceScoreMediaSyncMap(referenceMap);

  const takeMap = {
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
        logicalAudioFrame: 47_999,
        mediaPtsMicroseconds: 1_000_000,
        runtimeGeneration: 1,
        transportGeneration: 1,
      },
    ],
    boundaryPolicy: 'generation-segments-only',
    captureEpochIds: ['epoch-1'],
    contractVersion: 1,
    id: 'take-map-1',
    mapHash: placeholder.takeMap(),
    takeCoreHash: take.takeCoreHash,
    takeId: take.id,
    timestampStrategyId: 'video-frame-callback',
    uncertaintyMicroseconds: 2_000,
    videoContentHash: takeVideoContentHash,
    videoMediaId: 'take-video-media-1',
  };
  takeMap.mapHash = await hashTakeCaptureMediaSyncMap(takeMap);

  const assessment = {
    algorithmId: 'alignment-v1',
    algorithmVersion: '1.0.0',
    alignment: {
      algorithmId: 'alignment-v1',
      algorithmVersion: '1.0.0',
      clockMappingId: 'take-clock-map-1',
      maximumTimingUncertaintyMicroseconds: 2_000,
      parametersHash: hash('assessment-parameters', 'assessment-parameters'),
      timingToleranceMicroseconds: 50_000,
    },
    alignmentProvenanceHash: hash(
      'assessment-alignment-provenance',
      'assessment-alignment-provenance',
    ),
    ambiguousCount: 0,
    assessmentHash: placeholder.assessment(),
    confidence: 0.9,
    contractVersion: 1,
    correctionProvenance: {
      correctionCount: evidence.correctionCount,
      correctionPrefixHash: evidence.correctionPrefixHash,
      evidenceSnapshotId: evidence.id,
    },
    createdAt: '2026-07-20T12:03:00Z',
    documentRevision: document.revision,
    evidenceSnapshotHash: evidenceHash,
    evidenceSnapshotId: evidence.id,
    expectedProjectionHash: document.expectedProjectionHash,
    id: 'assessment-1',
    matchedCount: 0,
    records: {
      ambiguous: [] as unknown[],
      matches: [] as unknown[],
      mode: 'complete' as const,
      unmatchedExpected: [] as unknown[],
      unmatchedObserved: [] as unknown[],
    },
    takeCoreHash: take.takeCoreHash,
    takeId: take.id,
    unmatchedExpectedCount: 0,
    unmatchedObservedCount: 0,
  };
  assessment.alignmentProvenanceHash = await hashAssessmentAlignmentProvenance(
    assessment.alignment,
  );
  assessment.assessmentHash = await hashPracticeAssessment(assessment);

  return {
    assessments: [assessment],
    document,
    evidenceSnapshots: [evidence],
    mediaAvailability: mediaIdentities.map(({ id }) => ({
      availability: 'available',
      contractVersion: 1,
      locator: `indexeddb://${id}`,
      mediaId: id,
      provenance: 'Integrity fixture.',
      stateRevision: 0,
      updatedAt: '2026-07-20T12:04:00Z',
    })),
    mediaIdentities,
    referenceMaps: [referenceMap],
    referenceVideos: [
      {
        contractVersion: 1,
        createdAt: '2026-07-20T12:04:00Z',
        documentRevision: document.revision,
        id: 'reference-video-1',
        mediaContentHash: referenceContentHash,
        mediaId: 'reference-media-1',
        syncMapHash: referenceMap.mapHash,
        syncMapId: referenceMap.id,
      },
    ],
    takeMaps: [takeMap],
    takeVideoAttachments: [
      {
        contractVersion: 1,
        selectedMapHash: takeMap.mapHash,
        selectedMapId: takeMap.id,
        stateRevision: 0,
        takeVideoId: 'take-video-1',
        updatedAt: '2026-07-20T12:04:00Z',
      },
    ],
    takeVideos: [
      {
        contractVersion: 1,
        createdAt: '2026-07-20T12:04:00Z',
        id: 'take-video-1',
        takeCoreHash: take.takeCoreHash,
        takeId: take.id,
        videoContentHash: takeVideoContentHash,
        videoMediaId: 'take-video-media-1',
      },
    ],
    takes: [take],
  };
}

async function rehashTakeDependents(graph: Awaited<ReturnType<typeof validGraph>>): Promise<void> {
  const take = required(graph.takes.at(0), 'Fixture graph must contain a take.');
  take.takeCoreHash = await hashPracticeTakeCore(take);
  const takeMap = required(graph.takeMaps.at(0), 'Fixture graph must contain a take map.');
  takeMap.takeCoreHash = take.takeCoreHash;
  takeMap.mapHash = await hashTakeCaptureMediaSyncMap(takeMap);
  const attachment = required(
    graph.takeVideoAttachments.at(0),
    'Fixture graph must contain a take-video attachment.',
  );
  attachment.selectedMapHash = takeMap.mapHash;
  const takeVideo = required(graph.takeVideos.at(0), 'Fixture graph must contain a take video.');
  takeVideo.takeCoreHash = take.takeCoreHash;
  const assessment = required(graph.assessments.at(0), 'Fixture graph must contain an assessment.');
  assessment.takeCoreHash = take.takeCoreHash;
  assessment.assessmentHash = await hashPracticeAssessment(assessment);
}

async function rehashDocumentDependents(
  graph: Awaited<ReturnType<typeof validGraph>>,
): Promise<void> {
  graph.document.revision.contentHash = await hashPracticeDocumentContent(graph.document);
  graph.document.expectedProjectionHash = await hashExpectedEvents(graph.document);
  const take = required(graph.takes.at(0), 'Fixture graph must contain a take.');
  take.documentRevision = graph.document.revision;
  take.expectedProjectionHash = graph.document.expectedProjectionHash;
  const referenceMap = required(
    graph.referenceMaps.at(0),
    'Fixture graph must contain a reference map.',
  );
  referenceMap.documentRevision = graph.document.revision;
  referenceMap.expectedProjectionHash = graph.document.expectedProjectionHash;
  referenceMap.mapHash = await hashReferenceScoreMediaSyncMap(referenceMap);
  const referenceVideo = required(
    graph.referenceVideos.at(0),
    'Fixture graph must contain a reference video.',
  );
  referenceVideo.documentRevision = graph.document.revision;
  referenceVideo.syncMapHash = referenceMap.mapHash;
  const assessment = required(graph.assessments.at(0), 'Fixture graph must contain an assessment.');
  assessment.documentRevision = graph.document.revision;
  assessment.expectedProjectionHash = graph.document.expectedProjectionHash;
  await rehashTakeDependents(graph);
}

describe('Practice aggregate integrity graph', () => {
  it('rejects alignment accessors before schema parsing can invoke them', async () => {
    let getterCalls = 0;
    const alignment = {
      algorithmVersion: '1.0.0',
      clockMappingId: 'take-clock-map-1',
      maximumTimingUncertaintyMicroseconds: 1_000,
      parametersHash: hash('assessment-parameters', 'assessment-parameters'),
      timingToleranceMicroseconds: 50_000,
    };
    Object.defineProperty(alignment, 'algorithmId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'alignment-v1';
      },
    });

    await expect(hashAssessmentAlignmentProvenance(alignment)).rejects.toMatchObject({
      code: 'ACCESSOR_PROPERTY',
    });
    expect(getterCalls).toBe(0);
  });

  it('rejects aggregate-graph accessors before schema parsing can invoke them', async () => {
    const graph = await validGraph();
    const assessments = graph.assessments;
    let getterCalls = 0;
    Object.defineProperty(graph, 'assessments', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return assessments;
      },
    });

    await expect(verifyPracticeAggregateGraph(graph)).rejects.toMatchObject({
      code: 'ACCESSOR_PROPERTY',
    });
    expect(getterCalls).toBe(0);
  });

  it('accepts one cryptographically and referentially consistent aggregate chain', async () => {
    const result = await verifyPracticeAggregateGraph(await validGraph());
    expect(result.kind).toBe('valid');
  });

  it('reports cross-wired identities and out-of-document ranges without mutating sources', async () => {
    const graph = await validGraph();
    const original = structuredClone(graph);
    const take = graph.takes.at(0);
    const takeMap = graph.takeMaps.at(0);
    if (take === undefined || takeMap === undefined)
      throw new Error('Fixture graph is incomplete.');
    take.range.endTickExclusive = 961;
    takeMap.videoMediaId = 'reference-media-1';

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['binding-mismatch', 'hash-mismatch', 'range-outside-document']),
      );
    }
    expect(original.takes.at(0)?.range.endTickExclusive).toBe(960);
  });

  it('rejects a stored qualified digest that was not recomputed from its projection', async () => {
    const graph = await validGraph();
    const assessment = graph.assessments.at(0);
    if (assessment === undefined) throw new Error('Fixture graph has no assessment.');
    assessment.assessmentHash = placeholder.assessment();
    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'hash-mismatch',
          path: '#/assessments/0/assessmentHash',
        }),
      );
    }
  });

  it('rejects an assessment evidence snapshot that differs from its immutable take', async () => {
    const graph = await validGraph();
    const evidence = structuredClone(
      required(graph.evidenceSnapshots.at(0), 'Fixture graph must contain evidence.'),
    );
    evidence.id = 'evidence-2';
    evidence.sessionId = 'session-2';
    graph.evidenceSnapshots.push(evidence);
    const assessment = required(
      graph.assessments.at(0),
      'Fixture graph must contain an assessment.',
    );
    assessment.evidenceSnapshotId = evidence.id;
    assessment.evidenceSnapshotHash = await hashObservedEvidenceSnapshot(evidence);
    assessment.correctionProvenance.evidenceSnapshotId = evidence.id;
    assessment.assessmentHash = await hashPracticeAssessment(assessment);

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'binding-mismatch',
          path: '#/assessments/0/evidenceSnapshotId',
        }),
      );
    }
  });

  it('recomputes inline alignment provenance rather than trusting a duplicate hash', async () => {
    const graph = await validGraph();
    const assessment = required(
      graph.assessments.at(0),
      'Fixture graph must contain an assessment.',
    );
    assessment.alignment.timingToleranceMicroseconds += 1;
    assessment.assessmentHash = await hashPracticeAssessment(assessment);

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'hash-mismatch',
          path: '#/assessments/0/alignmentProvenanceHash',
        }),
      );
    }
  });

  it('checks expected ticks and observed logical frames against bound source aggregates', async () => {
    const graph = await validGraph();
    const assessment = required(
      graph.assessments.at(0),
      'Fixture graph must contain an assessment.',
    );
    assessment.matchedCount = 1;
    assessment.records.matches = [
      {
        confidence: 0.9,
        expected: { eventId: 'event-1', noteId: 'note-1' },
        id: 'match-1',
        observedEventIds: ['observed-1'],
        pitchOutcome: 'correct',
        timing: {
          clockMappingId: assessment.alignment.clockMappingId,
          confidence: 0.9,
          expectedTick: 1,
          observedLogicalFrame: 48_000,
          signedErrorMicroseconds: 1_000,
          source: 'exact-logical-frame',
          uncertaintyMicroseconds: 1_000,
        },
      },
    ];
    assessment.assessmentHash = await hashPracticeAssessment(assessment);

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.map(({ code }) => code)).toEqual(
        expect.arrayContaining(['expected-timing-mismatch', 'range-outside-take']),
      );
    }
  });

  it('binds microphone and take-video format provenance to exact media identities', async () => {
    const graph = await validGraph();
    const take = required(graph.takes.at(0), 'Fixture graph must contain a take.');
    take.microphoneRecordingProvenance.formatMetadataHash = hash(
      'media-asset',
      'media-format',
      'f',
    );
    take.takeVideoCaptureProvenance.formatMetadataHash = hash('media-asset', 'media-format', 'f');
    await rehashTakeDependents(graph);

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.filter(({ code }) => code === 'binding-mismatch')).toHaveLength(2);
    }
  });

  it('requires TakeVideo and selected take-media maps to agree with embedded take provenance', async () => {
    const graph = await validGraph();
    const replacementContent = hash('media-asset', 'media-content', 'e');
    graph.mediaIdentities.push({
      contentHash: replacementContent,
      contractVersion: 1,
      formatMetadataHash: hash('media-asset', 'media-format', 'e'),
      id: 'take-video-media-2',
      mediaKind: 'take-video',
    });
    const takeVideo = required(graph.takeVideos.at(0), 'Fixture graph must contain a take video.');
    takeVideo.videoMediaId = 'take-video-media-2';
    takeVideo.videoContentHash = replacementContent;
    const takeMap = required(graph.takeMaps.at(0), 'Fixture graph must contain a take map.');
    takeMap.videoMediaId = 'take-video-media-2';
    takeMap.videoContentHash = replacementContent;
    takeMap.mapHash = await hashTakeCaptureMediaSyncMap(takeMap);
    const attachment = required(
      graph.takeVideoAttachments.at(0),
      'Fixture graph must contain a take-video attachment.',
    );
    attachment.selectedMapHash = takeMap.mapHash;

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(
        result.issues.some(
          ({ code, message }) =>
            code === 'binding-mismatch' && message.includes('embedded video provenance'),
        ),
      ).toBe(true);
    }
  });

  it('rejects duplicate immutable assessment and reference-video IDs', async () => {
    const graph = await validGraph();
    const duplicateAssessment = structuredClone(
      required(graph.assessments.at(0), 'Fixture graph must contain an assessment.'),
    );
    duplicateAssessment.createdAt = '2026-07-20T12:03:01Z';
    duplicateAssessment.assessmentHash = await hashPracticeAssessment(duplicateAssessment);
    graph.assessments.push(duplicateAssessment);
    const duplicateReferenceVideo = structuredClone(
      required(graph.referenceVideos.at(0), 'Fixture graph must contain a reference video.'),
    );
    duplicateReferenceVideo.createdAt = '2026-07-20T12:04:01Z';
    graph.referenceVideos.push(duplicateReferenceVideo);

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues.filter(({ code }) => code === 'duplicate-id')).toHaveLength(2);
    }
  });

  it('uses collision-free expected identities when delimiters occur inside IDs', async () => {
    const graph = await validGraph();
    const track = required(graph.document.tracks.at(0), 'Fixture document must contain a track.');
    const voice = required(track.voices.at(0), 'Fixture track must contain a voice.');
    const event = required(voice.events.at(0), 'Fixture voice must contain an event.');
    if (event.kind !== 'guitar-event') throw new Error('Fixture event must be a guitar event.');
    event.id = 'a';
    required(event.notes.at(0), 'Fixture event must contain a note.').id = 'b:c';
    await rehashDocumentDependents(graph);
    const assessment = required(
      graph.assessments.at(0),
      'Fixture graph must contain an assessment.',
    );
    assessment.matchedCount = 1;
    assessment.records.matches = [
      {
        confidence: 0.9,
        expected: { eventId: 'a:b', noteId: 'c' },
        id: 'match-delimiter-probe',
        observedEventIds: ['observed-1'],
        pitchOutcome: 'correct',
        timing: null,
      },
    ];
    assessment.assessmentHash = await hashPracticeAssessment(assessment);

    const result = await verifyPracticeAggregateGraph(graph);
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'missing-reference' }));
    }
  });
});
