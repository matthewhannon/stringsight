import { CapturedRecordingSchema, type CapturedRecording } from '../audio/capture';
import { SessionSchema, type Session, type SessionRecordingMetadata } from '../shared';

export type PersistedAudioSession = {
  readonly recording: CapturedRecording | null;
  readonly session: Session;
};

export type SavedSessionSummary = Pick<Session, 'createdAt' | 'id' | 'title' | 'updatedAt'> & {
  readonly durationMs: number | null;
  readonly hasRecording: boolean;
};

export type AudioSessionRepository = {
  delete(id: string): Promise<void>;
  get(id: string): Promise<PersistedAudioSession | null>;
  list(): Promise<readonly SavedSessionSummary[]>;
  save(value: PersistedAudioSession): Promise<void>;
};

export const recordingMetadata = (recording: CapturedRecording): SessionRecordingMetadata => ({
  channelCount: recording.channelCount,
  discontinuityCount: recording.discontinuityCount,
  durationMs: recording.durationMs,
  frameCount: recording.frameCount,
  recordedAt: recording.recordedAt,
  sampleRate: recording.sampleRate,
  schemaVersion: recording.schemaVersion,
  startedAtMs: recording.startedAtMs,
});

const recordingsMatch = (
  metadata: SessionRecordingMetadata,
  recording: CapturedRecording,
): boolean =>
  metadata.discontinuityCount === recording.discontinuityCount &&
  metadata.durationMs === recording.durationMs &&
  metadata.frameCount === recording.frameCount &&
  metadata.recordedAt === recording.recordedAt &&
  metadata.sampleRate === recording.sampleRate &&
  metadata.startedAtMs === recording.startedAtMs;

export function validatePersistedAudioSession(value: PersistedAudioSession): PersistedAudioSession {
  const session = SessionSchema.parse(value.session);
  const recording =
    value.recording === null ? null : CapturedRecordingSchema.parse(value.recording);
  if (session.status !== 'complete') throw new Error('Only complete sessions can be saved.');
  if (recording === null && session.recording !== null) {
    throw new Error('Session recording metadata is present, but its recording media is missing.');
  }
  if (recording !== null && session.recording === null) {
    throw new Error('Recording media is present, but the session metadata is missing.');
  }
  if (
    recording !== null &&
    session.recording !== null &&
    !recordingsMatch(session.recording, recording)
  ) {
    throw new Error('The recording media does not match the session metadata.');
  }
  return { recording, session };
}

const clonePersisted = (value: PersistedAudioSession): PersistedAudioSession => {
  const parsed = validatePersistedAudioSession(value);
  return {
    recording:
      parsed.recording === null
        ? null
        : { ...parsed.recording, data: new Float32Array(parsed.recording.data) },
    session: structuredClone(parsed.session),
  };
};

const summaryFor = (value: PersistedAudioSession): SavedSessionSummary => ({
  createdAt: value.session.createdAt,
  durationMs: value.session.recording?.durationMs ?? null,
  hasRecording: value.recording !== null,
  id: value.session.id,
  title: value.session.title,
  updatedAt: value.session.updatedAt,
});

export class MemoryAudioSessionRepository implements AudioSessionRepository {
  private readonly values = new Map<string, PersistedAudioSession>();

  delete(id: string): Promise<void> {
    this.values.delete(id);
    return Promise.resolve();
  }

  get(id: string): Promise<PersistedAudioSession | null> {
    const value = this.values.get(id);
    try {
      return Promise.resolve(value === undefined ? null : clonePersisted(value));
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Saved session validation failed.'),
      );
    }
  }

  list(): Promise<readonly SavedSessionSummary[]> {
    return Promise.resolve(
      [...this.values.values()]
        .map(summaryFor)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    );
  }

  save(value: PersistedAudioSession): Promise<void> {
    try {
      const cloned = clonePersisted(value);
      this.values.set(cloned.session.id, cloned);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error('Session validation failed.'),
      );
    }
  }
}
