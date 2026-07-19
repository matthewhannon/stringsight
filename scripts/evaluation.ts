import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { z } from 'zod';

import { MONOPHONIC_ANALYZER_VERSION } from '../src/audio/analysis/contracts';
import { StreamingMonophonicPipeline } from '../src/audio/analysis/pipeline';
import { decodePcmWav } from '../src/audio/capture/wav';
import {
  POLYPHONIC_ANALYZER_VERSION,
  StreamingProvisionalChordAnalyzer,
} from '../src/audio/polyphonic/streaming';
import type { ChordAnalysisProfile } from '../src/audio/polyphonic/contracts';
import type { ChordEvent, NoteEvent } from '../src/shared/contracts/audio';
import {
  EvaluationCorpusSchema,
  EvaluationFixtureSchema,
  EvaluationPredictionsSchema,
  PrivateRecordingCorpusManifestSchema,
  evaluateCorpus,
  type EvaluationCorpus,
  type EvaluationFixture,
  type EvaluationPredictions,
} from '../src/evaluation/index';
import { scoreChords, scoreOnsets, scoreRankedChords } from '../src/evaluation/metrics';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const fixtureRoot = path.join(repositoryRoot, 'tests', 'fixtures');
const manifestPath = path.join(fixtureRoot, 'corpus.v1.json');
const selfTestPredictionPath = path.join(fixtureRoot, 'predictions', 'harness-self-test.v1.json');
const selfTestReportPath = path.join(fixtureRoot, 'reports', 'harness-self-test.v1.json');
const monophonicPredictionPath = path.join(
  fixtureRoot,
  'predictions',
  'monophonic-baseline.v1.json',
);
const monophonicReportPath = path.join(fixtureRoot, 'reports', 'monophonic-baseline.v1.json');
const monophonicQualityPath = path.join(fixtureRoot, 'reports', 'monophonic-quality.v1.json');
const monophonicPerformancePath = path.join(
  fixtureRoot,
  'reports',
  'monophonic-performance.local.json',
);

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function readCorpus(): Promise<EvaluationCorpus> {
  return EvaluationCorpusSchema.parse(await readJson(manifestPath));
}

async function formatJson(value: unknown): Promise<string> {
  const config = (await resolveConfig(manifestPath)) ?? {};
  const options = { ...config, parser: 'json' as const };
  const firstPass = await format(JSON.stringify(value), options);
  return format(firstPass, options);
}

const PrivateChordIntervalSchema = z
  .object({
    endMs: z.number().positive(),
    index: z.number().int().positive(),
    startMs: z.number().nonnegative(),
    symbol: z.string().min(1).max(32),
  })
  .refine(({ endMs, startMs }) => endMs > startMs, 'Chord intervals must have positive duration.');

const PrivateChordBoundaryFileSchema = z
  .object({
    intervals: z.array(PrivateChordIntervalSchema).min(1),
    labelStatus: z.string().min(1),
    recordingId: z.string().min(1).max(160),
    schemaVersion: z.literal(1),
  })
  .superRefine(({ intervals }, context) => {
    intervals.forEach((interval, index) => {
      if (interval.index !== index + 1) {
        context.addIssue({
          code: 'custom',
          message: 'Chord interval indexes must be sequential from 1.',
          path: ['intervals', index, 'index'],
        });
      }
      if (index > 0 && interval.startMs < (intervals[index - 1]?.endMs ?? 0)) {
        context.addIssue({
          code: 'custom',
          message: 'Chord intervals may not overlap.',
          path: ['intervals', index, 'startMs'],
        });
      }
    });
  });

const CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const CHORD_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  '': [0, 4, 7],
  '7': [0, 4, 7, 10],
  m: [0, 3, 7],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
};

function pitchClassesForPrivateChord(symbol: string): number[] {
  const root = [...CHORD_ROOTS]
    .sort((left, right) => right.length - left.length)
    .find((candidate) => symbol.startsWith(candidate));
  if (root === undefined) throw new Error(`Unsupported private chord symbol: ${symbol}.`);
  const suffix = symbol.slice(root.length);
  const intervals = CHORD_INTERVALS[suffix];
  if (intervals === undefined) throw new Error(`Unsupported private chord symbol: ${symbol}.`);
  const rootIndex = CHORD_ROOTS.indexOf(root);
  return intervals.map((interval) => (rootIndex + interval) % CHORD_ROOTS.length);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataLength = samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataLength, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clamped * 32_767), true);
  });
  return bytes;
}

function synthesizeAudio(fixture: EvaluationFixture): Uint8Array {
  if (fixture.source.kind !== 'procedural') {
    throw new Error(`Recorded fixture '${fixture.id}' cannot be procedurally generated.`);
  }
  const sampleRate = fixture.conditions.sampleRate;
  if (sampleRate === undefined) throw new Error(`${fixture.id} has no audio sample rate.`);
  const sampleCount = Math.ceil((fixture.durationMs / 1_000) * sampleRate);
  const samples = new Float32Array(sampleCount);
  const random = seededRandom(fixture.source.seed);
  const noiseAmplitude = { fan: 0.018, quiet: 0.002, room: 0.01 }[fixture.conditions.noise];
  const profileGain = {
    direct: 0.95,
    'laptop-microphone': 0.65,
    'near-microphone': 0.82,
    'room-microphone': 0.7,
  }[fixture.conditions.inputProfile];

  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
    const timeSeconds = sampleIndex / sampleRate;
    const timeMs = timeSeconds * 1_000;
    let value = (random() * 2 - 1) * noiseAmplitude;
    for (const note of fixture.groundTruth.notes) {
      if (timeMs < note.startMs || timeMs >= note.endMs) continue;
      const noteTime = timeSeconds - note.startMs / 1_000;
      const attack = Math.min(1, noteTime / 0.008);
      const decay = Math.exp(
        -noteTime * (fixture.conditions.guitarType === 'nylon-acoustic' ? 3.3 : 2.4),
      );
      const frequency = 440 * 2 ** ((note.midi - 69) / 12);
      const phaseOffset = (note.midi * 0.37 + fixture.source.seed * 0.001) % (Math.PI * 2);
      let harmonicSignal = 0;
      for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
        const brightness = fixture.conditions.guitarType === 'nylon-acoustic' ? 1.35 : 1;
        const amplitude = 1 / harmonic ** brightness;
        harmonicSignal +=
          amplitude *
          Math.sin(2 * Math.PI * frequency * harmonic * noteTime + phaseOffset * harmonic);
      }
      value += harmonicSignal * attack * decay * note.velocity * 0.16 * profileGain;
    }
    samples[sampleIndex] = value;
  }

  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const normalization = peak > 0.96 ? 0.96 / peak : 1;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (samples[index] ?? 0) * normalization;
  }
  return encodeWav(samples, sampleRate);
}

