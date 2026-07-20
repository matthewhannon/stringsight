import { render, screen, within } from '@testing-library/react';

import { InitialAudioAnalysisSnapshot, type AudioAnalysisSnapshot } from '../../audio/analysis';
import {
  InitialPolyphonicAnalysisSnapshot,
  type PolyphonicAnalysisSnapshot,
} from '../../audio/polyphonic';
import { ChordEventSchema, CONTRACT_SCHEMA_VERSION, NoteEventSchema } from '../../shared';
import { AudioInputAnalysisMonitor } from './AudioInputAnalysisMonitor';

class SnapshotSource<TSnapshot> {
  readonly currentSnapshot: TSnapshot;

  constructor(currentSnapshot: TSnapshot) {
    this.currentSnapshot = currentSnapshot;
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

const provenance = {
  algorithm: 'test-analysis',
  generatedAtMs: 200,
  runId: 'run-1',
  subsystem: 'audio-analysis' as const,
  version: '0.1.0',
};

const noteSnapshot: AudioAnalysisSnapshot = {
  ...InitialAudioAnalysisSnapshot,
  currentEvent: NoteEventSchema.parse({
    candidates: [
      {
        centsOffset: 3.2,
        confidence: 0.94,
        evidence: ['test'],
        frequencyHz: 440.8,
        midi: 69,
        noteName: 'A4',
        pitchClass: 'A',
        rank: 1,
        score: 0.94,
      },
    ],
    id: 'run-1-note-1',
    kind: 'note',
    lifecycle: 'finalized',
    provenance,
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { endMs: 500, startMs: 100 },
  }),
  state: 'tracking',
};

const chordSnapshot: PolyphonicAnalysisSnapshot = {
  ...InitialPolyphonicAnalysisSnapshot,
  analysisMode: 'monitoring',
  currentChord: ChordEventSchema.parse({
    candidates: [
      {
        confidence: 0.86,
        pitchClasses: ['C', 'E', 'G'],
        quality: 'major',
        rank: 1,
        root: 'C',
        score: 0.94,
        symbol: 'C',
      },
    ],
    id: 'run-1-chord-1',
    kind: 'chord',
    lifecycle: 'provisional',
    provenance: { ...provenance, subsystem: 'polyphonic-analysis' },
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { startMs: 100 },
  }),
  state: 'tracking',
};

describe('AudioInputAnalysisMonitor', () => {
  it('renders empty note and chord fields without inventing analysis', () => {
    render(
      <AudioInputAnalysisMonitor
        chordAnalysis={new SnapshotSource(InitialPolyphonicAnalysisSnapshot)}
        noteAnalysis={new SnapshotSource(InitialAudioAnalysisSnapshot)}
      />,
    );

    const monitor = screen.getByRole('region', { name: 'Live note and chord analysis' });
    expect(within(monitor).getAllByText('—')).toHaveLength(2);
    expect(within(monitor).getAllByText('Waiting')).toHaveLength(2);
    expect(within(monitor).getAllByText('WAIT')).toHaveLength(2);
  });

  it('shows concise note and chord results from the existing display snapshots', () => {
    render(
      <AudioInputAnalysisMonitor
        chordAnalysis={new SnapshotSource(chordSnapshot)}
        noteAnalysis={new SnapshotSource(noteSnapshot)}
      />,
    );

    const monitor = screen.getByRole('region', { name: 'Live note and chord analysis' });
    expect(within(monitor).getByText('A4')).toBeVisible();
    expect(within(monitor).getByText('+3.2¢ · 94%')).toBeVisible();
    expect(within(monitor).getByText('FINAL')).toBeVisible();
    expect(within(monitor).getByText('C')).toBeVisible();
    expect(within(monitor).getByText('major · 86%')).toBeVisible();
    expect(within(monitor).getByText('LIVE')).toBeVisible();
  });
});
