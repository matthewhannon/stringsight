import { useEffect } from 'react';

import type { PracticeAudioModel } from '../usePracticeAudio';
import { Drawer } from './Drawer';

type InputSettingsDrawerProps = {
  audio: PracticeAudioModel;
  onClose: () => void;
  open: boolean;
};

const warningMessages = {
  clipping: 'The input is clipping. Lower the gain on your interface or microphone.',
  'device-ended': 'The microphone disconnected. Captured audio has been preserved.',
  'maximum-duration-reached':
    'The recording limit was reached and the accepted take was finalized.',
  silence: 'No clear input is reaching StringSight. Check the selected device and its gain.',
} as const;

const correctiveActionFor = (
  error: NonNullable<PracticeAudioModel['capture']['error']>,
): string => {
  switch (error.userAction) {
    case 'retry':
      return 'Retry the action.';
    case 'grant-permission':
      return 'Allow microphone access in the browser or operating-system privacy settings.';
    case 'select-device':
      return 'Choose another available input device.';
    case 'reduce-quality':
      return 'Reduce the input processing quality and try again.';
    case 'free-storage':
      return 'Free device storage before recording another take.';
    case 'check-network':
      return 'Check the network connection and retry.';
    case 'contact-support':
      return 'Preserve these diagnostics and contact support.';
    case 'reposition-camera':
      return 'Reposition the camera before retrying.';
    case 'none':
      return error.retryable
        ? 'Retry when the device is ready.'
        : 'No corrective action is available.';
  }
};

const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export function InputSettingsDrawer({ audio, onClose, open }: InputSettingsDrawerProps) {
  const { capabilities, capture, refreshDevices } = audio;
  const reportedDeviceName = capture.device?.deviceLabel;
  const deviceName =
    reportedDeviceName === undefined || reportedDeviceName === ''
      ? 'Default device'
      : reportedDeviceName;
  const warning = capture.warning === null ? null : warningMessages[capture.warning];

  useEffect(() => {
    if (open) void refreshDevices();
  }, [open, refreshDevices]);

  return (
    <Drawer
      className="practice-input-drawer"
      eyebrow="Audio input"
      id="practice-input-settings"
      onClose={onClose}
      open={open}
      title="Microphone and take controls"
    >
      {audio.actionError !== null && (
        <p className="practice-drawer-error" role="alert">
          {audio.actionError}
        </p>
      )}
      {capture.error !== null && (
        <div className="practice-drawer-error" role="alert">
          <strong>{capture.error.message}</strong>
          <small>Recommended action: {correctiveActionFor(capture.error)}</small>
        </div>
      )}
      {warning !== null && (
        <p className="practice-drawer-warning" role="status">
          {warning}
        </p>
      )}
      <section>
        <span>Connection</span>
        <label className="practice-device-select">
          <span>Input device</span>
          <select
            disabled={!capabilities.canConnect}
            onChange={(event) => audio.setSelectedDeviceId(event.currentTarget.value)}
            value={audio.selectedDeviceId}
          >
            <option value="">System default</option>
            {audio.devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Audio input ${String(index + 1)}`}
              </option>
            ))}
          </select>
        </label>
        <button
          className="practice-refresh-devices"
          disabled={!capabilities.canConnect}
          onClick={() => void audio.refreshDevices()}
          type="button"
        >
          Refresh device list
        </button>
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{capture.connectionState}</dd>
          </div>
          <div>
            <dt>Active device</dt>
            <dd>{deviceName}</dd>
          </div>
          <div>
            <dt>Sample rate</dt>
            <dd>
              {capture.device?.sampleRate === null || capture.device?.sampleRate === undefined
                ? '—'
                : `${capture.device.sampleRate.toLocaleString()} Hz`}
            </dd>
          </div>
          <div>
            <dt>Input channel</dt>
            <dd>{capture.inputChannelMode ?? '—'}</dd>
          </div>
        </dl>
        <div className="practice-drawer-actions">
          <button
            className="is-primary"
            disabled={!capabilities.canConnect}
            onClick={() => void audio.connect()}
            type="button"
          >
            Connect microphone
          </button>
          <button
            disabled={!capabilities.canDisconnect}
            onClick={() => void audio.disconnect()}
            type="button"
          >
            Disconnect
          </button>
        </div>
      </section>
      <section>
        <span>Current take</span>
        <dl>
          <div>
            <dt>State</dt>
            <dd>{capture.operationState}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{formatDuration(capture.elapsedMs)}</dd>
          </div>
          <div>
            <dt>Buffered</dt>
            <dd>{formatDuration(capture.bufferedDurationMs)}</dd>
          </div>
          <div>
            <dt>Clipping samples</dt>
            <dd>{capture.clippingSamples}</dd>
          </div>
        </dl>
        <div className="practice-drawer-actions">
          <button
            className="is-primary"
            disabled={!capabilities.canRecord && !capabilities.canStop}
            onClick={() => void audio.toggleRecord()}
            type="button"
          >
            {capabilities.canStop ? 'Stop and finalize' : 'Record take'}
          </button>
          <button
            disabled={!capabilities.canPause && !capabilities.canResume}
            onClick={() => void audio.pauseOrResume()}
            type="button"
          >
            {capabilities.canResume ? 'Resume' : 'Pause'}
          </button>
          <button
            disabled={!capabilities.canReplay}
            onClick={() => void audio.replay()}
            type="button"
          >
            Replay analysis
          </button>
          <button disabled={!capabilities.canStopReplay} onClick={audio.stopReplay} type="button">
            Stop replay
          </button>
        </div>
      </section>
      <section>
        <span>Signal and transport diagnostics</span>
        <dl>
          <div>
            <dt>RMS level</dt>
            <dd>{Math.round(capture.rms * 100)}%</dd>
          </div>
          <div>
            <dt>Silence duration</dt>
            <dd>{formatDuration(capture.silenceDurationMs)}</dd>
          </div>
          <div>
            <dt>Transport latency</dt>
            <dd>{capture.transportLatencyMs.toFixed(1)} ms</dd>
          </div>
          <div>
            <dt>Maximum latency</dt>
            <dd>{capture.maxTransportLatencyMs.toFixed(1)} ms</dd>
          </div>
          <div>
            <dt>Dropped chunks</dt>
            <dd>{capture.droppedChunks}</dd>
          </div>
          <div>
            <dt>Discontinuities</dt>
            <dd>{capture.discontinuityCount}</dd>
          </div>
        </dl>
      </section>
      <p className="practice-privacy-note">
        Audio and analysis stay on this device. Browser microphone permission is requested only when
        you connect.
      </p>
    </Drawer>
  );
}
