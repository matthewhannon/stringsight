/**
 * StringSight-owned Standard MIDI File byte preflight.
 *
 * This reader deliberately stops at raw SMF accounting. It does not create a PracticeDocument,
 * infer guitar semantics, or delegate bytes to a high-level parser. Every accepted byte belongs to
 * exactly one header, track-header, or event span.
 */

export const SMF_PREFLIGHT_DEFAULT_LIMITS = Object.freeze({
  maximumBytes: 4 * 1024 * 1024,
  maximumEvents: 100_000,
  maximumTrackBytes: 2 * 1024 * 1024,
  maximumTracks: 64,
} as const);

export type SmfPreflightLimits = Readonly<{
  maximumBytes: number;
  maximumEvents: number;
  maximumTrackBytes: number;
  maximumTracks: number;
}>;

export type SmfRawDisposition = 'consumed' | 'preserved' | 'ignored-by-policy' | 'unsupported';

export type SmfEventKind =
  | 'channel-aftertouch'
  | 'controller'
  | 'end-of-track'
  | 'key-signature'
  | 'lyrics'
  | 'marker'
  | 'note-off'
  | 'note-on'
  | 'pitch-bend'
  | 'poly-aftertouch'
  | 'program-change'
  | 'system-exclusive'
  | 'tempo'
  | 'text'
  | 'time-signature'
  | 'track-name'
  | `meta-0x${string}`;

export type SmfStructuralSpan = Readonly<{
  endByte: number;
  kind: 'header' | 'track-header';
  startByte: number;
  trackIndex: number | null;
}>;

export type SmfRawEvent = Readonly<{
  absoluteTick: number;
  channel: number | null;
  data: readonly number[];
  deltaTicks: number;
  disposition: SmfRawDisposition;
  endByte: number;
  eventId: string;
  eventIndex: number;
  kind: SmfEventKind;
  metaType: number | null;
  runningStatus: boolean;
  startByte: number;
  status: number;
  trackIndex: number;
}>;

export type SmfTrackInventory = Readonly<{
  declaredPayloadBytes: number;
  endByte: number;
  endTick: number;
  eventCount: number;
  headerEndByte: number;
  headerStartByte: number;
  index: number;
  payloadStartByte: number;
}>;

export type SmfTimeDivision =
  | Readonly<{ kind: 'ppq'; ticksPerQuarter: number }>
  | Readonly<{ framesPerSecond: number; kind: 'smpte'; ticksPerFrame: number }>;

export type SmfPreflightInventory = Readonly<{
  byteLength: number;
  events: readonly SmfRawEvent[];
  format: 0 | 1 | 2;
  headerLength: number;
  limits: SmfPreflightLimits;
  structuralSpans: readonly SmfStructuralSpan[];
  timeDivision: SmfTimeDivision;
  trackCount: number;
  tracks: readonly SmfTrackInventory[];
}>;

export type SmfPreflightErrorCode =
  | 'byte-limit-exceeded'
  | 'event-limit-exceeded'
  | 'malformed-data-byte'
  | 'malformed-header'
  | 'malformed-meta-event'
  | 'malformed-track'
  | 'malformed-vlq'
  | 'missing-end-of-track'
  | 'running-status-without-status'
  | 'track-byte-limit-exceeded'
  | 'track-count-limit-exceeded'
  | 'trailing-data'
  | 'unsupported-format';

export class SmfPreflightError extends Error {
  readonly byteOffset: number;
  readonly code: SmfPreflightErrorCode;
  readonly eventCount: number;
  readonly trackIndex: number | null;

  constructor(input: {
    byteOffset: number;
    code: SmfPreflightErrorCode;
    eventCount?: number;
    message: string;
    trackIndex?: number | null;
  }) {
    super(input.message);
    this.name = 'SmfPreflightError';
    this.byteOffset = input.byteOffset;
    this.code = input.code;
    this.eventCount = input.eventCount ?? 0;
    this.trackIndex = input.trackIndex ?? null;
  }
}

type ChannelDescriptor = Readonly<{
  dataLength: 1 | 2;
  disposition: SmfRawDisposition;
  kind: SmfEventKind;
}>;

