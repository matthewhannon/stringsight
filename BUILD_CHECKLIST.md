# StringSight Build Checklist

This document is the bird's-eye implementation guide for StringSight. It tracks the major outcomes
required to build a reliable, local-first, desktop-web guitar tablature and practice workspace. The
score is the central product object; microphone analysis, metronome, looping, synchronized media,
recorded takes, and later performance assessment support the practice workflow. Live fretboard and
hand-position computer vision is a later optional capability, not the product shell.

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

StringSight is a local-first desktop web application where a guitarist authors or imports tablature,
practices a whole score or selected range with reliable playback, loops, tempo control, metronome,
and count-in, and records reviewable takes. Existing microphone input, note detection, chord
detection, immutable evidence, correction, persistence, and export remain core capabilities. The
same score, transport, audio, and take foundations later support timing/pitch accuracy assessment,
optional synchronized reference and take video, and optional live fretboard/hand computer vision.

### Initial supported environment

- Desktop Chrome and Edge
- Desktop layout only for the planned release; mobile layouts are not a target
- Resizable desktop windows, browser zoom, keyboard operation, semantic reflow, and accessibility
  remain required even though phone/tablet composition is not
- Six-string guitar in standard tuning (`E2 A2 D3 G3 B3 E4`)
- One foreground instrument
- Direct microphone or a reasonably quiet room
- Single notes, deliberate phrases, and clearly articulated chords

Camera access is optional and requested only for a user-selected reference/take-video or later live
vision workflow. Support for other browsers, tunings, instruments, dense mixes, and mobile devices
is not required for the first complete release. Canonical contracts must still represent capo and
alternate tuning without pretending they have completed the full evaluation matrix.

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
- [x] Separate live provisional results from higher-accuracy finalized results, including closed
      live spans that remain provisional until run-level finalization.
- [x] Reconcile duplicate, contradictory, and transition-fragment candidates across overlapping
      windows with a post-run sequence decoder.
- [x] Evaluate note, chord, onset, memory, and throughput performance.

**Done when:** Recorded and live guitar chords produce ranked, time-aligned note sets and chord candidates, and finalized results improve on the provisional live path.

**Resolved July 19, 2026:** Isolated-chord recognition remains accepted. Continuous G-to-D
testing exposed premature `finalized` lifecycle labels, transition fragments retained after Stop,
and uncalibrated match scores presented as probabilities. Closed spans now remain provisional until
run-level finalization, and the promoted boundary-region decoder reconciles the retained evidence
without regressing the reviewed 97.6-second sequence. A fresh continuous G-D-E-G-D-E take then
exposed bounded-candidate and label-support defects in production fusion. The generalized
correction evaluates the full retained acoustic hypothesis catalog, labels regions only from
settled acoustic support, checks essential model-tone completeness, and smooths low-definition
transition regions. The reviewed take now finalizes as exactly G-D-E-G-D-E; the 19-chord sequence
remains unchanged, and the ten-chord power/inversion sequence now places every intended chord at
top-1 with no extra event.

### 8. Build the music-theory interpretation engine

**Planning:** Direct implementation for the initial rule-based engine; create a plan before probabilistic or learned extensions.

- [x] Represent pitch classes, intervals, chords, scales, keys, and enharmonic spelling.
- [x] Generate chord names from detected pitch-class evidence.
- [x] Identify likely scales and keys from a time window of events.
- [x] Model musical continuity without overwriting raw detector output.
- [x] Return ranked interpretations with evidence and alternatives.
- [x] Add comprehensive table-driven tests for music-theory rules.

**Done when:** The same sequence can be inspected as raw detections and as explainable chord, scale, and key interpretations.

### 9. Complete the audio-only product slice

**Planning:** Create a UI plan if the session timeline and correction workflow require multiple views.

- [x] Support starting, pausing, stopping, and replaying a session.
- [x] Display live and finalized notes and chords distinctly.
- [x] Allow the user to inspect confidence and alternate candidates.
- [x] Allow correction of recognized events without destroying original predictions.
- [x] Persist a session locally and reload it.
- [x] Export structured JSON and, if supported by the data, MIDI.
- [x] Run the complete audio evaluation suite and document the baseline.

