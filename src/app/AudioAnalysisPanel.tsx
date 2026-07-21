import { memo, useCallback, useState, useSyncExternalStore, type CSSProperties } from 'react';

import {
  midiToFrequency,
  type AudioAnalysisController,
  type AudioAnalysisSnapshot,
} from '../audio/analysis';
import { rackEmbeddedClassNames } from '../ui/rack';
import { defaultDisplayedAudioAnalysis } from './audioCaptureController';
import './audioAnalysisPanel.css';

type AudioAnalysisPanelProps = {
  analysis?: Pick<AudioAnalysisController, 'currentSnapshot' | 'subscribe'> & {
    currentSnapshot: AudioAnalysisSnapshot;
  };
  embedded?: boolean;
};

const formatCents = (cents: number): string => `${cents >= 0 ? '+' : ''}${cents.toFixed(1)}¢`;

const formatDuration = (milliseconds: number): string => `${(milliseconds / 1_000).toFixed(2)}s`;

const tuningDirection = (cents: number): string => {
  if (Math.abs(cents) <= 2) return 'in tune';
  return cents < 0 ? 'flat' : 'sharp';
};

const HISTORY_EVENT_LIMIT = 5;

type MeterStyle = CSSProperties & { '--meter-position': string };

const tuningMeterStyle = (cents: number): MeterStyle => ({
  '--meter-position': `${String(((Math.max(-50, Math.min(50, cents)) + 50) / 100) * 100)}%`,
});

function PitchTuningMeter({ cents }: { cents: number | null }) {
  const meter = (
    <>
      <div aria-hidden="true" className="pitch-tuning-track">
        <i className="pitch-tuning-center">
          <span>0</span>
        </i>
        {cents !== null && (
          <b className="pitch-tuning-current" style={tuningMeterStyle(cents)}>
            <span>{String(Math.round(cents))}</span>
          </b>
        )}
      </div>
      <div aria-hidden="true" className="pitch-tuning-ends">
        <span>Flat</span>
        <span>Sharp</span>
      </div>
    </>
  );

  if (cents === null) {
    return (
      <div aria-label="Tuning offset unavailable" className="pitch-tuning-meter" role="status">
        {meter}
      </div>
    );
  }

  return (
    <div
      aria-label="Tuning offset"
      aria-valuemax={50}
      aria-valuemin={-50}
      aria-valuenow={Math.max(-50, Math.min(50, cents))}
      aria-valuetext={`${formatCents(cents)}, ${tuningDirection(cents)}`}
      className="pitch-tuning-meter"
      role="meter"
    >
      {meter}
    </div>
  );
}

function PitchDiagnostics({ snapshot }: { snapshot: AudioAnalysisSnapshot }) {
  return (
    <section
      aria-label="Note analysis diagnostics"
      aria-labelledby="pitch-diagnostics-title"
      className="pitch-diagnostics"
      id="pitch-diagnostics"
    >
      <h3 id="pitch-diagnostics-title">Analysis diagnostics</h3>
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
          <dt>Maximum processing</dt>
          <dd>{snapshot.maxProcessingLatencyMs.toFixed(1)} ms</dd>
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
          <dt>Dropped chunks</dt>
          <dd>{snapshot.droppedChunks}</dd>
        </div>
        <div>
          <dt>Analysis run</dt>
          <dd>{snapshot.runId ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

const NoteHistory = memo(function NoteHistory({
  events,
}: {
  events: AudioAnalysisSnapshot['events'];
}) {
  const completeEvents = events.filter((event) => {
    const centsSpread = event.diagnostics.centsSpread;
    return (
      event.time.endMs !== undefined &&
      event.candidates[0] !== undefined &&
      typeof centsSpread === 'number'
    );
  });

  if (completeEvents.length < 2) return null;

  const visibleEvents = completeEvents.slice(-HISTORY_EVENT_LIMIT);
  return (
    <section aria-label="Recent note history" className="pitch-history" id="pitch-history">
      <span>Recent notes</span>
      <ol aria-label="Recent note history, oldest first">
        {visibleEvents.map((event) => {
          const candidate = event.candidates[0];
          const endMs = event.time.endMs;
          const centsSpread = event.diagnostics.centsSpread;
          if (candidate === undefined || endMs === undefined || typeof centsSpread !== 'number') {
            return null;
          }
          return (
            <li key={event.id}>
              <strong>{candidate.noteName}</strong>
              <span>{formatDuration(endMs - event.time.startMs)}</span>
              <span>{formatCents(candidate.centsOffset)} median</span>
              <span>{centsSpread.toFixed(1)}¢ variation</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

export function AudioAnalysisPanel({ analysis, embedded = false }: AudioAnalysisPanelProps) {
  const controller = analysis ?? defaultDisplayedAudioAnalysis;
  const subscribe = useCallback(
    (listener: () => void) => controller.subscribe(listener),
    [controller],
  );
  const getSnapshot = useCallback(() => controller.currentSnapshot, [controller]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const currentCandidate = snapshot.currentEvent?.candidates[0] ?? null;
  const targetFrequencyHz =
    currentCandidate === null ? null : midiToFrequency(currentCandidate.midi);

  return (
    <section
      aria-label={embedded ? 'Pitch analysis results' : undefined}
      aria-labelledby={embedded ? undefined : 'analysis-title'}
      className={`pitch-analysis ${embedded ? rackEmbeddedClassNames.section : ''}`.trim()}
      id="notes"
    >
      {!embedded && (
        <header className="pitch-analysis-heading">
          <h2 id="analysis-title">Pitch analysis</h2>
        </header>
      )}

      <div className="pitch-console">
        <section aria-live="polite" className="pitch-primary-display">
          {currentCandidate === null ? (
            <div className="pitch-empty-readout">
              <strong>—</strong>
              <span>Listening for a clear note</span>
            </div>
          ) : (
            <div className="pitch-live-readout">
              <div className="pitch-note-value">
                <span>Note</span>
                <strong>{currentCandidate.noteName}</strong>
              </div>
              <dl className="pitch-live-facts">
                <div>
                  <dt>Offset</dt>
                  <dd>
                    {formatCents(currentCandidate.centsOffset)}{' '}
                    <span>{tuningDirection(currentCandidate.centsOffset)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Detected frequency</dt>
                  <dd>{currentCandidate.frequencyHz.toFixed(2)} Hz</dd>
                </div>
                <div>
                  <dt>Target frequency</dt>
                  <dd>{targetFrequencyHz?.toFixed(2)} Hz</dd>
                </div>
              </dl>
            </div>
          )}

          <PitchTuningMeter cents={currentCandidate?.centsOffset ?? null} />

          {snapshot.error !== null && (
            <p className="pitch-analysis-error" role="alert">
              {snapshot.error}
            </p>
          )}

          <footer className="pitch-analysis-footer">
            <button
              aria-controls="pitch-diagnostics pitch-history"
              aria-expanded={showDiagnostics}
              onClick={() => setShowDiagnostics((visible) => !visible)}
              type="button"
            >
              {showDiagnostics ? 'Hide analysis details' : 'Analysis details'}
            </button>
          </footer>

          {showDiagnostics && (
            <>
              <PitchDiagnostics snapshot={snapshot} />
              <NoteHistory events={snapshot.events} />
            </>
          )}
        </section>
      </div>
    </section>
  );
}
