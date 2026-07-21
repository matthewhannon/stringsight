import { z } from 'zod';

export const PRACTICE_SUPPORT_SCHEMA_VERSION = 1 as const;
export const PRACTICE_SUPPORT_PROFILE_ID = 'stringsight-practice-support/v1' as const;

export const PRACTICE_SEMANTIC_IDS = Object.freeze([
  'pitch-key',
  'ties',
  'slurs',
  'tuplet-3-2',
  'two-voices',
  'dynamics-mf',
  'accent',
  'staccato',
  'per-string-sounding-duration',
  'hammer-on',
  'pull-off',
  'slide',
  'bend-bounded',
  'vibrato',
  'let-ring',
  'palm-mute',
  'dead-note',
  'natural-harmonic',
  'grace-note',
  'structural-repeat',
  'alternate-ending',
  'artificial-harmonic',
] as const);

export const PracticeSemanticIdSchema = z.enum(PRACTICE_SEMANTIC_IDS);
export type PracticeSemanticId = z.infer<typeof PracticeSemanticIdSchema>;

export const PracticeSupportStatusSchema = z.enum([
  'supported',
  'approximate',
  'rejected',
  'deferred',
]);
export type PracticeSupportStatus = z.infer<typeof PracticeSupportStatusSchema>;

export const PracticeEvidenceLevelSchema = z.enum([
  'owner-approved-profile',
  'fixture-backed',
  'parsing-only-inconclusive',
  'candidate-failed',
  'not-implemented',
]);
export type PracticeEvidenceLevel = z.infer<typeof PracticeEvidenceLevelSchema>;

export const PracticeImportStrategySchema = z.enum([
  'preserve',
  'convert-or-reject',
  'expand-or-reject',
  'reject',
]);
export type PracticeImportStrategy = z.infer<typeof PracticeImportStrategySchema>;

export const PracticeSemanticSupportSchema = z
  .object({
    evidence: PracticeEvidenceLevelSchema,
    importStrategy: PracticeImportStrategySchema,
    semantic: PracticeSemanticIdSchema,
    status: PracticeSupportStatusSchema,
  })
  .strict();
export type PracticeSemanticSupport = z.infer<typeof PracticeSemanticSupportSchema>;

export const PRACTICE_IMPORT_ROUTE_IDS = Object.freeze([
  'native-stringsight-v1',
  'gp8-basic-fixture-v1',
  'gp5-effects-fixture-v1',
  'gp7-effects-fixture-v1',
  'musicxml-d4-broad-v1',
  'smf-type1-declared-fixtures-v1',
  'smf-broad-v1',
] as const);

export const PracticeImportRouteIdSchema = z.enum(PRACTICE_IMPORT_ROUTE_IDS);
export type PracticeImportRouteId = z.infer<typeof PracticeImportRouteIdSchema>;

export const PracticeImportRouteSupportSchema = z
  .object({
    advertised: z.boolean(),
    evidence: PracticeEvidenceLevelSchema,
    losslessEditableRoundTrip: z.boolean(),
    route: PracticeImportRouteIdSchema,
    status: PracticeSupportStatusSchema,
  })
  .strict();
export type PracticeImportRouteSupport = z.infer<typeof PracticeImportRouteSupportSchema>;

