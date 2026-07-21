import type { CSSProperties } from 'react';

import type { PracticeAudioModel } from '../usePracticeAudio';
import { Icon } from './Icon';

type InputHudProps = {
  audio: PracticeAudioModel;
  detailsOpen: boolean;
  onConnect: () => void;
  onDetailsToggle: () => void;
  onSettingsToggle: () => void;
  settingsOpen: boolean;
};

type MeterStyle = CSSProperties & { '--meter-fill': string };

const captureLabel = (audio: PracticeAudioModel): string => {
  const { capture } = audio;
  if (capture.error !== null) return capture.error.message;
  if (audio.actionError !== null) return audio.actionError;
  if (capture.warning === 'clipping') return 'Clipping detected';
  if (capture.warning === 'device-ended') return 'Microphone disconnected';
  if (capture.warning === 'silence') return 'No clear input detected';
  if (capture.warning === 'maximum-duration-reached') return 'Recording limit reached';
  if (capture.operationState === 'recording') return 'Recording on this device';
  if (capture.operationState === 'paused') return 'Recording paused';
  if (capture.operationState === 'finalizing') return 'Saving take';
  if (capture.operationState === 'replaying') return 'Reviewing take';
  if (capture.connectionState === 'monitoring') return 'Connected';
  if (capture.connectionState === 'connecting') return 'Connecting';
  if (capture.connectionState === 'failed') return 'Needs attention';
  if (capture.connectionState === 'unsupported') return 'Unsupported';
  return 'Disconnected';
};

export function InputHud({
  audio,
  detailsOpen,
  onConnect,
  onDetailsToggle,
  onSettingsToggle,
  settingsOpen,
}: InputHudProps) {
  const note = audio.noteAnalysis.currentEvent?.candidates[0] ?? null;
  const chordEvent = audio.chordAnalysis.currentChord;
  const chord = chordEvent?.candidates[0] ?? null;
  const reportedDeviceName = audio.capture.device?.deviceLabel;
  const deviceName =
    reportedDeviceName === undefined || reportedDeviceName === ''
      ? 'Default microphone'
      : reportedDeviceName;
  const peak = Math.round(Math.min(1, audio.capture.peak) * 100);
  const confidence = chord === null ? null : Math.round(chord.confidence * 100);
  const connected = audio.capture.connectionState === 'monitoring';

  return (
    <section className="practice-input-hud" aria-label="Live guitar input and analysis">
      <div className="practice-hud-block is-input">
        {connected ? (
          <div>
            <span>Microphone</span>
            <strong>{deviceName}</strong>
            <small
              className={
                audio.capture.error !== null || audio.capture.warning !== null
                  ? 'is-warning'
                  : undefined
              }
              role={audio.capture.error !== null ? 'alert' : 'status'}
            >
              {captureLabel(audio)}
            </small>
          </div>
        ) : (
          <div className="practice-connect-input">
            <span>Audio input</span>
            <button
              className="practice-control is-primary"
              disabled={!audio.capabilities.canConnect}
              onClick={onConnect}
              type="button"
            >
              <Icon name="microphone" />
              Microphone disconnected — Connect
            </button>
            {(audio.actionError !== null ||
              audio.capture.error !== null ||
              audio.capture.warning !== null ||
              audio.capture.operationState !== 'idle' ||
              audio.capture.connectionState !== 'disconnected') && (
              <small
                className="is-warning"
                role={
                  audio.actionError !== null || audio.capture.error !== null ? 'alert' : 'status'
                }
              >
                {captureLabel(audio)}
              </small>
            )}
          </div>
        )}
        <div
          aria-label={`Input level ${String(peak)} percent`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={peak}
          aria-valuetext={`${String(peak)} percent${audio.capture.warning === 'clipping' ? ', clipping detected' : ''}`}
          className="practice-level-meter"
          role="meter"
          style={{ '--meter-fill': `${String(peak)}%` } as MeterStyle}
        >
          <i />
        </div>
      </div>
      <div className="practice-hud-block is-heard" aria-live="polite">
        <div>
          <span>Heard</span>
          <strong>Live observation</strong>
        </div>
        <div className="practice-heard-reading">
          <strong>
            {chord?.symbol ?? note?.noteName ?? (connected ? 'Listening…' : 'No input')}
          </strong>
          <p>
            {chordEvent === null
              ? connected
                ? 'Waiting for a clear, stable sound'
                : 'Connect your microphone to start'
              : `${chordEvent.lifecycle} · ${confidence === null ? 'confidence unavailable' : `${String(confidence)}% match strength`}`}
          </p>
        </div>
      </div>
      <div className="practice-hud-block is-pitch">
        <div>
          <span>Pitch</span>
          <strong>{note === null ? '—' : note.noteName}</strong>
        </div>
        <div className="practice-pitch-reading">
          <strong>
            {note === null
              ? '—'
              : `${note.centsOffset >= 0 ? '+' : ''}${note.centsOffset.toFixed(0)}¢`}
          </strong>
          <div>
            <i
              style={{
                left: `${String(50 + Math.max(-40, Math.min(40, note?.centsOffset ?? 0)))}%`,
              }}
            />
          </div>
        </div>
      </div>
      <div className="practice-hud-actions">
        <button
          aria-controls="practice-analysis-details"
          aria-expanded={detailsOpen}
          className="practice-control is-quiet"
          onClick={onDetailsToggle}
          type="button"
        >
          {detailsOpen ? 'Close live analysis' : 'Live analysis'}
        </button>
        <button
          aria-controls="practice-input-settings"
          aria-expanded={settingsOpen}
          className="practice-control is-secondary"
          onClick={onSettingsToggle}
          type="button"
        >
          Input and recording
        </button>
      </div>
    </section>
  );
}
