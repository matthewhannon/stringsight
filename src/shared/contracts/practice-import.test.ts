import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createPracticeImportFinding } from './practice-support';
import {
  hashExpectedEvents,
  hashPracticeDocumentContent,
  hashPracticeImportSourceIdentity,
} from '../practice-identity';
import { verifyPracticeImportReviewBundle } from '../practice-import-integrity';
import {
  PRACTICE_IMPORT_DIAGNOSTIC_BY_ID,
  PRACTICE_IMPORT_DIAGNOSTIC_CODES,
  PRACTICE_IMPORT_RESOURCE_LIMITS,
  PRACTICE_IMPORT_ROUTE_CLASSIFICATION_CODES,
  PRACTICE_IMPORT_ROUTE_FORMAT_VERSIONS,
  PracticeImportDiagnosticSchema,
  PracticeImportDraftSchema,
  PracticeImportReportSchema,
  PracticeImportReviewBundleSchema,
  parseImmutablePracticeImportDraft,
  parseImmutablePracticeImportReviewBundle,
} from './practice-import';

function hash<const SchemaId extends string, const ProjectionId extends string>(
  schemaId: SchemaId,
  projectionId: ProjectionId,
  digest = 'a',
) {
  return {
    algorithm: 'sha256' as const,
    canonicalizationId: 'stringsight-canonical-json' as const,
    canonicalizationVersion: 1 as const,
    digestHex: digest.repeat(64),
    projectionId,
    projectionVersion: 1 as const,
    schemaId,
    schemaVersion: 1 as const,
  };
}

const sourceIdentityHash = hash('practice-import-source', 'practice-import-source-identity');
const documentContentHash = hash('practice-document', 'practice-document-content');

function sourceIdentity(
  format: 'guitar-pro' | 'musicxml' | 'smf' = 'guitar-pro',
  formatVersion = format === 'smf'
    ? 'SMF Type 1'
    : format === 'musicxml'
      ? 'MusicXML 4 XML'
      : 'GP8',
) {
  return {
    byteLength: 1_024,
    fileName: format === 'smf' ? 'exercise.mid' : 'exercise.gp',
    format,
    formatVersion,
    mediaType: 'application/octet-stream',
    sha256Hex: 'b'.repeat(64),
    sourceId: 'source-1',
  };
}

const adapter = { adapterId: 'alphatab-import-adapter', adapterVersion: '1.0.0' };

function resources() {
  return {
    budget: {
      maximumOutputEvents: 10_000,
      maximumSourceBytes: 1_000_000,
      maximumSourceEvents: 10_000,
      maximumWallClockMs: 30_000,
    },
    usage: {
      outputEventCount: 1,
      sourceBytes: 1_024,
      sourceEventCount: 4,
      wallClockMs: 25,
    },
  };
}

function candidateDocument(format: 'guitar-pro' | 'musicxml' | 'smf' = 'guitar-pro') {
  return {
    contractVersion: 1,
    durationTicks: 960,
    expectedProjectionHash: hash('practice-document', 'practice-expected-events'),
    guitar: {
      capoFret: 0,
      handedness: 'right',
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: '12-tet',
      tuning: [
        { openMidi: 64, stringNumber: 1 },
        { openMidi: 59, stringNumber: 2 },
        { openMidi: 55, stringNumber: 3 },
        { openMidi: 50, stringNumber: 4 },
        { openMidi: 45, stringNumber: 5 },
        { openMidi: 40, stringNumber: 6 },
      ],
    },
    importProvenance: {
      ...adapter,
      importReportId: 'report-1',
      sourceFormat: format,
      sourceHash: sourceIdentityHash,
    },
    keyMap: [{ fifths: 0, mode: 'major', tick: 0 }],
    loopPresets: [],
    metadata: {
      createdAt: '2026-07-20T12:00:00Z',
      title: 'Imported exercise',
      updatedAt: '2026-07-20T12:00:00Z',
    },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960,
    revision: {
      contentHash: documentContentHash,
      documentId: 'document-1',
      revisionId: 'revision-1',
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: 500_000, tick: 0 }],
    tracks: [
      {
        id: 'track-1',
        name: 'Guitar',
        voices: [
          {
            events: [
              {
                articulations: [],
                id: 'event-1',
                kind: 'guitar-event',
                notatedDurationTicks: 960,
                notes: [
                  {
                    id: 'note-1',
                    position: { stringNumber: 1, tabFret: 0 },
                    semantics: [],
                    soundingDurationTicks: 960,
                    writtenPitch: { accidental: 0, octave: 4, step: 'E' },
                  },
                ],
                tick: 0,
              },
            ],
            id: 'voice-1',
          },
        ],
      },
    ],
  };
}

