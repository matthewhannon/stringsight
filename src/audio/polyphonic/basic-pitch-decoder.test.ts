import { describe, expect, it } from 'vitest';

import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  type ChordQuality,
  type PitchClass,
} from '../../shared';

import {
  BASIC_PITCH_MIDI_OFFSET,
  BASIC_PITCH_OUTPUT_BINS,
  basicPitchFrameToMs,
  basicPitchNotesToNoteSetEvents,
  decodeBasicPitchNotes,
  fuseAcousticAndModelChordEvents,
  modelGapSampleCount,
  noteSetEventsToChordEvents,
} from './index';
import {
  BASIC_PITCH_OVERLAP_SAMPLES,
  BASIC_PITCH_WINDOW_HOP,
  BASIC_PITCH_WINDOW_SAMPLES,
  basicPitchWindowCount,
  createBasicPitchWindow,
} from './basic-pitch-window';

const matrices = (frameCount: number): { frames: number[][]; onsets: number[][] } => ({
  frames: Array.from({ length: frameCount }, () =>
    Array.from({ length: BASIC_PITCH_OUTPUT_BINS }, () => 0),
  ),
  onsets: Array.from({ length: frameCount }, () =>
    Array.from({ length: BASIC_PITCH_OUTPUT_BINS }, () => 0),
  ),
});

function addNote(
  data: ReturnType<typeof matrices>,
  midi: number,
  startFrame: number,
  endFrame: number,
  onset = 0.9,
  activation = 0.8,
): void {
  const bin = midi - BASIC_PITCH_MIDI_OFFSET;
  const onsetRow = data.onsets[startFrame];
  if (onsetRow !== undefined) onsetRow[bin] = onset;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const frameRow = data.frames[frame];
    if (frameRow !== undefined) frameRow[bin] = activation;
  }
}

const acousticChord = (
  id: string,
  startMs: number,
  endMs: number,
  candidates: readonly {
    bass?: PitchClass;
    pitchClasses: readonly PitchClass[];
    quality: ChordQuality;
    root: PitchClass;
    score: number;
    symbol: string;
  }[],
  observedPitchClasses: readonly { pitchClass: PitchClass; weight: number }[] = [],
) =>
  ChordEventSchema.parse({
    candidates: candidates.map((candidate, index) => ({
      ...candidate,
      confidence: Math.max(0, Math.min(1, candidate.score)),
      rank: index + 1,
    })),
    diagnostics: {},
    id,
    kind: 'chord',
    lifecycle: 'provisional',
    observedPitchClasses,
    provenance: {
      algorithm: 'test-acoustic-frontend',
      generatedAtMs: endMs,
      runId: 'transition-run',
      subsystem: 'polyphonic-analysis',
      version: '1.0.0',
    },
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { endMs, startMs },
  });

