import { z } from 'zod';

import { IdentifierSchema } from './common';
import {
  PracticeDocumentContentHashSchema,
  PracticeDocumentSchema,
  QualifiedHashSchema,
  type PracticeDocument,
  type QualifiedHash,
} from './practice';
import {
  PRACTICE_IMPORT_REPORT_CODE_BY_ID,
  PRACTICE_SUPPORT_PROFILE,
  PracticeImportDispositionSchema,
  PracticeImportFindingSchema,
  PracticeImportRouteIdSchema,
  PracticeImportSeveritySchema,
  type PracticeImportDisposition,
  type PracticeImportReportCode,
  type PracticeImportRouteId,
  type PracticeImportSeverity,
} from './practice-support';

export const PRACTICE_IMPORT_DRAFT_VERSION = 1 as const;
export const PRACTICE_IMPORT_REPORT_VERSION = 1 as const;
export const PRACTICE_IMPORT_REVIEW_BUNDLE_VERSION = 1 as const;

/** Hard boundary-safety ceilings, not product performance or format-support claims. */
export const PRACTICE_IMPORT_RESOURCE_LIMITS = Object.freeze({
  maximumDiagnostics: 1_000,
  maximumOutputEvents: 250_000,
  maximumSourceBytes: 268_435_456,
  maximumSourceEvents: 1_000_000,
  maximumWallClockMs: 600_000,
} as const);

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }
  for (const property of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[property]);
  }
  return Object.freeze(value) as DeepReadonly<T>;
}

export const PracticeImportSourceFormatSchema = z.enum(['guitar-pro', 'musicxml', 'smf']);
export type PracticeImportSourceFormat = z.infer<typeof PracticeImportSourceFormatSchema>;

export const PracticeImportDirectionSchema = z.enum(['score-to-draft', 'performance-to-draft']);
export type PracticeImportDirection = z.infer<typeof PracticeImportDirectionSchema>;

export const PracticeImportSourceIdentitySchema = z
  .object({
    byteLength: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceBytes),
    fileName: z.string().trim().min(1).max(255),
    format: PracticeImportSourceFormatSchema,
    formatVersion: z.string().trim().min(1).max(80),
    mediaType: z.string().trim().min(1).max(120),
    sha256Hex: z.string().regex(/^[0-9a-f]{64}$/),
    sourceId: IdentifierSchema,
  })
  .strict();
export type PracticeImportSourceIdentity = z.infer<typeof PracticeImportSourceIdentitySchema>;

export const PracticeImportSourceIdentityHashSchema = QualifiedHashSchema.extend({
  projectionId: z.literal('practice-import-source-identity'),
  projectionVersion: z.literal(1),
  schemaId: z.literal('practice-import-source'),
  schemaVersion: z.literal(1),
});
export type PracticeImportSourceIdentityHash = z.infer<
  typeof PracticeImportSourceIdentityHashSchema
>;

export const PracticeImportAdapterIdentitySchema = z
  .object({
    adapterId: IdentifierSchema,
    adapterVersion: z.string().trim().min(1).max(80),
  })
  .strict();
export type PracticeImportAdapterIdentity = z.infer<typeof PracticeImportAdapterIdentitySchema>;

export const PracticeImportResourceBudgetSchema = z
  .object({
    maximumOutputEvents: z
      .number()
      .int()
      .positive()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumOutputEvents),
    maximumSourceBytes: z
      .number()
      .int()
      .positive()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceBytes),
    maximumSourceEvents: z
      .number()
      .int()
      .positive()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    maximumWallClockMs: z
      .number()
      .int()
      .positive()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumWallClockMs),
  })
  .strict();
export type PracticeImportResourceBudget = z.infer<typeof PracticeImportResourceBudgetSchema>;

export const PracticeImportResourceUsageSchema = z
  .object({
    outputEventCount: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumOutputEvents),
    sourceBytes: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceBytes),
    sourceEventCount: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    wallClockMs: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumWallClockMs),
  })
  .strict();
