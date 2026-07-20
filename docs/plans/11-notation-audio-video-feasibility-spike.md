# Disposable notation, audio, MIDI, and video feasibility spike

- **Status:** Approved for disposable execution; owner decisions recorded in section 3
- **Prepared:** 2026-07-20
- **Owner approval recorded:** 2026-07-20
- **Execution:** A separate disposable branch/worktree; no spike code is production architecture
- **Architecture:** `10-practice-system-architecture.md`
- **Synchronization research:** `../research/practice-transport-and-timed-media-sync.md`
- **Decision record:** `../decisions/0006-practice-document-audio-runtime-and-notation-adapters.md`

## 1. Purpose and non-goals

Collect repeatable evidence needed to accept or reject notation/import/reference-playback and
timed-video candidates without weakening StringSight's canonical state, one-authority runtime,
protected microphone/evidence behavior, local-first policy, or accessible score-centered product.

This spike may create isolated harnesses, fixtures, scripts, browser pages, raw reports, and throwaway
adapter prototypes. It may not:

- change production contracts, UI, capture, persistence, or build architecture;
- merge spike code wholesale;
- install alphaTab before explicit MPL evaluation authorization;
- claim a dependency/codec/container/schema/budget is accepted;
- persist third-party object graphs;
- use private/undocumented APIs or patch a dependency to force a result;
- make MIDI/video the primary canvas; or
- hide a failed candidate by running two transports/clocks.

The final artifact is a report with environment manifests, fixture hashes, raw results, scripts,
failures, and a candidate/fallback recommendation for a separate acceptance gate.

## 2. Questions the spike must answer

### 2.1 Notation, import, MIDI, and licensing

1. Does the exact candidate render guitar tab and optional notation for representative scores with
   stable canonical event/tick/geometry mappings and acceptable resize/zoom behavior?
2. Can canonical edits rebuild/update renderer input without retaining a dependency graph as source
   truth, and what are edit-to-render costs for visible/page/continuous views?
3. Which exact Guitar Pro, MusicXML/MXL, alphaTex, and MIDI semantics are preserved, converted,
   approximated, rejected, or dropped by pinned versions?
4. Can raw SMF preflight account for every event before high-level conversion? If not, what narrower
   user-facing claim is defensible?
5. Can import and render be bounded/cancelled under corrupt, compressed, oversized, deeply nested,
   and metadata-hostile inputs?
6. If alphaTab evaluation is authorized, what exact MPL Covered Software, npm/plugin/assets,
   transitive packages, notices, Source Code Form, modifications, and release procedure would a
   production build require?

### 2.2 One-authority reference synthesis

1. Can pinned alphaSynth output through public `ISynthOutput` beneath the application-owned context
   while `PracticeTransport` alone owns tick, phase, range, speed, loop, count-in, cursor, and
   generation?
2. Can stale/extra samples, callbacks, autonomous finish/loop, mismatch, seek races, and tail leakage
   be rejected deterministically?
3. If preferred output fails, can bounded rendered PCM preserve pitch, selected attacks, tempo-map
   shape, speed, note-off/release tails, loop cleanup, memory, chunk identity, and edit latency?
4. If bounded PCM fails, what measured cost/quality would a StringSight-owned shared-context
   reference renderer have? If that is not viable, is omission the honest result?

### 2.3 Audio runtime and protected capture

1. Can one runtime coexist with the existing Vite application, Basic Pitch/analysis workers,
   capture worklet, candidate notation workers/worklets, reference output, metronome, take replay,
   media-element audio, and camera/encoder without asset-path hacks or weakened isolation?
2. Can capture leases release only tracks/nodes while other audio clients continue?
3. Can worklet commands apply/acknowledge exact target frames for start, pause, resume, stop, late
   command, gap, overlap, and stale generation?
4. Under the full workload, are capture chunks/evidence continuous, and which optional workload
   must degrade first?

### 2.4 Reference video

1. Which imported containers/codecs decode on exact Chrome/Edge/hardware targets, including VFR and
   keyframe variation?
2. Does `requestVideoFrameCallback` supply reliable presented PTS/diagnostics, and what fallback is
   available when missing/late/skipped?
3. Do one-anchor and multi-anchor maps handle intro, rubato, pauses, cuts, gaps, stale revisions,
   inverse lookup, and deterministic boundaries?
4. What initial-start, seek-settle, steady-drift, presentation, loop, correction, and degradation
   behavior results under one transport?
