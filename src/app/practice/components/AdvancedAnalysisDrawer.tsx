import type { CSSProperties } from 'react';

import type { PracticeAudioModel } from '../usePracticeAudio';
import { Drawer } from './Drawer';
import { PlaceholderBadge } from './PlaceholderBadge';

type AdvancedAnalysisDrawerProps = {
  audio: PracticeAudioModel;
  onClose: () => void;
  open: boolean;
};

type MidiStyle = CSSProperties & { '--midi-left': string; '--midi-width': string };

const midiNotes = [
  { left: 12, row: 0, width: 18 },
  { left: 32, row: 1, width: 21 },
  { left: 8, row: 2, width: 15 },
  { left: 59, row: 2, width: 19 },
  { left: 22, row: 3, width: 23 },
  { left: 4, row: 4, width: 16 },
  { left: 68, row: 5, width: 24 },
] as const;

export function AdvancedAnalysisDrawer({ audio, onClose, open }: AdvancedAnalysisDrawerProps) {
  const chords = audio.chordAnalysis.currentChord?.candidates.slice(0, 3) ?? [];
  return (
    <Drawer
      className="practice-advanced-drawer"
      eyebrow="Advanced analysis"
      id="practice-advanced-analysis"
      onClose={onClose}
      open={open}
      title="Evidence and interpretations"
    >
      <p className="practice-drawer-intro">
        Detailed evidence stays available without becoming the default practice interface.
      </p>
      <section>
        <span>Ranked chord candidates</span>
        {chords.length === 0 ? (
          <p className="practice-empty-state">
            Connect the microphone and play a chord to populate ranked candidates.
          </p>
        ) : (
          chords.map((chord) => (
            <div className="practice-candidate" key={`${String(chord.rank)}-${chord.symbol}`}>
              <strong>{chord.symbol}</strong>
              <b>{Math.round(chord.confidence * 100)}%</b>
              <small>
                {chord.quality} ·{' '}
                {chord.bass === undefined ? 'bass unresolved' : `bass ${chord.bass}`}
              </small>
            </div>
          ))
        )}
      </section>
      <section>
        <div className="practice-section-heading">
          <span>MIDI interpretation</span>
          <PlaceholderBadge compact>Placeholder</PlaceholderBadge>
        </div>
        <p className="practice-helper-copy">
          The MIDI view is presentation-only until score/MIDI import and synchronization are
          implemented.
        </p>
        <div className="practice-midi-placeholder" aria-label="MIDI visualization placeholder">
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row}>
              {midiNotes
                .filter((note) => note.row === row)
                .map((note) => (
                  <i
                    key={`${String(row)}-${String(note.left)}`}
                    style={
                      {
                        '--midi-left': `${String(note.left)}%`,
                        '--midi-width': `${String(note.width)}%`,
                      } as MidiStyle
                    }
                  />
                ))}
            </div>
          ))}
        </div>
      </section>
      <section>
        <span>Diagnostics</span>
        <dl>
          <div>
            <dt>Chord model</dt>
            <dd>{audio.chordAnalysis.modelState}</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>{audio.chordAnalysis.modelBackend ?? '—'}</dd>
          </div>
          <div>
            <dt>Processing</dt>
            <dd>{audio.chordAnalysis.processingLatencyMs.toFixed(1)} ms</dd>
          </div>
          <div>
            <dt>Dropped chunks</dt>
            <dd>{audio.chordAnalysis.droppedChunks}</dd>
          </div>
        </dl>
      </section>
    </Drawer>
  );
}
