# Audio Input rack UI migration

**Status:** In progress  
**Scope:** Production Audio Input presentation and the minimum capture-controller transition needed
for source changes. Item 10 remains deferred.

## Invariants

- `MicrophoneCapture` remains the only owner of connection, recording, pause, finalization, replay,
  PCM, timing, diagnostics, and failure state.
- React may own only presentation state: selected detail view, source-menu disclosure, selected
  source before connection, import progress, and import feedback.
- Monitoring and recording remain separate. Input power opens/releases the hardware; Record creates
  the durable take.
- A completed recording remains available after Stop, Disconnect, a successful source change, or a
  failed attempt to open the replacement source.
- Developer calibration and reference controls are not rendered in the ordinary Audio Input module.

## Control mapping

| State                             | Input rocker                           | Record punch                 | Context transport | Load             | Replay                     | Source selector                                               |
| --------------------------------- | -------------------------------------- | ---------------------------- | ----------------- | ---------------- | -------------------------- | ------------------------------------------------------------- |
| disconnected / idle               | Off; connects selected source          | Locked                       | None              | Enabled          | Enabled when a take exists | Enabled; changes pending source                               |
| connecting / idle                 | Starting; transition-disabled          | Locked                       | None              | Disabled         | Disabled                   | Enabled; latest choice is queued                              |
| monitoring / idle                 | On; disconnects                        | Ready; starts recording      | None              | Enabled          | Enabled when a take exists | Enabled; changing source reconnects                           |
| monitoring / recording            | On; completes then disconnects         | Lit/pressed; stops recording | Pause             | Disabled         | Disabled                   | Enabled; completes take, then reconnects                      |
| monitoring / paused               | On; completes then disconnects         | Paused; stops recording      | Resume            | Disabled         | Disabled                   | Enabled; completes take, then reconnects                      |
| monitoring / finalizing           | On; transition-disabled                | Finishing indication         | Replay disabled   | Disabled         | Disabled                   | Enabled; change waits, then reconnects                        |
| any / replaying                   | Reflects actual connection             | Locked                       | Stop replay       | Disabled         | Active indication          | Enabled; connected source changes serialize after replay stop |
| connection failed / idle          | Attention/off; retries selected source | Locked                       | None              | Enabled          | Enabled when a take exists | Enabled; changes pending source                               |
| operation failed while monitoring | On/attention; disconnects              | Ready; starts a fresh take   | None              | Enabled          | Enabled when a take exists | Enabled; changing source reconnects                           |
| unsupported                       | Off/unsupported; disabled              | Locked                       | None              | Enabled          | Enabled when a take exists | Enabled for inspection, but cannot connect                    |
| importing                         | Reflects actual connection             | Locked                       | None              | Loading/disabled | Disabled                   | Enabled; source choice does not interrupt import              |

The record punch is a two-state primary control: it starts a take when ready and becomes Stop
recording while recording or paused. Its center changes from a record dot to a stop square, and its
accessible name changes with the available action. Pause/Resume remains the adjacent context key;
Replay, Stop replay, and Disconnect remain distinct operations.

## Physical indications

| Indication      | Source of truth                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Waveform        | `snapshot.waveform`; dimmed only when no microphone is connected and no replay/import signal is active |
| Timer           | `snapshot.elapsedMs`                                                                                   |
| Segmented meter | `snapshot.peak` through the existing dBFS conversion                                                   |
| ACTIVE          | `connectionState` text plus a lamp; connecting and failure are named, not color-only                   |
| SIGNAL          | `connectionState === monitoring` and `snapshot.rms >= SILENCE_RMS_THRESHOLD`                           |
| PEAK            | clipping warning or a peak at the clipping threshold                                                   |
| READY / LOCKED  | derived from the same predicate that enables Record                                                    |
| Status/failure  | connection/operation labels, warnings, and actionable errors from the snapshot                         |

## Source-change lifecycle

The source selector is never disabled by capture state. Selecting while input power is off updates
the source used by the next connect. Selecting while connected calls a controller-level
`switchInputDevice` transition:

1. Wait for an in-progress connect or prior switch.
2. Stop replay if necessary.
3. If recording or paused, finalize and preserve the current take. If already finalizing, wait for
   that finalization.
4. Release the current media tracks and audio context.
5. Connect the chosen source and resume bounded monitoring without starting a new recording.
6. Serialize overlapping requests and reconnect again only when necessary so the latest selected
   source is the final active source.

An open failure leaves the preserved take intact and exposes the controller's normal recoverable
device error. Source selection alone never powers on a disconnected input.

## Main display swap and accessibility

- DEVICE and PRIVACY are mutually exclusive disclosure keys that replace the waveform in the
  fixed-height main display. The input level meter remains visible below in every view.
- DEVICE shows real settings and transport diagnostics. PRIVACY explains local monitoring,
  recording/import retention, and explicit hardware release.
- The source selector uses a button-backed listbox with Enter/Space, arrows, Home/End, Escape,
  selection announcement, blur dismissal, and focus return.
- Rocker and Record expose stable names and `aria-pressed`; disabled/busy states are semantic.
- Focus rings are visible, hit targets are at least 40 CSS pixels, and reduced-motion removes the
  recording pulse and other nonessential transitions.

## Verification

Migrate rather than discard the existing panel assertions. Add focused primitive tests and cover
disconnected, connecting, monitoring, recording, paused, finalizing, replaying, connection failure,
operation failure, unsupported, enumeration failure, import, completed take, duration-limit warning,
source switching, and overlapping source choices. Finish with formatting, lint, TypeScript, focused
tests, the full suite, production build, E2E, keyboard-only inspection, narrow layout inspection,
and real-microphone verification.
