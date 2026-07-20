# Desktop Practice Workspace product state and action map

- **Status:** Accepted product-level coordination model
- **Accepted:** 2026-07-20
- **Last updated:** 2026-07-20
- **Scope:** User-visible states, commands, preservation, and coordination; not an implementation
  state machine or schema

## 1. Modeling rule

The workspace is a set of independent state regions. It is not one Cartesian enum. A document can
be dirty while input is monitoring; a transport can be paused while a completed prior take remains
ready; a video can be missing while the score and assessment remain valid.

Each region owns its state vocabulary and commands. Coordination rules may disable or serialize a
command across regions, but no UI surface becomes an independent source of truth.

```text
Workspace
├── Document and import
├── Practice transport
├── Input connection
├── Recording operation
├── Take finalization/availability
├── Reference video
├── Take video
└── Assessment
```

## 2. Document and import region

| State                          | Meaning                                             | Valid primary commands                                           | Must preserve                                                   |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| No document                    | No active authored score                            | New, Open, Import                                                | Library and existing persisted data                             |
| Loading                        | A chosen document is validating/loading             | Cancel when safe                                                 | Current document until replacement succeeds                     |
| Import review                  | Temporary draft and fidelity report exist           | Inspect, resolve, Accept as new, Cancel, Export report           | Current document; source report on cancel only if user saves it |
| Clean                          | Active document equals last durable revision        | Edit, Save As, close/switch, practice, export                    | Revision identity and referenced artifacts                      |
| Dirty                          | Valid committed edits are not durably saved         | Save, Save As, undo/redo, practice working copy, discard preview | Last durable revision plus working edits                        |
| Saving                         | Durable write is in progress                        | Continue editing only under declared policy, cancel only if safe | Working edits and last durable revision                         |
| Save failed                    | Durable write failed; document remains dirty        | Retry, Save As/export, inspect storage, continue editing         | Working edits; never claim saved                                |
| Conflict/stale external change | Local durable head differs from newly observed head | Compare, reload, save copy, cancel                               | Both versions until explicit choice                             |
| Read-only historical revision  | Opened because a take/sync/assessment references it | Inspect, copy as new, return to current                          | Historical identity and dependents                              |

### Document coordination

- Open/import/switch/close while dirty requires Save / Discard / Cancel.
- Accept Import creates a new valid document/revision; it never mutates the prior active document in
  place.
- Editing a revision referenced by a take creates a new working revision. It never retargets the
  take, evidence, assessment, or synchronization map.
- Document replacement is blocked during active recording. The user must stop/finalize or explicitly
  discard a previewed partial recording first.
- A save failure does not prevent practicing the in-memory working copy, but recording against it
  requires an explicit product policy: recommended behavior is save a fixed revision before record.

## 3. Practice transport region

| State       | Meaning                                         | Valid primary commands                                         | Invalid or serialized commands               |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Stopped     | Loaded at a stable musical position             | Set range/speed/loop, prepare/play, seek, start record flow    | None beyond missing prerequisites            |
| Preparing   | Score/reference/click assets are becoming ready | Cancel/stop                                                    | Repeat play, conflicting load/range/speed    |
| Counting in | Synthetic lead-in is active                     | Stop/cancel; pause only if explicitly supported                | Seek, document/range change, second play     |
| Playing     | Score/range/reference is advancing              | Pause, stop, seek, loop toggle under declared boundary rule    | Independent media play; document replacement |
| Paused      | Position is retained                            | Resume, stop, seek                                             | Independent media play                       |
| Seeking     | One authoritative position change is applying   | Stop/cancel if safe                                            | Duplicate seek/play until resolved           |
| Failed      | Transport could not prepare or continue         | Retry, reset runtime, continue editing/review without playback | Play until recovery prerequisites pass       |

### Transport commands and ownership

- One global command owns Play/Pause/Stop/Seek regardless of whether the visible canvas is score,
  reference video, take video, or review.
- Speed and active range are workspace state. Applying tempo to authored score is a separate Edit
  command.
- Loop enablement never changes the stored selection or named loop preset unless the user explicitly
  saves it.
- A focus/layout change cannot cause a transport transition.
- Media callbacks can report buffering, ended, or failed; they cannot move the authoritative
  musical position or start the next loop.

## 4. Input connection region

