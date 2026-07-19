import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  type ChordCandidate,
  type ChordEvent,
} from '../../shared';
import { StreamingAnalysisResampler } from '../analysis/resample';
import { ChordAnalysisBandPassFilter } from './analysis-filter';
import { matchChordTemplates } from './chords';
import type { ChordAnalysisProfile } from './contracts';
import { computeHarmonicChroma, type HarmonicChromaObservation } from './harmonic-chroma';

export const POLYPHONIC_ANALYSIS_SAMPLE_RATE = 16_000;
export const POLYPHONIC_ANALYZER_VERSION = '0.3.0';
export const RESPONSIVE_CHORD_WINDOW_FRAMES = 6_144;
export const ACCURATE_CHORD_WINDOW_FRAMES = 12_288;
const ACTIVITY_OPEN_THRESHOLD = 0.012;

export type PolyphonicAnalysisState = 'silence' | 'warming' | 'tracking' | 'uncertain';

export type ProvisionalChordResult = {
  analysisSampleRate: number;
  chroma: HarmonicChromaObservation;
  events: ChordEvent[];
  inputSampleRate: number;
  sourceTimestampMs: number;
  state: PolyphonicAnalysisState;
};

class Float32RollingBuffer {
  readonly capacity: number;
  private readonly data: Float32Array;
  private length = 0;
  private writeIndex = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity);
  }

  get available(): number {
    return this.length;
  }

  clear(): void {
    this.length = 0;
    this.writeIndex = 0;
    this.data.fill(0);
  }

  push(samples: Float32Array): void {
    for (const sample of samples) {
      this.data[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      this.length = Math.min(this.capacity, this.length + 1);
    }
  }

  copy(): Float32Array {
    const output = new Float32Array(this.length);
    const start = (this.writeIndex - this.length + this.capacity) % this.capacity;
    for (let index = 0; index < this.length; index += 1) {
      output[index] = this.data[(start + index) % this.capacity] ?? 0;
    }
    return output;
  }
}

const emptyChroma = (): HarmonicChromaObservation => ({
  activityEnergy: 0,
  bass: Array.from({ length: 12 }, () => 0),
  changeValues: Array.from({ length: 12 }, () => 0),
  energy: 0,
  noteActivations: [],
  noteMidiRange: { max: 88, min: 40 },
  transientRatio: 0,
  treble: Array.from({ length: 12 }, () => 0),
  tuningCents: 0,
  values: Array.from({ length: 12 }, () => 0),
});

export class StreamingProvisionalChordAnalyzer {
  readonly analysisSampleRate: number;
  readonly inputSampleRate: number;
  private readonly buffer = new Float32RollingBuffer(ACCURATE_CHORD_WINDOW_FRAMES);
  private readonly analysisFilter: ChordAnalysisBandPassFilter;
  private readonly hopFrames: number;
  private readonly resampler: StreamingAnalysisResampler;
  private readonly runId: string;
  private activityActive = false;
  private activityAttackCount = 0;
  private activityPeakEnergy = 0;
  private activityReleaseCount = 0;
  private activityReleaseSinceMs = 0;
  private inactiveFloorEnergy = Number.POSITIVE_INFINITY;
  private activityAttackFrames: number;
  private activityReleaseFrames: number;
  private currentEvent: ChordEvent | null = null;
  private changeCandidateSymbol: string | null = null;
  private changeConfirmationCount = 0;
  private changeSinceMs = 0;
  private eventCounter = 0;
  private framesSinceAnalysis = 0;
  private analysisWindowFrames: number;
  private lastChroma: HarmonicChromaObservation = emptyChroma();
  private lastSourceTimestampMs = 0;
  private pendingCandidates: readonly ChordCandidate[] | null = null;
  private pendingConfirmationCount = 0;
  private pendingSinceMs = 0;
  private switchConfirmationFrames: number;
  private changeConfirmationFrames: number;
  private minimumSwitchScoreMargin: number;

