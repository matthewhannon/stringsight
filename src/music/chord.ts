import type { ChordQuality, PitchClass } from '../shared';
import { INTERVALS, type Interval } from './interval';
import {
  formatSpelledPitchClass,
  spellPitchClassAs,
  toPitchClass,
  transposeNoteLetter,
  transposePitchClass,
  type SpelledPitchClass,
} from './pitch';

export type SupportedChordQuality = Exclude<ChordQuality, 'unknown'>;

export type ChordDefinition = {
  readonly intervals: readonly Interval[];
  readonly quality: SupportedChordQuality;
  readonly suffix: string;
};

export type Chord = {
  readonly bass: SpelledPitchClass;
  readonly intervals: readonly Interval[];
  readonly pitchClasses: readonly PitchClass[];
  readonly quality: SupportedChordQuality;
  readonly root: SpelledPitchClass;
  readonly symbol: string;
  readonly tones: readonly SpelledPitchClass[];
};

export const CHORD_DEFINITIONS = {
  'dominant-7': {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.majorThird,
      INTERVALS.perfectFifth,
      INTERVALS.minorSeventh,
    ],
    quality: 'dominant-7',
    suffix: '7',
  },
  'major-7': {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.majorThird,
      INTERVALS.perfectFifth,
      INTERVALS.majorSeventh,
    ],
    quality: 'major-7',
    suffix: 'maj7',
  },
  'minor-7': {
    intervals: [
      INTERVALS.perfectUnison,
      INTERVALS.minorThird,
      INTERVALS.perfectFifth,
      INTERVALS.minorSeventh,
    ],
    quality: 'minor-7',
    suffix: 'm7',
  },
  diminished: {
    intervals: [INTERVALS.perfectUnison, INTERVALS.minorThird, INTERVALS.diminishedFifth],
    quality: 'diminished',
    suffix: 'dim',
  },
  major: {
    intervals: [INTERVALS.perfectUnison, INTERVALS.majorThird, INTERVALS.perfectFifth],
    quality: 'major',
    suffix: '',
  },
  minor: {
    intervals: [INTERVALS.perfectUnison, INTERVALS.minorThird, INTERVALS.perfectFifth],
    quality: 'minor',
    suffix: 'm',
  },
  power: {
    intervals: [INTERVALS.perfectUnison, INTERVALS.perfectFifth],
    quality: 'power',
    suffix: '5',
  },
  'suspended-2': {
    intervals: [INTERVALS.perfectUnison, INTERVALS.majorSecond, INTERVALS.perfectFifth],
    quality: 'suspended-2',
    suffix: 'sus2',
  },
  'suspended-4': {
    intervals: [INTERVALS.perfectUnison, INTERVALS.perfectFourth, INTERVALS.perfectFifth],
    quality: 'suspended-4',
    suffix: 'sus4',
  },
} as const satisfies Readonly<Record<SupportedChordQuality, ChordDefinition>>;

export function buildChord(
  root: SpelledPitchClass,
  quality: SupportedChordQuality,
  bassPitchClass?: PitchClass,
): Chord {
  const definition = CHORD_DEFINITIONS[quality];
  const rootPitchClass = toPitchClass(root);
  const tones = definition.intervals.map((chordInterval) =>
    spellPitchClassAs(
      transposePitchClass(rootPitchClass, chordInterval.semitones),
      transposeNoteLetter(root.letter, chordInterval.degree - 1),
    ),
  );
  const pitchClasses = tones.map(toPitchClass);
  const requestedBass = bassPitchClass ?? rootPitchClass;
  const bassIndex = pitchClasses.indexOf(requestedBass);
  if (bassIndex < 0) {
    throw new RangeError('Chord bass must be one of the chord tones.');
  }
  const bass = tones[bassIndex] ?? root;
  const rootSymbol = formatSpelledPitchClass(root);
  const slashBass = requestedBass === rootPitchClass ? '' : `/${formatSpelledPitchClass(bass)}`;
  return {
    bass,
    intervals: definition.intervals,
    pitchClasses,
    quality,
    root,
    symbol: `${rootSymbol}${definition.suffix}${slashBass}`,
    tones,
  };
}
