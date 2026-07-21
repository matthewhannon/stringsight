# ADR 0008: Canonical guitar coordinate and voicing model

- **Status:** Accepted
- **Date:** 2026-07-20
- **Architecture:** `../plans/10-practice-system-architecture.md#5-canonical-guitar-model`

## Context

StringSight needs one renderer-independent guitar model before practice documents, notation,
inference, or fusion can exchange positions. Existing session tuning arrays are low-to-high, while
conventional tablature numbers strings from the treble string. Existing inferred `GuitarPosition`
values also contain both a fret and a MIDI pitch. Reusing either representation directly would make
array order, capo meaning, and pitch authority ambiguous.

Exact detector notes and chord interpretations need different enumeration semantics. An exact MIDI
multiset fixes pitch register and multiplicity. A pitch-class chord requires explicit coverage,
doubling, note-count, and bass rules. Fingering is also distinct from voicing: a barre can fret more
than four sounding strings, and a valid voicing can have several suggested fingerings.

## Decision

### Coordinates and pitch authority

The canonical editable coordinate is `{ stringNumber, tabFret }`. String numbers are stable physical
identities in contiguous treble-to-bass order; string 1 is the conventional treble full-length
string. Alternate, reentrant, unison, and crossed tunings never renumber or pitch-sort strings.

`tabFret` is relative to one full-width capo. `maxPhysicalFret` is the highest fret on the instrument,
so the valid tab range is `0..maxPhysicalFret-capoFret`. The model derives all other values:

```text
physicalFret = capoFret + tabFret
soundingMidi = openStringMidi + physicalFret
pitchClass = soundingMidi modulo 12
```

Physical fret, MIDI, and pitch class are returned resolved values, not parallel writable truths.
The legacy low-to-high tuning adapter reverses the declared order explicitly. The legacy physical
fret/MIDI position adapter subtracts the capo and rejects a MIDI mismatch.

Handedness only mirrors presentation. It cannot change pitch lookup, voicing availability, or
transition cost. Scale length is a positive finite millimetre value used for ideal 12-TET geometry;
it does not change equal-tempered MIDI mapping.

The current bounded model supports 1–12 independently fretted strings, physical frets 0–36, MIDI
0–127, and twelve-tone equal temperament. A guitar definition is rejected if its highest fret would
exceed MIDI 127. Equal open pitches on different strings are valid; duplicate or noncontiguous
string identities are not. Paired-course semantics, partial capos, microtonal temperaments, bends,
harmonics, and compensation are outside this coordinate version and require explicit future models.

### Enumeration and fingering

Exact-MIDI enumeration treats its input as a multiset. It preserves register and duplicate
occurrences, assigns at most one location per string, applies explicit physical/string/span
constraints, and returns the complete deterministic set. Enumeration has an exported 250,000-node
default budget which callers may replace with an explicit positive integer. Crossing the budget
throws `GuitarEnumerationLimitError` with the limit and deterministic visited-node count; the API
discards all partial candidates. Impossible bounded queries return an empty set. Broad searches
should use tight musical constraints and run outside latency-sensitive main-thread paths.

Pitch-class enumeration is a separate API. Its specification explicitly declares required and
allowed pitch classes, minimum and maximum sounding-note counts, and an optional bass pitch class.
The bass is the lowest sounding MIDI pitch, never an assumed string number. This makes omissions
and doublings caller policy instead of inference-engine guesswork.

Open or capo-relative fret-zero notes do not enlarge fretting-hand span. Results use canonical
string-number order and contain no mute sentinel; absence means a muted string. Suggested
fingerings assign fingers 1–4 only to fretted notes. Reusing one finger requires one physical fret
and represents a barre; higher-fretted intermediate strings may lie above it, while an intermediate
sounding open string invalidates it. Fingering suggestions do not remove an otherwise valid
voicing.

### Transition policy

`guitarTransitionCost` is a deterministic, renderer-independent v1 heuristic over two voicings. It
computes the minimum reassignment cost for their fretting contacts. A matched contact costs absolute
physical-fret distance times `fretDistanceCost` plus string distance times `stringDistanceCost`.
The transition first matches the maximum possible number of contacts, then minimizes weighted cost,
so a release/re-press cannot erase a long physical movement. Only surplus outgoing and incoming
contacts use explicit release and placement costs. Equal totals use a deterministic component
tie-break. Open/capo notes need no fretting contact. The exported policy makes every term inspectable.

This scalar is a physical-effort lower bound for candidate-state sequencing, not a probability,
medical claim, or assertion of the performer's actual fingering. It is intentionally directional
when placement and release weights differ. Symmetry and the triangle inequality are not promised.
Identity is exactly zero, and handedness is invariant. A future sequence model may transition
between explicit fingering states without changing canonical coordinates or voicing enumeration.

## Consequences

- Practice documents, notation adapters, audio inference, vision, and fusion can share one stable
  coordinate without importing renderer or UI concepts.
- Capo, alternate tuning, exact pitch, chord-class, voicing, and fingering semantics remain explicit.
- Returned enumeration is complete; resource limits fail explicitly with no partial result.
  Bounded suggestion/ranking APIs must use a different name and expose any truncation if added.
- Existing session and fusion contracts require named adapters and pitch-consistency validation.
- Ideal fret geometry and the transition heuristic can be replaced or calibrated without changing
  stored string/tab coordinates.
