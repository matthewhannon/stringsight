# Practice architecture independent review

- **Date:** 2026-07-20
- **Scope:** Provisional Practice System plan, ADR 0006, timed-media synchronization research,
  disposable spike specification, and active checklist wording
- **Final verdict:** PASS; no blocking contradiction remains
- **Production code or dependency changes:** None

## Reviewed artifacts

- `../plans/10-practice-system-architecture.md`
- `../decisions/0006-practice-document-audio-runtime-and-notation-adapters.md`
- `../research/practice-transport-and-timed-media-sync.md`
- `../plans/11-notation-audio-video-feasibility-spike.md`
- `../../BUILD_CHECKLIST.md`, active roadmap only

The review specifically tested competing clocks, canonical-state leakage, media identity,
reference/take map separation, stale synchronization, feedback-loop stability, recorder timestamp
claims, deletion integrity, licensing assumptions, accessibility, measurable gates, and circular
dependencies.

## Blocking findings and resolutions

### 1. Circular take/map identity

The initial draft allowed an immutable take to bind a take-video sync-map identity while the map
also bound the take hash. The revision defines a `practiceTakeCoreHash` whose projection excludes
outward sync-map links. Finalization now proceeds in one direction: finalize/hash the take core,
finalize/hash the take-video asset, create an immutable map binding both, and select it through a
versioned `TakeVideoAttachmentState`.

### 2. Circular correction-policy gate

The initial draft disabled rate correction until after the spike while also requiring the spike to
measure correction. The revision allows immutable, predeclared experimental policy fixtures in the
disposable spike, with exact policy IDs in every trace. Production correction remains disabled until
the post-spike acceptance gate.

### 3. Follower feedback compared different time coordinates

The initial target could be derived from a current audio frame and compared with a presented frame
from another moment. The revision projects the authoritative transport target to the frame's
`expectedDisplayTime` through a qualified `getOutputTimestamp()` context/performance pair. It also
defines feed-forward nominal media rate from the local score/media derivative and current
score-tick/output-second rate before bounded feedback correction is applied.

### 4. Missing mapless-video behavior

The accepted product state includes ready-but-unsynchronized media, but the initial architecture did
not define command ownership or cursor behavior. The revision adds an explicit transport-owned
`unsynchronized-media-preview` phase. The score tick freezes, a separate media-preview PTS moves,
all media commands still enter through `PracticeTransport`, and recording, assessment, metronome,
count-in, loop, and alignment claims are disabled. Exit creates a new generation and restores the
frozen score tick.

## Clarifications verified in the final pass

- The follower transition table covers prepare, play/resume, pause, seek/loop, unmapped gaps,
  stalls, media end, stop, source replacement, and disposal.
- Synthetic count-in advances a virtual pre-roll timeline while the authoritative score tick stays
  fixed at the requested start.
- Audio render anchors retain rational sub-ticks as numerator/denominator values.
- The spike requires keyboard-only and named screen-reader/assistive-technology runs; DOM inspection
  alone cannot establish accessibility.
- Reference and take maps remain distinct and recorder delivery timing is never represented as an
  exact frame anchor.
- Product decisions D1-D10 remain intact, while technology, license, codec, schema, and numeric
  budgets remain pending.

## Final review result

The focused follow-up review returned **PASS** after independently rechecking all four blockers and
the clarifications above. The provisional architecture is coherent enough to define the disposable
spike. This review does not accept a production dependency, implementation, codec/container,
database schema, or measured budget, and it does not move the plan or ADR out of **Proposed**.
