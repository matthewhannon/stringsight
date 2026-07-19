import { describe, expect, it } from 'vitest';

import {
  PolyphonicWorkerUpdateSchema,
  StreamingProvisionalChordAnalyzer,
  computeChroma,
  matchChordTemplates,
} from './index';
import { WORKER_PROTOCOL_VERSION } from '../../shared';

const SAMPLE_RATE = 16_000;
const WINDOW_FRAMES = 6_144;

function chordSignal(
  midis: readonly number[],
  gain = 0.16,
  detuneCents = 0,
  frames = WINDOW_FRAMES,
  frameOffset = 0,
): Float32Array {
  return Float32Array.from({ length: frames }, (_, frame) => {
    const absoluteFrame = frame + frameOffset;
    const attack = Math.min(1, absoluteFrame / 240);
    return midis.reduce((sample, midi) => {
      const frequency = 440 * 2 ** ((midi - 69 + detuneCents / 100) / 12);
      const phase = (2 * Math.PI * frequency * absoluteFrame) / SAMPLE_RATE;
      return (
        sample +
        attack * gain * (Math.sin(phase) + 0.32 * Math.sin(phase * 2) + 0.16 * Math.sin(phase * 3))
      );
    }, 0);
  });
}

function streamSamples(
  analyzer: StreamingProvisionalChordAnalyzer,
  samples: Float32Array,
): ReturnType<StreamingProvisionalChordAnalyzer['push']>['events'] {
  const events = new Map<
    string,
    ReturnType<StreamingProvisionalChordAnalyzer['push']>['events'][number]
  >();
  const chunkFrames = 1_280;
  for (let offset = 0; offset < samples.length; offset += chunkFrames) {
    const result = analyzer.push(
      samples.subarray(offset, Math.min(samples.length, offset + chunkFrames)),
      (offset / SAMPLE_RATE) * 1_000,
    );
    result.events.forEach((event) => events.set(event.id, event));
  }
  analyzer
    .finish((samples.length / SAMPLE_RATE) * 1_000)
    .events.forEach((event) => events.set(event.id, event));
  return [...events.values()];
}

