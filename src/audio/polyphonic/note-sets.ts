import {
  CONTRACT_SCHEMA_VERSION,
  NoteSetEventSchema,
  confidence,
  type ChordCandidate,
  type ChordEvent,
  type NoteSetEvent,
  type ObservedPitchClass,
  type PitchClass,
} from '../../shared';
import { midiToNoteName } from '../analysis/pitch';
import {
  BASIC_PITCH_FFT_HOP,
  BASIC_PITCH_SAMPLE_RATE,
  basicPitchFrameToMs,
  type BasicPitchDecodedNote,
} from './basic-pitch-decoder';
import { matchChordTemplates, rerankChordCandidates } from './chords';
import { finalizeChordSequence, type FinalizedChordObservation } from './finalized-sequence';
import type { ChordAnalysisProfile } from './contracts';
import type { AcousticChordHop } from './chord-observations';
import { buildAcousticChordBoundaryRegions } from './boundary-region-decoder';

type TimedModelNote = BasicPitchDecodedNote & {
  endMs: number;
  startMs: number;
};

const MINIMUM_NOTE_SET_DURATION_MS = 60;

const PITCH_CLASSES: readonly PitchClass[] = [
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
];

const timedNote = (note: BasicPitchDecodedNote, sourceTimeOffsetMs: number): TimedModelNote => ({
  ...note,
  endMs: sourceTimeOffsetMs + basicPitchFrameToMs(note.startFrame + note.durationFrames),
  startMs: sourceTimeOffsetMs + basicPitchFrameToMs(note.startFrame),
});

const sameMidiSet = (left: readonly TimedModelNote[], right: readonly TimedModelNote[]): boolean =>
  left.length === right.length &&
  left.every((note, index) => note.pitchMidi === right[index]?.pitchMidi);

export function basicPitchNotesToNoteSetEvents(
  notes: readonly BasicPitchDecodedNote[],
  runId: string,
  sourceTimeOffsetMs = 0,
): NoteSetEvent[] {
  if (!Number.isFinite(sourceTimeOffsetMs) || sourceTimeOffsetMs < 0) {
    throw new RangeError('Basic Pitch source time offset must be finite and non-negative.');
  }
  const timed = notes.map((note) => timedNote(note, sourceTimeOffsetMs));
  const boundaries = [...new Set(timed.flatMap((note) => [note.startMs, note.endMs]))].sort(
    (left, right) => left - right,
  );
  const segments: { endMs: number; notes: TimedModelNote[]; startMs: number }[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index];
    const endMs = boundaries[index + 1];
    if (startMs === undefined || endMs === undefined || endMs <= startMs) continue;
    const active = timed
      .filter((note) => note.startMs < endMs && note.endMs > startMs)
      .sort((left, right) => left.pitchMidi - right.pitchMidi);
    if (active.length < 2 || active.length > 6) continue;
    const previous = segments.at(-1);
    if (previous?.endMs === startMs && sameMidiSet(previous.notes, active)) {
      previous.endMs = endMs;
    } else {
      segments.push({ endMs, notes: active, startMs });
    }
  }

  return segments
    .filter((segment) => segment.endMs - segment.startMs >= MINIMUM_NOTE_SET_DURATION_MS)
    .map((segment, index) => {
      const notesForContract = segment.notes.map((note) => {
        const noteConfidence = Math.max(
          0,
          Math.min(1, (note.frameConfidence + note.onsetConfidence) / 2),
        );
        return {
          confidence: confidence(noteConfidence),
          evidence: ['basic-pitch-frame', 'basic-pitch-onset'],
          frameConfidence: confidence(Math.max(0, Math.min(1, note.frameConfidence))),
          midi: note.pitchMidi,
          noteName: midiToNoteName(note.pitchMidi),
          onsetConfidence: confidence(Math.max(0, Math.min(1, note.onsetConfidence))),
          pitchClass: PITCH_CLASSES[note.pitchMidi % 12] ?? 'C',
        };
      });
      const setConfidence =
        notesForContract.reduce((total, note) => total + note.confidence, 0) /
        notesForContract.length;
      return NoteSetEventSchema.parse({
        candidates: [
          {
            confidence: setConfidence,
            evidence: ['spotify-basic-pitch-v1.0.1'],
            notes: notesForContract,
            rank: 1,
            score: setConfidence,
          },
        ],
        diagnostics: {
          analysisPath: 'basic-pitch-finalized',
          fftHop: BASIC_PITCH_FFT_HOP,
          modelSampleRate: BASIC_PITCH_SAMPLE_RATE,
        },
        id: `${runId}-note-set-${String(index + 1)}`,
        kind: 'note-set',
        lifecycle: 'finalized',
        provenance: {
          algorithm: 'spotify-basic-pitch-plus-note-set-segmentation',
          generatedAtMs: segment.endMs,
          runId,
          subsystem: 'polyphonic-analysis',
          version: '1.0.1-stringsight.2',
        },
        schemaVersion: CONTRACT_SCHEMA_VERSION,
        time: { endMs: segment.endMs, startMs: segment.startMs },
      });
    });
}

