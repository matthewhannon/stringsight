import type { PracticeLayout, ScoreView, WorkspaceMode } from '../types';

type WorkspaceToolbarProps = {
  advancedOpen: boolean;
  authoredSummary: string;
  layout: PracticeLayout;
  mode: WorkspaceMode;
  onAdvancedToggle: () => void;
  onLayoutChange: (layout: PracticeLayout) => void;
  onScoreViewChange: (view: ScoreView) => void;
  scoreView: ScoreView;
};

const layouts: readonly { id: PracticeLayout; label: string }[] = [
  { id: 'split', label: 'Tab + Video' },
  { id: 'score', label: 'Tab Focus' },
  { id: 'video', label: 'Video Focus' },
];

const views: readonly { id: ScoreView; label: string }[] = [
  { id: 'combined', label: 'Combined page' },
  { id: 'tab', label: 'Tab-only page' },
  { id: 'fit-range', label: 'Expanded notation continuous' },
];

export function WorkspaceToolbar({
  advancedOpen,
  authoredSummary,
  layout,
  mode,
  onAdvancedToggle,
  onLayoutChange,
  onScoreViewChange,
  scoreView,
}: WorkspaceToolbarProps) {
  return (
    <header className="practice-workspace-toolbar">
      <div className="practice-range-meta">
        <strong>Guitar</strong>
        <span>{authoredSummary}</span>
        <small>Your guitar arrangement</small>
      </div>
      <div className="practice-layout-switch" role="group" aria-label="Practice layout">
        {layouts.map((item) => (
          <button
            aria-pressed={layout === item.id}
            disabled={mode === 'edit'}
            key={item.id}
            onClick={() => onLayoutChange(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="practice-toolbar-actions">
        <div aria-label="Notation view" role="group">
          {views.map((item) => (
            <button
              aria-pressed={scoreView === item.id}
              key={item.id}
              onClick={() => onScoreViewChange(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          aria-controls="practice-advanced-analysis"
          aria-expanded={advancedOpen}
          className="practice-advanced-toggle"
          onClick={onAdvancedToggle}
          type="button"
        >
          Advanced analysis
        </button>
      </div>
    </header>
  );
}
