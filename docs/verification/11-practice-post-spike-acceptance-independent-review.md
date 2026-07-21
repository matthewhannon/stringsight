# Post-spike Practice System acceptance independent review

- **Status:** PASS — no blocking findings
- **Reviewed:** 2026-07-20
- **Baseline:** `codex/practice-architecture-timed-media@2b6960a`
- **Scope:** Post-spike acceptance diff, retained evidence/compliance artifacts, release checks,
  active checklist order, and readiness to begin Item 10
- **Evidence source:** `codex/spike-practice-integration@7b3c5f9`

## Review questions

Two independent read-only reviews checked whether:

1. acceptance wording exceeded the retained bounded evidence;
2. failed or inconclusive GP, MusicXML, SMF, synthesis, Edge, video, accessibility, runtime, or
   budget claims leaked into the hackathon profile;
3. the alphaTab/MPL website procedure retained exact source, notice, modification, Bravura,
   embedded-code, SBOM, and SONiVOX-exclusion controls without relicensing StringSight-owned files;
4. one `PracticeTransport`, one application `AudioRuntime`, microphone/worklet evidence authority,
   distinct media maps, and subordinate adapters remained invariant;
5. the checklist could advance to the canonical guitar model without circular dependencies; and
6. pre-commercial limitations remained visible rather than being deleted or relabeled as passes.

## Findings resolved before PASS

- The ordinary dependency checker originally rejected all MPL packages. It now permits only exact
  `@coderline/alphatab@1.8.4` with MPL-2.0 and the accepted registry integrity; every other MPL
  dependency still requires review. Ordinary notice checks still apply.
- The initial release checker verified only path presence. It now checks nonempty hosted files,
  pinned manifest fields, exact source archive bytes/SHA-256, completed notice identity, MPL text,
  embedded-library/SBOM entries, Bravura OFL/FONTLOG and exact asset hashes, plus SONiVOX
  names/hashes. The final deployed URL/retention smoke remains an open release task because alphaTab
  is not installed.
- Reference-video audio was narrowed from “muted or separate” to muted/omitted; any audible routed
  path remains gated.
- “Omit alphaSynth” was clarified as do not instantiate or enable synthesis. The general alphaTab
  bundle may retain uninvoked implementation bytes because tree-shaking was not proven.
- Checklist language now records only available observations and explicitly retains missing quota,
  edit-to-sound, continuity, physical, accessibility, lifecycle, repeatability, and budget evidence.
- Retained report paths, historical owner-gated status, the accepted D9 export policy, and the
  immutable/versioned/hash-verified source-location wording were reconciled.

## Evidence verdict

The package correctly accepts only a bounded hackathon profile. It does not claim a full spike
pass, broad import/SMF fidelity, application-wide runtime proof, synthesis quality, reference-video
audio, exact take-video timing, Edge lifecycle recovery, full accessibility, representative
hardware, repeat soaks, or universal numeric budgets. Eight authoritative run IDs are retained;
all 170 evidence hashes were independently recomputed with zero missing or mismatched files.

## Architecture and dependency verdict

The one-authority and evidence-integrity invariants remain consistent across the PRD, checklist,
architecture plan, ADRs 0005-0007, timed-media research, and workspace boundary note. The accepted
adapter direction does not install alphaTab, add a runtime dependency, implement Practice System
code, or make existing placeholders functional.

Checklist Item 10, the renderer-independent canonical guitar model, is the next valid production
dependency. The disposable and historical branches remain evidence/reference sources and must not
be merged wholesale.

## Validation verdict

Formatting, lint, type checking, dependency policy, documentation/link/order/mojibake checks,
production build, alphaTab release-policy preflight, and `git diff --check` pass. The acceptance
package is ready to commit on the architecture branch and fast-forward into clean `main`.

After the evidence review, the full repository gate exposed two pre-existing validation defects
that were identical at baseline because the acceptance diff had not changed source, tests, or test
configuration: aggregate branch coverage was 77.95% against the 80% threshold, and the first cold
Playwright dynamic import could be invalidated when Vite discovered TensorFlow dependencies late.
The package now includes test-only coverage for existing review/HUD/transport/video behavior and a
dev/test optimizer include for the four already-installed TensorFlow packages. No production code,
runtime dependency, threshold, or coverage exclusion changed. The repaired suite passes 349 tests
with 80.30% branch coverage, and the model browser test passes from a forced cold optimizer without
retries.
