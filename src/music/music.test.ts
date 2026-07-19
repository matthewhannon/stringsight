import {
  ChordEventSchema,
  CONTRACT_SCHEMA_VERSION,
  NoteEventSchema,
  NoteSetEventSchema,
  type AudioEvent,
  type Lifecycle,
  type PitchClass,
} from '../shared';
import {
  audioEventsToTimedPitchClassEvidence,
  buildChord,
  buildKey,
  buildScale,
  enharmonicSpellings,
  formatSpelledPitchClass,
  interval,
  keyFromFifths,
  keyForPitchClass,
  keysAreEnharmonic,
  keysAreIdentical,
  rankChordInterpretations,
  rankKeyInterpretations,
  rankScaleInterpretations,
  spellPitchClass,
  spellPitchClassAs,
  spellPitchClassInKey,
  spelledPitchClass,
  toPitchClass,
  transposeNoteLetter,
  transposePitchClass,
  type AccidentalPreference,
  type IntervalQuality,
  type KeyMode,
  type NoteLetter,
  type ScaleQuality,
  type SupportedChordQuality,
  type TimedPitchClassEvidence,
  type WeightedPitchClass,
} from '.';

const formattedTones = (
  tones: readonly { accidental: -2 | -1 | 0 | 1 | 2; letter: NoteLetter }[],
) => tones.map(formatSpelledPitchClass);

describe('pitch identity and enharmonic spelling', () => {
  it.each([
    ['C', -1, 'B'],
    ['B', 1, 'C'],
    ['F#', 12, 'F#'],
    ['A', -14, 'G'],
  ] satisfies readonly [PitchClass, number, PitchClass][])(
    'transposes %s by %i semitones',
    (pitch, semitones, expected) => {
      expect(transposePitchClass(pitch, semitones)).toBe(expected);
    },
  );

  it.each([
    ['C#', 'flats', 'Db'],
    ['C#', 'sharps', 'C#'],
    ['A#', 'flats', 'Bb'],
    ['E', 'sharps', 'E'],
  ] satisfies readonly [PitchClass, AccidentalPreference, string][])(
    'spells %s with %s preference as %s',
    (pitch, preference, expected) => {
      expect(formatSpelledPitchClass(spellPitchClass(pitch, preference))).toBe(expected);
    },
  );

  it.each([
    ['C', 'B', 'B#'],
    ['F#', 'G', 'Gb'],
    ['C#', 'B', 'B##'],
    ['E', 'F', 'Fb'],
  ] satisfies readonly [PitchClass, NoteLetter, string][])(
    'spells %s using letter %s as %s',
    (pitch, letter, expected) => {
      const spelling = spellPitchClassAs(pitch, letter);
      expect(formatSpelledPitchClass(spelling)).toBe(expected);
      expect(toPitchClass(spelling)).toBe(pitch);
    },
  );

  it('enumerates valid enharmonic spellings within an accidental limit', () => {
    expect(formattedTones(enharmonicSpellings('C#', 1))).toEqual(['C#', 'Db']);
    expect(formattedTones(enharmonicSpellings('C#', 2))).toEqual(['C#', 'Db', 'B##']);
  });

  it.each([
    ['C', -1, 'B'],
    ['B', 1, 'C'],
    ['F', 8, 'G'],
  ] satisfies readonly [NoteLetter, number, NoteLetter][])(
    'moves letter %s by %i diatonic steps',
    (letter, steps, expected) => {
      expect(transposeNoteLetter(letter, steps)).toBe(expected);
    },
  );

  it('rejects invalid numeric distances and impossible requested spellings', () => {
    expect(() => transposePitchClass('C', 0.5)).toThrow(RangeError);
    expect(() => transposeNoteLetter('C', 0.5)).toThrow(RangeError);
    expect(() => spellPitchClassAs('F#', 'C')).toThrow(RangeError);
  });
});

describe('intervals', () => {
  it.each([
    [1, 0, 'perfect'],
    [2, 1, 'minor'],
    [3, 4, 'major'],
    [4, 6, 'augmented'],
    [5, 6, 'diminished'],
    [7, 9, 'diminished'],
  ] satisfies readonly [1 | 2 | 3 | 4 | 5 | 6 | 7, number, IntervalQuality][])(
    'classifies degree %i spanning %i semitones as %s',
    (degree, semitones, quality) => {
      expect(interval(degree, semitones)).toEqual({ degree, quality, semitones });
    },
  );

  it('rejects compound, fractional, and multiply altered intervals', () => {
    expect(() => interval(3, 12)).toThrow(RangeError);
    expect(() => interval(3, 3.5)).toThrow(RangeError);
    expect(() => interval(1, 2)).toThrow(RangeError);
  });
});

