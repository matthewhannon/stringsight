import type { PracticeAudioModel } from '../usePracticeAudio';
import { Drawer } from './Drawer';

type AnalysisDetailsProps = {
  audio: PracticeAudioModel;
  onClose: () => void;
  open: boolean;
};

export function AnalysisDetails({ audio, onClose, open }: AnalysisDetailsProps) {
  const noteEvent = audio.noteAnalysis.currentEvent;
  const chordEvent = audio.chordAnalysis.currentChord;
  const notes = noteEvent?.candidates.slice(0, 3) ?? [];
  const chords = chordEvent?.candidates.slice(0, 3) ?? [];

  return (
    <Drawer
      eyebrow="Live analysis"
      id="practice-analysis-details"
      onClose={onClose}
      open={open}
      title="What StringSight hears"
    >
      <p className="practice-drawer-intro">
        Start here for the clearest interpretation of your live guitar input.
      </p>
      <section>
        <span>Notes</span>
        <strong>
          {notes.length === 0
            ? 'No clear note yet'
            : notes.map(({ noteName }) => noteName).join(' · ')}
        </strong>
        <p>Results can change as you sustain or release a note.</p>
      </section>
      <section>
        <span>Chord matches</span>
        <strong>
          {chords.length === 0
            ? 'Not enough sound yet'
            : chords.map(({ symbol }) => symbol).join(' · ')}
        </strong>
        <p>
          {chords.length === 0
            ? 'Play two or more clear notes together.'
            : 'The strongest match appears first.'}
        </p>
      </section>
      <section>
        <span>Current state</span>
        <strong>
          {chordEvent?.lifecycle ??
            (audio.capture.connectionState === 'monitoring' ? 'Listening' : 'Not connected')}
        </strong>
        <p>Open Advanced analysis when you need detailed evidence and diagnostics.</p>
      </section>
    </Drawer>
  );
}