  constructor(
    inputSampleRate: number,
    runId: string,
    options: { hopMs?: number; profile?: ChordAnalysisProfile } = {},
  ) {
    this.inputSampleRate = inputSampleRate;
    this.runId = runId;
    this.resampler = new StreamingAnalysisResampler(
      inputSampleRate,
      POLYPHONIC_ANALYSIS_SAMPLE_RATE,
    );
    this.analysisSampleRate = this.resampler.outputSampleRate;
    this.analysisFilter = new ChordAnalysisBandPassFilter(this.analysisSampleRate);
    this.hopFrames = Math.max(
      1,
      Math.round(((options.hopMs ?? 80) / 1_000) * this.analysisSampleRate),
    );
    const profile = options.profile ?? 'accurate';
    this.analysisWindowFrames =
      profile === 'responsive' ? RESPONSIVE_CHORD_WINDOW_FRAMES : ACCURATE_CHORD_WINDOW_FRAMES;
    this.switchConfirmationFrames = 2;
    this.changeConfirmationFrames = profile === 'responsive' ? 1 : 2;
    this.activityAttackFrames = 2;
    this.activityReleaseFrames = profile === 'responsive' ? 3 : 4;
    this.minimumSwitchScoreMargin = profile === 'responsive' ? 0.025 : 0.04;
  }

  setProfile(profile: ChordAnalysisProfile): void {
    this.analysisWindowFrames =
      profile === 'responsive' ? RESPONSIVE_CHORD_WINDOW_FRAMES : ACCURATE_CHORD_WINDOW_FRAMES;
    this.switchConfirmationFrames = 2;
    this.changeConfirmationFrames = profile === 'responsive' ? 1 : 2;
    this.activityAttackFrames = 2;
    this.activityReleaseFrames = profile === 'responsive' ? 3 : 4;
    this.minimumSwitchScoreMargin = profile === 'responsive' ? 0.025 : 0.04;
    this.clearTransitionState();
  }

