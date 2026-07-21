import {
  PracticeDocumentSchema,
  type PracticeDocument,
  type QualifiedHash,
} from '../../shared/contracts/practice';
import {
  PRACTICE_IMPORT_DIAGNOSTIC_BY_ID,
  PRACTICE_IMPORT_RESOURCE_LIMITS,
  PracticeImportReportSchema,
  PracticeImportReviewBundleSchema,
  PracticeImportSourceIdentityHashSchema,
  type PracticeImportDiagnostic,
  type PracticeImportDiagnosticCode,
  type PracticeImportDraft,
  type PracticeImportReport,
  type PracticeImportResourceBudget,
  type PracticeImportSourceIdentityHash,
} from '../../shared/contracts/practice-import';
import {
  createPracticeImportFinding,
  type PracticeImportDisposition,
  type PracticeImportFinding,
  type PracticeImportRouteId,
} from '../../shared/contracts/practice-support';
import {
  hashExpectedEvents,
  hashPracticeDocumentContent,
  hashPracticeImportSourceIdentity,
} from '../../shared/practice-identity';
import { verifyPracticeImportReviewBundle } from '../../shared/practice-import-integrity';

export const BOUNDED_SCORE_IMPORT_ADAPTER_ID = 'stringsight-alphatab-import';
export const BOUNDED_SCORE_IMPORT_ADAPTER_VERSION = '1.0.0';
export const PINNED_ALPHATAB_VERSION = '1.8.4';

export const BOUNDED_SCORE_PARSER_EXECUTION_PROFILE = Object.freeze({
  cancellation: 'pre-and-post-stage-only' as const,
  digestGate: 'exact-fixture-before-parser' as const,
  exactFileParserStage:
    'ScoreLoader.loadScoreFromBytes is synchronous and elapsed time is checked immediately before and after it' as const,
  interruptible: false,
  isolation: 'private-synchronous-adapter-stage' as const,
  wallClockEnforcement: 'pre-and-post-stage' as const,
});

export type BoundedScoreFixtureId =
  'gp5-effects' | 'gp7-effects' | 'gp8-basic' | 'musicxml-d4-supported' | 'musicxml-explicit-loss';

type FixtureDefinition = Readonly<{
  advertised: boolean;
  direction: 'score-to-draft';
  expectedNoteCount: number;
  format: 'guitar-pro' | 'musicxml';
  formatVersion: 'GP5' | 'GP7' | 'GP8' | 'MusicXML 4 XML';
  route: Exclude<
    PracticeImportRouteId,
    'native-stringsight-v1' | 'smf-broad-v1' | 'smf-type1-declared-fixtures-v1'
  >;
  sha256Hex: string;
  status: 'approximate' | 'rejected' | 'supported';
}>;

export const BOUNDED_SCORE_IMPORT_FIXTURES: Readonly<
  Record<BoundedScoreFixtureId, FixtureDefinition>
> = Object.freeze({
  'gp5-effects': Object.freeze({
    advertised: false,
    direction: 'score-to-draft',
    expectedNoteCount: 121,
    format: 'guitar-pro',
    formatVersion: 'GP5',
    route: 'gp5-effects-fixture-v1',
    sha256Hex: 'e364cf882db1d849653183d8aa52ca73e5af104ba6dd535d6273a7565ab81455',
    status: 'approximate',
  }),
  'gp7-effects': Object.freeze({
    advertised: false,
    direction: 'score-to-draft',
    expectedNoteCount: 121,
    format: 'guitar-pro',
    formatVersion: 'GP7',
    route: 'gp7-effects-fixture-v1',
    sha256Hex: '178b4d99171febb68c86f418aa451c44adc4c7a1ec2e31bcda587b303bb2867b',
    status: 'rejected',
  }),
  'gp8-basic': Object.freeze({
    advertised: true,
    direction: 'score-to-draft',
    expectedNoteCount: 4,
    format: 'guitar-pro',
    formatVersion: 'GP8',
    route: 'gp8-basic-fixture-v1',
    sha256Hex: '7831cd6780faa9ad8ac3b30f1a36ef2dcf75bf8c8601c63472bfea2b06793a9b',
    status: 'supported',
  }),
  'musicxml-d4-supported': Object.freeze({
    advertised: false,
    direction: 'score-to-draft',
    expectedNoteCount: 19,
    format: 'musicxml',
    formatVersion: 'MusicXML 4 XML',
    route: 'musicxml-d4-broad-v1',
    sha256Hex: '6bfd320baffc9babd9ce6a6923cb1c7479eaa1fe07487127526b8c09f3adc304',
    status: 'rejected',
  }),
  'musicxml-explicit-loss': Object.freeze({
    advertised: false,
    direction: 'score-to-draft',
    expectedNoteCount: 4,
    format: 'musicxml',
    formatVersion: 'MusicXML 4 XML',
    route: 'musicxml-d4-broad-v1',
    sha256Hex: '9aef6811d5afee78ba05ae9c599af81422acfd64a77aa437747a1bb70b14ce52',
    status: 'rejected',
  }),
});

const DEFAULT_BUDGET = Object.freeze({
  maximumOutputEvents: 2_000,
  maximumSourceBytes: 4 * 1024 * 1024,
  maximumSourceEvents: 100_000,
  maximumWallClockMs: 30_000,
} as const satisfies PracticeImportResourceBudget);

const adapter = Object.freeze({
  adapterId: BOUNDED_SCORE_IMPORT_ADAPTER_ID,
  adapterVersion: BOUNDED_SCORE_IMPORT_ADAPTER_VERSION,
});

