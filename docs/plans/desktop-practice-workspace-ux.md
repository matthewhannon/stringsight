# Desktop Practice Workspace UX architecture

- **Status:** Accepted
- **Accepted:** 2026-07-20
- **Last updated:** 2026-07-20
- **Product requirements:** `01-product-requirements.md`
- **Wireframes:** `desktop-practice-workspace-wireframes.md`
- **State/action map:** `desktop-practice-workspace-state-actions.md`

## 1. Purpose and authority

This document defines the implementation-neutral desktop experience for StringSight. It describes
what users can find, what remains persistent, how commands are scoped, how the workspace responds
to lifecycle changes, and which information is progressively disclosed.

The committed dual-canvas workspace on `main` at `0b23c6e` is approved visual-direction evidence,
not the product contract. Component names, CSS, demo data, placeholder controls, third-party
renderer behavior, persistence schemas, and current local state do not define the architecture.

## 2. Information architecture

StringSight has one application shell and three task modes around one active document.

```text
Application
├── Library and document entry
│   ├── New tab
│   ├── Open native document
│   ├── Import and review
│   └── Recent/local documents
├── Active document workspace
│   ├── Edit
│   ├── Practice
│   └── Review
├── Persistent input and evidence status
├── Persistent authoritative transport
└── Contextual surfaces
    ├── Import report / edit inspector
    ├── Reference or take video
    ├── Input settings / analysis details
    ├── Takes and A/B controls
    └── Assessment and weak-range navigation
```

### 2.1 Persistent regions

These regions retain meaning across Edit, Practice, and Review:

| Region                  | Purpose                                                                                   | Persistence rule                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Application header      | Product identity, active document identity/status, mode, privacy, library toggle          | Never claims durable save until confirmed             |
| Library/navigation rail | New/open/import and recent documents                                                      | Collapsible; one active document in v1                |
| Score canvas            | Primary authored object and stable musical selection                                      | Remains central or directly recoverable in every mode |
| Input/evidence status   | Connection, recording lifecycle, level, current note/chord, warnings                      | Monitoring and recording remain visibly distinct      |
| Global transport        | One place for play/pause/stop/seek, time, range, loop, speed, metronome, count-in, record | Remains command authority from the user's perspective |

“Persistent” means the function and state remain available; narrow windows or focus modes may
collapse a region behind an explicitly named control without destroying it.

### 2.2 Contextual regions

- **Edit inspector:** selection properties, structured score editing, import issues, and undo/redo
  context. It does not become a second document.
- **Video canvas:** reference or take video, sync status, cues, and fit/crop controls. It is absent or
  collapsible when no video is attached.
- **Analysis detail:** ranked candidates, confidence, provenance, lifecycle, tuning, and diagnostics.
  First-glance monitoring stays compact.
- **Take review:** take picker, take-only replay, reference/take comparison, corrections, and media
  availability.
- **Assessment:** derived results and weak-range navigation. It appears only when an assessment
  exists or can validly be requested.

## 3. Visual and interaction hierarchy

The priority order is:

1. Score/tab and its current musical range.
2. Authoritative transport and current lifecycle.
3. The active task's contextual canvas: edit inspector, reference/take video, or review.
4. Input evidence needed to practice safely and confidently.
5. Advanced analysis, diagnostics, history, and secondary settings.

The UI must not give MIDI visualization, diagnostics, decorative waveforms, or a media placeholder
more visual authority than the guitar tab. A video canvas is large enough for fingering reference
when visible and preserves the media's aspect ratio by default.

## 4. Workspace modes

### 4.1 Edit

Edit is for creating and changing authored intent.

- The score and stable selection dominate.
- Score-semantic commands, undo/redo, metadata, instrument configuration, and supported technique
  editing are visible or discoverable.
- Import review is a temporary Edit substate. Material conversion/loss is resolved before commit.
- Practice speed, current transport position, panel sizes, and live evidence are not saved as score
  content.
- Existing takes stay bound to their original revisions; score edits never silently retarget them or
  media synchronization.

### 4.2 Practice

Practice is the headline mode.

- The ordinary layout is the approved dual canvas: score/tab plus optional reference/take video.
- When video is absent, the score expands; the empty media area does not permanently consume the
  workspace.
