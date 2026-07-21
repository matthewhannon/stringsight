# StringSight Style Migration Handoff

- **Updated:** 2026-07-19 20:31 America/Los_Angeles
- **Workspace:** `C:\Users\matt\Documents\OpenAI-Build-Week`
- **Branch:** `codex/audio-input-rack-ui`
- **Current HEAD:** `48c2d9b feat: add compact audio analysis monitor`
  **Purpose:** Carry the Audio Input design reasoning through the rest of the StringSight audio
  interface without applying superficial styling, duplicating components, or weakening domain behavior.

## Start here

Read this document completely, then inspect:

1. `docs/design/rack-direction.md`
2. `src/ui/rack/README.md`
3. `docs/plans/audio-input-rack-ui-migration.md`
4. `src/app/AudioCapturePanel.tsx`
5. `src/app/audio-input/`
6. `src/ui/rack/RackAudioControls.tsx`
7. `src/app/RackWorkspace.tsx`
8. `src/app/rackWorkspaceModules.ts`
9. The panel being migrated and its existing tests before changing it

The goal is not “make every screen look like the Audio Input panel.” The goal is to apply the same
decision process: clarify the user’s primary task, remove implementation-oriented noise, reveal
advanced evidence on demand, use controls whose form matches their job, and preserve honest real
state and accessibility.

## Current repository state

The production Audio Input migration is already committed on this branch:

- `7f342cb feat: migrate audio input to rack UI`
- `48c2d9b feat: add compact audio analysis monitor`

The original separate prototype remains available at:

`http://127.0.0.1:5173/audio-input-prototype.html`

The production application is at `/`. Do not restart the Audio Input migration from the prototype;
the real implementation now lives in production components.

At the time of this handoff, additional workspace/view changes are uncommitted:

- modified `src/app/App.test.tsx`
- modified `src/app/RackWorkspace.tsx`
- modified `src/ui/rack/README.md`
- modified `src/ui/rack/rack.css`
- modified `tests/e2e/app.spec.ts`
- new `src/app/rackWorkspaceModules.ts`
- new `src/app/workspaceLayout.ts`
- new `src/app/workspaceLayout.test.ts`

Preserve these changes. Inspect and stabilize them before starting another broad visual migration.
Do not overwrite or reimplement them from memory.

## What was wrong with the original Audio Input section

The original section had accumulated product, diagnostic, and development concerns in one always-open
surface. It exposed too much at the same visual level:

- microphone connection and recording actions appeared as a wall of similar rectangular buttons;
- connection, input-off, and recording state were repeated in several places;
- the waveform, warnings, device settings, privacy explanation, calibration copy, reference tools,
  replay, import, and diagnostics competed for attention;
- a native-looking select and modern rounded controls conflicted with the rack enclosure;
- technical fields such as channel handling, browser processing, latency, dropped chunks, and sample
  rate were permanently visible even when the user only wanted to play;
- warnings such as “multiple inputs detected” and “no clear input” often described ordinary
  situations already visible in the source selector or waveform;
- long explanatory copy told users how to read the interface instead of letting the interface show
  its state;
- large rounded cards and diffuse shadows made the content feel like a web dashboard placed inside a
  decorative rack frame;
- empty space was accidental rather than part of a deliberate display/control hierarchy;
- developer calibration and reference actions were mixed into the ordinary user workflow.

The central problem was information architecture, not simply color, spacing, or button styling.

## The reasoning process used for Audio Input

### 1. Separate audiences and information levels

Every element was classified into one of three levels:

1. **Primary user controls and feedback** — always visible because they are needed to operate the
   input: source, waveform, level, input power, recording, import, and essential transport state.
2. **Optional advanced information** — available on demand: device diagnostics and a fuller privacy
   explanation.
3. **Development-only tools** — calibration, test references, fixture-oriented actions, and internal
   diagnostics that ordinary users should never encounter in the production surface.

This classification should be repeated for every remaining module before changing its layout.

### 2. Correct the product model before styling it

Monitoring and recording are independent:

- Input ON connects the source and enables live waveform, note, and chord monitoring.
- Recording is optional and creates the retained take/session.

