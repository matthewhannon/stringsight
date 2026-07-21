import { describe, expect, it } from 'vitest';

import { createBlankPracticeDocument } from './native';
import { inspectPracticeDocument } from './inspection';
import {
  editorFocusFromInspectionTarget,
  editorPositionFromInspectionTarget,
  navigatePracticeInspection,
  practiceInspectionIntentForKey,
} from './navigation';

const rowAt = (inspection: ReturnType<typeof inspectPracticeDocument>, index: number) => {
  const row = inspection.rows[index];
  if (row === undefined) throw new RangeError(`Missing inspection row ${String(index)}.`);
  return row;
};

describe('semantic inspection keyboard navigation', () => {
  it('navigates the tree without renderer geometry', async () => {
    const document = await createBlankPracticeDocument({
      createdAt: '2026-07-20T20:00:00.000Z',
      documentId: 'document-1',
      revisionId: 'revision-1',
      title: 'Keyboard score',
    });
    const inspection = inspectPracticeDocument(document);
    const root = rowAt(inspection, 0);
    const track = rowAt(inspection, 1);
    const voice = rowAt(inspection, 2);

    expect(practiceInspectionIntentForKey('ArrowDown')).toBe('next');
    expect(practiceInspectionIntentForKey('Enter')).toBeNull();
    expect(navigatePracticeInspection(inspection, null, 'next')).toBe(root);
    expect(navigatePracticeInspection(inspection, root.rowId, 'first-child')).toBe(track);
    expect(navigatePracticeInspection(inspection, track.rowId, 'first-child')).toBe(voice);
    expect(navigatePracticeInspection(inspection, voice.rowId, 'parent')).toBe(track);
    expect(navigatePracticeInspection(inspection, root.rowId, 'previous')).toBe(root);
    expect(navigatePracticeInspection(inspection, voice.rowId, 'next')).toBe(voice);
    expect(navigatePracticeInspection(inspection, 'removed-row', 'next')).toBe(root);
  });

  it('converts semantic rows to renderer-independent editor focus and positions', async () => {
    const document = await createBlankPracticeDocument({
      createdAt: '2026-07-20T20:00:00.000Z',
      documentId: 'document-1',
      revisionId: 'revision-1',
      title: 'Keyboard score',
    });
    const inspection = inspectPracticeDocument(document);
    const voice = rowAt(inspection, 2);

    expect(editorFocusFromInspectionTarget(rowAt(inspection, 0).focusTarget)).toEqual({
      kind: 'document',
    });
    expect(editorFocusFromInspectionTarget(voice.focusTarget)).toEqual({
      kind: 'voice',
      trackId: 'track-1',
      voiceId: 'voice-1',
    });
    expect(editorPositionFromInspectionTarget(voice.focusTarget)).toBeNull();
  });
});
