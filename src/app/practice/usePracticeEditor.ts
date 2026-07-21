import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acceptPracticeImportReviewBundle,
  applyPracticeEditorTransaction,
  createPracticeEditorWorkflow,
  editorFocusFromInspectionTarget,
  editorPositionFromInspectionTarget,
  redoPracticeEditorWorkflow,
  undoPracticeEditorWorkflow,
  updatePracticeEditorWorkspace,
  type EditorCommand,
  type PracticeEditorWorkflowState,
  type PracticeInspectionRow,
  type SemanticFocus,
  type SemanticSelection,
} from '../../editor';
import type { PracticeImportReviewBundle } from '../../shared/contracts/practice-import';

export type PracticeDocumentStatus = 'Working copy — not saved';

export type PracticeEditorController = Readonly<{
  acceptImport: (bundle: PracticeImportReviewBundle) => Promise<boolean>;
  busy: boolean;
  canRedo: boolean;
  canUndo: boolean;
  createNew: () => Promise<void>;
  error: string | null;
  nextId: (kind: string) => string;
  redo: () => Promise<void>;
  selectRow: (row: PracticeInspectionRow) => void;
  state: PracticeEditorWorkflowState | null;
  status: PracticeDocumentStatus;
  transact: (
    commands: readonly EditorCommand[],
    label: string,
    focus?: SemanticFocus | null,
    selection?: SemanticSelection | null,
  ) => Promise<boolean>;
  undo: () => Promise<void>;
}>;

let documentSequence = 0;

const timestampAfter = (state: PracticeEditorWorkflowState | null): string => {
  const previous = state === null ? 0 : Date.parse(state.history.document.metadata.updatedAt);
  return new Date(Math.max(Date.now(), previous)).toISOString();
};

const issueMessage = (issues: readonly Readonly<{ message: string }>[]): string =>
  issues.map(({ message }) => message).join(' ');

export function usePracticeEditor(): PracticeEditorController {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PracticeEditorWorkflowState | null>(null);
  const stateRef = useRef(state);
  const itemSequence = useRef(0);
  const requestSequence = useRef(0);

  const nextId = useCallback((kind: string) => {
    itemSequence.current += 1;
    return `${kind}-${String(itemSequence.current)}`;
  }, []);

  const createNew = useCallback(async () => {
    requestSequence.current += 1;
    const request = requestSequence.current;
    documentSequence += 1;
    const documentId = `practice-document-${String(documentSequence)}`;
    setBusy(true);
    setError(null);
    try {
      const created = await createPracticeEditorWorkflow({
        createdAt: new Date().toISOString(),
        documentId,
        revisionId: `${documentId}-revision-1`,
        title: 'Untitled guitar tab',
      });
      if (request !== requestSequence.current) return;
      itemSequence.current = 0;
      stateRef.current = created;
      setState(created);
    } catch (caught) {
      if (request !== requestSequence.current) return;
      setError(
        caught instanceof Error ? caught.message : 'The blank guitar score could not be created.',
      );
    } finally {
      if (request === requestSequence.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void createNew());
  }, [createNew]);

  const transact = useCallback(
    async (
      commands: readonly EditorCommand[],
      label: string,
      focus?: SemanticFocus | null,
      selection?: SemanticSelection | null,
    ): Promise<boolean> => {
      const current = stateRef.current;
      if (current === null || busy) return false;
      setBusy(true);
      setError(null);
      try {
        const result = await applyPracticeEditorTransaction(current, {
          commands,
          focus: focus === undefined ? current.history.workspace.focus : focus,
          label,
          selection: selection === undefined ? current.history.workspace.selection : selection,
          transactionId: nextId('transaction'),
          updatedAt: timestampAfter(current),
        });
        if (result.kind === 'rejected') {
          setError(issueMessage(result.issues));
          return false;
        }
        stateRef.current = result.state;
        setState(result.state);
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The score edit could not be applied.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, nextId],
  );

  const moveHistory = useCallback(async (direction: 'redo' | 'undo') => {
    const current = stateRef.current;
    if (current === null) return;
    setBusy(true);
    setError(null);
    try {
      const moved =
        direction === 'undo'
          ? await undoPracticeEditorWorkflow(current, timestampAfter(current))
          : await redoPracticeEditorWorkflow(current, timestampAfter(current));
      stateRef.current = moved;
      setState(moved);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `The score ${direction} could not be completed.`,
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const acceptImport = useCallback(async (bundle: PracticeImportReviewBundle): Promise<boolean> => {
    requestSequence.current += 1;
    const request = requestSequence.current;
    setBusy(true);
    setError(null);
    try {
      const imported = await acceptPracticeImportReviewBundle(bundle);
      if (request !== requestSequence.current) return false;
      itemSequence.current = 0;
      stateRef.current = imported;
      setState(imported);
      return true;
    } catch (caught) {
      if (request !== requestSequence.current) return false;
      setError(
        caught instanceof Error
          ? caught.message
          : 'The imported draft failed verification and was not used.',
      );
      return false;
    } finally {
      if (request === requestSequence.current) setBusy(false);
    }
  }, []);

  const selectRow = useCallback((row: PracticeInspectionRow) => {
    const current = stateRef.current;
    if (current === null) return;
    const position = editorPositionFromInspectionTarget(row.focusTarget);
    const updated = updatePracticeEditorWorkspace(current, {
      focus: editorFocusFromInspectionTarget(row.focusTarget),
      selection: position === null ? null : { kind: 'caret', position },
    });
    stateRef.current = updated;
    setState(updated);
  }, []);

  const canUndo = (state?.history.past.length ?? 0) > 0 && !busy;
  const canRedo = (state?.history.future.length ?? 0) > 0 && !busy;
  const status: PracticeDocumentStatus = 'Working copy — not saved';

  return {
    acceptImport,
    busy,
    canRedo,
    canUndo,
    createNew,
    error,
    nextId,
    redo: () => moveHistory('redo'),
    selectRow,
    state,
    status,
    transact,
    undo: () => moveHistory('undo'),
  };
}