The interface therefore uses separate input and record controls. Recording is not presented as the
switch that enables analysis. This is a domain truth and must remain consistent throughout the app.

### 3. Establish a stable first-glance hierarchy

The approved hierarchy became:

1. waveform display;
2. input-level meter;
3. physical transport faceplate anchored at the bottom;
4. source/configuration rail on the right;
5. optional device or privacy detail in a stable display area.

The waveform and source selector remain visible because they answer the first two questions a user
has: “Is sound arriving?” and “Which input am I using?”

### 4. Use progressive disclosure without layout movement

Device and privacy details are mutually exclusive. Their controls use explicit detail keys rather
than ambiguous plus icons or long instructional links. Opening detail does not make the rack module
taller or push surrounding modules down.

Progressive disclosure is not permission to hide essential actions. Pause, Stop/finalize, Replay,
Disconnect, errors, and recovery remain available when their states require them.

### 5. Give different jobs different physical controls

Three copies of the same rounded web button were replaced with distinct control types:

- a latching rocker for input power;
- a compact momentary utility key for loading media and contextual transport;
- a large circular illuminated punch button for recording;
- separate signal, peak, active, and ready lamps for persistent state;
- a segmented dB meter instead of a smooth progress bar;
- a recessed source display with a full-width accessible selection menu.

The shapes are not decoration. They reduce errors by making actions recognizable before the labels
are read. Position, text, disabled state, and illumination communicate state together; color is never
the only signal.

### 6. Make the rack metaphor structural, not theatrical

The direction is a modern boutique rack processor:

- black anodized and brushed-metal faceplates;
- harder 2–6 px corners inside the enclosure;
- shallow bevels and short directional shadows;
- recessed instrument displays;
- etched labels attached to the faceplate, not floating inside controls;
- restrained mint illumination for powered/live state;
- amber for approaching peak and red for recording or danger;
- no distressed textures, oversized glow, or ornamental hardware that obscures labels.

Large rounded cards, soft floating shadows, native form styling, and repeated generic buttons are the
main visual patterns to retire.

### 7. Use empty space intentionally

The faceplate was moved to the bottom of the left panel. The separation between display/meter and
physical controls now reads like the organization of manufactured equipment rather than an unfinished
card. Labels and source names were enlarged because readability matters more than artificial density.

Empty space is acceptable when it separates functional zones. It is not acceptable when it results
from a fixed oversized card, placeholder copy, or content that is waiting for an accordion to open.

### 8. Remove copy that does not help a decision

Removed copy included:

- the module description explaining how to choose, monitor, and record;
- the `LIVE INPUT` heading and waveform explanation;
- the sentence explaining that note/chord analysis begins with input and recording is optional;
- prototype instructions;
- redundant source numbering;
- warnings that duplicated information already visible in the waveform or source menu.

Keep copy when it explains a consequence, recovery action, privacy boundary, uncertainty, or safety
condition. Remove copy that merely narrates visible controls.

### 9. Treat accessibility as part of the physical design

The custom source selector retained combobox/listbox semantics and keyboard behavior. Physical
controls use stable accessible names, pressed/disabled state, generous hit targets, and visible focus
rings. Reduced-motion behavior disables unnecessary pulsing. Visual labels were enlarged rather than
relying on tooltips.

Do not use hover-only disclosure for important privacy, error, status, or operating information.

## What is now implemented in production

`AudioCapturePanel.tsx` remains the orchestration boundary. It reads real capture snapshots and owns
UI coordination such as active detail, device enumeration, imports, and queued device changes. It
does not simulate the capture lifecycle.

The presentation is decomposed into:

- `AudioInputDisplay.tsx` — live waveform, timer, input-off state, device detail, and privacy detail;
- `AudioLevelMeter.tsx` — real segmented input level;
- `AudioTransportFaceplate.tsx` — input rocker, signal/peak lamps, load/context keys, and record punch;
- `AudioSourceRail.tsx` — source selector, detail keys, privacy status, and compact analysis monitor;
- `AudioInputAnalysisMonitor.tsx` — compact live/final note and chord readouts;
- `audioCapturePanel.css` — production Audio Input layout, kept out of the old global stylesheet.