const intervalOverlapMs = (
  left: { endMs?: number | undefined; startMs: number },
  right: { endMs?: number | undefined; startMs: number },
): number =>
  Math.max(
    0,
    Math.min(left.endMs ?? left.startMs, right.endMs ?? right.startMs) -
      Math.max(left.startMs, right.startMs),
  );

const aggregateNoteSetEvidence = (
  noteSets: readonly NoteSetEvent[],
  time: { endMs: number; startMs: number },
): {
  evidenceConfidence: number;
  sourceNoteSetIds: string[];
  values: number[];
} => {
  const overlapping = noteSets.filter((noteSet) => intervalOverlapMs(noteSet.time, time) > 0);
  const values = Array.from({ length: 12 }, () => 0);
  let weightedConfidence = 0;
  let totalWeight = 0;
  for (const noteSet of overlapping) {
    const notes = noteSet.candidates[0]?.notes ?? [];
    const overlapMs = intervalOverlapMs(noteSet.time, time);
    if (overlapMs <= 0 || notes.length === 0) continue;
    const setConfidence = noteSet.candidates[0]?.confidence ?? 0;
    totalWeight += overlapMs;
    weightedConfidence += overlapMs * setConfidence;
    const pitchClassConfidence = new Map<number, number>();
    for (const note of notes) {
      const pitchClass = note.midi % 12;
      pitchClassConfidence.set(
        pitchClass,
        Math.max(pitchClassConfidence.get(pitchClass) ?? 0, note.confidence),
      );
    }
    for (const [pitchClass, noteConfidence] of pitchClassConfidence) {
      values[pitchClass] = (values[pitchClass] ?? 0) + noteConfidence * overlapMs;
    }
  }
  const valueTotal = values.reduce((sum, value) => sum + value, 0);
  const normalizedValues = values.map((value) => value / Math.max(Number.EPSILON, valueTotal));
  return {
    evidenceConfidence: weightedConfidence / Math.max(Number.EPSILON, totalWeight),
    sourceNoteSetIds: overlapping.map(({ id }) => id),
    values: normalizedValues,
  };
};

const AMBIGUOUS_PITCH_CLASS_WEIGHT = 0.12;
const RELATIVE_DEFINING_MODEL_WEIGHT = 0.35;
const LOW_RELIABILITY_EXTENSION_PENALTY = 0.3;

const normalizeEvidence = (values: readonly number[]): number[] => {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => (total <= Number.EPSILON ? 0 : value / total));
};

type AcousticFusionEvidence = {
  readonly candidates: readonly ChordCandidate[];
  readonly observedPitchClasses: readonly ObservedPitchClass[];
};

const acousticEvidence = (event: AcousticFusionEvidence): number[] => {
  const values = Array.from({ length: PITCH_CLASSES.length }, () => 0);
  for (const evidence of event.observedPitchClasses) {
    const index = PITCH_CLASSES.indexOf(evidence.pitchClass);
    if (index >= 0) values[index] = evidence.weight;
  }
  return normalizeEvidence(values);
};

