import type { PracticeAudioModel } from '../usePracticeAudio';

type AnalysisDetailsProps = {
  audio: PracticeAudioModel;
  open: boolean;
};

export function AnalysisDetails({ audio, open }: AnalysisDetailsProps) {
  const noteEvent = audio.noteAnalysis.currentEvent;
  const chordEvent = audio.chordAnalysis.currentChord;
  const notes = noteEvent?.candidates.slice(0, 3) ?? [];
  const chords = chordEvent?.candidates.slice(0, 3) ?? [];

  return (
    <aside
      className={`practice-analysis-details ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      aria-label="Analysis details"
      id="practice-analysis-details"
    >
      <section>
        <span>Detected notes</span>
        <strong>
          {notes.length === 0
            ? 'No stable note yet'
            : notes.map(({ noteName }) => noteName).join(' · ')}
        </strong>
        <p>Live candidates remain provisional while the microphone is monitoring.</p>
      </section>
      <section>
        <span>Ranked chords</span>
        <strong>
          {chords.length === 0
            ? 'Insufficient evidence'
            : chords.map(({ symbol }) => symbol).join(' · ')}
        </strong>
        <p>
          {chords.length === 0
            ? 'Play two or more clear notes together.'
            : 'Alternatives are preserved instead of overwritten.'}
        </p>
      </section>
      <section>
        <span>Lifecycle</span>
        <strong>
          {chordEvent?.lifecycle ??
            (audio.capture.connectionState === 'monitoring' ? 'Live' : 'Inactive')}
        </strong>
        <p>Original detector evidence is saved with completed audio sessions.</p>
      </section>
    </aside>
  );
}
