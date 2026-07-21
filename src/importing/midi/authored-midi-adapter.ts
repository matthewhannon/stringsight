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
} from '../../shared/contracts/practice-support';
import {
  hashExpectedEvents,
  hashPracticeDocumentContent,
  hashPracticeImportSourceIdentity,
} from '../../shared/practice-identity';
import { verifyPracticeImportReviewBundle } from '../../shared/practice-import-integrity';
import {
  SMF_PREFLIGHT_DEFAULT_LIMITS,
  SmfPreflightError,
  preflightSmf,
  type SmfPreflightInventory,
  type SmfPreflightLimits,
  type SmfRawEvent,
} from './smf-preflight';

export const AUTHORED_MIDI_IMPORT_ADAPTER_ID = 'stringsight-authored-midi-import';
export const AUTHORED_MIDI_IMPORT_ADAPTER_VERSION = '1.0.0';
export const AUTHORED_MIDI_EXPORT_PURPOSE = 'authored-document-midi-export-v1';
export const AUTHORED_MIDI_TARGET_PPQ = 480;

/** Exact decoded-byte digest of the independently hand-authored, 142-byte Type-1 fixture. */
export const DECLARED_TYPE1_FIXTURE_SHA256 =
  'ba7da50f494ec24c28e446df5ef6d997433b8eb5545b5457922694e727d9835d';

export const AUTHORED_MIDI_ADAPTER_CAPABILITIES = Object.freeze({
  authoredDocumentExport: Object.freeze({
    advertised: true,
    canonicalPpq: 960,
    direction: 'authored-document-to-smf' as const,
    evidence: 'three-960-to-480-ppq-fixtures' as const,
    format: 'SMF Type 1' as const,
    targetPpq: AUTHORED_MIDI_TARGET_PPQ,
  }),
  declaredFixtureImport: Object.freeze({
    advertised: true,
    direction: 'performance-to-draft' as const,
    fixtureSha256Hex: Object.freeze([DECLARED_TYPE1_FIXTURE_SHA256]),
    format: 'SMF Type 1' as const,
    route: 'smf-type1-declared-fixtures-v1' as const,
  }),
  handlesObservedSessionMidiExport: false,
} as const);

const DEFAULT_IMPORT_BUDGET = Object.freeze({
  maximumOutputEvents: 2_000,
  maximumSourceBytes: SMF_PREFLIGHT_DEFAULT_LIMITS.maximumBytes,
  maximumSourceEvents: SMF_PREFLIGHT_DEFAULT_LIMITS.maximumEvents,
  maximumWallClockMs: 30_000,
} as const satisfies PracticeImportResourceBudget);

const STANDARD_GUITAR = Object.freeze({
  capoFret: 0,
  handedness: 'right' as const,
  maxPhysicalFret: 24,
  scaleLengthMm: 648,
  temperament: '12-tet' as const,
  tuning: Object.freeze([
    Object.freeze({ openMidi: 64, stringNumber: 1 }),
    Object.freeze({ openMidi: 59, stringNumber: 2 }),
    Object.freeze({ openMidi: 55, stringNumber: 3 }),
    Object.freeze({ openMidi: 50, stringNumber: 4 }),
    Object.freeze({ openMidi: 45, stringNumber: 5 }),
    Object.freeze({ openMidi: 40, stringNumber: 6 }),
  ]),
});

type SemanticDisposition = Readonly<{
  affectedCount: number;
  detail: string;
  disposition: PracticeImportDisposition;
  id: string;
  sourceEventIds?: readonly string[];
}>;

export type ImportMonotonicClock = Readonly<{ now(): number }>;

export type AuthoredMidiImportRequest = Readonly<{
  bytes: Uint8Array;
  clock?: ImportMonotonicClock;
  fileName: string;
  importedAt: string;
  resourceBudget?: Partial<PracticeImportResourceBudget>;
  title?: string;
}>;

export type AuthoredMidiImportResult = Readonly<{
  direction: 'performance-to-draft';
  draft: PracticeImportDraft | null;
  preflight: SmfPreflightInventory | null;
  report: PracticeImportReport | null;
  semanticDispositions: readonly SemanticDisposition[];
}>;

export type AuthoredMidiExportRequest = Readonly<{
  document: PracticeDocument;
  maximumBytes?: number;
  maximumEvents?: number;
  purpose: typeof AUTHORED_MIDI_EXPORT_PURPOSE;
}>;

export type AuthoredMidiExportResult = Readonly<{
  bytes: Uint8Array;
  direction: 'authored-document-to-smf';
  format: 'SMF Type 1';
  preflight: SmfPreflightInventory;
  purpose: typeof AUTHORED_MIDI_EXPORT_PURPOSE;
  semanticDispositions: readonly SemanticDisposition[];
  targetPpq: typeof AUTHORED_MIDI_TARGET_PPQ;
}>;

const adapter = Object.freeze({
  adapterId: AUTHORED_MIDI_IMPORT_ADAPTER_ID,
  adapterVersion: AUTHORED_MIDI_IMPORT_ADAPTER_VERSION,
});

function placeholderHash(
  schemaId: 'practice-document',
  projectionId: 'practice-document-content' | 'practice-expected-events',
): QualifiedHash {
  return {
    algorithm: 'sha256',
    canonicalizationId: 'stringsight-canonical-json',
    canonicalizationVersion: 1,
    digestHex: '0'.repeat(64),
    projectionId,
    projectionVersion: 1,
    schemaId,
    schemaVersion: 1,
  };
}

