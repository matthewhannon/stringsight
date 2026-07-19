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
 * StringSight modification: model loading uses pinned TensorFlow.js 4.22.0,
 * an explicit WASM-first backend policy, manual transferable-friendly audio
 * windows, deterministic tensor disposal, and typed diagnostics.
 */

import '@tensorflow/tfjs-backend-cpu';

import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import {
  enableProdMode,
  ready,
  setBackend,
  tensor3d,
  zeros,
  type Tensor,
} from '@tensorflow/tfjs-core';

import { decodeBasicPitchNotes, type BasicPitchDecodedNote } from './basic-pitch-decoder';
import {
  BASIC_PITCH_OUTPUT_FRAMES,
  BASIC_PITCH_OUTPUT_TRIM_FRAMES,
  BASIC_PITCH_WINDOW_SAMPLES,
  basicPitchWindowCount,
  createBasicPitchWindow,
} from './basic-pitch-window';

export const BASIC_PITCH_MODEL_VERSION = 'spotify-v1.0.1';
export const BASIC_PITCH_MODEL_URL = '/models/basic-pitch/model.json';
export const TENSORFLOW_WASM_PATH = '/vendor/tfjs-wasm/';

const MODEL_OUTPUT_NAMES = ['Identity_1', 'Identity_2'] as const;
const OUTPUT_BINS = 88;

export type BasicPitchModelAnalysis = {
  backend: 'cpu' | 'wasm';
  inferenceMs: number;
  loadMs: number;
  notes: BasicPitchDecodedNote[];
  outputFrameCount: number;
  windowCount: number;
};

function tensorRows(tensor: Tensor, expectedBins: number): Promise<number[][]> {
  if (
    tensor.shape.length !== 3 ||
    tensor.shape[1] !== BASIC_PITCH_OUTPUT_FRAMES ||
    tensor.shape[2] !== expectedBins
  ) {
    throw new Error(`Unexpected Basic Pitch output shape: ${tensor.shape.join('x')}.`);
  }
  return tensor.data().then((values) => {
    const rows: number[][] = [];
    for (
      let frame = BASIC_PITCH_OUTPUT_TRIM_FRAMES;
      frame < BASIC_PITCH_OUTPUT_FRAMES - BASIC_PITCH_OUTPUT_TRIM_FRAMES;
      frame += 1
    ) {
      const offset = frame * expectedBins;
      rows.push(Array.from(values.slice(offset, offset + expectedBins)));
    }
    return rows;
  });
}

const outputTensors = (output: Tensor | Tensor[]): Tensor[] =>
  Array.isArray(output) ? output : [output];

export class BasicPitchModelRunner {
  private backend: 'cpu' | 'wasm' = 'wasm';
  private loadMs = 0;
  private modelPromise: Promise<GraphModel> | null = null;

  async initialize(): Promise<void> {
    await this.model();
  }

  async analyze(samples: Float32Array): Promise<BasicPitchModelAnalysis> {
    const model = await this.model();
    const startedAt = performance.now();
    const targetFrameCount = Math.floor((samples.length * 86) / 22_050);
    const frames: number[][] = [];
    const onsets: number[][] = [];
    const windowCount = basicPitchWindowCount(samples.length);

    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const window = createBasicPitchWindow(samples, windowIndex);
      const input = tensor3d(window, [1, BASIC_PITCH_WINDOW_SAMPLES, 1]);
      const tensors = outputTensors(model.execute(input, [...MODEL_OUTPUT_NAMES]));
      try {
        const [frameTensor, onsetTensor] = tensors;
        if (frameTensor === undefined || onsetTensor === undefined || tensors.length !== 2)
          throw new Error('Basic Pitch did not return frame and onset tensors.');
        const frameRows = await tensorRows(frameTensor, OUTPUT_BINS);
        const onsetRows = await tensorRows(onsetTensor, OUTPUT_BINS);
        const remaining = Math.max(0, targetFrameCount - frames.length);
        frames.push(...frameRows.slice(0, remaining));
        onsets.push(...onsetRows.slice(0, remaining));
      } finally {
        input.dispose();
        tensors.forEach((tensor) => tensor.dispose());
      }
      if (frames.length >= targetFrameCount) break;
    }

    return {
      backend: this.backend,
      inferenceMs: Math.max(0, performance.now() - startedAt),
      loadMs: this.loadMs,
      notes: decodeBasicPitchNotes(frames, onsets),
      outputFrameCount: frames.length,
      windowCount,
    };
  }

  private model(): Promise<GraphModel> {
    this.modelPromise ??= this.loadAndWarmModel();
    return this.modelPromise;
  }

  private async loadAndWarmModel(): Promise<GraphModel> {
    const startedAt = performance.now();
    enableProdMode();
    setWasmPaths(TENSORFLOW_WASM_PATH);
    try {
      if (!(await setBackend('wasm')))
        throw new Error('TensorFlow.js WASM backend was unavailable.');
      await ready();
      this.backend = 'wasm';
    } catch {
      if (!(await setBackend('cpu'))) throw new Error('No TensorFlow.js backend is available.');
      await ready();
      this.backend = 'cpu';
    }
    const model = await loadGraphModel(BASIC_PITCH_MODEL_URL);
    const warmup = zeros([1, BASIC_PITCH_WINDOW_SAMPLES, 1]);
    const tensors = outputTensors(model.execute(warmup, [...MODEL_OUTPUT_NAMES]));
    try {
      await Promise.all(tensors.map((tensor) => tensor.data()));
    } finally {
      warmup.dispose();
      tensors.forEach((tensor) => tensor.dispose());
    }
    this.loadMs = Math.max(0, performance.now() - startedAt);
    return model;
  }
}
