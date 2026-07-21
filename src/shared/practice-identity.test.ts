import { describe, expect, it } from 'vitest';

import { canonicalJsonBytes, canonicalJsonStringify } from './canonical-json';
import { QualifiedHashSchema } from './contracts/practice';
import {
  PRACTICE_PROJECTION_REGISTRY,
  hashDocumentRevision,
  hashExpectedEvents,
  hashMediaIdentity,
  hashObservedEvidenceSnapshot,
  hashPracticeAssessment,
  hashPracticeDocumentContent,
  hashPracticeTakeCore,
  hashReferenceScoreMediaSyncMap,
  hashTakeCaptureMediaSyncMap,
  materializeExpectedEvents,
  materializeMediaIdentity,
  materializePracticeAssessment,
  materializePracticeDocumentContent,
  materializePracticeTakeCore,
  materializeReferenceScoreMediaSyncMap,
  materializeTakeCaptureMediaSyncMap,
} from './practice-identity';

const fixtureHash = (projectionId: string, fill = 'a') => {
  const schemaId =
    projectionId === 'practice-document-content' || projectionId === 'practice-expected-events'
      ? 'practice-document'
      : projectionId === 'observed-evidence-snapshot'
        ? 'observed-evidence-snapshot'
        : projectionId === 'practice-take-core'
          ? 'practice-take'
          : projectionId === 'reference-score-media-sync-map'
            ? 'reference-score-media-sync-map'
            : projectionId === 'take-capture-media-sync-map'
              ? 'take-capture-media-sync-map'
              : projectionId === 'practice-assessment'
                ? 'practice-assessment'
                : 'practice-fixture';
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1 as const,
    digestHex: fill.repeat(64),
    schemaId,
    schemaVersion: 1,
    projectionId,
    projectionVersion: 1,
  };
};

const revision = () => ({
  contentHash: fixtureHash('practice-document-content'),
  documentId: 'document-1',
  revisionId: 'revision-1',
  revisionNumber: 1,
});

const documentFixture = () => ({
  contractVersion: 1,
  durationTicks: 3_840,
  expectedProjectionHash: fixtureHash('practice-expected-events'),
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
  loopPresets: [
    { id: 'loop-1', name: 'First bar', range: { endTickExclusive: 3_840, startTick: 0 } },
  ],
  metadata: {
    artist: 'Player',
    createdAt: '2026-07-20T12:00:00Z',
    title: '\u00c9tude \ud83c\udfb8',
    updatedAt: '2026-07-20T12:00:00Z',
  },
  meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
  ppq: 960,
  revision: revision(),
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
                  soundingDurationTicks: 900,
                  writtenPitch: { accidental: 0, octave: 4, step: 'E' },
                },
              ],
              tick: 0,
            },
            { durationTicks: 2_880, id: 'rest-1', kind: 'rest', tick: 960 },
          ],
          id: 'voice-1',
          name: 'Lead',
        },
      ],
    },
  ],
});

