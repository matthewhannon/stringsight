# Desktop Practice Workspace baseline and branch reconciliation

**Status:** Accepted working baseline  
**Recorded:** 2026-07-20  
**Scope:** Establish the production baseline and classify the isolated rack/UI work before the
Practice Workspace architecture or implementation begins.

## 1. Decision

The tested production baseline for the Practice Workspace is `main` at
`1198365a5ec07f2b96ed7e15a9fac115e3766fed` (`Smooth live chord meter rendering`). The new product
work must start from that baseline or a later deliberately accepted descendant of `main`.

The branch `codex/audio-input-rack-ui` is not the new product base. It contains two committed UI
exploration commits plus additional uncommitted UI work:

- `7f342cb` — `feat: migrate audio input to rack UI`
- `48c2d9b` — `feat: add compact audio analysis monitor`

That worktree must remain intact as a reference until every useful behavior has either been ported,
reimplemented, or explicitly declined. Neither commit may be cherry-picked wholesale. The
uncommitted working tree must not be merged, reset, cleaned, or treated as reviewed production work.

The rack presentation, hardware metaphor, reorderable module shell, and rack-specific layout
preferences are superseded. Existing audio behavior, controller transitions, evidence integrity,
tests, accessibility patterns, and useful presentation logic are not superseded.

## 2. Baseline claim and limits

The last full verification recorded for `main` at `1198365` passed:

- formatting, ESLint, and TypeScript;
- dependency-license and corpus validation;
- evaluator self-test and public monophonic evaluation;
- 285 unit/integration tests across 34 files;
- 91.09% statement coverage and 80.37% branch coverage;
- the production build;
- application E2E, 5/5; and
- the browser polyphonic evaluation, 1/1.

This verification claim applies only to the exact `main` baseline. It does not certify the two rack
commits or the current dirty rack worktree. A future port must rerun verification appropriate to its
scope and the full suite before integration.

The baseline is a behavior and evidence baseline, not a UI composition baseline. In particular,
`MicrophoneCapture` currently owns and closes its own `AudioContext`; the accepted Practice System
will deliberately refactor that ownership behind the future shared `AudioRuntime` while preserving
observable capture behavior.

## 3. Production behavior protected by the baseline

The following behavior already on `main` is required regression coverage. New UI or runtime work may
change composition and ownership, but must not silently weaken these outcomes.

### 3.1 Microphone and recording lifecycle

- Connecting requests permission, opens the input, and begins bounded local monitoring without
  creating a recording session.
- Input connection and recording operation are independent states.
- Record, pause, resume, stop/finalize, replay, and disconnect remain explicit operations.
- Paused wall-clock time is excluded from the contiguous recording-relative timeline.
- Stop preserves the completed take and returns an open microphone to monitoring.
- Disconnect releases media tracks and the current capture graph without deleting a completed take.
- Device loss, permission failure, unsupported browsers, silence, clipping, and duration limits have
  explicit recoverable states.
- The five-minute safety limit gracefully finalizes accepted audio rather than failing it.
- Worker failure and terminal cleanup release retained chunks before another take.

### 3.2 Monitoring and analysis

- Monitoring note/chord analysis is bounded, transient, and isolated from recording evidence.
- Monitoring does not create a session, retain recording PCM, or run recording-only Basic Pitch
  finalization.
- Recording analyzers preserve raw events, confidence, candidates, timing, and provenance.
- Live and finalized lifecycle labels remain honest.
- Detector cadence, scores, profiles, and chord decisions are not presentation tuning knobs.

### 3.3 Sessions, corrections, persistence, and export

- `Session` remains observed evidence, not authored score state.
- Corrections are append-only projections; raw detector events are never overwritten.
- Invalid or orphaned correction history remains visible rather than being discarded.
- Structured sessions and optional mono PCM remain separable at repository boundaries.
- Save/delete operations remain atomic for the existing session and PCM stores.
- JSON retains evidence, settings, provenance, recording metadata, and correction history.
- Observed-session MIDI export remains distinct from future authored-score MIDI interchange.
- MIDI never fabricates a chord voicing when defensible note events are absent.

### 3.4 Accessibility and performance behavior

- Ordinary semantic controls, keyboard operation, visible focus, reduced motion, and textual state
  remain required regardless of the new visual language.
