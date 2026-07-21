import { useCallback, useSyncExternalStore } from 'react';

import type { AudioAnalysisSnapshot } from '../../audio/analysis';
import type { PolyphonicAnalysisSnapshot } from '../../audio/polyphonic';
import {
  defaultDisplayedAudioAnalysis,
  defaultDisplayedPolyphonicAnalysis,
} from '../audioCaptureController';

type SnapshotSource<TSnapshot> = {
  readonly currentSnapshot: TSnapshot;
  subscribe(listener: () => void): () => void;
};

type AudioInputAnalysisMonitorProps = {
  chordAnalysis?: SnapshotSource<PolyphonicAnalysisSnapshot>;
  noteAnalysis?: SnapshotSource<AudioAnalysisSnapshot>;
};

const resultState = (
  lifecycle: 'corrected' | 'finalized' | 'provisional' | undefined,
  analysisMode: 'monitoring' | 'session',
): 'FINAL' | 'LIVE' | 'WAIT' => {
  if (lifecycle === undefined) return 'WAIT';
  return analysisMode === 'monitoring' || lifecycle === 'provisional' ? 'LIVE' : 'FINAL';
};

const formatCents = (cents: number): string => `${cents >= 0 ? '+' : ''}${cents.toFixed(1)}¢`;

const formatQuality = (quality: string): string => quality.replaceAll('-', ' ');

export function AudioInputAnalysisMonitor({
  chordAnalysis = defaultDisplayedPolyphonicAnalysis,
  noteAnalysis = defaultDisplayedAudioAnalysis,
}: AudioInputAnalysisMonitorProps) {
  const subscribeToNotes = useCallback(
    (listener: () => void) => noteAnalysis.subscribe(listener),
    [noteAnalysis],
  );
  const getNoteSnapshot = useCallback(() => noteAnalysis.currentSnapshot, [noteAnalysis]);
  const noteSnapshot = useSyncExternalStore(subscribeToNotes, getNoteSnapshot, getNoteSnapshot);

  const subscribeToChords = useCallback(
    (listener: () => void) => chordAnalysis.subscribe(listener),
    [chordAnalysis],
  );
  const getChordSnapshot = useCallback(() => chordAnalysis.currentSnapshot, [chordAnalysis]);
  const chordSnapshot = useSyncExternalStore(subscribeToChords, getChordSnapshot, getChordSnapshot);

  const noteEvent = noteSnapshot.currentEvent;
  const note = noteEvent?.candidates[0] ?? null;
  const noteState = resultState(noteEvent?.lifecycle, noteSnapshot.analysisMode);
  const chordEvent = chordSnapshot.currentChord;
  const chord = chordEvent?.candidates[0] ?? null;
  const chordState = resultState(chordEvent?.lifecycle, chordSnapshot.analysisMode);

  return (
    <section
      aria-label="Live note and chord analysis"
      aria-live="polite"
      className="audio-input-analysis-monitor"
    >
      <div className="audio-input-analysis-screen">
        <div className="audio-input-analysis-readout is-note">
          <span>Single note</span>
          <strong>{note?.noteName ?? '—'}</strong>
          <small>{note === null ? 'Waiting' : formatCents(note.centsOffset)}</small>
          <em>{noteState}</em>
        </div>

        <div className="audio-input-analysis-readout is-chord">
          <span>Chord</span>
          <strong>{chord?.symbol ?? '—'}</strong>
          <small>
            {chord === null
              ? 'Waiting'
              : `${formatQuality(chord.quality)} · ${String(Math.round(chord.confidence * 100))}%`}
          </small>
          <em>{chordState}</em>
        </div>
      </div>
    </section>
  );
}
