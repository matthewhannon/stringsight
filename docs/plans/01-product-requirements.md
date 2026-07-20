# StringSight product requirements

- **Status:** Accepted
- **Accepted:** 2026-07-20
- **Last updated:** 2026-07-20
- **Product baseline:** Desktop Practice Workspace on `main` at `0b23c6e`
- **Checklist relationship:** Product/UX definition gate before the isolated technology spike
- **Companion documents:**
  - `desktop-practice-workspace-ux.md`
  - `desktop-practice-workspace-wireframes.md`
  - `desktop-practice-workspace-state-actions.md`
  - `desktop-practice-product-decisions.md`

## 1. Product statement

StringSight is a local-first desktop web workspace where a guitarist creates or imports guitar
tablature, practices the whole score or a stable musical range with one coordinated transport,
records a take, and reviews what they played against the authored score and available reference
media without hiding uncertainty or altering the original evidence.

The score/tab is the central product object. Input analysis, reference playback, metronome,
looping, takes, optional synchronized video, and later assessment support the score-centered
practice journey; none replaces it.

## 2. Product principles

1. **Authored intent and observed evidence stay distinct.** A score says what the guitarist intends
   to play. A microphone session says what StringSight observed. Neither silently rewrites the
   other.
2. **One practice timeline.** Play, pause, seek, range, loop, speed, count-in, cursor, recording,
   reference media, and take replay are coordinated by one future application-owned
   `PracticeTransport` from the user's perspective.
3. **Useful without optional intelligence.** The first useful release does not depend on video,
   automated assessment, computer vision, fusion, GPT interpretation, or a camera.
4. **Local and reversible by default.** Scores, sessions, recordings, and media remain on the
   device unless the user deliberately exports them. Destructive actions preview their impact.
5. **Uncertainty is product information.** Provisional output, confidence, alternatives,
   missing evidence, stale synchronization, and unsupported material are named rather than
   converted into confident-looking guesses.
6. **A desktop workspace, not a tool rack.** Editing, practice, and review are coherent modes around
   the score. Diagnostics are progressively disclosed.

## 3. Primary users

### 3.1 Practicing guitarist

The primary user has a riff, exercise, song, or study and wants to slow it down, isolate a range,
loop it, use a count-in and metronome, record an attempt, and listen back without opening a DAW.

### 3.2 Guitarist authoring or importing tablature

The user needs to create a playable guitar part or bring in an existing score, inspect any import
loss, correct the tab, and save a native document that remains editable independently of the source
format.

### 3.3 Learner reviewing evidence

The user wants immediate, honest input feedback while practicing and a post-take view of detected
notes, chord candidates, timing, confidence, alternatives, and later performance assessment.

### 3.4 Evaluator or maintainer

The evaluator needs a deterministic supported-browser journey, explicit capability and placeholder
boundaries, documented local-data behavior, and reproducible evidence that the product does not
overstate unavailable features.

## 4. Prioritized journeys

### 4.1 Headline first-release journey

1. Create a native guitar tab or import a supported score into an explicit review step.
2. Open the score in the desktop workspace and select the whole score or a stable musical range.
3. Play the score or range, adjust practice speed, enable a loop, and optionally enable metronome
   and count-in.
4. Connect a microphone. Monitoring begins without starting or retaining a recording session.
5. Practice while seeing bounded current input level, note/chord evidence, lifecycle, confidence,
   and actionable warnings.
6. Record, pause or resume, and finalize one take against the exact score revision and range.
7. Replay the guitarist alone and, when a playable reference exists, compare reference and take on
   the same timeline.
8. Save the document and local take, reopen them, or deliberately export an explained bundle.

This journey is useful without video or automated assessment. That is the P0 release boundary.

### 4.2 Score creation and import review

1. Choose **New tab**, **Open StringSight document**, or a supported score import route.
2. For non-native import, inspect a summary of preserved, converted, approximated, unsupported,
   and rejected material before committing it.
3. Resolve blocking guitar-position or timing ambiguity, accept documented loss, or cancel without
   changing the current document.
