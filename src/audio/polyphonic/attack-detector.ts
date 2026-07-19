import type { AttackObservation } from './chord-observations';
import { magnitudeSpectrum } from './spectrum';

export type AttackDetectorOptions = {
  readonly baselineMs?: number;
  readonly energyRiseThresholdDb?: number;
  readonly fftSize?: number;
  readonly fluxOnlyThresholdZ?: number;
  readonly fluxThresholdZ?: number;
  readonly frameSize?: number;
  readonly hopSize?: number;
  readonly maximumFrequencyHz?: number;
  readonly minimumFrequencyHz?: number;
  readonly refractoryMs?: number;
};

type AttackFrame = AttackObservation & { readonly frameTimeMs: number };

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

/**
 * Causal, analysis-only onset evidence. Flux is normalized against a rolling median/MAD baseline,
 * so the detector does not depend on one interface's absolute PCM gain.
 */
export class StreamingAttackDetector {
  private readonly baselineFrameCount: number;
  private readonly energyRiseThresholdDb: number;
  private readonly fftSize: number;
  private readonly fluxOnlyThresholdZ: number;
  private readonly fluxThresholdZ: number;
  private readonly frameBuffer: Float32Array;
  private readonly frameSize: number;
  private readonly hopSize: number;
  private readonly maximumBin: number;
  private readonly minimumBin: number;
  private readonly refractoryMs: number;
  private readonly sampleRate: number;
  private baselineFlux: number[] = [];
  private bufferedFrames = 0;
  private framesSinceSpectrum = 0;
  private lastCandidateTimeMs = Number.NEGATIVE_INFINITY;
  private lastRms = 0;
  private pendingFrames: AttackFrame[] = [];
  private previousLogMagnitude: Float64Array | null = null;
  private writeIndex = 0;