- Live confidence and chroma meters must not reintroduce layout-driven update work.
- Stable no-op event histories and memoized timelines must remain effective where applicable.
- Audio continuity and analysis evidence take priority over notation, video, or UI animation load.

## 4. Reconciliation labels

Every rack-branch artifact receives one of these treatments:

- **Baseline:** already accepted on `main`; preserve through regression tests.
- **Reimplement behavior:** preserve the user-visible rule or test case, but implement it against the
  new architecture rather than copying the branch implementation.
- **Extract after review:** potentially portable logic or a narrowly scoped component; port only
  after its dependencies and language are made Practice Workspace-neutral.
- **Reference only:** retain as design/research evidence, not production source.
- **Do not port:** conflicts with the tab-centered product or planned architecture.

File location alone does not decide treatment. A rack-named file may contain a useful behavior, and a
pure-looking preference model may still encode the superseded product structure.

## 5. Committed rack-branch inventory

| Area                                                                 | Treatment                | Reconciliation decision                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MicrophoneCapture.switchInputDevice` and its focused tests          | **Reimplement behavior** | Preserve passive source choice while disconnected, latest-choice-wins serialization, finalization before an active source switch, and completed-take preservation. Do not copy the current teardown/reconnect implementation after `AudioRuntime` exists; source switching must release only capture-owned tracks/nodes and must not close the shared context. |
| Separate input power and record controls                             | **Reimplement behavior** | Retain the distinction between connected monitoring and recording. Present it in the new input/practice surface without rack hardware language.                                                                                                                                                                                                                |
| Source enumeration and connected-device switching                    | **Extract after review** | Retain actionable enumeration failure, system-default selection, queued changes, and focus/keyboard behavior. Rebind to the future runtime/capture application service.                                                                                                                                                                                        |
| Record/pause/resume/stop/replay control mapping                      | **Reimplement behavior** | Preserve the state/action matrix, but the authoritative practice transport will eventually coordinate capture and replay. No UI component becomes command authority.                                                                                                                                                                                           |
| Device and privacy disclosure                                        | **Extract after review** | The concise local-processing, permission, actual-device-setting, and explicit-disconnect information remains valuable. Copy must be rewritten for the Practice Workspace and optional camera/video flows.                                                                                                                                                      |
| Level, waveform, signal, peak, ready, and failure indications        | **Extract after review** | Preserve real snapshot-derived values and non-color textual equivalents. Restyle and place them according to the desktop workspace information architecture.                                                                                                                                                                                                   |
| Compact note/chord analysis monitor                                  | **Extract after review** | It correctly subscribes to existing display controllers rather than rerunning analysis. Consider a neutral compact input-status component; do not preserve the rack screen treatment.                                                                                                                                                                          |
| `RackAudioControls` primitives                                       | **Reference only**       | ARIA state, minimum target size, keyboard semantics, and meter labeling are useful examples. Rockers, punch buttons, lamps, and hardware styling are not the new component system.                                                                                                                                                                             |
| `AudioCapturePanel` rack composition                                 | **Reference only**       | Use its tested state coverage and disclosure hierarchy when designing the input surface. Do not transplant its DOM hierarchy or rack-specific CSS.                                                                                                                                                                                                             |
| Audio Input prototype and its extra Vite entry                       | **Reference only**       | Preserve as historical design evidence while the rack worktree remains available. It is not a production route or dependency requirement for the new application.                                                                                                                                                                                              |
| Rack CSS, tokens, chassis, faceplates, and hardware visual hierarchy | **Do not port**          | Superseded presentation. New styles must be derived from the tab-centered desktop design rather than progressively removing rack ornament.                                                                                                                                                                                                                     |
| Rack-specific E2E labels and screenshots                             | **Do not port verbatim** | Rewrite tests around durable user outcomes: connect, monitor, record, pause/resume, stop, replay, switch source, import, recover, correct, persist, and export.                                                                                                                                                                                                |

The committed branch also removes ordinary-surface calibration/reference controls while rearranging
the capture panel. That UI removal is not authority to delete calibration utilities or evaluation
capability. Their eventual development-only location is a separate product/tooling decision.

## 6. Uncommitted rack-worktree inventory

The following classification records the current working tree without declaring it reviewed or
complete.

| Area                                                       | Treatment                | Reconciliation decision                                                                                                                                                                                        |
| ---------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pitchAnalysisPresentation.ts` and focused tests           | **Extract after review** | Pure confidence labels, tuning direction, and signal text are plausible reusable presentation policy. Re-evaluate thresholds and terminology against assessment/calibration requirements before porting.       |
| Redesigned Pitch Analysis surface                          | **Reference only**       | The tuner-first hierarchy, progressive diagnostics, structured recent-note history, and direct correction language are useful UX evidence. The final placement and scope depend on the tab/practice workspace. |
| Chord/pitch panel presentation changes                     | **Reference only**       | Preserve information-priority lessons and accessibility assertions, not the rack-era composition or CSS.                                                                                                       |
| `rackWorkspaceModules.ts` registry                         | **Do not port**          | A library of reorderable analysis utilities is the superseded information architecture. The new workspace is organized around score, transport, practice range, input, takes, media, and assessment.           |
| `workspaceLayout.ts` and `stringsight.workspace-layout.v1` | **Do not port**          | Its schema persists the obsolete rack module model. Future workspace preferences require a new schema designed after the desktop state/action map; do not migrate this key into the Practice Workspace.        |
| Drag/reorder/add/remove rack-module behavior               | **Do not port**          | It centers tool arrangement rather than the authored score and practice flow. Generic panel-resize or disclosure preferences can be designed later from explicit product needs.                                |
| `mockups/stringsight-studio.html`                          | **Reference only**       | Treat as a visual exploration. It supplies no production state, component, accessibility, or responsive contract.                                                                                              |
| `style-migration-handoff.md`                               | **Reference only**       | Retain progressive disclosure, audience separation, actionable first-glance hierarchy, honest state, and accessibility reasoning. Discard the instruction to make the rack metaphor structural.                |
| Uncommitted rack CSS and workspace tests                   | **Do not port verbatim** | Tests may identify useful behavior to restate, but neither selectors nor rack layout outcomes become acceptance criteria.                                                                                      |
| `BUILD_CHECKLIST.md` pivot edits                           | **Planning input**       | Reconcile separately through the product/architecture ordering task. Do not bury checklist approval inside a UI commit.                                                                                        |

