import { describe, expect, it } from 'vitest';

import type { SemanticFocus, SemanticSelection } from '../editor';
import { PracticeDocumentSchema, type PracticeDocument } from '../shared/contracts/practice';
import {
  NOTATION_ADAPTER_LIMITS,
  NOTATION_VIEW_MODES,
  determineNotationInvalidation,
  type NotationPresentation,
  type NotationRenderFingerprint,
  type NotationRenderRequest,
} from './index';
import { createFakeNotationAdapter } from './fake-adapter';
import { createReferenceNotationAdapter } from './reference-adapter';

const hash = (projectionId: string, fill: string) => ({
  algorithm: 'sha256' as const,
  canonicalizationId: 'stringsight-canonical-json' as const,
  canonicalizationVersion: 1 as const,
  digestHex: fill.repeat(64),
  projectionId,
  projectionVersion: 1 as const,
  schemaId: 'practice-document',
  schemaVersion: 1 as const,
});

const event = (barIndex: number) => ({
  articulations: [],
  id: `event-${String(barIndex + 1)}`,
  kind: 'guitar-event' as const,
  notatedDurationTicks: 480,
  notes: [
    {
      id: `note-${String(barIndex + 1)}`,
      position: { stringNumber: 1, tabFret: barIndex },
      semantics: [],
      soundingDurationTicks: 480,
      writtenPitch: [
        { accidental: 0 as const, octave: 4, step: 'E' as const },
        { accidental: 0 as const, octave: 4, step: 'F' as const },
        { accidental: 1 as const, octave: 4, step: 'F' as const },
        { accidental: 0 as const, octave: 4, step: 'G' as const },
        { accidental: 1 as const, octave: 4, step: 'G' as const },
        { accidental: 0 as const, octave: 4, step: 'A' as const },
      ][barIndex],
    },
  ],
  tick: barIndex * 3_840,
});

const documentFixture = (): PracticeDocument =>
  PracticeDocumentSchema.parse({
    contractVersion: 1,
    durationTicks: 6 * 3_840,
    expectedProjectionHash: hash('practice-expected-events', 'b'),
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
      {
        id: 'loop-bars-2-5',
        name: 'Middle four',
        range: { endTickExclusive: 5 * 3_840, startTick: 3_840 },
      },
    ],
    metadata: {
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Notation fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: hash('practice-document-content', 'a'),
      documentId: 'document-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [
      {
        id: 'track-1',
        name: 'Guitar',
        voices: [{ events: Array.from({ length: 6 }, (_, index) => event(index)), id: 'voice-1' }],
      },
    ],
  });

const presentation = (overrides: Partial<NotationPresentation> = {}): NotationPresentation => ({
  view: { flow: 'page', score: 'combined' },
  viewportHeight: 300,
  viewportWidth: 1_200,
  zoomPercent: 100,
  ...overrides,
});

const request = (
  document: PracticeDocument,
  overrides: Partial<Omit<NotationRenderRequest, 'document'>> = {},
): NotationRenderRequest => ({
  document,
  focus: null,
  presentation: presentation(),
  previousRender: null,
  ...overrides,
});

