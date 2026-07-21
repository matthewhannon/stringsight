import { useCallback, useEffect, useState, useSyncExternalStore, type DragEvent } from 'react';

import { MONOPHONIC_ANALYZER_VERSION } from '../audio/analysis';
import type { CaptureSnapshot } from '../audio/capture';
import {
  Rack,
  RackButton,
  RackModule,
  RackStatus,
  RackValue,
  type RackStatusTone,
} from '../ui/rack';
import { AudioCapturePanel } from './AudioCapturePanel';
import { defaultAudioSession } from './audioCaptureController';
import {
  AvailableWorkspaceModuleIds,
  AvailableWorkspaceModules,
  WorkspaceModuleRegistry,
  type OptionalWorkspaceModuleId,
  type WorkspaceModuleDefinition,
} from './rackWorkspaceModules';
import { summarizeInterpretations } from './theoryPresentation';
import {
  addWorkspaceModule,
  loadWorkspaceLayout,
  moveWorkspaceModule,
  placeWorkspaceModule,
  removeWorkspaceModule,
  saveWorkspaceLayout,
  workspaceLayoutStorage,
  type WorkspaceLayout,
} from './workspaceLayout';

const sessionStateLabel = (snapshot: CaptureSnapshot): string => {
  if (snapshot.operationState === 'recording') return 'Recording';
  if (snapshot.operationState === 'paused') return 'Paused';
  if (snapshot.operationState === 'finalizing') return 'Finalizing';
  if (snapshot.operationState === 'replaying') return 'Replaying';
  if (snapshot.operationState === 'failed') return 'Recording needs attention';
  if (snapshot.connectionState === 'monitoring') return 'Connected · not recording';
  if (snapshot.connectionState === 'connecting') return 'Connecting microphone';
  if (snapshot.connectionState === 'failed') return 'Microphone needs attention';
  if (snapshot.connectionState === 'unsupported') return 'Unsupported browser';
  return snapshot.bufferedDurationMs > 0 ? 'Take ready · microphone disconnected' : 'Disconnected';
};

const sessionStatusTone = (snapshot: CaptureSnapshot): RackStatusTone => {
  if (snapshot.operationState === 'recording' || snapshot.operationState === 'replaying') {
    return 'active';
  }
  if (snapshot.operationState === 'paused' || snapshot.operationState === 'finalizing') {
    return 'warning';
  }
  if (
    snapshot.operationState === 'failed' ||
    snapshot.connectionState === 'failed' ||
    snapshot.connectionState === 'unsupported'
  ) {
    return 'danger';
  }
  return 'idle';
};

