import type { GuitarPosition, PitchClass } from '../shared';
import { PITCH_CLASSES, pitchClassAt } from './pitch';

export const GUITAR_TEMPERAMENT = '12-tet' as const;
export const MAX_GUITAR_PHYSICAL_FRET = 36;
export const MAX_GUITAR_STRING_COUNT = 12;
export const DEFAULT_GUITAR_ENUMERATION_NODE_LIMIT = 250_000;
export const STANDARD_TUNING_MIDI_LOW_TO_HIGH = [40, 45, 50, 55, 59, 64] as const;

export type GuitarHandedness = 'left' | 'right';

export type GuitarStringTuning = {
  readonly openMidi: number;
  readonly stringNumber: number;
};

export type GuitarDefinitionInput = {
  readonly capoFret: number;
  readonly handedness: GuitarHandedness;
  readonly maxPhysicalFret: number;
  readonly scaleLengthMm: number;
  readonly temperament: typeof GUITAR_TEMPERAMENT;
  /** String 1 first: the conventional treble-to-bass guitar string order. */
  readonly tuning: readonly GuitarStringTuning[];
};

const VALIDATED_GUITAR_DEFINITION = Symbol('validated-guitar-definition');
const validatedGuitarDefinitions = new WeakSet<object>();

export type GuitarDefinition = GuitarDefinitionInput & {
  readonly [VALIDATED_GUITAR_DEFINITION]: true;
};

function assertValidatedGuitarDefinition(definition: GuitarDefinition): void {
  if (!validatedGuitarDefinitions.has(definition)) {
    throw new TypeError('Use createGuitarDefinition before calling guitar-domain operations.');
  }
}

export type GuitarLocation = {
  /** Stable conventional string number. String 1 is the treble full-length string. */
  readonly stringNumber: number;
  /** Tablature fret relative to the full-width capo. */
  readonly tabFret: number;
};

export type ResolvedGuitarLocation = GuitarLocation & {
  readonly midi: number;
  readonly physicalFret: number;
  readonly pitchClass: PitchClass;
  readonly termination: 'capo' | 'finger' | 'nut';
};

export type GuitarValidationIssueCode =
  | 'capo-out-of-range'
  | 'duplicate-string-number'
  | 'invalid-handedness'
  | 'invalid-max-physical-fret'
  | 'invalid-open-midi'
  | 'invalid-scale-length'
  | 'invalid-string-count'
  | 'invalid-string-number'
  | 'midi-board-overflow'
  | 'tuning-order-mismatch'
  | 'unsupported-temperament';

export type GuitarValidationIssue = {
  readonly code: GuitarValidationIssueCode;
  readonly message: string;
  readonly path: string;
};

export class GuitarValidationError extends RangeError {
  readonly issues: readonly GuitarValidationIssue[];

  constructor(issues: readonly GuitarValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
    this.name = 'GuitarValidationError';
    this.issues = issues;
  }
}

export class GuitarEnumerationLimitError extends RangeError {
  readonly limit: number;
  readonly visitedNodes: number;

  constructor(limit: number, visitedNodes: number) {
    super(
      `Guitar enumeration exceeded its explicit ${String(limit)}-node limit; no partial result was returned.`,
    );
    this.name = 'GuitarEnumerationLimitError';
    this.limit = limit;
    this.visitedNodes = visitedNodes;
  }
}

export type GuitarVoicingConstraints = {
  /** Strings which may sound. Omit for every string in the definition. */
  readonly allowedStringNumbers?: readonly number[];
  /** Open/capo strings do not enlarge the fretted-hand span. */
  readonly maxFretSpan?: number;
  readonly maximumPhysicalFret?: number;
  readonly minimumPhysicalFret?: number;
  /** Complete-or-error search budget. Partial candidates are never returned. */
  readonly maximumSearchNodes?: number;
};

export type GuitarVoicing = {
  /** One collision-free location per requested MIDI occurrence, ordered by string number. */
  readonly locations: readonly ResolvedGuitarLocation[];
  /** Exact MIDI multiset derived from locations, ordered by string number. */
  readonly midiPitches: readonly number[];
};

