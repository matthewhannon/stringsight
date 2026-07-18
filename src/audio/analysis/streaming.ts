import {
  CONTRACT_SCHEMA_VERSION,
  confidence,
  sessionTimestampMs,
  type NoteEvent,
  type PitchCandidate,
} from '../../shared';
import {
  MONOPHONIC_ANALYZER_VERSION,
  type AnalysisState,
  type OnsetObservation,
} from './contracts';
import { EnergyOnsetDetector } from './onset';
import { createRankedPitchCandidates, frequencyToMidi, YinPitchEstimator } from './pitch';

export type StreamingAnalyzerOptions = {
  analysisCadenceMs?: number;
  energyBlockMs?: number;
  pitchWindowMs?: number;
  silenceHoldMs?: number;
};

export type StreamingAnalysisResult = {
  events: NoteEvent[];
  onsets: OnsetObservation[];
  sourceTimestampMs: number;
  state: AnalysisState;
};

type ActiveNote = {
  candidates: PitchCandidate[] | null;
  centsHistory: number[];
  frequencyHistory: number[];
  id: string;
  lastGeneratedAtMs: number;
  startMs: number;
  state: AnalysisState;
};

class SampleRingBuffer {
  private readonly buffer: Float32Array;
  private count = 0;
  private writeIndex = 0;

  constructor(capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  push(sample: number): void {
    this.buffer[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    this.count = Math.min(this.buffer.length, this.count + 1);
  }

  copyRecent(samples: Float32Array): void {
    if (samples.length > this.count) throw new RangeError('Not enough samples are buffered.');
    const start = (this.writeIndex - samples.length + this.buffer.length) % this.buffer.length;
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = this.buffer[(start + index) % this.buffer.length] ?? 0;
    }
  }

  reset(): void {
    this.count = 0;
    this.writeIndex = 0;
  }
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) throw new RangeError('Cannot take the median of an empty list.');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[Math.max(0, middle - 1)] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
};

export class StreamingMonophonicAnalyzer {
  private readonly analysisCadenceFrames: number;
  private readonly energyBlockFrames: number;
  private readonly onsetDetector = new EnergyOnsetDetector();
  private readonly pitchEstimator: YinPitchEstimator;
  private readonly pitchWindow: Float32Array;
  private readonly pitchWindowFrames: number;
  private readonly ring: SampleRingBuffer;
  private readonly runId: string;
  private readonly sampleRate: number;
  private readonly silenceHoldFrames: number;
  private activeNote: ActiveNote | null = null;
  private energyFrameCount = 0;
  private energySumSquares = 0;
  private eventIndex = 0;
  private lastAnalysisFrame = Number.NEGATIVE_INFINITY;
  private silenceFrames = 0;
  private state: AnalysisState = 'silence';
  private totalFrames = 0;

