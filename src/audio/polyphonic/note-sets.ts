import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteSetEventSchema,
  confidence,
  type ChordCandidate,
  type ChordEvent,
  type NoteSetEvent,
  type PitchClass,
} from '../../shared';
import { midiToNoteName } from '../analysis/pitch';
import {
  BASIC_PITCH_FFT_HOP,
  BASIC_PITCH_SAMPLE_RATE,
  basicPitchFrameToMs,
  type BasicPitchDecodedNote,
} from './basic-pitch-decoder';
import { matchChordTemplates } from './chords';
import { decodeChordSequence, type DecodedChordSpan } from './temporal-decoder';
import type { ChordAnalysisProfile } from './contracts';

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

const timedNote = (note: BasicPitchDecodedNote): TimedModelNote => ({
  ...note,
  endMs: basicPitchFrameToMs(note.startFrame + note.durationFrames),
  startMs: basicPitchFrameToMs(note.startFrame),
});

const sameMidiSet = (left: readonly TimedModelNote[], right: readonly TimedModelNote[]): boolean =>
  left.length === right.length &&
  left.every((note, index) => note.pitchMidi === right[index]?.pitchMidi);

export function basicPitchNotesToNoteSetEvents(
  notes: readonly BasicPitchDecodedNote[],
  runId: string,
): NoteSetEvent[] {
  const timed = notes.map(timedNote);
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

const aggregateNoteSetCandidates = (
  noteSets: readonly NoteSetEvent[],
  time: { endMs: number; startMs: number },
): { candidates: ChordCandidate[]; sourceNoteSetIds: string[] } => {
  const overlapping = noteSets.filter((noteSet) => intervalOverlapMs(noteSet.time, time) > 0);
  const values = Array.from({ length: 12 }, () => 0);
  const bass = Array.from({ length: 12 }, () => 0);
  let weightedConfidence = 0;
  let totalWeight = 0;
  for (const noteSet of overlapping) {
    const notes = noteSet.candidates[0]?.notes ?? [];
    const overlapMs = intervalOverlapMs(noteSet.time, time);
    if (overlapMs <= 0 || notes.length === 0) continue;
    const setConfidence = noteSet.candidates[0]?.confidence ?? 0;
    totalWeight += overlapMs;
    weightedConfidence += overlapMs * setConfidence;
    for (const note of notes) {
      const pitchClass = note.midi % 12;
      values[pitchClass] = (values[pitchClass] ?? 0) + note.confidence * overlapMs;
    }
    const lowest = notes.reduce((candidate, note) =>
      note.midi < candidate.midi ? note : candidate,
    );
    bass[lowest.midi % 12] = (bass[lowest.midi % 12] ?? 0) + lowest.confidence * overlapMs;
  }
  const valueTotal = values.reduce((sum, value) => sum + value, 0);
  const bassTotal = bass.reduce((sum, value) => sum + value, 0);
  return {
    candidates:
      valueTotal <= Number.EPSILON
        ? []
        : matchChordTemplates(
            {
              bass: bass.map((value) => value / Math.max(Number.EPSILON, bassTotal)),
              energy: weightedConfidence / Math.max(Number.EPSILON, totalWeight),
              values: values.map((value) => value / valueTotal),
            },
            108,
          ),
    sourceNoteSetIds: overlapping.map(({ id }) => id),
  };
};

const fuseCandidateRanks = (
  acousticCandidates: readonly ChordCandidate[],
  modelCandidates: readonly ChordCandidate[],
): ChordCandidate[] => {
  if (modelCandidates.length === 0) {
    return acousticCandidates.slice(0, 5).map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
  }
  const acousticBySymbol = new Map(
    acousticCandidates.map((candidate) => [candidate.symbol, candidate]),
  );
  const modelBySymbol = new Map(modelCandidates.map((candidate) => [candidate.symbol, candidate]));
  const acousticFloor = (acousticCandidates[0]?.score ?? 0) - 0.5;
  const modelFloor = (modelCandidates[0]?.score ?? 0) - 0.5;
  const symbols = new Set([
    ...acousticCandidates.map(({ symbol }) => symbol),
    ...modelCandidates.slice(0, 12).map(({ symbol }) => symbol),
  ]);
  const fused = [...symbols]
    .map((symbol) => {
      const acoustic = acousticBySymbol.get(symbol);
      const model = modelBySymbol.get(symbol);
      const score = 0.7 * (acoustic?.score ?? acousticFloor) + 0.3 * (model?.score ?? modelFloor);
      return { ...(acoustic ?? model), score } as ChordCandidate;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  const bestScore = fused[0]?.score ?? 0;
  const runnerUpScore = fused[1]?.score ?? 0;
  const bestConfidence =
    Math.max(0, Math.min(1, (bestScore - 0.35) / 0.65)) *
    (0.72 + Math.min(0.28, Math.max(0, bestScore - runnerUpScore) * 3));
  let previousConfidence = bestConfidence;
  return fused.map((candidate, index) => {
    const candidateConfidence =
      index === 0
        ? bestConfidence
        : Math.min(
            previousConfidence * 0.92,
            bestConfidence * Math.exp(-4 * Math.max(0, bestScore - candidate.score)),
          );
    previousConfidence = candidateConfidence;
    return {
      ...candidate,
      confidence: confidence(candidateConfidence),
      rank: index + 1,
    };
  });
};

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

  return spans.map((span, index) => {
    const endMs = span.time.endMs ?? span.time.startMs;
    const model = aggregateNoteSetCandidates(noteSets, { endMs, startMs: span.time.startMs });
    const candidates = fuseCandidateRanks(span.candidates, model.candidates);
    return ChordEventSchema.parse({
      candidates,
      diagnostics: {
        analysisPath: 'continuous-harmonic-chroma-plus-basic-pitch',
        chordAnalysisProfile: profile,
        reconciliation:
          model.candidates.length === 0 ? 'acoustic-only' : 'weighted-evidence-fusion',
        sourceNoteSetCount: model.sourceNoteSetIds.length,
        sourceNoteSetId: model.sourceNoteSetIds[0] ?? 'none',
        temporalDecoder: 'multiscale-live-hysteresis',
      },
      id: span.id || `${runId}-fused-chord-${String(index + 1)}`,
      kind: 'chord',
      lifecycle: 'finalized',
      provenance: {
        algorithm: 'hpss-nnls-chroma-plus-basic-pitch-fusion',
        generatedAtMs: endMs,
        runId,
        subsystem: 'polyphonic-analysis',
        version: '1.0.1-stringsight.3',
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs, startMs: span.time.startMs },
    });
  });
}

export function noteSetEventsToChordEvents(
  noteSets: readonly NoteSetEvent[],
  runId: string,
  provisionalEvents: readonly ChordEvent[] = [],
  profile: ChordAnalysisProfile = 'accurate',
): ChordEvent[] {
  const observations = noteSets.map((noteSet) => {
    const notes = noteSet.candidates[0]?.notes ?? [];
    const values = Array.from({ length: 12 }, () => 0);
    notes.forEach((note) => {
      const pitchClass = note.midi % 12;
      values[pitchClass] = (values[pitchClass] ?? 0) + note.confidence;
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    const normalized = values.map((value) => (total === 0 ? 0 : value / total));
    const bass = Array.from({ length: 12 }, () => 0);
    const lowest = notes[0];
    if (lowest !== undefined) bass[lowest.midi % 12] = 1;
    const candidates = matchChordTemplates(
      {
        bass,
        energy: total / Math.max(1, notes.length),
        values: normalized,
      },
      108,
    );
    return {
      candidates,
      endMs: noteSet.time.endMs ?? noteSet.time.startMs,
      evidenceConfidence: noteSet.candidates[0]?.confidence ?? 0,
      noteSet,
      startMs: noteSet.time.startMs,
    };
  });
  const decoded = decodeChordSequence(observations, profile);
  const spans = decoded.reduce<(DecodedChordSpan & { noteSetIds: string[] })[]>(
    (merged, span, index) => {
      const previous = merged.at(-1);
      const sourceNoteSetId = observations[index]?.noteSet.id;
      if (previous?.selected.symbol === span.selected.symbol) {
        previous.endMs = span.endMs;
        if (sourceNoteSetId !== undefined) previous.noteSetIds.push(sourceNoteSetId);
        return merged;
      }
      merged.push({
        ...span,
        noteSetIds: sourceNoteSetId === undefined ? [] : [sourceNoteSetId],
      });
      return merged;
    },
    [],
  );
  const usedProvisionalIds = new Set<string>();

  return spans.map((span, index) => {
    let previousConfidence: number = span.selected.confidence;
    const rankedCandidates = [
      span.selected,
      ...span.candidates.filter(({ symbol }) => symbol !== span.selected.symbol),
    ]
      .slice(0, 5)
      .map((candidate, rank) => {
        const candidateConfidence =
          rank === 0
            ? candidate.confidence
            : Math.min(candidate.confidence, previousConfidence * 0.92);
        previousConfidence = candidateConfidence;
        return { ...candidate, confidence: confidence(candidateConfidence), rank: rank + 1 };
      });
    const provisional = provisionalEvents
      .filter((event) => !usedProvisionalIds.has(event.id))
      .map((event) => ({
        event,
        overlapMs: intervalOverlapMs(event.time, { endMs: span.endMs, startMs: span.startMs }),
      }))
      .filter(({ overlapMs }) => overlapMs > 0)
      .sort((left, right) => right.overlapMs - left.overlapMs)[0]?.event;
    if (provisional !== undefined) usedProvisionalIds.add(provisional.id);

    return ChordEventSchema.parse({
      candidates: rankedCandidates,
      diagnostics: {
        analysisPath: 'basic-pitch-plus-temporal-chord-decoder',
        chordAnalysisProfile: profile,
        reconciliation: provisional === undefined ? 'model-only' : 'one-to-one-overlap',
        sourceNoteSetCount: span.noteSetIds.length,
        sourceNoteSetId: span.noteSetIds[0] ?? 'none',
        temporalDecoder: 'global-viterbi',
      },
      id: provisional?.id ?? `${runId}-model-chord-${String(index + 1)}`,
      kind: 'chord',
      lifecycle: 'finalized',
      provenance: {
        algorithm: 'spotify-basic-pitch-plus-temporal-chord-decoder',
        generatedAtMs: span.endMs,
        runId,
        subsystem: 'polyphonic-analysis',
        version: '1.0.1-stringsight.2',
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs: span.endMs, startMs: span.startMs },
    });
  });
}