describe('independent chroma evidence', () => {
  it('returns silence without inventing pitch-class energy', () => {
    const observation = computeChroma(new Float32Array(WINDOW_FRAMES), SAMPLE_RATE);
    expect(observation.energy).toBe(0);
    expect(observation.values).toEqual(Array.from({ length: 12 }, () => 0));
  });

  it('is gain-invariant and preserves the pitch classes of a detuned major chord', () => {
    const quiet = computeChroma(chordSignal([48, 52, 55], 0.05, 18), SAMPLE_RATE);
    const loud = computeChroma(chordSignal([48, 52, 55], 0.18, 18), SAMPLE_RATE);
    const strongest = quiet.values
      .map((value, pitchClass) => ({ pitchClass, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 3)
      .map(({ pitchClass }) => pitchClass);

    expect(strongest).toEqual(expect.arrayContaining([0, 4, 7]));
    quiet.values.forEach((value, index) => {
      expect(value).toBeCloseTo(loud.values[index] ?? 0, 6);
    });
  });

  it('rejects invalid sample rates, FFT layouts, and undersized windows', () => {
    expect(() => computeChroma(chordSignal([48, 52, 55]), 0)).toThrow(/sample rate/i);
    expect(() => computeChroma(chordSignal([48, 52, 55]), SAMPLE_RATE, { fftSize: 3_000 })).toThrow(
      /power-of-two/i,
    );
    expect(() => computeChroma(new Float32Array(100), SAMPLE_RATE)).toThrow(/at least/i);
  });
});

describe('chord template matching', () => {
  const observation = (
    valuesByPitchClass: Readonly<Record<number, number>>,
    bassByPitchClass: Readonly<Record<number, number>> = {},
  ) => ({
    bass: Array.from({ length: 12 }, (_, index) => bassByPitchClass[index] ?? 0),
    energy: 0.1,
    values: Array.from({ length: 12 }, (_, index) => valuesByPitchClass[index] ?? 0),
  });

  it.each([
    { midis: [48, 52, 55], symbol: 'C' },
    { midis: [45, 48, 52], symbol: 'Am' },
    { midis: [43, 48, 52], symbol: 'C' },
    { midis: [50, 57], symbol: 'D5' },
    { midis: [50, 53, 56], symbol: 'Ddim' },
  ])('ranks $symbol first for overtone-rich notes $midis', ({ midis, symbol }) => {
    const candidates = matchChordTemplates(computeChroma(chordSignal(midis), SAMPLE_RATE));
    expect(candidates[0]?.symbol).toBe(symbol);
    expect(candidates.map(({ rank }) => rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the root while exposing a detected inversion bass', () => {
    const candidates = matchChordTemplates(computeChroma(chordSignal([43, 48, 52]), SAMPLE_RATE));
    expect(candidates[0]).toMatchObject({ bass: 'G', root: 'C', symbol: 'C' });
  });

  it('keeps bass optional when the observation has no low-frequency evidence', () => {
    const candidates = matchChordTemplates(
      computeChroma(new Float32Array(WINDOW_FRAMES), SAMPLE_RATE),
      0,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.bass).toBeUndefined();
  });

  it('keeps candidate confidence ordered with candidate rank', () => {
    const candidates = matchChordTemplates(
      computeChroma(chordSignal([43, 47, 50, 55, 59, 67]), SAMPLE_RATE),
    );
    candidates.slice(1).forEach((candidate, index) => {
      expect(candidate.confidence).toBeLessThanOrEqual(candidates[index]?.confidence ?? 0);
    });
  });

  it.each([
    {
      bass: { 2: 0.42, 9: 0.34 },
      name: 'D7 over its rootless F# diminished subset',
      symbol: 'D7',
      values: { 0: 0.25, 2: 0.13, 6: 0.18, 9: 0.21 },
    },
    {
      bass: { 0: 0.28, 4: 0.38, 7: 0.3 },
      name: 'Cmaj7 over relative Em',
      symbol: 'Cmaj7',
      values: { 0: 0.15, 4: 0.29, 7: 0.25, 11: 0.13 },
    },
    {
      bass: { 1: 0.08, 4: 0.3, 9: 0.36 },
      name: 'Amaj7 over relative C# minor',
      symbol: 'Amaj7',
      values: { 1: 0.17, 4: 0.27, 8: 0.2, 9: 0.14 },
    },
  ])('uses root and bass support to rank $name', ({ bass, symbol, values }) => {
    expect(matchChordTemplates(observation(values, bass))[0]?.symbol).toBe(symbol);
  });

  it.each([
    { extension: 0.08, symbol: 'Dm' },
    { extension: 0.2, symbol: 'Dm7' },
  ])('uses seventh-extension strength to distinguish $symbol', ({ extension, symbol }) => {
    expect(
      matchChordTemplates(
        observation({ 0: extension, 2: 0.3, 5: 0.25, 9: 0.3 }, { 2: 0.45, 9: 0.35 }),
      )[0]?.symbol,
    ).toBe(symbol);
  });

  it.each([
    { coreMidis: [50, 53, 57], extensionMidi: 60, label: 'low-position seventh', symbol: 'Dm7' },
    { coreMidis: [50, 53, 57], extensionMidi: 84, label: 'overtone mismatch', symbol: 'Dm' },
    { coreMidis: [77, 81, 86], extensionMidi: 84, label: 'high-neck seventh', symbol: 'Dm7' },
  ])('uses extension-register consistency for a $label', ({ coreMidis, extensionMidi, symbol }) => {
    const noteActivations = Array.from({ length: 49 }, () => 0);
    coreMidis.forEach((midi) => {
      noteActivations[midi - 40] = 2;
    });
    noteActivations[extensionMidi - 40] = 2;

    expect(
      matchChordTemplates({
        ...observation({ 0: 0.15, 2: 0.28, 5: 0.22, 9: 0.3 }, { 2: 0.42, 9: 0.36 }),
        noteActivations,
        noteMidiRange: { max: 88, min: 40 },
      })[0]?.symbol,
    ).toBe(symbol);
  });

  it('keeps a seventh when its extension has meaningful low-register support', () => {
    const noteActivations = Array.from({ length: 49 }, () => 0);
    [50, 53, 57].forEach((midi) => {
      noteActivations[midi - 40] = 2;
    });
    noteActivations[60 - 40] = 0.6;
    noteActivations[84 - 40] = 1.4;

    expect(
      matchChordTemplates({
        ...observation({ 0: 0.15, 2: 0.28, 5: 0.22, 9: 0.3 }, { 2: 0.42, 9: 0.36 }),
        noteActivations,
        noteMidiRange: { max: 88, min: 40 },
      })[0]?.symbol,
    ).toBe('Dm7');
  });
});

describe('streaming provisional chord analysis', () => {
  it('upserts a stable provisional chord and finalizes it at the end of a run', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'replay-1', {
      profile: 'responsive',
    });
    const first = analyzer.push(chordSignal([48, 52, 55]), 0);
    const second = analyzer.push(chordSignal([48, 52, 55], 0.16, 0, 1_600, WINDOW_FRAMES), 384);
    const third = analyzer.push(chordSignal([48, 52, 55], 0.16, 0, 1_280, 7_744), 484);
    const finalized = analyzer.finish(500);

    expect(first).toMatchObject({ events: [], state: 'uncertain' });
    expect(second.events[0]?.candidates[0]?.symbol).toBe('C');
    expect(third.events[0]).toMatchObject({ id: second.events[0]?.id, lifecycle: 'provisional' });
    expect(finalized.events[0]).toMatchObject({ id: second.events[0]?.id, lifecycle: 'finalized' });
  });

  it('warms up without inventing an event and closes a chord on silence', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'microphone-1', {
      profile: 'responsive',
    });
    expect(analyzer.push(chordSignal([45, 48, 52]).slice(0, 1_000), 0)).toMatchObject({
      events: [],
      state: 'warming',
    });
    analyzer.push(chordSignal([45, 48, 52]), 62.5);
    const chord = analyzer.push(chordSignal([45, 48, 52], 0.16, 0, 1_280, 6_144), 446.5);
    const silenceResults = Array.from({ length: 8 }, (_, index) =>
      analyzer.push(new Float32Array(1_280), 526.5 + index * 80),
    );
    expect(chord.events[0]?.candidates[0]?.symbol).toBe('Am');
    expect(silenceResults.some((result) => result.state === 'tracking')).toBe(true);
    expect(
      silenceResults
        .flatMap((result) => result.events)
        .find((event) => event.lifecycle === 'finalized'),
    ).toMatchObject({ lifecycle: 'finalized' });
    expect(silenceResults.at(-1)?.state).toBe('silence');
  });

  it('validates the dedicated worker update boundary', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'replay-2', {
      profile: 'responsive',
    });
    const result = analyzer.push(chordSignal([48, 52, 55]), 0);
    expect(
      PolyphonicWorkerUpdateSchema.parse({
        analysisSampleRate: result.analysisSampleRate,
        chordAnalysisProfile: 'accurate',
        chordEvents: result.events,
        chroma: result.chroma.values,
        energy: result.chroma.energy,
        eventUpdateMode: 'upsert',
        inputSampleRate: result.inputSampleRate,
        modelBackend: null,
        modelInferenceMs: null,
        modelLoadMs: null,
        modelState: 'not-loaded',
        modelWindowCount: 0,
        noteSetEvents: [],
        processingLatencyMs: 4,
        protocolVersion: WORKER_PROTOCOL_VERSION,
        runId: 'replay-2',
        sourceTimestampMs: result.sourceTimestampMs,
        state: result.state,
        type: 'update',
      }).runId,
    ).toBe('replay-2');
  });

  it('handles empty finalization and resets buffered state at discontinuities', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'microphone-2', {
      profile: 'responsive',
    });
    expect(analyzer.finish().events).toEqual([]);
    analyzer.push(chordSignal([48, 52, 55]), 0);
    const chord = analyzer.push(chordSignal([48, 52, 55], 0.16, 0, 1_280, 6_144), 384);
    const discontinuity = analyzer.push(new Float32Array(100), 464, true);
    expect(chord.events[0]?.lifecycle).toBe('provisional');
    expect(discontinuity).toMatchObject({ state: 'warming', events: [{ lifecycle: 'finalized' }] });
  });

  it('uses a longer evidence window by default for the accurate profile', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'accurate-window');

    expect(analyzer.push(chordSignal([48, 52, 55]), 0)).toMatchObject({
      events: [],
      state: 'warming',
    });
    expect(
      analyzer.push(chordSignal([48, 52, 55], 0.16, 0, WINDOW_FRAMES, WINDOW_FRAMES), 384),
    ).toMatchObject({ events: [], state: 'uncertain' });
    expect(analyzer.push(chordSignal([48, 52, 55], 0.16, 0, 1_280, 12_288), 768)).toMatchObject({
      events: [{ lifecycle: 'provisional' }],
      state: 'tracking',
    });
  });

  it('uses short-time evidence to locate a real change while pooling the chord labels', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'multiscale-change');
    const samples = new Float32Array(SAMPLE_RATE * 3);
    samples.set(chordSignal([43, 47, 50, 55, 59], 0.12, 0, SAMPLE_RATE * 1.5), 0);
    samples.set(
      chordSignal([48, 52, 55, 60, 64], 0.12, 0, SAMPLE_RATE * 1.5, SAMPLE_RATE * 1.5),
      SAMPLE_RATE * 1.5,
    );
    const byId = new Map<string, ReturnType<typeof analyzer.push>['events'][number]>();
    for (let offset = 0; offset < samples.length; offset += 2_048) {
      const result = analyzer.push(
        samples.slice(offset, offset + 2_048),
        (offset / SAMPLE_RATE) * 1_000,
      );
      result.events.forEach((event) => byId.set(event.id, event));
    }
    analyzer.finish(3_000).events.forEach((event) => byId.set(event.id, event));
    const events = [...byId.values()];

    expect(events.map((event) => event.candidates[0]?.symbol)).toEqual(['G', 'C']);
    expect(events[0]?.time.endMs).toBeGreaterThan(1_350);
    expect(events[0]?.time.endMs).toBeLessThan(1_650);
  }, 30_000);

  it('does not open chord events for steady low-level room noise', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'room-noise', {
      profile: 'responsive',
    });
    const noise = Float32Array.from(
      { length: SAMPLE_RATE * 3 },
      (_, frame) => 0.002 * Math.sin((2 * Math.PI * 220 * frame) / SAMPLE_RATE),
    );

    expect(streamSamples(analyzer, noise)).toEqual([]);
  });

  it('keeps a decaying strum as one event and releases it before trailing silence', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'decay-release', {
      profile: 'responsive',
    });
    const soundingFrames = SAMPLE_RATE * 3;
    const samples = new Float32Array(SAMPLE_RATE * 5);
    const chord = chordSignal([48, 52, 55], 0.16, 0, soundingFrames);
    chord.forEach((sample, frame) => {
      samples[frame] = sample * Math.exp(-frame / (SAMPLE_RATE * 0.55));
    });

    const events = streamSamples(analyzer, samples);

    expect(events).toHaveLength(1);
    expect(events[0]?.candidates[0]?.symbol).toBe('C');
    expect(events[0]?.time.endMs).toBeLessThan(4_000);
  }, 30_000);

  it('ignores a short-lived challenger inside a stable chord', () => {
    const analyzer = new StreamingProvisionalChordAnalyzer(SAMPLE_RATE, 'short-challenger');
    const samples = new Float32Array(SAMPLE_RATE * 4);
    samples.set(chordSignal([48, 52, 55], 0.13, 0, SAMPLE_RATE * 2), 0);
    samples.set(chordSignal([50, 54, 57], 0.16, 0, 2_560), SAMPLE_RATE * 2);
    samples.set(
      chordSignal([48, 52, 55], 0.13, 0, SAMPLE_RATE * 2 - 2_560, SAMPLE_RATE * 2 + 2_560),
      SAMPLE_RATE * 2 + 2_560,
    );

    expect(streamSamples(analyzer, samples).map((event) => event.candidates[0]?.symbol)).toEqual([
      'C',
    ]);
  }, 30_000);
});