export type PitchClassVoicingSpec = {
  /** Every returned voicing must contain each required class at least once. */
  readonly requiredPitchClasses: readonly PitchClass[];
  /** Sounded classes are limited to this set. Defaults to the required set. */
  readonly allowedPitchClasses?: readonly PitchClass[];
  /** If supplied, the lowest sounding MIDI pitch must have this pitch class. */
  readonly bassPitchClass?: PitchClass;
  /** Explicit note-count bounds make omission and doubling behavior unambiguous. */
  readonly maximumNotes: number;
  readonly minimumNotes: number;
};

export type GuitarFinger = 1 | 2 | 3 | 4;

export type GuitarFingerAssignment = GuitarLocation & {
  readonly finger: GuitarFinger;
};

export type GuitarFingering = {
  readonly assignments: readonly GuitarFingerAssignment[];
  readonly voicing: GuitarVoicing;
};

export type GuitarFingeringConstraints = {
  /** Complete-or-error search budget. Partial suggestions are never returned. */
  readonly maximumSearchNodes?: number;
};

export type GuitarTransitionPolicy = {
  readonly fingerPlacementCost: number;
  readonly fingerReleaseCost: number;
  readonly fretDistanceCost: number;
  readonly stringDistanceCost: number;
};

export type GuitarTransitionCost = {
  readonly movement: number;
  readonly placements: number;
  readonly releases: number;
  readonly total: number;
};

export const DEFAULT_GUITAR_TRANSITION_POLICY: GuitarTransitionPolicy = Object.freeze({
  fingerPlacementCost: 1,
  fingerReleaseCost: 0.25,
  fretDistanceCost: 1,
  stringDistanceCost: 0.5,
});

function validationIssue(
  code: GuitarValidationIssueCode,
  path: string,
  message: string,
): GuitarValidationIssue {
  return { code, message, path };
}

export function validateGuitarDefinition(
  definition: GuitarDefinitionInput,
): GuitarValidationIssue[] {
  const issues: GuitarValidationIssue[] = [];
  const handedness: unknown = definition.handedness;
  const temperament: unknown = definition.temperament;
  if (handedness !== 'left' && handedness !== 'right') {
    issues.push(validationIssue('invalid-handedness', 'handedness', 'Must be left or right.'));
  }
  if (temperament !== GUITAR_TEMPERAMENT) {
    issues.push(
      validationIssue(
        'unsupported-temperament',
        'temperament',
        'Only twelve-tone equal temperament is supported.',
      ),
    );
  }
  if (
    !Number.isInteger(definition.maxPhysicalFret) ||
    definition.maxPhysicalFret < 0 ||
    definition.maxPhysicalFret > MAX_GUITAR_PHYSICAL_FRET
  ) {
    issues.push(
      validationIssue(
        'invalid-max-physical-fret',
        'maxPhysicalFret',
        'Must be an integer from 0 through 36.',
      ),
    );
  }
  if (
    !Number.isInteger(definition.capoFret) ||
    definition.capoFret < 0 ||
    definition.capoFret > definition.maxPhysicalFret
  ) {
    issues.push(
      validationIssue(
        'capo-out-of-range',
        'capoFret',
        'Must be an integer within the physical fretboard.',
      ),
    );
  }
  if (!Number.isFinite(definition.scaleLengthMm) || definition.scaleLengthMm <= 0) {
    issues.push(
      validationIssue('invalid-scale-length', 'scaleLengthMm', 'Must be a positive finite value.'),
    );
  }
  if (definition.tuning.length < 1 || definition.tuning.length > MAX_GUITAR_STRING_COUNT) {
    issues.push(
      validationIssue(
        'invalid-string-count',
        'tuning',
        'A supported instrument has between 1 and 12 independently fretted strings.',
      ),
    );
  }

  const seenStringNumbers = new Set<number>();
  definition.tuning.forEach((string, index) => {
    const path = `tuning[${String(index)}]`;
    if (!Number.isInteger(string.stringNumber) || string.stringNumber < 1) {
      issues.push(
        validationIssue(
          'invalid-string-number',
          `${path}.stringNumber`,
          'Must be a positive integer.',
        ),
      );
    }
    if (seenStringNumbers.has(string.stringNumber)) {
      issues.push(
        validationIssue(
          'duplicate-string-number',
          `${path}.stringNumber`,
          'String numbers must be unique.',
        ),
      );
    }
    seenStringNumbers.add(string.stringNumber);
    if (string.stringNumber !== index + 1) {
      issues.push(
        validationIssue(
          'tuning-order-mismatch',
          `${path}.stringNumber`,
          'Tuning must be supplied explicitly in contiguous string-number order.',
        ),
      );
    }
    if (!Number.isInteger(string.openMidi) || string.openMidi < 0 || string.openMidi > 127) {
      issues.push(
        validationIssue(
          'invalid-open-midi',
          `${path}.openMidi`,
          'Open-string MIDI must be an integer from 0 through 127.',
        ),
      );
    } else if (
      Number.isInteger(definition.maxPhysicalFret) &&
      string.openMidi + definition.maxPhysicalFret > 127
    ) {
      issues.push(
        validationIssue(
          'midi-board-overflow',
          `${path}.openMidi`,
          'The highest physical fret would exceed MIDI 127.',
        ),
      );
    }
  });
  return issues;
}

