import { describe, expect, it } from 'vitest';

import {
  MediaAvailabilityStateSchema,
  MediaIdentitySchema,
  MusicalRangeSchema,
  PracticeDocumentSchema,
  PracticeDocumentContentHashSchema,
  PracticeGuitarConfigurationSchema,
  PracticeAssessmentSchema,
  PRACTICE_ASSESSMENT_LIMITS,
  PracticeTakeSchema,
  QualifiedHashSchema,
  ReferenceScoreMediaSyncMapSchema,
  TakeCaptureMediaSyncMapSchema,
  TempoMapSchema,
} from './practice';
import { hashPracticeAssessment } from '../practice-identity';

function hash(projectionId: string) {
  const schemaId =
    projectionId === 'practice-document-content' || projectionId === 'practice-expected-events'
      ? 'practice-document'
      : projectionId === 'observed-evidence-snapshot'
        ? 'observed-evidence-snapshot'
        : projectionId === 'practice-take-core'
          ? 'practice-take'
          : projectionId;
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1,
    digestHex: 'a'.repeat(64),
    schemaId,
    schemaVersion: 1,
    projectionId,
    projectionVersion: 1,
  };
}

const revision = {
  contentHash: hash('practice-document-content'),
  documentId: 'document-1',
  revisionId: 'revision-1',
  revisionNumber: 1,
};

function validDocument() {
  return {
    contractVersion: 1,
    durationTicks: 3_840,
    expectedProjectionHash: hash('practice-expected-events'),
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
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Contract fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision,
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
              { durationTicks: 2_880, id: 'rest-1', kind: 'rest', tick: 960 },
            ],
            id: 'voice-1',
          },
        ],
      },
    ],
  };
}

function firstFixtureVoice(document: ReturnType<typeof validDocument>) {
  const voice = document.tracks.at(0)?.voices.at(0);
  if (voice === undefined) throw new Error('The valid-document fixture must contain one voice.');
  return voice;
}

function firstFixtureTrack(document: ReturnType<typeof validDocument>) {
  const track = document.tracks.at(0);
  if (track === undefined) throw new Error('The valid-document fixture must contain one track.');
  return track;
}

function firstFixtureLoop(document: ReturnType<typeof validDocument>) {
  const loop = document.loopPresets.at(0);
  if (loop === undefined) throw new Error('The valid-document fixture must contain one loop.');
  return loop;
}

function completeTake() {
  return {
    calibration: {
      inputLatencyFrames: 96,
      measuredAt: '2026-07-20T11:59:00Z',
      methodId: 'loopback-calibration',
      methodVersion: '1',
      status: 'measured',
      uncertaintyFrames: 12,
      warnings: [],
    },
    captureEpochs: [
      {
        appliedAudioFrame: 100,
        captureGeneration: 1,
        captureStreamId: 'capture-stream-1',
        endLogicalFrameExclusive: 24_000,
        id: 'epoch-1',
        runtimeGeneration: 1,
        runtimeId: 'runtime-1',
        sampleRate: 48_000,
        scheduledAudioFrame: 96,
        scoreStartTick: 0,
        segmentIndex: 0,
        startLogicalFrame: 0,
        transportGeneration: 1,
      },
      {
        appliedAudioFrame: 25_004,
        captureGeneration: 1,
        captureStreamId: 'capture-stream-1',
        endLogicalFrameExclusive: 48_000,
        id: 'epoch-2',
        runtimeGeneration: 1,
        runtimeId: 'runtime-1',
        sampleRate: 48_000,
        scheduledAudioFrame: 25_000,
        scoreStartTick: 480,
        segmentIndex: 1,
        startLogicalFrame: 24_000,
        transportGeneration: 2,
      },
    ],
    clockAnchors: [
      {
        appliedAudioFrame: 100,
        boundary: 'recording-start',
        captureGeneration: 1,
        captureStreamId: 'capture-stream-1',
        epochId: 'epoch-1',
        id: 'anchor-start',
        lateByFrames: 4,
        logicalFrame: 0,
        runtimeGeneration: 1,
        runtimeId: 'runtime-1',
        scheduledAudioFrame: 96,
        scorePhase: 'playing',
        scoreTick: 0,
        transportGeneration: 1,
      },
      {
        appliedAudioFrame: 24_100,
        boundary: 'pause',
        captureGeneration: 1,
        captureStreamId: 'capture-stream-1',
        epochId: 'epoch-1',
        id: 'anchor-pause',
        lateByFrames: 4,
        logicalFrame: 24_000,
        runtimeGeneration: 1,
        runtimeId: 'runtime-1',
        scheduledAudioFrame: 24_096,
        scorePhase: 'paused',
        scoreTick: 480,
        transportGeneration: 1,
      },
      {
        appliedAudioFrame: 25_004,
        boundary: 'resume',
        captureGeneration: 1,
        captureStreamId: 'capture-stream-1',
        epochId: 'epoch-2',
        id: 'anchor-resume',
        lateByFrames: 4,
        logicalFrame: 24_000,
        runtimeGeneration: 1,
        runtimeId: 'runtime-1',
        scheduledAudioFrame: 25_000,
        scorePhase: 'playing',
        scoreTick: 480,
        transportGeneration: 2,
      },
      {
        appliedAudioFrame: 49_004,
        boundary: 'stop',
        captureGeneration: 1,
        captureStreamId: 'capture-stream-1',
        epochId: 'epoch-2',
        id: 'anchor-stop',
        lateByFrames: 4,
        logicalFrame: 48_000,
        runtimeGeneration: 1,
        runtimeId: 'runtime-1',
        scheduledAudioFrame: 49_000,
        scorePhase: 'stopped',
        scoreTick: 960,
        transportGeneration: 2,
      },
    ],
    contractVersion: 1,
    countInConfigurationHash: null,
    createdAt: '2026-07-20T12:00:00Z',
    discontinuities: [
      {
        afterEpochId: 'epoch-2',
        beforeEpochId: 'epoch-1',
        detail: 'Paused by the player.',
        discardedOverlapFrames: 0,
        id: 'discontinuity-1',
        kind: 'pause',
        logicalFrame: 24_000,
        missingFrames: 0,
        wallTimeExcluded: true,
      },
    ],
    documentRevision: revision,
    evidenceSnapshotHash: hash('observed-evidence-snapshot'),
    evidenceSnapshotId: 'snapshot-1',
    expectedProjectionHash: hash('practice-expected-events'),
    id: 'take-1',
    loopPassPolicy: { kind: 'single-pass' },
    metronomeEnabled: true,
    microphoneMediaHash: hash('media-content'),
    microphoneMediaId: 'media-1',
    microphoneRecordingProvenance: {
      channelCount: 1,
      contentHash: hash('media-content'),
      finalizedAt: '2026-07-20T12:01:00Z',
      formatMetadataHash: hash('media-format'),
      frameCount: 48_000,
      logicalLocator: 'recordings/take-1.pcm',
      mediaId: 'media-1',
      pcmEnvelopeHash: hash('pcm-envelope'),
      sampleRate: 48_000,
    },
    practiceSpeed: { denominator: 1, numerator: 1 },
    provenanceCompleteness: 'complete',
    range: { endTickExclusive: 3_840, startTick: 0 },
    referenceConfigurationHash: null,
    sampleRate: 48_000,
    status: 'finalized',
    takeCoreHash: hash('practice-take-core'),
    takeVideoCaptureProvenance: {
      audioTrackCount: 0,
      captureGeneration: 1,
      contentHash: hash('take-video-content'),
      finalizedAt: '2026-07-20T12:01:00Z',
      firstObservedTimestampMicroseconds: 0,
      formatMetadataHash: hash('take-video-format'),
      lastObservedTimestampMicroseconds: 1_000_000,
      mediaId: 'take-video-1',
      timestampPrecision: 'estimated',
      timestampStrategyId: 'media-recorder-container-inspection',
      uncertaintyMicroseconds: 20_000,
      videoTrackCount: 1,
    },
    warnings: [],
  };
}

