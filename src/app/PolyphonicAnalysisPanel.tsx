import { memo, useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react';

import {
  PolyphonicAnalysisController,
  type PolyphonicAnalysisSnapshot,
  type PolyphonicAnalysisState,
} from '../audio/polyphonic';
import { rackEmbeddedClassNames } from '../ui/rack';
import { defaultDisplayedPolyphonicAnalysis } from './audioCaptureController';

type PolyphonicAnalysisPanelProps = {
  analysis?: Pick<PolyphonicAnalysisController, 'currentSnapshot' | 'subscribe'> & {
    currentSnapshot: PolyphonicAnalysisSnapshot;
    setChordAnalysisProfile?: PolyphonicAnalysisController['setChordAnalysisProfile'];
  };
  embedded?: boolean;
};

const stateLabels: Record<PolyphonicAnalysisState, string> = {
  silence: 'Waiting for a chord',
  tracking: 'Tracking chord',
  uncertain: 'Chord uncertain',
  warming: 'Collecting audio',
};

const pitchClasses = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const formatTime = (milliseconds: number): string => `${(milliseconds / 1_000).toFixed(2)}s`;
const TIMELINE_EVENT_LIMIT = 6;

type MeterScaleStyle = CSSProperties & { '--meter-scale': number };

const meterScaleStyle = (value: number): MeterScaleStyle => ({
  '--meter-scale': Math.max(0, Math.min(1, value)),
});

const ChordTimelineEvents = memo(function ChordTimelineEvents({
  events,
  isMonitoring,
}: {
  events: PolyphonicAnalysisSnapshot['chordEvents'];
  isMonitoring: boolean;
}) {
  if (events.length === 0) {
    return (
      <p>
        {isMonitoring
          ? 'Live chord candidates will appear here in a bounded rolling history.'
          : 'Provisional chord candidates will appear here with timing and lifecycle.'}
      </p>
    );
  }
  const timelineEvents = events.slice(-TIMELINE_EVENT_LIMIT).reverse();
  return (
    <ol aria-label="Latest chord events, newest first">
      {timelineEvents.map((event) => {
        const candidate = event.candidates[0];
        if (candidate === undefined) return null;
        const observed = event.observedPitchClasses
          .filter(({ weight }) => weight >= 0.08)
          .map(({ pitchClass }) => pitchClass);
        const evidenceLabel =
          observed.length > 0
            ? `Observed ${observed.join(' ')}`
            : `Template ${candidate.pitchClasses.join(' ')}`;
        return (
          <li key={event.id}>
            <div className="timeline-card-heading">
              <time>{formatTime(event.time.startMs)}</time>
              <span className={`lifecycle lifecycle--${isMonitoring ? 'live' : event.lifecycle}`}>
                {isMonitoring ? 'live' : event.lifecycle}
              </span>
            </div>
            <strong>{candidate.symbol}</strong>
            <span className="timeline-card-evidence" aria-label={evidenceLabel}>
              {evidenceLabel}
            </span>
            <span className="timeline-card-match">
              {Math.round(candidate.confidence * 100)}% match
            </span>
          </li>
        );
      })}
    </ol>
  );
});

export function PolyphonicAnalysisPanel({
  analysis,
  embedded = false,
}: PolyphonicAnalysisPanelProps) {
  const [showDetails, setShowDetails] = useState(false);
  const controller = analysis ?? defaultDisplayedPolyphonicAnalysis;
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.currentSnapshot, [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isMonitoring = snapshot.analysisMode === 'monitoring';
  const currentCandidate = snapshot.currentChord?.candidates[0] ?? null;
  const stateLabel =
    isMonitoring && snapshot.currentChord !== null
      ? 'Live chord'
      : snapshot.currentChord?.lifecycle === 'finalized'
        ? 'Finalized chord'
        : stateLabels[snapshot.state];
  const alternatives = snapshot.currentChord?.candidates.slice(1, 4) ?? [];

  return (
    <section
      aria-label={embedded ? 'Chord analysis results' : undefined}
      aria-labelledby={embedded ? undefined : 'polyphonic-analysis-title'}
      className={`analysis-section polyphonic-section ${embedded ? rackEmbeddedClassNames.section : ''}`.trim()}
    >
      {!embedded && (
        <div className="section-heading analysis-heading">
          <p className="eyebrow">Polyphonic recognition - Item 7</p>
          <h2 id="polyphonic-analysis-title">Resolve notes played together.</h2>
          <p>
            Independent chroma evidence produces fast live chord candidates. When recording ends,
            local model note sets can finalize or revise them through the same worker boundary.
          </p>
        </div>
      )}

      <div
        className={`analysis-console chord-analysis-console ${showDetails ? 'chord-analysis-console--expanded' : ''} ${embedded ? rackEmbeddedClassNames.clippedSurface : ''}`.trim()}
      >
        <div className="current-note current-chord chord-summary-display" aria-live="polite">
          <span className={`analysis-state analysis-state--${snapshot.state}`}>{stateLabel}</span>
          {currentCandidate === null ? (
            <div className="note-empty">
              <strong>-</strong>
              <span>Play two or more notes together to begin chord analysis.</span>
            </div>
          ) : (
            <>
              <div className="note-readout chord-readout" key={snapshot.currentChord?.id}>
                <strong>{currentCandidate.symbol}</strong>
                <div>
                  <span>{Math.round(currentCandidate.confidence * 100)}% match strength</span>
                </div>
              </div>
              <div className="candidate-confidence" aria-label="Chord match strength">
                <span style={meterScaleStyle(currentCandidate.confidence)} />
              </div>
            </>
          )}

          {showDetails && (
            <div className="chord-analysis-evidence" id="chord-analysis-evidence">
              {currentCandidate !== null && (
                <>
                  <dl className="chord-candidate-facts">
                    <div>
                      <dt>Quality</dt>
                      <dd>{currentCandidate.quality}</dd>
                    </div>
                    <div>
                      <dt>Bass</dt>
                      <dd>{currentCandidate.bass ?? 'Unresolved'}</dd>
                    </div>
                  </dl>
                  <div className="alternatives">
                    <span>Ranked alternatives</span>
                    <ol>
                      {alternatives.map((candidate) => (
                        <li key={`${String(candidate.rank)}-${candidate.symbol}`}>
                          <strong>{candidate.symbol}</strong>
                          <span>{Math.round(candidate.confidence * 100)}% match</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}

              <div className="chroma-strip" aria-label="Pitch-class energy">
                {pitchClasses.map((pitchClass, index) => {
                  const value = snapshot.chroma[index] ?? 0;
                  return (
                    <span key={pitchClass}>
                      <i aria-hidden="true" style={meterScaleStyle(value)} />
                      <b>{pitchClass}</b>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {snapshot.error !== null && (
            <p className="chord-analysis-error" role="alert">
              {snapshot.error}
            </p>
          )}

          <footer className="chord-analysis-footer">
            <button
              aria-controls="chord-analysis-evidence chord-analysis-diagnostics chord-analysis-timeline"
              aria-expanded={showDetails}
              onClick={() => setShowDetails((visible) => !visible)}
              type="button"
            >
              {showDetails ? 'Hide analysis details' : 'Analysis details'}
            </button>
          </footer>
        </div>

        {showDetails && (
          <aside
            className="analysis-diagnostics"
            aria-label="Chord analysis diagnostics"
            id="chord-analysis-diagnostics"
          >
            <dl>
              <div>
                <dt>Chord mode</dt>
                <dd>{snapshot.chordAnalysisProfile}</dd>
              </div>
              <div>
                <dt>Chord events</dt>
                <dd>{snapshot.chordEvents.length}</dd>
              </div>
              <div>
                <dt>Finalized note sets</dt>
                <dd>{snapshot.noteSetEvents.length}</dd>
              </div>
              <div>
                <dt>Finalized model</dt>
                <dd>{isMonitoring ? 'recording only' : snapshot.modelState}</dd>
              </div>
              <div>
                <dt>Model backend</dt>
                <dd>{snapshot.modelBackend?.toUpperCase() ?? '-'}</dd>
              </div>
              <div>
                <dt>Model load and warmup</dt>
                <dd>
                  {snapshot.modelLoadMs === null ? '-' : `${snapshot.modelLoadMs.toFixed(1)} ms`}
                </dd>
              </div>
              <div>
                <dt>Model inference</dt>
                <dd>
                  {snapshot.modelInferenceMs === null
                    ? '-'
                    : `${snapshot.modelInferenceMs.toFixed(1)} ms / ${String(snapshot.modelWindowCount)} ${snapshot.modelWindowCount === 1 ? 'window' : 'windows'}`}
                </dd>
              </div>
              <div>
                <dt>Worker processing</dt>
                <dd>{snapshot.processingLatencyMs.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Maximum processing</dt>
                <dd>{snapshot.maxProcessingLatencyMs.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Analysis sample rate</dt>
                <dd>
                  {snapshot.analysisSampleRate === null
                    ? '-'
                    : `${snapshot.analysisSampleRate.toLocaleString()} Hz`}
                </dd>
              </div>
              <div>
                <dt>Signal energy</dt>
                <dd>{snapshot.energy.toFixed(4)}</dd>
              </div>
              <div>
                <dt>Dropped chunks</dt>
                <dd>{snapshot.droppedChunks}</dd>
              </div>
              <div>
                <dt>Analysis run</dt>
                <dd>{snapshot.runId ?? '-'}</dd>
              </div>
            </dl>
          </aside>
        )}
      </div>

      {showDetails && (
        <div
          className={`note-timeline chord-timeline ${embedded ? rackEmbeddedClassNames.surface : ''}`.trim()}
          aria-labelledby="chord-timeline-title"
          id="chord-analysis-timeline"
        >
          <div>
            <h3 id="chord-timeline-title">Chord timeline</h3>
            <span>
              {isMonitoring
                ? snapshot.chordEvents.length > TIMELINE_EVENT_LIMIT
                  ? `Latest ${String(TIMELINE_EVENT_LIMIT)} live · rolling history`
                  : `${String(snapshot.chordEvents.length)} live ${snapshot.chordEvents.length === 1 ? 'event' : 'events'}`
                : snapshot.chordEvents.length > TIMELINE_EVENT_LIMIT
                  ? `Latest ${String(TIMELINE_EVENT_LIMIT)} of ${String(snapshot.chordEvents.length)} · ${String(snapshot.chordEvents.length - TIMELINE_EVENT_LIMIT)} earlier hidden`
                  : `${String(snapshot.chordEvents.length)} events`}
            </span>
          </div>
          <ChordTimelineEvents events={snapshot.chordEvents} isMonitoring={isMonitoring} />
        </div>
      )}
    </section>
  );
}
