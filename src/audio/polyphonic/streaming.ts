import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  type ChordCandidate,
  type ChordEvent,
  type PitchClass,
} from '../../shared';
import { StreamingAnalysisResampler } from '../analysis/resample';
import { ChordAnalysisBandPassFilter } from './analysis-filter';
import { StreamingAttackDetector } from './attack-detector';
import { materializeChordCandidates, scoreChordTemplates } from './chords';
import {
  CHORD_CHANGE_ACTIVITY_PEAK_RATIO,
  POLYPHONIC_ACTIVITY_OPEN_THRESHOLD,
  type AcousticChordHop,
  type ChordBoundaryEvidence,
} from './chord-observations';
import type { ChordAnalysisProfile } from './contracts';
import {
  HARMONIC_CHROMA_FRAME_SIZE,
  HARMONIC_CHROMA_HOP_SIZE,
  computeHarmonicChroma,
  type HarmonicChromaObservation,
} from './harmonic-chroma';
import { OnlineChordDecoder } from './online-chord-decoder';

export const POLYPHONIC_ANALYSIS_SAMPLE_RATE = 16_000;
export const POLYPHONIC_ANALYZER_VERSION = '0.5.0';
export const RESPONSIVE_CHORD_WINDOW_FRAMES = 6_144;
export const ACCURATE_CHORD_WINDOW_FRAMES = 12_288;
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

export type PolyphonicAnalysisState = 'silence' | 'warming' | 'tracking' | 'uncertain';