5. Does routed media-element audio behave acceptably under seek/speed/correction/pitch preservation,
   or is separate decode/omission required?

### 2.5 Take-video capture

1. Can camera permission, video-only acquisition, selection, revocation, track end, and reconnect be
   handled without opening a second microphone/evidence path?
2. Which candidate timestamp strategy supplies the most defensible mapping among camera frames,
   performance observations, audio-context frames, logical recording frames, encoder/container PTS,
   and presented PTS?
3. How do `MediaRecorder`, TrackProcessor observation plus recording, and WebCodecs+muxing behave for
   start latency, timeslice, pause/resume, drops, queues, keyframes, timestamp offsets, finalization,
   resource cleanup, and errors?
4. Can take mapping survive loop passes, transport/capture generations, pauses, discontinuities,
   reload, media missing/relink, and immutable take identity?
5. If no candidate meets the invariant, what honest approximate/omitted fallback preserves P0?

## 3. Owner decisions recorded for execution

The owner approved the following on 2026-07-20. This authorizes only the isolated disposable spike;
it does not accept a production dependency, license procedure, codec/container, architecture plan,
schema, synchronization policy, supported-platform claim, or measured budget. Copy this decision
record into the spike report before package installation or media runs.

1. **alphaTab evaluation authorized:** evaluate `@coderline/alphatab@1.8.4` under MPL-2.0 and record
   exact source, notice, asset, transitive-license, modification, Source Code Form, and release
   evidence. Authorization to evaluate is not authorization to ship.
2. **Candidate order approved:** use the notation/import, reference-synthesis, SMF, reference-video,
   reference-video-audio, and take-video order and fallbacks in section 8. Select the earliest
   candidate that satisfies every invariant and later-accepted measured budget; do not prefer a
   more complex candidate merely because it exposes more APIs.
3. **Desktop test matrix approved:** cover current stable Chrome and Edge on Windows 11 and macOS
   where physical hardware is available, using low (4-core/8 GB/integrated graphics),
   representative (the inventoried development machine and normal interface/camera), and high
   (8+ cores/16+ GB/modern integrated or discrete graphics) tiers. Exercise the section 5 fixtures,
   including 8-, 100-, and 500-bar scores; 10-second, 2-minute, 5-minute, and longer drift media;
   0.5x through 2x speeds; CFR/VFR, keyframe, codec/container variation; and isolated through full
   simultaneous workloads. Every run records exact hardware, OS, browser, device, and fixture
   identity. Unavailable physical tiers or operating systems are recorded as missing coverage, not
   simulated by CPU throttling; initial spike work may proceed, but final acceptance must either
   obtain the missing evidence or narrow the supported claim explicitly.
4. **Invariant disqualifications confirmed:** reject competing transport/audio authorities,
   canonical third-party state, a hidden second microphone/evidence path, ambiguous reference/take
   maps, silent identity retargeting, recorder-delivery timestamp overclaims, inaccessible
   glyph-only editing, and any design in which optional video blocks P0.

## 4. Reproducible spike layout

Suggested disposable layout (names may change, separation may not):

```text
spikes/practice-integration/
  README.md
  package-lock.json             exact isolated dependency resolution
  provenance/
    environment.json
    dependencies.json
    alphatab-source.json
    browser-capabilities.json
  fixtures/
    manifest.json
    canonical/
    notation-import/
    smf/
    reference-media/
    take-capture/
    hostile/
  harness/
    canonical-adapter/
    synth-authority/
    capture-epochs/
    media-follower/
    take-capture/
    simultaneous-load/
    semantic-score/
  scripts/
  raw-results/<run-id>/
  report.md
```

Every run ID records:

- repository commit/dirty state and spike harness version;
- OS/build, CPU/GPU/RAM, power mode, audio input/output, camera, display refresh;
- exact browser binary/version/flags and cross-origin-isolation/security context;
- Node/npm and dependency lock/hash/license inventory;
- fixture IDs, byte hashes, duration, dimensions, frame/tempo/map metadata;
- cold/warm state, visible/background state, zoom/viewport;
- requested/actual audio/camera/media settings;
- raw timestamp/event trace and metric schema version; and
- outcome, failure/fallback reason, console/error diagnostics.

Raw JSON/CSV traces are retained. Charts/summaries are derived and link their source run IDs.

## 5. Fixture suite