- Input status and authoritative transport remain immediately accessible.
- Range creation, loop, speed, metronome, count-in, monitoring, and recording are first-class.
- The user can switch among dual-canvas, Tab Focus, and Video Focus without changing selection,
  transport position, or recording identity.

### 4.3 Review

Review is for one completed take and its evidence.

- The user always knows which score revision, range, and take are being reviewed.
- Take-only audible replay is primary. Reference/take comparison is shown only when the reference is
  genuinely available.
- Raw observed evidence, current correction projection, and later assessment remain distinguishable.
- Optional take video and reference video use the same transport but remain separate sources.
- An assessment can suggest a weak range; entering practice copies that range into workspace state
  without changing the score or assessment.

## 5. Score and canvas views

### 5.1 Canvas composition

- **Dual canvas:** score and video side-by-side with a keyboard-operable divider. The score has the
  larger default share.
- **Tab Focus:** score uses the main stage; video state remains intact and can be restored.
- **Video Focus:** video uses the main stage while a compact musical position/range summary and
  transport remain present.
- **No-video practice:** score uses the available stage; the user may attach media from a contextual
  action.

Focus modes are views, not separate playback contexts. Changing them never pauses or seeks unless
the user issues that command.

### 5.2 Score presentation

- **Focus view:** the active range or one dense system for concentrated practice.
- **Expanded view:** more surrounding musical context while retaining a prominent active range.
- **Page view:** printable page-like organization when space permits.
- **Continuous view:** responsive reading/editing through long documents.
- **Tab only / tab with standard notation:** user choice when notation is available.

Four bars per system is a default. Density and window size may change systems per row. Musical
positions, selections, loops, markers, and take references do not depend on page or system layout.

## 6. Command ownership and scope

### 6.1 Global commands

Global commands apply to the active document/workspace:

- New, open, import, save, save as, close, export, and delete.
- Mode selection: Edit, Practice, Review.
- Transport: play/pause, stop, seek, speed, loop enablement, metronome, count-in.
- Input connection/disconnection and record/pause/resume/stop.
- Layout/focus mode and library visibility.

Global commands must not masquerade as selection edits.

### 6.2 Selection/range commands

Contextual commands apply to the current musical selection or active range:

- Edit event/string/fret/duration/technique.
- Cut/copy/paste/delete/transpose/quantize.
- Set, resize, clear, snap, or save a practice range.
- Loop the active range.
- Fit the view to the range.
- Add or edit a media synchronization anchor.
- Run or navigate assessment for that range.

The scope appears in the control's label or nearby heading. If no valid selection exists, the
command is absent or disabled with an explanation.

### 6.3 Destructive commands

Discard import, revert unsaved edits, replace the active document, delete a revision, delete a
session/take/media item, clear corrections, and “delete everything related” require an impact
preview appropriate to their consequence. Preview identifies:

- data removed permanently;
- immutable history retained;
- replay or synchronization that becomes unavailable;
- assessments that become stale or are removed;
- shared references that prevent deletion; and
- available recovery or export-before-delete actions.

## 7. Document, library, save, and version behavior

### 7.1 Navigation model

Recommended first-release model: a collapsible persistent library rail with one active document and
no document-tab strip. The rail holds recent/local documents and New/Open/Import entry points.
Opening another document while the current one is dirty invokes an explicit Save / Discard / Cancel
decision.

### 7.2 Save states

The active document status uses only durable claims:

| State                 | Presentation and allowed action                                    |
| --------------------- | ------------------------------------------------------------------ |
| New/unsaved           | “Not saved”; Save opens the required name/location flow            |
| Clean                 | “Saved locally” only after durable confirmation                    |
| Dirty                 | “Unsaved changes”; Save enabled                                    |
| Saving                | Progress state; duplicate save disabled; editing policy explicit   |
| Save failed           | Error plus Retry and Save As; dirty document remains open          |
| External/stale change | Explain conflict; compare/reload/save copy, never silent overwrite |

Autosave, if later introduced, follows the same truthfulness and cannot hide a failed durable write.

### 7.3 Revisions and dependent artifacts

- A committed save creates or identifies a fixed revision.
- A take, assessment, or synchronization map continues to name the revision it used.
- Editing creates a new working state; dependent artifacts from older revisions are not relabeled.
- Opening an old take may show its archived score revision read-only beside the current document.
- Rebase/re-author of a synchronization map is a deliberate workflow that previews anchor changes
  and preserves prior provenance.

