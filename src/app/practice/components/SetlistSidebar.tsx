import { useState } from 'react';
import { Icon } from './Icon';

type SetlistSidebarProps = {
  documentTitle: string;
  hasAuthoredChanges: boolean;
  onClose: () => void;
  onCreateNew: () => void;
  onExport: () => void;
  onImport: () => void;
};

export function SetlistSidebar({
  documentTitle,
  hasAuthoredChanges,
  onClose,
  onCreateNew,
  onExport,
  onImport,
}: SetlistSidebarProps) {
  const [confirmNew, setConfirmNew] = useState(false);

  const requestNew = (): void => {
    if (hasAuthoredChanges) setConfirmNew(true);
    else onCreateNew();
  };

  return (
    <aside className="practice-library" aria-label="Document library">
      <div className="practice-library-inner">
        <header>
          <span>Library</span>
          <button
            aria-label="Hide library"
            className="practice-control is-icon"
            onClick={onClose}
            title="Hide library"
            type="button"
          >
            <Icon name="chevron-left" />
          </button>
        </header>
        <div className="practice-setlist-title">Local workspace</div>
        <nav aria-label="Practice documents">
          <button aria-current="page" className="is-active" type="button">
            <span>01</span>
            <span>
              <strong>{documentTitle}</strong>
              <small>Active authored score</small>
            </span>
          </button>
        </nav>
        <div className="practice-library-actions">
          <button className="practice-control is-primary" onClick={requestNew} type="button">
            <Icon name="plus" />
            New guitar tab
          </button>
          <button className="practice-control is-secondary" onClick={onImport} type="button">
            <Icon name="import" />
            Import score
          </button>
          <button className="practice-control is-secondary" onClick={onExport} type="button">
            <Icon name="export" />
            Export MIDI
          </button>
        </div>
        {confirmNew && (
          <div
            aria-labelledby="replace-score-heading"
            className="practice-new-confirm"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmNew(false);
            }}
            role="alertdialog"
          >
            <h2 id="replace-score-heading">Replace this working copy?</h2>
            <p>Unsaved authored changes cannot be recovered because storage is not connected.</p>
            <div>
              <button autoFocus onClick={() => setConfirmNew(false)} type="button">
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmNew(false);
                  onCreateNew();
                }}
                type="button"
              >
                Create blank score
              </button>
            </div>
          </div>
        )}
        <footer>
          <small>Changes exist only for this browser session.</small>
          <a href="/open-source/alphatab-1.8.4/ALPHATAB-NOTICE.md">Open-source notices</a>
        </footer>
      </div>
    </aside>
  );
}
