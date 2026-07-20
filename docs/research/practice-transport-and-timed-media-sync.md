# Practice transport and timed-media synchronization research

- **Status:** Proposed architecture research; raw spike evidence pending
- **Prepared:** 2026-07-20
- **Scope:** Canonical score/MIDI time, application audio time, microphone evidence, reference
  video, take video, presentation observations, and their explicit mappings
- **Related:** `../plans/10-practice-system-architecture.md`,
  `../plans/11-notation-audio-video-feasibility-spike.md`, and
  `../decisions/0006-practice-document-audio-runtime-and-notation-adapters.md`

## 1. Conclusion

StringSight needs one **logical command and musical-time authority**, not a claim that every browser
subsystem shares one physical clock. `PracticeTransport` owns the current score tick, phase, range,
speed, generation, and loop pass. The application-owned `AudioRuntime` supplies the authoritative
real-time render clock for audible scheduling and exact microphone capture boundaries.

An `HTMLMediaElement`, camera, encoder, and container each retain their own clocks or timestamp
domains. They follow the transport through explicit, measured maps. A callback from notation,
alphaSynth, a media element, a recorder, or a decoded frame is an observation or acknowledgement;
it never advances score position, changes the loop pass, or creates a transport generation.

The architecture therefore uses two distinct persisted media mappings:

- `ReferenceScoreMediaSyncMap`: authored score positions to reference-media presentation time.
- `TakeCaptureMediaSyncMap`: captured take-video presentation time to camera/capture observations,
  audio-context frames, contiguous logical recording frames, and take/capture generations.

The reference map cannot describe capture history, and the take map cannot be silently rewritten
as an authored reference alignment.

## 2. Terms and numeric rules

### 2.1 Normative units

- Score position is a non-negative integer `ScoreTick` at a document-declared integer PPQ. The
  proposed schema-v1 PPQ is 960, contingent on final acceptance after the spike.
- Render and capture positions are non-negative integer sample frames at the recorded sample rate.
- Persisted media presentation timestamps are signed 64-bit-compatible integer microseconds from
  the media timeline origin. Negative source timestamps are normalized only through an explicit
  edit-list/timeline-origin record; they are never clamped silently.
- Session evidence uses non-negative milliseconds relative to the first retained recording sample.
  Persist integer logical frames as identity and derive milliseconds for compatibility/display.
- `DOMHighResTimeStamp` values are floating-point milliseconds in a performance-time domain and
  are diagnostic anchors, not durable media or musical identity.
- Wall-clock ISO timestamps are metadata only.

JavaScript does not have an ordinary JSON integer type that safely represents every signed 64-bit
value. Persistence schemas encode frame and microsecond values as validated decimal strings when a
value can exceed `Number.MAX_SAFE_INTEGER`; runtime hot paths may use `bigint` or bounded integers.
JSON projection rules define the decimal representation and reject exponent notation, leading
zeros, negative zero, and out-of-range values.

### 2.2 Rounding and intervals

- Musical ranges, scheduled frame ranges, and media segments are half-open: `[start, end)`.
- Rational calculations retain integer numerator/denominator values until a required discrete
  boundary.
- Tick-to-frame and seconds-to-frame conversions use round-to-nearest, ties-to-even.
- A captured sample boundary is never reconstructed by rounding `AudioContext.currentTime`; it is
  acknowledged by `AudioWorkletGlobalScope.currentFrame`.
- Display-only milliseconds may round to three decimals. Display rounding never feeds another
  mapping.
- Piecewise-map boundary ownership belongs to the segment starting at the anchor, except the final
  endpoint, which belongs to the preceding segment for an exact inverse lookup.

Every conversion result carries or can resolve: source domain, destination domain, generation,
mapping/version ID, source anchors, rounding rule, maximum numeric quantization, measured residual
when available, and whether the value is authoritative, derived, estimated, or observational.

## 3. Clock and time-domain registry