export type ScoreImportParserSummary = Readonly<{
  masterBarCount: number;
  noteCount: number;
  playerEnabled: false;
  soundFont: null;
  title: string;
  trackCount: number;
}>;

export type ImportMonotonicClock = Readonly<{ now(): number }>;

type SemanticDisposition = Readonly<{
  affectedCount: number;
  detail: string;
  disposition: PracticeImportDisposition;
  id: string;
  sourceEventIds?: readonly string[];
}>;

export type BoundedScoreImportRequest = Readonly<{
  bytes: Uint8Array;
  clock?: ImportMonotonicClock;
  fileName: string;
  fixtureId: BoundedScoreFixtureId;
  importedAt: string;
  resourceBudget?: Partial<PracticeImportResourceBudget>;
  signal?: AbortSignal;
  title?: string;
}>;

export type BoundedScoreImportResult = Readonly<{
  currentDocumentPreserved: true;
  direction: 'score-to-draft';
  draft: PracticeImportDraft | null;
  parserInvoked: boolean;
  parserSummary: ScoreImportParserSummary | null;
  report: PracticeImportReport | null;
  semanticDispositions: readonly SemanticDisposition[];
  status: 'cancelled' | 'rejected' | 'reviewable';
}>;

function placeholderHash(
  projectionId: 'practice-document-content' | 'practice-expected-events',
): QualifiedHash {
  return {
    algorithm: 'sha256',
    canonicalizationId: 'stringsight-canonical-json',
    canonicalizationVersion: 1,
    digestHex: '0'.repeat(64),
    projectionId,
    projectionVersion: 1,
    schemaId: 'practice-document',
    schemaVersion: 1,
  };
}

function normalizeBudget(
  input: Partial<PracticeImportResourceBudget> | undefined,
): PracticeImportResourceBudget {
  const budget = { ...DEFAULT_BUDGET, ...input };
  for (const [field, hardMaximum] of [
    ['maximumOutputEvents', PRACTICE_IMPORT_RESOURCE_LIMITS.maximumOutputEvents],
    ['maximumSourceBytes', PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceBytes],
    ['maximumSourceEvents', PRACTICE_IMPORT_RESOURCE_LIMITS.maximumSourceEvents],
    ['maximumWallClockMs', PRACTICE_IMPORT_RESOURCE_LIMITS.maximumWallClockMs],
  ] as const) {
    const value = budget[field];
    if (!Number.isSafeInteger(value) || value <= 0 || value > hardMaximum) {
      throw new RangeError(
        `${field} must be a positive safe integer no greater than ${String(hardMaximum)}.`,
      );
    }
  }
  return Object.freeze(budget);
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(value));
}

function clockNow(clock: ImportMonotonicClock | undefined): number {
  const value = clock?.now() ?? performance.now();
  if (!Number.isFinite(value)) throw new RangeError('Import monotonic clock must be finite.');
  return value;
}

function elapsedMilliseconds(clock: ImportMonotonicClock | undefined, startedAt: number): number {
  const elapsed = clockNow(clock) - startedAt;
  if (elapsed < 0) throw new RangeError('Import monotonic clock moved backwards.');
  return Math.ceil(elapsed);
}

function diagnostic(
  code: PracticeImportDiagnosticCode,
  affectedCount: number,
  detail: string,
): PracticeImportDiagnostic {
  return { ...PRACTICE_IMPORT_DIAGNOSTIC_BY_ID[code], affectedCount, detail };
}

