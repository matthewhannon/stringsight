import { CHROMA_BIN_COUNT, type ChromaObservation } from './chroma';
import { magnitudeSpectrum } from './spectrum';

export const HARMONIC_CHROMA_BINS_PER_SEMITONE = 3;
export const HARMONIC_CHROMA_FRAME_SIZE = 4_096;
export const HARMONIC_CHROMA_FFT_SIZE = 8_192;
export const HARMONIC_CHROMA_HOP_SIZE = 1_024;

const MIN_NOTE_MIDI = 40;
const MAX_NOTE_MIDI = 88;
const MAX_SPECTRUM_MIDI = 112;
const MAX_HARMONIC = 16;

export type HarmonicChromaObservation = ChromaObservation & {
  /** Short-window signal level used only for activity gating. */
  activityEnergy: number;
  /** Short-time evidence used only to locate a possible chord change. */
  changeValues: readonly number[];
  noteActivations: readonly number[];
  noteMidiRange: { max: number; min: number };
  transientRatio: number;
  treble: readonly number[];
  tuningCents: number;
};

export type HarmonicChromaOptions = {
  fftSize?: number;
  frameSize?: number;
  hopSize?: number;
  maxNoteMidi?: number;
  maxSpectrumMidi?: number;
  minNoteMidi?: number;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));
const indexedValue = <T>(values: ArrayLike<T>, index: number): T => {
  const value = values[index];
  if (value === undefined) throw new RangeError('Analysis index exceeded its allocated buffer.');
  return value;
};
const arrayValue = (values: ArrayLike<number>, index: number): number =>
  indexedValue(values, index);

const normalize = (values: Float64Array): number[] => {
  const sum = values.reduce((total, value) => total + value, 0);
  return sum <= Number.EPSILON
    ? Array.from({ length: values.length }, () => 0)
    : Array.from(values, (value) => value / sum);
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (arrayValue(values, middle - 1) + arrayValue(values, middle)) / 2
    : arrayValue(values, middle);
};

const medianAlongTime = (
  spectra: readonly Float64Array[],
  frameIndex: number,
  bin: number,
  radius: number,
): number => {
  const values: number[] = [];
  for (
    let index = Math.max(0, frameIndex - radius);
    index <= Math.min(spectra.length - 1, frameIndex + radius);
    index += 1
  ) {
    values.push(arrayValue(indexedValue(spectra, index), bin));
  }
  return median(values);
};

const medianAlongFrequency = (spectrum: Float64Array, bin: number, radius: number): number => {
  const values: number[] = [];
  for (
    let index = Math.max(1, bin - radius);
    index <= Math.min(spectrum.length - 1, bin + radius);
    index += 1
  ) {
    values.push(arrayValue(spectrum, index));
  }
  return median(values);
};

const separateHarmonicSpectra = (
  spectra: readonly Float64Array[],
): { harmonic: Float64Array[]; transientRatios: number[] } => {
  const harmonic = spectra.map((spectrum) => new Float64Array(spectrum.length));
  const transientRatios: number[] = [];
  spectra.forEach((spectrum, frameIndex) => {
    const harmonicSpectrum = indexedValue(harmonic, frameIndex);
    let harmonicEnergy = 0;
    let percussiveEnergy = 0;
    for (let bin = 1; bin < spectrum.length; bin += 1) {
      const horizontal = medianAlongTime(spectra, frameIndex, bin, 2);
      const vertical = medianAlongFrequency(spectrum, bin, 12);
      const horizontalSquared = horizontal * horizontal;
      const verticalSquared = vertical * vertical;
      const mask =
        horizontalSquared / Math.max(Number.EPSILON, horizontalSquared + verticalSquared);
      const magnitude = arrayValue(spectrum, bin);
      const harmonicMagnitude = magnitude * mask;
      harmonicSpectrum[bin] = harmonicMagnitude;
      harmonicEnergy += harmonicMagnitude * harmonicMagnitude;
      const percussiveMagnitude = magnitude * (1 - mask);
      percussiveEnergy += percussiveMagnitude * percussiveMagnitude;
    }
    transientRatios.push(
      percussiveEnergy / Math.max(Number.EPSILON, percussiveEnergy + harmonicEnergy),
    );
  });
  return { harmonic, transientRatios };
};

