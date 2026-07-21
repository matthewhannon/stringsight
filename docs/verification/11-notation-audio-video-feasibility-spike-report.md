# Practice Integration Feasibility Spike Report

> **Retained evidence record.** Recovered from
> `codex/spike-practice-integration@7b3c5f9`; formatting was normalized and omitted raw-result
> links were converted to historical path labels. Paths into
> `spikes/practice-integration/raw-results/` identify raw evidence in that disposable worktree/commit;
> the raw result bulk and harness are intentionally not production artifacts. The retained run and
> hash manifests are integrity receipts, not substitutes for those omitted files. The report's
> owner-gated status records the spike-time conclusion; ADR 0007 later accepts a narrower hackathon
> profile without changing the failed or inconclusive evidence below.

Status: **measurement controls substantially closed; acceptance still owner-gated**

Base revision: `f6124f4935372234492232b6b463c709ef64604e`

Spike branch: `codex/spike-practice-integration`
Date: 2026-07-20

This disposable harness evaluates the approved candidates without changing production code,
contracts, manifests, or build architecture. A measurement can be `PASS invariant` only when its
frozen positive oracle and relevant negative controls pass. Timing, resource, drift, and quality
observations are `MEASURED; budget decision pending`; they are not production approvals or budgets.
Where an older raw result uses a broader outcome label, this report supersedes that label after the
independent preflight review found that the retained evidence could not support the broader claim.

The sole current validation/support target is Windows 11 with current stable Chrome and Edge.
macOS is desirable best-effort portability but is **OUT OF SCOPE**, unvalidated, and carries no
support claim. No macOS run was attempted.

## Reproduction and evidence index

From `spikes/practice-integration` with Node 24.18.0 and npm 11.16.0:

```powershell
npm ci
npm run source:alphatab
npm run provenance
npm run fixtures
npm run fixtures:media
npm run test:node
npm run run:node
npm run run:imports
npm run validate:authority
npm run run:controls
npm run run:semantic
npm run run:browser
npm run run:physical
npm run inventory:windows
```

The authoritative completed runs used below are:

- Deterministic controls, clean process start 1:
  `controls-2026-07-21T005539-214Z` (`spikes/practice-integration/raw-results/controls-2026-07-21T005539-214Z/run-manifest-final.json` in the retained spike commit)
- Deterministic controls, clean process start 2:
  `controls-2026-07-21T005539-655Z` (`spikes/practice-integration/raw-results/controls-2026-07-21T005539-655Z/run-manifest-final.json` in the retained spike commit)
- Chrome integration:
  `browser-chrome-2026-07-21T004923-913Z` (`spikes/practice-integration/raw-results/browser-chrome-2026-07-21T004923-913Z/run-manifest-final.json` in the retained spike commit)
- Edge integration:
  `browser-edge-2026-07-21T005019-372Z` (`spikes/practice-integration/raw-results/browser-edge-2026-07-21T005019-372Z/run-manifest-final.json` in the retained spike commit)
- Physical Chrome/Edge capability:
  `physical-chrome-2026-07-21T005119-788Z` (`spikes/practice-integration/raw-results/physical-chrome-2026-07-21T005119-788Z/run-manifest-final.json` in the retained spike commit) and
  `physical-edge-2026-07-21T005122-615Z` (`spikes/practice-integration/raw-results/physical-edge-2026-07-21T005122-615Z/run-manifest-final.json` in the retained spike commit)
- Windows capability/AT inventory:
  `inventory-windows-2026-07-21T005125-765Z` (`spikes/practice-integration/raw-results/inventory-windows-2026-07-21T005125-765Z/run-manifest-final.json` in the retained spike commit)
- Independent semantic fidelity:
  `semantic-fidelity-2026-07-21T013906-808Z` (`spikes/practice-integration/raw-results/semantic-fidelity-2026-07-21T013906-808Z/run-manifest-final.json` in the retained spike commit)
- Hash manifest: [`evidence-hashes.json`](evidence/practice-integration/evidence-hashes.json)

