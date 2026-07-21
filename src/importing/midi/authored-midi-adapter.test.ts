import { describe, expect, it } from 'vitest';

import { PracticeDocumentSchema } from '../../shared/contracts/practice';
import { verifyPracticeImportReviewBundle } from '../../shared/practice-import-integrity';
import declaredType1Hex from './__fixtures__/declared-type1.hex?raw';
import {
  AUTHORED_MIDI_ADAPTER_CAPABILITIES,
  AUTHORED_MIDI_EXPORT_PURPOSE,
  DECLARED_TYPE1_FIXTURE_SHA256,
  exportAuthoredDocumentMidi,
  importAuthoredMidi,
} from './authored-midi-adapter';

function decodeHex(source: string): Uint8Array {
  const hex = source
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('')
    .replaceAll(/\s/gu, '');
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function hash(projectionId: 'practice-document-content' | 'practice-expected-events') {
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1 as const,
    digestHex: 'a'.repeat(64),
    projectionId,
    projectionVersion: 1 as const,
    schemaId: 'practice-document' as const,
    schemaVersion: 1 as const,
  };
}

function authoredDocument() {
  return PracticeDocumentSchema.parse({
    contractVersion: 1,
    durationTicks: 960,
    expectedProjectionHash: hash('practice-expected-events'),
    guitar: {
      capoFret: 2,
      handedness: 'left',
      maxPhysicalFret: 22,
      scaleLengthMm: 650.5,
      temperament: '12-tet',
      tuning: [
        { openMidi: 62, stringNumber: 1 },
        { openMidi: 57, stringNumber: 2 },
        { openMidi: 53, stringNumber: 3 },
        { openMidi: 48, stringNumber: 4 },
        { openMidi: 43, stringNumber: 5 },
        { openMidi: 38, stringNumber: 6 },
      ],
    },
    importProvenance: {
      adapterId: 'fixture-import-adapter',
      adapterVersion: '1.0.0',
      importReportId: 'fixture-import-report',
      sourceFormat: 'fixture',
      sourceHash: hash('practice-document-content'),
    },
    keyMap: [{ fifths: 0, mode: 'major', tick: 0 }],
    loopPresets: [
      { id: 'loop-a', name: 'First phrase', range: { endTickExclusive: 480, startTick: 0 } },
    ],
    metadata: {
      artist: 'Test Artist',
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Authored MIDI fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 8, grouping: [2, 2, 3], numerator: 7, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: hash('practice-document-content'),
      documentId: 'authored-midi-document',
      revisionId: 'authored-midi-revision',
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [
      {
        id: 'authored-track',
        name: 'Guitar',
        voices: [
          {
            events: [
              {
                durationTicks: 1,
                id: 'rest-a',
                kind: 'rest',
                tick: 0,
                tuplet: { actualNotes: 3, normalNotes: 2 },
              },
              {
                articulations: [{ articulation: 'accent', semantic: 'accent' }],
                dynamic: { semantic: 'dynamics-mf', value: 'mf' },
                id: 'event-a',
                kind: 'guitar-event',
                notatedDurationTicks: 2,
                notes: [
                  {
                    id: 'note-a',
                    position: { stringNumber: 6, tabFret: 0 },
                    semantics: [{ semantic: 'palm-mute' }],
                    soundingDurationTicks: 2,
                    writtenPitch: { accidental: 0, octave: 2, step: 'E' },
                  },
                ],
                tick: 1,
                tuplet: { actualNotes: 3, normalNotes: 2 },
              },
              {
                articulations: [],
                id: 'event-b',
                kind: 'guitar-event',
                notatedDurationTicks: 2,
                notes: [
                  {
                    id: 'note-b',
                    position: { stringNumber: 6, tabFret: 3 },
                    semantics: [{ semantic: 'bend-bounded', semitones: 1 }],
                    soundingDurationTicks: 2,
                    writtenPitch: { accidental: 0, octave: 2, step: 'G' },
                  },
                ],
                tick: 3,
              },
              {
                articulations: [],
                id: 'event-c',
                kind: 'guitar-event',
                notatedDurationTicks: 955,
                notes: [
                  {
                    id: 'note-c',
                    position: { stringNumber: 5, tabFret: 0 },
                    semantics: [],
                    soundingDurationTicks: 954,
                    writtenPitch: { accidental: 0, octave: 2, step: 'A' },
                  },
                ],
                tick: 5,
              },
            ],
            id: 'authored-voice',
            name: 'Lead voice',
          },
        ],
      },
    ],
  });
}

const request = {
  fileName: 'declared-type1.mid',
  importedAt: '2026-07-20T12:00:00Z',
  title: 'Declared Type-1 fixture',
} as const;

describe('authored MIDI import adapter', () => {
  it('advertises only the exact fixture-backed import and authored-document export directions', () => {
    expect(AUTHORED_MIDI_ADAPTER_CAPABILITIES).toEqual({
      authoredDocumentExport: {
        advertised: true,
        canonicalPpq: 960,
        direction: 'authored-document-to-smf',
        evidence: 'three-960-to-480-ppq-fixtures',
        format: 'SMF Type 1',
        targetPpq: 480,
      },
      declaredFixtureImport: {
        advertised: true,
        direction: 'performance-to-draft',
        fixtureSha256Hex: [DECLARED_TYPE1_FIXTURE_SHA256],
        format: 'SMF Type 1',
        route: 'smf-type1-declared-fixtures-v1',
      },
      handlesObservedSessionMidiExport: false,
    });
  });

  it('produces one deterministic, integrity-verified draft plus explicit-loss report', async () => {
    const bytes = decodeHex(declaredType1Hex);
    const first = await importAuthoredMidi({ ...request, bytes });
    const second = await importAuthoredMidi({
      ...request,
      bytes: Uint8Array.from(bytes),
      clock: { now: () => 0 },
    });
    const deterministicFirst = await importAuthoredMidi({
      ...request,
      bytes,
      clock: { now: () => 0 },
    });
    expect(deterministicFirst).toEqual(second);
    expect(first.report).not.toBeNull();
    if (first.report === null) throw new Error('Expected a finalized import report.');
    expect(first.report).toMatchObject({
      direction: 'performance-to-draft',
      highestSeverity: 'warning',
      outcome: 'reviewable',
      reportAction: 'review-losses',
      route: 'smf-type1-declared-fixtures-v1',
      source: { sha256Hex: DECLARED_TYPE1_FIXTURE_SHA256 },
    });
    expect(first.report.findings.map(({ code, disposition }) => ({ code, disposition }))).toEqual([
      { code: 'import.smf.guitar-semantics.unsupported', disposition: 'unsupported' },
      { code: 'import.smf.type1.fixture-explicit-loss', disposition: 'approximated' },
    ]);
    expect(first.report.diagnostics.map(({ code }) => code)).toEqual([
      'import.guitar-position.ambiguous',
    ]);
    expect(first.draft).not.toBeNull();
    if (first.draft === null) throw new Error('Expected a reviewable draft.');
    await expect(
      verifyPracticeImportReviewBundle({
        bundleVersion: 1,
        draft: first.draft,
        report: first.report,
      }),
    ).resolves.toBeDefined();
    const events = first.draft.candidateDocument.tracks[0]?.voices[0]?.events;
    expect(
      events?.map((event) =>
        event.kind === 'guitar-event'
          ? {
              duration: event.notatedDurationTicks,
              midiPosition: event.notes[0]?.position,
              tick: event.tick,
              writtenPitch: event.notes[0]?.writtenPitch,
            }
          : null,
      ),
    ).toEqual([
      {
        duration: 1440,
        midiPosition: { stringNumber: 6, tabFret: 0 },
        tick: 0,
        writtenPitch: { accidental: 0, octave: 2, step: 'E' },
      },
      {
        duration: 960,
        midiPosition: { stringNumber: 5, tabFret: 2 },
        tick: 1440,
        writtenPitch: { accidental: 0, octave: 2, step: 'B' },
      },
    ]);
    expect(new Set(first.semanticDispositions.map(({ disposition }) => disposition))).toEqual(
      new Set(['approximated', 'converted', 'dropped', 'preserved', 'unsupported']),
    );
    expect(first.semanticDispositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'smf.controller-messages.dropped' }),
        expect.objectContaining({ id: 'smf.pitch-bends.dropped' }),
        expect.objectContaining({ id: 'smf.program-changes.dropped' }),
        expect.objectContaining({ id: 'smf.note-velocity.dropped' }),
        expect.objectContaining({ id: 'smf.unmatched-note-messages.dropped' }),
      ]),
    );
    for (const disposition of first.semanticDispositions.filter(({ id }) =>
      [
        'smf.controller-messages.dropped',
        'smf.pitch-bends.dropped',
        'smf.program-changes.dropped',
        'smf.note-velocity.dropped',
        'smf.unmatched-note-messages.dropped',
      ].includes(id),
    )) {
      expect(disposition.sourceEventIds).toHaveLength(disposition.affectedCount);
    }
  });

  it('fully preflights but refuses a byte-changed Type-1 file outside the exact fixture hash', async () => {
    const changed = decodeHex(declaredType1Hex);
    changed[109] = 0x55;
    const result = await importAuthoredMidi({ ...request, bytes: changed });
    expect(result.preflight?.events).toHaveLength(21);
    expect(result.draft).toBeNull();
    expect(result.report).toMatchObject({
      outcome: 'rejected',
      reportAction: 'choose-supported-format',
      route: 'smf-broad-v1',
    });
    expect(result.semanticDispositions).toEqual([
      expect.objectContaining({
        disposition: 'unsupported',
        id: 'smf.fixture-profile.unsupported',
      }),
    ]);
  });

  it('snapshots bytes once and gives metadata-distinct requests distinct identity IDs', async () => {
    const original = decodeHex(declaredType1Hex);
    const pending = importAuthoredMidi({
      ...request,
      bytes: original,
      clock: { now: () => 0 },
    });
    original.fill(0);
    const snapshotted = await pending;
    const expected = await importAuthoredMidi({
      ...request,
      bytes: decodeHex(declaredType1Hex),
      clock: { now: () => 0 },
    });
    expect(snapshotted).toEqual(expected);

    const explicitDefaultTitle = await importAuthoredMidi({
      ...request,
      bytes: decodeHex(declaredType1Hex),
      clock: { now: () => 0 },
      title: 'declared-type1',
    });
    expect(expected.draft?.draftId).not.toBe(explicitDefaultTitle.draft?.draftId);
    expect(expected.report?.reportId).not.toBe(explicitDefaultTitle.report?.reportId);
    expect(expected.draft?.candidateDocument.revision.documentId).not.toBe(
      explicitDefaultTitle.draft?.candidateDocument.revision.documentId,
    );
    expect(expected.draft?.candidateDocument.revision.revisionId).not.toBe(
      explicitDefaultTitle.draft?.candidateDocument.revision.revisionId,
    );
  });

  it('returns blocking reports without drafts for corrupt and resource-hostile bytes', async () => {
    const bytes = decodeHex(declaredType1Hex);
    const corrupt = await importAuthoredMidi({ ...request, bytes: bytes.slice(0, -1) });
    expect(corrupt).toMatchObject({ draft: null, preflight: null });
    expect(corrupt.report).not.toBeNull();
    if (corrupt.report === null) throw new Error('Expected a malformed-source report.');
    expect(corrupt.report.diagnostics.map(({ code }) => code)).toEqual(['import.source.malformed']);
    expect(corrupt.semanticDispositions[0]).toMatchObject({ disposition: 'blocking' });

    const byteLimited = await importAuthoredMidi({
      ...request,
      bytes,
      resourceBudget: { maximumSourceBytes: bytes.length - 1 },
    });
    expect(byteLimited.report).toBeNull();
    expect(byteLimited.semanticDispositions).toEqual([
      expect.objectContaining({ id: 'smf.resource.source-bytes.blocking' }),
    ]);
    expect(byteLimited.draft).toBeNull();

    const eventLimited = await importAuthoredMidi({
      ...request,
      bytes,
      resourceBudget: { maximumSourceEvents: 20 },
    });
    expect(eventLimited.report).not.toBeNull();
    if (eventLimited.report === null) throw new Error('Expected an event-limit report.');
    expect(eventLimited.report.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.source-events-exceeded',
    ]);
    expect(eventLimited.report.resources.usage.sourceEventCount).toBe(21);
    expect(eventLimited.draft).toBeNull();
  });

  it('truthfully rejects candidate output overages and reports output before elapsed overages', async () => {
    const bytes = decodeHex(declaredType1Hex);
    const outputLimitedRequest = {
      ...request,
      bytes,
      clock: { now: () => 0 },
      resourceBudget: { maximumOutputEvents: 1 },
    } as const;
    const outputLimited = await importAuthoredMidi(outputLimitedRequest);
    expect(outputLimited).toMatchObject({ draft: null, preflight: { format: 1 } });
    expect(outputLimited.report).not.toBeNull();
    if (outputLimited.report === null) throw new Error('Expected an output-limit report.');
    expect(outputLimited.report.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.output-events-exceeded',
    ]);
    expect(outputLimited.report.resources.usage.outputEventCount).toBe(2);
    expect(await importAuthoredMidi(outputLimitedRequest)).toEqual(outputLimited);

    const values = [0, 0, 0, 11];
    let index = 0;
    const bothLimited = await importAuthoredMidi({
      ...request,
      bytes,
      clock: { now: () => values[Math.min(index++, values.length - 1)] ?? 11 },
      resourceBudget: { maximumOutputEvents: 1, maximumWallClockMs: 10 },
    });
    expect(bothLimited.report).not.toBeNull();
    if (bothLimited.report === null) throw new Error('Expected a combined resource-limit report.');
    expect(bothLimited.report.diagnostics.map(({ code }) => code)).toEqual([
      'import.resource.output-events-exceeded',
      'import.resource.wall-clock-exceeded',
    ]);
    expect(bothLimited.report.resources.usage).toMatchObject({
      outputEventCount: 2,
      wallClockMs: 11,
    });
    expect(bothLimited.semanticDispositions.map(({ id }) => id)).toEqual([
      'smf.output-resource.blocking',
      'smf.projection.wall-clock.blocking',
    ]);
  });
});

