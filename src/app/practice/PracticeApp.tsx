import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { AdvancedAnalysisDrawer } from './components/AdvancedAnalysisDrawer';
import { AnalysisDetails } from './components/AnalysisDetails';
import { AppHeader } from './components/AppHeader';
import { EditInspector } from './components/EditInspector';
import { InputHud } from './components/InputHud';
import { InputSettingsDrawer } from './components/InputSettingsDrawer';
import { ImportExportDialog } from './components/ImportExportDialog';
import { ReviewPanel } from './components/ReviewPanel';
import { ScorePanel } from './components/ScorePanel';
import { SetlistSidebar } from './components/SetlistSidebar';
import { Transport } from './components/Transport';
import { VideoPanel } from './components/VideoPanel';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import type { PracticeLayout, ScoreView, WorkspaceMode } from './types';
import { usePracticeAudio } from './usePracticeAudio';
import { usePracticeEditor } from './usePracticeEditor';

type AppStyle = CSSProperties & { '--practice-score-width': string };
type UtilityPanel = 'advanced' | 'analysis' | 'input' | null;
type DocumentTransfer = 'export' | 'import' | null;

type PracticeViewport = {
  height: number;
  scale: number;
  width: number;
};

const readPracticeViewport = (): PracticeViewport | null => {
  if (typeof window === 'undefined' || window.visualViewport == null) return null;
  return {
    height: window.visualViewport.height,
    scale: window.visualViewport.scale,
    width: window.visualViewport.width,
  };
};

