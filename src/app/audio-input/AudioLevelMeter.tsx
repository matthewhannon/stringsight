import { RackSegmentedMeter } from '../../ui/rack';

const meterStops = ['−48', '−36', '−24', '−18', '−12', '−6', '−3', '0'] as const;

type AudioLevelMeterProps = {
  meterPercent: number;
  valueText: string;
};

export function AudioLevelMeter({ meterPercent, valueText }: AudioLevelMeterProps) {
  return (
    <div className="audio-input-level-row">
      <span className="audio-input-meter-title">Input level</span>
      <RackSegmentedMeter
        label="Microphone input level"
        stops={meterStops}
        value={meterPercent}
        valueText={valueText}
      />
      <output>{valueText}</output>
    </div>
  );
}
