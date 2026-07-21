import type { PracticeAudioModel } from '../usePracticeAudio';
import { Icon } from './Icon';

type TransportProps = {
  audio: PracticeAudioModel;
};

const formatDuration = (milliseconds: number): string => {
  const tenths = Math.floor(milliseconds / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(tenths % 10)}`;
};

export function Transport({ audio }: TransportProps) {
  const recording =
    audio.capture.operationState === 'recording' || audio.capture.operationState === 'paused';
  const recordAvailable = audio.capabilities.canRecord || audio.capabilities.canStop;

  return (
    <footer className="practice-transport" aria-label="Recording status">
      <div className="practice-transport-readiness">
        <div>
          <span>Session tools</span>
          <strong>
            {recordAvailable
              ? 'Microphone ready to record'
              : 'Recording starts from the microphone controls'}
          </strong>
          <small>Practice playback is not available in this build.</small>
        </div>
        {recordAvailable ? (
          <button
            aria-label={recording ? 'Stop recording' : 'Record take'}
            className={`practice-control ${recording ? 'is-destructive' : 'is-primary'}`}
            onClick={() => void audio.toggleRecord()}
            type="button"
          >
            <Icon name={recording ? 'stop' : 'record'} />
            {recording ? 'Stop and save take' : 'Record take'}
          </button>
        ) : null}
      </div>
      {(recording || audio.capture.elapsedMs > 0) && (
        <div className="practice-recording-state" role="status">
          <strong>{formatDuration(audio.capture.elapsedMs)}</strong>
          <span>{recording ? 'Recording on this device' : 'Latest take duration'}</span>
        </div>
      )}
    </footer>
  );
}
