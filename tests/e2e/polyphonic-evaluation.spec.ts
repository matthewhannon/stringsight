import { expect, test } from '@playwright/test';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EvaluationCorpusSchema,
  EvaluationPredictionsSchema,
  evaluateCorpus,
  type FixturePrediction,
} from '../../src/evaluation';

type BrowserFixtureResult = {
  diagnostics: {
    acousticProcessingMs: number;
    audioDurationMs: number;
    backend: 'cpu' | 'wasm';
    inferenceMs: number;
    jsHeapUsedBytesAfter: number | null;
    jsHeapUsedBytesBefore: number | null;
    loadAndWarmupMs: number;
    modelWindowCount: number;
    peakJsHeapUsedBytes: number | null;
  };
  fixtureId: string;
  prediction: Omit<FixturePrediction, 'fixtureId' | 'latencySamples'>;
  provisionalPrediction: Pick<FixturePrediction, 'chords' | 'rankedChords'>;
};

type DecodedBasicPitchNote = {
  durationFrames: number;
  frameConfidence: number;
  onsetConfidence: number;
  pitchMidi: number;
  startFrame: number;
};

type BrowserChordCandidate = {
  confidence: number;
  rank: number;
  symbol: string;
};

type BrowserChordEvent = {
  candidates: BrowserChordCandidate[];
  id: string;
  time: { endMs?: number; startMs: number };
};

type BrowserNoteSetEvent = {
  candidates: {
    confidence: number;
    notes: { midi: number }[];
    rank: number;
  }[];
  time: { endMs?: number; startMs: number };
};

type CaptureBrowserModule = {
  decodePcmWav(bytes: ArrayBuffer): { data: Float32Array; sampleRate: number };
};

type ResampleBrowserModule = {
  StreamingAnalysisResampler: new (
    inputSampleRate: number,
    outputSampleRate: number,
  ) => {
    push(samples: Float32Array): { samples: Float32Array };
  };
};

type ModelBrowserModule = {
  BasicPitchModelRunner: new () => {
    analyze(samples: Float32Array): Promise<{
      backend: 'cpu' | 'wasm';
      inferenceMs: number;
      loadMs: number;
      notes: DecodedBasicPitchNote[];
      windowCount: number;
    }>;
  };
};

type PolyphonicBrowserModule = {
  BASIC_PITCH_SAMPLE_RATE: number;
  StreamingProvisionalChordAnalyzer: new (
    inputSampleRate: number,
    runId: string,
    options: { profile: 'accurate' },
  ) => {
    finish(atMs: number): { events: BrowserChordEvent[] };
    push(
      samples: Float32Array,
      startMs: number,
    ): { events: BrowserChordEvent[]; observations: object[]; sourceTimestampMs: number };
  };
  basicPitchFrameToMs(frame: number): number;
  basicPitchNotesToNoteSetEvents(
    notes: readonly DecodedBasicPitchNote[],
    runId: string,
  ): BrowserNoteSetEvent[];
  fuseAcousticHopAndModelChordEvents(
    noteSets: readonly BrowserNoteSetEvent[],
    acousticHops: readonly object[],
    acousticEvents: readonly BrowserChordEvent[],
    runId: string,
    profile: 'accurate',
  ): BrowserChordEvent[];
};

const reportPath = path.resolve('.local/evaluation/polyphonic-browser-baseline.local.json');

const assetBytes = async (paths: readonly string[]): Promise<number> =>
  (
    await Promise.all(paths.map(async (assetPath) => (await stat(path.resolve(assetPath))).size))
  ).reduce((total, bytes) => total + bytes, 0);