function dispositionCounts(findings: readonly PracticeImportFinding[]) {
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

function highestSeverity(
  findings: readonly PracticeImportFinding[],
  diagnostics: readonly PracticeImportDiagnostic[],
) {
  const rank = { blocking: 3, error: 2, info: 0, warning: 1 } as const;
  return [...findings, ...diagnostics].reduce<'blocking' | 'error' | 'info' | 'warning'>(
    (highest, entry) => (rank[entry.severity] > rank[highest] ? entry.severity : highest),
    'info',
  );
}

function propertySourceIds(fixtureId: BoundedScoreFixtureId, property: string, count: number) {
  return Array.from(
    { length: count },
    (_, index) => `${fixtureId}:${property}:${String(index + 1)}`,
  );
}

function routeFinding(
  fixtureId: BoundedScoreFixtureId,
  definition: FixtureDefinition,
): PracticeImportFinding {
  if (definition !== BOUNDED_SCORE_IMPORT_FIXTURES[fixtureId]) {
    throw new TypeError('Fixture definition does not match its stable fixture ID.');
  }
  switch (fixtureId) {
    case 'gp5-effects':
      return createPracticeImportFinding('import.gp5-effects.parsing-only-approximate', {
        affectedCount: 1,
        detail:
          'alphaTab parsed the exact GP5 effects fixture, but no independent binary field oracle justifies a draft.',
        sourceEventIds: propertySourceIds(fixtureId, 'unverified-effect-field-set', 1),
      });
    case 'gp7-effects':
      return createPracticeImportFinding('import.gp7-effects.fidelity-rejected', {
        affectedCount: 5,
        detail:
          'The exact GP7 effects fixture remains rejected for one HOpO-origin mismatch and four unsupported grace notes.',
        sourceEventIds: [
          ...propertySourceIds(fixtureId, 'hopo-origin-mismatch', 1),
          ...propertySourceIds(fixtureId, 'grace-note', 4),
        ],
      });
    case 'gp8-basic':
      return createPracticeImportFinding('import.gp8-basic.fixture-backed', {
        affectedCount: 4,
        detail:
          'Four independently inspected GP8 pitch/rhythm/string/fret rows matched the private parser projection.',
        sourceEventIds: propertySourceIds(fixtureId, 'note-row', 4),
      });
    case 'musicxml-d4-supported':
    case 'musicxml-explicit-loss':
      return createPracticeImportFinding('import.musicxml.d4-broad-fidelity-rejected', {
        affectedCount: 1,
        detail:
          'Broad MusicXML D4 fidelity is rejected because accepted guitar techniques are lost.',
        sourceEventIds: propertySourceIds(fixtureId, 'fixture-fidelity', 1),
      });
  }
}

function rejectedFixtureFindings(
  fixtureId: BoundedScoreFixtureId,
  definition: FixtureDefinition,
): PracticeImportFinding[] {
  const findings = [routeFinding(fixtureId, definition)];
  const add = (
    code: Parameters<typeof createPracticeImportFinding>[0],
    property: string,
    count: number,
    detail: string,
  ) => {
    findings.push(
      createPracticeImportFinding(code, {
        affectedCount: count,
        detail,
        sourceEventIds: propertySourceIds(fixtureId, property, count),
      }),
    );
  };
  if (fixtureId === 'musicxml-d4-supported') {
    add(
      'musicxml.hammer-on.candidate-dropped',
      'hammer-on-boundary',
      2,
      'The hammer-on start and stop boundaries are dropped by the candidate profile.',
    );
    add(
      'musicxml.pull-off.candidate-dropped',
      'pull-off-boundary',
      2,
      'The pull-off start and stop boundaries are dropped by the candidate profile.',
    );
    add(
      'musicxml.natural-harmonic.candidate-dropped',
      'natural-harmonic',
      1,
      'The natural-harmonic property is dropped by the candidate profile.',
    );
  } else if (fixtureId === 'musicxml-explicit-loss') {
    add(
      'musicxml.grace-note.native-v1-unsupported',
      'grace-note',
      1,
      'The grace-note property is unsupported by native v1.',
    );
    add(
      'musicxml.let-ring.candidate-dropped',
      'let-ring',
      1,
      'The let-ring property is dropped by the candidate profile.',
    );
    add(
      'musicxml.palm-mute.candidate-dropped',
      'palm-mute',
      1,
      'The palm-mute property is dropped by the candidate profile.',
    );
    add(
      'musicxml.artificial-harmonic.native-v1-unsupported',
      'artificial-harmonic',
      1,
      'The artificial-harmonic property is unsupported by native v1.',
    );
    add(
      'musicxml.repeat.expansion-not-implemented',
      'repeat-boundary',
      2,
      'The forward and backward repeat boundaries cannot be expanded.',
    );
    add(
      'musicxml.ending.expansion-not-implemented',
      'ending-boundary',
      2,
      'The alternate-ending start and stop boundaries cannot be expanded.',
    );
  }
  return findings.sort((left, right) => left.code.localeCompare(right.code));
}

function fixtureSemanticDispositions(
  fixtureId: BoundedScoreFixtureId,
  noteCount: number,
): readonly SemanticDisposition[] {
  const entry = (
    id: string,
    disposition: PracticeImportDisposition,
    affectedCount: number,
    detail: string,
    sourceEventIds: readonly string[],
  ): SemanticDisposition =>
    Object.freeze({ affectedCount, detail, disposition, id, sourceEventIds });
  switch (fixtureId) {
    case 'gp5-effects':
      return Object.freeze([
        entry(
          'gp5.note-projection.parsing-only-approximated',
          'approximated',
          noteCount,
          'The pinned parser produced a stable note count, but individual GP5 effect fields have no independent oracle.',
          propertySourceIds(fixtureId, 'parsed-note', noteCount),
        ),
        entry(
          'gp5.effect-fields.independent-oracle-unsupported',
          'unsupported',
          1,
          'GP5 effect semantics remain unavailable until an independent binary field oracle exists.',
          propertySourceIds(fixtureId, 'unverified-effect-field-set', 1),
        ),
      ]);
    case 'gp7-effects':
      return Object.freeze([
        entry(
          'gp7.hopo-origin-count.mismatch-blocking',
          'blocking',
          1,
          'The independent GPIF oracle has 10 HOpO origins while the pinned parser exposes 9.',
          propertySourceIds(fixtureId, 'hopo-origin-mismatch', 1),
        ),
        entry(
          'gp7.grace-notes.unsupported',
          'unsupported',
          4,
          'Four grace-note semantics are unsupported by the accepted canonical profile.',
          propertySourceIds(fixtureId, 'grace-note', 4),
        ),
      ]);
    case 'musicxml-d4-supported':
      return Object.freeze([
        entry(
          'musicxml.pitch-key.preserved',
          'preserved',
          19,
          'Pitch, key, and note rows were retained.',
          propertySourceIds(fixtureId, 'pitch-key-note-row', 19),
        ),
        entry(
          'musicxml.tie.preserved',
          'preserved',
          2,
          'The start/stop tie pair was retained.',
          propertySourceIds(fixtureId, 'tie-boundary', 2),
        ),
        entry(
          'musicxml.slur.preserved',
          'preserved',
          2,
          'The start/stop slur pair was retained.',
          propertySourceIds(fixtureId, 'slur-boundary', 2),
        ),
        entry(
          'musicxml.tuplet-3-2.preserved',
          'preserved',
          3,
          'The three-note 3:2 tuplet was retained.',
          propertySourceIds(fixtureId, 'tuplet-note', 3),
        ),
        entry(
          'musicxml.two-voices.preserved',
          'preserved',
          2,
          'The two simultaneous voices were retained.',
          propertySourceIds(fixtureId, 'voice', 2),
        ),
        entry(
          'musicxml.dynamic-mf.preserved',
          'preserved',
          1,
          'The mf dynamic was retained.',
          propertySourceIds(fixtureId, 'dynamic-mf', 1),
        ),
        entry(
          'musicxml.accent.preserved',
          'preserved',
          1,
          'The accent was retained.',
          propertySourceIds(fixtureId, 'accent', 1),
        ),
        entry(
          'musicxml.staccato.preserved',
          'preserved',
          1,
          'The staccato mark was retained.',
          propertySourceIds(fixtureId, 'staccato', 1),
        ),
        entry(
          'musicxml.duration-and-string.preserved',
          'preserved',
          19,
          'Durations and string/fret positions were retained.',
          propertySourceIds(fixtureId, 'duration-string-row', 19),
        ),
        entry(
          'musicxml.slide.preserved',
          'preserved',
          2,
          'The slide start/stop pair was retained.',
          propertySourceIds(fixtureId, 'slide-boundary', 2),
        ),
        entry(
          'musicxml.bend.halfstep-units-converted',
          'converted',
          1,
          'The bounded bend requires unit conversion.',
          propertySourceIds(fixtureId, 'bend', 1),
        ),
        entry(
          'musicxml.vibrato.preserved',
          'preserved',
          1,
          'The vibrato mark was retained.',
          propertySourceIds(fixtureId, 'vibrato', 1),
        ),
        entry(
          'musicxml.hammer-on.candidate-dropped',
          'dropped',
          2,
          'Hammer-on start/stop semantics were dropped.',
          propertySourceIds(fixtureId, 'hammer-on-boundary', 2),
        ),
        entry(
          'musicxml.pull-off.candidate-dropped',
          'dropped',
          2,
          'Pull-off start/stop semantics were dropped.',
          propertySourceIds(fixtureId, 'pull-off-boundary', 2),
        ),
        entry(
          'musicxml.natural-harmonic.candidate-dropped',
          'dropped',
          1,
          'The natural harmonic was dropped.',
          propertySourceIds(fixtureId, 'natural-harmonic', 1),
        ),
      ]);
    case 'musicxml-explicit-loss':
      return Object.freeze([
        entry(
          'musicxml.grace-note.native-v1-unsupported',
          'unsupported',
          1,
          'The grace note is unsupported.',
          propertySourceIds(fixtureId, 'grace-note', 1),
        ),
        entry(
          'musicxml.let-ring.candidate-dropped',
          'dropped',
          1,
          'The let-ring mark was dropped.',
          propertySourceIds(fixtureId, 'let-ring', 1),
        ),
        entry(
          'musicxml.palm-mute.candidate-dropped',
          'dropped',
          1,
          'The palm-mute mark was dropped.',
          propertySourceIds(fixtureId, 'palm-mute', 1),
        ),
        entry(
          'musicxml.artificial-harmonic.native-v1-unsupported',
          'unsupported',
          1,
          'The artificial harmonic is unsupported.',
          propertySourceIds(fixtureId, 'artificial-harmonic', 1),
        ),
        entry(
          'musicxml.repeat.expansion-not-implemented',
          'blocking',
          2,
          'Forward/backward repeat expansion is not implemented.',
          propertySourceIds(fixtureId, 'repeat-boundary', 2),
        ),
        entry(
          'musicxml.ending.expansion-not-implemented',
          'blocking',
          2,
          'Alternate-ending expansion is not implemented.',
          propertySourceIds(fixtureId, 'ending-boundary', 2),
        ),
      ]);
    case 'gp8-basic':
      return Object.freeze([
        entry(
          'gp8.basic-events.preserved',
          'preserved',
          4,
          'The four exact GP8 pitch/rhythm/string/fret rows were preserved.',
          propertySourceIds(fixtureId, 'note-row', 4),
        ),
        entry(
          'gp8.roundtrip.unsupported',
          'unsupported',
          1,
          'Non-native round-trip fidelity is unsupported.',
          propertySourceIds(fixtureId, 'non-native-roundtrip', 1),
        ),
      ]);
  }
}

type SourceIdentity = Readonly<{
  byteLength: number;
  fileName: string;
  format: 'guitar-pro' | 'musicxml';
  formatVersion: string;
  mediaType: string;
  sha256Hex: string;
  sourceId: string;
}>;

async function sourceIdentity(
  bytes: Uint8Array<ArrayBuffer>,
  fileName: string,
  definition: FixtureDefinition,
): Promise<SourceIdentity> {
  const digest = await sha256Hex(bytes);
  const sourceIdDigest = await sha256Text(
    JSON.stringify([
      BOUNDED_SCORE_IMPORT_ADAPTER_ID,
      definition.format,
      definition.formatVersion,
      fileName,
      bytes.length,
      digest,
    ]),
  );
  return {
    byteLength: bytes.length,
    fileName,
    format: definition.format,
    formatVersion: definition.formatVersion,
    mediaType:
      definition.format === 'musicxml'
        ? 'application/vnd.recordare.musicxml+xml'
        : 'application/octet-stream',
    sha256Hex: digest,
    sourceId: `score-source-${sourceIdDigest.slice(0, 32)}`,
  };
}

async function operationDigest(input: {
  budget: PracticeImportResourceBudget;
  fileName: string;
  fixtureId: BoundedScoreFixtureId;
  importedAt: string;
  requestedTitle: string | null;
  sourceHash: PracticeImportSourceIdentityHash;
  title: string;
}): Promise<string> {
  return sha256Text(
    JSON.stringify({
      adapterId: BOUNDED_SCORE_IMPORT_ADAPTER_ID,
      adapterVersion: BOUNDED_SCORE_IMPORT_ADAPTER_VERSION,
      budget: input.budget,
      fileName: input.fileName,
      fixtureId: input.fixtureId,
      importedAt: input.importedAt,
      parserVersion: PINNED_ALPHATAB_VERSION,
      requestedTitle: input.requestedTitle,
      sourceHash: input.sourceHash,
      title: input.title,
    }),
  );
}

async function projectedOperationDigest(
  requestDigest: string,
  parsed: PrivateParseResult,
): Promise<string> {
  return sha256Text(
    JSON.stringify({
      parserProjection: parsed,
      projectionPolicy: 'gp8-four-row-oracle-v1',
      requestDigest,
    }),
  );
}

function finalizedRejectedReport(input: {
  budget: PracticeImportResourceBudget;
  definition: FixtureDefinition;
  diagnostics: readonly PracticeImportDiagnostic[];
  fixtureId: BoundedScoreFixtureId;
  importedAt: string;
  noteCount: number;
  operationDigest: string;
  outputEventCount?: number;
  source: SourceIdentity;
  sourceHash: PracticeImportSourceIdentityHash;
  wallClockMs: number;
}): PracticeImportReport {
  const findings = rejectedFixtureFindings(input.fixtureId, input.definition);
  const mustReject = [...findings, ...input.diagnostics].some(
    ({ action }) => action === 'reject-import',
  );
  return PracticeImportReportSchema.parse({
    adapter,
    contractVersion: 1,
    diagnostics: [...input.diagnostics].sort((left, right) => left.code.localeCompare(right.code)),
    direction: 'score-to-draft',
    dispositionCounts: dispositionCounts(findings),
    draftBinding: null,
    finalizedAt: input.importedAt,
    findings,
    highestSeverity: highestSeverity(findings, input.diagnostics),
    outcome: 'rejected',
    reportAction: mustReject ? 'reject-import' : 'choose-supported-format',
    reportId: `score-report-${input.operationDigest.slice(0, 32)}`,
    resources: {
      budget: input.budget,
      usage: {
        outputEventCount: input.outputEventCount ?? 0,
        sourceBytes: input.source.byteLength,
        sourceEventCount: input.noteCount,
        wallClockMs: input.wallClockMs,
      },
    },
    route: input.definition.route,
    source: input.source,
    sourceIdentityHash: input.sourceHash,
    startedAt: input.importedAt,
  });
}

type ProjectedGp8Event = Readonly<{
  durationTicks: number;
  fret: number;
  midi: number;
  stringNumber: number;
  tick: number;
}>;

type PrivateParseResult = Readonly<{
  gp8Events: readonly ProjectedGp8Event[];
  summary: ScoreImportParserSummary;
  tempo: number;
  tuning: readonly number[];
}>;

type AlphaTabModule = typeof import('@coderline/alphatab');

async function loadPrivateParser(): Promise<AlphaTabModule> {
  // Dynamic import is intentional: alphaTab enters the graph only after an exact digest gate.
  return import('@coderline/alphatab');
}

/** This exact-file parser stage is synchronous and must be clock-checked immediately around use. */
function parsePrivately(bytes: Uint8Array, alphaTab: AlphaTabModule): PrivateParseResult {
  const settings = new alphaTab.Settings();
  settings.player.playerMode = alphaTab.PlayerMode.Disabled;
  settings.player.soundFont = null;
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings);
  let noteCount = 0;
  const gp8Events: ProjectedGp8Event[] = [];
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            noteCount += beat.notes.length;
            for (const note of beat.notes) {
              gp8Events.push({
                durationTicks: beat.playbackDuration,
                fret: note.fret,
                midi: note.realValue,
                stringNumber: staff.tuning.length - note.string + 1,
                tick: beat.absolutePlaybackStart,
              });
            }
          }
        }
      }
    }
  }
  const firstStaff = score.tracks[0]?.staves[0];
  return {
    gp8Events,
    summary: Object.freeze({
      masterBarCount: score.masterBars.length,
      noteCount,
      playerEnabled: false,
      soundFont: null,
      title: score.title,
      trackCount: score.tracks.length,
    }),
    tempo: score.tempo,
    tuning: Object.freeze([...(firstStaff?.tuning ?? [64, 59, 55, 50, 45, 40])]),
  };
}

