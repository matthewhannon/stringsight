import { assertCanonicalJsonDataDomain } from '../shared/canonical-json';
import {
  PracticeDocumentSchema,
  type PracticeDocument,
  type PracticeVoiceEvent,
} from '../shared/contracts/practice';
import {
  NOTATION_ADAPTER_LIMITS,
  NOTATION_VIEW_MODES,
  type NotationAdapter,
  type NotationAdapterCapabilities,
  type NotationDiagnostic,
  type NotationEventGeometryMapping,
  type NotationGeometry,
  type NotationBounds,
  type NotationPresentationLayout,
  type NotationPresentation,
  type NotationRenderFingerprint,
  type NotationRenderRequest,
  type NotationRenderResult,
  type NotationTickGeometryMapping,
} from './contract';
import {
  determineNotationInvalidation,
  notationPresentationKey,
  semanticFocusKey,
} from './invalidation';

const CAPABILITY_CODES = Object.freeze([
  'deterministic-invalidation',
  'event-geometry',
  'presentation-layout',
  'semantic-focus',
  'tick-geometry',
] as const);

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value);
};

const boundedIdentifier = (value: string, label: string): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > NOTATION_ADAPTER_LIMITS.maximumAdapterIdentifierLength
  ) {
    throw new RangeError(
      `${label} must contain 1-${String(NOTATION_ADAPTER_LIMITS.maximumAdapterIdentifierLength)} characters.`,
    );
  }
  return value;
};

const capabilities = (adapterId: string, adapterVersion: string): NotationAdapterCapabilities =>
  deepFreeze({
    adapterId: boundedIdentifier(adapterId, 'adapterId'),
    adapterVersion: boundedIdentifier(adapterVersion, 'adapterVersion'),
    capabilityCodes: CAPABILITY_CODES,
    maximumDiagnostics: NOTATION_ADAPTER_LIMITS.maximumDiagnostics,
    maximumGeometryEntries: NOTATION_ADAPTER_LIMITS.maximumGeometryEntries,
    supportedViewModes: NOTATION_VIEW_MODES,
  });

const safeIntegerWithin = (
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be a safe integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return value;
};

const normalizePresentation = (
  presentation: NotationPresentation,
): Required<NotationPresentation> => {
  if (!['continuous', 'page'].includes(presentation.view.flow)) {
    throw new RangeError('presentation.view.flow is not supported.');
  }
  if (!['combined', 'expanded', 'tab-only'].includes(presentation.view.score)) {
    throw new RangeError('presentation.view.score is not supported.');
  }
  return deepFreeze({
    targetBarsPerSystem: safeIntegerWithin(
      presentation.targetBarsPerSystem ?? NOTATION_ADAPTER_LIMITS.defaultTargetBarsPerSystem,
      NOTATION_ADAPTER_LIMITS.minimumTargetBarsPerSystem,
      NOTATION_ADAPTER_LIMITS.maximumTargetBarsPerSystem,
      'presentation.targetBarsPerSystem',
    ),
    view: { ...presentation.view },
    viewportHeight: safeIntegerWithin(
      presentation.viewportHeight,
      NOTATION_ADAPTER_LIMITS.minimumViewportPixels,
      NOTATION_ADAPTER_LIMITS.maximumViewportPixels,
      'presentation.viewportHeight',
    ),
    viewportWidth: safeIntegerWithin(
      presentation.viewportWidth,
      NOTATION_ADAPTER_LIMITS.minimumViewportPixels,
      NOTATION_ADAPTER_LIMITS.maximumViewportPixels,
      'presentation.viewportWidth',
    ),
    zoomPercent: safeIntegerWithin(
      presentation.zoomPercent,
      NOTATION_ADAPTER_LIMITS.minimumZoomPercent,
      NOTATION_ADAPTER_LIMITS.maximumZoomPercent,
      'presentation.zoomPercent',
    ),
  });
};

const eventDuration = (event: PracticeVoiceEvent): number =>
  event.kind === 'rest' ? event.durationTicks : event.notatedDurationTicks;

const semanticGeometryId = (kind: 'event' | 'note', ...segments: readonly string[]): string =>
  `${kind}:${segments.map((segment) => `${String(segment.length)}:${segment}`).join('|')}`;

