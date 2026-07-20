import { MicrophoneCapture } from '../audio/capture';
import { AudioAnalysisController } from '../audio/analysis';
import { PolyphonicAnalysisController } from '../audio/polyphonic';
import { IndexedDbAudioSessionRepository } from '../persistence';
import {
  AnalysisDisplayController,
  PolyphonicAnalysisDisplayController,
} from './analysisDisplayController';
import { AudioSessionController } from './audioSessionController';

export const defaultMicrophoneCapture = new MicrophoneCapture();
export const defaultAudioAnalysis = new AudioAnalysisController(defaultMicrophoneCapture);
export const defaultPolyphonicAnalysis = new PolyphonicAnalysisController(defaultMicrophoneCapture);
export const defaultMonitoringAudioAnalysis = new AudioAnalysisController(
  defaultMicrophoneCapture,
  { streamMode: 'monitoring' },
);
export const defaultMonitoringPolyphonicAnalysis = new PolyphonicAnalysisController(
  defaultMicrophoneCapture,
  { streamMode: 'monitoring' },
);
export const defaultDisplayedAudioAnalysis = new AnalysisDisplayController(
  defaultMicrophoneCapture,
  defaultMonitoringAudioAnalysis,
  defaultAudioAnalysis,
);
export const defaultDisplayedPolyphonicAnalysis = new PolyphonicAnalysisDisplayController(
  defaultMicrophoneCapture,
  defaultMonitoringPolyphonicAnalysis,
  defaultPolyphonicAnalysis,
);
export const defaultAudioSessionRepository = new IndexedDbAudioSessionRepository();
export const defaultAudioSession = new AudioSessionController(
  defaultMicrophoneCapture,
  defaultAudioAnalysis,
  defaultPolyphonicAnalysis,
  { repository: defaultAudioSessionRepository },
);

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    defaultAudioSession.dispose();
    defaultDisplayedAudioAnalysis.dispose();
    defaultDisplayedPolyphonicAnalysis.dispose();
    defaultAudioAnalysis.dispose();
    defaultPolyphonicAnalysis.dispose();
    defaultMonitoringAudioAnalysis.dispose();
    defaultMonitoringPolyphonicAnalysis.dispose();
    void defaultMicrophoneCapture.dispose();
  });
}