describe('authored-document MIDI export adapter', () => {
  it('matches the three 960-to-480 ties-to-even cases with explicit semantic loss', () => {
    const document = authoredDocument();
    const unequalDurationEvent = document.tracks[0]?.voices[0]?.events.find(
      ({ id }) => id === 'event-c',
    );
    expect(unequalDurationEvent?.kind).toBe('guitar-event');
    if (unequalDurationEvent?.kind !== 'guitar-event') throw new Error('Expected event-c.');
    expect(unequalDurationEvent.notatedDurationTicks).not.toBe(
      unequalDurationEvent.notes[0]?.soundingDurationTicks,
    );
    const result = exportAuthoredDocumentMidi({
      document,
      purpose: AUTHORED_MIDI_EXPORT_PURPOSE,
    });
    expect(result).toMatchObject({
      direction: 'authored-document-to-smf',
      format: 'SMF Type 1',
      purpose: AUTHORED_MIDI_EXPORT_PURPOSE,
      targetPpq: 480,
    });
    expect(result.preflight).toMatchObject({ format: 1, trackCount: 2 });
    expect(result.preflight.events.find(({ kind }) => kind === 'time-signature')?.data).toEqual([
      7, 3, 24, 8,
    ]);
    const noteEvents = result.preflight.events.filter(
      ({ kind }) => kind === 'note-on' || kind === 'note-off',
    );
    expect(
      noteEvents.map(({ absoluteTick, data, kind }) => ({ absoluteTick, data, kind })),
    ).toEqual([
      { absoluteTick: 0, data: [40, 96], kind: 'note-on' },
      { absoluteTick: 2, data: [40, 0], kind: 'note-off' },
      { absoluteTick: 2, data: [45, 96], kind: 'note-on' },
      { absoluteTick: 480, data: [45, 0], kind: 'note-off' },
    ]);
    expect(result.semanticDispositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disposition: 'dropped',
          id: 'midi.note.note-b.zero-duration.dropped',
        }),
        expect.objectContaining({
          disposition: 'unsupported',
          id: 'midi.note.note-a.palm-mute.unsupported',
        }),
        expect.objectContaining({
          disposition: 'approximated',
          id: 'midi.note.note-a.velocity.approximated',
        }),
        expect.objectContaining({
          disposition: 'preserved',
          id: 'midi.conductor-events.preserved',
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.articulations.unsupported',
          sourceEventIds: ['event-a:articulation:accent:1'],
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.dynamics.unsupported',
          sourceEventIds: ['event-a:dynamic:dynamics-mf'],
        }),
        expect.objectContaining({
          affectedCount: 2,
          id: 'midi.tuplets.flattened',
          sourceEventIds: ['rest-a:tuplet:3:2', 'event-a:tuplet:3:2'],
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.tracks.flattened',
          sourceEventIds: ['authored-track'],
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.voices.flattened',
          sourceEventIds: ['authored-voice'],
        }),
      ]),
    );
    expect(result.semanticDispositions.map(({ id }) => id).sort()).toEqual([
      'midi.articulations.unsupported',
      'midi.canonical-ppq.converted',
      'midi.conductor-events.preserved',
      'midi.conductor-map-ticks.converted',
      'midi.document-contract-version.dropped',
      'midi.document-duration.converted',
      'midi.document-identities.dropped',
      'midi.document-metadata.dropped',
      'midi.dynamics.unsupported',
      'midi.guitar-events.flattened',
      'midi.guitar-physical-configuration.dropped',
      'midi.guitar-tuning-capo.converted',
      'midi.import-provenance.dropped',
      'midi.loop-presets.dropped',
      'midi.meter-grouping.dropped',
      'midi.notated-durations.dropped',
      'midi.note-identities.dropped',
      'midi.note.note-a.guitar-position.dropped',
      'midi.note.note-a.palm-mute.unsupported',
      'midi.note.note-a.timing.converted',
      'midi.note.note-a.velocity.approximated',
      'midi.note.note-a.written-spelling.dropped',
      'midi.note.note-b.bend-bounded.unsupported',
      'midi.note.note-b.guitar-position.dropped',
      'midi.note.note-b.written-spelling.dropped',
      'midi.note.note-b.zero-duration.dropped',
      'midi.note.note-c.guitar-position.dropped',
      'midi.note.note-c.timing.converted',
      'midi.note.note-c.velocity.approximated',
      'midi.note.note-c.written-spelling.dropped',
      'midi.rest.rest-a.preserved-as-silence',
      'midi.track-names.dropped',
      'midi.tracks.flattened',
      'midi.tuplets.flattened',
      'midi.voice-names.dropped',
      'midi.voices.flattened',
    ]);
    expect(result.semanticDispositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          affectedCount: 4,
          id: 'midi.document-metadata.dropped',
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.loop-presets.dropped',
          sourceEventIds: ['loop-a'],
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.meter-grouping.dropped',
        }),
        expect.objectContaining({
          affectedCount: 7,
          id: 'midi.guitar-tuning-capo.converted',
        }),
        expect.objectContaining({
          affectedCount: 4,
          id: 'midi.guitar-physical-configuration.dropped',
        }),
        expect.objectContaining({
          affectedCount: 3,
          id: 'midi.notated-durations.dropped',
          sourceEventIds: ['event-a', 'event-b', 'event-c'],
        }),
        expect.objectContaining({
          affectedCount: 2,
          id: 'midi.tuplets.flattened',
          sourceEventIds: ['rest-a:tuplet:3:2', 'event-a:tuplet:3:2'],
        }),
        expect.objectContaining({
          affectedCount: 1,
          id: 'midi.voice-names.dropped',
          sourceEventIds: ['authored-voice'],
        }),
      ]),
    );
    const repeated = exportAuthoredDocumentMidi({
      document: authoredDocument(),
      purpose: AUTHORED_MIDI_EXPORT_PURPOSE,
    });
    expect(Array.from(result.bytes)).toEqual(Array.from(repeated.bytes));
    expect(result.semanticDispositions).toEqual(repeated.semanticDispositions);
  });

  it('cannot be called as the observed-session evidence export path', () => {
    expect(() =>
      exportAuthoredDocumentMidi({
        document: authoredDocument(),
        purpose: 'observed-session-midi-export-v1' as typeof AUTHORED_MIDI_EXPORT_PURPOSE,
      }),
    ).toThrow('Observed-session MIDI must use its separate evidence-export adapter.');
  });
});