export const estimateTuningCents = (
  spectra: readonly Float64Array[],
  sampleRate: number,
  fftSize: number,
): number => {
  let vectorX = 0;
  let vectorY = 0;
  for (const spectrum of spectra) {
    const maximum = spectrum.reduce((value, candidate) => Math.max(value, candidate), 0);
    if (maximum <= Number.EPSILON) continue;
    const firstBin = Math.ceil((70 * fftSize) / sampleRate);
    const lastBin = Math.min(spectrum.length - 2, Math.floor((2_000 * fftSize) / sampleRate));
    for (let bin = firstBin; bin <= lastBin; bin += 1) {
      const magnitude = arrayValue(spectrum, bin);
      if (
        magnitude < maximum * 0.025 ||
        magnitude <= arrayValue(spectrum, bin - 1) ||
        magnitude < arrayValue(spectrum, bin + 1)
      ) {
        continue;
      }
      const frequencyHz = (bin * sampleRate) / fftSize;
      const midi = 69 + 12 * Math.log2(frequencyHz / 440);
      const cents = (midi - Math.round(midi)) * 100;
      const angle = (2 * Math.PI * cents) / 100;
      const weight = Math.sqrt(magnitude);
      vectorX += Math.cos(angle) * weight;
      vectorY += Math.sin(angle) * weight;
    }
  }
  if (Math.hypot(vectorX, vectorY) <= Number.EPSILON) return 0;
  return clamp((Math.atan2(vectorY, vectorX) * 100) / (2 * Math.PI), -50, 50);
};

const toWhitenedLogSpectrum = (
  spectrum: Float64Array,
  sampleRate: number,
  fftSize: number,
  tuningCents: number,
  minMidi: number,
  maxMidi: number,
): Float64Array => {
  const binsPerSemitone = HARMONIC_CHROMA_BINS_PER_SEMITONE;
  const logBins = new Float64Array((maxMidi - minMidi) * binsPerSemitone + 1);
  const minimumHz = 440 * 2 ** ((minMidi - 69 - 1) / 12);
  const maximumHz = 440 * 2 ** ((maxMidi - 69 + 1) / 12);
  const firstBin = Math.max(1, Math.ceil((minimumHz * fftSize) / sampleRate));
  const lastBin = Math.min(spectrum.length - 1, Math.floor((maximumHz * fftSize) / sampleRate));
  for (let bin = firstBin; bin <= lastBin; bin += 1) {
    const magnitude = arrayValue(spectrum, bin);
    if (magnitude <= 0) continue;
    const frequencyHz = (bin * sampleRate) / fftSize;
    const tunedMidi = 69 + 12 * Math.log2(frequencyHz / 440) - tuningCents / 100;
    const position = (tunedMidi - minMidi) * binsPerSemitone;
    const lower = Math.floor(position);
    const fraction = position - lower;
    if (lower >= 0 && lower < logBins.length) {
      logBins[lower] = arrayValue(logBins, lower) + Math.sqrt(magnitude) * (1 - fraction);
    }
    if (lower + 1 >= 0 && lower + 1 < logBins.length) {
      logBins[lower + 1] = arrayValue(logBins, lower + 1) + Math.sqrt(magnitude) * fraction;
    }
  }

  const whitened = new Float64Array(logBins.length);
  for (let bin = 0; bin < logBins.length; bin += 1) {
    const neighborhood: number[] = [];
    for (
      let neighbor = Math.max(0, bin - 6);
      neighbor <= Math.min(logBins.length - 1, bin + 6);
      neighbor += 1
    ) {
      neighborhood.push(arrayValue(logBins, neighbor));
    }
    const floor = median(neighborhood);
    const variance =
      neighborhood.reduce((sum, value) => sum + (value - floor) ** 2, 0) /
      Math.max(1, neighborhood.length);
    whitened[bin] = Math.max(0, arrayValue(logBins, bin) - floor) / Math.sqrt(variance + 1e-10);
  }
  return whitened;
};

type HarmonicDictionary = {
  columns: Float64Array[];
  gram: Float64Array[];
};

const dictionaryCache = new Map<string, HarmonicDictionary>();

