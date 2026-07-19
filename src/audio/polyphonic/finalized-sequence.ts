import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  confidence,
  type ChordCandidate,
  type ChordEvent,
  type ObservedPitchClass,
} from '../../shared';
import type { ChordAnalysisProfile } from './contracts';
import type { ChordBoundaryEvidence } from './chord-observations';
import {
  decodeChordSequence,
  type ChordObservation,
  type DecodedChordSpan,
} from './temporal-decoder';

export type FinalizedChordObservation = ChordObservation & {
  readonly observedPitchClasses: readonly ObservedPitchClass[];
  readonly sourceAcousticEventIds: readonly string[];
  readonly sourceHopCount?: number;
  readonly sourceNoteSetIds: readonly string[];
};

export type FinalizeChordSequenceOptions = {
  readonly algorithm: string;
  readonly analysisPath: string;
  readonly profile: ChordAnalysisProfile;
  readonly provenanceVersion: string;
  readonly provisionalEvents: readonly ChordEvent[];
  readonly runId: string;
};

type DecodedObservation = DecodedChordSpan & FinalizedChordObservation;

type MergedSpan = {
  boundaryBefore?: ChordBoundaryEvidence;
  candidates: ChordCandidate[];
  endMs: number;
  observedPitchClasses: ObservedPitchClass[];
  selectedSymbol: string;
  sourceAcousticEventIds: string[];
  sourceNoteSetIds: string[];
  startMs: number;
};

const MAX_CONTIGUOUS_GAP_MS = 160;
const DEFINING_PITCH_CLASS_WEIGHT = 0.12;

const intervalOverlapMs = (
  left: { endMs?: number | undefined; startMs: number },
  right: { endMs?: number | undefined; startMs: number },
): number =>
  Math.max(
    0,
    Math.min(left.endMs ?? left.startMs, right.endMs ?? right.startMs) -
      Math.max(left.startMs, right.startMs),
  );

const unique = (values: readonly string[]): string[] => [...new Set(values)];

const decodeContiguousSequences = (
  observations: readonly FinalizedChordObservation[],
  profile: ChordAnalysisProfile,
): DecodedObservation[] => {
  const sequences = observations.reduce<FinalizedChordObservation[][]>((groups, observation) => {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (
      current === undefined ||
      previous === undefined ||
      observation.sequenceBreakBefore === true ||
      observation.startMs - previous.endMs > MAX_CONTIGUOUS_GAP_MS
    ) {
      groups.push([observation]);
    } else {
      current.push(observation);
    }
    return groups;
  }, []);

  return sequences.flatMap((sequence) =>
    decodeChordSequence(sequence, profile).flatMap((decoded, index) => {
      const source = sequence[index];
      return source === undefined
        ? []
        : [
            {
              ...decoded,
              observedPitchClasses: source.observedPitchClasses,
              sourceAcousticEventIds: source.sourceAcousticEventIds,
              sourceNoteSetIds: source.sourceNoteSetIds,
            },
          ];
    }),
  );
};

const rankMergedCandidates = (observations: readonly DecodedObservation[]): ChordCandidate[] => {
  const selectedSymbol = observations[0]?.selected.symbol;
  if (selectedSymbol === undefined) return [];
  const totals = new Map<
    string,
    { candidate: ChordCandidate; confidence: number; durationMs: number; score: number }
  >();
  for (const observation of observations) {
    const durationMs = Math.max(1, observation.endMs - observation.startMs);
    for (const candidate of observation.candidates) {
      const total = totals.get(candidate.symbol) ?? {
        candidate,
        confidence: 0,
        durationMs: 0,
        score: 0,
      };
      total.confidence += candidate.confidence * durationMs;
      total.durationMs += durationMs;
      total.score += candidate.score * durationMs;
      totals.set(candidate.symbol, total);
    }
  }
  const averaged = [...totals.values()].map((total) => ({
    ...total.candidate,
    confidence: total.confidence / total.durationMs,
    score: total.score / total.durationMs,
  }));
  const selected = averaged.find(({ symbol }) => symbol === selectedSymbol);
  if (selected === undefined) return [];
  const ordered = [
    selected,
    ...averaged
      .filter(({ symbol }) => symbol !== selectedSymbol)
      .sort((left, right) => right.score - left.score),
  ].slice(0, 5);
  let previousStrength = 1;
  return ordered.map((candidate, index) => {
    const matchStrength =
      index === 0 ? candidate.confidence : Math.min(candidate.confidence, previousStrength * 0.92);
    previousStrength = matchStrength;
    return {
      ...candidate,
      confidence: confidence(Math.max(0, Math.min(1, matchStrength))),
      rank: index + 1,
    };
  });
};

const mergeObservedPitchClasses = (
  observations: readonly DecodedObservation[],
): ObservedPitchClass[] => {
  const totals = new Map<ObservedPitchClass['pitchClass'], number>();
  let totalDurationMs = 0;
  for (const observation of observations) {
    const durationMs = Math.max(1, observation.endMs - observation.startMs);
    totalDurationMs += durationMs;
    for (const evidence of observation.observedPitchClasses) {
      totals.set(
        evidence.pitchClass,
        (totals.get(evidence.pitchClass) ?? 0) + evidence.weight * durationMs,
      );
    }
  }
  return [...totals.entries()]
    .map(([pitchClass, total]) => ({
      pitchClass,
      weight: confidence(Math.max(0, Math.min(1, total / Math.max(1, totalDurationMs)))),
    }))
    .sort((left, right) => right.weight - left.weight);
};