const CHANNEL_DESCRIPTORS: Readonly<Record<number, ChannelDescriptor>> = Object.freeze({
  0x8: { dataLength: 2, disposition: 'consumed', kind: 'note-off' },
  0x9: { dataLength: 2, disposition: 'consumed', kind: 'note-on' },
  0xa: { dataLength: 2, disposition: 'ignored-by-policy', kind: 'poly-aftertouch' },
  0xb: { dataLength: 2, disposition: 'ignored-by-policy', kind: 'controller' },
  0xc: { dataLength: 1, disposition: 'ignored-by-policy', kind: 'program-change' },
  0xd: { dataLength: 1, disposition: 'ignored-by-policy', kind: 'channel-aftertouch' },
  0xe: { dataLength: 2, disposition: 'ignored-by-policy', kind: 'pitch-bend' },
});

const META_DESCRIPTORS = new Map<number, readonly [SmfEventKind, SmfRawDisposition]>([
  [0x01, ['text', 'preserved']],
  [0x03, ['track-name', 'preserved']],
  [0x05, ['lyrics', 'preserved']],
  [0x06, ['marker', 'preserved']],
  [0x2f, ['end-of-track', 'consumed']],
  [0x51, ['tempo', 'consumed']],
  [0x58, ['time-signature', 'consumed']],
  [0x59, ['key-signature', 'consumed']],
]);

const EXPECTED_META_LENGTHS = new Map<number, number>([
  [0x2f, 0],
  [0x51, 3],
  [0x58, 4],
  [0x59, 2],
]);

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function normalizeLimits(input: Partial<SmfPreflightLimits>): SmfPreflightLimits {
  return Object.freeze({
    maximumBytes: positiveInteger(
      input.maximumBytes ?? SMF_PREFLIGHT_DEFAULT_LIMITS.maximumBytes,
      'maximumBytes',
    ),
    maximumEvents: positiveInteger(
      input.maximumEvents ?? SMF_PREFLIGHT_DEFAULT_LIMITS.maximumEvents,
      'maximumEvents',
    ),
    maximumTrackBytes: positiveInteger(
      input.maximumTrackBytes ?? SMF_PREFLIGHT_DEFAULT_LIMITS.maximumTrackBytes,
      'maximumTrackBytes',
    ),
    maximumTracks: positiveInteger(
      input.maximumTracks ?? SMF_PREFLIGHT_DEFAULT_LIMITS.maximumTracks,
      'maximumTracks',
    ),
  });
}

class Reader {
  readonly bytes: Uint8Array;
  position = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  ensure(count: number, code: SmfPreflightErrorCode, trackIndex: number | null): void {
    if (this.position + count > this.bytes.length) {
      throw new SmfPreflightError({
        byteOffset: this.position,
        code,
        message: `SMF is truncated at byte ${String(this.position)}; ${String(count)} byte(s) were required.`,
        trackIndex,
      });
    }
  }

  ascii(count: number, code: SmfPreflightErrorCode, trackIndex: number | null): string {
    this.ensure(count, code, trackIndex);
    let value = '';
    for (let index = 0; index < count; index += 1) value += String.fromCharCode(this.u8());
    return value;
  }

  bytesValue(count: number, code: SmfPreflightErrorCode, trackIndex: number): number[] {
    this.ensure(count, code, trackIndex);
    const value = Array.from(this.bytes.subarray(this.position, this.position + count));
    this.position += count;
    return value;
  }

  u8(): number {
    const value = this.bytes[this.position];
    if (value === undefined) {
      throw new SmfPreflightError({
        byteOffset: this.position,
        code: 'malformed-track',
        message: `SMF is truncated at byte ${String(this.position)}.`,
      });
    }
    this.position += 1;
    return value;
  }

  u16(code: SmfPreflightErrorCode, trackIndex: number | null): number {
    this.ensure(2, code, trackIndex);
    return this.u8() * 0x100 + this.u8();
  }

  u32(code: SmfPreflightErrorCode, trackIndex: number | null): number {
    this.ensure(4, code, trackIndex);
    return this.u8() * 0x1000000 + this.u8() * 0x10000 + this.u8() * 0x100 + this.u8();
  }