export function PracticeApp() {
  const audio = usePracticeAudio();
  const editor = usePracticeEditor();
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel>(null);
  const [documentTransfer, setDocumentTransfer] = useState<DocumentTransfer>(null);
  const [layout, setLayout] = useState<PracticeLayout>('split');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [mode, setMode] = useState<WorkspaceMode>('practice');
  const [scoreView, setScoreView] = useState<ScoreView>('combined');
  const [scoreWidth, setScoreWidth] = useState(58);
  const [videoFit, setVideoFit] = useState<'fill' | 'fit'>('fit');
  const [practiceViewport, setPracticeViewport] = useState(readPracticeViewport);
  const splitStage = useRef<HTMLDivElement>(null);
  const activeDocument = editor.state?.history.document;
  const documentTitle = activeDocument?.metadata.title ?? 'Creating blank score…';
  const authoredEventCount =
    activeDocument?.tracks.reduce(
      (trackCount, track) =>
        trackCount +
        track.voices.reduce((voiceCount, voice) => voiceCount + voice.events.length, 0),
      0,
    ) ?? 0;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport == null) return;

    const handleViewportResize = () => setPracticeViewport(readPracticeViewport());
    viewport.addEventListener('resize', handleViewportResize);
    viewport.addEventListener('scroll', handleViewportResize);
    return () => {
      viewport.removeEventListener('resize', handleViewportResize);
      viewport.removeEventListener('scroll', handleViewportResize);
    };
  }, []);

  const constrainedViewport =
    practiceViewport !== null && practiceViewport.scale > 1 ? practiceViewport : null;
  const compactVisualViewport =
    constrainedViewport !== null &&
    constrainedViewport.width > 980 &&
    constrainedViewport.width <= 1100;

  const handleModeChange = (nextMode: WorkspaceMode) => {
    setMode(nextMode);
    setLayout('split');
    setUtilityPanel(null);
  };

  const setSplitFromPointer = (clientX: number) => {
    const bounds = splitStage.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    const percent = ((clientX - bounds.left) / bounds.width) * 100;
    setScoreWidth(Math.min(72, Math.max(44, percent)));
  };

  const handleSplitterDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('is-dragging');
  };

  const handleSplitterMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) setSplitFromPointer(event.clientX);
  };

  const handleSplitterUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('is-dragging');
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <main
      className={`practice-app mode-${mode} layout-${layout} ${libraryOpen ? '' : 'library-closed'}`}
      data-visual-viewport={compactVisualViewport ? 'compact' : undefined}
      style={
        {
          '--practice-score-width': `${String(scoreWidth)}%`,
          height:
            constrainedViewport === null ? undefined : `${String(constrainedViewport.height)}px`,
          width:
            constrainedViewport === null ? undefined : `${String(constrainedViewport.width)}px`,
        } as AppStyle
      }
    >
      <AppHeader
        canRedo={editor.canRedo}
        canUndo={editor.canUndo}
        documentStatus={editor.status}
        documentTitle={documentTitle}
        libraryOpen={libraryOpen}
        mode={mode}
        onModeChange={handleModeChange}
        onRedo={() => void editor.redo()}
        onToggleLibrary={() => setLibraryOpen((value) => !value)}
        onUndo={() => void editor.undo()}
      />
      <SetlistSidebar
        documentTitle={documentTitle}
        hasAuthoredChanges={editor.state?.history.isDirty ?? false}
        onClose={() => setLibraryOpen(false)}
        onCreateNew={() => {
          void editor.createNew();
          handleModeChange('edit');
        }}
        onExport={() => setDocumentTransfer('export')}
        onImport={() => setDocumentTransfer('import')}
      />

      <section className="practice-workspace" aria-label={`${mode} workspace`}>
        {mode === 'review' ? (
          <ReviewPanel audio={audio} onPractice={() => handleModeChange('practice')} />
        ) : (
          <div className="practice-workspace-shell">
            <WorkspaceToolbar
              advancedOpen={utilityPanel === 'advanced'}
              authoredSummary={
                authoredEventCount === 0
                  ? 'Blank score'
                  : `${String(authoredEventCount)} authored ${authoredEventCount === 1 ? 'event' : 'events'}`
              }
              layout={layout}
              mode={mode}
              onAdvancedToggle={() => {
                setUtilityPanel((value) => (value === 'advanced' ? null : 'advanced'));
              }}
              onLayoutChange={setLayout}
              onScoreViewChange={setScoreView}
              scoreView={scoreView}
            />
            <div className="practice-split-stage" ref={splitStage}>
              <ScorePanel editor={editor} scoreView={scoreView} />
              {mode === 'practice' && layout === 'split' && (
                <div
                  aria-label="Resize tab and video panels"
                  aria-orientation="vertical"
                  aria-valuemax={72}
                  aria-valuemin={44}
                  aria-valuenow={Math.round(scoreWidth)}
                  className="practice-splitter"
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                    event.preventDefault();
                    setScoreWidth((value) =>
                      Math.min(72, Math.max(44, value + (event.key === 'ArrowLeft' ? -2 : 2))),
                    );
                  }}
                  onPointerDown={handleSplitterDown}
                  onPointerMove={handleSplitterMove}
                  onPointerUp={handleSplitterUp}
                  role="separator"
                  tabIndex={0}
                />
              )}
              {mode === 'edit' ? (
                <EditInspector editor={editor} />
              ) : (
                <VideoPanel fit={videoFit} onFitChange={setVideoFit} />
              )}
            </div>
          </div>
        )}
      </section>

      <InputHud
        audio={audio}
        detailsOpen={utilityPanel === 'analysis'}
        onConnect={() => void audio.connect()}
        onDetailsToggle={() =>
          setUtilityPanel((value) => (value === 'analysis' ? null : 'analysis'))
        }
        onSettingsToggle={() => {
          setUtilityPanel((value) => (value === 'input' ? null : 'input'));
        }}
        settingsOpen={utilityPanel === 'input'}
      />
      <Transport audio={audio} />

      <AnalysisDetails
        audio={audio}
        onClose={() => setUtilityPanel(null)}
        open={utilityPanel === 'analysis'}
      />
      <InputSettingsDrawer
        audio={audio}
        onClose={() => setUtilityPanel(null)}
        open={utilityPanel === 'input'}
      />
      <AdvancedAnalysisDrawer
        audio={audio}
        onClose={() => setUtilityPanel(null)}
        open={utilityPanel === 'advanced'}
      />
      {documentTransfer !== null && (
        <ImportExportDialog
          editor={editor}
          initialSection={documentTransfer}
          onAccepted={() => {
            setDocumentTransfer(null);
            handleModeChange('edit');
          }}
          onClose={() => setDocumentTransfer(null)}
        />
      )}
    </main>
  );
}