describe('chord construction', () => {
  it.each([
    ['C', 0, 'major', ['C', 'E', 'G'], 'C'],
    ['B', -1, 'dominant-7', ['Bb', 'D', 'F', 'Ab'], 'Bb7'],
    ['F', 1, 'diminished', ['F#', 'A', 'C'], 'F#dim'],
    ['C', 1, 'suspended-2', ['C#', 'D#', 'G#'], 'C#sus2'],
    ['E', -1, 'minor-7', ['Eb', 'Gb', 'Bb', 'Db'], 'Ebm7'],
  ] satisfies readonly [
    NoteLetter,
    -1 | 0 | 1,
    SupportedChordQuality,
    readonly string[],
    string,
  ][])(
    'builds a spelled %s%s %s chord',
    (letter, accidental, quality, expectedTones, expectedSymbol) => {
      const chord = buildChord(spelledPitchClass(letter, accidental), quality);
      expect(formattedTones(chord.tones)).toEqual(expectedTones);
      expect(chord.symbol).toBe(expectedSymbol);
      expect(chord.pitchClasses).toEqual(chord.tones.map(toPitchClass));
    },
  );

  it('represents and validates chord inversions', () => {
    const chord = buildChord(spelledPitchClass('C'), 'major', 'E');
    expect(chord.symbol).toBe('C/E');
    expect(formatSpelledPitchClass(chord.bass)).toBe('E');
    expect(() => buildChord(spelledPitchClass('C'), 'major', 'F#')).toThrow(RangeError);
  });
});

