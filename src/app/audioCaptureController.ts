import { MicrophoneCapture } from '../audio/capture';
import { AudioAnalysisController } from '../audio/analysis';
import { PolyphonicAnalysisController } from '../audio/polyphonic';

export const defaultMicrophoneCapture = new MicrophoneCapture();
export const defaultAudioAnalysis = new AudioAnalysisController(defaultMicrophoneCapture);
export const defaultPolyphonicAnalysis = new PolyphonicAnalysisController(defaultMicrophoneCapture);

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    defaultAudioAnalysis.dispose();
    defaultPolyphonicAnalysis.dispose();
    void defaultMicrophoneCapture.dispose();
  });
}
