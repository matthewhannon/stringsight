# Checklist Item 10 canonical guitar model independent review

- **Date:** 2026-07-20
- **Branch:** `codex/canonical-guitar-model`
- **Verdict:** PASS
- **Scope:** Renderer-independent guitar coordinates, mapping, enumeration, fingering, transition
  cost, validation, tests, and ADR

## Review method

Three independent read-only reviews examined the public API, coordinate semantics, enumeration
algorithms, fingering legality, transition policy, boundary behavior, tests, and documentation. One
review used an independent capoed three-string brute-force oracle with alternate tuning. It found no
exact-MIDI or pitch-class enumeration mismatch across 63 small-neck states. Reviewers also ran
focused type checking, linting, and the guitar-domain suite.

## Findings resolved

The first implementation was not accepted. Review found and the implementation corrected:

- repeated exact MIDI occurrences explored redundant permutations;
- broad pitch-class and fingering searches had no resource boundary;
- barres could cross a lower or independently fingered equal-fret intermediate string;
- release plus replacement could erase the cost of long physical movement;
- equal-cost transition breakdowns depended on input order;
- missing/non-finite policy values and invalid pitch classes were not consistently rejected;
- structurally forged definitions and voicings could bypass derived-pitch validation; and
- malformed over-cardinality queries could return before validating their contents.

The accepted implementation groups exact MIDI multiplicities, uses deterministic complete-or-error
node budgets with no partial results, canonicalizes fingering and transition input, validates barres
and policy terms, requires constructor-created guitar definitions, re-derives fingering locations,
and uses maximum-cardinality contact matching before minimum transition cost.

## Accepted boundary

The canonical writable coordinate is string number plus capo-relative tab fret. Physical fret, MIDI,
pitch class, and ideal fret geometry are derived. Exact MIDI multisets and pitch-class chord
specifications use separate APIs. Fingering suggestions do not remove valid voicings. The v1
transition scalar is a deterministic contact-effort lower bound, not probability or observed player
fingering. Partial capos, paired courses, microtonal temperaments, bends, harmonics, and compensation
remain outside this version.

## Verification

- Focused guitar tests: PASS.
- Independent small-neck enumeration oracle: PASS with zero mismatches.
- TypeScript and ESLint review gates: PASS.
- Repository `npm run verify`: PASS, including coverage, build, dependency, documentation,
  evaluation, corpus, and release-policy checks.
- Public Playwright workflow: PASS; private-corpus test remains an expected skip without the private
  fixture directory.

No blocking finding remains. Checklist Item 11 may now depend on this model through
`src/music/index.ts` without importing renderer, UI, audio-runtime, or media state.
