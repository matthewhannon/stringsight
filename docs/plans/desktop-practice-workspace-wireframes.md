# Desktop Practice Workspace low-fidelity wireframes

- **Status:** Accepted Product/UX design artifact; not production UI
- **Accepted:** 2026-07-20
- **Last updated:** 2026-07-20
- **Purpose:** Cover the required first-release lifecycle before renderer or component decisions
- **Related:** `desktop-practice-workspace-ux.md` and
  `desktop-practice-workspace-state-actions.md`

## 1. Reading these wireframes

These wireframes define hierarchy, region purpose, essential commands, state language, disclosure,
and semantic order. They do not prescribe colors, typography, pixel sizes, framework components, or
third-party notation controls. The approved committed dual-canvas design is visual-direction
evidence; these diagrams are the lifecycle contract.

Legend:

- `[Button]` is an available command.
- `[Button — disabled: reason]` is unavailable with an explainable prerequisite.
- `(status)` is truthful state, not a command.
- `>` is selection/focus inside a composite region.
- `…` is progressive detail, not omitted essential behavior.

Every frame follows the base semantic order:

1. Skip links and application header.
2. Library/navigation when open.
3. Workspace mode and contextual toolbar.
4. Score or import review.
5. Second canvas or contextual inspector.
6. Input/evidence status.
7. Global transport and recording actions.
8. Open dialog/drawer content according to its modal model.

## 2. No document / library entry

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ StringSight                              (Private on this device) [Settings] │
├──────────────────────┬───────────────────────────────────────────────────────┤
│ LIBRARY              │                 START PRACTICING                      │
│                      │                                                       │
│ No local documents   │  Create or open a guitar score. No microphone or     │
│                      │  camera permission is needed to begin.                │
│ [New guitar tab]     │                                                       │
│ [Open StringSight]   │  [New guitar tab]   [Open StringSight document]       │
│ [Import score ▾]     │  [Import Guitar Pro / MusicXML]   [More formats…]     │
│                      │                                                       │
│ Recent documents     │  Supported formats and fidelity [Review details]      │
│ — none —             │                                                       │
├──────────────────────┴───────────────────────────────────────────────────────┤
│ INPUT  (Not connected) [Connect input]                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│ TRANSPORT  [Play — disabled: open a score] [Record — disabled: open score]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Hierarchy: document entry first; devices remain optional. Import formats are grouped by semantic
fidelity, not file-extension popularity. “More formats” progressively discloses performance-only
MIDI and unsupported-format guidance.

Keyboard: focus reaches New, Open, Import, recent documents, Connect input, then disabled transport
explanations. No empty decorative canvas receives focus.