test('measures finalized polyphonic accuracy and performance with the pinned browser model', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const corpus = EvaluationCorpusSchema.parse(
    JSON.parse(await readFile(path.resolve('tests/fixtures/corpus.v1.json'), 'utf8')),
  );
  const chordFixtures = corpus.fixtures.filter((fixture) => fixture.groundTruth.chords.length > 0);
  expect(chordFixtures).toHaveLength(2);

  await page.goto('/');
  const browserResults = await page.evaluate(
    async (fixtures): Promise<BrowserFixtureResult[]> => {
      const capturePath = '/src/audio/capture/wav.ts';
      const resamplePath = '/src/audio/analysis/resample.ts';
      const modelPath = '/src/audio/polyphonic/basic-pitch-model.ts';
      const polyphonicPath = '/src/audio/polyphonic/index.ts';
      const capture = (await import(/* @vite-ignore */ capturePath)) as CaptureBrowserModule;
      const resample = (await import(/* @vite-ignore */ resamplePath)) as ResampleBrowserModule;
      const modelModule = (await import(/* @vite-ignore */ modelPath)) as ModelBrowserModule;
      const polyphonic = (await import(
        /* @vite-ignore */ polyphonicPath
      )) as PolyphonicBrowserModule;
      type ChromiumPerformance = Performance & {
        memory?: { usedJSHeapSize: number };
      };
      const browserPerformance = performance as ChromiumPerformance;
      const runner = new modelModule.BasicPitchModelRunner();
      const results: BrowserFixtureResult[] = [];

      for (const fixture of fixtures) {
        const response = await fetch(fixture.audioUrl);
        if (!response.ok) throw new Error(`Could not load ${fixture.audioUrl}.`);
        const decoded = capture.decodePcmWav(await response.arrayBuffer());
        const durationMs = (decoded.data.length / decoded.sampleRate) * 1_000;
        const analyzer = new polyphonic.StreamingProvisionalChordAnalyzer(
          decoded.sampleRate,
          `browser-evaluation-${fixture.fixtureId}`,
          { profile: 'accurate' },
        );
        const modelResampler = new resample.StreamingAnalysisResampler(
          decoded.sampleRate,
          polyphonic.BASIC_PITCH_SAMPLE_RATE,
        );
        const acousticEvents = new Map<string, BrowserChordEvent>();
        const acousticHops: object[] = [];
        const modelChunks: Float32Array[] = [];
        const chunkFrames = 2_048;
        const acousticStartedAt = performance.now();
        let lastSourceTimestampMs = 0;
        for (let startFrame = 0; startFrame < decoded.data.length; startFrame += chunkFrames) {
          const samples = decoded.data.subarray(
            startFrame,
            Math.min(decoded.data.length, startFrame + chunkFrames),
          );
          const result = analyzer.push(samples, (startFrame / decoded.sampleRate) * 1_000);
          result.events.forEach((event) => acousticEvents.set(event.id, event));
          acousticHops.push(...result.observations);
          lastSourceTimestampMs = result.sourceTimestampMs;
          const modelChunk = modelResampler.push(samples);
          if (modelChunk.samples.length > 0) modelChunks.push(modelChunk.samples);
        }
        analyzer
          .finish(lastSourceTimestampMs)
          .events.forEach((event) => acousticEvents.set(event.id, event));
        const acousticProcessingMs = performance.now() - acousticStartedAt;
        const modelLength = modelChunks.reduce((total, chunk) => total + chunk.length, 0);
        const modelAudio = new Float32Array(modelLength);
        let modelOffset = 0;
        modelChunks.forEach((chunk) => {
          modelAudio.set(chunk, modelOffset);
          modelOffset += chunk.length;
        });

        const jsHeapUsedBytesBefore = browserPerformance.memory?.usedJSHeapSize ?? null;
        let peakJsHeapUsedBytes = jsHeapUsedBytesBefore;
        const memorySampler = setInterval(() => {
          const sample = browserPerformance.memory?.usedJSHeapSize;
          if (sample !== undefined)
            peakJsHeapUsedBytes = Math.max(peakJsHeapUsedBytes ?? 0, sample);
        }, 10);
        const analysis = await runner.analyze(modelAudio);
        clearInterval(memorySampler);
        const jsHeapUsedBytesAfter = browserPerformance.memory?.usedJSHeapSize ?? null;
        if (jsHeapUsedBytesAfter !== null) {
          peakJsHeapUsedBytes = Math.max(peakJsHeapUsedBytes ?? 0, jsHeapUsedBytesAfter);
        }
        const noteSetEvents = polyphonic.basicPitchNotesToNoteSetEvents(
          analysis.notes,
          `browser-evaluation-${fixture.fixtureId}`,
        );
        const chordEvents = polyphonic.fuseAcousticHopAndModelChordEvents(
          noteSetEvents,
          acousticHops,
          [...acousticEvents.values()],
          `browser-evaluation-${fixture.fixtureId}`,
          'accurate',
        );
        const audioNotes = analysis.notes.map((note) => ({
          confidence: Math.max(0, Math.min(1, (note.frameConfidence + note.onsetConfidence) / 2)),
          endMs: polyphonic.basicPitchFrameToMs(note.startFrame + note.durationFrames),
          midi: note.pitchMidi,
          startMs: polyphonic.basicPitchFrameToMs(note.startFrame),
        }));
        const onsetCandidates = audioNotes.map(({ startMs }) => startMs).sort((a, b) => a - b);
        const onsetsMs: number[] = [];
        onsetCandidates.forEach((onset) => {
          const previous = onsetsMs.at(-1);
          if (previous === undefined || onset - previous > 50) onsetsMs.push(onset);
        });
        const noteSets = noteSetEvents.map((event) => ({
          candidates: event.candidates.map((candidate) => ({
            confidence: candidate.confidence,
            midis: candidate.notes.map(({ midi }) => midi),
            rank: candidate.rank,
          })),
          endMs: event.time.endMs ?? durationMs,
          startMs: event.time.startMs,
        }));
        const rankedChords = chordEvents.map((event) => ({
          candidates: event.candidates.map((candidate) => ({
            confidence: candidate.confidence,
            rank: candidate.rank,
            symbol: candidate.symbol,
          })),
          endMs: event.time.endMs ?? durationMs,
          startMs: event.time.startMs,
        }));
        const provisionalChordEvents = [...acousticEvents.values()];
        const provisionalPrediction = {
          chords: provisionalChordEvents.map((event) => ({
            confidence: event.candidates[0]?.confidence ?? 0,
            endMs: event.time.endMs ?? durationMs,
            startMs: event.time.startMs,
            symbol: event.candidates[0]?.symbol ?? 'unknown',
          })),
          rankedChords: provisionalChordEvents.map((event) => ({
            candidates: event.candidates.map((candidate) => ({
              confidence: candidate.confidence,
              rank: candidate.rank,
              symbol: candidate.symbol,
            })),
            endMs: event.time.endMs ?? durationMs,
            startMs: event.time.startMs,
          })),
        };

        results.push({
          diagnostics: {
            acousticProcessingMs,
            audioDurationMs: durationMs,
            backend: analysis.backend,
            inferenceMs: analysis.inferenceMs,
            jsHeapUsedBytesAfter,
            jsHeapUsedBytesBefore,
            loadAndWarmupMs: analysis.loadMs,
            modelWindowCount: analysis.windowCount,
            peakJsHeapUsedBytes,
          },
          fixtureId: fixture.fixtureId,
          prediction: {
            audioFretRegions: [],
            audioNotes,
            chords: chordEvents.map((event) => ({
              confidence: event.candidates[0]?.confidence ?? 0,
              endMs: event.time.endMs ?? durationMs,
              startMs: event.time.startMs,
              symbol: event.candidates[0]?.symbol ?? 'unknown',
            })),
            fusedFretRegions: [],
            fusedNotes: audioNotes,
            noteSets,
            onsetsMs,
            rankedChords,
          },
          provisionalPrediction,
        });
      }
      return results;
    },
    chordFixtures.map((fixture) => ({
      audioUrl: `/tests/fixtures/${fixture.media.audio ?? ''}`,
      fixtureId: fixture.id,
    })),
  );

  const predictionByFixture = new Map(browserResults.map((result) => [result.fixtureId, result]));
  const predictions = EvaluationPredictionsSchema.parse({
    corpusId: corpus.corpusId,
    fixtures: chordFixtures.map((fixture) => {
      const result = predictionByFixture.get(fixture.id);
      if (result === undefined) throw new Error(`Missing browser result for ${fixture.id}.`);
      return {
        ...result.prediction,
        fixtureId: fixture.id,
        latencySamples: [
          {
            latencyMs: result.diagnostics.inferenceMs,
            path: 'finalized-audio' as const,
          },
        ],
      };
    }),
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    system: { name: 'basic-pitch-plus-harmonic-chroma', version: '0.3.0+note-decoder.2' },
  });
  const evaluation = evaluateCorpus({ ...corpus, fixtures: chordFixtures }, predictions);
  const provisionalPredictions = EvaluationPredictionsSchema.parse({
    corpusId: corpus.corpusId,
    fixtures: chordFixtures.map((fixture) => {
      const result = predictionByFixture.get(fixture.id);
      if (result === undefined) throw new Error(`Missing browser result for ${fixture.id}.`);
      return {
        audioFretRegions: [],
        audioNotes: [],
        chords: result.provisionalPrediction.chords,
        fixtureId: fixture.id,
        fusedFretRegions: [],
        fusedNotes: [],
        latencySamples: [],
        noteSets: [],
        onsetsMs: [],
        rankedChords: result.provisionalPrediction.rankedChords,
      };
    }),
    generatedAt: predictions.generatedAt,
    schemaVersion: 1,
    system: { name: 'harmonic-chroma-provisional', version: '0.3.0' },
  });
  const provisionalEvaluation = evaluateCorpus(
    { ...corpus, fixtures: chordFixtures },
    provisionalPredictions,
  );
  const modelBytes = await assetBytes([
    'public/models/basic-pitch/model.json',
    'public/models/basic-pitch/group1-shard1of1.bin',
  ]);
  const wasmRuntimeBytes = await assetBytes([
    'public/vendor/tfjs-wasm/tfjs-backend-wasm.wasm',
    'public/vendor/tfjs-wasm/tfjs-backend-wasm-simd.wasm',
    'public/vendor/tfjs-wasm/tfjs-backend-wasm-threaded-simd.wasm',
  ]);
  const report = {
    ...evaluation,
    browserDiagnostics: {
      fixtures: browserResults.map(({ diagnostics, fixtureId }) => ({
        ...diagnostics,
        acousticRealTimeFactor: diagnostics.acousticProcessingMs / diagnostics.audioDurationMs,
        modelRealTimeFactor: diagnostics.inferenceMs / diagnostics.audioDurationMs,
        fixtureId,
      })),
      memoryScope:
        'Chromium usedJSHeapSize sampled every 10 ms around direct model inference; this is not total process or worker memory.',
      modelBytes,
      predictionSummary: browserResults.map(({ fixtureId, prediction }) => ({
        chords: prediction.chords,
        fixtureId,
        noteSets: prediction.noteSets,
        notes: prediction.audioNotes,
        onsetsMs: prediction.onsetsMs,
      })),
      wasmRuntimeBytes,
    },
    provisionalResults: provisionalEvaluation.results,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  expect(browserResults.every(({ diagnostics }) => diagnostics.modelWindowCount > 0)).toBe(true);
  expect(browserResults.every(({ diagnostics }) => diagnostics.inferenceMs >= 0)).toBe(true);
  expect(evaluation.results.all.metrics.chords.total).toBe(2);
  expect(evaluation.results.all.metrics.midiSets.total).toBe(2);
  expect(evaluation.results.all.metrics.pitchClassSets.total).toBe(2);
  expect(evaluation.results.development.metrics.audioNotes.f1).toBeGreaterThanOrEqual(0.9);
  expect(evaluation.results.development.metrics.pitchClassSets.top3Recall).toBeGreaterThanOrEqual(
    0.95,
  );
  expect(evaluation.results.all.metrics.rankedChords.top1Accuracy).toBeGreaterThanOrEqual(
    provisionalEvaluation.results.all.metrics.rankedChords.top1Accuracy,
  );
  expect(
    browserResults.every(
      ({ diagnostics }) => diagnostics.inferenceMs / diagnostics.audioDurationMs <= 1,
    ),
  ).toBe(true);
});