type BarPosition = Readonly<{ barIndex: number; offsetRatio: number }>;

const barPositionAtTick = (document: PracticeDocument, tick: number): BarPosition => {
  let precedingBars = 0;
  for (let index = 0; index < document.meterMap.length; index += 1) {
    const meter = document.meterMap[index];
    if (meter === undefined)
      throw new Error('A validated Practice Document has a meter at tick zero.');
    const nextTick = document.meterMap[index + 1]?.tick ?? document.durationTicks;
    const measureNumeratorTicks = document.ppq * 4 * meter.numerator;
    const segmentEnd = Math.min(nextTick, document.durationTicks);
    if (tick < segmentEnd || index === document.meterMap.length - 1) {
      const scaledOffset = Math.max(0, tick - meter.tick) * meter.denominator;
      return {
        barIndex: precedingBars + Math.floor(scaledOffset / measureNumeratorTicks),
        offsetRatio: (scaledOffset % measureNumeratorTicks) / measureNumeratorTicks,
      };
    }
    const scaledLength = Math.max(0, segmentEnd - meter.tick) * meter.denominator;
    precedingBars += Math.ceil(scaledLength / measureNumeratorTicks);
  }
  return { barIndex: precedingBars, offsetRatio: 0 };
};

const round = (value: number): number => Math.round(value * 1_000) / 1_000;

type LayoutContext = Readonly<{
  barsPerSystem: number;
  contentWidth: number;
  pageHeight: number;
  presentation: Required<NotationPresentation>;
  scale: number;
  systemHeight: number;
  systemsPerPage: number;
}>;

const layoutContext = (presentation: Required<NotationPresentation>): LayoutContext => {
  const scale = presentation.zoomPercent / 100;
  const baseSystemHeight =
    presentation.view.score === 'expanded'
      ? 220
      : presentation.view.score === 'combined'
        ? 160
        : 110;
  const systemHeight = baseSystemHeight * scale;
  const pageHeight = presentation.viewportHeight;
  return {
    barsPerSystem: presentation.targetBarsPerSystem,
    contentWidth: Math.max(1, presentation.viewportWidth - 48 * scale),
    pageHeight,
    presentation,
    scale,
    systemHeight,
    systemsPerPage: Math.max(1, Math.floor((pageHeight - 48 * scale) / systemHeight)),
  };
};

const geometryBounds = (
  document: PracticeDocument,
  event: PracticeVoiceEvent,
  voiceLane: number,
  noteLane: number,
  context: LayoutContext,
): Readonly<{
  bounds: { height: number; width: number; x: number; y: number };
  pageIndex: number | null;
  systemIndex: number;
}> => {
  const start = barPositionAtTick(document, event.tick);
  const end = barPositionAtTick(
    document,
    Math.min(event.tick + eventDuration(event), document.durationTicks),
  );
  const systemIndex = Math.floor(start.barIndex / context.barsPerSystem);
  const barInSystem = start.barIndex % context.barsPerSystem;
  const barWidth = context.contentWidth / context.barsPerSystem;
  const pageIndex =
    context.presentation.view.flow === 'page'
      ? Math.floor(systemIndex / context.systemsPerPage)
      : null;
  const systemOnSurface =
    context.presentation.view.flow === 'page' ? systemIndex % context.systemsPerPage : systemIndex;
  const startInSystem = barInSystem + start.offsetRatio;
  const endInSystem =
    end.barIndex === start.barIndex
      ? barInSystem + end.offsetRatio
      : Math.min(context.barsPerSystem, barInSystem + 1);
  const width = Math.max(8 * context.scale, (endInSystem - startInSystem) * barWidth);
  return {
    bounds: {
      height: round(24 * context.scale),
      width: round(width),
      x: round(24 * context.scale + startInSystem * barWidth + noteLane * 2 * context.scale),
      y: round(
        24 * context.scale +
          systemOnSurface * context.systemHeight +
          voiceLane * 28 * context.scale,
      ),
    },
    pageIndex,
    systemIndex,
  };
};