The older Node/import runs and all three five-minute stress runs remain useful historical
observations, but they are **not authoritative acceptance evidence**: their original manifests do
not retain the complete source/epoch identities now required, and the stress script no longer
matches the recorded source hash. The stress observations are not silently discarded: Chrome
completed, Edge produced a same-context lifecycle failure, and a fresh Edge context recovered.
Those facts identify a real unresolved risk, but the original rule is not presently rerunnable.

Earlier discovery browser runs exposed two harness defects: alphaTab's lazy surfaces were queried
before attachment, and follower summaries crossed a deliberate seek discontinuity. Those discovery
runs are not used for conclusions. The retained baseline generation-scopes frames/anchors; the
measurement-control amendment additionally replaces future-nearest output timestamps with causal
latest-preceding selection. The retained Edge same-context workload failure is not discarded: its
fresh-context rerun is a separately identified diagnostic, not a silent replacement.

## Measurement-control closure against P01-P10

| Control                   | Evidence and negative control                                                                                                                                                                                                                                                                                      | Current classification                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| P01 authority             | Append-only NDJSON traces and retained negative controls are exercised, but the bespoke validator does not apply the JSON Schema and does not establish strict source-role, timestamp-unit, target-mode, or transport-range validation.                                                                            | `INCONCLUSIVE`; validator controls are useful diagnostics, not a closed authority proof                                |
| P02 conversions           | Hand-authored map vectors cover anchors, one-before/after, explicit gaps, halves, negative ties, and a safe-integer edge. A separate inspector imports neither runtime map nor parser, compares runtime rounding, and recomputes the one persisted conversion from retained anchors and exact rational operands.   | `PASS invariant` for retained map fixtures and the one persisted conversion                                            |
| P03 physical A/V relation | Chrome and Edge opened the real microphone briefly and opened the real camera video-only; no raw microphone PCM or frame pixels were retained. No paired light/audio rig or 20-event physical alignment run exists.                                                                                                | `MISSING`; camera-to-microphone alignment remains approximate/unavailable                                              |
| P04 follower              | Policy/held-out hashes, no-correction baseline, signed drift, stall/discontinuity, stale observation/generation, and bounded-rate controls pass. Browser selection now requires both acquisition `observedAt <= frame.now` and output `performanceTime <= expectedDisplayTime`, then chooses latest preceding.     | `PASS invariant` for deterministic causality; browser drift remains measured evidence pending budgets/repeats          |
| P05 audio protection      | An isolated graph probe retains expected and observed PCM under baseline/load; a standalone verifier recomputes coverage, mismatch, and canary results. The harness uses multiple sequential isolated AudioContexts in other probes, so it does not prove one application-wide runtime.                            | `PASS invariant` for the isolated PCM/canary probe; application-wide single-runtime and acoustic claims `INCONCLUSIVE` |
| P06 canonical rebuild     | Browser fresh contexts rebuild identical candidate/canonical projections. The semantic control separately validates an exact detached payload after candidate mutation in fresh Node workers. Neither proves every future durable or cross-thread boundary.                                                        | `PASS invariant` for the two bounded paths; exhaustive durable/cross-thread coverage `INCONCLUSIVE`                    |
| P07 MIDI                  | The original 116-byte layout control is supplemented by an independent 142-byte Type-1 layout, exact malformed/duplicate controls, and three authored 960->480 PPQ writer cases with explicit loss. Type-0, SMPTE, trailing data, and broad writer semantics remain absent.                                        | `PASS invariant` for the declared fixtures; broad SMF fidelity `INCONCLUSIVE`                                          |
| P08 accessibility         | A manual Windows task oracle is frozen. Bounded keyboard/AX-tree evidence exists with glyphs non-focusable. Windows Narrator `10.0.26100.8521` is inventoried, but no human observer performed the named-AT tasks; full editor/save/media-error and 200% browser-zoom workflows remain unimplemented in the spike. | `MISSING` named-AT run; complete accessibility gate remains `INCONCLUSIVE`                                             |
| P09 completeness/safety   | `measurement-controls-v1` freezes input/event/trace/time/cancellation/evidence caps, analysis sign/pair selection, classification language, and repeatability minimums before runs. Not every cap is enforced at every boundary.                                                                                   | `PASS invariant` for policy identity only; enforcement completeness `INCONCLUSIVE`                                     |
| P10 matrix                | Exact Windows machine/browser/device/physical-run/AT inventory is retained. Representative/high are the same machine; physical low tier, paired rig, high-speed display, and observer are explicit `MISSING`. macOS is `OUT OF SCOPE`.                                                                             | `PASS invariant` for inventory completeness, not hardware breadth                                                      |

