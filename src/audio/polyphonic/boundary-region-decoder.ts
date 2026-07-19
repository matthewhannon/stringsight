import type { ChordCandidate } from '../../shared';
import { computeChordBoundaryEvidence } from './boundary-evidence';
import {
  CHORD_CHANGE_ACTIVITY_PEAK_RATIO,
  CHORD_ATTACK_EVIDENCE_THRESHOLD,
  POLYPHONIC_ACTIVITY_OPEN_THRESHOLD,
  type AcousticChordHop,
  type ChordBoundaryEvidence,
} from './chord-observations';
import { CHORD_TEMPLATE_CATALOG, materializeChordCandidates } from './chords';
import type { ChordAnalysisProfile } from './contracts';

export type AcousticActivitySpan = {
  readonly endMs: number;
  readonly startMs: number;
};

export type AcousticChordBoundaryRegion = {
  readonly bassChroma: Float32Array;
  readonly boundaryBefore?: ChordBoundaryEvidence;
  readonly candidates: readonly ChordCandidate[];
  readonly endMs: number;
  readonly pitchClassValues: Float32Array;
  readonly sequenceBreakBefore: boolean;
  readonly sourceHopSequences: readonly number[];
  readonly startMs: number;
  readonly templateScores: Float32Array;
};

type BoundaryAnchor = {
  readonly atMs: number;
  readonly evidence: ChordBoundaryEvidence;
  readonly source: 'confirmed' | 'inferred';
};

type HopRun = {
  readonly endIndex: number;
  readonly startIndex: number;
  readonly symbol: string;
};

const MAXIMUM_ACTIVE_GAP_MS = 160;
const BOUNDARY_DEDUPLICATION_MS = 160;
const MINIMUM_CANDIDATE_CONFIDENCE = 0.3;
const MINIMUM_CANDIDATE_SCORE = 0.58;
const MINIMUM_ATTACK_FREE_REFERENCE_ENERGY_RATIO = 0.85;
const MAXIMUM_REGION_LABEL_HOPS = 6;

const PROFILE_CONFIGURATION: Record<
  ChordAnalysisProfile,
  { readonly minimumRunHops: number; readonly minimumScoreMargin: number }
> = {
  accurate: { minimumRunHops: 6, minimumScoreMargin: 0.04 },
  responsive: { minimumRunHops: 4, minimumScoreMargin: 0.025 },
};

const intervalOverlapMs = (left: AcousticActivitySpan, right: AcousticActivitySpan): number =>
  Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));

const normalize = (values: ArrayLike<number>): Float32Array => {
  const output = Float32Array.from(values, (value) => Math.max(0, value));
  const total = output.reduce((sum, value) => sum + value, 0);
  if (total > Number.EPSILON) {
    output.forEach((value, index) => {
      output[index] = value / total;
    });
  }
  return output;
};

const robustMean = (vectors: readonly ArrayLike<number>[], length: number): Float32Array => {
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const values = vectors
      .map((vector) => vector[index] ?? 0)
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (values.length === 0) continue;
    const trim = values.length >= 5 ? Math.floor(values.length * 0.2) : 0;
    const retained = values.slice(trim, values.length - trim);
    output[index] = retained.reduce((sum, value) => sum + value, 0) / Math.max(1, retained.length);
  }
  return output;
};

