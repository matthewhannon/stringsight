# StringSight project status

**Updated:** July 19, 2026
**Project:** OpenAI Build Week

## Current product

StringSight opens directly into a realistic rack workspace. The rack is the product shell during
core development; a marketing site and onboarding experience are intentionally deferred.

The implemented vertical slice includes:

- Device-neutral browser audio-input selection
- Local PCM capture, input diagnostics, calibrated metering, recording, and replay
- Validated WAV import through the same replay/analyzer path used by live captures
- Streaming monophonic onset and pitch detection
- Ranked note candidates with confidence, timing, lifecycle, and provenance
- A dedicated polyphonic worker with tuned harmonic-suppressed chroma, NNLS-style note evidence,
  multiscale change detection, and ranked provisional chord candidates
- A pinned Basic Pitch model with WASM-first inference, CPU fallback, overlap trimming, finalized
  note sets, upstream-style post-processing, and authoritative provisional-event reconciliation
- Accurate and Responsive chord modes with distinct evidence windows, live hysteresis,
  weak-extension and extension-register reliability gating, and acoustic/model evidence fusion for
  finalized chord segments
- Exact per-hop acoustic timing across ordinary 48 kHz callbacks, robust attack evidence, and an
  explicit online chord state machine that separates ring-out, re-strum, attacked change, and
  longer-confirmed attack-free change behavior
- A promoted post-Stop boundary-region decoder that makes one pooled label decision per supported
  acoustic region, can recover a sustained missed live boundary, and prevents model note edges,
  partial attacks, or decay tails from becoming chord fragments
- A rack chord module with pitch-class meters, alternatives, diagnostics, and lifecycle timeline
- Bounded, non-scrolling six-card note and chord timelines with newest results first, plus private
  evaluation-fixture export with prefilled note or chord labels
- Procedural development and held-out fixtures with deterministic evaluation
- A typed, reusable rack component library for future product modules
- An ignored private-corpus manifest and batch evaluator for reusable real-guitar recordings

The real-guitar verification process has produced 18 correct top-ranked pitches across 18 reviewed
events with no duplicate or false events in the tested recordings. Those private recordings remain
outside this repository; only summarized verification results are public.

Those three reviewed takes now form an ignored local regression corpus. Its batch report reproduces
18/18 top-1 and top-3 notes, 18/18 onsets, no false onsets, and 32 ms median/p95 onset error. The
public verification suite remains independent of these private files.

## Next implementation milestone

Item 7's isolated-chord recognition matrix remains accepted, but its finalization slice was
reopened on July 19 after a reviewed continuous G-to-D take exposed premature finalized lifecycle
labels, transition fragments retained after Stop, and match scores presented as probabilities. The
official Basic Pitch model runs only
inside the dedicated worker, while a purpose-built deterministic frontend provides fast provisional
chord evidence and stable acoustic segmentation. The public real-browser matrix reaches 100% note
F1, onset F1, pitch-class-set recall, and finalized chord accuracy on its development and held-out
fixtures. Model/runtime sizes, load and inference timing, real-time factors, and the browser-exposed
JavaScript heap sample are recorded with the memory sample's scope stated explicitly.

The original reviewed private 19-chord regression remains at 89.5% top-1 and 94.7% top-3 in both
profiles. A second reviewed ten-chord take now supplies the missing C/E and G/B inversion, four
power-chord, and independent Dm/Dm7 coverage. Both profiles identify both inversions and their bass
notes correctly, distinguish Dm from Dm7 at top-1, and place all four power chords in the top three.
Accurate and Responsive process that 50.3-second take at 0.619x and 0.206x real time. Bare fifths
remain intentionally uncertain among power, suspended, and major interpretations rather than being
forced to a fixture-specific label.

Item 8, the deterministic music-theory interpretation engine, is complete. Its pure
domain layer represents chromatic pitch identity separately from contextual note spelling, simple
intervals, every currently supported chord quality and inversion, the five first-release scale
families, and conventional major and minor key signatures. Table-driven tests cover transposition,
enharmonic equivalence, interval quality, chord and scale construction, inversions, and contextual
key spelling.

