import {
  AvailableWorkspaceModuleIds,
  AvailableWorkspaceModules,
  WorkspaceModuleRegistry,
} from './rackWorkspaceModules';

describe('rack workspace modules', () => {
  it('keeps session review registered but hidden from the rack', () => {
    expect(WorkspaceModuleRegistry['session-review'].title).toBe('Session review');
    expect(WorkspaceModuleRegistry['session-review'].hidden).toBe(true);
    expect(AvailableWorkspaceModuleIds).not.toContain('session-review');
    expect(AvailableWorkspaceModules).not.toContain(WorkspaceModuleRegistry['session-review']);
  });

  it('keeps the evaluation bench implementation registered but hidden from the rack', () => {
    expect(WorkspaceModuleRegistry.benchmark.title).toBe('Evaluation bench');
    expect(WorkspaceModuleRegistry.benchmark.hidden).toBe(true);
    expect(AvailableWorkspaceModuleIds).not.toContain('benchmark');
    expect(AvailableWorkspaceModules).not.toContain(WorkspaceModuleRegistry.benchmark);
  });
});