export type PracticeImportResourceUsage = z.infer<typeof PracticeImportResourceUsageSchema>;

export const PracticeImportResourceAccountingSchema = z
  .object({
    budget: PracticeImportResourceBudgetSchema,
    usage: PracticeImportResourceUsageSchema,
  })
  .strict();
export type PracticeImportResourceAccounting = z.infer<
  typeof PracticeImportResourceAccountingSchema
>;

export const PRACTICE_IMPORT_DIAGNOSTIC_CODES = Object.freeze([
  'import.quantization.applied',
  'import.guitar-position.ambiguous',
  'import.timing.ambiguous',
  'import.source.malformed',
  'import.source.security-rejected',
  'import.resource.source-bytes-exceeded',
  'import.resource.source-events-exceeded',
  'import.resource.output-events-exceeded',
  'import.resource.wall-clock-exceeded',
] as const);

export const PracticeImportDiagnosticCodeSchema = z.enum(PRACTICE_IMPORT_DIAGNOSTIC_CODES);
export type PracticeImportDiagnosticCode = z.infer<typeof PracticeImportDiagnosticCodeSchema>;

export const PracticeImportDiagnosticCategorySchema = z.enum([
  'guitar-position',
  'quantization',
  'resource',
  'security',
  'source',
  'timing',
]);
export type PracticeImportDiagnosticCategory = z.infer<
  typeof PracticeImportDiagnosticCategorySchema
>;

export const PracticeImportDiagnosticActionSchema = z.enum([
  'review',
  'revise-choices',
  'reject-import',
]);
export type PracticeImportDiagnosticAction = z.infer<typeof PracticeImportDiagnosticActionSchema>;

const diagnosticDefinitionTuples = [
  ['import.quantization.applied', 'quantization', 'warning', 'review'],
  ['import.guitar-position.ambiguous', 'guitar-position', 'warning', 'revise-choices'],
  ['import.timing.ambiguous', 'timing', 'warning', 'revise-choices'],
  ['import.source.malformed', 'source', 'error', 'reject-import'],
  ['import.source.security-rejected', 'security', 'blocking', 'reject-import'],
  ['import.resource.source-bytes-exceeded', 'resource', 'blocking', 'reject-import'],
  ['import.resource.source-events-exceeded', 'resource', 'blocking', 'reject-import'],
  ['import.resource.output-events-exceeded', 'resource', 'blocking', 'reject-import'],
  ['import.resource.wall-clock-exceeded', 'resource', 'blocking', 'reject-import'],
] as const;

export const PRACTICE_IMPORT_DIAGNOSTIC_DEFINITIONS = deepFreeze(
  diagnosticDefinitionTuples.map(([code, category, severity, action]) => ({
    action,
    category,
    code,
    severity,
  })),
);

export const PRACTICE_IMPORT_DIAGNOSTIC_BY_ID = deepFreeze(
  Object.fromEntries(
    PRACTICE_IMPORT_DIAGNOSTIC_DEFINITIONS.map((definition) => [definition.code, definition]),
  ) as Record<
    PracticeImportDiagnosticCode,
    (typeof PRACTICE_IMPORT_DIAGNOSTIC_DEFINITIONS)[number]
  >,
);

