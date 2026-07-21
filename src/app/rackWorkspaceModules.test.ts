import {
  AvailableWorkspaceModuleIds,
  AvailableWorkspaceModules,
  WorkspaceModuleRegistry,
} from './rackWorkspaceModules';

describe('rack workspace modules', () => {
  it('keeps the evaluation bench implementation registered but hidden from the rack', () => {
    expect(WorkspaceModuleRegistry.benchmark.title).toBe('Evaluation bench');
    expect(WorkspaceModuleRegistry.benchmark.hidden).toBe(true);
    expect(AvailableWorkspaceModuleIds).not.toContain('benchmark');
    expect(AvailableWorkspaceModules).not.toContain(WorkspaceModuleRegistry.benchmark);
  });
});
