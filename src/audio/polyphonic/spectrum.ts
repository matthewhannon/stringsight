export const isPowerOfTwo = (value: number): boolean => value > 0 && (value & (value - 1)) === 0;

export function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    while ((reversed & bit) !== 0) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      const realAtIndex = real[index] ?? 0;
      const imaginaryAtIndex = imaginary[index] ?? 0;
      real[index] = real[reversed] ?? 0;
      imaginary[index] = imaginary[reversed] ?? 0;
      real[reversed] = realAtIndex;
      imaginary[reversed] = imaginaryAtIndex;
    }
  }

  for (let width = 2; width <= size; width *= 2) {
    const angle = (-2 * Math.PI) / width;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    const half = width / 2;
    for (let start = 0; start < size; start += width) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < half; offset += 1) {
        const evenIndex = start + offset;
        const oddIndex = evenIndex + half;
        const oddReal =
          (real[oddIndex] ?? 0) * twiddleReal - (imaginary[oddIndex] ?? 0) * twiddleImaginary;
        const oddImaginary =
          (real[oddIndex] ?? 0) * twiddleImaginary + (imaginary[oddIndex] ?? 0) * twiddleReal;
        const evenReal = real[evenIndex] ?? 0;
        const evenImaginary = imaginary[evenIndex] ?? 0;
        real[evenIndex] = evenReal + oddReal;
        imaginary[evenIndex] = evenImaginary + oddImaginary;
        real[oddIndex] = evenReal - oddReal;
        imaginary[oddIndex] = evenImaginary - oddImaginary;
        const nextTwiddleReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
}

export function magnitudeSpectrum(
  samples: Float32Array,
  offset: number,
  frameSize: number,
  fftSize: number,
): Float64Array {
  if (!isPowerOfTwo(fftSize) || frameSize <= 1 || frameSize > fftSize) {
    throw new RangeError('Spectrum requires a power-of-two FFT at least as large as its frame.');
  }
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  for (let frame = 0; frame < frameSize; frame += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * frame) / (frameSize - 1));
    real[frame] = (samples[offset + frame] ?? 0) * window;
  }
  fftInPlace(real, imaginary);
  return Float64Array.from({ length: fftSize / 2 }, (_, bin) =>
    Math.hypot(real[bin] ?? 0, imaginary[bin] ?? 0),
  );
}