const createHarmonicDictionary = (
  minNoteMidi: number,
  maxNoteMidi: number,
  maxSpectrumMidi: number,
): HarmonicDictionary => {
  const key = `${String(minNoteMidi)}:${String(maxNoteMidi)}:${String(maxSpectrumMidi)}`;
  const cached = dictionaryCache.get(key);
  if (cached !== undefined) return cached;
  const logBinCount = (maxSpectrumMidi - minNoteMidi) * HARMONIC_CHROMA_BINS_PER_SEMITONE + 1;
  const columns: Float64Array[] = [];
  for (let midi = minNoteMidi; midi <= maxNoteMidi; midi += 1) {
    const column = new Float64Array(logBinCount);
    for (let harmonic = 1; harmonic <= MAX_HARMONIC; harmonic += 1) {
      const harmonicMidi = midi + 12 * Math.log2(harmonic);
      if (harmonicMidi > maxSpectrumMidi) break;
      const position = (harmonicMidi - minNoteMidi) * HARMONIC_CHROMA_BINS_PER_SEMITONE;
      const center = Math.round(position);
      const amplitude = 0.7 ** (harmonic - 1);
      for (let offset = -2; offset <= 2; offset += 1) {
        const bin = center + offset;
        if (bin < 0 || bin >= column.length) continue;
        const distance = bin - position;
        column[bin] = arrayValue(column, bin) + amplitude * Math.exp(-0.5 * distance * distance);
      }
    }
    const norm = Math.sqrt(column.reduce((sum, value) => sum + value * value, 0));
    if (norm > Number.EPSILON) {
      for (let bin = 0; bin < column.length; bin += 1) {
        column[bin] = arrayValue(column, bin) / norm;
      }
    }
    columns.push(column);
  }
  const gram = columns.map((left) =>
    Float64Array.from(columns, (right) =>
      left.reduce((sum, value, bin) => sum + value * arrayValue(right, bin), 0),
    ),
  );
  const dictionary = { columns, gram };
  dictionaryCache.set(key, dictionary);
  return dictionary;
};

const solveNonnegativeActivations = (
  observation: Float64Array,
  dictionary: HarmonicDictionary,
): Float64Array => {
  const activations = new Float64Array(dictionary.columns.length).fill(1e-3);
  const projection = Float64Array.from(dictionary.columns, (column) =>
    column.reduce((sum, value, bin) => sum + value * arrayValue(observation, bin), 0),
  );
  for (let iteration = 0; iteration < 32; iteration += 1) {
    for (let note = 0; note < activations.length; note += 1) {
      let reconstruction = 1e-6;
      const gramRow = indexedValue(dictionary.gram, note);
      for (let other = 0; other < activations.length; other += 1) {
        reconstruction += arrayValue(gramRow, other) * arrayValue(activations, other);
      }
      activations[note] =
        arrayValue(activations, note) * (arrayValue(projection, note) / reconstruction);
    }
  }
  return activations;
};

const weightedPool = (
  spectra: readonly Float64Array[],
  weights: readonly number[],
  frameIndexes: readonly number[],
): Float64Array => {
  const pooled = new Float64Array(indexedValue(spectra, 0).length);
  let totalWeight = 0;
  for (const index of frameIndexes) {
    const weight = arrayValue(weights, index);
    totalWeight += weight;
    const spectrum = indexedValue(spectra, index);
    for (let bin = 0; bin < spectrum.length; bin += 1) {
      pooled[bin] = arrayValue(pooled, bin) + arrayValue(spectrum, bin) * weight;
    }
  }
  if (totalWeight > Number.EPSILON) {
    for (let bin = 0; bin < pooled.length; bin += 1) {
      pooled[bin] = arrayValue(pooled, bin) / totalWeight;
    }
  }
  return pooled;
};

const foldActivations = (
  activations: Float64Array,
  minNoteMidi: number,
): { bass: number[]; treble: number[]; values: number[] } => {
  const values = new Float64Array(CHROMA_BIN_COUNT);
  const bass = new Float64Array(CHROMA_BIN_COUNT);
  const treble = new Float64Array(CHROMA_BIN_COUNT);
  activations.forEach((activation, index) => {
    const midi = minNoteMidi + index;
    const pitchClass = ((midi % CHROMA_BIN_COUNT) + CHROMA_BIN_COUNT) % CHROMA_BIN_COUNT;
    values[pitchClass] = arrayValue(values, pitchClass) + activation;
    if (midi < 60) {
      bass[pitchClass] = arrayValue(bass, pitchClass) + activation * 2 ** ((60 - midi) / 24);
    } else {
      treble[pitchClass] = arrayValue(treble, pitchClass) + activation;
    }
  });
  return { bass: normalize(bass), treble: normalize(treble), values: normalize(values) };
};

