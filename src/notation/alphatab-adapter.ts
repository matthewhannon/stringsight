import type { AlphaTabApi } from '@coderline/alphatab';

import type { PracticeDocument, PracticeVoiceEvent } from '../shared/contracts/practice';
import {
  NOTATION_ADAPTER_LIMITS,
  type DeepReadonly,
  type MountedNotationAdapter,
  type NotationBounds,
  type NotationDiagnostic,
  type NotationGeometry,
  type NotationPresentationLayout,
  type NotationRenderRequest,
  type NotationRenderResult,
} from './contract';
import { createReferenceNotationAdapter } from './reference-adapter';

const ALPHATAB_ADAPTER_ID = 'stringsight-alphatab-1.8.4';
const ALPHATAB_ADAPTER_VERSION = '1';
const ALPHATAB_FONT_DIRECTORY = '/font/';
const MAXIMUM_RENDER_BARS = 10_000;
const PAGE_GAP_PIXELS = 32;
const RENDER_TIMEOUT_MS = 15_000;

type AlphaTabModule = typeof import('@coderline/alphatab');
type AlphaTabSettingsJson = import('@coderline/alphatab').json.SettingsJson;
type ReadonlyVoiceEvent = DeepReadonly<PracticeVoiceEvent>;
type ReadonlyGuitarEvent = Extract<ReadonlyVoiceEvent, { kind: 'guitar-event' }>;

type EventLocator = Readonly<{
  beatOrdinal: number;
  notes: readonly Readonly<{ fret: number; rendererString: number }>[];
  trackIndex: number;
  voiceIndex: number;
}>;

type BarRange = Readonly<{
  endTickExclusive: number;
  meterIndex: number;
  startTick: number;
}>;

type AlphaTexProjection = Readonly<{
  blockers: readonly string[];
  eventLocators: ReadonlyMap<string, EventLocator>;
  source: string;
}>;

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value);
};

const eventDuration = (event: ReadonlyVoiceEvent): number =>
  event.kind === 'rest' ? event.durationTicks : event.notatedDurationTicks;

const relationTopologyBlockers = (document: DeepReadonly<PracticeDocument>): readonly string[] => {
  const blockers: string[] = [];
  for (const track of document.tracks) {
    for (const voice of track.voices) {
      const previousOnString = new Map<number, string>();
      const nextByNoteId = new Map<string, string>();
      for (let eventIndex = voice.events.length - 1; eventIndex >= 0; eventIndex -= 1) {
        const event = voice.events[eventIndex];
        if (event?.kind !== 'guitar-event') continue;
        for (const note of event.notes) {
          const next = previousOnString.get(note.position.stringNumber);
          if (next !== undefined) nextByNoteId.set(note.id, next);
          previousOnString.set(note.position.stringNumber, note.id);
        }
      }

      const previousByNoteId = new Map<string, string>();
      previousOnString.clear();
      for (const event of voice.events) {
        if (event.kind !== 'guitar-event') continue;
        for (const note of event.notes) {
          const previous = previousOnString.get(note.position.stringNumber);
          if (previous !== undefined) previousByNoteId.set(note.id, previous);
          previousOnString.set(note.position.stringNumber, note.id);
        }
      }

      for (const event of voice.events) {
        if (event.kind !== 'guitar-event') continue;
        for (const note of event.notes) {
          for (const semantic of note.semantics) {
            if (
              !('targetNoteId' in semantic) ||
              !['ties', 'hammer-on', 'pull-off', 'slide'].includes(semantic.semantic)
            ) {
              continue;
            }
            const rendererTarget =
              semantic.direction === 'start'
                ? nextByNoteId.get(note.id)
                : previousByNoteId.get(note.id);
            if (rendererTarget !== semantic.targetNoteId) {
              blockers.push(
                `${semantic.semantic} relation from ${note.id} to ${semantic.targetNoteId} is not the adjacent note on that string and cannot preserve target identity in alphaTab.`,
              );
            }
          }
        }
      }
    }
  }
  return blockers;
};

const eventKey = (trackId: string, voiceId: string, eventId: string): string =>
  [trackId, voiceId, eventId].map((value) => `${String(value.length)}:${value}`).join('|');

