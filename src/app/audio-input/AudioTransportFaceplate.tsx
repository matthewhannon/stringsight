import { RackRecordPunch, RackRockerSwitch, RackStatusLamp, RackUtilityKey } from '../../ui/rack';

type AudioTransportFaceplateProps = {
  inputDisabled: boolean;
  inputOn: boolean;
  inputStateLabel: string;
  onInputChange: (on: boolean) => void;
  onRecord: () => void;
  onSave: () => void;
  peakActive: boolean;
  recordActionLabel: string;
  recordDisabled: boolean;
  recordPressed: boolean;
  recording: boolean;
  recordStateLabel: string;
  saveReady: boolean;
  signalActive: boolean;
};

export function AudioTransportFaceplate({
  inputDisabled,
  inputOn,
  inputStateLabel,
  onInputChange,
  onRecord,
  onSave,
  peakActive,
  recordActionLabel,
  recordDisabled,
  recordPressed,
  recording,
  recordStateLabel,
  saveReady,
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

      <div className="audio-input-record-bank" hidden>
        <RackRecordPunch
          actionLabel={recordActionLabel}
          disabled={recordDisabled}
          onClick={onRecord}
          pressed={recordPressed}
          recording={recording}
          stateLabel={recordStateLabel}
        />
        <RackUtilityKey
          className={`audio-input-save-key ${saveReady ? 'is-ready' : ''}`.trim()}
          disabled={!saveReady}
          engraving={saveReady ? 'Take ready' : 'No take'}
          onClick={onSave}
        >
          Save
        </RackUtilityKey>
      </div>
    </div>
  );
}