### 5.1 Canonical score fixtures

- `tiny-linear`: 8 bars, simple notes/chords and exact stable IDs.
- `accepted-techniques`: every accepted D4 notation/technique row in isolation and combination.
- `two-voice-meter-tempo`: two voices, tuplets, ties/slurs, sounding-duration differences, at least
  three tempo changes and two meter changes including compound/odd grouping.
- `import-loss`: grace notes, repeats/endings, unsupported techniques, ambiguous fingering, and
  source metadata requiring explicit dispositions.
- `medium-edit`: 100 bars/about 2,000 events for command/render/sound latency distributions.
- `long-score`: 500 bars/about 10,000 events for stress/navigation/resource evidence.
- guitar variants sufficient to prove model projection does not assume array order, including capo
  and alternate tuning as domain representation even if not release-evaluated.

Each has canonical JSON, expected semantic projection, stable event/tick mapping, and fixture hash.
The spike does not freeze the production schema; it uses a spike-owned projection version.

### 5.2 Import fixtures

- exact approved candidate versions of GP5 and representative GP7/GP8, MusicXML, compressed MXL,
  alphaTex if applicable, and SMF type 0/1;
- every accepted technique/semantic row and every documented unsupported/loss path;
- MIDI PPQ/tempo/meter/key, notes/velocity, controller, pitch bend, aftertouch, SysEx,
  sequencer-specific/unknown meta, markers/text/lyrics, malformed variable length/status, and
  truncated tracks;
- oversized/decompression-bomb-like bounded fixtures, deeply nested XML, external entity/resource
  attempts, invalid UTF/text, and hostile displayed metadata.

Fixture licenses/provenance permit repository distribution or use deterministic generated private
fixtures outside the repository with public manifests/expected hashes.

### 5.3 Reference-media fixtures

Generate licensed content with visible/audible time marks and known PTS:

- 10-second, 2-minute, five-minute, and longer drift-soak media;
- 24, 25, 29.97, 30, 50, 59.94, and 60 fps CFR plus at least two VFR timelines;
- short/medium/long keyframe intervals;
- every negotiated candidate container/codec and unsupported/truncated/corrupt samples;
- reference audio with transients and pitch for rate/preservation observation; and
- 1, 2, and many-anchor score maps including intro, rubato, pause, cut, gap, unmapped ends,
  reversed/duplicate anchors, stale score revision/hash, and changed media identity.

Ground truth is container PTS plus generated content identity, not the media element's event time.

### 5.4 Take-capture fixtures

- Browser fake camera for deterministic automation where possible plus real cameras from each
  hardware tier.
- A visible LED/flash or high-contrast frame transition and an audio impulse/loopback path for
  optional physical camera-microphone offset characterization.
- Starts/stops, pause/resume, repeated loop passes, foreground/background, device loss/revocation,
  encoder overload, quota pressure, and five-minute safe duration.
- Video-only stream assertion, including a negative test that deliberately supplies an audio track
  and must fail preflight/remove it before recording.

### 5.5 Accessibility fixture

An ordinary semantic score representation for the medium fixture with keyboard entry, selection,
range adjustment, undo/redo, validation issues, transport commands, and renderer-independent focus.
Test at 100%/200% zoom and supported desktop reflow.

## 6. Instrumentation

### 6.1 Authority trace

Emit a bounded event log with:

```text
sequence, runId, performanceTime, source
transportGeneration, captureGeneration, followerOperation
command/observation kind
transport target: score-synchronized | unsynchronized-media-preview
score tick/phase/range/speed/loopPass when applicable
media-preview PTS when applicable; never inferred as a score tick
audio context frame/time when applicable
logical frame/session ms when applicable
media/camera/input/encoded/muxed/presented PTS when applicable
map/segment/fixture ID
authoritative | derived | estimated | observed classification
uncertainty, rounding, stale/rejected reason
```

An offline validator rejects any trace in which a non-transport event changes authoritative
tick/phase/generation/loop state, an old generation is admitted, or a conversion lacks provenance.

### 6.2 Audio/capture instrumentation

- worklet applied target frame acknowledgements and late-by frames;
- render/sample rate/context state, base/output latency, `getOutputTimestamp` samples;
- chunk sequence/start/logical/context frames, in-flight count, transport latency;
- dropped chunks, gaps/overlaps/discontinuities, analyzer completion and evidence counts;
- click/reference scheduled frames and actual rendered/loopback observations where available; and
- exact isolation graph assertion proving output buses do not reach capture/analyzers.