const relationId = (noteId: string): string => {
  let encoded = 'relation';
  for (let index = 0; index < noteId.length; index += 1) {
    encoded += `_${noteId.charCodeAt(index).toString(16)}`;
  }
  return encoded;
};

const midiPitchName = (midi: number): string => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
  return `${names[midi % 12] ?? 'C'}${String(Math.floor(midi / 12) - 1)}`;
};

const keyName = (fifths: number, mode: 'major' | 'minor'): string => {
  const major = ['cb', 'gb', 'db', 'ab', 'eb', 'bb', 'f', 'c', 'g', 'd', 'a', 'e', 'b', 'f#', 'c#'];
  const minor = [
    'abminor',
    'ebminor',
    'bbminor',
    'fminor',
    'cminor',
    'gminor',
    'dminor',
    'aminor',
    'eminor',
    'bminor',
    'f#minor',
    'c#minor',
    'g#minor',
    'd#minor',
    'a#minor',
  ];
  return (mode === 'major' ? major : minor)[fifths + 7] ?? 'c';
};

const durationDenominator = (ticks: number, ppq: number): number | null => {
  for (const denominator of [1, 2, 4, 8, 16, 32, 64, 128, 256]) {
    if ((ppq * 4) / denominator === ticks) return denominator;
  }
  return null;
};

const restTokens = (ticks: number, ppq: number): readonly string[] | null => {
  const tokens: string[] = [];
  let remaining = ticks;
  for (const denominator of [1, 2, 4, 8, 16, 32, 64, 128, 256]) {
    const duration = (ppq * 4) / denominator;
    while (Number.isInteger(duration) && remaining >= duration) {
      tokens.push(`r.${String(denominator)}`);
      remaining -= duration;
    }
  }
  return remaining === 0 ? tokens : null;
};

const buildBarRanges = (document: DeepReadonly<PracticeDocument>): readonly BarRange[] | null => {
  const ranges: BarRange[] = [];
  for (let meterIndex = 0; meterIndex < document.meterMap.length; meterIndex += 1) {
    const meter = document.meterMap[meterIndex];
    if (meter === undefined) return null;
    const segmentEnd = document.meterMap[meterIndex + 1]?.tick ?? document.durationTicks;
    const barTicks = (document.ppq * 4 * meter.numerator) / meter.denominator;
    if (!Number.isSafeInteger(barTicks) || barTicks < 1) return null;
    for (let startTick: number = meter.tick; startTick < segmentEnd; startTick += barTicks) {
      ranges.push({
        endTickExclusive: Math.min(segmentEnd, startTick + barTicks),
        meterIndex,
        startTick,
      });
      if (ranges.length > MAXIMUM_RENDER_BARS) return null;
    }
  }
  return ranges;
};

const effectsForNote = (
  event: ReadonlyGuitarEvent,
  note: ReadonlyGuitarEvent['notes'][number],
): string => {
  const effects: string[] = [];
  for (const semantic of note.semantics) {
    switch (semantic.semantic) {
      case 'ties':
        if (semantic.direction === 'stop') effects.push('t');
        break;
      case 'slurs':
        effects.push(
          `slur ${relationId(semantic.direction === 'start' ? note.id : semantic.targetNoteId)}`,
        );
        break;
      case 'hammer-on':
      case 'pull-off':
        if (semantic.direction === 'start') effects.push('h');
        break;
      case 'slide':
        if (semantic.direction === 'start') effects.push('sl');
        break;
      case 'bend-bounded':
        effects.push(`be (bend 0 0 60 ${String(semantic.semitones * 2)})`);
        break;
      case 'vibrato':
        effects.push('v');
        break;
      case 'let-ring':
        effects.push('lr');
        break;
      case 'palm-mute':
        effects.push('pm');
        break;
      case 'dead-note':
        effects.push('x');
        break;
      case 'natural-harmonic':
        effects.push('nh');
        break;
    }
  }
  for (const { articulation } of event.articulations) {
    effects.push(articulation === 'accent' ? 'ac' : 'st');
  }
  return effects.length === 0 ? '' : `{${effects.join(' ')}}`;
};

