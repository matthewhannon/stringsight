import { describe, expect, it, vi } from 'vitest';

import { InitialAudioAnalysisSnapshot, type AudioAnalysisSnapshot } from '../audio/analysis';
import {
  CapturedRecordingSchema,
  InitialCaptureSnapshot,
  type CapturedRecording,
  type CaptureSnapshot,
} from '../audio/capture';
import {
  InitialPolyphonicAnalysisSnapshot,
  type PolyphonicAnalysisSnapshot,
} from '../audio/polyphonic';
import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  type ChordEvent,
  type PitchClass,
} from '../shared';
import { MemoryAudioSessionRepository } from '../persistence';
import { AudioSessionController } from './audioSessionController';

class MutableCaptureSource {
  private readonly listeners = new Set<(snapshot: CaptureSnapshot) => void>();
  private snapshot: CaptureSnapshot = InitialCaptureSnapshot;
  currentRecording: CapturedRecording | null = null;

  get currentSnapshot(): CaptureSnapshot {
    return this.snapshot;
  }

  set(snapshot: CaptureSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  clearRecording(): void {
    this.currentRecording = null;
    this.set({ ...InitialCaptureSnapshot, state: 'idle' });
  }

  loadRecording(recording: CapturedRecording): void {
    this.currentRecording = recording;
    this.set({
      ...InitialCaptureSnapshot,
      bufferedDurationMs: recording.durationMs,
      state: 'ready-to-replay',
    });
  }

  subscribe(listener: (snapshot: CaptureSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

class MutableSnapshotSource<TSnapshot> {
  private readonly listeners = new Set<() => void>();
  currentSnapshot: TSnapshot;

  constructor(currentSnapshot: TSnapshot) {
    this.currentSnapshot = currentSnapshot;
  }

  set(snapshot: TSnapshot): void {
    this.currentSnapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const chordEvent = (
  id: string,
  pitchClasses: readonly PitchClass[],
  root: PitchClass,
  symbol: string,
  startMs: number,
  endMs: number,
  runId: string,
): ChordEvent =>
  ChordEventSchema.parse({
    candidates: [
      {
        confidence: 0.9,
        pitchClasses,
        quality: symbol.endsWith('m') ? 'minor' : 'major',
        rank: 1,
        root,
        score: 0.9,
        symbol,
      },
    ],
    diagnostics: {},
    id,
    kind: 'chord',
    lifecycle: 'finalized',
    provenance: {
      algorithm: 'session-controller-test',
      generatedAtMs: endMs,
      runId,
      subsystem: 'polyphonic-analysis',
      version: '1.0.0',
    },
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { endMs, startMs },
  });

const cMajorEvents = (runId: string): ChordEvent[] => [
  chordEvent(`${runId}-c-1`, ['C', 'E', 'G'], 'C', 'C', 0, 1000, runId),
  chordEvent(`${runId}-f`, ['F', 'A', 'C'], 'F', 'F', 1000, 2000, runId),
  chordEvent(`${runId}-g`, ['G', 'B', 'D'], 'G', 'G', 2000, 3000, runId),
  chordEvent(`${runId}-c-2`, ['C', 'E', 'G'], 'C', 'C', 3000, 5000, runId),
];

const aMinorEvents = (runId: string): ChordEvent[] => [
  chordEvent(`${runId}-am-1`, ['A', 'C', 'E'], 'A', 'Am', 0, 1000, runId),
  chordEvent(`${runId}-dm`, ['D', 'F', 'A'], 'D', 'Dm', 1000, 2000, runId),
  chordEvent(`${runId}-em`, ['E', 'G', 'B'], 'E', 'Em', 2000, 3000, runId),
  chordEvent(`${runId}-am-2`, ['A', 'C', 'E'], 'A', 'Am', 3000, 5000, runId),
];

describe('AudioSessionController', () => {
  it('aggregates a live session and replaces replay results only after both analyzers complete', () => {
    const capture = new MutableCaptureSource();
    const analysis = new MutableSnapshotSource<AudioAnalysisSnapshot>(InitialAudioAnalysisSnapshot);
    const polyphonic = new MutableSnapshotSource<PolyphonicAnalysisSnapshot>(
      InitialPolyphonicAnalysisSnapshot,
    );
    const controller = new AudioSessionController(capture, analysis, polyphonic, {
      idFactory: () => 'session-1',
      now: () => new Date('2026-07-18T20:00:00.000Z'),
      titleFactory: () => 'Test session',
    });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    capture.set({ ...InitialCaptureSnapshot, state: 'recording' });
    expect(controller.currentSnapshot.session).toMatchObject({
      id: 'session-1',
      status: 'recording',
      title: 'Test session',
    });

    analysis.set({
      ...InitialAudioAnalysisSnapshot,
      runComplete: false,
      runId: 'microphone-1',
    });
    const microphoneEvents = cMajorEvents('microphone-1');
    const microphoneSnapshot = {
      ...InitialPolyphonicAnalysisSnapshot,
      chordEvents: microphoneEvents,
      currentChord: microphoneEvents.at(-1) ?? null,
      runComplete: false,
      runId: 'microphone-1',
    } satisfies PolyphonicAnalysisSnapshot;
    const inputSnapshot = structuredClone(microphoneSnapshot);
    polyphonic.set(microphoneSnapshot);

    expect(microphoneSnapshot).toEqual(inputSnapshot);
    expect(controller.currentSnapshot.session?.events.audio).toHaveLength(4);
    expect(controller.currentSnapshot.keyInterpretations).toEqual([]);
    expect(controller.currentSnapshot.scaleInterpretations).toEqual([]);

    capture.set({ ...capture.currentSnapshot, state: 'paused' });
    expect(controller.currentSnapshot.session?.status).toBe('paused');
    capture.set({ ...capture.currentSnapshot, state: 'recording' });
    expect(controller.currentSnapshot.session?.status).toBe('recording');
    capture.set({ ...capture.currentSnapshot, state: 'stopping' });
    capture.set({ ...capture.currentSnapshot, state: 'ready-to-replay' });
    expect(controller.currentSnapshot.session?.status).toBe('processing');

    analysis.set({ ...analysis.currentSnapshot, runComplete: true });
    expect(controller.currentSnapshot.session?.status).toBe('processing');
    polyphonic.set({ ...polyphonic.currentSnapshot, runComplete: true });
    expect(controller.currentSnapshot.session?.status).toBe('complete');
    expect(controller.currentSnapshot.keyInterpretations[0]?.key.name).toBe('C major');
    expect(controller.currentSnapshot.scaleInterpretations[0]?.scale.name).toBe('C major');
    const committedIds = controller.currentSnapshot.session?.events.audio.map(({ id }) => id);

    capture.set({ ...capture.currentSnapshot, state: 'replaying' });
    expect(controller.currentSnapshot.pendingRevision).toBe(true);
    expect(controller.currentSnapshot.session?.events.audio.map(({ id }) => id)).toEqual(
      committedIds,
    );

    analysis.set({
      ...InitialAudioAnalysisSnapshot,
      runComplete: false,
      runId: 'replay-2',
    });
    polyphonic.set({
      ...InitialPolyphonicAnalysisSnapshot,
      runComplete: false,
      runId: 'replay-2',
    });
    expect(controller.currentSnapshot.session?.events.audio.map(({ id }) => id)).toEqual(
      committedIds,
    );

    const replayEvents = aMinorEvents('replay-2');
    polyphonic.set({
      ...polyphonic.currentSnapshot,
      chordEvents: replayEvents,
      currentChord: replayEvents.at(-1) ?? null,
    });
    capture.set({ ...capture.currentSnapshot, state: 'ready-to-replay' });
    analysis.set({ ...analysis.currentSnapshot, runComplete: true });
    expect(controller.currentSnapshot.session?.events.audio.map(({ id }) => id)).toEqual(
      committedIds,
    );
    polyphonic.set({ ...polyphonic.currentSnapshot, runComplete: true });

    expect(controller.currentSnapshot.pendingRevision).toBe(false);
    expect(controller.currentSnapshot.session).toMatchObject({
      id: 'session-1',
      status: 'complete',
    });
    expect(controller.currentSnapshot.session?.events.audio.map(({ id }) => id)).toEqual(
      replayEvents.map(({ id }) => id),
    );
    expect(controller.currentSnapshot.keyInterpretations[0]?.key.name).toBe('A minor');
    expect(controller.currentSnapshot.scaleInterpretations[0]?.scale.name).toBe('A natural-minor');
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    controller.dispose();
  });

  it('creates a session for imported replay and preserves capture failures', () => {
    const capture = new MutableCaptureSource();
    const analysis = new MutableSnapshotSource<AudioAnalysisSnapshot>(InitialAudioAnalysisSnapshot);
    const polyphonic = new MutableSnapshotSource<PolyphonicAnalysisSnapshot>(
      InitialPolyphonicAnalysisSnapshot,
    );
    const controller = new AudioSessionController(capture, analysis, polyphonic, {
      idFactory: () => 'imported-session',
      now: () => new Date('2026-07-18T20:00:00.000Z'),
    });

    capture.set({ ...InitialCaptureSnapshot, state: 'replaying' });
    expect(controller.currentSnapshot.session).toMatchObject({
      id: 'imported-session',
      status: 'processing',
    });
    capture.set({ ...capture.currentSnapshot, state: 'failed' });
    expect(controller.currentSnapshot.session?.status).toBe('failed');
    controller.dispose();
  });

  it('keeps corrections append-only and saves and restores structured events with recording media', async () => {
    const capture = new MutableCaptureSource();
    const analysis = new MutableSnapshotSource<AudioAnalysisSnapshot>(InitialAudioAnalysisSnapshot);
    const polyphonic = new MutableSnapshotSource<PolyphonicAnalysisSnapshot>(
      InitialPolyphonicAnalysisSnapshot,
    );
    const repository = new MemoryAudioSessionRepository();
    let id = 0;
    const controller = new AudioSessionController(capture, analysis, polyphonic, {
      idFactory: () => `id-${String(++id)}`,
      now: () => new Date('2026-07-18T20:00:00.000Z'),
      repository,
    });
    capture.currentRecording = CapturedRecordingSchema.parse({
      channelCount: 1,
      data: new Float32Array([0.1, -0.1]),
      discontinuityCount: 0,
      durationMs: 2,
      frameCount: 2,
      recordedAt: '2026-07-18T20:00:00.000Z',
      sampleRate: 1000,
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      startedAtMs: 0,
    });
    capture.set({ ...InitialCaptureSnapshot, state: 'recording' });
    analysis.set({ ...InitialAudioAnalysisSnapshot, runComplete: false, runId: 'run-1' });
    const events = cMajorEvents('run-1');
    polyphonic.set({
      ...InitialPolyphonicAnalysisSnapshot,
      chordEvents: events,
      runComplete: false,
      runId: 'run-1',
    });
    analysis.set({ ...analysis.currentSnapshot, runComplete: true });
    polyphonic.set({ ...polyphonic.currentSnapshot, runComplete: true });

    const rawEvents = structuredClone(controller.currentSnapshot.session?.events.audio);
    controller.appendCorrection({ chordSymbol: 'Cmaj7', eventId: events[0]?.id ?? '' });
    controller.revertCorrection(events[0]?.id ?? '');
    expect(controller.currentSnapshot.session?.corrections).toHaveLength(2);
    expect(controller.currentSnapshot.session?.events.audio).toEqual(rawEvents);

    await controller.saveSession();
    expect(controller.currentSnapshot.savedSessions).toHaveLength(1);
    capture.clearRecording();
    await controller.loadSavedSession(controller.currentSnapshot.session?.id ?? '');
    expect(capture.currentRecording.data).toEqual(new Float32Array([0.1, -0.1]));
    expect(controller.currentSnapshot.session?.corrections).toHaveLength(2);
    controller.dispose();
  });
});
