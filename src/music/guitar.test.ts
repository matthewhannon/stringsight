import type { PitchClass } from '../shared';
import {
  GUITAR_TEMPERAMENT,
  GuitarEnumerationLimitError,
  GuitarValidationError,
  createGuitarDefinition,
  createGuitarVoicing,
  createStandardGuitar,
  enumerateGuitarFingerings,
  enumerateGuitarLocations,
  enumerateGuitarVoicings,
  enumeratePitchClassVoicings,
  fretWireDistanceFromNutMm,
  guitarTransitionCost,
  locationFromPhysicalGuitarPosition,
  locationsForMidi,
  locationsForPitchClass,
  resolveGuitarLocation,
  tuningFromMidiLowToHigh,
  validateGuitarDefinition,
  vibratingLengthMm,
  type GuitarDefinition,
  type GuitarLocation,
} from '.';

const coordinateKey = (location: GuitarLocation): string =>
  `${String(location.stringNumber)}:${String(location.tabFret)}`;

const shapeLowToHigh = (locations: readonly GuitarLocation[]): string => {
  const byString = new Map(locations.map((location) => [location.stringNumber, location.tabFret]));
  return [6, 5, 4, 3, 2, 1]
    .map((stringNumber) => byString.get(stringNumber)?.toString() ?? 'x')
    .join('');
};