  push(samples: Float32Array, startMs: number, discontinuity = false): ProvisionalChordResult {
    const events: ChordEvent[] = [];
    if (discontinuity) {
      const finalized = this.finalizeCurrent(this.lastSourceTimestampMs);
      if (finalized !== null) events.push(finalized);
      this.clearTransitionState();
      this.resetActivityGate();
      this.buffer.clear();
      this.framesSinceAnalysis = 0;
    }
    const resampled = this.resampler.push(samples, discontinuity);
    const analysisSamples = this.analysisFilter.process(resampled.samples, discontinuity);
    this.buffer.push(analysisSamples);
    this.framesSinceAnalysis += analysisSamples.length;
    this.lastSourceTimestampMs = startMs + (samples.length / this.inputSampleRate) * 1_000;

    if (this.buffer.available < this.analysisWindowFrames) {
      return this.result(events, 'warming');
    }
    if (this.framesSinceAnalysis < this.hopFrames) {
      return this.result(events, this.currentEvent === null ? 'uncertain' : 'tracking');
    }
    this.framesSinceAnalysis %= this.hopFrames;
    const buffered = this.buffer.copy();
    this.lastChroma = computeHarmonicChroma(
      buffered.slice(buffered.length - this.analysisWindowFrames),
      this.analysisSampleRate,
    );

    const activity = this.updateActivityGate();
    if (activity === 'inactive') {
      const finalized = this.finalizeCurrent(
        this.activityReleaseSinceMs || this.lastSourceTimestampMs,
      );
      this.clearTransitionState();
      if (finalized !== null) events.push(finalized);
      return this.result(events, 'silence');
    }
    if (activity === 'holding') {
      if (this.currentEvent !== null) {
        this.currentEvent = this.createEvent(
          this.currentEvent.id,
          this.currentEvent.time.startMs,
          this.lastSourceTimestampMs,
          this.currentEvent.candidates,
          'provisional',
        );
        events.push(this.currentEvent);
      }
      return this.result(events, this.currentEvent === null ? 'uncertain' : 'tracking');
    }

    const candidates = matchChordTemplates(this.lastChroma);
    const best = candidates[0];
    if (best === undefined || best.confidence < 0.3 || best.score < 0.58) {
      this.clearTransitionState();
      return this.result(events, 'uncertain');
    }
    const currentBest = this.currentEvent?.candidates[0];
    const changeCandidates = matchChordTemplates({
      ...this.lastChroma,
      values: this.lastChroma.changeValues,
    });
    this.updateChangeCue(changeCandidates[0], currentBest);
    if (this.currentEvent !== null && currentBest?.symbol === best.symbol) {
      this.clearPending();
      this.currentEvent = this.createEvent(
        this.currentEvent.id,
        this.currentEvent.time.startMs,
        this.lastSourceTimestampMs,
        candidates,
        'provisional',
      );
      events.push(this.currentEvent);
      return this.result(events, 'tracking');
    }

    if (this.currentEvent !== null) {
      const currentFrameCandidate = candidates.find(
        (candidate) => candidate.symbol === currentBest?.symbol,
      );
      const currentFrameScore = currentFrameCandidate?.score ?? 0.58;
      const changeConfirmed =
        this.changeCandidateSymbol === best.symbol &&
        this.changeConfirmationCount >= this.changeConfirmationFrames;
      const switchHasActivity =
        this.lastChroma.activityEnergy >=
        Math.max(ACTIVITY_OPEN_THRESHOLD, this.activityPeakEnergy * 0.2);
      if (
        !changeConfirmed ||
        !switchHasActivity ||
        best.score - currentFrameScore < this.minimumSwitchScoreMargin
      ) {
        this.clearPending();
        this.currentEvent = this.createEvent(
          this.currentEvent.id,
          this.currentEvent.time.startMs,
          this.lastSourceTimestampMs,
          this.currentEvent.candidates,
          'provisional',
        );
        events.push(this.currentEvent);
        return this.result(events, 'tracking');
      }
      if (this.pendingCandidates?.[0]?.symbol === best.symbol) {
        this.pendingConfirmationCount += 1;
        this.pendingCandidates = candidates;
      } else {
        this.pendingCandidates = candidates;
        this.pendingConfirmationCount = 1;
        this.pendingSinceMs =
          this.changeCandidateSymbol === best.symbol &&
          this.changeConfirmationCount >= this.changeConfirmationFrames
            ? this.changeSinceMs
            : Math.max(
                this.currentEvent.time.startMs,
                this.lastSourceTimestampMs - (this.hopFrames / this.analysisSampleRate) * 1_000,
              );
      }
      if (this.pendingConfirmationCount < this.switchConfirmationFrames) {
        this.currentEvent = this.createEvent(
          this.currentEvent.id,
          this.currentEvent.time.startMs,
          this.lastSourceTimestampMs,
          this.currentEvent.candidates,
          'provisional',
        );
        events.push(this.currentEvent);
        return this.result(events, 'tracking');
      }
    }

    const eventStartMs =
      this.currentEvent === null
        ? Math.max(
            0,
            this.lastSourceTimestampMs -
              (this.analysisWindowFrames / this.analysisSampleRate) * 1_000,
          )
        : this.pendingSinceMs;
    const finalized = this.finalizeCurrent(eventStartMs);
    if (finalized !== null) events.push(finalized);
    this.eventCounter += 1;
    this.currentEvent = this.createEvent(
      `${this.runId}-chord-${String(this.eventCounter)}`,
      eventStartMs,
      this.lastSourceTimestampMs,
      candidates,
      'provisional',
    );
    this.clearTransitionState();
    events.push(this.currentEvent);
    return this.result(events, 'tracking');
  }

  finish(atMs = this.lastSourceTimestampMs): ProvisionalChordResult {
    const finalized = this.finalizeCurrent(atMs);
    return this.result(finalized === null ? [] : [finalized], 'silence');
  }

  private createEvent(
    id: string,
    startMs: number,
    endMs: number,
    candidates: readonly ChordCandidate[],
    lifecycle: 'finalized' | 'provisional',
  ): ChordEvent {
    return ChordEventSchema.parse({
      candidates,
      diagnostics: {
        analysisPath: 'tuned-harmonic-chroma',
        chromaEnergy: this.lastChroma.energy,
        transientRatio: this.lastChroma.transientRatio,
        tuningCents: this.lastChroma.tuningCents,
      },
      id,
      kind: 'chord',
      lifecycle,
      provenance: {
        algorithm: 'hpss-nnls-chroma-chord-templates',
        generatedAtMs: endMs,
        runId: this.runId,
        subsystem: 'polyphonic-analysis',
        version: POLYPHONIC_ANALYZER_VERSION,
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs, startMs },
    });
  }

