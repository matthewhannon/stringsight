import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PracticeDocumentSchema, type PracticeDocument } from '../shared/contracts/practice';

const alphaTabMock = vi.hoisted(() => ({
  autoFinish: true,
  constructorCalls: 0,
  destroyCalls: 0,
  failConstructor: false,
  failGeometry: false,
  failRender: false,
  settings: [] as unknown[],
  sources: [] as string[],
}));

vi.mock('@coderline/alphatab', () => {
  class Emitter<Value = void> {
    private readonly listeners: ((value: Value) => void)[] = [];

    on(listener: (value: Value) => void): void {
      this.listeners.push(listener);
    }

    emit(value: Value): void {
      this.listeners.forEach((listener) => listener(value));
    }
  }

  const beat = (id: number) => ({ id, notes: [{ fret: 0, string: 6 }] });

  return {
    AlphaTabApi: class {
      readonly boundsLookup: {
        findBeat(candidate: { id: number }): null | Record<string, unknown>;
        staffSystems: readonly Record<string, unknown>[];
      };
      readonly error = new Emitter<Error>();
      readonly postRenderFinished = new Emitter();
      readonly score: Record<string, unknown>;
      private readonly host: HTMLElement;

      constructor(host: HTMLElement, settings: unknown) {
        this.host = host;
        alphaTabMock.constructorCalls += 1;
        alphaTabMock.settings.push(settings);
        if (alphaTabMock.failConstructor) throw new Error('fake constructor failure');
        const display = (settings as { display: { barsPerRow: number; scale: number } }).display;
        this.boundsLookup = {
          findBeat: (candidate: { id: number }) => {
            if (alphaTabMock.failGeometry) return null;
            const beatIndex = candidate.id % 100;
            const localSystemIndex = Math.floor(beatIndex / display.barsPerRow);
            const systemIndex = 10 + localSystemIndex;
            const systemY = localSystemIndex * 600 * display.scale;
            return {
              barBounds: {
                masterBarBounds: {
                  staffSystemBounds: {
                    index: systemIndex,
                    visualBounds: { h: 500, w: 1_000, x: 0, y: systemY },
                  },
                },
              },
              notes: Array.from({ length: 6 }, (_, stringIndex) =>
                Array.from({ length: 25 }, (_, fret) => ({
                  note: { fret, string: stringIndex + 1 },
                  noteHeadBounds: {
                    h: 6 * display.scale,
                    w: 7 * display.scale,
                    x: candidate.id * 10 + stringIndex + 2,
                    y: candidate.id * 10 + fret + 3,
                  },
                })),
              ).flat(),
              visualBounds: {
                h: 20 * display.scale,
                w: 30 * display.scale,
                x: candidate.id * 10,
                y: candidate.id * 10 + systemY + 1,
              },
            };
          },
          staffSystems: Array.from({ length: 16 }, (_, localSystemIndex) => ({
            index: 10 + localSystemIndex,
            realBounds: {
              h: 500 * display.scale,
              w: 1_000,
              x: 0,
              y: localSystemIndex * 600 * display.scale,
            },
          })),
        };
        this.score = {
          tracks: Array.from({ length: 2 }, (_, trackIndex) => ({
            staves: [
              {
                bars: [
                  {
                    voices: Array.from({ length: 2 }, (_, voiceIndex) => ({
                      beats: Array.from({ length: 32 }, (_, beatIndex) =>
                        beat(trackIndex * 1_000 + voiceIndex * 100 + beatIndex),
                      ),
                    })),
                  },
                ],
              },
            ],
          })),
        };
        const surface = document.createElement('div');
        surface.className = 'at-surface';
        surface.style.height = `${String(16 * 600 * display.scale)}px`;
        Array.from({ length: 16 }, (_, localSystemIndex) => {
          const system = document.createElement('div');
          system.style.position = 'absolute';
          system.style.top = `${String(localSystemIndex * 600 * display.scale)}px`;
          system.append(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
          surface.append(system);
        });
        host.append(surface);
      }

      destroy(): void {
        alphaTabMock.destroyCalls += 1;
      }

      tex(source: string): void {
        alphaTabMock.sources.push(source);
        if (!alphaTabMock.autoFinish) return;
        queueMicrotask(() => {
          if (alphaTabMock.failRender) this.error.emit(new Error('fake render failure'));
          else this.postRenderFinished.emit();
        });
      }
    },
  };
});

import { createAlphaTabNotationAdapter, type NotationRenderRequest } from './index';

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

const noteEvent = (id: string, overrides: Record<string, unknown> = {}) => ({
  articulations: [],
  id: `event-${id}`,
  kind: 'guitar-event',
  notatedDurationTicks: 960,
  notes: [
    {
      id: `note-${id}`,
      position: { stringNumber: 1, tabFret: 0 },
      semantics: [],
      soundingDurationTicks: 960,
      writtenPitch: { accidental: 0, octave: 4, step: 'E' },
    },
  ],
  tick: 0,
  ...overrides,
});

const documentFixture = (tracks = 1, voices = 1): PracticeDocument =>
  PracticeDocumentSchema.parse({
    contractVersion: 1,
    durationTicks: 3_840,
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
    loopPresets: [],
    metadata: {
      createdAt: '2026-07-20T12:00:00Z',
      title: 'alphaTab adapter fixture',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: hash('practice-document-content', 'a'),
      documentId: 'document-alphatab',
      revisionId: 'revision-alphatab',
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: Array.from({ length: tracks }, (_, trackIndex) => ({
      id: `track-${String(trackIndex + 1)}`,
      name: `Guitar ${String(trackIndex + 1)}`,
      voices: Array.from({ length: voices }, (_, voiceIndex) => ({
        events: [noteEvent(`${String(trackIndex + 1)}-${String(voiceIndex + 1)}`)],
        id: `voice-${String(trackIndex + 1)}-${String(voiceIndex + 1)}`,
      })),
    })),
  });

const documentWithEvents = (
  events: readonly unknown[],
  overrides: Readonly<Record<string, unknown>> = {},
): PracticeDocument => {
  const base = documentFixture();
  const track = base.tracks[0];
  const voice = track?.voices[0];
  if (track === undefined || voice === undefined) throw new Error('fixture');
  return PracticeDocumentSchema.parse({
    ...base,
    ...overrides,
    tracks: [{ ...track, voices: [{ ...voice, events }] }],
  });
};

const fullMeasureDocument = (barCount: number): PracticeDocument =>
  documentWithEvents(
    Array.from({ length: barCount }, (_, index) =>
      noteEvent(`bar-${String(index + 1)}`, {
        notatedDurationTicks: 3_840,
        notes: [
          {
            id: `note-bar-${String(index + 1)}`,
            position: { stringNumber: 1, tabFret: 0 },
            semantics: [],
            soundingDurationTicks: 3_840,
            writtenPitch: { accidental: 0, octave: 4, step: 'E' },
          },
        ],
        tick: index * 3_840,
      }),
    ),
    { durationTicks: barCount * 3_840 },
  );

const request = (document: PracticeDocument): NotationRenderRequest => ({
  document,
  focus: null,
  presentation: {
    view: { flow: 'page', score: 'combined' },
    viewportHeight: 800,
    viewportWidth: 1_200,
    zoomPercent: 100,
  },
  previousRender: null,
});

describe('alphaTab mounted notation adapter', () => {
  beforeEach(() => {
    alphaTabMock.autoFinish = true;
    alphaTabMock.constructorCalls = 0;
    alphaTabMock.destroyCalls = 0;
    alphaTabMock.failConstructor = false;
    alphaTabMock.failGeometry = false;
    alphaTabMock.failRender = false;
    alphaTabMock.settings.length = 0;
    alphaTabMock.sources.length = 0;
  });

  it('lazy-loads and mounts player-disabled alphaTab with the accepted font and presentation', async () => {
    const host = document.createElement('div');
    const adapter = createAlphaTabNotationAdapter(host);
    expect(alphaTabMock.constructorCalls).toBe(0);

    const result = await adapter.render(request(documentFixture()));

    expect(alphaTabMock.constructorCalls).toBe(1);
    expect(alphaTabMock.settings[0]).toEqual({
      core: {
        enableLazyLoading: false,
        engine: 'svg',
        fontDirectory: '/font/',
        includeNoteBounds: true,
        useWorkers: false,
      },
      display: {
        barsPerRow: 4,
        layoutMode: 'page',
        scale: 1,
        staveProfile: 'scoretab',
      },
      player: { enablePlayer: false, playerMode: 'disabled', soundFont: null },
    });
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host).toHaveAttribute('aria-hidden', 'true');
    expect(result.geometry).toHaveLength(2);
    expect(result.geometry[0]?.bounds).toEqual({ height: 20, width: 30, x: 0, y: 1 });
    expect(result.diagnostics).toEqual([]);
  });

  it('projects every canonical track and voice and reconciles every geometry mapping', async () => {
    const host = document.createElement('div');
    const result = await createAlphaTabNotationAdapter(host).render(request(documentFixture(2, 2)));
    const source = alphaTabMock.sources[0] ?? '';

    expect(source.match(/\\track /g)).toHaveLength(2);
    expect(source.match(/\\voice /g)).toHaveLength(4);
    expect(result.eventMappings).toHaveLength(4);
    expect(result.geometry).toHaveLength(8);
    expect(new Set(result.geometry.map(({ bounds }) => bounds.x)).size).toBeGreaterThan(1);
    expect(result.diagnostics).toEqual([]);

    const actual =
      await vi.importActual<typeof import('@coderline/alphatab')>('@coderline/alphatab');
    const parsed = actual.importer.ScoreLoader.loadAlphaTex(source);
    expect(parsed.tracks).toHaveLength(2);
    expect(parsed.tracks[0]?.staves[0]?.bars[0]?.voices).toHaveLength(2);
  });

  it('reconciles chord note bounds by renderer string and fret identity rather than array order', async () => {
    const document = documentWithEvents([
      noteEvent('chord', {
        notes: [
          {
            id: 'note-high-e',
            position: { stringNumber: 1, tabFret: 0 },
            semantics: [],
            soundingDurationTicks: 960,
            writtenPitch: { accidental: 0, octave: 4, step: 'E' },
          },
          {
            id: 'note-low-e',
            position: { stringNumber: 6, tabFret: 0 },
            semantics: [],
            soundingDurationTicks: 960,
            writtenPitch: { accidental: 0, octave: 2, step: 'E' },
          },
        ],
      }),
    ]);

    const result = await createAlphaTabNotationAdapter(window.document.createElement('div')).render(
      request(PracticeDocumentSchema.parse(document)),
    );
    const noteGeometry = result.geometry.filter(
      ({ semanticTarget }) => semanticTarget.kind === 'note',
    );

    expect(
      noteGeometry.map(({ semanticTarget }) =>
        semanticTarget.kind === 'note' ? semanticTarget.noteId : null,
      ),
    ).toEqual(['note-high-e', 'note-low-e']);
    expect(noteGeometry.map(({ bounds }) => bounds.x)).toEqual([7, 2]);
    expect(noteGeometry.every(({ systemIndex }) => systemIndex === 10)).toBe(true);
  });

  it('projects accepted tuplets, dynamics, articulations and note techniques explicitly', async () => {
    const document = documentFixture();
    const canonicalEvent = document.tracks[0]?.voices[0]?.events[0];
    if (canonicalEvent?.kind !== 'guitar-event') throw new Error('fixture');
    canonicalEvent.articulations = [
      { articulation: 'accent', semantic: 'accent' },
      { articulation: 'staccato', semantic: 'staccato' },
    ];
    canonicalEvent.dynamic = { semantic: 'dynamics-mf', value: 'mf' };
    const techniqueNote = canonicalEvent.notes[0];
    if (techniqueNote === undefined) throw new Error('fixture');
    techniqueNote.semantics = [
      { semantic: 'bend-bounded', semitones: 1 },
      { semantic: 'vibrato' },
      { semantic: 'let-ring' },
      { semantic: 'palm-mute' },
      { semantic: 'dead-note' },
      { semantic: 'natural-harmonic' },
    ];
    const validated = PracticeDocumentSchema.parse(document);

    const result = await createAlphaTabNotationAdapter(window.document.createElement('div')).render(
      request(validated),
    );
    const source = alphaTabMock.sources[0] ?? '';

    expect(source).toContain('{be (bend 0 0 60 2) v lr pm x nh ac st}');
    expect(source).toContain('{dy mf}');
    expect(result.diagnostics).toEqual([]);
    const actual =
      await vi.importActual<typeof import('@coderline/alphatab')>('@coderline/alphatab');
    const parsedTechniqueNote =
      actual.importer.ScoreLoader.loadAlphaTex(source).tracks[0]?.staves[0]?.bars[0]?.voices[0]
        ?.beats[0]?.notes[0];
    expect(parsedTechniqueNote).toMatchObject({
      isDead: true,
      isLetRing: true,
      isPalmMute: true,
      isStaccato: true,
    });

    const tupletRaw = structuredClone(documentFixture()) as unknown as {
      tracks: { voices: { events: unknown[] }[] }[];
    };
    const tupletTrack = tupletRaw.tracks[0];
    const tupletVoice = tupletTrack?.voices[0];
    if (tupletVoice === undefined) throw new Error('fixture');
    tupletVoice.events = Array.from({ length: 3 }, (_, index) => ({
      ...noteEvent(`tuplet-${String(index + 1)}`),
      notatedDurationTicks: 640,
      notes: [
        {
          id: `note-tuplet-${String(index + 1)}`,
          position: { stringNumber: 1, tabFret: 0 },
          semantics: [],
          soundingDurationTicks: 640,
          writtenPitch: { accidental: 0, octave: 4, step: 'E' },
        },
      ],
      tick: index * 640,
      tuplet: { actualNotes: 3, normalNotes: 2 },
    }));
    await createAlphaTabNotationAdapter(window.document.createElement('div')).render(
      request(PracticeDocumentSchema.parse(tupletRaw)),
    );
    expect(alphaTabMock.sources[1]).toContain('.4{tu 3 2}');
    const parsedTupletBeat = actual.importer.ScoreLoader.loadAlphaTex(alphaTabMock.sources[1] ?? '')
      .tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0];
    expect(parsedTupletBeat?.hasTuplet).toBe(true);
  });

  it('projects reciprocal ties, slurs, hammer-ons, pull-offs and slides with stable relation IDs', async () => {
    const raw = structuredClone(documentFixture()) as unknown as {
      tracks: { voices: { events: unknown[] }[] }[];
    };
    const relatedEvent = (
      eventId: string,
      noteId: string,
      tick: number,
      fret: 0 | 2,
      semantics: readonly Record<string, unknown>[],
    ) => ({
      articulations: [],
      id: eventId,
      kind: 'guitar-event',
      notatedDurationTicks: 480,
      notes: [
        {
          id: noteId,
          position: { stringNumber: 1, tabFret: fret },
          semantics,
          soundingDurationTicks: 480,
          writtenPitch:
            fret === 0
              ? { accidental: 0, octave: 4, step: 'E' }
              : { accidental: 1, octave: 4, step: 'F' },
        },
      ],
      tick,
    });
    const relationTrack = raw.tracks[0];
    const relationVoice = relationTrack?.voices[0];
    if (relationVoice === undefined) throw new Error('fixture');
    relationVoice.events = [
      relatedEvent('event-tie-start', 'note-tie-start', 0, 0, [
        { direction: 'start', semantic: 'ties', targetNoteId: 'note-tie-stop' },
        { direction: 'start', semantic: 'slurs', targetNoteId: 'note-tie-stop' },
      ]),
      relatedEvent('event-tie-stop', 'note-tie-stop', 480, 0, [
        { direction: 'stop', semantic: 'ties', targetNoteId: 'note-tie-start' },
        { direction: 'stop', semantic: 'slurs', targetNoteId: 'note-tie-start' },
      ]),
      relatedEvent('event-hammer-start', 'note-hammer-start', 960, 0, [
        { direction: 'start', semantic: 'hammer-on', targetNoteId: 'note-hammer-stop' },
      ]),
      relatedEvent('event-hammer-stop', 'note-hammer-stop', 1_440, 2, [
        { direction: 'stop', semantic: 'hammer-on', targetNoteId: 'note-hammer-start' },
      ]),
      relatedEvent('event-pull-start', 'note-pull-start', 1_920, 2, [
        { direction: 'start', semantic: 'pull-off', targetNoteId: 'note-pull-stop' },
      ]),
      relatedEvent('event-pull-stop', 'note-pull-stop', 2_400, 0, [
        { direction: 'stop', semantic: 'pull-off', targetNoteId: 'note-pull-start' },
      ]),
      relatedEvent('event-slide-start', 'note-slide-start', 2_880, 0, [
        { direction: 'start', semantic: 'slide', targetNoteId: 'note-slide-stop' },
      ]),
      relatedEvent('event-slide-stop', 'note-slide-stop', 3_360, 2, [
        { direction: 'stop', semantic: 'slide', targetNoteId: 'note-slide-start' },
      ]),
    ];
    const result = await createAlphaTabNotationAdapter(window.document.createElement('div')).render(
      request(PracticeDocumentSchema.parse(raw)),
    );
    const source = alphaTabMock.sources[0] ?? '';

    expect(source).toContain('{slur relation_6e_6f_74_65_2d_74_69_65_2d_73_74_61_72_74}');
    expect(source).toContain('{t slur relation_6e_6f_74_65_2d_74_69_65_2d_73_74_61_72_74}');
    expect(source.match(/\{h\}/g)).toHaveLength(2);
    expect(source).toContain('{sl}');
    expect(result.diagnostics).toEqual([]);
    const actual =
      await vi.importActual<typeof import('@coderline/alphatab')>('@coderline/alphatab');
    const parsedNotes = actual.importer.ScoreLoader.loadAlphaTex(
      source,
    ).tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats.map((beat) => beat.notes[0]);
    expect(parsedNotes?.[1]?.isTieDestination).toBe(true);
    expect(parsedNotes?.[2]?.isHammerPullOrigin).toBe(true);
    expect(parsedNotes?.[4]?.isHammerPullOrigin).toBe(true);
  });

  it('blocks non-adjacent and cross-string relation targets before alphaTab can retarget them', async () => {
    const relatedEvent = (
      eventId: string,
      noteId: string,
      tick: number,
      stringNumber: number,
      tabFret: number,
      writtenPitch: Readonly<{ accidental: number; octave: number; step: string }>,
      semantics: readonly Record<string, unknown>[],
    ) => ({
      articulations: [],
      id: eventId,
      kind: 'guitar-event',
      notatedDurationTicks: 480,
      notes: [
        {
          id: noteId,
          position: { stringNumber, tabFret },
          semantics,
          soundingDurationTicks: 480,
          writtenPitch,
        },
      ],
      tick,
    });
    const nonAdjacent = documentWithEvents([
      relatedEvent('event-start', 'note-start', 0, 1, 0, { accidental: 0, octave: 4, step: 'E' }, [
        { direction: 'start', semantic: 'hammer-on', targetNoteId: 'note-target' },
      ]),
      relatedEvent(
        'event-intervening',
        'note-intervening',
        480,
        1,
        2,
        { accidental: 1, octave: 4, step: 'F' },
        [],
      ),
      relatedEvent(
        'event-target',
        'note-target',
        960,
        1,
        4,
        { accidental: 1, octave: 4, step: 'G' },
        [{ direction: 'stop', semantic: 'hammer-on', targetNoteId: 'note-start' }],
      ),
    ]);
    const crossStringTie = documentWithEvents([
      relatedEvent(
        'event-tie-start',
        'note-tie-start',
        0,
        2,
        5,
        {
          accidental: 0,
          octave: 4,
          step: 'E',
        },
        [{ direction: 'start', semantic: 'ties', targetNoteId: 'note-tie-stop' }],
      ),
      relatedEvent(
        'event-tie-stop',
        'note-tie-stop',
        480,
        1,
        0,
        {
          accidental: 0,
          octave: 4,
          step: 'E',
        },
        [{ direction: 'stop', semantic: 'ties', targetNoteId: 'note-tie-start' }],
      ),
    ]);

    for (const document of [nonAdjacent, crossStringTie]) {
      const result = await createAlphaTabNotationAdapter(
        window.document.createElement('div'),
      ).render(request(document));
      expect(result.geometry).toEqual([]);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'alphatab-projection-blocked' }),
      );
    }
    expect(alphaTabMock.constructorCalls).toBe(0);
    expect(alphaTabMock.sources).toEqual([]);
  });

  it('preserves non-adjacent slur target identity through an explicit alphaTex relation ID', async () => {
    const slurDocument = documentWithEvents([
      noteEvent('slur-start', {
        notatedDurationTicks: 480,
        notes: [
          {
            id: 'note-slur-start',
            position: { stringNumber: 1, tabFret: 0 },
            semantics: [{ direction: 'start', semantic: 'slurs', targetNoteId: 'note-slur-stop' }],
            soundingDurationTicks: 480,
            writtenPitch: { accidental: 0, octave: 4, step: 'E' },
          },
        ],
        tick: 0,
      }),
      noteEvent('slur-middle', {
        notatedDurationTicks: 480,
        notes: [
          {
            id: 'note-slur-middle',
            position: { stringNumber: 1, tabFret: 2 },
            semantics: [],
            soundingDurationTicks: 480,
            writtenPitch: { accidental: 1, octave: 4, step: 'F' },
          },
        ],
        tick: 480,
      }),
      noteEvent('slur-stop', {
        notatedDurationTicks: 480,
        notes: [
          {
            id: 'note-slur-stop',
            position: { stringNumber: 1, tabFret: 4 },
            semantics: [{ direction: 'stop', semantic: 'slurs', targetNoteId: 'note-slur-start' }],
            soundingDurationTicks: 480,
            writtenPitch: { accidental: 1, octave: 4, step: 'G' },
          },
        ],
        tick: 960,
      }),
    ]);

    const result = await createAlphaTabNotationAdapter(window.document.createElement('div')).render(
      request(slurDocument),
    );
    expect(result.diagnostics).toEqual([]);
    const actual =
      await vi.importActual<typeof import('@coderline/alphatab')>('@coderline/alphatab');
    const notes = actual.importer.ScoreLoader.loadAlphaTex(
      alphaTabMock.sources[0] ?? '',
    ).tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats.flatMap((beat) => beat.notes);
    expect(notes?.[0]?.isSlurOrigin).toBe(true);
    expect(notes?.[0]?.slurDestination).toBe(notes?.[2]);
    expect(notes?.[2]?.isSlurDestination).toBe(true);
    expect(notes?.[2]?.slurOrigin).toBe(notes?.[0]);
  });

  it('blocks inexact per-string sounding duration and non-integer-BPM tempo before loading', async () => {
    const soundingDuration = structuredClone(documentFixture()) as unknown as {
      tracks: {
        voices: { events: { kind: string; notes: { soundingDurationTicks: number }[] }[] }[];
      }[];
    };
    const soundingEvent = soundingDuration.tracks[0]?.voices[0]?.events[0];
    if (soundingEvent?.kind !== 'guitar-event' || soundingEvent.notes[0] === undefined) {
      throw new Error('fixture');
    }
    soundingEvent.notes[0].soundingDurationTicks = 1_200;
    const inexactTempo = documentFixture();
    const initialTempo = inexactTempo.tempoMap[0];
    if (initialTempo === undefined) throw new Error('fixture');
    initialTempo.microsecondsPerQuarter = 500_001;

    const soundingResult = await createAlphaTabNotationAdapter(
      window.document.createElement('div'),
    ).render(request(PracticeDocumentSchema.parse(soundingDuration)));
    const tempoResult = await createAlphaTabNotationAdapter(
      window.document.createElement('div'),
    ).render(request(PracticeDocumentSchema.parse(inexactTempo)));

    expect(
      soundingResult.diagnostics.some(({ message }) => message.includes('sounding duration')),
    ).toBe(true);
    expect(tempoResult.diagnostics.some(({ message }) => message.includes('integer BPM'))).toBe(
      true,
    );
    expect(alphaTabMock.constructorCalls).toBe(0);
  });

  it('uses wrapped renderer systems for continuous/page reflow while preserving focus identity', async () => {
    const document = fullMeasureDocument(8);
    const host = window.document.createElement('div');
    const adapter = createAlphaTabNotationAdapter(host);
    const continuousRequest: NotationRenderRequest = {
      ...request(document),
      presentation: {
        targetBarsPerSystem: 4,
        view: { flow: 'continuous', score: 'combined' },
        viewportHeight: 500,
        viewportWidth: 1_200,
        zoomPercent: 100,
      },
    };
    const continuous = await adapter.render(continuousRequest);
    const focusedRequest: NotationRenderRequest = {
      ...continuousRequest,
      focus: {
        eventId: 'event-bar-1',
        kind: 'note',
        noteId: 'note-bar-1',
        trackId: 'track-1',
        voiceId: 'voice-1-1',
      },
      presentation: {
        ...continuousRequest.presentation,
        targetBarsPerSystem: 2,
        view: { flow: 'page', score: 'combined' },
        zoomPercent: 200,
      },
      previousRender: continuous.fingerprint,
    };
    const paged = await adapter.render(focusedRequest);

    expect(alphaTabMock.settings.slice(0, 2)).toMatchObject([
      { display: { barsPerRow: 4, layoutMode: 'page', scale: 1 } },
      { display: { barsPerRow: 2, layoutMode: 'page', scale: 2 } },
    ]);
    expect(new Set(continuous.geometry.map(({ systemIndex }) => systemIndex))).toEqual(
      new Set([10, 11]),
    );
    expect(new Set(continuous.geometry.map(({ pageIndex }) => pageIndex))).toEqual(new Set([null]));
    expect(continuous.presentationLayout.pages).toEqual([]);
    expect(continuous.presentationLayout.systems[0]).toMatchObject({
      pageIndex: null,
      systemIndex: 10,
    });
    expect(new Set(paged.geometry.map(({ systemIndex }) => systemIndex))).toEqual(
      new Set([10, 11, 12, 13]),
    );
    expect(Math.max(...paged.geometry.map(({ pageIndex }) => pageIndex ?? -1))).toBeGreaterThan(0);
    expect(paged.presentationLayout.pages.length).toBeGreaterThan(1);
    expect(host.querySelectorAll('.stringsight-notation-page-break').length).toBe(
      paged.presentationLayout.pages.length - 1,
    );
    expect(host).toHaveAttribute('data-notation-bounds-source', 'renderer');
    expect(host).toHaveAttribute('data-notation-flow', 'page');
    expect(paged.geometry[0]?.bounds.height).toBe((continuous.geometry[0]?.bounds.height ?? 0) * 2);
    expect(new Set(paged.geometry.map(({ geometryId }) => geometryId))).toEqual(
      new Set(continuous.geometry.map(({ geometryId }) => geometryId)),
    );
    expect(paged.focusedGeometryIds).toEqual([
      expect.stringContaining('note:7:track-1|9:voice-1-1|11:event-bar-1|10:note-bar-1'),
    ]);
    expect(host.dataset.notationFocus).toBe(paged.fingerprint.focusKey);

    await adapter.render({
      ...continuousRequest,
      presentation: {
        ...continuousRequest.presentation,
        view: { flow: 'continuous', score: 'expanded' },
      },
      previousRender: paged.fingerprint,
    });
    await adapter.render({
      ...continuousRequest,
      presentation: {
        ...continuousRequest.presentation,
        view: { flow: 'continuous', score: 'tab-only' },
      },
    });
    expect(alphaTabMock.settings[2]).toMatchObject({
      display: { layoutMode: 'page', scale: 1, staveProfile: 'score' },
    });
    expect(alphaTabMock.settings[3]).toMatchObject({
      display: { layoutMode: 'page', scale: 1, staveProfile: 'tab' },
    });
    expect(host).toHaveAttribute('data-notation-flow', 'continuous');
    expect(host).toHaveAttribute('data-notation-score', 'tab-only');
    expect(host.querySelectorAll('.stringsight-notation-page-break')).toHaveLength(0);
  });

  it('blocks unrepresentable canonical timing before loading alphaTab and returns no fake geometry', async () => {
    const document = structuredClone(documentFixture()) as unknown as {
      tracks: {
        voices: {
          events: {
            kind: string;
            notatedDurationTicks: number;
            notes: { soundingDurationTicks: number }[];
          }[];
        }[];
      }[];
    };
    const canonicalEvent = document.tracks[0]?.voices[0]?.events[0];
    if (canonicalEvent?.kind !== 'guitar-event') throw new Error('fixture');
    canonicalEvent.notatedDurationTicks = 100;
    const canonicalNote = canonicalEvent.notes[0];
    if (canonicalNote === undefined) throw new Error('fixture');
    canonicalNote.soundingDurationTicks = 100;
    const result = await createAlphaTabNotationAdapter(window.document.createElement('div')).render(
      request(PracticeDocumentSchema.parse(document)),
    );

    expect(alphaTabMock.constructorCalls).toBe(0);
    expect(result.geometry).toEqual([]);
    expect(result.eventMappings).toEqual([]);
    expect(result.tickMappings).toEqual([]);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'alphatab-projection-blocked',
      severity: 'error',
    });
  });

  it('turns renderer failure into bounded blocking diagnostics without retaining DOM or geometry', async () => {
    alphaTabMock.failRender = true;
    const host = window.document.createElement('div');
    const result = await createAlphaTabNotationAdapter(host).render(request(documentFixture()));

    expect(result.geometry).toEqual([]);
    expect(result.diagnostics).toContainEqual({
      code: 'alphatab-render-blocked',
      message: 'The notation renderer failed safely.',
      semanticId: null,
      severity: 'error',
    });
    expect(host.childElementCount).toBe(0);
    expect(alphaTabMock.destroyCalls).toBe(1);
  });

  it('bounds constructor and geometry reconciliation failures and clears all host metadata', async () => {
    const constructorHost = window.document.createElement('div');
    alphaTabMock.failConstructor = true;
    const constructorResult = await createAlphaTabNotationAdapter(constructorHost).render(
      request(documentFixture()),
    );
    expect(constructorResult.geometry).toEqual([]);
    expect(constructorResult.diagnostics).toContainEqual({
      code: 'alphatab-render-blocked',
      message: 'The notation renderer could not be initialized safely.',
      semanticId: null,
      severity: 'error',
    });
    expect(constructorHost.getAttributeNames()).toEqual([]);

    alphaTabMock.failConstructor = false;
    alphaTabMock.failGeometry = true;
    const geometryHost = window.document.createElement('div');
    const geometryResult = await createAlphaTabNotationAdapter(geometryHost).render(
      request(documentFixture()),
    );
    expect(geometryResult.geometry).toEqual([]);
    expect(geometryResult.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'alphatab-geometry-blocked' }),
    );
    expect(geometryHost.getAttributeNames()).toEqual([]);
    expect(alphaTabMock.destroyCalls).toBe(1);
  });

  it('clears a prior successful projection when a later request is blocked before load', async () => {
    const host = window.document.createElement('div');
    const adapter = createAlphaTabNotationAdapter(host);
    await adapter.render(request(documentFixture()));
    expect(host).toHaveAttribute('data-notation-adapter');

    const blocked = structuredClone(documentFixture()) as unknown as {
      tracks: {
        voices: {
          events: {
            kind: string;
            notatedDurationTicks: number;
            notes: { soundingDurationTicks: number }[];
          }[];
        }[];
      }[];
    };
    const blockedEvent = blocked.tracks[0]?.voices[0]?.events[0];
    if (blockedEvent?.kind !== 'guitar-event' || blockedEvent.notes[0] === undefined) {
      throw new Error('fixture');
    }
    blockedEvent.notatedDurationTicks = 100;
    blockedEvent.notes[0].soundingDurationTicks = 100;
    const result = await adapter.render(request(PracticeDocumentSchema.parse(blocked)));

    expect(result.geometry).toEqual([]);
    expect(host.childElementCount).toBe(0);
    expect(host.getAttributeNames()).toEqual([]);
    expect(alphaTabMock.destroyCalls).toBe(1);
  });

  it('clears a prior successful projection before request validation can reject', async () => {
    const host = window.document.createElement('div');
    const adapter = createAlphaTabNotationAdapter(host);
    await adapter.render(request(documentFixture()));
    expect(host.querySelector('svg')).not.toBeNull();

    await expect(
      adapter.render({
        ...request(documentFixture()),
        presentation: {
          ...request(documentFixture()).presentation,
          viewportWidth: 239,
        },
      }),
    ).rejects.toThrow('viewportWidth');

    expect(host.childElementCount).toBe(0);
    expect(host.getAttributeNames()).toEqual([]);
    expect(alphaTabMock.destroyCalls).toBe(1);
  });

  it('includes module load and rendering in one bounded timeout', async () => {
    vi.useFakeTimers();
    try {
      alphaTabMock.autoFinish = false;
      const host = window.document.createElement('div');
      const pending = createAlphaTabNotationAdapter(host).render(request(documentFixture()));
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await pending;

      expect(result.geometry).toEqual([]);
      expect(result.diagnostics).toContainEqual({
        code: 'alphatab-render-blocked',
        message: 'The notation renderer exceeded the bounded load and render timeout.',
        semanticId: null,
        severity: 'error',
      });
      expect(host.getAttributeNames()).toEqual([]);
      expect(alphaTabMock.destroyCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disposes idempotently and rejects a pending render without leaking renderer state', async () => {
    alphaTabMock.autoFinish = false;
    const host = window.document.createElement('div');
    const adapter = createAlphaTabNotationAdapter(host);
    const pending = adapter.render(request(documentFixture()));
    await vi.waitFor(() => expect(alphaTabMock.constructorCalls).toBe(1));

    adapter.dispose();
    adapter.dispose();

    await expect(pending).rejects.toThrow('stale');
    expect(adapter.disposed).toBe(true);
    expect(alphaTabMock.destroyCalls).toBe(1);
    expect(host.childElementCount).toBe(0);
    expect(host).not.toHaveAttribute('data-notation-adapter');
    await expect(adapter.render(request(documentFixture()))).rejects.toThrow('disposed');
  });
});