function completeAssessment() {
  const timing = {
    clockMappingId: 'take-clock-map-1',
    confidence: 0.9,
    expectedTick: 0,
    observedLogicalFrame: 240,
    signedErrorMicroseconds: 5_000,
    source: 'exact-logical-frame',
    uncertaintyMicroseconds: 1_000,
  };
  return {
    algorithmId: 'alignment-v1',
    algorithmVersion: '1.0.0',
    alignment: {
      algorithmId: 'alignment-v1',
      algorithmVersion: '1.0.0',
      clockMappingId: 'take-clock-map-1',
      maximumTimingUncertaintyMicroseconds: 2_000,
      parametersHash: hash('assessment-parameters'),
      timingToleranceMicroseconds: 50_000,
    },
    alignmentProvenanceHash: hash('assessment-alignment-provenance'),
    ambiguousCount: 1,
    assessmentHash: hash('practice-assessment'),
    confidence: 0.85,
    contractVersion: 1,
    correctionProvenance: {
      correctionCount: 1,
      correctionPrefixHash: hash('correction-prefix'),
      evidenceSnapshotId: 'snapshot-1',
    },
    createdAt: '2026-07-20T12:03:00Z',
    documentRevision: revision,
    evidenceSnapshotHash: hash('observed-evidence-snapshot'),
    evidenceSnapshotId: 'snapshot-1',
    expectedProjectionHash: hash('practice-expected-events'),
    id: 'assessment-1',
    matchedCount: 1,
    records: {
      ambiguous: [
        {
          candidates: [
            {
              confidence: 0.55,
              expected: { eventId: 'event-ambiguous-a', noteId: 'note-a' },
              observedEventIds: ['observed-ambiguous'],
              timing,
            },
            {
              confidence: 0.45,
              expected: { eventId: 'event-ambiguous-b', noteId: 'note-b' },
              observedEventIds: ['observed-ambiguous'],
              timing: { ...timing, expectedTick: 480 },
            },
          ],
          id: 'assessment-ambiguous-1',
          reason: 'multiple-expected',
        },
      ],
      matches: [
        {
          confidence: 0.95,
          expected: { eventId: 'event-1', noteId: 'note-1' },
          id: 'assessment-match-1',
          observedEventIds: ['observed-1'],
          pitchOutcome: 'correct',
          timing,
        },
      ],
      mode: 'complete',
      unmatchedExpected: [
        {
          confidence: 0.8,
          expected: { eventId: 'event-missed', noteId: null },
          id: 'assessment-missed-1',
          reason: 'missed',
        },
      ],
      unmatchedObserved: [
        {
          confidence: 0.7,
          id: 'assessment-extra-1',
          observedEventId: 'observed-extra',
          reason: 'extra',
        },
      ],
    },
    takeCoreHash: hash('practice-take-core'),
    takeId: 'take-1',
    unmatchedExpectedCount: 1,
    unmatchedObservedCount: 1,
  };
}

type FixtureRelationshipSemantic = 'hammer-on' | 'pull-off' | 'slide' | 'slurs' | 'ties';

const fixtureOpenMidiByString = [64, 59, 55, 50, 45, 40] as const;
const fixturePitchSpellings = [
  { accidental: 0, step: 'C' },
  { accidental: 1, step: 'C' },
  { accidental: 0, step: 'D' },
  { accidental: 1, step: 'D' },
  { accidental: 0, step: 'E' },
  { accidental: 0, step: 'F' },
  { accidental: 1, step: 'F' },
  { accidental: 0, step: 'G' },
  { accidental: 1, step: 'G' },
  { accidental: 0, step: 'A' },
  { accidental: 1, step: 'A' },
  { accidental: 0, step: 'B' },
] as const;

function fixtureWrittenPitch(stringNumber: number, tabFret: number) {
  const openMidi = fixtureOpenMidiByString[stringNumber - 1];
  if (openMidi === undefined) throw new Error('Fixture string must exist.');
  const midi = openMidi + tabFret;
  const spelling = fixturePitchSpellings[midi % 12];
  if (spelling === undefined) throw new Error('Fixture pitch spelling must exist.');
  return { ...spelling, octave: Math.floor(midi / 12) - 1 };
}

function fixtureRelationshipNote(
  id: string,
  stringNumber: number,
  tabFret: number,
  semantics: readonly unknown[],
) {
  return {
    id,
    position: { stringNumber, tabFret },
    semantics,
    soundingDurationTicks: 960,
    writtenPitch: fixtureWrittenPitch(stringNumber, tabFret),
  };
}

