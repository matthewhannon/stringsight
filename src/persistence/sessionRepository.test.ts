import { describe, expect, it } from 'vitest';

import { CapturedRecordingSchema } from '../audio/capture';
import { CONTRACT_SCHEMA_VERSION, SessionSchema } from '../shared';
import { MemoryAudioSessionRepository, recordingMetadata } from './sessionRepository';

const recording = CapturedRecordingSchema.parse({
  channelCount: 1,
  data: new Float32Array([0.1, -0.1]),
  discontinuityCount: 0,
  durationMs: 2,
  frameCount: 2,
  recordedAt: '2026-07-19T12:00:00.000Z',
  sampleRate: 1000,
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  startedAtMs: 0,
});

const session = SessionSchema.parse({
  corrections: [],
  createdAt: '2026-07-19T12:00:00.000Z',
  events: { audio: [], fused: [], visual: [] },
  id: 'session-1',
  recording: recordingMetadata(recording),
  schemaVersion: CONTRACT_SCHEMA_VERSION,
  settings: {
    handedness: 'right',
    maxFret: 24,
    remoteAnalysisEnabled: false,
    tuningMidiLowToHigh: [40, 45, 50, 55, 59, 64],
    visionEnabled: false,
  },
  status: 'complete',
  title: 'Saved session',
  updatedAt: '2026-07-19T12:01:00.000Z',
});

describe('MemoryAudioSessionRepository', () => {
  it('saves, lists, reloads, and deletes validated structured data and PCM', async () => {
    const repository = new MemoryAudioSessionRepository();
    await repository.save({ recording, session });
    recording.data[0] = 0.9;

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ hasRecording: true, id: 'session-1', title: 'Saved session' }),
    ]);
    const restored = await repository.get('session-1');
    expect(restored?.recording?.data[0]).toBeCloseTo(0.1);
    expect(restored?.session).toEqual(session);
    await repository.delete('session-1');
    await expect(repository.get('session-1')).resolves.toBeNull();
  });

  it('rejects mismatched media and incomplete sessions at the repository boundary', async () => {
    const repository = new MemoryAudioSessionRepository();
    await expect(repository.save({ recording: null, session })).rejects.toThrow(
      /media is missing/i,
    );
    await expect(
      repository.save({
        recording,
        session: SessionSchema.parse({ ...session, status: 'failed' }),
      }),
    ).rejects.toThrow(/only complete sessions/i);
  });
});
