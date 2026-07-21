# StringSight project status

**Updated:** July 21, 2026

**Project:** OpenAI Build Week

## Current product

StringSight is a browser-based, local-first guitar pitch and chord monitor. The supported product
experience is a realistic audio rack that opens directly into a usable Audio Input module.

The default rack is intentionally minimal. It contains:

- A system-default or named microphone/audio-interface selector
- An Input switch that requests microphone access and starts local monitoring
- A live waveform, calibrated level meter, signal status, and peak warning
- Compact single-note and chord readouts for immediate feedback
- Local mode, active sample rate, analyzer version, and an explicit local-audio privacy indicator

No account, server upload, or camera is required. Raw microphone audio remains in the browser.

## Optional analysis modules

The user can add two focused modules independently or together.

### Pitch analysis

- Detected note and cents offset
- Detected and target frequencies
- Flat/sharp tuning meter
- On-demand analyzer diagnostics and recent-note history

### Chord analysis

- Leading live chord candidate and match strength
- Default 12-note pitch-class energy spread
- Accurate analysis profile without a user-facing mode switch
- On-demand quality, bass, ranked alternatives, worker diagnostics, and bounded chord timeline

When both modules are installed, the rack is full and the add control disappears. Edit mode can
reorder or remove either module, and the selected layout is stored locally.

## Analysis implementation

The working audio stack includes:

- Streaming monophonic onset and pitch analysis in a dedicated worker
- Streaming harmonic-suppressed chroma evidence and ranked provisional chord candidates
- Typed timing, lifecycle, confidence, provenance, and worker-transport contracts
- A pinned Basic Pitch model path with WASM-first execution and CPU fallback for finalized analysis
- Procedural development and held-out fixtures plus private-corpus evaluation tooling
- Reusable rack UI components and design tokens

The current hackathon interface is monitoring-focused. Recording/replay, session review, evaluation,
and export implementations remain available for development and automated testing but are not
exposed as product modules.

## Not in the current MVP

- Fretboard or hand-position vision
- Audio/vision fusion
- Remote analysis or cloud media storage
- Tablature generation or likely string/fret interpretation
- A user-facing session editor or evaluation bench

## Supported workflow

1. Run the application and open the rack.
2. Select an audio source and press **Input**.
3. Confirm the input level and compact note/chord readouts respond while playing.
4. Add Pitch analysis, Chord analysis, or both for deeper monitoring.
5. Open Analysis details only when diagnostics, histories, or alternatives are useful.

## Product and engineering constraints

- Raw media remains local by default.
- Private evaluation recordings are excluded from the public repository.
- Predictions preserve uncertainty and provenance rather than presenting guesses as facts.
- Worker and typed-contract boundaries keep audio processing independent from React rendering.
- Dependencies, datasets, models, and assets require recorded provenance and redistribution terms.

## Verification baseline

The release is checked with formatting, linting, TypeScript, dependency-license validation, corpus
validation, deterministic evaluation self-tests, unit/integration coverage, a production build, and
Playwright tests for the supported browser workflows.

See [BUILD_CHECKLIST.md](../BUILD_CHECKLIST.md) for the implementation history and
[ADR 0005](decisions/0005-mit-open-source-and-license-policy.md) for the open-source policy.
