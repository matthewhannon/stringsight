export const CHROMA_BIN_COUNT = 12;
export const DEFAULT_CHROMA_FFT_SIZE = 8_192;
export const DEFAULT_CHROMA_WINDOW_FRAMES = 6_144;

import { fftInPlace, isPowerOfTwo } from './spectrum';

export type ChromaObservation = {
  bass: readonly number[];
  energy: number;
  values: readonly number[];
};

const normalize = (values: Float64Array): number[] => {
  const sum = values.reduce((total, value) => total + value, 0);
  return sum <= Number.EPSILON
    ? Array.from({ length: CHROMA_BIN_COUNT }, () => 0)
    : Array.from(values, (value) => value / sum);
};

export function computeChroma(
  samples: Float32Array,
  sampleRate: number,
  options: {
    fftSize?: number;
    maxMidi?: number;
    minMidi?: number;
    windowFrames?: number;
  } = {},
): ChromaObservation {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Chroma sample rate must be positive.');
  }
  const fftSize = options.fftSize ?? DEFAULT_CHROMA_FFT_SIZE;
  const windowFrames = options.windowFrames ?? DEFAULT_CHROMA_WINDOW_FRAMES;
  if (!isPowerOfTwo(fftSize) || windowFrames <= 1 || windowFrames > fftSize) {
    throw new RangeError('Chroma requires a power-of-two FFT at least as large as its window.');
  }
  if (samples.length < windowFrames) {
    throw new RangeError(`Chroma requires at least ${String(windowFrames)} samples.`);
  }

  const minMidi = options.minMidi ?? 40;
  const maxMidi = options.maxMidi ?? 88;
  const offset = samples.length - windowFrames;
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  let weightedSquareSum = 0;
  let windowPower = 0;
  for (let frame = 0; frame < windowFrames; frame += 1) {
    const sample = samples[offset + frame] ?? 0;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / (windowFrames - 1));
    weightedSquareSum += sample * sample * window * window;
    windowPower += window * window;
    real[frame] = sample * window;
  }
  fftInPlace(real, imaginary);

  const chroma = new Float64Array(CHROMA_BIN_COUNT);
  const bass = new Float64Array(CHROMA_BIN_COUNT);
  const minimumHz = 440 * 2 ** ((minMidi - 69 - 0.5) / 12);
  const maximumHz = 440 * 2 ** ((maxMidi - 69 + 0.5) / 12);
  const firstBin = Math.max(1, Math.ceil((minimumHz * fftSize) / sampleRate));
  const lastBin = Math.min(fftSize / 2 - 1, Math.floor((maximumHz * fftSize) / sampleRate));
  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const frequencyHz = (bin * sampleRate) / fftSize;
    const midi = 69 + 12 * Math.log2(frequencyHz / 440);
    if (midi < minMidi - 0.5 || midi > maxMidi + 0.5) continue;
    const pitchClass =
      ((Math.round(midi) % CHROMA_BIN_COUNT) + CHROMA_BIN_COUNT) % CHROMA_BIN_COUNT;
    const magnitude = Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0);
    const whitenedMagnitude = Math.sqrt(magnitude) / Math.sqrt(frequencyHz);
    chroma[pitchClass] = (chroma[pitchClass] ?? 0) + whitenedMagnitude;
    if (midi < 60) {
      bass[pitchClass] = (bass[pitchClass] ?? 0) + whitenedMagnitude * 2 ** ((60 - midi) / 24);
    }
  }

  return {
    bass: normalize(bass),
    energy: Math.sqrt(weightedSquareSum / Math.max(windowPower, Number.EPSILON)),
    values: normalize(chroma),
  };
}