describe('scale construction', () => {
  it.each([
    ['C', 0, 'major', ['C', 'D', 'E', 'F', 'G', 'A', 'B']],
    ['F', 0, 'major', ['F', 'G', 'A', 'Bb', 'C', 'D', 'E']],
    ['F', 1, 'major', ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']],
    ['E', -1, 'natural-minor', ['Eb', 'F', 'Gb', 'Ab', 'Bb', 'Cb', 'Db']],
    ['A', 0, 'minor-pentatonic', ['A', 'C', 'D', 'E', 'G']],
    ['E', 0, 'blues', ['E', 'G', 'A', 'Bb', 'B', 'D']],
  ] satisfies readonly [NoteLetter, -1 | 0 | 1, ScaleQuality, readonly string[]][])(
    'builds the %s%s %s scale with diatonic spelling',
    (letter, accidental, quality, expectedTones) => {
      const scale = buildScale(spelledPitchClass(letter, accidental), quality);
      expect(formattedTones(scale.tones)).toEqual(expectedTones);
      expect(scale.pitchClasses).toEqual(scale.tones.map(toPitchClass));
    },
  );
});

describe('keys and contextual spelling', () => {
  it.each([
    [-5, 'major', 'Db major', ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C']],
    [2, 'major', 'D major', ['D', 'E', 'F#', 'G', 'A', 'B', 'C#']],
    [-5, 'minor', 'Bb minor', ['Bb', 'C', 'Db', 'Eb', 'F', 'Gb', 'Ab']],
    [3, 'minor', 'F# minor', ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E']],
  ] satisfies readonly [number, KeyMode, string, readonly string[]][])(
    'builds the %i-fifths %s key',
    (fifths, mode, expectedName, expectedTones) => {
      const key = keyFromFifths(fifths, mode);
      expect(key.name).toBe(expectedName);
      expect(formattedTones(key.scale.tones)).toEqual(expectedTones);
    },
  );

  it('uses the key scale before falling back to its accidental direction', () => {
    const fMajor = buildKey(spelledPitchClass('F'), 'major');
    expect(formatSpelledPitchClass(spellPitchClassInKey('A#', fMajor))).toBe('Bb');
    expect(formatSpelledPitchClass(spellPitchClassInKey('F#', fMajor))).toBe('Gb');

    const eMajor = buildKey(spelledPitchClass('E'), 'major');
    expect(formatSpelledPitchClass(spellPitchClassInKey('D#', eMajor))).toBe('D#');
    expect(formatSpelledPitchClass(spellPitchClassInKey('A#', eMajor))).toBe('A#');
  });

  it('distinguishes identical keys from enharmonically equivalent keys', () => {
    const cSharpMajor = buildKey(spelledPitchClass('C', 1), 'major');
    const dFlatMajor = buildKey(spelledPitchClass('D', -1), 'major');
    expect(keysAreEnharmonic(cSharpMajor, dFlatMajor)).toBe(true);
    expect(keysAreIdentical(cSharpMajor, dFlatMajor)).toBe(false);
    expect(keysAreIdentical(cSharpMajor, keyFromFifths(7, 'major'))).toBe(true);
  });

  it('rejects nonconventional and out-of-range key signatures', () => {
    expect(() => buildKey(spelledPitchClass('G', 1), 'major')).toThrow(RangeError);
    expect(() => keyFromFifths(8, 'major')).toThrow(RangeError);
    expect(() => keyFromFifths(1.5, 'minor')).toThrow(RangeError);
  });
});

const evidence = (
  pitchClasses: readonly PitchClass[],
  bass?: PitchClass,
): {
  bass?: readonly WeightedPitchClass[];
  pitchClasses: readonly WeightedPitchClass[];
  sourceEventIds: readonly string[];
} => ({
  ...(bass === undefined ? {} : { bass: [{ pitchClass: bass, weight: 1 }] }),
  pitchClasses: pitchClasses.map((pitchClass) => ({ pitchClass, weight: 1 })),
  sourceEventIds: ['source-chord-1'],
});

describe('ranked chord interpretation', () => {
  it.each([
    [['C', 'E', 'G'], 'C'],
    [['D', 'F', 'A'], 'Dm'],
    [['G', 'B', 'D', 'F'], 'G7'],
    [['C', 'E', 'G', 'B'], 'Cmaj7'],
    [['A', 'C', 'E', 'G'], 'Am7'],
    [['D', 'G', 'A'], 'Dsus4'],
    [['B', 'D', 'F'], 'Bdim'],
    [['E', 'B'], 'E5'],
  ] satisfies readonly [readonly PitchClass[], string][])(
    'ranks %j as %s',
    (pitchClasses, expectedSymbol) => {
      const interpretations = rankChordInterpretations(evidence(pitchClasses));
      expect(interpretations[0]?.chord.symbol).toBe(expectedSymbol);
      expect(interpretations.map((candidate) => candidate.rank)).toEqual([1, 2, 3, 4, 5]);
      expect(interpretations[0]?.confidence ?? 0).toBeGreaterThanOrEqual(
        interpretations[1]?.confidence ?? 1,
      );
    },
  );

  it('prefers an exact seventh chord while retaining the simpler triad as an alternative', () => {
    const interpretations = rankChordInterpretations(evidence(['C', 'E', 'G', 'A#']), {
      candidateLimit: 12,
      spellingPreference: 'flats',
    });
    expect(interpretations[0]?.chord.symbol).toBe('C7');
    expect(interpretations.some((candidate) => candidate.chord.symbol === 'C')).toBe(true);
  });

  it('keeps bare-fifth alternatives while ranking the exact power chord first', () => {
    const interpretations = rankChordInterpretations(evidence(['C', 'G']), {
      candidateLimit: 20,
    });
    expect(interpretations[0]?.chord.symbol).toBe('C5');
    expect(interpretations.some((candidate) => candidate.chord.symbol === 'C')).toBe(true);
    expect(interpretations.some((candidate) => candidate.chord.symbol === 'Csus4')).toBe(true);
  });

  it('supports omitted tones without forcing a more complex chord', () => {
    const interpretation = rankChordInterpretations(evidence(['C', 'E']))[0];
    expect(interpretation?.chord.symbol).toBe('C');
    expect(interpretation?.missingPitchClasses).toEqual(['G']);
    expect(interpretation?.evidence.find((item) => item.kind === 'missing-tones')).toMatchObject({
      contribution: -0.04,
      pitchClasses: ['G'],
    });
  });

  it('uses bass evidence to name and explain an inversion', () => {
    const interpretation = rankChordInterpretations(evidence(['C', 'E', 'G'], 'E'))[0];
    expect(interpretation?.chord.symbol).toBe('C/E');
    expect(interpretation?.evidence.find((item) => item.kind === 'bass')).toMatchObject({
      contribution: 0.07,
      pitchClasses: ['E'],
    });
  });

  it('uses key context or an explicit preference without changing pitch identity', () => {
    const pitchClasses: readonly PitchClass[] = ['C#', 'F', 'G#'];
    const cSharpMajor = buildKey(spelledPitchClass('C', 1), 'major');
    const contextual = rankChordInterpretations(evidence(pitchClasses), { key: cSharpMajor })[0];
    const flats = rankChordInterpretations(evidence(pitchClasses), {
      spellingPreference: 'flats',
    })[0];
    expect(contextual?.chord.symbol).toBe('C#');
    expect(formattedTones(contextual?.chord.tones ?? [])).toEqual(['C#', 'E#', 'G#']);
    expect(flats?.chord.symbol).toBe('Db');
    expect(formattedTones(flats?.chord.tones ?? [])).toEqual(['Db', 'F', 'Ab']);
    expect(contextual?.chord.pitchClasses).toEqual(flats?.chord.pitchClasses);
  });

  it('aggregates duplicate observations and keeps inputs and source candidates unchanged', () => {
    const window = {
      bass: [{ pitchClass: 'C' as const, weight: 0.8 }],
      pitchClasses: [
        { pitchClass: 'C' as const, weight: 0.6 },
        { pitchClass: 'C' as const, weight: 0.5 },
        { pitchClass: 'E' as const, weight: 1 },
        { pitchClass: 'G' as const, weight: 1 },
      ],
      sourceEventIds: ['raw-event-1', 'raw-event-2'],
    };
    const snapshot = structuredClone(window);
    const interpretation = rankChordInterpretations(window)[0];
    expect(window).toEqual(snapshot);
    expect(interpretation?.sourceEventIds).toEqual(window.sourceEventIds);
    expect(interpretation?.sourceEventIds).not.toBe(window.sourceEventIds);
    expect(interpretation?.chord.symbol).toBe('C');
  });

  it('returns no chord for insufficient evidence and validates public inputs', () => {
    expect(rankChordInterpretations(evidence(['C']))).toEqual([]);
    expect(() =>
      rankChordInterpretations({
        pitchClasses: [{ pitchClass: 'C', weight: 1.1 }],
        sourceEventIds: ['source'],
      }),
    ).toThrow(RangeError);
    expect(() =>
      rankChordInterpretations({
        bass: [{ pitchClass: 'C', weight: Number.NaN }],
        pitchClasses: evidence(['C', 'E']).pitchClasses,
        sourceEventIds: ['source'],
      }),
    ).toThrow(RangeError);
    expect(() => rankChordInterpretations(evidence(['C', 'E']), { candidateLimit: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      rankChordInterpretations({ ...evidence(['C', 'E']), sourceEventIds: [''] }),
    ).toThrow(RangeError);
    expect(() => rankChordInterpretations({ ...evidence(['C', 'E']), sourceEventIds: [] })).toThrow(
      RangeError,
    );
  });
});

const timedEvidence = (
  eventId: string,
  pitchClasses: readonly PitchClass[],
  startMs: number,
  endMs: number,
  eventConfidence = 1,
): TimedPitchClassEvidence => ({
  confidence: eventConfidence,
  eventId,
  pitchClasses: pitchClasses.map((pitchClass) => ({ pitchClass, weight: 1 })),
  time: { endMs, startMs },
});

describe('scale and key interpretation over event windows', () => {
  const cMajorProgression = [
    timedEvidence('c-1', ['C', 'E', 'G'], 0, 1000),
    timedEvidence('f-1', ['F', 'A', 'C'], 1000, 2000),
    timedEvidence('g-1', ['G', 'B', 'D'], 2000, 3000),
    timedEvidence('c-2', ['C', 'E', 'G'], 3000, 5000),
  ];

  const aMinorProgression = [
    timedEvidence('am-1', ['A', 'C', 'E'], 0, 1000),
    timedEvidence('dm-1', ['D', 'F', 'A'], 1000, 2000),
    timedEvidence('em-1', ['E', 'G', 'B'], 2000, 3000),
    timedEvidence('am-2', ['A', 'C', 'E'], 3000, 5000),
  ];

  it.each([
    [cMajorProgression, 'C major', 'C major'],
    [aMinorProgression, 'A natural-minor', 'A minor'],
  ] satisfies readonly [readonly TimedPitchClassEvidence[], string, string][])(
    'identifies scale %s and key %s from a progression window',
    (events, expectedScale, expectedKey) => {
      expect(rankScaleInterpretations(events)[0]?.scale.name).toBe(expectedScale);
      expect(rankKeyInterpretations(events)[0]?.key.name).toBe(expectedKey);
    },
  );

  it('identifies the blues collection from complete weighted evidence', () => {
    const events = [
      timedEvidence('a-blues-1', ['A', 'C', 'D'], 0, 1000),
      timedEvidence('a-blues-2', ['D#', 'E', 'G', 'A'], 1000, 2500),
    ];
    const interpretation = rankScaleInterpretations(events)[0];
    expect(interpretation?.scale.name).toBe('A blues');
    expect(interpretation?.evidence.map((item) => item.kind)).toEqual([
      'fit',
      'coverage',
      'tonic',
      'continuity',
    ]);
  });

  it('preserves relative pentatonic ambiguity when the evidence cannot choose a tonic', () => {
    const events = ['A', 'C', 'D', 'E', 'G'].map((pitchClass, index) =>
      timedEvidence(
        `pent-${String(index)}`,
        [pitchClass as PitchClass],
        index * 100,
        index * 100 + 100,
      ),
    );
    const interpretations = rankScaleInterpretations(events, { candidateLimit: 60 });
    const aMinor = interpretations.find(
      (candidate) => candidate.scale.name === 'A minor-pentatonic',
    );
    const cMajor = interpretations.find(
      (candidate) => candidate.scale.name === 'C major-pentatonic',
    );
    expect(aMinor?.score).toBe(cMajor?.score);
    expect(aMinor?.confidence).toBe(cMajor?.confidence);
  });

  it('uses a bounded prior to resolve otherwise equal relative scale and key candidates', () => {
    const events = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((pitchClass, index) =>
      timedEvidence(
        `diatonic-${String(index)}`,
        [pitchClass as PitchClass],
        index * 100,
        index * 100 + 100,
      ),
    );
    const scales = rankScaleInterpretations(events, { candidateLimit: 60 });
    const unprimedC = scales.find((candidate) => candidate.scale.name === 'C major');
    const unprimedA = scales.find((candidate) => candidate.scale.name === 'A natural-minor');
    expect(unprimedC?.score).toBe(unprimedA?.score);

    const previousScale = buildScale(spelledPitchClass('C'), 'major');
    const primedScales = rankScaleInterpretations(events, { previousScale });
    expect(primedScales[0]?.scale.name).toBe('C major');
    expect(primedScales[0]?.evidence.find((item) => item.kind === 'continuity')?.contribution).toBe(
      0.06,
    );

    const keys = rankKeyInterpretations(events, { candidateLimit: 24 });
    const unprimedCKey = keys.find((candidate) => candidate.key.name === 'C major');
    const unprimedAKey = keys.find((candidate) => candidate.key.name === 'A minor');
    expect(unprimedCKey?.score).toBe(unprimedAKey?.score);

    const previousKey = buildKey(spelledPitchClass('C'), 'major');
    const primedKeys = rankKeyInterpretations(events, { previousKey });
    expect(primedKeys[0]?.key.name).toBe('C major');
    expect(primedKeys[0]?.evidence.find((item) => item.kind === 'continuity')?.contribution).toBe(
      0.06,
    );
  });

  it('uses duration and confidence while retaining brief out-of-key evidence', () => {
    const events = [
      timedEvidence('c-major-long', ['C', 'D', 'E', 'F', 'G', 'A', 'B'], 0, 5000),
      timedEvidence('c-resolution', ['C'], 5000, 7000),
      timedEvidence('f-sharp-brief', ['F#'], 7000, 7100, 0.2),
    ];
    const interpretation = rankScaleInterpretations(events)[0];
    expect(interpretation?.scale.name).toBe('C major');
    expect(interpretation?.evidence.find((item) => item.kind === 'fit')?.description).not.toContain(
      '100.0%',
    );
  });

  it('selects a conventional enharmonic key using the requested spelling direction', () => {
    expect(keyForPitchClass('C#', 'major', 'sharps').name).toBe('C# major');
    expect(keyForPitchClass('C#', 'major', 'flats').name).toBe('Db major');
    expect(keyForPitchClass('G#', 'major', 'sharps').name).toBe('Ab major');

    const events = [
      timedEvidence('db-scale', ['C#', 'D#', 'F', 'F#', 'G#', 'A#', 'C'], 0, 1000),
      timedEvidence('db-tonic', ['C#'], 1000, 3000),
    ];
    expect(rankKeyInterpretations(events, { spellingPreference: 'sharps' })[0]?.key.name).toBe(
      'C# major',
    );
    expect(rankKeyInterpretations(events, { spellingPreference: 'flats' })[0]?.key.name).toBe(
      'Db major',
    );
  });

  it('copies event references and never mutates window evidence', () => {
    const events = structuredClone(cMajorProgression);
    const snapshot = structuredClone(events);
    const interpretation = rankKeyInterpretations(events)[0];
    expect(events).toEqual(snapshot);
    expect(interpretation?.sourceEventIds).toEqual(['c-1', 'f-1', 'g-1', 'c-2']);
    expect(interpretation?.sourceEventIds).not.toBe(events);
  });

  it('returns no interpretation for empty evidence and validates windows and options', () => {
    expect(rankScaleInterpretations([])).toEqual([]);
    expect(rankKeyInterpretations([timedEvidence('silent', ['C'], 0, 1000, 0)])).toEqual([]);
    expect(() =>
      rankScaleInterpretations([
        timedEvidence('duplicate', ['C'], 0, 100),
        timedEvidence('duplicate', ['E'], 100, 200),
      ]),
    ).toThrow(RangeError);
    expect(() =>
      rankKeyInterpretations([
        { ...timedEvidence('bad-time', ['C'], 100, 200), time: { endMs: 50, startMs: 100 } },
      ]),
    ).toThrow(RangeError);
    expect(() =>
      rankScaleInterpretations([
        { ...timedEvidence('bad-confidence', ['C'], 0, 100), confidence: 1.1 },
      ]),
    ).toThrow(RangeError);
    expect(() => rankScaleInterpretations(cMajorProgression, { continuityStrength: -0.1 })).toThrow(
      RangeError,
    );
    expect(() => rankKeyInterpretations(cMajorProgression, { candidateLimit: 0 })).toThrow(
      RangeError,
    );
  });
});

const rawChordEvent = (
  id: string,
  pitchClasses: readonly PitchClass[],
  root: PitchClass,
  symbol: string,
  startMs: number,
  endMs?: number,
  lifecycle: Lifecycle = 'finalized',
): AudioEvent =>
  ChordEventSchema.parse({
    candidates: [
      {
        confidence: 0.9,
        pitchClasses,
        quality: symbol.endsWith('m') ? 'minor' : 'major',
        rank: 1,
        root,
        score: 0.9,
        symbol,
      },
    ],
    diagnostics: {},
    id,
    kind: 'chord',
    lifecycle,
    provenance: {
      algorithm: 'music-test',
      generatedAtMs: startMs,
      runId: 'music-test-run',
      subsystem: 'polyphonic-analysis',
      version: '1.0.0',
    },
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    time: { ...(endMs === undefined ? {} : { endMs }), startMs },
  });

describe('shared audio-event evidence adapter', () => {
  it('interprets shared chord events while preserving the raw event sequence', () => {
    const events = [
      rawChordEvent('raw-c-1', ['C', 'E', 'G'], 'C', 'C', 0, 1000),
      rawChordEvent('raw-f-1', ['F', 'A', 'C'], 'F', 'F', 1000, 2000),
      rawChordEvent('raw-g-1', ['G', 'B', 'D'], 'G', 'G', 2000, 3000),
      rawChordEvent('raw-c-2', ['C', 'E', 'G'], 'C', 'C', 3000, 5000),
    ];
    const snapshot = structuredClone(events);
    const window = audioEventsToTimedPitchClassEvidence(events);
    expect(events).toEqual(snapshot);
    expect(window.map((item) => item.eventId)).toEqual([
      'raw-c-1',
      'raw-f-1',
      'raw-g-1',
      'raw-c-2',
    ]);
    expect(rankScaleInterpretations(window)[0]?.scale.name).toBe('C major');
    expect(rankKeyInterpretations(window)[0]?.key.name).toBe('C major');
  });

  it('preserves ranked note uncertainty and polyphonic note confidence', () => {
    const note = NoteEventSchema.parse({
      candidates: [
        {
          centsOffset: 0,
          confidence: 0.8,
          evidence: [],
          frequencyHz: 261.63,
          midi: 60,
          noteName: 'C4',
          pitchClass: 'C',
          rank: 1,
          score: 0.8,
        },
        {
          centsOffset: 0,
          confidence: 0.4,
          evidence: [],
          frequencyHz: 277.18,
          midi: 61,
          noteName: 'C#4',
          pitchClass: 'C#',
          rank: 2,
          score: 0.4,
        },
      ],
      diagnostics: {},
      id: 'raw-note',
      kind: 'note',
      lifecycle: 'finalized',
      provenance: {
        algorithm: 'music-test',
        generatedAtMs: 0,
        runId: 'music-test-run',
        subsystem: 'audio-analysis',
        version: '1.0.0',
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs: 500, startMs: 0 },
    });
    const noteSet = NoteSetEventSchema.parse({
      candidates: [
        {
          confidence: 0.9,
          evidence: [],
          notes: [
            {
              confidence: 0.75,
              evidence: [],
              frameConfidence: 0.8,
              midi: 64,
              noteName: 'E4',
              onsetConfidence: 0.9,
              pitchClass: 'E',
            },
            {
              confidence: 0.6,
              evidence: [],
              frameConfidence: 0.7,
              midi: 67,
              noteName: 'G4',
              onsetConfidence: 0.8,
              pitchClass: 'G',
            },
          ],
          rank: 1,
          score: 0.9,
        },
      ],
      diagnostics: {},
      id: 'raw-note-set',
      kind: 'note-set',
      lifecycle: 'finalized',
      provenance: {
        algorithm: 'music-test',
        generatedAtMs: 500,
        runId: 'music-test-run',
        subsystem: 'polyphonic-analysis',
        version: '1.0.0',
      },
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      time: { endMs: 1000, startMs: 500 },
    });
    const window = audioEventsToTimedPitchClassEvidence([note, noteSet]);
    expect(window[0]).toMatchObject({
      confidence: 0.8,
      pitchClasses: [
        { pitchClass: 'C', weight: 1 },
        { pitchClass: 'C#', weight: 0.5 },
      ],
    });
    expect(window[1]).toMatchObject({
      confidence: 0.9,
      pitchClasses: [
        { pitchClass: 'E', weight: 0.75 },
        { pitchClass: 'G', weight: 0.6 },
      ],
    });
  });

  it('uses retained chord observations without turning alternative templates into evidence', () => {
    const event = ChordEventSchema.parse({
      ...rawChordEvent('observed-chord', ['D', 'F#', 'A'], 'D', 'D', 0, 1_000),
      candidates: [
        {
          confidence: 0.8,
          pitchClasses: ['D', 'F#', 'A'],
          quality: 'major',
          rank: 1,
          root: 'D',
          score: 0.86,
          symbol: 'D',
        },
        {
          confidence: 0.7,
          pitchClasses: ['A', 'D', 'E'],
          quality: 'suspended-4',
          rank: 2,
          root: 'A',
          score: 0.79,
          symbol: 'Asus4',
        },
      ],
      observedPitchClasses: [
        { pitchClass: 'D', weight: 0.9 },
        { pitchClass: 'F#', weight: 0.55 },
        { pitchClass: 'A', weight: 0.8 },
      ],
    });

    expect(audioEventsToTimedPitchClassEvidence([event])[0]?.pitchClasses).toEqual([
      { pitchClass: 'D', weight: 0.9 },
      { pitchClass: 'F#', weight: 0.55 },
      { pitchClass: 'A', weight: 0.8 },
    ]);
  });

  it('excludes provisional events by default and closes included open events explicitly', () => {
    const provisional = rawChordEvent(
      'raw-provisional',
      ['C', 'E', 'G'],
      'C',
      'C',
      100,
      undefined,
      'provisional',
    );
    expect(audioEventsToTimedPitchClassEvidence([provisional])).toEqual([]);
    expect(() =>
      audioEventsToTimedPitchClassEvidence([provisional], { includeProvisional: true }),
    ).toThrow(RangeError);
    expect(
      audioEventsToTimedPitchClassEvidence([provisional], {
        includeProvisional: true,
        windowEndMs: 500,
      })[0]?.time,
    ).toEqual({ endMs: 500, startMs: 100 });
    expect(() =>
      audioEventsToTimedPitchClassEvidence([provisional], {
        includeProvisional: true,
        windowEndMs: 50,
      }),
    ).toThrow(RangeError);
    expect(() => audioEventsToTimedPitchClassEvidence([], { windowEndMs: Number.NaN })).toThrow(
      RangeError,
    );
  });
});