const evidenceSourceWeights = (
  acousticEvent: AcousticFusionEvidence,
  model: ReturnType<typeof aggregateNoteSetEvidence>,
): { acoustic: number; model: number } => {
  const strongest = acousticEvent.candidates[0]?.confidence ?? 0;
  const runnerUp = acousticEvent.candidates[1]?.confidence ?? 0;
  const acousticSeparation =
    strongest <= Number.EPSILON ? 0 : Math.max(0, 1 - runnerUp / strongest);
  const acousticHasEvidence = acousticEvent.observedPitchClasses.length > 0;
  const acousticReliability = acousticHasEvidence ? strongest * acousticSeparation : 0;
  const maximumModelWeight = Math.max(0, ...model.values);
  const definingModelPitchClassCount = model.values.filter(
    (weight) =>
      maximumModelWeight > Number.EPSILON &&
      weight >= maximumModelWeight * RELATIVE_DEFINING_MODEL_WEIGHT,
  ).length;
  const modelCompleteness = Math.min(1, definingModelPitchClassCount / 3);
  const modelReliability = model.evidenceConfidence * modelCompleteness;
  const total = acousticReliability + modelReliability;
  if (total <= Number.EPSILON) return { acoustic: 0, model: 1 };
  return { acoustic: acousticReliability / total, model: modelReliability / total };
};

const weightedEvidence = (
  acoustic: readonly number[],
  model: readonly number[],
  weights: { acoustic: number; model: number },
): number[] =>
  normalizeEvidence(
    Array.from(
      { length: PITCH_CLASSES.length },
      (_, index) => (acoustic[index] ?? 0) * weights.acoustic + (model[index] ?? 0) * weights.model,
    ),
  );

const enforceModelToneConsistency = (
  candidates: readonly ChordCandidate[],
  modelValues: readonly number[],
  modelEvidenceConfidence: number,
): ChordCandidate[] => {
  const maximumModelWeight = Math.max(0, ...modelValues);
  if (maximumModelWeight <= Number.EPSILON) return [...candidates];
  const definingModelPitchClasses = new Set(
    modelValues.flatMap((weight, index) => {
      const pitchClass = PITCH_CLASSES[index];
      return pitchClass !== undefined &&
        weight >= maximumModelWeight * RELATIVE_DEFINING_MODEL_WEIGHT
        ? [pitchClass]
        : [];
    }),
  );
  return rerankChordCandidates(
    candidates.map((candidate) => {
      const templatePitchClasses = new Set(candidate.pitchClasses);
      const unexplainedModelWeight = modelValues.reduce((total, weight, index) => {
        const pitchClass = PITCH_CLASSES[index];
        const isDefining = weight >= maximumModelWeight * RELATIVE_DEFINING_MODEL_WEIGHT;
        return pitchClass !== undefined && isDefining && !templatePitchClasses.has(pitchClass)
          ? total + weight
          : total;
      }, 0);
      const isSeventh =
        candidate.quality === 'dominant-7' ||
        candidate.quality === 'major-7' ||
        candidate.quality === 'minor-7';
      const extensionPitchClass = candidate.pitchClasses[3];
      const missingDefiningExtension =
        isSeventh &&
        definingModelPitchClasses.size >= 3 &&
        extensionPitchClass !== undefined &&
        !definingModelPitchClasses.has(extensionPitchClass);
      const missingExtensionPenalty = missingDefiningExtension
        ? modelEvidenceConfidence / definingModelPitchClasses.size
        : 0;
      return {
        ...candidate,
        score:
          candidate.score -
          unexplainedModelWeight * modelEvidenceConfidence -
          missingExtensionPenalty,
      };
    }),
    candidates.length,
  );
};

const capAmbiguousCandidateStrength = (
  candidates: readonly ChordCandidate[],
  values: readonly number[],
): ChordCandidate[] => {
  const definingPitchClassCount = values.filter(
    (value) => value >= AMBIGUOUS_PITCH_CLASS_WEIGHT,
  ).length;
  if (definingPitchClassCount >= 3) return [...candidates];
  let previousStrength = 0.55;
  return candidates.map((candidate, index) => {
    const matchStrength = Math.min(
      candidate.confidence,
      index === 0 ? 0.55 : previousStrength * 0.92,
    );
    previousStrength = matchStrength;
    return { ...candidate, confidence: confidence(matchStrength), rank: index + 1 };
  });
};

const applyModelExtensionReliability = (
  candidates: readonly ChordCandidate[],
  modelEvidenceConfidence: number,
): ChordCandidate[] =>
  rerankChordCandidates(
    candidates.map((candidate) => {
      const isSeventh =
        candidate.quality === 'dominant-7' ||
        candidate.quality === 'major-7' ||
        candidate.quality === 'minor-7';
      return {
        ...candidate,
        score:
          candidate.score -
          (isSeventh ? (1 - modelEvidenceConfidence) * LOW_RELIABILITY_EXTENSION_PENALTY : 0),
      };
    }),
    candidates.length,
  );

