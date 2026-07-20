import type { PracticeAudioModel } from '../usePracticeAudio';

type TransportProps = {
  audio: PracticeAudioModel;
  countIn: boolean;
  looping: boolean;
  metronome: boolean;
  onCountInToggle: () => void;
  onLoopToggle: () => void;
  onMetronomeToggle: () => void;
  onPlayingChange: (playing: boolean) => void;
  onTempoChange: (tempo: number) => void;
  playing: boolean;
  tempo: number;
};

const formatDuration = (milliseconds: number): string => {
  const tenths = Math.floor(milliseconds / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(tenths % 10)}`;
};

export function Transport({
  audio,
  countIn,
  looping,
  metronome,
  onCountInToggle,
  onLoopToggle,
  onMetronomeToggle,
  onPlayingChange,
  onTempoChange,
  playing,
  tempo,
}: TransportProps) {
  const recording =
    audio.capture.operationState === 'recording' || audio.capture.operationState === 'paused';
  const recordEnabled = audio.capabilities.canRecord || audio.capabilities.canStop;

  return (
    <footer className="practice-transport" aria-label="Practice transport">
      <div className="practice-transport-buttons">
        <button aria-label="Previous measure placeholder" disabled type="button">
          |◀
        </button>
        <button
          aria-label={playing ? 'Pause placeholder playback' : 'Play placeholder reference'}
          className="is-play"
          onClick={() => onPlayingChange(!playing)}
          title="Reference playback is not connected yet"
          type="button"
        >
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <button aria-label="Next measure placeholder" disabled type="button">
          ▶|
        </button>
        <button
          aria-label={
            recording
              ? 'Stop recording'
              : recordEnabled
                ? 'Record take'
                : 'Connect microphone to record'
          }
          className={`is-record ${recording ? 'is-recording' : ''}`}
          disabled={!recordEnabled}
          onClick={() => void audio.toggleRecord()}
          title={recordEnabled ? undefined : 'Connect the audio input before recording'}
          type="button"
        >
          <i />
        </button>
      </div>
      <div className="practice-transport-center">
        <div className="practice-transport-top">
          <div className="practice-time-state">
            <strong>
              {recording || audio.capture.elapsedMs > 0
                ? formatDuration(audio.capture.elapsedMs)
                : '00:31.8'}
            </strong>
            <span>Measure 13 · beat 3</span>
            <small>{recording ? 'Recording locally' : 'Playback timeline placeholder'}</small>
          </div>
          <div className="practice-options">
            <button aria-pressed={looping} onClick={onLoopToggle} type="button">
              Loop range
            </button>
            <button aria-pressed={metronome} onClick={onMetronomeToggle} type="button">
              Metronome
            </button>
            <button aria-pressed={countIn} onClick={onCountInToggle} type="button">
              Count-in: 1 bar
            </button>
          </div>
        </div>
        <div className="practice-shared-timeline" aria-label="Shared timeline placeholder">
          {Array.from({ length: 20 }, (_, index) => (
            <span data-measure={index % 4 === 0 ? 12 + index / 4 : undefined} key={index} />
          ))}
          <i className="practice-loop-range" />
          <i className="practice-reference-wave" />
          <i className={`practice-timeline-cursor ${playing ? 'is-playing' : ''}`} />
          {[31, 57, 71].map((position, index) => (
            <button
              aria-label={`Review marker ${String(index + 1)} placeholder`}
              disabled
              key={position}
              style={{ left: `${String(position)}%` }}
              type="button"
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="practice-tempo-control">
        <div>
          <span>Practice tempo</span>
          <strong>
            {tempo} <small>BPM</small>
          </strong>
        </div>
        <div>
          <button
            aria-label="Decrease tempo"
            onClick={() => onTempoChange(Math.max(40, tempo - 2))}
            type="button"
          >
            −
          </button>
          <button
            aria-label="Increase tempo"
            onClick={() => onTempoChange(Math.min(180, tempo + 2))}
            type="button"
          >
            +
          </button>
        </div>
      </div>
    </footer>
  );
}