const eventToken = (
  event: ReadonlyVoiceEvent,
  ppq: number,
): Readonly<{ blocker: string | null; token: string }> => {
  const baseTicks =
    event.tuplet === undefined
      ? eventDuration(event)
      : (eventDuration(event) * event.tuplet.actualNotes) / event.tuplet.normalNotes;
  const denominator = durationDenominator(baseTicks, ppq);
  if (denominator === null) {
    return {
      blocker: `Event ${event.id} has a duration that alphaTab cannot represent exactly.`,
      token: '',
    };
  }
  const beatEffects = [
    ...(event.tuplet === undefined ? [] : ['tu 3 2']),
    ...(event.kind === 'guitar-event' && event.dynamic !== undefined ? ['dy mf'] : []),
  ];
  const beatSuffix = beatEffects.length === 0 ? '' : `{${beatEffects.join(' ')}}`;
  if (event.kind === 'rest') {
    return { blocker: null, token: `r.${String(denominator)}${beatSuffix}` };
  }
  const notes = event.notes.map(
    (note) =>
      `${String(note.position.tabFret)}.${String(note.position.stringNumber)}${effectsForNote(event, note)}`,
  );
  const notesToken = notes.length === 1 ? notes[0] : `(${notes.join(' ')})`;
  return { blocker: null, token: `${notesToken ?? 'r'}.${String(denominator)}${beatSuffix}` };
};

const mapChangesAreAtBars = (
  document: DeepReadonly<PracticeDocument>,
  ranges: readonly BarRange[],
): boolean => {
  const barStarts = new Set(ranges.map(({ startTick }) => startTick));
  return [...document.tempoMap, ...document.keyMap, ...document.meterMap].every(({ tick }) =>
    barStarts.has(tick),
  );
};

const alphaTexProjection = (document: DeepReadonly<PracticeDocument>): AlphaTexProjection => {
  const ranges = buildBarRanges(document);
  const blockers: string[] = [...relationTopologyBlockers(document)];
  if (ranges === null || ranges.length === 0) {
    return {
      blockers: ['The meter map exceeds the bounded alphaTab bar projection.'],
      eventLocators: new Map(),
      source: '',
    };
  }
  if (!mapChangesAreAtBars(document, ranges)) {
    blockers.push('Tempo, key, and meter changes must align with rendered bar boundaries.');
  }
  for (const tempo of document.tempoMap) {
    if (60_000_000 % tempo.microsecondsPerQuarter !== 0) {
      blockers.push(
        `Tempo at tick ${String(tempo.tick)} cannot be represented as an exact integer BPM value in alphaTab.`,
      );
    }
  }
  const eventLocators = new Map<string, EventLocator>();
  const tracks: string[] = [];
  const tuning = document.guitar.tuning.map(({ openMidi }) => midiPitchName(openMidi)).join(' ');
  const capo = document.guitar.capoFret === 0 ? '' : ` \\capo ${String(document.guitar.capoFret)}`;

  document.tracks.forEach((track, trackIndex) => {
    const voices: string[] = [];
    track.voices.forEach((voice, voiceIndex) => {
      const body: string[] = [];
      let beatOrdinal = 0;
      for (const [barIndex, range] of ranges.entries()) {
        let cursor = range.startTick;
        if (trackIndex === 0 && voiceIndex === 0) {
          const meter = document.meterMap[range.meterIndex];
          if (
            meter !== undefined &&
            (barIndex === 0 || ranges[barIndex - 1]?.meterIndex !== range.meterIndex)
          ) {
            body.push(`\\ts ${String(meter.numerator)} ${String(meter.denominator)}`);
          }
          const tempo = document.tempoMap.find(({ tick }) => tick === range.startTick);
          if (tempo !== undefined) {
            body.push(`\\tempo ${String(60_000_000 / tempo.microsecondsPerQuarter)}`);
          }
        }
        const key = document.keyMap.findLast(({ tick }) => tick <= range.startTick);
        if (
          key !== undefined &&
          (barIndex === 0 || document.keyMap.some(({ tick }) => tick === range.startTick))
        ) {
          body.push(`\\ks ${keyName(key.fifths, key.mode)}`);
        }
        const events = voice.events.filter(
          ({ tick }) => tick >= range.startTick && tick < range.endTickExclusive,
        );
        for (const event of events) {
          if (event.tick > cursor) {
            const rests = restTokens(event.tick - cursor, document.ppq);
            if (rests === null) {
              blockers.push(`Gap before event ${event.id} cannot be represented exactly.`);
            } else {
              body.push(...rests);
              beatOrdinal += rests.length;
            }
          }
          const token = eventToken(event, document.ppq);
          if (token.blocker !== null) blockers.push(token.blocker);
          if (event.kind === 'guitar-event') {
            for (const note of event.notes) {
              if (note.soundingDurationTicks !== event.notatedDurationTicks) {
                blockers.push(
                  `Note ${note.id} has a per-string sounding duration that alphaTab cannot represent exactly.`,
                );
              }
            }
          }
          if (event.tick + eventDuration(event) > range.endTickExclusive) {
            blockers.push(`Event ${event.id} crosses an alphaTab bar boundary.`);
          }
          eventLocators.set(eventKey(track.id, voice.id, event.id), {
            beatOrdinal,
            notes:
              event.kind === 'guitar-event'
                ? event.notes.map(({ position }) => ({
                    fret: position.tabFret,
                    rendererString: document.guitar.tuning.length - position.stringNumber + 1,
                  }))
                : [],
            trackIndex,
            voiceIndex,
          });
          if (token.token.length > 0) body.push(token.token);
          beatOrdinal += 1;
          cursor = event.tick + eventDuration(event);
        }
        if (cursor < range.endTickExclusive) {
          const rests = restTokens(range.endTickExclusive - cursor, document.ppq);
          if (rests === null) {
            blockers.push(
              `Trailing gap in bar ${String(barIndex + 1)} cannot be represented exactly.`,
            );
          } else {
            body.push(...rests);
            beatOrdinal += rests.length;
          }
        }
        if (barIndex < ranges.length - 1) body.push('|');
      }
      voices.push(`${track.voices.length > 1 ? '\\voice ' : ''}${body.join(' ')}`);
    });
    tracks.push(
      `\\track ${JSON.stringify(track.name)} \\staff {score tabs} \\tuning (${tuning})${capo} ${voices.join(' ')}`,
    );
  });

  return {
    blockers: [...new Set(blockers)].slice(0, NOTATION_ADAPTER_LIMITS.maximumDiagnostics),
    eventLocators,
    source: `\\title ${JSON.stringify(document.metadata.title)} . ${tracks.join(' ')}`,
  };
};

