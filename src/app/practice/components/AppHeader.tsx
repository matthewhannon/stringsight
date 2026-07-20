import type { WorkspaceMode } from '../types';

type AppHeaderProps = {
  libraryOpen: boolean;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onToggleLibrary: () => void;
};

const modes: readonly WorkspaceMode[] = ['edit', 'practice', 'review'];

export function AppHeader({ libraryOpen, mode, onModeChange, onToggleLibrary }: AppHeaderProps) {
  return (
    <header className="practice-topbar">
      <div className="practice-brand-row">
        <div className="practice-brand" aria-label="StringSight">
          <span className="practice-brand-mark" aria-hidden="true" />
          <span>StringSight</span>
        </div>
        <div className="practice-document-title">
          <strong>Neon River — lead study</strong>
          <span>Demo document · unsaved</span>
        </div>
      </div>

      <nav className="practice-mode-switch" aria-label="Workspace mode">
        {modes.map((item) => (
          <button
            aria-pressed={mode === item}
            className={mode === item ? 'is-active' : ''}
            key={item}
            onClick={() => onModeChange(item)}
            type="button"
          >
            {item[0]?.toUpperCase()}
            {item.slice(1)}
          </button>
        ))}
      </nav>

      <div className="practice-top-actions">
        <span className="practice-local-state">
          <i />
          Private on this device
        </span>
        <button
          aria-label={libraryOpen ? 'Hide setlist' : 'Show setlist'}
          className="practice-icon-button"
          onClick={onToggleLibrary}
          type="button"
        >
          ☰
        </button>
        <button
          className="practice-save-button"
          disabled
          title="Document persistence is not connected yet"
          type="button"
        >
          Save unavailable
        </button>
      </div>
    </header>
  );
}
