import { describe, expect, it } from 'vitest';

import { importBoundedScore } from '../importing';
import gp8Base64 from '../importing/score/__fixtures__/gp8-basic.gp.base64?raw';
import { createBlankPracticeDocument, savePracticeDocument } from './native';
import {
  acceptPracticeImportReviewBundle,
  applyPracticeEditorTransaction,
  createPracticeEditorWorkflow,
  openPracticeEditorWorkflow,
  redoPracticeEditorWorkflow,
  savePracticeEditorWorkflow,
  undoPracticeEditorWorkflow,
  updatePracticeEditorWorkspace,
  type PracticeEditorWorkflowState,
} from './workflow';

type ByteStorage = Readonly<{
  kind: 'bytes';
  read(key: string): Promise<Uint8Array>;
  write(key: string, value: Uint8Array): Promise<void>;
}>;

const memoryStorage = (): ByteStorage => {
  const values = new Map<string, Uint8Array>();
  return {
    kind: 'bytes',
    read(key) {
      const value = values.get(key);
      return value === undefined
        ? Promise.reject(new Error('missing'))
        : Promise.resolve(new Uint8Array(value));
    },
    write(key, value) {
      values.set(key, new Uint8Array(value));
      return Promise.resolve();
    },
  };
};

const blank = () =>
  createBlankPracticeDocument({
    createdAt: '2026-07-20T12:00:00Z',
    documentId: 'document-1',
    revisionId: 'revision-1',
    title: 'Initial score',
  });

const openedWorkflow = async (): Promise<PracticeEditorWorkflowState> => {
  const storage = memoryStorage();
  const document = await blank();
  const saved = await savePracticeDocument(
    storage,
    'practice/document-1',
    document,
    '2026-07-20T12:01:00Z',
  );
  if (saved.kind !== 'saved') throw new Error(saved.message);
  const opened = await openPracticeEditorWorkflow(storage, 'practice/document-1');
  if (opened.kind !== 'opened') throw new Error(opened.message);
  return opened.state;
};

const editTitle = (state: PracticeEditorWorkflowState, title: string, updatedAt: string) =>
  applyPracticeEditorTransaction(state, {
    commands: [{ kind: 'set-metadata', title }],
    focus: { kind: 'document' },
    label: `Set title to ${title}`,
    selection: null,
    transactionId: `transaction-${title}`,
    updatedAt,
  });

const expectUnifiedRevision = (state: PracticeEditorWorkflowState): void => {
  expect(state.history.document.revision).toMatchObject({
    revisionId: state.history.workingRevision.id,
    revisionNumber: state.history.workingRevision.number,
  });
};

