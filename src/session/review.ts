import {
  CorrectionSchema,
  type AudioEvent,
  type Correction,
  type PitchClass,
  type Session,
} from '../shared';

const PITCH_CLASSES = [
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
] as const satisfies readonly PitchClass[];

export type ReviewEvent = {
  readonly alternatives: readonly string[];
  readonly appliedCorrection: Correction | null;
  readonly confidence: number;
  readonly correctedLabel: string;
  readonly rawEvent: ReviewableAudioEvent;
  readonly rawLabel: string;
  readonly state: 'corrected' | 'raw';
};

export type ReviewableAudioEvent = Extract<AudioEvent, { kind: 'chord' | 'note' }>;

export type CorrectionProblem = {
  readonly correctionId: string;
  readonly message: string;
};

const noteNameForMidi = (midi: number): string => {
  const pitchClass = PITCH_CLASSES[midi % 12] ?? 'C';
  return `${pitchClass}${String(Math.floor(midi / 12) - 1)}`;
};

const rawLabelFor = (event: AudioEvent): string => {
  if (event.kind === 'note') return event.candidates[0]?.noteName ?? 'Unknown note';
  if (event.kind === 'chord') return event.candidates[0]?.symbol ?? 'Unknown chord';
  return event.candidates[0]?.notes.map(({ noteName }) => noteName).join(' · ') ?? 'Unknown notes';
};

const alternativesFor = (event: AudioEvent): string[] => {
  if (event.kind === 'note') return event.candidates.map(({ noteName }) => noteName);
  if (event.kind === 'chord') return event.candidates.map(({ symbol }) => symbol);
  return event.candidates.map(({ notes }) => notes.map(({ noteName }) => noteName).join(' · '));
};

const confidenceFor = (event: AudioEvent): number => event.candidates[0]?.confidence ?? 0;

const correctionProblem = (
  correction: Correction,
  event: AudioEvent | undefined,
): string | null => {
  if (event === undefined) return 'The source event is no longer present in this session.';
  if (event.kind === 'note-set') {
    return 'Note-set events are detector evidence and are not directly correctable.';
  }
  if (correction.operation === 'revert') return null;
  if (correction.note !== undefined && event.kind !== 'note') {
    return 'A note correction can only target a note event.';
  }
  if (correction.chordSymbol !== undefined && event.kind !== 'chord') {
    return 'A chord correction can only target a chord event.';
  }
  if (correction.positions !== undefined) {
    return 'Fretboard-position corrections require a fused event and are not part of audio review.';
  }
  return null;
};

export function correctionProblems(session: Session): CorrectionProblem[] {
  const events = new Map(session.events.audio.map((event) => [event.id, event]));
  return session.corrections.flatMap((correction) => {
    const message = correctionProblem(correction, events.get(correction.eventId));
    return message === null ? [] : [{ correctionId: correction.id, message }];
  });
}

export function projectReviewEvents(session: Session): ReviewEvent[] {
  const validCorrections = new Map<string, Correction>();
  const events = new Map(session.events.audio.map((event) => [event.id, event]));
  for (const correction of session.corrections) {
    if (correctionProblem(correction, events.get(correction.eventId)) === null) {
      validCorrections.set(correction.eventId, correction);
    }
  }

  return session.events.audio
    .filter(
      (event): event is ReviewableAudioEvent =>
        event.kind !== 'note-set' &&
        event.lifecycle !== 'provisional' &&
        event.time.endMs !== undefined,
    )
    .map((rawEvent): ReviewEvent => {
      const latest = validCorrections.get(rawEvent.id) ?? null;
      const appliedCorrection = latest?.operation === 'replace' ? latest : null;
      const rawLabel = rawLabelFor(rawEvent);
      const correctedLabel =
        appliedCorrection?.chordSymbol ??
        (appliedCorrection?.note === undefined
          ? rawLabel
          : noteNameForMidi(appliedCorrection.note.midi));
      return {
        alternatives: alternativesFor(rawEvent),
        appliedCorrection,
        confidence: confidenceFor(rawEvent),
        correctedLabel,
        rawEvent,
        rawLabel,
        state: appliedCorrection === null ? 'raw' : 'corrected',
      };
    })
    .sort(
      (left, right) =>
        Number(left.rawEvent.time.startMs) - Number(right.rawEvent.time.startMs) ||
        left.rawEvent.id.localeCompare(right.rawEvent.id),
    );
}

export type ReplacementCorrectionInput =
  | { readonly chordSymbol: string; readonly eventId: string }
  | { readonly eventId: string; readonly midi: number };

export function createReplacementCorrection(
  session: Session,
  input: ReplacementCorrectionInput,
  options: { readonly createdAtMs: number; readonly id: string; readonly reason?: string },
): Correction {
  const event = session.events.audio.find(({ id }) => id === input.eventId);
  if (event === undefined) throw new Error('The correction target does not exist in this session.');
  const base = {
    author: 'user' as const,
    createdAtMs: options.createdAtMs,
    eventId: input.eventId,
    id: options.id,
    operation: 'replace' as const,
    ...(options.reason === undefined ? {} : { reason: options.reason }),
  };
  if ('midi' in input) {
    if (event.kind !== 'note') throw new Error('Only note events accept MIDI note corrections.');
    const pitchClass = PITCH_CLASSES[input.midi % 12];
    if (pitchClass === undefined) throw new Error('The MIDI note is outside the supported range.');
    return CorrectionSchema.parse({ ...base, note: { midi: input.midi, pitchClass } });
  }
  if (event.kind !== 'chord') throw new Error('Only chord events accept chord-symbol corrections.');
  return CorrectionSchema.parse({ ...base, chordSymbol: input.chordSymbol });
}

export function createRevertCorrection(
  session: Session,
  eventId: string,
  options: { readonly createdAtMs: number; readonly id: string },
): Correction {
  const event = session.events.audio.find(({ id }) => id === eventId);
  if (event === undefined) {
    throw new Error('The correction target does not exist in this session.');
  }
  if (event.kind === 'note-set') {
    throw new Error('Only note and chord events can be reverted in audio review.');
  }
  return CorrectionSchema.parse({
    author: 'user',
    createdAtMs: options.createdAtMs,
    eventId,
    id: options.id,
    operation: 'revert',
  });
}