function renderFrame(fixture: EvaluationFixture, frameIndex: number): string {
  const width = fixture.conditions.imageWidth ?? 640;
  const height = fixture.conditions.imageHeight ?? 360;
  const frameCount = fixture.media.videoFrames?.length ?? 1;
  const timeMs = (fixture.durationMs * frameIndex) / Math.max(1, frameCount - 1);
  const nearestRegion = [...fixture.groundTruth.fretRegions].sort(
    (left, right) => Math.abs(left.atMs - timeMs) - Math.abs(right.atMs - timeMs),
  )[0];
  const perspectiveInset = { moderate: 28, straight: 0, strong: 55 }[
    fixture.conditions.perspective ?? 'straight'
  ];
  const background = fixture.conditions.lighting === 'dim' ? '#111827' : '#263447';
  const neck = fixture.conditions.guitarType === 'clean-electric' ? '#8d5b32' : '#a86e3e';
  const fretLines = Array.from({ length: 13 }, (_, fret) => {
    const ratio = fret / 12;
    const x = 70 + ratio * (width - 140);
    const top = 88 + (perspectiveInset * ratio) / 3;
    const bottom = height - 88 - (perspectiveInset * ratio) / 3;
    return `<line x1="${x.toFixed(1)}" y1="${top.toFixed(1)}" x2="${x.toFixed(1)}" y2="${bottom.toFixed(1)}" stroke="#d5dde7" stroke-width="${fret === 0 ? 6 : 2}" />`;
  }).join('');
  const strings = Array.from({ length: 6 }, (_, stringIndex) => {
    const y = 100 + (stringIndex * (height - 200)) / 5;
    return `<line x1="70" y1="${y.toFixed(1)}" x2="${width - 70}" y2="${(y + perspectiveInset * (stringIndex / 5 - 0.5)).toFixed(1)}" stroke="#f5e9c9" stroke-width="${1 + stringIndex * 0.35}" />`;
  }).join('');
  const region = nearestRegion ?? { startFret: 0, endFret: 2 };
  const handCenter = 70 + (((region.startFret + region.endFret) / 2 + 0.5) / 12) * (width - 140);
  const handOpacity = fixture.conditions.occlusion === 'partial' ? 0.76 : 0.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${background}" />
  <path d="M70 88 L${width - 70} ${88 + perspectiveInset / 3} L${width - 70} ${height - 88 - perspectiveInset / 3} L70 ${height - 88} Z" fill="${neck}" stroke="#362619" stroke-width="5" />
  ${fretLines}
  ${strings}
  <circle cx="${70 + (5.5 / 12) * (width - 140)}" cy="${height / 2}" r="8" fill="#eee8d5" />
  <circle cx="${70 + (12 / 12) * (width - 140) - 18}" cy="${height / 2 - 18}" r="6" fill="#eee8d5" />
  <circle cx="${70 + (12 / 12) * (width - 140) - 18}" cy="${height / 2 + 18}" r="6" fill="#eee8d5" />
  <ellipse cx="${handCenter.toFixed(1)}" cy="${height / 2}" rx="38" ry="72" fill="#d99772" opacity="${handOpacity}" transform="rotate(-12 ${handCenter.toFixed(1)} ${height / 2})" />
  <text x="18" y="28" fill="#ffffff" font-family="monospace" font-size="14">${fixture.id} · ${(timeMs / 1_000).toFixed(2)}s</text>
</svg>
`;
}

function createSelfTestPredictions(corpus: EvaluationCorpus): EvaluationPredictions {
  return EvaluationPredictionsSchema.parse({
    corpusId: corpus.corpusId,
    fixtures: corpus.fixtures.map((fixture, fixtureIndex) => ({
      audioFretRegions: fixture.groundTruth.fretRegions.map((region) => ({
        ...region,
        endFret: Math.min(36, region.endFret + 3),
        startFret: Math.min(36, region.startFret + 3),
      })),
      audioNotes: fixture.groundTruth.notes
        .filter((_, noteIndex) => (fixtureIndex + noteIndex) % 3 !== 2)
        .map((note) => ({
          confidence: 0.72,
          endMs: note.endMs,
          midi: note.midi,
          startMs: note.startMs + 22,
        })),
      chords: fixture.groundTruth.chords.map((chord) => ({
        confidence: 0.75,
        endMs: chord.endMs,
        startMs: chord.startMs + 18,
        symbol: fixture.split === 'held-out' ? `${chord.symbol}7` : chord.symbol,
      })),
      fixtureId: fixture.id,
      fusedFretRegions: fixture.groundTruth.fretRegions.map((region) => ({
        ...region,
        endFret: Math.min(36, region.endFret + 1),
        startFret: Math.min(36, region.startFret + 1),
      })),
      fusedNotes: fixture.groundTruth.notes.map((note) => ({
        confidence: 0.9,
        endMs: note.endMs,
        midi: note.midi,
        startMs: note.startMs + 8,
      })),
      latencySamples: [
        { latencyMs: 34 + fixtureIndex * 2, path: 'live-audio' },
        { latencyMs: 180 + fixtureIndex * 5, path: 'finalized-audio' },
        { latencyMs: 48 + fixtureIndex * 3, path: 'vision' },
        { latencyMs: 22 + fixtureIndex * 2, path: 'fusion' },
      ],
      onsetsMs: fixture.groundTruth.onsetsMs.map((onset) => onset + 12),
    })),
    generatedAt: '2026-07-17T00:00:00.000Z',
    schemaVersion: 1,
    system: { name: 'harness-self-test', version: '1.0.0' },
  });
}

type MonophonicFixtureQuality = {
  detectedEvents: number;
  falseOnsets: number;
  fixtureId: string;
  matchedOnsets: number;
  noteCount: number;
  onsetErrorsMs: number[];
  top1Matches: number;
  top3Matches: number;
};

const percentile = (values: readonly number[], quantile: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
};

function isMonophonicFixture(fixture: EvaluationFixture): boolean {
  const notes = [...fixture.groundTruth.notes].sort((left, right) => left.startMs - right.startMs);
  return notes.every(
    (note, index) => index === 0 || (notes[index - 1]?.endMs ?? 0) <= note.startMs,
  );
}

function scoreMonophonicFixture(
  fixture: EvaluationFixture,
  events: readonly NoteEvent[],
  onsetsMs: readonly number[],
): MonophonicFixtureQuality {
  const availableEvents = new Set(events.map((_, index) => index));
  let top1Matches = 0;
  let top3Matches = 0;
  for (const truth of fixture.groundTruth.notes) {
    const match = [...availableEvents]
      .map((index) => ({
        distance: Math.abs(
          (events[index]?.time.startMs ?? Number.POSITIVE_INFINITY) - truth.startMs,
        ),
        index,
      }))
      .filter(({ distance }) => distance <= 100)
      .sort((left, right) => left.distance - right.distance)[0];
    if (match === undefined) continue;
    availableEvents.delete(match.index);
    const candidates = events[match.index]?.candidates ?? [];
    if (candidates[0]?.midi === truth.midi) top1Matches += 1;
    if (candidates.slice(0, 3).some((candidate) => candidate.midi === truth.midi)) top3Matches += 1;
  }

  const availableOnsets = new Set(onsetsMs.map((_, index) => index));
  const onsetErrorsMs: number[] = [];
  for (const truthOnset of fixture.groundTruth.onsetsMs) {
    const match = [...availableOnsets]
      .map((index) => ({
        distance: Math.abs((onsetsMs[index] ?? Number.POSITIVE_INFINITY) - truthOnset),
        index,
      }))
      .filter(({ distance }) => distance <= 100)
      .sort((left, right) => left.distance - right.distance)[0];
    if (match === undefined) continue;
    availableOnsets.delete(match.index);
    onsetErrorsMs.push(match.distance);
  }

  return {
    detectedEvents: events.length,
    falseOnsets: availableOnsets.size,
    fixtureId: fixture.id,
    matchedOnsets: onsetErrorsMs.length,
    noteCount: fixture.groundTruth.notes.length,
    onsetErrorsMs,
    top1Matches,
    top3Matches,
  };
}

function runMonophonicRecording(
  data: Float32Array,
  sampleRate: number,
  runId: string,
): { events: NoteEvent[]; onsetsMs: number[] } {
  const analyzer = new StreamingMonophonicPipeline(sampleRate, runId);
  const eventsById = new Map<string, NoteEvent>();
  const onsetsById = new Map<
    string,
    ReturnType<StreamingMonophonicPipeline['push']>['onsets'][number]
  >();
  const chunkFrames = 2_048;
  for (let startFrame = 0; startFrame < data.length; startFrame += chunkFrames) {
    const result = analyzer.push(
      data.slice(startFrame, startFrame + chunkFrames),
      (startFrame / sampleRate) * 1_000,
    );
    for (const event of result.events) eventsById.set(event.id, event);
    for (const onset of result.onsets) onsetsById.set(onset.id, onset);
  }
  const durationMs = (data.length / sampleRate) * 1_000;
  for (const event of analyzer.finish(durationMs).events) eventsById.set(event.id, event);
  return {
    events: [...eventsById.values()]
      .filter((event) => event.lifecycle === 'finalized')
      .sort((left, right) => left.time.startMs - right.time.startMs),
    onsetsMs: [...onsetsById.values()]
      .map((onset) => onset.atMs)
      .sort((left, right) => left - right),
  };
}

async function createMonophonicBaselinePredictions(corpus: EvaluationCorpus): Promise<{
  predictions: EvaluationPredictions;
  qualityReport: unknown;
}> {
  const fixtures = [];
  const qualityFixtures: MonophonicFixtureQuality[] = [];
  const allLiveLatencies: number[] = [];
  const allFinalizedLatencies: number[] = [];
  for (const fixture of corpus.fixtures) {
    if (fixture.media.audio === undefined) continue;
    const decoded = decodePcmWav(await readFile(path.join(fixtureRoot, fixture.media.audio)));
    const analyzer = new StreamingMonophonicPipeline(decoded.sampleRate, fixture.id);
    const eventsById = new Map<string, NoteEvent>();
    const onsetsById = new Map<
      string,
      ReturnType<StreamingMonophonicPipeline['push']>['onsets'][number]
    >();
    const latencySamples: { latencyMs: number; path: 'finalized-audio' | 'live-audio' }[] = [];
    const provisionalIds = new Set<string>();
    const chunkFrames = 2_048;
    for (let startFrame = 0; startFrame < decoded.data.length; startFrame += chunkFrames) {
      const data = decoded.data.slice(startFrame, startFrame + chunkFrames);
      const result = analyzer.push(data, (startFrame / decoded.sampleRate) * 1_000);
      for (const event of result.events) {
        eventsById.set(event.id, event);
        if (event.lifecycle === 'provisional' && !provisionalIds.has(event.id)) {
          provisionalIds.add(event.id);
          latencySamples.push({
            latencyMs: Math.max(0, event.provenance.generatedAtMs - event.time.startMs),
            path: 'live-audio',
          });
        }
        if (event.lifecycle === 'finalized') {
          latencySamples.push({
            latencyMs: Math.max(
              0,
              event.provenance.generatedAtMs - (event.time.endMs ?? event.time.startMs),
            ),
            path: 'finalized-audio',
          });
        }
      }
      for (const onset of result.onsets) onsetsById.set(onset.id, onset);
    }
    const finished = analyzer.finish(fixture.durationMs);
    for (const event of finished.events) {
      eventsById.set(event.id, event);
      if (event.lifecycle === 'finalized') {
        latencySamples.push({
          latencyMs: Math.max(
            0,
            event.provenance.generatedAtMs - (event.time.endMs ?? event.time.startMs),
          ),
          path: 'finalized-audio',
        });
      }
    }
    const events = [...eventsById.values()]
      .filter((event) => event.lifecycle === 'finalized')
      .sort((left, right) => left.time.startMs - right.time.startMs);
    const onsetsMs = [...onsetsById.values()]
      .map((onset) => onset.atMs)
      .sort((left, right) => left - right);
    if (isMonophonicFixture(fixture)) {
      qualityFixtures.push(scoreMonophonicFixture(fixture, events, onsetsMs));
      allLiveLatencies.push(
        ...latencySamples
          .filter((sample) => sample.path === 'live-audio')
          .map((sample) => sample.latencyMs),
      );
      allFinalizedLatencies.push(
        ...latencySamples
          .filter((sample) => sample.path === 'finalized-audio')
          .map((sample) => sample.latencyMs),
      );
    }
    fixtures.push({
      audioFretRegions: [],
      audioNotes: events.map((event) => ({
        confidence: event.candidates[0]?.confidence ?? 0,
        endMs: event.time.endMs ?? fixture.durationMs,
        midi: event.candidates[0]?.midi ?? 0,
        startMs: event.time.startMs,
      })),
      chords: [],
      fixtureId: fixture.id,
      fusedFretRegions: [],
      fusedNotes: [],
      latencySamples,
      onsetsMs,
    });
  }
  const predictions = EvaluationPredictionsSchema.parse({
    corpusId: corpus.corpusId,
    fixtures,
    generatedAt: '2026-07-17T00:00:00.000Z',
    schemaVersion: 1,
    system: { name: 'yin-energy-monophonic', version: MONOPHONIC_ANALYZER_VERSION },
  });
  const noteCount = qualityFixtures.reduce((total, fixture) => total + fixture.noteCount, 0);
  const top1Matches = qualityFixtures.reduce((total, fixture) => total + fixture.top1Matches, 0);
  const top3Matches = qualityFixtures.reduce((total, fixture) => total + fixture.top3Matches, 0);
  const truthOnsets = qualityFixtures.reduce((total, fixture) => total + fixture.noteCount, 0);
  const matchedOnsets = qualityFixtures.reduce(
    (total, fixture) => total + fixture.matchedOnsets,
    0,
  );
  const falseOnsets = qualityFixtures.reduce((total, fixture) => total + fixture.falseOnsets, 0);
  const onsetPrecision = matchedOnsets / Math.max(1, matchedOnsets + falseOnsets);
  const onsetRecall = matchedOnsets / Math.max(1, truthOnsets);
  const onsetErrorsMs = qualityFixtures.flatMap((fixture) => fixture.onsetErrorsMs);
  const qualityReport = {
    analyzer: { name: 'yin-energy-monophonic', version: MONOPHONIC_ANALYZER_VERSION },
    corpusId: corpus.corpusId,
    generatedAt: '2026-07-17T00:00:00.000Z',
    metrics: {
      finalizedLatencyP95Ms: percentile(allFinalizedLatencies, 0.95),
      liveLatencyP95Ms: percentile(allLiveLatencies, 0.95),
      medianOnsetErrorMs: percentile(onsetErrorsMs, 0.5),
      noteCount,
      onsetF1:
        onsetPrecision + onsetRecall === 0
          ? 0
          : (2 * onsetPrecision * onsetRecall) / (onsetPrecision + onsetRecall),
      onsetPrecision,
      onsetRecall,
      p95OnsetErrorMs: percentile(onsetErrorsMs, 0.95),
      top1Accuracy: top1Matches / Math.max(1, noteCount),
      top3Accuracy: top3Matches / Math.max(1, noteCount),
    },
    perFixture: qualityFixtures,
    schemaVersion: 1,
    scope: {
      excludedPolyphonicFixtures: corpus.fixtures
        .filter((fixture) => !isMonophonicFixture(fixture))
        .map((fixture) => fixture.id),
      includedFixtures: qualityFixtures.map((fixture) => fixture.fixtureId),
    },
  };
  return { predictions, qualityReport };
}

const rounded = (value: number): number => Math.round(value * 1_000) / 1_000;
const measuredPercentile = (values: readonly number[], quantile: number): number =>
  percentile(values, quantile) ?? 0;

function resampleBenchmarkInput(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) return samples;
  const output = new Float32Array(
    Math.max(1, Math.round((samples.length * targetSampleRate) / sourceSampleRate)),
  );
  for (let index = 0; index < output.length; index += 1) {
    const sourcePosition = (index * sourceSampleRate) / targetSampleRate;
    const lowerIndex = Math.min(samples.length - 1, Math.floor(sourcePosition));
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
    const fraction = sourcePosition - lowerIndex;
    const lower = samples[lowerIndex] ?? 0;
    const upper = samples[upperIndex] ?? lower;
    output[index] = lower + (upper - lower) * fraction;
  }
  return output;
}

async function benchmarkMonophonic(iterations: number): Promise<void> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000) {
    throw new RangeError('Benchmark iterations must be an integer from 1 through 1000.');
  }
  const corpus = await readCorpus();
  const fixtures = corpus.fixtures.filter(
    (fixture) => fixture.media.audio !== undefined && isMonophonicFixture(fixture),
  );
  const perFixture = [];
  const allProcessingTimesMs: number[] = [];
  let totalAudioDurationMs = 0;
  const benchmarkInputSampleRate = 48_000;

  for (const fixture of fixtures) {
    const audioPath = fixture.media.audio;
    if (audioPath === undefined) continue;
    const decoded = decodePcmWav(await readFile(path.join(fixtureRoot, audioPath)));
    const benchmarkSamples = resampleBenchmarkInput(
      decoded.data,
      decoded.sampleRate,
      benchmarkInputSampleRate,
    );
    const processingTimesMs: number[] = [];
    for (let iteration = -2; iteration < iterations; iteration += 1) {
      const analyzer = new StreamingMonophonicPipeline(
        benchmarkInputSampleRate,
        `${fixture.id}-${String(iteration)}`,
      );
      const startedAt = performance.now();
      const chunkFrames = 2_048;
      for (let startFrame = 0; startFrame < benchmarkSamples.length; startFrame += chunkFrames) {
        analyzer.push(
          benchmarkSamples.subarray(startFrame, startFrame + chunkFrames),
          (startFrame / benchmarkInputSampleRate) * 1_000,
        );
      }
      analyzer.finish(fixture.durationMs);
      const processingTimeMs = performance.now() - startedAt;
      if (iteration < 0) continue;
      processingTimesMs.push(processingTimeMs);
      allProcessingTimesMs.push(processingTimeMs);
      totalAudioDurationMs += fixture.durationMs;
    }
    perFixture.push({
      audioDurationMs: fixture.durationMs,
      fixtureId: fixture.id,
      inputSampleRate: benchmarkInputSampleRate,
      sourceFixtureSampleRate: decoded.sampleRate,
      medianProcessingMs: rounded(measuredPercentile(processingTimesMs, 0.5)),
      p95ProcessingMs: rounded(measuredPercentile(processingTimesMs, 0.95)),
    });
  }

  const totalProcessingMs = allProcessingTimesMs.reduce((sum, value) => sum + value, 0);
  const report = {
    analyzer: { name: 'yin-energy-monophonic', version: MONOPHONIC_ANALYZER_VERSION },
    generatedAt: new Date().toISOString(),
    iterations,
    metrics: {
      audioSecondsProcessed: rounded(totalAudioDurationMs / 1_000),
      medianFixtureProcessingMs: rounded(measuredPercentile(allProcessingTimesMs, 0.5)),
      p95FixtureProcessingMs: rounded(measuredPercentile(allProcessingTimesMs, 0.95)),
      processingMsPerAudioSecond: rounded(totalProcessingMs / (totalAudioDurationMs / 1_000)),
      realTimeFactor: rounded(totalProcessingMs / totalAudioDurationMs),
      speedMultiple: rounded(totalAudioDurationMs / Math.max(Number.EPSILON, totalProcessingMs)),
    },
    perFixture,
    pipeline: {
      analysisSampleRate: 16_000,
      antiAliasFilter: 'fourth-order-butterworth-low-pass',
      inputSampleRates: [...new Set(perFixture.map((fixture) => fixture.inputSampleRate))].sort(
        (left, right) => left - right,
      ),
    },
    schemaVersion: 1,
  };
  await mkdir(path.dirname(monophonicPerformancePath), { recursive: true });
  await writeFile(monophonicPerformancePath, await formatJson(report), 'utf8');
  process.stdout.write(
    `Processed ${(totalAudioDurationMs / 1_000).toFixed(1)} seconds of audio at ${report.metrics.speedMultiple.toFixed(1)}x real time.\n`,
  );
  process.stdout.write(
    `Wrote local performance report to ${path.relative(repositoryRoot, monophonicPerformancePath)}.\n`,
  );
}

async function generateCorpus(): Promise<void> {
  const corpus = await readCorpus();
  for (const fixture of corpus.fixtures) {
    if (fixture.source.kind === 'recorded') continue;
    if (fixture.media.audio !== undefined) {
      const audioPath = path.join(fixtureRoot, fixture.media.audio);
      await mkdir(path.dirname(audioPath), { recursive: true });
      await writeFile(audioPath, synthesizeAudio(fixture));
    }
    if (fixture.media.videoFrames !== undefined) {
      for (const [frameIndex, relativePath] of fixture.media.videoFrames.entries()) {
        const framePath = path.join(fixtureRoot, relativePath);
        await mkdir(path.dirname(framePath), { recursive: true });
        await writeFile(framePath, renderFrame(fixture, frameIndex), 'utf8');
      }
    }
  }
  const predictions = createSelfTestPredictions(corpus);
  await mkdir(path.dirname(selfTestPredictionPath), { recursive: true });
  await writeFile(selfTestPredictionPath, await formatJson(predictions), 'utf8');
}

async function validateCorpus(): Promise<void> {
  const corpus = await readCorpus();
  const assetErrors: string[] = [];
  for (const fixture of corpus.fixtures) {
    const paths = [fixture.media.audio, ...(fixture.media.videoFrames ?? [])].filter(
      (value): value is string => value !== undefined,
    );
    for (const relativePath of paths) {
      try {
        const bytes = await readFile(path.join(fixtureRoot, relativePath));
        if (relativePath === fixture.media.audio) {
          const sampleRate = fixture.conditions.sampleRate;
          const expectedLength =
            sampleRate === undefined
              ? -1
              : 44 + Math.ceil((fixture.durationMs / 1_000) * sampleRate) * 2;
          if (
            bytes.subarray(0, 4).toString('ascii') !== 'RIFF' ||
            bytes.subarray(8, 12).toString('ascii') !== 'WAVE' ||
            bytes.readUInt32LE(24) !== sampleRate ||
            bytes.length !== expectedLength
          ) {
            assetErrors.push(`${relativePath}: invalid WAV header, sample rate, or duration`);
          }
        } else {
          const svg = bytes.toString('utf8');
          if (!svg.startsWith('<svg') || !svg.includes(fixture.id)) {
            assetErrors.push(`${relativePath}: invalid or mismatched SVG frame`);
          }
        }
      } catch {
        assetErrors.push(`${relativePath}: missing or unreadable`);
      }
    }
  }
  if (assetErrors.length > 0) {
    throw new Error(
      `Invalid corpus assets:\n${assetErrors.map((value) => `- ${value}`).join('\n')}`,
    );
  }
  const development = corpus.fixtures.filter((fixture) => fixture.split === 'development').length;
  const heldOut = corpus.fixtures.length - development;
  process.stdout.write(
    `Validated ${corpus.fixtures.length} fixtures (${development} development, ${heldOut} held-out).\n`,
  );
}

async function evaluate(
  predictionPath: string,
  outputPath: string | undefined,
  generatedAt?: string,
): Promise<ReturnType<typeof evaluateCorpus>> {
  const corpus = await readCorpus();
  const predictions = EvaluationPredictionsSchema.parse(await readJson(predictionPath));
  const report = evaluateCorpus(
    corpus,
    predictions,
    generatedAt === undefined ? {} : { generatedAt },
  );
  if (outputPath === undefined) {
    process.stdout.write(await formatJson(report));
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await formatJson(report), 'utf8');
    process.stdout.write(
      `Wrote evaluation report to ${path.relative(repositoryRoot, outputPath)}.\n`,
    );
  }
  return report;
}

const resolvePrivateCorpusPath = (corpusRoot: string, relativePath: string): string => {
  const resolved = path.resolve(corpusRoot, relativePath);
  const relative = path.relative(corpusRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Private corpus path escapes its manifest directory: ${relativePath}`);
  }
  return resolved;
};