const formatSessionDuration = (milliseconds: number): string => {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(totalTenths % 10)}`;
};

const RequiredModule = () => <span className="rack-required-module">Required</span>;

function SessionModule({ editing }: { editing: boolean }) {
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
      actions={editing ? <RequiredModule /> : undefined}
      description="Current browser session and processing boundary."
      moduleId="session"
      size="compact"
      status={sessionStateLabel(snapshot.capture)}
      statusTone={sessionStatusTone(snapshot.capture)}
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

type RackModuleEditControlsProps = {
  definition: WorkspaceModuleDefinition;
  index: number;
  moduleCount: number;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, id: OptionalWorkspaceModuleId) => void;
  onMove: (id: OptionalWorkspaceModuleId, offset: -1 | 1) => void;
  onRemove: (id: OptionalWorkspaceModuleId) => void;
};

function RackModuleEditControls({
  definition,
  index,
  moduleCount,
  onDragEnd,
  onDragStart,
  onMove,
  onRemove,
}: RackModuleEditControlsProps) {
  return (
    <div
      aria-label={`${definition.title} rack controls`}
      className="rack-module-edit-controls"
      role="group"
    >
      <button
        aria-label={`Drag ${definition.title} to reorder`}
        className="rack-module-drag-handle"
        draggable
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(event, definition.id)}
        title={`Drag ${definition.title}`}
        type="button"
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <button
        aria-label={`Move ${definition.title} up`}
        disabled={index === 0}
        onClick={() => onMove(definition.id, -1)}
        type="button"
      >
        ↑
      </button>
      <button
        aria-label={`Move ${definition.title} down`}
        disabled={index === moduleCount - 1}
        onClick={() => onMove(definition.id, 1)}
        type="button"
      >
        ↓
      </button>
      <button
        aria-label={`Remove ${definition.title} from rack`}
        className="is-remove"
        onClick={() => onRemove(definition.id)}
        type="button"
      >
        Remove
      </button>
    </div>
  );
}

type DropTarget = {
  id: OptionalWorkspaceModuleId;
  position: 'after' | 'before';
};

export function RackWorkspace() {
  const storage = workspaceLayoutStorage();
  const [layout, setLayout] = useState<WorkspaceLayout>(() =>
    loadWorkspaceLayout(storage, AvailableWorkspaceModuleIds),
  );
  const [editing, setEditing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [draggedModuleId, setDraggedModuleId] = useState<OptionalWorkspaceModuleId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => saveWorkspaceLayout(storage, layout), [layout, storage]);

  const installedModules = layout.optionalModuleIds.map((id) => WorkspaceModuleRegistry[id]);

  const addModule = (definition: WorkspaceModuleDefinition) => {
    setLayout((current) => addWorkspaceModule(current, definition.id, AvailableWorkspaceModuleIds));
    setAnnouncement(`${definition.title} added to the rack.`);
  };

  const moveModule = (id: OptionalWorkspaceModuleId, offset: -1 | 1) => {
    const definition = WorkspaceModuleRegistry[id];
    setLayout((current) => moveWorkspaceModule(current, id, offset));
    setAnnouncement(`${definition.title} moved ${offset === -1 ? 'up' : 'down'}.`);
  };

  const removeModule = (id: OptionalWorkspaceModuleId) => {
    if (!layout.optionalModuleIds.includes(id)) return;
    setLayout((current) => removeWorkspaceModule(current, id));
    if (layout.optionalModuleIds.length === 1) setEditing(false);
    setAnnouncement(`${WorkspaceModuleRegistry[id].title} removed from the rack.`);
  };

  const startDragging = (event: DragEvent<HTMLButtonElement>, id: OptionalWorkspaceModuleId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setDraggedModuleId(id);
    setDropTarget(null);
  };

  const stopDragging = () => {
    setDraggedModuleId(null);
    setDropTarget(null);
  };

  const dragOverModule = (event: DragEvent<HTMLDivElement>, id: OptionalWorkspaceModuleId) => {
    if (draggedModuleId === null || draggedModuleId === id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    setDropTarget({ id, position });
  };

  const dropModule = (event: DragEvent<HTMLDivElement>, id: OptionalWorkspaceModuleId) => {
    event.preventDefault();
    if (draggedModuleId === null || draggedModuleId === id) {
      stopDragging();
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    const definition = WorkspaceModuleRegistry[draggedModuleId];
    setLayout((current) => placeWorkspaceModule(current, draggedModuleId, id, position));
    setAnnouncement(`${definition.title} reordered.`);
    stopDragging();
  };

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
          <SessionModule editing={editing} />

          <RackModule
            actions={editing ? <RequiredModule /> : undefined}
            moduleId="capture"
            size="expanded"
            title="Audio input"
            unit="INPUT · 01"
          >
            <AudioCapturePanel embedded />
          </RackModule>

          <section aria-label="Rack module management" className="rack-module-manager">
            <div>
              <span>Optional modules</span>
              <strong>{String(installedModules.length).padStart(2, '0')} installed</strong>
            </div>
            <div>
              <RackButton
                aria-controls="rack-module-library"
                aria-expanded={libraryOpen}
                onClick={() => {
                  setLibraryOpen((open) => !open);
                  setEditing(false);
                }}
              >
                {libraryOpen ? 'Close library' : '+ Add module'}
              </RackButton>
              <RackButton
                aria-pressed={editing}
                disabled={!editing && installedModules.length === 0}
                onClick={() => {
                  setEditing((active) => !active);
                  setLibraryOpen(false);
                }}
              >
                {editing ? 'Done' : 'Edit rack'}
              </RackButton>
            </div>
          </section>

          {libraryOpen && (
            <section
              aria-label="Module library"
              className="rack-module-library"
              id="rack-module-library"
            >
              <header>
                <div>
                  <span>Module library</span>
                  <strong>Choose detailed workspace views</strong>
                </div>
                <small>Audio processing continues independently of visible modules.</small>
              </header>
              <div className="rack-module-library-grid">
                {AvailableWorkspaceModules.map((definition) => {
                  const installed = layout.optionalModuleIds.includes(definition.id);
                  return (
                    <article key={definition.id}>
                      <div>
                        <span>MODULE · {definition.unit}</span>
                        {definition.recommended === true && <em>Recommended</em>}
                      </div>
                      <strong>{definition.title}</strong>
                      <p>{definition.libraryDescription}</p>
                      <RackButton
                        aria-label={
                          installed ? `${definition.title} added` : `Add ${definition.title}`
                        }
                        disabled={installed}
                        onClick={() => addModule(definition)}
                        variant={installed ? 'hardware' : 'primary'}
                      >
                        {installed ? 'Added' : 'Add'}
                      </RackButton>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <span aria-live="polite" className="rack-module-announcement">
            {announcement}
          </span>

          {installedModules.map((definition, index) => {
            const targetClass =
              dropTarget?.id === definition.id ? ` is-drop-${dropTarget.position}` : '';
            return (
              <div
                className={`rack-optional-module ${editing ? 'is-editing' : ''}${targetClass}`}
                key={definition.id}
                onDragOver={(event) => dragOverModule(event, definition.id)}
                onDrop={(event) => dropModule(event, definition.id)}
              >
                <RackModule
                  actions={
                    editing ? (
                      <RackModuleEditControls
                        definition={definition}
                        index={index}
                        moduleCount={installedModules.length}
                        onDragEnd={stopDragging}
                        onDragStart={startDragging}
                        onMove={moveModule}
                        onRemove={removeModule}
                      />
                    ) : undefined
                  }
                  {...(definition.description === undefined
                    ? {}
                    : { description: definition.description })}
                  moduleId={definition.id}
                  size="expanded"
                  title={definition.title}
                  unit={`MODULE · ${definition.unit}`}
                >
                  <definition.Component embedded />
                </RackModule>
              </div>
            );
          })}
        </Rack>
      </main>
      <footer className="rack-workspace-footer">
        <span>MIT licensed</span>
        <a href="/THIRD_PARTY_LICENSES.txt">Open-source notices</a>
      </footer>
    </div>
  );
}