export const PracticeImportDiagnosticSchema = z
  .object({
    action: PracticeImportDiagnosticActionSchema,
    affectedCount: z
      .number()
      .int()
      .positive()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    category: PracticeImportDiagnosticCategorySchema,
    code: PracticeImportDiagnosticCodeSchema,
    detail: z.string().trim().min(1).max(500),
    severity: PracticeImportSeveritySchema,
    sourceLocation: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .superRefine((diagnostic, context) => {
    const definition = PRACTICE_IMPORT_DIAGNOSTIC_BY_ID[diagnostic.code];
    for (const field of ['action', 'category', 'severity'] as const) {
      if (diagnostic[field] !== definition[field]) {
        context.addIssue({
          code: 'custom',
          message: `${field} must match the stable meaning of ${diagnostic.code}.`,
          path: [field],
        });
      }
    }
  });
export type PracticeImportDiagnostic = z.infer<typeof PracticeImportDiagnosticSchema>;

const routeRequirements: Readonly<
  Record<
    Exclude<PracticeImportRouteId, 'native-stringsight-v1'>,
    readonly [PracticeImportSourceFormat, PracticeImportDirection, readonly [string, ...string[]]]
  >
> = Object.freeze({
  'gp5-effects-fixture-v1': ['guitar-pro', 'score-to-draft', ['GP5']],
  'gp7-effects-fixture-v1': ['guitar-pro', 'score-to-draft', ['GP7']],
  'gp8-basic-fixture-v1': ['guitar-pro', 'score-to-draft', ['GP8']],
  'musicxml-d4-broad-v1': ['musicxml', 'score-to-draft', ['MusicXML 4 XML', 'MusicXML MXL']],
  'smf-broad-v1': ['smf', 'performance-to-draft', ['SMF Type 0', 'SMF Type 1', 'SMF Type 2']],
  'smf-type1-declared-fixtures-v1': ['smf', 'performance-to-draft', ['SMF Type 1']],
});

export const PRACTICE_IMPORT_ROUTE_FORMAT_VERSIONS = deepFreeze(
  Object.fromEntries(
    Object.entries(routeRequirements).map(([route, [, , formatVersions]]) => [
      route,
      formatVersions,
    ]),
  ) as Record<
    Exclude<PracticeImportRouteId, 'native-stringsight-v1'>,
    readonly [string, ...string[]]
  >,
);

export const PRACTICE_IMPORT_ROUTE_CLASSIFICATION_CODES = deepFreeze({
  'gp5-effects-fixture-v1': ['import.gp5-effects.parsing-only-approximate'],
  'gp7-effects-fixture-v1': ['import.gp7-effects.fidelity-rejected'],
  'gp8-basic-fixture-v1': ['import.gp8-basic.fixture-backed'],
  'musicxml-d4-broad-v1': ['import.musicxml.d4-broad-fidelity-rejected'],
  'smf-broad-v1': ['import.smf.guitar-semantics.unsupported'],
  'smf-type1-declared-fixtures-v1': ['import.smf.type1.fixture-explicit-loss'],
} as const satisfies Readonly<
  Record<
    Exclude<PracticeImportRouteId, 'native-stringsight-v1'>,
    readonly PracticeImportReportCode[]
  >
>);

const NonNativeImportRouteSchema = PracticeImportRouteIdSchema.refine(
  (route) => route !== 'native-stringsight-v1',
  'Native StringSight open is not a lossy import-draft route.',
);

function hashesMatch(left: QualifiedHash, right: QualifiedHash): boolean {
  return (
    left.digestHex === right.digestHex &&
    left.projectionId === right.projectionId &&
    left.projectionVersion === right.projectionVersion &&
    left.schemaId === right.schemaId &&
    left.schemaVersion === right.schemaVersion
  );
}

function expectedRoute(route: PracticeImportRouteId) {
  return PRACTICE_SUPPORT_PROFILE.importRoutes.find((entry) => entry.route === route);
}

function validateRouteAndSource(
  route: PracticeImportRouteId,
  direction: PracticeImportDirection,
  source: PracticeImportSourceIdentity,
  context: z.RefinementCtx,
): void {
  if (route === 'native-stringsight-v1') {
    context.addIssue({
      code: 'custom',
      message: 'Native StringSight open is not a lossy import-draft route.',
      path: ['route'],
    });
    return;
  }
  const [expectedFormat, expectedDirection, expectedFormatVersions] = routeRequirements[route];
  if (source.format !== expectedFormat) {
    context.addIssue({
      code: 'custom',
      message: 'Source format must match the declared bounded import route.',
      path: ['source', 'format'],
    });
  }
  if (direction !== expectedDirection) {
    context.addIssue({
      code: 'custom',
      message: 'Import direction must match the declared bounded import route.',
      path: ['direction'],
    });
  }
  if (!expectedFormatVersions.includes(source.formatVersion)) {
    context.addIssue({
      code: 'custom',
      message: 'Source format version must match the evidence bounded by the import route.',
      path: ['source', 'formatVersion'],
    });
  }
}

function documentEventCount(document: PracticeDocument): number {
  return document.tracks.reduce(
    (trackTotal, track) =>
      trackTotal + track.voices.reduce((voiceTotal, voice) => voiceTotal + voice.events.length, 0),
    0,
  );
}

function validateResourceAccounting(
  accounting: PracticeImportResourceAccounting,
  context: z.RefinementCtx,
  path: readonly (number | string)[] = ['resources'],
): void {
  for (const [usageField, budgetField] of [
    ['outputEventCount', 'maximumOutputEvents'],
    ['sourceBytes', 'maximumSourceBytes'],
    ['sourceEventCount', 'maximumSourceEvents'],
    ['wallClockMs', 'maximumWallClockMs'],
  ] as const) {
    if (accounting.usage[usageField] > accounting.budget[budgetField]) {
      context.addIssue({
        code: 'custom',
        message: `${usageField} exceeds its declared import budget.`,
        path: [...path, 'usage', usageField],
      });
    }
  }
}

const PracticeImportDraftBaseSchema = z
  .object({
    adapter: PracticeImportAdapterIdentitySchema,
    candidateDocument: PracticeDocumentSchema,
    candidateDocumentContentHash: PracticeDocumentContentHashSchema,
    contractVersion: z.literal(PRACTICE_IMPORT_DRAFT_VERSION),
    createdAt: z.iso.datetime({ offset: true }),
    direction: PracticeImportDirectionSchema,
    draftId: IdentifierSchema,
    reportId: IdentifierSchema,
    resources: PracticeImportResourceAccountingSchema,
    route: NonNativeImportRouteSchema,
    source: PracticeImportSourceIdentitySchema,
    sourceIdentityHash: PracticeImportSourceIdentityHashSchema,
  })
  .strict()
  .superRefine((draft, context) => {
    validateRouteAndSource(draft.route, draft.direction, draft.source, context);
    const support = expectedRoute(draft.route);
    if (
      support === undefined ||
      !support.advertised ||
      support.status === 'rejected' ||
      support.status === 'deferred'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Only advertised, non-rejected bounded routes may produce a reviewable draft.',
        path: ['route'],
      });
    }
    validateResourceAccounting(draft.resources, context);
    if (draft.resources.usage.sourceBytes !== draft.source.byteLength) {
      context.addIssue({
        code: 'custom',
        message: 'Resource source bytes must equal the immutable source identity byte length.',
        path: ['resources', 'usage', 'sourceBytes'],
      });
    }
    if (draft.resources.usage.outputEventCount !== documentEventCount(draft.candidateDocument)) {
      context.addIssue({
        code: 'custom',
        message: 'Output event accounting must equal the candidate document event count.',
        path: ['resources', 'usage', 'outputEventCount'],
      });
    }
    if (
      !hashesMatch(draft.candidateDocumentContentHash, draft.candidateDocument.revision.contentHash)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Draft content hash must match the candidate document revision content hash.',
        path: ['candidateDocumentContentHash'],
      });
    }
    const provenance = draft.candidateDocument.importProvenance;
    if (
      provenance?.adapterId !== draft.adapter.adapterId ||
      provenance.adapterVersion !== draft.adapter.adapterVersion ||
      provenance.importReportId !== draft.reportId ||
      provenance.sourceFormat !== draft.source.format ||
      !hashesMatch(provenance.sourceHash, draft.sourceIdentityHash)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Candidate import provenance must match its source, adapter, and report binding.',
        path: ['candidateDocument', 'importProvenance'],
      });
    }
  });

