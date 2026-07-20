# ADR 0006: Canonical practice documents, one audio runtime, and notation adapters

- **Status:** Proposed
- **Date:** 2026-07-19

## Context

StringSight currently models observed microphone evidence as a versioned `Session` in monotonic
session-relative milliseconds. It owns microphone capture, analyzer replay, local persistence, and
conditional evidence-to-MIDI export. A practice workflow adds a different kind of data: authored
tablature organized in musical time, with tempo and meter maps, deterministic edits, arbitrary
loops, reference playback, metronome/count-in, and takes recorded against a fixed score revision.

Putting authored measures inside `Session` would blur intent with observation and make later
assessment irreproducible. Using milliseconds as score time would make tempo edits and meter-aware
selection unstable. Letting a renderer's object graph become the database would bind migrations,
undo, and interchange to that dependency. Letting capture, reference playback, and metronome create
separate live audio contexts would introduce unsound cross-clock synchronization.

The repository also has an accepted license policy that permits MPL-2.0 production use only after a
focused review and owner approval. The preferred guitar-first library, alphaTab 1.8.4, identifies
itself as MPL-2.0 in its
[tagged license](https://github.com/CoderLine/alphaTab/blob/v1.8.4/LICENSE).

## Decision

### 1. Separate authored and observed aggregates

Create independently versioned contracts:

- `PracticeDocument`: canonical authored score in integer musical ticks.
- `Session`: unchanged in purpose as observed, session-relative evidence and optional PCM.
- `ObservedEvidenceSnapshot`: immutable validated structured Session at one exact detector-event and
  append-only correction cutoff, with raw-event, correction-prefix, corrected-projection, metadata,
  and optional PCM hashes.
- `PracticeTake`: immutable link from one document revision/content hash to one
  `ObservedEvidenceSnapshot`, including range, speed, every capture epoch, metronome/count-in
  mapping, stable recording `mediaId`, logical `audio-session-media/v1` locator, qualified metadata
  hash, immutable PCM-envelope hash, and latency diagnostics. The mutable source Session ID is
  navigation, not identity.
- `RecordingMediaState`: separately versioned, mutable repository state keyed by `mediaId` that
  records available/external/deleted/evicted/missing/corrupt transitions and tombstones without
  rewriting `PracticeTake`.
- `PracticeAssessment`: versioned derived alignment and metrics that preserves both sources.

Later session correction, replay, re-analysis, media deletion/eviction/relink, or Session deletion
cannot alter a take or its media identity/hashes. Relink succeeds only when bytes reproduce the
immutable PCM-envelope hash. The native PracticeDocument JSON format is the only lossless editable
interchange guarantee. Assessment never mutates the other aggregates.

### 2. Use one canonical guitar model

Complete Checklist Item 10 in the deterministic `music` subsystem. It owns string numbering,
tuning, capo-relative frets, scale length, handedness, pitch mapping, possible locations, voicing
enumeration, and transition cost. String 1 is the highest-pitched string. MIDI pitch is derived from
string/fret/tuning/capo and is not independently editable in an authored tab event.

### 3. Use ticks for score time and explicit clock anchors

PracticeDocument schema v1 uses 960 ticks per quarter note, ordered tempo and meter maps, and
half-open tick ranges. Tempo-map utilities perform deterministic tick/seconds conversion.

An application-owned `AudioRuntime` lazily owns one interactive `AudioContext` and its reference,
metronome, count-in, take-replay, and silent capture buses. Transport anchors map document ticks to
audio-context time, context sample frames, session-relative milliseconds, and performance/output
time where supported. React and UI timers never schedule audible events.

Capture start, pause, resume, stop, and discontinuity persist exact worklet-acknowledged sample
epochs containing absolute context frame, logical recording frame, Session time, transport/capture
generation, transport tick, phase, and scheduled-versus-applied frame. Start is the first included
sample; pause/stop are first excluded samples; resume is the first newly included sample and keeps
the paused logical frame; discontinuity records expected/actual context frames and gap/overlap.
Bounded missing frames advance the logical timeline and are explicit unavailable silence, never
silently time-compressed.

**Recommended pending owner approval:** Session zero is the first captured count-in pre-roll sample;
an independent persisted score-start epoch maps the selected score tick to its exact context,
logical, and Session frame. With count-in disabled, both target the same frame. Alternatives and
privacy/media consequences remain in the plan.

### 4. Make the StringSight transport authoritative

`PracticeTransport` owns play/pause/seek/stop, speed, active range, loop generation, tempo/meter
projection, and count-in. The StringSight metronome derives clicks and accents from canonical meter
on the same context timeline. Visual position is projected from the audio clock.

A second independent production transport/audio clock is prohibited. This is a non-negotiable
technical invariant, not an owner option. The owner may choose fallback engineering cost,
edit-to-sound latency, memory/quality tradeoffs, or no synthesized reference playback. Loop state
is a musical tick range independent of score layout.

**Recommended pending owner approval:** count-in is synthetic and phase-aligned backward from any
selected start using the destination tempo/meter/grouping and the meter segment's explicit
canonical downbeat origin. Its exact duration is requested bars times destination bar ticks. Every
preceding virtual grid tick/role in that interval, leading/trailing off-grid partial, deterministic
rounded context frame, and `resolved-count-in-schedule/v1` qualified hash persist in the take. At a
tempo/meter boundary it uses destination values for the whole count-in. It runs once before the
first loop pass unless an explicit every-loop option is approved; off-grid starts never snap
implicitly and instead warn/offer snapping.

### 5. Conditionally select alphaTab 1.8.4 behind adapters

alphaTab 1.8.4 is the preferred candidate for guitar engraving, supported score import, cursor
geometry, MIDI generation, and reference synthesis, subject to two blocking gates:

1. Owner approval and license-policy amendment for MPL-2.0 production distribution.
2. A disposable spike proving Vite worker/worklet coexistence, import fidelity, a public
   shared-context **and single-authority** protocol or one of the ordered single-authority
   fallbacks, capture continuity, timing, performance, and accessibility mapping.

alphaTab types and object graphs remain inside adapters. StringSight rebuilds renderer/player input
from `PracticeDocument` and never persists alphaTab JSON. alphaTab's documentation explicitly says
its JSON representation is not guaranteed compatible across versions
([low-level APIs](https://alphatab.net/docs/guides/lowlevel-apis/)).

Shared-context proof alone does not pass. `PracticeTransport` must be the only user-command and
tick/phase authority; alphaSynth must have internal loop/metronome/count-in disabled, accept
generation/range/frame-bounded render requests, and treat its position/finished callbacks as
diagnostics only. Stale/extra output is rejected. Rapid generation, mismatch, autonomous finish,
speed/range disagreement, and sample-count tests must pass.

If public alphaSynth output cannot use the application context **or** its transport cannot be
proven subordinate using public APIs, evaluate in order:

1. **Conditional Fallback A:** bounded alphaTab audio export scheduled by `AudioRuntime`, only after
   tempo-scaled MIDI/export `tempo-scaled-reference-export/v1` fixtures pass at 0.5, 0.75, 1.0,
   1.25, 1.5, and 2.0 speed. An SMF adapter uses the ephemeral
   `tempo-scaled-reference-midi/v1` serialization. The projection scales tempo/time, never pitch;
   preserves exactly the selected half-open attack range; retains bounded note-off/release tails as
   explicit post-roll; and proves range, tail, chunk-concatenation, loop cleanup, and edit-latency
   behavior.
2. **Fallback B:** alphaTab for rendering/import only plus a StringSight-owned shared-context
   playback engine from canonical events. Select B if any A fixture fails.
3. Omit synthesized reference playback while retaining editing, metronome, recording, and take
   replay if the owner declines B's cost or B fails its quality gate.

Do not use private alphaTab APIs, patch/vendor alphaTab, or ship two clocks to force adoption.
Exported PCM is conditional, not mandatory after its own gate fails. The invariant mandates only
one clock/authority: a preferred-path failure starts A evaluation, an A failure selects B, and a B
failure/decline omits reference playback.

### 6. Use `@tonejs/midi` only for SMF binary interchange

Evaluate pinned `@tonejs/midi` 2.0.28 behind the MIDI adapter for PPQ, tempo, meter, track, note,
velocity, parse, and write support. It does not own score semantics, transport, synthesis, or the
audio context. The package reports MIT licensing
([npm package](https://www.npmjs.com/package/%40tonejs/midi)); normal transitive-license and notice
checks still apply.

Run a raw SMF preflight before high-level conversion and reconcile every header/track event as
consumed, preserved, ignored-by-policy, or unsupported. Unknown meta, SysEx, controller, bend,
aftertouch, text/marker, key-signature, and malformed events cannot vanish because the high-level
library omits them. The lower-level parser must be a direct reviewed dependency or bounded
StringSight reader, not an undeclared transitive import. If complete inspection is infeasible, the
product narrows its supported-SMF claim and displays a file-level possible-loss warning rather than
claiming complete loss reporting.

MIDI conversion always reports loss of guitar string/fret and other notation semantics. MusicXML is
the future guitar-aware interchange because its tablature model explicitly carries strings, frets,
tuning, capo, rhythm, and techniques
([MusicXML tablature](https://www.w3.org/2021/06/musicxml40/tutorial/tablature/)).

### 7. Persist practice aggregates separately

Add validated IndexedDB repositories and stores for current documents, immutable referenced
revisions, immutable observed-evidence/correction snapshots, takes, assessments, mutable
`RecordingMediaState`, and durable media-operation intents. Keep existing observed session/media
stores authoritative for the mutable session head and PCM bytes. The independent media repository
must expose hash-validating finalize, resolve, inspect-state, tombstone, purge-after-tombstone,
hash-verified relink, and reference-list operations. Use atomic same-database writes or recoverable
two-phase cross-database intents, explicit migrations, content hashes, blocked-upgrade handling, and
export bundles that bind exact document/evidence/media identity plus bundle-local PCM
included/external/omitted state.

No referenced Session/document/take/media deletion silently cascades. **Recommended pending owner
approval:** retain referenced structured snapshots, ask separately about PCM, transition only
`RecordingMediaState` while the take's media ID/locator/metadata/PCM hashes stay byte-identical,
cascade take deletion only to exclusively owned snapshots/assessments after confirmation, and
provide a separately previewed “delete everything related” action. Media deletion durably commits a
tombstone before purging bytes; recovery is idempotent and never reports missing bytes as available.
Blocking deletion or confirmed full cascade remain alternatives with integrity-versus-user-control
consequences documented in the plan.

### 8. Use versioned canonical hashes

Use projection-qualified hashes: validate the exact schema, materialize defaults, normalize schema
strings to NFC, preserve semantic array order, canonically order only declared sets/maps, serialize
with RFC 8785 JCS, then SHA-256 the UTF-8 bytes. Reject invalid numbers and duplicate keys. The
generic form is `sha256:jcs-v1:<hex>`; specialized identifiers include
`sha256:recording-media-metadata-jcs-v1:<hex>`,
`sha256:authored-tempo-map-jcs-v1:<hex>`, and
`sha256:resolved-count-in-schedule-jcs-v1:<hex>`.

The projection registry includes full document snapshot, expected-event projection,
observed-evidence snapshot, correction prefix, corrected projection, recording-media metadata,
authored tempo map, resolved count-in schedule, PCM byte envelope, tempo-scaled reference export,
and exported file/bundle manifest. `recording-media-metadata/v1` has fixed format/sample-rate/channel/
frame fields and excludes media ID, locator, availability, tombstone, names, and times.
`authored-tempo-map/v1` has PPQ plus strictly tick-ordered unique integer-microseconds-per-quarter
events and excludes speed/derived time/document metadata. `resolved-count-in-schedule/v1` has meter
origin, destination meter/tempo/grouping, start/bar/duration/partials, sample rate, score-start frame,
and chronologically ordered virtual click ticks/roles/frames; it excludes IDs, UI/audio-sample
choice, repository state, and times.

Each projection defines included/excluded fields rather than inheriting a generic exclusion rule;
IDs/revisions/wall-clock timestamps and the hash field are excluded from document content identity,
while authored metadata and playback/notation semantics are included. Migration verifies the
recorded old algorithm/hash before conversion, retains it as source provenance, and emits a newly
qualified hash. Projection changes require a new version and golden fixtures. The architecture plan
contains normative JCS byte strings and exact golden digests for the three specialized take hashes;
browser and Node implementations must reproduce them.

### 9. Adopt an explicit notation support profile

Schema v1 has an owner-approved, versioned preserve/reject/report matrix rather than a generic claim
of “tab support.” **Recommended pending owner approval:** first-class pitch spelling/key, ties,
slurs, rational tuplets, two voices, dynamics, core articulations, per-string sounding duration, and
explicit per-technique decisions. Hammer-on, pull-off, slide, bounded bend, vibrato, let-ring,
palm-mute, dead note, and natural harmonic are recommended native rows. Artificial/pinch harmonics,
tremolo picking, tapping, whammy bar, rasgueado, and pick direction each have their own recommended
convert/report, reject/report, or drop/report row and stable warning code; no generic unsupported
bucket or opaque payload is allowed. Grace notes are explicit drop/convert decisions and
repeat/endings expand to a bounded linear timeline with reported structural loss. MusicXML/Guitar
Pro/MIDI import/export claims are limited to tested behavior for every semantic and technique row.
The full owner-approval matrix and consequences of a narrower profile are in the architecture plan.

## Alternatives considered

### Store practice data inside `Session`

Rejected. Authored intent and observed evidence have different clocks, lifecycles, corrections,
retention, and provenance. Combining them makes both harder to validate and assess.

### Persist alphaTab's score graph

Rejected. It would make editor commands, migrations, and long-term files dependent on library
internals. alphaTab itself does not guarantee serialized model compatibility between versions.

### VexFlow as the primary stack

Not selected. VexFlow is a capable MIT SVG/Canvas notation renderer, but StringSight would need to
build semantic score import, guitar-specific interchange, layout, playback, cursor behavior, and
synthesis around it. It remains a fallback renderer if the alphaTab gates fail.

### OpenSheetMusicDisplay

Not selected. OSMD provides BSD-licensed MusicXML display and tablature on VexFlow, but its own
project describes it as a renderer rather than a full interactive editor and does not provide the
complete open-source authored playback stack StringSight needs. It remains a MusicXML-rendering
fallback candidate.

### Tone.js as global transport and synth framework

Rejected for the planned architecture. Tone.js has strong Web Audio scheduling, but it introduces a
broad second abstraction over a capture stack StringSight already owns and does not solve guitar
notation/import/editing. Using `@tonejs/midi` does not imply using Tone.js.

### Fully custom engraving, formats, transport, and synthesis

Not selected as the first path because it maximizes engineering and correctness burden. A custom
single-clock playback engine remains the final fallback if alphaSynth cannot satisfy runtime
ownership; the canonical document and adapters make that replacement possible.

### Independent capture and playback `AudioContext` instances

Rejected. Context clocks cannot be assumed to remain phase-aligned. Calibration can describe
physical latency but cannot turn two independent clocks into one authoritative transport.

## Consequences

### Positive

- Authored scores, performances, and assessments remain independently inspectable and reproducible.
- Tempo changes, meter, loops, and page reflow do not corrupt musical positions.
- The guitar model is reused by editing, MIDI import, future vision/fusion, and assessment.
- Playback, click, recording anchors, and A/B replay can share a stable timeline.
- alphaTab, MIDI parsing, synthesis, or rendering can be replaced without migrating source truth.
- Import loss and model uncertainty are visible instead of silently repaired.

### Costs

- The microphone controller must be refactored to consume an application runtime without regressing
  existing capture behavior.
- Canonical-to-renderer projection adds adapter and fixture-test work.
- Immutable document revisions and cross-aggregate references require database migration and
  retention policy.
- A production-quality editor requires a command/transaction model and semantic accessibility
  surface independent of rendered SVG.
- alphaTab cannot be installed or shipped until license and technical gates pass.

### Risks and mitigations

- **MPL policy conflict:** block package installation/production merge until explicit owner review
  amends ADR 0005 and the dependency checker/notices. Approval also records exact npm/upstream
  tag, commit, Source Code Form archive and checksums; provides the approved MPL license/notice and
  informs recipients how to obtain the Source Code Form of distributed Covered Software by the
  approved reasonable/timely procedure at no more than distribution cost; tracks Covered Software
  modifications and makes the applicable modified Source Code Form available; and verifies the
  release from a clean environment. Prefer no MPL-covered-file modification. This engineering gate
  does not replace legal review.
- **Worker/worklet conflict:** use an isolated Vite spike and preserve existing production workers.
- **Shared-output or authority infeasibility:** evaluate conditional exported PCM; if its
  pitch/range/tail/speed/latency fixtures fail, select custom shared-transport playback or omit
  reference playback. Never ship private APIs, two clocks, or a synth whose callbacks can override
  the StringSight transport.
- **Import resource attacks:** validate magic/size, cap decompression and decode structures, run
  cancellably off-main-thread, sanitize metadata, and report loss.
- **Timing overclaims:** benchmark scheduled time, output estimates, and physical loopback
  separately; store calibration provenance.
- **Renderer accessibility:** maintain an ordinary-HTML semantic score/editor view and keyboard
  model rather than focusing notation glyphs.

## Acceptance gates

This ADR may move from Proposed to Accepted only when:

1. The owner resolves alphaTab MPL-2.0 production policy, and release verification proves recipient
   notice/access to the exact Source Code Form for distributed Covered Software plus its
   modification record are available under the approved procedure.
2. The disposable spike meets the explicit matrix in
   `docs/plans/10-practice-system-architecture.md`; preferred-path failure tests conditional A,
   A failure selects and re-tests B, and a declined/failed B records that reference playback is
   omitted without weakening the one-clock/authority invariant.
3. Review approves `PracticeDocument` 960 PPQ, all projection-qualified hashes and documented
   golden digests, guitar string/capo semantics, every semantic/technique disposition row, raw-SMF
   loss accounting, and import-warning policy.
4. Product requirements are amended for the Practice System and any newly evaluated capo/alternate
   tuning behavior.
5. The owner approves count-in/Session-zero behavior, PCM export default, per-technique recommended
   defaults, cross-store deletion/retention policy, and—if required—Fallback B cost/latency or
   omission of reference playback after reviewing the documented alternatives/consequences.
6. An independent architecture review finds no blocking contradiction with ADRs 0001-0005.

No production dependency, schema, database migration, or audio-runtime refactor is authorized by a
Proposed ADR alone.