const diagnostic = (code: string, message: string): NotationDiagnostic =>
  Object.freeze({ code, message, semanticId: null, severity: 'error' });

class AlphaTabBoundaryFailure extends Error {
  readonly diagnosticCode: string;
  readonly diagnosticMessage: string;

  constructor(diagnosticCode: string, diagnosticMessage: string, options?: ErrorOptions) {
    super(diagnosticMessage, options);
    this.diagnosticCode = diagnosticCode;
    this.diagnosticMessage = diagnosticMessage;
  }
}

const blockedResult = (
  result: NotationRenderResult,
  diagnostics: readonly NotationDiagnostic[],
): NotationRenderResult =>
  deepFreeze({
    ...result,
    diagnostics: [...result.diagnostics, ...diagnostics].slice(
      0,
      NOTATION_ADAPTER_LIMITS.maximumDiagnostics,
    ),
    eventMappings: [],
    focusedGeometryIds: [],
    geometry: [],
    presentationLayout: {
      flow: result.presentationLayout.flow,
      pageGapPixels: 0,
      pages: [],
      systems: [],
    },
    tickMappings: [],
  });

const notationBounds = (
  bounds: Readonly<{ h: number; w: number; x: number; y: number }>,
): NotationBounds | null => {
  if (
    ![bounds.h, bounds.w, bounds.x, bounds.y].every(Number.isFinite) ||
    bounds.h < 0 ||
    bounds.w < 0
  ) {
    return null;
  }
  return { height: bounds.h, width: bounds.w, x: bounds.x, y: bounds.y };
};

