import type { CaptureSnapshot } from '../../audio/capture';

export type AudioInputDetail = 'device' | 'privacy' | null;

type AudioInputDisplayProps = {
  detail: AudioInputDetail;
  elapsed: string;
  inputOff: boolean;
  onRefreshSources: () => void;
  snapshot: CaptureSnapshot;
  values: readonly number[];
};

const settingLabel = (setting: boolean | null): string =>
  setting === null ? 'Not reported' : setting ? 'On' : 'Off';

const channelModeLabel = (snapshot: CaptureSnapshot): string => {
  if (snapshot.inputChannelMode === null) return '—';
  return snapshot.inputChannelMode === 'mono' ? 'Single channel' : 'Averaged to mono';
};

const browserProcessingLabel = (snapshot: CaptureSnapshot): string => {
  const settings = [
    snapshot.device?.echoCancellation,
    snapshot.device?.noiseSuppression,
    snapshot.device?.autoGainControl,
  ];
  if (settings.every((setting) => setting === false)) return 'Off';
  if (settings.every((setting) => setting === null || setting === undefined)) {
    return 'Not reported';
  }
  return 'Partially enabled';
};

function Waveform({ inputOff, values }: { inputOff: boolean; values: readonly number[] }) {
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
      aria-label={inputOff ? 'Input waveform, input off' : 'Live audio waveform'}
      className="audio-input-waveform"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 100"
    >
      <line className="audio-input-waveform-center" x1="0" x2="100" y1="50" y2="50" />
      <path className="audio-input-waveform-line" d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeviceDisplay({
  onRefreshSources,
  snapshot,
}: Pick<AudioInputDisplayProps, 'onRefreshSources' | 'snapshot'>) {
  const diagnostics = [
    ['Sample rate', `${snapshot.device?.sampleRate?.toLocaleString() ?? '—'} Hz`],
    ['Channels', String(snapshot.device?.channelCount ?? '—')],
    ['Channel handling', channelModeLabel(snapshot)],
    ['Browser processing', browserProcessingLabel(snapshot)],
    ['Echo cancellation', settingLabel(snapshot.device?.echoCancellation ?? null)],
    ['Noise suppression', settingLabel(snapshot.device?.noiseSuppression ?? null)],
    ['Automatic gain', settingLabel(snapshot.device?.autoGainControl ?? null)],
    ['Transport latency', `${snapshot.transportLatencyMs.toFixed(1)} ms`],
    ['Maximum latency', `${snapshot.maxTransportLatencyMs.toFixed(1)} ms`],
    ['Dropped audio', snapshot.droppedChunks === 0 ? 'None' : String(snapshot.droppedChunks)],
    ['Discontinuities', String(snapshot.discontinuityCount)],
  ] as const;

  return (
    <section aria-label="Device information" className="audio-input-detail-screen">
      <header>
        <span>Device status</span>
        <strong>{snapshot.device?.deviceLabel ?? 'No active input'}</strong>
        <button onClick={onRefreshSources} type="button">
          Refresh sources
        </button>
      </header>
      <dl>
        {diagnostics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PrivacyDisplay() {
  return (
    <section aria-label="Privacy information" className="audio-input-detail-screen is-privacy">
      <span>Local audio boundary</span>
      <strong>Listening is not saved.</strong>
      <p>
        Audio is retained only when you record or import a take. Nothing is uploaded automatically.
        Turning Input off releases the microphone or interface connection; completed takes remain
        available in this browser.
      </p>
    </section>
  );
}

export function AudioInputDisplay({
  detail,
  elapsed,
  inputOff,
  onRefreshSources,
  snapshot,
  values,
}: AudioInputDisplayProps) {
  return (
    <div
      aria-label="Input display"
      className={`audio-input-display-frame is-${detail ?? 'signal'} ${
        detail === null && inputOff ? 'is-off' : 'is-active'
      }`.trim()}
      id="audio-input-main-display"
    >
      {detail === null && (
        <>
          <Waveform inputOff={inputOff} values={values} />
          <time aria-label="Capture duration">{elapsed}</time>
          {inputOff && <span className="audio-input-waveform-state">Input off</span>}
        </>
      )}
      {detail === 'device' && (
        <DeviceDisplay onRefreshSources={onRefreshSources} snapshot={snapshot} />
      )}
      {detail === 'privacy' && <PrivacyDisplay />}
    </div>
  );
}