## 3. Score open in ordinary practice mode

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ StringSight  Little Wing — lead guitar  (Saved locally)                     │
│ [Edit] [Practice — current] [Review]                 [Library] [Save]        │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ LIBRARY       │ PRACTICE  Lead guitar · whole score                         │
│ > Little Wing │ [Tab + Video] [Tab Focus] [Video Focus] [View ▾] [Analysis]│
│   Blue Bossa  ├───────────────────────────────────┬──────────────────────────┤
│               │ SCORE / TAB                       │ REFERENCE VIDEO          │
│ [New] [Open]  │ Little Wing  E minor · 4/4        │ No video attached        │
│ [Import]      │                                   │ Optional for practice    │
│               │  m.1      m.2      m.3      m.4   │ [Attach reference video] │
│               │  notation and guitar tablature   │ [Hide media canvas]      │
│               │                                   │                          │
│               │ (No active range)                 │                          │
│               │ [Select range] [Fit score]        │                          │
├───────────────┴───────────────────────────────────┴──────────────────────────┤
│ INPUT  Default microphone (Disconnected) [Connect] [Input settings]         │
│ HEARD  Connect input to begin                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Previous] [Play] [Stop]  1:1  ─────────────  [Loop off] [Metronome]       │
│ [Count-in: 1 bar]  Speed 100%  Effective tempo 92 BPM       [Record disabled]│
└──────────────────────────────────────────────────────────────────────────────┘
```

When no video exists, the user may hide the media canvas and the score expands. An empty video
state never implies a broken score. Play and metronome remain available without microphone input.

Progressive disclosure: View contains combined/tab-only, focus/expanded/page/continuous. Analysis
opens candidates and diagnostics without changing score or transport.

## 4. Score editing and import-review mode

### 4.1 Editing

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ StringSight  Study in E  (Unsaved changes)  [Undo] [Redo] [Save] [Save as] │
│ [Edit — current] [Practice] [Review]                                        │
├───────────────┬───────────────────────────────────────┬──────────────────────┤
│ LIBRARY       │ SCORE / TAB                           │ EDIT SELECTION       │
│ > Study in E  │ > m.8 beat 2, strings 3–2 selected   │ Position / duration  │
│               │                                       │ [Fret] [Rhythm]      │
│ [New] [Open]  │ standard notation + TAB               │ [Technique ▾]        │
│ [Import]      │ stable focus/selection indication     │ [Delete selection]   │
│               │                                       │ … validation detail  │
├───────────────┴───────────────────────────────────────┴──────────────────────┤
│ INPUT (Optional monitoring; disconnected) [Connect]                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ TRANSPORT [Play current score] [Stop]  Speed 100%  [Record disabled in Edit]│
└──────────────────────────────────────────────────────────────────────────────┘
```

The inspector edits authored content. Practice speed and active view remain workspace state. Delete
selection previews its musical scope and supports undo; deleting referenced revisions is a separate
library action.

### 4.2 Import review

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ IMPORT REVIEW  “lesson.gp”   (Current document unchanged)                   │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ PROPOSED SCORE                │ FIDELITY REPORT                              │
│ Track: Lead guitar            │ 248 preserved · 6 converted · 2 choices     │
│ Standard tuning · 42 measures │                                              │
│ Preview selected issue        │ > m.14 bend normalized [Inspect source]      │
│                               │   m.22 repeat expanded                       │
│ notation/tab preview          │   2 MIDI-derived positions need confirmation│
│                               │ [Previous issue] [Next issue]                │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ [Cancel] [Save report] [Accept — disabled: resolve 2 blocking choices]      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Keyboard order moves from preview to issue summary, issue list, source/detail, resolution commands,
then Cancel/Accept. Accept creates a new document only after blocking choices resolve. Cancel returns
focus to the Import command and preserves the prior document.

## 5. Selected-range loop practice

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ PRACTICE  Little Wing · Lead guitar  (Saved)                                │
│ Active range: measures 12–15 · 10.4 seconds at 80%                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ SCORE / TAB — Tab Focus                                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ [ range start m.12 ]  selected tablature  [ range end m.16 )            │ │
│ │ playhead m.13 beat 2     selection persists across view/reflow          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ [Edit start] [Edit end] [Snap: beat ▾] [Clear range] [Save range preset]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ INPUT  Connected · Monitoring, not recording · Healthy                      │
│ HEARD  Em7 (provisional, medium evidence)  [Alternatives] [Diagnostics]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Play] [Stop]  m.13 beat 2 ────────── [Loop on] [Metronome on]             │
│ [Count-in: 1 bar] Speed 80% · effective 74 BPM              [Record take]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Range is a half-open musical selection conceptually, but the UI uses guitarist-facing bar/beat
language. Off-grid starts receive a warning and explicit Snap or Keep choice; no implicit snap.