The two deterministic control runs are byte-equivalent in their oracle decisions even though their
run/epoch/time identities differ. Short timing cells still lack ten independent starts, and each
five-minute browser cell lacks the three-run soak minimum. No percentiles or repeatability claim is
made.

## 1. Environment, browser, and missing coverage

| Dimension            | Recorded value                                                   | Coverage/classification                                                          |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| OS                   | Windows build 26200 x64; CIM compatibility name `Windows 10 Pro` | Available; treated as Windows 11 Insider-family evidence                         |
| CPU/RAM              | Ryzen 7 9800X3D, 8C/16T, 66,159,214,592 bytes                    | Representative/high on the same physical machine only                            |
| GPU/display          | RTX 5080 + AMD iGPU; 4K/60 and 4K/144 displays                   | Inventoried, headless runs do not prove displayed-frame quality                  |
| Chrome               | 150.0.7871.125 installed; headless UA 150                        | `MEASURED; budget decision pending` on fake and short physical-device runs       |
| Edge                 | 150.0.4078.83                                                    | `MEASURED; budget decision pending` on fake and short physical-device runs       |
| Physical media       | USB3.0 Video; USB3.0 Audio and ROCCAT Juke microphone observed   | Opened briefly in both browsers; camera stayed video-only; no raw media retained |
| Low desktop tier     | No approved physical device                                      | `MISSING`; CPU throttling is not represented as physical coverage                |
| macOS Chrome/Edge    | No machine/run                                                   | `OUT OF SCOPE`; no support claim                                                 |
| Assistive technology | Narrator installed; browser accessibility tree and keyboard path | Named screen-reader observer task run `MISSING`                                  |

Exact values are in `environment.json` (`spikes/practice-integration/provenance/environment.json` in the retained spike commit),
`windows-capability-inventory.json` (`spikes/practice-integration/provenance/windows-capability-inventory.json` in the retained spike commit), and browser
capability files.

## 2. Dependency, source, license, and asset inventory

| Package/asset         | Exact identity                                                            | License                                                          | Result/risk                                             |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| `@coderline/alphatab` | 1.8.4; npm integrity `sha512-VN5...qdsw==`; upstream commit `022a45c8...` | MPL-2.0                                                          | Evaluation authorized; production adoption not approved |
| `midi-file`           | 1.2.4 exact                                                               | MIT                                                              | Spike high-level parser only                            |
| `playwright` / core   | 1.61.1 exact                                                              | Apache-2.0                                                       | Spike automation only                                   |
| Bravura 1.38 assets   | Exact upstream commit/blob matches                                        | OFL-1.1; `Bravura` is a Reserved Font Name                       | Exact unmodified assets cleared with pinned OFL/FONTLOG |
| SONiVOX SF2/SF3       | 1,351,896 / 977,208 bytes; exact hashes in audit baseline                 | adjacent Apache notice does not establish bank/sample provenance | **Omit from every production/release artifact**         |

alphaTab notation/import is technically feasible with its player disabled, `soundFont: null`, and no
bank copied. The npm package exports SONiVOX separately and its compiled JavaScript contains no bank
reference. The production baseline therefore omits both banks; replacing or transcoding them is not
a clearance path. The pinned source tree/archive/build procedure and release-notice template now
define the reproducible MPL Source Code Form publication path. Exact unmodified Bravura 1.38 assets
may ship only with the pinned OFL/FONTLOG; modified/subset variants are omitted unless separately
reviewed. Owner acceptance is still required for MPL-2.0, the exact-received-source/bounded-origin
exception for embedded libraries, and any separately licensed synthesis bank. See
[`practice-spike-license-release-resolution.md`](../../docs/research/practice-spike-license-release-resolution.md),
`practice-spike-license-provenance-audit.md` (retained only in the disposable spike commit),
`alphatab-source.json` (`spikes/practice-integration/provenance/alphatab-source.json` in the retained spike commit), and
`dependencies.json` (`spikes/practice-integration/provenance/dependencies.json` in the retained spike commit). No candidate was modified.