function hasUniqueValues(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

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

export const PracticeSupportProfileSchema = z
  .object({
    importRoutes: z.array(PracticeImportRouteSupportSchema).min(1),
    profileId: z.literal(PRACTICE_SUPPORT_PROFILE_ID),
    schemaVersion: z.literal(PRACTICE_SUPPORT_SCHEMA_VERSION),
    semantics: z.array(PracticeSemanticSupportSchema).min(1),
  })
  .strict()
  .superRefine(({ importRoutes, semantics }, context) => {
    if (importRoutes.length !== PRACTICE_IMPORT_ROUTE_IDS.length) {
      context.addIssue({
        code: 'custom',
        message: 'The v1 profile must classify every declared import route.',
        path: ['importRoutes'],
      });
    }

    if (!hasUniqueValues(importRoutes.map(({ route }) => route))) {
      context.addIssue({
        code: 'custom',
        message: 'Import routes must be unique.',
        path: ['importRoutes'],
      });
    }

    if (semantics.length !== PRACTICE_SEMANTIC_IDS.length) {
      context.addIssue({
        code: 'custom',
        message: 'The v1 profile must classify every declared practice semantic.',
        path: ['semantics'],
      });
    }

    if (!hasUniqueValues(semantics.map(({ semantic }) => semantic))) {
      context.addIssue({
        code: 'custom',
        message: 'Practice semantics must be unique.',
        path: ['semantics'],
      });
    }

    const nativeRoute = importRoutes.find(({ route }) => route === 'native-stringsight-v1');
    if (
      nativeRoute === undefined ||
      !nativeRoute.advertised ||
      !nativeRoute.losslessEditableRoundTrip ||
      nativeRoute.status !== 'supported'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Native StringSight v1 must remain the supported lossless editable round trip.',
        path: ['importRoutes'],
      });
    }

    if (
      importRoutes.some(
        ({ losslessEditableRoundTrip, route }) =>
          route !== 'native-stringsight-v1' && losslessEditableRoundTrip,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'No non-native route may claim a lossless editable round trip.',
        path: ['importRoutes'],
      });
    }

    const supportedSemanticSet = new Set<PracticeSemanticId>(PRACTICE_SEMANTIC_IDS.slice(0, 18));
    for (const entry of semantics) {
      const expected = supportedSemanticSet.has(entry.semantic)
        ? {
            evidence: 'owner-approved-profile',
            importStrategy: 'preserve',
            status: 'supported',
          }
        : entry.semantic === 'artificial-harmonic'
          ? { evidence: 'not-implemented', importStrategy: 'reject', status: 'rejected' }
          : {
              evidence: 'not-implemented',
              importStrategy:
                entry.semantic === 'grace-note' ? 'convert-or-reject' : 'expand-or-reject',
              status: 'deferred',
            };

      for (const field of ['evidence', 'importStrategy', 'status'] as const) {
        if (entry[field] !== expected[field]) {
          context.addIssue({
            code: 'custom',
            message: `${entry.semantic} ${field} must match the accepted v1 profile.`,
            path: ['semantics', semantics.indexOf(entry), field],
          });
        }
      }
    }

    const routeExpectations: Record<
      PracticeImportRouteId,
      Omit<PracticeImportRouteSupport, 'route'>
    > = {
      'gp5-effects-fixture-v1': {
        advertised: false,
        evidence: 'parsing-only-inconclusive',
        losslessEditableRoundTrip: false,
        status: 'approximate',
      },
      'gp7-effects-fixture-v1': {
        advertised: false,
        evidence: 'candidate-failed',
        losslessEditableRoundTrip: false,
        status: 'rejected',
      },
      'gp8-basic-fixture-v1': {
        advertised: true,
        evidence: 'fixture-backed',
        losslessEditableRoundTrip: false,
        status: 'supported',
      },
      'musicxml-d4-broad-v1': {
        advertised: false,
        evidence: 'candidate-failed',
        losslessEditableRoundTrip: false,
        status: 'rejected',
      },
      'native-stringsight-v1': {
        advertised: true,
        evidence: 'owner-approved-profile',
        losslessEditableRoundTrip: true,
        status: 'supported',
      },
      'smf-broad-v1': {
        advertised: false,
        evidence: 'not-implemented',
        losslessEditableRoundTrip: false,
        status: 'deferred',
      },
      'smf-type1-declared-fixtures-v1': {
        advertised: true,
        evidence: 'fixture-backed',
        losslessEditableRoundTrip: false,
        status: 'approximate',
      },
    };

    for (const entry of importRoutes) {
      const expected = routeExpectations[entry.route];
      for (const field of [
        'advertised',
        'evidence',
        'losslessEditableRoundTrip',
        'status',
      ] as const) {
        if (entry[field] !== expected[field]) {
          context.addIssue({
            code: 'custom',
            message: `${entry.route} ${field} must match the accepted v1 profile.`,
            path: ['importRoutes', importRoutes.indexOf(entry), field],
          });
        }
      }
    }
  });
