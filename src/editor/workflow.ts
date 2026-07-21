import { PracticeDocumentSchema, type PracticeDocument } from '../shared/contracts/practice';
import type { PracticeImportReviewBundle } from '../shared/contracts/practice-import';
import { verifyPracticeImportReviewBundle } from '../shared/practice-import-integrity';
import { executeEditorTransaction, type EditorCommand, type EditorIssue } from './commands';
import {
  EDITOR_HISTORY_LIMITS,
  applyEditorTransaction,
  createEditorHistory,
  markEditorHistorySaved,
  redoEditorHistory,
  undoEditorHistory,
  updateEditorWorkspace,
  type EditorHistoryState,
  type EditorWorkspacePatch,
  type EditorWorkspaceState,
  type SemanticFocus,
  type SemanticSelection,
} from './history';
import { inspectPracticeDocument, type PracticeDocumentInspection } from './inspection';
import {
  createBlankPracticeDocument,
  createNextPracticeDocumentRevision,
  openPracticeDocument,
  savePracticeDocument,
  type PracticeNativeOpenResult,
  type CreateBlankPracticeDocumentRequest,
  type PracticeNativeSaveResult,
  type PracticeNativeStorage,
} from './native';

export type PracticeEditorWorkflowState = Readonly<{
  history: EditorHistoryState<PracticeDocument>;
  inspection: PracticeDocumentInspection;
}>;

export type PracticeEditorWorkflowOptions = Readonly<{
  historyLimit?: number;
  revisionNamespace?: string;
  workspace?: Partial<EditorWorkspaceState>;
}>;

export type PracticeEditorTransactionRequest = Readonly<{
  commands: readonly EditorCommand[];
  focus: SemanticFocus | null;
  label: string;
  selection: SemanticSelection | null;
  transactionId: string;
  updatedAt: string;
}>;

export type PracticeEditorApplyResult =
  | Readonly<{ kind: 'accepted'; state: PracticeEditorWorkflowState }>
  | Readonly<{
      issues: readonly EditorIssue[];
      kind: 'rejected';
      state: PracticeEditorWorkflowState;
    }>;

type NativeOpenFailure = Extract<PracticeNativeOpenResult, { kind: 'failed' }>;
type NativeSaveFailure = Extract<PracticeNativeSaveResult, { kind: 'failed' }>;
type NativeSaveSuccess = Extract<PracticeNativeSaveResult, { kind: 'saved' }>;

export type PracticeEditorOpenResult =
  NativeOpenFailure | Readonly<{ key: string; kind: 'opened'; state: PracticeEditorWorkflowState }>;

export type PracticeEditorSaveResult =
  | Readonly<{
      failure: NativeSaveFailure;
      kind: 'failed';
      state: PracticeEditorWorkflowState;
    }>
  | Readonly<{
      kind: 'saved';
      native: NativeSaveSuccess;
      state: PracticeEditorWorkflowState;
    }>;

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value);
};

const snapshotDocument = (input: unknown): PracticeDocument =>
  deepFreeze(PracticeDocumentSchema.parse(input));

const assertUnifiedRevision = (history: EditorHistoryState<PracticeDocument>): void => {
  if (
    history.document.revision.revisionId !== history.workingRevision.id ||
    history.document.revision.revisionNumber !== history.workingRevision.number
  ) {
    throw new Error('Editor workflow document and history revisions must be identical.');
  }
};

const stateFromHistory = (
  history: EditorHistoryState<PracticeDocument>,
): PracticeEditorWorkflowState => {
  assertUnifiedRevision(history);
  return Object.freeze({ history, inspection: inspectPracticeDocument(history.document) });
};

const defaultRevisionNamespace = (document: PracticeDocument): string =>
  document.revision.documentId.slice(0, EDITOR_HISTORY_LIMITS.maximumRevisionNamespaceLength);

const nextRevisionIdentity = (
  history: EditorHistoryState<PracticeDocument>,
): Readonly<{ id: string; number: number }> => {
  const number = history.workingRevision.number + 1;
  if (!Number.isSafeInteger(number)) {
    throw new RangeError('Practice editor revision number exceeds the safe integer range.');
  }
  return {
    id: `${history.revisionNamespace}/working/${String(number)}`,
    number,
  };
};

const replaceRestoredHistoryDocument = (
  history: EditorHistoryState<PracticeDocument>,
  document: PracticeDocument,
): EditorHistoryState<PracticeDocument> =>
  Object.freeze({
    ...history,
    document: snapshotDocument(document),
    isDirty: true,
    savedContentToken: null,
  });

