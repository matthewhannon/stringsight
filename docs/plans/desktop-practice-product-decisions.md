# Desktop Practice Workspace product decisions and #2 completion record

- **Status:** Accepted by the product owner
- **Accepted:** 2026-07-20
- **Prepared:** 2026-07-20
- **Branch:** `codex/desktop-practice-product-ux`
- **Implementation baseline:** `main` at `0b23c6e` (`Replace rack UI with desktop practice workspace`)
- **Decision scope:** Product behavior and desktop UX only; technology, schema, codec, and measured
  performance decisions belong to the next architecture/spike gates

## 1. Direction already approved

These decisions come from the recorded owner direction and are treated as product constraints:

- StringSight targets desktop web; no phone or tablet composition is required.
- Guitar score/tab is the central product object and primary canvas.
- The workspace uses a dual-canvas direction with Tab Focus and Video Focus alternatives.
- The former rack/hardware presentation is superseded. Existing microphone, note/chord analysis,
  evidence, corrections, tests, and accessibility behavior remain valuable.
- Reference video and take video are distinct concepts and optional to the guitarist.
- One future application-owned `PracticeTransport` is the only command/time authority.
- Authored intent, observed evidence, immutable takes, mutable media availability, and derived
  assessment remain distinct.
- MIDI may support interchange or advanced inspection but is not the primary canvas or product
  identity.
- Synchronized practice video is not live computer vision.
- Live fretboard/hand vision, fusion, and GPT interpretation are deferred.

## 2. Accepted owner decisions

The following recommendations make the product documents executable. Until the owner accepts or
changes them, #2 is complete as a proposal but not accepted as the final product gate.

### D1. Headline release journey and useful-without boundary

**Recommendation:** P0 is: create/open/import a guitar tab, edit and save it, practice the whole
score or a range with playback/speed/loop/metronome/count-in, connect bounded audio monitoring,
record/pause/resume/finalize a take, replay the guitarist alone, compare with an available reference,
and save/reopen/export/delete locally. Video and automated assessment are not required for P0
usefulness.

**Why:** This is a complete guitar practice loop and protects the project from making unproven media
or scoring technology the release's only value.

**Consequence of broader P0:** Requiring video or assessment before the product is useful couples
release readiness to codec, synchronization, alignment, and calibration risk.

**Consequence of narrower P0:** Omitting authored score playback, take replay, or durable save makes
the product closer to an editor mockup or microphone detector than a complete practice workspace.

**Owner decision:** Accepted as recommended on 2026-07-20.

### D2. Optional video's release position

**Recommendation:** Treat synchronized reference/take video as a gated first-release enhancement
(P1): planned for the first release if its spike and production gates pass, optional for each user,
and not allowed to block or weaken the P0 audio/tab/take journey.

**Why:** The dual canvas is differentiated and valuable, but media decode, capture, synchronization,
storage, and accessibility need evidence before they become a release blocker.

**Alternative:** Make synchronized video required-to-ship. This strengthens the launch story but
delays release if any media gate fails. Moving it post-release lowers risk but makes the initial dual
canvas mostly dormant.

**Owner decision:** Accepted as recommended on 2026-07-20. Synchronized video is a gated
first-release enhancement and remains optional to each user.

### D3. Visible score creation/import routes

**Recommendation:** Primary entry shows **New guitar tab**, **Open StringSight document**, and
**Import score**. Import exposes tested Guitar Pro/MusicXML routes selected after the spike. MIDI is
under **More formats** and described as performance-to-draft conversion with fingering/notation
loss, never as equivalent to guitar tab import.

**Why:** It keeps the first choice guitar-centered and prevents MIDI from defining the product.

**Alternative:** Expose only native new/open for a smaller first release, at the cost of adoption by
guitarists with existing tabs. Giving MIDI equal primary weight misrepresents its guitar semantics.

**Owner decision:** Accepted as recommended on 2026-07-20. The entry hierarchy is fixed; exact
Guitar Pro and MusicXML versions remain subject to spike evidence and final technology acceptance.

### D4. Initial score/editor technique breadth

**Recommendation:** First-class v1 support for pitch/key, ties, slurs, common tuplets, up to two
voices, dynamics, core articulations, per-string sounding duration, hammer-on, pull-off, slide,
bounded bend, vibrato, let ring, palm mute, dead note, and natural harmonic. Other techniques use
individual convert/report or reject/report decisions. Grace notes and structural repeats/endings are
not native v1; imports require explicit conversion/expansion reports.

**Why:** This covers realistic guitar practice material without claiming full professional engraving
or hiding unsupported semantics.

**Alternative:** A basic fret/rhythm subset is faster but materially reduces Guitar Pro/MusicXML
fidelity and must reject or report every omitted row. A broader profile expands editor, playback,
import, accessibility, and fixture obligations together.

**Owner decision:** Accepted as recommended on 2026-07-20. Detailed adapter fixtures and schema
encoding remain architecture work.

### D5. Navigation model

**Recommendation:** Use a collapsible persistent library/navigation rail with one active document.
Do not add document tabs in v1.

**Why:** It matches the approved desktop direction, gives New/Open/Import and recent work a stable
home, and avoids tab-strip conflict with Edit/Practice/Review modes.

**Alternative:** One-document-first without a rail is simpler but makes switching/import/history
less discoverable. Multiple document tabs add unsaved/conflict/transport complexity without being
part of the headline journey.

**Owner decision:** Accepted as recommended on 2026-07-20.

### D6. Primary versus disclosed input analysis