export type PracticeSupportProfile = z.infer<typeof PracticeSupportProfileSchema>;

const supportedSemantics = [
  'pitch-key',
  'ties',
  'slurs',
  'tuplet-3-2',
  'two-voices',
  'dynamics-mf',
  'accent',
  'staccato',
  'per-string-sounding-duration',
  'hammer-on',
  'pull-off',
  'slide',
  'bend-bounded',
  'vibrato',
  'let-ring',
  'palm-mute',
  'dead-note',
  'natural-harmonic',
] as const satisfies readonly PracticeSemanticId[];

const deferredSemantics = [
  ['grace-note', 'convert-or-reject'],
  ['structural-repeat', 'expand-or-reject'],
  ['alternate-ending', 'expand-or-reject'],
] as const satisfies readonly (readonly [PracticeSemanticId, PracticeImportStrategy])[];

export const PRACTICE_SUPPORT_PROFILE = deepFreeze(
  PracticeSupportProfileSchema.parse({
    importRoutes: [
      {
        advertised: true,
        evidence: 'owner-approved-profile',
        losslessEditableRoundTrip: true,
        route: 'native-stringsight-v1',
        status: 'supported',
      },
      {
        advertised: true,
        evidence: 'fixture-backed',
        losslessEditableRoundTrip: false,
        route: 'gp8-basic-fixture-v1',
        status: 'supported',
      },
      {
        advertised: false,
        evidence: 'parsing-only-inconclusive',
        losslessEditableRoundTrip: false,
        route: 'gp5-effects-fixture-v1',
        status: 'approximate',
      },
      {
        advertised: false,
        evidence: 'candidate-failed',
        losslessEditableRoundTrip: false,
        route: 'gp7-effects-fixture-v1',
        status: 'rejected',
      },
      {
        advertised: false,
        evidence: 'candidate-failed',
        losslessEditableRoundTrip: false,
        route: 'musicxml-d4-broad-v1',
        status: 'rejected',
      },
      {
        advertised: true,
        evidence: 'fixture-backed',
        losslessEditableRoundTrip: false,
        route: 'smf-type1-declared-fixtures-v1',
        status: 'approximate',
      },
      {
        advertised: false,
        evidence: 'not-implemented',
        losslessEditableRoundTrip: false,
        route: 'smf-broad-v1',
        status: 'deferred',
      },
    ],
    profileId: PRACTICE_SUPPORT_PROFILE_ID,
    schemaVersion: PRACTICE_SUPPORT_SCHEMA_VERSION,
    semantics: [
      ...supportedSemantics.map((semantic) => ({
        evidence: 'owner-approved-profile' as const,
        importStrategy: 'preserve' as const,
        semantic,
        status: 'supported' as const,
      })),
      ...deferredSemantics.map(([semantic, importStrategy]) => ({
        evidence: 'not-implemented' as const,
        importStrategy,
        semantic,
        status: 'deferred' as const,
      })),
      {
        evidence: 'not-implemented',
        importStrategy: 'reject',
        semantic: 'artificial-harmonic',
        status: 'rejected',
      },
    ],
  }),
);

export const PracticeImportDispositionSchema = z.enum([
  'preserved',
  'converted',
  'approximated',
  'dropped',
  'unsupported',
  'blocking',
]);
export type PracticeImportDisposition = z.infer<typeof PracticeImportDispositionSchema>;

export const PracticeImportSeveritySchema = z.enum(['info', 'warning', 'error', 'blocking']);
export type PracticeImportSeverity = z.infer<typeof PracticeImportSeveritySchema>;

export const PracticeImportActionSchema = z.enum([
  'none',
  'accept-conversion',
  'accept-loss',
  'reject-import',
  'choose-supported-format',
  'use-native-format',
]);
export type PracticeImportAction = z.infer<typeof PracticeImportActionSchema>;