describe('renderer-independent editor workflow', () => {
  it('re-verifies an import review bundle and starts clean unsaved canonical history', async () => {
    const imported = await importBoundedScore({
      bytes: Uint8Array.from(atob(gp8Base64.trim()), (character) => character.charCodeAt(0)),
      fileName: 'gp8-basic.gp',
      fixtureId: 'gp8-basic',
      importedAt: '2026-07-20T12:00:00Z',
    });
    if (imported.draft === null || imported.report === null) {
      throw new Error('Expected a reviewable GP8 bundle.');
    }
    const bundle = { bundleVersion: 1 as const, draft: imported.draft, report: imported.report };
    const state = await acceptPracticeImportReviewBundle(bundle);

    expect(state.history).toMatchObject({ future: [], isDirty: true, past: [] });
    expect(state.history.document.metadata.title).toBe('gp8-basic');
    expect(state.history.document.importProvenance).toMatchObject({
      adapterId: 'stringsight-alphatab-import',
      sourceFormat: 'guitar-pro',
    });
    expect(state.inspection.rows.filter(({ kind }) => kind === 'event')).toHaveLength(4);

    const tampered = structuredClone(bundle);
    const mutableTampered = tampered as unknown as {
      draft: { candidateDocument: { metadata: { title: string } } };
    };
    mutableTampered.draft.candidateDocument.metadata.title = 'Tampered after review';
    await expect(acceptPracticeImportReviewBundle(tampered)).rejects.toThrow(
      'candidate content does not match',
    );
  });

  it('creates a blank native score ready for editing without a renderer', async () => {
    const state = await createPracticeEditorWorkflow({
      createdAt: '2026-07-20T12:00:00Z',
      documentId: 'created-document',
      revisionId: 'created-revision',
      title: 'Created score',
    });

    expect(state.history.isDirty).toBe(true);
    expect(state.history.savedRevision).toBeNull();
    expect(state.history.document.metadata.title).toBe('Created score');
    expect(state.inspection.rows.map(({ kind }) => kind)).toEqual(['document', 'track', 'voice']);
    expectUnifiedRevision(state);

    const failed = await savePracticeEditorWorkflow(
      state,
      {
        kind: 'bytes',
        read() {
          return Promise.reject(new Error('not used'));
        },
        write() {
          return Promise.reject(new Error('disk full'));
        },
      },
      'practice/created-document',
      '2026-07-20T12:01:00Z',
    );
    expect(failed.kind).toBe('failed');
    expect(failed.state.history.isDirty).toBe(true);
    expect(failed.state.history.savedRevision).toBeNull();
  });

  it('opens trusted native storage as clean history with semantic inspection', async () => {
    const state = await openedWorkflow();

    expect(state.history).toMatchObject({ isDirty: false, past: [], future: [] });
    expectUnifiedRevision(state);
    expect(state.inspection.documentId).toBe('document-1');
    expect(state.inspection.tree.label).toBe('Score: Initial score');
    expect(state.inspection.rows.map(({ kind }) => kind)).toEqual(['document', 'track', 'voice']);
  });

  it('applies commands through one canonical document/history revision identity', async () => {
    const initial = await openedWorkflow();
    const result = await editTitle(initial, 'Edited score', '2026-07-20T12:02:00Z');
    expect(result.kind).toBe('accepted');
    if (result.kind !== 'accepted') throw new Error('Expected accepted edit.');

    expect(result.state.history.document.metadata.title).toBe('Edited score');
    expect(result.state.history.workingRevision.number).toBe(2);
    expect(result.state.history.isDirty).toBe(true);
    expectUnifiedRevision(result.state);
    expect(result.state.inspection.tree.label).toBe('Score: Edited score');
  });

  it('canonicalizes undo and redo as fresh monotonic PracticeDocument revisions', async () => {
    const initial = await openedWorkflow();
    const edit = await editTitle(initial, 'Edited score', '2026-07-20T12:02:00Z');
    if (edit.kind !== 'accepted') throw new Error('Expected accepted edit.');
    const undone = await undoPracticeEditorWorkflow(edit.state, '2026-07-20T12:03:00Z');
    const redone = await redoPracticeEditorWorkflow(undone, '2026-07-20T12:04:00Z');

    expect(undone.history.document.metadata.title).toBe('Initial score');
    expect(undone.history.workingRevision.number).toBe(3);
    expect(undone.history.isDirty).toBe(true);
    expectUnifiedRevision(undone);
    expect(redone.history.document.metadata.title).toBe('Edited score');
    expect(redone.history.workingRevision.number).toBe(4);
    expect(redone.history.isDirty).toBe(true);
    expectUnifiedRevision(redone);
    expect(
      new Set([edit.state, undone, redone].map(({ history }) => history.workingRevision.id)).size,
    ).toBe(3);
  });

  it('marks clean only after storage succeeds and preserves dirty state on failure', async () => {
    const initial = await openedWorkflow();
    const edit = await editTitle(initial, 'Unsaved score', '2026-07-20T12:02:00Z');
    if (edit.kind !== 'accepted') throw new Error('Expected accepted edit.');
    const failingStorage: ByteStorage = {
      kind: 'bytes',
      read() {
        return Promise.reject(new Error('not used'));
      },
      write() {
        return Promise.reject(new Error('disk full'));
      },
    };

    const failed = await savePracticeEditorWorkflow(
      edit.state,
      failingStorage,
      'practice/document-1',
      '2026-07-20T12:03:00Z',
    );
    expect(failed.kind).toBe('failed');
    expect(failed.state).toBe(edit.state);
    expect(failed.state.history.isDirty).toBe(true);

    const saved = await savePracticeEditorWorkflow(
      edit.state,
      memoryStorage(),
      'practice/document-1',
      '2026-07-20T12:03:00Z',
    );
    expect(saved.kind).toBe('saved');
    expect(saved.state.history.isDirty).toBe(false);
    expect(saved.state.history.savedRevision).toBe(saved.state.history.workingRevision);
    expectUnifiedRevision(saved.state);
  });

  it('keeps workspace updates out of canonical revisions and reuses inspection', async () => {
    const initial = await openedWorkflow();
    const updated = updatePracticeEditorWorkspace(initial, {
      layout: { sidebar: 'takes', viewMode: 'continuous', zoomPercent: 150 },
      playheadTick: 480,
      practiceRange: { endTickExclusive: 960, startTick: 240 },
    });

    expect(updated.history.document).toBe(initial.history.document);
    expect(updated.history.workingRevision).toBe(initial.history.workingRevision);
    expect(updated.inspection).toBe(initial.inspection);
    expect(updated.history.isDirty).toBe(false);
  });

  it('rejects nonexistent semantic workspace state during initialization and updates', async () => {
    await expect(
      createPracticeEditorWorkflow(
        {
          createdAt: '2026-07-20T12:00:00Z',
          documentId: 'created-document',
          revisionId: 'created-revision',
          title: 'Created score',
        },
        {
          workspace: {
            focus: {
              eventId: 'missing-event',
              kind: 'event',
              trackId: 'track-1',
              voiceId: 'voice-1',
            },
          },
        },
      ),
    ).rejects.toThrow('Editor focus must identify a semantic node');

    const initial = await openedWorkflow();
    expect(() =>
      updatePracticeEditorWorkspace(initial, {
        focus: { kind: 'track', trackId: 'missing-track' },
      }),
    ).toThrow('Editor focus must identify a semantic node');
  });

  it('returns command rejection without advancing workflow state', async () => {
    const initial = await openedWorkflow();
    const result = await applyPracticeEditorTransaction(initial, {
      commands: [
        {
          kind: 'rename-track',
          name: 'Missing',
          trackId: 'missing-track',
        },
      ],
      focus: null,
      label: 'Invalid rename',
      selection: null,
      transactionId: 'transaction-invalid',
      updatedAt: '2026-07-20T12:02:00Z',
    });

    expect(result.kind).toBe('rejected');
    expect(result.state).toBe(initial);
    if (result.kind === 'rejected') {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'command-target-not-found' }),
      );
    }
  });

  it('rejects stale semantic focus without committing an otherwise valid edit', async () => {
    const initial = await openedWorkflow();
    const result = await applyPracticeEditorTransaction(initial, {
      commands: [{ kind: 'set-metadata', title: 'Must not commit' }],
      focus: {
        eventId: 'removed-event',
        kind: 'event',
        trackId: 'track-1',
        voiceId: 'voice-1',
      },
      label: 'Invalid semantic focus',
      selection: null,
      transactionId: 'transaction-invalid-focus',
      updatedAt: '2026-07-20T12:02:00Z',
    });

    expect(result).toMatchObject({
      issues: [{ code: 'interaction-invalid', path: ['focus'] }],
      kind: 'rejected',
      state: initial,
    });

    const malformedSelection = await applyPracticeEditorTransaction(initial, {
      commands: [{ kind: 'set-metadata', title: 'Must not commit either' }],
      focus: { kind: 'document' },
      label: 'Invalid selection kind',
      selection: { kind: 'renderer-node' } as never,
      transactionId: 'transaction-invalid-selection',
      updatedAt: '2026-07-20T12:02:00Z',
    });
    expect(malformedSelection).toMatchObject({
      issues: [{ code: 'interaction-invalid', path: ['selection', 'kind'] }],
      kind: 'rejected',
      state: initial,
    });

    const malformedFocus = await applyPracticeEditorTransaction(initial, {
      commands: [{ kind: 'set-metadata', title: 'Still must not commit' }],
      focus: { kind: 'renderer-node' } as never,
      label: 'Invalid focus kind',
      selection: null,
      transactionId: 'transaction-invalid-focus-kind',
      updatedAt: '2026-07-20T12:02:00Z',
    });
    expect(malformedFocus).toMatchObject({
      issues: [{ code: 'interaction-invalid', path: ['focus'] }],
      kind: 'rejected',
      state: initial,
    });
  });
});