**Done when:** StringSight is useful as an audio-only guitar transcription application and provides the stable candidate data needed by vision and fusion.

**Resolved July 19, 2026:** The review layer projects append-only replacement and revert commands
over immutable detector events, preserving raw predictions, timing, confidence, alternatives, and
provenance. Validated structured sessions and replayable PCM are stored atomically in separate
IndexedDB stores and reload across a browser refresh. Versioned JSON round-trips the complete
structured session; MIDI is offered only for finalized note evidence and never invents chord
voicings. The real-browser save/reload/replay workflow passes with the reviewed G-D-E-G-D-E take,
the full repository verification passes, and label-driven private production replays retain the
accepted 18/19 common-chord and 10/10 power/inversion results without fixture-specific rules.

## Phase 3: Practice Workspace foundations

### Product and architecture approval gate

**Planning:** Update `docs/plans/01-product-requirements.md`,
`docs/plans/10-practice-system-architecture.md`, and ADR 0006 before production implementation.

- [ ] Replace the rack-primary product framing with the desktop-first tab and practice workspace.
- [ ] Mark the current rack shell and remaining rack styling as superseded presentation work without
      discarding its implemented audio behavior, tests, accessibility, or reusable components.
- [ ] Add optional `ReferenceVideo`, `TakeVideo`, separately stored timed-media assets, and a
      versioned multi-anchor `ScoreMediaSyncMap` bound to the exact immutable `PracticeDocument`
      revision ID and content hash it was authored against. Define stale detection on revision/hash
      mismatch and explicit validated rebase or re-author behavior after score edits; never silently
      retarget a map.
- [ ] Preserve `PracticeTransport` and the application audio clock as the sole command/time authority
      for notation playback, metronome, capture, replay, cursor, and synchronized video.
- [ ] Resolve the eleven recorded owner decisions plus video format/codec, retention/deletion,
      sync-editing, and first-release export scope.
- [ ] Keep the plan and ADR Proposed until an independent review finds no new blocking issue after
      these changes; then record explicit owner acceptance.

**Done when:** The product requirements, plan, ADR, and this checklist agree on the product, media
model, supported desktop environment, implementation order, and owner-approved policy choices.

### Disposable notation, playback, and timed-video integration gate

**Planning:** Use an isolated spike branch. Its code is evidence and must not be merged as production
architecture.

- [ ] Pin and evaluate alphaTab 1.8.4 only after MPL-2.0 owner approval; record exact package,
      source-form, asset, transitive-license, notice, and clean-release evidence.
- [ ] Prove renderer/import behavior without persisting a third-party object graph.
- [ ] Prove that alphaSynth is subordinate to the StringSight transport or select and re-test the
      documented single-authority fallback; never ship two production clocks.
- [ ] Verify Vite workers/worklets, Basic Pitch, microphone capture, notation, synthesis, metronome,
      and existing tests coexist without path hacks or weakened isolation.
- [ ] Measure camera permission/revocation, device loss, container/codec negotiation, imported-video
      decode, timestamp precision, seeking, A/V drift, and multi-anchor sync editing.
- [ ] Measure simultaneous notation, reference audio, metronome, guitar capture, analysis, camera
      encoding, and video playback for dropouts, long tasks, CPU, memory, and storage growth.
- [ ] Verify that camera video can be captured without opening a second microphone path and that the
      existing guitar-audio path remains authoritative evidence.
- [ ] Record approved bundle, long-score, memory, quota, edit-to-render, edit-to-sound, seek, drift,
      and capture-continuity budgets or select the documented fallback/omission.

**Done when:** A written spike report satisfies every blocking notation/audio/video/license gate or
records the selected fallback and its repeated evidence. No spike UI or dependency is assumed to be
production-ready.

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

## Phase 4: Practice document, editor, and interchange

### 11. Implement versioned Practice System contracts

**Planning:** Follow the accepted Practice System plan and ADR; do not overload the observed
`Session` aggregate.