## 6. Connected monitoring, not recording

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ SCORE / TAB  (range m.12–15)                       REFERENCE (optional)      │
│ …                                                                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ INPUT  Scarlett 2i2 · Input 1  (Connected · monitoring, not recording)       │
│ Level  −14 dBFS [meter + text]  Peak −8 dBFS · Healthy                       │
│ HEARD  F♯3  −6 cents  |  Chord candidate Em7 · provisional · 82% strength   │
│ [Input settings] [Alternatives] [Analysis details] [Disconnect]             │
│ Monitoring is local and bounded. No recording session or take has started.  │
├──────────────────────────────────────────────────────────────────────────────┤
│ TRANSPORT [Play] [Stop] …                                     [Record take] │
└──────────────────────────────────────────────────────────────────────────────┘
```

The monitoring disclosure is explicit and textual. Meter animation is never the only indication.
Opening Analysis details reveals raw candidates, lifecycle, provenance, and diagnostics; it does not
rerun detection or retain monitoring PCM.

## 7. Count-in and active recording

### 7.1 Count-in

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ COUNT-IN  1 bar · beat 3 of 4          Score starts at measure 12 beat 1     │
│ Capture start follows the accepted recording policy [Learn more]            │
│ [Cancel start]                                             (3 … 4 … PLAY)    │
├──────────────────────────────────────────────────────────────────────────────┤
│ INPUT Connected · Capture status stated explicitly · level healthy           │
├──────────────────────────────────────────────────────────────────────────────┤
│ TRANSPORT [Play disabled] [Stop/cancel] [Pause disabled until score starts]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Whether microphone recording includes count-in pre-roll is intentionally not fixed by this
wireframe. The accepted architecture must state exactly when capture begins and the UI must use
“recording” only when samples are actually being retained.

### 7.2 Recording

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ SCORE / TAB  playhead m.13 beat 1                VIDEO (if take video on)    │
│ selected range m.12–15                           Camera recording · local    │
├──────────────────────────────────────────────────────────────────────────────┤
│ INPUT  Recording locally · 00:18.4 · level healthy                          │
│ HEARD  G6 · provisional · 78% strength   [Analysis details]                 │
│ Headphones recommended; speaker bleed may affect evidence.                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Pause recording] [Stop and finalize]  Loop pass 2  Metronome on            │
│ Seek/range/document-switch disabled while recording: stop or finalize first │
└──────────────────────────────────────────────────────────────────────────────┘
```

Recording uses one unambiguous elapsed time and status. Incompatible actions explain the safe next
step. Pause keeps monitoring active but clearly says recording time is paused. Stop enters a named
finalizing state rather than claiming the take is ready immediately.

## 8. Completed take and A/B review

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ REVIEW  Little Wing revision 7 · Take 04 · m.12–15 · 80%                    │
│ (Ready · recorded locally) [Take picker] [Return to practice]               │
├──────────────────────────────────────────────────────────────────────────────┤
│ SCORE / TAB + evidence timeline                                              │
│ m.12                 m.13                 m.14                 m.15           │
│ Expected attacks      Observed candidates / corrections / uncertainty        │
│ > selected event: source candidate + alternatives + user correction history │
├──────────────────────────────────────────────────────────────────────────────┤
│ LISTEN  [Take only] [Reference only] [Compare]                               │
│ Take gain [────] Reference gain [────] Balance [────] [Mute] [Solo]          │
│ If reference unavailable: Take only remains available; reason is shown.      │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Play] [Pause] [Stop] [Seek] 00:31.840 ─────────────── 00:38.200             │
│ [Add correction] [Export take…] [Delete take…] [Practice this range]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

Waveforms may be added only when derived from real available media and remain secondary to score,
time, and evidence. A/B never implies assessment. Corrections create a new projection and do not
change the recorded source.

