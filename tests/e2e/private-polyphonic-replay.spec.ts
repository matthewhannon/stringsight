import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type DecodedNote = {
  durationFrames: number;
  frameConfidence: number;
  onsetConfidence: number;
  pitchMidi: number;
  startFrame: number;
};

type ChordEvent = {
  candidates: { bass?: string; confidence: number; symbol: string }[];
  diagnostics: Record<string, boolean | number | string | null>;
  id: string;
  lifecycle: string;
  observedPitchClasses: { pitchClass: string; weight: number }[];
  time: { endMs?: number; startMs: number };
};

type NoteSetEvent = {
  candidates: { notes: { midi: number; noteName: string }[] }[];
  time: { endMs?: number; startMs: number };
};

type AcousticChordHop = {
  activityEnergy: number;
  attack: { peakTimeMs: number | null; spectralFluxZ: number; strength: number };
  boundaryBefore?: {
    harmonicDistance: number;
    mode: string;
    novelToneStrength: number;
    persistenceMs: number;
    score: number;
  };
  featureTimeMs: number;
  harmony: {
    shortCandidates?: { confidence: number; score: number; symbol: string }[];
    topCandidates: { confidence: number; score: number; symbol: string }[];
  };
};

type PrivateReplayResult = {
  acousticEvents: ChordEvent[];
  acousticHopSummaries: {
    activityEnergy: number;
    attackStrength: number;
    boundaryMode: string | null;
    featureTimeMs: number;
    longTop: string | null;
    shortTop: string | null;
  }[];
  audioDurationMs: number;
  backend: 'cpu' | 'wasm';
  boundaryRegionEvents: ChordEvent[];
  finalizedEvents: ChordEvent[];
  inferenceMs: number;
  loadMs: number;
  noteSetEvents: NoteSetEvent[];
  windowCount: number;
};

const privateAudioPath = process.env.STRINGSIGHT_PRIVATE_WAV;
const privateAudioUrl = 'http://127.0.0.1:4173/__stringsight_private_audio.wav';
const reportPath = path.resolve('.local/evaluation/private-polyphonic-browser-replay.local.json');

test.skip(privateAudioPath === undefined, 'Set STRINGSIGHT_PRIVATE_WAV to replay a private WAV.');

