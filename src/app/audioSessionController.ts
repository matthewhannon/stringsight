import type { AudioAnalysisSnapshot } from '../audio/analysis';
import type { CapturedRecording, CaptureSnapshot } from '../audio/capture';
import type { PolyphonicAnalysisSnapshot } from '../audio/polyphonic';
import {
  recordingMetadata,
  type AudioSessionRepository,
  type SavedSessionSummary,
} from '../persistence';
import {
  createReplacementCorrection,
  createRevertCorrection,
  type ReplacementCorrectionInput,
} from '../session';
import {
  audioEventsToTimedPitchClassEvidence,
  rankKeyInterpretations,
  rankScaleInterpretations,
  type RankedKeyInterpretation,
  type RankedScaleInterpretation,
} from '../music';
import {
  CONTRACT_SCHEMA_VERSION,
  SessionSchema,
  type AudioEvent,
  type Session,
  type SessionSettings,
} from '../shared';

type CaptureSource = {
  readonly currentRecording: CapturedRecording | null;
  readonly currentSnapshot: CaptureSnapshot;
  clearRecording(): void;
  loadRecording(recording: CapturedRecording): void;
  subscribe(listener: (snapshot: CaptureSnapshot) => void): () => void;
};

type SnapshotSource<TSnapshot> = {
  readonly currentSnapshot: TSnapshot;
  subscribe(listener: () => void): () => void;
};

export type AudioSessionControllerOptions = {
  readonly idFactory?: () => string;
  readonly now?: () => Date;
  readonly repository?: AudioSessionRepository;
  readonly settings?: SessionSettings;
  readonly titleFactory?: (createdAt: Date) => string;
};

export type AudioSessionSnapshot = {
  readonly capture: CaptureSnapshot;
  readonly keyInterpretations: readonly RankedKeyInterpretation[];
  readonly pendingRevision: boolean;
  readonly savedSessions: readonly SavedSessionSummary[];
  readonly scaleInterpretations: readonly RankedScaleInterpretation[];
  readonly session: Session | null;
  readonly storageError: string | null;
  readonly storageState: 'idle' | 'loading' | 'saving';
};

const DEFAULT_SETTINGS: SessionSettings = {
  handedness: 'right',
  maxFret: 24,
  remoteAnalysisEnabled: false,
  tuningMidiLowToHigh: [40, 45, 50, 55, 59, 64],
  visionEnabled: false,
};

const defaultIdFactory = (): string =>
  typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `session-${Date.now().toString(36)}`;

const defaultTitleFactory = (createdAt: Date): string =>
  `Audio session ${createdAt.toISOString().slice(0, 16).replace('T', ' ')}`;

const eventEnd = (event: AudioEvent): number => Number(event.time.endMs ?? event.time.startMs);

const overlaps = (left: AudioEvent, right: AudioEvent): boolean =>
  Number(left.time.startMs) < eventEnd(right) && Number(right.time.startMs) < eventEnd(left);

const theorySourceEvents = (events: readonly AudioEvent[]): AudioEvent[] => {
  const finalized = events.filter(
    (event) => event.lifecycle !== 'provisional' && event.time.endMs !== undefined,
  );
  const noteSets = finalized.filter((event) => event.kind === 'note-set');
  const chords = finalized.filter((event) => event.kind === 'chord');
  const polyphonic = noteSets.length > 0 ? noteSets : chords;
  const monophonic = finalized.filter(
    (event) => event.kind === 'note' && !polyphonic.some((polyEvent) => overlaps(event, polyEvent)),
  );
  return [...polyphonic, ...monophonic].sort(
    (left, right) => Number(left.time.startMs) - Number(right.time.startMs),
  );
};

const interpretationsFor = (
  events: readonly AudioEvent[],
): {
  keys: RankedKeyInterpretation[];
  scales: RankedScaleInterpretation[];
} => {
  const sources = theorySourceEvents(events);
  if (sources.length === 0) return { keys: [], scales: [] };
  const evidence = audioEventsToTimedPitchClassEvidence(sources);
  return {
    keys: rankKeyInterpretations(evidence, { candidateLimit: 3 }),
    scales: rankScaleInterpretations(evidence, { candidateLimit: 3 }),
  };
};

