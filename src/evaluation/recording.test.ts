import { describe, expect, it } from 'vitest';

import type { CapturedRecording } from '../audio/capture/contracts';
import { encodeMonoPcm16Wav } from '../audio/capture/wav';
import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  sessionTimestampMs,
} from '../shared';
import { createRecordedChordFixture, createRecordedFixture } from './recording';

const recording = (data = new Float32Array(16_000)): CapturedRecording => ({
  channelCount: 1,
  data,
  discontinuityCount: 0,
  durationMs: 1_000,
  frameCount: data.length,
  recordedAt: '2026-07-18T05:00:00.000Z',
  sampleRate: 16_000,
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  startedAtMs: sessionTimestampMs(50),
});

const noteEvent = NoteEventSchema.parse({
  candidates: [
    {
      centsOffset: 0,
      confidence: 0.9,
      evidence: ['yin-periodicity'],
      frequencyHz: 110,
      midi: 45,
      noteName: 'A2',
      pitchClass: 'A',
      rank: 1,
      score: 0.9,
    },
  ],
  id: 'recording-note-1',
  kind: 'note',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'yin-energy-monophonic',
    generatedAtMs: 500,
    runId: 'recording',
    subsystem: 'audio-analysis',
    version: '0.2.1',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 450, startMs: 150 },
});

const chordEvent = ChordEventSchema.parse({
  candidates: [
    {
      bass: 'C',
      confidence: 0.9,
      pitchClasses: ['C', 'E', 'G'],
      quality: 'major',
      rank: 1,
      root: 'C',
      score: 0.95,
      symbol: 'C',
    },
  ],
  id: 'recording-chord-1',
  kind: 'chord',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'spotify-basic-pitch-plus-chord-templates',
    generatedAtMs: 500,
    runId: 'recording',
    subsystem: 'polyphonic-analysis',
    version: '1.0.1-stringsight.1',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 450, startMs: 150 },
});

describe('real-guitar benchmark export', () => {
  it('encodes canonical mono 16-bit PCM WAV bytes', () => {
    const bytes = encodeMonoPcm16Wav(recording(Float32Array.from([-1, 0, 1])));
    const view = new DataView(bytes.buffer);

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(-32_768);
    expect(view.getInt16(48, true)).toBe(32_767);
  });

  it('normalizes reviewed human labels to the beginning of the exported recording', () => {
    const fixture = createRecordedFixture(
      recording(),
      [noteEvent],
      [{ eventId: noteEvent.id, midi: 40 }],
      {
        dynamics: 'medium',
        fixtureId: 'real-open-strings-1',
        guitarType: 'steel-acoustic',
        inputProfile: 'laptop-microphone',
        license: 'private-evaluation-only',
        neckPosition: 'open-low',
        noise: 'quiet',
        recordedAt: '2026-07-18T05:00:00.000Z',
        split: 'development',
      },
    );

    expect(fixture.source).toMatchObject({
      kind: 'recorded',
      license: 'private-evaluation-only',
    });
    expect(fixture.groundTruth.notes).toEqual([
      { endMs: 400, midi: 40, startMs: 100, velocity: 0.6 },
    ]);
    expect(fixture.groundTruth.onsetsMs).toEqual([100]);
    expect(fixture.media.audio).toBe('audio/recorded/real-open-strings-1.wav');
  });

  it('exports reviewed chord labels with pitch classes and private provenance', () => {
    const fixture = createRecordedChordFixture(
      recording(),
      [chordEvent],
      [{ eventId: chordEvent.id, symbol: 'C#maj7' }],
      {
        dynamics: 'medium',
        fixtureId: 'real-chords-1',
        guitarType: 'clean-electric',
        inputProfile: 'direct',
        license: 'private-evaluation-only',
        neckPosition: 'open-low',
        noise: 'quiet',
        recordedAt: '2026-07-18T05:00:00.000Z',
        split: 'development',
      },
    );

    expect(fixture.groundTruth.chords).toEqual([
      { endMs: 400, pitchClasses: [1, 5, 8, 0], startMs: 100, symbol: 'C#maj7' },
    ]);
    expect(fixture.groundTruth.onsetsMs).toEqual([100]);
    expect(fixture.tags).toEqual(expect.arrayContaining(['polyphonic', 'chord']));
  });

  it('rejects chord symbols outside the reviewed export vocabulary', () => {
    const options = {
      dynamics: 'medium' as const,
      fixtureId: 'invalid-chord',
      guitarType: 'clean-electric' as const,
      inputProfile: 'direct' as const,
      license: 'private-evaluation-only' as const,
      neckPosition: 'open-low' as const,
      noise: 'quiet' as const,
      recordedAt: '2026-07-18T05:00:00.000Z',
      split: 'development' as const,
    };
    expect(() =>
      createRecordedChordFixture(
        recording(),
        [chordEvent],
        [{ eventId: chordEvent.id, symbol: 'H' }],
        options,
      ),
    ).toThrow(/unsupported reviewed chord/i);
    expect(() =>
      createRecordedChordFixture(
        recording(),
        [chordEvent],
        [{ eventId: chordEvent.id, symbol: 'Cadd9' }],
        options,
      ),
    ).toThrow(/unsupported reviewed chord/i);
  });
});