async function evaluatePrivateMonophonicCorpus(privateManifestPath: string): Promise<void> {
  const manifest = PrivateRecordingCorpusManifestSchema.parse(await readJson(privateManifestPath));
  const corpusRoot = path.dirname(privateManifestPath);
  const perRecording = [];
  for (const entry of manifest.recordings) {
    const fixture = EvaluationFixtureSchema.parse(
      await readJson(resolvePrivateCorpusPath(corpusRoot, entry.fixturePath)),
    );
    if (fixture.id !== entry.id) {
      throw new Error(`Manifest id '${entry.id}' does not match fixture id '${fixture.id}'.`);
    }
    if (
      fixture.source.kind !== 'recorded' ||
      fixture.source.license !== 'private-evaluation-only'
    ) {
      throw new Error(`Private corpus fixture '${entry.id}' must be private-evaluation-only.`);
    }
    if (!isMonophonicFixture(fixture)) {
      throw new Error(`Private monophonic fixture '${entry.id}' contains overlapping notes.`);
    }
    const decoded = decodePcmWav(
      await readFile(resolvePrivateCorpusPath(corpusRoot, entry.audioPath)),
    );
    const audioDurationMs = (decoded.data.length / decoded.sampleRate) * 1_000;
    if (Math.abs(audioDurationMs - fixture.durationMs) > Math.max(20, 1_000 / decoded.sampleRate)) {
      throw new Error(`Fixture '${entry.id}' duration differs from its WAV by more than 20 ms.`);
    }
    const startedAt = performance.now();
    const analysis = runMonophonicRecording(
      decoded.data,
      decoded.sampleRate,
      `private-${entry.id}`,
    );
    perRecording.push({
      ...scoreMonophonicFixture(fixture, analysis.events, analysis.onsetsMs),
      audioDurationMs,
      processingTimeMs: performance.now() - startedAt,
      sampleRate: decoded.sampleRate,
    });
  }

  const noteCount = perRecording.reduce((total, recording) => total + recording.noteCount, 0);
  const top1Matches = perRecording.reduce((total, recording) => total + recording.top1Matches, 0);
  const top3Matches = perRecording.reduce((total, recording) => total + recording.top3Matches, 0);
  const truthOnsets = perRecording.reduce((total, recording) => total + recording.noteCount, 0);
  const matchedOnsets = perRecording.reduce(
    (total, recording) => total + recording.matchedOnsets,
    0,
  );
  const falseOnsets = perRecording.reduce((total, recording) => total + recording.falseOnsets, 0);
  const onsetPrecision = matchedOnsets / Math.max(1, matchedOnsets + falseOnsets);
  const onsetRecall = matchedOnsets / Math.max(1, truthOnsets);
  const onsetErrorsMs = perRecording.flatMap((recording) => recording.onsetErrorsMs);
  const report = {
    analyzer: { name: 'yin-energy-monophonic', version: MONOPHONIC_ANALYZER_VERSION },
    corpusId: manifest.corpusId,
    generatedAt: new Date().toISOString(),
    metrics: {
      medianOnsetErrorMs: percentile(onsetErrorsMs, 0.5),
      noteCount,
      onsetF1:
        onsetPrecision + onsetRecall === 0
          ? 0
          : (2 * onsetPrecision * onsetRecall) / (onsetPrecision + onsetRecall),
      onsetPrecision,
      onsetRecall,
      p95OnsetErrorMs: percentile(onsetErrorsMs, 0.95),
      top1Accuracy: top1Matches / Math.max(1, noteCount),
      top3Accuracy: top3Matches / Math.max(1, noteCount),
    },
    perRecording,
    schemaVersion: 1,
  };
  const reportPath = path.join(corpusRoot, 'reports', 'monophonic-baseline.local.json');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, await formatJson(report), 'utf8');
  process.stdout.write(
    `Evaluated ${String(perRecording.length)} private recordings and wrote ${path.relative(repositoryRoot, reportPath)}.\n`,
  );
}