- [ ] Implement a canonical `PracticeDocument` with 960 PPQ integer ticks, tempo/meter/key maps,
      tracks, voices, guitar events, validated ranges, revisions, and qualified content hashes.
- [ ] Keep authored intent, observed `Session` evidence, immutable `PracticeTake`, timed-media state,
      and derived `PracticeAssessment` as independently versioned aggregates.
- [ ] Implement expected-event projections, immutable observed-evidence/correction snapshots, exact
      media identities, and capture/score clock anchors.
- [ ] Add deterministic schema validation, canonical serialization, golden hashes, migrations, and
      adversarial boundary tests.
- [ ] Encode the owner-approved notation/technique support profile and stable import-loss codes.

**Done when:** Authored scores, observed evidence, media, takes, and assessments can be validated,
hashed, migrated, and referenced without converting one aggregate into another.

### 12. Build the editor core and notation/import/MIDI adapters

**Planning:** Keep all third-party types behind adapters and keep renderer layout out of document
state.

- [ ] Implement pure validated edit commands, transactions, stable selection, bounded undo/redo,
      and native StringSight JSON round trips.
- [ ] Implement the approved notation adapter with stable event/tick/geometry mappings and semantic
      focus, expanded, page, and continuous views.
- [ ] Use four bars per horizontal system as a presentation default only; reflow dense/sparse music
      without changing tick selections or loops.
- [ ] Import supported Guitar Pro, MusicXML/MXL, alphaTex/native, and MIDI through deterministic
      draft-plus-report boundaries; reject corrupt or resource-hostile files safely.
- [ ] Add raw-SMF preflight and explicit event accounting before any optional `@tonejs/midi`
      conversion; never claim guitar string/fret fidelity from MIDI.
- [ ] Implement accessible structured score inspection and keyboard editing independent of rendered
      SVG/canvas glyph focus.

**Done when:** A guitarist can create, edit, save, reopen, and safely import a supported score while
every preserved, converted, rejected, or lost semantic is explicit and fixture-tested.

## Phase 5: Shared runtime, timed media, and persistence

### 13. Implement AudioRuntime, authoritative transport, metronome, and loops

**Planning:** Preserve all existing capture behavior while moving context ownership to an
application runtime.

- [ ] Refactor microphone capture to consume application-owned runtime leases without changing
      detector evidence, privacy behavior, deterministic replay, or hardware results.
- [ ] Implement one authoritative `PracticeTransport` for play/pause/seek/stop, range, speed,
      loop generation, count-in, and musical-time projection.
- [ ] Schedule reference playback, metronome, count-in, take replay, and silent capture buses from
      the same audio-context timeline; React only submits commands and observes snapshots.
- [ ] Implement tempo/meter changes, canonical downbeat/grouping, arbitrary half-open tick ranges,
      phase-aligned count-in, and count-in/score-start sample epochs.
- [ ] Pass the approved long-run click, loop, speed, capture-continuity, latency, and no-drift gates.

**Done when:** Playback, metronome, cursor, looping, and capture remain sample/tick aligned under one
authority across pauses, seeks, range changes, tempo maps, and long runs.

### 14. Implement the optional timed-media runtime

**Planning:** This is synchronized practice media, not live fretboard-analysis computer vision.

- [ ] Store `ReferenceVideo` and `TakeVideo` as optional media records separate from the canonical
      score, observed evidence, and immutable take identity. Attach `ReferenceVideo` through its
      revision-bound sync map, not directly to a mutable document.
- [ ] Implement versioned `ScoreMediaSyncMap` records with one or multiple validated
      score-tick/media-time anchors, deterministic interpolation, provenance, and edit history. Each
      map binds the exact immutable `PracticeDocument` revision ID and content hash against which its
      anchors were authored.
- [ ] Detect a sync map as stale whenever its bound revision ID or content hash differs from the
      score revision being used. Score edits require an explicit validated rebase or re-author
      operation that preserves provenance; never silently retarget anchors to a new revision.
- [ ] Make video follow `PracticeTransport`; media-element or recorder callbacks are diagnostics and
      never transport authority.