## 3. Canonical boundary and import disposition

| Fixture/capability                          | Evidence                                                                                                                          | Classification                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Independent D4 canonical coverage           | 18 accepted rows, 26 isolated/relationship events, unique stable IDs, no opaque technique escape hatch                            | `PASS invariant` for the disposable canonical profile                                              |
| Detached exact-schema import payload        | Two fresh workers produce identical drafts; candidate mutation cannot change the retained payload; undeclared fields are rejected | `PASS invariant` for this Node import boundary; exhaustive cross-thread use remains `INCONCLUSIVE` |
| MusicXML/MXL exact event mapping            | 19 source events match independently authored IDs/ticks/durations/voices/pitches/strings/frets; MXL draft is identical            | `PASS invariant` for the retained fixtures                                                         |
| MusicXML/MXL broad D4 fidelity              | 11 rows preserved, bounded bend converted, six accepted rows dropped: hammer/pull, let ring, palm mute, dead note, harmonic       | `FAIL candidate`; reject a broad D4 MusicXML/MXL claim                                             |
| MusicXML non-native rows                    | Grace, repeat, alternate ending, and artificial harmonic receive stable reject/report codes                                       | `PASS invariant` for explicit rejection; no support expansion                                      |
| GP5 effects                                 | Exact file identity and fresh-worker stability, but no independent field inspector                                                | `INCONCLUSIVE`; parsing-only and approximate                                                       |
| GP7 effects                                 | Independent GPIF has 10 Hopo origins versus 9 candidate origins plus four unsupported grace notes                                 | `FAIL candidate` for this fixture                                                                  |
| GP8 basic                                   | Four exact quarter-note pitch/string/fret/tick rows match twice                                                                   | `PASS invariant` for this narrow fixture only                                                      |
| Renderer geometry/edit/page/continuous view | Not established by the semantic control                                                                                           | `INCONCLUSIVE`                                                                                     |

Authoritative semantic evidence:
`semantic-fidelity-results.json` (`spikes/practice-integration/raw-results/semantic-fidelity-2026-07-21T013906-808Z/semantic-fidelity-results.json` in the retained spike commit).
Older discovery evidence remains historical and non-authoritative:
`canonical-results.json` (`spikes/practice-integration/raw-results/node-2026-07-20T215342-858Z/canonical-results.json` in the retained spike commit),
`import-results.json` (`spikes/practice-integration/raw-results/imports-2026-07-20T215343-396Z/import-results.json` in the retained spike commit), and
`semantic-disposition-matrix.json` (`spikes/practice-integration/raw-results/imports-2026-07-20T215343-396Z/semantic-disposition-matrix.json` in the retained spike commit).

## 4. Raw SMF reconciliation and quantization

| Check                                                  | Result                                                                                                                       | Classification                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Independent Type-1 byte layout                         | 142 bytes, three structural spans, 21 non-overlapping event spans; every byte explained exactly once                         | `PASS invariant` for this fixture                                            |
| Event/tick/disposition reconciliation                  | 13 consumed, five preserved, two ignored-by-policy, one unsupported; running status and note-on-zero independently inspected | `PASS invariant` for the declared corpus …344 tokens truncated…              | 6.26 / 25.65 ms                    | maxima under 46 ms absolute         | `MEASURED; budget decision pending` |
| Chrome 120 s drift fixture sample                      | 249                                                                                                                          | 7.46 ms                                                                      | -50.442 to +19.115 ms / -41.582 ms | `MEASURED; budget decision pending` |
| Edge media matrix                                      | 45–249                                                                                                                       | 1.09–26.00 ms                                                                | extrema -71.282 to +22.043 ms      | `MEASURED; budget decision pending` |
| Truncated/corrupt media                                | n/a                                                                                                                          | n/a                                                                          | Explicit load rejection            | `PASS invariant`                    |
| Predeclared correction policy                          | Bounded +/-3%, enter/exit hysteresis, dwell, stale rejection, hard-seek cooldown                                             | `PASS invariant` in held-out deterministic simulation                        |
| Real correction/audio quality                          | No objective pitch/listening trial                                                                                           | `INCONCLUSIVE`                                                               |
| Speed, seek, loop, controlled pause/resume, P0 worklet | 0.5x/0.75x/1x/1.5x/2x, three seeks, loop wrap, and P0 acknowledgements pass                                                  | `PASS invariant` for scripted controls                                       |
| Lifecycle freeze/resume                                | Video resumed in both browsers; Edge same-context audio heartbeat floor failed                                               | `FAIL candidate` for Edge P0 survival after this injected lifecycle sequence |
| Five-minute real-time workload/drift                   | Chrome and fresh-context Edge completed; one run per browser, no percentiles                                                 | `MEASURED; budget decision pending`; repeatability `INCONCLUSIVE`            |
| Unsynchronized preview full procedure                  | Score-tick freeze/authority tested; source replacement and disposal UI path absent                                           | `INCONCLUSIVE`                                                               |