const importReportDefinitions = [
  ['musicxml.pitch-key.preserved', 'pitch-key', 'preserved', 'info', 'none'],
  ['musicxml.tie.preserved', 'ties', 'preserved', 'info', 'none'],
  ['musicxml.slur.preserved', 'slurs', 'preserved', 'info', 'none'],
  ['musicxml.tuplet-3-2.preserved', 'tuplet-3-2', 'preserved', 'info', 'none'],
  ['musicxml.two-voices.preserved', 'two-voices', 'preserved', 'info', 'none'],
  ['musicxml.dynamic-mf.preserved', 'dynamics-mf', 'preserved', 'info', 'none'],
  ['musicxml.accent.preserved', 'accent', 'preserved', 'info', 'none'],
  ['musicxml.staccato.preserved', 'staccato', 'preserved', 'info', 'none'],
  [
    'musicxml.duration-and-string.preserved',
    'per-string-sounding-duration',
    'preserved',
    'info',
    'none',
  ],
  ['musicxml.hammer-on.candidate-dropped', 'hammer-on', 'dropped', 'error', 'reject-import'],
  ['musicxml.pull-off.candidate-dropped', 'pull-off', 'dropped', 'error', 'reject-import'],
  ['musicxml.slide.preserved', 'slide', 'preserved', 'info', 'none'],
  [
    'musicxml.bend.halfstep-units-converted',
    'bend-bounded',
    'converted',
    'warning',
    'accept-conversion',
  ],
  ['musicxml.vibrato.preserved', 'vibrato', 'preserved', 'info', 'none'],
  ['musicxml.let-ring.candidate-dropped', 'let-ring', 'dropped', 'error', 'reject-import'],
  ['musicxml.palm-mute.candidate-dropped', 'palm-mute', 'dropped', 'error', 'reject-import'],
  ['musicxml.dead-note.candidate-dropped', 'dead-note', 'dropped', 'error', 'reject-import'],
  [
    'musicxml.natural-harmonic.candidate-dropped',
    'natural-harmonic',
    'dropped',
    'error',
    'reject-import',
  ],
  [
    'musicxml.grace-note.native-v1-unsupported',
    'grace-note',
    'unsupported',
    'error',
    'reject-import',
  ],
  [
    'musicxml.repeat.expansion-not-implemented',
    'structural-repeat',
    'blocking',
    'blocking',
    'reject-import',
  ],
  [
    'musicxml.ending.expansion-not-implemented',
    'alternate-ending',
    'blocking',
    'blocking',
    'reject-import',
  ],
  [
    'musicxml.artificial-harmonic.native-v1-unsupported',
    'artificial-harmonic',
    'unsupported',
    'error',
    'reject-import',
  ],
  ['import.native.stringsight.lossless', undefined, 'preserved', 'info', 'none'],
  ['import.gp8-basic.fixture-backed', undefined, 'preserved', 'info', 'none'],
  [
    'import.gp5-effects.parsing-only-approximate',
    undefined,
    'approximated',
    'warning',
    'choose-supported-format',
  ],
  [
    'import.gp7-effects.fidelity-rejected',
    undefined,
    'blocking',
    'blocking',
    'choose-supported-format',
  ],
  [
    'import.musicxml.d4-broad-fidelity-rejected',
    undefined,
    'blocking',
    'blocking',
    'choose-supported-format',
  ],
  ['import.smf.type1.fixture-explicit-loss', undefined, 'approximated', 'warning', 'accept-loss'],
  ['import.smf.ppq-960-to-480.quantized', undefined, 'converted', 'warning', 'accept-conversion'],
  ['import.smf.guitar-semantics.unsupported', undefined, 'unsupported', 'warning', 'accept-loss'],
  [
    'import.non-native.lossless-roundtrip-unavailable',
    undefined,
    'unsupported',
    'warning',
    'use-native-format',
  ],
] as const satisfies readonly (readonly [
  string,
  PracticeSemanticId | undefined,
  PracticeImportDisposition,
  PracticeImportSeverity,
  PracticeImportAction,
])[];

