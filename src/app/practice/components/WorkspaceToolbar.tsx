import type { PracticeLayout, ScoreView, WorkspaceMode } from '../types';

type WorkspaceToolbarProps = {
  advancedOpen: boolean;
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
  { id: 'combined', label: 'Tab + notation' },
  { id: 'tab', label: 'Tab only' },
  { id: 'fit-range', label: 'Fit range' },
];

export function WorkspaceToolbar({
  advancedOpen,
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
        <strong>Lead guitar</strong>
        <span>Measures 12–15 selected</span>
        <small>Em · 4/4</small>
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
        <div role="group" aria-label="Score view">
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
