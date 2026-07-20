import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { midiToNoteName, type AudioAnalysisController } from '../audio/analysis';
import { encodeMonoPcm16Wav, type MicrophoneCapture } from '../audio/capture';
import type { PolyphonicAnalysisController } from '../audio/polyphonic';
import {
  RECORDING_CHORD_OPTIONS,
  createRecordedChordFixture,
  createRecordedFixture,
  type BenchmarkConditions,
  type RecordingFixtureOptions,
} from '../evaluation';
import { toolEmbeddedClassNames } from '../ui/toolSurfaceClasses';
import {
  defaultAudioAnalysis,
  defaultMicrophoneCapture,
  defaultPolyphonicAnalysis,
} from './audioCaptureController';

type BenchmarkPanelProps = {
  analysis?: AudioAnalysisController;
  capture?: MicrophoneCapture;
  embedded?: boolean;
  polyphonicAnalysis?: PolyphonicAnalysisController;
};

type BenchmarkMode = 'chords' | 'notes';

const noteOptions = Array.from({ length: 49 }, (_, index) => {
  const midi = 40 + index;
  return { midi, noteName: midiToNoteName(midi) };
});

const defaultConditions: BenchmarkConditions = {
  dynamics: 'medium',
  guitarType: 'steel-acoustic',
  inputProfile: 'laptop-microphone',
  neckPosition: 'open-low',
  noise: 'quiet',
  split: 'development',
};

const safeTimestamp = (date: Date): string =>
  date.toISOString().replaceAll(':', '-').replaceAll('.', '-');

