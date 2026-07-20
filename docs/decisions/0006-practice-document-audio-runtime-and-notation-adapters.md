# ADR 0006: Practice documents, one transport/audio authority, and replaceable adapters

- **Status:** Proposed
- **Date:** 2026-07-20
- **Decision scope:** Owner-approved invariants and evaluation scope for the disposable feasibility
  spike; production technology, licensing procedure, support claims, and budgets are not accepted

## Context

StringSight already models microphone observations as a versioned `Session` with local PCM,
analysis provenance, append-only corrections, persistence, and observed-session MIDI export. The
accepted desktop Practice Workspace adds authored guitar tablature, immutable score revisions,
editing/import, musical ranges, reference playback, metronome/count-in, practice takes, and optional
synchronized reference/take video.

These concerns have different clocks and lifecycles. Putting measures into `Session`, using
milliseconds as score time, persisting a notation library's graph, or allowing media/synthesis to
run an independent transport would make edits, takes, evidence, synchronization, and later
assessment irreproducible. An `HTMLMediaElement`, camera, encoder, and `AudioContext` also do not
physically share one clock merely because the app observes them together.

The architecture must preserve ADRs 0001-0005: desktop local-first web, audio-complete behavior,
versioned boundary contracts, audio priority/worker isolation, and explicit dependency/license
review. alphaTab 1.8.4 is an MPL-2.0 candidate, not an accepted production dependency.

## Decision

### 1. Keep authored intent, evidence, takes, media, and assessment separate

Use independently versioned aggregates:

- `PracticeDocument` and immutable saved revisions for authored score meaning;
- existing `Session` for observed microphone evidence;
- immutable `ObservedEvidenceSnapshot` at an exact raw-event/correction cutoff;
- immutable `PracticeTake` binding one exact document revision/range/configuration, evidence
  snapshot, capture epochs, and expected media identities through a `practiceTakeCoreHash` whose
  projection excludes outward sync-map links;
- immutable media identity/metadata with separately mutable availability/tombstones;
- distinct optional `ReferenceVideo` and `TakeVideo` records; and
- replaceable `PracticeAssessment` derived from fixed sources.

Document edits, later corrections/reanalysis, media deletion/eviction/relink, or new assessment
algorithms cannot mutate old revisions, takes, or source evidence. Native StringSight interchange
is the only lossless editable round trip.

### 2. Use renderer-independent integer musical time

Persist score positions and half-open ranges as integer ticks with ordered integer tempo/meter maps.
The exact v1 PPQ is contingent on final acceptance; 960 is the proposed spike candidate. Practice
speed is a runtime rational multiplier and never rewrites authored tempo.

Page/system layout, current selection, playhead, active range, zoom, view, and panel state are not
authored content. Four bars per system is presentation only.

### 3. Use one canonical guitar model

One deterministic domain model owns strings, tuning, capo-relative frets, scale length, handedness,
pitch mapping, possible locations, voicings, and transition cost. MIDI pitch is derived from
string/fret/tuning/capo and is not a second editable truth. Renderer, MIDI, detector, and UI models
adapt to it.

### 4. Use one logical transport and one application audio runtime

`PracticeTransport` is the sole command and musical-time authority for play, pause, stop, seek,
speed, range, loop, count-in, cursor, reference, replay, capture, and media following.
`AudioRuntime` lazily owns one interactive `AudioContext`, isolated output/capture buses, leases,
generations, exact render-frame mappings, and output diagnostics.

React, notation, alphaSynth, MIDI, `HTMLMediaElement`, recorder, decoded-frame, and worker callbacks
are observations/acknowledgements only. They cannot change transport generation, tick, phase, or
loop pass. Sharing an `AudioContext` is necessary for sample-domain audio scheduling but is not by
itself proof that another player is subordinate.

Microphone start/pause/resume/stop/discontinuity boundaries are acknowledged as exact audio-context
frames by the capture worklet and mapped piecewise to contiguous logical recording frames and the
existing Session milliseconds. The current capture-owned context and coarse control acknowledgements
are a protected implementation baseline to refactor only after final acceptance.

### 5. Use explicit, separate timed-media mappings

`ReferenceScoreMediaSyncMap` binds an exact immutable document revision/content projection and
reference-media identity to ordered score-tick/media-PTS anchors. It defines validated piecewise
forward/inverse mapping, introductions, pauses, cuts, rubato, gaps, boundary ownership, stale
detection, and immutable rebase/re-author history.

