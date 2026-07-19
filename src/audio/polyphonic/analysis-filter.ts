type BiquadCoefficients = {
  a1: number;
  a2: number;
  b0: number;
  b1: number;
  b2: number;
};

class BiquadSection {
  private readonly coefficients: BiquadCoefficients;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(coefficients: BiquadCoefficients) {
    this.coefficients = coefficients;
  }

  process(input: number): number {
    const { a1, a2, b0, b1, b2 } = this.coefficients;
    const output = b0 * input + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

const designButterworthBiquad = (
  type: 'high-pass' | 'low-pass',
  cutoffHz: number,
  sampleRate: number,
): BiquadCoefficients => {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    cutoffHz <= 0 ||
    cutoffHz >= sampleRate / 2
  ) {
    throw new RangeError('Analysis filter cutoff must be between zero and Nyquist.');
  }
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const alpha = sine / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const highPass = type === 'high-pass';
  return {
    a1: (-2 * cosine) / a0,
    a2: (1 - alpha) / a0,
    b0: (highPass ? (1 + cosine) / 2 : (1 - cosine) / 2) / a0,
    b1: (highPass ? -(1 + cosine) : 1 - cosine) / a0,
    b2: (highPass ? (1 + cosine) / 2 : (1 - cosine) / 2) / a0,
  };
};

/** Analysis-only filter. Capture, recording export, replay PCM, and the monophonic path are untouched. */
export class ChordAnalysisBandPassFilter {
  private readonly highPass: BiquadSection;
  private readonly lowPass: BiquadSection;

  constructor(sampleRate: number, options: { highPassHz?: number; lowPassHz?: number } = {}) {
    this.highPass = new BiquadSection(
      designButterworthBiquad('high-pass', options.highPassHz ?? 55, sampleRate),
    );
    this.lowPass = new BiquadSection(
      designButterworthBiquad('low-pass', options.lowPassHz ?? 5_000, sampleRate),
    );
  }

  process(samples: Float32Array, discontinuity = false): Float32Array {
    if (discontinuity) this.reset();
    return Float32Array.from(samples, (sample) =>
      this.lowPass.process(this.highPass.process(sample)),
    );
  }

  reset(): void {
    this.highPass.reset();
    this.lowPass.reset();
  }
}
