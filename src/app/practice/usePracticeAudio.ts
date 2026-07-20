import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import type { AudioAnalysisSnapshot } from '../../audio/analysis';
import type { CaptureSnapshot } from '../../audio/capture';
import type { PolyphonicAnalysisSnapshot } from '../../audio/polyphonic';
import {
  defaultAudioSession,
  defaultDisplayedAudioAnalysis,
  defaultDisplayedPolyphonicAnalysis,
  defaultMicrophoneCapture,
} from '../audioCaptureController';
import type { AudioSessionSnapshot } from '../audioSessionController';

export type AudioCapabilities = {
  canConnect: boolean;
  canDisconnect: boolean;
  canPause: boolean;
  canRecord: boolean;
  canReplay: boolean;
  canResume: boolean;
  canStop: boolean;
  canStopReplay: boolean;
};

export type PracticeAudioModel = {
  actionError: string | null;
  capabilities: AudioCapabilities;
  capture: CaptureSnapshot;
  chordAnalysis: PolyphonicAnalysisSnapshot;
  connect: () => Promise<void>;
  devices: readonly MediaDeviceInfo[];
  disconnect: () => Promise<void>;
  noteAnalysis: AudioAnalysisSnapshot;
  pauseOrResume: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  replay: () => Promise<void>;
  selectedDeviceId: string;
  session: AudioSessionSnapshot;
  setSelectedDeviceId: (deviceId: string) => void;
  stopReplay: () => void;
  toggleRecord: () => Promise<void>;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'The audio action could not be completed.';

export const capabilitiesFor = (capture: CaptureSnapshot): AudioCapabilities => {
  const recoverableOperation = ['idle', 'failed'].includes(capture.operationState);
  const connected = capture.connectionState === 'monitoring';
  return {
    canConnect:
      recoverableOperation &&
      (capture.connectionState === 'disconnected' || capture.connectionState === 'failed'),
    canDisconnect: connected,
    canPause: capture.operationState === 'recording',
    canRecord: connected && recoverableOperation,
    canReplay: recoverableOperation && capture.bufferedDurationMs > 0,
    canResume: capture.operationState === 'paused',
    canStop: capture.operationState === 'recording' || capture.operationState === 'paused',
    canStopReplay: capture.operationState === 'replaying',
  };
};

export function usePracticeAudio(): PracticeAudioModel {
  const [actionError, setActionError] = useState<string | null>(null);
  const [devices, setDevices] = useState<readonly MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const capture = useSyncExternalStore(
    useCallback((listener: () => void) => defaultMicrophoneCapture.subscribe(listener), []),
    useCallback(() => defaultMicrophoneCapture.currentSnapshot, []),
    useCallback(() => defaultMicrophoneCapture.currentSnapshot, []),
  );
  const noteAnalysis = useSyncExternalStore(
    useCallback((listener: () => void) => defaultDisplayedAudioAnalysis.subscribe(listener), []),
    useCallback(() => defaultDisplayedAudioAnalysis.currentSnapshot, []),
    useCallback(() => defaultDisplayedAudioAnalysis.currentSnapshot, []),
  );
  const chordAnalysis = useSyncExternalStore(
    useCallback(
      (listener: () => void) => defaultDisplayedPolyphonicAnalysis.subscribe(listener),
      [],
    ),
    useCallback(() => defaultDisplayedPolyphonicAnalysis.currentSnapshot, []),
    useCallback(() => defaultDisplayedPolyphonicAnalysis.currentSnapshot, []),
  );
  const session = useSyncExternalStore(
    useCallback((listener: () => void) => defaultAudioSession.subscribe(listener), []),
    useCallback(() => defaultAudioSession.currentSnapshot, []),
    useCallback(() => defaultAudioSession.currentSnapshot, []),
  );
  const capabilities = useMemo(() => capabilitiesFor(capture), [capture]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    await run(async () => {
      const nextDevices = await defaultMicrophoneCapture.listInputDevices();
      setDevices(nextDevices);
      setSelectedDeviceId((current) => {
        if (nextDevices.some(({ deviceId }) => deviceId === current)) return current;
        return nextDevices.length === 1 ? (nextDevices[0]?.deviceId ?? '') : '';
      });
    });
  }, [run]);

  const connect = useCallback(async () => {
    if (!capabilities.canConnect) return;
    await run(async () => {
      await defaultMicrophoneCapture.connect(
        selectedDeviceId === '' ? undefined : selectedDeviceId,
      );
      setDevices(await defaultMicrophoneCapture.listInputDevices());
    });
  }, [capabilities.canConnect, run, selectedDeviceId]);

  const disconnect = useCallback(async () => {
    if (!capabilities.canDisconnect) return;
    await run(async () => defaultMicrophoneCapture.disconnect());
  }, [capabilities.canDisconnect, run]);

  const replay = useCallback(async () => {
    if (!capabilities.canReplay) return;
    await run(async () => defaultMicrophoneCapture.replay());
  }, [capabilities.canReplay, run]);

  const pauseOrResume = useCallback(async () => {
    if (!capabilities.canPause && !capabilities.canResume) return;
    await run(async () =>
      capabilities.canResume ? defaultMicrophoneCapture.resume() : defaultMicrophoneCapture.pause(),
    );
  }, [capabilities.canPause, capabilities.canResume, run]);

  const toggleRecord = useCallback(async () => {
    if (!capabilities.canRecord && !capabilities.canStop) return;
    await run(async () => {
      if (capabilities.canStop) {
        await defaultMicrophoneCapture.stop();
        return;
      }
      await defaultMicrophoneCapture.startRecording();
    });
  }, [capabilities.canRecord, capabilities.canStop, run]);

  return {
    actionError,
    capabilities,
    capture,
    chordAnalysis,
    connect,
    devices,
    disconnect,
    noteAnalysis,
    pauseOrResume,
    refreshDevices,
    replay,
    selectedDeviceId,
    session,
    setSelectedDeviceId,
    stopReplay: () => {
      if (capabilities.canStopReplay) defaultMicrophoneCapture.stopReplay();
    },
    toggleRecord,
  };
}