function draftFixture() {
  return {
    adapter,
    candidateDocument: candidateDocument(),
    candidateDocumentContentHash: documentContentHash,
    contractVersion: 1,
    createdAt: '2026-07-20T12:00:01Z',
    direction: 'score-to-draft',
    draftId: 'draft-1',
    reportId: 'report-1',
    resources: resources(),
    route: 'gp8-basic-fixture-v1',
    source: sourceIdentity(),
    sourceIdentityHash,
  };
}

function requireEntry<T>(entry: T | undefined): T {
  if (entry === undefined) throw new Error('Expected fixture entry is missing.');
  return entry;
}

function dispositionCounts(
  overrides: Partial<
    Record<
      'approximated' | 'blocking' | 'converted' | 'dropped' | 'preserved' | 'unsupported',
      number
    >
  > = {},
) {
  return {
    approximated: 0,
    blocking: 0,
    converted: 0,
    dropped: 0,
    preserved: 0,
    unsupported: 0,
    ...overrides,
  };
}

function reportFixture(): z.input<typeof PracticeImportReportSchema> {
  return {
    adapter,
    contractVersion: 1,
    diagnostics: [],
    direction: 'score-to-draft',
    dispositionCounts: dispositionCounts({ preserved: 1 }),
    draftBinding: {
      candidateDocumentContentHash: documentContentHash,
      draftId: 'draft-1',
    },
    finalizedAt: '2026-07-20T12:00:02Z',
    findings: [
      createPracticeImportFinding('import.gp8-basic.fixture-backed', { affectedCount: 1 }),
    ],
    highestSeverity: 'info',
    outcome: 'reviewable',
    reportAction: 'accept-draft',
    reportId: 'report-1',
    resources: resources(),
    route: 'gp8-basic-fixture-v1',
    source: sourceIdentity(),
    sourceIdentityHash,
    startedAt: '2026-07-20T12:00:00Z',
  };
}

function diagnostic(code: keyof typeof PRACTICE_IMPORT_DIAGNOSTIC_BY_ID) {
  const definition = PRACTICE_IMPORT_DIAGNOSTIC_BY_ID[code];
  return {
    ...definition,
    affectedCount: 1,
    detail: `Diagnostic ${code}`,
  };
}

