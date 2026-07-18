import type { NoteEvent } from '../shared';
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

export type RecordingFixtureOptions = BenchmarkConditions & {
  fixtureId: string;
  license: 'private-evaluation-only' | 'project-evaluation' | 'redistributable';
  recordedAt: string;
};

const dynamicVelocity = (dynamics: BenchmarkConditions['dynamics']): number =>
  dynamics === 'soft' ? 0.35 : dynamics === 'loud' ? 0.85 : 0.6;

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