describe('Basic Pitch activation decoding', () => {
  it('decodes simultaneous onsets into bounded guitar-note events', () => {
    const data = matrices(60);
    addNote(data, 48, 10, 40);
    addNote(data, 52, 10, 40, 0.85, 0.75);
    addNote(data, 55, 10, 40, 0.8, 0.7);
    addNote(data, 96, 10, 40);

    const notes = decodeBasicPitchNotes(data.frames, data.onsets);
    expect(notes.map(({ pitchMidi }) => pitchMidi)).toEqual([48, 52, 55]);
    expect(notes[0]).toMatchObject({ durationFrames: 30, startFrame: 10 });
    expect(notes[0]?.frameConfidence).toBeCloseTo(0.8);
  });

  it('preserves repeated attacks and recovers onsetless sustained frame energy', () => {
    const repeated = matrices(60);
    addNote(repeated, 57, 5, 50);
    if (repeated.onsets[25] !== undefined) repeated.onsets[25][57 - BASIC_PITCH_MIDI_OFFSET] = 0.95;
    const repeatedNotes = decodeBasicPitchNotes(repeated.frames, repeated.onsets);
    expect(repeatedNotes.map(({ startFrame }) => startFrame)).toEqual([5, 25]);

    const sustained = matrices(30);
    addNote(sustained, 60, 4, 20, 0, 0.7);
    expect(decodeBasicPitchNotes(sustained.frames, sustained.onsets)).toMatchObject([
      { onsetConfidence: 0, pitchMidi: 60, startFrame: 4 },
    ]);
  });

  it('suppresses a weaker adjacent-semitone partial when decoding a stronger note', () => {
    const data = matrices(50);
    addNote(data, 55, 5, 40, 0.95, 0.85);
    addNote(data, 54, 5, 40, 0.7, 0.5);

    expect(
      decodeBasicPitchNotes(data.frames, data.onsets).map(({ pitchMidi }) => pitchMidi),
    ).toEqual([55]);
  });

  it('filters sub-90 ms note blips by default while preserving an explicit shorter-note mode', () => {
    const data = matrices(30);
    addNote(data, 67, 5, 12);

    expect(decodeBasicPitchNotes(data.frames, data.onsets)).toEqual([]);
    expect(
      decodeBasicPitchNotes(data.frames, data.onsets, { minimumNoteFrames: 5 }).map(
        ({ pitchMidi }) => pitchMidi,
      ),
    ).toEqual([67]);
  });

  it('supports onset-only decoding without inferred onsets or Melodia recovery', () => {
    const data = matrices(30);
    addNote(data, 21, 0, 20, 0.9, 0.8);
    addNote(data, 108, 0, 20, 0.85, 0.75);
    expect(
      decodeBasicPitchNotes(data.frames, data.onsets, {
        inferOnsets: false,
        maxMidi: 108,
        melodiaTrick: false,
        minMidi: 21,
      }).map(({ pitchMidi }) => pitchMidi),
    ).toEqual([21, 108]);

    const onsetless = matrices(30);
    addNote(onsetless, 60, 3, 20, 0, 0.8);
    expect(
      decodeBasicPitchNotes(onsetless.frames, onsetless.onsets, { melodiaTrick: false }),
    ).toEqual([]);
  });

  it('rejects malformed activation matrices', () => {
    const data = matrices(2);
    expect(() => decodeBasicPitchNotes(data.frames, data.onsets.slice(1))).toThrow(/same length/i);
    expect(() => decodeBasicPitchNotes([[0]], [[0]])).toThrow(/frame rows/i);
    expect(() => decodeBasicPitchNotes(data.frames, [[0], [0]])).toThrow(/onset rows/i);
  });
});

describe('Basic Pitch overlapping input windows', () => {
  it('prepends half an overlap, pads the tail, and advances by the official hop', () => {
    const samples = Float32Array.from(
      { length: BASIC_PITCH_WINDOW_SAMPLES },
      (_, index) => index + 1,
    );
    const first = createBasicPitchWindow(samples, 0);
    const second = createBasicPitchWindow(samples, 1);
    const prepad = BASIC_PITCH_OVERLAP_SAMPLES / 2;

    expect(first).toHaveLength(BASIC_PITCH_WINDOW_SAMPLES);
    expect(first[prepad - 1]).toBe(0);
    expect(first[prepad]).toBe(1);
    expect(second[0]).toBe(BASIC_PITCH_WINDOW_HOP - prepad + 1);
    expect(second.at(-1)).toBe(0);
  });

  it('computes padded window counts and rejects invalid indices', () => {
    const prepad = BASIC_PITCH_OVERLAP_SAMPLES / 2;
    expect(basicPitchWindowCount(0)).toBe(1);
    expect(basicPitchWindowCount(BASIC_PITCH_WINDOW_SAMPLES - prepad)).toBe(1);
    expect(basicPitchWindowCount(BASIC_PITCH_WINDOW_SAMPLES - prepad + 1)).toBe(2);
    expect(() => basicPitchWindowCount(-1)).toThrow(/sample count/i);
    expect(() => basicPitchWindowCount(1.5)).toThrow(/sample count/i);
    expect(() => createBasicPitchWindow(new Float32Array(), -1)).toThrow(/window index/i);
    expect(() => createBasicPitchWindow(new Float32Array(), 0.5)).toThrow(/window index/i);
    expect(createBasicPitchWindow(Float32Array.of(1), 20).every((sample) => sample === 0)).toBe(
      true,
    );
  });
});