function fixtureRelationshipEvent(id: string, tick: number, note: unknown) {
  return {
    articulations: [],
    id,
    kind: 'guitar-event',
    notatedDurationTicks: 960,
    notes: [note],
    tick,
  };
}

function twoNoteRelationshipDocument(
  semantic: FixtureRelationshipSemantic,
  options: {
    omitReciprocal?: boolean;
    sourceDirection?: 'start' | 'stop';
    sourceFret?: number;
    sourceString?: number;
    targetFret?: number;
    targetSemantic?: FixtureRelationshipSemantic;
    targetString?: number;
  } = {},
) {
  const document = validDocument();
  const voice = firstFixtureVoice(document);
  const sourceDirection = options.sourceDirection ?? 'start';
  const targetDirection = sourceDirection === 'start' ? 'stop' : 'start';
  const sourceNote = fixtureRelationshipNote(
    'note-1',
    options.sourceString ?? 1,
    options.sourceFret ?? 0,
    [{ direction: sourceDirection, semantic, targetNoteId: 'note-2' }],
  );
  const targetNote = fixtureRelationshipNote(
    'note-2',
    options.targetString ?? 1,
    options.targetFret ?? 0,
    options.omitReciprocal
      ? []
      : [
          {
            direction: targetDirection,
            semantic: options.targetSemantic ?? semantic,
            targetNoteId: 'note-1',
          },
        ],
  );
  voice.events = [
    fixtureRelationshipEvent('event-1', 0, sourceNote),
    fixtureRelationshipEvent('event-2', 960, targetNote),
    { durationTicks: 1_920, id: 'rest-1', kind: 'rest', tick: 1_920 },
  ] as never;
  return document;
}

