import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AudioAnalysisController,
  InitialAudioAnalysisSnapshot,
  type AudioAnalysisSnapshot,
} from '../audio/analysis';
import { MicrophoneCapture } from '../audio/capture';
import { CONTRACT_SCHEMA_VERSION, NoteEventSchema, sessionTimestampMs } from '../shared';
import { AudioAnalysisPanel } from './AudioAnalysisPanel';

function analysisWithSnapshot(snapshot: AudioAnalysisSnapshot): AudioAnalysisController {
  const analysis = new AudioAnalysisController(new MicrophoneCapture());
  Object.defineProperty(analysis, 'currentSnapshot', { get: () => snapshot });
  return analysis;
}

const noteEvent = NoteEventSchema.parse({
  candidates: [
    {
      centsOffset: 3.2,
      confidence: 0.94,
      evidence: ['yin-periodicity'],
      frequencyHz: 440.8,
      midi: 69,
      noteName: 'A4',
      pitchClass: 'A',
      rank: 1,
      score: 0.94,
    },
    {
      centsOffset: 3.2,
      confidence: 0.3,
      evidence: ['known-octave-ambiguity'],
      frequencyHz: 220.4,
      midi: 57,
      noteName: 'A3',
      pitchClass: 'A',
      rank: 2,
      score: 0.3,
    },
  ],
  diagnostics: { centsSpread: 4, pitchState: 'tracking' },
  id: 'run-1-note-1',
  kind: 'note',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'yin-energy-monophonic',
    generatedAtMs: 250,
    runId: 'run-1',
    subsystem: 'audio-analysis',
    version: '0.1.0',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 500, startMs: 100 },
});

describe('AudioAnalysisPanel', () => {
  it('explains the empty state before a note is available', () => {
    const analysis = analysisWithSnapshot(InitialAudioAnalysisSnapshot);
    render(<AudioAnalysisPanel analysis={analysis} />);
    expect(
      screen.getByRole('heading', { name: /turn the signal into note candidates/i }),
    ).toBeVisible();
    expect(screen.getByText(/play one clear note/i)).toBeVisible();
    expect(screen.getByText('0 events')).toBeVisible();
    analysis.dispose();
  });

  it('renders the best note, ranked alternative, timing, lifecycle, and diagnostics', () => {
    const analysis = analysisWithSnapshot({
      ...InitialAudioAnalysisSnapshot,
      currentEvent: noteEvent,
      events: [noteEvent],
      maxProcessingLatencyMs: 5.6,
      processingLatencyMs: 2.4,
      runId: 'run-1',
      state: 'tracking',
    });
    render(<AudioAnalysisPanel analysis={analysis} />);
    expect(screen.getAllByText('A4')).toHaveLength(2);
    expect(screen.getByText('440.80 Hz')).toBeVisible();
    expect(screen.getAllByText('+3.2¢')).toHaveLength(2);
    expect(screen.getByText('94% confidence')).toBeVisible();
    expect(screen.getByText('A3')).toBeVisible();
    expect(screen.getByText('finalized')).toBeVisible();
    expect(screen.getByText('2.4 ms')).toBeVisible();
    analysis.dispose();
  });

  it('keeps a rolling window of the latest 24 note events', () => {
    const events = Array.from({ length: 30 }, (_, index) => ({
      ...noteEvent,
      id: `run-1-note-${String(index + 1)}`,
      time: {
        endMs: sessionTimestampMs(index * 100 + 50),
        startMs: sessionTimestampMs(index * 100),
      },
    }));
    const analysis = analysisWithSnapshot({
      ...InitialAudioAnalysisSnapshot,
      events,
      runId: 'run-1',
    });

    render(<AudioAnalysisPanel analysis={analysis} />);

    expect(screen.getByText('Latest 24 of 30 events')).toBeVisible();
    const timeline = screen.getByRole('list', { name: 'Latest note events' });
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(24);
    expect(within(timeline).getByText('0.60s')).toBeVisible();
    expect(within(timeline).getByText('2.90s')).toBeVisible();
    expect(within(timeline).queryByText('0.50s')).not.toBeInTheDocument();
    analysis.dispose();
  });
});
