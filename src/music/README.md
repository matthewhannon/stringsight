# Music subsystem

Owns pitch, interval, chord, scale, key, tuning, and virtual fretboard representations. Logic in this
subsystem remains deterministic and exhaustively testable.

The initial Item 8 domain distinguishes two concepts deliberately:

- `PitchClass` from `shared` is the detector and transport identity for one of the twelve chromatic
  classes. Its sharp-only strings do not assert notation.
- `SpelledPitchClass` is a musical letter plus an accidental. It can represent enharmonically
  equivalent names such as C-sharp and D-flat without changing the underlying chromatic identity.

`pitch.ts` provides conversion, transposition, preference-based spelling, and enharmonic
enumeration. `interval.ts`, `chord.ts`, `scale.ts`, and `key.ts` build immutable domain values on
that foundation. Chord definitions match the bounded detector vocabulary; scale definitions match
the first-release requirements. Conventional key signatures cover seven flats through seven
sharps.

`chord-interpretation.ts` ranks the complete chord vocabulary against weighted pitch-class and bass
evidence. Each result contains structured matched, missing, extra, root, and bass evidence plus
copied source event IDs. It supports omissions and inversions, preserves exact score ties, and uses
either key context or an explicit flat/sharp preference for notation. It never rewrites its input
evidence or the source detector events.

`scale-key-interpretation.ts` aggregates confidence- and duration-weighted evidence over event
windows and ranks all first-release scales and conventional major/minor keys. Tonic evidence helps
separate relative collections; genuinely indistinguishable collections remain tied. Optional prior
results add small, explicit continuity contributions for identical, relative, or adjacent keys and
equivalent scales.

`audio-event-evidence.ts` adapts the existing shared note, note-set, and chord event contracts into
timed theory evidence. Finalized and corrected events are included by default, provisional events
are opt-in, and open events require an explicit window end. Candidate uncertainty is retained and
source objects are never modified.

Import public music-domain APIs through `src/music/index.ts`. Future interpretation results must
reference their source detector events and remain separate from raw audio candidates.
