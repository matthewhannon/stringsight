import { describe, expect, it } from 'vitest';

import { createPracticeNativeEnvelope } from '../shared/practice-native';
import {
  PRACTICE_EDITOR_NATIVE_LIMITS,
  createBlankPracticeDocument,
  createNextPracticeDocumentRevision,
  openPracticeDocument,
  savePracticeDocument,
  type PracticeNativeByteStorage,
  type PracticeNativeTextStorage,
} from './native';

const createRequest = () => ({
  createdAt: '2026-07-20T12:00:00Z',
  documentId: 'document-1',
  revisionId: 'revision-1',
  title: 'New guitar tab',
});

function byteStorage() {
  const values = new Map<string, Uint8Array>();
  const storage: PracticeNativeByteStorage = {
    kind: 'bytes',
    read: (key) => {
      const value = values.get(key);
      return value === undefined
        ? Promise.reject(new Error('Missing bytes.'))
        : Promise.resolve(value.slice());
    },
    write: (key, value) => {
      values.set(key, value.slice());
      return Promise.resolve();
    },
  };
  return { storage, values };
}

function textStorage() {
  const values = new Map<string, string>();
  const storage: PracticeNativeTextStorage = {
    kind: 'text',
    read: (key) => {
      const value = values.get(key);
      return value === undefined
        ? Promise.reject(new Error('Missing text.'))
        : Promise.resolve(value);
    },
    write: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
  };
  return { storage, values };
}