describe('canonical guitar coordinates', () => {
  it('explicitly reverses legacy low-to-high tuning without pitch sorting', () => {
    expect(tuningFromMidiLowToHigh([40, 45, 50, 55, 59, 64])).toEqual([
      { openMidi: 64, stringNumber: 1 },
      { openMidi: 59, stringNumber: 2 },
      { openMidi: 55, stringNumber: 3 },
      { openMidi: 50, stringNumber: 4 },
      { openMidi: 45, stringNumber: 5 },
      { openMidi: 40, stringNumber: 6 },
    ]);
    expect(tuningFromMidiLowToHigh([40, 70, 45])).toEqual([
      { openMidi: 45, stringNumber: 1 },
      { openMidi: 70, stringNumber: 2 },
      { openMidi: 40, stringNumber: 3 },
    ]);
  });

  it.each([
    [1, 0, 64, 'E'],
    [2, 0, 59, 'B'],
    [3, 9, 64, 'E'],
    [6, 0, 40, 'E'],
    [6, 24, 64, 'E'],
  ] satisfies readonly [number, number, number, PitchClass][])(
    'maps string %i tab fret %i to MIDI %i and %s',
    (stringNumber, tabFret, midi, pitchClass) => {
      expect(
        resolveGuitarLocation(createStandardGuitar(), { stringNumber, tabFret }),
      ).toMatchObject({
        midi,
        physicalFret: tabFret,
        pitchClass,
      });
    },
  );

  it('uses a capo-relative tab fret and a physical neck limit', () => {
    const guitar = createStandardGuitar({ capoFret: 2, maxPhysicalFret: 24 });
    expect(resolveGuitarLocation(guitar, { stringNumber: 6, tabFret: 0 })).toMatchObject({
      midi: 42,
      physicalFret: 2,
      termination: 'capo',
    });
    expect(resolveGuitarLocation(guitar, { stringNumber: 1, tabFret: 22 })).toMatchObject({
      midi: 88,
      physicalFret: 24,
      termination: 'finger',
    });
    expect(() => resolveGuitarLocation(guitar, { stringNumber: 1, tabFret: 23 })).toThrow(
      RangeError,
    );
  });

  it('distinguishes nut, capo, and finger termination', () => {
    expect(
      resolveGuitarLocation(createStandardGuitar(), { stringNumber: 1, tabFret: 0 }).termination,
    ).toBe('nut');
    expect(
      resolveGuitarLocation(createStandardGuitar({ capoFret: 2 }), {
        stringNumber: 1,
        tabFret: 0,
      }).termination,
    ).toBe('capo');
    expect(
      resolveGuitarLocation(createStandardGuitar({ capoFret: 2 }), {
        stringNumber: 1,
        tabFret: 1,
      }).termination,
    ).toBe('finger');
  });

  it.each([
    createStandardGuitar(),
    createStandardGuitar({ capoFret: 2, handedness: 'left' }),
    createStandardGuitar({
      tuning: tuningFromMidiLowToHigh([38, 45, 50, 55, 59, 64]),
    }),
    createStandardGuitar({
      tuning: [
        { openMidi: 64, stringNumber: 1 },
        { openMidi: 59, stringNumber: 2 },
        { openMidi: 67, stringNumber: 3 },
        { openMidi: 50, stringNumber: 4 },
        { openMidi: 45, stringNumber: 5 },
        { openMidi: 40, stringNumber: 6 },
      ],
    }),
  ])('exhaustively maps every bounded coordinate for a configuration', (guitar) => {
    const locations = enumerateGuitarLocations(guitar);
    expect(locations).toHaveLength(
      guitar.tuning.length * (guitar.maxPhysicalFret - guitar.capoFret + 1),
    );
    expect(new Set(locations.map(coordinateKey))).toHaveLength(locations.length);
    for (const location of locations) {
      const string = guitar.tuning[location.stringNumber - 1];
      expect(location.physicalFret).toBe(guitar.capoFret + location.tabFret);
      expect(location.midi).toBe((string?.openMidi ?? 0) + location.physicalFret);
      expect(location.pitchClass).toBe(
        ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][location.midi % 12],
      );
    }
  });

  it('does not let handedness or scale length change pitch', () => {
    const right = createStandardGuitar({ handedness: 'right', scaleLengthMm: 648 });
    const left = createStandardGuitar({ handedness: 'left', scaleLengthMm: 700 });
    expect(
      enumerateGuitarLocations(left).map(({ midi, pitchClass }) => ({ midi, pitchClass })),
    ).toEqual(
      enumerateGuitarLocations(right).map(({ midi, pitchClass }) => ({ midi, pitchClass })),
    );
  });

  it('derives ideal 12-TET fret geometry from scale length', () => {
    const guitar = createStandardGuitar({ scaleLengthMm: 648 });
    expect(fretWireDistanceFromNutMm(guitar, 0)).toBe(0);
    expect(fretWireDistanceFromNutMm(guitar, 12)).toBeCloseTo(324, 10);
    expect(fretWireDistanceFromNutMm(guitar, 24)).toBeCloseTo(486, 10);
    expect(vibratingLengthMm(guitar, 12)).toBeCloseTo(324, 10);
    for (let fret = 0; fret <= guitar.maxPhysicalFret; fret += 1) {
      expect(fretWireDistanceFromNutMm(guitar, fret) + vibratingLengthMm(guitar, fret)).toBeCloseTo(
        guitar.scaleLengthMm,
        10,
      );
    }
  });
});

describe('inverse pitch lookup and adapters', () => {
  const guitar = createStandardGuitar();
  const allLocations = enumerateGuitarLocations(guitar);

  it('matches an independent full-board filter for every MIDI pitch', () => {
    for (let midi = 0; midi <= 127; midi += 1) {
      expect(locationsForMidi(guitar, midi)).toEqual(
        allLocations.filter((location) => location.midi === midi),
      );
    }
  });

  it('returns every duplicate-pitch physical location in canonical order', () => {
    expect(locationsForMidi(guitar, 64).map(coordinateKey)).toEqual([
      '1:0',
      '2:5',
      '3:9',
      '4:14',
      '5:19',
      '6:24',
    ]);
    expect(locationsForMidi(guitar, 40).map(coordinateKey)).toEqual(['6:0']);
    expect(locationsForMidi(guitar, 89)).toEqual([]);
  });

  it('matches a full-board filter for all twelve pitch classes', () => {
    for (const pitchClass of [
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
    ] as const) {
      expect(locationsForPitchClass(guitar, pitchClass)).toEqual(
        allLocations.filter((location) => location.pitchClass === pitchClass),
      );
    }
  });

  it('converts a legacy physical fret and rejects its duplicated pitch when inconsistent', () => {
    const capoed = createStandardGuitar({ capoFret: 2 });
    expect(locationFromPhysicalGuitarPosition(capoed, { fret: 5, midi: 45, string: 6 })).toEqual({
      stringNumber: 6,
      tabFret: 3,
    });
    expect(() =>
      locationFromPhysicalGuitarPosition(capoed, { fret: 5, midi: 46, string: 6 }),
    ).toThrow(/does not match derived MIDI/);
  });
});

