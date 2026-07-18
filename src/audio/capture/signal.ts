import { sessionTimestampMs } from '../../shared';
import {
  CLIPPING_THRESHOLD,
  PCM_CHUNK_SCHEMA_VERSION,
  SILENCE_RMS_THRESHOLD,
  type CapturedRecording,
  type PcmDiagnostics,
} from './contracts';

export type CalibrationToneOptions = {
  durationSeconds?: number;
  frequencyHz?: number;
  peakDbfs?: number;
  sampleRate?: number;
};

export type CalibrationMeasurementOptions = {
  expectedPeakDbfs?: number;
  frequencyHz?: number;
  windowSeconds?: number;
};

export type CalibrationToneMeasurement = {
  deltaDb: number;
  detected: boolean;
  expectedPeakDbfs: number;
  frequencyHz: number;
  observedPeakDbfs: number;
  strongestWindowStartSeconds: number;
  windowSeconds: number;
};

const REFERENCE_DURATION_SECONDS = 5;
const REFERENCE_SILENCE_SECONDS = 0.5;

export function amplitudeToDbfs(amplitude: number, floorDb = -80): number {
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    throw new RangeError('Amplitude must be a finite non-negative number.');
  }
  if (!Number.isFinite(floorDb) || floorDb > 0) {
    throw new RangeError('The dBFS floor must be finite and no greater than zero.');
  }
  if (amplitude === 0) return floorDb;
  return Math.max(floorDb, 20 * Math.log10(Math.min(1, amplitude)));
}

export function dbfsToAmplitude(dbfs: number): number {
  if (!Number.isFinite(dbfs) || dbfs > 0) {
    throw new RangeError('dBFS must be finite and no greater than zero.');
  }
  return 10 ** (dbfs / 20);
}

export function dbfsToMeterPercent(dbfs: number, minimumDb = -60): number {
  if (!Number.isFinite(dbfs)) throw new RangeError('dBFS must be finite.');
  if (!Number.isFinite(minimumDb) || minimumDb >= 0) {
    throw new RangeError('The meter minimum must be finite and less than zero.');
  }
  return Math.min(100, Math.max(0, ((dbfs - minimumDb) / -minimumDb) * 100));
}

export function createCalibrationTone(options: CalibrationToneOptions = {}): Float32Array {
  const durationSeconds = options.durationSeconds ?? 0.1;
  const frequencyHz = options.frequencyHz ?? 1_000;
  const peakDbfs = options.peakDbfs ?? -24;
  const sampleRate = options.sampleRate ?? 48_000;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError('Calibration duration must be positive and finite.');
  }
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz >= sampleRate / 2) {
    throw new RangeError('Calibration frequency must be positive and below Nyquist.');
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Calibration sample rate must be a positive integer.');
  }
  const amplitude = dbfsToAmplitude(peakDbfs);
  const frameCount = Math.max(1, Math.round(durationSeconds * sampleRate));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    samples[frame] = amplitude * Math.sin((2 * Math.PI * frequencyHz * frame) / sampleRate);
  }
  return samples;
}

export function createCalibrationReferenceRecording(
  options: Omit<CalibrationToneOptions, 'durationSeconds'> = {},
): CapturedRecording {
  const sampleRate = options.sampleRate ?? 48_000;
  const data = new Float32Array(Math.round(REFERENCE_DURATION_SECONDS * sampleRate));
  const tone = createCalibrationTone({
    ...options,
    durationSeconds: REFERENCE_DURATION_SECONDS - REFERENCE_SILENCE_SECONDS * 2,
    sampleRate,
  });
  data.set(tone, Math.round(REFERENCE_SILENCE_SECONDS * sampleRate));
  return {
    channelCount: 1,
    data,
    discontinuityCount: 0,
    durationMs: REFERENCE_DURATION_SECONDS * 1_000,
    frameCount: data.length,
    recordedAt: new Date(0).toISOString(),
    sampleRate,
    schemaVersion: PCM_CHUNK_SCHEMA_VERSION,
    startedAtMs: sessionTimestampMs(0),
  };
}