export class AudioSessionController {
  private readonly analysis: SnapshotSource<AudioAnalysisSnapshot>;
  private readonly capture: CaptureSource;
  private readonly idFactory: () => string;
  private readonly listeners = new Set<() => void>();
  private readonly now: () => Date;
  private readonly polyphonic: SnapshotSource<PolyphonicAnalysisSnapshot>;
  private readonly repository: AudioSessionRepository | null;
  private readonly settings: SessionSettings;
  private readonly titleFactory: (createdAt: Date) => string;
  private readonly unsubscribers: readonly (() => void)[];
  private activeAnalysisRunId: string | null = null;
  private activePolyphonicRunId: string | null = null;
  private baselineAnalysisRunId: string | null = null;
  private baselinePolyphonicRunId: string | null = null;
  private revisionMode: 'recording' | 'replay' | null = null;
  private snapshot: AudioSessionSnapshot;

  constructor(
    capture: CaptureSource,
    analysis: SnapshotSource<AudioAnalysisSnapshot>,
    polyphonic: SnapshotSource<PolyphonicAnalysisSnapshot>,
    options: AudioSessionControllerOptions = {},
  ) {
    this.capture = capture;
    this.analysis = analysis;
    this.polyphonic = polyphonic;
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.now = options.now ?? (() => new Date());
    this.settings = options.settings ?? DEFAULT_SETTINGS;
    this.titleFactory = options.titleFactory ?? defaultTitleFactory;
    this.snapshot = {
      capture: capture.currentSnapshot,
      keyInterpretations: [],
      pendingRevision: false,
      savedSessions: [],
      scaleInterpretations: [],
      session: null,
      storageError: null,
      storageState: 'idle',
    };
    this.repository = options.repository ?? null;
    this.unsubscribers = [
      capture.subscribe(this.handleCaptureUpdate),
      analysis.subscribe(this.handleAnalyzerUpdate),
      polyphonic.subscribe(this.handleAnalyzerUpdate),
    ];
  }

