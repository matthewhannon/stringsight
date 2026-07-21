import { describe, expect, it } from 'vitest';

import declaredType1Hex from './__fixtures__/declared-type1.hex?raw';
import malformedVlqHex from './__fixtures__/malformed-vlq.hex?raw';
import runningStatusHex from './__fixtures__/running-status-without-status.hex?raw';
import { SmfPreflightError, preflightSmf } from './smf-preflight';

function decodeHex(source: string): Uint8Array {
  const hex = source
    .split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('')
    .replaceAll(/\s/gu, '');
  return Uint8Array.from(hex.match(/.{2}/gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

function u16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function smf(format: number, division: number, tracks: readonly (readonly number[])[]): Uint8Array {
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    ...u32(6),
    ...u16(format),
    ...u16(tracks.length),
    ...u16(division),
  ];
  return Uint8Array.from([
    ...header,
    ...tracks.flatMap((track) => [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]),
  ]);
}

function expectPreflightCode(bytes: Uint8Array, code: SmfPreflightError['code']): void {
  try {
    preflightSmf(bytes);
    throw new Error('Expected SMF preflight to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(SmfPreflightError);
    expect(error).toMatchObject({ code });
  }
}

describe('raw SMF preflight', () => {
  it('matches the independent 142-byte/21-event oracle and accounts for every byte once', () => {
    const bytes = decodeHex(declaredType1Hex);
    const inventory = preflightSmf(bytes);
    expect(inventory).toMatchObject({ byteLength: 142, format: 1, headerLength: 6, trackCount: 2 });
    expect(inventory.timeDivision).toEqual({ kind: 'ppq', ticksPerQuarter: 480 });
    expect(
      inventory.tracks.map(({ declaredPayloadBytes, endTick, eventCount }) => ({
        declaredPayloadBytes,
        endTick,
        eventCount,
      })),
    ).toEqual([
      { declaredPayloadBytes: 45, endTick: 1200, eventCount: 6 },
      { declaredPayloadBytes: 67, endTick: 1200, eventCount: 15 },
    ]);
    expect(
      inventory.events.reduce<Record<string, number>>((counts, event) => {
        counts[event.disposition] = (counts[event.disposition] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ consumed: 10, 'ignored-by-policy': 5, preserved: 5, unsupported: 1 });

    const covered = new Uint8Array(bytes.length);
    for (const span of [...inventory.structuralSpans, ...inventory.events]) {
      for (let offset = span.startByte; offset < span.endByte; offset += 1) {
        covered[offset] = (covered[offset] ?? 0) + 1;
      }
    }
    expect(Array.from(covered)).toEqual(Array.from({ length: 142 }, () => 1));
    expect(
      inventory.events.map(({ absoluteTick, endByte, kind, startByte }) => ({
        absoluteTick,
        endByte,
        kind,
        startByte,
      })),
    ).toEqual([
      { absoluteTick: 0, endByte: 35, kind: 'track-name', startByte: 22 },
      { absoluteTick: 0, endByte: 42, kind: 'tempo', startByte: 35 },
      { absoluteTick: 0, endByte: 50, kind: 'time-signature', startByte: 42 },
      { absoluteTick: 240, endByte: 57, kind: 'key-signature', startByte: 50 },
      { absoluteTick: 1200, endByte: 63, kind: 'marker', startByte: 57 },
      { absoluteTick: 1200, endByte: 67, kind: 'end-of-track', startByte: 63 },
      { absoluteTick: 0, endByte: 78, kind: 'program-change', startByte: 75 },
      { absoluteTick: 0, endByte: 82, kind: 'note-on', startByte: 78 },
      { absoluteTick: 240, endByte: 87, kind: 'pitch-bend', startByte: 82 },
      { absoluteTick: 480, endByte: 92, kind: 'poly-aftertouch', startByte: 87 },
      { absoluteTick: 480, endByte: 96, kind: 'controller', startByte: 92 },
      { absoluteTick: 480, endByte: 99, kind: 'channel-aftertouch', startByte: 96 },
      { absoluteTick: 480, endByte: 105, kind: 'system-exclusive', startByte: 99 },
      { absoluteTick: 480, endByte: 110, kind: 'text', startByte: 105 },
      { absoluteTick: 480, endByte: 116, kind: 'meta-0x7f', startByte: 110 },
      { absoluteTick: 720, endByte: 121, kind: 'note-off', startByte: 116 },
      { absoluteTick: 720, endByte: 124, kind: 'note-off', startByte: 121 },
      { absoluteTick: 720, endByte: 128, kind: 'note-on', startByte: 124 },
      { absoluteTick: 1200, endByte: 132, kind: 'note-on', startByte: 128 },
      { absoluteTick: 1200, endByte: 138, kind: 'lyrics', startByte: 132 },
      { absoluteTick: 1200, endByte: 142, kind: 'end-of-track', startByte: 138 },
    ]);
    expect(inventory.events[16]).toMatchObject({ data: [47, 0], runningStatus: true });
    expect(inventory.events[18]).toMatchObject({ data: [47, 0], runningStatus: true });
    expect(Object.isFrozen(inventory)).toBe(true);
    expect(Object.isFrozen(inventory.events)).toBe(true);
  });

  it('rejects retained malformed VLQ and running-status controls at exact offsets', () => {
    expectPreflightCode(decodeHex(malformedVlqHex), 'malformed-vlq');
    try {
      preflightSmf(decodeHex(runningStatusHex));
      throw new Error('Expected running status rejection.');
    } catch (error) {
      expect(error).toMatchObject({
        byteOffset: 23,
        code: 'running-status-without-status',
        trackIndex: 0,
      });
    }
  });

  it('rejects corrupt headers, tracks, event payloads, and trailing bytes', () => {
    expectPreflightCode(Uint8Array.of(), 'malformed-header');
    expectPreflightCode(Uint8Array.of(0x42, 0x41, 0x44, 0x21), 'malformed-header');
    expectPreflightCode(smf(3, 480, [[0, 0xff, 0x2f, 0]]), 'unsupported-format');
    expectPreflightCode(smf(0, 480, [[], []]), 'malformed-header');
    expectPreflightCode(smf(1, 0, [[0, 0xff, 0x2f, 0]]), 'malformed-header');
    expectPreflightCode(
      smf(1, 480, [[0, 0x90, 60, 0xff, 0, 0xff, 0x2f, 0]]),
      'malformed-data-byte',
    );
    expectPreflightCode(
      smf(1, 480, [[0, 0xff, 0x51, 2, 1, 2, 0, 0xff, 0x2f, 0]]),
      'malformed-meta-event',
    );
    expectPreflightCode(smf(1, 480, [[0, 0x90, 60, 80]]), 'missing-end-of-track');
    expectPreflightCode(smf(1, 480, [[0, 0xff, 0x2f, 0, 0]]), 'malformed-track');
    expectPreflightCode(
      Uint8Array.from([...smf(1, 480, [[0, 0xff, 0x2f, 0]]), 0]),
      'trailing-data',
    );
  });

  it('inventories defined Type-0, Type-2, and SMPTE structure without advertising conversion', () => {
    expect(preflightSmf(smf(0, 480, [[0, 0xff, 0x2f, 0]])).format).toBe(0);
    expect(preflightSmf(smf(2, 960, [[0, 0xff, 0x2f, 0]])).format).toBe(2);
    expect(preflightSmf(smf(1, 0xe728, [[0, 0xff, 0x2f, 0]])).timeDivision).toEqual({
      framesPerSecond: 25,
      kind: 'smpte',
      ticksPerFrame: 40,
    });
  });

  it('stops on byte, track-count, track-byte, and event ceilings before unbounded work', () => {
    const valid = smf(1, 480, [[0, 0xff, 1, 0, 0, 0xff, 0x2f, 0]]);
    expect(() => preflightSmf(valid, { maximumBytes: valid.length - 1 })).toThrow(
      expect.objectContaining({ code: 'byte-limit-exceeded' }),
    );
    expect(() => preflightSmf(valid, { maximumEvents: 1 })).toThrow(
      expect.objectContaining({ code: 'event-limit-exceeded', eventCount: 2 }),
    );
    const tooManyTracks = Uint8Array.from([
      0x4d,
      0x54,
      0x68,
      0x64,
      ...u32(6),
      ...u16(1),
      ...u16(65),
      ...u16(480),
    ]);
    expect(() => preflightSmf(tooManyTracks)).toThrow(
      expect.objectContaining({ code: 'track-count-limit-exceeded' }),
    );
    const declaredHugeTrack = Uint8Array.from([
      0x4d,
      0x54,
      0x68,
      0x64,
      ...u32(6),
      ...u16(1),
      ...u16(1),
      ...u16(480),
      0x4d,
      0x54,
      0x72,
      0x6b,
      ...u32(101),
    ]);
    expect(() => preflightSmf(declaredHugeTrack, { maximumTrackBytes: 100 })).toThrow(
      expect.objectContaining({ code: 'track-byte-limit-exceeded' }),
    );
  });
});