export function createGuitarDefinition(definition: GuitarDefinitionInput): GuitarDefinition {
  const issues = validateGuitarDefinition(definition);
  if (issues.length > 0) throw new GuitarValidationError(issues);
  const tuning = definition.tuning.map((string) => Object.freeze({ ...string }));
  const created = {
    ...definition,
    tuning: Object.freeze(tuning),
  } as GuitarDefinition;
  Object.defineProperty(created, VALIDATED_GUITAR_DEFINITION, {
    enumerable: false,
    value: true,
  });
  validatedGuitarDefinitions.add(created);
  return Object.freeze(created);
}

/** Explicitly adapts the legacy/session low-to-high array; pitch sorting is never used. */
export function tuningFromMidiLowToHigh(
  tuningMidiLowToHigh: readonly number[],
): readonly GuitarStringTuning[] {
  return Object.freeze(
    [...tuningMidiLowToHigh]
      .reverse()
      .map((openMidi, index) => Object.freeze({ openMidi, stringNumber: index + 1 })),
  );
}

export function createStandardGuitar(
  overrides: Partial<Omit<GuitarDefinitionInput, 'temperament' | 'tuning'>> & {
    readonly tuning?: readonly GuitarStringTuning[];
  } = {},
): GuitarDefinition {
  return createGuitarDefinition({
    capoFret: overrides.capoFret ?? 0,
    handedness: overrides.handedness ?? 'right',
    maxPhysicalFret: overrides.maxPhysicalFret ?? 24,
    scaleLengthMm: overrides.scaleLengthMm ?? 648,
    temperament: GUITAR_TEMPERAMENT,
    tuning: overrides.tuning ?? tuningFromMidiLowToHigh(STANDARD_TUNING_MIDI_LOW_TO_HIGH),
  });
}

function tuningForString(definition: GuitarDefinition, stringNumber: number): GuitarStringTuning {
  assertValidatedGuitarDefinition(definition);
  if (!Number.isInteger(stringNumber) || stringNumber < 1) {
    throw new RangeError('String number must be a positive integer.');
  }
  const tuning = definition.tuning[stringNumber - 1];
  if (tuning?.stringNumber !== stringNumber) {
    throw new RangeError(
      `String ${String(stringNumber)} is not present in this guitar definition.`,
    );
  }
  return tuning;
}

function assertMidi(midi: number): void {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new RangeError('MIDI pitch must be an integer from 0 through 127.');
  }
}

function assertPitchClass(pitchClass: PitchClass): void {
  if (!(PITCH_CLASSES as readonly unknown[]).includes(pitchClass)) {
    throw new RangeError('Pitch class must be one of the twelve canonical chromatic classes.');
  }
}

function createSearchBudget(maximumSearchNodes?: number): { readonly visit: () => void } {
  const limit = maximumSearchNodes ?? DEFAULT_GUITAR_ENUMERATION_NODE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Maximum search nodes must be a positive integer.');
  }
  let visitedNodes = 0;
  return {
    visit: () => {
      visitedNodes += 1;
      if (visitedNodes > limit) throw new GuitarEnumerationLimitError(limit, visitedNodes);
    },
  };
}

export function resolveGuitarLocation(
  definition: GuitarDefinition,
  location: GuitarLocation,
): ResolvedGuitarLocation {
  assertValidatedGuitarDefinition(definition);
  const tuning = tuningForString(definition, location.stringNumber);
  const maximumTabFret = definition.maxPhysicalFret - definition.capoFret;
  if (
    !Number.isInteger(location.tabFret) ||
    location.tabFret < 0 ||
    location.tabFret > maximumTabFret
  ) {
    throw new RangeError(
      `Tab fret must be an integer from 0 through ${String(maximumTabFret)} for this capo.`,
    );
  }
  const physicalFret = definition.capoFret + location.tabFret;
  const midi = tuning.openMidi + physicalFret;
  return Object.freeze({
    ...location,
    midi,
    physicalFret,
    pitchClass: pitchClassAt(midi),
    termination: location.tabFret > 0 ? 'finger' : definition.capoFret > 0 ? 'capo' : 'nut',
  });
}

