# Audio-only product slice plan

**Status:** Complete (July 19, 2026)
**Checklist parent:** `BUILD_CHECKLIST.md`, Item 9

## Objective

Turn the existing capture and analysis modules into a coherent local audio session that can be
started, paused, resumed, stopped, replayed, inspected, corrected, saved, restored, and exported.
Raw detector events, deterministic theory interpretations, and user corrections remain separate
throughout the workflow.

## Delivered baseline

Items 5-8 provide microphone capture, deterministic WAV replay, monophonic events, polyphonic
note-set and chord events, and pure chord/scale/key interpretation. Item 9 adds the complete session
lifecycle around them: review/correction projection, durable local persistence, validated import
and export, and browser UI. The controller publishes deterministic theory only after run completion
and preserves completed results until replay replacement is ready.

## Boundaries

- `app` owns orchestration and projects controller state into the rack.
- `audio` continues to own capture, replay, detector behavior, and run-level finalization. Item 9
  must not change detector scores merely to improve presentation or promote provisional spans.
- `music` derives interpretations from shared audio events without mutating them.
- `shared` owns the versioned persisted session and correction schemas.
- `persistence` stores validated session metadata and optional recording media locally. Repository
  interfaces remain injectable so deterministic tests do not require a live browser database.
- UI components receive session actions and snapshots; they do not assemble or rewrite domain
  events themselves.

## Session lifecycle

The product lifecycle is `idle -> recording <-> paused -> processing -> complete`. Replay is an
operation on a complete session and does not erase its finalized events. Failures preserve the last
valid recording and events whenever recovery is possible.

Pausing suspends the active `AudioContext`, so paused wall-clock time does not create PCM or advance
session-relative audio timestamps. Stopping from a paused state resumes the context only long enough
to flush the worklet and finalize buffered PCM.

## Event and interpretation model

The session aggregates monophonic notes, finalized polyphonic note sets, and chord events by stable
event ID. Live chord spans remain provisional even after an online boundary closes; only the
run-level decoder may publish finalized chords. Deterministic key and scale interpretations are
published from a completed event set, with source event IDs and algorithm versions, and never
replace `events.audio`.

Corrections are append-only records that reference a source event. A corrected display value is a
projection of the newest applicable correction over the raw event, not a mutation of detector
history. Invalid or orphaned corrections remain visible as recoverable validation problems.

## Persistence and export

1. Validate session metadata at every repository boundary.
2. Store structured session data and recording PCM separately in IndexedDB so JSON inspection does
   not duplicate large audio arrays.
3. Use atomic writes per session and update `updatedAt` only after validation.
4. Export a versioned JSON document containing raw events, interpretations or their reproducible
   inputs, corrections, settings, provenance, and recording metadata.
5. Import through validation before replacing any active state.
6. Add Standard MIDI File export only for finalized or corrected notes with defensible onset,
   duration, and MIDI pitch. Chord symbols alone do not justify invented MIDI voicings.

## UI delivery

The rack gains a session module with lifecycle controls and a review module containing synchronized
raw events, interpreted results, confidence, alternatives, and corrections. Persistence and export
actions appear only when a valid session exists. Provisional, finalized, interpreted, and corrected
states use both text and visual treatment.

## Delivery sequence

1. Add pause/resume behavior to capture, including stop-from-pause and UI controls.
2. Implement an `AudioSessionController` that aggregates capture and detector snapshots into one
   validated session without coupling the analyzers to React.
3. Add deterministic theory selectors and the review timeline.
4. Add append-only correction commands and corrected-value projection.
5. Add injectable IndexedDB persistence plus save/load/delete controls.
6. Add validated JSON import/export and conditional MIDI export.
7. Run public evaluation, browser workflows, private recording replays, and persistence failure
   tests before closing Item 9.

## Acceptance

- Start, pause, resume, stop, and replay do not lose or duplicate PCM or events.
- Raw, provisional, finalized, interpreted, and corrected data remain distinguishable.
- Reloaded sessions validate and reproduce the saved structured result.
- Corrections never destroy original predictions.
- JSON round-trips retain schema version, timing, confidence, provenance, and corrections.
- MIDI is offered only when note evidence supports it.
- Existing monophonic and polyphonic accuracy, latency, and browser workflows do not regress.

## Completion evidence

- Corrections are append-only `replace` or `revert` commands. Review projection supports finalized
  note and chord events; raw events remain unchanged and invalid/orphaned history remains visible.
- The IndexedDB repository validates every boundary and atomically stores structured sessions and
  optional mono PCM in separate stores. A memory implementation exercises the same contract in
  deterministic tests.
- JSON export is versioned and schema-validated on import. MIDI exports only finalized note events
  with defensible pitch and timing; chord-only sessions correctly disable MIDI.
- A real browser refresh retained a saved reviewed session, restored its six finalized events, two
  correction commands, and replayable PCM, then deleted the test record cleanly.
- The public production browser matrix remains 100% for finalized chord accuracy, note F1, onset
  F1, and pitch-class-set recall. The generic label-driven private production replay validates 18
  correctly labeled events from the 19-chord take and all 10 power/inversion events, including both
  labeled bass inversions. The fresh transition take remains exactly G-D-E-G-D-E.
- `npm run verify` passes 267 tests across 30 files with 90.87% statement and 80.26% branch coverage,
  plus formatting, linting, type checking, license checks, corpus validation, evaluator self-tests,
  monophonic evaluation, and the production build.