### 7.4 Import review

Import never replaces the active document immediately. The user receives:

- source format/version and proposed title/track;
- counts of preserved, converted, approximated, dropped, unsupported, and blocking items;
- guitar-position and timing ambiguity;
- sanitized metadata preview;
- exact supported destination behavior; and
- Accept as new document, revise choices, or Cancel.

## 8. Input, recording, media, and assessment surfaces

### 8.1 Primary input status

Always-visible or one-action-away practice information:

- selected/actual input device and connected/disconnected state;
- monitoring versus recording/finalizing/replaying state;
- textual input level plus clipping/silence/device warnings;
- current best-supported note or chord, lifecycle, and an honest confidence label;
- actionable recovery and Input settings.

Ranked alternatives, chroma, analyzer version, latency, sample rate, dropped chunks, and detailed
diagnostics belong in progressive disclosure.

### 8.2 Take controls

Record is part of the authoritative transport area but uses an unmistakable recording lifecycle.
Count-in is not presented as already recording unless capture policy actually records pre-roll.
Finalization blocks incompatible actions and explains progress. A failed operation preserves and
offers recovery for the last valid take.

### 8.3 Video

- “Reference video” and “Take video” are never abbreviated into one ambiguous “Video.”
- Fit is the safe default; Fill/crop is an explicit view preference.
- Sync status is textual: not linked, aligned to revision, stale after edit, relink needed, or
  unavailable.
- Video playback controls submit to the global transport. They do not expose a separate independent
  timeline.
- Camera permission is requested only from an explicit Add/Record take video action.

### 8.4 Assessment

Assessment is hidden or labelled unavailable until its prerequisites exist. When available, the
first layer answers:

- What range was assessed?
- Which score revision and take were compared?
- What evidence was strong enough to assess?
- Where should the user practice next?

Detailed alignments, confidence, candidates, algorithm/version, and exceptions are progressively
disclosed. A confidence-limited result uses partial/uncertain language, not a numeric grade that
implies full coverage.

## 9. Progressive disclosure

Three information levels keep the workspace practice-centered:

1. **Immediate:** score/range, transport, input/recording lifecycle, current evidence, critical
   warnings, and visible video/take when selected.
2. **Task detail:** edit inspector, import report, input settings, take picker, A/B controls, sync
   editor, and assessment summary.
3. **Diagnostics:** alternatives, detector provenance, timing details, audio/runtime counters,
   import event accounting, synchronization diagnostics, and assessment alignment internals.

Opening level 2 or 3 does not cover the only recovery control, steal focus without announcement, or
change the transport. Drawers/panels follow one explicit modal or nonmodal focus model and restore
focus to their invoker when closed.

## 10. Desktop resize and browser zoom

- Large windows show the library rail, dual canvas, input strip, and transport simultaneously.
- Medium desktop windows may collapse the library, shorten secondary labels, and reduce contextual
  density while preserving score/video ratio and every essential command.
- At narrow desktop widths or 200% zoom, a single-canvas focus composition may replace the split;
  the user can switch canvas explicitly. Input detail and secondary commands may move to drawers.
- The transport may wrap into semantic rows but keeps command order and status adjacent.
- The video letterboxes/pillarboxes to preserve intrinsic ratio by default.
- The score may horizontally scroll inside its own two-dimensional viewport, but the application
  shell and ordinary text must not require page-wide horizontal scrolling.
- Resizing preserves focus when the focused action still exists; otherwise focus moves to the
  controlling group and the change is announced.

No breakpoint creates a mobile bottom-navigation or touch-only interaction contract.

## 11. Keyboard, focus, and nonvisual semantics

Recommended semantic order:

1. Skip to score, transport, input status, or contextual canvas.
2. Header and mode controls.
3. Library, when open.
4. Workspace toolbar and score.
5. Contextual second canvas/inspector.
6. Input/evidence status and its settings.
7. Global transport and record controls.
8. Open drawers/dialogs according to their modal model.

Keyboard requirements:

- Space toggles playback only outside editable fields and active controls.
- Escape cancels a transient operation or closes the topmost contextual overlay; it does not stop
  recording unless explicitly documented and confirmed.
- Score navigation has one composite entry point; arrow keys navigate semantic neighbors, while
  modifiers extend selection or change string/voice according to documented help.
