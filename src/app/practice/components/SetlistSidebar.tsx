import { practiceDocuments } from '../data';
import { PlaceholderBadge } from './PlaceholderBadge';

type SetlistSidebarProps = {
  onClose: () => void;
};

export function SetlistSidebar({ onClose }: SetlistSidebarProps) {
  return (
    <aside className="practice-library" aria-label="Setlist">
      <div className="practice-library-inner">
        <header>
          <span>Setlist</span>
          <button aria-label="Hide setlist" onClick={onClose} type="button">
            ‹
          </button>
        </header>
        <div className="practice-setlist-title">Monday practice</div>
        <nav aria-label="Practice documents">
          {practiceDocuments.map((document, index) => (
            <button
              aria-current={index === 0 ? 'page' : undefined}
              className={index === 0 ? 'is-active' : ''}
              disabled={index !== 0}
              key={document.id}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{document.title}</strong>
                <small>{document.detail}</small>
              </span>
              <i />
            </button>
          ))}
        </nav>
        <div className="practice-library-actions">
          <button disabled type="button">
            ＋ Import score or tab
          </button>
          <button disabled type="button">
            ＋ New guitar part
          </button>
          <PlaceholderBadge compact>Document library placeholder</PlaceholderBadge>
        </div>
        <footer>
          <span>Session summary</span>
          <strong>Not available</strong>
          <small>Practice history is not connected yet</small>
        </footer>
      </div>
    </aside>
  );
}
