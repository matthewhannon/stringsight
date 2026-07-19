import type { PitchClass } from '../shared';
import { INTERVALS, type Interval } from './interval';
import {
  formatSpelledPitchClass,
  spellPitchClassAs,
  toPitchClass,
  transposeNoteLetter,
  transposePitchClass,
  type SpelledPitchClass,
} from './pitch';

export type ScaleQuality =
  'blues' | 'major' | 'major-pentatonic' | 'minor-pentatonic' | 'natural-minor';

export type ScaleDefinition = {
  readonly intervals: readonly Interval[];
  readonly quality: ScaleQuality;
};

export type Scale = {
  readonly intervals: readonly Interval[];
  readonly name: string;
  readonly pitchClasses: readonly PitchClass[];
  readonly quality: ScaleQuality;
  readonly root: SpelledPitchClass;
  readonly tones: readonly SpelledPitchClass[];
};

export const SCALE_DEFINITIONS = {
  blues: {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.minorThird,
      INTERVALS.perfectFourth,
      INTERVALS.diminishedFifth,
      INTERVALS.perfectFifth,
      INTERVALS.minorSeventh,
    ],
    quality: 'blues',
  },
  major: {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.majorSecond,
      INTERVALS.majorThird,
      INTERVALS.perfectFourth,
      INTERVALS.perfectFifth,
      INTERVALS.majorSixth,
      INTERVALS.majorSeventh,
    ],
    quality: 'major',
  },
  'major-pentatonic': {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.majorSecond,
      INTERVALS.majorThird,
      INTERVALS.perfectFifth,
      INTERVALS.majorSixth,
    ],
    quality: 'major-pentatonic',
  },
  'minor-pentatonic': {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.minorThird,
      INTERVALS.perfectFourth,
      INTERVALS.perfectFifth,
      INTERVALS.minorSeventh,
    ],
    quality: 'minor-pentatonic',
  },
  'natural-minor': {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.majorSecond,
      INTERVALS.minorThird,
      INTERVALS.perfectFourth,
      INTERVALS.perfectFifth,
      INTERVALS.minorSixth,
      INTERVALS.minorSeventh,
    ],
    quality: 'natural-minor',
  },
} as const satisfies Readonly<Record<ScaleQuality, ScaleDefinition>>;

export function buildScale(root: SpelledPitchClass, quality: ScaleQuality): Scale {
  const definition = SCALE_DEFINITIONS[quality];
  const rootPitchClass = toPitchClass(root);
  const tones = definition.intervals.map((scaleInterval) =>
    spellPitchClassAs(
      transposePitchClass(rootPitchClass, scaleInterval.semitones),
      transposeNoteLetter(root.letter, scaleInterval.degree - 1),
    ),
  );
  return {
    intervals: definition.intervals,
    name: `${formatSpelledPitchClass(root)} ${quality}`,
    pitchClasses: tones.map(toPitchClass),
    quality,
    root,
    tones,
  };
}