The chord interpretation layer now generates ranked results from detected pitch-class evidence with
explicit matched, missing, extra, root, and bass contributions. It preserves exact harmonic
ambiguities, supports omitted tones and inversions, applies key-aware enharmonic spelling, and
copies source event IDs into separately owned results without mutating detector input.

Scale and key interpreters aggregate confidence- and duration-weighted evidence over event windows.
They retain relative-major/minor and relative-pentatonic ambiguity when tonic evidence is absent,
and apply only bounded, explicit continuity contributions from prior results. A side-effect-free
adapter converts the existing shared note, note-set, and chord event contracts into theory evidence,
keeps ranked detector uncertainty, excludes provisional events by default, and leaves every source
event unchanged.

Item 9, the complete audio-only session product slice, is now in progress under
`docs/plans/09-audio-only-product-slice.md`. Capture supports start, pause, resume, stop, and replay.
Pausing suspends the active audio context so it produces no PCM and does not advance the audio
timeline; stopping while paused resumes only long enough to flush and finalize the buffered take.

The audio session controller now aggregates capture, monophonic, and polyphonic snapshots without
coupling detector logic to React. Analyzer workers emit explicit run-completion messages, allowing
the controller to keep the last completed event set visible while replay analysis is staged and
replace it atomically only after both analyzers settle. Live recording events remain visible, and
validated session status follows recording, pause, processing, completion, and recoverable failure.

The current corrective slice makes closed live chord spans remain provisional, runs post-Stop
duration-aware sequence decoding before final ID reconciliation, and presents uncalibrated chord
values as match strength. Final fusion no longer uses a fixed acoustic/model split: acoustic
change-supported spans are reranked by finalized pitch-class completeness and defining-tone
compatibility, doubled octaves collapse to one pitch-class contribution, and weak dyads remain
ambiguous. Capture drops now propagate discontinuities, model gaps preserve elapsed time, and Basic
Pitch output is offset onto the source timebase.

The full browser production path now produces 18 clean events and 18/19 (94.7%) top-1/top-3 on the
reviewed 19-chord recording. It removes three decay/startup fragments that appeared in the live
acoustic sequence while preserving every supported label. The remaining Am7 attack is detected,
but acoustic evidence remains Em7/Gsus/Cmaj-like and Basic Pitch reports no A, so a forced split is
not justified. The promoted decoder partitions retained hops by confirmed acoustic boundaries,
performs conservative missed-boundary inference only within those partitions, and uses pooled hop
evidence only when a live span actually needs splitting. Its preserved-sequence output matches the
former production labels exactly with no extra event.

Later milestones add optional fretboard vision, guitar geometry, audio/vision fusion, and musical
interpretation. Audio must remain useful without a camera.

## Product and engineering constraints

- Raw media remains local by default.
- Private evaluation recordings are not part of the open-source distribution.
- Predictions preserve uncertainty and provenance instead of presenting guesses as facts.
- Audio processing remains isolated from interface rendering through worker and typed-contract
  boundaries.
- New dependencies, datasets, models, and assets require recorded provenance and acceptable
  redistribution terms.

## Verification baseline

The current verification passes formatting, linting, type checking, dependency-license checks,
corpus validation, evaluation self-tests, coverage, and the production build. The suite contains
254 unit/integration tests across 27 files with 93.53% statement and 82.52% branch coverage. The
public production browser matrix remains 100% chord top-1/top-3 on its two fixtures, and the private
browser replay above exercises the real model/fusion path. Item 7's reopened finalization checkbox
is closed. A fresh user G-to-D/G-D-E transition take remains the immediate product-level
confirmation. Local
personal-guitar media remains ignored and outside public acceptance data.

See [BUILD_CHECKLIST.md](../BUILD_CHECKLIST.md) for the complete implementation sequence and
[ADR 0005](decisions/0005-mit-open-source-and-license-policy.md) for the open-source policy.
