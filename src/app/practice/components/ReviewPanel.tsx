import type { PracticeAudioModel } from '../usePracticeAudio';
import { PlaceholderBadge } from './PlaceholderBadge';

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
          <span>{hasTake ? 'Current local session' : 'No completed take selected'}</span>
          <h1 id="practice-review-title">Session evidence review</h1>
        </div>
        <PlaceholderBadge>Assessment placeholder</PlaceholderBadge>
      </header>
      <div className="practice-review-chart">
        <div className="practice-review-measures">
          {[12, 13, 14, 15].map((measure) => (
            <span key={measure}>
              M{measure}
              <small>
                {measure === 12 ? 'Em7' : measure === 13 ? 'Cmaj7' : measure === 14 ? 'G6' : 'D/F♯'}
              </small>
            </span>
          ))}
        </div>
        <div>
          <label>REFERENCE PREVIEW</label>
          <div className="practice-review-wave is-reference" />
        </div>
        <div>
          <label>{hasTake ? 'CURRENT TAKE' : 'TAKE PLACEHOLDER'}</label>
          <div className="practice-review-wave is-take" />
        </div>
      </div>
      <div className="practice-review-cards">
        <section>
          <span>Captured evidence</span>
          <h2>
            {noteCount} notes · {chordCount} chords
          </h2>
          <p>
            {hasTake
              ? 'This count comes from the current local audio session.'
              : 'Record a take to populate real evidence.'}
          </p>
          <button onClick={onPractice} type="button">
            Return to practice
          </button>
        </section>
        <section>
          <span>Weakest transition</span>
          <h2>Not assessed yet</h2>
          <p>
            Expected-versus-observed timing and weak-range navigation are planned but not
            implemented.
          </p>
          <PlaceholderBadge compact>Future assessment</PlaceholderBadge>
        </section>
        <section>
          <span>A/B comparison concept</span>
          <h2>Reference ↔ take</h2>
          <p>
            The waveforms above are illustrative only. Shared seeking and source blending require
            reference playback and alignment.
          </p>
          <input
            aria-label="Reference and take blend placeholder"
            defaultValue="50"
            disabled
            type="range"
          />
        </section>
      </div>
    </section>
  );
}