export const PracticeImportDraftSchema = PracticeImportDraftBaseSchema;
export type PracticeImportDraft = z.infer<typeof PracticeImportDraftSchema>;

export function parseImmutablePracticeImportDraft(
  input: unknown,
): DeepReadonly<PracticeImportDraft> {
  return deepFreeze(PracticeImportDraftSchema.parse(input));
}

export const PracticeImportDispositionCountsSchema = z
  .object({
    approximated: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    blocking: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    converted: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    dropped: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    preserved: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
    unsupported: z
      .number()
      .int()
      .nonnegative()
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents),
  })
  .strict();
export type PracticeImportDispositionCounts = z.infer<typeof PracticeImportDispositionCountsSchema>;

export const PracticeImportReportOutcomeSchema = z.enum(['reviewable', 'blocked', 'rejected']);
export type PracticeImportReportOutcome = z.infer<typeof PracticeImportReportOutcomeSchema>;
export const PracticeImportReportActionSchema = z.enum([
  'accept-draft',
  'review-losses',
  'choose-supported-format',
  'reject-import',
]);
export type PracticeImportReportAction = z.infer<typeof PracticeImportReportActionSchema>;

const severityRank: Readonly<Record<PracticeImportSeverity, number>> = {
  blocking: 3,
  error: 2,
  info: 0,
  warning: 1,
};

