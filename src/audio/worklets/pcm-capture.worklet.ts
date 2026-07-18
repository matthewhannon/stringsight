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
};

class PcmCaptureProcessor extends AudioWorkletProcessor {
  private readonly chunkFrames: number;
  private buffer: Float32Array;
  private clippingSamples = 0;
  private inputChannelMode: 'averaged' | 'mono' = 'mono';
  private inputChannelCount = 1;
  private peak = 0;
  private sequence = 0;
  private startSampleFrame = 0;
  private sumSquares = 0;
  private writeOffset = 0;

  constructor(options?: AudioWorkletNodeOptions) {
    super(options);
    const processorOptions = options?.processorOptions as ProcessorOptions | undefined;
    this.chunkFrames = Math.max(128, Math.floor(processorOptions?.chunkFrames ?? 2_048));
    this.buffer = new Float32Array(this.chunkFrames);
    this.port.onmessage = (event: MessageEvent<unknown>) => {
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        'type' in event.data &&
        event.data.type === 'flush'
      ) {
        this.publishChunk();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  private publishChunk(): void {
    if (this.writeOffset === 0) return;
    const data = this.buffer.slice(0, this.writeOffset);
    const rms = Math.sqrt(this.sumSquares / this.writeOffset);
    this.port.postMessage(
      {
        clippingSamples: this.clippingSamples,
        data,
        frameCount: data.length,
        inputChannelMode: this.inputChannelMode,
        inputChannelCount: this.inputChannelCount,
        peak: this.peak,
        rms,
        sampleRate,
        sequence: this.sequence,
        startSampleFrame: this.startSampleFrame,
        type: 'chunk',
      },
      [data.buffer],
    );
    this.buffer = new Float32Array(this.chunkFrames);
    this.clippingSamples = 0;
    this.peak = 0;
    this.sequence += 1;
    this.sumSquares = 0;
    this.writeOffset = 0;
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
      if (this.writeOffset === 0) this.startSampleFrame = currentFrame + inputOffset;
      const sample = averageChannelSample(inputChannels, inputOffset);
      this.buffer[this.writeOffset] = sample;
      this.writeOffset += 1;
      const magnitude = Math.abs(sample);
      this.peak = Math.max(this.peak, magnitude);
      this.sumSquares += sample * sample;
      if (magnitude >= 0.995) this.clippingSamples += 1;
      if (this.writeOffset === this.chunkFrames) this.publishChunk();
    }
    return true;
  }
}

registerProcessor('stringsight-pcm-capture', PcmCaptureProcessor);