export function enumerateGuitarLocations(
  definition: GuitarDefinition,
): readonly ResolvedGuitarLocation[] {
  assertValidatedGuitarDefinition(definition);
  const maximumTabFret = definition.maxPhysicalFret - definition.capoFret;
  return Object.freeze(
    definition.tuning.flatMap((string) =>
      Array.from({ length: maximumTabFret + 1 }, (_, tabFret) =>
        resolveGuitarLocation(definition, { stringNumber: string.stringNumber, tabFret }),
      ),
    ),
  );
}

export function locationsForMidi(
  definition: GuitarDefinition,
  midi: number,
): readonly ResolvedGuitarLocation[] {
  assertValidatedGuitarDefinition(definition);
  assertMidi(midi);
  return Object.freeze(
    definition.tuning.flatMap((string) => {
      const tabFret = midi - string.openMidi - definition.capoFret;
      return Number.isInteger(tabFret) &&
        tabFret >= 0 &&
        tabFret <= definition.maxPhysicalFret - definition.capoFret
        ? [resolveGuitarLocation(definition, { stringNumber: string.stringNumber, tabFret })]
        : [];
    }),
  );
}

export function locationsForPitchClass(
  definition: GuitarDefinition,
  pitchClass: PitchClass,
): readonly ResolvedGuitarLocation[] {
  assertValidatedGuitarDefinition(definition);
  assertPitchClass(pitchClass);
  return Object.freeze(
    enumerateGuitarLocations(definition).filter((location) => location.pitchClass === pitchClass),
  );
}

/** Distance from the nut to a physical fret wire under ideal 12-TET geometry. */
export function fretWireDistanceFromNutMm(
  definition: GuitarDefinition,
  physicalFret: number,
): number {
  assertValidatedGuitarDefinition(definition);
  if (
    !Number.isInteger(physicalFret) ||
    physicalFret < 0 ||
    physicalFret > definition.maxPhysicalFret
  ) {
    throw new RangeError('Physical fret is outside this guitar definition.');
  }
  return definition.scaleLengthMm * (1 - 2 ** (-physicalFret / 12));
}

export function vibratingLengthMm(definition: GuitarDefinition, physicalFret: number): number {
  return definition.scaleLengthMm - fretWireDistanceFromNutMm(definition, physicalFret);
}

/**
 * Explicit adapter for shared/session positions whose `fret` is a physical fret. It rejects pitch
 * mismatches instead of silently accepting a second pitch truth.
 */
export function locationFromPhysicalGuitarPosition(
  definition: GuitarDefinition,
  position: Pick<GuitarPosition, 'fret' | 'midi' | 'string'>,
): GuitarLocation {
  assertValidatedGuitarDefinition(definition);
  const location = {
    stringNumber: position.string,
    tabFret: position.fret - definition.capoFret,
  };
  const resolved = resolveGuitarLocation(definition, location);
  if (resolved.midi !== position.midi) {
    throw new RangeError(
      `Position MIDI ${String(position.midi)} does not match derived MIDI ${String(resolved.midi)}.`,
    );
  }
  return Object.freeze(location);
}

function validateVoicingConstraints(
  definition: GuitarDefinition,
  constraints: GuitarVoicingConstraints,
): ReadonlySet<number> {
  const allowed = new Set(
    constraints.allowedStringNumbers ?? definition.tuning.map((string) => string.stringNumber),
  );
  for (const stringNumber of allowed) tuningForString(definition, stringNumber);
  const values = [
    constraints.maxFretSpan,
    constraints.minimumPhysicalFret,
    constraints.maximumPhysicalFret,
  ];
  if (values.some((value) => value !== undefined && (!Number.isInteger(value) || value < 0))) {
    throw new RangeError('Voicing fret constraints must be non-negative integers.');
  }
  createSearchBudget(constraints.maximumSearchNodes);
  if (
    constraints.minimumPhysicalFret !== undefined &&
    constraints.maximumPhysicalFret !== undefined &&
    constraints.minimumPhysicalFret > constraints.maximumPhysicalFret
  ) {
    throw new RangeError('Minimum physical fret cannot exceed maximum physical fret.');
  }
  return allowed;
}