Reusable rack controls live in `src/ui/rack/RackAudioControls.tsx`:

- `RackRockerSwitch`
- `RackStatusLamp`
- `RackSegmentedMeter`
- `RackUtilityKey`
- `RackRecordPunch`
- `RackSourceSelector`
- `RackDetailKey`

These controls are controlled presentation components. Domain panels pass real state and actions to
them. They must not start importing controllers or inventing domain state.

The capture controller also gained a race-safe real input-device switch path. Do not regress to a
selector that is merely visually enabled while failing to update the active audio graph.

## Principles to carry through the rest of the interface

For every module, answer these questions before editing code:

1. What is the one thing a normal user came here to see or do?
2. What must remain visible at all times for safe operation?
3. What is useful evidence but not required at first glance?
4. What is meaningful only to developers or evaluators?
5. Which states and recovery actions must remain visible?
6. Which control form best matches each action?
7. Can detail open without moving the surrounding rack?
8. Is text explaining the interface because the hierarchy is unclear?
9. Does the proposed design preserve uncertainty and provenance?
10. Can the complete interaction be performed with a keyboard and at narrow widths?

Apply the same thinking, not necessarily the same components. A correction editor should not become
a panel full of rocker switches. Text-heavy review work can use crisp workstation surfaces, while
live signal controls can use stronger physical affordances.

## Remaining interface inventory and migration direction

### 1. Pitch Analysis

- **Current component:** `src/app/AudioAnalysisPanel.tsx`
- **Registry view:** `analysis` / Pitch Analysis

#### First-glance user need

- current detected note;
- whether it is live, finalized, uncertain, or waiting;
- cents sharp/flat and tuning direction;
- a confidence/match indication that does not imply false certainty.

#### Secondary information

- ranked alternatives;
- the bounded recent-note timeline;
- timing and lifecycle when the user chooses to inspect history.

#### Advanced/developer information

- detected onset count;
- worker and maximum processing latency;
- input and analysis sample rates;
- dropped analysis chunks;
- analysis run ID.

#### Recommended direction

- Build the first view around one large tuner-like note display.
- Use a center-zero cents/tuning meter rather than a generic confidence progress bar as the primary
  physical visualization.
- Keep lifecycle text visible; color alone is not enough.
- Move implementation diagnostics behind a `DETAIL / ANALYSIS` key or a shared diagnostics screen.
- Keep alternatives available but visually subordinate to the primary note.
- Present the six-event timeline as a compact history strip or lower rack display, not six unrelated
  web cards.
- Remove empty-state copy that narrates obvious behavior; retain concise recovery guidance when input
  is disconnected or the signal is unsuitable.

### 2. Chord Analysis

- **Current component:** `src/app/PolyphonicAnalysisPanel.tsx`
- **Registry view:** `polyphonic-analysis` / Chord Analysis

#### First-glance user need

- current chord symbol;
- live/finalized/uncertain state;
- match strength and bass/inversion when supported;
- an honest indication when evidence is ambiguous.

#### Secondary information

- top alternatives;
- pitch-class/chroma evidence;
- recent chord timeline;
- analysis profile selection.

#### Advanced/developer information

- model backend, state, warmup, inference time, and window count;
- worker and maximum processing time;
- analysis sample rate, raw signal energy, dropped chunks, and run ID;
- finalized note-set counts when they are implementation diagnostics rather than user outcomes.

#### Recommended direction

- Make the chord symbol the dominant instrument readout.
- Keep bass/inversion and match strength adjacent to the symbol, not spread across cards.
- Treat chord alternatives as a secondary bank that can be revealed without replacing the primary
  readout.
- Decide whether the 12-class chroma display earns permanent visibility. If retained, restyle it as
  a deliberate spectrum/evidence display; otherwise place it behind an evidence detail key.
- Move model and worker diagnostics behind advanced detail.
- Convert the Accurate/Responsive choice into a clearly labeled two-position operating-mode control.
  Keep an accessible explanation of the latency/stability tradeoff, but do not leave a paragraph
  permanently occupying the main view.
