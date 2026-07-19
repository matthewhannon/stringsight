import type { AudioEvent, Lifecycle, PitchClass } from '../shared';
import type { WeightedPitchClass } from './chord-interpretation';
import { PITCH_CLASSES } from './pitch';
import type { TimedPitchClassEvidence } from './scale-key-interpretation';

export type AudioEventEvidenceOptions = {
  readonly includeProvisional?: boolean;
  readonly windowEndMs?: number;
};

const addWeight = (
  totals: Map<PitchClass, number>,
  pitchClass: PitchClass,
  weight: number,
): void => {
  totals.set(pitchClass, Math.min(1, (totals.get(pitchClass) ?? 0) + weight));
};

const relativeCandidateWeight = (
  candidateConfidence: number,
  strongestConfidence: number,
): number =>
  strongestConfidence <= Number.EPSILON ? 0 : candidateConfidence / strongestConfidence;

const extractPitchClasses = (event: AudioEvent): WeightedPitchClass[] => {
  const totals = new Map<PitchClass, number>();
  const strongestConfidence = event.candidates[0]?.confidence ?? 0;
  if (event.kind === 'note') {
    event.candidates.forEach((candidate) => {
      const candidateWeight = relativeCandidateWeight(candidate.confidence, strongestConfidence);
      addWeight(totals, candidate.pitchClass, candidateWeight);
    });
  } else if (event.kind === 'chord') {
    if (event.observedPitchClasses.length > 0) {
      event.observedPitchClasses.forEach(({ pitchClass, weight }) =>
        addWeight(totals, pitchClass, weight),
      );
    } else {
      // Candidate pitch classes describe template tones, not independent observations. Legacy
      // events without retained observations use only the selected hypothesis; alternatives must
      // not invent additional theory evidence.
      event.candidates[0]?.pitchClasses.forEach((pitchClass) => addWeight(totals, pitchClass, 1));
    }
  } else {
    event.candidates.forEach((candidate) => {
      const candidateWeight = relativeCandidateWeight(candidate.confidence, strongestConfidence);
      candidate.notes.forEach((note) =>
        addWeight(totals, note.pitchClass, candidateWeight * note.confidence),
      );
    });
  }
  return PITCH_CLASSES.flatMap((pitchClass) => {
    const weight = totals.get(pitchClass) ?? 0;
    return weight > 0 ? [{ pitchClass, weight }] : [];
  });
};

const includedLifecycle = (lifecycle: Lifecycle, includeProvisional: boolean): boolean =>
  includeProvisional || lifecycle !== 'provisional';

export function audioEventsToTimedPitchClassEvidence(
  events: readonly AudioEvent[],
  options: AudioEventEvidenceOptions = {},
): TimedPitchClassEvidence[] {
  const includeProvisional = options.includeProvisional ?? false;
  if (
    options.windowEndMs !== undefined &&
    (!Number.isFinite(options.windowEndMs) || options.windowEndMs < 0)
  ) {
    throw new RangeError('Audio-event evidence window end must be a finite nonnegative time.');
  }
  return events
    .filter((event) => includedLifecycle(event.lifecycle, includeProvisional))
    .map((event) => {
      const startMs = Number(event.time.startMs);
      const endMs = event.time.endMs === undefined ? options.windowEndMs : Number(event.time.endMs);
      if (endMs === undefined) {
        throw new RangeError('Open audio events require an explicit interpretation window end.');
      }
      if (endMs < startMs) {
        throw new RangeError('Interpretation window end cannot precede an audio event start.');
      }
      return {
        confidence: event.candidates[0]?.confidence ?? 0,
        eventId: event.id,
        pitchClasses: extractPitchClasses(event),
        time: { endMs, startMs },
      };
    });
}
