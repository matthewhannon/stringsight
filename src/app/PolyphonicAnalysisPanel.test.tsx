import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';

import type { PolyphonicAnalysisSnapshot } from '../audio/polyphonic';
import { ChordEventSchema, CONTRACT_SCHEMA_VERSION, type ChordEvent } from '../shared';
import { PolyphonicAnalysisPanel } from './PolyphonicAnalysisPanel';

const chordEvent = (
  index: number,
  lifecycle: 'finalized' | 'provisional' = 'provisional',
): ChordEvent =>
  ChordEventSchema.parse({
    candidates: [
      {
        bass: 'G',
        confidence: 0.86,
        pitchClasses: ['C', 'E', 'G'],
        quality: 'major',
        rank: 1,
        root: 'C',
        score: 0.94,
        symbol: 'C',
      },
      {
        confidence: 0.64,
        pitchClasses: ['A', 'C', 'E', 'G'],
        quality: 'minor-7',
        rank: 2,
        root: 'A',
        score: 0.72,
        symbol: 'Am7',
      },
      {
        confidence: 0.52,
        pitchClasses: ['C', 'F', 'G'],
        quality: 'suspended-4',
        rank: 3,
        root: 'C',
        score: 0.66,
        symbol: 'Csus4',
      },
      {
        confidence: 0.4,
        pitchClasses: ['C', 'G'],
        quality: 'power',
        rank: 4,
        root: 'C',
        score: 0.59,
        symbol: 'C5',
      },
    ],
    id: `run-1-chord-${String(index)}`,
    kind: 'chord',
    lifecycle,
    provenance: {
      algorithm: 'windowed-spectrum-chord-templates',
      generatedAtMs: index * 100 + 80,
      runId: 'run-1',
      subsystem: 'polyphonic-analysis',
      version: '0.1.0',
    },
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { endMs: index * 100 + 80, startMs: index * 100 },
  });

class FakeAnalysis {
  readonly currentSnapshot: PolyphonicAnalysisSnapshot;
  readonly setChordAnalysisProfile = vi.fn();

  constructor(currentSnapshot: PolyphonicAnalysisSnapshot) {
    this.currentSnapshot = currentSnapshot;
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

const emptySnapshot: PolyphonicAnalysisSnapshot = {
  analysisSampleRate: null,
  chordAnalysisProfile: 'accurate',
  chordEvents: [],
  chroma: Array.from({ length: 12 }, () => 0),
  currentChord: null,
  currentNoteSet: null,
  droppedChunks: 0,
  energy: 0,
  error: null,
  inputSampleRate: null,
  maxProcessingLatencyMs: 0,
  modelBackend: null,
  modelInferenceMs: null,
  modelLoadMs: null,
  modelState: 'not-loaded',
  modelWindowCount: 0,
  noteSetEvents: [],
  processingLatencyMs: 0,
  runComplete: false,
  runId: null,
  state: 'silence',
};

describe('PolyphonicAnalysisPanel', () => {
  it('renders an accessible empty embedded state', () => {
    const analysis = new FakeAnalysis(emptySnapshot);
    render(<PolyphonicAnalysisPanel analysis={analysis} embedded />);

    expect(screen.getByRole('region', { name: 'Chord analysis results' })).toBeVisible();
    expect(screen.getByText('Waiting for a chord')).toBeVisible();
    expect(screen.getByText(/play two or more notes/i)).toBeVisible();
    expect(screen.getByText('0 events')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accurate' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Responsive' }));
    expect(analysis.setChordAnalysisProfile).toHaveBeenCalledWith('responsive');
  });

  it('renders ranked candidates, diagnostics, errors, and a bounded populated timeline', () => {
    const events = Array.from({ length: 17 }, (_, index) => chordEvent(index + 1, 'finalized'));
    const currentChord = chordEvent(18);
    render(
      <PolyphonicAnalysisPanel
        analysis={
          new FakeAnalysis({
            ...emptySnapshot,
            analysisSampleRate: 16_000,
            chordAnalysisProfile: 'responsive',
            chordEvents: [...events, currentChord],
            chroma: [0.3, 0, 0, 0, 0.25, 0, 0, 0.45, 0, 0, 0, 0],
            currentChord,
            droppedChunks: 2,
            energy: 0.12,
            error: 'Model finalization is unavailable.',
            inputSampleRate: 48_000,
            maxProcessingLatencyMs: 8.5,
            modelBackend: 'wasm',
            modelInferenceMs: 125.6,
            modelLoadMs: 420.4,
            modelState: 'ready',
            modelWindowCount: 3,
            processingLatencyMs: 4.2,
            runId: 'run-1',
            state: 'tracking',
          })
        }
      />,
    );

    expect(screen.getByRole('heading', { name: 'Resolve notes played together.' })).toBeVisible();
    expect(screen.getByText('Tracking chord')).toBeVisible();
    expect(screen.getAllByText('C').length).toBeGreaterThan(1);
    expect(screen.getByText('Am7')).toBeVisible();
    expect(screen.getByText('Csus4')).toBeVisible();
    expect(screen.getByText('C5')).toBeVisible();
    expect(screen.getByText('Latest 6 of 18 · 12 earlier hidden')).toBeVisible();
    const timeline = screen.getByRole('list', { name: 'Latest chord events, newest first' });
    const items = within(timeline).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    const newestItem = items.at(0);
    const oldestVisibleItem = items.at(-1);
    if (newestItem === undefined || oldestVisibleItem === undefined) {
      throw new Error('Expected the bounded chord timeline to contain events.');
    }
    expect(within(newestItem).getByText('1.80s')).toBeVisible();
    expect(within(oldestVisibleItem).getByText('1.30s')).toBeVisible();
    expect(within(newestItem).getByText('C')).toBeVisible();
    expect(within(newestItem).getByText('provisional')).toBeVisible();
    expect(within(newestItem).getByText('86% match')).toBeVisible();
    expect(within(newestItem).getByText('Template C E G')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Model finalization is unavailable.');
    expect(screen.getByText('16,000 Hz')).toBeVisible();
    expect(screen.getByText('WASM')).toBeVisible();
    expect(screen.getByText('125.6 ms / 3 windows')).toBeVisible();
    expect(screen.getByText(/shorter look-ahead/i)).toBeVisible();
    expect(screen.getByText('86% match strength')).toBeVisible();
    expect(screen.getAllByText('Template C E G').length).toBeGreaterThan(0);
  });
});
