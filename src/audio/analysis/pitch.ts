import { confidence, type PitchCandidate, type PitchClass } from '../../shared';

export type YinOptions = {
  maximumFrequencyHz?: number;
  maximumNormalizedDifference?: number;
  minimumFrequencyHz?: number;
  threshold?: number;
};

export type YinEstimate = {
  clarity: number;
  frequencyHz: number;
  normalizedDifference: number;
  periodSamples: number;
};

type YinScratch = {
  difference: Float64Array;
  normalized: Float64Array;
};

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

const positiveModulo = (value: number, divisor: number): number =>
  ((value % divisor) + divisor) % divisor;

export function frequencyToMidi(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new RangeError('Frequency must be positive and finite.');
  }
  return 69 + 12 * Math.log2(frequencyHz / 440);
}

export function midiToFrequency(midi: number): number {
  if (!Number.isFinite(midi)) throw new RangeError('MIDI value must be finite.');
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError('MIDI note must be an integer from 0 through 127.');
  }
  const pitchClass = PITCH_CLASSES[positiveModulo(midi, 12)];
  if (pitchClass === undefined) throw new Error('Pitch-class lookup failed.');
  return `${pitchClass}${String(Math.floor(midi / 12) - 1)}`;
}

export function estimateYinPitch(
  samples: Float32Array,
  sampleRate: number,
  options: YinOptions = {},
): YinEstimate | null {
  return estimateYinPitchWithScratch(samples, sampleRate, options, {
    difference: new Float64Array(Math.floor(samples.length / 2) + 1),
    normalized: new Float64Array(Math.floor(samples.length / 2) + 1),
  });
}

function estimateYinPitchWithScratch(
  samples: Float32Array,
  sampleRate: number,
  options: YinOptions,
  scratch: YinScratch,
): YinEstimate | null {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Sample rate must be a positive integer.');
  }
  const minimumFrequencyHz = options.minimumFrequencyHz ?? 82.41;
  const maximumFrequencyHz = options.maximumFrequencyHz ?? 1_318.51;
  const threshold = options.threshold ?? 0.15;
  const maximumNormalizedDifference = options.maximumNormalizedDifference ?? 0.35;
  if (
    minimumFrequencyHz <= 0 ||
    maximumFrequencyHz <= minimumFrequencyHz ||
    maximumFrequencyHz >= sampleRate / 2
  ) {
    throw new RangeError('Pitch frequency range is invalid for this sample rate.');
  }
  if (samples.length < 4) return null;

  const minimumLag = Math.max(2, Math.floor(sampleRate / maximumFrequencyHz));
  const maximumLag = Math.min(
    Math.ceil(sampleRate / minimumFrequencyHz),
    Math.floor(samples.length / 2),
  );
  if (maximumLag <= minimumLag) return null;

  let mean = 0;
  let energy = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  for (const sample of samples) {
    const centered = sample - mean;
    energy += centered * centered;
  }
  if (Math.sqrt(energy / samples.length) < 0.003) return null;

  if (scratch.difference.length <= maximumLag || scratch.normalized.length <= maximumLag) {
    throw new RangeError('YIN scratch buffers are too small for this analysis window.');
  }
  const { difference, normalized } = scratch;
  const comparisonLength = samples.length - maximumLag;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = (samples[index] ?? 0) - (samples[index + lag] ?? 0);
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  normalized[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    runningSum += difference[lag] ?? 0;
    normalized[lag] = runningSum === 0 ? 1 : ((difference[lag] ?? 0) * lag) / runningSum;
  }

  let selectedLag = -1;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    if ((normalized[lag] ?? 1) >= threshold) continue;
    selectedLag = lag;
    while (
      selectedLag + 1 <= maximumLag &&
      (normalized[selectedLag + 1] ?? 1) < (normalized[selectedLag] ?? 1)
    ) {
      selectedLag += 1;
    }
    break;
  }
  if (selectedLag < 0) {
    let bestValue = Number.POSITIVE_INFINITY;
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      const value = normalized[lag] ?? 1;
      if (value < bestValue) {
        bestValue = value;
        selectedLag = lag;
      }
    }
  }

  const selectedValue = normalized[selectedLag] ?? 1;
  if (selectedValue > maximumNormalizedDifference) return null;
  const previous = normalized[selectedLag - 1] ?? selectedValue;
  const next = normalized[selectedLag + 1] ?? selectedValue;
  const denominator = 2 * (2 * selectedValue - previous - next);
  const adjustment = denominator === 0 ? 0 : (next - previous) / denominator;
  const periodSamples = selectedLag + Math.max(-1, Math.min(1, adjustment));

  return {
    clarity: Math.max(0, Math.min(1, 1 - selectedValue)),
    frequencyHz: sampleRate / periodSamples,
    normalizedDifference: selectedValue,
    periodSamples,
  };
}

