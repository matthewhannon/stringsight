import { describe, expect, it } from 'vitest';

import {
  AppErrorSchema,
  ChordEventSchema,
  ConfidenceSchema,
  CONTRACT_SCHEMA_VERSION,
  FusedEventSchema,
  NoteEventSchema,
  SessionSchema,
  TimeRangeSchema,
  VisualPositionEstimateSchema,
  WORKER_PROTOCOL_VERSION,
  WorkerInboundMessageSchema,
  WorkerOutboundMessageSchema,
  confidence,
  createAppError,
  ranksAreSequential,
  sessionTimestampMs,
} from './index';

const provenance = {
  algorithm: 'fixture-detector',
  generatedAtMs: 125,
  runId: 'run-1',
  subsystem: 'audio-analysis',
  version: '1.0.0',
} as const;

const pitchCandidate = {
  centsOffset: -3,
  confidence: 0.92,
  evidence: ['fundamental', 'harmonic-series'],
  frequencyHz: 440,
  midi: 69,
  noteName: 'A4',
  pitchClass: 'A',
  rank: 1,
  score: 0.94,
} as const;

describe('common contract invariants', () => {
  it('accepts boundary confidence values and rejects values outside the unit interval', () => {
    expect(ConfidenceSchema.parse(0)).toBe(0);
    expect(confidence(1)).toBe(1);
    expect(() => confidence(-0.01)).toThrow();
    expect(() => confidence(1.01)).toThrow();
  });

  it('creates non-negative session timestamps', () => {
    expect(sessionTimestampMs(42)).toBe(42);
    expect(() => sessionTimestampMs(-1)).toThrow();
  });

  it('requires a time range to move forward', () => {
    expect(TimeRangeSchema.parse({ startMs: 10, endMs: 20 })).toEqual({
      endMs: 20,
      startMs: 10,
    });
    expect(TimeRangeSchema.safeParse({ startMs: 20, endMs: 10 }).success).toBe(false);
  });

  it('recognizes only one-based sequential candidate ranks', () => {
    expect(ranksAreSequential([{ rank: 1 }, { rank: 2 }])).toBe(true);
    expect(ranksAreSequential([{ rank: 1 }, { rank: 3 }])).toBe(false);
  });
});

describe('prediction contracts', () => {
  it('parses a versioned note event and supplies default diagnostics', () => {
    const event = NoteEventSchema.parse({
      candidates: [pitchCandidate],
      id: 'note-1',
      kind: 'note',
      lifecycle: 'provisional',
      provenance,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs: 180, startMs: 100 },
    });

    expect(event.diagnostics).toEqual({});
    expect(event.candidates).toMatchObject([{ noteName: 'A4' }]);
  });

  it('rejects malformed and non-sequential pitch candidates', () => {
    const invalidCandidate = { ...pitchCandidate, noteName: 'not-a-note', rank: 2 };
    const result = NoteEventSchema.safeParse({
      candidates: [invalidCandidate],
      id: 'note-1',
      kind: 'note',
      lifecycle: 'finalized',
      provenance,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { startMs: 100 },
    });

    expect(result.success).toBe(false);
  });

  it('parses a ranked chord prediction', () => {
    const event = ChordEventSchema.parse({
      candidates: [
        {
          confidence: 0.87,
          pitchClasses: ['A', 'C', 'E'],
          quality: 'minor',
          rank: 1,
          root: 'A',
          score: 0.9,
          symbol: 'Am',
        },
      ],
      id: 'chord-1',
      kind: 'chord',
      lifecycle: 'finalized',
      provenance,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs: 900, startMs: 200 },
    });

    expect(event.candidates).toMatchObject([{ symbol: 'Am' }]);
  });

  it('validates visual uncertainty and fret geometry without requiring calibration', () => {
    const estimate = VisualPositionEstimateSchema.parse({
      absoluteFretAlignments: [
        {
          absoluteFretAtReference: 5,
          anchors: ['single-dot', 'geometry'],
          probability: 0.72,
          rank: 1,
          referencePosition: 0.4,
        },
      ],
      fretRanges: [{ endFret: 7, probability: 0.81, rank: 1, startFret: 5 }],
      fretboardConfidence: 0.88,
      handConfidence: 0.76,
      handLandmarks: [{ index: 8, point: { x: 0.5, y: 0.25 } }],
      id: 'visual-1',
      observedAtMs: 225,
      provenance: { ...provenance, subsystem: 'fretboard-analysis' },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      trackingState: 'tracking',
    });

    expect(estimate.fretRanges[0]).toMatchObject({ startFret: 5, endFret: 7 });
    expect(
      VisualPositionEstimateSchema.safeParse({
        ...estimate,
        fretRanges: [{ endFret: 4, probability: 0.8, rank: 1, startFret: 5 }],
      }).success,
    ).toBe(false);
  });

  it('parses fused candidates that retain their evidence and audio-only state', () => {
    const event = FusedEventSchema.parse({
      audioOnlyFallback: false,
      candidates: [
        {
          chordSymbol: 'Am',
          confidence: 0.89,
          evidence: [
            { eventId: 'chord-1', source: 'audio-analysis', weight: 0.9 },
            { eventId: 'visual-1', source: 'fretboard-analysis', weight: 0.7 },
          ],
          midiNotes: [45, 52, 57, 60, 64],
          pitchClasses: ['A', 'C', 'E'],
          positions: [
            { confidence: 0.91, fret: 0, midi: 45, string: 5 },
            { confidence: 0.84, fret: 2, midi: 52, string: 4 },
          ],
          rank: 1,
          score: 1.6,
          transitionCost: 0.2,
        },
      ],
      id: 'fused-1',
      kind: 'chord',
      lifecycle: 'finalized',
      provenance: { ...provenance, subsystem: 'fusion' },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      sourceEventIds: ['chord-1'],
      time: { endMs: 900, startMs: 200 },
      visualEstimateIds: ['visual-1'],
    });

    const [bestCandidate] = event.candidates;
    if (!bestCandidate) {
      throw new Error('Expected a fused candidate.');
    }

    expect(bestCandidate.evidence).toHaveLength(2);
    expect(
      FusedEventSchema.safeParse({
        ...event,
        candidates: [{ ...bestCandidate, rank: 2 }],
      }).success,
    ).toBe(false);
  });
});