const unionBounds = (entries: readonly NotationBounds[]): NotationBounds => {
  const left = Math.min(...entries.map(({ x }) => x));
  const top = Math.min(...entries.map(({ y }) => y));
  const right = Math.max(...entries.map(({ width, x }) => x + width));
  const bottom = Math.max(...entries.map(({ height, y }) => y + height));
  return { height: round(bottom - top), width: round(right - left), x: left, y: top };
};

/** Test-oracle layout only; the production alphaTab adapter replaces it with renderer bounds. */
const referencePresentationLayout = (
  geometry: readonly NotationGeometry[],
  presentation: Required<NotationPresentation>,
): NotationPresentationLayout => {
  const systemIndexes = [...new Set(geometry.map(({ systemIndex }) => systemIndex))].sort(
    (left, right) => left - right,
  );
  const systems = systemIndexes.map((systemIndex) => {
    const entries = geometry.filter((entry) => entry.systemIndex === systemIndex);
    const bounds = unionBounds(entries.map(({ bounds }) => bounds));
    return {
      pageIndex: entries[0]?.pageIndex ?? null,
      presentedBounds: bounds,
      reportedBounds: bounds,
      systemIndex,
    };
  });
  const pageIndexes = [
    ...new Set(systems.flatMap(({ pageIndex }) => (pageIndex === null ? [] : [pageIndex]))),
  ].sort((left, right) => left - right);
  const pages = pageIndexes.map((pageIndex) => {
    const pageSystems = systems.filter((system) => system.pageIndex === pageIndex);
    return {
      bounds: unionBounds(pageSystems.map(({ presentedBounds }) => presentedBounds)),
      pageIndex,
      systemIndexes: pageSystems.map(({ systemIndex }) => systemIndex),
    };
  });
  return deepFreeze({
    flow: presentation.view.flow,
    pageGapPixels: 0,
    pages,
    systems,
  });
};

const focusMatches = (
  focus: NotationRenderRequest['focus'],
  target: NotationGeometry['semanticTarget'],
): boolean => {
  if (focus === null) return false;
  if (focus.kind === 'document') return true;
  if (focus.trackId !== target.trackId) return false;
  if (focus.kind === 'track') return true;
  if (focus.voiceId !== target.voiceId) return false;
  if (focus.kind === 'voice') return true;
  if (focus.eventId !== target.eventId) return false;
  if (focus.kind === 'event') return true;
  return target.kind === 'note' && focus.noteId === target.noteId;
};

const missingFocusDiagnostic = (
  focus: NotationRenderRequest['focus'],
  geometry: readonly NotationGeometry[],
): readonly NotationDiagnostic[] => {
  if (
    focus === null ||
    geometry.some(({ semanticTarget }) => focusMatches(focus, semanticTarget))
  ) {
    return [];
  }
  return [
    Object.freeze({
      code: 'semantic-focus-not-found',
      message: 'The semantic focus target is not present in this document projection.',
      semanticId:
        focus.kind === 'note'
          ? focus.noteId
          : focus.kind === 'event'
            ? focus.eventId
            : focus.kind === 'voice'
              ? focus.voiceId
              : focus.kind === 'track'
                ? focus.trackId
                : null,
      severity: 'warning' as const,
    }),
  ];
};

type AdapterOptions = Readonly<{
  adapterId?: string;
  adapterVersion?: string;
  coordinateOffset?: number;
}>;