### 6.3 Media/follower instrumentation

- readyState/networkState, load/metadata/canplay/seeking/seeked/waiting/stalled/playing/pause/ended/
  error events as observations;
- `requestVideoFrameCallback` media/presentation/expected-display time, presented count,
  processing duration, callback lateness and gaps;
- target/observed PTS, signed error, observation age, nominal/applied rate, correction entry/exit,
  dwell/cooldown, hard seek, settle, stall/recovery/degrade; and
- map forward/inverse residual, boundary/gap result, stale/hash validation.

Before measurement begins, freeze each experimental follower policy as a separately versioned
fixture with thresholds, dwell, rate bounds, observation-age rules, and hard-seek behavior. A run
records that exact policy ID. These policies may exercise correction in the disposable spike but are
not eligible for production until the post-spike acceptance decision.

### 6.4 Capture/encode/container instrumentation

- permission/track settings and exact video-only track inventory;
- MediaRecorder start/pause/resume/data/error/stop performance observations, BlobEvent timecode,
  sizes, requested/actual MIME;
- TrackProcessor frame sequence/timestamp/duration and queue/drop/close behavior;
- WebCodecs input frame PTS, encode queue, output chunk PTS/type/size, dequeue/error/flush/reconfigure;
- muxed track PTS/DTS/edit-list/keyframe/container metadata after finalization; and
- first/last usable frame, finalization time, memory/resource symptoms, storage/quota state.

Recorder chunk delivery time is always labelled delivery. It cannot populate an exact camera-to-
audio frame anchor.

### 6.5 Performance instrumentation

Record command reduction, visible/page/continuous render, edit-to-sound, import, worker queue,
long-task, frame-callback, encode/finalize, browser memory where exposed, process/system memory where
the harness supports it, bundle chunks, decoded assets, storage growth, and all audio dropout
signals. Tool limitations and observer overhead are recorded.

## 7. Procedures and result tables

### 7.1 Notation/canonical boundary

1. Verify lockfile/package/source hashes and licenses.
2. Project canonical fixture to candidate-owned graph.
3. Render all views and capture stable event/tick/geometry mapping.
4. Discard/rebuild graph after commands; verify canonical state/hash is unchanged except expected
   command output and no candidate type serialized.
5. Repeat import twice and compare deterministic draft/report disposition counts.
6. Run the full semantic accessibility workflow without focusing candidate glyphs, first by keyboard
   alone and then with a named screen reader/assistive-technology build on each approved browser/OS
   pairing. Record announcements, focus order/restoration, selection/range state, error/status output,
   and transport operation; DOM inspection alone is not a screen-reader pass.
7. Run medium/long score measurements cold/warm, resize, and 200% zoom.

Pass: no canonical leakage; stable mapping/report; all accepted profile rows explicitly disposed;
hostile inputs bounded/cancelled; semantic workflow operable. Candidate performance is reported for
budget acceptance later rather than silently waived.

### 7.2 Raw MIDI accounting

For each SMF, preflight raw bytes, accumulate absolute ticks, assign one disposition to every event,
run high-level conversion, and reconcile counts/source byte ranges. Round-trip supported canonical
events and report every loss/quantization.

Pass: header/track parsing is bounded; every raw event accounted exactly once; no guitar fingering
claim; authored vs observed MIDI separated. If full inspection cannot pass, the fallback is an
explicitly narrower SMF subset and file-level possible-loss warning, not a false complete report.

### 7.3 Synth authority torture test

Run play/pause/seek/play, speed/range changes, 1,000 loop transitions, duplicate/late finished and
position callbacks, stale samples, under/over production, tail events, tempo changes, and runtime
suspension/reset. Compare every output envelope/event boundary to transport target frames.

Invariant pass:

- only transport commands change authoritative state;
- internal synth loop/metronome/count-in disabled;
- old generation output/callbacks rejected;
- no autonomous restart/finish advances loop;
- no stuck/leaked tail or missing/doubled boundary attack; and
- mismatch becomes a visible safe failure, not hidden clock correction.

Preferred candidate failure triggers bounded-PCM tests. Bounded PCM passes correctness only when
pitches are unchanged, attacks match the half-open range, all test speeds preserve tempo shape,
tails are explicit/bounded/cleaned at loops, chunked/one-shot output is equivalent, and edits become
audible through the measured path. Failure triggers the custom shared-context candidate or omission.

