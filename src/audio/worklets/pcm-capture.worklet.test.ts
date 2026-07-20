import { afterEach, describe, expect, it, vi } from 'vitest';

type PostedMessage = { type?: string; [key: string]: unknown };
type TestPort = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: PostedMessage, transfer?: Transferable[]) => void;
};
type Processor = {
  port: TestPort;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('PCM capture worklet lifecycle', () => {
  it('emits bounded transient analysis while monitoring and keeps recording time contiguous', async () => {
    const posted: PostedMessage[] = [];
    const processorConstructors: (new (options?: AudioWorkletNodeOptions) => Processor)[] = [];

    class TestAudioWorkletProcessor {
      readonly port: TestPort = {
        onmessage: null,
        postMessage: (message) => posted.push(message),
      };
    }

    vi.stubGlobal('currentFrame', 0);
    vi.stubGlobal('sampleRate', 1_000);
    vi.stubGlobal('AudioWorkletProcessor', TestAudioWorkletProcessor);
    vi.stubGlobal(
      'registerProcessor',
      (_name: string, constructor: new (options?: AudioWorkletNodeOptions) => Processor) => {
        processorConstructors.push(constructor);
      },
    );

    await import('./pcm-capture.worklet');
    const ProcessorClass = processorConstructors[0];
    if (ProcessorClass === undefined) throw new Error('The capture processor was not registered.');
    const processor = new ProcessorClass({
      processorOptions: { chunkFrames: 128, monitorWaveformSamples: 8 },
    });
    const process = (frameCount: number, value = 0.25) =>
      processor.process([[new Float32Array(frameCount).fill(value)]], []);
    const command = (data: unknown) =>
      processor.port.onmessage?.(new MessageEvent('message', { data }));

    process(256);
    expect(posted.map(({ type }) => type)).toEqual([
      'chunk',
      'monitor-summary',
      'chunk',
      'monitor-summary',
    ]);
    const monitoringChunks = posted.filter(
      (message) => message.type === 'chunk' && message.stream === 'monitoring',
    );
    expect(monitoringChunks).toMatchObject([
      { frameCount: 128, sequence: 0, startSampleFrame: 0 },
      { frameCount: 128, sequence: 1, startSampleFrame: 128 },
    ]);
    expect(
      posted
        .filter((message) => message.type === 'monitor-summary')
        .map((message) => (message.waveform as Float32Array).length),
    ).toEqual([8, 8]);

    posted.length = 0;
    command({ maxRecordingFrames: 200, type: 'start-recording' });
    process(128);
    command({ type: 'pause-recording' });
    process(128, 0.5);
    command({ type: 'resume-recording' });
    process(72);

    const chunks = posted.filter(
      (message) => message.type === 'chunk' && message.stream === 'recording',
    );
    expect(chunks).toMatchObject([
      { frameCount: 128, sequence: 0, startSampleFrame: 0 },
      { frameCount: 72, sequence: 1, startSampleFrame: 128 },
    ]);
    expect(posted.map(({ type }) => type)).toContain('recording-limit-reached');
    expect(chunks.reduce((total, chunk) => total + Number(chunk.frameCount), 0)).toBe(200);
    expect(posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: 0, stream: 'monitoring', type: 'chunk' }),
      ]),
    );

    posted.length = 0;
    command({ maxRecordingFrames: 1_000, type: 'start-recording' });
    process(50);
    command({ type: 'stop-recording' });
    expect(posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frameCount: 50,
          sequence: 0,
          stream: 'recording',
          type: 'chunk',
        }),
        expect.objectContaining({ type: 'recording-stopped' }),
      ]),
    );
  });
});