| Domain             | Owner and unit                                                              | Origin/lifetime                                                     | Monotonicity and discontinuity                                                                                                                                   | Persisted representation                                                                                 |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Canonical score    | Immutable `PracticeDocument` revision; integer ticks                        | Tick 0 of that exact revision; revision lifetime                    | Non-decreasing within a voice/map; edits create a new revision, not a clock reset                                                                                | Integer tick plus revision ID and qualified content hash                                                 |
| Transport          | `PracticeTransport`; tick/rational sub-tick, phase, speed, range, loop pass | Loaded revision/range; generation changes on discontinuous commands | Advances only in `counting-in` or `playing`; seek, pause/resume scheduling, range/speed change, loop transition, failure/reset increment generation as specified | Snapshot is transient; takes persist command/configuration and epochs, not a mutable transport object    |
| Audio context      | `AudioRuntime`; seconds and absolute render frames                          | Context creation; frame 0 is first render block                     | Monotonic only while context runs; suspension stops progress; close/reset creates new runtime ID                                                                 | Runtime ID, sample rate, integer context frame anchors, optional context seconds                         |
| Microphone capture | Capture worklet; absolute context frames                                    | Same context frame domain as its runtime lease                      | Input samples processed in render order; device/sample-rate replacement terminates or creates a new capture generation                                           | Applied boundary context frame, capture generation, device/format provenance                             |
| Logical recording  | Recording controller/worklet; contiguous integer frames                     | First retained sample is frame 0                                    | Advances only for retained or explicitly represented missing frames; pause wall time is excluded; a bounded gap advances with unavailable-silence provenance     | Logical frame, segment/epoch ID, sample rate, gap/overlap record                                         |
| Observed Session   | Existing Session contracts; relative milliseconds                           | First retained sample                                               | Derived from logical frames; pause excluded; cannot establish output or video presentation truth                                                                 | Existing branded milliseconds plus frame/epoch linkage in future practice records                        |
| Reference media    | Container/demux/media element; PTS in integer microseconds                  | Declared media timeline after explicit edit-list normalization      | Usually monotonic inside a playable segment; cuts, gaps, duplicate PTS, discontinuities, or non-invertible spans must be represented/rejected                    | Media asset ID/hash, normalized integer PTS, container/timeline metadata                                 |
| Camera capture     | Camera/UA; `VideoFrame.timestamp`, best-effort capture time, sequence       | Track/capture generation                                            | Expected monotonic but frames may be dropped, duplicated, reordered by later stages, or reset on device loss                                                     | Exact observed timestamp kind/value, frame sequence, capture generation, availability/precision          |
| Encoder/container  | Encoder and muxer; input PTS, encoded-chunk PTS/DTS, muxed PTS              | Encoder/container track origin                                      | Reordering and timestamp offsets are codec/container dependent; pause/resume may create discontinuity                                                            | Input/coded/muxed integer timestamps and mapping provenance, never delivery time alone                   |
| Performance time   | User agent; `DOMHighResTimeStamp` milliseconds                              | `performance.timeOrigin` for a browsing context                     | Monotonic within the context, privacy-resolution limited, not stable across reload                                                                               | Diagnostic epoch ID, time origin metadata, numeric timestamp and observed resolution                     |
| Output estimate    | `AudioContext.getOutputTimestamp`, `baseLatency`, `outputLatency`           | Audio runtime/output device configuration                           | Estimated; changes with device/context; context and performance coordinates are paired                                                                           | Observation, supported fields, runtime/device ID, measured-at performance time, uncertainty class        |
| Presented video    | `requestVideoFrameCallback`; media PTS and performance timestamps           | Current media-element resource/generation                           | Observational; callbacks can be late or skipped; `presentedFrames` detects missed callbacks, not every decoded/drop cause                                        | Presented media PTS, presentation/expected display time, count, processing duration, callback generation |
| Wall clock         | System/browser; ISO timestamp                                               | Civil time                                                          | May jump and has no sync authority                                                                                                                               | Created/updated metadata only                                                                            |

The registry supersedes the overly broad “shared timebase” wording in the baseline architecture.
Session-relative time remains the evidence interchange domain from ADR 0003, but it is not the
physical clock for score playback, media presentation, or camera encoding.

Precision is explicit rather than inherited across domains:

- ticks, context frames, logical frames, and normalized media microseconds have integer identity;
- rational tempo/map calculations retain numerator/denominator until the target boundary;
- context seconds, Session milliseconds, and media-element seconds are IEEE-754 observations or
  compatibility projections and never replace their integer source;
- performance timestamps have the browser's current privacy-reduced resolution, which the spike
  measures per environment; and
- output, camera capture, and presentation timestamps are qualified estimates/observations unless
  the selected API and measured mapping proves a tighter relationship.

Runtime/context/capture/performance epochs end on context reset/close, browsing-context reload,
device/track replacement, or a generation-changing discontinuity as applicable. Persisted maps and
takes retain the old epoch IDs and never reinterpret their numeric values under a new epoch.

### 3.1 Conversion registry

| Direction                                             | Rule and rounding                                                                  | Numeric error and provenance                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source SMF tick -> canonical tick                     | Exact rational PPQ ratio, then ties-to-even only at accepted integer boundary      | <= 0.5 canonical tick numeric error; source PPQ/tick, parser/event, import policy                         |
| Canonical tick -> authored score microseconds         | Piecewise integer tempo integration; retain rational                               | Exact rational; document revision and tempo-map hash                                                      |
| Authored score microseconds -> canonical tick         | Select deterministic tempo segment, invert rational; optional ties-to-even integer | <= 0.5 tick only for integer result; tempo segment/hash and boundary rule                                 |
| Canonical tick -> transport context frame             | Apply rational speed to tempo integral, multiply sample rate, ties-to-even once    | <= 0.5 frame; transport/render anchor, generation, tempo hash, speed                                      |
| Context frame -> transport tick                       | Delta from same-generation render anchor, inverse tempo/speed rational             | Rational result exact relative to frame; displayed integer <= 0.5 tick plus 0.5-frame source quantization |
| Context frame -> context seconds                      | `frame / sampleRateHz`                                                             | Exact rational, floating representation at API boundary; runtime ID/sample rate                           |
| Context seconds -> context frame                      | `seconds * sampleRateHz`, ties-to-even only for a requested schedule               | <= 0.5 frame plus floating-input uncertainty; never used to reconstruct capture acknowledgement           |
| Context frame -> logical recording frame              | Piecewise capture epoch offset; gaps follow explicit missing-frame policy          | Exact in a validated segment; capture epoch/generation/gap record                                         |
| Logical recording frame -> Session milliseconds       | `frame * 1000 / sampleRateHz`                                                      | Exact rational, floating compatibility representation; take/capture epoch                                 |
| Session milliseconds -> logical frame                 | Use bound take sample rate, multiply and ties-to-even                              | <= 0.5 frame plus legacy millisecond precision; disallowed without epoch/sample-rate provenance           |
| Score tick -> reference-media PTS                     | Validated reference map segment rational, ties-to-even microseconds                | <= 0.5 us numeric plus authored/measured map residual; map revision/hash/anchors                          |
| Reference-media PTS -> score tick                     | Inverse of unique validated segment                                                | Rational exact relative to integer PTS; integer display <= 0.5 tick plus map residual                     |
| Transport tick -> follower target PTS                 | Tick -> validated role-specific map; take path additionally follows take epochs    | Composition of recorded errors; transport/map/take generations and segment IDs                            |
| Presented media PTS -> signed follower error          | `observedPresentedPts - targetPts` in integer microseconds                         | <= observation timestamp precision plus target-map residual; frame callback/currentTime kind and age      |
| `getOutputTimestamp.contextTime` <-> performance time | Paired affine estimate from one observation, used only near the observation        | Browser-estimated; observation age, runtime/output device, supported latency fields                       |
| Performance time -> approximate context frame         | Invert the nearest qualified output/capture observation, then ties-to-even         | Estimated bound measured by spike; never sample identity or a capture boundary                            |
| Camera/`VideoFrame` timestamp -> audio context frame  | Strategy-specific anchor/regression/paired observation selected by spike           | Always carries uncertainty and timestamp kind; may be unavailable; capture/runtime generation             |
| Camera/input PTS -> encoded/muxed PTS                 | Encoder output and container inspection, preserving reordering/offset records      | Exact observed integer timestamps, relationship verified per frame/segment where possible                 |
| Take-video muxed PTS -> logical frame                 | Unique take-map segment via encoded/input/capture anchor to context/logical epoch  | Composed uncertainty; map/take/content hashes and every intermediate timestamp kind                       |
| Media-element seconds -> normalized media PTS         | `seconds * 1_000_000`, ties-to-even, after explicit timeline-origin normalization  | <= 0.5 us plus media-element precision; source/media generation and observation kind                      |
| Wall-clock time -> any sync domain                    | **No conversion permitted**                                                        | Wall clock remains display/audit metadata only                                                            |

