export type EnergyOnsetDetectorOptions = {
  envelopeReleaseMs?: number;
  minimumRiseDb?: number;
  minimumRms?: number;
  refractoryMs?: number;
};

export type EnergyOnset = {
  confidence: number;
  rms: number;
  strengthDb: number;
};

export class EnergyOnsetDetector {
  private readonly envelopeReleaseMs: number;
  private readonly minimumRiseDb: number;
  private readonly minimumRms: number;
  private readonly refractoryMs: number;
  private lastOnsetMs = Number.NEGATIVE_INFINITY;
  private lastProcessedAtMs: number | null = null;
  private noiseFloor = 0.0005;
  private signalEnvelope = 0.0005;
  private warmupStartedAtMs: number | null = null;

  constructor(options: EnergyOnsetDetectorOptions = {}) {
    this.envelopeReleaseMs = options.envelopeReleaseMs ?? 30;
    if (!Number.isFinite(this.envelopeReleaseMs) || this.envelopeReleaseMs <= 0) {
      throw new RangeError('Envelope release must be positive and finite.');
    }
    this.minimumRiseDb = options.minimumRiseDb ?? 7;
    this.minimumRms = options.minimumRms ?? 0.004;
    this.refractoryMs = options.refractoryMs ?? 70;
  }

  get silenceThreshold(): number {
    return Math.max(0.003, this.noiseFloor * 2.5);
  }

  process(rms: number, atMs: number): EnergyOnset | null {
    if (!Number.isFinite(rms) || rms < 0 || rms > 1) {
      throw new RangeError('RMS must be normalized from zero through one.');
    }
    if (!Number.isFinite(atMs) || atMs < 0) throw new RangeError('Timestamp must be non-negative.');

    const elapsedMs = Math.max(0, atMs - (this.lastProcessedAtMs ?? atMs));
    this.lastProcessedAtMs = atMs;

    this.warmupStartedAtMs ??= atMs;
    if (atMs - this.warmupStartedAtMs < 30) {
      this.noiseFloor = this.noiseFloor * 0.4 + rms * 0.6;
      this.signalEnvelope = rms;
      return null;
    }

    const reference = Math.max(this.signalEnvelope, this.noiseFloor, 0.000_001);
    const releaseWeight = Math.exp(-elapsedMs / this.envelopeReleaseMs);
    this.signalEnvelope =
      rms >= this.signalEnvelope
        ? rms
        : this.signalEnvelope * releaseWeight + rms * (1 - releaseWeight);
    const riseDb = Math.max(
      0,
      20 * Math.log10(Math.max(this.signalEnvelope, 0.000_001) / reference),
    );
    const signalThreshold = Math.max(this.minimumRms, this.noiseFloor * 3.5);
    const eligible =
      rms >= signalThreshold &&
      riseDb >= this.minimumRiseDb &&
      atMs - this.lastOnsetMs >= this.refractoryMs;

    if (rms <= Math.max(this.minimumRms, this.noiseFloor * 1.5)) {
      this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02;
    }
    if (!eligible) return null;
    this.lastOnsetMs = atMs;
    const confidence = Math.min(1, 0.45 + (riseDb - this.minimumRiseDb) / 24);
    return { confidence, rms, strengthDb: riseDb };
  }

  reset(): void {
    this.lastOnsetMs = Number.NEGATIVE_INFINITY;
    this.lastProcessedAtMs = null;
    this.noiseFloor = 0.0005;
    this.signalEnvelope = 0.0005;
    this.warmupStartedAtMs = null;
  }
}
