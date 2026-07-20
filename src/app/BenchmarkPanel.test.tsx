import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AudioAnalysisController,
  InitialAudioAnalysisSnapshot,
  type AudioAnalysisSnapshot,
} from '../audio/analysis';
import {
  InitialCaptureSnapshot,
  MicrophoneCapture,
  type CapturedRecording,
  type CaptureSnapshot,
} from '../audio/capture';
import {
  InitialPolyphonicAnalysisSnapshot,
  PolyphonicAnalysisController,
  type PolyphonicAnalysisSnapshot,
} from '../audio/polyphonic';
import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  sessionTimestampMs,
} from '../shared';
import { BenchmarkPanel } from './BenchmarkPanel';

const noteEvent = NoteEventSchema.parse({
  candidates: [
    {
      centsOffset: 0,
      confidence: 0.91,
      evidence: ['yin-periodicity'],
      frequencyHz: 82.41,
      midi: 40,
      noteName: 'E2',
      pitchClass: 'E',
      rank: 1,
      score: 0.91,
    },
  ],
  id: 'benchmark-note-1',
  kind: 'note',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'yin-energy-monophonic',
    generatedAtMs: 500,
    runId: 'benchmark',
    subsystem: 'audio-analysis',
    version: '0.2.1',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 450, startMs: 150 },
});

const chordEvent = ChordEventSchema.parse({
  candidates: [
    {
      bass: 'C',
      confidence: 0.91,
      pitchClasses: ['C', 'E', 'G'],
      quality: 'major',
      rank: 1,
      root: 'C',
      score: 0.96,
      symbol: 'C',
    },
  ],
  id: 'benchmark-chord-1',
  kind: 'chord',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'spotify-basic-pitch-plus-chord-templates',
    generatedAtMs: 500,
    runId: 'benchmark',
    subsystem: 'polyphonic-analysis',
    version: '1.0.1-stringsight.1',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 450, startMs: 150 },
});

function controllers(
  captureSnapshot: CaptureSnapshot,
  analysisSnapshot: AudioAnalysisSnapshot,
  recording: CapturedRecording | null,
  polyphonicSnapshot: PolyphonicAnalysisSnapshot = InitialPolyphonicAnalysisSnapshot,
) {
  const capture = new MicrophoneCapture();
  Object.defineProperty(capture, 'currentSnapshot', { get: () => captureSnapshot });
  Object.defineProperty(capture, 'currentRecording', { get: () => recording });
  const analysis = new AudioAnalysisController(capture);
  Object.defineProperty(analysis, 'currentSnapshot', { get: () => analysisSnapshot });
  const polyphonicAnalysis = new PolyphonicAnalysisController(capture);
  Object.defineProperty(polyphonicAnalysis, 'currentSnapshot', { get: () => polyphonicSnapshot });
  return { analysis, capture, polyphonicAnalysis };
}

