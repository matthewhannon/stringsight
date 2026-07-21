import { describe, expect, it } from 'vitest';

import {
  MAX_BOUNDED_BEND_SEMITONES,
  PRACTICE_NATIVE_SEMANTIC_IDS,
  BoundedBendSemanticSchema,
  PerStringSoundingDurationSemanticSchema,
  PracticeNativeSemanticSchema,
  RelationEndpointDirectionSchema,
  type PracticeNativeSemantic,
} from './practice-semantics';

const fixtures = [
  { semantic: 'pitch-key' },
  { direction: 'start', semantic: 'ties', targetNoteId: 'tie-stop-note' },
  { direction: 'stop', semantic: 'slurs', targetNoteId: 'slur-start-note' },
  { actualNotes: 3, normalNotes: 2, semantic: 'tuplet-3-2' },
  { semantic: 'two-voices', voice: 2 },
  { semantic: 'dynamics-mf', value: 'mf' },
  { articulation: 'accent', semantic: 'accent' },
  { articulation: 'staccato', semantic: 'staccato' },
  { semantic: 'per-string-sounding-duration', soundingDurationTicks: 1_440 },
  { direction: 'start', semantic: 'hammer-on', targetNoteId: 'hammer-stop-note' },
  { direction: 'stop', semantic: 'pull-off', targetNoteId: 'pull-start-note' },
  { direction: 'start', semantic: 'slide', targetNoteId: 'slide-stop-note' },
  { semantic: 'bend-bounded', semitones: 1 },
  { semantic: 'vibrato' },
  { semantic: 'let-ring' },
  { semantic: 'palm-mute' },
  { semantic: 'dead-note' },
  { semantic: 'natural-harmonic' },
] as const satisfies readonly PracticeNativeSemantic[];

describe('native Practice System semantic contracts', () => {
  it('covers every supported v1 semantic exactly once', () => {
    const parsed = fixtures.map((fixture) => PracticeNativeSemanticSchema.parse(fixture));
    expect(parsed.map(({ semantic }) => semantic)).toEqual(PRACTICE_NATIVE_SEMANTIC_IDS);
    expect(new Set(parsed.map(({ semantic }) => semantic)).size).toBe(18);
    expect(Object.isFrozen(PRACTICE_NATIVE_SEMANTIC_IDS)).toBe(true);
  });

  it('requires explicit relationship endpoints and directions', () => {
    for (const semantic of ['ties', 'slurs', 'hammer-on', 'pull-off', 'slide'] as const) {
      expect(
        PracticeNativeSemanticSchema.safeParse({
          direction: 'start',
          semantic,
          targetNoteId: 'related-note',
        }).success,
      ).toBe(true);
      expect(PracticeNativeSemanticSchema.safeParse({ direction: 'start', semantic }).success).toBe(
        false,
      );
      expect(
        PracticeNativeSemanticSchema.safeParse({
          direction: 'ascending',
          semantic,
          targetNoteId: 'related-note',
        }).success,
      ).toBe(false);
    }
    expect(RelationEndpointDirectionSchema.options).toEqual(['start', 'stop']);
  });

  it('accepts only the retained half-step bounded bend vocabulary', () => {
    for (const semitones of [0.5, 1, 1.5, MAX_BOUNDED_BEND_SEMITONES]) {
      expect(
        BoundedBendSemanticSchema.safeParse({ semantic: 'bend-bounded', semitones }).success,
      ).toBe(true);
    }
    for (const semitones of [0, 0.25, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        BoundedBendSemanticSchema.safeParse({ semantic: 'bend-bounded', semitones }).success,
      ).toBe(false);
    }
  });

  it('validates per-string sounding duration as a positive safe integer', () => {
    expect(
      PerStringSoundingDurationSemanticSchema.safeParse({
        semantic: 'per-string-sounding-duration',
        soundingDurationTicks: Number.MAX_SAFE_INTEGER,
      }).success,
    ).toBe(true);
    for (const soundingDurationTicks of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        PerStringSoundingDurationSemanticSchema.safeParse({
          semantic: 'per-string-sounding-duration',
          soundingDurationTicks,
        }).success,
      ).toBe(false);
    }
  });

  it('locks dynamics, articulations, tuplets, and voice vocabulary', () => {
    for (const invalid of [
      { semantic: 'dynamics-mf', value: 'ff' },
      { articulation: 'marcato', semantic: 'accent' },
      { articulation: 'accent', semantic: 'staccato' },
      { actualNotes: 5, normalNotes: 4, semantic: 'tuplet-3-2' },
      { semantic: 'two-voices', voice: 3 },
    ]) {
      expect(PracticeNativeSemanticSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('has no opaque or unknown technique escape hatch', () => {
    expect(
      PracticeNativeSemanticSchema.safeParse({
        profileId: 'anything',
        profileVersion: 1,
        semantic: 'vibrato',
        techniqueId: 'unreviewed-technique',
      }).success,
    ).toBe(false);
    expect(
      PracticeNativeSemanticSchema.safeParse({ semantic: 'artificial-harmonic' }).success,
    ).toBe(false);
    expect(PracticeNativeSemanticSchema.safeParse({ semantic: 'unknown' }).success).toBe(false);
  });
});
