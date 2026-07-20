import { describe, expect, it, vi } from 'vitest';

import { InitialAudioAnalysisSnapshot } from '../audio/analysis';
import { InitialCaptureSnapshot, MicrophoneCapture, type CaptureSnapshot } from '../audio/capture';
import {
  InitialPolyphonicAnalysisSnapshot,
  type PolyphonicAnalysisController,
} from '../audio/polyphonic';
import {
  AnalysisDisplayController,
  PolyphonicAnalysisDisplayController,
} from './analysisDisplayController';

class MutableSource<TSnapshot> {
  private readonly listeners = new Set<() => void>();
  currentSnapshot: TSnapshot;

  constructor(currentSnapshot: TSnapshot) {
    this.currentSnapshot = currentSnapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

describe('AnalysisDisplayController', () => {
  it('shows transient monitoring analysis without replacing the session analyzer state', () => {
    const capture = new MicrophoneCapture();
    let captureSnapshot: CaptureSnapshot = InitialCaptureSnapshot;
    let captureListener: (() => void) | null = null;
    Object.defineProperty(capture, 'currentSnapshot', { get: () => captureSnapshot });
    vi.spyOn(capture, 'subscribe').mockImplementation((listener) => {
      captureListener = () => listener(captureSnapshot);
      return vi.fn();
    });
    const monitoring = new MutableSource({
      ...InitialAudioAnalysisSnapshot,
      runId: 'monitoring-1',
    });
    const session = new MutableSource({ ...InitialAudioAnalysisSnapshot, runId: 'microphone-1' });
    const controller = new AnalysisDisplayController(capture, monitoring, session);
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(controller.currentSnapshot.runId).toBe('microphone-1');
    captureSnapshot = { ...captureSnapshot, connectionState: 'monitoring' };
    const notifyCapture = captureListener as unknown as () => void;
    notifyCapture();
    expect(controller.currentSnapshot.runId).toBe('monitoring-1');

    captureSnapshot = { ...captureSnapshot, operationState: 'recording' };
    notifyCapture();
    expect(controller.currentSnapshot.runId).toBe('microphone-1');
    captureSnapshot = { ...captureSnapshot, operationState: 'paused' };
    notifyCapture();
    expect(controller.currentSnapshot.runId).toBe('monitoring-1');
    expect(listener).toHaveBeenCalledTimes(3);

    controller.dispose();
  });

  it('applies chord profile changes to monitoring and session analyzers', () => {
    const capture = new MicrophoneCapture();
    vi.spyOn(capture, 'subscribe').mockReturnValue(vi.fn());
    const setMonitoringProfile = vi.fn();
    const setSessionProfile = vi.fn();
    const monitoring = {
      currentSnapshot: InitialPolyphonicAnalysisSnapshot,
      setChordAnalysisProfile: setMonitoringProfile,
      subscribe: () => vi.fn(),
    } as unknown as PolyphonicAnalysisController;
    const session = {
      currentSnapshot: InitialPolyphonicAnalysisSnapshot,
      setChordAnalysisProfile: setSessionProfile,
      subscribe: () => vi.fn(),
    } as unknown as PolyphonicAnalysisController;
    const controller = new PolyphonicAnalysisDisplayController(capture, monitoring, session);

    controller.setChordAnalysisProfile('responsive');

    expect(setMonitoringProfile).toHaveBeenCalledWith('responsive');
    expect(setSessionProfile).toHaveBeenCalledWith('responsive');
    controller.dispose();
  });
});
