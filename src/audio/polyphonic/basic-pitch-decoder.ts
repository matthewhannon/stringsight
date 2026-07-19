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
 * StringSight modification: this file contains a typed, allocation-bounded
 * adaptation of Basic Pitch's onset/frame note decoder. MIDI export and pitch
 * bend code are intentionally omitted; overlap handling is performed before
 * this decoder receives its matrices.
 */

export const BASIC_PITCH_MIDI_OFFSET = 21;
export const BASIC_PITCH_SAMPLE_RATE = 22_050;
export const BASIC_PITCH_FFT_HOP = 256;
export const BASIC_PITCH_OUTPUT_BINS = 88;

export type BasicPitchDecodedNote = {
  durationFrames: number;
  frameConfidence: number;
  onsetConfidence: number;
  pitchMidi: number;
  startFrame: number;
};

export type BasicPitchDecoderOptions = {
  energyTolerance?: number;
  frameThreshold?: number;
  inferOnsets?: boolean;
  maxMidi?: number;
  melodiaTrick?: boolean;
  minMidi?: number;
  minimumNoteFrames?: number;
  onsetThreshold?: number;
};

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

const isLocalMaximum = (values: readonly number[], index: number): boolean => {
  const value = values[index] ?? 0;
  return value >= (values[index - 1] ?? 0) && value > (values[index + 1] ?? -1);
};

const globalMaximum = (matrix: readonly (readonly number[])[]): number =>
  matrix.reduce(
    (maximum, row) => row.reduce((rowMaximum, value) => Math.max(rowMaximum, value), maximum),
    0,
  );

const inferredOnsetMatrix = (
  frames: readonly (readonly number[])[],
  onsets: readonly (readonly number[])[],
): number[][] => {
  const differences = frames.map((row, frameIndex) =>
    row.map((value, pitchBin) => {
      if (frameIndex < 2) return 0;
      const oneFrameDifference = value - (frames[frameIndex - 1]?.[pitchBin] ?? 0);
      const twoFrameDifference = value - (frames[frameIndex - 2]?.[pitchBin] ?? 0);
      return Math.max(0, Math.min(oneFrameDifference, twoFrameDifference));
    }),
  );
  const differenceMaximum = globalMaximum(differences);
  const onsetMaximum = globalMaximum(onsets);
  if (differenceMaximum <= 0 || onsetMaximum <= 0) return onsets.map((row) => [...row]);
  const scale = onsetMaximum / differenceMaximum;
  return onsets.map((row, frameIndex) =>
    row.map((value, pitchBin) =>
      Math.max(value, (differences[frameIndex]?.[pitchBin] ?? 0) * scale),
    ),
  );
};

const suppressPitchNeighborhood = (
  remainingEnergy: number[][],
  frame: number,
  pitchBin: number,
): void => {
  const row = remainingEnergy[frame];
  if (row === undefined) return;
  row[pitchBin] = 0;
  if (pitchBin > 0) row[pitchBin - 1] = 0;
  if (pitchBin < BASIC_PITCH_OUTPUT_BINS - 1) row[pitchBin + 1] = 0;
};