const fuseObservationEvidence = (
  acousticEvent: AcousticFusionEvidence,
  model: ReturnType<typeof aggregateNoteSetEvidence>,
): { candidates: ChordCandidate[]; observedPitchClasses: ObservedPitchClass[] } => {
  if (model.sourceNoteSetIds.length === 0) {
    return {
      candidates: acousticEvent.candidates.slice(0, 5).map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
      })),
      observedPitchClasses: [...acousticEvent.observedPitchClasses],
    };
  }
  const acoustic = acousticEvidence(acousticEvent);
  const sourceWeights = evidenceSourceWeights(acousticEvent, model);
  const values = weightedEvidence(acoustic, model.values, sourceWeights);
  const candidates = capAmbiguousCandidateStrength(
    enforceModelToneConsistency(acousticEvent.candidates, model.values, model.evidenceConfidence),
    values,
  );
  return {
    candidates,
    observedPitchClasses: values.flatMap((weight, index) => {
      const pitchClass = PITCH_CLASSES[index];
      return pitchClass === undefined || weight <= 0
        ? []
        : [{ pitchClass, weight: confidence(weight) }];
    }),
  };
};

const observedPitchClasses = (values: ArrayLike<number>): ObservedPitchClass[] =>
  Array.from(values).flatMap((weight, index) => {
    const pitchClass = PITCH_CLASSES[index];
    return pitchClass === undefined || weight <= 0
      ? []
      : [{ pitchClass, weight: confidence(Math.max(0, Math.min(1, weight))) }];
  });

/**
 * Pools retained acoustic hops into boundary-anchored regions before final label decoding. Model
 * evidence can rerank each region but cannot introduce a boundary, so attacks and note decay do not
 * become short finalized chord fragments.
 */
export function fuseAcousticHopAndModelChordEvents(
  noteSets: readonly NoteSetEvent[],
  acousticHops: readonly AcousticChordHop[],
  provisionalEvents: readonly ChordEvent[],
  runId: string,
  profile: ChordAnalysisProfile = 'accurate',
): ChordEvent[] {
  const regions = buildAcousticChordBoundaryRegions(
    acousticHops,
    provisionalEvents.flatMap(({ time }) => {
      const endMs = time.endMs ?? time.startMs;
      return endMs > time.startMs ? [{ endMs, startMs: time.startMs }] : [];
    }),
    profile,
  );
  if (regions.length === 0) {
    return fuseAcousticAndModelChordEvents(noteSets, provisionalEvents, runId, profile);
  }
  const sourceEventsByRegion = regions.map((region) =>
    provisionalEvents.filter((event) => intervalOverlapMs(event.time, region) > 0),
  );
  const regionCountBySourceEvent = new Map<string, number>();
  sourceEventsByRegion.flat().forEach(({ id }) => {
    regionCountBySourceEvent.set(id, (regionCountBySourceEvent.get(id) ?? 0) + 1);
  });
  const observations: FinalizedChordObservation[] = regions.flatMap((region, regionIndex) => {
    const sourceEvents = sourceEventsByRegion[regionIndex] ?? [];
    const oneToOneSource =
      sourceEvents.length === 1 && regionCountBySourceEvent.get(sourceEvents[0]?.id ?? '') === 1
        ? sourceEvents[0]
        : undefined;
    const acoustic: AcousticFusionEvidence = oneToOneSource ?? {
      candidates: region.candidates,
      observedPitchClasses: observedPitchClasses(region.pitchClassValues),
    };
    if (acoustic.candidates.length === 0) return [];
    const model = aggregateNoteSetEvidence(noteSets, region);
    const fused = fuseObservationEvidence(acoustic, model);
    return [
      {
        ...(region.boundaryBefore === undefined ? {} : { boundaryBefore: region.boundaryBefore }),
        candidates: fused.candidates,
        endMs: region.endMs,
        evidenceConfidence: Math.max(
          acoustic.candidates[0]?.confidence ?? 0,
          model.evidenceConfidence,
        ),
        observedPitchClasses: fused.observedPitchClasses,
        requireBoundaryForTransition: true,
        sequenceBreakBefore: region.sequenceBreakBefore,
        sourceAcousticEventIds: sourceEvents.map(({ id }) => id),
        sourceHopCount: region.sourceHopSequences.length,
        sourceNoteSetIds: model.sourceNoteSetIds,
        startMs: region.startMs,
      },
    ];
  });
  return finalizeChordSequence(observations, {
    algorithm: 'boundary-region-harmonic-chroma-plus-basic-pitch-fusion',
    analysisPath: 'acoustic-boundary-region-plus-basic-pitch-sequence',
    profile,
    provenanceVersion: '1.0.1-stringsight.7',
    provisionalEvents,
    runId,
  });
}

