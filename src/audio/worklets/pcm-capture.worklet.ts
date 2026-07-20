import { averageChannelSample } from '../capture/channel-mix';

declare const currentFrame: number;
declare const sampleRate: number;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

type ProcessorOptions = {
  chunkFrames?: number;
  monitorWaveformSamples?: number;
};

type WorkletCommand =
  | { maxRecordingFrames: number; type: 'start-recording' }
  | { type: 'pause-recording' }
  | { type: 'resume-recording' }
  | { type: 'stop-recording' };

const isWorkletCommand = (value: unknown): value is WorkletCommand =>
  typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private readonly chunkFrames: number;
  private readonly monitorWaveformSamples: number;
  private inputChannelMode: 'averaged' | 'mono' = 'mono';
  private inputChannelCount = 1;
  private monitorClippingSamples = 0;
  private monitorFrameCount = 0;
  private monitorPeak = 0;
  private monitorSumSquares = 0;
  private monitorWaveform: Float32Array;
  private monitoringAnalysisBuffer: Float32Array;
  private monitoringAnalysisClippingSamples = 0;
  private monitoringAnalysisContextStartFrame = 0;
  private monitoringAnalysisFrame = 0;
  private monitoringAnalysisPeak = 0;
  private monitoringAnalysisSequence = 0;
  private monitoringAnalysisStartFrame = 0;
  private monitoringAnalysisSumSquares = 0;
  private monitoringAnalysisWriteOffset = 0;
  private recording = false;
  private recordingBuffer: Float32Array;
  private recordingClippingSamples = 0;
  private recordingContextStartFrame = 0;
  private recordingFrame = 0;
  private recordingMaxFrames = 0;
  private recordingPeak = 0;
  private recordingSequence = 0;
  private recordingStartFrame = 0;
  private recordingSumSquares = 0;
  private recordingWriteOffset = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const processorOptions = options?.processorOptions as ProcessorOptions | undefined;
    this.chunkFrames = Math.max(128, Math.floor(processorOptions?.chunkFrames ?? 2_048));
    this.monitorWaveformSamples = Math.max(
      8,
      Math.floor(processorOptions?.monitorWaveformSamples ?? 64),
    );
    this.monitorWaveform = new Float32Array(this.monitorWaveformSamples);
    this.monitoringAnalysisBuffer = new Float32Array(this.chunkFrames);
    this.recordingBuffer = new Float32Array(this.chunkFrames);
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (!isWorkletCommand(event.data)) return;
      this.handleCommand(event.data);
    };
  }

  private handleCommand(command: WorkletCommand): void {
    if (command.type === 'start-recording') {
      this.resetMonitoringAnalysis();
      this.resetRecording();
      this.recordingMaxFrames = Math.max(0, Math.floor(command.maxRecordingFrames));
      this.recording = this.recordingMaxFrames > 0;
      this.port.postMessage({ type: 'recording-started' });
      if (!this.recording) this.port.postMessage({ type: 'recording-limit-reached' });
      return;
    }
    if (command.type === 'pause-recording') {
      this.publishRecordingChunk();
      this.recording = false;
      this.resetMonitoringAnalysis();
      this.port.postMessage({ type: 'recording-paused' });
      return;
    }
    if (command.type === 'resume-recording') {
      this.resetMonitoringAnalysis();
      if (this.recordingFrame < this.recordingMaxFrames) this.recording = true;
      this.port.postMessage({ type: 'recording-resumed' });
      return;
    }
    this.publishRecordingChunk();
    this.recording = false;
    this.resetMonitoringAnalysis();
    this.port.postMessage({ type: 'recording-stopped' });
  }

  private resetMonitoringAnalysis(): void {
    this.monitoringAnalysisBuffer = new Float32Array(this.chunkFrames);
    this.monitoringAnalysisClippingSamples = 0;
    this.monitoringAnalysisContextStartFrame = 0;
    this.monitoringAnalysisFrame = 0;
    this.monitoringAnalysisPeak = 0;
    this.monitoringAnalysisSequence = 0;
    this.monitoringAnalysisStartFrame = 0;
    this.monitoringAnalysisSumSquares = 0;
    this.monitoringAnalysisWriteOffset = 0;
  }

  private resetRecording(): void {
    this.recording = false;
    this.recordingBuffer = new Float32Array(this.chunkFrames);
    this.recordingClippingSamples = 0;
    this.recordingContextStartFrame = 0;
    this.recordingFrame = 0;
    this.recordingMaxFrames = 0;
    this.recordingPeak = 0;
    this.recordingSequence = 0;
    this.recordingStartFrame = 0;
    this.recordingSumSquares = 0;
    this.recordingWriteOffset = 0;
  }

  private observeMonitorSample(sample: number, contextFrame: number): void {
    const magnitude = Math.abs(sample);
    this.monitorPeak = Math.max(this.monitorPeak, magnitude);
    this.monitorSumSquares += sample * sample;
    if (magnitude >= 0.995) this.monitorClippingSamples += 1;
    const bin = Math.min(
      this.monitorWaveformSamples - 1,
      Math.floor((this.monitorFrameCount / this.chunkFrames) * this.monitorWaveformSamples),
    );
    if (magnitude >= Math.abs(this.monitorWaveform[bin] ?? 0)) this.monitorWaveform[bin] = sample;
    this.monitorFrameCount += 1;
    if (!this.recording) this.observeMonitoringAnalysisSample(sample, contextFrame);
    if (this.monitorFrameCount === this.chunkFrames) this.publishMonitorSummary();
  }

  private observeMonitoringAnalysisSample(sample: number, contextFrame: number): void {
    if (this.monitoringAnalysisWriteOffset === 0) {
      this.monitoringAnalysisContextStartFrame = contextFrame;
      this.monitoringAnalysisStartFrame = this.monitoringAnalysisFrame;
    }
    this.monitoringAnalysisBuffer[this.monitoringAnalysisWriteOffset] = sample;
    this.monitoringAnalysisWriteOffset += 1;
    this.monitoringAnalysisFrame += 1;
    const magnitude = Math.abs(sample);
    this.monitoringAnalysisPeak = Math.max(this.monitoringAnalysisPeak, magnitude);
    this.monitoringAnalysisSumSquares += sample * sample;
    if (magnitude >= 0.995) this.monitoringAnalysisClippingSamples += 1;
  }

  private publishMonitoringAnalysisChunk(): void {
    if (this.monitoringAnalysisWriteOffset === 0) return;
    const data = this.monitoringAnalysisBuffer.slice(0, this.monitoringAnalysisWriteOffset);
    this.port.postMessage(
      {
        clippingSamples: this.monitoringAnalysisClippingSamples,
        contextStartSampleFrame: this.monitoringAnalysisContextStartFrame,
        data,
        frameCount: data.length,
        inputChannelMode: this.inputChannelMode,
        inputChannelCount: this.inputChannelCount,
        peak: this.monitoringAnalysisPeak,
        rms: Math.sqrt(this.monitoringAnalysisSumSquares / this.monitoringAnalysisWriteOffset),
        sampleRate,
        sequence: this.monitoringAnalysisSequence,
        startSampleFrame: this.monitoringAnalysisStartFrame,
        stream: 'monitoring',
        type: 'chunk',
      },
      [data.buffer],
    );
    this.monitoringAnalysisBuffer = new Float32Array(this.chunkFrames);
    this.monitoringAnalysisClippingSamples = 0;
    this.monitoringAnalysisPeak = 0;
    this.monitoringAnalysisSequence += 1;
    this.monitoringAnalysisSumSquares = 0;
    this.monitoringAnalysisWriteOffset = 0;
  }

  private publishMonitorSummary(): void {
    if (this.monitorFrameCount === 0) return;
    this.publishMonitoringAnalysisChunk();
    const waveform = this.monitorWaveform;
    this.port.postMessage(
      {
        clippingSamples: this.monitorClippingSamples,
        frameCount: this.monitorFrameCount,
        inputChannelMode: this.inputChannelMode,
        inputChannelCount: this.inputChannelCount,
        peak: this.monitorPeak,
        rms: Math.sqrt(this.monitorSumSquares / this.monitorFrameCount),
        sampleRate,
        type: 'monitor-summary',
        waveform,
      },
      [waveform.buffer],
    );
    this.monitorClippingSamples = 0;
    this.monitorFrameCount = 0;
    this.monitorPeak = 0;
    this.monitorSumSquares = 0;
    this.monitorWaveform = new Float32Array(this.monitorWaveformSamples);
  }

  private observeRecordingSample(sample: number, contextFrame: number): void {
    if (this.recordingWriteOffset === 0) {
      this.recordingContextStartFrame = contextFrame;
      this.recordingStartFrame = this.recordingFrame;
    }
    this.recordingBuffer[this.recordingWriteOffset] = sample;
    this.recordingWriteOffset += 1;
    this.recordingFrame += 1;
    const magnitude = Math.abs(sample);
    this.recordingPeak = Math.max(this.recordingPeak, magnitude);
    this.recordingSumSquares += sample * sample;
    if (magnitude >= 0.995) this.recordingClippingSamples += 1;
    if (this.recordingWriteOffset === this.chunkFrames) this.publishRecordingChunk();
    if (this.recordingFrame === this.recordingMaxFrames) {
      this.publishRecordingChunk();
      this.recording = false;
      this.resetMonitoringAnalysis();
      this.port.postMessage({ type: 'recording-limit-reached' });
    }
  }

  private publishRecordingChunk(): void {
    if (this.recordingWriteOffset === 0) return;
    const data = this.recordingBuffer.slice(0, this.recordingWriteOffset);
    this.port.postMessage(
      {
        clippingSamples: this.recordingClippingSamples,
        contextStartSampleFrame: this.recordingContextStartFrame,
        data,
        frameCount: data.length,
        inputChannelMode: this.inputChannelMode,
        inputChannelCount: this.inputChannelCount,
        peak: this.recordingPeak,
        rms: Math.sqrt(this.recordingSumSquares / this.recordingWriteOffset),
        sampleRate,
        sequence: this.recordingSequence,
        startSampleFrame: this.recordingStartFrame,
        stream: 'recording',
        type: 'chunk',
      },
      [data.buffer],
    );
    this.recordingBuffer = new Float32Array(this.chunkFrames);
    this.recordingClippingSamples = 0;
    this.recordingPeak = 0;
    this.recordingSequence += 1;
    this.recordingSumSquares = 0;
    this.recordingWriteOffset = 0;
  }

  override process(inputs: Float32Array[][]): boolean {
    const inputChannels = inputs[0];
    if (inputChannels === undefined || inputChannels.length === 0) return true;
    this.inputChannelCount = inputChannels.length;
    this.inputChannelMode = inputChannels.length === 1 ? 'mono' : 'averaged';
    const frameCount = inputChannels.reduce(
      (maximum, channel) => Math.max(maximum, channel.length),
      0,
    );
    for (let inputOffset = 0; inputOffset < frameCount; inputOffset += 1) {
      const sample = averageChannelSample(inputChannels, inputOffset);
      this.observeMonitorSample(sample, currentFrame + inputOffset);
      if (this.recording) this.observeRecordingSample(sample, currentFrame + inputOffset);
    }
    return true;
  }
}

registerProcessor('stringsight-pcm-capture', PcmCaptureProcessor);