const presentationLayoutFromAlphaTab = (
  api: AlphaTabApi,
  request: NotationRenderRequest,
): NotationPresentationLayout | null => {
  const lookup = api.boundsLookup;
  if (lookup === null || lookup.staffSystems.length === 0) return null;
  const rendererSystems = lookup.staffSystems
    .map((system) => ({
      bounds: notationBounds(system.realBounds),
      systemIndex: system.index,
    }))
    .sort((left, right) => (left.bounds?.y ?? 0) - (right.bounds?.y ?? 0));
  if (
    rendererSystems.some(
      ({ bounds, systemIndex }) =>
        bounds === null || !Number.isSafeInteger(systemIndex) || systemIndex < 0,
    ) ||
    new Set(rendererSystems.map(({ systemIndex }) => systemIndex)).size !== rendererSystems.length
  ) {
    return null;
  }

  let pageIndex = 0;
  let pageRendererStart = 0;
  let pageHasSystem = false;
  const systems = rendererSystems.map(({ bounds, systemIndex }) => {
    if (bounds === null) throw new Error('Renderer system bounds were validated above.');
    if (
      request.presentation.view.flow === 'page' &&
      pageHasSystem &&
      bounds.y + bounds.height - pageRendererStart > request.presentation.viewportHeight
    ) {
      pageIndex += 1;
      pageRendererStart = bounds.y;
      pageHasSystem = false;
    }
    pageHasSystem = true;
    const presentationPageIndex = request.presentation.view.flow === 'page' ? pageIndex : null;
    const offset = presentationPageIndex === null ? 0 : presentationPageIndex * PAGE_GAP_PIXELS;
    return {
      pageIndex: presentationPageIndex,
      presentedBounds: { ...bounds, y: bounds.y + offset },
      reportedBounds: bounds,
      systemIndex,
    };
  });
  const pageIndexes = [
    ...new Set(systems.flatMap(({ pageIndex: index }) => (index === null ? [] : [index]))),
  ];
  const maximumRight = Math.max(
    request.presentation.viewportWidth,
    ...systems.map(({ reportedBounds }) => reportedBounds.x + reportedBounds.width),
  );
  const rendererBottom = Math.max(
    ...systems.map(({ reportedBounds }) => reportedBounds.y + reportedBounds.height),
  );
  const pages = pageIndexes.map((index) => {
    const pageSystems = systems.filter((system) => system.pageIndex === index);
    const rendererStart = index === 0 ? 0 : (pageSystems[0]?.reportedBounds.y ?? 0);
    const nextRendererStart = systems.find((system) => system.pageIndex === index + 1)
      ?.reportedBounds.y;
    const rendererEnd = nextRendererStart ?? rendererBottom;
    return {
      bounds: {
        height: Math.max(0, rendererEnd - rendererStart),
        width: maximumRight,
        x: 0,
        y: rendererStart + index * PAGE_GAP_PIXELS,
      },
      pageIndex: index,
      systemIndexes: pageSystems.map(({ systemIndex }) => systemIndex),
    };
  });
  return deepFreeze({
    flow: request.presentation.view.flow,
    pageGapPixels: request.presentation.view.flow === 'page' ? PAGE_GAP_PIXELS : 0,
    pages,
    systems,
  });
};

