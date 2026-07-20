import { useCallback, useSyncExternalStore } from 'react';

import {
  type AnalysisState,
  type AudioAnalysisController,
  type AudioAnalysisSnapshot,
} from '../audio/analysis';
import { defaultDisplayedAudioAnalysis } from './audioCaptureController';
import { rackEmbeddedClassNames } from '../ui/rack';

type AudioAnalysisPanelProps = {
  analysis?: Pick<AudioAnalysisController, 'currentSnapshot' | 'subscribe'> & {
    currentSnapshot: AudioAnalysisSnapshot;
  };
  embedded?: boolean;
};

const stateLabels: Record<AnalysisState, string> = {
  'bend-or-vibrato': 'Pitch movement',
  silence: 'Waiting for a note',
  tracking: 'Tracking pitch',
  transient: 'Attack detected',
  uncertain: 'Pitch uncertain',
};

const formatTime = (milliseconds: number): string => `${(milliseconds / 1_000).toFixed(2)}s`;

const formatCents = (cents: number): string => `${cents >= 0 ? '+' : ''}${cents.toFixed(1)}¢`;

const TIMELINE_EVENT_LIMIT = 6;

export function AudioAnalysisPanel({ analysis, embedded = false }: AudioAnalysisPanelProps) {
  const controller = analysis ?? defaultDisplayedAudioAnalysis;
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.currentSnapshot, [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const isMonitoring = snapshot.analysisMode === 'monitoring';
  const currentCandidate = snapshot.currentEvent?.candidates[0] ?? null;
  const alternatives = snapshot.currentEvent?.candidates.slice(1) ?? [];
  const timelineEvents = snapshot.events.slice(-TIMELINE_EVENT_LIMIT).reverse();

  return (
    <section
      aria-label={embedded ? 'Pitch analysis results' : undefined}
      aria-labelledby={embedded ? undefined : 'analysis-title'}
      className={`analysis-section ${embedded ? rackEmbeddedClassNames.section : ''}`.trim()}
      id="notes"
    >
      {!embedded && (
        <div className="section-heading analysis-heading">
          <p className="eyebrow">Monophonic recognition · Item 6</p>
          <h2 id="analysis-title">Turn the signal into note candidates.</h2>
          <p>
            StringSight detects attacks and estimates a fundamental pitch locally. Results remain
            provisional while you play, preserve octave alternatives, and finalize on silence or the
            next note.
          </p>
        </div>
      )}

      <div
        className={`analysis-console ${embedded ? rackEmbeddedClassNames.clippedSurface : ''}`.trim()}
      >
        <div className="current-note" aria-live="polite">
          <span className={`analysis-state analysis-state--${snapshot.state}`}>
            {stateLabels[snapshot.state]}
          </span>
          {currentCandidate === null ? (
            <div className="note-empty">
              <strong>—</strong>
              <span>Connect the microphone and play one clear note.</span>
            </div>
          ) : (
            <>
              <div className="note-readout">
                <strong>{currentCandidate.noteName}</strong>
                <div>
                  <span>{currentCandidate.frequencyHz.toFixed(2)} Hz</span>
                  <span>{formatCents(currentCandidate.centsOffset)}</span>
                  <span>{Math.round(currentCandidate.confidence * 100)}% confidence</span>
                </div>
              </div>
              <div className="candidate-confidence" aria-label="Pitch confidence">
                <span style={{ width: `${(currentCandidate.confidence * 100).toFixed(1)}%` }} />
              </div>
              <div className="alternatives">
                <span>Ranked alternatives</span>
                {alternatives.length === 0 ? (
                  <em>None inside the supported guitar range</em>
                ) : (
                  <ol>
                    {alternatives.map((candidate) => (
                      <li key={`${String(candidate.rank)}-${String(candidate.midi)}`}>
                        <strong>{candidate.noteName}</strong>
                        <span>{Math.round(candidate.confidence * 100)}%</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="analysis-diagnostics" aria-label="Note analysis diagnostics">
          <dl>
            <div>
              <dt>Detected onsets</dt>
              <dd>{snapshot.onsets.length}</dd>
            </div>
            <div>
              <dt>Worker processing</dt>
              <dd>{snapshot.processingLatencyMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt>Analysis sample rate</dt>
              <dd>
                {snapshot.analysisSampleRate === null
                  ? '—'
                  : `${snapshot.analysisSampleRate.toLocaleString()} Hz`}
              </dd>
            </div>
            <div>
              <dt>Input sample rate</dt>
              <dd>
                {snapshot.inputSampleRate === null
                  ? '—'
                  : `${snapshot.inputSampleRate.toLocaleString()} Hz`}
              </dd>
            </div>
            <div>
              <dt>Maximum processing</dt>
              <dd>{snapshot.maxProcessingLatencyMs.toFixed(1)} ms</dd>
            </div>
            <div>
              <dt>Dropped analysis chunks</dt>
              <dd>{snapshot.droppedChunks}</dd>
            </div>
            <div>
              <dt>Analysis run</dt>
              <dd>{snapshot.runId ?? '—'}</dd>
            </div>
          </dl>
          {snapshot.error !== null && <p role="alert">{snapshot.error}</p>}
        </aside>
      </div>

      <div
        className={`note-timeline ${embedded ? rackEmbeddedClassNames.surface : ''}`.trim()}
        aria-labelledby="timeline-title"
      >
        <div>
          <h3 id="timeline-title">Note timeline</h3>
          <span>
            {isMonitoring
              ? snapshot.events.length > TIMELINE_EVENT_LIMIT
                ? `Latest ${String(TIMELINE_EVENT_LIMIT)} live · rolling history`
                : `${String(snapshot.events.length)} live ${snapshot.events.length === 1 ? 'event' : 'events'}`
              : snapshot.events.length > TIMELINE_EVENT_LIMIT
                ? `Latest ${String(TIMELINE_EVENT_LIMIT)} of ${String(snapshot.events.length)} · ${String(snapshot.events.length - TIMELINE_EVENT_LIMIT)} earlier hidden`
                : `${String(snapshot.events.length)} events`}
          </span>
        </div>
        {snapshot.events.length === 0 ? (
          <p>Detected notes will appear here with their timing, confidence, and lifecycle.</p>
        ) : (
          <ol aria-label="Latest note events, newest first">
            {timelineEvents.map((event) => {
              const candidate = event.candidates[0];
              if (candidate === undefined) return null;
              return (
                <li key={event.id}>
                  <div className="timeline-card-heading">
                    <time>{formatTime(event.time.startMs)}</time>
                    <span
                      className={`lifecycle lifecycle--${isMonitoring ? 'live' : event.lifecycle}`}
                    >
                      {isMonitoring ? 'live' : event.lifecycle}
                    </span>
                  </div>
                  <strong>{candidate.noteName}</strong>
                  <div className="timeline-card-details">
                    <span>{formatCents(candidate.centsOffset)}</span>
                    <span>{Math.round(candidate.confidence * 100)}%</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