No conversion may silently skip an intermediate domain. For example, a take-video PTS does not map
directly to a score tick without identifying the capture segment, audio/logical epoch, and transport
generation used by that take.

## 4. Canonical score, MIDI, transport, and audio mappings

### 4.1 Tick and authored-score seconds

For a tempo segment beginning at tick `t0` with integer microseconds per quarter `u` and PPQ `p`:

```text
scoreMicroseconds(t) = segmentBaseUs + (t - t0) * u / p
```

The forward result remains rational until display or a discrete target. Tempo-segment base values
are precomputed exactly from ordered tempo events. At an exact tempo-change tick, the new segment
owns the forward mapping. The inverse finds the unique half-open segment, computes its rational
tick, and either:

- returns an exact integer tick;
- returns a rational sub-tick for transient transport projection; or
- rounds ties-to-even with a reported maximum error of one-half tick when an integer contract is
  required.

The authored tempo map is revision-bound. Practice speed `s` changes the real-time projection:

```text
practiceMicroseconds(t1, t2) = authoredMicroseconds(t1, t2) / s
```

It never changes score ticks, authored tempo events, MIDI pitches, or the document hash.

### 4.2 Transport anchor to audio frames

An active generation stores a `TransportRenderAnchor`:

```text
transportGeneration
phase
anchorTickNumerator / anchorTickDenominator
anchorContextFrame
sampleRateHz
speedNumerator / speedDenominator
tempoMapHash
activeRange
loopPass
```

For a tick after the anchor in the same generation and continuous segment:

```text
anchorTick = anchorTickNumerator / anchorTickDenominator
deltaFrame = roundTiesToEven(
  practiceMicroseconds(anchorTick, tick) * sampleRateHz / 1_000_000
)
contextFrame = anchorContextFrame + deltaFrame
```

The numeric quantization is at most one-half sample frame per conversion. Implementations avoid
accumulation by mapping each event from the anchor or exact segment base, not by repeatedly adding
rounded intervals. An inverse frame-to-tick lookup returns a rational tick for display and uses the
same tempo segments. Old-generation values are rejected even if their numeric frames overlap.

### 4.3 Standard MIDI File and authored MIDI

Standard MIDI File delta times are accumulated into source ticks and converted through a rational
PPQ ratio into canonical score ticks. Tempo and meter events become canonical ordered maps after
raw-event preflight and explicit import dispositions. Quantization records source tick, canonical
rational value, chosen integer tick, error in both tick domains, and policy result.

MIDI is not retained as a runtime transport. Authored MIDI/reference events are projections of an
immutable `PracticeDocument` revision and are scheduled by `PracticeTransport` on `AudioRuntime`.
Observed-session MIDI export remains evidence export and cannot be loaded as the truth for the take
that produced it.

Pinned alphaTab/alphaSynth position, tick, range, state, and finished callbacks are diagnostics.
Even though alphaTab 1.8.4 exposes `tickPosition`, `timePosition`, `playbackRange`, looping, and
backing-track sync points, StringSight may not let those APIs advance the cursor or loop. The spike
must prove a subordinate output protocol or select a single-authority fallback.

Future hardware MIDI is P2. It needs a separate design that captures each event's Web MIDI
timestamp domain, anchors performance time to an audio context/output observation, qualifies
timestamp resolution and input latency, and handles hot-plug/discontinuity. It is not smuggled into
the file-MIDI adapter.

### 4.4 Capture epochs and Session time

The future capture protocol sends target context frames and receives exact applied frames from the
worklet for `recording-start`, `pause`, `resume`, `stop`, and discontinuity boundaries. Each
`CaptureAnchorEpoch` includes runtime/capture/transport generation, scheduled and applied context
frames, logical recording frame, score tick/phase, sample rate, segment index, and late-by frames.