| State        | Meaning                                      | Valid commands                                           | Preservation                                         |
| ------------ | -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Unsupported  | Required microphone APIs are absent          | View supported-browser help, continue without input      | Document/playback/takes                              |
| Disconnected | No input tracks or monitoring graph active   | Select device, Connect                                   | Completed take and evidence                          |
| Connecting   | Permission/device/runtime setup in progress  | Cancel when safe                                         | Completed take; no recording session created         |
| Monitoring   | Connected, bounded transient analysis active | Disconnect, switch device, configure, Record             | No retained recording PCM or session from monitoring |
| Failed       | Connection failed or device ended            | Retry, choose device, disconnect/reset, continue without | Recoverable completed take and evidence              |

Connection and recording operation are independent. `Monitoring + Recording` is valid;
`Disconnected + Recording` is not. Disconnect during recording first follows the recording
interruption/finalize policy, then releases input.

## 5. Recording operation region

| State              | Meaning                                                        | Valid commands                                                           | Coordination                                              |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Idle               | No recording operation active                                  | Record when input monitoring and fixed document/range prerequisites pass | Transport may play/seek normally                          |
| Arming             | Fixed revision/range/settings and capture start are preparing  | Cancel/stop                                                              | Block document/range/source changes                       |
| Recording          | PCM/evidence accepted on recording timeline                    | Pause, Stop/finalize                                                     | Serialize seek/range/document/device changes              |
| Paused             | Recording timeline stopped; monitoring may continue            | Resume, Stop/finalize                                                    | Paused wall time excluded                                 |
| Finalizing         | Workers/media/evidence are closing and take is being committed | Cancel only if safely defined; view progress                             | Block new recording and destructive source changes        |
| Replaying          | Existing evidence is being replayed through analyzers          | Cancel replay                                                            | Audible take replay remains a distinct transport function |
| Failed recoverable | Operation failed but useful partial/previous data exists       | Recover/finalize, retry fresh, discard with preview                      | Preserve last valid completed take                        |
| Failed terminal    | No valid current operation can continue                        | Reset input/runtime, export diagnostics                                  | Release partial chunks/resources; preserve unrelated data |

Capabilities are derived from both connection and operation state. A “failed” operation must expose
at least one valid recovery or reset command; it must never deadlock every action.

## 6. Take region

Take creation lifecycle and media availability are related but not identical.

| State             | Meaning                                                 | Valid commands                                                | Must preserve                             |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| None              | No selected/completed take                              | Record, choose existing take                                  | Document and prior persisted takes        |
| Recording         | Current attempt in progress                             | Pause, stop/finalize                                          | Fixed source revision/range/settings      |
| Finalizing        | Evidence/media identity is being committed              | Wait, recover interruption                                    | Partial intent and last completed take    |
| Ready             | Immutable take and required structured evidence resolve | Replay, Review, Export, Assess, Delete preview                | Exact revision/evidence/media identity    |
| Audio unavailable | Take/evidence exist; PCM not available                  | Review evidence, relink, export without media, delete preview | Take identity and expected media identity |
| Failed            | Take could not be finalized                             | Recover defensible partial, discard preview, retry new take   | Last valid take; error provenance         |

### Take invariants

- A take is never “updated” to point to the current score revision.
- Correction after take finalization does not rewrite its evidence cutoff; a new snapshot/assessment
  is created when requested.
- Deleting or evicting PCM changes availability, not take identity.
- Audible replay requires available PCM; structured review may remain available without it.
- Deleting a take previews exclusive/shared snapshots, assessments, audio, and take video.

## 7. Reference-video and take-video regions

Reference video and take video use the same availability vocabulary but have different ownership.

| State                | Meaning                                           | Valid commands                                                                                      | Must preserve                                |
| -------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Absent               | No media linked                                   | Attach/import reference; enable camera for a future take                                            | Score/take fully usable                      |
| Loading              | Metadata/bytes/decode are being prepared          | Cancel                                                                                              | Existing link and current transport          |
| Ready synchronized   | Media and sync map match the exact score revision | Show/hide, seek via transport, change fit, edit anchors                                             | Media identity and map provenance            |
| Ready unsynchronized | Media is playable but no valid map exists         | Preview through the sole transport with an explicit “not score-synchronized” status; author anchors | Score/take unaffected                        |
| Stale sync           | Map binds an older/different score revision       | Open old revision, preview rebase, re-author, use unsynced, hide                                    | Original map unchanged until replacement     |
| Missing              | Expected local bytes cannot be found              | Locate/relink, continue without, remove link preview                                                | Expected identity and score/take             |
| Unsupported          | Container/codec/browser cannot decode             | Choose another file, conversion guidance, continue without                                          | Original reference metadata where safe       |
| Permission blocked   | Camera permission denied                          | Retry, permission instructions, continue without video                                              | Audio practice/recording remains available   |
| Device lost          | Camera ended during preview/capture               | Reconnect/reselect, finalize recoverable video, continue audio-only                                 | Audio evidence and recoverable video         |
| Failed               | Decode/capture/sync operation failed              | Retry/reset, diagnostics, continue without                                                          | Score, take, last valid media/map            |
| Deleted by user      | Media deliberately removed                        | Relink matching media where policy permits                                                          | Tombstone/identity needed for honest history |