describe('Practice System core contracts', () => {
  it('accepts a renderer-independent, integer-time PracticeDocument', () => {
    const result = PracticeDocumentSchema.parse(validDocument());

    expect(result.ppq).toBe(960);
    expect(result.tracks[0]?.voices[0]?.events[0]?.kind).toBe('guitar-event');
  });

  it('pins the v1 canonical document PPQ to 960', () => {
    expect(PracticeDocumentSchema.safeParse({ ...validDocument(), ppq: 480 }).success).toBe(false);
    expect(PracticeDocumentSchema.safeParse({ ...validDocument(), ppq: 1_920 }).success).toBe(
      false,
    );
  });

  it('requires qualified, lowercase SHA-256 identities', () => {
    expect(QualifiedHashSchema.safeParse({ digestHex: 'A'.repeat(64) }).success).toBe(false);
    expect(QualifiedHashSchema.safeParse(hash('content')).success).toBe(true);
    expect(
      QualifiedHashSchema.safeParse({ ...hash('content'), projectionId: undefined }).success,
    ).toBe(false);
  });

  it('pins specialized content identities to their registered v1 schema and projection', () => {
    const contentHash = hash('practice-document-content');
    expect(PracticeDocumentContentHashSchema.safeParse(contentHash).success).toBe(true);
    expect(
      PracticeDocumentContentHashSchema.safeParse({ ...contentHash, schemaVersion: 999 }).success,
    ).toBe(false);
    expect(
      PracticeDocumentContentHashSchema.safeParse({ ...contentHash, projectionVersion: 999 })
        .success,
    ).toBe(false);

    expect(QualifiedHashSchema.safeParse({ ...contentHash, schemaVersion: 999 }).success).toBe(
      true,
    );
    expect(QualifiedHashSchema.safeParse({ ...contentHash, projectionVersion: 999 }).success).toBe(
      true,
    );
  });

  it('rejects empty, reversed, fractional, and unsafe musical ranges', () => {
    expect(MusicalRangeSchema.safeParse({ startTick: 1, endTickExclusive: 1 }).success).toBe(false);
    expect(MusicalRangeSchema.safeParse({ startTick: 2, endTickExclusive: 1 }).success).toBe(false);
    expect(MusicalRangeSchema.safeParse({ startTick: 0.5, endTickExclusive: 1 }).success).toBe(
      false,
    );
    expect(
      MusicalRangeSchema.safeParse({ startTick: 0, endTickExclusive: Number.MAX_SAFE_INTEGER + 1 })
        .success,
    ).toBe(false);
  });

  it('requires tick-zero, strictly ordered tempo entries', () => {
    expect(TempoMapSchema.safeParse([{ microsecondsPerQuarter: 500_000, tick: 1 }]).success).toBe(
      false,
    );
    expect(
      TempoMapSchema.safeParse([
        { microsecondsPerQuarter: 500_000, tick: 0 },
        { microsecondsPerQuarter: 400_000, tick: 0 },
      ]).success,
    ).toBe(false);
    expect(
      TempoMapSchema.safeParse(
        Array.from({ length: 100_001 }, (_, tick) => ({
          microsecondsPerQuarter: 500_000,
          tick,
        })),
      ).success,
    ).toBe(false);
  });

  it('rejects inferred, malformed, or MIDI-overflowing guitar configurations', () => {
    const guitar = validDocument().guitar;
    expect(
      PracticeGuitarConfigurationSchema.safeParse({
        ...guitar,
        tuning: [...guitar.tuning].reverse(),
      }).success,
    ).toBe(false);
    expect(PracticeGuitarConfigurationSchema.safeParse({ ...guitar, capoFret: 25 }).success).toBe(
      false,
    );
    expect(
      PracticeGuitarConfigurationSchema.safeParse({
        ...guitar,
        tuning: [{ openMidi: 120, stringNumber: 1 }],
      }).success,
    ).toBe(false);
  });

  it('rejects pitch as a competing writable truth', () => {
    const document = validDocument();
    const voice = firstFixtureVoice(document);
    const firstEvent = voice.events.at(0);
    if (firstEvent === undefined) throw new Error('The fixture must contain a guitar event.');
    voice.events[0] = {
      ...firstEvent,
      notes: [
        {
          id: 'note-1',
          position: { stringNumber: 1, tabFret: 0 },
          semantics: [],
          soundingDurationTicks: 960,
          writtenPitch: { accidental: 0, octave: 4, step: 'F' },
        },
      ],
    } as (typeof document.tracks)[number]['voices'][number]['events'][number];

    expect(PracticeDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects opaque and unresolved relationship semantics at the document boundary', () => {
    const unresolved = validDocument();
    const event = firstFixtureVoice(unresolved).events.at(0);
    if (event?.kind !== 'guitar-event' || event.notes === undefined) {
      throw new Error('The fixture must contain a guitar event.');
    }
    const note = event.notes.at(0);
    if (note === undefined) throw new Error('The fixture must contain a guitar note.');
    (note.semantics as unknown[]).push({
      direction: 'start',
      semantic: 'slide',
      targetNoteId: 'missing-note',
    });
    expect(PracticeDocumentSchema.safeParse(unresolved).success).toBe(false);

    const opaque = validDocument();
    const opaqueEvent = firstFixtureVoice(opaque).events.at(0);
    if (opaqueEvent?.kind !== 'guitar-event' || opaqueEvent.notes === undefined) {
      throw new Error('The fixture must contain a guitar event.');
    }
    const opaqueNote = opaqueEvent.notes.at(0);
    if (opaqueNote === undefined) throw new Error('The fixture must contain a guitar note.');
    (opaqueNote.semantics as unknown[]).push({ semantic: 'vendor-extension' });
    expect(PracticeDocumentSchema.safeParse(opaque).success).toBe(false);

    const selfTie = validDocument();
    const selfTieEvent = firstFixtureVoice(selfTie).events.at(0);
    if (selfTieEvent?.kind !== 'guitar-event' || selfTieEvent.notes === undefined) {
      throw new Error('The fixture must contain a guitar event.');
    }
    const selfTieNote = selfTieEvent.notes.at(0);
    if (selfTieNote === undefined) throw new Error('The fixture must contain a guitar note.');
    (selfTieNote.semantics as unknown[]).push({
      direction: 'start',
      semantic: 'ties',
      targetNoteId: 'note-1',
    });
    expect(PracticeDocumentSchema.safeParse(selfTie).success).toBe(false);
  });

  it('accepts one reciprocal, temporal, pitch-consistent relationship pair', () => {
    const document = validDocument();
    const voice = firstFixtureVoice(document);
    const first = voice.events.at(0);
    if (first?.kind !== 'guitar-event' || first.notes === undefined) {
      throw new Error('The fixture must contain a guitar event.');
    }
    const firstNote = first.notes.at(0);
    if (firstNote === undefined) throw new Error('The fixture must contain a guitar note.');
    firstNote.semantics = [
      { direction: 'start', semantic: 'ties', targetNoteId: 'note-2' },
    ] as never;
    voice.events[1] = {
      articulations: [],
      id: 'event-2',
      kind: 'guitar-event',
      notatedDurationTicks: 960,
      notes: [
        {
          id: 'note-2',
          position: { stringNumber: 1, tabFret: 0 },
          semantics: [{ direction: 'stop', semantic: 'ties', targetNoteId: 'note-1' }] as never,
          soundingDurationTicks: 960,
          writtenPitch: { accidental: 0, octave: 4, step: 'E' },
        },
      ],
      tick: 960,
    } as never;
    expect(PracticeDocumentSchema.safeParse(document).success).toBe(true);
  });

  it('accepts each physically consistent bounded relationship kind', () => {
    const validCases: readonly [
      FixtureRelationshipSemantic,
      Parameters<typeof twoNoteRelationshipDocument>[1],
    ][] = [
      ['ties', { sourceFret: 0, targetFret: 0 }],
      ['slurs', { sourceFret: 0, targetFret: 1 }],
      ['hammer-on', { sourceFret: 0, targetFret: 2 }],
      ['pull-off', { sourceFret: 2, targetFret: 0 }],
      ['slide', { sourceFret: 0, targetFret: 3 }],
    ];
    for (const [semantic, options] of validCases) {
      expect(
        PracticeDocumentSchema.safeParse(twoNoteRelationshipDocument(semantic, options)).success,
      ).toBe(true);
    }
  });

  it('rejects branching and many-to-one relationship graphs', () => {
    const branching = validDocument();
    firstFixtureVoice(branching).events = [
      fixtureRelationshipEvent(
        'event-1',
        0,
        fixtureRelationshipNote('note-1', 1, 0, [
          { direction: 'start', semantic: 'ties', targetNoteId: 'note-2' },
          { direction: 'start', semantic: 'ties', targetNoteId: 'note-3' },
        ]),
      ),
      fixtureRelationshipEvent(
        'event-2',
        960,
        fixtureRelationshipNote('note-2', 1, 0, [
          { direction: 'stop', semantic: 'ties', targetNoteId: 'note-1' },
        ]),
      ),
      fixtureRelationshipEvent(
        'event-3',
        1_920,
        fixtureRelationshipNote('note-3', 1, 0, [
          { direction: 'stop', semantic: 'ties', targetNoteId: 'note-1' },
        ]),
      ),
      { durationTicks: 960, id: 'rest-1', kind: 'rest', tick: 2_880 },
    ] as never;
    expect(PracticeDocumentSchema.safeParse(branching).success).toBe(false);

    const manyToOne = validDocument();
    firstFixtureVoice(manyToOne).events = [
      fixtureRelationshipEvent(
        'event-1',
        0,
        fixtureRelationshipNote('note-1', 1, 0, [
          { direction: 'start', semantic: 'slurs', targetNoteId: 'note-3' },
        ]),
      ),
      fixtureRelationshipEvent(
        'event-2',
        960,
        fixtureRelationshipNote('note-2', 1, 2, [
          { direction: 'start', semantic: 'slurs', targetNoteId: 'note-3' },
        ]),
      ),
      fixtureRelationshipEvent(
        'event-3',
        1_920,
        fixtureRelationshipNote('note-3', 1, 3, [
          { direction: 'stop', semantic: 'slurs', targetNoteId: 'note-1' },
          { direction: 'stop', semantic: 'slurs', targetNoteId: 'note-2' },
        ]),
      ),
      { durationTicks: 960, id: 'rest-1', kind: 'rest', tick: 2_880 },
    ] as never;
    expect(PracticeDocumentSchema.safeParse(manyToOne).success).toBe(false);
  });

  it('rejects relationships crossing voice or track ownership', () => {
    const crossVoice = twoNoteRelationshipDocument('slurs', {
      sourceFret: 0,
      targetFret: 2,
    });
    const crossVoiceTrack = firstFixtureTrack(crossVoice);
    const crossVoiceEvents = firstFixtureVoice(crossVoice).events;
    const sourceEvent = crossVoiceEvents.at(0);
    const targetEvent = crossVoiceEvents.at(1);
    if (sourceEvent === undefined || targetEvent === undefined) {
      throw new Error('Relationship fixture must contain two events.');
    }
    crossVoiceTrack.voices = [
      { events: [sourceEvent], id: 'voice-1' },
      { events: [targetEvent], id: 'voice-2' },
    ] as never;
    expect(PracticeDocumentSchema.safeParse(crossVoice).success).toBe(false);

    const crossTrack = twoNoteRelationshipDocument('slide', {
      sourceFret: 0,
      targetFret: 2,
    });
    const originalTrack = firstFixtureTrack(crossTrack);
    const crossTrackEvents = firstFixtureVoice(crossTrack).events;
    const crossTrackSource = crossTrackEvents.at(0);
    const crossTrackTarget = crossTrackEvents.at(1);
    if (crossTrackSource === undefined || crossTrackTarget === undefined) {
      throw new Error('Relationship fixture must contain two events.');
    }
    crossTrack.tracks = [
      { ...originalTrack, voices: [{ events: [crossTrackSource], id: 'voice-1' }] },
      {
        id: 'track-2',
        name: 'Second guitar',
        voices: [{ events: [crossTrackTarget], id: 'voice-2' }],
      },
    ] as never;
    expect(PracticeDocumentSchema.safeParse(crossTrack).success).toBe(false);
  });

  it('rejects nonreciprocal, mistyped, mistimed, and physically inconsistent relations', () => {
    const invalidCases = [
      twoNoteRelationshipDocument('ties', { omitReciprocal: true }),
      twoNoteRelationshipDocument('ties', { targetSemantic: 'slurs' }),
      twoNoteRelationshipDocument('ties', { sourceDirection: 'stop' }),
      twoNoteRelationshipDocument('ties', { sourceFret: 0, targetFret: 1 }),
      twoNoteRelationshipDocument('hammer-on', { sourceFret: 2, targetFret: 1 }),
      twoNoteRelationshipDocument('hammer-on', { sourceString: 1, targetFret: 1, targetString: 2 }),
      twoNoteRelationshipDocument('pull-off', { sourceFret: 0, targetFret: 1 }),
      twoNoteRelationshipDocument('slide', { sourceFret: 1, targetFret: 1 }),
    ];
    for (const document of invalidCases) {
      expect(PracticeDocumentSchema.safeParse(document).success).toBe(false);
    }
  });

  it('rejects tuplets outside the accepted 3:2 profile', () => {
    const document = validDocument();
    const event = firstFixtureVoice(document).events.at(0);
    if (event?.kind !== 'guitar-event') throw new Error('Expected a guitar event.');
    (event as unknown as { tuplet: unknown }).tuplet = { actualNotes: 5, normalNotes: 4 };
    expect(PracticeDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects overlapping voice events and document-wide semantic ID collisions', () => {
    const overlap = validDocument();
    const overlappingEvent = firstFixtureVoice(overlap).events.at(1);
    if (overlappingEvent === undefined) throw new Error('The fixture must contain a second event.');
    overlappingEvent.tick = 959;
    expect(PracticeDocumentSchema.safeParse(overlap).success).toBe(false);

    const collision = validDocument();
    firstFixtureLoop(collision).id = 'event-1';
    expect(PracticeDocumentSchema.safeParse(collision).success).toBe(false);

    const trackEventCollision = validDocument();
    firstFixtureTrack(trackEventCollision).id = 'event-1';
    expect(PracticeDocumentSchema.safeParse(trackEventCollision).success).toBe(false);

    const voiceTrackCollision = validDocument();
    firstFixtureVoice(voiceTrackCollision).id = 'track-1';
    expect(PracticeDocumentSchema.safeParse(voiceTrackCollision).success).toBe(false);
  });

  it('rejects documents whose bounded track collection exceeds its resource cap', () => {
    const document = validDocument();
    const track = firstFixtureTrack(document);
    document.tracks = Array.from({ length: 65 }, (_, index) => {
      const clone = structuredClone(track);
      clone.id = `track-${String(index)}`;
      const voice = clone.voices.at(0);
      if (voice === undefined) throw new Error('The track fixture must contain one voice.');
      voice.id = `voice-${String(index)}`;
      voice.events.forEach((event, eventIndex) => {
        event.id = `event-${String(index)}-${String(eventIndex)}`;
        if (event.kind === 'guitar-event' && event.notes !== undefined) {
          event.notes.forEach((note, noteIndex) => {
            note.id = `note-${String(index)}-${String(noteIndex)}`;
          });
        }
      });
      return clone;
    });
    expect(PracticeDocumentSchema.safeParse(document).success).toBe(false);
  });

  it('rejects out-of-duration maps, events, sounding tails, and loops', () => {
    const map = validDocument();
    map.tempoMap.push({ microsecondsPerQuarter: 400_000, tick: 3_840 });
    expect(PracticeDocumentSchema.safeParse(map).success).toBe(false);

    const tail = validDocument();
    const first = firstFixtureVoice(tail).events.at(0);
    if (first === undefined) throw new Error('The fixture must contain a guitar event.');
    if (first.kind === 'guitar-event' && first.notes !== undefined) {
      const note = first.notes.at(0);
      if (note === undefined) throw new Error('The fixture must contain a guitar note.');
      note.soundingDurationTicks = 4_000;
    }
    expect(PracticeDocumentSchema.safeParse(tail).success).toBe(false);

    const loop = validDocument();
    firstFixtureLoop(loop).range.endTickExclusive = 3_841;
    expect(PracticeDocumentSchema.safeParse(loop).success).toBe(false);
  });

  it('keeps immutable take identity separate from mutable media availability', () => {
    const take = {
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
      createdAt: '2026-07-20T12:00:00Z',
      documentRevision: revision,
      evidenceSnapshotHash: hash('observed-evidence-snapshot'),
      evidenceSnapshotId: 'snapshot-1',
      expectedProjectionHash: hash('practice-expected-events'),
      id: 'take-1',
      countInConfigurationHash: null,
      loopPassPolicy: { kind: 'single-pass' },
      metronomeEnabled: true,
      microphoneMediaHash: hash('media-content'),
      microphoneMediaId: 'media-1',
      practiceSpeed: { denominator: 1, numerator: 1 },
      range: { endTickExclusive: 3_840, startTick: 0 },
      referenceConfigurationHash: null,
      sampleRate: 48_000,
      status: 'finalized',
      takeCoreHash: hash('practice-take-core'),
      warnings: [],
    };
    expect(PracticeTakeSchema.safeParse(take).success).toBe(true);
    expect(PracticeTakeSchema.safeParse({ ...take, microphoneMediaId: null }).success).toBe(false);

    expect(
      MediaAvailabilityStateSchema.safeParse({
        availability: 'deleted-by-user',
        contractVersion: 1,
        locator: null,
        mediaId: 'media-1',
        provenance: 'User confirmed deletion.',
        stateRevision: 2,
        updatedAt: '2026-07-20T13:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('accepts complete immutable take clock, discontinuity, calibration, and media provenance', () => {
    const result = PracticeTakeSchema.safeParse(completeTake());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provenanceCompleteness).toBe('complete');
      expect(result.data.clockAnchors.map(({ boundary }) => boundary)).toEqual([
        'recording-start',
        'pause',
        'resume',
        'stop',
      ]);
      expect(result.data.discontinuities).toHaveLength(1);
    }
  });

  it('rejects incomplete or contradictory immutable take clock provenance', () => {
    const unclosed = completeTake();
    const finalEpoch = unclosed.captureEpochs.at(-1);
    if (finalEpoch === undefined) throw new Error('The complete take must contain a final epoch.');
    (finalEpoch as { endLogicalFrameExclusive: number | null }).endLogicalFrameExclusive = null;
    expect(PracticeTakeSchema.safeParse(unclosed).success).toBe(false);

    const wrongLateBy = completeTake();
    const startAnchor = wrongLateBy.clockAnchors.at(0);
    if (startAnchor === undefined)
      throw new Error('The complete take must contain a start anchor.');
    startAnchor.lateByFrames = 5;
    expect(PracticeTakeSchema.safeParse(wrongLateBy).success).toBe(false);

    const wrongGeneration = completeTake();
    const stopAnchor = wrongGeneration.clockAnchors.at(-1);
    if (stopAnchor === undefined) throw new Error('The complete take must contain a stop anchor.');
    stopAnchor.captureGeneration = 2;
    expect(PracticeTakeSchema.safeParse(wrongGeneration).success).toBe(false);

    const missingStop = completeTake();
    missingStop.clockAnchors.pop();
    expect(PracticeTakeSchema.safeParse(missingStop).success).toBe(false);

    const epochOutsideRange = completeTake();
    const firstEpoch = epochOutsideRange.captureEpochs.at(0);
    if (firstEpoch === undefined) throw new Error('The complete take must contain an epoch.');
    firstEpoch.scoreStartTick = 3_840;
    expect(PracticeTakeSchema.safeParse(epochOutsideRange).success).toBe(false);

    const anchorOutsideRange = completeTake();
    const firstAnchor = anchorOutsideRange.clockAnchors.at(0);
    if (firstAnchor === undefined) throw new Error('The complete take must contain an anchor.');
    firstAnchor.scoreTick = 3_841;
    expect(PracticeTakeSchema.safeParse(anchorOutsideRange).success).toBe(false);

    const unknownVideoGeneration = completeTake();
    unknownVideoGeneration.takeVideoCaptureProvenance.captureGeneration = 99;
    expect(PracticeTakeSchema.safeParse(unknownVideoGeneration).success).toBe(false);
  });

  it('rejects dishonest discontinuity and finalized recording provenance', () => {
    const badReference = completeTake();
    const discontinuity = badReference.discontinuities.at(0);
    if (discontinuity === undefined)
      throw new Error('The complete take must contain a discontinuity.');
    discontinuity.afterEpochId = 'missing-epoch';
    expect(PracticeTakeSchema.safeParse(badReference).success).toBe(false);

    const includedPauseWallTime = completeTake();
    const pause = includedPauseWallTime.discontinuities.at(0);
    if (pause === undefined) throw new Error('The complete take must contain a pause.');
    pause.wallTimeExcluded = false;
    expect(PracticeTakeSchema.safeParse(includedPauseWallTime).success).toBe(false);

    const shiftedBoundary = completeTake();
    const shiftedDiscontinuity = shiftedBoundary.discontinuities.at(0);
    if (shiftedDiscontinuity === undefined) {
      throw new Error('The complete take must contain a discontinuity.');
    }
    shiftedDiscontinuity.logicalFrame = 23_999;
    expect(PracticeTakeSchema.safeParse(shiftedBoundary).success).toBe(false);

    const wrongMedia = completeTake();
    wrongMedia.microphoneRecordingProvenance.contentHash = {
      ...wrongMedia.microphoneRecordingProvenance.contentHash,
      digestHex: 'b'.repeat(64),
    };
    expect(PracticeTakeSchema.safeParse(wrongMedia).success).toBe(false);

    const videoWithAudio = completeTake();
    videoWithAudio.takeVideoCaptureProvenance = {
      ...videoWithAudio.takeVideoCaptureProvenance,
      audioTrackCount: 1,
    };
    expect(PracticeTakeSchema.safeParse(videoWithAudio).success).toBe(false);

    const reversedVideoTimestamps = completeTake();
    reversedVideoTimestamps.takeVideoCaptureProvenance.firstObservedTimestampMicroseconds = 1_000_001;
    expect(PracticeTakeSchema.safeParse(reversedVideoTimestamps).success).toBe(false);

    const prematurelyFinalizedVideo = completeTake();
    prematurelyFinalizedVideo.takeVideoCaptureProvenance.finalizedAt = '2026-07-20T11:59:59Z';
    expect(PracticeTakeSchema.safeParse(prematurelyFinalizedVideo).success).toBe(false);
  });

  it('accepts reproducible complete assessment outcomes and timing provenance', () => {
    const result = PracticeAssessmentSchema.safeParse(completeAssessment());
    expect(result.success).toBe(true);
    if (result.success && result.data.records.mode === 'complete') {
      expect(result.data.records.matches[0]?.timing?.source).toBe('exact-logical-frame');
      expect(result.data.records.ambiguous[0]?.candidates).toHaveLength(2);
    }

    const delimiterSafe = completeAssessment();
    const candidates = delimiterSafe.records.ambiguous.at(0)?.candidates;
    if (candidates === undefined) {
      throw new Error('The complete assessment must contain ambiguous candidates.');
    }
    const firstCandidate = candidates.at(0);
    const secondCandidate = candidates.at(1);
    if (firstCandidate === undefined || secondCandidate === undefined) {
      throw new Error('The complete assessment must contain two ambiguous candidates.');
    }
    firstCandidate.expected = { eventId: 'a', noteId: 'b:c' };
    firstCandidate.observedEventIds = ['d'];
    secondCandidate.expected = { eventId: 'a:b', noteId: 'c' };
    secondCandidate.observedEventIds = ['d'];
    expect(PracticeAssessmentSchema.safeParse(delimiterSafe).success).toBe(true);
  });

  it('rejects assessment count drift, source reuse, and mismatched provenance', () => {
    const wrongCount = completeAssessment();
    wrongCount.matchedCount = 2;
    expect(PracticeAssessmentSchema.safeParse(wrongCount).success).toBe(false);

    const reusedObservation = completeAssessment();
    const extra = reusedObservation.records.unmatchedObserved.at(0);
    if (extra === undefined)
      throw new Error('The complete assessment must contain an extra event.');
    extra.observedEventId = 'observed-1';
    expect(PracticeAssessmentSchema.safeParse(reusedObservation).success).toBe(false);

    const wrongAlgorithm = completeAssessment();
    wrongAlgorithm.alignment.algorithmVersion = '2.0.0';
    expect(PracticeAssessmentSchema.safeParse(wrongAlgorithm).success).toBe(false);

    const wrongSnapshot = completeAssessment();
    wrongSnapshot.correctionProvenance.evidenceSnapshotId = 'snapshot-other';
    expect(PracticeAssessmentSchema.safeParse(wrongSnapshot).success).toBe(false);

    const wrongClock = completeAssessment();
    const matchedTiming = wrongClock.records.matches.at(0)?.timing;
    if (matchedTiming === undefined) {
      throw new Error('The complete assessment must contain match timing.');
    }
    matchedTiming.clockMappingId = 'other-clock-map';
    expect(PracticeAssessmentSchema.safeParse(wrongClock).success).toBe(false);

    const oneCandidate = completeAssessment();
    const ambiguity = oneCandidate.records.ambiguous.at(0);
    if (ambiguity === undefined) throw new Error('The complete assessment must be ambiguous.');
    ambiguity.candidates.pop();
    expect(PracticeAssessmentSchema.safeParse(oneCandidate).success).toBe(false);

    const ambiguityReusesTerminalOutcome = completeAssessment();
    const reusedCandidate = ambiguityReusesTerminalOutcome.records.ambiguous[0]?.candidates[0];
    if (reusedCandidate === undefined) {
      throw new Error('The complete assessment must contain an ambiguous candidate.');
    }
    reusedCandidate.expected = { eventId: 'event-1', noteId: 'note-1' };
    reusedCandidate.observedEventIds = ['observed-1'];
    expect(PracticeAssessmentSchema.safeParse(ambiguityReusesTerminalOutcome).success).toBe(false);
  });

  it('caps complete assessment outcomes below the canonical hash node ceiling', async () => {
    const maximum = completeAssessment() as unknown as {
      ambiguousCount: number;
      matchedCount: number;
      records: {
        ambiguous: unknown[];
        matches: unknown[];
        mode: 'complete';
        unmatchedExpected: unknown[];
        unmatchedObserved: unknown[];
      };
      unmatchedExpectedCount: number;
      unmatchedObservedCount: number;
    };
    const timing = {
      clockMappingId: 'take-clock-map-1',
      confidence: 0.9,
      expectedTick: 0,
      observedLogicalFrame: 240,
      signedErrorMicroseconds: 5_000,
      source: 'exact-logical-frame',
      uncertaintyMicroseconds: 1_000,
    };
    maximum.records.matches = [];
    maximum.records.unmatchedExpected = [];
    maximum.records.unmatchedObserved = [];
    maximum.records.ambiguous = Array.from(
      { length: PRACTICE_ASSESSMENT_LIMITS.maximumOutcomeRecords },
      (_, recordIndex) => ({
        candidates: Array.from(
          { length: PRACTICE_ASSESSMENT_LIMITS.maximumAmbiguousCandidatesPerRecord },
          (_, candidateIndex) => ({
            confidence: 0.5,
            expected: {
              eventId: `event-${String(recordIndex)}-${String(candidateIndex)}`,
              noteId: `note-${String(recordIndex)}-${String(candidateIndex)}`,
            },
            observedEventIds: Array.from(
              { length: 16 },
              (_, observedIndex) =>
                `observed-${String(recordIndex)}-${String(candidateIndex)}-${String(observedIndex)}`,
            ),
            timing,
          }),
        ),
        id: `ambiguity-${String(recordIndex)}`,
        reason: 'multiple-expected',
      }),
    );
    maximum.ambiguousCount = PRACTICE_ASSESSMENT_LIMITS.maximumOutcomeRecords;
    maximum.matchedCount = 0;
    maximum.unmatchedExpectedCount = 0;
    maximum.unmatchedObservedCount = 0;

    expect(PracticeAssessmentSchema.safeParse(maximum).success).toBe(true);
    await expect(hashPracticeAssessment(maximum)).resolves.toEqual(
      expect.objectContaining({ projectionId: 'practice-assessment' }),
    );

    const overAggregateLimit = completeAssessment() as unknown as typeof maximum;
    overAggregateLimit.records.ambiguous = [];
    overAggregateLimit.records.matches = Array.from({ length: 300 }, (_, index) => ({
      confidence: 0.9,
      expected: { eventId: `matched-event-${String(index)}`, noteId: null },
      id: `match-${String(index)}`,
      observedEventIds: [`matched-observed-${String(index)}`],
      pitchOutcome: 'correct',
      timing,
    }));
    overAggregateLimit.records.unmatchedExpected = Array.from({ length: 201 }, (_, index) => ({
      confidence: 0.8,
      expected: { eventId: `missed-event-${String(index)}`, noteId: null },
      id: `missed-${String(index)}`,
      reason: 'missed',
    }));
    overAggregateLimit.records.unmatchedObserved = [];
    overAggregateLimit.ambiguousCount = 0;
    overAggregateLimit.matchedCount = 300;
    overAggregateLimit.unmatchedExpectedCount = 201;
    overAggregateLimit.unmatchedObservedCount = 0;
    expect(PracticeAssessmentSchema.safeParse(overAggregateLimit).success).toBe(false);
  });

  it('parses old v1 assessment summaries as explicitly incomplete legacy records', () => {
    const legacy = structuredClone(completeAssessment()) as Record<string, unknown>;
    delete legacy.alignment;
    delete legacy.correctionProvenance;
    delete legacy.records;
    const result = PracticeAssessmentSchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.records).toEqual({ mode: 'legacy-summary' });
  });

  it('does not allow unavailable media to retain a misleading locator', () => {
    expect(
      MediaAvailabilityStateSchema.safeParse({
        availability: 'missing',
        contractVersion: 1,
        locator: 'opfs://still-here',
        mediaId: 'media-1',
        provenance: 'Resolver could not find bytes.',
        stateRevision: 1,
        updatedAt: '2026-07-20T13:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('requires independently versioned media identity and availability records', () => {
    const identity = {
      contentHash: hash('media-content'),
      contractVersion: 1,
      formatMetadataHash: hash('media-format'),
      id: 'media-1',
      mediaKind: 'microphone-audio',
    };
    expect(MediaIdentitySchema.safeParse(identity).success).toBe(true);
    expect(MediaIdentitySchema.safeParse({ ...identity, contractVersion: 2 }).success).toBe(false);
    const { contractVersion: _contractVersion, ...unversionedIdentity } = identity;
    expect(_contractVersion).toBe(1);
    expect(MediaIdentitySchema.safeParse(unversionedIdentity).success).toBe(false);

    expect(
      MediaAvailabilityStateSchema.safeParse({
        availability: 'missing',
        contractVersion: 2,
        locator: null,
        mediaId: 'media-1',
        provenance: 'Missing.',
        stateRevision: 1,
        updatedAt: '2026-07-20T13:00:00Z',
      }).success,
    ).toBe(false);
  });

  it('keeps reference-score and take-capture maps structurally non-interchangeable', () => {
    const referenceMap = {
      anchors: [
        { mediaPtsMicroseconds: 0, scoreTick: 0 },
        { mediaPtsMicroseconds: 1_000_000, scoreTick: 960 },
      ],
      boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped',
      contractVersion: 1,
      documentRevision: revision,
      expectedProjectionHash: hash('practice-expected-events'),
      gapSegmentIndices: [],
      historySequence: 0,
      id: 'reference-map-1',
      mapHash: hash('reference-score-media-sync-map'),
      mediaContentHash: hash('media-content'),
      mediaId: 'reference-media-1',
      normalizedTimelineId: 'practice-expected-events-v1',
      parentMap: null,
      provenance: 'authored',
    };
    expect(ReferenceScoreMediaSyncMapSchema.safeParse(referenceMap).success).toBe(true);
    expect(TakeCaptureMediaSyncMapSchema.safeParse(referenceMap).success).toBe(false);
  });

  it('rejects duplicate/backward reference anchors and independently backward take anchors', () => {
    const referenceResult = ReferenceScoreMediaSyncMapSchema.safeParse({
      anchors: [
        { mediaPtsMicroseconds: 0, scoreTick: 10 },
        { mediaPtsMicroseconds: 1_000, scoreTick: 10 },
      ],
      boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped',
      contractVersion: 1,
      documentRevision: revision,
      expectedProjectionHash: hash('practice-expected-events'),
      gapSegmentIndices: [],
      historySequence: 0,
      id: 'map-1',
      mapHash: hash('reference-score-media-sync-map'),
      mediaContentHash: hash('media-content'),
      mediaId: 'media-1',
      normalizedTimelineId: 'practice-expected-events-v1',
      parentMap: null,
      provenance: 'authored',
    });
    expect(referenceResult.success).toBe(false);

    expect(
      ReferenceScoreMediaSyncMapSchema.safeParse({
        anchors: [
          { mediaPtsMicroseconds: 1_000, scoreTick: 0 },
          { mediaPtsMicroseconds: 999, scoreTick: 960 },
        ],
        boundaryPolicy: 'anchors-mapped-gap-interiors-unmapped',
        contractVersion: 1,
        documentRevision: revision,
        expectedProjectionHash: hash('practice-expected-events'),
        gapSegmentIndices: [],
        historySequence: 0,
        id: 'map-backward-pts',
        mapHash: hash('reference-score-media-sync-map'),
        mediaContentHash: hash('media-content'),
        mediaId: 'media-1',
        normalizedTimelineId: 'practice-expected-events-v1',
        parentMap: null,
        provenance: 'authored',
      }).success,
    ).toBe(false);

    const takeResult = TakeCaptureMediaSyncMapSchema.safeParse({
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
          logicalAudioFrame: 1,
          mediaPtsMicroseconds: 0,
          runtimeGeneration: 1,
          transportGeneration: 1,
        },
      ],
      boundaryPolicy: 'generation-segments-only',
      captureEpochIds: ['epoch-1'],
      contractVersion: 1,
      id: 'take-map-1',
      mapHash: hash('take-capture-media-sync-map'),
      takeCoreHash: hash('practice-take-core'),
      takeId: 'take-1',
      timestampStrategyId: 'frame-callback-observation',
      uncertaintyMicroseconds: 10_000,
      videoContentHash: hash('media-content'),
      videoMediaId: 'video-1',
    });
    expect(takeResult.success).toBe(false);
  });
});