  get currentSnapshot(): AudioSessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
  }

  appendCorrection(input: ReplacementCorrectionInput, reason?: string): void {
    if (this.snapshot.session?.status !== 'complete') {
      throw new Error('A complete session is required before correcting an event.');
    }
    const correction = createReplacementCorrection(this.snapshot.session, input, {
      createdAtMs: this.sessionDurationMs(),
      id: this.idFactory(),
      ...(reason === undefined ? {} : { reason }),
    });
    this.publishSession(
      this.updatedSession({ corrections: [...this.snapshot.session.corrections, correction] }),
    );
    this.emit();
  }

  revertCorrection(eventId: string): void {
    if (this.snapshot.session?.status !== 'complete') {
      throw new Error('A complete session is required before reverting an event.');
    }
    const correction = createRevertCorrection(this.snapshot.session, eventId, {
      createdAtMs: this.sessionDurationMs(),
      id: this.idFactory(),
    });
    this.publishSession(
      this.updatedSession({ corrections: [...this.snapshot.session.corrections, correction] }),
    );
    this.emit();
  }

  replaceWithImportedSession(session: Session): void {
    if (this.captureIsBusy()) throw new Error('Stop the current audio operation before importing.');
    const parsed = SessionSchema.parse(session);
    if (parsed.status !== 'complete') throw new Error('Only complete sessions can be imported.');
    this.cancelRevision();
    this.capture.clearRecording();
    this.publishSession(parsed);
    this.emit();
  }

  async refreshSavedSessions(): Promise<void> {
    if (this.repository === null) return;
    this.setStorageState('loading');
    try {
      const savedSessions = await this.repository.list();
      this.snapshot = { ...this.snapshot, savedSessions, storageError: null, storageState: 'idle' };
    } catch (error) {
      this.setStorageFailure(error);
    }
    this.emit();
  }

  async saveSession(): Promise<void> {
    if (this.repository === null) throw new Error('Local session storage is unavailable.');
    if (this.snapshot.session?.status !== 'complete') {
      throw new Error('Only a complete session can be saved.');
    }
    this.setStorageState('saving');
    try {
      const recording = this.capture.currentRecording;
      const session = this.updatedSession({
        recording: recording === null ? null : recordingMetadata(recording),
      });
      await this.repository.save({ recording, session });
      this.publishSession(session);
      const savedSessions = await this.repository.list();
      this.snapshot = { ...this.snapshot, savedSessions, storageError: null, storageState: 'idle' };
    } catch (error) {
      this.setStorageFailure(error);
    }
    this.emit();
  }

  async loadSavedSession(id: string): Promise<void> {
    if (this.repository === null) throw new Error('Local session storage is unavailable.');
    if (this.captureIsBusy()) throw new Error('Stop the current audio operation before loading.');
    this.setStorageState('loading');
    try {
      const value = await this.repository.get(id);
      if (value === null) throw new Error('The saved session no longer exists.');
      this.cancelRevision();
      if (value.recording === null) this.capture.clearRecording();
      else this.capture.loadRecording(value.recording);
      this.publishSession(value.session);
      this.snapshot = { ...this.snapshot, storageError: null, storageState: 'idle' };
    } catch (error) {
      this.setStorageFailure(error);
    }
    this.emit();
  }

  async deleteSavedSession(id: string): Promise<void> {
    if (this.repository === null) throw new Error('Local session storage is unavailable.');
    this.setStorageState('saving');
    try {
      await this.repository.delete(id);
      const savedSessions = await this.repository.list();
      this.snapshot = { ...this.snapshot, savedSessions, storageError: null, storageState: 'idle' };
    } catch (error) {
      this.setStorageFailure(error);
    }
    this.emit();
  }

  private readonly handleCaptureUpdate = () => {
    const previousState = this.snapshot.capture.state;
    const capture = this.capture.currentSnapshot;
    this.snapshot = { ...this.snapshot, capture };

    if (
      capture.state === 'recording' &&
      previousState !== 'paused' &&
      previousState !== 'recording'
    ) {
      this.beginRevision('recording', true);
    } else if (capture.state === 'replaying' && previousState !== 'replaying') {
      this.beginRevision('replay', this.snapshot.session === null);
    } else if (capture.state === 'paused') {
      this.setSessionStatus('paused');
    } else if (capture.state === 'recording' && previousState === 'paused') {
      this.setSessionStatus('recording');
    } else if (capture.state === 'stopping' || capture.state === 'replaying') {
      this.setSessionStatus('processing');
    } else if (capture.state === 'failed') {
      this.setSessionStatus('failed');
    } else if (capture.state === 'ready-to-replay' && this.revisionMode !== null) {
      this.setSessionStatus('processing');
    }
    this.emit();
  };

  private readonly handleAnalyzerUpdate = () => {
    if (this.revisionMode === null) return;
    this.captureActiveRunIds();
    const stagedEvents = this.collectActiveAudioEvents();
    if (this.revisionMode === 'recording') {
      this.replaceVisibleEvents(stagedEvents);
    }
    if (this.activeRunsAreComplete()) {
      this.replaceVisibleEvents(stagedEvents, 'complete', this.capture.currentRecording);
      this.revisionMode = null;
      this.snapshot = { ...this.snapshot, pendingRevision: false };
    }
    this.emit();
  };

  private beginRevision(mode: 'recording' | 'replay', createSession: boolean): void {
    this.revisionMode = mode;
    this.baselineAnalysisRunId = this.analysis.currentSnapshot.runId;
    this.baselinePolyphonicRunId = this.polyphonic.currentSnapshot.runId;
    this.activeAnalysisRunId = null;
    this.activePolyphonicRunId = null;
    if (createSession) this.createSession(mode === 'recording' ? 'recording' : 'processing');
    else this.setSessionStatus('processing');
    this.snapshot = { ...this.snapshot, pendingRevision: mode === 'replay' };
  }

  private createSession(status: Session['status']): void {
    const createdAt = this.now();
    const isoTimestamp = createdAt.toISOString();
    const session = SessionSchema.parse({
      corrections: [],
      createdAt: isoTimestamp,
      events: { audio: [], fused: [], visual: [] },
      id: this.idFactory(),
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      settings: this.settings,
      status,
      title: this.titleFactory(createdAt),
      updatedAt: isoTimestamp,
    });
    this.publishSession(session);
  }

  private setSessionStatus(status: Session['status']): void {
    if (this.snapshot.session === null || this.snapshot.session.status === status) return;
    this.publishSession(this.updatedSession({ status }));
  }

  private replaceVisibleEvents(
    audio: readonly AudioEvent[],
    status?: Session['status'],
    recording?: CapturedRecording | null,
  ): void {
    if (this.snapshot.session === null) return;
    this.publishSession(
      this.updatedSession({
        events: { ...this.snapshot.session.events, audio: [...audio] },
        ...(recording === undefined
          ? {}
          : { recording: recording === null ? null : recordingMetadata(recording) }),
        ...(status === undefined ? {} : { status }),
      }),
    );
  }

  private updatedSession(patch: Partial<Session>): Session {
    if (this.snapshot.session === null) throw new Error('No active session can be updated.');
    const now = this.now().toISOString();
    const updatedAt =
      Date.parse(now) < Date.parse(this.snapshot.session.updatedAt)
        ? this.snapshot.session.updatedAt
        : now;
    return SessionSchema.parse({ ...this.snapshot.session, ...patch, updatedAt });
  }

  private publishSession(session: Session): void {
    const interpretations =
      session.status === 'complete'
        ? interpretationsFor(session.events.audio)
        : { keys: [], scales: [] };
    this.snapshot = {
      ...this.snapshot,
      keyInterpretations: interpretations.keys,
      scaleInterpretations: interpretations.scales,
      session,
    };
  }

  private captureActiveRunIds(): void {
    const analysisRunId = this.analysis.currentSnapshot.runId;
    const polyphonicRunId = this.polyphonic.currentSnapshot.runId;
    if (this.activeAnalysisRunId === null && analysisRunId !== this.baselineAnalysisRunId) {
      this.activeAnalysisRunId = analysisRunId;
    }
    if (this.activePolyphonicRunId === null && polyphonicRunId !== this.baselinePolyphonicRunId) {
      this.activePolyphonicRunId = polyphonicRunId;
    }
  }

  private collectActiveAudioEvents(): AudioEvent[] {
    const events: AudioEvent[] = [];
    if (this.analysis.currentSnapshot.runId === this.activeAnalysisRunId) {
      events.push(...this.analysis.currentSnapshot.events);
    }
    if (this.polyphonic.currentSnapshot.runId === this.activePolyphonicRunId) {
      events.push(
        ...this.polyphonic.currentSnapshot.noteSetEvents,
        ...this.polyphonic.currentSnapshot.chordEvents,
      );
    }
    const byId = new Map(events.map((event) => [event.id, event]));
    return [...byId.values()].sort(
      (left, right) =>
        Number(left.time.startMs) - Number(right.time.startMs) ||
        left.kind.localeCompare(right.kind) ||
        left.id.localeCompare(right.id),
    );
  }

  private activeRunsAreComplete(): boolean {
    return (
      this.activeAnalysisRunId !== null &&
      this.activePolyphonicRunId !== null &&
      this.analysis.currentSnapshot.runId === this.activeAnalysisRunId &&
      this.polyphonic.currentSnapshot.runId === this.activePolyphonicRunId &&
      (this.analysis.currentSnapshot.runComplete || this.analysis.currentSnapshot.error !== null) &&
      (this.polyphonic.currentSnapshot.runComplete ||
        this.polyphonic.currentSnapshot.error !== null)
    );
  }

  private captureIsBusy(): boolean {
    return [
      'paused',
      'recording',
      'replaying',
      'requesting-permission',
      'starting',
      'stopping',
    ].includes(this.capture.currentSnapshot.state);
  }

  private cancelRevision(): void {
    this.revisionMode = null;
    this.activeAnalysisRunId = null;
    this.activePolyphonicRunId = null;
    this.snapshot = { ...this.snapshot, pendingRevision: false };
  }

  private sessionDurationMs(): number {
    const session = this.snapshot.session;
    if (session === null) return 0;
    return Math.max(
      session.recording?.durationMs ?? 0,
      ...session.events.audio.map((event) => Number(event.time.endMs ?? event.time.startMs)),
    );
  }

  private setStorageState(storageState: AudioSessionSnapshot['storageState']): void {
    this.snapshot = { ...this.snapshot, storageError: null, storageState };
    this.emit();
  }

  private setStorageFailure(error: unknown): void {
    this.snapshot = {
      ...this.snapshot,
      storageError: error instanceof Error ? error.message : 'The local session operation failed.',
      storageState: 'idle',
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