/**
 * Measures a known sine in a captured signal using phase-independent correlation. The strongest
 * complete window is used so silence before and after the played reference does not lower the
 * result. This reports end-to-end gain; hardware processing in the route is intentionally included.
 */
export function measureCalibrationTone(
  recording: Pick<CapturedRecording, 'data' | 'sampleRate'>,
  options: CalibrationMeasurementOptions = {},
): CalibrationToneMeasurement {
  const expectedPeakDbfs = options.expectedPeakDbfs ?? -24;
  const frequencyHz = options.frequencyHz ?? 1_000;
  const windowSeconds = options.windowSeconds ?? 0.25;
  const { data, sampleRate } = recording;
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz >= sampleRate / 2) {
    throw new RangeError('Calibration frequency must be positive and below Nyquist.');
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new RangeError('Calibration measurement window must be positive and finite.');
  }
  const windowFrames = Math.max(1, Math.round(windowSeconds * sampleRate));
  if (data.length < windowFrames) {
    throw new RangeError('The recording is shorter than the calibration measurement window.');
  }

  let strongestAmplitude = 0;
  let strongestStartFrame = 0;
  for (let startFrame = 0; startFrame + windowFrames <= data.length; startFrame += windowFrames) {
    let sineProjection = 0;
    let cosineProjection = 0;
    for (let offset = 0; offset < windowFrames; offset += 1) {
      const phase = (2 * Math.PI * frequencyHz * offset) / sampleRate;
      const sample = data[startFrame + offset] ?? 0;
      sineProjection += sample * Math.sin(phase);
      cosineProjection += sample * Math.cos(phase);
    }
    const amplitude = (2 / windowFrames) * Math.hypot(sineProjection, cosineProjection);
    if (amplitude > strongestAmplitude) {
      strongestAmplitude = amplitude;
      strongestStartFrame = startFrame;
    }
  }

  const observedPeakDbfs = amplitudeToDbfs(strongestAmplitude);
  return {
    deltaDb: observedPeakDbfs - expectedPeakDbfs,
    detected: observedPeakDbfs > -60,
    expectedPeakDbfs,
    frequencyHz,
    observedPeakDbfs,
    strongestWindowStartSeconds: strongestStartFrame / sampleRate,
    windowSeconds: windowFrames / sampleRate,
  };
}

export function analyzePcm(
  samples: Float32Array,
  options: { clippingThreshold?: number; silenceThreshold?: number } = {},
): Omit<PcmDiagnostics, 'discontinuity'> {
  const clippingThreshold = options.clippingThreshold ?? CLIPPING_THRESHOLD;
  const silenceThreshold = options.silenceThreshold ?? SILENCE_RMS_THRESHOLD;
  let peak = 0;
  let sumSquares = 0;
  let clippingSamples = 0;

  for (const sample of samples) {
    const magnitude = Math.abs(sample);
    peak = Math.max(peak, magnitude);
    sumSquares += sample * sample;
    if (magnitude >= clippingThreshold) clippingSamples += 1;
  }

  const rms = samples.length === 0 ? 0 : Math.sqrt(sumSquares / samples.length);
  return {
    clippingSamples,
    peak: Math.min(1, peak),
    rms: Math.min(1, rms),
    silent: rms < silenceThreshold,
  };
}

export function downsampleWaveform(samples: Float32Array, pointCount = 96): number[] {
  if (samples.length === 0 || pointCount <= 0) return [];
  const points = Math.min(pointCount, samples.length);
  const bucketSize = samples.length / points;
  return Array.from({ length: points }, (_, index) => {
    const start = Math.floor(index * bucketSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * bucketSize));
    let strongest = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const sample = samples[sampleIndex] ?? 0;
      if (Math.abs(sample) > Math.abs(strongest)) strongest = sample;
    }
    return strongest;
  });
}