test('replays a private WAV through the production acoustic and Basic Pitch fusion path', async ({
  page,
}) => {
  test.setTimeout(120_000);
  if (privateAudioPath === undefined) throw new Error('STRINGSIGHT_PRIVATE_WAV was not provided.');
  const audioBytes = await readFile(path.resolve(privateAudioPath));
  await page.route(privateAudioUrl, async (route) => {
    await route.fulfill({ body: audioBytes, contentType: 'audio/wav', status: 200 });
  });
  await page.goto('/');

  const result = await page.evaluate(async (audioUrl): Promise<PrivateReplayResult> => {
    const capturePath = '/src/audio/capture/wav.ts';
    const resamplePath = '/src/audio/analysis/resample.ts';
    const modelPath = '/src/audio/polyphonic/basic-pitch-model.ts';
    const polyphonicPath = '/src/audio/polyphonic/index.ts';
    const capture = (await import(/* @vite-ignore */ capturePath)) as {
      decodePcmWav(bytes: ArrayBuffer): { data: Float32Array; sampleRate: number };
    };
    const resample = (await import(/* @vite-ignore */ resamplePath)) as {
      StreamingAnalysisResampler: new (
        inputSampleRate: number,
        outputSampleRate: number,
      ) => { push(samples: Float32Array): { samples: Float32Array } };
    };
    const model = (await import(/* @vite-ignore */ modelPath)) as {
      BasicPitchModelRunner: new () => {
        analyze(samples: Float32Array): Promise<{
          backend: 'cpu' | 'wasm';
          inferenceMs: number;
          loadMs: number;
          notes: DecodedNote[];
          windowCount: number;
        }>;
      };
    };
    const polyphonic = (await import(/* @vite-ignore */ polyphonicPath)) as {
      BASIC_PITCH_SAMPLE_RATE: number;
      StreamingProvisionalChordAnalyzer: new (
        sampleRate: number,
        runId: string,
        options: { profile: 'accurate' },
      ) => {
        finish(atMs: number): { events: ChordEvent[] };
        push(
          samples: Float32Array,
          startMs: number,
        ): {
          events: ChordEvent[];
          observations: AcousticChordHop[];
          sourceTimestampMs: number;
        };
      };
      basicPitchNotesToNoteSetEvents(notes: readonly DecodedNote[], runId: string): NoteSetEvent[];
      fuseAcousticAndModelChordEvents(
        noteSets: readonly NoteSetEvent[],
        acousticEvents: readonly ChordEvent[],
        runId: string,
        profile: 'accurate',
      ): ChordEvent[];
      fuseAcousticHopAndModelChordEvents(
        noteSets: readonly NoteSetEvent[],
        acousticHops: readonly AcousticChordHop[],
        acousticEvents: readonly ChordEvent[],
        runId: string,
        profile: 'accurate',
      ): ChordEvent[];
    };

    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error('Private replay audio could not be loaded.');
    const decoded = capture.decodePcmWav(await response.arrayBuffer());
    const analyzer = new polyphonic.StreamingProvisionalChordAnalyzer(
      decoded.sampleRate,
      'private-browser-replay',
      { profile: 'accurate' },
    );
    const modelResampler = new resample.StreamingAnalysisResampler(
      decoded.sampleRate,
      polyphonic.BASIC_PITCH_SAMPLE_RATE,
    );
    const acousticById = new Map<string, ChordEvent>();
    const acousticHops: AcousticChordHop[] = [];
    const modelChunks: Float32Array[] = [];
    let lastSourceTimestampMs = 0;
    for (let startFrame = 0; startFrame < decoded.data.length; startFrame += 2_048) {
      const samples = decoded.data.subarray(
        startFrame,
        Math.min(decoded.data.length, startFrame + 2_048),
      );
      const acoustic = analyzer.push(samples, (startFrame / decoded.sampleRate) * 1_000);
      acoustic.events.forEach((event) => acousticById.set(event.id, event));
      acousticHops.push(...acoustic.observations);
      lastSourceTimestampMs = acoustic.sourceTimestampMs;
      const modelChunk = modelResampler.push(samples);
      if (modelChunk.samples.length > 0) modelChunks.push(modelChunk.samples);
    }
    analyzer
      .finish(lastSourceTimestampMs)
      .events.forEach((event) => acousticById.set(event.id, event));
    const modelLength = modelChunks.reduce((total, chunk) => total + chunk.length, 0);
    const modelAudio = new Float32Array(modelLength);
    let offset = 0;
    for (const chunk of modelChunks) {
      modelAudio.set(chunk, offset);
      offset += chunk.length;
    }
    const runner = new model.BasicPitchModelRunner();
    const analysis = await runner.analyze(modelAudio);
    const noteSetEvents = polyphonic.basicPitchNotesToNoteSetEvents(
      analysis.notes,
      'private-browser-replay',
    );
    const acousticEvents = [...acousticById.values()].sort(
      (left, right) => left.time.startMs - right.time.startMs,
    );
    const finalizedEvents = polyphonic.fuseAcousticAndModelChordEvents(
      noteSetEvents,
      acousticEvents,
      'private-browser-replay',
      'accurate',
    );
    const boundaryRegionEvents = polyphonic.fuseAcousticHopAndModelChordEvents(
      noteSetEvents,
      acousticHops,
      acousticEvents,
      'private-browser-replay-boundary-regions',
      'accurate',
    );
    return {
      acousticEvents,
      acousticHopSummaries: acousticHops.map((hop) => ({
        activityEnergy: hop.activityEnergy,
        attackStrength: hop.attack.strength,
        boundaryMode: hop.boundaryBefore?.mode ?? null,
        featureTimeMs: hop.featureTimeMs,
        longTop: hop.harmony.topCandidates[0]?.symbol ?? null,
        shortTop: hop.harmony.shortCandidates?.[0]?.symbol ?? null,
      })),
      audioDurationMs: (decoded.data.length / decoded.sampleRate) * 1_000,
      backend: analysis.backend,
      boundaryRegionEvents,
      finalizedEvents,
      inferenceMs: analysis.inferenceMs,
      loadMs: analysis.loadMs,
      noteSetEvents,
      windowCount: analysis.windowCount,
    };
  }, privateAudioUrl);

  expect(result.finalizedEvents.length).toBeGreaterThan(0);
  expect(result.finalizedEvents.every(({ lifecycle }) => lifecycle === 'finalized')).toBe(true);
  expect(result.boundaryRegionEvents.every(({ lifecycle }) => lifecycle === 'finalized')).toBe(
    true,
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        audioPath: path.resolve(privateAudioPath),
        generatedAt: new Date().toISOString(),
        result,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
});