The follower reconstructs each target at `expectedDisplayTime` from the latest qualified
`getOutputTimestamp()` observation acquired no later than the frame callback and whose output
performance time precedes the target. A future-nearest/acquired-after-frame control is rejected.
Frames are generation-scoped and are never compared through seek discontinuities. Evidence:
`media-results.json` (`spikes/practice-integration/raw-results/browser-chrome-2026-07-21T004923-913Z/media-results.json` in the retained spike commit) and
`follower-causal-results.json` (`spikes/practice-integration/raw-results/controls-2026-07-21T005539-214Z/follower-causal-results.json` in the retained spike commit).

## 9. Reference-video audio candidates

| Candidate                                      | Evidence                                                                                                    | Classification/recommendation |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Media-element audio routed into shared runtime | Codec decode occurred, but graph isolation/gain/device lifecycle/pitch quality were not physically measured | `INCONCLUSIVE`                |
| Separate decode/schedule                       | Not implemented                                                                                             | Deferred fallback             |
| Muted reference video                          | Preserves P0 and avoids an unproven output-to-input path                                                    | Provisional fallback          |

Recommendation: synchronized video may proceed only with video audio muted until physical graph
isolation, rate/pitch behavior, seek, and device-lifecycle evidence is accepted.

## 10. Take capture strategy comparison

| Strategy                                                                               | Timestamp/drop/finalization evidence                                                                                            | Classification                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| MediaRecorder + inspection                                                             | Video-only fake input, pause/resume/delivery events, finalized 40,679-byte VP9 WebM; ffprobe found one video track and no audio | `PASS invariant` for privacy; `MEASURED; budget decision pending` for basic finalization |
| TrackProcessor + recording                                                             | 30 timestamped frames observed and every frame closed                                                                           | `MEASURED; budget decision pending` for observation only                                 |
| WebCodecs                                                                              | 30 VP8 chunks, explicit PTS/duration, flush complete, queue zero                                                                | `MEASURED; budget decision pending` for encoder only; no muxer selected                  |
| Immutable take map                                                                     | Historical Node discovery bound core/video hashes and preserved the pause gap                                                   | Historical observation; acceptance `INCONCLUSIVE`                                        |
| Physical camera and microphone short operation                                         | Both browsers opened the real microphone and opened the camera video-only; no raw media persisted                               | `MEASURED`; privacy track invariant passed                                               |
| Physical camera-to-microphone offset, drops, permission loss, relink, storage pressure | No paired stimulus/offset rig, device-loss, relink, or pressure run                                                             | `MISSING`/`INCONCLUSIVE`                                                                 |
| No-video fallback                                                                      | Preserves microphone evidence                                                                                                   | Available fallback                                                                       |

MediaRecorder delivery timestamps are labelled delivery only and never treated as camera-frame
anchors. Current browser evidence is in
`capture-results.json` (`spikes/practice-integration/raw-results/browser-chrome-2026-07-21T004923-913Z/capture-results.json` in the retained spike commit).
The old take-map result is retained as historical, non-authoritative discovery evidence.

## 11. Simultaneous workload

