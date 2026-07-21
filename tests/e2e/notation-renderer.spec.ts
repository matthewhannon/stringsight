import { expect, test } from '@playwright/test';

type BrowserNotationResult = Readonly<{
  eventMappings: readonly unknown[];
  fingerprint: unknown;
  focusedGeometryIds: readonly string[];
  geometry: readonly Readonly<{
    bounds: Readonly<{ height: number; width: number; x: number; y: number }>;
    semanticTarget: Readonly<{ kind: string }>;
  }>[];
  presentationLayout: Readonly<{
    systems: readonly Readonly<{ pageIndex: number | null }>[];
  }>;
}>;

type BrowserNotationAdapter = Readonly<{
  dispose(): void;
  render(request: unknown): Promise<BrowserNotationResult>;
}>;

type BrowserNotationModule = Readonly<{
  createAlphaTabNotationAdapter(host: HTMLElement): BrowserNotationAdapter;
}>;

test('renders real semantic bounds and preserves focus through truthful notation views', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/');

  const host = page.locator('.practice-notation-host');
  const status = page.getByRole('region', { name: 'Notation preview' }).getByRole('status');
  await expect(status).toContainText('Score ready', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  for (let index = 0; index < 1; index += 1) {
    await page.getByRole('button', { name: 'Add open E note' }).click();
    await expect(status).toContainText(
      `Score ready · ${String(index + 1)} ${index === 0 ? 'event' : 'events'}`,
      { timeout: 15_000 },
    );
  }

  await expect(host).toHaveAttribute('data-notation-adapter', 'stringsight-alphatab-1.8.4');
  await expect(host).toHaveAttribute('data-notation-bounds-source', 'renderer');
  await expect(host).toHaveAttribute('data-notation-geometry-count', '2');
  await expect(host).toHaveAttribute('data-notation-flow', 'page');
  await expect(host).toHaveAttribute('data-notation-score', 'combined');
  await expect(host).toHaveAttribute('data-notation-page-count', '1');
  await expect(host.locator('svg')).not.toHaveCount(0);
  await expect(page.locator('audio')).toHaveCount(0);

  const focusKey = await host.getAttribute('data-notation-focus');
  const focusedGeometry = await host.getAttribute('data-notation-focused-geometry-ids');
  expect(focusKey).toBeTruthy();
  expect(focusedGeometry).toContain('note-');

  const modes = [
    {
      flow: 'continuous',
      label: 'Expanded notation continuous',
      score: 'expanded',
    },
    { flow: 'page', label: 'Tab-only page', score: 'tab-only' },
    { flow: 'page', label: 'Combined page', score: 'combined' },
  ] as const;
  for (const mode of modes) {
    await page.getByRole('button', { name: mode.label }).click();
    await expect(page.getByRole('button', { name: mode.label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(status).toContainText('Score ready', { timeout: 15_000 });
    await expect(host).toHaveAttribute('data-notation-flow', mode.flow);
    await expect(host).toHaveAttribute('data-notation-score', mode.score);
    await expect(host).toHaveAttribute('data-notation-focus', focusKey ?? '');
    await expect(host).toHaveAttribute('data-notation-focused-geometry-ids', focusedGeometry ?? '');
    if (mode.flow === 'continuous') {
      await expect(host.locator('.stringsight-notation-page-break')).toHaveCount(0);
      await expect(host).toHaveAttribute('data-notation-page-count', '0');
    } else {
      await expect(host).toHaveAttribute('data-notation-page-count', /^[1-9]\d*$/);
    }
    await expect(host.locator('svg')).not.toHaveCount(0);
  }

  await page.setViewportSize({ width: 900, height: 800 });
  await expect(status).toContainText('Score ready', { timeout: 15_000 });
  await expect(host).toHaveAttribute('data-notation-focus', focusKey ?? '');
  await expect(host).toHaveAttribute('data-notation-focused-geometry-ids', focusedGeometry ?? '');

  const tempo = page.getByRole('spinbutton', { name: 'Authored tempo (BPM)' });
  await tempo.fill('119');
  await page.getByRole('button', { name: 'Set tempo' }).click();
  await expect(status).toContainText('Notation unavailable', { timeout: 15_000 });
  await expect(host.locator('svg')).toHaveCount(0);
  await expect(host).not.toHaveAttribute('data-notation-adapter');

  await tempo.fill('120');
  await page.getByRole('button', { name: 'Set tempo' }).click();
  await expect(status).toContainText('Score ready', { timeout: 15_000 });
  await expect(host.locator('svg')).not.toHaveCount(0);
  await expect(page.locator('audio')).toHaveCount(0);
});

test('reconciles real multi-track, multi-voice chord bounds and clears validation failures', async ({
  page,
}) => {
  await page.goto('/');
  const summary = await page.evaluate(async () => {
    // @ts-expect-error Vite resolves this browser-only source module during the Playwright run.
    const loadedModule: unknown = await import('/src/notation/alphatab-adapter.ts');
    const { createAlphaTabNotationAdapter } = loadedModule as BrowserNotationModule;
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
    const chord = (prefix: string, tick: number) => ({
      articulations: [],
      id: `event-${prefix}`,
      kind: 'guitar-event' as const,
      notatedDurationTicks: 3_840,
      notes: [
        {
          id: `note-${prefix}-high`,
          position: { stringNumber: 1, tabFret: 0 },
          semantics: [],
          soundingDurationTicks: 3_840,
          writtenPitch: { accidental: 0, octave: 4, step: 'E' as const },
        },
        {
          id: `note-${prefix}-low`,
          position: { stringNumber: 6, tabFret: 0 },
          semantics: [],
          soundingDurationTicks: 3_840,
          writtenPitch: { accidental: 0, octave: 2, step: 'E' as const },
        },
      ],
      tick,
    });
    const document = {
      contractVersion: 1 as const,
      durationTicks: 34_560,
      expectedProjectionHash: hash('practice-expected-events', 'b'),
      guitar: {
        capoFret: 0,
        handedness: 'right' as const,
        maxPhysicalFret: 24,
        scaleLengthMm: 648,
        temperament: '12-tet' as const,
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
      keyMap: [{ fifths: 0, mode: 'major' as const, tick: 0 }],
      loopPresets: [],
      metadata: {
        createdAt: '2026-07-21T00:00:00Z',
        title: 'Real browser chord bounds',
        updatedAt: '2026-07-21T00:00:00Z',
      },
      meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
      ppq: 960,
      revision: {
        contentHash: hash('practice-document-content', 'a'),
        documentId: 'browser-bounds-document',
        revisionId: 'browser-bounds-revision',
        revisionNumber: 1,
      },
      tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
      tracks: Array.from({ length: 2 }, (_, trackIndex) => ({
        id: `track-${String(trackIndex + 1)}`,
        name: `Guitar ${String(trackIndex + 1)}`,
        voices: Array.from({ length: 2 }, (_, voiceIndex) => ({
          events: Array.from({ length: 9 }, (_, barIndex) =>
            chord(
              `${String(trackIndex + 1)}-${String(voiceIndex + 1)}-${String(barIndex + 1)}`,
              barIndex * 3_840,
            ),
          ),
          id: `voice-${String(trackIndex + 1)}-${String(voiceIndex + 1)}`,
        })),
      })),
    };
    const host = window.document.createElement('div');
    host.style.width = '1200px';
    window.document.body.append(host);
    const adapter = createAlphaTabNotationAdapter(host);
    const request = {
      document,
      focus: {
        eventId: 'event-2-2-9',
        kind: 'note' as const,
        noteId: 'note-2-2-9-low',
        trackId: 'track-2',
        voiceId: 'voice-2-2',
      },
      presentation: {
        targetBarsPerSystem: 4,
        view: { flow: 'page' as const, score: 'combined' as const },
        viewportHeight: 400,
        viewportWidth: 1_200,
        zoomPercent: 100,
      },
      previousRender: null,
    };
    const result = await adapter.render(request);
    const noteBounds = result.geometry
      .filter(({ semanticTarget }) => semanticTarget.kind === 'note')
      .map(({ bounds, semanticTarget }) => ({ bounds, semanticTarget }));
    const pageBreakCount = host.querySelectorAll('.stringsight-notation-page-break').length;
    const pageCount = result.presentationLayout.systems.reduce(
      (maximum, system) => Math.max(maximum, Number(system.pageIndex) + 1),
      0,
    );
    let validationMessage = '';
    try {
      await adapter.render({
        ...request,
        presentation: { ...request.presentation, viewportWidth: 239 },
        previousRender: result.fingerprint,
      });
    } catch (error) {
      validationMessage = error instanceof Error ? error.message : String(error);
    }
    const staleState = {
      adapterAttribute: host.getAttribute('data-notation-adapter'),
      childCount: host.childElementCount,
      svgCount: host.querySelectorAll('svg').length,
    };
    adapter.dispose();
    host.remove();
    return {
      allFinite: result.geometry.every(({ bounds }) =>
        [bounds.height, bounds.width, bounds.x, bounds.y].every(Number.isFinite),
      ),
      eventMappings: result.eventMappings.length,
      focusedGeometryIds: result.focusedGeometryIds,
      geometry: result.geometry.length,
      noteBounds,
      pageBreakCount,
      pageCount,
      staleState,
      systemCount: result.presentationLayout.systems.length,
      validationMessage,
    };
  });

  expect(summary.eventMappings).toBe(36);
  expect(summary.geometry).toBe(108);
  expect(summary.noteBounds).toHaveLength(72);
  expect(
    new Set(summary.noteBounds.map(({ bounds }) => `${String(bounds.x)}:${String(bounds.y)}`)).size,
  ).toBeGreaterThan(8);
  expect(summary.focusedGeometryIds).toHaveLength(1);
  expect(summary.allFinite).toBe(true);
  expect(summary.systemCount).toBeGreaterThan(0);
  expect(summary.pageCount).toBeGreaterThan(1);
  expect(summary.pageBreakCount).toBe(summary.pageCount - 1);
  expect(summary.validationMessage).toContain('viewportWidth');
  expect(summary.staleState).toEqual({ adapterAttribute: null, childCount: 0, svgCount: 0 });
  await expect(page.locator('audio')).toHaveCount(0);
});
