import {
  EmptyWorkspaceLayout,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  addWorkspaceModule,
  loadWorkspaceLayout,
  moveWorkspaceModule,
  parseWorkspaceLayout,
  placeWorkspaceModule,
  removeWorkspaceModule,
  saveWorkspaceLayout,
} from './workspaceLayout';

const available = ['analysis', 'polyphonic-analysis', 'session-review'] as const;

class ThrowingStorage implements Storage {
  readonly length = 0;

  clear(): void {
    return undefined;
  }

  getItem(): string | null {
    throw new Error('Storage blocked');
  }

  key(): string | null {
    return null;
  }

  removeItem(): void {
    return undefined;
  }

  setItem(): void {
    throw new Error('Storage blocked');
  }
}

describe('workspace layout', () => {
  it('starts empty and rejects malformed preferences', () => {
    expect(parseWorkspaceLayout(null, available)).toEqual(EmptyWorkspaceLayout);
    expect(parseWorkspaceLayout('{broken', available)).toEqual(EmptyWorkspaceLayout);
  });

  it('filters unavailable, unknown, and duplicate module ids while preserving order', () => {
    expect(
      parseWorkspaceLayout(
        JSON.stringify({
          optionalModuleIds: [
            'session-review',
            'unknown',
            'analysis',
            'session-review',
            'benchmark',
          ],
          schemaVersion: 1,
        }),
        available,
      ),
    ).toEqual({
      optionalModuleIds: ['session-review', 'analysis'],
      schemaVersion: 1,
    });
  });

  it('adds, removes, moves, and places modules without duplicates', () => {
    const withPitch = addWorkspaceModule(EmptyWorkspaceLayout, 'analysis', available);
    const withChord = addWorkspaceModule(withPitch, 'polyphonic-analysis', available);
    expect(addWorkspaceModule(withChord, 'analysis', available)).toBe(withChord);
    expect(moveWorkspaceModule(withChord, 'polyphonic-analysis', -1).optionalModuleIds).toEqual([
      'polyphonic-analysis',
      'analysis',
    ]);
    expect(
      placeWorkspaceModule(withChord, 'analysis', 'polyphonic-analysis', 'after').optionalModuleIds,
    ).toEqual(['polyphonic-analysis', 'analysis']);
    const removed = removeWorkspaceModule(withChord, 'analysis');
    expect(removed.optionalModuleIds).toEqual(['polyphonic-analysis']);
  });

  it('keeps invalid and boundary reorder operations as no-ops', () => {
    const withPitch = addWorkspaceModule(EmptyWorkspaceLayout, 'analysis', available);
    const withChord = addWorkspaceModule(withPitch, 'polyphonic-analysis', available);

    expect(addWorkspaceModule(withChord, 'benchmark', available)).toBe(withChord);
    expect(moveWorkspaceModule(EmptyWorkspaceLayout, 'analysis', 1)).toBe(EmptyWorkspaceLayout);
    expect(moveWorkspaceModule(withChord, 'analysis', -1)).toBe(withChord);
    expect(moveWorkspaceModule(withChord, 'polyphonic-analysis', 1)).toBe(withChord);
    expect(placeWorkspaceModule(withChord, 'analysis', 'analysis', 'before')).toBe(withChord);
    expect(placeWorkspaceModule(withPitch, 'analysis', 'polyphonic-analysis', 'before')).toBe(
      withPitch,
    );
  });

  it('loads and saves the preference independently from session storage', () => {
    const storage = window.localStorage;
    storage.clear();
    const layout = { optionalModuleIds: ['analysis'] as const, schemaVersion: 1 as const };
    storage.setItem('stringsight.workspace-layout.v1', JSON.stringify(layout));

    expect(loadWorkspaceLayout(storage, available)).toBe(EmptyWorkspaceLayout);

    saveWorkspaceLayout(storage, layout);
    expect(WORKSPACE_LAYOUT_STORAGE_KEY).toBe('stringsight.workspace-layout.v2');
    expect(storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).not.toBeNull();
    expect(loadWorkspaceLayout(storage, available)).toEqual(layout);
  });

  it('falls back safely when preference storage is absent or blocked', () => {
    const blocked = new ThrowingStorage();
    expect(loadWorkspaceLayout(undefined, available)).toBe(EmptyWorkspaceLayout);
    expect(loadWorkspaceLayout(blocked, available)).toBe(EmptyWorkspaceLayout);
    expect(() => saveWorkspaceLayout(undefined, EmptyWorkspaceLayout)).not.toThrow();
    expect(() => saveWorkspaceLayout(blocked, EmptyWorkspaceLayout)).not.toThrow();
  });
});