const workflowFromTrustedDocument = (
  documentInput: unknown,
  initiallySaved: boolean,
  options: PracticeEditorWorkflowOptions = {},
): PracticeEditorWorkflowState => {
  const document = PracticeDocumentSchema.parse(documentInput);
  return stateFromHistory(
    createEditorHistory(document, {
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      initialRevisionId: document.revision.revisionId,
      initialRevisionNumber: document.revision.revisionNumber,
      initiallySaved,
      revisionNamespace: options.revisionNamespace ?? defaultRevisionNamespace(document),
      ...(options.workspace === undefined ? {} : { workspace: options.workspace }),
    }),
  );
};

export async function createPracticeEditorWorkflow(
  request: CreateBlankPracticeDocumentRequest,
  options: PracticeEditorWorkflowOptions = {},
): Promise<PracticeEditorWorkflowState> {
  const state = workflowFromTrustedDocument(
    await createBlankPracticeDocument(request),
    false,
    options,
  );
  assertValidStateInteraction(state);
  return state;
}

/** Re-verifies an import at acceptance and keeps only its canonical document in fresh history. */
export async function acceptPracticeImportReviewBundle(
  bundleInput: PracticeImportReviewBundle,
  options: PracticeEditorWorkflowOptions = {},
): Promise<PracticeEditorWorkflowState> {
  const bundle = await verifyPracticeImportReviewBundle(bundleInput);
  const state = workflowFromTrustedDocument(bundle.draft.candidateDocument, false, options);
  assertValidStateInteraction(state);
  return state;
}

const focusExists = (inspection: PracticeDocumentInspection, focus: unknown): boolean => {
  if (typeof focus !== 'object' || focus === null) return false;
  const candidate = focus as Readonly<Record<string, unknown>>;
  return inspection.rows.some(({ focusTarget }) => {
    if (candidate.kind === 'document') return focusTarget.kind === 'document';
    if (candidate.kind === 'track') {
      return focusTarget.kind === 'track' && focusTarget.trackId === candidate.trackId;
    }
    if (candidate.kind === 'voice') {
      return (
        focusTarget.kind === 'voice' &&
        focusTarget.trackId === candidate.trackId &&
        focusTarget.voiceId === candidate.voiceId
      );
    }
    if (candidate.kind === 'event') {
      return (
        (focusTarget.kind === 'event' || focusTarget.kind === 'rest') &&
        focusTarget.eventId === candidate.eventId &&
        focusTarget.trackId === candidate.trackId &&
        focusTarget.voiceId === candidate.voiceId
      );
    }
    if (candidate.kind === 'note') {
      return (
        focusTarget.kind === 'note' &&
        focusTarget.eventId === candidate.eventId &&
        focusTarget.noteId === candidate.noteId &&
        focusTarget.trackId === candidate.trackId &&
        focusTarget.voiceId === candidate.voiceId
      );
    }
    return false;
  });
};

const positionExists = (inspection: PracticeDocumentInspection, position: unknown): boolean => {
  if (typeof position !== 'object' || position === null) return false;
  const candidate = position as Readonly<Record<string, unknown>>;
  if (
    typeof candidate.eventId !== 'string' ||
    (candidate.noteId !== null && typeof candidate.noteId !== 'string') ||
    typeof candidate.trackId !== 'string' ||
    typeof candidate.voiceId !== 'string'
  ) {
    return false;
  }
  return inspection.rows.some(
    ({ focusTarget }) =>
      (focusTarget.kind === 'event' ||
        focusTarget.kind === 'rest' ||
        focusTarget.kind === 'note') &&
      focusTarget.eventId === candidate.eventId &&
      focusTarget.noteId === candidate.noteId &&
      focusTarget.trackId === candidate.trackId &&
      focusTarget.voiceId === candidate.voiceId,
  );
};

const interactionIssue = (
  inspection: PracticeDocumentInspection,
  focus: unknown,
  selection: unknown,
): EditorIssue | null => {
  if (focus !== null && !focusExists(inspection, focus)) {
    return {
      code: 'interaction-invalid',
      commandIndex: null,
      message: 'Editor focus must identify a semantic node in the committed document.',
      path: ['focus'],
    };
  }
  if (selection === null) return null;
  if (typeof selection !== 'object') {
    return {
      code: 'interaction-invalid',
      commandIndex: null,
      message: 'Editor selection kind is not supported.',
      path: ['selection', 'kind'],
    };
  }
  const candidate = selection as Readonly<Record<string, unknown>>;
  const positions =
    candidate.kind === 'caret'
      ? [candidate.position]
      : candidate.kind === 'range'
        ? [candidate.anchor, candidate.focus]
        : null;
  if (positions === null) {
    return {
      code: 'interaction-invalid',
      commandIndex: null,
      message: 'Editor selection kind is not supported.',
      path: ['selection', 'kind'],
    };
  }
  return positions.every((position) => positionExists(inspection, position))
    ? null
    : {
        code: 'interaction-invalid',
        commandIndex: null,
        message: 'Editor selection must identify semantic content in the committed document.',
        path: ['selection'],
      };
};

