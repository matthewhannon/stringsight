import { MicrophoneCapture } from '../audio/capture';
import { AudioAnalysisController } from '../audio/analysis';

export const defaultMicrophoneCapture = new MicrophoneCapture();
export const defaultAudioAnalysis = new AudioAnalysisController(defaultMicrophoneCapture);

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    defaultAudioAnalysis.dispose();
    void defaultMicrophoneCapture.dispose();
  });
}