`TakeCaptureMediaSyncMap` binds one immutable `practiceTakeCoreHash` and take-video content hash to
camera/frame/encoder/container timestamps, audio-context and logical recording frames, and
transport/capture generations. The take never embeds the map hash: a versioned
`TakeVideoAttachmentState` selects a current immutable map after take-core and media finalization,
avoiding circular identity. Its score relationship is derived through persisted take epochs. It
cannot be replaced by or treated as an authored reference map.

An `HTMLMediaElement` keeps its own decoder/presentation clock. A non-React follower compares target
and presented PTS at the same performance-time coordinate, derives feed-forward nominal media rate
from the local score/media slope and tick/output-second rate, and applies a measured bounded hard-
seek/rate-correction policy with hysteresis and degradation. Production correction requires a post-
spike-approved policy; the disposable spike may run immutable predeclared experimental policies.
Media events never advance the transport. Optional-video failure preserves P0 unless a separately
approved video-required mode is explicitly selected.

Mapless media is available only through an explicit transport-owned unsynchronized-preview phase.
The score tick freezes while a distinct media-preview PTS moves; loops, clicks, capture, assessment,
and alignment claims are disabled. Play/pause/media-seek/stop/exit still pass through
`PracticeTransport`, so preview does not create an independent media transport.

### 6. Keep reference and take audio roles explicit

One selected reference source at a time enters an isolated reference bus with gain/mute/solo.
Reference-video audio may use a media-element source, separately decoded/scheduled audio, or be
omitted only after spike evidence and owner acceptance. Routing it through the runtime does not make
its media clock sample-exact.

Camera capture requests video only and verifies no audio track. Microphone/worklet PCM remains the
authoritative take audio/evidence. Embedded take-video audio is muted/excluded by default and never
silently analyzed.

### 7. Keep notation, import, MIDI, synthesis, and media behind adapters

Canonical editor commands and storage contain no third-party graph/type. Adapters project immutable
documents into render/player/import representations and return stable canonical IDs, geometry,
capabilities, reports, and diagnostics.

Standard MIDI File import is raw-event-preflighted and converted into canonical ticks/tempo/meter
maps with quantified loss. SMF is never an independent runtime clock. Authored-document MIDI and
observed-session MIDI remain separate.

alphaTab 1.8.4 may be evaluated only after explicit owner authorization of MPL-2.0 evaluation and
source/notice procedure. Exact evidence is pinned to npm integrity
`sha512-VN5rfTZZWgA63Ny1aDKCp02k3Qm9CHhg4Q9AnK0kHm7G+fNDNZo36TeToPDFoJ6VpB9+AHcCrHwHFUP1tKqdsw==`
and upstream commit `022a45c8e42370f9e12e68949d11eada370da83d`.

The candidate order is:

1. public alphaSynth output proven subordinate to StringSight authority;
2. bounded rendered PCM scheduled by `AudioRuntime`, only if speed/range/tail/memory/edit-latency
   fixtures pass;
3. StringSight-owned shared-context reference rendering; or
4. omit synthesized reference playback.

Private APIs, source patching to force adoption, and independent live clocks are rejected.

### 8. Persist identity and availability transactionally

Practice repositories validate current documents, immutable revisions, evidence snapshots, takes,
maps, assessments, media identity/state, and durable operation intents. Use one IndexedDB
transaction when possible or an idempotent durable multi-step intent across storage boundaries.

Finalize, resolve, tombstone, purge, relink, migration, quota, blocked-upgrade, corruption,
multi-tab, and missing-media behavior is explicit. Tombstone commits before byte purge. Relink
requires expected-hash equality and cannot mutate immutable identity.

Deletion previews and preserves the D9 policy: referenced revisions/snapshots remain archived,
structured export is default, private PCM/video is opt-in, media deletion removes availability but
retains honest identity/tombstone, and full related deletion is a separate enumerated action.

### 9. Preserve accessibility, testing, and audio priority at every boundary

Domain/math/map/follower/persistence logic is testable without React or hardware. Adapters use
golden fixtures and injectable ports. Runtime/transport use deterministic frame clocks and race/
stale-generation tests. The score has ordinary semantic inspection/editing independent of rendered
glyphs. All essential commands are keyboard/screen-reader/zoom/reflow operable.