/**
 * Uses the continuous acoustic frontend for chord boundaries and harmonic labels, while
 * Basic Pitch supplies independent note evidence inside each span. This prevents decoded
 * note on/off edges from becoming the chord segmentation clock.
 */
export function fuseAcousticAndModelChordEvents(
  noteSets: readonly NoteSetEvent[],
  acousticEvents: readonly ChordEvent[],
  runId: string,
  profile: ChordAnalysisProfile = 'accurate',
): ChordEvent[] {
  const spans = acousticEvents
    .filter((event) => (event.time.endMs ?? event.time.startMs) > event.time.startMs)
    .sort((left, right) => left.time.startMs - right.time.startMs);
  if (spans.length === 0) return noteSetEventsToChordEvents(noteSets, runId, [], profile);
  const observations: FinalizedChordObservation[] = spans.flatMap((acoustic) => {
    const startMs = acoustic.time.startMs;
    const endMs = acoustic.time.endMs ?? startMs;
    if (endMs <= startMs) return [];
    const model = aggregateNoteSetEvidence(noteSets, { endMs, startMs });
    const fused = fuseObservationEvidence(acoustic, model);
    return [
      {
        candidates: fused.candidates,
        endMs,
        evidenceConfidence: Math.max(
          acoustic.candidates[0]?.confidence ?? 0,
          model.evidenceConfidence,
        ),
        observedPitchClasses: fused.observedPitchClasses,
        sourceAcousticEventIds: [acoustic.id],
        sourceNoteSetIds: model.sourceNoteSetIds,
        startMs,
      },
    ];
  });
  return finalizeChordSequence(observations, {
    algorithm: 'hpss-nnls-chroma-plus-basic-pitch-sequence-fusion',
    analysisPath: 'continuous-harmonic-chroma-plus-basic-pitch-sequence',
    profile,
    provenanceVersion: '1.0.1-stringsight.5',
    provisionalEvents: spans,
    runId,
  });
}

export function noteSetEventsToChordEvents(
  noteSets: readonly NoteSetEvent[],
  runId: string,
  provisionalEvents: readonly ChordEvent[] = [],
  profile: ChordAnalysisProfile = 'accurate',
): ChordEvent[] {
  const observations: FinalizedChordObservation[] = noteSets.map((noteSet) => {
    const notes = noteSet.candidates[0]?.notes ?? [];
    const values = Array.from({ length: 12 }, () => 0);
    notes.forEach((note) => {
      const pitchClass = note.midi % 12;
      values[pitchClass] = Math.max(values[pitchClass] ?? 0, note.confidence);
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    const normalized = values.map((value) => (total === 0 ? 0 : value / total));
    const bass = Array.from({ length: 12 }, () => 0);
    const lowest = notes[0];
    if (lowest !== undefined) bass[lowest.midi % 12] = 1;
    const modelEvidenceConfidence = noteSet.candidates[0]?.confidence ?? 0;
    const candidates = applyModelExtensionReliability(
      matchChordTemplates(
        {
          bass,
          energy: total / Math.max(1, notes.length),
          values: normalized,
        },
        8,
      ),
      modelEvidenceConfidence,
    );
    return {
      candidates,
      endMs: noteSet.time.endMs ?? noteSet.time.startMs,
      evidenceConfidence: modelEvidenceConfidence,
      observedPitchClasses: normalized.flatMap((weight, index) => {
        const pitchClass = PITCH_CLASSES[index];
        return pitchClass === undefined || weight <= 0
          ? []
          : [{ pitchClass, weight: confidence(weight) }];
      }),
      sourceAcousticEventIds: [],
      sourceNoteSetIds: [noteSet.id],
      startMs: noteSet.time.startMs,
    };
  });
  return finalizeChordSequence(observations, {
    algorithm: 'spotify-basic-pitch-plus-temporal-chord-decoder',
    analysisPath: 'basic-pitch-plus-temporal-chord-decoder',
    profile,
    provenanceVersion: '1.0.1-stringsight.3',
    provisionalEvents,
    runId,
  });
}