const applyPresentationLayout = (
  host: HTMLElement,
  layout: NotationPresentationLayout,
): boolean => {
  const surface = host.querySelector<HTMLElement>(':scope > .at-surface');
  if (surface === null) return false;
  host.dataset.notationFlow = layout.flow;
  host.dataset.notationPageCount = String(layout.pages.length);
  host.dataset.notationSystemCount = String(layout.systems.length);
  if (layout.flow === 'continuous') return true;

  const pageStarts = layout.pages.slice(1).map((page) => {
    const firstSystemIndex = page.systemIndexes[0];
    return layout.systems.find(({ systemIndex }) => systemIndex === firstSystemIndex)
      ?.reportedBounds.y;
  });
  if (pageStarts.some((start) => start === undefined)) return false;
  const boundaries = pageStarts as number[];
  const rendererChildren = [...surface.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  for (const child of rendererChildren) {
    const top = Number.parseFloat(child.style.top);
    if (!Number.isFinite(top)) return false;
    const precedingBreaks = boundaries.filter((boundary) => top >= boundary).length;
    if (precedingBreaks > 0) {
      child.style.translate = `0 ${String(precedingBreaks * layout.pageGapPixels)}px`;
    }
  }
  const rendererHeight = Number.parseFloat(surface.style.height);
  if (!Number.isFinite(rendererHeight)) return false;
  surface.style.height = `${String(rendererHeight + boundaries.length * layout.pageGapPixels)}px`;
  boundaries.forEach((boundary, index) => {
    const pageBreak = document.createElement('div');
    pageBreak.className = 'stringsight-notation-page-break';
    pageBreak.dataset.pageBreakBefore = String(index + 1);
    pageBreak.style.height = `${String(layout.pageGapPixels)}px`;
    pageBreak.style.left = '0';
    pageBreak.style.position = 'absolute';
    pageBreak.style.top = `${String(boundary + index * layout.pageGapPixels)}px`;
    pageBreak.style.width = '100%';
    pageBreak.style.zIndex = '2';
    surface.append(pageBreak);
  });
  return true;
};

const geometryFromAlphaTab = (
  result: NotationRenderResult,
  api: AlphaTabApi,
  projection: AlphaTexProjection,
  request: NotationRenderRequest,
): Readonly<{
  geometry: readonly NotationGeometry[];
  presentationLayout: NotationPresentationLayout;
}> | null => {
  const lookup = api.boundsLookup;
  if (lookup === null || api.score === null) return null;
  const presentationLayout = presentationLayoutFromAlphaTab(api, request);
  if (presentationLayout === null) return null;
  const systemLayouts = new Map(
    presentationLayout.systems.map((system) => [system.systemIndex, system]),
  );
  const replacements = new Map<
    string,
    Pick<NotationGeometry, 'bounds' | 'pageIndex' | 'systemIndex'>
  >();
  for (const mapping of result.eventMappings) {
    const locator = projection.eventLocators.get(
      eventKey(mapping.trackId, mapping.voiceId, mapping.eventId),
    );
    if (locator === undefined) return null;
    const beats = api.score.tracks[locator.trackIndex]?.staves[0]?.bars.flatMap(
      (bar) => bar.voices[locator.voiceIndex]?.beats ?? [],
    );
    const beat = beats?.[locator.beatOrdinal];
    if (beat === undefined) return null;
    const beatBounds = lookup.findBeat(beat);
    if (beatBounds === null) return null;
    const staffSystemBounds = beatBounds.barBounds.masterBarBounds.staffSystemBounds;
    if (
      staffSystemBounds === null ||
      !Number.isSafeInteger(staffSystemBounds.index) ||
      staffSystemBounds.index < 0 ||
      !Number.isFinite(staffSystemBounds.visualBounds.y)
    ) {
      return null;
    }
    const systemLayout = systemLayouts.get(staffSystemBounds.index);
    if (systemLayout === undefined) return null;
    const rendererIdentity = {
      pageIndex: systemLayout.pageIndex,
      systemIndex: staffSystemBounds.index,
    };
    const eventGeometryId = mapping.geometryIds[0];
    if (eventGeometryId === undefined) return null;
    const eventBounds = notationBounds(beatBounds.visualBounds);
    if (eventBounds === null) return null;
    const systemOffset = systemLayout.presentedBounds.y - systemLayout.reportedBounds.y;
    replacements.set(eventGeometryId, {
      bounds: { ...eventBounds, y: eventBounds.y + systemOffset },
      ...rendererIdentity,
    });
    const noteBounds = beatBounds.notes ?? [];
    for (const [noteIndex, geometryId] of mapping.geometryIds.slice(1).entries()) {
      const noteLocator = locator.notes[noteIndex];
      if (noteLocator === undefined) return null;
      const bounds = noteBounds.find(
        ({ note }) => note.string === noteLocator.rendererString && note.fret === noteLocator.fret,
      )?.noteHeadBounds;
      if (bounds === undefined || replacements.has(geometryId)) return null;
      const noteBoundsValue = notationBounds(bounds);
      if (noteBoundsValue === null) return null;
      replacements.set(geometryId, {
        bounds: { ...noteBoundsValue, y: noteBoundsValue.y + systemOffset },
        ...rendererIdentity,
      });
    }
  }
  if (replacements.size !== result.geometry.length) return null;
  const geometry = result.geometry.map((geometry) => {
    const replacement = replacements.get(geometry.geometryId);
    if (replacement === undefined)
      throw new Error('Missing renderer-derived geometry replacement.');
    return { ...geometry, ...replacement };
  });
  return { geometry, presentationLayout };
};

const alphaTabSettings = (request: NotationRenderRequest): AlphaTabSettingsJson => ({
  core: {
    enableLazyLoading: false,
    engine: 'svg',
    fontDirectory: ALPHATAB_FONT_DIRECTORY,
    includeNoteBounds: true,
    useWorkers: false,
  },
  display: {
    barsPerRow:
      request.presentation.targetBarsPerSystem ??
      NOTATION_ADAPTER_LIMITS.defaultTargetBarsPerSystem,
    layoutMode: 'page',
    scale: request.presentation.zoomPercent / 100,
    staveProfile:
      request.presentation.view.score === 'tab-only'
        ? 'tab'
        : request.presentation.view.score === 'expanded'
          ? 'score'
          : 'scoretab',
  },
  player: { enablePlayer: false, playerMode: 'disabled', soundFont: null },
});

/**
 * Lazily mounts exact alphaTab 1.8.4 behind the renderer-independent notation contract. No
 * alphaTab score, bounds, event, API, settings, or object graph crosses this public boundary.
 */
export function createAlphaTabNotationAdapter(host: HTMLElement): MountedNotationAdapter {
  if (typeof HTMLElement === 'undefined' || !(host instanceof HTMLElement)) {
    throw new TypeError('host must be an HTMLElement.');
  }
  const reference = createReferenceNotationAdapter({
    adapterId: ALPHATAB_ADAPTER_ID,
    adapterVersion: ALPHATAB_ADAPTER_VERSION,
  });
  let api: AlphaTabApi | null = null;
  let disposed = false;
  let generation = 0;
  let cancelPending: ((reason: Error) => void) | null = null;
  const isDisposed = (): boolean => disposed;
  const renderIsStale = (renderGeneration: number, expectedApi?: AlphaTabApi): boolean =>
    disposed ||
    generation !== renderGeneration ||
    (expectedApi !== undefined && api !== expectedApi);

  const clearHostProjection = (): void => {
    host.replaceChildren();
    host.removeAttribute('data-notation-adapter');
    host.removeAttribute('data-notation-bounds-source');
    host.removeAttribute('data-notation-flow');
    host.removeAttribute('data-notation-focus');
    host.removeAttribute('data-notation-focused-geometry-ids');
    host.removeAttribute('data-notation-geometry-count');
    host.removeAttribute('data-notation-page-count');
    host.removeAttribute('data-notation-score');
    host.removeAttribute('data-notation-system-count');
    host.removeAttribute('aria-hidden');
    host.style.removeProperty('width');
    if (host.getAttribute('style') === '') host.removeAttribute('style');
  };

  const releaseRenderer = (): void => {
    cancelPending?.(new Error('The alphaTab render was superseded or disposed.'));
    cancelPending = null;
    try {
      api?.destroy();
    } catch {
      // Renderer disposal must not prevent StringSight-owned state from being cleared.
    }
    api = null;
    clearHostProjection();
  };

  const boundedRendererOperation = async <Value>(operation: () => Promise<Value>): Promise<Value> =>
    new Promise<Value>((resolve, reject) => {
      let settled = false;
      const settle = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (cancelPending === cancel) cancelPending = null;
        action();
      };
      const cancel = (reason: Error): void => settle(() => reject(reason));
      cancelPending = cancel;
      const timeout = setTimeout(
        () =>
          cancel(
            new AlphaTabBoundaryFailure(
              'alphatab-render-blocked',
              'The notation renderer exceeded the bounded load and render timeout.',
            ),
          ),
        RENDER_TIMEOUT_MS,
      );
      void Promise.resolve()
        .then(operation)
        .then(
          (value) => settle(() => resolve(value)),
          (error: unknown) =>
            settle(() =>
              reject(error instanceof Error ? error : new Error('alphaTab rendering failed.')),
            ),
        );
    });

  const render = async (request: NotationRenderRequest): Promise<NotationRenderResult> => {
    if (isDisposed()) throw new Error('The alphaTab notation adapter is disposed.');
    generation += 1;
    const renderGeneration = generation;
    releaseRenderer();
    const canonicalResult = await reference.render(request);
    if (renderIsStale(renderGeneration)) {
      throw new Error('The alphaTab canonical projection became stale before rendering.');
    }
    const projection = alphaTexProjection(request.document);
    if (projection.blockers.length > 0) {
      return blockedResult(
        canonicalResult,
        projection.blockers.map((message) => diagnostic('alphatab-projection-blocked', message)),
      );
    }

    try {
      const reconciled = await boundedRendererOperation(async () => {
        let alphaTab: AlphaTabModule;
        try {
          alphaTab = await import('@coderline/alphatab');
        } catch (error) {
          throw new AlphaTabBoundaryFailure(
            'alphatab-load-blocked',
            'The notation renderer module could not be loaded.',
            { cause: error },
          );
        }
        if (renderIsStale(renderGeneration)) {
          throw new Error('The alphaTab module load became stale before mounting.');
        }

        host.setAttribute('aria-hidden', 'true');
        host.dataset.notationAdapter = ALPHATAB_ADAPTER_ID;
        host.dataset.notationFocus = canonicalResult.fingerprint.focusKey;
        host.style.width = `${String(request.presentation.viewportWidth)}px`;

        let currentApi: AlphaTabApi;
        try {
          currentApi = new alphaTab.AlphaTabApi(host, alphaTabSettings(request));
        } catch (error) {
          throw new AlphaTabBoundaryFailure(
            'alphatab-render-blocked',
            'The notation renderer could not be initialized safely.',
            { cause: error },
          );
        }
        api = currentApi;

        try {
          await new Promise<void>((resolve, reject) => {
            currentApi.error.on((error) =>
              reject(error instanceof Error ? error : new Error('alphaTab rendering failed.')),
            );
            currentApi.postRenderFinished.on(resolve);
            currentApi.tex(projection.source, 'all');
          });
        } catch (error) {
          throw new AlphaTabBoundaryFailure(
            'alphatab-render-blocked',
            'The notation renderer failed safely.',
            { cause: error },
          );
        }
        if (renderIsStale(renderGeneration, currentApi)) {
          throw new Error('The alphaTab render became stale before completion.');
        }

        try {
          const geometryResult = geometryFromAlphaTab(
            canonicalResult,
            currentApi,
            projection,
            request,
          );
          if (
            geometryResult === null ||
            !applyPresentationLayout(host, geometryResult.presentationLayout)
          ) {
            throw new AlphaTabBoundaryFailure(
              'alphatab-geometry-blocked',
              'The renderer did not provide complete event, note, and system presentation bounds.',
            );
          }
          return geometryResult;
        } catch (error) {
          if (error instanceof AlphaTabBoundaryFailure) throw error;
          throw new AlphaTabBoundaryFailure(
            'alphatab-geometry-blocked',
            'The renderer geometry could not be reconciled safely.',
            { cause: error },
          );
        }
      });
      if (renderIsStale(renderGeneration)) {
        throw new Error('The alphaTab render became stale before completion.');
      }
      host.dataset.notationBoundsSource = 'renderer';
      host.dataset.notationFocusedGeometryIds = JSON.stringify(canonicalResult.focusedGeometryIds);
      host.dataset.notationGeometryCount = String(reconciled.geometry.length);
      host.dataset.notationScore = request.presentation.view.score;
      return deepFreeze({
        ...canonicalResult,
        geometry: reconciled.geometry,
        presentationLayout: reconciled.presentationLayout,
      });
    } catch (error) {
      if (renderIsStale(renderGeneration)) {
        throw new Error('The alphaTab render became stale before completion.', { cause: error });
      }
      generation += 1;
      releaseRenderer();
      const failure =
        error instanceof AlphaTabBoundaryFailure
          ? error
          : new AlphaTabBoundaryFailure(
              'alphatab-render-blocked',
              'The notation renderer failed safely.',
              { cause: error },
            );
      return blockedResult(canonicalResult, [
        diagnostic(failure.diagnosticCode, failure.diagnosticMessage),
      ]);
    }
  };

  return Object.freeze({
    capabilities: reference.capabilities,
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      releaseRenderer();
    },
    get disposed() {
      return disposed;
    },
    render,
  });
}