describe('renderer-independent native Practice Document workflow', () => {
  it('creates a valid blank document with recomputed qualified identities', async () => {
    const document = await createBlankPracticeDocument(createRequest());

    expect(document.revision).toMatchObject({
      documentId: 'document-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
    });
    expect(document.tracks[0]?.voices[0]?.events).toEqual([]);
    expect(document.revision.contentHash.digestHex).not.toBe('0'.repeat(64));
    expect(document.expectedProjectionHash.digestHex).not.toBe('0'.repeat(64));
    await expect(
      createPracticeNativeEnvelope(document, '2026-07-20T12:01:00Z'),
    ).resolves.toBeDefined();
  });

  it('finalizes only the monotonic next revision and recomputes changed content', async () => {
    const first = await createBlankPracticeDocument(createRequest());
    const draft = structuredClone(first);
    draft.metadata.title = 'Edited guitar tab';
    const second = await createNextPracticeDocumentRevision(first, draft, {
      revisionId: 'revision-2',
      updatedAt: '2026-07-20T12:01:00Z',
    });

    expect(second.revision.revisionNumber).toBe(2);
    expect(second.revision.documentId).toBe(first.revision.documentId);
    expect(second.revision.revisionId).toBe('revision-2');
    expect(second.revision.contentHash.digestHex).not.toBe(first.revision.contentHash.digestHex);
    expect(second.metadata.title).toBe('Edited guitar tab');

    await expect(
      createNextPracticeDocumentRevision(first, draft, {
        revisionId: 'revision-1',
        updatedAt: '2026-07-20T12:01:00Z',
      }),
    ).rejects.toThrow(/new revision ID/);
    await expect(
      createNextPracticeDocumentRevision(first, draft, {
        revisionId: 'revision-2',
        updatedAt: '2026-07-20T11:59:00Z',
      }),
    ).rejects.toThrow(/cannot move backwards/);

    const switchedDocument = structuredClone(draft);
    switchedDocument.revision.documentId = 'document-other';
    await expect(
      createNextPracticeDocumentRevision(first, switchedDocument, {
        revisionId: 'revision-2',
        updatedAt: '2026-07-20T12:01:00Z',
      }),
    ).rejects.toThrow(/cannot change document identity/);
  });

  it('round-trips trusted native envelopes through byte and text storage seams', async () => {
    const document = await createBlankPracticeDocument(createRequest());
    const stores = [byteStorage().storage, textStorage().storage] as const;

    for (const storage of stores) {
      const saved = await savePracticeDocument(
        storage,
        'practice/document-1',
        document,
        '2026-07-20T12:01:00Z',
      );
      expect(saved.kind).toBe('saved');
      if (saved.kind !== 'saved') throw new Error(saved.message);
      expect(saved.revisionNumber).toBe(1);
      expect(saved.byteLength).toBeGreaterThan(0);

      const opened = await openPracticeDocument(storage, 'practice/document-1');
      if (opened.kind !== 'opened') throw new Error(opened.message);
      expect(opened.kind).toBe('opened');
      expect(opened.document).toEqual(document);
      expect(opened.revisionNumber).toBe(1);
    }
  });

  it('never reports saved when preparation or storage write fails', async () => {
    const invalid = { ...(await createBlankPracticeDocument(createRequest())), ppq: 480 };
    const storage: PracticeNativeTextStorage = {
      kind: 'text',
      read: () => Promise.resolve(''),
      write: () => Promise.reject(new Error('Disk full.')),
    };

    await expect(
      savePracticeDocument(storage, 'invalid', invalid, '2026-07-20T12:01:00Z'),
    ).resolves.toMatchObject({ code: 'invalid-document', kind: 'failed', operation: 'save' });
    await expect(
      savePracticeDocument(
        storage,
        'valid',
        await createBlankPracticeDocument(createRequest()),
        '2026-07-20T12:01:00Z',
      ),
    ).resolves.toMatchObject({ code: 'storage-write-failed', kind: 'failed', operation: 'save' });
  });

  it('returns explicit open failures for missing, malformed, tampered, and invalid UTF-8 data', async () => {
    const { storage, values } = textStorage();
    await expect(openPracticeDocument(storage, 'missing')).resolves.toMatchObject({
      code: 'storage-read-failed',
      kind: 'failed',
    });

    values.set('malformed', '{');
    await expect(openPracticeDocument(storage, 'malformed')).resolves.toMatchObject({
      code: 'verification-failed',
      kind: 'failed',
    });

    const document = await createBlankPracticeDocument(createRequest());
    const saved = await savePracticeDocument(storage, 'tampered', document, '2026-07-20T12:01:00Z');
    if (saved.kind !== 'saved') throw new Error(saved.message);
    const tampered = JSON.parse(values.get('tampered') ?? '') as {
      document: { metadata: { title: string } };
    };
    tampered.document.metadata.title = 'Tampered title';
    values.set('tampered', JSON.stringify(tampered));
    await expect(openPracticeDocument(storage, 'tampered')).resolves.toMatchObject({
      code: 'verification-failed',
      kind: 'failed',
    });

    const invalidUtf8: PracticeNativeByteStorage = {
      kind: 'bytes',
      read: () => Promise.resolve(new Uint8Array([0xc3, 0x28])),
      write: () => Promise.resolve(),
    };
    await expect(openPracticeDocument(invalidUtf8, 'bad-utf8')).resolves.toMatchObject({
      code: 'text-decode-failed',
      kind: 'failed',
    });
  });

  it('rejects raw accessors without invocation and oversized envelopes before decoding', async () => {
    const request = createRequest();
    let getterCalls = 0;
    Object.defineProperty(request, 'title', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'Accessor title';
      },
    });
    await expect(createBlankPracticeDocument(request)).rejects.toMatchObject({
      code: 'ACCESSOR_PROPERTY',
    });
    expect(getterCalls).toBe(0);

    const oversized: PracticeNativeByteStorage = {
      kind: 'bytes',
      read: () =>
        Promise.resolve(new Uint8Array(PRACTICE_EDITOR_NATIVE_LIMITS.maximumEnvelopeBytes + 1)),
      write: () => Promise.resolve(),
    };
    await expect(openPracticeDocument(oversized, 'oversized')).resolves.toMatchObject({
      code: 'envelope-too-large',
      kind: 'failed',
    });
  });
});