| Browser |  Elapsed | Presented frames |    Seek | Worklet acknowledgements | Long tasks |   Heap after run | Classification                      |
| ------- | -------: | ---------------: | ------: | -----------------------: | ---------: | ---------------: | ----------------------------------- |
| Chrome  | 5,551 ms |              159 | 1.25 ms |                        4 |          3 | 33,647,050 bytes | `MEASURED; budget decision pending` |
| Edge    | 5,561 ms |              158 | 1.31 ms |                        4 |          3 | 34,172,444 bytes | `MEASURED; budget decision pending` |

This combines a 2,000-note alphaTab render, media playback/seek, capture-boundary worklet, CPU worker,
and UI observation. The following extended workload rows are retained **historical,
non-authoritative observations**. Their original source/manifests do not satisfy the current replay
rule:

| Browser/run                                        |  Wall time | Presented frames | Audio heartbeats | Worklet frame gaps | Load cycles | Result                                                           |
| -------------------------------------------------- | ---------: | ---------------: | ---------------: | -----------------: | ----------: | ---------------------------------------------------------------- |
| Chrome                                             | 300,647 ms |            8,998 |              300 |                  0 |          66 | `MEASURED; budget decision pending`                              |
| Edge after lifecycle freeze/resume in same context | 300,542 ms |            8,998 |              205 |                  0 |          66 | `FAIL candidate` against frozen 290-heartbeat completeness floor |
| Edge fresh browsing context                        | 300,475 ms |            8,998 |              300 |                  0 |          66 | `MEASURED; budget decision pending`                              |

The historical Edge comparison isolates a lifecycle-sensitive audio-runtime risk: video completed and no
page/console error occurred, but the same-context run advanced only 205 seconds of audio worklet
frames during 300 seconds of wall time. A fresh browsing context recovered. That does not prove the
production runtime can safely recover after background resume; an in-context audio-runtime
recreation/resynchronization control remains required. The workload does not include the production
Basic Pitch worker or a physical low tier. Each browser cell has one soak, below the frozen minimum
of three, so no percentile or repeatability claim is made.

## 12. Size, performance, memory, storage, and failures

| Measure                                       | Observed data                                                                                                        | Classification                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| AlphaTex parse                                | 0.73–16.00 ms across generated fixtures in latest Node run                                                           | `MEASURED; budget decision pending`                   |
| Chrome render                                 | 2,000 notes 49.84 ms; 10,000 notes 133.98 ms                                                                         | `MEASURED; budget decision pending`                   |
| Edge render                                   | 2,000 notes 41.67 ms; 10,000 notes 142.20 ms                                                                         | `MEASURED; budget decision pending`                   |
| Candidate CSS scale 2 render                  | Attached SVG bounds doubled; not browser/page zoom or workspace reflow                                               | Discovery only; full zoom remains `INCONCLUSIVE`      |
| alphaTab installed distribution               | 13,644,996 bytes; packed package 4,651,280 bytes                                                                     | Measured; production bundle/chunk decision unresolved |
| Browser quota                                 | 10 GiB reported, zero initial usage                                                                                  | Discovery only; pressure/eviction `INCONCLUSIVE`      |
| Failure data                                  | Malformed inputs rejected; authoritative browser runs have zero console/page errors; prior harness mistakes excluded | `PASS invariant` for visible failure/auditability     |
| Production Basic Pitch/Vite/audio coexistence | Existing production validation is separate; this harness did not reproduce it                                        | `INCONCLUSIVE` for coexistence                        |

No final render, latency, memory, storage, or dropout budget is inferred from one high-end machine.

## 13. Accessibility, zoom, and reflow

| Check                                                           | Result                                                                                                                                 | Classification                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Bounded semantic row navigation/activation                      | Synthetic 80-row list; 12 ArrowRight transitions and one Enter activation; candidate glyphs need no focus                              | `PASS invariant` for this bounded path only              |
| Browser accessibility tree                                      | Named region and note buttons include measure/string/fret/duration/tick                                                                | `PASS invariant`                                         |
| Candidate CSS scale 2                                           | Surfaces attached, but no browser/page zoom or full-workspace reflow was exercised                                                     | Discovery only                                           |
| Resize widths/reflow and focus restoration across full workflow | Partial render widths only                                                                                                             | `INCONCLUSIVE`                                           |
| Frozen manual task oracle                                       | Renderer failure, edit/undo/redo, range/transport, error recovery, unavailable media, and 200% zoom tasks specified before a human run | Oracle present; tasks not executed                       |
| Named screen reader on each Windows browser pairing             | Narrator `10.0.26100.8521` discovered; no human observer/sign-off run                                                                  | `MISSING` and blocking for a complete accessibility gate |