describe('session, worker, and error contracts', () => {
  it('validates a replayable session and chronological persistence metadata', () => {
    const session = {
      corrections: [],
      createdAt: '2026-07-17T18:00:00-07:00',
      events: { audio: [], fused: [], visual: [] },
      id: 'session-1',
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      settings: {
        handedness: 'right',
        maxFret: 24,
        remoteAnalysisEnabled: false,
        tuningMidiLowToHigh: [40, 45, 50, 55, 59, 64],
        visionEnabled: true,
      },
      status: 'idle',
      title: 'Fixture session',
      updatedAt: '2026-07-17T18:01:00-07:00',
    };

    expect(SessionSchema.parse(session).settings.tuningMidiLowToHigh).toHaveLength(6);
    expect(
      SessionSchema.safeParse({
        ...session,
        updatedAt: '2026-07-17T17:59:00-07:00',
      }).success,
    ).toBe(false);
  });

  it('accepts versioned requests and cancellation messages', () => {
    const request = {
      issuedAtMs: 5,
      operation: 'analyze-frame',
      payload: { frameId: 12 },
      protocolVersion: WORKER_PROTOCOL_VERSION,
      requestId: 'request-1',
      subsystem: 'fretboard-analysis',
      type: 'request',
    };
    const cancel = {
      issuedAtMs: 6,
      protocolVersion: WORKER_PROTOCOL_VERSION,
      requestId: 'cancel-1',
      subsystem: 'fretboard-analysis',
      targetRequestId: 'request-1',
      type: 'cancel',
    };

    expect(WorkerInboundMessageSchema.parse(request).type).toBe('request');
    expect(WorkerInboundMessageSchema.parse(cancel).type).toBe('cancel');
    expect(WorkerInboundMessageSchema.safeParse({ ...request, protocolVersion: 2 }).success).toBe(
      false,
    );
  });

  it('accepts progress, result, and cancellation acknowledgements', () => {
    const base = {
      issuedAtMs: 10,
      protocolVersion: WORKER_PROTOCOL_VERSION,
      requestId: 'request-1',
      subsystem: 'audio-analysis',
    } as const;

    expect(
      WorkerOutboundMessageSchema.parse({ ...base, progress: 0.5, type: 'progress' }),
    ).toMatchObject({ progress: 0.5, type: 'progress' });
    expect(
      WorkerOutboundMessageSchema.parse({ ...base, result: { midi: 69 }, type: 'result' }).type,
    ).toBe('result');
    expect(
      WorkerOutboundMessageSchema.parse({
        ...base,
        targetRequestId: 'request-1',
        type: 'cancelled',
      }).type,
    ).toBe('cancelled');
  });

  it('creates structured recoverable errors and rejects contradictory values', () => {
    const error = createAppError({
      category: 'permission',
      code: 'microphone-denied',
      id: 'error-1',
      message: 'Microphone access was denied.',
      occurredAtMs: sessionTimestampMs(12),
      retryable: true,
      severity: 'warning',
      subsystem: 'audio-capture',
      userAction: 'grant-permission',
    });

    expect(error).toMatchObject({
      details: {},
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      userAction: 'grant-permission',
    });
    expect(AppErrorSchema.safeParse({ ...error, category: 'unknown-category' }).success).toBe(
      false,
    );
  });
});