For one continuous retained segment:

```text
logicalFrame = logicalStartFrame + (contextFrame - contextStartFrame)
sessionMs = logicalFrame * 1000 / sampleRateHz
```

Conversion to the existing Session millisecond field is exact as a rational and floating at the
schema boundary. The source logical frame is retained so floating precision does not become
identity. Pause/resume starts a new segment at the same logical frame. A bounded missing-frame span
advances logical time and is marked unavailable silence; overlapping frames are discarded and
recorded. Larger gaps, sample-rate changes, or device replacement end the capture generation under
the post-spike accepted policy.

The current implementation is not this future contract: `src/shared/time.ts` maps a simple
context-seconds anchor, and the capture worklet reports chunk context starts but acknowledges
recording controls without frames. This is protected baseline code to refactor after final
technology acceptance, not evidence that exact cross-media epochs already exist.

## 5. `ReferenceScoreMediaSyncMap`

### 5.1 Ownership and schema

```text
ReferenceScoreMediaSyncMap/v1
  id / revision / createdAt
  practiceDocumentId
  practiceDocumentRevision
  practiceDocumentContentHash
  scoreProjectionHash
  referenceMediaAssetId
  referenceMediaContentHash
  normalizedMediaTimelineId
  anchors[]
    id
    scoreTick
    mediaPtsUs
    segmentId
    provenance
  segments[]
    id
    leftAnchorId / rightAnchorId
    mode = linear | explicit-gap
    boundaryPolicy
  beforeFirst / afterLast = unmapped | clamp-for-preview
  provenance / sourceMapId / editHistory
  qualifiedMapHash
```

The original validated map is immutable. Editing anchors produces a new map revision with the old
map ID/hash as provenance. Workspace preview may hold a mutable draft, but no take/reference record
points to it until validation and atomic save succeed.

### 5.2 Validation

- At least one anchor is required for a linked map. A single anchor maps exactly one score position
  and can supply a constant-offset **preview** only when the user explicitly chooses that limited
  mode; it does not claim drift/rubato correction.
- Anchors are strictly increasing by score tick within a continuous segment and strictly increasing
  by media PTS. Duplicate score ticks, duplicate PTS with different score ticks, reversed slopes,
  zero-duration segments, and ambiguous overlaps are rejected.
- A segment belongs to one ordered pair of adjacent anchors. An introduction, pause, edit, cut, or
  missing passage is an explicit unmapped gap/discontinuity, never a negative or zero slope.
- Separate score regions may map to separate media segments, but no input tick or media PTS may have
  two inverse results. Repeated source material requires the author to select the occurrence and use
  distinct PTS anchors.
- Numeric values use integer ticks/microseconds. Content hashes bind both exact inputs.

### 5.3 Piecewise mapping and inverse

For a validated linear segment with endpoints `(t0, p0)` and `(t1, p1)`:

```text
mediaPtsUs(t) = p0 + roundTiesToEven((t - t0) * (p1 - p0) / (t1 - t0))
scoreTickRational(p) = t0 + (p - p0) * (t1 - t0) / (p1 - p0)
```

Forward integer-media quantization is at most one-half microsecond. Inverse lookup returns a
rational tick; an integer UI selection rounds ties-to-even and reports up to one-half tick numeric
error plus the map's measured residual. Because integer microseconds may collide for extremely
dense ticks, validation also confirms strict integer monotonicity over anchor boundaries and the
supported local lookup range.

The left anchor owns a segment. The right anchor is the first point of the next segment, except the
last anchor, which closes the final segment. An explicit gap returns `unmapped`; it never
interpolates. Before/after behavior defaults to `unmapped`. Clamp is allowed only for unsynchronized
preview and is labelled, never used by synchronized playback or assessment.

Rubato and nonuniform performance timing are represented by additional anchors. A pause uses two
segments around an unmapped media or score span depending on what exists. An editorial cut uses an
explicit discontinuity. The mapping does not infer intent from waveform similarity.

### 5.4 Stale and recovery behavior

A map is stale if either the revision ID, document content hash, score projection hash, media asset
identity/hash, or normalized timeline ID differs from the opened sources. Stale is not corrupt: the
old map remains reproducible for its original sources. It cannot drive synchronized playback for a
new revision.

`Preview rebase` projects old anchors through an explicit reviewed score-revision diff and reports
unchanged, moved, ambiguous, deleted, and inserted musical regions. The user accepts a new map only
after every ambiguity resolves and validation passes. If no trustworthy semantic mapping exists,
the only valid action is complete re-authoring. Neither path mutates or deletes original history.

## 6. `TakeCaptureMediaSyncMap`

### 6.1 Primary relationship

Take video is captured evidence media. Its primary mapping is not score tick to video PTS:

```text
TakeCaptureMediaSyncMap/v1
  id / createdAt / qualifiedMapHash
  practiceTakeId / practiceTakeCoreHash
  takeVideoAssetId / takeVideoContentHash
  captureGeneration / transportGenerationSet
  cameraTrackIdHash / format / timestampStrategy
  containerTimelineId / firstMuxedPtsUs
  frameAnchors[]
    frameSequence
    timestampKind
    cameraOrVideoFrameTimestampUs
    observedPerformanceTimeMs, optional
    audioContextFrame, optional or estimated
    logicalRecordingFrame, optional
    transportGeneration / captureGeneration
    encodedPtsUs / muxedPtsUs, when known
    uncertaintyUs / provenance
  captureEpochIds[]
  discontinuities[]
  timestampInspection / browser / recorder / codec provenance
```

