import { MicrophoneCapture } from '../audio/capture';
import { AudioAnalysisController } from '../audio/analysis';
import { PolyphonicAnalysisController } from '../audio/polyphonic';
import { AudioSessionController } from './audioSessionController';

export const defaultMicrophoneCapture = new MicrophoneCapture();
export const defaultAudioAnalysis = new AudioAnalysisController(defaultMicrophoneCapture);
export const defaultPolyphonicAnalysis = new PolyphonicAnalysisController(defaultMicrophoneCapture);
export const defaultAudioSession = new AudioSessionController(
  defaultMicrophoneCapture,
  defaultAudioAnalysis,
  defaultPolyphonicAnalysis,
);

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    defaultAudioSession.dispose();
    defaultAudioAnalysis.dispose();
    defaultPolyphonicAnalysis.dispose();
    void defaultMicrophoneCapture.dispose();
  });
}
