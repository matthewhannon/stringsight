import { describe, expect, it } from 'vitest';

import {
  EDITOR_HISTORY_LIMITS,
  applyEditorTransaction,
  createEditorHistory,
  markEditorHistorySaved,
  redoEditorHistory,
  undoEditorHistory,
  updateEditorWorkspace,
  type EditorHistoryState,
  type SemanticFocus,
  type SemanticPosition,
  type SemanticSelection,
} from './history';

type TestDocument = Readonly<{
  authoredTitle: string;
  events: readonly Readonly<{ id: string; tick: number }>[];
}>;

const document = (authoredTitle: string, tick = 0): TestDocument => ({
  authoredTitle,
  events: [{ id: 'event-1', tick }],
});

const position = (eventId = 'event-1'): SemanticPosition => ({
  eventId,
  noteId: null,
  trackId: 'track-1',
  voiceId: 'voice-1',
});

const caret = (eventId = 'event-1'): SemanticSelection => ({
  kind: 'caret',
  position: position(eventId),
});

const eventFocus = (eventId = 'event-1'): SemanticFocus => ({
  eventId,
  kind: 'event',
  trackId: 'track-1',
  voiceId: 'voice-1',
});

const create = (historyLimit = 100): EditorHistoryState<TestDocument> =>
  createEditorHistory(document('Initial'), {
    historyLimit,
    initialRevisionId: 'revision-7',
    initialRevisionNumber: 7,
    revisionNamespace: 'editor-session-1',
    workspace: { focus: eventFocus(), selection: caret() },
  });

const transact = (
  state: EditorHistoryState<TestDocument>,
  title: string,
  eventId = 'event-1',
): EditorHistoryState<TestDocument> =>
  applyEditorTransaction(state, {
    document: document(title, state.workingRevision.number),
    focus: eventFocus(eventId),
    label: `Set title to ${title}`,
    selection: caret(eventId),
    transactionId: `transaction-${title}`,
  });