The score relationship is derived:

```text
takeVideo PTS
  -> validated frame/capture segment
  -> audio context or logical recording frame
  -> persisted take capture/transport epoch
  -> transport tick for that generation/loop pass
```

If any link is missing or ambiguous, the derived score position is unavailable or approximate with
the recorded uncertainty. A user-authored correction creates a separate reviewed alignment layer;
it does not rewrite raw capture timestamps.

Identity finalization is deliberately acyclic:

1. finalize the immutable take core and compute `practiceTakeCoreHash`; its hash projection excludes
   all outward sync-map links and any mutable current-map selection;
2. finalize the take-video asset and its immutable content/format identity;
3. create an immutable map binding those two hashes; and
4. advance a versioned `TakeVideoAttachmentState` to select that map.

Changing alignment creates a new map and attachment-state revision. It never rehashes or mutates the
take core.

### 6.2 Segment and discontinuity rules

- Camera/device restart, recorder pause/resume, encoder reset, muxer edit-list change, sample-rate
  change, and transport seek/generation transition create explicit segments.
- Frame PTS must be non-decreasing in a segment; equal timestamps are duplicate observations and
  cannot both be inverse anchors.
- Encoded and muxed timestamps remain distinct when B-frames, reordering, or container offsets
  apply.
- Dropped camera frames, processor frames, encoder frames, and presented frames use different
  counters. One counter cannot stand in for all four.
- Capture start is anchored to an observed first usable camera frame and an exact or bounded audio
  frame relationship. Recorder `start` event time alone is not first-frame proof.
- Embedded camera audio is muted/excluded by default and cannot replace the microphone/worklet
  evidence timeline.

## 7. Video-follower controller

### 7.1 Boundary and state machine

The media follower is a non-React controller with one attached `HTMLMediaElement`, a transport
subscription, and either a validated map or the transport's explicit unsynchronized-preview mode.
React submits user commands to `PracticeTransport` and renders follower snapshots; it does not call
`video.play()`, assign `currentTime`, or tune playback rate directly.

```text
detached
  -> preparing -> ready-paused
  -> hard-seeking -> ready-paused | following | failed
  -> following <-> follower-paused
  -> stalled -> recovering -> following | hard-seeking | degraded | failed
  -> ended-observed -> ready-paused
  -> degraded
  -> disposed
```

`preparing` covers source attach, metadata, map validation when synchronized, and decode capability.
`hard-seeking` waits for the media element's `seeked` acknowledgement and then requires a presented-
frame or bounded current-time observation before declaring settled. Every async operation captures
follower instance ID, media source ID, and transport generation; callbacks with any mismatch are
ignored and cancelled where possible.

| Transport/media event                         | Required follower transition/action                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepare synchronized source                   | Validate source/map identity, attach, load metadata, seek to generation target, settle to `ready-paused`                                                  |
| Prepare unsynchronized preview                | Require explicit preview phase, attach/load without a map, use only the transport-owned media-preview cursor                                              |
| Synthetic count-in                            | Keep the score tick fixed at the requested start; follower remains settled at that tick while virtual pre-roll clicks advance                             |
| Play/resume synchronized                      | Recompute target and nominal rate, call media play as a follower, enter `following`                                                                       |
| Pause                                         | Pause media and retain the generation's settled target or preview PTS                                                                                     |
| Seek, loop, or other generation discontinuity | Cancel callbacks/rate automation, pause, hard-seek to the new generation target, settle, then rejoin if transport is playing                              |
| Unmapped synchronized-map gap                 | Pause/hide synchronized output, report `unmapped`, and rejoin only after a later mapped target; never clamp unless the user enters unsynchronized preview |
| Stall/underflow                               | Record stall, attempt bounded recovery, then rejoin, hard-seek, degrade, or fail according to policy                                                      |
| Media `ended`                                 | Report `ended-observed` and pause follower output; never end, seek, or loop the score transport                                                           |
| Stop                                          | Cancel callbacks/rate automation, pause/reset media to the transport's stopped target, and enter `ready-paused`                                           |
| Source/map replacement or disposal            | Increment/capture a new operation identity, cancel old work, detach source, release resources; stale callbacks are diagnostic only                        |

### 7.2 Target and observation

Follower error is computed only when target and observation refer to the same performance-time
coordinate. For a presented-frame callback, choose `expectedDisplayTime` as the comparison
coordinate, retain `presentationTime` as a diagnostic, and use the nearest qualified
`AudioContext.getOutputTimestamp()` pair:

```text
framePerformanceMs = expectedDisplayTime
projectedOutputContextSeconds = outputTimestamp.contextTime
  + (framePerformanceMs - outputTimestamp.performanceTime) / 1000
projectedOutputFrame = roundTiesToEven(projectedOutputContextSeconds * sampleRateHz)
targetTick = transportTickAtOutputFrame(projectedOutputFrame, transportGeneration)
targetMediaPtsUs = roleSpecificMap(targetTick)
errorUs = observedPresentedMediaPtsUs - targetMediaPtsUs
```

A reference video uses `ReferenceScoreMediaSyncMap`; a take video uses the derived
`TakeCaptureMediaSyncMap` path. The output-timestamp sample age, projection uncertainty, generation,
and map segment are recorded. If the pair is absent, stale beyond the candidate policy, or crosses a
discontinuity, no fine rate correction is allowed; the follower hard-seeks, degrades to a labelled
lower-confidence current-time observation, or reports unavailable.

