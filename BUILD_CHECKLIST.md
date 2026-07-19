# StringSight Build Checklist

This document is the bird's-eye implementation guide for StringSight. It tracks the major outcomes required to build a reliable, local-first guitar transcription application that combines microphone audio with webcam-derived fretboard and hand-position evidence.

It is intentionally higher level than a task tracker. Each numbered checklist item represents a complete engineering outcome. Complex items should receive one or more focused plans in `docs/plans/` before implementation; bounded items can be implemented directly. Check an item only when its completion criteria are satisfied.

## How to use this checklist

- Work roughly from top to bottom, respecting the dependencies listed for each item.
- Keep only one major implementation item in active development unless work is genuinely independent.
- Create a detailed plan when a change crosses subsystem boundaries, introduces an unfamiliar algorithm, changes a public data contract, or is likely to require multiple implementation sessions.
- Include tests, diagnostics, documentation, and performance validation in the item's implementation, not as deferred cleanup.
- Record significant design decisions in `docs/decisions/` as short architecture decision records (ADRs).
- Preserve uncertainty. Detection stages should return ranked candidates and confidence values rather than hiding ambiguity behind a single answer.
- Keep audio and video processing local by default. Any data sent to a remote service must be deliberate, minimized, visible to the user, and documented.

## Product definition and engineering standards

### Product statement

StringSight is a local-first web application that listens to a guitarist and watches the fretboard to infer the notes, chords, scales, and likely fingerboard positions being played. The audio pipeline produces time-aligned musical candidates. The vision pipeline estimates fretboard geometry and hand position. A guitar-aware fusion engine combines both sources into more accurate interpretations, probable tablature, and explicit confidence estimates.

### Initial supported environment

- Desktop Chrome and Edge
- Six-string guitar in standard tuning (`E2 A2 D3 G3 B3 E4`)
- One foreground instrument
- Direct microphone or a reasonably quiet room
- A webcam view containing a useful portion of the fretboard
- Single notes, deliberate phrases, and clearly articulated chords

Support for other browsers, tunings, instruments, dense mixes, and mobile devices should be designed for but is not required for the first complete release.

### Definition of done for every checklist item

An item is complete only when:

- The intended behavior is implemented.
- Automated tests cover its deterministic logic and important failure cases.
- Representative fixtures or manual verification steps exist for hardware-dependent behavior.
- Errors and low-confidence states are visible and recoverable.
- Performance is measured where latency, memory, frame rate, or model size matters.
- Public interfaces and important decisions are documented.
- The implementation is understandable and maintainable without relying on this conversation.

## Phase 1: Foundation

### 1. Finalize the product requirements and scope

**Planning:** Create `docs/plans/01-product-requirements.md`.

- [x] Define the primary user journeys: live recognition, recorded-session review, and export.
- [x] Define the first-release distinction between measured facts, model predictions, and musical interpretations.
- [x] Define supported note, chord, scale, and tablature outputs.
- [x] Define expected behavior when no camera is present or vision confidence is low.
- [x] Define explicit non-goals for the first release.
- [x] Establish target latency, accuracy, frame-rate, and startup-time budgets.
- [x] Establish privacy, browser-support, and accessibility requirements.

**Done when:** The requirements are testable, internally consistent, and sufficient to make implementation tradeoffs without redefining the product during each subsystem build.

### 2. Establish the repository and developer workflow

**Planning:** Direct implementation unless repository structure becomes multi-application.

- [x] Scaffold a React, TypeScript, and Vite application.
- [x] Select and lock the package manager and supported Node.js version.
- [x] Configure strict TypeScript, ESLint, formatting, and import boundaries.
- [x] Configure Vitest and Playwright.
- [x] Add development, test, build, lint, type-check, and preview commands.
- [x] Establish directories for application code, workers, shared packages, fixtures, documentation, and model assets.
- [x] Add continuous integration for linting, type-checking, tests, and production builds.
- [x] Add a license and dependency-attribution process.

**Done when:** A clean checkout can be installed, tested, and built from documented commands, and CI enforces the same checks.

### 3. Define architecture and typed subsystem contracts

**Planning:** Create `docs/plans/03-architecture-and-contracts.md` and ADRs for consequential choices.

