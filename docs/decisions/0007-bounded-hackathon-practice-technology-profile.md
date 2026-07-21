# ADR 0007: Bounded hackathon Practice System technology profile

- **Status:** Accepted
- **Date:** 2026-07-20
- **Evidence:** `../verification/11-notation-audio-video-feasibility-spike-report.md`
- **License resolution:** `../research/practice-spike-license-release-resolution.md`
- **Independent review:**
  `../verification/11-practice-post-spike-acceptance-independent-review.md`

## Context

The disposable notation, audio, MIDI, and video spike produced useful bounded evidence but did not
meet its original commercial-quality exit gate. That gate included repeated physical hardware,
accessibility, timing, lifecycle, storage-pressure, and percentile-budget evidence that is not
available. Waiting for every commercial gate would block the hackathon without changing the core
Practice System invariants.

This decision therefore separates an honest hackathon implementation profile from future support
and commercial claims. It accepts architecture and selected implementation directions; it does not
claim that the placeholder Practice Workspace already implements them.

## Decision

### Architecture authority

Accept the invariant architecture in ADR 0006 and the Practice System plan. `PracticeDocument`,
immutable revisions, `PracticeTake`, evidence, assessment, and mutable media availability remain
separate. `PracticeTransport` is the only command and score-position authority. One
application-owned `AudioRuntime` and its audio clock schedule audible work. Notation libraries,
MIDI parsers, media elements, recorders, frame callbacks, and React are subordinate adapters or
observers. Third-party object graphs are never canonical or durable StringSight state.

### Notation and import

Adopt alphaTab 1.8.4 for the hackathon only behind a replaceable StringSight-owned adapter. This is
an implementation decision, not a statement that a production adapter exists today. Keep player
mode disabled initially and do not adopt alphaSynth or reference synthesis.

Only fixture-backed import behavior may be enabled or advertised. GP8 basic is the strongest
current bounded path: four tested quarter-note pitch, rhythm, string, and fret rows were preserved.
The retained MusicXML/MXL fixtures mapped 19 retained events, but broad D4 technique fidelity is
rejected because hammer-on, pull-off, let-ring, palm-mute, dead-note, and natural-harmonic semantics
were lost. The tested GP7 effects fixture is rejected for fidelity; GP5 effects remain
parsing-only/approximate until an independent field oracle exists. SMF support is limited to the
declared Type-1 and 960-to-480 PPQ fixtures with explicit loss; no general MIDI fidelity claim is
accepted. Native StringSight data remains the only lossless editable round trip.

### License and release profile

Accept MPL-2.0 distribution of the exact alphaTab 1.8.4 received source at commit
`022a45c8e42370f9e12e68949d11eada370da83d` as part of a Larger Work, subject to ADR 0005 and the
release checklist in the retained license resolution. The bounded upstream candidates for embedded
TinySoundFont, SFZero, Haxe, SharpZipLib, NVorbis, and libvorbis are provenance leads, not confirmed
origins; the received alphaTab source and reconstructed notices are the release baseline.

When client-side alphaTab executable code is distributed, the release must publish an immutable,
versioned, StringSight-controlled, recipient-accessible, hash-verified source-and-notice location
and link to it from the website's legal/notices surface. `/open-source/` is the selected convention,
not a claim that the license mandates that exact path. The release must include the exact
corresponding preferred-form
alphaTab source, MPL-2.0 text, alphaTab and embedded-library notices, Bravura OFL/FONTLOG material,
version/commit, source and artifact checksums, modification status, and retention information. If
StringSight modifies covered files, it must publish those modified preferred-form files and the
corresponding build material. StringSight-owned files remain under their existing MIT terms; this
is an owner distribution policy based on MPL's file-level/Larger Work model, not legal advice.

Do not copy or distribute the audited `sonivox.sf2` or `sonivox.sf3` assets. Their sample-rights
chain was not established. The release scan denies their names and exact hashes, and the hackathon
policy excludes any unreviewed sound bank. Exact unmodified Bravura 1.38 assets may ship only with
the pinned OFL/FONTLOG and SBOM controls; any modified, subset, or rebuilt font requires a new
review.

### Audio and media profile

Do not instantiate or enable alphaSynth or synthesized reference playback, and omit all sound banks
from the initial release. The general alphaTab bundle may still contain uninvoked alphaSynth
implementation bytes; the spike did not prove they tree-shake out.
Adding synthesis requires a separately accepted bank, subordinate scheduling through the shared
runtime, complete tail/cancellation behavior, coexistence evidence, and audible tempo/pitch/edit
quality review.

Reference and take video remain optional. A future reference-video implementation must follow
transport through the bounded deterministic map/follower policy; the spike did not validate the
complete production integration. Keep reference-video audio muted or omitted initially; any audible
or separately decoded/routed path remains gated. Capture
take video with `audio: false`; microphone/worklet PCM remains authoritative evidence. Label take
video alignment approximate until physical camera-to-microphone evidence is accepted.

### Environment and budgets

Current desktop Chrome on Windows 11 is the primary hackathon target, not a broadly validated
support claim. Edge is best effort until the same-context audio heartbeat failure after injected
freeze/resume is fixed and repeated; users must be told not to background an active Edge session.
macOS remains a portability goal with no current support claim.

The single-machine measurements are observations, not universal budgets. Each implementing item
must define bounded hackathon smoke thresholds before it is enabled. Representative hardware,
three-run distributions, percentile budgets, physical A/V timing, device-loss/storage-pressure
tests, full zoom/reflow, and a human-observed Narrator workflow remain pre-commercial release gates.

## Consequences

- Checklist Item 10, the renderer-independent canonical guitar model, is the next production item.
- alphaTab is replaceable and subordinate; it cannot define canonical state or transport time.
- Unsupported import semantics are rejected or reported as explicit loss instead of silently
  becoming product claims.
- The hackathon can proceed without synthesis or required video.
- Broad browser, hardware, accessibility, timing, and performance claims stay visibly deferred.
- No spike application, candidate adapter, dependency manifest, generated media, or raw result bulk
  is merged into production.

## Pre-commercial gates retained

Before broader commercial support is advertised, close the unresolved shared-runtime/coexistence,
renderer editing/accessibility, synthesis, reference-audio, Edge lifecycle, physical timing/device,
relink/storage-pressure, hardware-tier, soak-distribution, and numeric-budget evidence listed in
the retained spike report. Future evidence may expand this profile through a new ADR; it must not
silently weaken the one-authority, evidence-integrity, loss-reporting, or release-compliance rules.