4. Edit using score-semantic commands, then save a new immutable revision while keeping the current
   working document available.

### 4.3 Practice with optional synchronized video

1. Attach or reveal an optional reference video separately from take video.
2. Use the dual-canvas layout, Tab Focus, or Video Focus without changing the musical selection or
   playback state.
3. If a valid synchronization map exists for the exact score revision, video follows the shared
   transport.
4. If media is absent, moved, deleted, unsupported, or stale after a score edit, the score and take
   remain usable and the workspace offers explicit relink, re-sync, hide, or continue-without-video
   actions.

Video is optional to the guitarist. Whether synchronized video must ship in the first release is an
owner decision recorded in `desktop-practice-product-decisions.md`.

### 4.4 Take review and correction

1. Open a completed take bound to one immutable score revision and evidence snapshot.
2. Replay the take alone; when supported, solo/mute or compare it with the reference.
3. Inspect raw note/chord evidence, ranked alternatives, confidence, timing, provenance, and the
   correction history.
4. Add a correction as a new user-authored projection. Do not overwrite detector evidence or alter
   an earlier immutable take.
5. If newer corrections should affect assessment, create a new evidence snapshot or assessment
   revision; retain the original.

### 4.5 Later assessment journey

1. Run assessment only after a take is finalized and its referenced score/evidence identity is
   available.
2. Compare expected attacks and pitches with observed evidence while retaining missed, extra, and
   ambiguous events.
3. Show timing and accuracy results with evidence-specific confidence, not a universal grade.
4. Jump to and loop a weak range without modifying the source score or take.

Assessment is P1 and must not block the P0 take-review journey.

## 5. Product objects and user-facing meaning

| Concept           | User-facing meaning                                                                     | Integrity rule                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Practice document | The editable score/tab and its authored musical meaning                                 | Layout, active selection, panel state, and playback position are not score content                |
| Document revision | A fixed saved state of the score                                                        | A take or synchronization map names the exact revision it used                                    |
| Observed session  | Timestamped microphone evidence, candidates, confidence, provenance, and corrections    | Monitoring alone creates no session; corrections never erase raw evidence                         |
| Practice take     | One finalized attempt against a fixed score revision, range, speed, and recording setup | A take is immutable; later edits or corrections create new relationships rather than rewriting it |
| Reference audio   | The audible target or score playback used during practice                               | It never enters the software microphone recording path                                            |
| Reference video   | Optional instructional or performance media aligned to a fixed score revision           | It is distinct from take video and may become stale without invalidating the score                |
| Take video        | Optional camera media captured for one take                                             | Its availability may change without changing take identity or microphone evidence                 |
| Assessment        | A derived comparison of expected score events and observed evidence                     | It is replaceable, versioned, confidence-aware, and cannot mutate its sources                     |

Observed-session MIDI export and authored-score MIDI interchange are separate user actions and
must never be presented as the same file or fidelity promise.

## 6. First-release scope

### 6.1 P0: useful complete release

- One active guitar practice document with a collapsible library/navigation rail.
- Native new/open/save/save-as behavior with explicit clean, dirty, saving, saved, and failed
  states; no false “saved” status.
- At least one approved guitar-aware score import route with a pre-commit fidelity report. Exact
  formats are finalized after the isolated spike; native StringSight JSON remains the only lossless
  editable round trip.
- Guitar tab as the primary score representation, with optional standard notation where supported.
- A documented initial technique profile. Unsupported source semantics are rejected, converted, or
  reported explicitly rather than stored opaquely.
- One six-string guitar track in standard tuning for the evaluated experience. The canonical model
  represents capo and alternate tuning so later support does not require a schema rewrite, but the
  UI must label untested configurations honestly.
- Deterministic editing, stable selection, undo/redo, and score-semantic keyboard access.
- Whole-score and arbitrary stable musical-range practice.
- Play, pause, stop, seek, speed, active range, looping, metronome, and one-to-four-bar count-in
  under one user-visible transport authority.