- Reuse the history treatment chosen for Pitch Analysis so note and chord timelines feel related.

### 3. Session Review

- **Current component:** `src/app/SessionReviewPanel.tsx`
- **Registry view:** `session-review` / Session Review

#### First-glance user need

- whether a completed session exists;
- session title and durable/local status;
- finalized events in time order;
- save, replay/load, and appropriate export actions;
- clear indication when an event has been corrected.

#### Secondary information

- correction editor for the selected event;
- ranked alternatives;
- correction history;
- locally saved sessions.

#### Advanced/developer information

- raw algorithm name and version;
- provenance detail;
- correction validation problems and raw/corrected projections beyond the concise user summary.

#### Recommended direction

- Use a workstation/editor layout rather than forcing every action into skeuomorphic audio controls.
- Keep the event list primary and make the correction editor contextual to the selected event.
- Visually distinguish immutable detector output from the user’s correction without presenting both
  as equal editable fields.
- Group save/export actions by outcome and reduce the current button density.
- Keep destructive Delete visually and spatially separate from Load.
- Move provenance and algorithm/version fields behind evidence detail.
- Consider saved sessions as a drawer, library, or lower bay rather than another full card competing
  with the active session.
- Preserve append-only corrections and never imply that the raw detector event was overwritten.

### 4. Session Status Bar and Workspace Navigation

**Current component:** `src/app/RackWorkspace.tsx`

The current branch contains active uncommitted work that changes the workspace into pinned views with
a dock and Add View drawer. Stabilize that work before restyling it.

#### First-glance user need

- current connection/recording/session state;
- elapsed time;
- active view;
- a reliable Stop action while recording or paused.

#### Secondary information

- note/chord counts;
- key and scale interpretation;
- pinned-view arrangement.

#### Developer-only information

- the Evaluation Bench view and other future diagnostics.

#### Recommended direction

- Keep the session strip compact and instrument-like; avoid repeating state already shown inside the
  active Audio Input module unless the global Stop/safety affordance requires it.
- Preserve a global Stop action because it is safety-critical and useful outside the Audio Input view.
- Treat view arrangement as an explicit mode, not permanently visible small controls.
- Keep the Add View drawer categorized by user purpose.
- Verify developer-only registry entries are omitted from production rendering, focus order, and
  persisted layouts—not merely hidden with CSS.
- Use readable view names. Internal item numbers and implementation milestones do not belong in the
  ordinary workspace.

### 5. Evaluation Bench

- **Current component:** `src/app/BenchmarkPanel.tsx`
- **Registry view:** `benchmark` / Evaluation Bench
- **Audience:** developer/evaluator only

This module contains fixture type, guitar/input/room conditions, scripted performance instructions,
per-event truth labels, WAV export, and label export. It is intentionally not an ordinary user tool.

#### Recommended direction

- Keep the production boundary as the priority: `developmentOnly` must prevent the view from being
  rendered in production.
- Do not spend user-facing polish effort on this module before Pitch, Chord, Review, and the workspace
  shell are coherent.
- When migrated, use a utilitarian test-bench layout with clear stages: prepare, record, review,
  export. It may be denser than the consumer modules.
- Preserve explicit fixture metadata, corrections, and export safeguards. Do not hide technical
  fields merely to match the consumer rack style.

## Cross-module information policy

Use this visibility policy consistently:

| Information                                        | Default treatment                                   |
| -------------------------------------------------- | --------------------------------------------------- |
| Current musical result                             | Large, always-visible instrument readout            |
| Input/record/session safety state                  | Always visible with text plus physical/visual state |
| Essential action                                   | Dedicated control appropriate to the action         |
| Ranked alternatives                                | Secondary bank or detail view                       |
| Recent history                                     | Compact bounded timeline/history surface            |
| Device/privacy explanation                         | Mutually exclusive detail view                      |
| Model, worker, latency, sample-rate, run ID        | Advanced diagnostics                                |
| Calibration, fixture generation, reference signals | Development-only rendered boundary                  |
| Error and recovery action                          | Visible at the point of failure; never tooltip-only |
| Privacy consequence                                | Short persistent status plus fuller optional detail |

