import { assertCanonicalJsonDataDomain } from '../shared/canonical-json';

export const EDITOR_HISTORY_LIMITS = Object.freeze({
  maximumHistoryEntries: 500,
  maximumIdentifierLength: 160,
  maximumLabelLength: 160,
  maximumRevisionNamespaceLength: 135,
  maximumZoomPercent: 400,
  minimumZoomPercent: 25,
} as const);

export type SemanticPosition = Readonly<{
  eventId: string;
  noteId: string | null;
  trackId: string;
  voiceId: string;
}>;

export type SemanticSelection =
  | Readonly<{ kind: 'caret'; position: SemanticPosition }>
  | Readonly<{ anchor: SemanticPosition; focus: SemanticPosition; kind: 'range' }>;

export type SemanticFocus =
  | Readonly<{ kind: 'document' }>
  | Readonly<{ kind: 'track'; trackId: string }>
  | Readonly<{ kind: 'voice'; trackId: string; voiceId: string }>
  | Readonly<{ eventId: string; kind: 'event'; trackId: string; voiceId: string }>
  | Readonly<{
      eventId: string;
      kind: 'note';
      noteId: string;
      trackId: string;
      voiceId: string;
    }>;

export type EditorLayoutState = Readonly<{
  sidebar: 'closed' | 'editor' | 'takes';
  viewMode: 'continuous' | 'page';
  zoomPercent: number;
}>;

export type WorkspacePracticeRange = Readonly<{
  endTickExclusive: number;
  startTick: number;
}>;

export type EditorWorkspaceState = Readonly<{
  focus: SemanticFocus | null;
  layout: EditorLayoutState;
  playheadTick: number;
  practiceRange: WorkspacePracticeRange | null;
  selection: SemanticSelection | null;
}>;

export type WorkingRevisionIdentity = Readonly<{
  id: string;
  number: number;
}>;

export type EditorInteractionSnapshot = Readonly<{
  focus: SemanticFocus | null;
  selection: SemanticSelection | null;
}>;

export type EditorHistoryEntry<Document> = Readonly<{
  afterContentToken: number;
  afterDocument: Document;
  afterInteraction: EditorInteractionSnapshot;
  beforeContentToken: number;
  beforeDocument: Document;
  beforeInteraction: EditorInteractionSnapshot;
  label: string;
  transactionId: string;
}>;

export type EditorHistoryState<Document> = Readonly<{
  contentToken: number;
  document: Document;
  future: readonly EditorHistoryEntry<Document>[];
  historyLimit: number;
  isDirty: boolean;
  nextContentToken: number;
  past: readonly EditorHistoryEntry<Document>[];
  revisionNamespace: string;
  savedContentToken: number | null;
  savedRevision: WorkingRevisionIdentity | null;
  workingRevision: WorkingRevisionIdentity;
  workspace: EditorWorkspaceState;
}>;

export type CreateEditorHistoryOptions = Readonly<{
  historyLimit?: number;
  initiallySaved?: boolean;
  initialRevisionId: string;
  initialRevisionNumber: number;
  revisionNamespace: string;
  workspace?: Partial<EditorWorkspaceState>;
}>;

/**
 * Adapter boundary for a committed authored transaction. The transaction layer owns semantic
 * validation against the document and supplies the desired post-edit selection and focus.
 */
export type EditorHistoryTransactionResult<Document> = Readonly<{
  document: Document;
  focus: SemanticFocus | null;
  label: string;
  selection: SemanticSelection | null;
  transactionId: string;
}>;

export type EditorWorkspacePatch = Readonly<{
  focus?: SemanticFocus | null;
  layout?: EditorLayoutState;
  playheadTick?: number;
  practiceRange?: WorkspacePracticeRange | null;
  selection?: SemanticSelection | null;
}>;

const DEFAULT_LAYOUT: EditorLayoutState = Object.freeze({
  sidebar: 'editor',
  viewMode: 'page',
  zoomPercent: 100,
});

