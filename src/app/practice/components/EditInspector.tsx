import { PlaceholderBadge } from './PlaceholderBadge';

const techniques = ['Hammer-on', 'Slide', 'Vibrato'] as const;

export function EditInspector() {
  return (
    <aside className="practice-edit-inspector" aria-label="Tab editing inspector">
      <div className="practice-edit-heading">
        <h2>Edit selection</h2>
        <PlaceholderBadge compact>Editor placeholder</PlaceholderBadge>
      </div>
      <p>
        The score editor is not connected yet. These controls demonstrate the intended hierarchy.
      </p>
      <section>
        <span>Rhythm</span>
        <div>
          <strong>1/8 note</strong>
          <button disabled type="button">
            Change
          </button>
        </div>
        <div>
          <strong>Let ring</strong>
          <button disabled type="button">
            Off
          </button>
        </div>
      </section>
      <section>
        <span>Technique</span>
        {techniques.map((technique) => (
          <div key={technique}>
            <strong>{technique}</strong>
            <button disabled type="button">
              Apply
            </button>
          </div>
        ))}
      </section>
      <section>
        <span>Position</span>
        <div>
          <strong>String 3 · fret 5</strong>
          <button disabled type="button">
            Move
          </button>
        </div>
      </section>
    </aside>
  );
}
