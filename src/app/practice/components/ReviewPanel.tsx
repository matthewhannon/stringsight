import type { PracticeAudioModel } from '../usePracticeAudio';

type ReviewPanelProps = {
  audio: PracticeAudioModel;
  onPractice: () => void;
};

export function ReviewPanel({ audio, onPractice }: ReviewPanelProps) {
  const events = audio.session.session?.events.audio ?? [];
  const noteCount = events.filter(({ kind }) => kind === 'note').length;
  const chordCount = events.filter(({ kind }) => kind === 'chord').length;
  const hasTake = audio.session.session !== null;

  return (
    <section className="practice-review-panel" aria-labelledby="practice-review-title">
      <header>
        <div>
          <span>{hasTake ? 'Current local recording' : 'Record a take to begin'}</span>
          <h1 id="practice-review-title">Recording review</h1>
        </div>
      </header>
      <div className="practice-review-cards">
        <section>
          <span>{hasTake ? 'Detected while recording' : 'No recording selected'}</span>
          <h2>
            {hasTake
              ? `${String(noteCount)} notes · ${String(chordCount)} chords`
              : 'Nothing to review yet'}
          </h2>
          <p>
            {hasTake
              ? 'These results come from the current recording on this device.'
              : 'Connect a microphone and record a take to see detected notes and chords here.'}
          </p>
          <button className="practice-control is-primary" onClick={onPractice} type="button">
            Return to practice
          </button>
        </section>
      </div>
    </section>
  );
}
