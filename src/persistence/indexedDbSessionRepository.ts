import { SessionSchema } from '../shared';
import type { CapturedRecording } from '../audio/capture';
import {
  type AudioSessionRepository,
  type PersistedAudioSession,
  type SavedSessionSummary,
  validatePersistedAudioSession,
} from './sessionRepository';

const DATABASE_NAME = 'stringsight';
const DATABASE_VERSION = 1;
const MEDIA_STORE = 'audio-session-media';
const SESSION_STORE = 'audio-sessions';

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      {
        once: true,
      },
    );
  });

const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });

export class IndexedDbAudioSessionRepository implements AudioSessionRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly databaseName: string;
  private readonly indexedDb: IDBFactory | undefined;

  constructor(
    indexedDb: IDBFactory | undefined = globalThis.indexedDB,
    databaseName = DATABASE_NAME,
  ) {
    this.indexedDb = indexedDb;
    this.databaseName = databaseName;
  }

  async delete(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([SESSION_STORE, MEDIA_STORE], 'readwrite');
    transaction.objectStore(SESSION_STORE).delete(id);
    transaction.objectStore(MEDIA_STORE).delete(id);
    await transactionDone(transaction);
  }

  async get(id: string): Promise<PersistedAudioSession | null> {
    const database = await this.open();
    const transaction = database.transaction([SESSION_STORE, MEDIA_STORE], 'readonly');
    const sessionRequest = transaction.objectStore(SESSION_STORE).get(id) as IDBRequest<unknown>;
    const mediaRequest = transaction.objectStore(MEDIA_STORE).get(id) as IDBRequest<unknown>;
    const [sessionValue, recordingValue] = await Promise.all([
      requestResult(sessionRequest),
      requestResult(mediaRequest),
      transactionDone(transaction),
    ]);
    if (sessionValue === undefined) return null;
    return validatePersistedAudioSession({
      recording: recordingValue === undefined ? null : (recordingValue as CapturedRecording),
      session: SessionSchema.parse(sessionValue),
    });
  }

  async list(): Promise<readonly SavedSessionSummary[]> {
    const database = await this.open();
    const transaction = database.transaction(SESSION_STORE, 'readonly');
    const values = await requestResult(
      transaction.objectStore(SESSION_STORE).getAll() as IDBRequest<unknown[]>,
    );
    await transactionDone(transaction);
    return values
      .map((value) => SessionSchema.parse(value))
      .map((session) => ({
        createdAt: session.createdAt,
        durationMs: session.recording?.durationMs ?? null,
        hasRecording: session.recording !== null,
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async save(value: PersistedAudioSession): Promise<void> {
    const parsed = validatePersistedAudioSession(value);
    const database = await this.open();
    const transaction = database.transaction([SESSION_STORE, MEDIA_STORE], 'readwrite');
    transaction.objectStore(SESSION_STORE).put(parsed.session, parsed.session.id);
    if (parsed.recording === null) transaction.objectStore(MEDIA_STORE).delete(parsed.session.id);
    else transaction.objectStore(MEDIA_STORE).put(parsed.recording, parsed.session.id);
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    const indexedDb = this.indexedDb;
    if (indexedDb === undefined) {
      return Promise.reject(new Error('This browser does not provide IndexedDB session storage.'));
    }
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDb.open(this.databaseName, DATABASE_VERSION);
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SESSION_STORE))
          database.createObjectStore(SESSION_STORE);
        if (!database.objectStoreNames.contains(MEDIA_STORE))
          database.createObjectStore(MEDIA_STORE);
      });
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Could not open IndexedDB.')),
        { once: true },
      );
      request.addEventListener(
        'blocked',
        () => reject(new Error('The session database upgrade is blocked by another tab.')),
        { once: true },
      );
    });
    return this.databasePromise;
  }
}