## 7. Selective-port procedure

Future implementation must use this procedure for every candidate from the rack branch:

1. Start from the accepted `main` descendant, not `codex/audio-input-rack-ui`.
2. Name one user-visible behavior or one pure policy to recover.
3. Locate the smallest relevant implementation and tests in the rack worktree.
4. Check whether the future canonical contracts, `AudioRuntime`, `PracticeTransport`, or desktop
   state/action map have changed the correct ownership boundary.
5. Prefer rewriting the behavior against the accepted boundary. Use a patch-level extraction only
   when the code is already neutral and its dependencies remain valid.
6. Rewrite rack-specific names, copy, CSS, selectors, storage keys, and test assertions.
7. Add or migrate focused tests that prove the durable behavior without asserting the obsolete
   composition.
8. Run focused verification, then the full required regression suite before integration.
9. Record the source commit/file and whether the result was reimplemented, extracted, or declined.

No selective port may:

- make React, alphaTab, an `HTMLMediaElement`, or a recorder the transport authority;
- restore capture-owned `AudioContext` lifecycle after the shared runtime exists;
- mutate raw detector evidence to fit a new display;
- copy the rack workspace registry or its persisted layout schema;
- weaken privacy, permission, device-loss, duration-limit, or accessibility behavior; or
- claim that visual similarity proves behavioral equivalence.

## 8. Recommended branch handling

- Keep `codex/audio-input-rack-ui` and its dirty worktree unchanged until reconciliation is complete.
- Do not commit the architecture/checklist pivot together with the rack UI work.
- Land updated requirements, architecture, ADRs, and checklist order through a documentation-focused
  branch based on `main`.
- Run disposable notation/audio/video spikes in their own isolated branch after provisional
  architecture approval.
- Start production Practice Workspace implementation from the post-spike accepted baseline.
- Delete or archive the rack branch only after every row above has a recorded final disposition and
  any selected behavior has passed the new workspace regression suite.

## 9. Exit criteria for this baseline step

This reconciliation step is complete when:

- the exact tested `main` commit is recorded;
- protected production behavior is explicit;
- committed and uncommitted rack work is classified;
- wholesale cherry-picking and merging are prohibited;
- the device-switch ownership conflict with the future shared runtime is recorded;
- the next architecture/checklist work can cite this document instead of inferring value from the
  rack branch; and
- no production code or current rack-worktree file was changed to produce the inventory.