const PRIVATE_CHORD_MINIMUM_OVERLAP_MS = 200;
const PRIVATE_CHORD_ONSET_TOLERANCE_MS = 600;

const chordIntervalOverlapMs = (
  left: { endMs: number; startMs: number },
  right: { endMs: number; startMs: number },
): number => Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs));

function runPrivatePolyphonicRecording(
  samples: Float32Array,
  sampleRate: number,
  recordingId: string,
  profile: ChordAnalysisProfile,
): { events: ChordEvent[]; processingTimeMs: number } {
  const analyzer = new StreamingProvisionalChordAnalyzer(
    sampleRate,
    `private-${recordingId}-${profile}`,
    { profile },
  );
  const events: ChordEvent[] = [];
  const chunkFrames = 2_048;
  const startedAt = performance.now();
  for (let startFrame = 0; startFrame < samples.length; startFrame += chunkFrames) {
    const result = analyzer.push(
      samples.subarray(startFrame, Math.min(samples.length, startFrame + chunkFrames)),
      (startFrame / sampleRate) * 1_000,
    );
    events.push(...result.events.filter((event) => event.lifecycle === 'finalized'));
  }
  events.push(
    ...analyzer
      .finish((samples.length / sampleRate) * 1_000)
      .events.filter((event) => event.lifecycle === 'finalized'),
  );
  return {
    events: events.sort((left, right) => left.time.startMs - right.time.startMs),
    processingTimeMs: performance.now() - startedAt,
  };
}

