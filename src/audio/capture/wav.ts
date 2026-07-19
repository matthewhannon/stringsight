import { sessionTimestampMs } from '../../shared';
import { PCM_CHUNK_SCHEMA_VERSION, type CapturedRecording } from './contracts';

export type DecodedWav = {
  data: Float32Array<ArrayBuffer>;
  inputChannelCount: number;
  sampleRate: number;
};

export type ImportedRecordingOptions = {
  recordedAt?: string;
  startedAtMs?: number;
};

const readAscii = (bytes: Uint8Array, offset: number, length: number): string => {
  if (offset < 0 || offset + length > bytes.length) return '';
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
};

const readPcmSample = (
  view: DataView,
  offset: number,
  audioFormat: number,
  bitsPerSample: number,
): number => {
  if (audioFormat === 3 && bitsPerSample === 32) return view.getFloat32(offset, true);
  if (audioFormat !== 1) throw new Error(`Unsupported WAV audio format ${String(audioFormat)}.`);
  if (bitsPerSample === 8) return (view.getUint8(offset) - 128) / 128;
  if (bitsPerSample === 16) return view.getInt16(offset, true) / 32_768;
  if (bitsPerSample === 24) {
    const unsigned =
      view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    const signed = (unsigned & 0x80_00_00) === 0 ? unsigned : unsigned | 0xff_00_00_00;
    return signed / 8_388_608;
  }
  if (bitsPerSample === 32) return view.getInt32(offset, true) / 2_147_483_648;
  throw new Error(`Unsupported PCM WAV bit depth ${String(bitsPerSample)}.`);
};

export function decodePcmWav(input: ArrayBufferLike | Uint8Array): DecodedWav {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('The selected file is not a RIFF/WAVE recording.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let audioFormat: number | null = null;
  let bitsPerSample: number | null = null;
  let blockAlign: number | null = null;
  let channelCount: number | null = null;
  let dataOffset: number | null = null;
  let dataLength: number | null = null;
  let sampleRate: number | null = null;

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkOffset = offset + 8;
    const chunkEnd = chunkOffset + chunkLength;
    if (chunkEnd > bytes.length) throw new Error(`WAV ${chunkId || 'unknown'} chunk is truncated.`);
    if (chunkId === 'fmt ') {
      if (chunkLength < 16) throw new Error('WAV format chunk is malformed.');
      audioFormat = view.getUint16(chunkOffset, true);
      channelCount = view.getUint16(chunkOffset + 2, true);
      sampleRate = view.getUint32(chunkOffset + 4, true);
      blockAlign = view.getUint16(chunkOffset + 12, true);
      bitsPerSample = view.getUint16(chunkOffset + 14, true);
    } else if (chunkId === 'data' && dataOffset === null) {
      dataOffset = chunkOffset;
      dataLength = chunkLength;
    }
    offset = chunkEnd + (chunkLength % 2);
  }

  if (
    audioFormat === null ||
    bitsPerSample === null ||
    blockAlign === null ||
    channelCount === null ||
    dataOffset === null ||
    dataLength === null ||
    sampleRate === null
  ) {
    throw new Error('WAV recording is missing a format or audio-data chunk.');
  }
  if (channelCount < 1 || channelCount > 32 || sampleRate < 1 || blockAlign < 1) {
    throw new Error('WAV recording has invalid channel or sample-rate metadata.');
  }
  const bytesPerSample = bitsPerSample / 8;
  if (!Number.isInteger(bytesPerSample) || blockAlign !== bytesPerSample * channelCount) {
    throw new Error('WAV recording has an unsupported packed sample layout.');
  }
  if (dataLength % blockAlign !== 0) throw new Error('WAV audio-data length is malformed.');

  const frameCount = dataLength / blockAlign;
  if (frameCount === 0) throw new Error('WAV recording contains no audio frames.');
  const data = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channelCount; channel += 1) {
      const offset = dataOffset + frame * blockAlign + channel * bytesPerSample;
      const sample = readPcmSample(view, offset, audioFormat, bitsPerSample);
      if (!Number.isFinite(sample)) throw new Error('WAV recording contains a non-finite sample.');
      sum += Math.max(-1, Math.min(1, sample));
    }
    data[frame] = sum / channelCount;
  }
  return { data, inputChannelCount: channelCount, sampleRate };
}

export function decodePcmWavRecording(
  input: ArrayBufferLike | Uint8Array,
  options: ImportedRecordingOptions = {},
): CapturedRecording {
  const decoded = decodePcmWav(input);
  const frameCount = decoded.data.length;
  return {
    channelCount: 1,
    data: decoded.data,
    discontinuityCount: 0,
    durationMs: (frameCount / decoded.sampleRate) * 1_000,
    frameCount,
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    sampleRate: decoded.sampleRate,
    schemaVersion: PCM_CHUNK_SCHEMA_VERSION,
    startedAtMs: sessionTimestampMs(options.startedAtMs ?? 0),
  };
}

const writeAscii = (view: DataView, offset: number, value: string): void => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

export function encodeMonoPcm16Wav(recording: CapturedRecording): Uint8Array<ArrayBuffer> {
  const bytesPerSample = 2;
  const dataLength = recording.data.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, recording.sampleRate, true);
  view.setUint32(28, recording.sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  for (let index = 0; index < recording.data.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, recording.data[index] ?? 0));
    view.setInt16(
      44 + index * bytesPerSample,
      sample < 0 ? sample * 32_768 : sample * 32_767,
      true,
    );
  }
  return new Uint8Array(buffer);
}