function writtenPitch(midi: number) {
  const names = [
    ['C', 0],
    ['C', 1],
    ['D', 0],
    ['D', 1],
    ['E', 0],
    ['F', 0],
    ['F', 1],
    ['G', 0],
    ['G', 1],
    ['A', 0],
    ['A', 1],
    ['B', 0],
  ] as const;
  const [step, accidental] = names[midi % 12] ?? ['C', 0];
  return { accidental, octave: Math.floor(midi / 12) - 1, step };
}

async function gp8Document(input: {
  importedAt: string;
  operationDigest: string;
  parsed: PrivateParseResult;
  reportId: string;
  sourceHash: PracticeImportSourceIdentityHash;
  sourceSha256: string;
  title: string;
}): Promise<PracticeDocument> {
  const expected: readonly ProjectedGp8Event[] = [
    { durationTicks: 960, fret: 1, midi: 60, stringNumber: 2, tick: 0 },
    { durationTicks: 960, fret: 2, midi: 61, stringNumber: 2, tick: 960 },
    { durationTicks: 960, fret: 3, midi: 62, stringNumber: 2, tick: 1920 },
    { durationTicks: 960, fret: 4, midi: 63, stringNumber: 2, tick: 2880 },
  ];
  if (JSON.stringify(input.parsed.gp8Events) !== JSON.stringify(expected)) {
    throw new Error(
      'Pinned alphaTab GP8 projection does not match the independent four-row oracle.',
    );
  }
  const base = {
    contractVersion: 1 as const,
    durationTicks: 3840,
    expectedProjectionHash: placeholderHash('practice-expected-events'),
    guitar: {
      capoFret: 0,
      handedness: 'right' as const,
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: '12-tet' as const,
      tuning: input.parsed.tuning.map((openMidi, index) => ({ openMidi, stringNumber: index + 1 })),
    },
    importProvenance: {
      ...adapter,
      importReportId: input.reportId,
      sourceFormat: 'guitar-pro',
      sourceHash: input.sourceHash,
    },
    keyMap: [{ fifths: 0, mode: 'major' as const, tick: 0 }],
    loopPresets: [],
    metadata: { createdAt: input.importedAt, title: input.title, updatedAt: input.importedAt },
    meterMap: [{ denominator: 4, grouping: [4], numerator: 4, tick: 0 }],
    ppq: 960 as const,
    revision: {
      contentHash: placeholderHash('practice-document-content'),
      documentId: `gp8-document-${input.operationDigest.slice(0, 32)}`,
      revisionId: `gp8-revision-${input.operationDigest.slice(0, 32)}`,
      revisionNumber: 1,
    },
    tempoMap: [{ microsecondsPerQuarter: Math.round(60_000_000 / input.parsed.tempo), tick: 0 }],
    tracks: [
      {
        id: `gp8-track-${input.sourceSha256.slice(0, 24)}`,
        name: 'GP8 basic fixture',
        voices: [
          {
            events: expected.map((event, index) => ({
              articulations: [],
              id: `gp8-event-${String(index)}`,
              kind: 'guitar-event' as const,
              notatedDurationTicks: event.durationTicks,
              notes: [
                {
                  id: `gp8-note-${String(index)}`,
                  position: { stringNumber: event.stringNumber, tabFret: event.fret },
                  semantics: [],
                  soundingDurationTicks: event.durationTicks,
                  writtenPitch: writtenPitch(event.midi),
                },
              ],
              tick: event.tick,
            })),
            id: `gp8-voice-${input.sourceSha256.slice(0, 24)}`,
          },
        ],
      },
    ],
  };
  const [contentHash, expectedHash] = await Promise.all([
    hashPracticeDocumentContent(base),
    hashExpectedEvents(base),
  ]);
  base.revision.contentHash = contentHash;
  base.expectedProjectionHash = expectedHash;
  return PracticeDocumentSchema.parse(base);
}