Evidence: Chrome/Edge `accessibility-results.json` and `render-results.json` in the authoritative
browser runs.

## 14. Candidate recommendation, fallbacks, unresolved risk, and budget gate

| Capability            | Provisional recommendation                                                        | Fallback/omission                                                                      | Unresolved gate                                                            |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Notation/import       | Keep alphaTab 1.8.4 only behind a canonical adapter and exact release controls    | GP8 basic only; GP7 tested effects reject; GP5 parsing-only; broad MusicXML D4 rejects | Renderer/edit behavior and owner MPL/source-policy acceptance              |
| Synth                 | Keep synthesis out of the first release unless a replacement bank passes audit    | Custom shared-context renderer or omit synthesis                                       | Bank rights/provenance, tail/loop quality, speed/pitch, production adapter |
| SMF                   | Keep raw preflight plus parser/writer only for the independently inspected subset | Possible-loss warning or omit                                                          | Type-0/SMPTE/trailing-data and broader writer/quantization corpus          |
| Reference video       | Keep HTML media element with causal presented-frame follower                      | currentTime follower, labelled unsynchronized preview, or omit                         | Edge in-context resume recovery, physical tiers, repeated distributions    |
| Reference-video audio | Mute for now                                                                      | Omit permanently                                                                       | Shared-runtime routing isolation and pitch/rate quality                    |
| Take video            | MediaRecorder + inspection with labelled approximate alignment                    | No-video                                                                               | Physical A/V offset, drops, device failure, relink/storage lifecycle       |
| TrackProcessor        | Optional diagnostic improvement, not selected recorder                            | MediaRecorder inspection only                                                          | Browser support and resource benefit                                       |
| WebCodecs             | Do not select yet                                                                 | MediaRecorder                                                                          | Reviewed muxer/container/license and resource evidence                     |

Proposed numeric-budget procedure: do not freeze values from these single headless runs. The
post-spike gate should first require three repeated cold/warm five-minute cells on every approved
physical Windows browser/hardware tier, an Edge background/resume recovery control, and physical
output/presentation observation. It can then set percentile budgets for medium/long render,
command-to-sound, first frame, post-seek settle, steady presentation error/drift, correction count
and duration, capture gaps/drops, finalization, memory, and storage. Until then every such budget is
explicitly **unproposed**, not silently passed.

## Exit status

P02 and bounded portions of P04/P05/P06/P07 plus the Windows inventory have retained authoritative
evidence. The semantic control adds exact bounded D4/import/SMF evidence while rejecting broad
MusicXML D4 and the tested GP7 effects file and leaving GP5 parsing-only. P01, application-wide P05,
exhaustive P06, broad-corpus P07, and P09 enforcement
completeness remain `INCONCLUSIVE`. The specification's final acceptance criterion is not met due
to the missing physical low tier, paired A/V rig, named-screen-reader observer run, full semantic
editor accessibility workflow, objective reference-audio quality/isolation evidence, in-context
Edge background/resume audio recovery, physical take offset/device-loss/relink/storage evidence,
and three-run soak repeatability. macOS is not a blocker because it is explicitly `OUT OF SCOPE`.
Production adoption and numeric budgets remain reserved for the owner/post-spike gate.

The remaining licensing owner decisions are explicit:

1. Accept or reject MPL-2.0 with the pinned source/notice/retention procedure.
2. Accept alphaTab commit `022a45c...` as exact received source while recording bounded, unconfirmed
   embedded-library origins, or require upstream confirmation.
3. Keep synthesis out of the first release, or select and audit a separately licensed replacement
   bank. The packaged SONiVOX files remain omitted in either case.