  constructor(sampleRate: number, runId: string, options: StreamingAnalyzerOptions = {}) {
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new RangeError('Sample rate must be a positive integer.');
    }
    if (runId.length === 0) throw new RangeError('Run ID must not be empty.');
    this.sampleRate = sampleRate;
    this.runId = runId;
    this.energyBlockFrames = Math.max(
      1,
      Math.round((sampleRate * (options.energyBlockMs ?? 5)) / 1_000),
    );
    this.pitchWindowFrames = Math.max(
      this.energyBlockFrames,
      Math.round((sampleRate * (options.pitchWindowMs ?? 85)) / 1_000),
    );
    this.analysisCadenceFrames = Math.max(
      this.energyBlockFrames,
      Math.round((sampleRate * (options.analysisCadenceMs ?? 20)) / 1_000),
    );
    this.silenceHoldFrames = Math.max(
      this.energyBlockFrames,
      Math.round((sampleRate * (options.silenceHoldMs ?? 70)) / 1_000),
    );
    this.ring = new SampleRingBuffer(this.pitchWindowFrames);
    this.pitchWindow = new Float32Array(this.pitchWindowFrames);
    this.pitchEstimator = new YinPitchEstimator(sampleRate, {}, this.pitchWindowFrames);
  }

  push(samples: Float32Array, startMs: number, discontinuity = false): StreamingAnalysisResult {
    if (!Number.isFinite(startMs) || startMs < 0) {
      throw new RangeError('Chunk start must be non-negative and finite.');
    }
    const events: NoteEvent[] = [];
    const onsets: OnsetObservation[] = [];
    if (discontinuity) this.resetTemporalState();
    const chunkStartFrame = this.totalFrames;

    let index = 0;
    while (index < samples.length) {
      const sample = samples[index] ?? 0;
      index += 1;
      this.ring.push(sample);
      this.energySumSquares += sample * sample;
      this.energyFrameCount += 1;
      this.totalFrames += 1;
      if (this.energyFrameCount < this.energyBlockFrames) continue;

      const blockEndMs = startMs + ((this.totalFrames - chunkStartFrame) / this.sampleRate) * 1_000;
      const blockStartMs = blockEndMs - (this.energyFrameCount / this.sampleRate) * 1_000;
      const rms = Math.sqrt(this.energySumSquares / this.energyFrameCount);
      this.energyFrameCount = 0;
      this.energySumSquares = 0;

      const onset = this.onsetDetector.process(Math.min(1, rms), Math.max(0, blockStartMs));
      if (onset !== null) {
        const onsetTime = Math.max(0, blockStartMs);
        const finalized = this.finalizeActiveNote(onsetTime, blockEndMs);
        if (finalized !== null) events.push(finalized);
        this.eventIndex += 1;
        this.activeNote = {
          candidates: null,
          centsHistory: [],
          frequencyHistory: [],
          id: `${this.runId}-note-${String(this.eventIndex)}`,
          lastGeneratedAtMs: onsetTime,
          startMs: onsetTime,
          state: 'transient',
        };
        this.silenceFrames = 0;
        this.state = 'transient';
        onsets.push({
          atMs: sessionTimestampMs(onsetTime),
          confidence: confidence(onset.confidence),
          id: `${this.runId}-onset-${String(this.eventIndex)}`,
          provenance: {
            algorithm: 'adaptive-energy-envelope-rise',
            generatedAtMs: sessionTimestampMs(blockEndMs),
            runId: this.runId,
            subsystem: 'audio-analysis',
            version: MONOPHONIC_ANALYZER_VERSION,
          },
          rms: onset.rms,
          schemaVersion: CONTRACT_SCHEMA_VERSION,
          strengthDb: onset.strengthDb,
        });
      }

      if (this.activeNote === null) {
        this.state = rms < this.onsetDetector.silenceThreshold ? 'silence' : 'uncertain';
        continue;
      }

      if (rms < this.onsetDetector.silenceThreshold) {
        this.silenceFrames += this.energyBlockFrames;
        if (this.silenceFrames >= this.silenceHoldFrames) {
          const silenceStartMs = blockEndMs - (this.silenceFrames / this.sampleRate) * 1_000;
          const finalized = this.finalizeActiveNote(
            Math.max(this.activeNote.startMs, silenceStartMs),
            blockEndMs,
          );
          if (finalized !== null) events.push(finalized);
          this.state = 'silence';
        }
        continue;
      }
      this.silenceFrames = 0;

      const noteAgeFrames = Math.round(
        ((blockEndMs - this.activeNote.startMs) / 1_000) * this.sampleRate,
      );
      const analysisDue = this.totalFrames - this.lastAnalysisFrame >= this.analysisCadenceFrames;
      if (
        noteAgeFrames < this.pitchWindowFrames ||
        this.ring.length < this.pitchWindowFrames ||
        !analysisDue
      ) {
        continue;
      }
      this.lastAnalysisFrame = this.totalFrames;
      this.ring.copyRecent(this.pitchWindow);
      const estimate = this.pitchEstimator.estimate(this.pitchWindow);
      if (estimate === null) {
        this.activeNote.state = 'uncertain';
        this.state = 'uncertain';
        continue;
      }

      this.activeNote.frequencyHistory.push(estimate.frequencyHz);
      if (this.activeNote.frequencyHistory.length > 5) this.activeNote.frequencyHistory.shift();
      const smoothedFrequency = median(this.activeNote.frequencyHistory);
      const cents = frequencyToMidi(smoothedFrequency) * 100;
      this.activeNote.centsHistory.push(cents);
      if (this.activeNote.centsHistory.length > 8) this.activeNote.centsHistory.shift();
      const centsSpread =
        Math.max(...this.activeNote.centsHistory) - Math.min(...this.activeNote.centsHistory);
      const nextState: AnalysisState = centsSpread >= 25 ? 'bend-or-vibrato' : 'tracking';
      const candidates = createRankedPitchCandidates(smoothedFrequency, estimate.clarity);
      this.activeNote.candidates = candidates;
      this.activeNote.lastGeneratedAtMs = blockEndMs;
      this.activeNote.state = nextState;
      this.state = nextState;
      events.push(this.createNoteEvent({ ...this.activeNote, candidates }, 'provisional'));
    }

    return {
      events,
      onsets,
      sourceTimestampMs: startMs + (samples.length / this.sampleRate) * 1_000,
      state: this.state,
    };
  }

  finish(atMs: number): StreamingAnalysisResult {
    const event = this.finalizeActiveNote(atMs, atMs);
    this.state = 'silence';
    return {
      events: event === null ? [] : [event],
      onsets: [],
      sourceTimestampMs: atMs,
      state: this.state,
    };
  }

  private createNoteEvent(
    note: ActiveNote & { candidates: PitchCandidate[] },
    lifecycle: 'finalized' | 'provisional',
    endMs?: number,
  ): NoteEvent {
    const centsSpread =
      note.centsHistory.length === 0
        ? 0
        : Math.max(...note.centsHistory) - Math.min(...note.centsHistory);
    return {
      candidates: note.candidates,
      diagnostics: {
        centsSpread,
        pitchState: note.state,
        sampleRate: this.sampleRate,
      },
      id: note.id,
      kind: 'note',
      lifecycle,
      provenance: {
        algorithm: 'yin-energy-monophonic',
        generatedAtMs: sessionTimestampMs(note.lastGeneratedAtMs),
        runId: this.runId,
        subsystem: 'audio-analysis',
        version: MONOPHONIC_ANALYZER_VERSION,
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: {
        ...(endMs === undefined ? {} : { endMs: sessionTimestampMs(endMs) }),
        startMs: sessionTimestampMs(note.startMs),
      },
    };
  }

  private finalizeActiveNote(endMs: number, generatedAtMs = endMs): NoteEvent | null {
    const activeNote = this.activeNote;
    this.activeNote = null;
    this.silenceFrames = 0;
    if (activeNote?.candidates === null || activeNote === null) return null;
    activeNote.lastGeneratedAtMs = Math.max(activeNote.lastGeneratedAtMs, generatedAtMs);
    return this.createNoteEvent(
      activeNote as ActiveNote & { candidates: PitchCandidate[] },
      'finalized',
      Math.max(activeNote.startMs, endMs),
    );
  }

  private resetTemporalState(): void {
    this.activeNote = null;
    this.energyFrameCount = 0;
    this.energySumSquares = 0;
    this.lastAnalysisFrame = Number.NEGATIVE_INFINITY;
    this.onsetDetector.reset();
    this.ring.reset();
    this.silenceFrames = 0;
    this.state = 'silence';
  }
}