### Distinct rules

- Reference video binds through a revision-specific synchronization map.
- Take video belongs to one take/capture and cannot substitute for microphone evidence.
- Switching source does not seek or restart the transport.
- Unsynchronized preview may omit score alignment, but it still routes play/pause/seek through the
  sole transport and cannot introduce another command/time authority.
- Camera capture never opens a hidden second microphone input path.
- Missing/stale reference video does not make take audio unavailable, and missing take video does not
  make reference video unavailable.

## 8. Assessment region

| State             | Meaning                                             | Valid commands                                               | Must preserve                               |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Absent            | No assessment exists or prerequisites not met       | Record/select valid take, request assessment when eligible   | Sources unchanged                           |
| Queued/running    | Derived analysis is pending                         | Cancel when safe, continue review                            | Exact source revision/take/evidence binding |
| Ready             | Supported results cover their declared evidence     | Inspect, navigate, practice weak range, export, rerun as new | Source objects and assessment version       |
| Partial/uncertain | Some events cannot be defensibly judged             | Inspect gaps/alternatives, record new take, practice range   | Unmatched/ambiguous events                  |
| Stale             | Current view/sources differ from assessment binding | Open bound sources, create new assessment                    | Old assessment remains reproducible         |
| Failed            | Worker/validation/budget failure                    | Retry, diagnostics, continue review                          | Sources and prior valid assessment          |

Assessment is downstream. It cannot change the document, raw observations, correction history, or
take. “Practice weak range” copies a range into workspace state.

## 9. Cross-region command matrix

| Command                     | Required regions                                                    | Disabled/redirected when                                                        | Result                                                      |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Open/import/switch document | Recording idle; dirty decision resolved                             | Arming/recording/finalizing                                                     | New active document only after success                      |
| Save                        | Document dirty and valid                                            | No document, saving, unresolved invalid import                                  | Durable revision or visible failure                         |
| Play                        | Document available; transport stopped/paused; assets recoverable    | Preparing/counting/seeking/failed without recovery                              | One transport generation begins/resumes                     |
| Seek                        | Document available; recording policy permits                        | Counting-in or active recording unless explicit safe rule                       | One authoritative position update                           |
| Set/change range            | Valid score positions                                               | Active recording/finalizing                                                     | Workspace range only unless saved as preset                 |
| Connect input               | Supported and connection disconnected/failed-recoverable            | Connecting                                                                      | Monitoring begins; no session created                       |
| Switch input device         | Supported; safe connection/operation state                          | Active recording unless finalize-first path selected                            | Preserve completed take; release only input-owned resources |
| Record take                 | Fixed saved revision, valid range, input monitoring, operation idle | Unsupported/disconnected/preparing/recording/finalizing/failed without recovery | Arming/count-in/recording under one transport               |
| Pause recording             | Operation recording                                                 | Any other operation state                                                       | Pause epoch; monitoring may continue                        |
| Stop/finalize               | Operation recording/paused/recoverable                              | Idle                                                                            | Take finalization; input returns to monitoring              |
| Replay take                 | Take ready with audio available                                     | Finalizing, missing/corrupt media                                               | Authoritative audible replay                                |
| Attach reference video      | Document revision available                                         | Recording/finalizing if attachment would disrupt it                             | New media record; sync absent until authored                |
| Record take video           | Camera ready and take recording flow configured                     | Permission blocked/device lost/unsupported                                      | Optional video bound to the take; microphone path unchanged |
| Edit sync anchors           | Media ready and fixed document revision open                        | Missing/unsupported media, active recording                                     | New draft map then explicit save                            |
| Run assessment              | Take ready; exact score/evidence resolve                            | Recording/finalizing/missing structured source                                  | New derived assessment                                      |
| Delete                      | Target exists                                                       | Active operation or unresolved impact                                           | Preview, confirmation, then explicit lifecycle transition   |
| Export                      | Target valid; manifest can describe unavailable media               | Finalizing/unstable write                                                       | Explicit included/external/omitted/unavailable manifest     |

## 10. Coordination rules

1. **Document before take.** Recording fixes a durable document revision, range, and relevant
   practice settings before accepting evidence.
