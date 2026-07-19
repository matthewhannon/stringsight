import { describe, expect, it } from 'vitest';

import { PrivateRecordingCorpusManifestSchema } from './private-recording-corpus';

const manifest = {
  corpusId: 'stringsight-private-guitar-v1',
  recordings: [
    {
      audioPath: 'audio/open-strings.wav',
      fixturePath: 'fixtures/open-strings.fixture.json',
      id: 'open-strings',
    },
  ],
  schemaVersion: 1,
} as const;

describe('private recording corpus manifest', () => {
  it('accepts relative audio and reviewed-fixture paths', () => {
    expect(PrivateRecordingCorpusManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('rejects duplicate ids, absolute paths, and traversal', () => {
    expect(
      PrivateRecordingCorpusManifestSchema.safeParse({
        ...manifest,
        recordings: [...manifest.recordings, manifest.recordings[0]],
      }).success,
    ).toBe(false);
    expect(
      PrivateRecordingCorpusManifestSchema.safeParse({
        ...manifest,
        recordings: [{ ...manifest.recordings[0], audioPath: '../private.wav' }],
      }).success,
    ).toBe(false);
    expect(
      PrivateRecordingCorpusManifestSchema.safeParse({
        ...manifest,
        recordings: [{ ...manifest.recordings[0], fixturePath: 'C:\\private\\fixture.json' }],
      }).success,
    ).toBe(false);
  });
});