## Shared visual and interaction rules

- Use rack tokens from `src/ui/rack/tokens.css`; promote a value only when it is genuinely shared.
- Keep domain-specific layout in a scoped component stylesheet rather than continuing to expand
  `src/styles/global.css`.
- Prefer 2–6 px internal radii. Reserve larger radii for the outer rack enclosure.
- Use crisp, directional shadows and recessed displays; avoid generic floating cards.
- Increase primary labels and values before adding hover explanations.
- Do not make every action a `RackButton`. Use the appropriate existing rack control or create a
  reusable controlled primitive after confirming at least two real consumers.
- Maintain stable module height when switching ordinary detail states.
- Avoid permanent internal scrollbars for small known datasets. Use bounded history and scrolling
  only when the content is genuinely variable or user-controlled.
- Do not cram empty areas with decorative lamps. Every indicator must expose real state.
- Do not animate entire controls. If motion helps, animate only the lamp/readout and honor reduced
  motion.
- Do not use color as the sole state channel.
- Do not rely on hover for touch or keyboard users.
- Preserve honest uncertainty: “match strength” is not “probability,” and provisional/live is not
  finalized.

## Engineering approach for each module

Use the following sequence one module at a time:

1. Run and read the existing focused tests.
2. Document the module’s state × action matrix.
3. Classify every visible field as primary, secondary, advanced, or development-only.
4. Produce a compact layout proposal using real state and realistic longest labels.
5. Identify reusable rack primitives and domain-specific presentation components.
6. Extract presentation without moving controller/domain state into the rack library.
7. Wire the new view to the existing controller snapshots and actions.
8. Migrate tests; do not delete old behavioral coverage just because labels changed.
9. Verify keyboard use, focus, reduced motion, narrow widths, empty state, error state, and maximum
   content.
10. Run formatting, lint, TypeScript, focused tests, full tests, build, and application E2E.
11. Review the migrated module in the running app before beginning the next one.

Recommended order:

1. stabilize and commit the current workspace/view changes;
2. Pitch Analysis;
3. Chord Analysis;
4. Session Review;
5. Session Status and workspace navigation polish;
6. Evaluation Bench only after the user-facing rack is coherent.

## Anti-shortcut rules

- Do not copy the Audio Input JSX or CSS wholesale into another module.
- Do not add another local UI state machine that shadows a domain controller.
- Do not invent fake values, timers, meters, results, or diagnostics in production.
- Do not hide developer tools with CSS; remove them from the production render path.
- Do not remove real error, recovery, transport, review, provenance, or export behavior to simplify a
  screenshot.
- Do not put every advanced field into one generic modal without considering its relationship to the
  active readout.
- Do not append large module-specific blocks to global CSS when a scoped stylesheet is appropriate.
- Do not create a reusable rack primitive around a one-off visual idea before its API is clear.
- Do not change analyzers, thresholds, event lifecycle, persistence, or capture timing for a visual
  migration unless a concrete controller contract requires it.
- Do not allow a style pass to reduce test coverage or accessibility semantics.

## Definition of success

The migration is successful when a new user can open any primary module and understand its main
result and available action in a few seconds, while an advanced user can still inspect evidence and
diagnostics without leaving the rack. Developer tooling is absent from production. Modules feel like
parts of the same manufactured workstation, but their controls differ according to their jobs. All
displayed state comes from the real domain controllers, and the existing analysis, recording,
session, privacy, persistence, and export guarantees remain intact.

## Suggested prompt for the next chat

> Read `style-migration-handoff.md` completely. Inspect the current branch and preserve all existing
> uncommitted workspace/view changes. Begin by stabilizing that work, then audit Pitch Analysis using
> the primary/secondary/advanced/developer classification in the handoff. Propose the Pitch module’s
> real state/action layout before implementing it. Build reusable controlled rack components only
> where justified, keep domain state in its existing controllers, migrate tests rather than deleting
> coverage, and do not move on to Chord Analysis until Pitch is verified.

## Suggested new chat title

`StringSight — Rack Style Migration Beyond Audio Input`