- [ ] Support local reference-video import, permissioned camera preview/capture, cancellation,
      revocation, device loss, seek recovery, decode failure, and missing/deleted-media states.
- [ ] Record camera video without a second microphone path; keep the existing guitar audio/worklet
      recording as authoritative evidence and bind the streams through shared timestamps.
- [ ] Measure and bound A/V drift, seek error, encoder load, long tasks, memory, quota use, and audio
      dropouts under the full simultaneous workload.
- [ ] Keep synchronized review independent from optional downloadable muxed-video export.

**Done when:** A missing, moved, unsupported, or deleted video never corrupts the score/take, while
supported reference and take video seek and review against the authoritative musical timeline within
approved drift and performance budgets.

### 15. Complete Practice System persistence, migrations, and media lifecycle

**Planning:** Extend the existing validated IndexedDB repository model; do not add silent cascades.

- [ ] Persist current documents, immutable referenced revisions, evidence snapshots, takes,
      assessments, sync maps, and mutable audio/video media state with explicit schema versions.
- [ ] Implement atomic same-database writes or recoverable durable cross-store intents for media
      finalize, link, tombstone, purge, relink, and corruption recovery.
- [ ] Enforce qualified content/media hashes and hash-verified relinking without mutating immutable
      take references.
- [ ] Implement owner-approved previewed retention/deletion flows for structured history, audio PCM,
      reference video, and take video; never report missing bytes as available.
- [ ] Export/import reproducible native bundles with explicit included, external, omitted, deleted,
      and unsupported media states.
- [ ] Test fresh install, every migration fixture, blocked upgrades, quota failure, interruption,
      corruption, multi-tab conflicts, deletion recovery, and browser storage eviction.

**Done when:** Scores and synchronized audio/video takes survive save, restore, transfer, deletion,
relinking, migrations, and failures without losing provenance or silently changing immutable history.

## Phase 6: Desktop Practice Workspace product

### 16. Replace the rack-primary shell with the desktop Practice Workspace

**Planning:** Create desktop wireframes and a state/action map before production JSX. The existing
rack UI is superseded presentation work, not permission to discard working audio behavior.

- [ ] Center the score/tab and global transport in the primary workspace, with song/library,
      optional video, input/analysis, take, and assessment surfaces arranged around it.
- [ ] Support focus, expanded, page, and continuous score views while selection and loop ranges
      remain stable musical ticks across every reflow.
- [ ] Integrate editing/import, play/pause/stop/seek, range loops, tempo/speed, metronome, count-in,
      microphone/file input, note/chord detection, and explicit lifecycle/error states.
- [ ] Port only reviewed behavior and reusable components from the isolated rack UI branch; do not
      merge rack layout/style changes wholesale.
- [ ] Remove rack/hardware visual hierarchy as the product shell while retaining honest monitoring,
      recording, pause/resume, finalization, replay, disconnect, privacy, import, metering, and
      duration-safety behavior.
- [ ] Optimize for desktop, but preserve browser zoom, resizable-window reflow, keyboard navigation,
      visible focus, semantic order, screen readers, contrast, and reduced motion.

**Done when:** A first-time desktop user can open/create a score and complete the core practice flow
without navigating a rack of utilities or losing any accepted audio functionality.

### 17. Implement practice takes and synchronized audio/video review

**Planning:** Bind every take to an immutable document revision, range, speed, count-in, capture
epochs, observed-evidence snapshot, media identity, and sync provenance.

- [ ] Record a practice take while reference playback and metronome remain isolated from the captured
      guitar signal; warn about physical speaker bleed and recommend headphones.
- [ ] Provide authoritative audible take replay distinct from faster deterministic analyzer replay.
- [ ] Provide reference/take audio mute, solo, gain, balance, guitarist-only listening, and A/B
      comparison without creating independent transports.
- [ ] Attach and review optional `ReferenceVideo` and `TakeVideo`; support sync-anchor editing and
      clear missing/deleted/unsupported states.
- [ ] Preserve exact score/audio/video relationships across save, reload, export, deletion, and
      correction-history changes.
