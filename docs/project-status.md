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

Polyphonic note and chord recognition is in progress. The official Basic Pitch model runs only
inside the dedicated worker, with exact asset provenance, cached warmup, overlapping-window
inference, and finalized MIDI note sets. A purpose-built chord frontend now adds analysis-only band
limiting, attack/sustain separation, tuning-aware log-frequency whitening, harmonic-note
estimation, separate bass/treble evidence, and short/long time scales. Basic Pitch note sets are
fused inside the acoustic spans rather than controlling segmentation. The licensed C-major fixture
completes on WASM as one finalized C event.

A permitted private recording now provides a focused 19-chord regression sequence with
user-confirmed chord order and deterministically proposed, not manually auditioned, boundaries.
Activity attack/release hysteresis, decay-time switch suppression, continuous root/bass support,
template coverage, and evidence-aware seventh selection reduced Accurate from 55 to 20 events and
Responsive from 102 to 25. Analyzer 0.3.0 also discounts a seventh extension when its note evidence
is isolated in a much higher register than the chord core. Both profiles now produce only two
silence-only events and reach 89.5% top-1 and 94.7% top-3. Real-time factors are 0.632 and 0.208
respectively on the current machine.

The remaining Item 7 work is to improve or explicitly bound the Dm/Am7 confusions, add reviewed
power-chord and inversion coverage, broaden the two-fixture finalized-note matrix, and obtain a
complete worker/WASM peak-memory measurement if the supported browser exposes one. The private
sequence is a development regression input rather than universal or held-out accuracy evidence.

A separate real-browser finalized-model evaluation now covers the public C-major development and
A-minor held-out chord fixtures. Combined finalized note F1, onset F1, pitch-class-set recall, and
chord accuracy are 100%; exact MIDI-set accuracy is 50% because the held-out doubled A decays before
the longest note-set segment. Finalized chord top-1 improves from 50% provisional to 100%. WASM model
inference is at most 0.060x real time in this two-fixture run. These fixtures validate the harness and
budgets but are too small to replace reviewed power-chord and inversion coverage.

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
