import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      centsOffset: 18.3,
      confidence: 0.69,
      evidence: ['yin-periodicity', 'temporal-median'],
      frequencyHz: 249.56,
      midi: 59,
      noteName: 'B3',
      pitchClass: 'B',
      rank: 1,
      score: 0.69,
    },
    {
      centsOffset: 18.3,
      confidence: 0.22,
      evidence: ['known-octave-ambiguity'],
      frequencyHz: 124.78,
      midi: 47,
      noteName: 'B2',
      pitchClass: 'B',
      rank: 2,
      score: 0.22,
    },
  ],
  diagnostics: { centsSpread: 4, pitchState: 'tracking' },
  id: 'run-1-note-1',
  kind: 'note',
  lifecycle: 'finalized',
  provenance: {
    algorithm: 'yin-energy-monophonic',
    generatedAtMs: 500,
    runId: 'run-1',
    subsystem: 'audio-analysis',
    version: '0.1.0',
  },
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  time: { endMs: 500, startMs: 100 },
});

describe('AudioAnalysisPanel', () => {
  it('uses a compact listening state before a note is available', () => {
    const analysis = analysisWithSnapshot(InitialAudioAnalysisSnapshot);
    render(<AudioAnalysisPanel analysis={analysis} />);

    expect(screen.getByRole('heading', { name: 'Pitch analysis' })).toBeVisible();
    expect(screen.getByText('Listening for a clear note')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Tuning offset unavailable' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Recent note history' })).not.toBeInTheDocument();
    expect(screen.queryByText(/candidate match/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ranked alternatives/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    analysis.dispose();
  });

  it('groups the detected note and tuning facts without redundant coaching or signal labels', async () => {
    const user = userEvent.setup();
    const analysis = analysisWithSnapshot({
      ...InitialAudioAnalysisSnapshot,
      analysisMode: 'monitoring',
      currentEvent: noteEvent,
      events: [noteEvent],
      maxProcessingLatencyMs: 5.6,
      processingLatencyMs: 2.4,
      runId: 'monitoring-1',
      state: 'tracking',
    });

    render(<AudioAnalysisPanel analysis={analysis} />);

    expect(screen.getByText('B3')).toBeVisible();
    expect(screen.getByText(/\+18\.3¢/)).toHaveTextContent('sharp');
    expect(screen.getByText('249.56 Hz')).toBeVisible();
    expect(screen.getByText('246.94 Hz')).toBeVisible();
    expect(screen.queryByText('Lower pitch slightly')).not.toBeInTheDocument();
    expect(screen.queryByText(/Stable signal/)).not.toBeInTheDocument();
    expect(screen.queryByText(/High confidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/69%/)).not.toBeInTheDocument();
    expect(screen.queryByText('B2')).not.toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Tuning offset' })).toHaveAttribute(
      'aria-valuetext',
      '+18.3¢, sharp',
    );
    expect(screen.queryByRole('region', { name: 'Recent note history' })).not.toBeInTheDocument();

    const details = screen.getByRole('button', { name: 'Analysis details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    await user.click(details);
    expect(screen.getByRole('button', { name: 'Hide analysis details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByLabelText('Note analysis diagnostics')).toBeVisible();
    expect(screen.getByText('2.4 ms')).toBeVisible();
    expect(screen.getByText('monitoring-1')).toBeVisible();
    analysis.dispose();
  });

  it('keeps an analysis failure visible without a redundant signal-loss label', () => {
    const analysis = analysisWithSnapshot({
      ...InitialAudioAnalysisSnapshot,
      error: 'Pitch analysis stopped. Reconnect the input to try again.',
      state: 'uncertain',
    });

    render(<AudioAnalysisPanel analysis={analysis} embedded />);

    expect(screen.queryByText('Signal lost')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Reconnect the input');
    expect(screen.queryByLabelText('Note analysis diagnostics')).not.toBeInTheDocument();
    analysis.dispose();
  });

  it('opens analysis details from the keyboard', async () => {
    const user = userEvent.setup();
    const analysis = analysisWithSnapshot(InitialAudioAnalysisSnapshot);

    render(<AudioAnalysisPanel analysis={analysis} embedded />);

    const detailLink = screen.getByRole('button', { name: 'Analysis details' });
    await user.tab();
    expect(detailLink).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Note analysis diagnostics')).toBeVisible();
    analysis.dispose();
  });

  it('shows only a thin bounded history with analysis details', async () => {
    const user = userEvent.setup();
    const events = Array.from({ length: 8 }, (_, index) => ({
      ...noteEvent,
      id: `run-1-note-${String(index + 1)}`,
      time: {
        endMs: sessionTimestampMs(index * 500 + 400),
        startMs: sessionTimestampMs(index * 500),
      },
    }));
    const analysis = analysisWithSnapshot({
      ...InitialAudioAnalysisSnapshot,
      currentEvent: events.at(-1) ?? null,
      events,
      runId: 'run-1',
      state: 'tracking',
    });

    render(<AudioAnalysisPanel analysis={analysis} />);

    expect(screen.queryByRole('region', { name: 'Recent note history' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Analysis details' }));

    const history = screen.getByRole('region', { name: 'Recent note history' });
    const timeline = within(history).getByRole('list', {
      name: 'Recent note history, oldest first',
    });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    const firstItem = items[0];
    if (firstItem === undefined) throw new Error('Expected a visible history event.');
    expect(within(firstItem).getByText('0.40s')).toBeVisible();
    expect(within(firstItem).getByText('+18.3¢ median')).toBeVisible();
    expect(within(firstItem).getByText('4.0¢ variation')).toBeVisible();
    expect(within(history).queryByText(/confidence/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hide analysis details' }));
    expect(screen.queryByRole('region', { name: 'Recent note history' })).not.toBeInTheDocument();
    analysis.dispose();
  });

  it('does not show history for multiple provisional notes without duration data', async () => {
    const user = userEvent.setup();
    const events = Array.from({ length: 8 }, (_, index) => ({
      ...noteEvent,
      id: `monitoring-1-note-${String(index + 1)}`,
      lifecycle: 'provisional' as const,
      time: { startMs: sessionTimestampMs(index * 100) },
    }));
    const analysis = analysisWithSnapshot({
      ...InitialAudioAnalysisSnapshot,
      analysisMode: 'monitoring',
      currentEvent: events.at(-1) ?? null,
      events,
      runId: 'monitoring-1',
      state: 'tracking',
    });

    render(<AudioAnalysisPanel analysis={analysis} />);

    await user.click(screen.getByRole('button', { name: 'Analysis details' }));
    expect(screen.queryByRole('region', { name: 'Recent note history' })).not.toBeInTheDocument();
    analysis.dispose();
  });
});