describe('PracticeImportDraft', () => {
  it('binds an advertised source route to one canonical candidate document', () => {
    const parsed = PracticeImportDraftSchema.parse(draftFixture());
    expect(parsed.route).toBe('gp8-basic-fixture-v1');
    expect(parsed.resources.usage.outputEventCount).toBe(1);

    const immutable = parseImmutablePracticeImportDraft(draftFixture());
    expect(Object.isFrozen(immutable)).toBe(true);
    expect(Object.isFrozen(immutable.candidateDocument.tracks)).toBe(true);
    expect(() => (immutable.candidateDocument.tracks as unknown as unknown[]).pop()).toThrow(
      TypeError,
    );
  });

  it('rejects route, direction, provenance, hash, and accounting mismatches', () => {
    const invalidRoute = draftFixture();
    invalidRoute.route = 'gp7-effects-fixture-v1';
    expect(PracticeImportDraftSchema.safeParse(invalidRoute).success).toBe(false);

    const invalidDirection = draftFixture();
    invalidDirection.direction = 'performance-to-draft';
    expect(PracticeImportDraftSchema.safeParse(invalidDirection).success).toBe(false);

    const invalidProvenance = draftFixture();
    invalidProvenance.candidateDocument.importProvenance.importReportId = 'other-report';
    expect(PracticeImportDraftSchema.safeParse(invalidProvenance).success).toBe(false);

    const invalidHash = draftFixture();
    invalidHash.candidateDocumentContentHash = hash(
      'practice-document',
      'practice-document-content',
      'c',
    );
    expect(PracticeImportDraftSchema.safeParse(invalidHash).success).toBe(false);

    const invalidBytes = draftFixture();
    invalidBytes.resources.usage.sourceBytes = 1_023;
    expect(PracticeImportDraftSchema.safeParse(invalidBytes).success).toBe(false);

    const invalidOutput = draftFixture();
    invalidOutput.resources.usage.outputEventCount = 2;
    expect(PracticeImportDraftSchema.safeParse(invalidOutput).success).toBe(false);

    const exceeded = draftFixture();
    exceeded.resources.budget.maximumSourceEvents = 3;
    expect(PracticeImportDraftSchema.safeParse(exceeded).success).toBe(false);
  });

  it('rejects native-open, wrong-format, undeclared fields, and malformed source identity', () => {
    const native = { ...draftFixture(), route: 'native-stringsight-v1' };
    expect(PracticeImportDraftSchema.safeParse(native).success).toBe(false);

    const wrongFormat = draftFixture();
    wrongFormat.source.format = 'smf';
    expect(PracticeImportDraftSchema.safeParse(wrongFormat).success).toBe(false);

    const wrongFormatVersion = draftFixture();
    wrongFormatVersion.source.formatVersion = 'GP5';
    expect(PracticeImportDraftSchema.safeParse(wrongFormatVersion).success).toBe(false);

    expect(
      PracticeImportDraftSchema.safeParse({ ...draftFixture(), rendererGraph: {} }).success,
    ).toBe(false);

    const malformedDigest = draftFixture();
    malformedDigest.source.sha256Hex = 'ABC';
    expect(PracticeImportDraftSchema.safeParse(malformedDigest).success).toBe(false);

    const wrongSourceProjection = draftFixture();
    (wrongSourceProjection as unknown as { sourceIdentityHash: unknown }).sourceIdentityHash = hash(
      'wrong-source',
      'wrong-projection',
    );
    expect(PracticeImportDraftSchema.safeParse(wrongSourceProjection).success).toBe(false);

    for (const versionField of ['projectionVersion', 'schemaVersion'] as const) {
      const wrongSourceVersion = draftFixture();
      (
        wrongSourceVersion as unknown as { sourceIdentityHash: Record<string, unknown> }
      ).sourceIdentityHash = { ...wrongSourceVersion.sourceIdentityHash, [versionField]: 2 };
      expect(PracticeImportDraftSchema.safeParse(wrongSourceVersion).success).toBe(false);
    }
  });
});

describe('trusted Practice import review', () => {
  async function trustedBundle() {
    const draft = draftFixture();
    const report = reportFixture();
    const computedSourceHash = await hashPracticeImportSourceIdentity(draft.source);
    (draft as unknown as { sourceIdentityHash: unknown }).sourceIdentityHash = computedSourceHash;
    (draft.candidateDocument.importProvenance as unknown as { sourceHash: unknown }).sourceHash =
      computedSourceHash;
    (report as unknown as { sourceIdentityHash: unknown }).sourceIdentityHash = computedSourceHash;
    const [computedContentHash, computedExpectedHash] = await Promise.all([
      hashPracticeDocumentContent(draft.candidateDocument),
      hashExpectedEvents(draft.candidateDocument),
    ]);
    (draft as unknown as { candidateDocumentContentHash: unknown }).candidateDocumentContentHash =
      computedContentHash;
    (draft.candidateDocument.revision as unknown as { contentHash: unknown }).contentHash =
      computedContentHash;
    (
      draft.candidateDocument as unknown as { expectedProjectionHash: unknown }
    ).expectedProjectionHash = computedExpectedHash;
    if (report.draftBinding === null)
      throw new Error('Reviewable report requires a draft binding.');
    (
      report.draftBinding as unknown as { candidateDocumentContentHash: unknown }
    ).candidateDocumentContentHash = computedContentHash;
    return { bundleVersion: 1 as const, draft, report };
  }

  it('recomputes source, candidate-content, and expected-event identities', async () => {
    const verified = await verifyPracticeImportReviewBundle(await trustedBundle());
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.draft)).toBe(true);
    expect(Object.isFrozen(verified.draft.candidateDocument)).toBe(true);
    expect(() => {
      (verified.draft.source as unknown as { fileName: string }).fileName = 'mutated.gp';
    }).toThrow(TypeError);
  });

  it('rejects structurally coordinated tampering with source or candidate content', async () => {
    const sourceTamper = await trustedBundle();
    sourceTamper.draft.source.fileName = 'renamed.gp';
    sourceTamper.report.source.fileName = 'renamed.gp';
    await expect(verifyPracticeImportReviewBundle(sourceTamper)).rejects.toMatchObject({
      code: 'source-identity-hash-mismatch',
    });

    const contentTamper = await trustedBundle();
    contentTamper.draft.candidateDocument.metadata.title = 'Tampered after hashing';
    await expect(verifyPracticeImportReviewBundle(contentTamper)).rejects.toMatchObject({
      code: 'candidate-content-hash-mismatch',
    });
  });

  it('rejects raw accessors before schema parsing without invoking them', async () => {
    const accessor = await trustedBundle();
    let invoked = false;
    Object.defineProperty(accessor.draft.source, 'fileName', {
      enumerable: true,
      get: () => {
        invoked = true;
        return 'getter.gp';
      },
    });

    await expect(verifyPracticeImportReviewBundle(accessor)).rejects.toMatchObject({
      code: 'ACCESSOR_PROPERTY',
    });
    expect(invoked).toBe(false);
  });
});