Observation preference for ordinary media-element playback is:

1. `requestVideoFrameCallback` `mediaTime` for the presented frame, together with
   `presentationTime`, `expectedDisplayTime`, and `presentedFrames` diagnostics.
2. The media element's official `currentTime` as a lower-confidence fallback.
3. `timeupdate` only as coarse lifecycle/diagnostic evidence.

Callbacks may be late or skipped. The follower never assumes callback cadence equals frame rate.

### 7.3 Start, seek, correction, and failure policy

Numeric thresholds are not approved here; the spike records raw distributions and recommends them.
The controller nevertheless has a deterministic policy shape:

The production follower accepts a versioned, post-spike-approved `FollowerCorrectionPolicy` with
`smallErrorEnterUs`, `smallErrorExitUs`, `largeErrorUs`, observation dwell/age limits,
`maxRateDelta`, maximum correction duration, hard-seek cooldown, settle criteria, and rolling
instability limit. Validation requires `exit < enter < large`, positive dwell/cooldown, and a rate
interval supported by the selected media path. Production playback-rate correction remains disabled
until such a policy is accepted. The disposable spike may execute immutable, predeclared
`experimental-follower-correction-policy/v1/<candidate>` policies so it can measure rate correction
and hysteresis. Candidate parameters are fixed before each run, recorded in its trace, and never
retroactively tuned against the same result; experimental policies are never production defaults.

- **Start:** audio authority does not normally wait indefinitely for optional video. When video is
  selected and ready within a measured bounded preparation window, hard-seek it before the
  transport's scheduled start and call `play()` as a follower. Otherwise the P0 audio/tab journey
  starts and video joins late after a settled seek. A separately approved video-required mode may
  choose fail-before-start.
- **Small stable error:** compute the feed-forward nominal media rate from the current map segment:
  `nominalMediaRate = (d mediaSeconds / d scoreTick) * (d scoreTick / d outputSecond)`. Recompute it
  at map anchors, tempo/speed transitions, loops, and generation changes. The take path composes the
  corresponding local derivatives through its capture epochs. After same-coordinate error exceeds
  an enter threshold for a dwell interval, apply bounded correction around that nominal rate. Clamp
  to nominal plus/minus `maxRateDelta` and the media path's measured supported range. Return to
  nominal only after a tighter exit threshold and dwell time.
- **Large error or discontinuity:** pause follower output, increment follower correction operation,
  hard-seek to target PTS, await `seeked` and a settled presentation observation, then rejoin.
- **Stall/underflow:** transport remains authoritative. Record stall duration; attempt bounded
  recovery. Optional video degrades/hides after the accepted limit rather than pausing or corrupting
  tab/audio/take practice.
- **Loop/generation:** cancel old callbacks/rate automation, pause/reset the follower, seek to the
  new generation's target, and rejoin. Video `ended` cannot advance the loop.
- **Oscillation protection:** correction has enter/exit hysteresis, minimum dwell, rate-correction
  maximum duration, hard-seek cooldown, and a rolling seek/rate count. Exceeding the stability
  limit degrades rather than oscillating indefinitely.

Rate correction must disclose audio consequences. If reference-video audio is audible,
`preservesPitch` support/behavior and artifacts are measured. A rate correction unacceptable for
instructional audio selects hard-seek-only correction or a separately decoded audio fallback.

The follower snapshot exposes target PTS, observed PTS, signed error, observation kind/age,
correction mode, readiness, stall state, missed presented-frame count, generation, map ID, and
degradation reason. These diagnostics are bounded and local.

### 7.4 Unsynchronized preview

Media without a validated map may play only after an explicit user transition into
`unsynchronized-media-preview`. `PracticeTransport` creates a new generation and owns
`enterMediaPreview`, play, pause, `seekMediaPreview`, stop, and exit commands. The score tick freezes
at the entry tick; a distinct `mediaPreviewPtsUs` cursor advances and is never converted to a score
position. Score playback, loops, metronome, count-in, capture/recording, assessment, and synchronization
markers are disabled, and the UI labels the score cursor as not synchronized.

The follower may drive the element to the transport-owned preview cursor, but it computes no
score/media error and makes no alignment claim. Stop resets the preview cursor according to the
declared preview policy without changing the score tick. Exit increments the generation, cancels
pending callbacks, restores the frozen score tick, and returns to synchronized score control. This
fallback satisfies the accepted `Ready unsynchronized` state without creating a second transport.

## 8. Reference-video audio

Only one selected reference source is audible at a time. The spike compares:

1. Route the selected media element through one `MediaElementAudioSourceNode` into the
   `AudioRuntime` reference bus.
2. Decode reference audio separately and schedule it as buffers/chunks under `PracticeTransport`.
3. Omit reference-video audio while retaining visible synchronized video and other reference
   playback.

The media-element path gives application gain/mute/solo and output routing, but it does not make the
media decoder's clock sample-identical to the audio context. It must pass drift, seek, buffering,
rate/pitch, output-latency, and recovery measurements. A media element can be connected to at most
one media-element source node for its lifetime, so controller/source ownership is explicit.

Reference-video audio enters only the reference output bus. It has independent gain/mute/solo, uses
short gain ramps, and cannot connect to the microphone source, capture worklet, analyzer, or encoded
take-video stream. Physical speaker bleed remains possible; the UI warns and recommends headphones.

If separately decoded audio is chosen, its demux/decode/container path, memory behavior, seek/index
accuracy, channel/sample-rate conversion, and source licensing become separate production gates.
No fallback silently substitutes the take's embedded camera audio.

