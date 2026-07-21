import { useMemo, useRef, useState, type KeyboardEvent } from 'react';

import {
  navigatePracticeInspection,
  practiceInspectionIntentForKey,
  type PracticeInspectionNode,
} from '../../../editor';
import type { PracticeEditorController } from '../usePracticeEditor';
import type { ScoreView } from '../types';
import { NotationSurface } from './NotationSurface';

type ScorePanelProps = {
  editor: PracticeEditorController;
  scoreView: ScoreView;
};

const bpmFromMicroseconds = (microseconds: number): number => Math.round(60_000_000 / microseconds);

const rowMatchesFocus = (
  row: Readonly<{ focusTarget: PracticeInspectionNode['focusTarget'] }>,
  focus: NonNullable<PracticeEditorController['state']>['history']['workspace']['focus'],
): boolean => {
  if (focus === null) return false;
  const target = row.focusTarget;
  if (focus.kind === 'document') return target.kind === 'document';
  if (focus.kind === 'track') return target.kind === 'track' && target.trackId === focus.trackId;
  if (focus.kind === 'voice') {
    return (
      target.kind === 'voice' &&
      target.trackId === focus.trackId &&
      target.voiceId === focus.voiceId
    );
  }
  if (focus.kind === 'event') {
    return (
      (target.kind === 'event' || target.kind === 'rest') &&
      target.trackId === focus.trackId &&
      target.voiceId === focus.voiceId &&
      target.eventId === focus.eventId
    );
  }
  return (
    target.kind === 'note' &&
    target.trackId === focus.trackId &&
    target.voiceId === focus.voiceId &&
    target.eventId === focus.eventId &&
    target.noteId === focus.noteId
  );
};

function InspectionNode({
  activeRowId,
  node,
  onFocus,
  register,
}: {
  activeRowId: string;
  node: PracticeInspectionNode;
  onFocus: (rowId: string) => void;
  register: (rowId: string, element: HTMLLIElement | null) => void;
}) {
  return (
    <li
      aria-label={node.label}
      aria-level={node.ariaLevel}
      aria-selected={activeRowId === node.rowId}
      className={`practice-score-tree-item is-${node.kind}`}
      data-row-id={node.rowId}
      onClick={(event) => {
        event.stopPropagation();
        onFocus(node.rowId);
      }}
      onFocus={(event) => {
        event.stopPropagation();
        onFocus(node.rowId);
      }}
      ref={(element) => register(node.rowId, element)}
      role="treeitem"
      tabIndex={activeRowId === node.rowId ? 0 : -1}
    >
      <span>{node.label}</span>
      {node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <InspectionNode
              activeRowId={activeRowId}
              key={child.rowId}
              node={child}
              onFocus={onFocus}
              register={register}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ScorePanel({ editor, scoreView }: ScorePanelProps) {
  const state = editor.state;
  const inspection = state?.inspection;
  const rowElements = useRef(new Map<string, HTMLLIElement>());
  const [activeRowId, setActiveRowId] = useState('');

  const rowLookup = useMemo(
    () => new Map(inspection?.rows.map((row) => [row.rowId, row]) ?? []),
    [inspection],
  );

  if (state === null || inspection === undefined) {
    return (
      <section className="practice-score-panel" aria-busy="true" aria-label="Score">
        <div className="practice-score-loading" role="status">
          {editor.error ?? 'Creating a blank guitar score…'}
        </div>
      </section>
    );
  }

  const document = state.history.document;
  const semanticActiveRowId = inspection.rows.find((row) =>
    rowMatchesFocus(row, state.history.workspace.focus),
  )?.rowId;
  const resolvedActiveRowId =
    semanticActiveRowId ??
    (rowLookup.has(activeRowId) ? activeRowId : (inspection.rows[0]?.rowId ?? ''));
  const eventCount = document.tracks.reduce(
    (tracks, track) =>
      tracks + track.voices.reduce((voices, voice) => voices + voice.events.length, 0),
    0,
  );
  const tempo = bpmFromMicroseconds(document.tempoMap[0]?.microsecondsPerQuarter ?? 500_000);

  const focusRow = (rowId: string): void => {
    const row = rowLookup.get(rowId);
    if (row === undefined) return;
    setActiveRowId(rowId);
    editor.selectRow(row);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const intent = practiceInspectionIntentForKey(event.key);
    if (intent === null) return;
    event.preventDefault();
    const target = navigatePracticeInspection(inspection, resolvedActiveRowId, intent);
    if (target === null) return;
    focusRow(target.rowId);
    rowElements.current.get(target.rowId)?.focus();
  };

  const register = (rowId: string, element: HTMLLIElement | null): void => {
    if (element === null) rowElements.current.delete(rowId);
    else rowElements.current.set(rowId, element);
  };

  return (
    <section className="practice-score-panel" aria-labelledby="practice-score-heading">
      <article className="practice-score-page practice-semantic-score">
        <header className="practice-score-title">
          <div>
            <span>Authored guitar score</span>
            <h1 id="practice-score-heading">{document.metadata.title}</h1>
          </div>
          <p>
            {tempo} BPM · {document.meterMap[0]?.numerator ?? 4}/
            {document.meterMap[0]?.denominator ?? 4}
            <br />
            Standard tuning · revision {document.revision.revisionNumber}
          </p>
        </header>

        <div className="practice-semantic-score-status">
          <strong>
            {eventCount === 0
              ? 'Blank score'
              : `${String(eventCount)} authored ${eventCount === 1 ? 'event' : 'events'}`}
          </strong>
          <span aria-live="polite">Ready to edit and inspect</span>
        </div>

        {eventCount === 0 && (
          <div className="practice-empty-score">
            <h2>Your blank guitar tab is ready</h2>
            <p>
              Switch to Edit and add a guitar note or rest. Your score outline will update with each
              change.
            </p>
          </div>
        )}

        <NotationSurface
          document={document}
          focus={state.history.workspace.focus}
          scoreView={scoreView}
        />

        <section className="practice-score-inspection" aria-labelledby="score-contents-heading">
          <header>
            <div>
              <h2 id="score-contents-heading">Score contents</h2>
              <p id="score-keyboard-help">
                Use Up and Down to move, Right for the first child, Left for the parent, and Home or
                End to jump.
              </p>
            </div>
            <span>Semantic view</span>
          </header>
          <ul
            aria-describedby="score-keyboard-help"
            aria-label="Authored score structure"
            className="practice-score-tree"
            onKeyDown={handleKeyDown}
            role="tree"
          >
            <InspectionNode
              activeRowId={resolvedActiveRowId || inspection.tree.rowId}
              node={inspection.tree}
              onFocus={focusRow}
              register={register}
            />
          </ul>
        </section>

        <p className="practice-adapter-notice">
          Use the keyboard-friendly score outline to review every authored track, voice, event, and
          note.
        </p>
      </article>
    </section>
  );
}