- [ ] Verify permissions, lifecycle interruptions, device changes, five-minute audio limits or their
      approved replacement, video duration/size limits, and simultaneous-runtime performance.

**Done when:** A guitarist can record, replay, hear only their performance, compare it with the
reference, and review optional synchronized video without corrupting source evidence.

### 18. Add expected-versus-observed performance assessment

**Planning:** Begin only after editor, transport, take recording, media integrity, and alignment
fixtures pass independently.

- [ ] Project expected attacks, sustains/releases, string/fret-derived pitches, beats, and ranges
      from the exact immutable document revision practiced.
- [ ] Project observed notes/onsets/chords and correction cutoff from the immutable take snapshot.
- [ ] Align in a worker with tempo/speed and capture-latency provenance; preserve unmatched and
      ambiguous events instead of forcing correspondence.
- [ ] Report timing offset, timing consistency, note accuracy, omissions, extras, and confidence with
      calibration appropriate to the available evidence.
- [ ] Let users jump to and loop a weak range while retaining the original score, take, and evidence.
- [ ] Evaluate fast passages, bends/vibrato, chords, bleed, latency uncertainty, partial evidence,
      and repeated loops against a labeled corpus and measured processing budgets.

**Done when:** Assessment is reproducible, confidence-aware, useful at representative guitar speeds,
and cannot mutate or overstate either expected or observed evidence.

## Phase 7: Deferred optional intelligence

### 19. Add live fretboard/hand computer vision when justified

This preserves the useful outcomes from the former Items 11-13 but deliberately moves them after the
complete Practice Workspace. It is separate from reference/take video playback.

- [ ] Implement permissioned camera capture, shared-timebase frame timestamps, bounded off-main-thread
      transport, diagnostics, fixture replay, adaptive quality, and audio-priority degradation.
- [ ] Detect, rectify, index, and temporally track the fretboard with explicit uncertainty.
- [ ] Detect the fretting hand and map landmarks to probabilistic string/fret regions without
      presenting inferred contacts as observations.
- [ ] Evaluate across guitars, angles, lighting, motion, occlusion, handedness, skin tones, sleeves,
      device loss, and representative desktop hardware.

**Done when:** Optional live vision produces calibrated time-aligned guitar-position evidence without
interrupting the core practice/audio experience.

### 20. Build guitar-aware audio/vision fusion and automatic visual indexing

This preserves the former Items 14-15 after the deferred vision gate.

- [ ] Join audio and visual evidence through the shared timebase and canonical guitar model.
- [ ] Score physical candidate states over time while preserving unfused audio evidence.
- [ ] Represent multiple plausible absolute fret alignments and use phrase-level audio evidence to
      resolve or reopen them.
- [ ] Support audio-only fallback and partial visual evidence.
- [ ] Quantify held-out position/voicing/transcription improvement without degrading reliable audio.

**Done when:** Fusion measurably improves held-out guitar-position or tablature inference and keeps
uncertainty and source provenance inspectable.

### 21. Add GPT-5.6 musical interpretation only for demonstrated user value

- [ ] Define value beyond deterministic theory and performance metrics.
- [ ] Send only compact structured events and necessary context through a server boundary; raw audio
      and video remain local unless the user explicitly chooses otherwise.
- [ ] Use strict structured output, preserve deterministic/raw results, and add timeout,
      cancellation, rate-limit, privacy, evaluation, and offline behavior.

**Done when:** Remote interpretation adds measured value, has an explicit visible data boundary, and
never blocks local score, practice, take, or assessment workflows.

## Phase 8: Quality, release, and submission

### 22. Meet performance, privacy, security, accessibility, and license gates

- [ ] Instrument end-to-end audio, notation, video, encoding, analysis, assessment, render, memory,
      model, storage, and bundle behavior on representative desktop hardware.
- [ ] Protect audio scheduling/capture when video, rendering, or remote work is overloaded; apply only
      measured and documented graceful degradation.
- [ ] Run long-score, long-session, repeated start/stop, multi-tab, quota, codec, permission, device
      loss, malformed import, and dependency-security tests.
