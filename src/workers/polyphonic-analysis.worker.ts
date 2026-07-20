/// <reference lib="webworker" />

import {
  BASIC_PITCH_SAMPLE_RATE,
  PolyphonicWorkerInboundSchema,
  StreamingProvisionalChordAnalyzer,
  basicPitchNotesToNoteSetEvents,
  fuseAcousticHopAndModelChordEvents,
  modelGapSampleCount,
  noteSetEventsToChordEvents,
  type PolyphonicWorkerOutbound,
  type AcousticChordHop,
  type ChordAnalysisProfile,
  type PolyphonicAnalysisMode,
} from '../audio/polyphonic';
import { StreamingAnalysisResampler } from '../audio/analysis/resample';
import { BasicPitchModelRunner } from '../audio/polyphonic/basic-pitch-model';
import {
  sessionTimestampMs,
  WORKER_PROTOCOL_VERSION,
  type ChordEvent,
  type NoteSetEvent,
} from '../shared';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let analyzer: StreamingProvisionalChordAnalyzer | null = null;
let acousticObservations: AcousticChordHop[] = [];
let lastSourceTimestampMs = 0;
let modelAudioChunks: Float32Array[] = [];
let modelAudioStartMs: number | null = null;
let modelResampler: StreamingAnalysisResampler | null = null;
let modelSourceEndMs: number | null = null;
let modelRunner = new BasicPitchModelRunner();
let provisionalEvents = new Map<string, ChordEvent>();
let runId = 'polyphonic-analysis';
let sampleRate = 0;
let chordAnalysisProfile: ChordAnalysisProfile = 'accurate';
let analysisMode: PolyphonicAnalysisMode = 'session';

type ModelDiagnostics = {
  backend: 'cpu' | 'wasm' | null;
  inferenceMs: number | null;
  loadMs: number | null;
  state: 'failed' | 'loading' | 'not-loaded' | 'ready';
  windowCount: number;
};

const EMPTY_MODEL_DIAGNOSTICS: ModelDiagnostics = {
  backend: null,
  inferenceMs: null,
  loadMs: null,
  state: 'not-loaded',
  windowCount: 0,
};

function post(message: PolyphonicWorkerOutbound): void {
  workerScope.postMessage(message);
}

function reset(nextRunId: string, nextAnalysisMode: PolyphonicAnalysisMode): void {
  analyzer = null;
  acousticObservations = [];
  lastSourceTimestampMs = 0;
  modelAudioChunks = [];
  modelAudioStartMs = null;
  modelResampler = null;
  modelSourceEndMs = null;
  provisionalEvents = new Map();
  runId = nextRunId;
  sampleRate = 0;
  analysisMode = nextAnalysisMode;
}

function postUpdate(
  result: ReturnType<StreamingProvisionalChordAnalyzer['push']>,
  startedAt: number,
  model: ModelDiagnostics = EMPTY_MODEL_DIAGNOSTICS,
  noteSetEvents: NoteSetEvent[] = [],
  eventUpdateMode: 'replace' | 'upsert' = 'upsert',
): void {
  post({
    analysisSampleRate: result.analysisSampleRate,
    chordAnalysisProfile,
    chordEvents: result.events,
    chroma: [...result.chroma.values],
    energy: result.chroma.energy,
    eventUpdateMode,
    inputSampleRate: result.inputSampleRate,
    modelBackend: model.backend,
    modelInferenceMs: model.inferenceMs,
    modelLoadMs: model.loadMs,
    modelState: model.state,
    modelWindowCount: model.windowCount,
    noteSetEvents,
    processingLatencyMs: Math.max(0, performance.now() - startedAt),
    protocolVersion: WORKER_PROTOCOL_VERSION,
    runId,
    sourceTimestampMs: sessionTimestampMs(result.sourceTimestampMs),
    state: result.state,
    type: 'update',
  });
}

function retainForFinalization(
  result: ReturnType<StreamingProvisionalChordAnalyzer['push']>,
): void {
  if (analysisMode === 'monitoring') return;
  acousticObservations.push(...result.observations);
  result.events.forEach((event) => provisionalEvents.set(event.id, event));
}

