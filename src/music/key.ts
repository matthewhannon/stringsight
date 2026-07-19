import type { PitchClass } from '../shared';
import { buildScale, type Scale } from './scale';
import {
  formatSpelledPitchClass,
  spellPitchClass,
  spelledPitchClass,
  toPitchClass,
  type Accidental,
  type NoteLetter,
  type SpelledPitchClass,
} from './pitch';

export type KeyMode = 'major' | 'minor';

export type Key = {
  readonly fifths: number;
  readonly mode: KeyMode;
  readonly name: string;
  readonly scale: Scale;
  readonly tonic: SpelledPitchClass;
};

type KeySignatureDefinition = {
  readonly accidental: Accidental;
  readonly fifths: number;
  readonly letter: NoteLetter;
  readonly mode: KeyMode;
};

const KEY_SIGNATURES: readonly KeySignatureDefinition[] = [
  { accidental: -1, fifths: -7, letter: 'C', mode: 'major' },
  { accidental: -1, fifths: -6, letter: 'G', mode: 'major' },
  { accidental: -1, fifths: -5, letter: 'D', mode: 'major' },
  { accidental: -1, fifths: -4, letter: 'A', mode: 'major' },
  { accidental: -1, fifths: -3, letter: 'E', mode: 'major' },
  { accidental: -1, fifths: -2, letter: 'B', mode: 'major' },
  { accidental: 0, fifths: -1, letter: 'F', mode: 'major' },
  { accidental: 0, fifths: 0, letter: 'C', mode: 'major' },
  { accidental: 0, fifths: 1, letter: 'G', mode: 'major' },
  { accidental: 0, fifths: 2, letter: 'D', mode: 'major' },
  { accidental: 0, fifths: 3, letter: 'A', mode: 'major' },
  { accidental: 0, fifths: 4, letter: 'E', mode: 'major' },
  { accidental: 0, fifths: 5, letter: 'B', mode: 'major' },
  { accidental: 1, fifths: 6, letter: 'F', mode: 'major' },
  { accidental: 1, fifths: 7, letter: 'C', mode: 'major' },
  { accidental: -1, fifths: -7, letter: 'A', mode: 'minor' },
  { accidental: -1, fifths: -6, letter: 'E', mode: 'minor' },
  { accidental: -1, fifths: -5, letter: 'B', mode: 'minor' },
  { accidental: 0, fifths: -4, letter: 'F', mode: 'minor' },
  { accidental: 0, fifths: -3, letter: 'C', mode: 'minor' },
  { accidental: 0, fifths: -2, letter: 'G', mode: 'minor' },
  { accidental: 0, fifths: -1, letter: 'D', mode: 'minor' },
  { accidental: 0, fifths: 0, letter: 'A', mode: 'minor' },
  { accidental: 0, fifths: 1, letter: 'E', mode: 'minor' },
  { accidental: 0, fifths: 2, letter: 'B', mode: 'minor' },
  { accidental: 1, fifths: 3, letter: 'F', mode: 'minor' },
  { accidental: 1, fifths: 4, letter: 'C', mode: 'minor' },
  { accidental: 1, fifths: 5, letter: 'G', mode: 'minor' },
  { accidental: 1, fifths: 6, letter: 'D', mode: 'minor' },
  { accidental: 1, fifths: 7, letter: 'A', mode: 'minor' },
];

const sameSpelling = (left: SpelledPitchClass, right: SpelledPitchClass): boolean =>
  left.letter === right.letter && left.accidental === right.accidental;

export function buildKey(tonic: SpelledPitchClass, mode: KeyMode): Key {
  const signature = KEY_SIGNATURES.find(
    (candidate) =>
      candidate.mode === mode &&
      candidate.letter === tonic.letter &&
      candidate.accidental === tonic.accidental,
  );
  if (signature === undefined) {
    throw new RangeError(
      'Key must use a conventional signature containing at most seven flats or sharps.',
    );
  }
  const scale = buildScale(tonic, mode === 'major' ? 'major' : 'natural-minor');
  return {
    fifths: signature.fifths,
    mode,
    name: `${formatSpelledPitchClass(tonic)} ${mode}`,
    scale,
    tonic,
  };
}

export function spellPitchClassInKey(pitchClass: PitchClass, key: Key): SpelledPitchClass {
  const diatonicTone = key.scale.tones.find((tone) => toPitchClass(tone) === pitchClass);
  if (diatonicTone !== undefined) return diatonicTone;
  return spellPitchClass(pitchClass, key.fifths < 0 ? 'flats' : 'sharps');
}

export function keyFromFifths(fifths: number, mode: KeyMode): Key {
  if (!Number.isInteger(fifths) || fifths < -7 || fifths > 7) {
    throw new RangeError('Key signature fifths must be an integer from -7 through 7.');
  }
  const signature = KEY_SIGNATURES.find(
    (candidate) => candidate.fifths === fifths && candidate.mode === mode,
  );
  if (signature === undefined) throw new RangeError('Unsupported key signature.');
  return buildKey(spelledPitchClass(signature.letter, signature.accidental), mode);
}

export function keyForPitchClass(
  tonic: PitchClass,
  mode: KeyMode,
  preference: 'flats' | 'sharps' = 'sharps',
): Key {
  const candidates = KEY_SIGNATURES.filter(
    (signature) =>
      signature.mode === mode &&
      toPitchClass(spelledPitchClass(signature.letter, signature.accidental)) === tonic,
  );
  const preferredDirection = preference === 'flats' ? -1 : 1;
  const preferredCandidates = candidates.filter(
    (candidate) => candidate.fifths === 0 || Math.sign(candidate.fifths) === preferredDirection,
  );
  const selected = (preferredCandidates.length > 0 ? preferredCandidates : candidates).sort(
    (left, right) => Math.abs(left.fifths) - Math.abs(right.fifths),
  )[0];
  if (selected === undefined)
    throw new RangeError(`No conventional ${mode} key exists for ${tonic}.`);
  return buildKey(spelledPitchClass(selected.letter, selected.accidental), mode);
}

export function keysAreEnharmonic(left: Key, right: Key): boolean {
  return left.mode === right.mode && toPitchClass(left.tonic) === toPitchClass(right.tonic);
}

export function keysAreIdentical(left: Key, right: Key): boolean {
  return left.mode === right.mode && sameSpelling(left.tonic, right.tonic);
}
