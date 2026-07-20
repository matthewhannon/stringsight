import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  CLIPPING_THRESHOLD,
  MicrophoneCapture,
  SILENCE_RMS_THRESHOLD,
  amplitudeToDbfs,
  dbfsToMeterPercent,
  decodePcmWavRecording,
  type CaptureSnapshot,
} from '../audio/capture';
import { rackEmbeddedClassNames, type RackSourceOption } from '../ui/rack';
import { AudioInputDisplay, type AudioInputDetail } from './audio-input/AudioInputDisplay';
import { AudioLevelMeter } from './audio-input/AudioLevelMeter';
import { AudioSourceRail } from './audio-input/AudioSourceRail';
import { AudioTransportFaceplate } from './audio-input/AudioTransportFaceplate';
import { defaultMicrophoneCapture } from './audioCaptureController';
import './audioCapturePanel.css';

type AudioCapturePanelProps = {
  capture?: MicrophoneCapture;
  embedded?: boolean;
};

const warningMessages: Partial<Record<NonNullable<CaptureSnapshot['warning']>, string>> = {
  clipping: 'The input is clipping. Lower your interface or microphone gain.',
  'device-ended': 'The microphone disconnected. Your captured audio was preserved.',
  'maximum-duration-reached':
    'Maximum recording duration reached. The accepted take completed successfully.',
};

