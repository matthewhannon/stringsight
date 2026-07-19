/*
 * Copyright 2022 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * StringSight modification: pure typed window preparation is separated from
 * the browser-only TensorFlow.js adapter so it remains deterministic and
 * independently unit-tested.
 */

export const BASIC_PITCH_WINDOW_SAMPLES = 43_844;
export const BASIC_PITCH_OVERLAP_SAMPLES = 7_680;
export const BASIC_PITCH_WINDOW_HOP = BASIC_PITCH_WINDOW_SAMPLES - BASIC_PITCH_OVERLAP_SAMPLES;
export const BASIC_PITCH_OUTPUT_FRAMES = 172;
export const BASIC_PITCH_OUTPUT_TRIM_FRAMES = 15;

const PREPENDED_SILENCE_SAMPLES = BASIC_PITCH_OVERLAP_SAMPLES / 2;

export function basicPitchWindowCount(sampleCount: number): number {
  if (!Number.isInteger(sampleCount) || sampleCount < 0) {
    throw new RangeError('Basic Pitch sample count must be a non-negative integer.');
  }
  const paddedLength = PREPENDED_SILENCE_SAMPLES + sampleCount;
  return Math.max(
    1,
    Math.ceil((paddedLength - BASIC_PITCH_WINDOW_SAMPLES) / BASIC_PITCH_WINDOW_HOP) + 1,
  );
}

export function createBasicPitchWindow(samples: Float32Array, windowIndex: number): Float32Array {
  if (!Number.isInteger(windowIndex) || windowIndex < 0) {
    throw new RangeError('Basic Pitch window index must be a non-negative integer.');
  }
  const output = new Float32Array(BASIC_PITCH_WINDOW_SAMPLES);
  const sourceStart = windowIndex * BASIC_PITCH_WINDOW_HOP - PREPENDED_SILENCE_SAMPLES;
  const copyStart = Math.max(0, sourceStart);
  const copyEnd = Math.min(samples.length, sourceStart + BASIC_PITCH_WINDOW_SAMPLES);
  if (copyEnd > copyStart)
    output.set(samples.subarray(copyStart, copyEnd), copyStart - sourceStart);
  return output;
}
