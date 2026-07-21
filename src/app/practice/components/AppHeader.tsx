import type { WorkspaceMode } from '../types';
import type { PracticeDocumentStatus } from '../usePracticeEditor';
import { Icon } from './Icon';

type AppHeaderProps = {
  canRedo: boolean;
  canUndo: boolean;
  documentStatus: PracticeDocumentStatus;
  documentTitle: string;
  libraryOpen: boolean;
  mode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  onRedo: () => void;
  onToggleLibrary: () => void;
  onUndo: () => void;
};

const modes: readonly WorkspaceMode[] = ['edit', 'practice', 'review'];

export function AppHeader({
  canRedo,
  canUndo,
  documentStatus,
  documentTitle,
  libraryOpen,
  mode,
  onModeChange,
  onRedo,
  onToggleLibrary,
  onUndo,
}: AppHeaderProps) {
  return (
    <header className="practice-topbar">
      <div className="practice-brand-row">
        <div className="practice-brand" aria-label="StringSight">
          <span className="practice-brand-mark" aria-hidden="true" />
          <span>StringSight</span>
        </div>
        <div className="practice-document-title">
          <strong>{documentTitle}</strong>
          <span aria-live="polite">{documentStatus}</span>
        </div>
      </div>

      <nav className="practice-mode-switch" aria-label="Workspace mode">
        {modes.map((item) => (
          <button
            aria-pressed={mode === item}
            className={`practice-control is-toggle ${mode === item ? 'is-active' : ''}`.trim()}
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
          className="practice-control is-quiet"
          disabled={!canUndo}
          onClick={onUndo}
          type="button"
        >
          Undo
        </button>
        <button
          className="practice-control is-quiet"
          disabled={!canRedo}
          onClick={onRedo}
          type="button"
        >
          Redo
        </button>
        <button
          aria-label={libraryOpen ? 'Hide setlist' : 'Show setlist'}
          className="practice-control is-icon practice-icon-button"
          onClick={onToggleLibrary}
          title={libraryOpen ? 'Hide setlist' : 'Show setlist'}
          type="button"
        >
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