- [ ] Verify microphone/camera minimization, local-default media flow, explicit export/deletion, no
      secrets, third-party licenses/notices/source access, and clean-build reproducibility.
- [ ] Complete keyboard, screen-reader, browser zoom, desktop reflow, contrast, focus, and motion
      review. No mobile layout target does not waive accessibility or resizable-window behavior.

**Done when:** Approved budgets and supported desktop-browser/hardware matrices pass with no blocking
privacy, security, licensing, accessibility, migration, or reliability issue.

### 23. Deploy and verify the production application

- [ ] Choose an HTTPS host and any required server environment with explicit secret management.
- [ ] Configure worker/model/notation/SoundFont assets, MIME types, cross-origin headers, caching,
      source notices, storage behavior, and rollback.
- [ ] Add privacy-safe production diagnostics and smoke-test the deployed build with real microphone,
      camera, imported files, local persistence, cold start, refresh, and offline/fallback behavior.

**Done when:** A reviewer can open a stable URL and complete the primary desktop practice workflow on
the declared support matrix with documented recovery paths.

### 24. Prepare documentation, demonstration, and submission

- [ ] Write the README, architecture/data-flow explanation, setup, testing, license/source notices,
      sample data, privacy, supported formats, and honest limitations.
- [ ] Document Codex and GPT-5.6 use accurately and provide the required repository access.
- [ ] Create a deterministic judge path when hardware, camera, codec, or room conditions are poor.
- [ ] Rehearse and record the required concise demo around the tab-to-practice-to-take-to-assessment
      story; show optional video only if it passed its gates.
- [ ] Complete, submit, reopen, and verify every Devpost field, link, permission, technology entry,
      feedback Session ID, and media asset.

**Done when:** Reviewers can understand, run, and evaluate the actual product, and the submission
platform confirms a completed submission rather than a saved draft.

## Superseded roadmap reference — do not execute in this order

The remaining sections below preserve the original transcription/vision roadmap for historical
context. Their useful outcomes have been remapped into active Items 16-24 above. The former vision
Items 11-15 are deferred to active Items 19-20; the former product Item 16 is split across active
Items 16-18; former GPT Item 17 maps to active Item 21; and former persistence/release Items 18-22
map to active Items 15 and 22-24. Their unchecked boxes are historical, not a second active queue.

The realistic rack direction and remaining rack styling are specifically superseded. Existing audio
behavior and completed UI commits are preserved for selective review/porting, not merged blindly.

## Legacy Phase 4: Vision

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
- [x] Complete item 7 polyphonic evaluation with reviewed power-chord and inversion coverage.
- [x] Build items 5 through 9 as the first complete vertical slice.
- [ ] Update the Product/Architecture approval gate for the desktop Practice Workspace and optional
      synchronized timed media; resolve owner decisions and repeat independent review.
- [ ] Run the disposable notation/playback/video integration gate after approval.
- [ ] Complete active Items 10-18 in order. Do not resume the superseded rack-primary UI roadmap or
      begin deferred live computer vision first.

## Major completion gates

- [x] **Foundation gate:** Items 1-4 complete.
- [x] **Audio gate:** Items 5-9 complete and evaluated.
- [ ] **Product/architecture gate:** Updated desktop/video plan and ADR accepted after owner decisions
      and independent review.
- [ ] **Disposable integration gate:** Notation, single-authority playback, timed video, capture
      coexistence, licensing, and measured budgets pass or select documented fallbacks.
- [ ] **Guitar-model gate:** Active Item 10 complete and independently reviewed.
- [ ] **Practice-domain gate:** Active Items 11-12 complete.
- [ ] **Runtime/media gate:** Active Items 13-15 complete with timing, drift, storage, and failure
      evidence.
- [ ] **Desktop product gate:** Active Items 16-18 complete and evaluated.
- [ ] **Optional vision/fusion gate:** Active Items 19-20 complete only if prioritized after the core
      product.
- [ ] **Optional GPT gate:** Active Item 21 adds evaluated value with a visible remote boundary.
- [ ] **Release gate:** Active Items 22-23 complete.
- [ ] **Submission gate:** Active Item 24 complete and Devpost confirms submission.
