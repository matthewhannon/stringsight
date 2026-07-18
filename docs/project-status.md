# StringSight project status

**Updated:** July 18, 2026  
**Project:** OpenAI Build Week

## Current product

StringSight opens directly into a realistic rack workspace. The rack is the product shell during
core development; a marketing site and onboarding experience are intentionally deferred.

The implemented vertical slice includes:

- Device-neutral browser audio-input selection
- Local PCM capture, input diagnostics, calibrated metering, recording, and replay
- Streaming monophonic onset and pitch detection
- Ranked note candidates with confidence, timing, lifecycle, and provenance
- A rolling 24-event timeline and private evaluation-fixture export with prefilled note labels
- Procedural development and held-out fixtures with deterministic evaluation
- A typed, reusable rack component library for future product modules

The real-guitar verification process has produced 18 correct top-ranked pitches across 18 reviewed
events with no duplicate or false events in the tested recordings. Those private recordings remain
outside this repository; only summarized verification results are public.

## Next implementation milestone

The next milestone is polyphonic note and chord recognition. It requires a documented evaluation of
browser-compatible approaches before model or runtime integration. Completion requires ranked,
time-aligned note sets and chord candidates, provisional and finalized states, tests, corpus
evaluation, and measured performance.

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

The latest local verification passed formatting, linting, type checking, dependency-license checks,
corpus validation, evaluation self-tests, coverage, and the production build. The suite contains 83
unit/integration tests and 3 end-to-end browser workflows.

See [BUILD_CHECKLIST.md](../BUILD_CHECKLIST.md) for the complete implementation sequence and
[ADR 0005](decisions/0005-mit-open-source-and-license-policy.md) for the open-source policy.
