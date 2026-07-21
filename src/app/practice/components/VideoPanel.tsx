type VideoPanelProps = {
  fit: 'fill' | 'fit';
  onFitChange: (fit: 'fill' | 'fit') => void;
};

export function VideoPanel({ fit, onFitChange }: VideoPanelProps) {
  return (
    <section className="practice-video-panel" aria-labelledby="practice-video-title">
      <header>
        <div>
          <h2 id="practice-video-title">Technique reference</h2>
          <span>Still image for visual comparison</span>
        </div>
        <span className="practice-passive-status">Still image</span>
      </header>
      <div className="practice-video-body">
        <div className={`practice-video-frame is-${fit} is-reference`}>
          <img
            alt="Guitarist demonstrating the practice passage"
            src="/mockups/dual-canvas-reference.png"
          />
          <div className="practice-video-shade" />
        </div>
      </div>
      <footer>
        <span>{fit === 'fit' ? 'Full image shown' : 'Image fills the available frame'}</span>
        <button
          className="practice-control is-quiet"
          onClick={() => onFitChange(fit === 'fit' ? 'fill' : 'fit')}
          type="button"
        >
          {fit === 'fit' ? 'Fill frame' : 'Show full image'}
        </button>
      </footer>
    </section>
  );
}
