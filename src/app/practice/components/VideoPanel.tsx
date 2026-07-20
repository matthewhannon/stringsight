import type { VideoSource } from '../types';
import { PlaceholderBadge } from './PlaceholderBadge';

type VideoPanelProps = {
  fit: 'fill' | 'fit';
  onFitChange: (fit: 'fill' | 'fit') => void;
  onSourceChange: (source: VideoSource) => void;
  source: VideoSource;
};

export function VideoPanel({ fit, onFitChange, onSourceChange, source }: VideoPanelProps) {
  return (
    <section className="practice-video-panel" aria-labelledby="practice-video-title">
      <header>
        <div>
          <h2 id="practice-video-title">
            {source === 'reference' ? 'Reference video' : 'My Take 04'}
          </h2>
          <span>{source === 'reference' ? 'Lesson performance' : 'Local camera take'}</span>
        </div>
        <div className="practice-video-source" role="group" aria-label="Video source preview">
          <button
            aria-pressed={source === 'reference'}
            onClick={() => onSourceChange('reference')}
            type="button"
          >
            Reference
          </button>
          <button
            aria-pressed={source === 'take'}
            onClick={() => onSourceChange('take')}
            type="button"
          >
            My Take 04
          </button>
        </div>
      </header>
      <div className="practice-video-body">
        <div className={`practice-video-frame is-${fit} is-${source}`}>
          <img
            alt="Placeholder preview of a guitarist demonstrating the selected phrase"
            src="/mockups/dual-canvas-reference.png"
          />
          <div className="practice-video-shade" />
          <div className="practice-video-placeholder">
            <PlaceholderBadge>Video playback placeholder</PlaceholderBadge>
          </div>
          <span className="practice-video-sync">
            <i />
            Sync anchor preview · measure 13.3
          </span>
          <div className="practice-video-cue">
            Watch the index-finger anchor<small>Marker 1 · measure 13</small>
          </div>
          <div className="practice-video-time">
            <strong>Position shift</strong>
            <time>00:31.840</time>
          </div>
        </div>
      </div>
      <footer>
        <span>
          Original aspect ratio ·{' '}
          {fit === 'fit' ? 'shown without cropping' : 'fill preview may crop edges'}
        </span>
        <button onClick={() => onFitChange(fit === 'fit' ? 'fill' : 'fit')} type="button">
          {fit === 'fit' ? 'Fill frame' : 'Fit video'}
        </button>
      </footer>
    </section>
  );
}