**Recommendation:** Keep device/connection, monitoring-versus-recording lifecycle, textual level and
warnings, current best-supported note/chord, confidence class, and recovery actions primary. Put
ranked alternatives, chroma, analyzer provenance/version, sample-rate/latency counters, and detailed
diagnostics behind Analysis details or Input settings.

**Why:** A guitarist can trust and recover the input without turning the workspace into an analyzer
rack.

**Alternative:** Showing all diagnostics continuously competes with the tab and video; hiding current
evidence entirely removes a key StringSight differentiator and makes input health opaque.

**Owner decision:** Accepted as recommended on 2026-07-20.

### D7. Minimum take review before assessment

**Recommendation:** Before assessment work begins, take review must support fixed revision/range
identity, take-only audible replay, seek/pause/stop, evidence and correction inspection, unavailable
media recovery, and—when a playable reference exists—reference-only and coordinated comparison
with independent source gains/mute/solo under one transport.

**Why:** Users need to hear and inspect what happened before StringSight grades it. This creates a
testable alignment foundation without making a score claim.

**Alternative:** Starting assessment after record/stop alone risks optimizing against an unverified
take-media relationship and makes failures hard to investigate.

**Owner decision:** Accepted as recommended on 2026-07-20.

### D8. Video-audio policy

**Recommendation:** Reference-video audio is an optional user-facing reference source with explicit
mute/gain/source selection under the authoritative transport. Take-video embedded audio is muted and
ignored as evidence by default; the existing microphone/worklet recording remains authoritative for
the take. Any later option to audition embedded camera audio is separately labelled and never used
silently for analysis.

**Why:** This avoids duplicate microphones and evidence ambiguity while allowing instructional
videos to carry useful sound.

**Alternative:** Muting all video audio simplifies synchronization but reduces value for imported
lesson/performance videos. Treating camera audio as take evidence creates a second capture path,
latency, quality, and provenance problem.

**Owner decision:** Accepted as recommended on 2026-07-20.

### D9. Retention and deletion promise

**Recommendation:** Keep all data local until explicit deletion. Deleting an editable document head
retains immutable revisions referenced by takes as archived. Deleting a mutable session retains a
take's structured evidence snapshot; ask separately about referenced PCM/video. Deleting media
removes replay availability but retains the immutable expected identity/tombstone. Take deletion
removes only exclusively owned assessment/snapshot data after preview. Provide a separate, fully
enumerated **Delete everything related** action.

**Why:** This preserves reproducibility while giving the user explicit control over private, large
media.

**Alternative:** Block deletion while referenced (strong integrity, poor control) or cascade all
references (simple promise, destroys history). Any policy must state storage-pressure/eviction
behavior and never claim missing bytes are available.

**Owner decision:** Accepted as recommended on 2026-07-20. Structured export is the default and
private PCM/video media requires explicit opt-in.

### D10. First-release cutoff for optional intelligence

**Recommendation:** Keep live computer vision, audio/vision fusion, automatic visual indexing, and
GPT interpretation outside P0/P1 Practice Workspace scope. Reconsider each only after the score,
transport, take, media, and assessment foundations pass and a measured user benefit is documented.

**Why:** These capabilities should extend a working practice product rather than determine its
architecture or release identity.

**Owner decision:** Accepted as recommended on 2026-07-20. Vision, fusion, automatic visual
indexing, and GPT interpretation remain outside P0/P1.

## 3. Architecture and spike decisions deliberately not resolved here

The following choices need architecture evidence and must not be inferred from product approval:

- alphaTab/MPL-2.0 production policy and exact dependency/source-notice obligations;
- notation/import/playback adapter selection or fallback;
- 960 PPQ, canonical hash projections, schema shapes, and storage layout;
- exact format/version fidelity after fixtures;
- reference synthesis ownership protocol and fallback costs;
- count-in pre-roll/Session-zero mapping and off-grid count-in scheduling;
- video containers/codecs, camera constraints, synchronization interpolation, and export muxing;
- bundle, long-score, memory, storage, drift, latency, and simultaneous-workload budgets; and
- database migration, tombstone, relink, and cross-store transaction mechanics.

The next gate may propose recommendations for these choices. It may not weaken the approved product
principles, one-authority invariant, or local-first/evidence-preservation rules.

## 4. #2 deliverable status

| Deliverable                                      | Status                               | Evidence                                                                                       |
| ------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Desktop Practice Workspace product requirements  | Draft complete                       | `01-product-requirements.md`                                                                   |
| Desktop information and interaction architecture | Draft complete                       | `desktop-practice-workspace-ux.md`                                                             |
| Lifecycle wireframes                             | Draft complete                       | `desktop-practice-workspace-wireframes.md`                                                     |
| Independent-region state/action map              | Draft complete                       | `desktop-practice-workspace-state-actions.md`                                                  |
| Active checklist dependency order                | Draft complete                       | `BUILD_CHECKLIST.md`                                                                           |
| Production code/dependency changes               | None authorized or required          | Documentation-only branch                                                                      |
| Owner acceptance                                 | Accepted 2026-07-20                  | D1–D10 accepted as recommended; structured export with private media opt-in                    |
| Focused independent product review               | Complete; blocking findings resolved | Count-in capture remains policy-neutral and unsynchronized video still uses the sole transport |

## 5. Owner acceptance record

On 2026-07-20, the owner accepted D1–D10 as recommended, selected synchronized video as a gated
first-release enhancement, and selected structured export with private PCM/video media opt-in.

This acceptance approves product behavior and UX structure. It does not approve the low-level
technology, license, codec, synchronization, schema, or measured-budget choices in section 3.
