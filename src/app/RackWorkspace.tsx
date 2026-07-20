import { useCallback, useSyncExternalStore, type ComponentType } from 'react';

import { MONOPHONIC_ANALYZER_VERSION } from '../audio/analysis';
import type { CaptureSnapshot } from '../audio/capture';
import {
  Rack,
  RackModule,
  RackStatus,
  RackValue,
  type RackModuleSize,
  type RackStatusTone,
} from '../ui/rack';
import { AudioAnalysisPanel } from './AudioAnalysisPanel';
import { AudioCapturePanel } from './AudioCapturePanel';
import { BenchmarkPanel } from './BenchmarkPanel';
import { PolyphonicAnalysisPanel } from './PolyphonicAnalysisPanel';
import { SessionReviewPanel } from './SessionReviewPanel';
import { defaultAudioSession } from './audioCaptureController';
import { summarizeInterpretations } from './theoryPresentation';

type EmbeddedToolProps = {
  embedded?: boolean;
};

type WorkspaceModuleDefinition = {
  Component: ComponentType<EmbeddedToolProps>;
  description: string;
  id: string;
  size: RackModuleSize;
  title: string;
  unit: string;
};

const workspaceModules: readonly WorkspaceModuleDefinition[] = [
  {
    Component: AudioCapturePanel,
    description: 'Device routing, calibrated level monitoring, recording, and replay.',
    id: 'capture',
    size: 'expanded',
    title: 'Audio input',
    unit: 'INPUT · 01',
  },
  {
    Component: AudioAnalysisPanel,
    description: 'Live monophonic onset, pitch candidates, confidence, and event history.',
    id: 'analysis',
    size: 'expanded',
    title: 'Pitch analysis',
    unit: 'ANALYSIS · 02',
  },
  {
    Component: PolyphonicAnalysisPanel,
    description: 'Provisional chroma evidence, ranked chord candidates, and finalized note sets.',
    id: 'polyphonic-analysis',
    size: 'expanded',
    title: 'Chord analysis',
    unit: 'ANALYSIS · 03',
  },
  {
    Component: SessionReviewPanel,
    description:
      'Inspect raw predictions, append corrections, restore sessions, and export evidence.',
    id: 'session-review',
    size: 'expanded',
    title: 'Session review',
    unit: 'REVIEW · 04',
  },
  ...(import.meta.env.DEV
    ? [
        {
          Component: BenchmarkPanel,
          description: 'Review captured events and export private evaluation fixtures.',
          id: 'benchmark',
          size: 'expanded' as const,
          title: 'Evaluation bench',
          unit: 'TOOLS · 05',
        },
      ]
    : []),
];

const sessionStateLabels: Record<CaptureSnapshot['state'], string> = {
  failed: 'Needs attention',
  idle: 'Ready',
  paused: 'Paused',
  'ready-to-replay': 'Take ready',
  recording: 'Recording',
  replaying: 'Replaying',
  'requesting-permission': 'Awaiting permission',
  starting: 'Starting',
  stopping: 'Finalizing',
  unsupported: 'Unsupported browser',
};

const sessionStatusTone = (state: CaptureSnapshot['state']): RackStatusTone => {
  if (state === 'recording' || state === 'replaying') return 'active';
  if (state === 'paused') return 'warning';
  if (state === 'failed' || state === 'unsupported') return 'danger';
  if (state === 'requesting-permission' || state === 'starting' || state === 'stopping') {
    return 'warning';
  }
  return 'idle';
};

const formatSessionDuration = (milliseconds: number): string => {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(totalTenths % 10)}`;
};

function SessionModule() {
  const subscribe = useCallback(
    (listener: () => void) => defaultAudioSession.subscribe(listener),
    [],
  );
  const getSnapshot = useCallback(() => defaultAudioSession.currentSnapshot, []);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sampleRate = snapshot.capture.device?.sampleRate;
  const interpretationPending = snapshot.session !== null && snapshot.session.status !== 'complete';
  const key = summarizeInterpretations(
    snapshot.keyInterpretations.map(({ key: interpretation, score }) => ({
      name: interpretation.name,
      score,
    })),
  );
  const scale = summarizeInterpretations(
    snapshot.scaleInterpretations.map(({ scale: interpretation, score }) => ({
      name: interpretation.name,
      score,
    })),
  );
  const audioEvents = snapshot.session?.events.audio ?? [];
  const noteCount = audioEvents.filter(({ kind }) => kind === 'note').length;
  const chordCount = audioEvents.filter(({ kind }) => kind === 'chord').length;

  return (
    <RackModule
      description="Current browser session and processing boundary."
      moduleId="session"
      size="compact"
      status={sessionStateLabels[snapshot.capture.state]}
      statusTone={sessionStatusTone(snapshot.capture.state)}
      title="Session control"
      unit="SS · 00"
    >
      <div className="rack-session-strip">
        <RackValue label="MODE" value="LOCAL" />
        <RackValue
          label="AUDIO"
          value={
            sampleRate === null || sampleRate === undefined
              ? 'NOT ACTIVE'
              : `${sampleRate.toLocaleString()} Hz`
          }
        />
        <RackValue label="ANALYZER" value={`MONO v${MONOPHONIC_ANALYZER_VERSION}`} />
        <RackValue label="SESSION" value={formatSessionDuration(snapshot.capture.elapsedMs)} />
        <RackValue
          label={key.ambiguous ? 'KEY · AMBIG' : 'KEY'}
          value={interpretationPending ? 'AFTER STOP' : key.value}
        />
        <RackValue
          label={scale.ambiguous ? 'SCALE · AMBIG' : 'SCALE'}
          value={interpretationPending ? 'AFTER STOP' : scale.value}
        />
        <RackValue label="NOTES" value={String(noteCount).padStart(2, '0')} />
        <RackValue label="CHORDS" value={String(chordCount).padStart(2, '0')} />
      </div>
    </RackModule>
  );
}

export function RackWorkspace() {
  return (
    <div className="rack-workspace">
      <header className="rack-workspace-header">
        <div className="rack-workspace-title">
          <span className="brand-mark" aria-hidden="true">
            SS
          </span>
          <div>
            <h1>StringSight rack workspace</h1>
            <span>Audio processing workstation</span>
          </div>
        </div>
        <RackStatus>Runs locally</RackStatus>
      </header>

      <main className="rack-workspace-main">
        <Rack>
          <SessionModule />
          {workspaceModules.map(({ Component, ...module }) => (
            <RackModule
              description={module.description}
              key={module.id}
              moduleId={module.id}
              size={module.size}
              title={module.title}
              unit={module.unit}
            >
              <Component embedded />
            </RackModule>
          ))}
        </Rack>
      </main>
      <footer className="rack-workspace-footer">
        <span>MIT licensed</span>
        <a href="/THIRD_PARTY_LICENSES.txt">Open-source notices</a>
      </footer>
    </div>
  );
}
