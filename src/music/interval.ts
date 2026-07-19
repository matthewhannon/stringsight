export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type IntervalQuality = 'augmented' | 'diminished' | 'major' | 'minor' | 'perfect';

export type Interval = {
  readonly degree: ScaleDegree;
  readonly quality: IntervalQuality;
  readonly semitones: number;
};

const DIATONIC_SEMITONES: Readonly<Record<ScaleDegree, number>> = {
  1: 0,
  2: 2,
  3: 4,
  4: 5,
  5: 7,
  6: 9,
  7: 11,
};

const PERFECT_DEGREES = new Set<ScaleDegree>([1, 4, 5]);

const intervalQuality = (degree: ScaleDegree, semitones: number): IntervalQuality => {
  const difference = semitones - DIATONIC_SEMITONES[degree];
  if (PERFECT_DEGREES.has(degree)) {
    if (difference === -1) return 'diminished';
    if (difference === 0) return 'perfect';
    if (difference === 1) return 'augmented';
  } else {
    if (difference === -2) return 'diminished';
    if (difference === -1) return 'minor';
    if (difference === 0) return 'major';
    if (difference === 1) return 'augmented';
  }
  throw new RangeError(
    'Only simple intervals with at most one augmentation or diminution are supported.',
  );
};

export function interval(degree: ScaleDegree, semitones: number): Interval {
  if (!Number.isInteger(semitones) || semitones < 0 || semitones > 11) {
    throw new RangeError('A simple interval must contain an integer from 0 through 11 semitones.');
  }
  return { degree, quality: intervalQuality(degree, semitones), semitones };
}

export const INTERVALS = {
  augmentedFourth: interval(4, 6),
  diminishedFifth: interval(5, 6),
  majorSecond: interval(2, 2),
  majorSeventh: interval(7, 11),
  majorSixth: interval(6, 9),
  majorThird: interval(3, 4),
  minorSecond: interval(2, 1),
  minorSeventh: interval(7, 10),
  minorSixth: interval(6, 8),
  minorThird: interval(3, 3),
  perfectFifth: interval(5, 7),
  perfectFourth: interval(4, 5),
  perfectUnison: interval(1, 0),
} as const satisfies Readonly<Record<string, Interval>>;