export function decodeBasicPitchNotes(
  frames: readonly (readonly number[])[],
  onsets: readonly (readonly number[])[],
  options: BasicPitchDecoderOptions = {},
): BasicPitchDecodedNote[] {
  if (frames.length !== onsets.length) {
    throw new Error('Basic Pitch frame and onset matrices must have the same length.');
  }
  if (frames.some((row) => row.length !== BASIC_PITCH_OUTPUT_BINS)) {
    throw new Error(`Basic Pitch frame rows must contain ${String(BASIC_PITCH_OUTPUT_BINS)} bins.`);
  }
  if (onsets.some((row) => row.length !== BASIC_PITCH_OUTPUT_BINS)) {
    throw new Error(`Basic Pitch onset rows must contain ${String(BASIC_PITCH_OUTPUT_BINS)} bins.`);
  }

  const onsetThreshold = options.onsetThreshold ?? 0.5;
  const frameThreshold = options.frameThreshold ?? 0.3;
  const minimumNoteFrames = options.minimumNoteFrames ?? 7;
  const energyTolerance = options.energyTolerance ?? 11;
  const inferOnsets = options.inferOnsets ?? true;
  const melodiaTrick = options.melodiaTrick ?? true;
  const minimumBin = Math.max(0, (options.minMidi ?? 40) - BASIC_PITCH_MIDI_OFFSET);
  const maximumBin = Math.min(
    BASIC_PITCH_OUTPUT_BINS - 1,
    (options.maxMidi ?? 88) - BASIC_PITCH_MIDI_OFFSET,
  );
  const notes: BasicPitchDecodedNote[] = [];
  const remainingEnergy = frames.map((row) =>
    row.map((value, pitchBin) => (pitchBin < minimumBin || pitchBin > maximumBin ? 0 : value)),
  );
  const onsetEvidence = inferOnsets
    ? inferredOnsetMatrix(frames, onsets)
    : onsets.map((row) => [...row]);
  const starts: { onsetConfidence: number; pitchBin: number; startFrame: number }[] = [];
  for (let pitchBin = minimumBin; pitchBin <= maximumBin; pitchBin += 1) {
    const pitchOnsets = onsetEvidence.map((row) => row[pitchBin] ?? 0);
    pitchOnsets.forEach((value, startFrame) => {
      if (value > onsetThreshold && isLocalMaximum(pitchOnsets, startFrame)) {
        starts.push({ onsetConfidence: onsets[startFrame]?.[pitchBin] ?? 0, pitchBin, startFrame });
      }
    });
  }
  starts.sort(
    (left, right) => right.startFrame - left.startFrame || right.pitchBin - left.pitchBin,
  );

  for (const start of starts) {
    if (start.startFrame >= frames.length - 1) continue;
    let endFrame = start.startFrame + 1;
    let quietFrames = 0;
    while (endFrame < frames.length - 1 && quietFrames < energyTolerance) {
      if ((remainingEnergy[endFrame]?.[start.pitchBin] ?? 0) < frameThreshold) quietFrames += 1;
      else quietFrames = 0;
      endFrame += 1;
    }
    endFrame -= quietFrames;
    if (endFrame - start.startFrame <= minimumNoteFrames) continue;
    const frameValues: number[] = [];
    for (let frame = start.startFrame; frame < endFrame; frame += 1) {
      frameValues.push(frames[frame]?.[start.pitchBin] ?? 0);
      suppressPitchNeighborhood(remainingEnergy, frame, start.pitchBin);
    }
    notes.push({
      durationFrames: endFrame - start.startFrame,
      frameConfidence: mean(frameValues),
      onsetConfidence: start.onsetConfidence,
      pitchMidi: start.pitchBin + BASIC_PITCH_MIDI_OFFSET,
      startFrame: start.startFrame,
    });
  }

  while (melodiaTrick && globalMaximum(remainingEnergy) > frameThreshold) {
    let middleFrame = 0;
    let pitchBin = minimumBin;
    let maximum = 0;
    remainingEnergy.forEach((row, frame) => {
      for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
        if ((row[bin] ?? 0) > maximum) {
          maximum = row[bin] ?? 0;
          middleFrame = frame;
          pitchBin = bin;
        }
      }
    });
    suppressPitchNeighborhood(remainingEnergy, middleFrame, pitchBin);

    let endFrame = middleFrame + 1;
    let quietFrames = 0;
    while (endFrame < frames.length - 1 && quietFrames < energyTolerance) {
      if ((remainingEnergy[endFrame]?.[pitchBin] ?? 0) < frameThreshold) quietFrames += 1;
      else quietFrames = 0;
      suppressPitchNeighborhood(remainingEnergy, endFrame, pitchBin);
      endFrame += 1;
    }
    endFrame = Math.max(middleFrame + 1, endFrame - 1 - quietFrames);

    let startFrame = middleFrame - 1;
    quietFrames = 0;
    while (startFrame > 0 && quietFrames < energyTolerance) {
      if ((remainingEnergy[startFrame]?.[pitchBin] ?? 0) < frameThreshold) quietFrames += 1;
      else quietFrames = 0;
      suppressPitchNeighborhood(remainingEnergy, startFrame, pitchBin);
      startFrame -= 1;
    }
    startFrame = Math.min(middleFrame, startFrame + 1 + quietFrames);
    if (endFrame - startFrame <= minimumNoteFrames) continue;
    const frameValues = frames.slice(startFrame, endFrame).map((row) => row[pitchBin] ?? 0);
    notes.push({
      durationFrames: endFrame - startFrame,
      frameConfidence: mean(frameValues),
      onsetConfidence: 0,
      pitchMidi: pitchBin + BASIC_PITCH_MIDI_OFFSET,
      startFrame,
    });
  }

  return notes.sort(
    (left, right) => left.startFrame - right.startFrame || left.pitchMidi - right.pitchMidi,
  );
}

export const basicPitchFrameToMs = (frame: number): number =>
  (frame * BASIC_PITCH_FFT_HOP * 1_000) / BASIC_PITCH_SAMPLE_RATE;
