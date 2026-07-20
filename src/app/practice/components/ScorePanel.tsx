import type { CSSProperties } from 'react';

// This component is intentionally module-local so Vite can invalidate it independently.

import { previewMeasures, selectedMeasures } from '../data';
import type { PracticeMeasure, ScoreView } from '../types';
import { PlaceholderBadge } from './PlaceholderBadge';

type ScorePanelProps = {
  playing: boolean;
  view: ScoreView;
};

type NoteStyle = CSSProperties & { '--note-left': string; '--note-top': string };
type FretStyle = CSSProperties & { '--fret-left': string; '--string': number };

function Measure({ measure }: { measure: PracticeMeasure }) {
  return (
    <article
      className="practice-measure"
      aria-label={`Measure ${String(measure.number)}, ${measure.chord}`}
    >
      <header>
        <span>{measure.number}</span>
        <strong>{measure.chord}</strong>
      </header>
      <div
        className="practice-notation"
        aria-label={`Standard notation preview for measure ${String(measure.number)}`}
      >
        {measure.notes.map((note) => (
          <i
            className="practice-notation-note"
            key={`${String(measure.number)}-${String(note.left)}-${String(note.top)}`}
            style={
              {
                '--note-left': `${String(note.left)}%`,
                '--note-top': `${String(note.top)}px`,
              } as NoteStyle
            }
          />
        ))}
      </div>
      <span className="practice-tab-label">TAB</span>
      <div
        className="practice-tablature"
        aria-label={`Guitar tablature for measure ${String(measure.number)}`}
      >
        {measure.frets.map((fret) => (
          <b
            className={
              fret.technique === undefined ? 'practice-fret' : 'practice-fret has-technique'
            }
            data-technique={fret.technique}
            key={`${String(measure.number)}-${String(fret.string)}-${String(fret.left)}`}
            style={{ '--fret-left': `${String(fret.left)}%`, '--string': fret.string } as FretStyle}
          >
            {fret.fret}
          </b>
        ))}
        {measure.frets.map((fret) => (
          <i
            className="practice-rhythm-stem"
            key={`stem-${String(measure.number)}-${String(fret.left)}`}
            style={{ '--fret-left': `${String(fret.left + 4)}%` } as FretStyle}
          />
        ))}
      </div>
    </article>
  );
}

export function ScorePanel({ playing, view }: ScorePanelProps) {
  return (
    <section className={`practice-score-panel is-${view}`} aria-labelledby="practice-score-heading">
      <article className="practice-score-page">
        <header className="practice-score-title">
          <div>
            <span>Lead guitar · phrase 02</span>
            <h1 id="practice-score-heading">Neon River</h1>
          </div>
          <div>
            <PlaceholderBadge compact>Demo score</PlaceholderBadge>
            <p>
              Moderato · ♩ = 86
              <br />
              Standard tuning
            </p>
          </div>
        </header>
        <div className="practice-score-legend">
          <i />
          <span>Selected practice range</span>
          <i className="is-playhead" />
          <span>Playback cursor preview</span>
        </div>
        <div
          className="practice-score-system is-selected"
          aria-label="Selected measures 12 through 15"
        >
          <div
            className={`practice-score-playhead ${playing ? 'is-playing' : ''}`}
            aria-hidden="true"
          />
          {selectedMeasures.map((measure) => (
            <Measure key={measure.number} measure={measure} />
          ))}
        </div>
        {view !== 'fit-range' && (
          <div className="practice-score-system" aria-label="Measures 16 through 19">
            {previewMeasures.map((measure) => (
              <Measure key={measure.number} measure={measure} />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
