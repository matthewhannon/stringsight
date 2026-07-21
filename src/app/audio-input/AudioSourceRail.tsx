import { RackDetailKey, RackSourceSelector, type RackSourceOption } from '../../ui/rack';
import { AudioInputAnalysisMonitor } from './AudioInputAnalysisMonitor';
import type { AudioInputDetail } from './AudioInputDisplay';

type AudioSourceRailProps = {
  activeDetail: AudioInputDetail;
  deviceEnumerationError: string | null;
  onDetailChange: (detail: AudioInputDetail) => void;
  onSourceChange: (value: string) => void;
  options: readonly RackSourceOption[];
  selectedSource: string;
};

export function AudioSourceRail({
  activeDetail,
  deviceEnumerationError,
  onDetailChange,
  onSourceChange,
  options,
  selectedSource,
}: AudioSourceRailProps) {
  return (
    <aside className="audio-input-source-rail" aria-label="Input device and details">
      <RackSourceSelector
        label="Source"
        onChange={onSourceChange}
        options={options}
        value={selectedSource}
      />

      {deviceEnumerationError !== null && (
        <p className="audio-input-source-error" role="status">
          {deviceEnumerationError}
        </p>
      )}

      <div className="audio-input-detail-keys">
        <RackDetailKey
          controls="audio-input-main-display"
          label="Device"
          onClick={() => onDetailChange(activeDetail === 'device' ? null : 'device')}
          open={activeDetail === 'device'}
        />
        <RackDetailKey
          controls="audio-input-main-display"
          label="Privacy"
          onClick={() => onDetailChange(activeDetail === 'privacy' ? null : 'privacy')}
          open={activeDetail === 'privacy'}
        />
      </div>

      <div className="audio-input-privacy-status">
        <span aria-hidden="true" />
        <strong>Audio stays in this browser</strong>
      </div>

      <AudioInputAnalysisMonitor />
    </aside>
  );
}