function voicingMatchesConstraints(
  locations: readonly ResolvedGuitarLocation[],
  constraints: GuitarVoicingConstraints,
): boolean {
  const fretted = locations.filter((location) => location.tabFret > 0);
  if (constraints.maxFretSpan !== undefined && fretted.length > 1) {
    const frets = fretted.map((location) => location.physicalFret);
    if (Math.max(...frets) - Math.min(...frets) > constraints.maxFretSpan) return false;
  }
  return locations.every(
    (location) =>
      (constraints.minimumPhysicalFret === undefined ||
        location.physicalFret >= constraints.minimumPhysicalFret) &&
      (constraints.maximumPhysicalFret === undefined ||
        location.physicalFret <= constraints.maximumPhysicalFret),
  );
}

function compareLocations(a: GuitarLocation, b: GuitarLocation): number {
  return a.stringNumber - b.stringNumber || a.tabFret - b.tabFret;
}

export function createGuitarVoicing(
  definition: GuitarDefinition,
  locations: readonly GuitarLocation[],
): GuitarVoicing {
  assertValidatedGuitarDefinition(definition);
  if (locations.length < 1)
    throw new RangeError('A guitar voicing must contain at least one note.');
  const resolved = locations.map((location) => resolveGuitarLocation(definition, location));
  if (new Set(resolved.map((location) => location.stringNumber)).size !== resolved.length) {
    throw new RangeError('A guitar voicing cannot use one string more than once.');
  }
  resolved.sort(compareLocations);
  return Object.freeze({
    locations: Object.freeze(resolved),
    midiPitches: Object.freeze(resolved.map((location) => location.midi)),
  });
}

/**
 * Enumerates a complete collision-free exact-MIDI set or throws GuitarEnumerationLimitError with no
 * partial result. The exported default node budget can be overridden explicitly in constraints.
 */
export function enumerateGuitarVoicings(
  definition: GuitarDefinition,
  midiPitches: readonly number[],
  constraints: GuitarVoicingConstraints = {},
): readonly GuitarVoicing[] {
  assertValidatedGuitarDefinition(definition);
  if (midiPitches.length < 1) throw new RangeError('At least one MIDI pitch is required.');
  midiPitches.forEach(assertMidi);
  const allowedStrings = validateVoicingConstraints(definition, constraints);
  if (midiPitches.length > definition.tuning.length) return Object.freeze([]);
  const counts = new Map<number, number>();
  midiPitches.forEach((midi) => counts.set(midi, (counts.get(midi) ?? 0) + 1));
  const groups = [...counts.entries()]
    .sort(([left], [right]) => left - right)
    .map(([midi, count]) => ({
      candidates: locationsForMidi(definition, midi).filter(
        (location) =>
          allowedStrings.has(location.stringNumber) &&
          (constraints.minimumPhysicalFret === undefined ||
            location.physicalFret >= constraints.minimumPhysicalFret) &&
          (constraints.maximumPhysicalFret === undefined ||
            location.physicalFret <= constraints.maximumPhysicalFret),
      ),
      count,
      midi,
    }));
  if (groups.some((group) => group.candidates.length < group.count)) return Object.freeze([]);

  const voicings = new Map<string, GuitarVoicing>();
  const budget = createSearchBudget(constraints.maximumSearchNodes);
  const visitGroup = (
    groupIndex: number,
    usedStrings: ReadonlySet<number>,
    chosen: readonly ResolvedGuitarLocation[],
  ): void => {
    budget.visit();
    if (groupIndex >= groups.length) {
      const sorted = [...chosen].sort(compareLocations);
      if (!voicingMatchesConstraints(sorted, constraints)) return;
      const key = sorted
        .map((location) => `${String(location.stringNumber)}:${String(location.tabFret)}`)
        .join('|');
      voicings.set(key, createGuitarVoicing(definition, sorted));
      return;
    }
    const group = groups[groupIndex];
    if (group === undefined) return;
    const chooseLocations = (
      candidateIndex: number,
      remaining: number,
      groupChosen: readonly ResolvedGuitarLocation[],
      groupStrings: ReadonlySet<number>,
    ): void => {
      budget.visit();
      if (remaining === 0) {
        visitGroup(groupIndex + 1, groupStrings, [...chosen, ...groupChosen]);
        return;
      }
      if (group.candidates.length - candidateIndex < remaining) return;
      for (let index = candidateIndex; index < group.candidates.length; index += 1) {
        const location = group.candidates[index];
        if (location === undefined || groupStrings.has(location.stringNumber)) continue;
        chooseLocations(
          index + 1,
          remaining - 1,
          [...groupChosen, location],
          new Set([...groupStrings, location.stringNumber]),
        );
      }
    };
    chooseLocations(0, group.count, [], usedStrings);
  };
  visitGroup(0, new Set(), []);
  return Object.freeze(
    [...voicings.values()].sort((a, b) => {
      for (let index = 0; index < a.locations.length; index += 1) {
        const left = a.locations[index];
        const right = b.locations[index];
        if (left === undefined || right === undefined) continue;
        const difference = compareLocations(left, right);
        if (difference !== 0) return difference;
      }
      return 0;
    }),
  );
}