- [x] Define boundaries for capture, audio analysis, vision analysis, music theory, fusion, persistence, UI, and remote analysis.
- [x] Define a shared monotonic timebase for audio, video, and UI events.
- [x] Define versioned TypeScript schemas for note candidates, chord candidates, visual position estimates, fused events, and sessions.
- [x] Include confidence, provenance, timing, and diagnostic metadata in every prediction contract.
- [x] Define worker messaging and cancellation contracts.
- [x] Define error categories and recoverability semantics.
- [x] Document which work runs on the audio thread, workers, main thread, and server.

**Done when:** Each subsystem can be developed against stable interfaces and replayed from recorded inputs without requiring live hardware.

### 4. Build the evaluation corpus and measurement harness

**Planning:** Create `docs/plans/04-evaluation-corpus.md` before tuning recognition algorithms.

- [x] Define ground-truth formats for notes, chords, onsets, fret regions, and likely tablature.
- [x] Collect or create licensed single-note, scale, chord, and phrase recordings.
- [x] Record variation in guitar type, microphone, dynamics, noise, and playing position.
- [x] Create paired video fixtures for fretboard and hand-position testing.
- [x] Split fixtures into development and held-out evaluation sets.
- [x] Implement repeatable metrics for pitch accuracy, chord accuracy, onset error, fret-position error, fusion improvement, and processing latency.
- [x] Produce a machine-readable evaluation report.

**Done when:** Algorithm changes can be compared objectively against a stable baseline rather than judged only by live demonstrations.

## Phase 2: Audio-first vertical slice

### 5. Implement robust microphone capture and audio transport

**Planning:** Create `docs/plans/05-audio-capture.md`.

- [x] Request and explain microphone permission.
- [x] Disable browser voice-processing features when supported: echo cancellation, noise suppression, and automatic gain control.
- [x] Capture mono PCM through an `AudioWorklet` without blocking the UI.
- [x] Implement buffering, timestamps, backpressure, and worker transport.
- [x] Expose input-device selection and actual device/sample-rate diagnostics.
- [x] Detect silence, clipping, disconnected devices, and unsupported configurations.
- [x] Provide live input level and waveform diagnostics.
- [x] Support recording and deterministic replay through the same downstream interfaces.

**Done when:** Live and prerecorded audio produce equivalent timestamped PCM streams, with measured transport latency and no sustained UI-thread interruption.

### 6. Detect note onsets and monophonic pitch candidates

**Planning:** `docs/plans/06-monophonic-onset-and-pitch.md`.

- [x] Implement energy and/or spectral-flux onset detection.
- [x] Integrate Pitchy or an evaluated alternative for fundamental-frequency estimation.
- [x] Convert frequency estimates into MIDI notes, pitch classes, cents offset, and clarity.
- [x] Return ranked candidates rather than a single forced pitch.
- [x] Add temporal smoothing without erasing fast note changes.
- [x] Handle silence, transients, harmonics, bends, vibrato, and octave errors explicitly.
- [x] Render a live timestamped note timeline with confidence.
- [x] Evaluate accuracy and latency across the audio corpus.
- [x] Run recognition through a filtered 16 kHz analysis branch while preserving native capture.
- [x] Provide reviewed real-guitar WAV and ground-truth fixture export.

**Done when:** Deliberately played single-note phrases produce a stable, editable timeline that meets the defined latency and held-out accuracy targets.

### 7. Detect polyphonic notes and chords

**Planning:** Create `docs/plans/07-polyphonic-audio.md`.

- [x] Integrate Spotify Basic Pitch in a worker with model caching and warmup.
- [x] Define streaming or overlapping-window inference behavior.
- [x] Extract polyphonic note events and align them to the shared timebase.
- [x] Compute chroma or pitch-class evidence independently of Basic Pitch.
- [x] Build a chord-template matcher that supports inversions, omitted notes, doubled notes, and partial confidence.
- [x] Separate live provisional results from higher-accuracy finalized results.
- [x] Reconcile duplicate and contradictory candidates across overlapping windows.
- [ ] Evaluate note, chord, onset, memory, and throughput performance.

**Done when:** Recorded and live guitar chords produce ranked, time-aligned note sets and chord candidates, and finalized results improve on the provisional live path.

### 8. Build the music-theory interpretation engine