## 9. Optional video visible

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ PRACTICE  [Tab + Video — current] [Tab Focus] [Video Focus]                 │
├──────────────────────────────────────────┬───────────────────────────────────┤
│ SCORE / TAB                              │ REFERENCE VIDEO                   │
│ selected range m.12–15                   │ [Reference] [Take 04]             │
│ playhead m.13 beat 3                     │ ┌───────────────────────────────┐ │
│                                          │ │ intrinsic 16:9, fit by default│ │
│ tab remains primary                      │ │ instruction cue/anchor        │ │
│                                          │ └───────────────────────────────┘ │
│                                          │ Aligned to revision 7 · 3 anchors│
│                                          │ [Fit] [Fill/crop] [Sync details]  │
├──────────────────────────────────────────┴───────────────────────────────────┤
│ INPUT …                                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ONE TRANSPORT [Play] [Seek] [Loop] … video follows shared musical position  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Video has no separate playhead. Switching reference/take source preserves score position but may
show a source-specific unavailable or stale state. Fit preserves aspect ratio; Fill is a reversible
workspace preference.

## 10. Assessment and weak-range navigation

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ REVIEW  Take 04 · Assessment v1  (Partial: 87% of attacks assessable)        │
├──────────────────────────────────────────────────────────────────────────────┤
│ SCORE + RESULT OVERLAY                                                       │
│ m.12 ✓        m.13 uncertain        m.14 weakest range        m.15 ✓         │
│ color + symbol + text; source evidence remains inspectable                   │
├──────────────────────────────────────┬───────────────────────────────────────┤
│ SUMMARY                              │ WEAK RANGES                           │
│ Timing consistency: supported        │ > m.14 beats 2–4: late attacks       │
│ Pitch/chord: partial evidence         │   m.13: insufficient pitch evidence  │
│ 3 unmatched · 2 uncertain            │ [Select] [Practice & loop] [Inspect] │
│ [How this was assessed]               │                                       │
├──────────────────────────────────────┴───────────────────────────────────────┤
│ [Open original score revision] [Open evidence] [Create new assessment]      │
└──────────────────────────────────────────────────────────────────────────────┘
```

“Practice & loop” copies a musical range into workspace state and opens Practice; it does not edit
the assessment or score. Unassessed and uncertain events are not counted as wrong.

## 11. Representative recovery states

### 11.1 Microphone permission denied

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ INPUT NEEDS PERMISSION                                                       │
│ StringSight could not access the selected microphone. The score, playback,   │
│ and existing takes still work.                                               │
│ [Try again] [Choose another input] [Browser permission steps] [Continue]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Focus moves to the recovery heading only for a modal request; otherwise an inline alert is
announced and focus remains on Connect. Raw error detail is progressive.

### 11.2 Missing media

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TAKE 04 AUDIO UNAVAILABLE                                                    │
│ The take record and structured evidence are intact, but its local audio file │
│ is missing. Expected identity: …A72F.                                        │
│ [Locate matching file] [Review evidence without audio] [Remove media link…] │
│ Relinking accepts only media that passes identity verification.              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 11.3 Stale video synchronization

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ REFERENCE VIDEO — SYNC NEEDS REVIEW                                          │
│ Anchors were authored for revision 7; the open score is revision 9.          │
│ [Open revision 7] [Preview rebase] [Re-author anchors] [Use video unsynced]  │
│ The original map remains unchanged until a reviewed replacement is saved.    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 11.4 Quota/save failure

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ SAVE FAILED — local storage is full                                          │
│ Your unsaved document remains open. No durable save was claimed.             │
│ [Retry] [Save as exported file] [Review local storage] [Cancel]              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 12. Cross-frame acceptance checks

- Every essential action has one visible owner and one semantic location.
- Monitoring never looks like recording; count-in, recording, finalizing, replaying, and assessment
  are distinct.
- Score selection/range survives every frame that changes view or mode.
- Video is useful when present and nonblocking when absent, stale, or unsupported.
- Import, save, deletion, and relink actions state what changes before committing.
- Advanced MIDI/analysis detail never replaces the tab as the primary canvas.
- All pointer adjustments have keyboard/direct-value alternatives.
- Every unavailable state preserves and exposes the last valid document, take, or evidence unless
  the user confirms its deletion.