function uniquePitchClasses(
  pitchClasses: readonly PitchClass[],
  name: string,
): readonly PitchClass[] {
  if (pitchClasses.length < 1) throw new RangeError(`${name} must not be empty.`);
  pitchClasses.forEach(assertPitchClass);
  const unique = [...new Set(pitchClasses)];
  if (unique.length !== pitchClasses.length) {
    throw new RangeError(`${name} must not contain duplicate pitch classes.`);
  }
  return unique;
}

function validatePitchClassSpec(
  definition: GuitarDefinition,
  spec: PitchClassVoicingSpec,
): { readonly allowed: ReadonlySet<PitchClass>; readonly required: ReadonlySet<PitchClass> } {
  const required = new Set(uniquePitchClasses(spec.requiredPitchClasses, 'Required pitch classes'));
  const allowed = new Set(
    uniquePitchClasses(
      spec.allowedPitchClasses ?? spec.requiredPitchClasses,
      'Allowed pitch classes',
    ),
  );
  if ([...required].some((pitchClass) => !allowed.has(pitchClass))) {
    throw new RangeError('Allowed pitch classes must include every required pitch class.');
  }
  if (
    !Number.isInteger(spec.minimumNotes) ||
    !Number.isInteger(spec.maximumNotes) ||
    spec.minimumNotes < required.size ||
    spec.maximumNotes < spec.minimumNotes ||
    spec.maximumNotes > definition.tuning.length
  ) {
    throw new RangeError(
      'Pitch-class voicing note bounds must cover all required classes and fit the guitar.',
    );
  }
  if (spec.bassPitchClass !== undefined && !allowed.has(spec.bassPitchClass)) {
    throw new RangeError('The requested bass pitch class must be allowed.');
  }
  return { allowed, required };
}

/**
 * Exhaustively enumerates pitch-class chord voicings under explicit coverage, doubling, bass, and
 * note-count semantics. This API never silently treats a pitch class as an absolute MIDI pitch.
 */
export function enumeratePitchClassVoicings(
  definition: GuitarDefinition,
  spec: PitchClassVoicingSpec,
  constraints: GuitarVoicingConstraints = {},
): readonly GuitarVoicing[] {
  assertValidatedGuitarDefinition(definition);
  const { allowed, required } = validatePitchClassSpec(definition, spec);
  const allowedStrings = validateVoicingConstraints(definition, constraints);
  const budget = createSearchBudget(constraints.maximumSearchNodes);
  const stringCandidates = definition.tuning.map((string) =>
    allowedStrings.has(string.stringNumber)
      ? Array.from({ length: definition.maxPhysicalFret - definition.capoFret + 1 }, (_, tabFret) =>
          resolveGuitarLocation(definition, { stringNumber: string.stringNumber, tabFret }),
        ).filter(
          (location) =>
            allowed.has(location.pitchClass) &&
            (constraints.minimumPhysicalFret === undefined ||
              location.physicalFret >= constraints.minimumPhysicalFret) &&
            (constraints.maximumPhysicalFret === undefined ||
              location.physicalFret <= constraints.maximumPhysicalFret),
        )
      : [],
  );
  const results: GuitarVoicing[] = [];
  const visit = (
    stringIndex: number,
    chosen: readonly ResolvedGuitarLocation[],
    covered: ReadonlySet<PitchClass>,
  ): void => {
    budget.visit();
    if (chosen.length > spec.maximumNotes) return;
    const remainingStrings = definition.tuning.length - stringIndex;
    if (chosen.length + remainingStrings < spec.minimumNotes) return;
    const missingRequired = [...required].filter((pitchClass) => !covered.has(pitchClass)).length;
    if (missingRequired > remainingStrings) return;
    if (stringIndex >= definition.tuning.length) {
      if (
        chosen.length < spec.minimumNotes ||
        ![...required].every((pitchClass) => covered.has(pitchClass))
      ) {
        return;
      }
      if (!voicingMatchesConstraints(chosen, constraints)) return;
      const voicing = createGuitarVoicing(definition, chosen);
      if (
        spec.bassPitchClass !== undefined &&
        voicing.locations.reduce((lowest, location) =>
          location.midi < lowest.midi ? location : lowest,
        ).pitchClass !== spec.bassPitchClass
      ) {
        return;
      }
      results.push(voicing);
      return;
    }

    visit(stringIndex + 1, chosen, covered);
    for (const location of stringCandidates[stringIndex] ?? []) {
      visit(stringIndex + 1, [...chosen, location], new Set([...covered, location.pitchClass]));
    }
  };
  visit(0, [], new Set());
  return Object.freeze(results);
}