- Reference playback when the post-spike accepted technology path can meet the one-authority,
  accessibility, fidelity, and performance gates. If it cannot, the owner must explicitly narrow
  the release rather than ship competing clocks.
- Microphone connection and bounded monitoring independent of recording.
- Existing note/chord detection, candidates, confidence, lifecycle, diagnostics, and actionable
  permission/device/silence/clipping/failure states.
- Record, pause, resume, stop/finalize, replay, disconnect, device-loss recovery, and the existing
  five-minute safe-finalization behavior unless an approved measured replacement supersedes it.
- Local document, session, take, correction, and optional audio-media persistence with visible
  availability.
- Take-only listening and, when a playable reference exists, coordinated reference/take A/B review.
- Explicit import/export scope, deletion impact previews, and recovery from missing local media.
- Desktop Chrome/Edge, keyboard, browser zoom, screen-reader, contrast, focus, and reduced-motion
  support described in section 9.

### 6.2 P1: gated first-release enhancements

- Synchronized reference video and take video in the approved dual-canvas/focus-mode experience.
  Video remains optional to the guitarist even if the owner requires the capability to ship.
- Multi-anchor synchronization authoring, stale-map review, explicit rebase/re-author, and media
  relinking against an exact immutable document revision.
- Expected-versus-observed timing and pitch/chord assessment, calibrated uncertainty, weak-range
  navigation, and repeated-loop comparison.
- Additional tested guitar-aware import formats and richer export routes.
- MIDI import as an explicit performance-to-draft conversion with guitar-position ambiguity and
  semantic-loss reporting; authored MIDI export separate from observed-session MIDI export.
- Broader notation and guitar-technique authoring after the initial support matrix is accepted and
  fixture-tested.

P1 features may ship only when their individual acceptance gates pass. Their absence must not make
the P0 journey misleading or unusable.

### 6.3 P2: later breadth

- Additional tunings and capo configurations in the evaluated user experience.
- Multiple guitar tracks, bass, ukulele, extended-range guitars, and other instruments.
- Advanced engraving, complex repeat structures, broader technique playback, and interchange
  beyond the accepted fidelity matrix.
- Hardware MIDI input, native desktop packaging, and collaboration.
- Expanded long-form recording and media-management workflows beyond approved local budgets.

### 6.4 Explicit non-goals for this release

- Mobile or tablet composition, mobile browser support, or a mobile navigation system.
- A configurable rack of reorderable analysis utilities as the product shell.
- DAW-grade multitrack editing, dense-mix source separation, or native ASIO integration.
- Guaranteed exact transcription, fingering, timing, or performance grades from uncertain audio.
- Live fretboard/hand computer vision, audio/vision fusion, or automatic visual fret indexing.
- GPT-generated interpretation, coaching, or signal-processing decisions.
- Cloud accounts, background upload, shared libraries, or automatic remote storage.
- Automatic deletion cascades or silent media replacement.
- A second independent notation, media, recorder, or UI transport clock.

## 7. Document, editing, and import requirements

- **DOC-001:** The score/tab remains the central editable object in Edit, Practice, and Review.
- **DOC-002:** Creating, opening, importing, switching, closing, and recovering a document expose
  unsaved-change consequences before replacement.
- **DOC-003:** Save status reflects durable local state: unsaved, dirty, saving, saved, or failed.
- **DOC-004:** Every durable save creates or identifies a fixed revision suitable for take and media
  references. Undoing does not silently reuse an old revision identity.
- **DOC-005:** Import occurs in a temporary review state and cannot modify the current document
  until accepted.
- **DOC-006:** An import report counts preserved, converted, approximated, dropped, unsupported, and
  blocking items with stable explanations and source locations where possible.
- **DOC-007:** Native export is the only complete editable round-trip guarantee. Other formats state
  exactly what will be lost before download.
- **DOC-008:** Four bars per system is only a presentation default. Reflow never changes musical
  selection, range, loop, event identity, or take binding.
- **DOC-009:** MIDI-derived fingering remains suggested until accepted; MIDI never implies original
  string/fret intent.
