import type { PracticeAudioModel } from '../usePracticeAudio';
import { Drawer } from './Drawer';

type AdvancedAnalysisDrawerProps = {
  audio: PracticeAudioModel;
  onClose: () => void;
  open: boolean;
};

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