describe('voicing and fingering enumeration', () => {
  const guitar = createStandardGuitar();

  it.each([
    [[40, 47, 52, 56, 59, 64], '022100'],
    [[48, 52, 55, 60, 64], 'x32010'],
    [[41, 48, 53, 57, 60, 65], '133211'],
  ] satisfies readonly [readonly number[], string][])(
    'includes the expected %s exact-MIDI shape',
    (midis, shape) => {
      const shapes = enumerateGuitarVoicings(guitar, midis).map((voicing) =>
        shapeLowToHigh(voicing.locations),
      );
      expect(shapes).toContain(shape);
    },
  );

  it('preserves exact MIDI multiplicity and never collides on a string', () => {
    const voicings = enumerateGuitarVoicings(guitar, [64, 64]);
    expect(voicings).toHaveLength(15);
    for (const voicing of voicings) {
      expect(voicing.midiPitches).toEqual([64, 64]);
      expect(new Set(voicing.locations.map((location) => location.stringNumber))).toHaveLength(2);
    }
    expect(enumerateGuitarVoicings(guitar, [40, 40])).toEqual([]);
  });

  it('is invariant to exact-MIDI input ordering and applies physical constraints inclusively', () => {
    const forward = enumerateGuitarVoicings(guitar, [48, 52, 55, 60, 64], {
      allowedStringNumbers: [1, 2, 3, 4, 5],
      maximumPhysicalFret: 3,
      maxFretSpan: 3,
    });
    const reverse = enumerateGuitarVoicings(guitar, [64, 60, 55, 52, 48], {
      allowedStringNumbers: [5, 4, 3, 2, 1],
      maximumPhysicalFret: 3,
      maxFretSpan: 3,
    });
    expect(reverse).toEqual(forward);
    expect(forward.map((voicing) => shapeLowToHigh(voicing.locations))).toEqual(['x32010']);
  });

  it('excludes capo-relative open strings from the fretted hand span', () => {
    const voicings = enumerateGuitarVoicings(guitar, [64, 74], { maxFretSpan: 0 });
    expect(
      voicings.some((voicing) => voicing.locations.some((location) => location.tabFret === 0)),
    ).toBe(true);
  });

  it('keeps pitch-class coverage, doubling, and bass semantics explicit', () => {
    const voicings = enumeratePitchClassVoicings(
      createStandardGuitar({ maxPhysicalFret: 4 }),
      {
        allowedPitchClasses: ['C', 'E', 'G'],
        bassPitchClass: 'C',
        maximumNotes: 5,
        minimumNotes: 3,
        requiredPitchClasses: ['C', 'E', 'G'],
      },
      { maxFretSpan: 4 },
    );
    expect(voicings.length).toBeGreaterThan(0);
    for (const voicing of voicings) {
      expect(new Set(voicing.locations.map((location) => location.pitchClass))).toEqual(
        new Set(['C', 'E', 'G']),
      );
      expect(Math.min(...voicing.midiPitches) % 12).toBe(0);
    }
  });

  it('generates a legal barre candidate for F major instead of imposing a four-note limit', () => {
    const voicing = enumerateGuitarVoicings(guitar, [41, 48, 53, 57, 60, 65]).find(
      (candidate) => shapeLowToHigh(candidate.locations) === '133211',
    );
    expect(voicing).toBeDefined();
    if (voicing === undefined) throw new Error('Expected the F-major barre voicing.');
    const fingerings = enumerateGuitarFingerings(guitar, voicing);
    expect(
      fingerings.some((fingering) => {
        const firstFingerStrings = fingering.assignments
          .filter((assignment) => assignment.finger === 1 && assignment.tabFret === 1)
          .map((assignment) => assignment.stringNumber);
        return [1, 2, 6].every((stringNumber) => firstFingerStrings.includes(stringNumber));
      }),
    ).toBe(true);
  });

  it('rejects barres across lower notes and canonicalizes same-fret intermediate notes', () => {
    const lowerMiddle = createGuitarVoicing(guitar, [
      { stringNumber: 1, tabFret: 5 },
      { stringNumber: 2, tabFret: 3 },
      { stringNumber: 3, tabFret: 5 },
    ]);
    expect(
      enumerateGuitarFingerings(guitar, lowerMiddle).some((fingering) =>
        fingering.assignments.every(
          (assignment) => assignment.stringNumber === 2 || assignment.finger === 1,
        ),
      ),
    ).toBe(false);

    const sameFret = createGuitarVoicing(
      guitar,
      [1, 2, 3, 4].map((stringNumber) => ({
        stringNumber,
        tabFret: 1,
      })),
    );
    expect(
      enumerateGuitarFingerings(guitar, sameFret).some(
        (fingering) =>
          fingering.assignments.map((assignment) => assignment.finger).join('') === '1212',
      ),
    ).toBe(false);
  });

  it('supports fingerings for voicings with noncontiguous sounded strings', () => {
    const voicing = createGuitarVoicing(guitar, [
      { stringNumber: 2, tabFret: 1 },
      { stringNumber: 6, tabFret: 3 },
    ]);
    expect(enumerateGuitarFingerings(guitar, voicing).length).toBeGreaterThan(0);
  });

  it('fails broad searches explicitly without returning partial candidates', () => {
    let error: unknown;
    try {
      enumeratePitchClassVoicings(
        guitar,
        {
          allowedPitchClasses: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
          maximumNotes: 6,
          minimumNotes: 1,
          requiredPitchClasses: ['C'],
        },
        { maximumSearchNodes: 10 },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GuitarEnumerationLimitError);
    expect(error).toMatchObject({ limit: 10, visitedNodes: 11 });
    expect(() =>
      enumerateGuitarFingerings(
        guitar,
        createGuitarVoicing(guitar, [
          { stringNumber: 1, tabFret: 1 },
          { stringNumber: 2, tabFret: 1 },
        ]),
        { maximumSearchNodes: 1 },
      ),
    ).toThrow(GuitarEnumerationLimitError);
  });

  it('rejects duplicate-string voicings rather than accepting a collision', () => {
    expect(() =>
      createGuitarVoicing(guitar, [
        { stringNumber: 1, tabFret: 0 },
        { stringNumber: 1, tabFret: 12 },
      ]),
    ).toThrow(/one string more than once/);
  });
});

describe('transition policy', () => {
  const right = createStandardGuitar({ handedness: 'right' });
  const left = createStandardGuitar({ handedness: 'left' });
  const at = (definition: GuitarDefinition, fret: number) =>
    createGuitarVoicing(definition, [{ stringNumber: 1, tabFret: fret }]);

  it('is zero for identity, input-order invariant, finite, and non-negative', () => {
    const state = createGuitarVoicing(right, [
      { stringNumber: 3, tabFret: 2 },
      { stringNumber: 1, tabFret: 1 },
    ]);
    expect(guitarTransitionCost(right, state, state)).toEqual({
      movement: 0,
      placements: 0,
      releases: 0,
      total: 0,
    });
  });

  it('is handedness invariant and responds to short physical movement', () => {
    const rightCost = guitarTransitionCost(right, at(right, 1), at(right, 2));
    const leftCost = guitarTransitionCost(left, at(left, 1), at(left, 2));
    expect(leftCost).toEqual(rightCost);
    expect(rightCost).toEqual({ movement: 1, placements: 0, releases: 0, total: 1 });
    expect(guitarTransitionCost(right, at(right, 1), at(right, 12))).toEqual({
      movement: 11,
      placements: 0,
      releases: 0,
      total: 11,
    });
  });

  it('canonicalizes input order and deterministically breaks equal-cost assignments', () => {
    const forwardFrom = createGuitarVoicing(right, [
      { stringNumber: 1, tabFret: 1 },
      { stringNumber: 2, tabFret: 1 },
    ]);
    const forwardTo = createGuitarVoicing(right, [
      { stringNumber: 2, tabFret: 1 },
      { stringNumber: 3, tabFret: 1 },
    ]);
    const policy = {
      fingerPlacementCost: 1,
      fingerReleaseCost: 1,
      fretDistanceCost: 1,
      stringDistanceCost: 1,
    };
    expect(guitarTransitionCost(right, forwardFrom, forwardTo, policy)).toEqual(
      guitarTransitionCost(
        right,
        { locations: [...forwardFrom.locations].reverse() },
        { locations: [...forwardTo.locations].reverse() },
        policy,
      ),
    );
  });

  it('accounts explicitly for adding and releasing fretting contacts', () => {
    const open = at(right, 0);
    const fretted = at(right, 1);
    expect(guitarTransitionCost(right, open, fretted)).toMatchObject({
      placements: 1,
      releases: 0,
    });
    expect(guitarTransitionCost(right, fretted, open)).toMatchObject({
      placements: 0,
      releases: 0.25,
    });
  });
});

describe('validation, boundaries, and immutability', () => {
  const valid = createStandardGuitar();

  it.each([
    ['capoFret', -1, 'capo-out-of-range'],
    ['capoFret', 25, 'capo-out-of-range'],
    ['maxPhysicalFret', 37, 'invalid-max-physical-fret'],
    ['maxPhysicalFret', 1.5, 'invalid-max-physical-fret'],
    ['scaleLengthMm', 0, 'invalid-scale-length'],
    ['scaleLengthMm', Number.POSITIVE_INFINITY, 'invalid-scale-length'],
  ] as const)('reports stable validation issue codes for %s=%s', (field, value, expectedCode) => {
    const definition = { ...valid, [field]: value } as GuitarDefinition;
    expect(validateGuitarDefinition(definition).map((issue) => issue.code)).toContain(expectedCode);
    expect(() => createGuitarDefinition(definition)).toThrow(GuitarValidationError);
  });

  it('rejects duplicate/misordered IDs but permits equal pitches on distinct strings', () => {
    const duplicateId = {
      ...valid,
      tuning: [
        { openMidi: 64, stringNumber: 1 },
        { openMidi: 64, stringNumber: 1 },
      ],
    };
    expect(validateGuitarDefinition(duplicateId).map((issue) => issue.code)).toEqual([
      'duplicate-string-number',
      'tuning-order-mismatch',
    ]);
    expect(() =>
      createGuitarDefinition({
        ...valid,
        tuning: [
          { openMidi: 64, stringNumber: 1 },
          { openMidi: 64, stringNumber: 2 },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects invalid locations, targets, constraints, and policies', () => {
    expect(() => resolveGuitarLocation(valid, { stringNumber: 7, tabFret: 0 })).toThrow(RangeError);
    expect(() => resolveGuitarLocation(valid, { stringNumber: 1, tabFret: -1 })).toThrow(
      RangeError,
    );
    expect(() => locationsForMidi(valid, 128)).toThrow(RangeError);
    expect(() => locationsForPitchClass(valid, 'H' as PitchClass)).toThrow(RangeError);
    expect(() =>
      enumeratePitchClassVoicings(valid, {
        maximumNotes: 1,
        minimumNotes: 1,
        requiredPitchClasses: ['H' as PitchClass],
      }),
    ).toThrow(RangeError);
    expect(() => enumerateGuitarVoicings(valid, [64], { maxFretSpan: -1 })).toThrow(RangeError);
    expect(() => enumerateGuitarVoicings(valid, [64], { maximumSearchNodes: 0 })).toThrow(
      RangeError,
    );
    expect(() => enumerateGuitarVoicings(valid, [64], { maximumSearchNodes: 1.5 })).toThrow(
      RangeError,
    );
    expect(() =>
      enumerateGuitarVoicings(valid, [40, 45, 50, 55, 59, 64, 128], {
        maximumSearchNodes: 0,
      }),
    ).toThrow(/MIDI pitch/);
    expect(() =>
      guitarTransitionCost(
        valid,
        createGuitarVoicing(valid, [{ stringNumber: 1, tabFret: 0 }]),
        createGuitarVoicing(valid, [{ stringNumber: 1, tabFret: 1 }]),
        {
          fingerPlacementCost: -1,
          fingerReleaseCost: 0,
          fretDistanceCost: 0,
          stringDistanceCost: 0,
        },
      ),
    ).toThrow(RangeError);
    expect(() =>
      guitarTransitionCost(
        valid,
        createGuitarVoicing(valid, [{ stringNumber: 1, tabFret: 0 }]),
        createGuitarVoicing(valid, [{ stringNumber: 1, tabFret: 1 }]),
        {} as never,
      ),
    ).toThrow(RangeError);
  });

  it('supports the one-location capo-at-neck boundary and MIDI 127', () => {
    const boundary = createGuitarDefinition({
      capoFret: 1,
      handedness: 'right',
      maxPhysicalFret: 1,
      scaleLengthMm: 648,
      temperament: GUITAR_TEMPERAMENT,
      tuning: [{ openMidi: 126, stringNumber: 1 }],
    });
    expect(enumerateGuitarLocations(boundary)).toEqual([
      expect.objectContaining({ midi: 127, physicalFret: 1, tabFret: 0 }),
    ]);
  });

  it('copies and freezes configuration and result arrays', () => {
    const source = [{ openMidi: 64, stringNumber: 1 }];
    const definition = createGuitarDefinition({
      capoFret: 0,
      handedness: 'right',
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: GUITAR_TEMPERAMENT,
      tuning: source,
    });
    source[0] = { openMidi: 60, stringNumber: 1 };
    expect(definition.tuning[0]?.openMidi).toBe(64);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.tuning)).toBe(true);
    expect(Object.isFrozen(locationsForMidi(definition, 64))).toBe(true);
  });

  it('requires the validating constructor at public mapping boundaries', () => {
    const unvalidated = {
      capoFret: 0,
      handedness: 'right',
      maxPhysicalFret: 24,
      scaleLengthMm: 648,
      temperament: GUITAR_TEMPERAMENT,
      tuning: [{ openMidi: 64, stringNumber: 1 }],
    } as unknown as GuitarDefinition;
    expect(() => resolveGuitarLocation(unvalidated, { stringNumber: 1, tabFret: 0 })).toThrow(
      /Use createGuitarDefinition/,
    );
    expect(() => locationsForMidi(unvalidated, 0)).toThrow(/Use createGuitarDefinition/);
    expect(() => guitarTransitionCost(unvalidated, { locations: [] }, { locations: [] })).toThrow(
      /Use createGuitarDefinition/,
    );
    const forged = {
      ...createStandardGuitar(),
      maxPhysicalFret: 36,
      tuning: [{ openMidi: 127, stringNumber: 1 }],
    } as GuitarDefinition;
    expect(() => resolveGuitarLocation(forged, { stringNumber: 1, tabFret: 36 })).toThrow(
      /Use createGuitarDefinition/,
    );
  });
});