export type ProvisionalChordResult = {
  analysisSampleRate: number;
  chroma: HarmonicChromaObservation;
  events: ChordEvent[];
  inputSampleRate: number;
  observations: AcousticChordHop[];
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
  activationTotal: 0,
  activityEnergy: 0,
  bass: Array.from({ length: 12 }, () => 0),
  changeValues: Array.from({ length: 12 }, () => 0),
  energy: 0,
  noteActivations: [],
  noteMidiRange: { max: 88, min: 40 },
  pitchClassActivations: Array.from({ length: 12 }, () => 0),
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
  private readonly attackDetector: StreamingAttackDetector;
  private readonly hopFrames: number;
  private readonly onlineDecoder: OnlineChordDecoder;
  private readonly resampler: StreamingAnalysisResampler;
  private readonly runId: string;
  private activityActive = false;
  private activityAttackCount = 0;
  private activityPeakEnergy = 0;
  private activityReleaseCount = 0;
  private activityReleaseSinceMs = 0;
  private activitySinceMs = 0;
  private inactiveFloorEnergy = Number.POSITIVE_INFINITY;
  private activityAttackFrames: number;
  private activityReleaseFrames: number;
  private currentAttackCount = 0;
  private currentBoundary: ChordBoundaryEvidence | null = null;
  private currentEvent: ChordEvent | null = null;
  private eventCounter = 0;
  private framesSinceAnalysis = 0;
  private hopSequence = 0;
  private analysisWindowFrames: number;
  private lastChroma: HarmonicChromaObservation = emptyChroma();
  private lastSourceTimestampMs = 0;
  private pendingObservationDiscontinuity = false;
  private silenceLatched = false;

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
    this.attackDetector = new StreamingAttackDetector(this.analysisSampleRate);
    this.hopFrames = Math.max(
      1,
      Math.round(((options.hopMs ?? 80) / 1_000) * this.analysisSampleRate),
    );
    const profile = options.profile ?? 'accurate';
    this.onlineDecoder = new OnlineChordDecoder(profile);
    this.analysisWindowFrames =
      profile === 'responsive' ? RESPONSIVE_CHORD_WINDOW_FRAMES : ACCURATE_CHORD_WINDOW_FRAMES;
    this.activityAttackFrames = 2;
    this.activityReleaseFrames = profile === 'responsive' ? 3 : 4;
  }

  setProfile(profile: ChordAnalysisProfile): void {
    this.analysisWindowFrames =
      profile === 'responsive' ? RESPONSIVE_CHORD_WINDOW_FRAMES : ACCURATE_CHORD_WINDOW_FRAMES;
    this.activityAttackFrames = 2;
    this.activityReleaseFrames = profile === 'responsive' ? 3 : 4;
    this.onlineDecoder.setProfile(profile);
  }

  push(samples: Float32Array, startMs: number, discontinuity = false): ProvisionalChordResult {
    const events: ChordEvent[] = [];
    const observations: AcousticChordHop[] = [];
    if (discontinuity) {
      const closed = this.closeCurrent(this.lastSourceTimestampMs);
      if (closed !== null) events.push(closed);
      this.onlineDecoder.reset();
      this.resetActivityGate();
      this.attackDetector.reset();
      this.buffer.clear();
      this.framesSinceAnalysis = 0;
      this.pendingObservationDiscontinuity = true;
    }
    const resampled = this.resampler.push(samples, discontinuity);
    const analysisSamples = this.analysisFilter.process(resampled.samples, discontinuity);
    const chunkEndMs = startMs + (samples.length / this.inputSampleRate) * 1_000;
    const sourceFramesPerAnalysisFrame = this.inputSampleRate / this.analysisSampleRate;
    let consumedAnalysisFrames = 0;
    let state: PolyphonicAnalysisState = 'warming';

    while (consumedAnalysisFrames < analysisSamples.length) {
      const warmingBeforeSlice = this.buffer.available < this.analysisWindowFrames;
      const framesUntilAnalysis = warmingBeforeSlice
        ? this.analysisWindowFrames - this.buffer.available
        : this.hopFrames - this.framesSinceAnalysis;
      const frameCount = Math.min(
        framesUntilAnalysis,
        analysisSamples.length - consumedAnalysisFrames,
      );
      const sliceStartFrameOffset =
        resampled.firstSourceFrameOffset + consumedAnalysisFrames * sourceFramesPerAnalysisFrame;
      const sliceStartMs = startMs + (sliceStartFrameOffset / this.inputSampleRate) * 1_000;
      const slice = analysisSamples.subarray(
        consumedAnalysisFrames,
        consumedAnalysisFrames + frameCount,
      );
      this.attackDetector.push(slice, sliceStartMs, false);
      this.buffer.push(slice);
      consumedAnalysisFrames += frameCount;

      if (this.buffer.available < this.analysisWindowFrames) continue;
      if (!warmingBeforeSlice) {
        this.framesSinceAnalysis += frameCount;
        if (this.framesSinceAnalysis < this.hopFrames) continue;
      }
      this.framesSinceAnalysis = 0;
      const sourceFrameOffset =
        resampled.firstSourceFrameOffset + consumedAnalysisFrames * sourceFramesPerAnalysisFrame;
      this.lastSourceTimestampMs = Math.min(
        chunkEndMs,
        startMs + (sourceFrameOffset / this.inputSampleRate) * 1_000,
      );
      const analyzed = this.analyzeCurrentHop();
      events.push(...analyzed.events);
      observations.push(analyzed.observation);
      state = analyzed.state;
    }

    this.lastSourceTimestampMs = chunkEndMs;
    if (observations.length === 0) {
      state =
        this.buffer.available < this.analysisWindowFrames
          ? this.silenceLatched
            ? 'silence'
            : 'warming'
          : this.currentEvent === null
            ? 'uncertain'
            : 'tracking';
    }
    return this.result(events, state, observations);
  }

  private analyzeCurrentHop(): {
    events: ChordEvent[];
    observation: AcousticChordHop;
    state: PolyphonicAnalysisState;
  } {
    const events: ChordEvent[] = [];
    const buffered = this.buffer.copy();
    this.lastChroma = computeHarmonicChroma(
      buffered.slice(buffered.length - this.analysisWindowFrames),
      this.analysisSampleRate,
    );
    const templateScores = scoreChordTemplates(this.lastChroma);
    const candidates = materializeChordCandidates(templateScores, this.lastChroma.bass);
    const shortTemplateScores = scoreChordTemplates({
      ...this.lastChroma,
      values: this.lastChroma.changeValues,
    });
    const shortCandidates = materializeChordCandidates(shortTemplateScores, this.lastChroma.bass);
    const attack = this.attackDetector.consumeUntil(this.lastSourceTimestampMs);
    let observation = this.createHopObservation(
      templateScores,
      candidates,
      shortTemplateScores,
      shortCandidates,
      attack,
    );

    const activity = this.updateActivityGate();
    if (activity === 'active') this.silenceLatched = false;
    const decision = this.onlineDecoder.push(observation, activity, {
      activityStartMs: this.activitySinceMs,
      changeActivitySupported:
        this.lastChroma.activityEnergy >=
        Math.max(
          POLYPHONIC_ACTIVITY_OPEN_THRESHOLD,
          this.activityPeakEnergy * CHORD_CHANGE_ACTIVITY_PEAK_RATIO,
        ),
      releaseAtMs: this.activityReleaseSinceMs || this.lastSourceTimestampMs,
    });
    if (decision.action === 'change' && decision.boundary !== undefined) {
      observation = { ...observation, boundaryBefore: decision.boundary };
    }
    if (decision.action === 'close') {
      const closed = this.closeCurrent(decision.eventStartMs ?? this.lastSourceTimestampMs);
      if (closed !== null) events.push(closed);
    } else if (decision.action === 'start' && decision.candidates !== undefined) {
      this.eventCounter += 1;
      this.currentAttackCount = observation.attack.strength > 0 ? 1 : 0;
      this.currentBoundary = null;
      this.currentEvent = this.createEvent(
        `${this.runId}-chord-${String(this.eventCounter)}`,
        decision.eventStartMs ?? observation.time.startMs,
        this.lastSourceTimestampMs,
        decision.candidates,
        'provisional',
      );
      events.push(this.currentEvent);
    } else if (decision.action === 'change' && decision.candidates !== undefined) {
      const eventStartMs = Math.max(
        this.currentEvent?.time.startMs ?? 0,
        decision.eventStartMs ?? observation.time.startMs,
      );
      const closed = this.closeCurrent(eventStartMs);
      if (closed !== null) events.push(closed);
      this.eventCounter += 1;
      this.currentAttackCount = observation.attack.strength > 0 ? 1 : 0;
      this.currentBoundary = decision.boundary ?? null;
      this.currentEvent = this.createEvent(
        `${this.runId}-chord-${String(this.eventCounter)}`,
        eventStartMs,
        this.lastSourceTimestampMs,
        decision.candidates,
        'provisional',
      );
      events.push(this.currentEvent);
    } else if (decision.action === 'extend' && this.currentEvent !== null) {
      if (observation.attack.strength > 0) this.currentAttackCount += 1;
      this.currentEvent = this.createEvent(
        this.currentEvent.id,
        this.currentEvent.time.startMs,
        this.lastSourceTimestampMs,
        decision.candidates ?? this.currentEvent.candidates,
        'provisional',
      );
      events.push(this.currentEvent);
    }
    const state: PolyphonicAnalysisState =
      activity === 'inactive' ? 'silence' : this.currentEvent === null ? 'uncertain' : 'tracking';
    if (activity === 'inactive') {
      this.silenceLatched = true;
      this.buffer.clear();
      this.framesSinceAnalysis = 0;
    }
    return { events, observation, state };
  }

  finish(atMs = this.lastSourceTimestampMs): ProvisionalChordResult {
    const closed = this.closeCurrent(atMs);
    this.onlineDecoder.reset();
    return this.result(closed === null ? [] : [closed], 'silence', []);
  }

  private createHopObservation(
    templateScores: Float32Array,
    topCandidates: readonly ChordCandidate[],
    shortTemplateScores: Float32Array,
    shortCandidates: readonly ChordCandidate[],
    attack: AcousticChordHop['attack'],
  ): AcousticChordHop {
    const endMs = this.lastSourceTimestampMs;
    const hopDurationMs = (this.hopFrames / this.analysisSampleRate) * 1_000;
    const longDurationMs = (this.analysisWindowFrames / this.analysisSampleRate) * 1_000;
    const shortDurationMs =
      ((HARMONIC_CHROMA_FRAME_SIZE + HARMONIC_CHROMA_HOP_SIZE) / this.analysisSampleRate) * 1_000;
    this.hopSequence += 1;
    const observation: AcousticChordHop = {
      activityEnergy: this.lastChroma.activityEnergy,
      attack: {
        ...attack,
        percussiveRatio: this.lastChroma.transientRatio,
      },
      discontinuity: this.pendingObservationDiscontinuity,
      featureTimeMs: endMs,
      harmony: {
        activationTotal: this.lastChroma.activationTotal,
        bassChroma: Float32Array.from(this.lastChroma.bass),
        longChroma: Float32Array.from(this.lastChroma.values),
        pitchClassActivations: Float32Array.from(this.lastChroma.pitchClassActivations),
        shortChroma: Float32Array.from(this.lastChroma.changeValues),
        shortCandidates,
        shortTemplateScores,
        templateScores,
        topCandidates,
        trebleChroma: Float32Array.from(this.lastChroma.treble),
        tuningCents: this.lastChroma.tuningCents,
      },
      sequence: this.hopSequence,
      support: {
        endMs,
        longStartMs: Math.max(0, endMs - longDurationMs),
        shortStartMs: Math.max(0, endMs - shortDurationMs),
      },
      time: { endMs, startMs: Math.max(0, endMs - hopDurationMs) },
    };
    this.pendingObservationDiscontinuity = false;
    return observation;
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
        attackCount: this.currentAttackCount,
        ...(this.currentBoundary === null
          ? {}
          : {
              attackStrength: this.currentBoundary.attackStrength,
              boundaryMode: this.currentBoundary.mode,
              boundaryScore: this.currentBoundary.score,
              changePersistenceMs: this.currentBoundary.persistenceMs,
              harmonicDistance: this.currentBoundary.harmonicDistance,
              novelToneStrength: this.currentBoundary.novelToneStrength,
            }),
        chromaEnergy: this.lastChroma.energy,
        scoreSemantics: 'uncalibrated-match-strength',
        transientRatio: this.lastChroma.transientRatio,
        tuningCents: this.lastChroma.tuningCents,
      },
      id,
      kind: 'chord',
      lifecycle,
      observedPitchClasses: this.lastChroma.values.flatMap((weight, index) => {
        const pitchClass = PITCH_CLASSES[index];
        return pitchClass === undefined || weight <= 0 ? [] : [{ pitchClass, weight }];
      }),
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

  private closeCurrent(endMs: number): ChordEvent | null {
    if (this.currentEvent === null) return null;
    const closed = ChordEventSchema.parse({
      ...this.currentEvent,
      lifecycle: 'provisional',
      provenance: {
        ...this.currentEvent.provenance,
        generatedAtMs: Math.max(endMs, this.currentEvent.time.startMs),
      },
      time: {
        endMs: Math.max(endMs, this.currentEvent.time.startMs),
        startMs: this.currentEvent.time.startMs,
      },
    });
    this.currentEvent = null;
    this.currentAttackCount = 0;
    this.currentBoundary = null;
    return closed;
  }

  private resetActivityGate(): void {
    this.activityActive = false;
    this.activityAttackCount = 0;
    this.activityPeakEnergy = 0;
    this.activityReleaseCount = 0;
    this.activityReleaseSinceMs = 0;
    this.activitySinceMs = 0;
    this.inactiveFloorEnergy = Number.POSITIVE_INFINITY;
    this.silenceLatched = false;
  }

  private updateActivityGate(): 'active' | 'holding' | 'inactive' {
    const energy = this.lastChroma.activityEnergy;
    const openThreshold = POLYPHONIC_ACTIVITY_OPEN_THRESHOLD;

    if (!this.activityActive) {
      const riseThreshold = Number.isFinite(this.inactiveFloorEnergy)
        ? Math.max(openThreshold, this.inactiveFloorEnergy * 3)
        : openThreshold;
      if (energy < openThreshold || (this.activityAttackCount === 0 && energy < riseThreshold)) {
        this.activityAttackCount = 0;
        this.activitySinceMs = 0;
        this.inactiveFloorEnergy = Math.min(this.inactiveFloorEnergy, energy);
        return 'inactive';
      }
      if (this.activityAttackCount === 0) {
        this.activitySinceMs = Math.max(
          0,
          this.lastSourceTimestampMs - (this.hopFrames / this.analysisSampleRate) * 1_000,
        );
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

  private result(
    events: ChordEvent[],
    state: PolyphonicAnalysisState,
    observations: AcousticChordHop[],
  ): ProvisionalChordResult {
    return {
      analysisSampleRate: this.analysisSampleRate,
      chroma: this.lastChroma,
      events,
      inputSampleRate: this.inputSampleRate,
      observations,
      sourceTimestampMs: this.lastSourceTimestampMs,
      state,
    };
  }
}
