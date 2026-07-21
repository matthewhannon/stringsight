import {
  DocumentRevisionIdentitySchema,
  MediaIdentitySchema,
  ObservedEvidenceSnapshotSchema,
  PracticeAssessmentSchema,
  PracticeDocumentSchema,
  PracticeTakeSchema,
  ReferenceScoreMediaSyncMapSchema,
  TakeCaptureMediaSyncMapSchema,
} from './contracts/practice';
import { PracticeImportSourceIdentitySchema } from './contracts/practice-import';
import { assertCanonicalJsonDataDomain, hashCanonicalJson } from './canonical-json';

export const PRACTICE_CANONICALIZATION = Object.freeze({
  canonicalizationId: 'stringsight-canonical-json',
  canonicalizationVersion: 1,
} as const);

type ProjectionDefinition = Readonly<{
  schemaId: string;
  schemaVersion: number;
  projectionId: string;
  projectionVersion: number;
}>;

const projection = <const T extends ProjectionDefinition>(definition: T): Readonly<T> =>
  Object.freeze(definition);

export const PRACTICE_PROJECTION_REGISTRY = Object.freeze({
  assessment: projection({
    schemaId: 'practice-assessment',
    schemaVersion: 1,
    projectionId: 'practice-assessment',
    projectionVersion: 1,
  }),
  documentContent: projection({
    schemaId: 'practice-document',
    schemaVersion: 1,
    projectionId: 'practice-document-content',
    projectionVersion: 1,
  }),
  documentRevision: projection({
    schemaId: 'practice-document-revision',
    schemaVersion: 1,
    projectionId: 'practice-document-revision',
    projectionVersion: 1,
  }),
  expectedEvents: projection({
    schemaId: 'practice-document',
    schemaVersion: 1,
    projectionId: 'practice-expected-events',
    projectionVersion: 1,
  }),
  importSourceIdentity: projection({
    schemaId: 'practice-import-source',
    schemaVersion: 1,
    projectionId: 'practice-import-source-identity',
    projectionVersion: 1,
  }),
  mediaIdentity: projection({
    schemaId: 'practice-media-identity',
    schemaVersion: 1,
    projectionId: 'practice-media-identity',
    projectionVersion: 1,
  }),
  observedEvidenceSnapshot: projection({
    schemaId: 'observed-evidence-snapshot',
    schemaVersion: 1,
    projectionId: 'observed-evidence-snapshot',
    projectionVersion: 1,
  }),
  practiceTakeCore: projection({
    schemaId: 'practice-take',
    schemaVersion: 1,
    projectionId: 'practice-take-core',
    projectionVersion: 1,
  }),
  referenceScoreMediaSyncMap: projection({
    schemaId: 'reference-score-media-sync-map',
    schemaVersion: 1,
    projectionId: 'reference-score-media-sync-map',
    projectionVersion: 1,
  }),
  takeCaptureMediaSyncMap: projection({
    schemaId: 'take-capture-media-sync-map',
    schemaVersion: 1,
    projectionId: 'take-capture-media-sync-map',
    projectionVersion: 1,
  }),
} as const);

export type PracticeProjectionName = keyof typeof PRACTICE_PROJECTION_REGISTRY;

export type PracticeQualifiedHash = Readonly<{
  algorithm: 'sha256';
  canonicalizationId: typeof PRACTICE_CANONICALIZATION.canonicalizationId;
  canonicalizationVersion: typeof PRACTICE_CANONICALIZATION.canonicalizationVersion;
  schemaId: string;
  schemaVersion: number;
  projectionId: string;
  projectionVersion: number;
  digestHex: string;
}>;

const versionLabel = (id: string, version: number): string => `${id}/v${String(version)}`;

async function hashProjection(
  value: unknown,
  definition: ProjectionDefinition,
): Promise<PracticeQualifiedHash> {
  const hash = await hashCanonicalJson(value, {
    schemaVersion: versionLabel(definition.schemaId, definition.schemaVersion),
    projectionVersion: versionLabel(definition.projectionId, definition.projectionVersion),
  });
  return {
    algorithm: 'sha256',
    ...PRACTICE_CANONICALIZATION,
    schemaId: definition.schemaId,
    schemaVersion: definition.schemaVersion,
    projectionId: definition.projectionId,
    projectionVersion: definition.projectionVersion,
    digestHex: hash.digestHex,
  };
}

export function materializePracticeDocumentContent(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  const document = PracticeDocumentSchema.parse(input);
  const { expectedProjectionHash, revision, ...content } = document;
  void expectedProjectionHash;
  void revision;
  return content;
}

