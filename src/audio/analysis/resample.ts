export const DEFAULT_ANALYSIS_SAMPLE_RATE = 16_000;

export type ResampledChunk = {
  firstSourceFrameOffset: number;
  samples: Float32Array;
};

class LowPassBiquad {
  private readonly a1: number;
  private readonly a2: number;
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  private delay1 = 0;
  private delay2 = 0;

  constructor(sampleRate: number, cutoffHz: number, quality: number) {
    const omega = (2 * Math.PI * cutoffHz) / sampleRate;
    const cosine = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * quality);
    const scale = 1 / (1 + alpha);
    this.b0 = ((1 - cosine) / 2) * scale;
    this.b1 = (1 - cosine) * scale;
    this.b2 = this.b0;
    this.a1 = -2 * cosine * scale;
    this.a2 = (1 - alpha) * scale;
  }

  process(sample: number): number {
    const output = this.b0 * sample + this.delay1;
    this.delay1 = this.b1 * sample - this.a1 * output + this.delay2;
    this.delay2 = this.b2 * sample - this.a2 * output;
    return output;
  }

  reset(): void {
    this.delay1 = 0;
    this.delay2 = 0;
  }
}

/**
 * Streaming, causal sample-rate reducer for the analysis branch.
 *
 * A fourth-order Butterworth low-pass removes content above the destination
 * Nyquist band before fractional decimation. Capture PCM remains untouched.
 */
export class StreamingAnalysisResampler {
  readonly inputSampleRate: number;
  readonly outputSampleRate: number;
  private readonly filters: readonly LowPassBiquad[];
  private readonly sourceFramesPerOutputFrame: number;
  private inputFramesProcessed = 0;
  private nextOutputSourceFrame = 0;
  private previousFilteredSample = 0;
  private hasPreviousSample = false;

  constructor(inputSampleRate: number, requestedOutputSampleRate = DEFAULT_ANALYSIS_SAMPLE_RATE) {
    if (!Number.isInteger(inputSampleRate) || inputSampleRate <= 0) {
      throw new RangeError('Input sample rate must be a positive integer.');
    }
    if (!Number.isInteger(requestedOutputSampleRate) || requestedOutputSampleRate <= 0) {
      throw new RangeError('Output sample rate must be a positive integer.');
    }
    this.inputSampleRate = inputSampleRate;
    this.outputSampleRate = Math.min(inputSampleRate, requestedOutputSampleRate);
    this.sourceFramesPerOutputFrame = inputSampleRate / this.outputSampleRate;
    if (this.outputSampleRate === inputSampleRate) {
      this.filters = [];
      return;
    }

    const cutoffHz = this.outputSampleRate * 0.45;
    this.filters = [
      new LowPassBiquad(inputSampleRate, cutoffHz, 0.541_196_1),
      new LowPassBiquad(inputSampleRate, cutoffHz, 1.306_563),
    ];
  }

  push(samples: Float32Array, discontinuity = false): ResampledChunk {
    if (discontinuity) this.reset();
    if (this.filters.length === 0) {
      this.inputFramesProcessed += samples.length;
      return { firstSourceFrameOffset: 0, samples };
    }

    const chunkStartFrame = this.inputFramesProcessed;
    const capacity = Math.ceil(samples.length / this.sourceFramesPerOutputFrame) + 2;
    const output = new Float32Array(capacity);
    let outputLength = 0;
    let firstOutputSourceFrame = Number.NaN;

    for (const sample of samples) {
      const sourceFrame = this.inputFramesProcessed;
      let filtered = sample;
      for (const filter of this.filters) filtered = filter.process(filtered);

      if (!this.hasPreviousSample) {
        this.previousFilteredSample = filtered;
        this.hasPreviousSample = true;
      }

      while (this.nextOutputSourceFrame <= sourceFrame + 1e-9) {
        if (Number.isNaN(firstOutputSourceFrame)) {
          firstOutputSourceFrame = this.nextOutputSourceFrame;
        }
        const previousSourceFrame = Math.max(0, sourceFrame - 1);
        const fraction = Math.max(0, Math.min(1, this.nextOutputSourceFrame - previousSourceFrame));
        output[outputLength] =
          this.previousFilteredSample + (filtered - this.previousFilteredSample) * fraction;
        outputLength += 1;
        this.nextOutputSourceFrame += this.sourceFramesPerOutputFrame;
      }

      this.previousFilteredSample = filtered;
      this.inputFramesProcessed += 1;
    }

    return {
      firstSourceFrameOffset: Number.isNaN(firstOutputSourceFrame)
        ? 0
        : firstOutputSourceFrame - chunkStartFrame,
      samples: output.subarray(0, outputLength),
    };
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
    this.inputFramesProcessed = 0;
    this.nextOutputSourceFrame = 0;
    this.previousFilteredSample = 0;
    this.hasPreviousSample = false;
  }
}