const formatDuration = (milliseconds: number): string => {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(totalTenths % 10)}`;
};

const inputStateLabel = (snapshot: CaptureSnapshot): string => {
  if (snapshot.connectionState === 'connecting') return 'Starting';
  if (snapshot.connectionState === 'failed') return 'Attention';
  if (snapshot.connectionState === 'unsupported') return 'Unsupported';
  if (snapshot.connectionState === 'monitoring') {
    return snapshot.operationState === 'failed' ? 'Attention' : 'Active';
  }
  return 'Standby';
};

const recordStateLabel = (snapshot: CaptureSnapshot, canRecord: boolean): string => {
  if (snapshot.operationState === 'recording') return 'Recording';
  if (snapshot.operationState === 'paused') return 'Paused';
  if (snapshot.operationState === 'finalizing') return 'Finishing';
  if (canRecord) return 'Ready';
  return 'Locked';
};

export function AudioCapturePanel({ capture, embedded = false }: AudioCapturePanelProps) {
  const controller = capture ?? defaultMicrophoneCapture;
  const [activeDetail, setActiveDetail] = useState<AudioInputDetail>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceEnumerationError, setDeviceEnumerationError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedFilename, setImportedFilename] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const queuedDeviceSwitch = useRef<string | null>(null);
  const recordingFileInput = useRef<HTMLInputElement>(null);
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.currentSnapshot, [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refreshDevices = useCallback(async () => {
    try {
      const nextDevices = await controller.listInputDevices();
      setDevices(nextDevices);
      setDeviceEnumerationError(null);
      setSelectedDeviceId((current) =>
        current === '' && nextDevices.length === 1 ? (nextDevices[0]?.deviceId ?? '') : current,
      );
    } catch {
      setDevices([]);
      setDeviceEnumerationError(
        'Input sources could not be listed. System default remains available; refresh to retry.',
      );
    }
  }, [controller]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshDevices(), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshDevices]);

  const inputOn = ['connecting', 'monitoring'].includes(snapshot.connectionState);
  const canRecord =
    !isImporting &&
    snapshot.connectionState === 'monitoring' &&
    ['idle', 'failed'].includes(snapshot.operationState);
  const operationBusy = !['idle', 'failed'].includes(snapshot.operationState);
  const loadDisabled = isImporting || operationBusy || snapshot.connectionState === 'connecting';
  const peakDbfs = amplitudeToDbfs(snapshot.peak);
  const meterPercent = dbfsToMeterPercent(peakDbfs);
  const levelText = snapshot.peak === 0 ? '≤ −80 dBFS' : `${peakDbfs.toFixed(1)} dBFS`;
  const activeWarning = snapshot.warning === null ? undefined : warningMessages[snapshot.warning];
  const signalActive =
    snapshot.connectionState === 'monitoring' && snapshot.rms >= SILENCE_RMS_THRESHOLD;
  const peakActive = snapshot.warning === 'clipping' || snapshot.peak >= CLIPPING_THRESHOLD;
  const recordPressed = ['recording', 'paused', 'finalizing'].includes(snapshot.operationState);
  const canStopRecording = ['recording', 'paused'].includes(snapshot.operationState);

  const sourceOptions = useMemo<readonly RackSourceOption[]>(
    () => [
      { label: 'System default', value: '' },
      ...devices.map((device, index) => ({
        label: device.label || `Microphone ${String(index + 1)}`,
        value: device.deviceId,
      })),
    ],
    [devices],
  );

  const switchConnectedSource = useCallback(
    (deviceId: string) => {
      void controller.switchInputDevice(deviceId || undefined).then(refreshDevices);
    },
    [controller, refreshDevices],
  );

  const selectSource = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (!['connecting', 'monitoring'].includes(controller.currentSnapshot.connectionState)) return;
    if (isImporting) {
      queuedDeviceSwitch.current = deviceId;
      return;
    }
    switchConnectedSource(deviceId);
  };

  const loadRecording = async (file: File): Promise<void> => {
    setImportError(null);
    setImportedFilename(null);
    setIsImporting(true);
    try {
      const recordedAt =
        Number.isFinite(file.lastModified) && file.lastModified > 0
          ? new Date(file.lastModified).toISOString()
          : new Date().toISOString();
      const recording = decodePcmWavRecording(await file.arrayBuffer(), { recordedAt });
      controller.loadRecording(recording);
      setImportedFilename(file.name);
      await controller.replay();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The WAV recording could not load.');
    } finally {
      setIsImporting(false);
      const queuedDeviceId = queuedDeviceSwitch.current;
      queuedDeviceSwitch.current = null;
      if (
        queuedDeviceId !== null &&
        ['connecting', 'monitoring'].includes(controller.currentSnapshot.connectionState)
      ) {
        switchConnectedSource(queuedDeviceId);
      }
    }
  };

  const contextTransport = (() => {
    if (snapshot.operationState === 'recording') {
      return { disabled: false, label: 'Pause', onClick: () => void controller.pause() };
    }
    if (snapshot.operationState === 'paused') {
      return { disabled: false, label: 'Resume', onClick: () => void controller.resume() };
    }
    if (snapshot.operationState === 'replaying') {
      return { disabled: false, label: 'Stop replay', onClick: () => controller.stopReplay() };
    }
    if (snapshot.operationState === 'finalizing') {
      return { disabled: true, label: 'Replay', onClick: () => undefined };
    }
    return {
      disabled: isImporting || controller.currentRecording === null,
      label: 'Replay',
      onClick: () => void controller.replay(),
    };
  })();

  return (
    <section
      aria-label={embedded ? 'Audio capture controls' : undefined}
      aria-labelledby={embedded ? undefined : 'capture-title'}
      className={`audio-input-section ${embedded ? rackEmbeddedClassNames.section : ''}`.trim()}
      id="capture"
    >
      {!embedded && <h2 id="capture-title">Audio input</h2>}

      <div className="audio-input-console">
        <div className="audio-input-signal-panel">
          <AudioInputDisplay
            detail={activeDetail}
            elapsed={formatDuration(snapshot.elapsedMs)}
            inputOff={!inputOn && snapshot.operationState !== 'replaying'}
            onRefreshSources={() => void refreshDevices()}
            snapshot={snapshot}
            values={snapshot.waveform}
          />
          <AudioLevelMeter meterPercent={meterPercent} valueText={levelText} />

          <div className="audio-input-messages" aria-live="polite">
            {activeWarning !== undefined && (
              <p className="audio-input-warning" role="status">
                {activeWarning}
              </p>
            )}
            {snapshot.error !== null && (
              <div className="audio-input-error" role="alert">
                <strong>{snapshot.error.message}</strong>
                <span>Recommended action: {snapshot.error.userAction.replaceAll('-', ' ')}</span>
              </div>
            )}
            {importError !== null && (
              <div className="audio-input-error" role="alert">
                <strong>{importError}</strong>
                <span>
                  Select a PCM WAV recording exported by StringSight or another audio tool.
                </span>
              </div>
            )}
            {importedFilename !== null && importError === null && (
              <p className="audio-input-success" role="status">
                Loaded and analyzed {importedFilename}.
              </p>
            )}
          </div>

          <AudioTransportFaceplate
            contextTransport={contextTransport}
            inputDisabled={
              isImporting ||
              snapshot.connectionState === 'connecting' ||
              snapshot.connectionState === 'unsupported' ||
              snapshot.operationState === 'finalizing'
            }
            inputOn={inputOn}
            inputStateLabel={inputStateLabel(snapshot)}
            loadDisabled={loadDisabled}
            loadLabel={isImporting ? 'Loading' : 'Load'}
            onInputChange={(on) => {
              setImportError(null);
              if (on) void controller.connect(selectedDeviceId || undefined).then(refreshDevices);
              else void controller.disconnect();
            }}
            onLoad={() => recordingFileInput.current?.click()}
            onRecord={() =>
              void (canStopRecording ? controller.stop() : controller.startRecording())
            }
            peakActive={peakActive}
            recordActionLabel={
              canStopRecording
                ? 'Stop recording'
                : snapshot.operationState === 'finalizing'
                  ? 'Finishing recording'
                  : 'Record'
            }
            recordDisabled={!canRecord && !canStopRecording}
            recordPressed={recordPressed}
            recording={snapshot.operationState === 'recording'}
            recordStateLabel={recordStateLabel(snapshot, canRecord)}
            signalActive={signalActive}
          />

          <input
            accept=".wav,audio/wav,audio/x-wav"
            aria-hidden="true"
            className="recording-file-input"
            disabled={loadDisabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file !== undefined) void loadRecording(file);
            }}
            ref={recordingFileInput}
            tabIndex={-1}
            type="file"
          />
        </div>

        <AudioSourceRail
          activeDetail={activeDetail}
          deviceEnumerationError={deviceEnumerationError}
          onDetailChange={setActiveDetail}
          onSourceChange={selectSource}
          options={sourceOptions}
          selectedSource={selectedDeviceId}
        />
      </div>
    </section>
  );
}
