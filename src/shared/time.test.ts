import { describe, expect, it } from 'vitest';

import { sessionTimestampMs } from './contracts';
import {
  createSessionClock,
  mapAudioContextTime,
  mapMediaTimestamp,
  readMonotonicEpochMs,
} from './time';

describe('shared monotonic timebase', () => {
  it('combines a monotonic source with its time origin', () => {
    expect(readMonotonicEpochMs({ now: () => 250.5, timeOrigin: 1_000 })).toBe(1_250.5);
    expect(() => readMonotonicEpochMs({ now: () => Number.NaN, timeOrigin: 0 })).toThrow(
      RangeError,
    );
  });

  it('returns timestamps relative to a stable session origin', () => {
    let elapsedMs = 25;
    const source = { now: () => elapsedMs, timeOrigin: 1_000 };
    const clock = createSessionClock(source, 1_000);

    expect(clock.originEpochMs).toBe(1_000);
    expect(clock.now()).toBe(25);
    elapsedMs = 80;
    expect(clock.now()).toBe(80);
    expect(clock.fromEpochMs(900)).toBe(0);
    expect(() => clock.fromEpochMs(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => createSessionClock(source, -1)).toThrow(RangeError);
  });

  it('maps AudioContext seconds through an explicit session anchor', () => {
    expect(
      mapAudioContextTime(12.75, {
        audioContextSeconds: 12.5,
        sessionTimestampMs: sessionTimestampMs(1_000),
      }),
    ).toBe(1_250);
    expect(
      mapAudioContextTime(12, {
        audioContextSeconds: 12.5,
        sessionTimestampMs: sessionTimestampMs(1_000),
      }),
    ).toBe(500);
    expect(() =>
      mapAudioContextTime(-1, {
        audioContextSeconds: 0,
        sessionTimestampMs: sessionTimestampMs(0),
      }),
    ).toThrow(RangeError);
  });

  it('maps media microseconds into session milliseconds', () => {
    expect(mapMediaTimestamp(250_000, sessionTimestampMs(400))).toBe(650);
    expect(() => mapMediaTimestamp(-1, sessionTimestampMs(0))).toThrow(RangeError);
  });
});
