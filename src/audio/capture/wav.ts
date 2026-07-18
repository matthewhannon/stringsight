import type { CapturedRecording } from './contracts';

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
