import { describe, expect, it } from 'vitest';

import {
  PRACTICE_IMPORT_REPORT_CODE_BY_ID,
  PRACTICE_IMPORT_REPORT_CODE_DEFINITIONS,
  PRACTICE_IMPORT_REPORT_CODES,
  PRACTICE_IMPORT_ROUTE_IDS,
  PRACTICE_SEMANTIC_IDS,
  PRACTICE_SUPPORT_PROFILE,
  PRACTICE_SUPPORT_PROFILE_ID,
  PRACTICE_SUPPORT_SCHEMA_VERSION,
  PracticeImportFindingSchema,
  PracticeImportReportCodeSchema,
  PracticeSupportProfileSchema,
  createPracticeImportFinding,
} from './practice-support';

function requireEntry<T>(entry: T | undefined): T {
  if (entry === undefined) {
    throw new Error('Expected profile entry is missing.');
  }
  return entry;
}

function mutableProfileFixture() {
  return PracticeSupportProfileSchema.parse(structuredClone(PRACTICE_SUPPORT_PROFILE));
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe('Practice System support profile', () => {
  it('contains every declared semantic and route exactly once', () => {
    expect(PRACTICE_SUPPORT_PROFILE.schemaVersion).toBe(PRACTICE_SUPPORT_SCHEMA_VERSION);
    expect(PRACTICE_SUPPORT_PROFILE.profileId).toBe(PRACTICE_SUPPORT_PROFILE_ID);
    expect(PRACTICE_SUPPORT_PROFILE.semantics.map(({ semantic }) => semantic)).toEqual(
      PRACTICE_SEMANTIC_IDS,
    );
    expect(PRACTICE_SUPPORT_PROFILE.importRoutes.map(({ route }) => route)).toEqual(
      PRACTICE_IMPORT_ROUTE_IDS,
    );
    expect(new Set(PRACTICE_SEMANTIC_IDS).size).toBe(PRACTICE_SEMANTIC_IDS.length);
    expect(new Set(PRACTICE_IMPORT_ROUTE_IDS).size).toBe(PRACTICE_IMPORT_ROUTE_IDS.length);
  });

  it('keeps the owner-approved D4 native profile exact and honest', () => {
    const byStatus = Object.groupBy(PRACTICE_SUPPORT_PROFILE.semantics, ({ status }) => status);

    expect(byStatus.supported?.map(({ semantic }) => semantic)).toEqual([
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
    ]);
    expect(
      byStatus.deferred?.map(({ semantic, importStrategy }) => [semantic, importStrategy]),
    ).toEqual([
      ['grace-note', 'convert-or-reject'],
      ['structural-repeat', 'expand-or-reject'],
      ['alternate-ending', 'expand-or-reject'],
    ]);
    expect(byStatus.rejected).toEqual([
      {
        evidence: 'not-implemented',
        importStrategy: 'reject',
        semantic: 'artificial-harmonic',
        status: 'rejected',
      },
    ]);
    expect(byStatus.approximate).toBeUndefined();
  });

  it('separates supported, approximate, rejected, and deferred import routes', () => {
    expect(PRACTICE_SUPPORT_PROFILE.importRoutes).toEqual([
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
    ]);
  });

  it('rejects duplicate semantics, duplicate routes, unknown fields, and false fidelity claims', () => {
    const duplicateSemantic = mutableProfileFixture();
    duplicateSemantic.semantics.push(requireEntry(duplicateSemantic.semantics[0]));
    expect(PracticeSupportProfileSchema.safeParse(duplicateSemantic).success).toBe(false);

    const duplicateRoute = mutableProfileFixture();
    duplicateRoute.importRoutes.push(requireEntry(duplicateRoute.importRoutes[0]));
    expect(PracticeSupportProfileSchema.safeParse(duplicateRoute).success).toBe(false);

    const falseLosslessClaim = mutableProfileFixture();
    requireEntry(falseLosslessClaim.importRoutes[1]).losslessEditableRoundTrip = true;
    expect(PracticeSupportProfileSchema.safeParse(falseLosslessClaim).success).toBe(false);

    const missingNativeClaim = mutableProfileFixture();
    requireEntry(missingNativeClaim.importRoutes[0]).advertised = false;
    expect(PracticeSupportProfileSchema.safeParse(missingNativeClaim).success).toBe(false);

    const widenedCandidateClaim = mutableProfileFixture();
    requireEntry(widenedCandidateClaim.importRoutes[4]).status = 'supported';
    expect(PracticeSupportProfileSchema.safeParse(widenedCandidateClaim).success).toBe(false);

    const widenedSemanticClaim = mutableProfileFixture();
    requireEntry(widenedSemanticClaim.semantics[18]).status = 'supported';
    expect(PracticeSupportProfileSchema.safeParse(widenedSemanticClaim).success).toBe(false);

    const incompleteProfile = mutableProfileFixture();
    incompleteProfile.semantics.pop();
    expect(PracticeSupportProfileSchema.safeParse(incompleteProfile).success).toBe(false);

    expect(
      PracticeSupportProfileSchema.safeParse({
        ...PRACTICE_SUPPORT_PROFILE,
        undeclaredCapability: true,
      }).success,
    ).toBe(false);
    expect(
      PracticeSupportProfileSchema.safeParse({
        ...PRACTICE_SUPPORT_PROFILE,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
  });

  it('deep-freezes the exported profile and vocabulary catalogs', () => {
    expectDeepFrozen(PRACTICE_SEMANTIC_IDS);
    expectDeepFrozen(PRACTICE_IMPORT_ROUTE_IDS);
    expectDeepFrozen(PRACTICE_SUPPORT_PROFILE);

    expect(() => (PRACTICE_SUPPORT_PROFILE.importRoutes as unknown as unknown[]).pop()).toThrow(
      TypeError,
    );
    expect(() => {
      const route = requireEntry(PRACTICE_SUPPORT_PROFILE.importRoutes[0]);
      (route as unknown as { advertised: boolean }).advertised = false;
    }).toThrow(TypeError);
  });
});

describe('stable practice import report codes', () => {
  it('has a complete, duplicate-free vocabulary and lookup', () => {
    expect(PRACTICE_IMPORT_REPORT_CODES).toHaveLength(31);
    expect(new Set(PRACTICE_IMPORT_REPORT_CODES).size).toBe(PRACTICE_IMPORT_REPORT_CODES.length);
    expect(PRACTICE_IMPORT_REPORT_CODE_DEFINITIONS).toHaveLength(
      PRACTICE_IMPORT_REPORT_CODES.length,
    );

    for (const code of PRACTICE_IMPORT_REPORT_CODES) {
      expect(PracticeImportReportCodeSchema.parse(code)).toBe(code);
      expect(PRACTICE_IMPORT_REPORT_CODE_BY_ID[code].code).toBe(code);
    }

    expect(
      PracticeImportReportCodeSchema.safeParse('musicxml.unknown.silently-dropped').success,
    ).toBe(false);
  });

  it('deep-freezes every exported report-code catalog and definition', () => {
    expectDeepFrozen(PRACTICE_IMPORT_REPORT_CODES);
    expectDeepFrozen(PRACTICE_IMPORT_REPORT_CODE_DEFINITIONS);
    expectDeepFrozen(PRACTICE_IMPORT_REPORT_CODE_BY_ID);

    expect(() => (PRACTICE_IMPORT_REPORT_CODES as unknown as unknown[]).pop()).toThrow(TypeError);
    expect(() => {
      const definition = PRACTICE_IMPORT_REPORT_CODE_BY_ID['musicxml.tie.preserved'];
      (definition as unknown as { severity: string }).severity = 'error';
    }).toThrow(TypeError);
  });

  it('preserves the retained MusicXML semantic codes verbatim', () => {
    expect(PRACTICE_IMPORT_REPORT_CODES.slice(0, 22)).toEqual([
      'musicxml.pitch-key.preserved',
      'musicxml.tie.preserved',
      'musicxml.slur.preserved',
      'musicxml.tuplet-3-2.preserved',
      'musicxml.two-voices.preserved',
      'musicxml.dynamic-mf.preserved',
      'musicxml.accent.preserved',
      'musicxml.staccato.preserved',
      'musicxml.duration-and-string.preserved',
      'musicxml.hammer-on.candidate-dropped',
      'musicxml.pull-off.candidate-dropped',
      'musicxml.slide.preserved',
      'musicxml.bend.halfstep-units-converted',
      'musicxml.vibrato.preserved',
      'musicxml.let-ring.candidate-dropped',
      'musicxml.palm-mute.candidate-dropped',
      'musicxml.dead-note.candidate-dropped',
      'musicxml.natural-harmonic.candidate-dropped',
      'musicxml.grace-note.native-v1-unsupported',
      'musicxml.repeat.expansion-not-implemented',
      'musicxml.ending.expansion-not-implemented',
      'musicxml.artificial-harmonic.native-v1-unsupported',
    ]);
  });

  it('locks every code to one disposition, severity, and action', () => {
    expect(
      PRACTICE_IMPORT_REPORT_CODE_DEFINITIONS.map(({ action, code, disposition, severity }) => [
        code,
        disposition,
        severity,
        action,
      ]),
    ).toEqual([
      ['musicxml.pitch-key.preserved', 'preserved', 'info', 'none'],
      ['musicxml.tie.preserved', 'preserved', 'info', 'none'],
      ['musicxml.slur.preserved', 'preserved', 'info', 'none'],
      ['musicxml.tuplet-3-2.preserved', 'preserved', 'info', 'none'],
      ['musicxml.two-voices.preserved', 'preserved', 'info', 'none'],
      ['musicxml.dynamic-mf.preserved', 'preserved', 'info', 'none'],
      ['musicxml.accent.preserved', 'preserved', 'info', 'none'],
      ['musicxml.staccato.preserved', 'preserved', 'info', 'none'],
      ['musicxml.duration-and-string.preserved', 'preserved', 'info', 'none'],
      ['musicxml.hammer-on.candidate-dropped', 'dropped', 'error', 'reject-import'],
      ['musicxml.pull-off.candidate-dropped', 'dropped', 'error', 'reject-import'],
      ['musicxml.slide.preserved', 'preserved', 'info', 'none'],
      ['musicxml.bend.halfstep-units-converted', 'converted', 'warning', 'accept-conversion'],
      ['musicxml.vibrato.preserved', 'preserved', 'info', 'none'],
      ['musicxml.let-ring.candidate-dropped', 'dropped', 'error', 'reject-import'],
      ['musicxml.palm-mute.candidate-dropped', 'dropped', 'error', 'reject-import'],
      ['musicxml.dead-note.candidate-dropped', 'dropped', 'error', 'reject-import'],
      ['musicxml.natural-harmonic.candidate-dropped', 'dropped', 'error', 'reject-import'],
      ['musicxml.grace-note.native-v1-unsupported', 'unsupported', 'error', 'reject-import'],
      ['musicxml.repeat.expansion-not-implemented', 'blocking', 'blocking', 'reject-import'],
      ['musicxml.ending.expansion-not-implemented', 'blocking', 'blocking', 'reject-import'],
      [
        'musicxml.artificial-harmonic.native-v1-unsupported',
        'unsupported',
        'error',
        'reject-import',
      ],
      ['import.native.stringsight.lossless', 'preserved', 'info', 'none'],
      ['import.gp8-basic.fixture-backed', 'preserved', 'info', 'none'],
      [
        'import.gp5-effects.parsing-only-approximate',
        'approximated',
        'warning',
        'choose-supported-format',
      ],
      ['import.gp7-effects.fidelity-rejected', 'blocking', 'blocking', 'choose-supported-format'],
      [
        'import.musicxml.d4-broad-fidelity-rejected',
        'blocking',
        'blocking',
        'choose-supported-format',
      ],
      ['import.smf.type1.fixture-explicit-loss', 'approximated', 'warning', 'accept-loss'],
      ['import.smf.ppq-960-to-480.quantized', 'converted', 'warning', 'accept-conversion'],
      ['import.smf.guitar-semantics.unsupported', 'unsupported', 'warning', 'accept-loss'],
      [
        'import.non-native.lossless-roundtrip-unavailable',
        'unsupported',
        'warning',
        'use-native-format',
      ],
    ]);

    expect(PRACTICE_IMPORT_REPORT_CODE_BY_ID['musicxml.bend.halfstep-units-converted']).toEqual({
      action: 'accept-conversion',
      code: 'musicxml.bend.halfstep-units-converted',
      disposition: 'converted',
      semantic: 'bend-bounded',
      severity: 'warning',
    });
    expect(PRACTICE_IMPORT_REPORT_CODE_BY_ID['import.gp7-effects.fidelity-rejected']).toEqual({
      action: 'choose-supported-format',
      code: 'import.gp7-effects.fidelity-rejected',
      disposition: 'blocking',
      severity: 'blocking',
    });
  });

  it('constructs exact findings and rejects mismatched stable meanings', () => {
    const finding = createPracticeImportFinding('musicxml.bend.halfstep-units-converted', {
      affectedCount: 2,
      detail: 'Two half-step bend values were normalized.',
      sourceEventIds: ['event-1', 'event-2'],
    });

    expect(finding).toEqual({
      action: 'accept-conversion',
      affectedCount: 2,
      code: 'musicxml.bend.halfstep-units-converted',
      detail: 'Two half-step bend values were normalized.',
      disposition: 'converted',
      schemaVersion: PRACTICE_SUPPORT_SCHEMA_VERSION,
      severity: 'warning',
      sourceEventIds: ['event-1', 'event-2'],
    });
    expect(PracticeImportFindingSchema.parse(finding)).toEqual(finding);

    expect(PracticeImportFindingSchema.safeParse({ ...finding, severity: 'info' }).success).toBe(
      false,
    );
    expect(PracticeImportFindingSchema.safeParse({ ...finding, action: 'none' }).success).toBe(
      false,
    );
    expect(
      PracticeImportFindingSchema.safeParse({ ...finding, disposition: 'preserved' }).success,
    ).toBe(false);
    expect(
      PracticeImportFindingSchema.safeParse({
        ...finding,
        sourceEventIds: ['event-1', 'event-1'],
      }).success,
    ).toBe(false);
    expect(
      PracticeImportFindingSchema.safeParse({
        ...finding,
        affectedCount: 3,
      }).success,
    ).toBe(false);
  });

  it('rejects invalid counts, versions, details, codes, and undeclared fields', () => {
    const valid = createPracticeImportFinding('import.smf.type1.fixture-explicit-loss', {
      affectedCount: 1,
    });

    for (const invalid of [
      { ...valid, affectedCount: 0 },
      { ...valid, affectedCount: 1.5 },
      { ...valid, schemaVersion: 2 },
      { ...valid, detail: '' },
      { ...valid, code: 'import.smf.all-perfect' },
      { ...valid, hiddenLoss: true },
    ]) {
      expect(PracticeImportFindingSchema.safeParse(invalid).success).toBe(false);
    }
  });
});