describe('BenchmarkPanel', () => {
  it('shows the structured first recording protocol before a take exists', () => {
    const { analysis, capture, polyphonicAnalysis } = controllers(
      InitialCaptureSnapshot,
      InitialAudioAnalysisSnapshot,
      null,
    );
    render(
      <BenchmarkPanel
        analysis={analysis}
        capture={capture}
        polyphonicAnalysis={polyphonicAnalysis}
      />,
    );

    expect(screen.getByRole('heading', { name: /trustworthy test data/i })).toBeVisible();
    expect(screen.getByText(/play E2, A2, D3, G3, B3, then E4/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /download benchmark wav/i })).toBeDisabled();
    analysis.dispose();
    polyphonicAnalysis.dispose();
  });

  it('preselects the best guess and preserves a correction before export', async () => {
    const user = userEvent.setup();
    const recording: CapturedRecording = {
      channelCount: 1,
      data: new Float32Array(16_000),
      discontinuityCount: 0,
      durationMs: 1_000,
      frameCount: 16_000,
      recordedAt: '2026-07-18T05:00:00.000Z',
      sampleRate: 16_000,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      startedAtMs: sessionTimestampMs(50),
    };
    const { analysis, capture, polyphonicAnalysis } = controllers(
      { ...InitialCaptureSnapshot, operationState: 'idle' },
      {
        ...InitialAudioAnalysisSnapshot,
        currentEvent: noteEvent,
        events: [noteEvent],
        runId: 'benchmark',
      },
      recording,
    );
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <BenchmarkPanel
        analysis={analysis}
        capture={capture}
        polyphonicAnalysis={polyphonicAnalysis}
      />,
    );

    const labelsButton = screen.getByRole('button', {
      name: /accept suggestions & download labels/i,
    });
    const noteSelect = screen.getByLabelText('True note for event 1');
    expect(screen.getByText('StringSight: E2')).toBeVisible();
    expect(screen.getByText(/best guesses are ready to export/i)).toBeVisible();
    expect(noteSelect).toHaveValue('40');
    expect(labelsButton).toBeEnabled();
    await user.selectOptions(noteSelect, '41');
    expect(noteSelect).toHaveValue('41');
    expect(labelsButton).toBeEnabled();
    await user.click(labelsButton);
    expect(createObjectUrl).toHaveBeenCalledOnce();
    const exportedBlob = createObjectUrl.mock.calls.at(-1)?.[0];
    expect(exportedBlob).toBeInstanceOf(Blob);
    const fixture = JSON.parse(await (exportedBlob as Blob).text()) as {
      groundTruth: { notes: { midi: number }[] };
      source: { recordedAt: string };
    };
    expect(fixture.groundTruth.notes).toEqual([expect.objectContaining({ midi: 41 })]);
    expect(fixture.source.recordedAt).toBe(recording.recordedAt);
    analysis.dispose();
    polyphonicAnalysis.dispose();
  });

  it('reviews and exports finalized chord suggestions as a private fixture', async () => {
    const user = userEvent.setup();
    const recording: CapturedRecording = {
      channelCount: 1,
      data: new Float32Array(16_000),
      discontinuityCount: 0,
      durationMs: 1_000,
      frameCount: 16_000,
      recordedAt: '2026-07-18T05:00:00.000Z',
      sampleRate: 16_000,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      startedAtMs: sessionTimestampMs(50),
    };
    const { analysis, capture, polyphonicAnalysis } = controllers(
      { ...InitialCaptureSnapshot, operationState: 'idle' },
      InitialAudioAnalysisSnapshot,
      recording,
      {
        ...InitialPolyphonicAnalysisSnapshot,
        chordEvents: [chordEvent],
        currentChord: chordEvent,
        modelState: 'ready',
        runId: 'benchmark',
      },
    );
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chord-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <BenchmarkPanel
        analysis={analysis}
        capture={capture}
        polyphonicAnalysis={polyphonicAnalysis}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Fixture type'), 'chords');
    expect(screen.getByText(/strum C, A minor, G, then E minor/i)).toBeVisible();
    expect(screen.getByText('StringSight: C')).toBeVisible();
    const chordSelect = screen.getByLabelText('True chord for event 1');
    expect(chordSelect).toHaveValue('C');
    await user.selectOptions(chordSelect, 'Am');
    await user.click(screen.getByRole('button', { name: /accept suggestions & download labels/i }));

    const exportedBlob = createObjectUrl.mock.calls.at(-1)?.[0];
    const fixture = JSON.parse(await (exportedBlob as Blob).text()) as {
      groundTruth: { chords: { pitchClasses: number[]; symbol: string }[] };
      tags: string[];
    };
    expect(fixture.groundTruth.chords).toEqual([
      expect.objectContaining({ pitchClasses: [9, 0, 4], symbol: 'Am' }),
    ]);
    expect(fixture.tags).toContain('polyphonic');
    analysis.dispose();
    polyphonicAnalysis.dispose();
  });
});