const mergeDecodedObservations = (decoded: readonly DecodedObservation[]): MergedSpan[] => {
  const groups: DecodedObservation[][] = [];
  for (const observation of decoded) {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    if (
      previous?.selected.symbol === observation.selected.symbol &&
      observation.startMs - previous.endMs <= MAX_CONTIGUOUS_GAP_MS
    ) {
      current?.push(observation);
    } else {
      groups.push([observation]);
    }
  }
  return groups.flatMap((group) => {
    const first = group[0];
    const last = group.at(-1);
    if (first === undefined || last === undefined) return [];
    const candidates = rankMergedCandidates(group);
    if (candidates.length === 0) return [];
    return [
      {
        ...(() => {
          const boundaryBefore = group
            .map(({ boundaryBefore }) => boundaryBefore)
            .filter((boundary): boundary is ChordBoundaryEvidence => boundary !== undefined)
            .sort((left, right) => right.score - left.score)[0];
          return boundaryBefore === undefined ? {} : { boundaryBefore };
        })(),
        candidates,
        endMs: last.endMs,
        observedPitchClasses: mergeObservedPitchClasses(group),
        selectedSymbol: first.selected.symbol,
        sourceAcousticEventIds: unique(
          group.flatMap(({ sourceAcousticEventIds }) => sourceAcousticEventIds),
        ),
        sourceNoteSetIds: unique(group.flatMap(({ sourceNoteSetIds }) => sourceNoteSetIds)),
        startMs: first.startMs,
      },
    ];
  });
};

export function finalizeChordSequence(
  observations: readonly FinalizedChordObservation[],
  options: FinalizeChordSequenceOptions,
): ChordEvent[] {
  const sorted = [...observations]
    .filter(({ candidates, endMs, startMs }) => candidates.length > 0 && endMs > startMs)
    .sort((left, right) => left.startMs - right.startMs);
  const spans = mergeDecodedObservations(decodeContiguousSequences(sorted, options.profile));
  const usedProvisionalIds = new Set<string>();

  return spans.map((span, index) => {
    const provisional = options.provisionalEvents
      .filter((event) => !usedProvisionalIds.has(event.id))
      .map((event) => ({
        event,
        overlapMs: intervalOverlapMs(event.time, span),
      }))
      .filter(({ overlapMs }) => overlapMs > 0)
      .sort((left, right) => right.overlapMs - left.overlapMs)[0]?.event;
    if (provisional !== undefined) usedProvisionalIds.add(provisional.id);
    const reconciliation =
      provisional === undefined
        ? 'model-sequence-only'
        : span.sourceAcousticEventIds.length > 1
          ? 'merged-provisional-overlap'
          : span.sourceAcousticEventIds.length === 1 && span.sourceNoteSetIds.length > 0
            ? 'weighted-evidence-fusion'
            : 'one-to-one-overlap';
    const selectedCandidate = span.candidates[0];
    const definingObserved = span.observedPitchClasses.filter(
      ({ weight }) => weight >= DEFINING_PITCH_CLASS_WEIGHT,
    );
    const selectedPitchClasses = new Set(selectedCandidate?.pitchClasses ?? []);
    const selectedEvidenceWeight = span.observedPitchClasses.reduce(
      (total, evidence) =>
        total + (selectedPitchClasses.has(evidence.pitchClass) ? evidence.weight : 0),
      0,
    );
    const totalEvidenceWeight = span.observedPitchClasses.reduce(
      (total, evidence) => total + evidence.weight,
      0,
    );

    return ChordEventSchema.parse({
      candidates: span.candidates,
      diagnostics: {
        analysisPath: options.analysisPath,
        chordAnalysisProfile: options.profile,
        ...(span.boundaryBefore === undefined
          ? {}
          : {
              attackStrength: span.boundaryBefore.attackStrength,
              boundaryMode: span.boundaryBefore.mode,
              boundaryScore: span.boundaryBefore.score,
              changePersistenceMs: span.boundaryBefore.persistenceMs,
              harmonicDistance: span.boundaryBefore.harmonicDistance,
              novelToneStrength: span.boundaryBefore.novelToneStrength,
            }),
        definingObservedPitchClassCount: definingObserved.length,
        harmonicAmbiguity: definingObserved.length < 3 ? 'insufficient-defining-tones' : 'resolved',
        labelEvidenceCoverage:
          totalEvidenceWeight <= Number.EPSILON ? 0 : selectedEvidenceWeight / totalEvidenceWeight,
        reconciliation,
        scoreSemantics: 'uncalibrated-match-strength',
        sourceAcousticEventCount: span.sourceAcousticEventIds.length,
        sourceAcousticEventId: span.sourceAcousticEventIds[0] ?? 'none',
        sourceNoteSetCount: span.sourceNoteSetIds.length,
        sourceNoteSetId: span.sourceNoteSetIds[0] ?? 'none',
        sourceHopCount: sorted
          .filter(({ endMs, startMs }) => endMs > span.startMs && startMs < span.endMs)
          .reduce((total, observation) => total + (observation.sourceHopCount ?? 1), 0),
        temporalDecoder: 'global-duration-aware-viterbi',
      },
      id: provisional?.id ?? `${options.runId}-final-chord-${String(index + 1)}`,
      kind: 'chord',
      lifecycle: 'finalized',
      observedPitchClasses: span.observedPitchClasses,
      provenance: {
        algorithm: options.algorithm,
        generatedAtMs: span.endMs,
        runId: options.runId,
        subsystem: 'polyphonic-analysis',
        version: options.provenanceVersion,
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs: span.endMs, startMs: span.startMs },
    });
  });
}