const maximumComplexityDocumentFixture = () => {
  let nextEventIndex = 0;
  const grouping = new Array(32).fill(1) as number[];
  return {
    contractVersion: 1,
    durationTicks: 10_000,
    expectedProjectionHash: fixtureHash('practice-expected-events'),
    guitar: {
      capoFret: 0,
      handedness: 'right',
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: '12-tet',
      tuning: Array.from({ length: 12 }, (_, index) => ({
        openMidi: index === 0 ? 64 : index === 1 ? 59 : 40,
        stringNumber: index + 1,
      })),
    },
    importProvenance: {
      adapterId: 'maximum-fixture-adapter',
      adapterVersion: '1',
      importReportId: 'maximum-fixture-report',
      sourceFormat: 'native-test',
      sourceHash: fixtureHash('source-content'),
    },
    keyMap: [{ fifths: 0, mode: 'major', tick: 0 }],
    loopPresets: Array.from({ length: 1_000 }, (_, index) => ({
      id: `maximum-loop-${String(index)}`,
      name: `Maximum loop ${String(index)}`,
      range: { endTickExclusive: 1, startTick: 0 },
    })),
    metadata: {
      artist: 'Maximum fixture artist',
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Schema-maximum identity fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: Array.from({ length: 4_998 }, (_, tick) => ({
      denominator: 32,
      grouping,
      numerator: 32,
      tick,
    })),
    ppq: 960,
    revision: revision(),
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: Array.from({ length: 16 }, (_, trackIndex) => ({
      id: `maximum-track-${String(trackIndex)}`,
      name: `Maximum track ${String(trackIndex)}`,
      voices: Array.from({ length: 2 }, (_, voiceIndexWithinTrack) => {
        const voiceIndex = trackIndex * 2 + voiceIndexWithinTrack;
        const eventCount = 62 + (voiceIndex < 16 ? 1 : 0);
        return {
          events: Array.from({ length: eventCount }, () => {
            const eventIndex = nextEventIndex;
            nextEventIndex += 1;
            return {
              articulations: [
                { articulation: 'accent', semantic: 'accent' },
                { articulation: 'staccato', semantic: 'staccato' },
              ],
              dynamic: { semantic: 'dynamics-mf', value: 'mf' },
              id: `maximum-event-${String(eventIndex)}`,
              kind: 'guitar-event',
              notatedDurationTicks: 1,
              notes: [
                {
                  id: `maximum-note-${String(eventIndex)}-1`,
                  position: { stringNumber: 1, tabFret: 0 },
                  semantics: [
                    { semantic: 'vibrato' },
                    { semantic: 'let-ring' },
                    { semantic: 'palm-mute' },
                  ],
                  soundingDurationTicks: 1,
                  writtenPitch: { accidental: 0, octave: 4, step: 'E' },
                },
                {
                  id: `maximum-note-${String(eventIndex)}-2`,
                  position: { stringNumber: 2, tabFret: 0 },
                  semantics: [{ semantic: 'dead-note' }, { semantic: 'natural-harmonic' }],
                  soundingDurationTicks: 1,
                  writtenPitch: { accidental: 0, octave: 3, step: 'B' },
                },
              ],
              tick: 6_000 + eventIndex,
              tuplet: { actualNotes: 3, normalNotes: 2 },
            };
          }),
          id: `maximum-voice-${String(voiceIndex)}`,
          name: `Maximum voice ${String(voiceIndex)}`,
        };
      }),
    })),
  };
};

const evidenceFixture = () => ({
  contractVersion: 1,
  correctedProjectionHash: fixtureHash('corrected-evidence'),
  correctionCount: 1,
  correctionPrefixHash: fixtureHash('correction-prefix'),
  createdAt: '2026-07-20T12:02:00Z',
  detectorVersions: { audio: 'detector-v1' },
  expectedPcmHash: null,
  id: 'snapshot-1',
  rawEventCount: 4,
  rawEvidenceHash: fixtureHash('raw-evidence'),
  sessionId: 'session-1',
  sessionProjectionHash: fixtureHash('session-projection'),
});

const takeFixture = () => ({
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
  createdAt: '2026-07-20T12:01:00Z',
  documentRevision: revision(),
  evidenceSnapshotHash: fixtureHash('observed-evidence-snapshot'),
  evidenceSnapshotId: 'snapshot-1',
  expectedProjectionHash: fixtureHash('practice-expected-events'),
  id: 'take-1',
  loopPassPolicy: { kind: 'single-pass' },
  metronomeEnabled: true,
  microphoneMediaHash: fixtureHash('media-content'),
  microphoneMediaId: 'microphone-media-1',
  practiceSpeed: { denominator: 1, numerator: 1 },
  range: { endTickExclusive: 3_840, startTick: 0 },
  referenceConfigurationHash: null,
  sampleRate: 48_000,
  status: 'finalized',
  takeCoreHash: fixtureHash('practice-take-core'),
  warnings: [],
});

const referenceMapFixture = () => ({
  anchors: [
    { mediaPtsMicroseconds: 0, scoreTick: 0 },
    { mediaPtsMicroseconds: 1_000_000, scoreTick: 960 },
  ],
  contractVersion: 1,
  documentRevision: revision(),
  id: 'reference-map-1',
  mapHash: fixtureHash('reference-score-media-sync-map'),
  mediaContentHash: fixtureHash('media-content'),
  mediaId: 'reference-media-1',
  provenance: 'authored',
});

const takeMapFixture = () => ({
  anchors: [
    {
      captureGeneration: 1,
      logicalAudioFrame: 0,
      mediaPtsMicroseconds: 0,
      runtimeGeneration: 1,
      transportGeneration: 1,
    },
    {
      captureGeneration: 1,
      logicalAudioFrame: 48_000,
      mediaPtsMicroseconds: 1_000_000,
      runtimeGeneration: 1,
      transportGeneration: 1,
    },
  ],
  contractVersion: 1,
  id: 'take-map-1',
  mapHash: fixtureHash('take-capture-media-sync-map'),
  takeCoreHash: fixtureHash('practice-take-core'),
  takeId: 'take-1',
  timestampStrategyId: 'frame-callback-observation',
  uncertaintyMicroseconds: 2_000,
  videoContentHash: fixtureHash('media-content'),
  videoMediaId: 'take-video-media-1',
});

const assessmentFixture = () => ({
  algorithmId: 'alignment-v1',
  algorithmVersion: '1.0.0',
  alignmentProvenanceHash: fixtureHash('alignment-provenance'),
  ambiguousCount: 0,
  assessmentHash: fixtureHash('practice-assessment'),
  confidence: 0.9,
  contractVersion: 1,
  createdAt: '2026-07-20T12:03:00Z',
  documentRevision: revision(),
  evidenceSnapshotHash: fixtureHash('observed-evidence-snapshot'),
  evidenceSnapshotId: 'snapshot-1',
  expectedProjectionHash: fixtureHash('practice-expected-events'),
  id: 'assessment-1',
  matchedCount: 1,
  takeCoreHash: fixtureHash('practice-take-core'),
  takeId: 'take-1',
  unmatchedExpectedCount: 0,
  unmatchedObservedCount: 0,
});

describe('Practice System projection registry', () => {
  it('pins independently versioned schemas and projections', () => {
    expect(PRACTICE_PROJECTION_REGISTRY.documentContent).toEqual({
      schemaId: 'practice-document',
      schemaVersion: 1,
      projectionId: 'practice-document-content',
      projectionVersion: 1,
    });
    expect(PRACTICE_PROJECTION_REGISTRY.expectedEvents.projectionId).not.toBe(
      PRACTICE_PROJECTION_REGISTRY.documentContent.projectionId,
    );
    expect(Object.isFrozen(PRACTICE_PROJECTION_REGISTRY)).toBe(true);
    expect(Object.values(PRACTICE_PROJECTION_REGISTRY).every(Object.isFrozen)).toBe(true);
  });

  it('emits the unified fully qualified hash shape and a golden digest', async () => {
    const hash = await hashPracticeDocumentContent(documentFixture());
    expect(QualifiedHashSchema.parse(hash)).toEqual(hash);
    expect(hash).toEqual({
      algorithm: 'sha256',
      canonicalizationId: 'stringsight-canonical-json',
      canonicalizationVersion: 1,
      schemaId: 'practice-document',
      schemaVersion: 1,
      projectionId: 'practice-document-content',
      projectionVersion: 1,
      digestHex: 'be26512f571da81d6cdc1aebee6772e40758a8a5982161430ff2831df5227e5a',
    });
  });
});

describe('PracticeDocument identity projections', () => {
  it('excludes circular revision and expected identities from authored content', () => {
    const first = documentFixture();
    const second = documentFixture();
    second.revision.revisionId = 'revision-2';
    second.revision.revisionNumber = 2;
    second.revision.contentHash = fixtureHash('practice-document-content', 'b');
    second.expectedProjectionHash = fixtureHash('practice-expected-events', 'c');

    const projectionValue = materializePracticeDocumentContent(first);
    expect(projectionValue).not.toHaveProperty('revision');
    expect(projectionValue).not.toHaveProperty('expectedProjectionHash');
    expect(materializePracticeDocumentContent(second)).toEqual(projectionValue);
  });

  it('materializes only performance expectations and derives MIDI from guitar coordinates', () => {
    const expected = materializeExpectedEvents(documentFixture());
    expect(expected).not.toHaveProperty('metadata');
    expect(expected).not.toHaveProperty('keyMap');
    expect(expected.tracks[0]?.voices[0]?.events).toEqual([
      {
        id: 'event-1',
        notatedDurationTicks: 960,
        notes: [
          {
            id: 'note-1',
            midi: 64,
            position: { stringNumber: 1, tabFret: 0 },
            semantics: [],
            soundingDurationTicks: 900,
          },
        ],
        articulations: [],
        dynamic: null,
        tick: 0,
        tuplet: null,
      },
    ]);
  });

  it('pins real expected-event projection bytes and their qualified digest', async () => {
    const projectionValue = materializeExpectedEvents(documentFixture());
    const expectedBytes =
      '{"contractVersion":1,"durationTicks":3840,"ppq":960,"tempoMap":[{"microsecondsPerQuarter":500000,"tick":0}],"tracks":[{"id":"track-1","voices":[{"events":[{"articulations":[],"dynamic":null,"id":"event-1","notatedDurationTicks":960,"notes":[{"id":"note-1","midi":64,"position":{"stringNumber":1,"tabFret":0},"semantics":[],"soundingDurationTicks":900}],"tick":0,"tuplet":null}],"id":"voice-1"}]}]}';
    expect(new TextDecoder().decode(canonicalJsonBytes(projectionValue))).toBe(expectedBytes);
    expect(canonicalJsonStringify(projectionValue)).toBe(expectedBytes);
    expect((await hashExpectedEvents(documentFixture())).digestHex).toBe(
      'eb704e55f5bd3b03797bc6cc8da92c2e61dd13e8e155b4d32a88486772f47e92',
    );
  });

  it('changes only the projections whose declared semantics changed', async () => {
    const original = documentFixture();
    const metadataEdit = documentFixture();
    metadataEdit.metadata.title = 'Renamed fixture';
    const noteEdit = documentFixture();
    const event = noteEdit.tracks[0]?.voices[0]?.events[0];
    if (event?.kind !== 'guitar-event' || event.notes === undefined) {
      throw new Error('Fixture must start with a guitar event.');
    }
    const note = event.notes[0];
    if (note === undefined) throw new Error('Fixture guitar event must contain a note.');
    note.position.tabFret = 1;
    note.writtenPitch = { accidental: 0, octave: 4, step: 'F' };

    const [content, expected, metadataContent, metadataExpected, noteContent, noteExpected] =
      await Promise.all([
        hashPracticeDocumentContent(original),
        hashExpectedEvents(original),
        hashPracticeDocumentContent(metadataEdit),
        hashExpectedEvents(metadataEdit),
        hashPracticeDocumentContent(noteEdit),
        hashExpectedEvents(noteEdit),
      ]);
    expect(metadataContent.digestHex).not.toBe(content.digestHex);
    expect(metadataExpected.digestHex).toBe(expected.digestHex);
    expect(noteContent.digestHex).not.toBe(content.digestHex);
    expect(noteExpected.digestHex).not.toBe(expected.digestHex);
  });

  it('validates unknown input before projection', () => {
    expect(() => materializePracticeDocumentContent({ title: 'not a document' })).toThrow();
    expect(() => materializeExpectedEvents({ ...documentFixture(), ppq: 0 })).toThrow();
  });

  it('hashes a schema-valid document at every aggregate complexity ceiling', async () => {
    await expect(hashPracticeDocumentContent(maximumComplexityDocumentFixture())).resolves.toEqual(
      expect.objectContaining({
        projectionId: 'practice-document-content',
        schemaId: 'practice-document',
      }),
    );
  });
});

describe('independent immutable aggregate projections', () => {
  it('hashes each independently versioned source against its registered projection', async () => {
    const results = await Promise.all([
      hashDocumentRevision(revision()),
      hashObservedEvidenceSnapshot(evidenceFixture()),
      hashPracticeTakeCore(takeFixture()),
      hashMediaIdentity({
        contractVersion: 1,
        contentHash: fixtureHash('media-content'),
        formatMetadataHash: fixtureHash('media-format-metadata'),
        id: 'media-1',
        mediaKind: 'take-video',
      }),
      hashReferenceScoreMediaSyncMap(referenceMapFixture()),
      hashTakeCaptureMediaSyncMap(takeMapFixture()),
      hashPracticeAssessment(assessmentFixture()),
    ]);

    expect(results.map(({ projectionId }) => projectionId)).toEqual([
      'practice-document-revision',
      'observed-evidence-snapshot',
      'practice-take-core',
      'practice-media-identity',
      'reference-score-media-sync-map',
      'take-capture-media-sync-map',
      'practice-assessment',
    ]);
    expect(new Set(results.map(({ digestHex }) => digestHex)).size).toBe(results.length);
    const expectedProducerKeys = [
      'algorithm',
      'canonicalizationId',
      'canonicalizationVersion',
      'digestHex',
      'projectionId',
      'projectionVersion',
      'schemaId',
      'schemaVersion',
    ];
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(expectedProducerKeys);
      expect(result.digestHex).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('pins immutable media-identity projection bytes and digest', async () => {
    const media = {
      contractVersion: 1,
      contentHash: fixtureHash('media-content'),
      formatMetadataHash: fixtureHash('media-format-metadata'),
      id: 'media-1',
      mediaKind: 'take-video',
    };
    const bytes = new TextDecoder().decode(canonicalJsonBytes(materializeMediaIdentity(media)));
    expect(bytes).toBe(
      '{"contentHash":{"algorithm":"sha256","canonicalizationId":"stringsight-canonical-json","canonicalizationVersion":1,"digestHex":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","projectionId":"media-content","projectionVersion":1,"schemaId":"practice-fixture","schemaVersion":1},"contractVersion":1,"formatMetadataHash":{"algorithm":"sha256","canonicalizationId":"stringsight-canonical-json","canonicalizationVersion":1,"digestHex":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","projectionId":"media-format-metadata","projectionVersion":1,"schemaId":"practice-fixture","schemaVersion":1},"id":"media-1","mediaKind":"take-video"}',
    );
    expect((await hashMediaIdentity(media)).digestHex).toBe(
      '010da76bffa18b9b2d9eff91a0bd2760b3ce26127de095360cd0ff4f64722bc0',
    );
  });

  it('excludes self hashes while retaining outward source identities', () => {
    const take = materializePracticeTakeCore(takeFixture());
    expect(take).not.toHaveProperty('takeCoreHash');
    expect(take).toHaveProperty('evidenceSnapshotHash');
    expect(take).toHaveProperty('microphoneMediaHash');

    const referenceMap = materializeReferenceScoreMediaSyncMap(referenceMapFixture());
    expect(referenceMap).not.toHaveProperty('mapHash');
    expect(referenceMap).toHaveProperty('documentRevision.contentHash');
    expect(referenceMap).toHaveProperty('mediaContentHash');

    const takeMap = materializeTakeCaptureMediaSyncMap(takeMapFixture());
    expect(takeMap).not.toHaveProperty('mapHash');
    expect(takeMap).toHaveProperty('takeCoreHash');
    expect(takeMap).toHaveProperty('videoContentHash');

    const assessment = materializePracticeAssessment(assessmentFixture());
    expect(assessment).not.toHaveProperty('assessmentHash');
    expect(assessment).toHaveProperty('takeCoreHash');
    expect(assessment).toHaveProperty('evidenceSnapshotHash');
  });

  it('ignores a replaced self hash but changes when a bound source hash changes', async () => {
    const first = takeFixture();
    const selfHashEdit = takeFixture();
    selfHashEdit.takeCoreHash = fixtureHash('practice-take-core', 'b');
    const sourceHashEdit = takeFixture();
    sourceHashEdit.evidenceSnapshotHash = fixtureHash('observed-evidence-snapshot', 'c');

    const [base, selfEdit, sourceEdit] = await Promise.all([
      hashPracticeTakeCore(first),
      hashPracticeTakeCore(selfHashEdit),
      hashPracticeTakeCore(sourceHashEdit),
    ]);
    expect(selfEdit.digestHex).toBe(base.digestHex);
    expect(sourceEdit.digestHex).not.toBe(base.digestHex);
  });
});
