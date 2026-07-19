import type { PitchClass } from '../shared';

export const PITCH_CLASSES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const satisfies readonly PitchClass[];

export const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

export type NoteLetter = (typeof NOTE_LETTERS)[number];
export type Accidental = -2 | -1 | 0 | 1 | 2;
export type AccidentalPreference = 'flats' | 'sharps';

export type SpelledPitchClass = {
  readonly accidental: Accidental;
  readonly letter: NoteLetter;
};

const NATURAL_PITCH_CLASS_INDEX: Readonly<Record<NoteLetter, number>> = {
  A: 9,
  B: 11,
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
};

const SHARP_LETTERS: readonly NoteLetter[] = [
  'C',
  'C',
  'D',
  'D',
  'E',
  'F',
  'F',
  'G',
  'G',
  'A',
  'A',
  'B',
];

const FLAT_LETTERS: readonly NoteLetter[] = [
  'C',
  'D',
  'D',
  'E',
  'E',
  'F',
  'G',
  'G',
  'A',
  'A',
  'B',
  'B',
];

const normalizePitchClassIndex = (value: number): number => ((value % 12) + 12) % 12;

export function pitchClassIndex(pitchClass: PitchClass): number {
  return PITCH_CLASSES.indexOf(pitchClass);
}

export function pitchClassAt(index: number): PitchClass {
  if (!Number.isInteger(index)) throw new RangeError('Pitch-class index must be an integer.');
  return PITCH_CLASSES[normalizePitchClassIndex(index)] ?? 'C';
}

export function transposePitchClass(pitchClass: PitchClass, semitones: number): PitchClass {
  if (!Number.isInteger(semitones)) throw new RangeError('Semitone distance must be an integer.');
  return pitchClassAt(pitchClassIndex(pitchClass) + semitones);
}

export function transposeNoteLetter(letter: NoteLetter, diatonicSteps: number): NoteLetter {
  if (!Number.isInteger(diatonicSteps)) {
    throw new RangeError('Diatonic distance must be an integer.');
  }
  const index = NOTE_LETTERS.indexOf(letter);
  const normalizedIndex =
    (((index + diatonicSteps) % NOTE_LETTERS.length) + NOTE_LETTERS.length) % NOTE_LETTERS.length;
  return NOTE_LETTERS[normalizedIndex] ?? 'C';
}

export function spelledPitchClass(
  letter: NoteLetter,
  accidental: Accidental = 0,
): SpelledPitchClass {
  return { accidental, letter };
}

export function toPitchClass(spelling: SpelledPitchClass): PitchClass {
  return pitchClassAt(NATURAL_PITCH_CLASS_INDEX[spelling.letter] + spelling.accidental);
}

export function spellPitchClassAs(pitchClass: PitchClass, letter: NoteLetter): SpelledPitchClass {
  const targetIndex = pitchClassIndex(pitchClass);
  const naturalIndex = NATURAL_PITCH_CLASS_INDEX[letter];
  let difference = normalizePitchClassIndex(targetIndex - naturalIndex);
  if (difference > 6) difference -= 12;
  if (difference < -2 || difference > 2) {
    throw new RangeError(
      `${pitchClass} cannot be spelled as ${letter} with at most two accidentals.`,
    );
  }
  return spelledPitchClass(letter, difference as Accidental);
}

export function spellPitchClass(
  pitchClass: PitchClass,
  preference: AccidentalPreference,
): SpelledPitchClass {
  const index = pitchClassIndex(pitchClass);
  const letters = preference === 'flats' ? FLAT_LETTERS : SHARP_LETTERS;
  return spellPitchClassAs(pitchClass, letters[index] ?? 'C');
}

export function enharmonicSpellings(
  pitchClass: PitchClass,
  maximumAccidentals: 0 | 1 | 2 = 2,
): SpelledPitchClass[] {
  return NOTE_LETTERS.flatMap((letter) => {
    try {
      const spelling = spellPitchClassAs(pitchClass, letter);
      return Math.abs(spelling.accidental) <= maximumAccidentals ? [spelling] : [];
    } catch {
      return [];
    }
  });
}

export function formatSpelledPitchClass(spelling: SpelledPitchClass): string {
  const accidental =
    spelling.accidental < 0 ? 'b'.repeat(-spelling.accidental) : '#'.repeat(spelling.accidental);
  return `${spelling.letter}${accidental}`;
}