const assertIdentifier = (value: string, label: string): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > EDITOR_HISTORY_LIMITS.maximumIdentifierLength
  ) {
    throw new RangeError(
      `${label} must contain 1-${String(EDITOR_HISTORY_LIMITS.maximumIdentifierLength)} characters.`,
    );
  }
  return value;
};

const assertSafeNonnegativeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

const copyPosition = (position: SemanticPosition): SemanticPosition =>
  Object.freeze({
    eventId: assertIdentifier(position.eventId, 'eventId'),
    noteId: position.noteId === null ? null : assertIdentifier(position.noteId, 'noteId'),
    trackId: assertIdentifier(position.trackId, 'trackId'),
    voiceId: assertIdentifier(position.voiceId, 'voiceId'),
  });

const copySelection = (selection: SemanticSelection | null): SemanticSelection | null => {
  if (selection === null) return null;
  switch (selection.kind) {
    case 'caret':
      return Object.freeze({ kind: 'caret', position: copyPosition(selection.position) });
    case 'range':
      return Object.freeze({
        anchor: copyPosition(selection.anchor),
        focus: copyPosition(selection.focus),
        kind: 'range',
      });
    default:
      throw new RangeError('selection.kind is not supported.');
  }
};

const copyFocus = (focus: SemanticFocus | null): SemanticFocus | null => {
  if (focus === null) return null;
  switch (focus.kind) {
    case 'document':
      return Object.freeze({ kind: 'document' });
    case 'track':
      return Object.freeze({ kind: 'track', trackId: assertIdentifier(focus.trackId, 'trackId') });
    case 'voice':
      return Object.freeze({
        kind: 'voice',
        trackId: assertIdentifier(focus.trackId, 'trackId'),
        voiceId: assertIdentifier(focus.voiceId, 'voiceId'),
      });
    case 'event':
      return Object.freeze({
        eventId: assertIdentifier(focus.eventId, 'eventId'),
        kind: 'event',
        trackId: assertIdentifier(focus.trackId, 'trackId'),
        voiceId: assertIdentifier(focus.voiceId, 'voiceId'),
      });
    case 'note':
      return Object.freeze({
        eventId: assertIdentifier(focus.eventId, 'eventId'),
        kind: 'note',
        noteId: assertIdentifier(focus.noteId, 'noteId'),
        trackId: assertIdentifier(focus.trackId, 'trackId'),
        voiceId: assertIdentifier(focus.voiceId, 'voiceId'),
      });
    default:
      throw new RangeError('focus.kind is not supported.');
  }
};

const copyLayout = (layout: EditorLayoutState): EditorLayoutState => {
  if (
    !Number.isInteger(layout.zoomPercent) ||
    layout.zoomPercent < EDITOR_HISTORY_LIMITS.minimumZoomPercent ||
    layout.zoomPercent > EDITOR_HISTORY_LIMITS.maximumZoomPercent
  ) {
    throw new RangeError(
      `zoomPercent must be an integer from ${String(EDITOR_HISTORY_LIMITS.minimumZoomPercent)} through ${String(EDITOR_HISTORY_LIMITS.maximumZoomPercent)}.`,
    );
  }
  if (!['closed', 'editor', 'takes'].includes(layout.sidebar)) {
    throw new RangeError('sidebar is not a supported editor layout value.');
  }
  if (!['continuous', 'page'].includes(layout.viewMode)) {
    throw new RangeError('viewMode is not a supported editor layout value.');
  }
  return Object.freeze({ ...layout });
};

const copyPracticeRange = (range: WorkspacePracticeRange | null): WorkspacePracticeRange | null => {
  if (range === null) return null;
  const startTick = assertSafeNonnegativeInteger(range.startTick, 'practiceRange.startTick');
  const endTickExclusive = assertSafeNonnegativeInteger(
    range.endTickExclusive,
    'practiceRange.endTickExclusive',
  );
  if (endTickExclusive <= startTick) {
    throw new RangeError('practiceRange must be non-empty and half-open.');
  }
  return Object.freeze({ endTickExclusive, startTick });
};