const assertValidStateInteraction = (state: PracticeEditorWorkflowState): void => {
  const issue = interactionIssue(
    state.inspection,
    state.history.workspace.focus,
    state.history.workspace.selection,
  );
  if (issue !== null) throw new RangeError(issue.message);
};

export async function openPracticeEditorWorkflow(
  storage: PracticeNativeStorage,
  key: string,
  options: PracticeEditorWorkflowOptions = {},
): Promise<PracticeEditorOpenResult> {
  const opened = await openPracticeDocument(storage, key);
  if (opened.kind === 'failed') return opened;
  const state = workflowFromTrustedDocument(opened.document, true, options);
  assertValidStateInteraction(state);
  return Object.freeze({
    key,
    kind: 'opened' as const,
    state,
  });
}

export async function applyPracticeEditorTransaction(
  state: PracticeEditorWorkflowState,
  request: PracticeEditorTransactionRequest,
): Promise<PracticeEditorApplyResult> {
  assertUnifiedRevision(state.history);
  const next = nextRevisionIdentity(state.history);
  const result = await executeEditorTransaction(state.history.document, {
    baseRevisionId: state.history.document.revision.revisionId,
    commands: request.commands,
    revisionId: next.id,
    revisionNumber: next.number,
    updatedAt: request.updatedAt,
  });
  if (result.kind === 'rejected') {
    return Object.freeze({ issues: result.issues, kind: 'rejected' as const, state });
  }
  const inspection = inspectPracticeDocument(result.document);
  const invalidInteraction = interactionIssue(inspection, request.focus, request.selection);
  if (invalidInteraction !== null) {
    return Object.freeze({
      issues: Object.freeze([Object.freeze(invalidInteraction)]),
      kind: 'rejected' as const,
      state,
    });
  }
  const history = applyEditorTransaction(state.history, {
    document: result.document,
    focus: request.focus,
    label: request.label,
    selection: request.selection,
    transactionId: request.transactionId,
  });
  return Object.freeze({ kind: 'accepted' as const, state: stateFromHistory(history) });
}

const restoreCanonicalRevision = async (
  previous: PracticeEditorWorkflowState,
  movedHistory: EditorHistoryState<PracticeDocument>,
  updatedAt: string,
): Promise<PracticeEditorWorkflowState> => {
  const document = await createNextPracticeDocumentRevision(
    previous.history.document,
    movedHistory.document,
    { revisionId: movedHistory.workingRevision.id, updatedAt },
  );
  return stateFromHistory(replaceRestoredHistoryDocument(movedHistory, document));
};

export async function undoPracticeEditorWorkflow(
  state: PracticeEditorWorkflowState,
  updatedAt: string,
): Promise<PracticeEditorWorkflowState> {
  assertUnifiedRevision(state.history);
  const moved = undoEditorHistory(state.history);
  return moved === state.history ? state : restoreCanonicalRevision(state, moved, updatedAt);
}

export async function redoPracticeEditorWorkflow(
  state: PracticeEditorWorkflowState,
  updatedAt: string,
): Promise<PracticeEditorWorkflowState> {
  assertUnifiedRevision(state.history);
  const moved = redoEditorHistory(state.history);
  return moved === state.history ? state : restoreCanonicalRevision(state, moved, updatedAt);
}

export function updatePracticeEditorWorkspace(
  state: PracticeEditorWorkflowState,
  patch: EditorWorkspacePatch,
): PracticeEditorWorkflowState {
  const history = updateEditorWorkspace(state.history, patch);
  assertUnifiedRevision(history);
  const updated = Object.freeze({ history, inspection: state.inspection });
  assertValidStateInteraction(updated);
  return updated;
}

export async function savePracticeEditorWorkflow(
  state: PracticeEditorWorkflowState,
  storage: PracticeNativeStorage,
  key: string,
  exportedAt: string,
): Promise<PracticeEditorSaveResult> {
  assertUnifiedRevision(state.history);
  const native = await savePracticeDocument(storage, key, state.history.document, exportedAt);
  if (native.kind === 'failed') {
    return Object.freeze({ failure: native, kind: 'failed' as const, state });
  }
  const history = markEditorHistorySaved(state.history);
  return Object.freeze({
    kind: 'saved' as const,
    native,
    state: Object.freeze({ history, inspection: state.inspection }),
  });
}