function download(bytes: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BenchmarkPanel({
  analysis,
  capture,
  embedded = false,
  polyphonicAnalysis,
}: BenchmarkPanelProps) {
  const analysisController = analysis ?? defaultAudioAnalysis;
  const captureController = capture ?? defaultMicrophoneCapture;
  const polyphonicController = polyphonicAnalysis ?? defaultPolyphonicAnalysis;
  const subscribeAnalysis = useCallback(
    (listener: () => void) => analysisController.subscribe(listener),
    [analysisController],
  );
  const subscribeCapture = useCallback(
    (listener: () => void) => captureController.subscribe(listener),
    [captureController],
  );
  const subscribePolyphonic = useCallback(
    (listener: () => void) => polyphonicController.subscribe(listener),
    [polyphonicController],
  );
  const analysisSnapshot = useSyncExternalStore(
    subscribeAnalysis,
    () => analysisController.currentSnapshot,
    () => analysisController.currentSnapshot,
  );
  const captureSnapshot = useSyncExternalStore(
    subscribeCapture,
    () => captureController.currentSnapshot,
    () => captureController.currentSnapshot,
  );
  const polyphonicSnapshot = useSyncExternalStore(
    subscribePolyphonic,
    () => polyphonicController.currentSnapshot,
    () => polyphonicController.currentSnapshot,
  );
  const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>('notes');
  const [conditions, setConditions] = useState(defaultConditions);
  const [reviewedChords, setReviewedChords] = useState<Record<string, string>>({});
  const [reviewedNotes, setReviewedNotes] = useState<Record<string, string>>({});
  const finalizedEvents = useMemo(
    () => analysisSnapshot.events.filter((event) => event.lifecycle === 'finalized'),
    [analysisSnapshot.events],
  );
  const reviewSelections = useMemo(
    () =>
      Object.fromEntries(
        finalizedEvents.map((event) => [
          event.id,
          reviewedNotes[event.id] ??
            (event.candidates[0] === undefined ? '' : String(event.candidates[0].midi)),
        ]),
      ),
    [finalizedEvents, reviewedNotes],
  );
  const finalizedChordEvents = useMemo(
    () => polyphonicSnapshot.chordEvents.filter((event) => event.lifecycle === 'finalized'),
    [polyphonicSnapshot.chordEvents],
  );
  const chordReviewSelections = useMemo(
    () =>
      Object.fromEntries(
        finalizedChordEvents.map((event) => [
          event.id,
          reviewedChords[event.id] ?? event.candidates[0]?.symbol ?? '',
        ]),
      ),
    [finalizedChordEvents, reviewedChords],
  );

  const recording = captureController.currentRecording;
  const ready = captureSnapshot.operationState === 'idle' && recording !== null;
  const allReviewed =
    benchmarkMode === 'notes'
      ? finalizedEvents.length > 0 &&
        finalizedEvents.every(
          (event) => reviewSelections[event.id] !== undefined && reviewSelections[event.id] !== '',
        )
      : finalizedChordEvents.length > 0 &&
        finalizedChordEvents.every(
          (event) =>
            chordReviewSelections[event.id] !== undefined && chordReviewSelections[event.id] !== '',
        );
  const recordingTimestamp = recording === null ? null : new Date(recording.recordedAt);
  const baseName =
    recordingTimestamp === null
      ? 'stringsight-recording'
      : `stringsight-real-${benchmarkMode}-${safeTimestamp(recordingTimestamp)}`;

  const updateCondition = <Key extends keyof BenchmarkConditions>(
    key: Key,
    value: BenchmarkConditions[Key],
  ) => setConditions((current) => ({ ...current, [key]: value }));

  const downloadLabels = () => {
    if (recording === null || !allReviewed) return;
    const options: RecordingFixtureOptions = {
      ...conditions,
      fixtureId: baseName.toLowerCase(),
      license: 'private-evaluation-only',
      recordedAt: recording.recordedAt,
    };
    const fixture =
      benchmarkMode === 'notes'
        ? createRecordedFixture(
            recording,
            finalizedEvents,
            finalizedEvents.map((event) => ({
              eventId: event.id,
              midi:
                reviewSelections[event.id] === 'exclude'
                  ? null
                  : Number(reviewSelections[event.id]),
            })),
            options,
          )
        : createRecordedChordFixture(
            recording,
            finalizedChordEvents,
            finalizedChordEvents.map((event) => ({
              eventId: event.id,
              symbol:
                chordReviewSelections[event.id] === 'exclude'
                  ? null
                  : (chordReviewSelections[event.id] ?? null),
            })),
            options,
          );
    download(JSON.stringify(fixture, null, 2), 'application/json', `${baseName}.fixture.json`);
  };

  return (
    <section
      aria-label={embedded ? 'Evaluation fixture controls' : undefined}
      aria-labelledby={embedded ? undefined : 'benchmark-title'}
      className={`benchmark-section ${embedded ? toolEmbeddedClassNames.section : ''}`.trim()}
      id="benchmark"
    >
      {!embedded && (
        <div className="section-heading">
          <p className="eyebrow">Real-guitar benchmark</p>
          <h2 id="benchmark-title">Turn a recording into trustworthy test data.</h2>
          <p>
            Record above, then use StringSight's best guesses as your labels. If a suggestion is
            wrong, correct just that note or chord before exporting.
          </p>
        </div>
      )}

      <div className="benchmark-grid">
        <article
          className={`benchmark-protocol ${embedded ? toolEmbeddedClassNames.surface : ''}`.trim()}
        >
          <span className="stage-status">
            {benchmarkMode === 'notes' ? 'First take · Open strings' : 'Chord take · Open position'}
          </span>
          {benchmarkMode === 'notes' ? (
            <>
              <h3>Play six clean notes with space between them.</h3>
              <ol>
                <li>Start the microphone and wait two seconds in silence.</li>
                <li>Play E2, A2, D3, G3, B3, then E4.</li>
                <li>
                  Let each note ring for about one second, with one second of silence between notes.
                </li>
                <li>Wait two seconds, stop, and scan the suggested labels below.</li>
              </ol>
            </>
          ) : (
            <>
              <h3>Play four clean chords with space between them.</h3>
              <ol>
                <li>Start the microphone and wait two seconds in silence.</li>
                <li>Strum C, A minor, G, then E minor in open position.</li>
                <li>Let each chord ring for two seconds, with two seconds of silence between.</li>
                <li>Wait two seconds, stop, then correct any chord labels below.</li>
              </ol>
            </>
          )}
          <p>Use normal playing volume. Do not adjust your gain between benchmark takes.</p>
        </article>

        <div
          className={`benchmark-conditions ${embedded ? toolEmbeddedClassNames.surface : ''}`.trim()}
          aria-label="Recording conditions"
        >
          <label>
            Fixture type
            <select
              onChange={(event) => setBenchmarkMode(event.target.value as BenchmarkMode)}
              value={benchmarkMode}
            >
              <option value="notes">Single notes</option>
              <option value="chords">Chord sequence</option>
            </select>
          </label>
          <label>
            Guitar
            <select
              onChange={(event) =>
                updateCondition(
                  'guitarType',
                  event.target.value as BenchmarkConditions['guitarType'],
                )
              }
              value={conditions.guitarType}
            >
              <option value="steel-acoustic">Steel acoustic</option>
              <option value="nylon-acoustic">Nylon acoustic</option>
              <option value="clean-electric">Clean electric</option>
            </select>
          </label>
          <label>
            Input
            <select
              onChange={(event) =>
                updateCondition(
                  'inputProfile',
                  event.target.value as BenchmarkConditions['inputProfile'],
                )
              }
              value={conditions.inputProfile}
            >
              <option value="laptop-microphone">Laptop microphone</option>
              <option value="near-microphone">Nearby microphone</option>
              <option value="room-microphone">Room microphone</option>
              <option value="direct">Direct/interface</option>
            </select>
          </label>
          <label>
            Dynamics
            <select
              onChange={(event) =>
                updateCondition('dynamics', event.target.value as BenchmarkConditions['dynamics'])
              }
              value={conditions.dynamics}
            >
              <option value="soft">Soft</option>
              <option value="medium">Medium</option>
              <option value="loud">Loud</option>
            </select>
          </label>
          <label>
            Room noise
            <select
              onChange={(event) =>
                updateCondition('noise', event.target.value as BenchmarkConditions['noise'])
              }
              value={conditions.noise}
            >
              <option value="quiet">Quiet</option>
              <option value="room">Normal room</option>
              <option value="fan">Fan/computer noise</option>
            </select>
          </label>
        </div>
      </div>

      <div className={`benchmark-review ${embedded ? toolEmbeddedClassNames.surface : ''}`.trim()}>
        <div>
          <h3>Suggested labels</h3>
          <span>
            {benchmarkMode === 'notes' ? finalizedEvents.length : finalizedChordEvents.length}{' '}
            finalized events
          </span>
        </div>
        {!ready ? (
          <p>Complete and stop a microphone recording to review and export it.</p>
        ) : benchmarkMode === 'notes' && finalizedEvents.length === 0 ? (
          <p>
            No finalized notes were detected. Replay once, or make another recording with a stronger
            signal.
          </p>
        ) : benchmarkMode === 'chords' && finalizedChordEvents.length === 0 ? (
          <p>
            No finalized chords were detected. Replay once, or make another recording with clearer
            chord changes.
          </p>
        ) : (
          <>
            <p className="benchmark-review-guidance">
              Best guesses are ready to export. Change only the{' '}
              {benchmarkMode === 'notes' ? 'notes' : 'chords'} StringSight got wrong.
            </p>
            {benchmarkMode === 'notes' ? (
              <ol>
                {finalizedEvents.map((event, index) => {
                  const guess = event.candidates[0];
                  return (
                    <li key={event.id}>
                      <span>#{String(index + 1)}</span>
                      <span>{(event.time.startMs / 1_000).toFixed(2)}s</span>
                      <span>StringSight: {guess?.noteName ?? 'uncertain'}</span>
                      <label>
                        What you played
                        <select
                          aria-label={`True note for event ${String(index + 1)}`}
                          onChange={(input) =>
                            setReviewedNotes((current) => ({
                              ...current,
                              [event.id]: input.target.value,
                            }))
                          }
                          value={reviewSelections[event.id] ?? ''}
                        >
                          <option value="">Choose true note</option>
                          {noteOptions.map((note) => (
                            <option key={note.midi} value={note.midi}>
                              {note.noteName}
                            </option>
                          ))}
                          <option value="exclude">Exclude false event</option>
                        </select>
                      </label>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ol>
                {finalizedChordEvents.map((event, index) => {
                  const guess = event.candidates[0];
                  return (
                    <li key={event.id}>
                      <span>#{String(index + 1)}</span>
                      <span>{(event.time.startMs / 1_000).toFixed(2)}s</span>
                      <span>StringSight: {guess?.symbol ?? 'uncertain'}</span>
                      <label>
                        What you played
                        <select
                          aria-label={`True chord for event ${String(index + 1)}`}
                          onChange={(input) =>
                            setReviewedChords((current) => ({
                              ...current,
                              [event.id]: input.target.value,
                            }))
                          }
                          value={chordReviewSelections[event.id] ?? ''}
                        >
                          <option value="">Choose true chord</option>
                          {RECORDING_CHORD_OPTIONS.map((symbol) => (
                            <option key={symbol} value={symbol}>
                              {symbol}
                            </option>
                          ))}
                          <option value="exclude">Exclude false event</option>
                        </select>
                      </label>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
        <div className="benchmark-actions">
          <button
            className="button"
            disabled={!ready}
            onClick={() =>
              recording !== null &&
              download(encodeMonoPcm16Wav(recording), 'audio/wav', `${baseName}.wav`)
            }
            type="button"
          >
            Download benchmark WAV
          </button>
          <button
            className="button button--primary"
            disabled={!ready || !allReviewed}
            onClick={downloadLabels}
            type="button"
          >
            Accept suggestions &amp; download labels
          </button>
        </div>
        <p className="benchmark-privacy">
          Exports stay on this computer and default to private evaluation only. Nothing is uploaded
          automatically.
        </p>
      </div>
    </section>
  );
}
