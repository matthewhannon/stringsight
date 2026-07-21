import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { AudioSessionController, AudioSessionSnapshot } from './audioSessionController';
import {
  canExportSessionMidi,
  correctionProblems,
  exportSessionJson,
  exportSessionMidi,
  importSessionJson,
  projectReviewEvents,
} from '../session';
import { defaultAudioSession } from './audioCaptureController';
import { RackButton, rackEmbeddedClassNames } from '../ui/rack';

type SessionReviewController = Pick<
  AudioSessionController,
  | 'appendCorrection'
  | 'currentSnapshot'
  | 'deleteSavedSession'
  | 'loadSavedSession'
  | 'refreshSavedSessions'
  | 'replaceWithImportedSession'
  | 'revertCorrection'
  | 'saveSession'
  | 'subscribe'
>;

type SessionReviewPanelProps = {
  controller?: SessionReviewController;
  embedded?: boolean;
};

const formatTime = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(2)}s`;

const download = (bytes: BlobPart, type: string, filename: string): void => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const safeFilename = (title: string): string =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'stringsight-session';

export function SessionReviewPanel({
  controller = defaultAudioSession,
  embedded = false,
}: SessionReviewPanelProps) {
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.currentSnapshot, [controller]);
  const snapshot: AudioSessionSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const session = snapshot.session;
  const reviewEvents = useMemo(
    () => (session === null ? [] : projectReviewEvents(session)),
    [session],
  );
  const problems = useMemo(() => (session === null ? [] : correctionProblems(session)), [session]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [replacement, setReplacement] = useState('');
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const selected = reviewEvents.find(({ rawEvent }) => rawEvent.id === selectedEventId) ?? null;
  const complete = session?.status === 'complete';

  useEffect(() => {
    void controller.refreshSavedSessions();
  }, [controller]);

  const chooseEvent = (eventId: string) => {
    const event = reviewEvents.find(({ rawEvent }) => rawEvent.id === eventId);
    if (event === undefined) return;
    setSelectedEventId(eventId);
    setReplacement(
      event.rawEvent.kind === 'note'
        ? String(event.appliedCorrection?.note?.midi ?? event.rawEvent.candidates[0]?.midi ?? '')
        : event.correctedLabel,
    );
    setReason('');
    setLocalError(null);
  };

  const applyCorrection = () => {
    if (selected === null) return;
    try {
      if (selected.rawEvent.kind === 'note') {
        const midi = Number(replacement);
        if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
          throw new Error('Enter a whole MIDI note number from 0 through 127.');
        }
        controller.appendCorrection(
          { eventId: selected.rawEvent.id, midi },
          reason.trim() || undefined,
        );
      } else {
        controller.appendCorrection(
          { chordSymbol: replacement, eventId: selected.rawEvent.id },
          reason.trim() || undefined,
        );
      }
      setLocalError(null);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : 'The correction could not be applied.',
      );
    }
  };

  const importJson = async (file: File): Promise<void> => {
    try {
      controller.replaceWithImportedSession(importSessionJson(await file.text()));
      setLocalError(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'The session could not be imported.');
    }
  };

  return (
    <section
      aria-label={embedded ? 'Session review and export' : undefined}
      className={`session-review ${embedded ? rackEmbeddedClassNames.section : ''}`.trim()}
    >
      <div className="session-review-toolbar">
        <div>
          <strong>{session?.title ?? 'No completed session'}</strong>
          <span>
            {session === null
              ? 'Record or import audio to create a reviewable session.'
              : `${String(reviewEvents.length)} finalized events · ${String(session.corrections.length)} correction records`}
          </span>
        </div>
        <div className="session-review-actions">
          <RackButton
            disabled={!complete || snapshot.storageState !== 'idle'}
            onClick={() => void controller.saveSession()}
            variant="primary"
          >
            {snapshot.storageState === 'saving' ? 'Saving…' : 'Save locally'}
          </RackButton>
          <RackButton
            disabled={!complete}
            onClick={() => {
              if (session !== null) {
                download(
                  exportSessionJson(session),
                  'application/json',
                  `${safeFilename(session.title)}.json`,
                );
              }
            }}
          >
            Export JSON
          </RackButton>
          <RackButton
            disabled={!canExportSessionMidi(session)}
            onClick={() => {
              if (session !== null) {
                download(
                  exportSessionMidi(session),
                  'audio/midi',
                  `${safeFilename(session.title)}.mid`,
                );
              }
            }}
          >
            Export MIDI
          </RackButton>
          <RackButton onClick={() => importInput.current?.click()}>Import JSON</RackButton>
          <input
            accept=".json,application/json"
            aria-hidden="true"
            className="recording-file-input"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) void importJson(file);
            }}
            ref={importInput}
            tabIndex={-1}
            type="file"
          />
        </div>
      </div>

      {(localError ?? snapshot.storageError) !== null && (
        <p className="session-review-error" role="alert">
          {localError ?? snapshot.storageError}
        </p>
      )}
      {problems.length > 0 && (
        <div className="session-review-problems" role="status">
          <strong>Correction history needs attention</strong>
          {problems.map((problem) => (
            <span key={problem.correctionId}>{problem.message}</span>
          ))}
        </div>
      )}

      <div className="session-review-grid">
        <div className="session-event-list">
          <div className="session-review-heading">
            <strong>Finalized detector events</strong>
            <span>Raw evidence is never overwritten</span>
          </div>
          {reviewEvents.length === 0 ? (
            <p className="session-review-empty">
              Completed note and chord events will appear here after processing.
            </p>
          ) : (
            <ol>
              {reviewEvents.map((event) => (
                <li
                  className={event.state === 'corrected' ? 'is-corrected' : ''}
                  key={event.rawEvent.id}
                >
                  <button
                    aria-pressed={selectedEventId === event.rawEvent.id}
                    onClick={() => chooseEvent(event.rawEvent.id)}
                    type="button"
                  >
                    <span>
                      <b>{event.correctedLabel}</b>
                      <small>
                        {event.rawEvent.kind} · {event.rawEvent.lifecycle}
                      </small>
                    </span>
                    <span>
                      <small>RAW</small>
                      <b>{event.rawLabel}</b>
                    </span>
                    <span>
                      <small>CONF</small>
                      <b>{Math.round(event.confidence * 100)}%</b>
                    </span>
                    <time>
                      {formatTime(Number(event.rawEvent.time.startMs))}–
                      {formatTime(Number(event.rawEvent.time.endMs))}
                    </time>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="session-correction-editor" aria-label="Correction editor">
          <div className="session-review-heading">
            <strong>Correction layer</strong>
            <span>Append-only history</span>
          </div>
          {selected === null ? (
            <p className="session-review-empty">
              Select a finalized note or chord to inspect its alternatives and add a correction.
            </p>
          ) : (
            <>
              <dl>
                <div>
                  <dt>Raw prediction</dt>
                  <dd>{selected.rawLabel}</dd>
                </div>
                <div>
                  <dt>Displayed value</dt>
                  <dd>{selected.correctedLabel}</dd>
                </div>
                <div>
                  <dt>Algorithm</dt>
                  <dd>{selected.rawEvent.provenance.algorithm}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{selected.rawEvent.provenance.version}</dd>
                </div>
              </dl>
              <div className="session-alternatives">
                <span>Ranked alternatives</span>
                <p>{selected.alternatives.join(' · ')}</p>
              </div>
              <label>
                {selected.rawEvent.kind === 'note' ? 'Correct MIDI note' : 'Correct chord symbol'}
                <input
                  onChange={(event) => setReplacement(event.target.value)}
                  type={selected.rawEvent.kind === 'note' ? 'number' : 'text'}
                  value={replacement}
                />
              </label>
              <label>
                Reason (optional)
                <input
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  type="text"
                  value={reason}
                />
              </label>
              <div className="session-review-actions">
                <RackButton
                  disabled={replacement.trim() === ''}
                  onClick={applyCorrection}
                  variant="primary"
                >
                  Apply correction
                </RackButton>
                <RackButton
                  disabled={selected.state !== 'corrected'}
                  onClick={() => controller.revertCorrection(selected.rawEvent.id)}
                >
                  Use original
                </RackButton>
              </div>
            </>
          )}
        </aside>
      </div>

      <div className="saved-session-list">
        <div className="session-review-heading">
          <strong>Saved in this browser</strong>
          <span>{String(snapshot.savedSessions.length)} sessions</span>
        </div>
        {snapshot.savedSessions.length === 0 ? (
          <p className="session-review-empty">No locally saved sessions.</p>
        ) : (
          <ul>
            {snapshot.savedSessions.map((saved) => (
              <li key={saved.id}>
                <span>
                  <strong>{saved.title}</strong>
                  <small>
                    {saved.hasRecording ? 'Replayable audio included' : 'Structured session only'}
                  </small>
                </span>
                <time>{new Date(saved.updatedAt).toLocaleString()}</time>
                <RackButton
                  disabled={snapshot.storageState !== 'idle'}
                  onClick={() => void controller.loadSavedSession(saved.id)}
                >
                  Load
                </RackButton>
                <RackButton
                  disabled={snapshot.storageState !== 'idle'}
                  onClick={() => void controller.deleteSavedSession(saved.id)}
                >
                  Delete
                </RackButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
