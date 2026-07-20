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
import { ReviewPanel } from './components/ReviewPanel';
import { ScorePanel } from './components/ScorePanel';
import { SetlistSidebar } from './components/SetlistSidebar';
import { Transport } from './components/Transport';
import { VideoPanel } from './components/VideoPanel';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import type { PracticeLayout, ScoreView, VideoSource, WorkspaceMode } from './types';
import { usePracticeAudio } from './usePracticeAudio';

type AppStyle = CSSProperties & { '--practice-score-width': string };

export function PracticeApp() {
  const audio = usePracticeAudio();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [inputSettingsOpen, setInputSettingsOpen] = useState(false);
  const [layout, setLayout] = useState<PracticeLayout>('split');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [looping, setLooping] = useState(true);
  const [metronome, setMetronome] = useState(true);
  const [mode, setMode] = useState<WorkspaceMode>('practice');
  const [playing, setPlaying] = useState(false);
  const [scoreView, setScoreView] = useState<ScoreView>('combined');
  const [scoreWidth, setScoreWidth] = useState(58);
  const [tempo, setTempo] = useState(86);
  const [videoFit, setVideoFit] = useState<'fill' | 'fit'>('fit');
  const [videoSource, setVideoSource] = useState<VideoSource>('reference');
  const splitStage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.code !== 'Space' || !(target instanceof HTMLElement)) return;
      if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (target.isContentEditable || target.closest('[contenteditable]') !== null) return;
      event.preventDefault();
      setPlaying((value) => !value);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleModeChange = (nextMode: WorkspaceMode) => {
    setMode(nextMode);
    setLayout('split');
    setAdvancedOpen(false);
    setInputSettingsOpen(false);
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
      style={{ '--practice-score-width': `${String(scoreWidth)}%` } as AppStyle}
    >
      <AppHeader
        libraryOpen={libraryOpen}
        mode={mode}
        onModeChange={handleModeChange}
        onToggleLibrary={() => setLibraryOpen((value) => !value)}
      />
      <SetlistSidebar onClose={() => setLibraryOpen(false)} />

      <section className="practice-workspace" aria-label={`${mode} workspace`}>
        {mode === 'review' ? (
          <ReviewPanel audio={audio} onPractice={() => handleModeChange('practice')} />
        ) : (
          <div className="practice-workspace-shell">
            <WorkspaceToolbar
              advancedOpen={advancedOpen}
              layout={layout}
              mode={mode}
              onAdvancedToggle={() => {
                setAdvancedOpen((value) => !value);
                setInputSettingsOpen(false);
              }}
              onLayoutChange={setLayout}
              onScoreViewChange={setScoreView}
              scoreView={scoreView}
            />
            <div className="practice-split-stage" ref={splitStage}>
              <ScorePanel playing={playing} view={scoreView} />
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
                <EditInspector />
              ) : (
                <VideoPanel
                  fit={videoFit}
                  onFitChange={setVideoFit}
                  onSourceChange={setVideoSource}
                  source={videoSource}
                />
              )}
            </div>
          </div>
        )}
      </section>

      <InputHud
        audio={audio}
        detailsOpen={analysisOpen}
        onDetailsToggle={() => setAnalysisOpen((value) => !value)}
        onSettingsToggle={() => {
          setInputSettingsOpen((value) => !value);
          setAdvancedOpen(false);
        }}
        settingsOpen={inputSettingsOpen}
      />
      <Transport
        audio={audio}
        countIn={countIn}
        looping={looping}
        metronome={metronome}
        onCountInToggle={() => setCountIn((value) => !value)}
        onLoopToggle={() => setLooping((value) => !value)}
        onMetronomeToggle={() => setMetronome((value) => !value)}
        onPlayingChange={setPlaying}
        onTempoChange={setTempo}
        playing={playing}
        tempo={tempo}
      />

      <AnalysisDetails audio={audio} open={analysisOpen} />
      <InputSettingsDrawer
        audio={audio}
        onClose={() => setInputSettingsOpen(false)}
        open={inputSettingsOpen}
      />
      <AdvancedAnalysisDrawer
        audio={audio}
        onClose={() => setAdvancedOpen(false)}
        open={advancedOpen}
      />
    </main>
  );
}