function assignmentIsLegal(
  voicing: GuitarVoicing,
  assignments: readonly GuitarFingerAssignment[],
): boolean {
  for (const finger of [1, 2, 3, 4] as const) {
    const uses = assignments.filter((assignment) => assignment.finger === finger);
    if (uses.length < 2) continue;
    const physicalFrets = new Set(
      uses.map(
        (assignment) =>
          voicing.locations.find((location) => location.stringNumber === assignment.stringNumber)
            ?.physicalFret,
      ),
    );
    if (physicalFrets.size !== 1) return false;
    const minimumString = Math.min(...uses.map((use) => use.stringNumber));
    const maximumString = Math.max(...uses.map((use) => use.stringNumber));
    const barrePhysicalFret = [...physicalFrets][0];
    if (barrePhysicalFret === undefined) return false;
    if (
      voicing.locations.some((location) => {
        if (location.stringNumber <= minimumString || location.stringNumber >= maximumString) {
          return false;
        }
        if (location.physicalFret < barrePhysicalFret) return true;
        const intermediateAssignment = assignments.find(
          (assignment) => assignment.stringNumber === location.stringNumber,
        );
        return (
          location.physicalFret === barrePhysicalFret && intermediateAssignment?.finger !== finger
        );
      })
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns complete deterministic legal four-finger/barre suggestions, or an explicit limit error;
 * fingering feasibility never removes the source voicing.
 */
export function enumerateGuitarFingerings(
  definition: GuitarDefinition,
  voicing: GuitarVoicing,
  constraints: GuitarFingeringConstraints = {},
): readonly GuitarFingering[] {
  assertValidatedGuitarDefinition(definition);
  if (voicing.locations.length < 1)
    throw new RangeError('A voicing must contain at least one note.');
  const normalizedVoicing = createGuitarVoicing(definition, voicing.locations);
  const fretted = normalizedVoicing.locations.filter((location) => location.tabFret > 0);
  const budget = createSearchBudget(constraints.maximumSearchNodes);
  if (fretted.length === 0) {
    return Object.freeze([
      Object.freeze({ assignments: Object.freeze([]), voicing: normalizedVoicing }),
    ]);
  }
  const results: GuitarFingering[] = [];
  const visit = (index: number, assignments: readonly GuitarFingerAssignment[]): void => {
    budget.visit();
    if (index >= fretted.length) {
      if (!assignmentIsLegal(normalizedVoicing, assignments)) return;
      results.push(
        Object.freeze({
          assignments: Object.freeze([...assignments]),
          voicing: normalizedVoicing,
        }),
      );
      return;
    }
    const location = fretted[index];
    if (location === undefined) return;
    for (const finger of [1, 2, 3, 4] as const) {
      visit(index + 1, [
        ...assignments,
        Object.freeze({ finger, stringNumber: location.stringNumber, tabFret: location.tabFret }),
      ]);
    }
  };
  visit(0, []);
  return Object.freeze(results);
}

function validateTransitionPolicy(policy: GuitarTransitionPolicy): void {
  for (const name of [
    'fingerPlacementCost',
    'fingerReleaseCost',
    'fretDistanceCost',
    'stringDistanceCost',
  ] as const) {
    const value: unknown = policy[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`Transition policy ${name} must be a finite non-negative value.`);
    }
  }
}

type MutableTransitionCost = Omit<GuitarTransitionCost, 'total'>;

function addTransitionCosts(
  left: MutableTransitionCost,
  right: MutableTransitionCost,
): MutableTransitionCost {
  return {
    movement: left.movement + right.movement,
    placements: left.placements + right.placements,
    releases: left.releases + right.releases,
  };
}

function transitionTotal(cost: MutableTransitionCost): number {
  return cost.movement + cost.placements + cost.releases;
}

function transitionCostIsBetter(
  candidate: MutableTransitionCost,
  best: MutableTransitionCost,
): boolean {
  const candidateValues = [
    transitionTotal(candidate),
    candidate.movement,
    candidate.placements,
    candidate.releases,
  ];
  const bestValues = [transitionTotal(best), best.movement, best.placements, best.releases];
  for (let index = 0; index < candidateValues.length; index += 1) {
    const difference = (candidateValues[index] ?? 0) - (bestValues[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}

/**
 * Minimum-cost reassignment of fretting fingers. Open/capo strings require no fretting finger.
 * Handedness intentionally does not participate: it mirrors presentation, not physical effort.
 */
export function guitarTransitionCost(
  definition: GuitarDefinition,
  from: Pick<GuitarVoicing, 'locations'>,
  to: Pick<GuitarVoicing, 'locations'>,
  policy: GuitarTransitionPolicy = DEFAULT_GUITAR_TRANSITION_POLICY,
): GuitarTransitionCost {
  assertValidatedGuitarDefinition(definition);
  validateTransitionPolicy(policy);
  const fromFretted = from.locations
    .map((location) => resolveGuitarLocation(definition, location))
    .filter((location) => location.tabFret > 0)
    .sort(compareLocations);
  const toFretted = to.locations
    .map((location) => resolveGuitarLocation(definition, location))
    .filter((location) => location.tabFret > 0)
    .sort(compareLocations);
  if (
    new Set(from.locations.map((location) => location.stringNumber)).size !==
      from.locations.length ||
    new Set(to.locations.map((location) => location.stringNumber)).size !== to.locations.length
  ) {
    throw new RangeError('A transition state cannot use one string more than once.');
  }
  const memo = new Map<string, MutableTransitionCost>();
  const solve = (fromIndex: number, usedToMask: number): MutableTransitionCost => {
    const key = `${String(fromIndex)}:${String(usedToMask)}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (fromIndex >= fromFretted.length) {
      const remaining = toFretted.reduce(
        (count, _, index) => count + ((usedToMask & (1 << index)) === 0 ? 1 : 0),
        0,
      );
      const result = {
        movement: 0,
        placements: remaining * policy.fingerPlacementCost,
        releases: 0,
      };
      memo.set(key, result);
      return result;
    }

    const unusedTargetCount = toFretted.reduce(
      (count, _, index) => count + ((usedToMask & (1 << index)) === 0 ? 1 : 0),
      0,
    );
    const remainingSourceCount = fromFretted.length - fromIndex;
    let best: MutableTransitionCost | undefined;
    if (remainingSourceCount > unusedTargetCount) {
      best = addTransitionCosts(
        { movement: 0, placements: 0, releases: policy.fingerReleaseCost },
        solve(fromIndex + 1, usedToMask),
      );
    }
    const source = fromFretted[fromIndex];
    if (source === undefined) {
      return best ?? { movement: 0, placements: 0, releases: 0 };
    }
    toFretted.forEach((target, toIndex) => {
      if ((usedToMask & (1 << toIndex)) !== 0) return;
      const movement =
        Math.abs(source.physicalFret - target.physicalFret) * policy.fretDistanceCost +
        Math.abs(source.stringNumber - target.stringNumber) * policy.stringDistanceCost;
      const candidate = addTransitionCosts(
        { movement, placements: 0, releases: 0 },
        solve(fromIndex + 1, usedToMask | (1 << toIndex)),
      );
      if (best === undefined || transitionCostIsBetter(candidate, best)) best = candidate;
    });
    const result = best ?? { movement: 0, placements: 0, releases: 0 };
    memo.set(key, result);
    return result;
  };

  const result = solve(0, 0);
  const total = transitionTotal(result);
  if (!Number.isFinite(total)) {
    throw new RangeError('Transition policy produces a non-finite total cost.');
  }
  return Object.freeze({ ...result, total });
}