describe('PracticeImportReport', () => {
  it('finalizes exact counts, severity, action, and immutable draft binding', () => {
    const parsed = PracticeImportReportSchema.parse(reportFixture());
    expect(parsed.outcome).toBe('reviewable');
    expect(parsed.reportAction).toBe('accept-draft');
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.findings)).toBe(true);
  });

  it('accepts an approximate declared SMF route only with explicit loss', () => {
    const finding = createPracticeImportFinding('import.smf.type1.fixture-explicit-loss', {
      affectedCount: 3,
    });
    const report = reportFixture();
    report.direction = 'performance-to-draft';
    report.route = 'smf-type1-declared-fixtures-v1';
    report.source = sourceIdentity('smf');
    report.findings = [finding];
    report.dispositionCounts = dispositionCounts({ approximated: 3 });
    report.highestSeverity = 'warning';
    report.reportAction = 'review-losses';
    expect(PracticeImportReportSchema.safeParse(report).success).toBe(true);

    report.findings = [];
    report.dispositionCounts = dispositionCounts();
    report.highestSeverity = 'info';
    report.reportAction = 'accept-draft';
    expect(PracticeImportReportSchema.safeParse(report).success).toBe(false);
  });

  it('finalizes rejected candidate routes without a misleading draft', () => {
    const finding = createPracticeImportFinding('import.gp7-effects.fidelity-rejected', {
      affectedCount: 1,
    });
    const report = reportFixture();
    report.route = 'gp7-effects-fixture-v1';
    report.source.formatVersion = 'GP7';
    report.draftBinding = null;
    report.findings = [finding];
    report.dispositionCounts = dispositionCounts({ blocking: 1 });
    report.highestSeverity = 'blocking';
    report.outcome = 'rejected';
    report.reportAction = 'choose-supported-format';
    expect(PracticeImportReportSchema.safeParse(report).success).toBe(true);
  });

  it('pins every finalized route to its exact evidence version and stable classification', () => {
    const cases = [
      {
        code: 'import.gp5-effects.parsing-only-approximate',
        direction: 'score-to-draft',
        disposition: 'approximated',
        format: 'guitar-pro',
        formatVersion: 'GP5',
        highestSeverity: 'warning',
        outcome: 'rejected',
        reportAction: 'choose-supported-format',
        route: 'gp5-effects-fixture-v1',
      },
      {
        code: 'import.gp7-effects.fidelity-rejected',
        direction: 'score-to-draft',
        disposition: 'blocking',
        format: 'guitar-pro',
        formatVersion: 'GP7',
        highestSeverity: 'blocking',
        outcome: 'rejected',
        reportAction: 'choose-supported-format',
        route: 'gp7-effects-fixture-v1',
      },
      {
        code: 'import.gp8-basic.fixture-backed',
        direction: 'score-to-draft',
        disposition: 'preserved',
        format: 'guitar-pro',
        formatVersion: 'GP8',
        highestSeverity: 'info',
        outcome: 'reviewable',
        reportAction: 'accept-draft',
        route: 'gp8-basic-fixture-v1',
      },
      {
        code: 'import.musicxml.d4-broad-fidelity-rejected',
        direction: 'score-to-draft',
        disposition: 'blocking',
        format: 'musicxml',
        formatVersion: 'MusicXML 4 XML',
        highestSeverity: 'blocking',
        outcome: 'rejected',
        reportAction: 'choose-supported-format',
        route: 'musicxml-d4-broad-v1',
      },
      {
        code: 'import.smf.guitar-semantics.unsupported',
        direction: 'performance-to-draft',
        disposition: 'unsupported',
        format: 'smf',
        formatVersion: 'SMF Type 0',
        highestSeverity: 'warning',
        outcome: 'rejected',
        reportAction: 'choose-supported-format',
        route: 'smf-broad-v1',
      },
      {
        code: 'import.smf.type1.fixture-explicit-loss',
        direction: 'performance-to-draft',
        disposition: 'approximated',
        format: 'smf',
        formatVersion: 'SMF Type 1',
        highestSeverity: 'warning',
        outcome: 'reviewable',
        reportAction: 'review-losses',
        route: 'smf-type1-declared-fixtures-v1',
      },
    ] as const;

    for (const entry of cases) {
      const report = reportFixture();
      report.direction = entry.direction;
      report.draftBinding = entry.outcome === 'reviewable' ? report.draftBinding : null;
      report.findings = [createPracticeImportFinding(entry.code, { affectedCount: 1 })];
      report.dispositionCounts = dispositionCounts({ [entry.disposition]: 1 });
      report.highestSeverity = entry.highestSeverity;
      report.outcome = entry.outcome;
      report.reportAction = entry.reportAction;
      report.route = entry.route;
      report.source = sourceIdentity(entry.format, entry.formatVersion);
      expect(PracticeImportReportSchema.safeParse(report).success, entry.route).toBe(true);
      expect(PRACTICE_IMPORT_ROUTE_FORMAT_VERSIONS[entry.route]).toContain(entry.formatVersion);
      expect(PRACTICE_IMPORT_ROUTE_CLASSIFICATION_CODES[entry.route]).toEqual([entry.code]);

      report.source.formatVersion = 'dishonest-version';
      expect(PracticeImportReportSchema.safeParse(report).success, entry.route).toBe(false);
    }

    expect(Object.isFrozen(PRACTICE_IMPORT_ROUTE_FORMAT_VERSIONS)).toBe(true);
    expect(Object.isFrozen(PRACTICE_IMPORT_ROUTE_CLASSIFICATION_CODES)).toBe(true);
  });

  it('does not allow generic non-native loss to replace a route classification', () => {
    const emptyGp8 = reportFixture();
    emptyGp8.findings = [];
    emptyGp8.dispositionCounts = dispositionCounts();
    expect(PracticeImportReportSchema.safeParse(emptyGp8).success).toBe(false);

    const genericSmf = reportFixture();
    genericSmf.direction = 'performance-to-draft';
    genericSmf.route = 'smf-type1-declared-fixtures-v1';
    genericSmf.source = sourceIdentity('smf', 'SMF Type 1');
    genericSmf.findings = [
      createPracticeImportFinding('import.non-native.lossless-roundtrip-unavailable', {
        affectedCount: 1,
      }),
    ];
    genericSmf.dispositionCounts = dispositionCounts({ unsupported: 1 });
    genericSmf.highestSeverity = 'warning';
    genericSmf.reportAction = 'review-losses';
    expect(PracticeImportReportSchema.safeParse(genericSmf).success).toBe(false);
  });

  it('requires exact disposition totals, highest severity, unique codes, and chronology', () => {
    const wrongCount = reportFixture();
    wrongCount.dispositionCounts.preserved = 0;
    expect(PracticeImportReportSchema.safeParse(wrongCount).success).toBe(false);

    const wrongSeverity = reportFixture();
    wrongSeverity.highestSeverity = 'warning';
    expect(PracticeImportReportSchema.safeParse(wrongSeverity).success).toBe(false);

    const duplicateCode = reportFixture();
    duplicateCode.findings.push(requireEntry(duplicateCode.findings[0]));
    duplicateCode.dispositionCounts.preserved = 2;
    expect(PracticeImportReportSchema.safeParse(duplicateCode).success).toBe(false);

    const backwards = reportFixture();
    backwards.finalizedAt = '2026-07-20T11:59:59Z';
    expect(PracticeImportReportSchema.safeParse(backwards).success).toBe(false);

    const wrongRouteCode = reportFixture();
    wrongRouteCode.findings = [
      createPracticeImportFinding('import.smf.type1.fixture-explicit-loss', {
        affectedCount: 1,
      }),
    ];
    wrongRouteCode.dispositionCounts = dispositionCounts({ approximated: 1 });
    wrongRouteCode.highestSeverity = 'warning';
    wrongRouteCode.reportAction = 'review-losses';
    expect(PracticeImportReportSchema.safeParse(wrongRouteCode).success).toBe(false);

    const unsorted = reportFixture();
    unsorted.findings = [
      createPracticeImportFinding('import.non-native.lossless-roundtrip-unavailable', {
        affectedCount: 1,
      }),
      createPracticeImportFinding('import.gp8-basic.fixture-backed', { affectedCount: 1 }),
    ];
    unsorted.dispositionCounts = dispositionCounts({ preserved: 1, unsupported: 1 });
    unsorted.highestSeverity = 'warning';
    unsorted.reportAction = 'review-losses';
    expect(PracticeImportReportSchema.safeParse(unsorted).success).toBe(false);
  });

  it('requires exact diagnostic meanings and resource-overage reporting', () => {
    const definition = PRACTICE_IMPORT_DIAGNOSTIC_BY_ID['import.source.security-rejected'];
    expect(
      PracticeImportDiagnosticSchema.safeParse({
        ...diagnostic('import.source.security-rejected'),
        severity: 'warning',
      }).success,
    ).toBe(false);
    expect(definition.severity).toBe('blocking');

    const overage = reportFixture();
    overage.resources.budget.maximumSourceEvents = 3;
    overage.diagnostics = [diagnostic('import.resource.source-events-exceeded')];
    overage.draftBinding = null;
    overage.highestSeverity = 'blocking';
    overage.outcome = 'rejected';
    overage.reportAction = 'reject-import';
    expect(PracticeImportReportSchema.safeParse(overage).success).toBe(true);

    overage.diagnostics = [];
    expect(PracticeImportReportSchema.safeParse(overage).success).toBe(false);

    const falseAlarm = reportFixture();
    falseAlarm.diagnostics = [diagnostic('import.resource.source-events-exceeded')];
    falseAlarm.draftBinding = null;
    falseAlarm.highestSeverity = 'blocking';
    falseAlarm.outcome = 'rejected';
    falseAlarm.reportAction = 'reject-import';
    expect(PracticeImportReportSchema.safeParse(falseAlarm).success).toBe(false);
  });

  it('keeps diagnostic and report-code vocabularies bounded', () => {
    expect(PRACTICE_IMPORT_DIAGNOSTIC_CODES).toHaveLength(9);
    expect(new Set(PRACTICE_IMPORT_DIAGNOSTIC_CODES).size).toBe(9);
    expect(Object.isFrozen(PRACTICE_IMPORT_DIAGNOSTIC_CODES)).toBe(true);
    expect(Object.isFrozen(PRACTICE_IMPORT_DIAGNOSTIC_BY_ID)).toBe(true);
    expect(PRACTICE_IMPORT_RESOURCE_LIMITS.maximumDiagnostics).toBe(1_000);

    expect(
      PracticeImportDiagnosticSchema.safeParse({
        ...diagnostic('import.source.malformed'),
        code: 'import.source.unknown',
      }).success,
    ).toBe(false);
  });
});