const mergeActivitySpans = (spans: readonly AcousticActivitySpan[]): AcousticActivitySpan[] => {
  const sorted = spans
    .filter(({ endMs, startMs }) => endMs > startMs)
    .sort((left, right) => left.startMs - right.startMs);
  const merged: AcousticActivitySpan[] = [];
  for (const span of sorted) {
    const current = merged.at(-1);
    if (current !== undefined && span.startMs - current.endMs <= MAXIMUM_ACTIVE_GAP_MS) {
      merged[merged.length - 1] = {
        endMs: Math.max(current.endMs, span.endMs),
        startMs: current.startMs,
      };
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
};

const usableShortSymbol = (hop: AcousticChordHop): string | null => {
  const candidate = (hop.harmony.shortCandidates ?? hop.harmony.topCandidates)[0];
  return candidate !== undefined &&
    candidate.confidence >= MINIMUM_CANDIDATE_CONFIDENCE &&
    candidate.score >= MINIMUM_CANDIDATE_SCORE
    ? candidate.symbol
    : null;
};

const stableRuns = (hops: readonly AcousticChordHop[]): HopRun[] => {
  const runs: HopRun[] = [];
  let symbol: string | null = null;
  let startIndex = 0;
  for (let index = 0; index <= hops.length; index += 1) {
    const nextHop = hops[index];
    const nextSymbol = nextHop === undefined ? null : usableShortSymbol(nextHop);
    if (nextSymbol === symbol) continue;
    if (symbol !== null) runs.push({ endIndex: index, startIndex, symbol });
    symbol = nextSymbol;
    startIndex = index;
  }
  return runs;
};

const strongestRecentAttack = (
  hops: readonly AcousticChordHop[],
  runStartIndex: number,
): AcousticChordHop['attack'] | null => {
  const startHop = hops[runStartIndex];
  if (startHop === undefined) return null;
  return (
    hops
      .slice(Math.max(0, runStartIndex - 7), runStartIndex + 1)
      .filter(
        ({ attack, featureTimeMs }) =>
          attack.peakTimeMs !== null && featureTimeMs - attack.peakTimeMs <= 600,
      )
      .map(({ attack }) => attack)
      .sort((left, right) => right.strength - left.strength)[0] ?? null
  );
};

const inferredBoundaryAnchors = (
  hops: readonly AcousticChordHop[],
  profile: ChordAnalysisProfile,
): BoundaryAnchor[] => {
  const configuration = PROFILE_CONFIGURATION[profile];
  const runs = stableRuns(hops).filter(
    ({ endIndex, startIndex }) => endIndex - startIndex >= configuration.minimumRunHops,
  );
  const anchors: BoundaryAnchor[] = [];
  for (let index = 1; index < runs.length; index += 1) {
    const previous = runs[index - 1];
    const current = runs[index];
    if (previous === undefined || current === undefined || previous.symbol === current.symbol) {
      continue;
    }
    const reference = hops[Math.max(previous.startIndex, previous.endIndex - 1)];
    const currentHop =
      hops[Math.min(current.endIndex - 1, current.startIndex + configuration.minimumRunHops - 1)];
    if (reference === undefined || currentHop === undefined) continue;
    const priorPeakEnergy = Math.max(
      0,
      ...hops.slice(0, current.startIndex).map(({ activityEnergy }) => activityEnergy),
    );
    const changeEnergy = Math.max(
      0,
      ...hops
        .slice(current.startIndex, current.endIndex)
        .map(({ activityEnergy }) => activityEnergy),
    );
    if (
      changeEnergy <
      Math.max(
        POLYPHONIC_ACTIVITY_OPEN_THRESHOLD,
        priorPeakEnergy * CHORD_CHANGE_ACTIVITY_PEAK_RATIO,
      )
    ) {
      continue;
    }
    const attack = strongestRecentAttack(hops, current.startIndex);
    if (
      (attack?.strength ?? 0) < CHORD_ATTACK_EVIDENCE_THRESHOLD &&
      changeEnergy < reference.activityEnergy * MINIMUM_ATTACK_FREE_REFERENCE_ENERGY_RATIO
    ) {
      continue;
    }
    const evidenceHop = attack === null ? currentHop : { ...currentHop, attack };
    const hopDurationMs = Math.max(1, currentHop.time.endMs - currentHop.time.startMs);
    const persistenceMs = (current.endIndex - current.startIndex) * hopDurationMs;
    const evidence = computeChordBoundaryEvidence(reference, evidenceHop, persistenceMs, {
      persistentChangeMs: configuration.minimumRunHops * hopDurationMs,
    });
    if (evidence.mode === 'none' || evidence.candidateMargin < configuration.minimumScoreMargin) {
      continue;
    }
    const runStartMs = hops[current.startIndex]?.time.startMs ?? evidence.atMs;
    anchors.push({
      atMs:
        evidence.mode === 'attack-change' && attack?.peakTimeMs !== null
          ? (attack?.peakTimeMs ?? runStartMs)
          : runStartMs,
      evidence: {
        ...evidence,
        atMs:
          evidence.mode === 'attack-change' && attack?.peakTimeMs !== null
            ? (attack?.peakTimeMs ?? runStartMs)
            : runStartMs,
      },
      source: 'inferred',
    });
  }
  return anchors;
};

const explicitBoundaryAnchors = (hops: readonly AcousticChordHop[]): BoundaryAnchor[] =>
  hops.flatMap(({ boundaryBefore }) =>
    boundaryBefore === undefined || boundaryBefore.mode === 'none'
      ? []
      : [{ atMs: boundaryBefore.atMs, evidence: boundaryBefore, source: 'confirmed' }],
  );

const deduplicateBoundaryAnchors = (
  anchors: readonly BoundaryAnchor[],
  span: AcousticActivitySpan,
): BoundaryAnchor[] => {
  const sorted = anchors
    .filter(({ atMs }) => atMs > span.startMs && atMs < span.endMs)
    .sort((left, right) => left.atMs - right.atMs || right.evidence.score - left.evidence.score);
  const deduplicated: BoundaryAnchor[] = [];
  for (const anchor of sorted) {
    const previous = deduplicated.at(-1);
    if (previous !== undefined && anchor.atMs - previous.atMs <= BOUNDARY_DEDUPLICATION_MS) {
      if (
        (anchor.source === 'confirmed' && previous.source === 'inferred') ||
        (anchor.source === previous.source && anchor.evidence.score > previous.evidence.score)
      ) {
        deduplicated[deduplicated.length - 1] = anchor;
      }
    } else {
      deduplicated.push(anchor);
    }
  }
  return deduplicated;
};

const poolRegion = (
  assignedHops: readonly AcousticChordHop[],
  startMs: number,
  endMs: number,
  boundaryBefore: ChordBoundaryEvidence | undefined,
  sequenceBreakBefore: boolean,
): AcousticChordBoundaryRegion | null => {
  if (assignedHops.length === 0 || endMs <= startMs) return null;
  const peakActivityEnergy = Math.max(
    0,
    ...assignedHops.map(({ activityEnergy }) => activityEnergy),
  );
  const healthyActivityThreshold = Math.max(
    POLYPHONIC_ACTIVITY_OPEN_THRESHOLD,
    peakActivityEnergy * CHORD_CHANGE_ACTIVITY_PEAK_RATIO,
  );
  const healthyHops = assignedHops.filter(
    ({ activityEnergy }) => activityEnergy >= healthyActivityThreshold,
  );
  const fullySettledLong = healthyHops.filter(
    (hop) => hop.support.longStartMs >= startMs && hop.support.endMs <= endMs,
  );
  const fullySettledShort = healthyHops.filter(
    (hop) =>
      hop.harmony.shortTemplateScores !== undefined &&
      hop.support.shortStartMs >= startMs &&
      hop.support.endMs <= endMs,
  );
  const useLong = fullySettledShort.length === 0 && fullySettledLong.length >= 2;
  const eligibleHops =
    fullySettledShort.length > 0
      ? fullySettledShort
      : useLong
        ? fullySettledLong
        : healthyHops.length > 0
          ? healthyHops
          : assignedHops.slice(Math.floor(assignedHops.length / 2));
  const confirmationHop =
    boundaryBefore === undefined
      ? undefined
      : eligibleHops.find(
          ({ boundaryBefore: hopBoundary }) =>
            hopBoundary?.atMs === boundaryBefore.atMs && hopBoundary.mode === boundaryBefore.mode,
        );
  const labelHops =
    confirmationHop === undefined
      ? [...eligibleHops]
          .sort((left, right) => right.activityEnergy - left.activityEnergy)
          .slice(0, MAXIMUM_REGION_LABEL_HOPS)
      : eligibleHops
          .filter(({ sequence }) => sequence >= confirmationHop.sequence)
          .slice(0, MAXIMUM_REGION_LABEL_HOPS);
  const selectedSequences = new Set(labelHops.map(({ sequence }) => sequence));
  const selectedHops = eligibleHops.filter(({ sequence }) => selectedSequences.has(sequence));
  const scoreVectors = selectedHops.map((hop) =>
    useLong
      ? hop.harmony.templateScores
      : (hop.harmony.shortTemplateScores ?? hop.harmony.templateScores),
  );
  const pitchClassVectors = selectedHops.map((hop) =>
    useLong ? hop.harmony.longChroma : hop.harmony.shortChroma,
  );
  const templateScores = robustMean(scoreVectors, CHORD_TEMPLATE_CATALOG.length);
  const bassChroma = normalize(
    robustMean(
      selectedHops.map(({ harmony }) => harmony.bassChroma),
      12,
    ),
  );
  const pitchClassValues = normalize(robustMean(pitchClassVectors, 12));
  const candidates = materializeChordCandidates(
    templateScores,
    Array.from(bassChroma),
    CHORD_TEMPLATE_CATALOG.length,
  );
  return {
    bassChroma,
    ...(boundaryBefore === undefined ? {} : { boundaryBefore }),
    candidates,
    endMs,
    pitchClassValues,
    sequenceBreakBefore,
    sourceHopSequences: assignedHops.map(({ sequence }) => sequence),
    startMs,
    templateScores,
  };
};

/**
 * Converts retained acoustic hops into a small number of boundary-anchored regions. Each region
 * receives one pooled chord decision, preventing attack-contaminated 80 ms hops from becoming
 * finalized chord fragments. Boundaries can come from the live decoder or from sustained acoustic
 * replacement found with full-run look-ahead; note-model edges are deliberately absent here.
 */
export function buildAcousticChordBoundaryRegions(
  acousticHops: readonly AcousticChordHop[],
  activeSpans: readonly AcousticActivitySpan[],
  profile: ChordAnalysisProfile = 'accurate',
): AcousticChordBoundaryRegion[] {
  const hops = acousticHops
    .filter(
      (hop) =>
        hop.time.endMs > hop.time.startMs &&
        activeSpans.some((span) => intervalOverlapMs(hop.time, span) > 0),
    )
    .sort(
      (left, right) => left.time.startMs - right.time.startMs || left.sequence - right.sequence,
    );
  if (hops.length === 0) return [];

  const regions: AcousticChordBoundaryRegion[] = [];
  for (const [spanIndex, span] of mergeActivitySpans(activeSpans).entries()) {
    const spanHops = hops.filter((hop) => intervalOverlapMs(hop.time, span) > 0);
    if (spanHops.length === 0) continue;
    const sequences = spanHops.reduce<AcousticChordHop[][]>((groups, hop) => {
      const current = groups.at(-1);
      const previous = current?.at(-1);
      if (
        current === undefined ||
        previous === undefined ||
        hop.discontinuity ||
        hop.time.startMs - previous.time.endMs > MAXIMUM_ACTIVE_GAP_MS
      ) {
        groups.push([hop]);
      } else {
        current.push(hop);
      }
      return groups;
    }, []);

    for (const [sequenceIndex, sequenceHops] of sequences.entries()) {
      const firstHop = sequenceHops[0];
      const lastHop = sequenceHops.at(-1);
      if (firstHop === undefined || lastHop === undefined) continue;
      const sequenceSpan = {
        endMs:
          sequenceIndex === sequences.length - 1
            ? span.endMs
            : Math.min(span.endMs, lastHop.time.endMs),
        startMs: sequenceIndex === 0 ? span.startMs : Math.max(span.startMs, firstHop.time.startMs),
      };
      const confirmedAnchors = deduplicateBoundaryAnchors(
        explicitBoundaryAnchors(sequenceHops),
        sequenceSpan,
      );
      const confirmedPoints = [
        sequenceSpan.startMs,
        ...confirmedAnchors.map(({ atMs }) => atMs),
        sequenceSpan.endMs,
      ];
      const inferredAnchors = confirmedPoints.flatMap((startMs, index) => {
        const endMs = confirmedPoints[index + 1];
        if (endMs === undefined) return [];
        return inferredBoundaryAnchors(
          sequenceHops.filter((hop) => hop.featureTimeMs > startMs && hop.time.startMs < endMs),
          profile,
        );
      });
      const anchors = deduplicateBoundaryAnchors(
        [...confirmedAnchors, ...inferredAnchors],
        sequenceSpan,
      );
      const points = [sequenceSpan.startMs, ...anchors.map(({ atMs }) => atMs), sequenceSpan.endMs];
      for (let regionIndex = 0; regionIndex < points.length - 1; regionIndex += 1) {
        const startMs = points[regionIndex];
        const endMs = points[regionIndex + 1];
        if (startMs === undefined || endMs === undefined) continue;
        const assignedHops = sequenceHops.filter(
          (hop) => hop.featureTimeMs > startMs && hop.time.startMs < endMs,
        );
        const pooled = poolRegion(
          assignedHops,
          startMs,
          endMs,
          regionIndex === 0 ? undefined : anchors[regionIndex - 1]?.evidence,
          regionIndex === 0 && (spanIndex > 0 || sequenceIndex > 0),
        );
        if (pooled !== null) regions.push(pooled);
      }
    }
  }
  return regions;
}