**Planning:** Direct implementation for the initial rule-based engine; create a plan before probabilistic or learned extensions.

- [ ] Represent pitch classes, intervals, chords, scales, keys, and enharmonic spelling.
- [ ] Generate chord names from detected pitch-class evidence.
- [ ] Identify likely scales and keys from a time window of events.
- [ ] Model musical continuity without overwriting raw detector output.
- [ ] Return ranked interpretations with evidence and alternatives.
- [ ] Add comprehensive table-driven tests for music-theory rules.

**Done when:** The same sequence can be inspected as raw detections and as explainable chord, scale, and key interpretations.

### 9. Complete the audio-only product slice

**Planning:** Create a UI plan if the session timeline and correction workflow require multiple views.

- [ ] Support starting, pausing, stopping, and replaying a session.
- [ ] Display live and finalized notes and chords distinctly.
- [ ] Allow the user to inspect confidence and alternate candidates.
- [ ] Allow correction of recognized events without destroying original predictions.
- [ ] Persist a session locally and reload it.
- [ ] Export structured JSON and, if supported by the data, MIDI.
- [ ] Run the complete audio evaluation suite and document the baseline.

**Done when:** StringSight is useful as an audio-only guitar transcription application and provides the stable candidate data needed by vision and fusion.

## Phase 3: Guitar-domain model

### 10. Implement the virtual guitar fretboard

**Planning:** Direct implementation with an ADR for the canonical coordinate system.

- [ ] Represent strings, frets, scale length, handedness, capo, and tuning.
- [ ] Map every string/fret location to absolute pitch and pitch class.
- [ ] Enumerate physical locations capable of producing an audio candidate.
- [ ] Generate chord voicings and candidate fingerboard states.
- [ ] Model physical transition cost between sequential states.
- [ ] Support future alternate tunings without rewriting the inference engine.
- [ ] Add exhaustive mapping and invariance tests.

**Done when:** Given any detected pitch set, the engine can return all physically possible guitar locations and voicings within configured constraints.

## Phase 4: Vision

### 11. Implement webcam capture and video processing infrastructure

**Planning:** Create `docs/plans/11-video-infrastructure.md`.

- [ ] Request and explain camera permission.
- [ ] Support camera selection and report actual resolution and frame rate.
- [ ] Establish frame timestamps on the shared timebase.
- [ ] Downscale and transport frames without unnecessary copies.
- [ ] Run heavy analysis outside the main UI thread.
- [ ] Implement adaptive frame rate and quality based on measured processing time.
- [ ] Detect camera loss, stalled frames, poor lighting, and excessive blur.
- [ ] Provide a diagnostic overlay and recorded-frame replay path.

**Done when:** Live and fixture video can drive the same analysis interface with stable timing and without disrupting audio processing.

### 12. Automatically detect and track the fretboard

**Planning:** Split into geometry detection, fret indexing, and temporal tracking plans.

- [ ] Detect candidate guitar-neck boundaries using edges, line segments, contours, and geometric constraints.
- [ ] Estimate a perspective-distorted fretboard quadrilateral.
- [ ] Rectify the fretboard into a canonical coordinate system with a homography.
- [ ] Detect fret wires, strings, the nut, and optional inlay markers.
- [ ] Fit detected fret lines to the equal-tempered fret-spacing model.
- [ ] Infer absolute fret numbering from the nut, marker patterns, geometry, and later audio evidence.
- [ ] Track the accepted geometry between full detections.
- [ ] Expose confidence and refuse false precision when the neck is not identifiable.
- [ ] Evaluate across lighting, guitar finishes, angles, motion, and partial occlusion.

**Done when:** The application can automatically overlay a stable, correctly indexed fret grid on held-out guitar videos and report uncertainty when indexing is ambiguous.

### 13. Detect and map the fretting hand

**Planning:** Create `docs/plans/13-hand-mapping.md`.

- [ ] Integrate MediaPipe Hand Landmarker in a worker.
- [ ] Associate the correct hand with the detected fretboard.
- [ ] Map hand and fingertip landmarks through the fretboard homography.
- [ ] Produce a coarse probability distribution over fret regions.
- [ ] Track hand position temporally and handle intermittent landmark loss.
- [ ] Add finer fingertip-to-string/fret estimates without requiring them for coarse fusion.
- [ ] Distinguish visual observations from inferred contact points.
- [ ] Evaluate handedness, occlusion, skin tones, sleeves, lighting, and playing positions.