- **DOC-010:** Corrupt, oversized, hostile, unsupported, or cancelled imports fail without changing
  the active document.

## 8. Practice, input, take, media, and assessment requirements

### 8.1 Practice transport

- **PRA-001:** Global transport owns play, pause, stop, seek, speed, active range, loop, count-in,
  and current musical position for every coordinated surface.
- **PRA-002:** The active range is a musical range independent of score layout; view and resize
  changes preserve it.
- **PRA-003:** Practice speed changes playback only and does not rewrite authored tempo.
- **PRA-004:** Loop boundaries do not omit or duplicate attacks and do not leak sustained notes into
  the next pass.
- **PRA-005:** Count-in is visibly distinct from recording and score playback. Off-grid or unusual
  starts are explained and never silently snapped.
- **PRA-006:** Notation, cursor, reference audio/video, metronome, count-in, capture, and take replay
  cannot expose competing play states.

### 8.2 Input and recording

- **INP-001:** The application explains microphone permission before requesting it and allows device
  selection, retry, refresh, and explicit disconnect.
- **INP-002:** Connecting enters bounded monitoring without creating a session, retaining recording
  PCM, or running recording-only finalization.
- **INP-003:** Input connection and recording operation are independent, explicitly named states.
- **INP-004:** Monitoring shows current device, level, clipping/silence/device warnings, and bounded
  live note/chord evidence. Advanced candidates and diagnostics are progressively disclosed.
- **INP-005:** Start, pause, resume, stop/finalize, replay, device loss, failure recovery, and the
  duration limit preserve the last valid take whenever defensible.
- **INP-006:** Paused wall-clock time is excluded from the contiguous recording-relative timeline.
- **INP-007:** Reference, metronome, and count-in output never enters the software microphone capture
  path. The UI warns about physical speaker bleed and recommends headphones where relevant.
- **INP-008:** Raw events, confidence, alternatives, lifecycle, timing, and provenance remain
  inspectable. User correction is append-only.

### 8.3 Take and A/B review

- **TAK-001:** A finalized take names the exact score revision, selected range, practice speed,
  count-in/metronome setup, evidence snapshot, and media identity used.
- **TAK-002:** A completed take remains inspectable if the editable score, mutable session head, or
  optional media later changes availability.
- **TAK-003:** Audible take replay is a real-time listening operation distinct from deterministic
  analyzer replay.
- **TAK-004:** The minimum review experience provides take-only listening, time navigation, evidence
  inspection, and clear unavailable-media recovery. When reference playback exists, it also
  provides reference-only and coordinated comparison without independent transports.
- **TAK-005:** Later corrections or analysis versions produce new snapshots/assessments and do not
  rewrite earlier takes.

### 8.4 Optional reference and take video

- **VID-001:** Reference video and take video are separate optional media types with separate labels,
  sources, permissions, availability, and deletion effects.
- **VID-002:** Video preserves intrinsic aspect ratio by default; deliberate fill/crop is reversible
  and clearly indicated.
- **VID-003:** A synchronization map is valid only for the exact immutable score revision against
  which its anchors were authored.
- **VID-004:** Score edits that change revision identity make an old map stale. Rebase or re-author
  is explicit and preserves provenance; no silent retargeting occurs.
- **VID-005:** Missing, moved, unsupported, stale, deleted, permission-blocked, or device-lost video
  does not invalidate the score, session, or take.
- **VID-006:** Camera capture cannot open a hidden second microphone evidence path.
- **VID-007:** Reference-video audio and take-video embedded audio follow the owner-approved policy
  in `desktop-practice-product-decisions.md`; neither may silently become authoritative evidence.

### 8.5 Assessment

- **ASM-001:** Assessment starts only from a fixed score revision and immutable take/evidence
  snapshot.
- **ASM-002:** Expected attacks, pitches, chords, duration, bar/beat, and range provenance remain
  distinguishable from observed notes, candidates, corrections, and unavailable evidence.