/** Internal deterministic test oracle. It is intentionally not exported from the production barrel. */
export function createReferenceNotationAdapter(options: AdapterOptions = {}): NotationAdapter {
  const adapterCapabilities = capabilities(
    options.adapterId ?? 'stringsight-reference-notation',
    options.adapterVersion ?? '1',
  );
  const coordinateOffset = options.coordinateOffset ?? 0;
  if (!Number.isFinite(coordinateOffset) || Math.abs(coordinateOffset) > 10_000) {
    throw new RangeError(
      'coordinateOffset must be finite and have an absolute value at most 10000.',
    );
  }

  const render = (request: NotationRenderRequest): NotationRenderResult => {
    assertCanonicalJsonDataDomain(request.document);
    const document = deepFreeze(PracticeDocumentSchema.parse(request.document));
    const presentation = normalizePresentation(request.presentation);
    const context = layoutContext(presentation);
    const geometry: NotationGeometry[] = [];
    const eventMappings: NotationEventGeometryMapping[] = [];
    let voiceLane = 0;

    for (const track of document.tracks) {
      for (const voice of track.voices) {
        for (const event of voice.events) {
          const geometryIds: string[] = [];
          const eventGeometryId = semanticGeometryId('event', track.id, voice.id, event.id);
          const eventLayout = geometryBounds(document, event, voiceLane, 0, context);
          geometryIds.push(eventGeometryId);
          geometry.push({
            ...eventLayout,
            bounds: {
              ...eventLayout.bounds,
              x: eventLayout.bounds.x + coordinateOffset,
              y: eventLayout.bounds.y + coordinateOffset,
            },
            geometryId: eventGeometryId,
            semanticTarget: {
              eventId: event.id,
              kind: 'event',
              trackId: track.id,
              voiceId: voice.id,
            },
          });
          if (event.kind === 'guitar-event') {
            event.notes.forEach((note, noteIndex) => {
              const noteGeometryId = semanticGeometryId(
                'note',
                track.id,
                voice.id,
                event.id,
                note.id,
              );
              const noteLayout = geometryBounds(document, event, voiceLane, noteIndex + 1, context);
              geometryIds.push(noteGeometryId);
              geometry.push({
                ...noteLayout,
                bounds: {
                  ...noteLayout.bounds,
                  height: round(noteLayout.bounds.height * 0.7),
                  width: round(Math.max(6, noteLayout.bounds.width * 0.45)),
                  x: noteLayout.bounds.x + coordinateOffset,
                  y: noteLayout.bounds.y + 8 * context.scale + coordinateOffset,
                },
                geometryId: noteGeometryId,
                semanticTarget: {
                  eventId: event.id,
                  kind: 'note',
                  noteId: note.id,
                  trackId: track.id,
                  voiceId: voice.id,
                },
              });
            });
          }
          eventMappings.push({
            endTickExclusive: event.tick + eventDuration(event),
            eventId: event.id,
            geometryIds,
            startTick: event.tick,
            trackId: track.id,
            voiceId: voice.id,
          });
        }
        voiceLane += 1;
      }
    }
    if (geometry.length > NOTATION_ADAPTER_LIMITS.maximumGeometryEntries) {
      throw new RangeError('The validated document exceeds the notation geometry safety bound.');
    }

    const tickMappings: NotationTickGeometryMapping[] = eventMappings.map(
      ({ endTickExclusive, geometryIds, startTick }) => ({
        endTickExclusive,
        geometryIds,
        startTick,
      }),
    );
    const focusKey = semanticFocusKey(request.focus);
    const fingerprint: NotationRenderFingerprint = {
      adapterId: adapterCapabilities.adapterId,
      adapterVersion: adapterCapabilities.adapterVersion,
      documentContentDigest: document.revision.contentHash.digestHex,
      documentId: document.revision.documentId,
      focusKey,
      presentationKey: notationPresentationKey(presentation),
    };
    const diagnostics = missingFocusDiagnostic(request.focus, geometry);
    if (diagnostics.length > NOTATION_ADAPTER_LIMITS.maximumDiagnostics) {
      throw new RangeError('Notation diagnostics exceed the public safety bound.');
    }
    return deepFreeze({
      capabilities: adapterCapabilities,
      diagnostics,
      eventMappings,
      fingerprint,
      focusedGeometryIds: geometry
        .filter(({ semanticTarget }) => focusMatches(request.focus, semanticTarget))
        .map(({ geometryId }) => geometryId),
      geometry,
      invalidation: determineNotationInvalidation(request.previousRender, fingerprint),
      presentationLayout: referencePresentationLayout(geometry, presentation),
      source: {
        contentDigest: document.revision.contentHash.digestHex,
        documentId: document.revision.documentId,
        revisionId: document.revision.revisionId,
        revisionNumber: document.revision.revisionNumber,
      },
      tickMappings,
    });
  };

  return Object.freeze({
    capabilities: adapterCapabilities,
    render: (request: NotationRenderRequest) => Promise.resolve().then(() => render(request)),
  });
}