**Done when:** The vision system produces time-aligned, calibrated fret-region probabilities and useful confidence on held-out fixtures.

## Phase 5: Multimodal inference

### 14. Build the audio-video fusion engine

**Planning:** Create `docs/plans/14-fusion-engine.md` and document the scoring model mathematically.

- [ ] Join audio and visual evidence using the shared timebase.
- [ ] Generate candidate guitar states from audio pitch evidence.
- [ ] Score candidates using audio likelihood, visual position, guitar geometry, and prior state.
- [ ] Use dynamic programming or an equivalent sequence method to prefer physically plausible phrases.
- [ ] Support audio-only fallback and partial visual evidence.
- [ ] Preserve the unfused audio result for comparison and debugging.
- [ ] Produce probable tablature with explicit confidence and alternatives.
- [ ] Quantify accuracy improvement over the audio-only baseline.

**Done when:** On the held-out paired corpus, fusion measurably improves position, voicing, or transcription accuracy without materially degrading reliable audio-only results.

### 15. Implement automatic visual indexing with audio feedback

**Planning:** Extend the fretboard and fusion plans rather than creating an isolated heuristic.

- [ ] Represent multiple plausible absolute fret-number alignments when visual anchors are missing.
- [ ] Score each alignment against detected pitches and feasible guitar locations.
- [ ] Accumulate evidence across a phrase before committing to an alignment.
- [ ] Reopen the decision when later evidence contradicts it.
- [ ] Make alignment confidence observable in diagnostics and the UI.

**Done when:** Audio can resolve visually ambiguous fret indexing in representative fixtures, while unresolved cases remain clearly marked.

## Phase 6: Product experience

### 16. Build the complete session and visualization experience

**Planning:** Create `docs/plans/16-product-experience.md` with wireframes and interaction states.

- [ ] Design onboarding for microphone, camera, positioning, tuning, and privacy.
- [ ] Display the live camera with fretboard and hand overlays.
- [ ] Display synchronized waveform, note, chord, and tablature timelines.
- [ ] Distinguish provisional, finalized, corrected, and model-interpreted data.
- [ ] Expose confidence without overwhelming the primary experience.
- [ ] Support session replay with synchronized audio, video-derived overlays, and events.
- [ ] Provide accessible keyboard operation, labels, contrast, and reduced-motion behavior.
- [ ] Provide actionable recovery states for permission, device, model, and analysis failures.

**Done when:** A first-time user can complete a recording, understand the result and its uncertainty, correct it, and export it without developer assistance.

### 17. Add GPT-5.6 musical interpretation

**Planning:** Create `docs/plans/17-openai-analysis.md` before adding the remote boundary.

- [ ] Define the exact user value beyond deterministic music-theory analysis.
- [ ] Send only compact structured musical events and necessary context, not raw continuous audio or video.
- [ ] Keep API credentials on a server endpoint.
- [ ] Use a strict structured-output schema for keys, scales, progressions, alternatives, and explanations.
- [ ] Preserve raw and deterministic results separately from model interpretation.
- [ ] Add timeouts, cancellation, retries, rate-limit handling, and an offline fallback.
- [ ] Evaluate interpretations against curated examples and adversarial uncertain inputs.
- [ ] Make remote processing and its data boundary visible to the user.

**Done when:** The feature adds demonstrable interpretive value, fails safely, and never blocks local transcription.

### 18. Complete persistence, export, and reproducibility

**Planning:** Direct implementation after session schemas stabilize.

- [ ] Store sessions and settings in IndexedDB with schema versioning and migrations.
- [ ] Export and import a complete reproducible session bundle.
- [ ] Export structured JSON and supported musical formats.
- [ ] Define retention and deletion controls for locally recorded media.
- [ ] Ensure exported results retain confidence, provenance, corrections, and model versions.
- [ ] Test interrupted writes, storage limits, upgrades, and corrupted imports.

**Done when:** A session can be saved, restored, transferred, inspected, and deleted without losing the distinction between source evidence and interpretations.

## Phase 7: Quality, performance, and release

### 19. Meet performance and reliability budgets

