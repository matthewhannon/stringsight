/**
 * Deterministically folds every browser-provided input channel into mono. Averaging prevents
 * clipping when channels contain correlated material and, unlike per-block channel selection,
 * cannot splice different channels together as their relative levels change.
 */
export function averageChannelSample(
  channels: readonly Float32Array[],
  frameIndex: number,
): number {
  if (channels.length === 0) return 0;
  let sum = 0;
  let contributingChannels = 0;
  for (const channel of channels) {
    if (frameIndex >= channel.length) continue;
    sum += channel[frameIndex] ?? 0;
    contributingChannels += 1;
  }
  return contributingChannels === 0 ? 0 : sum / contributingChannels;
}