  constructor(sampleRate: number, options: AttackDetectorOptions = {}) {
    if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
      throw new RangeError('Attack detector sample rate must be a positive integer.');
    }
    this.sampleRate = sampleRate;
    this.frameSize = options.frameSize ?? Math.round(sampleRate * 0.032);
    this.hopSize = options.hopSize ?? Math.round(sampleRate * 0.01);
    this.fftSize = options.fftSize ?? 512;
    if (this.frameSize <= 1 || this.hopSize <= 0 || this.fftSize < this.frameSize) {
      throw new RangeError('Attack detector requires a valid frame, hop, and FFT layout.');
    }
    this.frameBuffer = new Float32Array(this.frameSize);
    this.minimumBin = Math.max(
      1,
      Math.floor(((options.minimumFrequencyHz ?? 80) * this.fftSize) / sampleRate),
    );
    this.maximumBin = Math.min(
      this.fftSize / 2 - 1,
      Math.ceil(((options.maximumFrequencyHz ?? 5_000) * this.fftSize) / sampleRate),
    );
    this.baselineFrameCount = Math.max(
      20,
      Math.round((options.baselineMs ?? 4_000) / ((this.hopSize / sampleRate) * 1_000)),
    );
    this.energyRiseThresholdDb = options.energyRiseThresholdDb ?? 1.5;
    this.fluxThresholdZ = options.fluxThresholdZ ?? 3;
    this.fluxOnlyThresholdZ = options.fluxOnlyThresholdZ ?? 5;
    this.refractoryMs = options.refractoryMs ?? 60;
  }

  push(samples: Float32Array, firstSampleTimeMs: number, discontinuity = false): void {
    if (discontinuity) this.reset();
    for (let index = 0; index < samples.length; index += 1) {
      this.frameBuffer[this.writeIndex] = samples[index] ?? 0;
      this.writeIndex = (this.writeIndex + 1) % this.frameSize;
      this.bufferedFrames = Math.min(this.frameSize, this.bufferedFrames + 1);
      this.framesSinceSpectrum += 1;
      if (this.bufferedFrames < this.frameSize || this.framesSinceSpectrum < this.hopSize) continue;
      this.framesSinceSpectrum = 0;
      const frameEndTimeMs = firstSampleTimeMs + ((index + 1) / this.sampleRate) * 1_000;
      this.analyzeFrame(frameEndTimeMs);
    }
  }

  consumeUntil(endMs: number): AttackObservation {
    const eligible = this.pendingFrames.filter(({ frameTimeMs }) => frameTimeMs <= endMs);
    this.pendingFrames = this.pendingFrames.filter(({ frameTimeMs }) => frameTimeMs > endMs);
    const strongest = eligible.reduce<AttackFrame | null>(
      (best, frame) =>
        best === null ||
        frame.strength > best.strength ||
        (frame.strength === best.strength && frame.spectralFluxZ > best.spectralFluxZ)
          ? frame
          : best,
      null,
    );
    if (strongest === null) {
      return {
        energyRiseDb: 0,
        peakTimeMs: null,
        percussiveRatio: 0,
        spectralFluxZ: 0,
        strength: 0,
      };
    }
    return {
      energyRiseDb: strongest.energyRiseDb,
      peakTimeMs: strongest.strength > 0 ? strongest.frameTimeMs : null,
      percussiveRatio: 0,
      spectralFluxZ: strongest.spectralFluxZ,
      strength: strongest.strength,
    };
  }

  reset(): void {
    this.baselineFlux = [];
    this.bufferedFrames = 0;
    this.framesSinceSpectrum = 0;
    this.frameBuffer.fill(0);
    this.lastCandidateTimeMs = Number.NEGATIVE_INFINITY;
    this.lastRms = 0;
    this.pendingFrames = [];
    this.previousLogMagnitude = null;
    this.writeIndex = 0;
  }

  private analyzeFrame(frameEndTimeMs: number): void {
    const frame = new Float32Array(this.frameSize);
    for (let index = 0; index < this.frameSize; index += 1) {
      frame[index] = this.frameBuffer[(this.writeIndex + index) % this.frameSize] ?? 0;
    }
    const spectrum = magnitudeSpectrum(frame, 0, this.frameSize, this.fftSize);
    const logMagnitude = Float64Array.from(spectrum, (magnitude) => Math.log1p(magnitude));
    let flux = 0;
    let binCount = 0;
    if (this.previousLogMagnitude !== null) {
      for (let bin = this.minimumBin; bin <= this.maximumBin; bin += 1) {
        flux += Math.max(0, (logMagnitude[bin] ?? 0) - (this.previousLogMagnitude[bin] ?? 0));
        binCount += 1;
      }
    }
    flux /= Math.max(1, binCount);
    const baselineMedian = median(this.baselineFlux);
    const absoluteDeviations = this.baselineFlux.map((value) => Math.abs(value - baselineMedian));
    const robustScale = Math.max(1e-4, 1.4826 * median(absoluteDeviations));
    const spectralFluxZ =
      this.previousLogMagnitude === null ? 0 : (flux - baselineMedian) / robustScale;
    const rms = Math.sqrt(frame.reduce((sum, sample) => sum + sample * sample, 0) / frame.length);
    const energyRiseDb =
      this.lastRms <= 1e-8 ? 0 : 20 * Math.log10(Math.max(1e-8, rms) / this.lastRms);
    const baselineReady = this.baselineFlux.length >= 20;
    const isCandidate =
      (baselineReady &&
        spectralFluxZ >= this.fluxThresholdZ &&
        energyRiseDb >= this.energyRiseThresholdDb) ||
      (baselineReady && spectralFluxZ >= this.fluxOnlyThresholdZ);
    const outsideRefractory = frameEndTimeMs - this.lastCandidateTimeMs >= this.refractoryMs;
    const fluxStrength = clampUnit(
      (spectralFluxZ - this.fluxThresholdZ) /
        Math.max(1, this.fluxOnlyThresholdZ - this.fluxThresholdZ + 2),
    );
    const riseStrength = clampUnit(
      (energyRiseDb - this.energyRiseThresholdDb) / Math.max(3, this.energyRiseThresholdDb * 4),
    );
    const strength =
      isCandidate && outsideRefractory
        ? Math.max(fluxStrength, (fluxStrength + riseStrength) / 2)
        : 0;
    if (strength > 0) this.lastCandidateTimeMs = frameEndTimeMs;
    this.pendingFrames.push({
      energyRiseDb,
      frameTimeMs: frameEndTimeMs,
      peakTimeMs: strength > 0 ? frameEndTimeMs : null,
      percussiveRatio: 0,
      spectralFluxZ,
      strength,
    });
    this.baselineFlux.push(flux);
    if (this.baselineFlux.length > this.baselineFrameCount) this.baselineFlux.shift();
    this.lastRms = rms;
    this.previousLogMagnitude = logMagnitude;
  }
}
