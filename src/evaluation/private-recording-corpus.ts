import { z } from 'zod';

const RelativeLocalPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !value.split(/[\\/]/).includes('..'),
    'Private corpus paths must be relative and may not traverse parent directories.',
  );

export const PRIVATE_RECORDING_CORPUS_SCHEMA_VERSION = 1 as const;

export const PrivateRecordingEntrySchema = z.object({
  audioPath: RelativeLocalPathSchema,
  fixturePath: RelativeLocalPathSchema,
  id: z.string().min(1).max(160),
});

export const PrivateRecordingCorpusManifestSchema = z
  .object({
    corpusId: z.string().min(1).max(160),
    recordings: z.array(PrivateRecordingEntrySchema).min(1),
    schemaVersion: z.literal(PRIVATE_RECORDING_CORPUS_SCHEMA_VERSION),
  })
  .superRefine(({ recordings }, context) => {
    const ids = new Set<string>();
    recordings.forEach((recording, index) => {
      if (ids.has(recording.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate private recording id: ${recording.id}`,
          path: ['recordings', index, 'id'],
        });
      }
      ids.add(recording.id);
    });
  });

export type PrivateRecordingCorpusManifest = z.infer<typeof PrivateRecordingCorpusManifestSchema>;
