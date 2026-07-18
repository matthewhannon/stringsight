import type { NoteEvent } from '../../shared';
import type { AnalysisState, OnsetObservation } from './contracts';
import {
  StreamingMonophonicAnalyzer,
  type StreamingAnalyzerOptions,
  type StreamingAnalysisResult,
} from './streaming';
import { DEFAULT_ANALYSIS_SAMPLE_RATE, StreamingAnalysisResampler } from './resample';

export type MonophonicPipelineResult = StreamingAnalysisResult & {
  analysisSampleRate: number;
  inputSampleRate: number;
};

export class StreamingMonophonicPipeline {
  readonly analysisSampleRate: number;
  readonly inputSampleRate: number;
  private readonly analyzer: StreamingMonophonicAnalyzer;
  private readonly resampler: StreamingAnalysisResampler;
  private state: AnalysisState = 'silence';

  constructor(
    inputSampleRate: number,
    runId: string,
    options: StreamingAnalyzerOptions & { analysisSampleRate?: number } = {},
  ) {
    this.inputSampleRate = inputSampleRate;
    this.resampler = new StreamingAnalysisResampler(
      inputSampleRate,
      options.analysisSampleRate ?? DEFAULT_ANALYSIS_SAMPLE_RATE,
    );
    this.analysisSampleRate = this.resampler.outputSampleRate;
    this.analyzer = new StreamingMonophonicAnalyzer(this.analysisSampleRate, runId, options);
  }

  push(samples: Float32Array, startMs: number, discontinuity = false): MonophonicPipelineResult {
    const resampled = this.resampler.push(samples, discontinuity);
    if (resampled.samples.length === 0) {
      return this.wrap({
        events: [] as NoteEvent[],
        onsets: [] as OnsetObservation[],
        sourceTimestampMs: startMs + (samples.length / this.inputSampleRate) * 1_000,
        state: this.state,
      });
    }
    const analysisStartMs =
      startMs + (resampled.firstSourceFrameOffset / this.inputSampleRate) * 1_000;
    const result = this.analyzer.push(resampled.samples, analysisStartMs, discontinuity);
    this.state = result.state;
    return this.wrap({
      ...result,
      sourceTimestampMs: startMs + (samples.length / this.inputSampleRate) * 1_000,
    });
  }

  finish(atMs: number): MonophonicPipelineResult {
    const result = this.analyzer.finish(atMs);
    this.state = result.state;
    return this.wrap(result);
  }

  private wrap(result: StreamingAnalysisResult): MonophonicPipelineResult {
    return {
      ...result,
      analysisSampleRate: this.analysisSampleRate,
      inputSampleRate: this.inputSampleRate,
    };
  }
}
