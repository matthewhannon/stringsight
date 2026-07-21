import { z } from 'zod';

import { OptionalWorkspaceModuleIds, type OptionalWorkspaceModuleId } from './rackWorkspaceModules';

export const WORKSPACE_LAYOUT_STORAGE_KEY = 'stringsight.workspace-layout.v2';

export type WorkspaceLayout = {
  readonly optionalModuleIds: readonly OptionalWorkspaceModuleId[];
  readonly schemaVersion: 1;
};

const PersistedWorkspaceLayoutSchema = z.object({
  optionalModuleIds: z.array(z.string()),
  schemaVersion: z.literal(1),
});

export const EmptyWorkspaceLayout: WorkspaceLayout = {
  optionalModuleIds: [],
  schemaVersion: 1,
};

const normalizedModuleIds = (
  values: readonly string[],
  availableIds: readonly OptionalWorkspaceModuleId[],
): OptionalWorkspaceModuleId[] => {
  const available = new Set<string>(availableIds);
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const moduleId = OptionalWorkspaceModuleIds.find((id) => id === value);
    if (moduleId === undefined || !available.has(moduleId) || seen.has(moduleId)) {
      return [];
    }
    seen.add(moduleId);
    return [moduleId];
  });
};

export const parseWorkspaceLayout = (
  value: string | null,
  availableIds: readonly OptionalWorkspaceModuleId[],
): WorkspaceLayout => {
  if (value === null) return EmptyWorkspaceLayout;
  try {
    const parsed = PersistedWorkspaceLayoutSchema.parse(JSON.parse(value));
    return {
      optionalModuleIds: normalizedModuleIds(parsed.optionalModuleIds, availableIds),
      schemaVersion: 1,
    };
  } catch {
    return EmptyWorkspaceLayout;
  }
};

export const workspaceLayoutStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const loadWorkspaceLayout = (
  storage: Storage | undefined,
  availableIds: readonly OptionalWorkspaceModuleId[],
): WorkspaceLayout => {
  if (storage === undefined) return EmptyWorkspaceLayout;
  try {
    return parseWorkspaceLayout(storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY), availableIds);
  } catch {
    return EmptyWorkspaceLayout;
  }
};

export const saveWorkspaceLayout = (
  storage: Storage | undefined,
  layout: WorkspaceLayout,
): void => {
  try {
    storage?.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // A blocked preference store must not prevent the rack from operating.
  }
};

export const addWorkspaceModule = (
  layout: WorkspaceLayout,
  id: OptionalWorkspaceModuleId,
  availableIds: readonly OptionalWorkspaceModuleId[],
): WorkspaceLayout => {
  if (!availableIds.includes(id) || layout.optionalModuleIds.includes(id)) return layout;
  return { ...layout, optionalModuleIds: [...layout.optionalModuleIds, id] };
};

export const removeWorkspaceModule = (
  layout: WorkspaceLayout,
  id: OptionalWorkspaceModuleId,
): WorkspaceLayout => ({
  ...layout,
  optionalModuleIds: layout.optionalModuleIds.filter((moduleId) => moduleId !== id),
});

export const moveWorkspaceModule = (
  layout: WorkspaceLayout,
  id: OptionalWorkspaceModuleId,
  offset: -1 | 1,
): WorkspaceLayout => {
  const index = layout.optionalModuleIds.indexOf(id);
  if (index === -1) return layout;
  const nextIndex = index + offset;
  if (nextIndex < 0 || nextIndex >= layout.optionalModuleIds.length) return layout;
  const nextIds = [...layout.optionalModuleIds];
  const currentId = nextIds[index];
  const nextId = nextIds[nextIndex];
  if (currentId === undefined || nextId === undefined) return layout;
  nextIds[index] = nextId;
  nextIds[nextIndex] = currentId;
  return { ...layout, optionalModuleIds: nextIds };
};

export const placeWorkspaceModule = (
  layout: WorkspaceLayout,
  id: OptionalWorkspaceModuleId,
  targetId: OptionalWorkspaceModuleId,
  position: 'after' | 'before',
): WorkspaceLayout => {
  if (id === targetId || !layout.optionalModuleIds.includes(id)) return layout;
  const withoutModule = layout.optionalModuleIds.filter((moduleId) => moduleId !== id);
  const targetIndex = withoutModule.indexOf(targetId);
  if (targetIndex === -1) return layout;
  const insertionIndex = targetIndex + (position === 'after' ? 1 : 0);
  return {
    ...layout,
    optionalModuleIds: [
      ...withoutModule.slice(0, insertionIndex),
      id,
      ...withoutModule.slice(insertionIndex),
    ],
  };
};
