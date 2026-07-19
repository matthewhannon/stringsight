# StringSight project status

**Updated:** July 18, 2026  
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
- A rack chord module with pitch-class meters, alternatives, diagnostics, and lifecycle timeline
- A rolling 24-event timeline and private evaluation-fixture export with prefilled note or chord
  labels
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

Item 7 polyphonic note and chord recognition is complete. The official Basic Pitch model runs only
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

The next milestone is Item 8: a deterministic music-theory interpretation engine. It will represent
pitch classes, intervals, chord qualities, scales, keys, and enharmonic spelling; infer ranked chord,
scale, and key interpretations over event windows; preserve raw detector output; and add exhaustive
table-driven rule tests. Item 9 can then build the complete audio-only session, correction,
persistence, and export workflow on those stable interpretations.

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
147 unit/integration tests with 92.73% statement and 81.13% branch coverage, plus 6 passing
end-to-end browser workflows. The browser suite loads the real pinned model, finalizes the public
C-major WAV, and exports a reviewed private chord fixture. Local personal-guitar replays remain
ignored and explicitly excluded from acceptance reporting until independently reviewed.

See [BUILD_CHECKLIST.md](../BUILD_CHECKLIST.md) for the complete implementation sequence and
[ADR 0005](decisions/0005-mit-open-source-and-license-policy.md) for the open-source policy.