  private finalizeCurrent(endMs: number): ChordEvent | null {
    if (this.currentEvent === null) return null;
    const finalized = this.createEvent(
      this.currentEvent.id,
      this.currentEvent.time.startMs,
      Math.max(endMs, this.currentEvent.time.startMs),
      this.currentEvent.candidates,
      'finalized',
    );
    this.currentEvent = null;
    return finalized;
  }

  private clearPending(): void {
    this.pendingCandidates = null;
    this.pendingConfirmationCount = 0;
    this.pendingSinceMs = 0;
  }

  private clearTransitionState(): void {
    this.clearPending();
    this.changeCandidateSymbol = null;
    this.changeConfirmationCount = 0;
    this.changeSinceMs = 0;
  }

  private resetActivityGate(): void {
    this.activityActive = false;
    this.activityAttackCount = 0;
    this.activityPeakEnergy = 0;
    this.activityReleaseCount = 0;
    this.activityReleaseSinceMs = 0;
    this.inactiveFloorEnergy = Number.POSITIVE_INFINITY;
  }

  private updateActivityGate(): 'active' | 'holding' | 'inactive' {
    const energy = this.lastChroma.activityEnergy;
    const openThreshold = ACTIVITY_OPEN_THRESHOLD;

    if (!this.activityActive) {
      const riseThreshold = Number.isFinite(this.inactiveFloorEnergy)
        ? Math.max(openThreshold, this.inactiveFloorEnergy * 3)
        : openThreshold;
      if (energy < openThreshold || (this.activityAttackCount === 0 && energy < riseThreshold)) {
        this.activityAttackCount = 0;
        this.inactiveFloorEnergy = Math.min(this.inactiveFloorEnergy, energy);
        return 'inactive';
      }
      this.activityAttackCount += 1;
      if (this.activityAttackCount < this.activityAttackFrames) return 'holding';
      this.activityActive = true;
      this.activityAttackCount = 0;
      this.activityPeakEnergy = energy;
      this.activityReleaseCount = 0;
      this.activityReleaseSinceMs = 0;
      this.inactiveFloorEnergy = Number.POSITIVE_INFINITY;
      return 'active';
    }

    this.activityPeakEnergy = Math.max(this.activityPeakEnergy, energy);
    const closeThreshold = Math.max(0.0025, this.activityPeakEnergy * 0.04);
    if (energy >= closeThreshold) {
      this.activityReleaseCount = 0;
      this.activityReleaseSinceMs = 0;
      return 'active';
    }

    if (this.activityReleaseCount === 0) {
      this.activityReleaseSinceMs = Math.max(
        this.currentEvent?.time.startMs ?? 0,
        this.lastSourceTimestampMs - (this.hopFrames / this.analysisSampleRate) * 1_000,
      );
    }
    this.activityReleaseCount += 1;
    if (this.activityReleaseCount < this.activityReleaseFrames) return 'holding';

    this.activityActive = false;
    this.activityAttackCount = 0;
    this.activityPeakEnergy = 0;
    this.activityReleaseCount = 0;
    this.inactiveFloorEnergy = energy;
    return 'inactive';
  }

  private updateChangeCue(
    candidate: ChordCandidate | undefined,
    current: ChordCandidate | undefined,
  ): void {
    if (
      candidate === undefined ||
      current === undefined ||
      candidate.symbol === current.symbol ||
      candidate.confidence < 0.3 ||
      candidate.score < 0.58
    ) {
      this.changeCandidateSymbol = null;
      this.changeConfirmationCount = 0;
      this.changeSinceMs = 0;
      return;
    }
    if (this.changeCandidateSymbol === candidate.symbol) {
      this.changeConfirmationCount += 1;
      return;
    }
    this.changeCandidateSymbol = candidate.symbol;
    this.changeConfirmationCount = 1;
    const changeSupportFrames = 5_120;
    this.changeSinceMs = Math.max(
      this.currentEvent?.time.startMs ?? 0,
      this.lastSourceTimestampMs - (changeSupportFrames / this.analysisSampleRate) * 1_000,
    );
  }

  private result(events: ChordEvent[], state: PolyphonicAnalysisState): ProvisionalChordResult {
    return {
      analysisSampleRate: this.analysisSampleRate,
      chroma: this.lastChroma,
      events,
      inputSampleRate: this.inputSampleRate,
      sourceTimestampMs: this.lastSourceTimestampMs,
      state,
    };
  }
}