describe('Basic Pitch note-set segmentation', () => {
  it('turns a simultaneous triad into a finalized, versioned note set', () => {
    const data = matrices(60);
    addNote(data, 48, 10, 40);
    addNote(data, 52, 10, 40);
    addNote(data, 55, 10, 40);
    const events = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(data.frames, data.onsets),
      'replay-1',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      candidates: [{ notes: [{ midi: 48 }, { midi: 52 }, { midi: 55 }], rank: 1 }],
      lifecycle: 'finalized',
      provenance: { runId: 'replay-1' },
    });
    expect(events[0]?.time).toEqual({
      endMs: basicPitchFrameToMs(40),
      startMs: basicPitchFrameToMs(10),
    });
    const offsetEvents = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(data.frames, data.onsets),
      'replay-offset',
      2_500,
    );
    expect(offsetEvents[0]?.time).toEqual({
      endMs: 2_500 + basicPitchFrameToMs(40),
      startMs: 2_500 + basicPitchFrameToMs(10),
    });
    expect(offsetEvents[0]?.provenance.generatedAtMs).toBe(2_500 + basicPitchFrameToMs(40));
    expect(() => basicPitchNotesToNoteSetEvents([], 'invalid-offset', -1)).toThrow(/offset/i);

    const modelChords = noteSetEventsToChordEvents(events, 'replay-1');
    expect(modelChords[0]?.candidates[0]).toMatchObject({ root: 'C', symbol: 'C' });
    const provisional = ChordEventSchema.parse({
      ...modelChords[0],
      id: 'replay-1-chord-1',
      lifecycle: 'provisional',
      provenance: {
        algorithm: 'windowed-spectrum-chord-templates',
        generatedAtMs: basicPitchFrameToMs(40),
        runId: 'replay-1',
        subsystem: 'polyphonic-analysis',
        version: '0.1.0',
      },
    });
    expect(noteSetEventsToChordEvents(events, 'replay-1', [provisional])[0]?.id).toBe(
      provisional.id,
    );

    const seventhData = matrices(60);
    [48, 52, 55, 59].forEach((midi) => addNote(seventhData, midi, 10, 40, 0.55, 0.35));
    const seventhEvents = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(seventhData.frames, seventhData.onsets),
      'replay-1',
    );
    const reconciled = noteSetEventsToChordEvents(seventhEvents, 'replay-1', [provisional]);
    expect(reconciled[0]?.candidates[0]?.symbol).toBe('C');
    expect(reconciled[0]).toMatchObject({
      diagnostics: { reconciliation: 'one-to-one-overlap' },
      id: provisional.id,
    });

    const fused = fuseAcousticAndModelChordEvents(
      seventhEvents,
      [provisional],
      'replay-1',
      'accurate',
    );
    expect(fused[0]?.candidates[0]?.symbol).toBe('C');
    expect(fused[0]).toMatchObject({
      diagnostics: { reconciliation: 'weighted-evidence-fusion' },
      id: provisional.id,
      lifecycle: 'finalized',
    });
  });

  it('globally merges a suspension-like attack into the sustained finalized chord', () => {
    const gCandidates = [
      {
        pitchClasses: ['G', 'B', 'D'] as const,
        quality: 'major' as const,
        root: 'G' as const,
        score: 0.95,
        symbol: 'G',
      },
    ];
    const transitionCandidates = [
      {
        pitchClasses: ['D', 'G', 'A'] as const,
        quality: 'suspended-4' as const,
        root: 'D' as const,
        score: 0.9,
        symbol: 'Dsus4',
      },
      {
        pitchClasses: ['D', 'F#', 'A'] as const,
        quality: 'major' as const,
        root: 'D' as const,
        score: 0.82,
        symbol: 'D',
      },
    ];
    const stableCandidates = [
      {
        pitchClasses: ['D', 'F#', 'A'] as const,
        quality: 'major' as const,
        root: 'D' as const,
        score: 0.94,
        symbol: 'D',
      },
      {
        pitchClasses: ['D', 'G', 'A'] as const,
        quality: 'suspended-4' as const,
        root: 'D' as const,
        score: 0.65,
        symbol: 'Dsus4',
      },
    ];
    const provisional = [
      acousticChord('transition-g-1', 0, 1_000, gCandidates),
      acousticChord('transition-d-attack', 1_000, 1_300, transitionCandidates),
      acousticChord('transition-d-stable', 1_300, 2_000, stableCandidates),
      acousticChord('transition-g-2', 2_000, 3_000, gCandidates),
    ];

    const finalized = fuseAcousticAndModelChordEvents(
      [],
      provisional,
      'transition-run',
      'accurate',
    );

    expect(finalized.map((event) => event.candidates[0]?.symbol)).toEqual(['G', 'D', 'G']);
    expect(finalized[1]).toMatchObject({
      diagnostics: {
        reconciliation: 'merged-provisional-overlap',
        sourceAcousticEventCount: 2,
        temporalDecoder: 'global-duration-aware-viterbi',
      },
      lifecycle: 'finalized',
      time: { endMs: 2_000, startMs: 1_000 },
    });
  });

  it('reranks final labels from the same fused evidence shown to the user', () => {
    const data = matrices(70);
    [45, 50, 54].forEach((midi) => addNote(data, midi, 0, 60));
    const noteSets = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(data.frames, data.onsets),
      'evidence-run',
    );
    const time = noteSets[0]?.time;
    if (time?.endMs === undefined) throw new Error('Expected a finalized A-D-F# note set.');
    const acoustic = acousticChord(
      'evidence-acoustic',
      time.startMs,
      time.endMs,
      [
        {
          bass: 'A',
          pitchClasses: ['A', 'D', 'E'],
          quality: 'suspended-4',
          root: 'A',
          score: 1.2,
          symbol: 'Asus4',
        },
        {
          bass: 'A',
          pitchClasses: ['D', 'F#', 'A'],
          quality: 'major',
          root: 'D',
          score: 1,
          symbol: 'D',
        },
      ],
      [
        { pitchClass: 'A', weight: 0.4 },
        { pitchClass: 'D', weight: 0.35 },
        { pitchClass: 'E', weight: 0.25 },
      ],
    );

    const [finalized] = fuseAcousticAndModelChordEvents(
      noteSets,
      [acoustic],
      'evidence-run',
      'accurate',
    );

    expect(finalized?.candidates[0]).toMatchObject({ bass: 'A', root: 'D', symbol: 'D' });
    expect(finalized?.observedPitchClasses.map(({ pitchClass }) => pitchClass)).toEqual([
      'D',
      'F#',
      'A',
    ]);
    expect(finalized?.diagnostics).toMatchObject({
      harmonicAmbiguity: 'resolved',
      reconciliation: 'weighted-evidence-fusion',
    });
    expect(finalized?.provenance.version).toBe('1.0.1-stringsight.5');
  });

  it('marks a two-note final observation as insufficient evidence instead of high strength', () => {
    const data = matrices(70);
    [45, 50].forEach((midi) => addNote(data, midi, 0, 60));
    const noteSets = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(data.frames, data.onsets),
      'dyad-run',
    );
    const time = noteSets[0]?.time;
    if (time?.endMs === undefined) throw new Error('Expected a finalized A-D dyad.');
    const acoustic = acousticChord(
      'dyad-acoustic',
      time.startMs,
      time.endMs,
      [
        {
          bass: 'A',
          pitchClasses: ['A', 'D', 'E'],
          quality: 'suspended-4',
          root: 'A',
          score: 1.2,
          symbol: 'Asus4',
        },
        {
          bass: 'A',
          pitchClasses: ['D', 'A'],
          quality: 'power',
          root: 'D',
          score: 1.15,
          symbol: 'D5',
        },
      ],
      [
        { pitchClass: 'A', weight: 0.55 },
        { pitchClass: 'D', weight: 0.45 },
      ],
    );

    const [finalized] = fuseAcousticAndModelChordEvents(
      noteSets,
      [acoustic],
      'dyad-run',
      'accurate',
    );

    expect(finalized?.diagnostics.harmonicAmbiguity).toBe('insufficient-defining-tones');
    expect(finalized?.candidates[0]?.confidence).toBeLessThanOrEqual(0.55);
    expect(finalized?.candidates.length).toBeGreaterThan(1);
  });

  it('preserves a deliberate Asus4 when both sources support its defining tones', () => {
    const data = matrices(70);
    [45, 50, 52].forEach((midi) => addNote(data, midi, 0, 60));
    const noteSets = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(data.frames, data.onsets),
      'asus4-run',
    );
    const time = noteSets[0]?.time;
    if (time?.endMs === undefined) throw new Error('Expected a finalized Asus4 note set.');
    const acoustic = acousticChord(
      'asus4-acoustic',
      time.startMs,
      time.endMs,
      [
        {
          bass: 'A',
          pitchClasses: ['A', 'D', 'E'],
          quality: 'suspended-4',
          root: 'A',
          score: 1.2,
          symbol: 'Asus4',
        },
      ],
      [
        { pitchClass: 'A', weight: 0.4 },
        { pitchClass: 'D', weight: 0.3 },
        { pitchClass: 'E', weight: 0.3 },
      ],
    );

    expect(
      fuseAcousticAndModelChordEvents(noteSets, [acoustic], 'asus4-run', 'accurate')[0]
        ?.candidates[0]?.symbol,
    ).toBe('Asus4');
  });

  it('uses defining extension evidence without overweighting doubled chord tones', () => {
    const dmData = matrices(70);
    [50, 57, 62, 65].forEach((midi) => addNote(dmData, midi, 0, 60));
    const dmNoteSets = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(dmData.frames, dmData.onsets),
      'dm-extension-run',
    );
    const dmTime = dmNoteSets[0]?.time;
    if (dmTime?.endMs === undefined) throw new Error('Expected a finalized doubled Dm note set.');
    const dmAcoustic = acousticChord(
      'dm-extension-acoustic',
      dmTime.startMs,
      dmTime.endMs,
      [
        {
          bass: 'D',
          pitchClasses: ['D', 'F', 'A', 'C'],
          quality: 'minor-7',
          root: 'D',
          score: 0.997,
          symbol: 'Dm7',
        },
        {
          bass: 'D',
          pitchClasses: ['D', 'F', 'A'],
          quality: 'minor',
          root: 'D',
          score: 0.924,
          symbol: 'Dm',
        },
      ],
      [
        { pitchClass: 'D', weight: 0.4 },
        { pitchClass: 'F', weight: 0.3 },
        { pitchClass: 'A', weight: 0.3 },
      ],
    );
    expect(
      fuseAcousticAndModelChordEvents(dmNoteSets, [dmAcoustic], 'dm-extension-run', 'accurate')[0]
        ?.candidates[0]?.symbol,
    ).toBe('Dm');

    const g7Data = matrices(70);
    [43, 47, 50, 55, 59, 65].forEach((midi) => addNote(g7Data, midi, 0, 60));
    const g7NoteSets = basicPitchNotesToNoteSetEvents(
      decodeBasicPitchNotes(g7Data.frames, g7Data.onsets),
      'g7-extension-run',
    );
    const g7Time = g7NoteSets[0]?.time;
    if (g7Time?.endMs === undefined) throw new Error('Expected a finalized doubled G7 note set.');
    const g7Acoustic = acousticChord('g7-extension-acoustic', g7Time.startMs, g7Time.endMs, [
      {
        bass: 'G',
        pitchClasses: ['G', 'B', 'D', 'F'],
        quality: 'dominant-7',
        root: 'G',
        score: 1.05,
        symbol: 'G7',
      },
      {
        bass: 'G',
        pitchClasses: ['G', 'B', 'D'],
        quality: 'major',
        root: 'G',
        score: 1,
        symbol: 'G',
      },
    ]);
    expect(
      fuseAcousticAndModelChordEvents(g7NoteSets, [g7Acoustic], 'g7-extension-run', 'accurate')[0]
        ?.candidates[0]?.symbol,
    ).toBe('G7');
  });

  it('preserves real source-time gaps in the model sample timeline', () => {
    expect(modelGapSampleCount(null, 1_000, 22_050)).toBe(0);
    expect(modelGapSampleCount(1_100, 1_350, 22_050)).toBe(5_513);
    expect(modelGapSampleCount(1_350, 1_350, 22_050)).toBe(0);
    expect(modelGapSampleCount(1_400, 1_350, 22_050)).toBe(0);
    expect(() => modelGapSampleCount(-1, 0, 22_050)).toThrow(/previous/i);
  });

  it('omits monophonic and over-dense segments from note-set output', () => {
    const single = matrices(30);
    addNote(single, 60, 2, 20);
    expect(
      basicPitchNotesToNoteSetEvents(decodeBasicPitchNotes(single.frames, single.onsets), 'run-1'),
    ).toEqual([]);

    const dense = matrices(30);
    [40, 45, 50, 55, 59, 64, 67].forEach((midi) => addNote(dense, midi, 2, 20));
    expect(
      basicPitchNotesToNoteSetEvents(decodeBasicPitchNotes(dense.frames, dense.onsets), 'run-2'),
    ).toEqual([]);
  });
});