- **ASM-003:** Alignment preserves missed, extra, unmatched, and ambiguous events rather than forcing
  one-to-one correspondence.
- **ASM-004:** Results state their algorithm/version and confidence. Below calibrated thresholds,
  the product says “uncertain” or “not assessed,” not “wrong.”
- **ASM-005:** Weak-range navigation can select and loop a range without changing the source score,
  take, or assessment record.
- **ASM-006:** No single grade appears until representative guitar fixtures demonstrate that the
  grade is calibrated and useful.

## 9. Supported environment, resize, and accessibility

### 9.1 Environment

- Current stable desktop Chrome and Edge on supported Windows and macOS hardware.
- HTTPS for permissioned capture outside local development.
- One foreground six-string guitar. Standard tuning is the evaluated P0 configuration.
- Direct interface/microphone input or a reasonably quiet room.
- Desktop layout only. Phone and tablet layouts are not release targets.

Final bundle, long-score, memory, storage, camera, and simultaneous-runtime budgets are accepted
only after the isolated spike measures the candidate stack. A product requirement may not invent a
budget before evidence exists.

### 9.2 Desktop resize and zoom

- The ordinary dual-canvas workspace works at supported desktop window sizes without clipped or
  unreachable essential controls.
- At narrow desktop widths or increased zoom, the workspace may collapse secondary rails, offer a
  single-canvas focus mode, stack contextual information, or provide score-local horizontal
  scrolling where the notation is inherently two-dimensional.
- At 200% browser zoom, every essential workflow remains operable with no lost command, hidden
  status, or two-dimensional page-wide scroll requirement. This does not create a phone layout
  obligation.
- Resizing, zooming, reflowing, or changing score view preserves document identity, selection,
  active range, transport position, recording state, and media source.

### 9.3 Keyboard and assistive technology

- Every essential document, transport, input, recording, media, and review command is keyboard
  operable and has a visible focus indicator.
- Global shortcuts do not fire while the user is typing or editing score text. Shortcut scope and
  conflicts are documented and discoverable.
- The score has an ordinary semantic inspection/editing representation organized by track, measure,
  beat, event, string, fret, technique, and duration; users are not required to focus rendered
  notation glyphs.
- Composite score navigation uses one predictable tab stop with documented internal navigation.
  Selection and keyboard focus remain distinguishable.
- Transport, count-in, recording, finalization, permission, error, save, import, and synchronization
  changes are announced without flooding live regions.
- Meters, confidence, provisional/finalized state, selection, stale state, and errors have textual
  and non-color equivalents.
- Motion respects reduced-motion preferences; visual beat motion is not required to understand the
  beat.
- Essential text and controls meet WCAG 2.2 AA contrast and target-size expectations.

## 10. Local-first privacy, lifecycle, deletion, and export

- No microphone or camera request occurs before an explicit user action.
- Raw microphone and camera data remains local by default. No background network upload occurs.
- Monitoring PCM is bounded and discarded; recording media is retained only according to visible
  local policy.
- Device labels and raw media are excluded from diagnostics or export unless the user explicitly
  includes them.
- Documents, sessions, takes, structured evidence, reference media, and self-recorded media have
  separately visible retention and availability states.
- Deleting one object never silently cascades through related history. Before destructive action,
  show what stays usable, what loses replay, what becomes stale, what is permanently removed, and
  whether the action can be undone.
- Missing or evicted bytes are never reported as available. A hash-verified relink may restore
  media availability without changing immutable take identity.
- Native bundle export previews included, external, omitted, unavailable, or unsupported media.
  Private PCM/video is opt-in under the recommended policy pending owner acceptance.
- Observed-session JSON/MIDI export and authored-document export remain clearly separated.
- Remote interpretation, if ever approved, is explicit, minimized, cancellable, and never required
  for the local product.

## 11. Error and recovery requirements

The workspace defines useful actions for:

- no document, empty library, loading, cancelled import, and failed import;
- dirty document replacement, save failure, quota exhaustion, blocked storage upgrade, corruption,
  and another tab holding an incompatible database version;
