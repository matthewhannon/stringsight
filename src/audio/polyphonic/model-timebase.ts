export function modelGapSampleCount(
  previousSourceEndMs: number | null,
  nextSourceStartMs: number,
  modelSampleRate: number,
): number {
  if (
    previousSourceEndMs !== null &&
    (!Number.isFinite(previousSourceEndMs) || previousSourceEndMs < 0)
  ) {
    throw new RangeError('Previous model source end must be finite and non-negative.');
  }
  if (!Number.isFinite(nextSourceStartMs) || nextSourceStartMs < 0) {
    throw new RangeError('Next model source start must be finite and non-negative.');
  }
  if (!Number.isInteger(modelSampleRate) || modelSampleRate <= 0) {
    throw new RangeError('Model sample rate must be a positive integer.');
  }
  if (previousSourceEndMs === null || nextSourceStartMs <= previousSourceEndMs) return 0;
  return Math.max(
    0,
    Math.round(((nextSourceStartMs - previousSourceEndMs) / 1_000) * modelSampleRate),
  );
}