function dispositionCounts(findings: readonly z.infer<typeof PracticeImportFindingSchema>[]) {
  const counts: Record<PracticeImportDisposition, number> = {
    approximated: 0,
    blocking: 0,
    converted: 0,
    dropped: 0,
    preserved: 0,
    unsupported: 0,
  };
  for (const finding of findings) counts[finding.disposition] += finding.affectedCount;
  return counts;
}

function stableCodeListsAreUnique(values: readonly { code: string }[]): boolean {
  return new Set(values.map(({ code }) => code)).size === values.length;
}

function stableCodeListsAreSorted(values: readonly { code: string }[]): boolean {
  return values.every(({ code }, index) => index === 0 || code > (values[index - 1]?.code ?? ''));
}

function reportCodeMatchesRoute(code: string, route: PracticeImportRouteId): boolean {
  if (code === 'import.non-native.lossless-roundtrip-unavailable') return true;
  switch (route) {
    case 'gp5-effects-fixture-v1':
      return code === 'import.gp5-effects.parsing-only-approximate';
    case 'gp7-effects-fixture-v1':
      return code === 'import.gp7-effects.fidelity-rejected';
    case 'gp8-basic-fixture-v1':
      return code === 'import.gp8-basic.fixture-backed';
    case 'musicxml-d4-broad-v1':
      return code.startsWith('musicxml.') || code === 'import.musicxml.d4-broad-fidelity-rejected';
    case 'smf-broad-v1':
    case 'smf-type1-declared-fixtures-v1':
      return code.startsWith('import.smf.');
    case 'native-stringsight-v1':
      return false;
  }
}