describe('renderer-independent editor history', () => {
  it('keeps workspace-only state out of authored history and revision identity', () => {
    const initial = create();
    const updated = updateEditorWorkspace(initial, {
      layout: { sidebar: 'takes', viewMode: 'continuous', zoomPercent: 150 },
      playheadTick: 480,
      practiceRange: { endTickExclusive: 960, startTick: 240 },
      selection: {
        anchor: position(),
        focus: position('event-2'),
        kind: 'range',
      },
    });

    expect(updated.document).toBe(initial.document);
    expect(updated.workingRevision).toBe(initial.workingRevision);
    expect(updated.past).toHaveLength(0);
    expect(updated.isDirty).toBe(false);
    expect(updated.workspace).toMatchObject({
      layout: { sidebar: 'takes', viewMode: 'continuous', zoomPercent: 150 },
      playheadTick: 480,
      practiceRange: { endTickExclusive: 960, startTick: 240 },
    });
    expect(updated.document).not.toHaveProperty('selection');
    expect(updated.document).not.toHaveProperty('layout');
    expect(updated.document).not.toHaveProperty('practiceRange');
    expect(updated.document).not.toHaveProperty('playheadTick');
  });

  it('allocates fresh monotonic revisions and restores semantic interaction on undo and redo', () => {
    const initial = updateEditorWorkspace(create(), {
      layout: { sidebar: 'takes', viewMode: 'continuous', zoomPercent: 125 },
      playheadTick: 100,
      practiceRange: { endTickExclusive: 960, startTick: 0 },
    });
    const edited = transact(initial, 'Edited', 'event-2');
    const undone = undoEditorHistory(edited);
    const redone = redoEditorHistory(undone);

    expect(
      [initial, edited, undone, redone].map(({ workingRevision }) => workingRevision.number),
    ).toEqual([7, 8, 9, 10]);
    expect(
      new Set([edited, undone, redone].map(({ workingRevision }) => workingRevision.id)).size,
    ).toBe(3);
    expect(undone.document.authoredTitle).toBe('Initial');
    expect(undone.workspace.focus).toEqual(eventFocus());
    expect(undone.workspace.selection).toEqual(caret());
    expect(redone.document.authoredTitle).toBe('Edited');
    expect(redone.workspace.focus).toEqual(eventFocus('event-2'));
    expect(redone.workspace.selection).toEqual(caret('event-2'));
    for (const state of [undone, redone]) {
      expect(state.workspace.layout).toEqual(initial.workspace.layout);
      expect(state.workspace.playheadTick).toBe(100);
      expect(state.workspace.practiceRange).toEqual({ endTickExclusive: 960, startTick: 0 });
    }
  });

  it('clears redo on a branch after undo without reusing revision identities', () => {
    const first = transact(create(), 'First');
    const second = transact(first, 'Second');
    const undone = undoEditorHistory(second);
    const branched = transact(undone, 'Branch');

    expect(undone.future).toHaveLength(1);
    expect(branched.future).toHaveLength(0);
    expect(redoEditorHistory(branched)).toBe(branched);
    expect(branched.document.authoredTitle).toBe('Branch');
    expect(branched.workingRevision.number).toBe(11);
    expect(branched.workingRevision.id).not.toBe(second.workingRevision.id);
  });

  it('bounds retained undo entries and stops cleanly at the evicted boundary', () => {
    const one = transact(create(2), 'One');
    const two = transact(one, 'Two');
    const three = transact(two, 'Three');
    expect(three.past).toHaveLength(2);

    const undoThree = undoEditorHistory(three);
    const undoTwo = undoEditorHistory(undoThree);
    expect(undoTwo.document.authoredTitle).toBe('One');
    expect(undoEditorHistory(undoTwo)).toBe(undoTwo);
  });

  it('tracks saved content independently from monotonic working revisions', () => {
    const first = transact(create(), 'First');
    const saved = markEditorHistorySaved(first);
    const second = transact(saved, 'Second');
    const backAtSavedContent = undoEditorHistory(second);
    const redone = redoEditorHistory(backAtSavedContent);

    expect(first.isDirty).toBe(true);
    expect(saved.isDirty).toBe(false);
    expect(saved.savedRevision).toBe(saved.workingRevision);
    expect(second.isDirty).toBe(true);
    expect(backAtSavedContent.isDirty).toBe(false);
    expect(backAtSavedContent.workingRevision.number).toBeGreaterThan(saved.workingRevision.number);
    expect(redone.isDirty).toBe(true);

    const initiallyDirty = createEditorHistory(document('Unsaved'), {
      initiallySaved: false,
      initialRevisionId: 'revision-1',
      initialRevisionNumber: 1,
      revisionNamespace: 'unsaved-test',
    });
    expect(initiallyDirty).toMatchObject({
      isDirty: true,
      savedContentToken: null,
      savedRevision: null,
    });
  });

  it('detaches and freezes document snapshots against caller mutation', () => {
    const input = document('Mutable') as {
      authoredTitle: string;
      events: { id: string; tick: number }[];
    };
    const state = createEditorHistory(input, {
      initialRevisionId: 'revision-1',
      initialRevisionNumber: 1,
      revisionNamespace: 'mutation-test',
    });
    input.authoredTitle = 'Mutated outside';
    input.events[0] = { id: 'replacement', tick: 99 };

    expect(state.document).toEqual(document('Mutable'));
    expect(Object.isFrozen(state.document)).toBe(true);
    expect(Object.isFrozen(state.document.events)).toBe(true);
    expect(Object.isFrozen(state.document.events[0])).toBe(true);
  });

  it('rejects invalid bounds, descriptors, and non-canonical documents', () => {
    expect(() => create(0)).toThrow(/historyLimit/);
    expect(() => create(EDITOR_HISTORY_LIMITS.maximumHistoryEntries + 1)).toThrow(/historyLimit/);
    expect(() =>
      createEditorHistory(document('Initial'), {
        initialRevisionId: 'revision-1',
        initialRevisionNumber: -1,
        revisionNamespace: 'invalid-revision',
      }),
    ).toThrow(/initialRevisionNumber/);
    expect(() =>
      createEditorHistory(document('Initial'), {
        initialRevisionId: 'revision-1',
        initialRevisionNumber: 1,
        revisionNamespace: 'x'.repeat(EDITOR_HISTORY_LIMITS.maximumRevisionNamespaceLength + 1),
      }),
    ).toThrow(/revisionNamespace/);
    expect(() =>
      createEditorHistory(document('Initial'), {
        initialRevisionId: 'session/working/99',
        initialRevisionNumber: 1,
        revisionNamespace: 'session',
      }),
    ).toThrow(/must match/);
    expect(() =>
      updateEditorWorkspace(create(), {
        layout: { sidebar: 'editor', viewMode: 'page', zoomPercent: 401 },
      }),
    ).toThrow(/zoomPercent/);
    expect(() =>
      updateEditorWorkspace(create(), {
        practiceRange: { endTickExclusive: 10, startTick: 10 },
      }),
    ).toThrow(/half-open/);
    expect(() =>
      updateEditorWorkspace(create(), {
        selection: caret(''),
      }),
    ).toThrow(/eventId/);
    expect(() =>
      updateEditorWorkspace(create(), {
        selection: { kind: 'renderer-node' } as never,
      }),
    ).toThrow(/selection.kind/);
    expect(() =>
      applyEditorTransaction(create(), {
        document: document('Invalid label'),
        focus: null,
        label: '',
        selection: null,
        transactionId: 'transaction-invalid-label',
      }),
    ).toThrow(/label/);
    expect(() =>
      applyEditorTransaction(create(), {
        document: document('Invalid transaction'),
        focus: null,
        label: 'Invalid transaction ID',
        selection: null,
        transactionId: '',
      }),
    ).toThrow(/transactionId/);

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'title', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'unsafe';
      },
    });
    expect(() =>
      createEditorHistory(accessor, {
        initialRevisionId: 'revision-1',
        initialRevisionNumber: 1,
        revisionNamespace: 'accessor-test',
      }),
    ).toThrow(/accessor/);
    expect(getterCalls).toBe(0);
  });

  it('rejects revision and content-token overflow instead of reusing identity', () => {
    const atMaximumRevision = createEditorHistory(document('Maximum'), {
      initialRevisionId: 'revision-max',
      initialRevisionNumber: Number.MAX_SAFE_INTEGER,
      revisionNamespace: 'overflow-test',
    });
    expect(() => transact(atMaximumRevision, 'Overflow')).toThrow(/revision number/);

    const state = create();
    const corruptedCounter = {
      ...state,
      nextContentToken: Number.MAX_SAFE_INTEGER + 1,
    };
    expect(() => transact(corruptedCounter, 'Overflow')).toThrow(/content token/);
    expect(() => transact({ ...state, nextContentToken: -1 }, 'Negative')).toThrow(/content token/);
  });
});