  variable(trackEnd: number, trackIndex: number): number {
    let value = 0;
    for (let index = 0; index < 4; index += 1) {
      if (this.position >= trackEnd) {
        throw new SmfPreflightError({
          byteOffset: this.position,
          code: 'malformed-vlq',
          message: `Variable-length quantity is truncated in track ${String(trackIndex)}.`,
          trackIndex,
        });
      }
      const byte = this.u8();
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new SmfPreflightError({
      byteOffset: this.position - 4,
      code: 'malformed-vlq',
      message: `Variable-length quantity exceeds four bytes in track ${String(trackIndex)}.`,
      trackIndex,
    });
  }
}

function parseTimeDivision(raw: number): SmfTimeDivision {
  if ((raw & 0x8000) === 0) {
    if (raw === 0) {
      throw new SmfPreflightError({
        byteOffset: 12,
        code: 'malformed-header',
        message: 'PPQ time division must be greater than zero.',
      });
    }
    return { kind: 'ppq', ticksPerQuarter: raw };
  }
  const signedFrames = ((raw >> 8) & 0xff) - 0x100;
  const framesPerSecond = -signedFrames;
  const ticksPerFrame = raw & 0xff;
  if (![24, 25, 29, 30].includes(framesPerSecond) || ticksPerFrame === 0) {
    throw new SmfPreflightError({
      byteOffset: 12,
      code: 'malformed-header',
      message: 'SMPTE division must use -24, -25, -29, or -30 fps and nonzero ticks/frame.',
    });
  }
  return { framesPerSecond, kind: 'smpte', ticksPerFrame };
}

function assertDataBytes(data: readonly number[], byteOffset: number, trackIndex: number): void {
  const invalidIndex = data.findIndex((value) => value >= 0x80);
  if (invalidIndex >= 0) {
    throw new SmfPreflightError({
      byteOffset: byteOffset + invalidIndex,
      code: 'malformed-data-byte',
      message: 'Channel-event data bytes must have their high bit clear.',
      trackIndex,
    });
  }
}

/** Parses and inventories raw SMF bytes without performing semantic conversion. */
export function preflightSmf(
  input: Uint8Array,
  limitOverrides: Partial<SmfPreflightLimits> = {},
): SmfPreflightInventory {
  if (!(input instanceof Uint8Array)) throw new TypeError('SMF input must be a Uint8Array.');
  const limits = normalizeLimits(limitOverrides);
  if (input.byteLength > limits.maximumBytes) {
    throw new SmfPreflightError({
      byteOffset: 0,
      code: 'byte-limit-exceeded',
      message: `SMF byte length ${String(input.byteLength)} exceeds limit ${String(limits.maximumBytes)}.`,
    });
  }

  const bytes = input;
  const reader = new Reader(bytes);
  if (reader.ascii(4, 'malformed-header', null) !== 'MThd') {
    throw new SmfPreflightError({
      byteOffset: 0,
      code: 'malformed-header',
      message: 'SMF must begin with an MThd header chunk.',
    });
  }
  const headerLength = reader.u32('malformed-header', null);
  if (headerLength !== 6) {
    throw new SmfPreflightError({
      byteOffset: 4,
      code: 'malformed-header',
      message: 'The bounded reader accepts the canonical six-byte SMF header payload only.',
    });
  }
  const rawFormat = reader.u16('malformed-header', null);
  if (rawFormat !== 0 && rawFormat !== 1 && rawFormat !== 2) {
    throw new SmfPreflightError({
      byteOffset: 8,
      code: 'unsupported-format',
      message: `SMF format ${String(rawFormat)} is not defined by the file format.`,
    });
  }
  const format = rawFormat;
  const trackCount = reader.u16('malformed-header', null);
  if (trackCount === 0 || (format === 0 && trackCount !== 1)) {
    throw new SmfPreflightError({
      byteOffset: 10,
      code: 'malformed-header',
      message: 'SMF must declare at least one track, and format 0 must declare exactly one.',
    });
  }
  if (trackCount > limits.maximumTracks) {
    throw new SmfPreflightError({
      byteOffset: 10,
      code: 'track-count-limit-exceeded',
      message: `SMF track count ${String(trackCount)} exceeds limit ${String(limits.maximumTracks)}.`,
    });
  }
  const timeDivision = parseTimeDivision(reader.u16('malformed-header', null));
  const structuralSpans: SmfStructuralSpan[] = [
    { endByte: reader.position, kind: 'header', startByte: 0, trackIndex: null },
  ];
  const events: SmfRawEvent[] = [];
  const tracks: SmfTrackInventory[] = [];

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    const headerStartByte = reader.position;
    if (reader.ascii(4, 'malformed-track', trackIndex) !== 'MTrk') {
      throw new SmfPreflightError({
        byteOffset: headerStartByte,
        code: 'malformed-track',
        eventCount: events.length,
        message: `Track ${String(trackIndex)} does not begin with MTrk.`,
        trackIndex,
      });
    }
    const declaredPayloadBytes = reader.u32('malformed-track', trackIndex);
    if (declaredPayloadBytes > limits.maximumTrackBytes) {
      throw new SmfPreflightError({
        byteOffset: headerStartByte + 4,
        code: 'track-byte-limit-exceeded',
        eventCount: events.length,
        message: `Track ${String(trackIndex)} declares ${String(declaredPayloadBytes)} bytes, exceeding limit ${String(limits.maximumTrackBytes)}.`,
        trackIndex,
      });
    }
    const headerEndByte = reader.position;
    const trackEnd = headerEndByte + declaredPayloadBytes;
    if (!Number.isSafeInteger(trackEnd) || trackEnd > bytes.length) {
      throw new SmfPreflightError({
        byteOffset: headerStartByte + 4,
        code: 'malformed-track',
        eventCount: events.length,
        message: `Track ${String(trackIndex)} payload extends beyond the source bytes.`,
        trackIndex,
      });
    }
    structuralSpans.push({
      endByte: headerEndByte,
      kind: 'track-header',
      startByte: headerStartByte,
      trackIndex,
    });
    let absoluteTick = 0;
    let eventIndex = 0;
    let reachedEndOfTrack = false;
    let runningStatus: number | null = null;
    while (reader.position < trackEnd) {
      if (events.length >= limits.maximumEvents) {
        throw new SmfPreflightError({
          byteOffset: reader.position,
          code: 'event-limit-exceeded',
          eventCount: events.length + 1,
          message: `SMF event count exceeds limit ${String(limits.maximumEvents)}.`,
          trackIndex,
        });
      }
      if (reachedEndOfTrack) {
        throw new SmfPreflightError({
          byteOffset: reader.position,
          code: 'malformed-track',
          eventCount: events.length,
          message: `Track ${String(trackIndex)} contains bytes after its end-of-track event.`,
          trackIndex,
        });
      }
      const startByte = reader.position;
      const deltaTicks = reader.variable(trackEnd, trackIndex);
      if (absoluteTick > Number.MAX_SAFE_INTEGER - deltaTicks) {
        throw new SmfPreflightError({
          byteOffset: startByte,
          code: 'malformed-track',
          eventCount: events.length,
          message: `Track ${String(trackIndex)} absolute tick exceeds the safe integer range.`,
          trackIndex,
        });
      }
      absoluteTick += deltaTicks;
      if (reader.position >= trackEnd) {
        throw new SmfPreflightError({
          byteOffset: reader.position,
          code: 'malformed-track',
          eventCount: events.length,
          message: `Track ${String(trackIndex)} event is missing a status byte.`,
          trackIndex,
        });
      }
      let status = reader.u8();
      let firstData: number | null = null;
      let usedRunningStatus = false;
      if (status < 0x80) {
        if (runningStatus === null) {
          throw new SmfPreflightError({
            byteOffset: reader.position - 1,
            code: 'running-status-without-status',
            eventCount: events.length,
            message: `Track ${String(trackIndex)} uses running status before a channel status.`,
            trackIndex,
          });
        }
        firstData = status;
        status = runningStatus;
        usedRunningStatus = true;
      } else if (status < 0xf0) {
        runningStatus = status;
      } else {
        runningStatus = null;
      }

      let channel: number | null = null;
      let data: number[];
      let disposition: SmfRawDisposition;
      let kind: SmfEventKind;
      let metaType: number | null = null;
      if (status === 0xff) {
        if (reader.position >= trackEnd) {
          throw new SmfPreflightError({
            byteOffset: reader.position,
            code: 'malformed-meta-event',
            eventCount: events.length,
            message: 'Meta event is missing its type byte.',
            trackIndex,
          });
        }
        metaType = reader.u8();
        const length = reader.variable(trackEnd, trackIndex);
        if (reader.position + length > trackEnd) {
          throw new SmfPreflightError({
            byteOffset: reader.position,
            code: 'malformed-meta-event',
            eventCount: events.length,
            message: 'Meta-event payload extends beyond its track.',
            trackIndex,
          });
        }
        const expectedLength = EXPECTED_META_LENGTHS.get(metaType);
        if (expectedLength !== undefined && expectedLength !== length) {
          throw new SmfPreflightError({
            byteOffset: reader.position,
            code: 'malformed-meta-event',
            eventCount: events.length,
            message: `Meta event 0x${metaType.toString(16).padStart(2, '0')} must contain ${String(expectedLength)} byte(s).`,
            trackIndex,
          });
        }
        data = reader.bytesValue(length, 'malformed-meta-event', trackIndex);
        [kind, disposition] = META_DESCRIPTORS.get(metaType) ?? [
          `meta-0x${metaType.toString(16).padStart(2, '0')}`,
          'preserved',
        ];
        reachedEndOfTrack = metaType === 0x2f;
      } else if (status === 0xf0 || status === 0xf7) {
        const length = reader.variable(trackEnd, trackIndex);
        if (reader.position + length > trackEnd) {
          throw new SmfPreflightError({
            byteOffset: reader.position,
            code: 'malformed-track',
            eventCount: events.length,
            message: 'System-exclusive payload extends beyond its track.',
            trackIndex,
          });
        }
        data = reader.bytesValue(length, 'malformed-track', trackIndex);
        kind = 'system-exclusive';
        disposition = 'unsupported';
      } else {
        const descriptor = CHANNEL_DESCRIPTORS[status >> 4];
        if (descriptor === undefined) {
          throw new SmfPreflightError({
            byteOffset: reader.position - 1,
            code: 'malformed-track',
            eventCount: events.length,
            message: `Status 0x${status.toString(16)} is not valid in an SMF track event.`,
            trackIndex,
          });
        }
        const remainingLength = descriptor.dataLength - (firstData === null ? 0 : 1);
        if (reader.position + remainingLength > trackEnd) {
          throw new SmfPreflightError({
            byteOffset: reader.position,
            code: 'malformed-track',
            eventCount: events.length,
            message: 'Channel-event payload extends beyond its track.',
            trackIndex,
          });
        }
        data = [
          ...(firstData === null ? [] : [firstData]),
          ...reader.bytesValue(remainingLength, 'malformed-track', trackIndex),
        ];
        assertDataBytes(data, reader.position - remainingLength, trackIndex);
        channel = status & 0x0f;
        kind = descriptor.kind;
        disposition = descriptor.disposition;
      }

      events.push({
        absoluteTick,
        channel,
        data,
        deltaTicks,
        disposition,
        endByte: reader.position,
        eventId: `smf-track-${String(trackIndex)}-event-${String(eventIndex)}`,
        eventIndex,
        kind,
        metaType,
        runningStatus: usedRunningStatus,
        startByte,
        status,
        trackIndex,
      });
      eventIndex += 1;
    }
    if (!reachedEndOfTrack) {
      throw new SmfPreflightError({
        byteOffset: trackEnd,
        code: 'missing-end-of-track',
        eventCount: events.length,
        message: `Track ${String(trackIndex)} has no end-of-track meta event.`,
        trackIndex,
      });
    }
    tracks.push({
      declaredPayloadBytes,
      endByte: trackEnd,
      endTick: absoluteTick,
      eventCount: eventIndex,
      headerEndByte,
      headerStartByte,
      index: trackIndex,
      payloadStartByte: headerEndByte,
    });
  }

  if (reader.position !== bytes.length) {
    throw new SmfPreflightError({
      byteOffset: reader.position,
      code: 'trailing-data',
      eventCount: events.length,
      message: `SMF contains ${String(bytes.length - reader.position)} trailing byte(s).`,
    });
  }

  return deepFreeze({
    byteLength: bytes.length,
    events,
    format,
    headerLength,
    limits,
    structuralSpans,
    timeDivision,
    trackCount,
    tracks,
  });
}