const PracticeImportReportBaseSchema = z
  .object({
    adapter: PracticeImportAdapterIdentitySchema,
    contractVersion: z.literal(PRACTICE_IMPORT_REPORT_VERSION),
    diagnostics: z
      .array(PracticeImportDiagnosticSchema)
      .max(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumDiagnostics),
    direction: PracticeImportDirectionSchema,
    dispositionCounts: PracticeImportDispositionCountsSchema,
    draftBinding: z
      .object({
        candidateDocumentContentHash: PracticeDocumentContentHashSchema,
        draftId: IdentifierSchema,
      })
      .strict()
      .nullable(),
    finalizedAt: z.iso.datetime({ offset: true }),
    findings: z
      .array(PracticeImportFindingSchema)
      .max(Object.keys(PRACTICE_IMPORT_REPORT_CODE_BY_ID).length),
    highestSeverity: PracticeImportSeveritySchema,
    outcome: PracticeImportReportOutcomeSchema,
    reportAction: PracticeImportReportActionSchema,
    reportId: IdentifierSchema,
    resources: PracticeImportResourceAccountingSchema,
    route: NonNativeImportRouteSchema,
    source: PracticeImportSourceIdentitySchema,
    sourceIdentityHash: PracticeImportSourceIdentityHashSchema,
    startedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((report, context) => {
    validateRouteAndSource(report.route, report.direction, report.source, context);
    if (Date.parse(report.finalizedAt) < Date.parse(report.startedAt)) {
      context.addIssue({
        code: 'custom',
        message: 'Import report finalization must not precede import start.',
        path: ['finalizedAt'],
      });
    }
    if (!stableCodeListsAreUnique(report.findings)) {
      context.addIssue({
        code: 'custom',
        message: 'Finalized reports must aggregate each import report code exactly once.',
        path: ['findings'],
      });
    }
    if (!stableCodeListsAreSorted(report.findings)) {
      context.addIssue({
        code: 'custom',
        message: 'Finalized import findings must be sorted by stable code.',
        path: ['findings'],
      });
    }
    report.findings.forEach(({ code }, index) => {
      if (!reportCodeMatchesRoute(code, report.route)) {
        context.addIssue({
          code: 'custom',
          message: 'Import report code does not belong to the declared bounded route.',
          path: ['findings', index, 'code'],
        });
      }
    });
    const findingCodes = new Set(report.findings.map(({ code }) => code));
    for (const requiredCode of PRACTICE_IMPORT_ROUTE_CLASSIFICATION_CODES[report.route]) {
      if (!findingCodes.has(requiredCode)) {
        context.addIssue({
          code: 'custom',
          message: 'Finalized reports must include every stable classification for their route.',
          path: ['findings'],
        });
      }
    }
    if (!stableCodeListsAreUnique(report.diagnostics)) {
      context.addIssue({
        code: 'custom',
        message: 'Finalized reports must aggregate each diagnostic code exactly once.',
        path: ['diagnostics'],
      });
    }
    if (!stableCodeListsAreSorted(report.diagnostics)) {
      context.addIssue({
        code: 'custom',
        message: 'Finalized import diagnostics must be sorted by stable code.',
        path: ['diagnostics'],
      });
    }
    const expectedCounts = dispositionCounts(report.findings);
    for (const disposition of PracticeImportDispositionSchema.options) {
      if (report.dispositionCounts[disposition] !== expectedCounts[disposition]) {
        context.addIssue({
          code: 'custom',
          message: `${disposition} count must equal its finalized finding total.`,
          path: ['dispositionCounts', disposition],
        });
      }
    }
    const severities = [
      ...report.findings.map(({ severity }) => severity),
      ...report.diagnostics.map(({ severity }) => severity),
    ];
    const expectedSeverity = severities.reduce<PracticeImportSeverity>(
      (highest, severity) => (severityRank[severity] > severityRank[highest] ? severity : highest),
      'info',
    );
    if (report.highestSeverity !== expectedSeverity) {
      context.addIssue({
        code: 'custom',
        message: 'Highest severity must be derived from every finalized finding and diagnostic.',
        path: ['highestSeverity'],
      });
    }
    const support = expectedRoute(report.route);
    const mustReject =
      report.findings.some(({ action }) => action === 'reject-import') ||
      report.diagnostics.some(({ action }) => action === 'reject-import');
    const mustChooseFormat = report.findings.some(
      ({ action }) => action === 'choose-supported-format',
    );
    const expectedOutcome =
      support?.status === 'rejected' ||
      support?.status === 'deferred' ||
      mustReject ||
      mustChooseFormat
        ? 'rejected'
        : !support?.advertised
          ? 'blocked'
          : 'reviewable';
    if (report.outcome !== expectedOutcome) {
      context.addIssue({
        code: 'custom',
        message: 'Report outcome must match route support and finalized issue actions.',
        path: ['outcome'],
      });
    }
    if ((report.draftBinding !== null) !== (expectedOutcome === 'reviewable')) {
      context.addIssue({
        code: 'custom',
        message: 'Only reviewable reports may bind a candidate draft.',
        path: ['draftBinding'],
      });
    }
    const hasReviewableLoss = report.findings.some(({ disposition }) =>
      ['approximated', 'converted', 'dropped', 'unsupported'].includes(disposition),
    );
    const expectedAction =
      expectedOutcome === 'rejected'
        ? mustReject
          ? 'reject-import'
          : 'choose-supported-format'
        : expectedOutcome === 'blocked'
          ? 'choose-supported-format'
          : hasReviewableLoss || report.diagnostics.length > 0
            ? 'review-losses'
            : 'accept-draft';
    if (report.reportAction !== expectedAction) {
      context.addIssue({
        code: 'custom',
        message: 'Report action must match the deterministic finalized outcome.',
        path: ['reportAction'],
      });
    }
    if (report.resources.usage.sourceBytes !== report.source.byteLength) {
      context.addIssue({
        code: 'custom',
        message: 'Resource source bytes must equal the immutable source identity byte length.',
        path: ['resources', 'usage', 'sourceBytes'],
      });
    }
    for (const [usageField, budgetField, diagnosticCode] of [
      ['outputEventCount', 'maximumOutputEvents', 'import.resource.output-events-exceeded'],
      ['sourceBytes', 'maximumSourceBytes', 'import.resource.source-bytes-exceeded'],
      ['sourceEventCount', 'maximumSourceEvents', 'import.resource.source-events-exceeded'],
      ['wallClockMs', 'maximumWallClockMs', 'import.resource.wall-clock-exceeded'],
    ] as const) {
      const exceeded = report.resources.usage[usageField] > report.resources.budget[budgetField];
      const reported = report.diagnostics.some(({ code }) => code === diagnosticCode);
      if (exceeded !== reported) {
        context.addIssue({
          code: 'custom',
          message: `${diagnosticCode} must exactly report its resource-budget state.`,
          path: ['diagnostics'],
        });
      }
    }
    const approximateRoute = support?.status === 'approximate';
    if (
      approximateRoute &&
      !report.findings.some(({ disposition }) => disposition !== 'preserved')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Approximate routes must report at least one explicit non-preserved disposition.',
        path: ['findings'],
      });
    }
  });