describe('PracticeImportReviewBundle', () => {
  it('binds one immutable reviewable draft to its finalized report', () => {
    const bundle = parseImmutablePracticeImportReviewBundle({
      bundleVersion: 1,
      draft: draftFixture(),
      report: reportFixture(),
    });
    expect(bundle.draft.reportId).toBe(bundle.report.reportId);
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.draft.candidateDocument)).toBe(true);
  });

  it('rejects source, resource, route, report, and content binding mismatches', () => {
    const base = {
      bundleVersion: 1,
      draft: draftFixture(),
      report: reportFixture(),
    };
    expect(PracticeImportReviewBundleSchema.safeParse(base).success).toBe(true);

    const reportId = structuredClone(base);
    reportId.report.reportId = 'other-report';
    expect(PracticeImportReviewBundleSchema.safeParse(reportId).success).toBe(false);

    const source = structuredClone(base);
    source.report.source.sourceId = 'source-2';
    expect(PracticeImportReviewBundleSchema.safeParse(source).success).toBe(false);

    const resourcesMismatch = structuredClone(base);
    resourcesMismatch.report.resources.usage.wallClockMs = 26;
    expect(PracticeImportReviewBundleSchema.safeParse(resourcesMismatch).success).toBe(false);

    const content = structuredClone(base);
    const contentBinding = content.report.draftBinding;
    if (contentBinding === null) throw new Error('Reviewable report must bind a draft.');
    contentBinding.candidateDocumentContentHash = hash(
      'practice-document',
      'practice-document-content',
      'c',
    );
    expect(PracticeImportReviewBundleSchema.safeParse(content).success).toBe(false);
  });
});