export async function hashPracticeDocumentContent(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializePracticeDocumentContent(input),
    PRACTICE_PROJECTION_REGISTRY.documentContent,
  );
}

export function materializeExpectedEvents(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  const document = PracticeDocumentSchema.parse(input);
  const tuningByString = new Map(
    document.guitar.tuning.map((string) => [string.stringNumber, string.openMidi]),
  );
  return {
    contractVersion: document.contractVersion,
    durationTicks: document.durationTicks,
    ppq: document.ppq,
    tempoMap: document.tempoMap,
    tracks: document.tracks.map((track) => ({
      id: track.id,
      voices: track.voices.map((voice) => ({
        id: voice.id,
        events: voice.events.flatMap((event) => {
          if (event.kind === 'rest') return [];
          return [
            {
              articulations: event.articulations,
              dynamic: event.dynamic ?? null,
              id: event.id,
              notatedDurationTicks: event.notatedDurationTicks,
              notes: event.notes.map((note) => {
                const openMidi = tuningByString.get(note.position.stringNumber);
                if (openMidi === undefined) {
                  throw new TypeError('Validated guitar note references a missing tuning string.');
                }
                return {
                  id: note.id,
                  midi: openMidi + document.guitar.capoFret + note.position.tabFret,
                  position: note.position,
                  semantics: note.semantics,
                  soundingDurationTicks: note.soundingDurationTicks,
                };
              }),
              tick: event.tick,
              tuplet: event.tuplet ?? null,
            },
          ];
        }),
      })),
    })),
  };
}

export async function hashExpectedEvents(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializeExpectedEvents(input),
    PRACTICE_PROJECTION_REGISTRY.expectedEvents,
  );
}

export function materializePracticeImportSourceIdentity(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  return PracticeImportSourceIdentitySchema.parse(input);
}

export async function hashPracticeImportSourceIdentity(
  input: unknown,
): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializePracticeImportSourceIdentity(input),
    PRACTICE_PROJECTION_REGISTRY.importSourceIdentity,
  );
}

export function materializeDocumentRevision(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  return DocumentRevisionIdentitySchema.parse(input);
}

export async function hashDocumentRevision(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializeDocumentRevision(input),
    PRACTICE_PROJECTION_REGISTRY.documentRevision,
  );
}

export function materializeObservedEvidenceSnapshot(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  return ObservedEvidenceSnapshotSchema.parse(input);
}

export async function hashObservedEvidenceSnapshot(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializeObservedEvidenceSnapshot(input),
    PRACTICE_PROJECTION_REGISTRY.observedEvidenceSnapshot,
  );
}

export function materializePracticeTakeCore(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  const take = PracticeTakeSchema.parse(input);
  const { takeCoreHash, ...core } = take;
  void takeCoreHash;
  return core;
}

export async function hashPracticeTakeCore(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializePracticeTakeCore(input),
    PRACTICE_PROJECTION_REGISTRY.practiceTakeCore,
  );
}

export function materializeMediaIdentity(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  return MediaIdentitySchema.parse(input);
}

export async function hashMediaIdentity(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializeMediaIdentity(input),
    PRACTICE_PROJECTION_REGISTRY.mediaIdentity,
  );
}

export function materializeReferenceScoreMediaSyncMap(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  const syncMap = ReferenceScoreMediaSyncMapSchema.parse(input);
  const { mapHash, ...projectionValue } = syncMap;
  void mapHash;
  return projectionValue;
}

export async function hashReferenceScoreMediaSyncMap(
  input: unknown,
): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializeReferenceScoreMediaSyncMap(input),
    PRACTICE_PROJECTION_REGISTRY.referenceScoreMediaSyncMap,
  );
}

export function materializeTakeCaptureMediaSyncMap(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  const syncMap = TakeCaptureMediaSyncMapSchema.parse(input);
  const { mapHash, ...projectionValue } = syncMap;
  void mapHash;
  return projectionValue;
}

export async function hashTakeCaptureMediaSyncMap(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializeTakeCaptureMediaSyncMap(input),
    PRACTICE_PROJECTION_REGISTRY.takeCaptureMediaSyncMap,
  );
}

export function materializePracticeAssessment(input: unknown) {
  assertCanonicalJsonDataDomain(input);
  const assessment = PracticeAssessmentSchema.parse(input);
  const { assessmentHash, ...projectionValue } = assessment;
  void assessmentHash;
  return projectionValue;
}

export async function hashPracticeAssessment(input: unknown): Promise<PracticeQualifiedHash> {
  return hashProjection(
    materializePracticeAssessment(input),
    PRACTICE_PROJECTION_REGISTRY.assessment,
  );
}
