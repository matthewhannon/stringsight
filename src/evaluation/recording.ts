import type { ChordEvent, NoteEvent } from '../shared';
import type { CapturedRecording } from '../audio/capture/contracts';
import { EvaluationFixtureSchema, type EvaluationFixture } from './contracts';

export type BenchmarkConditions = {
  dynamics: 'soft' | 'medium' | 'loud';
  guitarType: 'steel-acoustic' | 'nylon-acoustic' | 'clean-electric';
  inputProfile: 'direct' | 'near-microphone' | 'room-microphone' | 'laptop-microphone';
  neckPosition: 'open-low' | 'middle' | 'upper';
  noise: 'quiet' | 'room' | 'fan';
  split: 'development' | 'held-out';
};

export type ReviewedBenchmarkNote = {
  eventId: string;
  midi: number | null;
};

export type ReviewedBenchmarkChord = {
  eventId: string;
  symbol: string | null;
};

export type RecordingFixtureOptions = BenchmarkConditions & {
  fixtureId: string;
  license: 'private-evaluation-only' | 'project-evaluation' | 'redistributable';
  recordedAt: string;
};

const dynamicVelocity = (dynamics: BenchmarkConditions['dynamics']): number =>
  dynamics === 'soft' ? 0.35 : dynamics === 'loud' ? 0.85 : 0.6;

const PITCH_CLASS_ROOTS = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
const CHORD_QUALITIES = [
  { intervals: [0, 4, 7], suffix: '' },
  { intervals: [0, 3, 7], suffix: 'm' },
  { intervals: [0, 4, 7, 10], suffix: '7' },
  { intervals: [0, 4, 7, 11], suffix: 'maj7' },
  { intervals: [0, 3, 7, 10], suffix: 'm7' },
  { intervals: [0, 2, 7], suffix: 'sus2' },
  { intervals: [0, 5, 7], suffix: 'sus4' },
  { intervals: [0, 3, 6], suffix: 'dim' },
  { intervals: [0, 7], suffix: '5' },
] as const;

export const RECORDING_CHORD_OPTIONS = PITCH_CLASS_ROOTS.flatMap((root) =>
  CHORD_QUALITIES.map(({ suffix }) => `${root}${suffix}`),
);

function pitchClassesForChord(symbol: string): number[] {
  const root = PITCH_CLASS_ROOTS.find(
    (candidate) => symbol.startsWith(candidate) && symbol[candidate.length] !== '#',
  );
  if (root === undefined) throw new Error(`Unsupported reviewed chord symbol: ${symbol}.`);
  const suffix = symbol.slice(root.length);
  const quality = CHORD_QUALITIES.find((candidate) => candidate.suffix === suffix);
  if (quality === undefined) throw new Error(`Unsupported reviewed chord symbol: ${symbol}.`);
  const rootIndex = PITCH_CLASS_ROOTS.indexOf(root);
  return quality.intervals.map((interval) => (rootIndex + interval) % 12);
}

export function createRecordedFixture(
  recording: CapturedRecording,
  events: readonly NoteEvent[],
  reviewedNotes: readonly ReviewedBenchmarkNote[],
  options: RecordingFixtureOptions,
): EvaluationFixture {
  const reviewedById = new Map(reviewedNotes.map((note) => [note.eventId, note.midi]));
  const notes = events
    .filter((event) => event.lifecycle === 'finalized')
    .map((event) => ({ event, midi: reviewedById.get(event.id) }))
    .filter(
      (entry): entry is { event: NoteEvent; midi: number } =>
        entry.midi !== undefined && entry.midi !== null,
    )
    .map(({ event, midi }) => ({
      endMs: Math.max(
        0,
        Math.min(
          recording.durationMs,
          (event.time.endMs ?? event.time.startMs) - recording.startedAtMs,
        ),
      ),
      midi,
      startMs: Math.max(
        0,
        Math.min(recording.durationMs, event.time.startMs - recording.startedAtMs),
      ),
      velocity: dynamicVelocity(options.dynamics),
    }))
    .map((note) => ({ ...note, endMs: Math.max(note.startMs, note.endMs) }));

  return EvaluationFixtureSchema.parse({
    conditions: {
      dynamics: options.dynamics,
      guitarType: options.guitarType,
      inputProfile: options.inputProfile,
      neckPosition: options.neckPosition,
      noise: options.noise,
      sampleRate: recording.sampleRate,
    },
    durationMs: recording.durationMs,
    groundTruth: {
      chords: [],
      fretRegions: [],
      notes,
      onsetsMs: notes.map((note) => note.startMs),
      tablature: [],
    },
    id: options.fixtureId,
    media: { audio: `audio/recorded/${options.fixtureId}.wav` },
    modalities: ['audio'],
    source: {
      consentConfirmed: true,
      kind: 'recorded',
      license: options.license,
      recordedAt: options.recordedAt,
      recordingId: options.fixtureId,
    },
    split: options.split,
    tags: ['recorded', 'real-guitar', 'monophonic'],
  });
}

export function createRecordedChordFixture(
  recording: CapturedRecording,
  events: readonly ChordEvent[],
  reviewedChords: readonly ReviewedBenchmarkChord[],
  options: RecordingFixtureOptions,
): EvaluationFixture {
  const reviewedById = new Map(reviewedChords.map((chord) => [chord.eventId, chord.symbol]));
  const chords = events
    .filter((event) => event.lifecycle === 'finalized')
    .map((event) => ({ event, symbol: reviewedById.get(event.id) }))
    .filter(
      (entry): entry is { event: ChordEvent; symbol: string } =>
        entry.symbol !== undefined && entry.symbol !== null,
    )
    .map(({ event, symbol }) => {
      const startMs = Math.max(
        0,
        Math.min(recording.durationMs, event.time.startMs - recording.startedAtMs),
      );
      const endMs = Math.max(
        startMs,
        Math.min(
          recording.durationMs,
          (event.time.endMs ?? event.time.startMs) - recording.startedAtMs,
        ),
      );
      return { endMs, pitchClasses: pitchClassesForChord(symbol), startMs, symbol };
    });

  return EvaluationFixtureSchema.parse({
    conditions: {
      dynamics: options.dynamics,
      guitarType: options.guitarType,
      inputProfile: options.inputProfile,
      neckPosition: options.neckPosition,
      noise: options.noise,
      sampleRate: recording.sampleRate,
    },
    durationMs: recording.durationMs,
    groundTruth: {
      chords,
      fretRegions: [],
      notes: [],
      onsetsMs: chords.map((chord) => chord.startMs),
      tablature: [],
    },
    id: options.fixtureId,
    media: { audio: `audio/recorded/${options.fixtureId}.wav` },
    modalities: ['audio'],
    source: {
      consentConfirmed: true,
      kind: 'recorded',
      license: options.license,
      recordedAt: options.recordedAt,
      recordingId: options.fixtureId,
    },
    split: options.split,
    tags: ['recorded', 'real-guitar', 'polyphonic', 'chord'],
  });
}
