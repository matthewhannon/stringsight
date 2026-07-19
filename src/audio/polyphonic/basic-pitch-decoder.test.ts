import { describe, expect, it } from 'vitest';

import { ChordEventSchema } from '../../shared';

import {
  BASIC_PITCH_MIDI_OFFSET,
  BASIC_PITCH_OUTPUT_BINS,
  basicPitchFrameToMs,
  basicPitchNotesToNoteSetEvents,
  decodeBasicPitchNotes,
  fuseAcousticAndModelChordEvents,
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