export const PracticeImportReportSchema = PracticeImportReportBaseSchema.transform(deepFreeze);
export type PracticeImportReport = z.infer<typeof PracticeImportReportSchema>;

const PracticeImportReviewBundleBaseSchema = z
  .object({
    bundleVersion: z.literal(PRACTICE_IMPORT_REVIEW_BUNDLE_VERSION),
    draft: PracticeImportDraftSchema,
    report: PracticeImportReportSchema,
  })
  .strict()
  .superRefine(({ draft, report }, context) => {
    const equal = (left: unknown, right: unknown): boolean =>
      JSON.stringify(left) === JSON.stringify(right);
    if (
      draft.reportId !== report.reportId ||
      report.draftBinding?.draftId !== draft.draftId ||
      !hashesMatch(
        report.draftBinding.candidateDocumentContentHash,
        draft.candidateDocumentContentHash,
      ) ||
      draft.route !== report.route ||
      draft.direction !== report.direction ||
      !equal(draft.adapter, report.adapter) ||
      !equal(draft.source, report.source) ||
      !hashesMatch(draft.sourceIdentityHash, report.sourceIdentityHash) ||
      !equal(draft.resources, report.resources)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Import draft and finalized report bindings must match exactly.',
        path: ['report'],
      });
    }
  });

export const PracticeImportReviewBundleSchema = PracticeImportReviewBundleBaseSchema;
export type PracticeImportReviewBundle = z.infer<typeof PracticeImportReviewBundleSchema>;

export function parseImmutablePracticeImportReviewBundle(
  input: unknown,
): DeepReadonly<PracticeImportReviewBundle> {
  return deepFreeze(PracticeImportReviewBundleSchema.parse(input));
}