const copyWorkspace = (workspace: EditorWorkspaceState): EditorWorkspaceState =>
  Object.freeze({
    focus: copyFocus(workspace.focus),
    layout: copyLayout(workspace.layout),
    playheadTick: assertSafeNonnegativeInteger(workspace.playheadTick, 'playheadTick'),
    practiceRange: copyPracticeRange(workspace.practiceRange),
    selection: copySelection(workspace.selection),
  });

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value);
};

const snapshotDocument = <Document>(document: Document): Document => {
  assertCanonicalJsonDataDomain(document);
  try {
    return deepFreeze(structuredClone(document));
  } catch {
    throw new TypeError('Editor documents must be structured-cloneable canonical JSON.');
  }
};

const interaction = (workspace: EditorWorkspaceState): EditorInteractionSnapshot =>
  Object.freeze({ focus: workspace.focus, selection: workspace.selection });

const revisionId = (namespace: string, number: number): string =>
  `${namespace}/working/${String(number)}`;

const nextRevision = <Document>(state: EditorHistoryState<Document>): WorkingRevisionIdentity => {
  const number = state.workingRevision.number + 1;
  if (!Number.isSafeInteger(number)) {
    throw new RangeError('Working revision number exceeds the safe integer range.');
  }
  return Object.freeze({
    id: assertIdentifier(revisionId(state.revisionNamespace, number), 'workingRevisionId'),
    number,
  });
};

const nextToken = <Document>(state: EditorHistoryState<Document>): number => {
  if (
    !Number.isSafeInteger(state.nextContentToken) ||
    state.nextContentToken < 0 ||
    state.nextContentToken >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError('Editor content token exceeds the safe integer range.');
  }
  return state.nextContentToken;
};

const freezeState = <Document>(
  state: Omit<EditorHistoryState<Document>, 'isDirty'>,
): EditorHistoryState<Document> =>
  Object.freeze({
    ...state,
    future: Object.freeze([...state.future]),
    isDirty: state.savedContentToken !== state.contentToken,
    past: Object.freeze([...state.past]),
  });

export function createEditorHistory<Document>(
  document: Document,
  options: CreateEditorHistoryOptions,
): EditorHistoryState<Document> {
  const historyLimit = options.historyLimit ?? 100;
  if (
    !Number.isInteger(historyLimit) ||
    historyLimit < 1 ||
    historyLimit > EDITOR_HISTORY_LIMITS.maximumHistoryEntries
  ) {
    throw new RangeError(
      `historyLimit must be an integer from 1 through ${String(EDITOR_HISTORY_LIMITS.maximumHistoryEntries)}.`,
    );
  }
  const revisionNamespace = assertIdentifier(options.revisionNamespace, 'revisionNamespace');
  if (revisionNamespace.length > EDITOR_HISTORY_LIMITS.maximumRevisionNamespaceLength) {
    throw new RangeError(
      `revisionNamespace may contain at most ${String(EDITOR_HISTORY_LIMITS.maximumRevisionNamespaceLength)} characters.`,
    );
  }
  const initialRevisionNumber = assertSafeNonnegativeInteger(
    options.initialRevisionNumber,
    'initialRevisionNumber',
  );
  const initialRevisionId = assertIdentifier(options.initialRevisionId, 'initialRevisionId');
  const generatedPrefix = `${revisionNamespace}/working/`;
  if (
    initialRevisionId.startsWith(generatedPrefix) &&
    initialRevisionId !== revisionId(revisionNamespace, initialRevisionNumber)
  ) {
    throw new RangeError(
      'An initial generated working revision ID must match its working revision number.',
    );
  }
  const workingRevision = Object.freeze({
    id: initialRevisionId,
    number: initialRevisionNumber,
  });
  const suppliedWorkspace = options.workspace ?? {};
  const workspace = copyWorkspace({
    focus: suppliedWorkspace.focus ?? null,
    layout: suppliedWorkspace.layout ?? DEFAULT_LAYOUT,
    playheadTick: suppliedWorkspace.playheadTick ?? 0,
    practiceRange: suppliedWorkspace.practiceRange ?? null,
    selection: suppliedWorkspace.selection ?? null,
  });
  const initiallySaved = options.initiallySaved ?? true;
  return freezeState({
    contentToken: 0,
    document: snapshotDocument(document),
    future: [],
    historyLimit,
    nextContentToken: 1,
    past: [],
    revisionNamespace,
    savedContentToken: initiallySaved ? 0 : null,
    savedRevision: initiallySaved ? workingRevision : null,
    workingRevision,
    workspace,
  });
}

