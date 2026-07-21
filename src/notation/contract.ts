import type { SemanticFocus } from '../editor';
import type { PracticeDocument } from '../shared/contracts/practice';

export const NOTATION_ADAPTER_LIMITS = Object.freeze({
  defaultTargetBarsPerSystem: 4,
  maximumAdapterIdentifierLength: 160,
  maximumCapabilityCodes: 32,
  maximumDiagnosticCodeLength: 80,
  maximumDiagnosticMessageLength: 500,
  maximumDiagnostics: 64,
  maximumGeometryEntries: 8_000,
  maximumTargetBarsPerSystem: 16,
  maximumViewportPixels: 16_384,
  maximumZoomPercent: 400,
  minimumTargetBarsPerSystem: 1,
  minimumViewportPixels: 240,
  minimumZoomPercent: 25,
} as const);

export type DeepReadonly<Value> = Value extends
  bigint | boolean | null | number | string | symbol | undefined
  ? Value
  : Value extends (...arguments_: never[]) => unknown
    ? Value
    : Value extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
      : Value extends object
        ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
        : Value;

export type NotationViewMode = 'combined' | 'continuous' | 'expanded' | 'page' | 'tab-only';

export const NOTATION_VIEW_MODES = Object.freeze([
  'expanded',
  'page',
  'continuous',
  'tab-only',
  'combined',
] as const satisfies readonly NotationViewMode[]);

export type NotationView = Readonly<{
  flow: 'continuous' | 'page';
  /** Expanded is the accepted standard-notation stave presentation, never a synthetic zoom. */
  score: 'combined' | 'expanded' | 'tab-only';
}>;

/** Ephemeral presentation input. None of these values belong in a PracticeDocument. */
export type NotationPresentation = Readonly<{
  targetBarsPerSystem?: number;
  view: NotationView;
  viewportHeight: number;
  viewportWidth: number;
  zoomPercent: number;
}>;

export type NotationRenderRequest = Readonly<{
  document: DeepReadonly<PracticeDocument>;
  focus: SemanticFocus | null;
  presentation: NotationPresentation;
  previousRender: NotationRenderFingerprint | null;
}>;

export type NotationCapabilityCode =
  | 'deterministic-invalidation'
  | 'event-geometry'
  | 'presentation-layout'
  | 'semantic-focus'
  | 'tick-geometry';

export type NotationAdapterCapabilities = Readonly<{
  adapterId: string;
  adapterVersion: string;
  capabilityCodes: readonly NotationCapabilityCode[];
  maximumDiagnostics: number;
  maximumGeometryEntries: number;
  supportedViewModes: readonly NotationViewMode[];
}>;

export type NotationDiagnostic = Readonly<{
  code: string;
  message: string;
  semanticId: string | null;
  severity: 'error' | 'warning';
}>;

export type NotationBounds = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type NotationGeometry = Readonly<{
  bounds: NotationBounds;
  geometryId: string;
  /** StringSight presentation page derived from complete renderer system bounds; continuous is null. */
  pageIndex: number | null;
  semanticTarget: Extract<SemanticFocus, { kind: 'event' | 'note' }>;
  /** Zero-based system identity; mounted renderer adapters use renderer-reported systems. */
  systemIndex: number;
}>;

export type NotationSystemLayout = Readonly<{
  /** StringSight presentation page derived from actual system bounds; continuous is null. */
  pageIndex: number | null;
  presentedBounds: NotationBounds;
  /** Detached numeric bounds reported for this system by the mounted renderer. */
  reportedBounds: NotationBounds;
  /** Renderer-reported stable system index. */
  systemIndex: number;
}>;

export type NotationPageLayout = Readonly<{
  bounds: NotationBounds;
  pageIndex: number;
  systemIndexes: readonly number[];
}>;

/** Explicit ephemeral layout applied to the mounted renderer DOM. */
export type NotationPresentationLayout = Readonly<{
  flow: NotationView['flow'];
  pageGapPixels: number;
  pages: readonly NotationPageLayout[];
  systems: readonly NotationSystemLayout[];
}>;

export type NotationEventGeometryMapping = Readonly<{
  endTickExclusive: number;
  eventId: string;
  geometryIds: readonly string[];
  startTick: number;
  trackId: string;
  voiceId: string;
}>;

export type NotationTickGeometryMapping = Readonly<{
  endTickExclusive: number;
  geometryIds: readonly string[];
  startTick: number;
}>;

export type NotationRenderFingerprint = Readonly<{
  adapterId: string;
  adapterVersion: string;
  documentContentDigest: string;
  documentId: string;
  focusKey: string;
  presentationKey: string;
}>;

export type NotationInvalidationReason =
  | 'adapter-changed'
  | 'document-changed'
  | 'focus-changed'
  | 'initial-render'
  | 'presentation-changed';

export type NotationInvalidation = Readonly<{
  kind: 'content' | 'focus' | 'initial' | 'layout' | 'none';
  reasons: readonly NotationInvalidationReason[];
}>;

/**
 * Renderer-independent, ephemeral output. Consumers may cache the fingerprint, but must not put
 * geometry, page/system indexes, or a renderer-owned object graph into durable state.
 */
export type NotationRenderResult = Readonly<{
  capabilities: NotationAdapterCapabilities;
  diagnostics: readonly NotationDiagnostic[];
  eventMappings: readonly NotationEventGeometryMapping[];
  fingerprint: NotationRenderFingerprint;
  focusedGeometryIds: readonly string[];
  geometry: readonly NotationGeometry[];
  invalidation: NotationInvalidation;
  presentationLayout: NotationPresentationLayout;
  source: Readonly<{
    contentDigest: string;
    documentId: string;
    revisionId: string;
    revisionNumber: number;
  }>;
  tickMappings: readonly NotationTickGeometryMapping[];
}>;

export type NotationAdapter = Readonly<{
  capabilities: NotationAdapterCapabilities;
  render(request: NotationRenderRequest): Promise<NotationRenderResult>;
}>;

/** A mounted renderer lifecycle; disposal is idempotent and releases all renderer resources. */
export type MountedNotationAdapter = NotationAdapter &
  Readonly<{
    dispose(): void;
    readonly disposed: boolean;
  }>;