- Every pointer drag has keyboard increments and direct-value entry where meaningful: split ratio,
  range endpoints, seek, mix, sync anchor, tempo, and fret/duration values.
- Selection, focus, playhead, expected event, observed event, and assessment marker each have
  distinct non-color semantics.

Nonvisual score inspection provides ordered measures/events with bar, beat, voice, string, fret,
pitch, duration, tie/technique, selected state, and validation issue. It is usable without traversing
renderer-specific SVG/canvas glyphs.

Announcements are restrained and prioritized: permission/error and recording lifecycle first;
save/import/sync changes second; beat and live analysis only when explicitly enabled.

## 12. Loading, empty, unavailable, and recovery states

| State                         | Required explanation                                    | Primary actions                                                       | Preservation rule                                   |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| No document / empty library   | What StringSight can open or create                     | New tab, Open, Import                                                 | No permissions requested                            |
| Document loading              | Which document and whether cancellation is safe         | Cancel when possible                                                  | Current document remains until replacement succeeds |
| Import review                 | What will be preserved or lost                          | Accept, revise, cancel                                                | Current document unchanged before acceptance        |
| Permission denied             | Which device and why it is useful                       | Retry, instructions, continue without                                 | Score and completed take remain usable              |
| Unsupported capability        | Exact missing browser capability                        | Supported-browser help, continue with reduced path                    | Do not show broken primary controls                 |
| Save/quota failure            | What failed and whether bytes were written              | Retry, Save As, export, storage review                                | Dirty document remains open                         |
| Interrupted finalization      | Last confirmed recording boundary                       | Resume recovery, finalize recoverable data, discard previewed partial | Last valid completed take remains                   |
| Missing/deleted media         | Which media and why unavailable                         | Relink, locate, remove link, continue                                 | Immutable score/take identity unchanged             |
| Stale sync                    | Old and current score revisions differ                  | Compare, rebase preview, re-author, continue without sync             | Old map retained until explicit replacement         |
| Camera/microphone device lost | What stopped and what was preserved                     | Reconnect/reselect, finalize, continue without                        | Preserve recoverable evidence                       |
| Assessment partial/uncertain  | Which events lacked evidence                            | Inspect, retry with new take, practice unassessed range               | Never convert uncertainty into error count          |
| Assessment stale              | Source revision/evidence no longer matches current view | Open original sources, create new assessment                          | Existing assessment remains reproducible            |
| Corrupt or relink mismatch    | Integrity check failed                                  | Choose different file, remove link, export diagnostics                | Never substitute mismatched bytes                   |

## 13. Workspace state versus authored content

| Workspace/user preference                                 | Authored document content                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Active mode, library open/closed, split ratio, focus mode | Title, credits, score events, rests, voices                                  |
| Page/continuous/focus view, score zoom                    | Guitar tuning/capo/handedness when part of authored instrument setup         |
| Current selection and active practice range               | Tempo, meter, key, track, and supported technique semantics                  |
| Playback position, speed multiplier, loop enabled         | Named loop preset only when the user deliberately saves it into the document |
| Input device, monitoring state, panel disclosure          | Import provenance and accepted conversion report                             |
| Current take/video source, fit/crop preference            | Stable document/revision identity                                            |
| Temporary assessment filter or weak-range selection       | User-authored annotations explicitly saved as score content                  |

Workspace state may be locally remembered as a preference, but restoring it never changes the
document revision. Document changes use explicit edit commands and affect dirty/save state.

## 14. Deliberate first-release exclusions

- Multiple simultaneously open document tabs.
- Mobile/tablet composition or touch-only controls.
- User-configurable rack/module layouts.
- Live camera fretboard analysis, vision overlays, fusion, or automatic fret indexing.
- GPT coaching or musical interpretation.
- Cloud accounts, collaboration, remote library sync, or automatic upload.
- DAW mixing, multitrack editing, and plugin hosting.
- Assessment grades not supported by calibrated evidence.
- Any import/export format or technique outside its accepted fidelity profile.

## 15. UX acceptance

The owner accepted the product decisions on 2026-07-20. Every lifecycle in the companion wireframes
has an explicit state/action path, the state/action map contains no conflicting command ownership,
the focused review found no blocking semantic/focus issue, and the next architecture task can define
contracts without inventing product structure or renderer UI.