## 9. Take-video timestamp strategies

### 9.1 Strategy A: `MediaRecorder` plus anchors and container inspection

Record a video-only `MediaStream` and collect:

- performance/audio-context observations before `start()` and at `start`, pause, resume, error,
  data, and stop events;
- camera track settings and lifecycle;
- exact transport/capture epochs;
- `BlobEvent.timecode` as chunk-relative recorder evidence; and
- post-finalization container track PTS/edit-list inspection.

Benefits are broad current-browser integration and a browser-owned muxing path. Limitations:
`timeslice` and `dataavailable` delivery are asynchronous; Blob delivery time is not frame time;
the first recorder event is not guaranteed to identify the first encoded camera frame; pause/resume
and container origins need inspection; per-frame PTS may be unavailable until demux. The current
MediaStream Recording specification defines `BlobEvent.timecode` from chunk creation timestamps,
not an audio-context frame mapping. StringSight must not claim exact per-frame sync from it.

### 9.2 Strategy B: `MediaStreamTrackProcessor` observation plus recording

Read timestamped `VideoFrame` objects from the video track, promptly record timestamp/sequence and
performance/audio anchor observations, close every frame, and record either the original or a
generated/tee'd video-only track. This may expose better capture-frame timing and loss evidence.

Limitations: the specification remains a draft, implementation surface/support must be measured,
stream queues can drop/backpressure frames, timestamps still need an empirically justified mapping
to audio frames, and consuming/teeing/transformation can add CPU/GPU pressure or alter the recorded
path. Holding `VideoFrame` resources can exhaust system pools. The spike proves lifecycle and
resource cleanup rather than assuming availability.

### 9.3 Strategy C: WebCodecs plus reviewed muxing

Observe/construct `VideoFrame`s with explicit integer-microsecond timestamps, feed them to a
`VideoEncoder`, retain encoded chunk timestamps/metadata, and mux through a separately reviewed
container writer.

Benefits are explicit input timestamps and visibility into encoder queues/keyframes. Limitations
are substantial: WebCodecs does not provide the application container/muxing/persistence solution;
codec/profile/hardware support is configuration-specific; encoded frames may reorder; the app owns
queue bounds, frame close, flush/error/reconfigure, keyframes, mux timestamp rules, finalization,
and recovery. Codec and muxer licenses/size/security are additional gates.

### 9.4 Strategy D: honest approximate alignment or omission

If no candidate produces a stable, explainable camera-to-microphone relationship inside the
accepted budget, ship audio takes without synchronized take video. An optional approximate video
may be labelled with its measured uncertainty and excluded from assessment, but only if that has
product value and cannot be mistaken for exact alignment. Video is P1 and may be omitted without
weakening P0.

No strategy opens a second microphone track. Request camera with `audio: false`, verify the stream
contains zero audio tracks, record video-only, and keep the worklet PCM as authoritative take audio
and evidence. If a browser unexpectedly supplies audio, stop/remove it and fail the video preflight.

## 10. Measurement and fixture matrix

### 10.1 Raw metrics

Record raw samples, percentile summaries, browser/hardware/build identity, fixture hash, warm/cold
state, visibility/zoom, and timestamp source. Do not convert these measurements into final budgets
inside the spike.

| Measurement                 | Method and separately recorded components                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial start error         | Target transport/audio frame; first audible reference frame estimate; first presented video PTS/expected display; signed error and readiness delay |
| Seek                        | Command/target generation; media seek target; `seeked`; first settled presented frame; signed settled error; settle time; keyframe distance        |
| Steady drift                | Signed target-minus-presented PTS series, slope, max absolute error, residual distribution, observation age                                        |
| Display timing              | `mediaTime`, `presentationTime`, `expectedDisplayTime`, callback `now`, v-sync lateness, skipped `presentedFrames`                                 |
| Output/presentation latency | `getOutputTimestamp`, base/output latency, optional physical loopback/high-speed-camera measurement, each labelled estimate vs physical            |
| Correction stability        | Rate delta, duration, entry/exit count, hard-seek count, cooldown violation, oscillation/degrade outcome                                           |
| Loop/generation             | Old-callback rejection, target/new first frame error, duplicate/missing media/audio attacks, tail cleanup across 1,000 loops where practical       |
| Camera/microphone start     | Exact first retained audio frame vs first observed/encoded/muxed camera PTS; offset and uncertainty by timestamp strategy                          |
| Pause/discontinuity         | Segment boundaries, excluded wall time, camera/recorder behavior, derived logical mapping round trip                                               |
| Drops                       | Camera-source/processor, encoder input/output, mux, decoder, and compositor/presented counts separately                                            |
| Encoding/finalization       | Queue size, frame latency, stop-to-finalized time, errors, recovery, output duration/PTS range                                                     |
| Resource/storage            | JS heap where exposed, process/system memory where test harness allows, GPU/resource symptoms, blob/file growth, IndexedDB quota/eviction behavior |
| Audio protection            | Capture dropped chunks, discontinuities, worklet/worker latency, analyzer gaps, AudioContext underrun proxies, main-thread long tasks              |

### 10.2 Fixture dimensions

- Practice speed: proposed full product range 0.5, 0.75, 1.0, 1.25, 1.5, and 2.0, pending
  post-spike acceptance.
- Reference/take duration: 10 seconds, 2 minutes, current five-minute take maximum, and a longer
  reference soak sufficient to reveal drift.
