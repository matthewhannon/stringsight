import type { ComponentType } from 'react';

import { AudioAnalysisPanel } from './AudioAnalysisPanel';
import { BenchmarkPanel } from './BenchmarkPanel';
import { PolyphonicAnalysisPanel } from './PolyphonicAnalysisPanel';
import { SessionReviewPanel } from './SessionReviewPanel';

export const OptionalWorkspaceModuleIds = [
  'analysis',
  'polyphonic-analysis',
  'session-review',
  'benchmark',
] as const;

export type OptionalWorkspaceModuleId = (typeof OptionalWorkspaceModuleIds)[number];

type EmbeddedToolProps = {
  embedded?: boolean;
};

export type WorkspaceModuleDefinition = {
  Component: ComponentType<EmbeddedToolProps>;
  description?: string;
  hidden?: boolean;
  id: OptionalWorkspaceModuleId;
  libraryDescription: string;
  recommended?: boolean;
  title: string;
  unit: string;
};

export const WorkspaceModuleRegistry: Readonly<
  Record<OptionalWorkspaceModuleId, WorkspaceModuleDefinition>
> = {
  analysis: {
    Component: AudioAnalysisPanel,
    id: 'analysis',
    libraryDescription: 'Live note tuning with actionable pitch correction',
    recommended: true,
    title: 'Pitch analysis',
    unit: 'PITCH',
  },
  'polyphonic-analysis': {
    Component: PolyphonicAnalysisPanel,
    description: 'Detailed chord candidates, chroma evidence, diagnostics, and chord history.',
    id: 'polyphonic-analysis',
    libraryDescription: 'Detailed chord candidates, chroma evidence, and chord history',
    recommended: true,
    title: 'Chord analysis',
    unit: 'CHORD',
  },
  'session-review': {
    Component: SessionReviewPanel,
    description: 'Review completed events, add corrections, save sessions, and export evidence.',
    hidden: true,
    id: 'session-review',
    libraryDescription: 'Review events, add corrections, save sessions, and export evidence',
    title: 'Session review',
    unit: 'REVIEW',
  },
  benchmark: {
    Component: BenchmarkPanel,
    description: 'Prepare and export private fixtures for development evaluation.',
    hidden: true,
    id: 'benchmark',
    libraryDescription: 'Prepare and export private fixtures for development evaluation',
    title: 'Evaluation bench',
    unit: 'EVAL',
  },
};

export const AvailableWorkspaceModules: readonly WorkspaceModuleDefinition[] =
  OptionalWorkspaceModuleIds.map((id) => WorkspaceModuleRegistry[id]).filter(
    ({ hidden }) => hidden !== true,
  );

export const AvailableWorkspaceModuleIds: readonly OptionalWorkspaceModuleId[] =
  AvailableWorkspaceModules.map(({ id }) => id);
