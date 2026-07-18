import {
  SessionTimestampMsSchema,
  sessionTimestampMs,
  type SessionTimestampMs,
} from './contracts/common';

export type MonotonicClockSource = {
  now: () => number;
  timeOrigin: number;
};

export type AudioClockAnchor = {
  audioContextSeconds: number;
  sessionTimestampMs: SessionTimestampMs;
};

export type SessionClock = {
  readonly originEpochMs: number;
  fromEpochMs: (epochMs: number) => SessionTimestampMs;
  now: () => SessionTimestampMs;
};

export function readMonotonicEpochMs(clock: MonotonicClockSource = performance): number {
  const value = clock.timeOrigin + clock.now();

  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('The monotonic clock returned an invalid timestamp.');
  }

  return value;
}

export function createSessionClock(
  clock: MonotonicClockSource = performance,
  originEpochMs = readMonotonicEpochMs(clock),
): SessionClock {
  if (!Number.isFinite(originEpochMs) || originEpochMs < 0) {
    throw new RangeError('The session clock origin must be a finite non-negative number.');
  }

  const fromEpochMs = (epochMs: number): SessionTimestampMs => {
    if (!Number.isFinite(epochMs)) {
      throw new RangeError('An epoch timestamp must be finite.');
    }

    return sessionTimestampMs(Math.max(0, epochMs - originEpochMs));
  };

  return {
    fromEpochMs,
    now: () => fromEpochMs(readMonotonicEpochMs(clock)),
    originEpochMs,
  };
}

export function mapAudioContextTime(
  audioContextSeconds: number,
  anchor: AudioClockAnchor,
): SessionTimestampMs {
  if (!Number.isFinite(audioContextSeconds) || audioContextSeconds < 0) {
    throw new RangeError('AudioContext time must be a finite non-negative number.');
  }

  const elapsedMs = (audioContextSeconds - anchor.audioContextSeconds) * 1_000;
  return SessionTimestampMsSchema.parse(Math.max(0, anchor.sessionTimestampMs + elapsedMs));
}

export function mapMediaTimestamp(
  timestampMicroseconds: number,
  mediaOriginSessionMs: SessionTimestampMs,
): SessionTimestampMs {
  if (!Number.isFinite(timestampMicroseconds) || timestampMicroseconds < 0) {
    throw new RangeError('A media timestamp must be a finite non-negative number.');
  }

  return sessionTimestampMs(mediaOriginSessionMs + timestampMicroseconds / 1_000);
}