function normalizeBudget(input: Partial<PracticeImportResourceBudget> | undefined) {
  const budget = { ...DEFAULT_IMPORT_BUDGET, ...input };
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

function formatVersionFromBytes(bytes: Uint8Array): 'SMF Type 0' | 'SMF Type 1' | 'SMF Type 2' {
  if (bytes.length >= 10 && bytes[8] === 0 && bytes[9] === 0) return 'SMF Type 0';
  if (bytes.length >= 10 && bytes[8] === 0 && bytes[9] === 2) return 'SMF Type 2';
  return 'SMF Type 1';
}

function resourceLimits(budget: PracticeImportResourceBudget): Partial<SmfPreflightLimits> {
  return {
    maximumBytes: budget.maximumSourceBytes,
    maximumEvents: budget.maximumSourceEvents,
  };
}

function diagnostic(
  code: PracticeImportDiagnosticCode,
  affectedCount: number,
  detail: string,
  sourceLocation?: string,
): PracticeImportDiagnostic {
  return {
    ...PRACTICE_IMPORT_DIAGNOSTIC_BY_ID[code],
    affectedCount,
    detail,
    ...(sourceLocation === undefined ? {} : { sourceLocation }),
  };
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

function findingSeverity(
  findings: readonly PracticeImportFinding[],
  diagnostics: readonly PracticeImportDiagnostic[],
) {
  const rank = { blocking: 3, error: 2, info: 0, warning: 1 } as const;
  return [...findings, ...diagnostics].reduce<'blocking' | 'error' | 'info' | 'warning'>(
    (highest, entry) => (rank[entry.severity] > rank[highest] ? entry.severity : highest),
    'info',
  );
}

type SourceIdentity = Readonly<{
  byteLength: number;
  fileName: string;
  format: 'smf';
  formatVersion: 'SMF Type 0' | 'SMF Type 1' | 'SMF Type 2';
  mediaType: 'audio/midi';
  sha256Hex: string;
  sourceId: string;
}>;

async function sourceIdentity(
  bytes: Uint8Array<ArrayBuffer>,
  fileName: string,
): Promise<SourceIdentity> {
  const digest = await sha256Hex(bytes);
  const sourceIdDigest = await sha256Text(
    JSON.stringify([
      AUTHORED_MIDI_IMPORT_ADAPTER_ID,
      fileName,
      bytes.length,
      formatVersionFromBytes(bytes),
      digest,
    ]),
  );
  return {
    byteLength: bytes.length,
    fileName,
    format: 'smf',
    formatVersion: formatVersionFromBytes(bytes),
    mediaType: 'audio/midi',
    sha256Hex: digest,
    sourceId: `smf-source-${sourceIdDigest.slice(0, 32)}`,
  };
}

async function operationDigest(input: {
  budget: PracticeImportResourceBudget;
  fileName: string;
  importedAt: string;
  requestedTitle: string | null;
  sourceHash: PracticeImportSourceIdentityHash;
  title: string;
}): Promise<string> {
  return sha256Text(
    JSON.stringify({
      adapterId: AUTHORED_MIDI_IMPORT_ADAPTER_ID,
      adapterVersion: AUTHORED_MIDI_IMPORT_ADAPTER_VERSION,
      budget: input.budget,
      fileName: input.fileName,
      importedAt: input.importedAt,
      requestedTitle: input.requestedTitle,
      sourceHash: input.sourceHash,
      title: input.title,
    }),
  );
}

async function projectedOperationDigest(
  requestDigest: string,
  inventory: SmfPreflightInventory,
): Promise<string> {
  return sha256Text(
    JSON.stringify({
      parserProjection: inventory,
      projectionPolicy: 'declared-smf-to-canonical-960-v1',
      requestDigest,
    }),
  );
}

function rejectedReport(input: {
  budget: PracticeImportResourceBudget;
  diagnostics: readonly PracticeImportDiagnostic[];
  importedAt: string;
  operationDigest: string;
  outputEventCount?: number;
  preflight: SmfPreflightInventory | null;
  source: SourceIdentity;
  sourceHash: PracticeImportSourceIdentityHash;
  wallClockMs: number;
}): PracticeImportReport {
  const broad =
    input.diagnostics.length === 0 ||
    input.preflight?.format !== 1 ||
    input.preflight.timeDivision.kind !== 'ppq' ||
    input.source.sha256Hex !== DECLARED_TYPE1_FIXTURE_SHA256;
  const route = broad ? 'smf-broad-v1' : 'smf-type1-declared-fixtures-v1';
  const findings = [
    createPracticeImportFinding(
      broad ? 'import.smf.guitar-semantics.unsupported' : 'import.smf.type1.fixture-explicit-loss',
      {
        affectedCount: 1,
        detail: broad
          ? 'This SMF is outside the exact declared fixture profile; no guitar or notation fidelity is claimed.'
          : 'The declared fixture could not produce a draft because a finalized resource or integrity check rejected it.',
        sourceEventIds: [input.source.sourceId],
      },
    ),
  ];
  const resources = {
    budget: input.budget,
    usage: {
      outputEventCount: input.outputEventCount ?? 0,
      sourceBytes: input.source.byteLength,
      sourceEventCount:
        input.preflight?.events.length ??
        Math.max(0, ...input.diagnostics.map((entry) => entry.affectedCount)),
      wallClockMs: input.wallClockMs,
    },
  };
  const hasRejectDiagnostic = input.diagnostics.some(({ action }) => action === 'reject-import');
  return PracticeImportReportSchema.parse({
    adapter,
    contractVersion: 1,
    diagnostics: [...input.diagnostics].sort((left, right) => left.code.localeCompare(right.code)),
    direction: 'performance-to-draft',
    dispositionCounts: dispositionCounts(findings),
    draftBinding: null,
    finalizedAt: input.importedAt,
    findings,
    highestSeverity: findingSeverity(findings, input.diagnostics),
    outcome: 'rejected',
    reportAction: hasRejectDiagnostic ? 'reject-import' : 'choose-supported-format',
    reportId: `smf-report-${input.operationDigest.slice(0, 32)}`,
    resources,
    route,
    source: input.source,
    sourceIdentityHash: input.sourceHash,
    startedAt: input.importedAt,
  });
}

function preflightFailureDiagnostic(error: SmfPreflightError): PracticeImportDiagnostic {
  const location = `byte ${String(error.byteOffset)}${error.trackIndex === null ? '' : `, track ${String(error.trackIndex)}`}`;
  switch (error.code) {
    case 'byte-limit-exceeded':
      return diagnostic('import.resource.source-bytes-exceeded', 1, error.message, location);
    case 'event-limit-exceeded':
      return diagnostic(
        'import.resource.source-events-exceeded',
        Math.max(1, error.eventCount),
        error.message,
        location,
      );
    case 'track-byte-limit-exceeded':
    case 'track-count-limit-exceeded':
      return diagnostic('import.source.security-rejected', 1, error.message, location);
    default:
      return diagnostic('import.source.malformed', 1, error.message, location);
  }
}

type NoteInterval = Readonly<{
  endEventId: string;
  endTick: number;
  midi: number;
  startEventId: string;
  startTick: number;
  velocity: number;
}>;

function extractNoteIntervals(events: readonly SmfRawEvent[]): NoteInterval[] {
  const active = new Map<string, SmfRawEvent[]>();
  const intervals: NoteInterval[] = [];
  for (const event of events) {
    if (event.channel === null || (event.kind !== 'note-on' && event.kind !== 'note-off')) continue;
    const midi = event.data[0];
    const velocity = event.data[1];
    if (midi === undefined || velocity === undefined) continue;
    const key = `${String(event.trackIndex)}:${String(event.channel)}:${String(midi)}`;
    const isStart = event.kind === 'note-on' && velocity > 0;
    if (isStart) {
      const queue = active.get(key) ?? [];
      queue.push(event);
      active.set(key, queue);
      continue;
    }
    const queue = active.get(key);
    const start = queue?.shift();
    if (start === undefined || event.absoluteTick <= start.absoluteTick) continue;
    intervals.push({
      endEventId: event.eventId,
      endTick: event.absoluteTick,
      midi,
      startEventId: start.eventId,
      startTick: start.absoluteTick,
      velocity: start.data[1] ?? 0,
    });
  }
  return intervals.sort(
    (left, right) => left.startTick - right.startTick || left.midi - right.midi,
  );
}

function guitarPosition(midi: number) {
  const candidates = STANDARD_GUITAR.tuning.flatMap(({ openMidi, stringNumber }) => {
    const tabFret = midi - openMidi;
    return tabFret >= 0 && tabFret <= STANDARD_GUITAR.maxPhysicalFret
      ? [{ stringNumber, tabFret }]
      : [];
  });
  candidates.sort(
    (left, right) => left.tabFret - right.tabFret || left.stringNumber - right.stringNumber,
  );
  return candidates[0] ?? null;
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

function sourceToCanonicalTick(tick: number, sourcePpq: number): number {
  const numerator = tick * 960;
  if (!Number.isSafeInteger(numerator) || numerator % sourcePpq !== 0) {
    throw new RangeError('Declared SMF fixture contains a non-integral canonical tick mapping.');
  }
  return numerator / sourcePpq;
}

function metaValue(event: SmfRawEvent): number {
  return event.data.reduce((value, byte) => value * 256 + byte, 0);
}

async function candidateDocument(input: {
  importedAt: string;
  inventory: SmfPreflightInventory;
  operationDigest: string;
  reportId: string;
  sourceHash: PracticeImportSourceIdentityHash;
  sourceSha256: string;
  title: string;
}): Promise<PracticeDocument> {
  if (input.inventory.timeDivision.kind !== 'ppq') throw new Error('PPQ inventory required.');
  const ppq = input.inventory.timeDivision.ticksPerQuarter;
  const intervals = extractNoteIntervals(input.inventory.events);
  const guitarIntervals = intervals.map((interval) => ({
    interval,
    position: guitarPosition(interval.midi),
  }));
  if (guitarIntervals.some(({ position }) => position === null)) {
    throw new RangeError('Declared fixture contains a pitch outside the bounded standard guitar.');
  }
  const tempoEntries = input.inventory.events
    .filter((event) => event.kind === 'tempo')
    .map((event) => ({
      microsecondsPerQuarter: metaValue(event),
      tick: sourceToCanonicalTick(event.absoluteTick, ppq),
    }));
  const meterEntries = input.inventory.events
    .filter((event) => event.kind === 'time-signature')
    .map((event) => ({
      denominator: 2 ** (event.data[1] ?? 2),
      grouping: [event.data[0] ?? 4],
      numerator: event.data[0] ?? 4,
      tick: sourceToCanonicalTick(event.absoluteTick, ppq),
    }));
  const keyEntries = input.inventory.events
    .filter((event) => event.kind === 'key-signature')
    .map((event) => ({
      fifths: (event.data[0] ?? 0) > 127 ? (event.data[0] ?? 0) - 256 : (event.data[0] ?? 0),
      mode: (event.data[1] ?? 0) === 1 ? ('minor' as const) : ('major' as const),
      tick: sourceToCanonicalTick(event.absoluteTick, ppq),
    }));
  const endTick = Math.max(
    1,
    ...input.inventory.tracks.map((track) => sourceToCanonicalTick(track.endTick, ppq)),
    ...guitarIntervals.map(({ interval }) => sourceToCanonicalTick(interval.endTick, ppq)),
  );
  const ensureInitial = <T extends { tick: number }>(entries: T[], fallback: T): T[] =>
    entries[0]?.tick === 0 ? entries : [fallback, ...entries];
  const base = {
    contractVersion: 1 as const,
    durationTicks: endTick,
    expectedProjectionHash: placeholderHash('practice-document', 'practice-expected-events'),
    guitar: STANDARD_GUITAR,
    importProvenance: {
      ...adapter,
      importReportId: input.reportId,
      sourceFormat: 'smf',
      sourceHash: input.sourceHash,
    },
    keyMap: ensureInitial(keyEntries, { fifths: 0, mode: 'major' as const, tick: 0 }),
    loopPresets: [],
    metadata: { createdAt: input.importedAt, title: input.title, updatedAt: input.importedAt },
    meterMap: ensureInitial(meterEntries, {
      denominator: 4,
      grouping: [4],
      numerator: 4,
      tick: 0,
    }),
    ppq: 960 as const,
    revision: {
      contentHash: placeholderHash('practice-document', 'practice-document-content'),
      documentId: `smf-document-${input.operationDigest.slice(0, 32)}`,
      revisionId: `smf-revision-${input.operationDigest.slice(0, 32)}`,
      revisionNumber: 1,
    },
    tempoMap: ensureInitial(tempoEntries, { microsecondsPerQuarter: 500_000, tick: 0 }),
    tracks: [
      {
        id: `smf-track-${input.sourceSha256.slice(0, 24)}`,
        name: 'Imported MIDI (guitar positions require review)',
        voices: [
          {
            events: guitarIntervals.map(({ interval, position }, index) => {
              if (position === null) throw new Error('Position was checked above.');
              const tick = sourceToCanonicalTick(interval.startTick, ppq);
              const duration = sourceToCanonicalTick(interval.endTick - interval.startTick, ppq);
              return {
                articulations: [],
                id: `smf-event-${String(index)}-${input.sourceSha256.slice(0, 12)}`,
                kind: 'guitar-event' as const,
                notatedDurationTicks: duration,
                notes: [
                  {
                    id: `smf-note-${String(index)}-${input.sourceSha256.slice(0, 12)}`,
                    position,
                    semantics: [],
                    soundingDurationTicks: duration,
                    writtenPitch: writtenPitch(interval.midi),
                  },
                ],
                tick,
              };
            }),
            id: `smf-voice-${input.sourceSha256.slice(0, 24)}`,
          },
        ],
      },
    ],
  };
  const [contentHash, expectedProjectionHash] = await Promise.all([
    hashPracticeDocumentContent(base),
    hashExpectedEvents(base),
  ]);
  base.revision.contentHash = contentHash;
  base.expectedProjectionHash = expectedProjectionHash;
  return PracticeDocumentSchema.parse(base);
}

function importSemanticDispositions(
  inventory: SmfPreflightInventory,
): readonly SemanticDisposition[] {
  const notes = extractNoteIntervals(inventory.events);
  const matchedNoteEventIds = new Set(
    notes.flatMap(({ endEventId, startEventId }) => [startEventId, endEventId]),
  );
  const unmatchedNotes = inventory.events.filter(
    ({ eventId, kind }) =>
      (kind === 'note-on' || kind === 'note-off') && !matchedNoteEventIds.has(eventId),
  );
  const conductor = inventory.events.filter(({ kind }) =>
    ['key-signature', 'tempo', 'time-signature'].includes(kind),
  );
  const structure = inventory.events.filter(({ kind }) => kind === 'end-of-track');
  const controllers = inventory.events.filter(({ kind }) => kind === 'controller');
  const programs = inventory.events.filter(({ kind }) => kind === 'program-change');
  const bends = inventory.events.filter(({ kind }) => kind === 'pitch-bend');
  const unsupported = inventory.events.filter(({ disposition }) => disposition === 'unsupported');
  const preserved = inventory.events.filter(({ disposition }) => disposition === 'preserved');
  const aftertouch = inventory.events.filter(({ kind }) =>
    ['channel-aftertouch', 'poly-aftertouch'].includes(kind),
  );
  return Object.freeze([
    {
      affectedCount: 1,
      detail: 'SMF Type 1 structure and PPQ division passed raw byte preflight.',
      disposition: 'preserved',
      id: 'smf.structure.preserved',
    },
    {
      affectedCount: notes.length,
      detail: 'Matched note-on/off intervals were converted to canonical 960 PPQ timing.',
      disposition: 'converted',
      id: 'smf.note-intervals.converted',
      sourceEventIds: notes.flatMap(({ endEventId, startEventId }) => [startEventId, endEventId]),
    },
    {
      affectedCount: unmatchedNotes.length,
      detail: 'Unmatched note-on/off messages cannot form bounded note intervals and were dropped.',
      disposition: 'dropped',
      id: 'smf.unmatched-note-messages.dropped',
      sourceEventIds: unmatchedNotes.map(({ eventId }) => eventId),
    },
    {
      affectedCount: notes.length,
      detail: 'Source note-on velocities are not represented by the canonical v1 document.',
      disposition: 'dropped',
      id: 'smf.note-velocity.dropped',
      sourceEventIds: notes.map(({ startEventId }) => startEventId),
    },
    {
      affectedCount: conductor.length,
      detail: 'Tempo, meter, and key events were converted into canonical 960 PPQ maps.',
      disposition: 'converted',
      id: 'smf.conductor-events.converted',
      sourceEventIds: conductor.map(({ eventId }) => eventId),
    },
    {
      affectedCount: structure.length,
      detail: 'Track end markers were consumed as preserved SMF structure.',
      disposition: 'preserved',
      id: 'smf.end-of-track.preserved',
      sourceEventIds: structure.map(({ eventId }) => eventId),
    },
    {
      affectedCount: controllers.length,
      detail: 'MIDI controller messages are not stored in the canonical document.',
      disposition: 'dropped',
      id: 'smf.controller-messages.dropped',
      sourceEventIds: controllers.map(({ eventId }) => eventId),
    },
    {
      affectedCount: programs.length,
      detail: 'MIDI program-change messages are not stored in the canonical document.',
      disposition: 'dropped',
      id: 'smf.program-changes.dropped',
      sourceEventIds: programs.map(({ eventId }) => eventId),
    },
    {
      affectedCount: bends.length,
      detail: 'MIDI pitch-bend messages are not stored in the canonical document.',
      disposition: 'dropped',
      id: 'smf.pitch-bends.dropped',
      sourceEventIds: bends.map(({ eventId }) => eventId),
    },
    {
      affectedCount: notes.length,
      detail:
        'Deterministic playable guitar positions are suggestions; MIDI contains no original string/fret.',
      disposition: 'approximated',
      id: 'smf.guitar-position.approximated',
      sourceEventIds: notes.map(({ startEventId }) => startEventId),
    },
    {
      affectedCount: aftertouch.length,
      detail: 'Aftertouch evidence is not stored in the canonical v1 document.',
      disposition: 'dropped',
      id: 'smf.aftertouch.dropped',
      sourceEventIds: aftertouch.map(({ eventId }) => eventId),
    },
    {
      affectedCount: Math.max(1, unsupported.length),
      detail:
        'SysEx and original notation, voicing, techniques, repeats, layout, tuning, and capo are unsupported.',
      disposition: 'unsupported',
      id: 'smf.guitar-notation.unsupported',
      ...(unsupported.length === 0
        ? {}
        : { sourceEventIds: unsupported.map(({ eventId }) => eventId) }),
    },
    {
      affectedCount: preserved.length,
      detail:
        'Recognized text metadata remains visible in raw inventory but is not document truth.',
      disposition: 'preserved',
      id: 'smf.raw-metadata.preserved',
      sourceEventIds: preserved.map(({ eventId }) => eventId),
    },
  ]);
}

/** Imports only the exact reviewed Type-1 fixture; every other well-formed SMF stays unadvertised. */
export async function importAuthoredMidi(
  request: AuthoredMidiImportRequest,
): Promise<AuthoredMidiImportResult> {
  const monotonicStartedAt = clockNow(request.clock);
  const budget = normalizeBudget(request.resourceBudget);
  if (request.bytes.byteLength > budget.maximumSourceBytes) {
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: null,
      report: null,
      semanticDispositions: Object.freeze([
        {
          affectedCount: 1,
          detail: `Source has ${String(request.bytes.byteLength)} bytes; limit is ${String(budget.maximumSourceBytes)}. No source snapshot or digest was created.`,
          disposition: 'blocking',
          id: 'smf.resource.source-bytes.blocking',
        },
      ]),
    };
  }
  // This is the only private source snapshot. Every later length, digest, gate, and preflight read uses it.
  const bytes = new Uint8Array(request.bytes);
  const fileName = request.fileName;
  const importedAt = request.importedAt;
  const title = request.title ?? fileName.replace(/\.[^.]+$/u, '');
  const source = await sourceIdentity(bytes, fileName);
  const sourceHash = PracticeImportSourceIdentityHashSchema.parse(
    await hashPracticeImportSourceIdentity(source),
  );
  const importOperationDigest = await operationDigest({
    budget,
    fileName,
    importedAt,
    requestedTitle: request.title ?? null,
    sourceHash,
    title,
  });
  const identityElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (identityElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `Source identity stage took ${String(identityElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: null,
      report: rejectedReport({
        budget,
        diagnostics: [failure],
        importedAt,
        operationDigest: importOperationDigest,
        preflight: null,
        source,
        sourceHash,
        wallClockMs: identityElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        {
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking',
          id: 'smf.identity.wall-clock.blocking',
        },
      ]),
    };
  }
  let inventory: SmfPreflightInventory;
  try {
    inventory = preflightSmf(bytes, resourceLimits(budget));
  } catch (error) {
    if (!(error instanceof SmfPreflightError)) throw error;
    const preflightElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
    const failure =
      preflightElapsedMs > budget.maximumWallClockMs
        ? diagnostic(
            'import.resource.wall-clock-exceeded',
            1,
            `SMF preflight took ${String(preflightElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
          )
        : preflightFailureDiagnostic(error);
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: null,
      report: rejectedReport({
        budget,
        diagnostics: [failure],
        importedAt,
        operationDigest: importOperationDigest,
        preflight: null,
        source,
        sourceHash,
        wallClockMs: preflightElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        {
          affectedCount: 1,
          detail: error.message,
          disposition: 'blocking',
          id: `smf.preflight.${error.code}.blocking`,
        },
      ]),
    };
  }
  const projectedImportOperationDigest = await projectedOperationDigest(
    importOperationDigest,
    inventory,
  );
  const preflightElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (preflightElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `SMF preflight took ${String(preflightElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: inventory,
      report: rejectedReport({
        budget,
        diagnostics: [failure],
        importedAt,
        operationDigest: projectedImportOperationDigest,
        preflight: inventory,
        source,
        sourceHash,
        wallClockMs: preflightElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        {
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking',
          id: 'smf.preflight.wall-clock.blocking',
        },
      ]),
    };
  }

  const declared =
    inventory.format === 1 &&
    inventory.timeDivision.kind === 'ppq' &&
    inventory.timeDivision.ticksPerQuarter === 480 &&
    source.sha256Hex === DECLARED_TYPE1_FIXTURE_SHA256;
  if (!declared) {
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: inventory,
      report: rejectedReport({
        budget,
        diagnostics: [],
        importedAt,
        operationDigest: projectedImportOperationDigest,
        preflight: inventory,
        source,
        sourceHash,
        wallClockMs: preflightElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        {
          affectedCount: inventory.events.length,
          detail:
            'Well-formed SMF is outside the exact hash/version/PPQ profile backed by fixtures.',
          disposition: 'unsupported',
          id: 'smf.fixture-profile.unsupported',
          sourceEventIds: inventory.events.map(({ eventId }) => eventId),
        },
      ]),
    };
  }

  const reportId = `smf-report-${projectedImportOperationDigest.slice(0, 32)}`;
  const draftId = `smf-draft-${projectedImportOperationDigest.slice(0, 32)}`;
  const document = await candidateDocument({
    importedAt,
    inventory,
    operationDigest: projectedImportOperationDigest,
    reportId,
    sourceHash,
    sourceSha256: source.sha256Hex,
    title,
  });
  const documentElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  const outputEventCount = document.tracks.reduce(
    (sum, track) =>
      sum + track.voices.reduce((voiceSum, voice) => voiceSum + voice.events.length, 0),
    0,
  );
  const outputExceeded = outputEventCount > budget.maximumOutputEvents;
  const elapsedExceeded = documentElapsedMs > budget.maximumWallClockMs;
  if (outputExceeded || elapsedExceeded) {
    // Candidate resource checks are exhaustive and ordered: output first, then elapsed time.
    const failures = [
      ...(outputExceeded
        ? [
            diagnostic(
              'import.resource.output-events-exceeded',
              outputEventCount,
              `Candidate event count ${String(outputEventCount)} exceeds limit ${String(budget.maximumOutputEvents)}.`,
            ),
          ]
        : []),
      ...(elapsedExceeded
        ? [
            diagnostic(
              'import.resource.wall-clock-exceeded',
              1,
              `Candidate projection took ${String(documentElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
            ),
          ]
        : []),
    ];
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: inventory,
      report: rejectedReport({
        budget,
        diagnostics: failures,
        importedAt,
        operationDigest: projectedImportOperationDigest,
        outputEventCount,
        preflight: inventory,
        source,
        sourceHash,
        wallClockMs: documentElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        ...(outputExceeded
          ? [
              {
                affectedCount: outputEventCount,
                detail: failures[0]?.detail ?? 'Candidate output event limit exceeded.',
                disposition: 'blocking' as const,
                id: 'smf.output-resource.blocking',
              },
            ]
          : []),
        ...(elapsedExceeded
          ? [
              {
                affectedCount: 1,
                detail:
                  failures[failures.length - 1]?.detail ??
                  'Candidate projection elapsed-time limit exceeded.',
                disposition: 'blocking' as const,
                id: 'smf.projection.wall-clock.blocking',
              },
            ]
          : []),
      ]),
    };
  }
  const contentHash = document.revision.contentHash;
  const importedNotes = extractNoteIntervals(inventory.events);
  const findings = [
    createPracticeImportFinding('import.smf.guitar-semantics.unsupported', {
      affectedCount: outputEventCount,
      detail:
        'MIDI has no authoritative original string/fret, notation, or guitar technique semantics.',
      sourceEventIds: importedNotes.map(({ startEventId }) => startEventId),
    }),
    createPracticeImportFinding('import.smf.type1.fixture-explicit-loss', {
      affectedCount: inventory.events.length,
      detail:
        'Only this exact Type-1 fixture is accepted, with raw event accounting and explicit loss.',
      sourceEventIds: inventory.events.map(({ eventId }) => eventId),
    }),
  ].sort((left, right) => left.code.localeCompare(right.code));
  const buildBundle = (wallClockMs: number) => {
    const resources = {
      budget,
      usage: {
        outputEventCount,
        sourceBytes: source.byteLength,
        sourceEventCount: inventory.events.length,
        wallClockMs,
      },
    };
    const draft: PracticeImportDraft = {
      adapter,
      candidateDocument: document,
      candidateDocumentContentHash: contentHash,
      contractVersion: 1,
      createdAt: importedAt,
      direction: 'performance-to-draft',
      draftId,
      reportId,
      resources,
      route: 'smf-type1-declared-fixtures-v1',
      source,
      sourceIdentityHash: sourceHash,
    };
    const report = PracticeImportReportSchema.parse({
      adapter,
      contractVersion: 1,
      diagnostics: [
        diagnostic(
          'import.guitar-position.ambiguous',
          outputEventCount,
          'MIDI pitches map to deterministic playable suggestions; a user must accept guitar positions.',
        ),
      ],
      direction: 'performance-to-draft',
      dispositionCounts: dispositionCounts(findings),
      draftBinding: { candidateDocumentContentHash: contentHash, draftId },
      finalizedAt: importedAt,
      findings,
      highestSeverity: 'warning',
      outcome: 'reviewable',
      reportAction: 'review-losses',
      reportId,
      resources,
      route: 'smf-type1-declared-fixtures-v1',
      source,
      sourceIdentityHash: sourceHash,
      startedAt: importedAt,
    });
    return PracticeImportReviewBundleSchema.parse({ bundleVersion: 1, draft, report });
  };
  const provisionalBundle = buildBundle(documentElapsedMs);
  await verifyPracticeImportReviewBundle(provisionalBundle);
  const finalElapsedMs = elapsedMilliseconds(request.clock, monotonicStartedAt);
  if (finalElapsedMs > budget.maximumWallClockMs) {
    const failure = diagnostic(
      'import.resource.wall-clock-exceeded',
      1,
      `Import finalization took ${String(finalElapsedMs)} ms; limit is ${String(budget.maximumWallClockMs)} ms.`,
    );
    return {
      direction: 'performance-to-draft',
      draft: null,
      preflight: inventory,
      report: rejectedReport({
        budget,
        diagnostics: [failure],
        importedAt,
        operationDigest: projectedImportOperationDigest,
        outputEventCount,
        preflight: inventory,
        source,
        sourceHash,
        wallClockMs: finalElapsedMs,
      }),
      semanticDispositions: Object.freeze([
        {
          affectedCount: 1,
          detail: failure.detail,
          disposition: 'blocking',
          id: 'smf.finalization.wall-clock.blocking',
        },
      ]),
    };
  }
  const bundle = buildBundle(finalElapsedMs);
  return {
    direction: 'performance-to-draft',
    draft: bundle.draft,
    preflight: inventory,
    report: bundle.report,
    semanticDispositions: importSemanticDispositions(inventory),
  };
}

function tiesToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function canonicalToTargetTick(tick: number): number {
  return tiesToEven((tick * AUTHORED_MIDI_TARGET_PPQ) / 960);
}

function vlq(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new RangeError('SMF variable-length value is outside the supported range.');
  }
  const bytes = [value & 0x7f];
  let remaining = value >>> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  return bytes;
}

function u16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(id: string, payload: readonly number[]): number[] {
  return [
    ...Array.from(id, (character) => character.charCodeAt(0)),
    ...u32(payload.length),
    ...payload,
  ];
}

type TimedMidiEvent = Readonly<{ bytes: readonly number[]; order: number; tick: number }>;

function encodeTrack(events: readonly TimedMidiEvent[], endTick: number): number[] {
  const sorted = [...events, { bytes: [0xff, 0x2f, 0], order: 999, tick: endTick }].sort(
    (left, right) => left.tick - right.tick || left.order - right.order,
  );
  let previousTick = 0;
  return sorted.flatMap((event) => {
    const bytes = [...vlq(event.tick - previousTick), ...event.bytes];
    previousTick = event.tick;
    return bytes;
  });
}

/**
 * Deterministic authored-document SMF export. This entry point cannot accept observed-session
 * evidence: its required purpose and input are explicitly document-only.
 */
export function exportAuthoredDocumentMidi(
  request: AuthoredMidiExportRequest,
): AuthoredMidiExportResult {
  const runtimePurpose: unknown = request.purpose;
  if (runtimePurpose !== AUTHORED_MIDI_EXPORT_PURPOSE) {
    throw new TypeError('Observed-session MIDI must use its separate evidence-export adapter.');
  }
  if (request.document.ppq !== 960)
    throw new TypeError('Authored MIDI export requires canonical 960 PPQ.');
  const targetDuration = Math.max(1, canonicalToTargetTick(request.document.durationTicks));
  const conductor: TimedMidiEvent[] = [];
  for (const entry of request.document.tempoMap) {
    conductor.push({
      bytes: [0xff, 0x51, 3, ...u32(entry.microsecondsPerQuarter).slice(1)],
      order: 10,
      tick: canonicalToTargetTick(entry.tick),
    });
  }
  for (const entry of request.document.meterMap) {
    conductor.push({
      bytes: [0xff, 0x58, 4, entry.numerator, Math.log2(entry.denominator), 24, 8],
      order: 20,
      tick: canonicalToTargetTick(entry.tick),
    });
  }
  for (const entry of request.document.keyMap) {
    conductor.push({
      bytes: [0xff, 0x59, 2, entry.fifths & 0xff, entry.mode === 'minor' ? 1 : 0],
      order: 30,
      tick: canonicalToTargetTick(entry.tick),
    });
  }

  const authored: TimedMidiEvent[] = [];
  const dispositions: SemanticDisposition[] = [];
  const articulationSourceIds: string[] = [];
  const dynamicSourceIds: string[] = [];
  const guitarEventSourceIds: string[] = [];
  const noteSourceIds: string[] = [];
  const trackSourceIds: string[] = [];
  const tupletSourceIds: string[] = [];
  const voiceNameSourceIds: string[] = [];
  const voiceSourceIds: string[] = [];
  let noteCount = 0;
  let droppedCount = 0;
  const tuning = new Map(
    request.document.guitar.tuning.map(({ openMidi, stringNumber }) => [stringNumber, openMidi]),
  );
  for (const track of request.document.tracks) {
    trackSourceIds.push(track.id);
    for (const voice of track.voices) {
      voiceSourceIds.push(voice.id);
      if (voice.name !== undefined) voiceNameSourceIds.push(voice.id);
      for (const event of voice.events) {
        if (event.tuplet !== undefined) {
          tupletSourceIds.push(
            `${event.id}:tuplet:${String(event.tuplet.actualNotes)}:${String(event.tuplet.normalNotes)}`,
          );
        }
        if (event.kind === 'rest') {
          dispositions.push({
            affectedCount: 1,
            detail: `Rest ${event.id} is preserved implicitly as silence between timed MIDI events.`,
            disposition: 'preserved',
            id: `midi.rest.${event.id}.preserved-as-silence`,
            sourceEventIds: [event.id],
          });
          continue;
        }
        guitarEventSourceIds.push(event.id);
        for (const [index, articulation] of event.articulations.entries()) {
          articulationSourceIds.push(
            `${event.id}:articulation:${articulation.semantic}:${String(index + 1)}`,
          );
        }
        if (event.dynamic !== undefined) {
          dynamicSourceIds.push(`${event.id}:dynamic:${event.dynamic.semantic}`);
        }
        for (const note of event.notes) {
          noteSourceIds.push(note.id);
          const openMidi = tuning.get(note.position.stringNumber);
          if (openMidi === undefined)
            throw new TypeError('Document note references a missing string.');
          const midi = openMidi + request.document.guitar.capoFret + note.position.tabFret;
          const startTick = canonicalToTargetTick(event.tick);
          const endTick = canonicalToTargetTick(event.tick + note.soundingDurationTicks);
          dispositions.push({
            affectedCount: 1,
            detail: `Note ${note.id} string ${String(note.position.stringNumber)}/fret ${String(note.position.tabFret)} is not representable in SMF.`,
            disposition: 'dropped',
            id: `midi.note.${note.id}.guitar-position.dropped`,
            sourceEventIds: [note.id],
          });
          dispositions.push({
            affectedCount: 1,
            detail: `Note ${note.id} written spelling is reduced to a MIDI pitch number.`,
            disposition: 'dropped',
            id: `midi.note.${note.id}.written-spelling.dropped`,
            sourceEventIds: [note.id],
          });
          for (const semantic of note.semantics) {
            dispositions.push({
              affectedCount: 1,
              detail: `Authored semantic ${semantic.semantic} on ${note.id} is not represented by this bounded writer.`,
              disposition: 'unsupported',
              id: `midi.note.${note.id}.${semantic.semantic}.unsupported`,
              sourceEventIds: [note.id],
            });
          }
          if (endTick <= startTick) {
            droppedCount += 1;
            dispositions.push({
              affectedCount: 1,
              detail: `Note ${note.id} became zero-duration after 960-to-480 ties-to-even quantization.`,
              disposition: 'dropped',
              id: `midi.note.${note.id}.zero-duration.dropped`,
              sourceEventIds: [note.id],
            });
            continue;
          }
          noteCount += 1;
          authored.push({ bytes: [0x90, midi, 96], order: 20, tick: startTick });
          authored.push({ bytes: [0x80, midi, 0], order: 10, tick: endTick });
          dispositions.push({
            affectedCount: 1,
            detail: `Note ${note.id} pitch and interval were converted to 480 PPQ.`,
            disposition: 'converted',
            id: `midi.note.${note.id}.timing.converted`,
            sourceEventIds: [note.id],
          });
          dispositions.push({
            affectedCount: 1,
            detail: `Note ${note.id} has no authored velocity; deterministic velocity 96 was used.`,
            disposition: 'approximated',
            id: `midi.note.${note.id}.velocity.approximated`,
            sourceEventIds: [note.id],
          });
        }
      }
    }
  }
  dispositions.unshift({
    affectedCount: conductor.length,
    detail: 'Authored tempo, meter, and key entries are preserved as SMF conductor events.',
    disposition: 'preserved',
    id: 'midi.conductor-events.preserved',
    sourceEventIds: conductor.map((_, index) => `document:conductor-event:${String(index + 1)}`),
  });
  dispositions.unshift(
    {
      affectedCount: 1,
      detail: 'The canonical document contract version is validated but not serialized in SMF.',
      disposition: 'dropped',
      id: 'midi.document-contract-version.dropped',
      sourceEventIds: ['document:contractVersion'],
    },
    {
      affectedCount: 1,
      detail: 'Canonical document duration is converted to the bounded SMF track end tick.',
      disposition: 'converted',
      id: 'midi.document-duration.converted',
      sourceEventIds: ['document:durationTicks'],
    },
    {
      affectedCount: 5,
      detail:
        'Expected-projection and document revision identity fields are not serialized in SMF.',
      disposition: 'dropped',
      id: 'midi.document-identities.dropped',
      sourceEventIds: [
        'document:expectedProjectionHash',
        'document:revision:contentHash',
        'document:revision:documentId',
        'document:revision:revisionId',
        'document:revision:revisionNumber',
      ],
    },
    {
      affectedCount: request.document.importProvenance === null ? 0 : 1,
      detail: 'Import provenance is not serialized in the authored SMF.',
      disposition: 'dropped',
      id: 'midi.import-provenance.dropped',
      sourceEventIds:
        request.document.importProvenance === null ? [] : ['document:importProvenance'],
    },
    {
      affectedCount: Object.keys(request.document.metadata).length,
      detail: 'Document title, artist, and creation/update metadata are not serialized in SMF.',
      disposition: 'dropped',
      id: 'midi.document-metadata.dropped',
      sourceEventIds: Object.keys(request.document.metadata)
        .sort()
        .map((field) => `document:metadata:${field}`),
    },
    {
      affectedCount: request.document.loopPresets.length,
      detail: 'Loop preset identities, names, and ranges are not serialized in SMF.',
      disposition: 'dropped',
      id: 'midi.loop-presets.dropped',
      sourceEventIds: request.document.loopPresets.map(({ id }) => id),
    },
    {
      affectedCount: 1,
      detail: 'Canonical 960 PPQ timing is converted to the bounded 480 PPQ export grid.',
      disposition: 'converted',
      id: 'midi.canonical-ppq.converted',
      sourceEventIds: ['document:ppq'],
    },
    {
      affectedCount: request.document.guitar.tuning.length + 1,
      detail:
        'Tuning and capo are consumed to calculate MIDI pitches, but the original configuration cannot be reconstructed from SMF.',
      disposition: 'converted',
      id: 'midi.guitar-tuning-capo.converted',
      sourceEventIds: [
        'document:guitar:capoFret',
        ...request.document.guitar.tuning.map(
          ({ stringNumber }) => `document:guitar:tuning:string-${String(stringNumber)}`,
        ),
      ],
    },
    {
      affectedCount: 4,
      detail:
        'Handedness, maximum physical fret, scale length, and temperament configuration are not represented in SMF.',
      disposition: 'dropped',
      id: 'midi.guitar-physical-configuration.dropped',
      sourceEventIds: [
        'document:guitar:handedness',
        'document:guitar:maxPhysicalFret',
        'document:guitar:scaleLengthMm',
        'document:guitar:temperament',
      ],
    },
    {
      affectedCount: request.document.meterMap.length,
      detail:
        'Meter numerator and denominator are emitted, but canonical beat grouping is not representable in the SMF time-signature event.',
      disposition: 'dropped',
      id: 'midi.meter-grouping.dropped',
      sourceEventIds: request.document.meterMap.map(
        (_, index) => `document:meterMap:${String(index)}:grouping`,
      ),
    },
    {
      affectedCount: conductor.length,
      detail: 'Conductor-map ticks are converted from canonical 960 PPQ to the 480 PPQ grid.',
      disposition: 'converted',
      id: 'midi.conductor-map-ticks.converted',
      sourceEventIds: conductor.map((_, index) => `document:conductor-event:${String(index + 1)}`),
    },
    {
      affectedCount: trackSourceIds.length,
      detail: 'Authored tracks are flattened into the single authored SMF channel track.',
      disposition: 'converted',
      id: 'midi.tracks.flattened',
      sourceEventIds: trackSourceIds,
    },
    {
      affectedCount: trackSourceIds.length,
      detail: 'Authored track names are not emitted by the bounded writer.',
      disposition: 'dropped',
      id: 'midi.track-names.dropped',
      sourceEventIds: trackSourceIds,
    },
    {
      affectedCount: voiceSourceIds.length,
      detail: 'Authored voices are flattened into the single authored SMF channel track.',
      disposition: 'converted',
      id: 'midi.voices.flattened',
      sourceEventIds: voiceSourceIds,
    },
    {
      affectedCount: voiceNameSourceIds.length,
      detail: 'Authored voice names are not emitted by the bounded writer.',
      disposition: 'dropped',
      id: 'midi.voice-names.dropped',
      sourceEventIds: voiceNameSourceIds,
    },
    {
      affectedCount: guitarEventSourceIds.length,
      detail: 'Canonical guitar-event grouping is flattened into independent MIDI note messages.',
      disposition: 'converted',
      id: 'midi.guitar-events.flattened',
      sourceEventIds: guitarEventSourceIds,
    },
    {
      affectedCount: guitarEventSourceIds.length,
      detail:
        'Event notated durations are not encoded; each note sounding duration determines its MIDI interval.',
      disposition: 'dropped',
      id: 'midi.notated-durations.dropped',
      sourceEventIds: guitarEventSourceIds,
    },
    {
      affectedCount: noteSourceIds.length,
      detail: 'Canonical note identities are not serialized in SMF.',
      disposition: 'dropped',
      id: 'midi.note-identities.dropped',
      sourceEventIds: noteSourceIds,
    },
    {
      affectedCount: articulationSourceIds.length,
      detail: 'Authored event articulations are not represented by this bounded writer.',
      disposition: 'unsupported',
      id: 'midi.articulations.unsupported',
      sourceEventIds: articulationSourceIds,
    },
    {
      affectedCount: dynamicSourceIds.length,
      detail: 'Authored dynamics are not represented by this bounded writer.',
      disposition: 'unsupported',
      id: 'midi.dynamics.unsupported',
      sourceEventIds: dynamicSourceIds,
    },
    {
      affectedCount: tupletSourceIds.length,
      detail: 'Authored tuplets are flattened to performed tick timing.',
      disposition: 'converted',
      id: 'midi.tuplets.flattened',
      sourceEventIds: tupletSourceIds,
    },
  );
  if (noteCount === 0 && droppedCount > 0) {
    dispositions.push({
      affectedCount: droppedCount,
      detail: 'No defensible nonzero-duration notes remain after quantization.',
      disposition: 'blocking',
      id: 'midi.empty-after-quantization.blocking',
    });
  }
  const header = chunk('MThd', [...u16(1), ...u16(2), ...u16(AUTHORED_MIDI_TARGET_PPQ)]);
  const conductorTrack = chunk('MTrk', encodeTrack(conductor, targetDuration));
  const authoredTrack = chunk('MTrk', encodeTrack(authored, targetDuration));
  const bytes = Uint8Array.from([...header, ...conductorTrack, ...authoredTrack]);
  const preflight = preflightSmf(bytes, {
    maximumBytes: request.maximumBytes ?? SMF_PREFLIGHT_DEFAULT_LIMITS.maximumBytes,
    maximumEvents: request.maximumEvents ?? SMF_PREFLIGHT_DEFAULT_LIMITS.maximumEvents,
  });
  return Object.freeze({
    bytes,
    direction: 'authored-document-to-smf',
    format: 'SMF Type 1',
    preflight,
    purpose: AUTHORED_MIDI_EXPORT_PURPOSE,
    semanticDispositions: Object.freeze(dispositions),
    targetPpq: AUTHORED_MIDI_TARGET_PPQ,
  });
}
