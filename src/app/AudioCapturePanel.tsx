import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  MicrophoneCapture,
  amplitudeToDbfs,
  analyzePcm,
  createCalibrationTone,
  createCalibrationReferenceRecording,
  dbfsToMeterPercent,
  downsampleWaveform,
  decodePcmWavRecording,
  encodeMonoPcm16Wav,
  measureCalibrationTone,
  type CalibrationToneMeasurement,
  type CaptureSnapshot,
} from '../audio/capture';
import { defaultMicrophoneCapture } from './audioCaptureController';
import { rackEmbeddedClassNames } from '../ui/rack';

type AudioCapturePanelProps = {
  capture?: MicrophoneCapture;
  embedded?: boolean;
};

const connectionLabels: Record<CaptureSnapshot['connectionState'], string> = {
  connecting: 'Connecting microphone',
  disconnected: 'Microphone disconnected',
  failed: 'Microphone needs attention',
  monitoring: 'Microphone connected',
  unsupported: 'Browser unsupported',
};

const operationLabels: Record<CaptureSnapshot['operationState'], string> = {
  failed: 'Recording needs attention',
  finalizing: 'Finalizing recording',
  idle: 'Not recording',
  paused: 'Paused',
  recording: 'Recording',
  replaying: 'Replaying',
};

