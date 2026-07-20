import { z } from 'zod';

import { CONTRACT_SCHEMA_VERSION, SessionSchema, type Session } from '../shared';
import { projectReviewEvents } from './review';

export const AUDIO_SESSION_EXPORT_FORMAT = 'stringsight-audio-session' as const;
export const AUDIO_SESSION_EXPORT_VERSION = 1 as const;

export const AudioSessionExportSchema = z.object({
  exportedAt: z.iso.datetime({ offset: true }),
  format: z.literal(AUDIO_SESSION_EXPORT_FORMAT),
  formatVersion: z.literal(AUDIO_SESSION_EXPORT_VERSION),
  session: SessionSchema,
});

export type AudioSessionExport = z.infer<typeof AudioSessionExportSchema>;

export function exportSessionJson(session: Session, exportedAt = new Date()): string {
  if (session.status !== 'complete') throw new Error('Only complete sessions can be exported.');
  return JSON.stringify(
    AudioSessionExportSchema.parse({
      exportedAt: exportedAt.toISOString(),
      format: AUDIO_SESSION_EXPORT_FORMAT,
      formatVersion: AUDIO_SESSION_EXPORT_VERSION,
      session,
    }),
    null,
    2,
  );
}

export function importSessionJson(json: string): Session {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  const document = AudioSessionExportSchema.parse(input);
  if (document.session.status !== 'complete') {
    throw new Error('Only complete audio sessions can be imported.');
  }
  return document.session;
}

const writeUint32 = (target: number[], value: number): void => {
  target.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
};

const writeUint16 = (target: number[], value: number): void => {
  target.push((value >>> 8) & 0xff, value & 0xff);
};

const variableLength = (value: number): number[] => {
  let buffer = value & 0x7f;
  const result: number[] = [];
  while ((value >>= 7) > 0) buffer = (buffer << 8) | 0x80 | (value & 0x7f);
  let hasMoreBytes: boolean;
  do {
    const byte = buffer & 0xff;
    result.push(byte);
    hasMoreBytes = (byte & 0x80) !== 0;
    buffer >>= 8;
  } while (hasMoreBytes);
  return result;
};

type MidiMessage = {
  readonly bytes: readonly number[];
  readonly order: number;
  readonly tick: number;
};

const midiNotesFor = (session: Session): MidiMessage[] =>
  projectReviewEvents(session).flatMap(({ appliedCorrection, rawEvent }) => {
    if (rawEvent.kind !== 'note' || rawEvent.time.endMs === undefined) return [];
    const midi = appliedCorrection?.note?.midi ?? rawEvent.candidates[0]?.midi;
    if (midi === undefined) return [];
    const start = Math.max(0, Math.round(Number(rawEvent.time.startMs)));
    const end = Math.max(start + 1, Math.round(Number(rawEvent.time.endMs)));
    return [
      { bytes: [0x90, midi, 96], order: 1, tick: start },
      { bytes: [0x80, midi, 0], order: 0, tick: end },
    ];
  });

export function canExportSessionMidi(session: Session | null): boolean {
  return session?.status === 'complete' && midiNotesFor(session).length > 0;
}

export function exportSessionMidi(session: Session): Uint8Array<ArrayBuffer> {
  if (session.status !== 'complete') throw new Error('Only complete sessions can be exported.');
  const messages = midiNotesFor(session).sort(
    (left, right) => left.tick - right.tick || left.order - right.order,
  );
  if (messages.length === 0) {
    throw new Error('This session has no finalized note events with defensible MIDI pitches.');
  }

  const track: number[] = [0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40];
  let previousTick = 0;
  for (const message of messages) {
    track.push(...variableLength(message.tick - previousTick), ...message.bytes);
    previousTick = message.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  const bytes: number[] = [0x4d, 0x54, 0x68, 0x64];
  writeUint32(bytes, 6);
  writeUint16(bytes, 0);
  writeUint16(bytes, 1);
  writeUint16(bytes, 1000);
  bytes.push(0x4d, 0x54, 0x72, 0x6b);
  writeUint32(bytes, track.length);
  bytes.push(...track);
  return new Uint8Array(bytes);
}

export const SESSION_EXPORT_SCHEMA_VERSION = CONTRACT_SCHEMA_VERSION;