function cancelledResult(): BoundedScoreImportResult {
  return Object.freeze({
    currentDocumentPreserved: true,
    direction: 'score-to-draft',
    draft: null,
    parserInvoked: false,
    parserSummary: null,
    report: null,
    semanticDispositions: Object.freeze([
      Object.freeze({
        affectedCount: 1,
        detail: 'Import was cancelled before commit; the current document is unchanged.',
        disposition: 'blocking' as const,
        id: 'score.import.cancelled',
      }),
    ]),
    status: 'cancelled',
  });
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** Exact-fixture, lazy alphaTab import boundary. Third-party Score objects never escape this call. */
export async function importBoundedScore(
  request: BoundedScoreImportRequest,
): Promise<BoundedScoreImportResult> {
  const monotonicStartedAt = clockNow(request.clock);
  if (isAborted(request.signal)) return cancelledResult();
  const definition = BOUNDED_SCORE_IMPORT_FIXTURES[request.fixtureId];
  const budget = normalizeBudget(request.resourceBudget);
  if (request.bytes.byteLength > budget.maximumSourceBytes) {
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: false,
      parserSummary: null,
      report: null,
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: `Source has ${String(request.bytes.byteLength)} bytes; limit is ${String(budget.maximumSourceBytes)}. No source snapshot or digest was created.`,
          disposition: 'blocking' as const,
          id: 'score.resource.source-bytes.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  // This is the only private source snapshot. Every later length, digest, gate, and parser read uses it.
  const bytes = new Uint8Array(request.bytes);
  const fileName = request.fileName;
  const importedAt = request.importedAt;
  const title = request.title ?? fileName.replace(/\.[^.]+$/u, '');
  const source = await sourceIdentity(bytes, fileName, definition);
  const sourceHash = PracticeImportSourceIdentityHashSchema.parse(
    await hashPracticeImportSourceIdentity(source),
  );
  const importOperationDigest = await operationDigest({
    budget,
    fileName,
    fixtureId: request.fixtureId,
    importedAt,
    requestedTitle: request.title ?? null,
    sourceHash,
    title,
  });
  if (isAborted(request.signal)) return cancelledResult();
  const identityElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (identityElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `Source identity stage took ${String(identityElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: false,
      parserSummary: null,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: 0,
        operationDigest: importOperationDigest,
        source,
        sourceHash,
        wallClockMs: identityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.resource.wall-clock.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  if (source.sha256Hex !== definition.sha256Hex) {
    const failure = diagnostic(
      'import.source.security-rejected',
      1,
      'Source digest does not match the exact fixture approved for this bounded route.',
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: false,
      parserSummary: null,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: 0,
        operationDigest: importOperationDigest,
        source,
        sourceHash,
        wallClockMs: identityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.fixture-identity.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }

  let parsed: PrivateParseResult;
  let parserInvoked = false;
  try {
    const alphaTab = await loadPrivateParser();
    if (isAborted(request.signal)) return cancelledResult();
    const beforeParserElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
    if (beforeParserElapsedMs > budget.maximumWallClockMs) {
      const failure = diagnostic(
        'import.resource.wall-clock-exceeded',
        1,
        `Elapsed time before the synchronous exact-fixture parser stage was ${String(beforeParserElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms. The parser was not invoked.`,
      );
      return Object.freeze({
        currentDocumentPreserved: true,
        direction: 'score-to-draft',
        draft: null,
        parserInvoked: false,
        parserSummary: null,
        report: finalizedRejectedReport({
          budget,
          definition,
          diagnostics: [failure],
          fixtureId: request.fixtureId,
          importedAt,
          noteCount: 0,
          operationDigest: importOperationDigest,
          source,
          sourceHash,
          wallClockMs: beforeParserElapsedMs,
        }),
        semanticDispositions: Object.freeze([
          Object.freeze({
            affectedCount: 1,
            detail: failure.detail,
            disposition: 'blocking' as const,
            id: 'score.parser.pre-stage-wall-clock.blocking',
          }),
        ]),
        status: 'rejected',
      });
    }
    if (isAborted(request.signal)) return cancelledResult();
    parserInvoked = true;
    parsed = parsePrivately(bytes, alphaTab);
  } catch (error) {
    const parserElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
    const detail =
      error instanceof Error ? error.message.slice(0, 400) : 'Pinned parser rejected the source.';
    const failure =
      parserElapsedMs > budget.maximumWallClockMs
        ? diagnostic(
            'import.resource.wall-clock-exceeded',
            1,
            `Synchronous exact-fixture parser stage took ${String(parserElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
          )
        : diagnostic('import.source.malformed', 1, detail || 'Pinned parser rejected the source.');
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked,
      parserSummary: null,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: 0,
        operationDigest: importOperationDigest,
        source,
        sourceHash,
        wallClockMs: parserElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.parser.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  const parserElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (isAborted(request.signal)) {
    return Object.freeze({
      ...cancelledResult(),
      parserInvoked: true,
      parserSummary: parsed.summary,
    });
  }
  if (parserElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `Synchronous exact-fixture parser stage took ${String(parserElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: importOperationDigest,
        source,
        sourceHash,
        wallClockMs: parserElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.parser.wall-clock.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  const projectedImportOperationDigest = await projectedOperationDigest(
    importOperationDigest,
    parsed,
  );
  const projectionIdentityElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (
    projectionIdentityElapsedMs > budget.maximumWallClockMs &&
    definition.route !== 'gp8-basic-fixture-v1'
  ) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `Parser projection identity stage took ${String(projectionIdentityElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        source,
        sourceHash,
        wallClockMs: projectionIdentityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.projection-identity.wall-clock.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  if (
    parsed.summary.noteCount > budget.maximumSourceEvents &&
    definition.route !== 'gp8-basic-fixture-v1'
  ) {
    const failure = diagnostic(
      'import.resource.source-events-exceeded',
      parsed.summary.noteCount,
      `Parsed source note count ${String(parsed.summary.noteCount)} exceeds limit ${String(budget.maximumSourceEvents)}.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        source,
        sourceHash,
        wallClockMs: projectionIdentityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: parsed.summary.noteCount,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.source-events.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  if (parsed.summary.noteCount !== definition.expectedNoteCount) {
    const failure = diagnostic(
      'import.source.malformed',
      1,
      `Pinned parser produced ${String(parsed.summary.noteCount)} notes; oracle requires ${String(definition.expectedNoteCount)}.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        source,
        sourceHash,
        wallClockMs: projectionIdentityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.oracle-mismatch.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  if (definition.route !== 'gp8-basic-fixture-v1') {
    const report = finalizedRejectedReport({
      budget,
      definition,
      diagnostics: [],
      fixtureId: request.fixtureId,
      importedAt,
      noteCount: parsed.summary.noteCount,
      operationDigest: projectedImportOperationDigest,
      source,
      sourceHash,
      wallClockMs: projectionIdentityElapsedMs,
    });
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report,
      semanticDispositions: fixtureSemanticDispositions(
        request.fixtureId,
        parsed.summary.noteCount,
      ),
      status: 'rejected',
    });
  }

  const gp8OutputEventCount = 4;
  const sourceEventsExceeded = parsed.summary.noteCount > budget.maximumSourceEvents;
  const outputExceeded = gp8OutputEventCount > budget.maximumOutputEvents;
  const elapsedExceeded = projectionIdentityElapsedMs > budget.maximumWallClockMs;
  if (sourceEventsExceeded || outputExceeded || elapsedExceeded) {
    // Candidate resource checks are exhaustive and ordered: output, source, then elapsed time.
    const failures = [
      ...(outputExceeded
        ? [
            diagnostic(
              'import.resource.output-events-exceeded',
              gp8OutputEventCount,
              `GP8 candidate event count ${String(gp8OutputEventCount)} exceeds limit ${String(budget.maximumOutputEvents)}.`,
            ),
          ]
        : []),
      ...(sourceEventsExceeded
        ? [
            diagnostic(
              'import.resource.source-events-exceeded',
              parsed.summary.noteCount,
              `Parsed source note count ${String(parsed.summary.noteCount)} exceeds limit ${String(budget.maximumSourceEvents)}.`,
            ),
          ]
        : []),
      ...(elapsedExceeded
        ? [
            diagnostic(
              'import.resource.wall-clock-exceeded',
              1,
              `GP8 candidate resource evaluation took ${String(projectionIdentityElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
            ),
          ]
        : []),
    ];
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: failures,
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        outputEventCount: gp8OutputEventCount,
        source,
        sourceHash,
        wallClockMs: projectionIdentityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        ...(outputExceeded
          ? [
              Object.freeze({
                affectedCount: gp8OutputEventCount,
                detail: failures[0]?.detail ?? 'GP8 candidate output event limit exceeded.',
                disposition: 'blocking' as const,
                id: 'score.output-events.blocking',
              }),
            ]
          : []),
        ...(sourceEventsExceeded
          ? [
              Object.freeze({
                affectedCount: parsed.summary.noteCount,
                detail:
                  failures[outputExceeded ? 1 : 0]?.detail ??
                  'GP8 parsed source event limit exceeded.',
                disposition: 'blocking' as const,
                id: 'score.source-events.blocking',
              }),
            ]
          : []),
        ...(elapsedExceeded
          ? [
              Object.freeze({
                affectedCount: 1,
                detail:
                  failures[failures.length - 1]?.detail ??
                  'GP8 candidate elapsed-time limit exceeded.',
                disposition: 'blocking' as const,
                id: 'score.candidate.wall-clock.blocking',
              }),
            ]
          : []),
      ]),
      status: 'rejected',
    });
  }

  const reportId = `score-report-${projectedImportOperationDigest.slice(0, 32)}`;
  const draftId = `score-draft-${projectedImportOperationDigest.slice(0, 32)}`;
  let document: PracticeDocument;
  try {
    document = await gp8Document({
      importedAt,
      operationDigest: projectedImportOperationDigest,
      parsed,
      reportId,
      sourceHash,
      sourceSha256: source.sha256Hex,
      title,
    });
  } catch (error) {
    const failure = diagnostic(
      'import.source.malformed',
      1,
      error instanceof Error ? error.message : 'GP8 projection failed its independent oracle.',
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        source,
        sourceHash,
        wallClockMs: elapsedMilliseconds(request.clock, monotonicStartedAt),
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'gp8.oracle.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  if (isAborted(request.signal)) {
    return Object.freeze({
      ...cancelledResult(),
      parserInvoked: true,
      parserSummary: parsed.summary,
    });
  }
  const documentElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (documentElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `GP8 projection stage took ${String(documentElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        outputEventCount: 4,
        source,
        sourceHash,
        wallClockMs: documentElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.projection.wall-clock.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  const findings = [
    routeFinding(request.fixtureId, definition),
    createPracticeImportFinding('import.non-native.lossless-roundtrip-unavailable', {
      affectedCount: 1,
      detail: 'Native StringSight remains the only lossless editable round trip.',
      sourceEventIds: propertySourceIds(request.fixtureId, 'non-native-roundtrip', 1),
    }),
  ].sort((left, right) => left.code.localeCompare(right.code));
  const buildBundle = (wallClockMs: number) => {
    const resources = {
      budget,
      usage: {
        outputEventCount: 4,
        sourceBytes: source.byteLength,
        sourceEventCount: parsed.summary.noteCount,
        wallClockMs,
      },
    };
    const draft: PracticeImportDraft = {
      adapter,
      candidateDocument: document,
      candidateDocumentContentHash: document.revision.contentHash,
      contractVersion: 1,
      createdAt: importedAt,
      direction: 'score-to-draft',
      draftId,
      reportId,
      resources,
      route: definition.route,
      source,
      sourceIdentityHash: sourceHash,
    };
    const report = PracticeImportReportSchema.parse({
      adapter,
      contractVersion: 1,
      diagnostics: [],
      direction: 'score-to-draft',
      dispositionCounts: dispositionCounts(findings),
      draftBinding: { candidateDocumentContentHash: document.revision.contentHash, draftId },
      finalizedAt: importedAt,
      findings,
      highestSeverity: highestSeverity(findings, []),
      outcome: 'reviewable',
      reportAction: 'review-losses',
      reportId,
      resources,
      route: definition.route,
      source,
      sourceIdentityHash: sourceHash,
      startedAt: importedAt,
    });
    return PracticeImportReviewBundleSchema.parse({ bundleVersion: 1, draft, report });
  };
  const provisionalBundle = buildBundle(documentElapsedMs);
  await verifyPracticeImportReviewBundle(provisionalBundle);
  if (isAborted(request.signal)) {
    return Object.freeze({
      ...cancelledResult(),
      parserInvoked: true,
      parserSummary: parsed.summary,
    });
  }
  const finalElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (finalElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `Import finalization took ${String(finalElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return Object.freeze({
      currentDocumentPreserved: true,
      direction: 'score-to-draft',
      draft: null,
      parserInvoked: true,
      parserSummary: parsed.summary,
      report: finalizedRejectedReport({
        budget,
        definition,
        diagnostics: [failure],
        fixtureId: request.fixtureId,
        importedAt,
        noteCount: parsed.summary.noteCount,
        operationDigest: projectedImportOperationDigest,
        outputEventCount: 4,
        source,
        sourceHash,
        wallClockMs: finalElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        Object.freeze({
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking' as const,
          id: 'score.finalization.wall-clock.blocking',
        }),
      ]),
      status: 'rejected',
    });
  }
  const bundle = buildBundle(finalElapsedMs);
  return Object.freeze({
    currentDocumentPreserved: true,
    direction: 'score-to-draft',
    draft: bundle.draft,
    parserInvoked: true,
    parserSummary: parsed.summary,
    report: bundle.report,
    semanticDispositions: fixtureSemanticDispositions('gp8-basic', parsed.summary.noteCount),
    status: 'reviewable',
  });
}