/** Stateful YIN estimator that reuses its numeric scratch buffers on every frame. */
export class YinPitchEstimator {
  private difference: Float64Array;
  private normalized: Float64Array;
  private readonly options: YinOptions;
  private readonly sampleRate: number;

  constructor(sampleRate: number, options: YinOptions = {}, maximumWindowFrames = sampleRate) {
    if (!Number.isInteger(maximumWindowFrames) || maximumWindowFrames < 4) {
      throw new RangeError('Maximum YIN window must contain at least four frames.');
    }
    const scratchLength = Math.floor(maximumWindowFrames / 2) + 1;
    this.sampleRate = sampleRate;
    this.options = options;
    this.difference = new Float64Array(scratchLength);
    this.normalized = new Float64Array(scratchLength);
  }

  estimate(samples: Float32Array): YinEstimate | null {
    const requiredLength = Math.floor(samples.length / 2) + 1;
    if (requiredLength > this.difference.length) {
      this.difference = new Float64Array(requiredLength);
      this.normalized = new Float64Array(requiredLength);
    }
    return estimateYinPitchWithScratch(samples, this.sampleRate, this.options, {
      difference: this.difference,
      normalized: this.normalized,
    });
  }
}

function candidateFromMidi(
  midi: number,
  measuredFrequencyHz: number,
  candidateConfidence: number,
  rank: number,
  evidence: string[],
): PitchCandidate {
  const pitchClass = PITCH_CLASSES[positiveModulo(midi, 12)];
  if (pitchClass === undefined) throw new Error('Pitch-class lookup failed.');
  const candidateFrequency = midiToFrequency(midi);
  const centsOffset = 1200 * Math.log2(measuredFrequencyHz / candidateFrequency);
  return {
    centsOffset: Math.max(-100, Math.min(100, centsOffset)),
    confidence: confidence(Math.max(0, Math.min(1, candidateConfidence))),
    evidence,
    frequencyHz: measuredFrequencyHz,
    midi,
    noteName: midiToNoteName(midi),
    pitchClass,
    rank,
    score: candidateConfidence,
  };
}

export function createRankedPitchCandidates(
  frequencyHz: number,
  clarity: number,
  options: { maximumMidi?: number; minimumMidi?: number } = {},
): PitchCandidate[] {
  const confidenceWeights = [1, 0.32, 0.2] as const;
  const minimumMidi = options.minimumMidi ?? 40;
  const maximumMidi = options.maximumMidi ?? 88;
  const primaryMidi = Math.max(
    minimumMidi,
    Math.min(maximumMidi, Math.round(frequencyToMidi(frequencyHz))),
  );
  const midiAlternatives = [primaryMidi, primaryMidi - 12, primaryMidi + 12].filter(
    (midi, index, values) =>
      midi >= minimumMidi && midi <= maximumMidi && values.indexOf(midi) === index,
  );
  return midiAlternatives.map((midi, index) =>
    candidateFromMidi(
      midi,
      frequencyHz * 2 ** ((midi - primaryMidi) / 12),
      clarity * (confidenceWeights[index] ?? 0),
      index + 1,
      index === 0
        ? ['yin-periodicity', 'temporal-median']
        : ['known-octave-ambiguity', 'yin-periodicity'],
    ),
  );
}