**Planning:** Create `docs/plans/19-performance.md` once the vertical slices exist.

- [ ] Instrument end-to-end audio, video, inference, fusion, and render latency.
- [ ] Measure worker utilization, main-thread blocking, memory, model load time, and bundle size.
- [ ] Establish graceful quality reduction for slower hardware.
- [ ] Prevent audio interruption when video or remote analysis is overloaded.
- [ ] Cache model assets safely and report loading progress.
- [ ] Run long-session soak tests and repeated start/stop tests.
- [ ] Profile supported browsers on representative hardware.
- [ ] Publish measured budgets and known limitations.

**Done when:** The application remains responsive and stable for realistic sessions on the supported hardware/browser matrix and meets the defined latency budgets.

### 20. Complete security, privacy, accessibility, and dependency review

**Planning:** Use focused reviews; create remediation plans for material findings.

- [ ] Verify that microphone and camera access are requested only when needed.
- [ ] Verify that raw media remains local unless the user explicitly exports it.
- [ ] Add a clear privacy explanation and data-flow inventory.
- [ ] Prevent API keys, secrets, and sensitive diagnostics from reaching the client or repository.
- [ ] Review third-party licenses and required attributions.
- [ ] Run dependency and production-build security checks.
- [ ] Complete keyboard, screen-reader, contrast, focus, and motion review.
- [ ] Document residual risks and limitations.

**Done when:** The release has no unexplained data flows, exposed secrets, unreviewed material dependency risks, or known blocking accessibility failures.

### 21. Deploy and verify the production application

**Planning:** Create `docs/plans/21-deployment.md`.

- [ ] Choose an HTTPS host and server-side API environment.
- [ ] Configure environment separation and secret management.
- [ ] Configure model and worker asset headers, caching, and paths.
- [ ] Add production error reporting that does not capture raw media.
- [ ] Execute smoke tests against the deployed build with real devices.
- [ ] Verify cold start, permissions, offline behavior, and API fallback.
- [ ] Document deployment and rollback procedures.

**Done when:** Judges can open a stable URL, grant permissions, run the principal workflow, and recover from unsupported conditions.

### 22. Prepare documentation, demonstration, and Devpost submission

**Planning:** Create separate README, demo, and submission plans when core behavior is stable.

- [ ] Write a complete README with architecture, setup, testing, sample data, and limitations.
- [ ] Document how Codex accelerated development and where human product, engineering, and design decisions were made.
- [ ] Document where and how GPT-5.6 was used.
- [ ] Provide a public repository with an appropriate license, or grant the required private-repository access.
- [ ] Create a deterministic judge path with sample inputs if live hardware conditions are poor.
- [ ] Write and rehearse a demo under three minutes.
- [ ] Record a public YouTube demo with audio explaining StringSight, Codex, and GPT-5.6.
- [ ] Retrieve the `/feedback` Session ID from the primary implementation task.
- [ ] Update the Devpost project fields and technology list to match the actual implementation.
- [ ] Complete the Education-track submission fields and explicitly submit before the deadline.
- [ ] Reopen the submitted project and verify every link, permission, field, and media asset.

**Done when:** A reviewer can understand, run, and evaluate StringSight from the submitted materials, and Devpost confirms the project is submitted rather than merely saved as a draft.

## Current focus

- [x] Complete item 1: product requirements and measurable targets.
- [x] Complete item 2: repository and developer workflow.
- [x] Complete item 3: architecture and typed contracts.
- [x] Complete item 4 before tuning recognition algorithms.
- [x] Complete item 5 hardware verification and automated implementation.
- [x] Complete item 6 real-guitar verification; automated implementation and corpus baseline pass.
- [ ] Build items 5 through 9 as the first complete vertical slice.

## Major completion gates

- [x] **Foundation gate:** Items 1-4 complete.
- [ ] **Audio gate:** Items 5-9 complete and evaluated.
- [ ] **Guitar-model gate:** Item 10 complete.
- [ ] **Vision gate:** Items 11-13 complete and evaluated.
- [ ] **Fusion gate:** Items 14-15 complete with measured improvement.
- [ ] **Product gate:** Items 16-18 complete.
- [ ] **Release gate:** Items 19-21 complete.
- [ ] **Submission gate:** Item 22 complete and Devpost confirms submission.
