import { RackRecordPunch, RackRockerSwitch, RackStatusLamp, RackUtilityKey } from '../../ui/rack';

type ContextTransport = {
  disabled: boolean;
  label: string;
  onClick: () => void;
};

type AudioTransportFaceplateProps = {
  contextTransport: ContextTransport;
  inputDisabled: boolean;
  inputOn: boolean;
  inputStateLabel: string;
  loadDisabled: boolean;
  loadLabel: string;
  onInputChange: (on: boolean) => void;
  onLoad: () => void;
  onRecord: () => void;
  peakActive: boolean;
  recordActionLabel: string;
  recordDisabled: boolean;
  recordPressed: boolean;
  recording: boolean;
  recordStateLabel: string;
  signalActive: boolean;
};

export function AudioTransportFaceplate({
  contextTransport,
  inputDisabled,
  inputOn,
  inputStateLabel,
  loadDisabled,
  loadLabel,
  onInputChange,
  onLoad,
  onRecord,
  peakActive,
  recordActionLabel,
  recordDisabled,
  recordPressed,
  recording,
  recordStateLabel,
  signalActive,
}: AudioTransportFaceplateProps) {
  return (
    <div className="audio-input-faceplate" aria-label="Input transport">
      <RackRockerSwitch
        disabled={inputDisabled}
        label="Input"
        onPressedChange={onInputChange}
        pressed={inputOn}
        stateLabel={inputStateLabel}
      />

      <div className="audio-input-status-bank" aria-label="Signal status">
        <RackStatusLamp
          active={signalActive}
          label="Signal"
          status={signalActive ? 'present' : 'not detected'}
        />
        <RackStatusLamp
          active={peakActive}
          label="Peak"
          status={peakActive ? 'clipping detected' : 'clear'}
          tone="danger"
        />
      </div>

      <div className="audio-input-media-bank">
        <span className="ss-rack-control-label">Media</span>
        <div>
          <RackUtilityKey disabled={loadDisabled} engraving="Audio file" onClick={onLoad}>
            {loadLabel}
          </RackUtilityKey>
          <RackUtilityKey
            disabled={contextTransport.disabled}
            engraving="Transport"
            onClick={contextTransport.onClick}
          >
            {contextTransport.label}
          </RackUtilityKey>
        </div>
      </div>

      <div className="audio-input-record-bank">
        <RackRecordPunch
          actionLabel={recordActionLabel}
          disabled={recordDisabled}
          onClick={onRecord}
          pressed={recordPressed}
          recording={recording}
          stateLabel={recordStateLabel}
        />
      </div>
    </div>
  );
}