const weightedEnergy = (samples: Float32Array, startIndex = 0): number => {
  let energy = 0;
  let windowPower = 0;
  const frameCount = samples.length - startIndex;
  for (let index = startIndex; index < samples.length; index += 1) {
    const windowIndex = index - startIndex;
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * windowIndex) / Math.max(1, frameCount - 1));
    energy += arrayValue(samples, index) ** 2 * window * window;
    windowPower += window * window;
  }
  return Math.sqrt(energy / Math.max(Number.EPSILON, windowPower));
};

/**
 * Chord-only acoustic frontend inspired by NNLS chroma: harmonic/percussive separation,
 * tuning-aware log-frequency whitening, approximate harmonic-note transcription, and
 * independent long/short-time chroma evidence. It never alters captured or replayed PCM.
 */
export function computeHarmonicChroma(
  samples: Float32Array,
  sampleRate: number,
  options: HarmonicChromaOptions = {},
): HarmonicChromaObservation {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Harmonic chroma sample rate must be positive.');
  }
  const fftSize = options.fftSize ?? HARMONIC_CHROMA_FFT_SIZE;
  const frameSize = options.frameSize ?? HARMONIC_CHROMA_FRAME_SIZE;
  const hopSize = options.hopSize ?? HARMONIC_CHROMA_HOP_SIZE;
  const minNoteMidi = options.minNoteMidi ?? MIN_NOTE_MIDI;
  const maxNoteMidi = options.maxNoteMidi ?? MAX_NOTE_MIDI;
  const maxSpectrumMidi = options.maxSpectrumMidi ?? MAX_SPECTRUM_MIDI;
  if (samples.length < frameSize || hopSize <= 0 || minNoteMidi > maxNoteMidi) {
    throw new RangeError('Harmonic chroma requires a valid frame, hop, and note range.');
  }

  const frameOffsets: number[] = [];
  for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
    frameOffsets.push(offset);
  }
  const spectra = frameOffsets.map((offset) =>
    magnitudeSpectrum(samples, offset, frameSize, fftSize),
  );
  const separated = separateHarmonicSpectra(spectra);
  const tuningCents = estimateTuningCents(separated.harmonic, sampleRate, fftSize);
  const logSpectra = separated.harmonic.map((spectrum) =>
    toWhitenedLogSpectrum(spectrum, sampleRate, fftSize, tuningCents, minNoteMidi, maxSpectrumMidi),
  );
  const weights = separated.transientRatios.map((ratio) => clamp(1 - ratio, 0.15, 1));
  const allFrames = frameOffsets.map((_, index) => index);
  const recentFrames = allFrames.slice(-Math.min(2, allFrames.length));
  const dictionary = createHarmonicDictionary(minNoteMidi, maxNoteMidi, maxSpectrumMidi);
  const activations = solveNonnegativeActivations(
    weightedPool(logSpectra, weights, allFrames),
    dictionary,
  );
  const recentActivations = solveNonnegativeActivations(
    weightedPool(logSpectra, weights, recentFrames),
    dictionary,
  );
  const folded = foldActivations(activations, minNoteMidi);
  const recentFolded = foldActivations(recentActivations, minNoteMidi);
  const transientWeight = separated.transientRatios.reduce(
    (sum, ratio, index) => sum + ratio * arrayValue(weights, index),
    0,
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  return {
    activityEnergy: weightedEnergy(samples, Math.max(0, samples.length - 2_048)),
    bass: folded.bass,
    changeValues: recentFolded.values,
    energy: weightedEnergy(samples),
    noteActivations: Array.from(activations),
    noteMidiRange: { max: maxNoteMidi, min: minNoteMidi },
    transientRatio: transientWeight / Math.max(Number.EPSILON, totalWeight),
    treble: folded.treble,
    tuningCents,
    values: folded.values,
  };
}