- Frame cadence: 24/25/29.97/30/50/59.94/60 CFR plus at least two VFR fixtures with recorded PTS.
- Keyframes: short, medium, and long GOP/keyframe intervals; seek near/between keyframes.
- Media: every browser-supported candidate container/codec returned by capability negotiation,
  plus known unsupported/malformed/truncated fixtures.
- Maps: one anchor, several rubato anchors, intro, pause, cut, explicit gap, stale revision, reversed
  anchors, duplicate anchors, unmapped ends, and multiple discontinuities.
- Runtime: notation only; audio only; reference video/audio; camera encoding; and the full
  simultaneous notation + synthesis/reference + metronome + microphone capture/analysis + camera
  encode + video playback workload.
- Environment: cold/warm asset state, 100% and 200% zoom, resize, hidden/background transition,
  context suspension/resume, camera/microphone device loss, permission revocation, output-device
  change where available, and quota pressure.
- Hardware/browser: owner-approved low/representative/high desktop tiers on current stable Chrome
  and Edge for Windows/macOS. Record exact versions for every run.

The development machine currently reports Chrome `150.0.7871.125` and Edge `150.0.4078.83`; these
are discovery values, not the final support matrix or evidence until the spike records repeatable
runs.

## 11. Platform and pinned implementation evidence

### 11.1 Primary web-platform sources

- [Web Audio API 1.1](https://www.w3.org/TR/webaudio-1.1/) defines `currentTime`, render frames,
  control/render threads, `getOutputTimestamp`, latency properties, and media-element source nodes.
- [HTML media elements](https://html.spec.whatwg.org/multipage/media.html) define the official
  playback position, ready states, seeking, playback rate, events, and media timeline behavior.
- [Video frame callback proposal](https://wicg.github.io/video-rvfc/) defines presented-frame
  `mediaTime`, presentation/expected-display timestamps, processing duration, and presented-frame
  count, while explicitly warning that callbacks can be late or missed.
- [MediaStream Recording](https://www.w3.org/TR/mediastream-recording/) defines recorder lifecycle,
  type negotiation, asynchronous blobs, and `BlobEvent.timecode` semantics.
- [MediaStreamTrack Insertable Media Processing](https://w3c.github.io/mediacapture-transform/)
  defines the draft processor stream exposing `VideoFrame`s and its resource/queue concerns.
- [WebCodecs](https://w3c.github.io/webcodecs/) defines `VideoFrame`/encoded-chunk microsecond
  timestamps, encoder/decoder queues, configuration checks, and explicit resource release.
- [Media Capture and Streams](https://w3c.github.io/mediacapture-main/) defines permissioned track
  acquisition and track lifecycle.
- [High Resolution Time Level 3](https://www.w3.org/TR/hr-time-3/) defines performance time origins,
  monotonic clocks, and resolution/privacy behavior.

Specifications define semantics, not StringSight's measured browser budgets. Draft status and
actual Chrome/Edge support are recorded in the spike.

### 11.2 alphaTab 1.8.4 pin

Research is pinned to:

```text
npm package: @coderline/alphatab@1.8.4
license metadata: MPL-2.0
npm integrity: sha512-VN5rfTZZWgA63Ny1aDKCp02k3Qm9CHhg4Q9AnK0kHm7G+fNDNZo36TeToPDFoJ6VpB9+AHcCrHwHFUP1tKqdsw==
npm shasum: 4b6874b056f54a0271348f5f6ed8ee5d9b8dfc95
npm gitHead: 022a45c8e42370f9e12e68949d11eada370da83d
annotated tag object: accc60f5e9a3ff1e92008295bdb54dcf619c020c
tag commit: 022a45c8e42370f9e12e68949d11eada370da83d
```

Exact source evidence:

- [`IAlphaSynth.ts` at the pinned commit](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/src/synth/IAlphaSynth.ts)
  exposes tick/time positions, playback range, speed, looping, state/position/finished callbacks,
  `ISynthOutput`, and backing-track sync points. Their existence does not grant authority.
- [`ISynthOutput.ts` at the pinned commit](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/src/synth/ISynthOutput.ts)
  defines the public sample-output interface the preferred subordinate-output experiment must use.
- [`PlaybackRange.ts` at the pinned commit](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/packages/alphatab/src/synth/PlaybackRange.ts)
  defines start/end MIDI ticks.
- [Pinned MPL-2.0 license](https://github.com/CoderLine/alphaTab/blob/022a45c8e42370f9e12e68949d11eada370da83d/LICENSE).

The live alphaTab documentation is orientation only. The spike verifies the installed tarball's
integrity, emitted declarations/runtime behavior, assets, transitive dependencies, and source-form
mapping before making any technology or license recommendation.

## 12. Architecture validation obligations

The dedicated spike must demonstrate:

1. There is one transport generation/tick/phase authority under rapid play, pause, seek, loop,
   speed, failure, stale callback, and disposal races.
2. Every persisted time conversion identifies its domains, exact anchors, rounding, uncertainty,
   and provenance.
3. Reference and take maps cannot be substituted or silently rebound.
4. Media callbacks cannot advance score/loop state.
5. Capture remains audio-authoritative and video-only; optional video degradation preserves P0.
6. Rate/seek correction does not oscillate and has an explicit measured failure outcome.
7. Recorder chunk timing is never reported as per-frame audio alignment.
8. Missing/stale/deleted media changes availability, not immutable document/take identity.

Final thresholds, codecs, containers, capture strategy, alphaTab adoption, and playback fallback
remain decisions for the post-spike acceptance gate.