function concatenateModelAudio(): Float32Array {
  const length = modelAudioChunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  for (const chunk of modelAudioChunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function finalizeModel(
  result: ReturnType<StreamingProvisionalChordAnalyzer['finish']>,
  targetRunId: string,
  startedAt: number,
): Promise<void> {
  postUpdate(result, startedAt, { ...EMPTY_MODEL_DIAGNOSTICS, state: 'loading' });
  try {
    if (modelResampler?.outputSampleRate !== BASIC_PITCH_SAMPLE_RATE) {
      throw new Error(
        `Finalized transcription requires at least ${String(BASIC_PITCH_SAMPLE_RATE)} Hz input audio.`,
      );
    }
    const analysis = await modelRunner.analyze(concatenateModelAudio());
    if (runId !== targetRunId) return;
    const noteSetEvents = basicPitchNotesToNoteSetEvents(
      analysis.notes,
      targetRunId,
      modelAudioStartMs ?? 0,
    );
    const acousticEvents = [...provisionalEvents.values()];
    const chordEvents =
      acousticEvents.length === 0
        ? noteSetEventsToChordEvents(noteSetEvents, targetRunId, [], chordAnalysisProfile)
        : fuseAcousticHopAndModelChordEvents(
            noteSetEvents,
            acousticObservations,
            acousticEvents,
            targetRunId,
            chordAnalysisProfile,
          );
    postUpdate(
      { ...result, events: chordEvents },
      startedAt,
      {
        backend: analysis.backend,
        inferenceMs: analysis.inferenceMs,
        loadMs: analysis.loadMs,
        state: 'ready',
        windowCount: analysis.windowCount,
      },
      noteSetEvents,
      'replace',
    );
  } catch (error) {
    if (runId !== targetRunId) return;
    const fallbackEvents = [...provisionalEvents.values()];
    const acousticFallback = fuseAcousticHopAndModelChordEvents(
      [],
      acousticObservations,
      fallbackEvents,
      targetRunId,
      chordAnalysisProfile,
    );
    postUpdate(
      { ...result, events: acousticFallback },
      startedAt,
      { ...EMPTY_MODEL_DIAGNOSTICS, state: 'failed' },
      [],
      'replace',
    );
    post({
      message: error instanceof Error ? error.message : 'Unknown finalized transcription failure.',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId: targetRunId,
      type: 'failure',
    });
    modelRunner = new BasicPitchModelRunner();
  } finally {
    if (runId === targetRunId) {
      modelAudioChunks = [];
      post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId: targetRunId, type: 'complete' });
    }
  }
}

workerScope.onmessage = (event: MessageEvent<unknown>) => {
  try {
    const message = PolyphonicWorkerInboundSchema.parse(event.data);
    if (message.type === 'initialize' || message.type === 'reset') {
      chordAnalysisProfile = message.chordAnalysisProfile;
      reset(message.runId, message.analysisMode);
      post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId, type: 'ready' });
      return;
    }
    if (message.type === 'set-profile') {
      chordAnalysisProfile = message.chordAnalysisProfile;
      analyzer?.setProfile(chordAnalysisProfile);
      return;
    }
    if (message.type === 'chunk') {
      const monitoringChunk = message.chunk.stream === 'monitoring';
      if (monitoringChunk !== (analysisMode === 'monitoring')) {
        throw new Error('Polyphonic analysis received PCM for the wrong analysis mode.');
      }
      if (analyzer === null) {
        sampleRate = message.chunk.sampleRate;
        analyzer = new StreamingProvisionalChordAnalyzer(sampleRate, runId, {
          profile: chordAnalysisProfile,
        });
        modelResampler =
          analysisMode === 'session'
            ? new StreamingAnalysisResampler(sampleRate, BASIC_PITCH_SAMPLE_RATE)
            : null;
      }
      if (message.chunk.sampleRate !== sampleRate) {
        throw new Error('Audio sample rate changed during a polyphonic analysis run.');
      }
      const startedAt = performance.now();
      const result = analyzer.push(
        message.chunk.data,
        message.chunk.startMs,
        message.chunk.diagnostics.discontinuity,
      );
      retainForFinalization(result);
      if (analysisMode === 'session') {
        modelAudioStartMs ??= message.chunk.startMs;
        const gapSamples = modelGapSampleCount(
          modelSourceEndMs,
          message.chunk.startMs,
          BASIC_PITCH_SAMPLE_RATE,
        );
        if (gapSamples > 0) modelAudioChunks.push(new Float32Array(gapSamples));
        const modelChunk = modelResampler?.push(
          message.chunk.data,
          message.chunk.diagnostics.discontinuity,
        );
        if (modelChunk !== undefined && modelChunk.samples.length > 0) {
          modelAudioChunks.push(modelChunk.samples);
        }
        modelSourceEndMs = message.chunk.startMs + message.chunk.durationMs;
      }
      lastSourceTimestampMs = result.sourceTimestampMs;
      postUpdate(result, startedAt);
      return;
    }
    if (analyzer === null) {
      post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId, type: 'complete' });
      return;
    }
    const startedAt = performance.now();
    const targetRunId = runId;
    const result = analyzer.finish(lastSourceTimestampMs);
    retainForFinalization(result);
    if (analysisMode === 'monitoring') {
      postUpdate(result, startedAt);
      post({ protocolVersion: WORKER_PROTOCOL_VERSION, runId: targetRunId, type: 'complete' });
      return;
    }
    void finalizeModel(result, targetRunId, startedAt);
  } catch (error) {
    post({
      message: error instanceof Error ? error.message : 'Unknown polyphonic analysis failure.',
      protocolVersion: WORKER_PROTOCOL_VERSION,
      runId,
      type: 'failure',
    });
  }
};