const warningMessages: Record<NonNullable<CaptureSnapshot['warning']>, string> = {
  clipping: 'The input is clipping. Lower your interface or microphone gain.',
  'device-ended': 'The microphone disconnected. Your captured audio is being preserved.',
  'maximum-duration-reached':
    'Maximum recording duration reached. The accepted take was finalized successfully.',
  silence: 'No clear input is reaching StringSight. Check the selected device and its gain.',
};

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((milliseconds % 1_000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(tenths)}`;
};

const settingLabel = (setting: boolean | null): string =>
  setting === null ? 'Not reported' : setting ? 'On' : 'Off';

const CALIBRATION_PEAK_DBFS = -24;

type DisplaySignal = {
  peak: number;
  waveform: readonly number[];
};

function Waveform({ values }: { values: readonly number[] }) {
  const points = values.length === 0 ? [0] : values;
  const maximumMagnitude = points.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
  const displayGain = maximumMagnitude === 0 ? 1 : Math.min(8, 0.8 / maximumMagnitude);
  const path = points
    .map((value, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = 50 - value * displayGain * 44;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      aria-label="Audio waveform (display auto-scaled)"
      className="waveform"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 100"
    >
      <line className="waveform-center" x1="0" x2="100" y1="50" y2="50" />
      <path className="waveform-line" d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AudioCapturePanel({ capture, embedded = false }: AudioCapturePanelProps) {
  const controller = capture ?? defaultMicrophoneCapture;
  const [calibrationSignal, setCalibrationSignal] = useState<DisplaySignal | null>(null);
  const [calibrationMeasurement, setCalibrationMeasurement] =
    useState<CalibrationToneMeasurement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedFilename, setImportedFilename] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
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
      if (selectedDeviceId === '' && nextDevices.length === 1) {
        setSelectedDeviceId(nextDevices[0]?.deviceId ?? '');
      }
    } catch {
      setDevices([]);
    }
  }, [controller, selectedDeviceId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshDevices(), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshDevices]);

  const operationBusy = !['idle', 'failed'].includes(snapshot.operationState);
  const isBusy = operationBusy || snapshot.connectionState === 'connecting' || isImporting;
  const canConnect = !isBusy && ['disconnected', 'failed'].includes(snapshot.connectionState);
  const canRecord =
    !isImporting &&
    snapshot.connectionState === 'monitoring' &&
    ['idle', 'failed'].includes(snapshot.operationState);
  const statusKey =
    snapshot.operationState === 'idle' ? snapshot.connectionState : snapshot.operationState;
  const statusLabel =
    snapshot.operationState === 'idle'
      ? connectionLabels[snapshot.connectionState]
      : operationLabels[snapshot.operationState];
  const displaySignal = calibrationSignal ?? snapshot;
  const peakDbfs = amplitudeToDbfs(displaySignal.peak);
  const meterPercent = dbfsToMeterPercent(peakDbfs);
  const levelText = displaySignal.peak === 0 ? '≤ −80 dBFS' : `${peakDbfs.toFixed(1)} dBFS`;

  const runMeterCheck = () => {
    const samples = createCalibrationTone({ peakDbfs: CALIBRATION_PEAK_DBFS });
    const diagnostics = analyzePcm(samples);
    setCalibrationSignal({
      peak: diagnostics.peak,
      waveform: downsampleWaveform(samples),
    });
  };

  const downloadCalibrationReference = () => {
    const recording = createCalibrationReferenceRecording({ peakDbfs: CALIBRATION_PEAK_DBFS });
    const url = URL.createObjectURL(
      new Blob([encodeMonoPcm16Wav(recording)], { type: 'audio/wav' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'stringsight-reference-1khz-minus-24dbfs.wav';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const measureLastCapture = () => {
    if (controller.currentRecording === null) return;
    setCalibrationMeasurement(
      measureCalibrationTone(controller.currentRecording, {
        expectedPeakDbfs: CALIBRATION_PEAK_DBFS,
      }),
    );
  };

  const loadRecording = async (file: File): Promise<void> => {
    setCalibrationSignal(null);
    setCalibrationMeasurement(null);
    setImportError(null);
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
    }
  };

  return (
    <section
      aria-label={embedded ? 'Audio capture controls' : undefined}
      aria-labelledby={embedded ? undefined : 'capture-title'}
      className={`capture-section ${embedded ? rackEmbeddedClassNames.section : ''}`.trim()}
      id="capture"
    >
      {!embedded && (
        <div className="capture-intro">
          <div>
            <p className="eyebrow">Audio capture · Item 5</p>
            <h2 id="capture-title">Give StringSight a clean signal.</h2>
          </div>
          <p>
            Your microphone audio stays in this browser. StringSight requests access only when you
            press Connect microphone, disables voice processing where the device allows it, and
            never plays the input through your speakers. Disconnect explicitly releases the media
            track and audio context.
          </p>
        </div>
      )}

      <div
        className={`capture-console ${embedded ? rackEmbeddedClassNames.clippedSurface : ''}`.trim()}
      >
        <div className="capture-primary">
          <div className="capture-status-row">
            <span className={`capture-state capture-state--${statusKey}`}>
              <span aria-hidden="true" />
              {statusLabel}
            </span>
            <time aria-label="Capture duration">{formatDuration(snapshot.elapsedMs)}</time>
          </div>

          <Waveform values={displaySignal.waveform} />

          {snapshot.connectionState === 'monitoring' && snapshot.operationState === 'idle' && (
            <p className="capture-calibration" role="status">
              Microphone connected — not recording. Only bounded input-meter and waveform summaries
              are retained until you record a take.
            </p>
          )}

          {calibrationSignal !== null && (
            <p className="capture-calibration" role="status">
              Software meter check: a synthetic {CALIBRATION_PEAK_DBFS} dBFS signal should read
              exactly {CALIBRATION_PEAK_DBFS.toFixed(1)} dBFS. No audio is played or recorded.
            </p>
          )}

          <div className="level-row">
            <span>{calibrationSignal === null ? 'Input level' : 'Reference level'}</span>
            <div
              aria-label="Microphone input level"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(meterPercent)}
              aria-valuetext={levelText}
              className="level-meter"
              role="meter"
            >
              <span style={{ width: `${meterPercent.toFixed(2)}%` }} />
            </div>
            <output>{levelText}</output>
          </div>
          <p className="level-guidance">
            Aim for guitar peaks between −24 and −12 dBFS. Leave headroom; 0 dBFS clips.
          </p>

          {devices.length > 1 && (
            <div className="capture-route-guidance" role="status">
              <strong>Multiple audio inputs detected.</strong>
              <span>
                Select the microphone, interface channel, or channel pair carrying the clean guitar
                signal you want StringSight to analyze.
              </span>
            </div>
          )}

          {calibrationMeasurement !== null && (
            <p className="capture-calibration" role="status">
              {calibrationMeasurement.detected ? (
                <>
                  Captured 1 kHz reference: {calibrationMeasurement.observedPeakDbfs.toFixed(1)}
                  {' dBFS · '}
                  {calibrationMeasurement.deltaDb >= 0 ? '+' : ''}
                  {calibrationMeasurement.deltaDb.toFixed(1)} dB versus the −24 dBFS source.
                </>
              ) : (
                <>No usable 1 kHz reference was found in the last recording.</>
              )}
            </p>
          )}

          {snapshot.warning !== null && (
            <p className="capture-warning" role="status">
              {warningMessages[snapshot.warning]}
            </p>
          )}
          {snapshot.error !== null && (
            <div className="capture-error" role="alert">
              <strong>{snapshot.error.message}</strong>
              <span>Recommended action: {snapshot.error.userAction.replaceAll('-', ' ')}</span>
            </div>
          )}
          {importError !== null && (
            <div className="capture-error" role="alert">
              <strong>{importError}</strong>
              <span>Select a PCM WAV recording exported by StringSight or another audio tool.</span>
            </div>
          )}
          {importedFilename !== null && importError === null && (
            <p className="capture-calibration" role="status">
              Loaded and analyzed {importedFilename}. Replay it again after an analyzer change.
            </p>
          )}

          <div className="capture-controls">
            <button
              className="button button--primary"
              disabled={!canConnect}
              onClick={() => {
                setCalibrationSignal(null);
                setCalibrationMeasurement(null);
                void controller.connect(selectedDeviceId || undefined).then(refreshDevices);
              }}
              type="button"
            >
              Connect microphone
            </button>
            <button
              className="button button--primary"
              disabled={!canRecord}
              onClick={() => void controller.startRecording()}
              type="button"
            >
              Record take
            </button>
            <button
              className="button"
              disabled={
                snapshot.operationState !== 'recording' && snapshot.operationState !== 'paused'
              }
              onClick={() => void controller.stop()}
              type="button"
            >
              Stop
            </button>
            <button
              className="button"
              disabled={
                snapshot.operationState !== 'recording' && snapshot.operationState !== 'paused'
              }
              onClick={() =>
                void (snapshot.operationState === 'paused'
                  ? controller.resume()
                  : controller.pause())
              }
              type="button"
            >
              {snapshot.operationState === 'paused' ? 'Resume' : 'Pause'}
            </button>
            <button
              className="button"
              disabled={snapshot.operationState !== 'idle' || controller.currentRecording === null}
              onClick={() => void controller.replay()}
              type="button"
            >
              Replay analysis
            </button>
            {snapshot.operationState === 'replaying' && (
              <button className="button" onClick={() => controller.stopReplay()} type="button">
                Stop replay
              </button>
            )}
            <button
              className="button"
              disabled={
                snapshot.connectionState !== 'monitoring' ||
                snapshot.operationState === 'finalizing'
              }
              onClick={() => void controller.disconnect()}
              type="button"
            >
              Disconnect microphone
            </button>
            <button
              className="button"
              disabled={isBusy}
              onClick={() => recordingFileInput.current?.click()}
              type="button"
            >
              {isImporting ? 'Loading WAV...' : 'Load & analyze WAV'}
            </button>
            <input
              accept=".wav,audio/wav,audio/x-wav"
              aria-hidden="true"
              className="recording-file-input"
              disabled={isBusy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file !== undefined) void loadRecording(file);
              }}
              ref={recordingFileInput}
              tabIndex={-1}
              type="file"
            />
            <button
              className="text-button meter-check-button"
              disabled={isBusy}
              onClick={() => {
                if (calibrationSignal === null) runMeterCheck();
                else setCalibrationSignal(null);
              }}
              type="button"
            >
              {calibrationSignal === null ? 'Test meter (−24 dBFS)' : 'Return to microphone'}
            </button>
            <button
              className="text-button meter-check-button"
              disabled={isBusy}
              onClick={downloadCalibrationReference}
              type="button"
            >
              Download −24 dBFS reference
            </button>
            <button
              className="text-button meter-check-button"
              disabled={snapshot.operationState !== 'idle' || controller.currentRecording === null}
              onClick={measureLastCapture}
              type="button"
            >
              Measure reference capture
            </button>
          </div>
          <p className="capture-reference-help">
            Privacy: microphone audio stays in this browser. Monitoring keeps only the latest
            bounded meter and waveform summary; Disconnect microphone releases the media track and
            audio context.
          </p>
          <p className="capture-reference-help">
            Optional end-to-end check: play the reference WAV through your normal input chain, avoid
            gain-changing effects, record the returned signal here, then measure the capture. The
            browser can only record inputs exposed by your operating system.
          </p>
        </div>

        <aside className="capture-diagnostics" aria-label="Audio diagnostics">
          <label htmlFor="audio-input">Input device</label>
          <select
            disabled={isBusy || snapshot.connectionState === 'monitoring'}
            id="audio-input"
            onChange={(event) => setSelectedDeviceId(event.target.value)}
            value={selectedDeviceId}
          >
            <option value="">System default</option>
            {devices.map((device, index) => (
              <option key={device.deviceId || `input-${String(index)}`} value={device.deviceId}>
                {device.label || `Microphone ${String(index + 1)}`}
              </option>
            ))}
          </select>
          <button
            className="text-button"
            disabled={isBusy || snapshot.connectionState === 'monitoring'}
            onClick={refreshDevices}
            type="button"
          >
            Refresh devices
          </button>

          <dl>
            <div>
              <dt>Actual sample rate</dt>
              <dd>{snapshot.device?.sampleRate?.toLocaleString() ?? '—'} Hz</dd>
            </div>
            <div>
              <dt>Channels</dt>
              <dd>{snapshot.device?.channelCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Channel handling</dt>
              <dd>
                {snapshot.inputChannelMode === null
                  ? '—'
                  : snapshot.inputChannelMode === 'mono'
                    ? 'Single channel'
                    : 'Averaged to mono'}
              </dd>
            </div>
            <div>
              <dt>Echo cancellation</dt>
              <dd>{settingLabel(snapshot.device?.echoCancellation ?? null)}</dd>
            </div>
            <div>
              <dt>Noise suppression</dt>
              <dd>{settingLabel(snapshot.device?.noiseSuppression ?? null)}</dd>
            </div>
            <div>
              <dt>Automatic gain</dt>
              <dd>{settingLabel(snapshot.device?.autoGainControl ?? null)}</dd>
            </div>
            <div>
              <dt>Buffered audio</dt>
              <dd>{formatDuration(snapshot.bufferedDurationMs)}</dd>
            </div>
            <div>
              <dt>Transport latency</dt>
              <dd>{snapshot.transportLatencyMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt>Maximum latency</dt>
              <dd>{snapshot.maxTransportLatencyMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt>Dropped chunks</dt>
              <dd>{snapshot.droppedChunks}</dd>
            </div>
            <div>
              <dt>Discontinuities</dt>
              <dd>{snapshot.discontinuityCount}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