### 7.4 Capture epoch procedure

Schedule commands at known future frames, deliberately late frames, during render-quantum edges,
and across multiple pause/resume segments. Inject bounded gap/overlap and stale generations. Verify
exact applied frames, logical/session mapping, half-open start/stop semantics, gap policy, and
round-trip provenance.

Pass: worklet-applied frames are used; pause wall time excluded; no stale epoch admitted; missing
frames never silently compressed; sample-rate/device discontinuity follows explicit policy.

### 7.5 Reference map and follower

Validate every map fixture forward/inverse at anchors, adjacent ticks/PTS, boundaries, gaps, and
unmapped ends. Run start, seek at/away from keyframes, steady playback, speed changes, loops,
visibility changes, stalls, decode errors, stale-map/source changes, and disposal races.

For each presented-frame sample, reconstruct the target at that frame's `expectedDisplayTime` using
the nearest qualified output-context/performance timestamp pair. Record pair age/uncertainty and
reject fine correction across stale pairs or discontinuities. Compute feed-forward nominal media
rate from the local score-to-media slope times the current score-tick/output-second rate, then apply
only the predeclared candidate correction around it.

Collect separately:

- initial target-to-first-presented error and readiness delay;
- post-seek settled error and settle time;
- steady drift slope/max absolute error and observation age;
- output estimate vs presentation estimate/physical observation;
- correction duration/count/oscillation and hard-seek cooldown;
- loop/new-generation first-frame error and old-callback rejection; and
- dropped decoded/presented/callback counts.

Invariant pass: deterministic map results; explicit gaps/stale behavior; no media callback changes
transport; correction stays bounded/hysteretic; excessive instability degrades; optional failure
does not interrupt P0.

### 7.6 Unsynchronized preview

Using a mapless reference-video fixture, enter preview explicitly and exercise play, pause, media
seek, stop, exit, source replacement, and stale callback races. All actions must appear first as
`PracticeTransport` commands in the authority trace. Verify the score tick remains frozen, only the
separate media-preview PTS advances, score/audio/metronome/count-in/capture/assessment controls are
disabled, and the UI makes no aligned-cursor or score-position claim. Exit must restore the frozen
score tick under a new generation.

Pass: there is one command authority, no media-to-score conversion, no stale callback admitted, and
the fallback is visibly labelled unsynchronized. Failure removes preview rather than permitting
independent media-element controls.

### 7.7 Reference-video audio

For media-element routing, separate decode/schedule if implemented, and omission baseline, measure
start/seek/drift/rate/pitch/buffering/output behavior, gain/mute/solo, context/device lifecycle, and
capture graph isolation. Use headphone/loopback conditions deliberately and label physical bleed.

Pass: exactly one selected reference source, explicit audio policy, no software capture path, and
honest rate/pitch behavior. Select the least complex candidate satisfying invariant and post-spike
quality/budget approval; otherwise omit video audio.

### 7.8 Take-video strategy comparison

Run the same take matrix for:

1. MediaRecorder plus anchors/container inspection;
2. TrackProcessor timestamp observation plus recording;
3. WebCodecs plus reviewed muxing; and
4. no-video/approximate fallback baseline.

For each, reconstruct the `TakeCaptureMediaSyncMap`, derive score positions through exact take
epochs, reload traces/media, and verify identical segment/discontinuity results. Compare camera-to-
microphone start offset/uncertainty, drops by stage, pause mapping, PTS offsets, finalization,
resource/storage load, cleanup, and device/permission failure.

Invariant pass: video-only input; immutable take binding; timestamp kinds remain distinct; no
BlobEvent delivery overclaim; explicit discontinuities; hash-bound reload; audio evidence preserved.
If exact budget is not met, recommend labelled approximate alignment or omission—not a fabricated
precise map.

### 7.9 Full simultaneous workload

Warm required assets, then run notation, selected reference playback/audio, metronome, microphone
capture/analysis, optional camera encoding, video playback/follower, and UI updates together. Repeat
on every approved hardware/browser tier for short, five-minute, and drift-soak durations.

Capture continuity correctness is blocking: no unexplained audio gaps, lost evidence, hidden worker
failure, or output-to-input graph route. All optional degradation actions and their activation trace
must be recorded. Long tasks, audio transport latency, render/encode queues, memory, storage, and
finalization are raw results for final budget setting.