2. **Transport before media.** Score, reference audio/video, metronome, cursor, and take replay
   observe the same command/position authority.
3. **Connection is not recording.** Monitoring has no durable take/session side effect.
4. **Recording serializes destructive change.** Document replacement, source-device replacement,
   range mutation, and destructive media operations wait for stop/finalize or an explicit discard
   preview.
5. **Finalization is transactional from the user's perspective.** The UI reports pending, ready,
   recoverable failure, or failed; it never presents partially committed evidence as ready.
6. **Media availability is mutable; identity is not.** Missing/deleted/relinked bytes do not rewrite
   the take or score revision they belonged to.
7. **Stale is not corrupt.** A synchronization map or assessment can remain valid for its original
   sources while being stale for the current revision.
8. **Assessment cannot become command authority.** It may propose a range; PracticeTransport owns
   the resulting play/loop commands.
9. **Layout is not lifecycle.** Canvas focus, panel resize, browser resize, zoom, and disclosure
   changes preserve all domain and transport states.
10. **Recovery is explicit.** Retry is idempotent where possible; reset names the resources it
    releases; discard previews which partial data is unrecoverable.

## 11. Destructive-action previews

| Action                          | Preview must identify                                          | Recommended default                                                |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Discard unsaved document        | Unsaved edits and last durable revision                        | Keep document open on Cancel; offer Save As                        |
| Replace current document        | Dirty state, active range, draft import, recording restriction | Save / Discard / Cancel                                            |
| Delete editable document head   | Referenced revisions, takes, assessments, sync maps            | Retain referenced immutable revisions as archived                  |
| Delete mutable observed session | Takes/evidence snapshots and PCM references                    | Retain referenced structured snapshots; ask separately about media |
| Delete take audio/video         | Replay and A/B loss, evidence that remains                     | Remove bytes only after tombstone/identity is durable              |
| Delete take                     | Exclusive/shared evidence snapshots, assessments, media        | Delete only exclusive dependents after confirmation                |
| Delete reference media          | Sync maps and documents that reference it                      | Keep score; mark media unavailable; retain identity/provenance     |
| Remove/rebase sync map          | Old revision binding and anchor changes                        | Preserve old map until replacement validates                       |
| Clear correction                | Raw evidence and correction history impact                     | Append revert/new correction; never delete raw evidence silently   |
| Delete everything related       | Full document/session/take/assessment/media graph              | Separate high-friction confirmation plus export option             |

## 12. Preservation matrix

| Transition/failure           | Document                                       | Raw/structured evidence           | Completed take                                 | Media identity                               | Derived assessment                                             |
| ---------------------------- | ---------------------------------------------- | --------------------------------- | ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Permission denied            | Preserve                                       | Preserve prior                    | Preserve                                       | Preserve                                     | Preserve                                                       |
| Device lost during recording | Preserve                                       | Preserve recoverable boundary     | Preserve prior; finalize current if defensible | Preserve/record unavailable state            | Preserve prior                                                 |
| Save/quota failure           | Preserve dirty working copy and prior revision | Preserve                          | Preserve                                       | Preserve                                     | Preserve                                                       |
| Transport failure            | Preserve                                       | Preserve                          | Preserve                                       | Preserve                                     | Preserve; may remain bound to sources                          |
| Finalization interruption    | Preserve                                       | Preserve confirmed partial/intent | Preserve prior; recover current transaction    | Preserve expected identity if committed      | Do not create false ready assessment                           |
| Score edit                   | New working revision plus old revision         | Preserve                          | Preserve old binding                           | Preserve                                     | Existing assessment becomes stale only relative to new view    |
| Media missing/deleted        | Preserve                                       | Preserve                          | Preserve                                       | Preserve expected identity and honest state  | Preserve structured result; media-dependent review unavailable |
| Sync stale                   | Preserve both revisions                        | Preserve                          | Preserve                                       | Preserve                                     | Unaffected unless assessment source changed                    |
| Assessment failure           | Preserve                                       | Preserve                          | Preserve                                       | Preserve                                     | Preserve prior valid assessment; record failure separately     |
| Confirmed full deletion      | Remove only listed graph                       | Remove only listed graph          | Remove only listed graph                       | Tombstone/purge according to approved policy | Remove only listed graph                                       |

## 13. Product-state acceptance

This map is sufficient for architecture only when every UI command can name its owning region,
every cross-region disablement has an actionable explanation, no combination can create two
transport authorities, failed audio operations retain a recovery path, and every destructive or
unavailable transition satisfies the preservation matrix.