describe('renderer-independent notation adapter contract', () => {
  it('advertises a bounded, immutable and exhaustive view capability surface', () => {
    const capabilities = createReferenceNotationAdapter().capabilities;

    expect(capabilities.supportedViewModes).toEqual(NOTATION_VIEW_MODES);
    expect(new Set(capabilities.supportedViewModes)).toEqual(
      new Set(['expanded', 'page', 'continuous', 'tab-only', 'combined']),
    );
    expect(capabilities.capabilityCodes.length).toBeLessThanOrEqual(
      NOTATION_ADAPTER_LIMITS.maximumCapabilityCodes,
    );
    expect(capabilities.maximumDiagnostics).toBe(NOTATION_ADAPTER_LIMITS.maximumDiagnostics);
    expect(capabilities.maximumGeometryEntries).toBe(
      NOTATION_ADAPTER_LIMITS.maximumGeometryEntries,
    );
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Object.isFrozen(capabilities.supportedViewModes)).toBe(true);
  });

  it.each([
    ['page', 'expanded'],
    ['page', 'tab-only'],
    ['page', 'combined'],
    ['continuous', 'expanded'],
    ['continuous', 'tab-only'],
    ['continuous', 'combined'],
  ] as const)('renders %s flow with %s score content', async (flow, score) => {
    const result = await createReferenceNotationAdapter().render(
      request(documentFixture(), { presentation: presentation({ view: { flow, score } }) }),
    );

    expect(result.geometry).toHaveLength(12);
    expect(result.eventMappings).toHaveLength(6);
    expect(result.tickMappings).toHaveLength(6);
    expect(result.diagnostics).toEqual([]);
  });

  it('snapshots canonical input without mutation and returns only detached frozen data', async () => {
    const document = documentFixture();
    const before = structuredClone(document);
    const result = await createReferenceNotationAdapter().render(request(document));

    expect(document).toEqual(before);
    expect(result.source).toEqual({
      contentDigest: 'a'.repeat(64),
      documentId: 'document-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
    });
    expect(Object.keys(result).sort()).toEqual([
      'capabilities',
      'diagnostics',
      'eventMappings',
      'fingerprint',
      'focusedGeometryIds',
      'geometry',
      'invalidation',
      'presentationLayout',
      'source',
      'tickMappings',
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.geometry)).toBe(true);
    expect(Object.isFrozen(result.geometry[0]?.bounds)).toBe(true);
    expect(() => structuredClone(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toContain('renderer');
    expect(JSON.stringify(document)).not.toContain('targetBarsPerSystem');
  });

  it('rejects non-canonical object graphs and invalid presentation bounds', async () => {
    const accessorDocument = documentFixture();
    Object.defineProperty(accessorDocument, 'durationTicks', {
      enumerable: true,
      get: () => 23_040,
    });
    const adapter = createReferenceNotationAdapter();

    await expect(adapter.render(request(accessorDocument))).rejects.toMatchObject({
      code: 'ACCESSOR_PROPERTY',
    });
    await expect(
      adapter.render(
        request(documentFixture(), {
          presentation: presentation({ targetBarsPerSystem: 17 }),
        }),
      ),
    ).rejects.toThrow('targetBarsPerSystem');
    await expect(
      adapter.render(
        request(documentFixture(), { presentation: presentation({ viewportWidth: 239 }) }),
      ),
    ).rejects.toThrow('viewportWidth');
  });

  it('uses four bars per system only as the overridable presentation default', async () => {
    const adapter = createReferenceNotationAdapter();
    const document = documentFixture();
    const defaultResult = await adapter.render(request(document));
    const denseResult = await adapter.render(
      request(document, { presentation: presentation({ targetBarsPerSystem: 6 }) }),
    );
    const sparseResult = await adapter.render(
      request(document, { presentation: presentation({ targetBarsPerSystem: 2 }) }),
    );

    expect(
      defaultResult.geometry.find(({ semanticTarget }) => semanticTarget.eventId === 'event-5'),
    ).toMatchObject({ systemIndex: 1 });
    expect(
      denseResult.geometry.find(({ semanticTarget }) => semanticTarget.eventId === 'event-6'),
    ).toMatchObject({ systemIndex: 0 });
    expect(
      sparseResult.geometry.find(({ semanticTarget }) => semanticTarget.eventId === 'event-3'),
    ).toMatchObject({ systemIndex: 1 });
    expect(document.loopPresets[0]?.range).toEqual({
      endTickExclusive: 19_200,
      startTick: 3_840,
    });
  });

  it('provides stable collision-safe event and half-open tick mappings', async () => {
    const adapter = createReferenceNotationAdapter();
    const first = await adapter.render(request(documentFixture()));
    const second = await adapter.render(request(structuredClone(documentFixture())));

    expect(second.eventMappings).toEqual(first.eventMappings);
    expect(second.tickMappings).toEqual(first.tickMappings);
    expect(second.geometry).toEqual(first.geometry);
    expect(first.eventMappings[1]).toEqual({
      endTickExclusive: 4_320,
      eventId: 'event-2',
      geometryIds: [
        'event:7:track-1|7:voice-1|7:event-2',
        'note:7:track-1|7:voice-1|7:event-2|6:note-2',
      ],
      startTick: 3_840,
      trackId: 'track-1',
      voiceId: 'voice-1',
    });
    expect(first.tickMappings[1]).toEqual({
      endTickExclusive: 4_320,
      geometryIds: first.eventMappings[1]?.geometryIds,
      startTick: 3_840,
    });
    expect(new Set(first.geometry.map(({ geometryId }) => geometryId)).size).toBe(
      first.geometry.length,
    );
  });

  it('maps document, track, voice, event and note focus semantically without glyph focus', async () => {
    const adapter = createReferenceNotationAdapter();
    const focuses: readonly [SemanticFocus, number][] = [
      [{ kind: 'document' }, 12],
      [{ kind: 'track', trackId: 'track-1' }, 12],
      [{ kind: 'voice', trackId: 'track-1', voiceId: 'voice-1' }, 12],
      [{ eventId: 'event-2', kind: 'event', trackId: 'track-1', voiceId: 'voice-1' }, 2],
      [
        {
          eventId: 'event-2',
          kind: 'note',
          noteId: 'note-2',
          trackId: 'track-1',
          voiceId: 'voice-1',
        },
        1,
      ],
    ];

    for (const [focus, count] of focuses) {
      const result = await adapter.render(request(documentFixture(), { focus }));
      expect(result.focusedGeometryIds).toHaveLength(count);
      expect(result.diagnostics).toEqual([]);
    }

    const missing = await adapter.render(
      request(documentFixture(), {
        focus: {
          eventId: 'event-missing',
          kind: 'event',
          trackId: 'track-1',
          voiceId: 'voice-1',
        },
      }),
    );
    expect(missing.focusedGeometryIds).toEqual([]);
    expect(missing.diagnostics).toEqual([
      {
        code: 'semantic-focus-not-found',
        message: 'The semantic focus target is not present in this document projection.',
        semanticId: 'event-missing',
        severity: 'warning',
      },
    ]);
    expect(missing.diagnostics.length).toBeLessThanOrEqual(
      NOTATION_ADAPTER_LIMITS.maximumDiagnostics,
    );
  });

  it('classifies invalidation deterministically with content, layout and focus priority', async () => {
    const adapter = createReferenceNotationAdapter();
    const initial = await adapter.render(request(documentFixture()));
    expect(initial.invalidation).toEqual({ kind: 'initial', reasons: ['initial-render'] });

    const unchanged = await adapter.render(
      request(documentFixture(), { previousRender: initial.fingerprint }),
    );
    expect(unchanged.invalidation).toEqual({ kind: 'none', reasons: [] });

    const focused = await adapter.render(
      request(documentFixture(), {
        focus: { eventId: 'event-1', kind: 'event', trackId: 'track-1', voiceId: 'voice-1' },
        previousRender: unchanged.fingerprint,
      }),
    );
    expect(focused.invalidation).toEqual({ kind: 'focus', reasons: ['focus-changed'] });

    const reflowed = await adapter.render(
      request(documentFixture(), {
        focus: { eventId: 'event-1', kind: 'event', trackId: 'track-1', voiceId: 'voice-1' },
        presentation: presentation({ targetBarsPerSystem: 2 }),
        previousRender: focused.fingerprint,
      }),
    );
    expect(reflowed.invalidation).toEqual({
      kind: 'layout',
      reasons: ['presentation-changed'],
    });

    const changedDocument = documentFixture();
    changedDocument.revision.contentHash.digestHex = 'c'.repeat(64);
    const changed = await adapter.render(
      request(changedDocument, {
        presentation: presentation({ targetBarsPerSystem: 2 }),
        previousRender: reflowed.fingerprint,
      }),
    );
    expect(changed.invalidation).toEqual({ kind: 'content', reasons: ['document-changed'] });

    const next = { ...initial.fingerprint, focusKey: 'changed', presentationKey: 'changed' };
    expect(determineNotationInvalidation(initial.fingerprint, next)).toEqual({
      kind: 'layout',
      reasons: ['presentation-changed'],
    });
  });

  it('preserves semantic selection, loop and focus identity through dense and sparse reflow', async () => {
    const adapter = createReferenceNotationAdapter();
    const document = documentFixture();
    const focus: SemanticFocus = {
      eventId: 'event-5',
      kind: 'note',
      noteId: 'note-5',
      trackId: 'track-1',
      voiceId: 'voice-1',
    };
    const selection: SemanticSelection = {
      anchor: {
        eventId: 'event-2',
        noteId: 'note-2',
        trackId: 'track-1',
        voiceId: 'voice-1',
      },
      focus: {
        eventId: 'event-5',
        noteId: 'note-5',
        trackId: 'track-1',
        voiceId: 'voice-1',
      },
      kind: 'range',
    };
    const beforeSelection = structuredClone(selection);
    const beforeLoop = structuredClone(document.loopPresets[0]);
    const dense = await adapter.render(
      request(document, {
        focus,
        presentation: presentation({ targetBarsPerSystem: 6, viewportWidth: 1_600 }),
      }),
    );
    const sparse = await adapter.render(
      request(document, {
        focus,
        presentation: presentation({ targetBarsPerSystem: 1, viewportWidth: 480 }),
        previousRender: dense.fingerprint,
      }),
    );

    expect(sparse.eventMappings).toEqual(dense.eventMappings);
    expect(sparse.tickMappings).toEqual(dense.tickMappings);
    expect(sparse.geometry.map(({ geometryId }) => geometryId)).toEqual(
      dense.geometry.map(({ geometryId }) => geometryId),
    );
    expect(sparse.geometry.map(({ bounds }) => bounds)).not.toEqual(
      dense.geometry.map(({ bounds }) => bounds),
    );
    expect(sparse.focusedGeometryIds).toEqual(dense.focusedGeometryIds);
    expect(selection).toEqual(beforeSelection);
    expect(document.loopPresets[0]).toEqual(beforeLoop);
  });

  it('distinguishes page surfaces from continuous flow without changing semantic mappings', async () => {
    const adapter = createReferenceNotationAdapter();
    const paged = await adapter.render(
      request(documentFixture(), {
        presentation: presentation({
          targetBarsPerSystem: 2,
          view: { flow: 'page', score: 'combined' },
        }),
      }),
    );
    const continuous = await adapter.render(
      request(documentFixture(), {
        presentation: presentation({
          targetBarsPerSystem: 2,
          view: { flow: 'continuous', score: 'combined' },
        }),
      }),
    );

    expect(Math.max(...paged.geometry.map(({ pageIndex }) => pageIndex ?? -1))).toBeGreaterThan(0);
    expect(new Set(continuous.geometry.map(({ pageIndex }) => pageIndex))).toEqual(new Set([null]));
    expect(continuous.eventMappings).toEqual(paged.eventMappings);
  });

  it('allows a renderer-independent fake to replace the reference without semantic drift', async () => {
    const reference = createReferenceNotationAdapter();
    const fake = createFakeNotationAdapter();
    const referenceResult = await reference.render(request(documentFixture()));
    const fakeResult = await fake.render(
      request(documentFixture(), { previousRender: referenceResult.fingerprint }),
    );

    expect(fake.capabilities.adapterId).not.toBe(reference.capabilities.adapterId);
    expect(fakeResult.invalidation).toEqual({ kind: 'content', reasons: ['adapter-changed'] });
    expect(fakeResult.eventMappings).toEqual(referenceResult.eventMappings);
    expect(fakeResult.tickMappings).toEqual(referenceResult.tickMappings);
    expect(fakeResult.geometry.map(({ geometryId }) => geometryId)).toEqual(
      referenceResult.geometry.map(({ geometryId }) => geometryId),
    );
    expect(fakeResult.geometry.map(({ bounds }) => bounds)).not.toEqual(
      referenceResult.geometry.map(({ bounds }) => bounds),
    );
  });

  it('handles fingerprints as finite renderer-independent values', () => {
    const fingerprint: NotationRenderFingerprint = {
      adapterId: 'adapter',
      adapterVersion: '1',
      documentContentDigest: 'a'.repeat(64),
      documentId: 'document',
      focusKey: 'none',
      presentationKey: 'page|combined|300|1200|100|4',
    };
    const switched = { ...fingerprint, adapterId: 'replacement' };

    expect(determineNotationInvalidation(fingerprint, switched)).toEqual({
      kind: 'content',
      reasons: ['adapter-changed'],
    });
    expect(() => structuredClone(fingerprint)).not.toThrow();
  });
});