export const PRACTICE_IMPORT_REPORT_CODES = Object.freeze(
  importReportDefinitions.map(([code]) => code),
) as readonly [
  (typeof importReportDefinitions)[number][0],
  ...(typeof importReportDefinitions)[number][0][],
];

export const PracticeImportReportCodeSchema = z.enum(PRACTICE_IMPORT_REPORT_CODES);
export type PracticeImportReportCode = z.infer<typeof PracticeImportReportCodeSchema>;

export const PracticeImportReportCodeDefinitionSchema = z
  .object({
    action: PracticeImportActionSchema,
    code: PracticeImportReportCodeSchema,
    disposition: PracticeImportDispositionSchema,
    semantic: PracticeSemanticIdSchema.optional(),
    severity: PracticeImportSeveritySchema,
  })
  .strict();
export type PracticeImportReportCodeDefinition = z.infer<
  typeof PracticeImportReportCodeDefinitionSchema
>;

export const PRACTICE_IMPORT_REPORT_CODE_DEFINITIONS = deepFreeze(
  importReportDefinitions.map(([code, semantic, disposition, severity, action]) =>
    PracticeImportReportCodeDefinitionSchema.parse({
      action,
      code,
      disposition,
      semantic,
      severity,
    }),
  ),
);

export const PRACTICE_IMPORT_REPORT_CODE_BY_ID = deepFreeze(
  Object.fromEntries(
    PRACTICE_IMPORT_REPORT_CODE_DEFINITIONS.map((definition) => [definition.code, definition]),
  ) as Record<PracticeImportReportCode, PracticeImportReportCodeDefinition>,
);

export const PracticeImportFindingSchema = z
  .object({
    action: PracticeImportActionSchema,
    affectedCount: z.number().int().positive(),
    code: PracticeImportReportCodeSchema,
    detail: z.string().min(1).max(500).optional(),
    disposition: PracticeImportDispositionSchema,
    schemaVersion: z.literal(PRACTICE_SUPPORT_SCHEMA_VERSION),
    severity: PracticeImportSeveritySchema,
    sourceEventIds: z.array(z.string().min(1).max(160)).max(10_000).optional(),
  })
  .strict()
  .superRefine((finding, context) => {
    const definition = PRACTICE_IMPORT_REPORT_CODE_BY_ID[finding.code];

    for (const field of ['action', 'disposition', 'severity'] as const) {
      if (finding[field] !== definition[field]) {
        context.addIssue({
          code: 'custom',
          message: `${field} must match the stable meaning of ${finding.code}.`,
          path: [field],
        });
      }
    }

    if (finding.sourceEventIds !== undefined && !hasUniqueValues(finding.sourceEventIds)) {
      context.addIssue({
        code: 'custom',
        message: 'Source event IDs must be unique.',
        path: ['sourceEventIds'],
      });
    }

    if (
      finding.sourceEventIds !== undefined &&
      finding.sourceEventIds.length !== finding.affectedCount
    ) {
      context.addIssue({
        code: 'custom',
        message: 'affectedCount must equal the number of supplied source event IDs.',
        path: ['affectedCount'],
      });
    }
  });
export type PracticeImportFinding = z.infer<typeof PracticeImportFindingSchema>;

export function createPracticeImportFinding(
  code: PracticeImportReportCode,
  input: Pick<PracticeImportFinding, 'affectedCount' | 'detail' | 'sourceEventIds'>,
): PracticeImportFinding {
  const definition = PRACTICE_IMPORT_REPORT_CODE_BY_ID[code];

  return PracticeImportFindingSchema.parse({
    action: definition.action,
    affectedCount: input.affectedCount,
    code,
    ...(input.detail === undefined ? {} : { detail: input.detail }),
    disposition: definition.disposition,
    schemaVersion: PRACTICE_SUPPORT_SCHEMA_VERSION,
    severity: definition.severity,
    ...(input.sourceEventIds === undefined ? {} : { sourceEventIds: input.sourceEventIds }),
  });
}