- microphone permission denial, no device, device busy, unsupported browser, suspended audio,
  device loss, silence, clipping, worker failure, duration limit, and recoverable finalization;
- reference/take media absent, loading, unsupported, missing, stale, deleted, permission blocked,
  device lost, decode failed, or storage-evicted;
- transport preparation, seek, or playback failure;
- take finalization interruption, unavailable PCM, and relink mismatch; and
- assessment queued, running, partial, uncertain, stale, or failed.

Recovery must preserve the current document and the last valid completed evidence unless the user
previews and confirms deletion. Retry never silently replaces data or creates duplicate immutable
history.

## 12. Measurable acceptance criteria

The P0 release is acceptable only when all applicable checks pass on the declared support matrix:

1. A first-time user can create or import a guitar score, accept or cancel import review, select a
   range, practice it, connect input, record/finalize a take, replay it, save, reload, and export or
   delete it without encountering an unlabeled placeholder or unavailable primary command.
2. The saved/reloaded document is semantically equivalent to the committed revision; a take resolves
   to the same exact document revision and evidence identity after reload.
3. Selection and loop range survive combined tab/notation, tab-only, fit-range, focus, page,
   continuous, dual-canvas, resize, and 200% zoom transitions.
4. Play, pause, seek, speed, loop, cursor, metronome, count-in, capture, and supported media expose
   one coordinated transport state. No supported workflow can start a competing clock.
5. Connecting a microphone for monitoring creates no recorded session or retained recording PCM.
   Record, pause, resume, stop, replay, disconnect, five-minute safe finalization, device loss, and
   recoverable failure pass existing regression tests and representative hardware verification.
6. Raw evidence, corrections, uncertainty, lifecycle, timing, provenance, and unavailable-media
   states remain distinguishable through save, reload, replay, and export.
7. Take-only replay works for an available finalized take. When reference playback is in scope,
   reference-only and coordinated comparison work without reference output entering software
   capture.
8. Permission denial, save/quota failure, interrupted finalization, missing media, and stale sync
   each preserve the score and last valid take and present at least one actionable recovery path.
9. Keyboard-only and screen-reader users can create/open, inspect/edit the score, select a range,
   control transport, connect input, record, review, save/export, and recover from representative
   errors. Automated checks and focused manual review find no blocking WCAG 2.2 AA issue.
10. At 200% zoom and the supported desktop window matrix, essential controls, status, focus, and
    reading order remain reachable; no full-page two-dimensional scrolling is required.
11. No microphone/camera request or raw-media network request occurs without explicit user action.
    Deletion and export previews accurately enumerate affected objects and media.
12. A clean checkout passes formatting, lint, type checking, unit/integration tests, supported
    browser tests, dependency/license checks, and a production build. Measured post-spike budgets
    are recorded and pass before the associated technology becomes P0.

P1 video and assessment each have separate acceptance gates. Failing either must degrade to the
complete P0 journey rather than weakening it.

## 13. Product decisions fixed by this definition

- Desktop web is the target; there is no mobile-layout requirement.
- The score/tab is central, with the approved dual-canvas and focus-mode direction.
- The current rack presentation is superseded; implemented audio behavior and evidence integrity
  remain protected.
- Reference video and take video are separate optional media concepts.
- Synchronized practice video is not computer-vision inference.
- One future application-owned `PracticeTransport` is authoritative.
- Authored intent, observed evidence, immutable takes, mutable media availability, and derived
  assessment remain separate.
- Four bars per system is a presentation default, never persisted document structure.
- Live computer vision, fusion, and GPT interpretation are deferred until separately justified and
  approved.

## 14. Accepted product decisions

The choices and consequences are recorded in `desktop-practice-product-decisions.md`. On 2026-07-20,
the owner accepted D1–D10 as recommended, including gated first-release synchronized video and
structured export with private PCM/video media opt-in. Architecture-specific package, license,
codec, synchronization, storage, and measured-budget decisions remain deliberately outside this
product document.