export function applyEditorTransaction<Document>(
  state: EditorHistoryState<Document>,
  result: EditorHistoryTransactionResult<Document>,
): EditorHistoryState<Document> {
  const contentToken = nextToken(state);
  const afterDocument = snapshotDocument(result.document);
  const afterInteraction = Object.freeze({
    focus: copyFocus(result.focus),
    selection: copySelection(result.selection),
  });
  const label = result.label;
  if (
    typeof label !== 'string' ||
    label.length === 0 ||
    label.length > EDITOR_HISTORY_LIMITS.maximumLabelLength
  ) {
    throw new RangeError(
      `label must contain 1-${String(EDITOR_HISTORY_LIMITS.maximumLabelLength)} characters.`,
    );
  }
  const entry: EditorHistoryEntry<Document> = Object.freeze({
    afterContentToken: contentToken,
    afterDocument,
    afterInteraction,
    beforeContentToken: state.contentToken,
    beforeDocument: state.document,
    beforeInteraction: interaction(state.workspace),
    label,
    transactionId: assertIdentifier(result.transactionId, 'transactionId'),
  });
  const past = [...state.past, entry].slice(-state.historyLimit);
  return freezeState({
    ...state,
    contentToken,
    document: afterDocument,
    future: [],
    nextContentToken: contentToken + 1,
    past,
    workingRevision: nextRevision(state),
    workspace: copyWorkspace({
      ...state.workspace,
      focus: afterInteraction.focus,
      selection: afterInteraction.selection,
    }),
  });
}

export function undoEditorHistory<Document>(
  state: EditorHistoryState<Document>,
): EditorHistoryState<Document> {
  const entry = state.past.at(-1);
  if (entry === undefined) return state;
  return freezeState({
    ...state,
    contentToken: entry.beforeContentToken,
    document: entry.beforeDocument,
    future: [...state.future, entry],
    past: state.past.slice(0, -1),
    workingRevision: nextRevision(state),
    workspace: copyWorkspace({
      ...state.workspace,
      focus: entry.beforeInteraction.focus,
      selection: entry.beforeInteraction.selection,
    }),
  });
}

export function redoEditorHistory<Document>(
  state: EditorHistoryState<Document>,
): EditorHistoryState<Document> {
  const entry = state.future.at(-1);
  if (entry === undefined) return state;
  return freezeState({
    ...state,
    contentToken: entry.afterContentToken,
    document: entry.afterDocument,
    future: state.future.slice(0, -1),
    past: [...state.past, entry].slice(-state.historyLimit),
    workingRevision: nextRevision(state),
    workspace: copyWorkspace({
      ...state.workspace,
      focus: entry.afterInteraction.focus,
      selection: entry.afterInteraction.selection,
    }),
  });
}

export function updateEditorWorkspace<Document>(
  state: EditorHistoryState<Document>,
  patch: EditorWorkspacePatch,
): EditorHistoryState<Document> {
  const workspace = copyWorkspace({
    focus: patch.focus === undefined ? state.workspace.focus : patch.focus,
    layout: patch.layout ?? state.workspace.layout,
    playheadTick: patch.playheadTick ?? state.workspace.playheadTick,
    practiceRange:
      patch.practiceRange === undefined ? state.workspace.practiceRange : patch.practiceRange,
    selection: patch.selection === undefined ? state.workspace.selection : patch.selection,
  });
  return freezeState({ ...state, workspace });
}

export function markEditorHistorySaved<Document>(
  state: EditorHistoryState<Document>,
): EditorHistoryState<Document> {
  return freezeState({
    ...state,
    savedContentToken: state.contentToken,
    savedRevision: state.workingRevision,
  });
}