Under load, UI animation, video observation/capture quality, notation rerender, and assessment
degrade before audio render, microphone capture, and evidence continuity. Every dropout or missing
span is explicit.

## Alternatives considered

### Put practice fields in `Session`

Rejected. Authored intent and evidence have different time, correction, persistence, and deletion
semantics.

### Persist alphaTab or another renderer/player graph

Rejected. It couples file compatibility, undo, migration, and identity to dependency internals.

### Let alphaSynth, Tone.js, media elements, or React own playback state

Rejected. It creates competing commands/clocks and cannot preserve exact loop/capture/take identity.
`@tonejs/midi`, if later accepted, is binary interchange only and does not imply Tone.js transport.

### Treat every subsystem as sharing one timebase

Rejected as imprecise. Logical authority is singular, but physical clocks/timestamps need explicit
measured mappings and uncertainty.

### Use one score-media map for both video roles

Rejected. Reference video is author-aligned to a score revision; take video is captured against
audio/capture epochs and one take.

### Trust `MediaRecorder` blob delivery timing as frame sync

Rejected. Recorder events/chunk timecodes do not prove a per-frame audio-context mapping. Container
inspection or timestamped frame evidence is required, otherwise alignment is approximate/omitted.

### Independent capture and playback `AudioContext`s

Rejected for production. Separate context clocks cannot be assumed phase-aligned. Existing
capture-owned context is a migration baseline, not the target architecture.

### Make video required for ordinary practice

Rejected by accepted D1/D2. Video is a gated P1 enhancement and cannot weaken P0.

## Consequences

### Benefits

- Score edits, takes, evidence, corrections, media, and assessment stay reproducible.
- Notation, synthesis, MIDI, codecs, and storage implementations remain replaceable.
- Musical selection survives layout/reflow and maps deterministically to audio/capture/media.
- Reference/take video failure has an honest local audio-only path.
- Timing claims name their source, rounding, uncertainty, and generation.

### Costs

- More explicit contracts, immutable snapshots, hashes, mappings, and migration work.
- The capture controller must move to runtime leases and exact frame acknowledgements without
  regressing completed behavior.
- Video following/capture requires browser-specific measurement and may be omitted.
- A renderer-independent editor and semantic accessibility surface require dedicated work even if
  a capable notation renderer is selected.

### Risks and mitigations

- **Competing authority:** serialized commands/generations and stale callback rejection.
- **Follower oscillation:** measured enter/exit thresholds, dwell, cooldown, correction caps, and
  explicit degradation.
- **Timestamp overclaim:** separate camera, encoder, container, delivery, performance, output, and
  presented-frame observations.
- **Media identity loss:** immutable hashes plus mutable state/tombstones and verified relink.
- **MPL obligations:** no evaluation/install before owner authorization; exact package/source pin,
  notices, assets, modifications, and clean-release evidence before production acceptance.
- **Resource contention:** simultaneous-workload spike and audio-first degradation.
- **Inaccessible renderer:** independent semantic score/editor and ordinary command controls.

## Contingent decisions and validation obligations

This ADR intentionally does **not** accept:

- alphaTab/alphaSynth or any notation/import/reference candidate;
- MPL-2.0 production distribution;
- `@tonejs/midi` or a raw SMF parser;
- PPQ/hash/canonical schema details;
- a reference-video audio path;
- `MediaRecorder`, TrackProcessor, WebCodecs, codec, container, or muxer;
- count-in capture/Session-zero policy;
- IndexedDB store layout or cross-store deletion mechanics; or
- performance, drift, seek, memory, bundle, storage, or quota budgets.

Acceptance requires:

1. Owner resolution of alphaTab evaluation/license process, candidate order, fixture/hardware
   matrix, and invariant-based disqualifications.
2. Repeatable raw results from `../plans/11-notation-audio-video-feasibility-spike.md` covering
   notation/import, one-authority synthesis, all clock mappings, both media maps, follower
   correction, take timestamps, full simultaneous load, security, accessibility, and licensing.
3. Explicit post-spike technology/fallback/format/license/budget decisions.
4. Golden contract/migration/map fixtures for the accepted schema.
5. Independent review against ADRs 0001-0005 and accepted D1-D10 with no blocking contradiction.

Until those gates pass, this ADR remains Proposed and authorizes no production dependency, schema,
database migration, runtime refactor, or media implementation.