## 8. Candidate and fallback order

Subject to owner approval:

| Capability            | Ordered evaluation                                                                                                                                         | Required fallback                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Notation/import       | alphaTab 1.8.4 if MPL evaluation authorized; then permissive VexFlow/OSMD combinations for their actual scope; then bounded custom/narrower format support | Narrow supported renderer/import claims; native semantic editor remains                   |
| Reference synthesis   | Public subordinate alphaSynth; bounded rendered PCM; StringSight-owned shared-context renderer                                                             | Omit synthesized reference rather than two clocks/private API                             |
| SMF                   | Reviewed raw preflight + candidate high-level parser/writer                                                                                                | Narrow SMF subset/possible-loss warning or omit route                                     |
| Reference video       | HTML media element follower using presented-frame observations                                                                                             | Lower-confidence currentTime follower, unsynchronized preview, or omit synchronized video |
| Reference-video audio | Media-element source; separately decoded/scheduled if justified                                                                                            | Mute/omit video audio                                                                     |
| Take video            | MediaRecorder+inspection; processor-observed timestamps; WebCodecs+muxer if evidence justifies cost                                                        | Label approximate or omit take video                                                      |

A simpler earlier candidate is selected when it meets every invariant and later accepted measured
budget. A complex fallback is not selected merely because it exposes more APIs.

## 9. Pass/fail classification

Each row in the final report is one of:

- **PASS invariant:** correctness/ownership/privacy/accessibility requirement satisfied.
- **PASS measured candidate:** raw data complete; candidate is eligible for post-spike budget review,
  not yet accepted.
- **FAIL candidate:** repeatable invariant, support, reliability, resource, or quality failure;
  include minimal reproduction and next fallback.
- **INCONCLUSIVE:** instrumentation/fixture/hardware cannot answer; this is blocking when the row is
  required and cannot be converted to a narrower honest product claim.
- **OMIT:** owner-approved absence preserves P0 and is explicit in capability/UI.

Fixed blocking failures, independent of final numeric budgets:

- a second authority/clock can affect user-visible transport;
- third-party state leaks into canonical/persisted state;
- raw import events/semantic losses disappear without report;
- capture/video opens or admits a second microphone evidence path;
- stale generation/map/media callbacks mutate current identity/state;
- recorder delivery timing is claimed as exact frame alignment;
- output reaches software capture;
- missing/deleted media mutates immutable score/take/evidence;
- optional video failure blocks normal P0; or
- essential editing/practice cannot be completed through the semantic keyboard/screen-reader path.

Numeric acceptability remains post-spike. The report proposes budgets only from distributions and
known user impact, never retrofits a threshold to make a preferred dependency pass.

## 10. Required report tables

1. Environment/hardware/browser matrix and missing coverage.
2. Exact dependency/package/source/license/asset inventory.
3. Canonical boundary and supported semantic/import disposition matrix.
4. Raw SMF event reconciliation and quantization table.
5. Synth authority trace violations and fallback comparison.
6. Capture epoch boundary/round-trip results.
7. Reference-map forward/inverse/stale/gap fixtures.
8. Reference follower start/seek/drift/correction/loop/stall results.
9. Reference-video audio candidate results.
10. Take capture strategy timestamp/drop/finalization/resource comparison.
11. Full simultaneous workload audio continuity and optional degradation.
12. Bundle/assets, command/render/sound, long-score, memory, storage/quota, and failure data.
13. Accessibility/zoom/reflow results.
14. Candidate recommendation, fallback/omission, unresolved risk, and proposed final budgets.

## 11. Exit and cleanup

The spike is complete only when every required row has raw reproducible evidence or a clearly
approved narrower/omitted fallback. Before handoff:

- run the harness from a clean isolated checkout using documented commands;
- verify fixture/result hashes and links;
- confirm production directories/manifests were not changed;
- record packages/assets created only for the spike;
- preserve report/data needed for review while marking prototype code disposable; and
- obtain an independent review for authority, timing claims, media identity, licensing,
  accessibility, measurement validity, and circular pass criteria.

The next gate explicitly accepts or rejects technology, MPL procedure, supported format claims,
codec/container/capture strategy, count-in mapping, fallbacks, and numeric budgets. Only then may
the Proposed architecture/ADR become Accepted and production implementation begin in checklist
order.