async function evaluatePrivatePolyphonicRecording(
  audioPath: string,
  labelsPath: string,
  outputPath?: string,
): Promise<void> {
  const labels = PrivateChordBoundaryFileSchema.parse(await readJson(labelsPath));
  const decoded = decodePcmWav(await readFile(audioPath));
  const durationMs = (decoded.data.length / decoded.sampleRate) * 1_000;
  const truth = labels.intervals.map((interval) => {
    if (interval.endMs > durationMs) {
      throw new Error(
        `Chord ${String(interval.index)} ends after the recording duration (${String(interval.endMs)} > ${String(durationMs)}).`,
      );
    }
    return { ...interval, pitchClasses: pitchClassesForPrivateChord(interval.symbol) };
  });

  const profiles = (['accurate', 'responsive'] as const).map((profile) => {
    const analysis = runPrivatePolyphonicRecording(
      decoded.data,
      decoded.sampleRate,
      labels.recordingId,
      profile,
    );
    const predictions = analysis.events.map((event) => ({
      confidence: event.candidates[0]?.confidence ?? 0,
      endMs: event.time.endMs ?? durationMs,
      startMs: event.time.startMs,
      symbol: event.candidates[0]?.symbol ?? 'unknown',
    }));
    const rankedPredictions = analysis.events.map((event) => ({
      candidates: event.candidates.map((candidate) => ({
        confidence: candidate.confidence,
        rank: candidate.rank,
        symbol: candidate.symbol,
      })),
      endMs: event.time.endMs ?? durationMs,
      startMs: event.time.startMs,
    }));
    const activeEvents = analysis.events.filter((event) =>
      truth.some(
        (interval) =>
          chordIntervalOverlapMs(interval, {
            endMs: event.time.endMs ?? durationMs,
            startMs: event.time.startMs,
          }) >= PRIVATE_CHORD_MINIMUM_OVERLAP_MS,
      ),
    );
    const perInterval = truth.map((interval) => {
      const overlapping = analysis.events
        .map((event) => ({
          event,
          overlapMs: chordIntervalOverlapMs(interval, {
            endMs: event.time.endMs ?? durationMs,
            startMs: event.time.startMs,
          }),
        }))
        .filter(({ overlapMs }) => overlapMs >= PRIVATE_CHORD_MINIMUM_OVERLAP_MS)
        .sort((left, right) => right.overlapMs - left.overlapMs);
      const best = overlapping[0];
      const expectedRank = best?.event.candidates.find(
        (candidate) => candidate.symbol === interval.symbol,
      )?.rank;
      return {
        bestOverlapMs: best?.overlapMs ?? 0,
        eventCount: overlapping.length,
        expected: interval.symbol,
        expectedRank: expectedRank ?? null,
        index: interval.index,
        predicted: best?.event.candidates[0]?.symbol ?? null,
        topCandidates:
          best?.event.candidates.slice(0, 3).map((candidate) => ({
            confidence: rounded(candidate.confidence),
            symbol: candidate.symbol,
          })) ?? [],
      };
    });
    const rankedMetrics = scoreRankedChords(
      truth,
      rankedPredictions,
      PRIVATE_CHORD_MINIMUM_OVERLAP_MS,
    );
    return {
      metrics: {
        activeEventCount: activeEvents.length,
        chordAccuracy: scoreChords(truth, predictions, PRIVATE_CHORD_MINIMUM_OVERLAP_MS).accuracy,
        eventCount: analysis.events.length,
        fragmentationRatio: activeEvents.length / truth.length,
        intervalsWithMultipleEvents: perInterval.filter((interval) => interval.eventCount > 1)
          .length,
        onsetBoundaries: scoreOnsets(
          truth.map((interval) => interval.startMs),
          analysis.events.map((event) => event.time.startMs),
          PRIVATE_CHORD_ONSET_TOLERANCE_MS,
        ),
        processingTimeMs: rounded(analysis.processingTimeMs),
        realTimeFactor: rounded(analysis.processingTimeMs / durationMs),
        silenceOnlyEventCount: analysis.events.length - activeEvents.length,
        top1Accuracy: rankedMetrics.top1Accuracy,
        top3Recall: rankedMetrics.top3Recall,
      },
      perInterval,
      profile,
    };
  });

  const report = {
    analyzer: {
      name: 'hpss-nnls-chroma-chord-templates',
      version: POLYPHONIC_ANALYZER_VERSION,
    },
    audio: {
      durationMs,
      path: path.basename(audioPath),
      sampleRate: decoded.sampleRate,
    },
    generatedAt: new Date().toISOString(),
    groundTruth: {
      boundaryStatus: 'automatically-proposed',
      chordCount: truth.length,
      labelStatus: labels.labelStatus,
      path: path.basename(labelsPath),
    },
    profiles,
    recordingId: labels.recordingId,
    schemaVersion: 1,
    scoring: {
      minimumOverlapMs: PRIVATE_CHORD_MINIMUM_OVERLAP_MS,
      onsetToleranceMs: PRIVATE_CHORD_ONSET_TOLERANCE_MS,
    },
  };
  const resolvedOutputPath =
    outputPath ??
    path.resolve(
      path.dirname(labelsPath),
      '..',
      'reports',
      `${labels.recordingId}-polyphonic-baseline.local.json`,
    );
  await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await writeFile(resolvedOutputPath, await formatJson(report), 'utf8');
  process.stdout.write(
    `Evaluated private chord recording and wrote ${path.relative(repositoryRoot, resolvedOutputPath)}.\n`,
  );
  for (const profile of profiles) {
    process.stdout.write(
      `${profile.profile}: top-1 ${(profile.metrics.top1Accuracy * 100).toFixed(1)}%, top-3 ${(profile.metrics.top3Recall * 100).toFixed(1)}%, fragmentation ${profile.metrics.fragmentationRatio.toFixed(2)}x.\n`,
    );
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'generate') {
    await generateCorpus();
    await validateCorpus();
    process.stdout.write('Generated deterministic corpus assets and self-test predictions.\n');
    return;
  }
  if (command === 'validate') {
    await validateCorpus();
    return;
  }
  if (command === 'self-test') {
    const report = await evaluate(
      selfTestPredictionPath,
      selfTestReportPath,
      '2026-07-17T00:00:00.000Z',
    );
    if (
      report.results.all.metrics.fusionImprovement.noteF1Delta <= 0 ||
      (report.results.all.metrics.fusionImprovement.fretMidpointErrorReduction ?? 0) <= 0
    ) {
      throw new Error('Harness self-test did not measure the expected fusion improvement.');
    }
    process.stdout.write('Evaluation harness self-test passed.\n');
    return;
  }
  if (command === 'monophonic-baseline') {
    const corpus = await readCorpus();
    const { predictions, qualityReport } = await createMonophonicBaselinePredictions(corpus);
    await mkdir(path.dirname(monophonicPredictionPath), { recursive: true });
    await writeFile(monophonicPredictionPath, await formatJson(predictions), 'utf8');
    const report = evaluateCorpus(corpus, predictions, {
      generatedAt: '2026-07-17T00:00:00.000Z',
    });
    await mkdir(path.dirname(monophonicReportPath), { recursive: true });
    await writeFile(monophonicReportPath, await formatJson(report), 'utf8');
    await writeFile(monophonicQualityPath, await formatJson(qualityReport), 'utf8');
    process.stdout.write(
      `Wrote monophonic baseline predictions and report for ${String(corpus.fixtures.length)} fixtures.\n`,
    );
    return;
  }
  if (command === 'benchmark-monophonic') {
    const iterationArgument = argumentValue('--iterations');
    await benchmarkMonophonic(iterationArgument === undefined ? 20 : Number(iterationArgument));
    return;
  }
  if (command === 'private-monophonic') {
    const privateManifestArgument = argumentValue('--manifest');
    if (privateManifestArgument === undefined) {
      throw new Error('Usage: private-monophonic --manifest <corpus.local.json>');
    }
    await evaluatePrivateMonophonicCorpus(path.resolve(repositoryRoot, privateManifestArgument));
    return;
  }
  if (command === 'private-polyphonic') {
    const audioArgument = argumentValue('--audio');
    const labelsArgument = argumentValue('--labels');
    if (audioArgument === undefined || labelsArgument === undefined) {
      throw new Error(
        'Usage: private-polyphonic --audio <recording.wav> --labels <boundaries.local.json> [--output <report.local.json>]',
      );
    }
    const outputArgument = argumentValue('--output');
    await evaluatePrivatePolyphonicRecording(
      path.resolve(repositoryRoot, audioArgument),
      path.resolve(repositoryRoot, labelsArgument),
      outputArgument === undefined ? undefined : path.resolve(repositoryRoot, outputArgument),
    );
    return;
  }
  if (command === 'evaluate') {
    const predictionArgument = argumentValue('--predictions');
    if (predictionArgument === undefined) {
      throw new Error('Usage: evaluate --predictions <file> [--output <file>]');
    }
    const outputArgument = argumentValue('--output');
    await evaluate(
      path.resolve(repositoryRoot, predictionArgument),
      outputArgument === undefined ? undefined : path.resolve(repositoryRoot, outputArgument),
    );
    return;
  }
  throw new Error(
    'Usage: evaluation.ts <generate|validate|self-test|monophonic-baseline|benchmark-monophonic|private-monophonic|private-polyphonic|evaluate>',
  );
}

await main();
