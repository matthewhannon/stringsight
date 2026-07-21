# Item 13 notation, score-import, and authored-MIDI independent review

**Status:** PASS
**Date:** 2026-07-20
**Scope:** Checklist Item 13 and the visible canonical score integration

## Accepted implementation

- The visible Practice Workspace creates and edits the renderer-independent `PracticeDocument`,
  keeps semantic focus through undo, redo, notation reflow, and view changes, and exposes the same
  authored truth as a keyboard-navigable score outline.
- alphaTab 1.8.4 is dynamically loaded behind a StringSight adapter. Player mode is disabled,
  `soundFont` is null, no alphaSynth instance or audio element is created, and no third-party score
  or bounds graph crosses the adapter boundary.
- Event, note, tick, staff-system, and page-presentation mappings are bounded and ephemeral. Page
  grouping uses real staff-system bounds and inserts visible breaks only between systems;
  continuous geometry has no page identity. Four bars per row is a presentation default.
- Exact GP8 basic is the only reviewable guitar-aware route. GP5 effects is parsing-only without a
  draft; GP7 effects and both retained MusicXML profiles are rejected with explicit per-property
  dispositions.
- Raw SMF is preflighted before conversion with exact byte/event inventory. Only the declared
  Type-1/480-PPQ fixture is reviewable, and its guitar positions are labelled suggestions rather
  than original string/fret truth.
- Authored-document MIDI export has a distinct purpose/type boundary from observed-session export
  and explicitly classifies every preserved, converted, approximated, dropped, unsupported, or
  blocking authored field.
- Import candidates remain draft-plus-report bundles. The active document is preserved through
  rejection, cancellation, errors, and review; acceptance re-verifies all identities before
  creating fresh unsaved canonical editor history.

## Review findings resolved

Independent agents found and verified fixes for relation retargeting, fabricated page/system
indexes, horizontal endless-row flow, inexact tempo/duration projection, stale renderer cleanup,
real bounds coverage, caller-owned byte mutation, size-before-hash order, truthful elapsed/output
accounting, incomplete semantic dispositions, metadata identity collisions, cancellation during
lazy parser loading, and simultaneous resource-limit reporting.

The final independent notation review found no blocker after real Chromium coverage rendered a
two-track, two-voice, nine-bar chord document with 36 event mappings and 108 finite geometry
entries. The final import review found no blocker after re-probing simultaneous GP8 output/time
limits and cancellation immediately before the synchronous parser boundary.

## Release and product truthfulness

- The MPL source bundle is deterministic and sanitized: 2,521 exact retained members and 30
  declared bank/audio exclusions. The release checker validates every member, exact dependency and
  font identities, notices, SBOM, legal link, unsafe archive shapes, and absence of bank payloads.
- The score surface uses neutral StringSight copy; alphaTab identity and source access remain in the
  versioned Open-source notices surface rather than product chrome.
- Fake playback, seeking, markers, loop, metronome, count-in, tempo, video, assessment, and MIDI
  visualization affordances were removed. Microphone-disconnected state has one real Connect
  action, drawers share one pattern, Import and Export are separate actions, and document state is
  one passive `Working copy — not saved` message.

## Retained boundaries

- Pagination is StringSight viewport presentation, not print/PDF pagination.
- Inexact tempo, per-note sounding duration, cross-bar timing, and unsupported relation topologies
  are explicitly rejected rather than approximated.
- The exact score parser is synchronous; elapsed time and cancellation are checked immediately
  before and after it, but it cannot be preempted mid-call. Declared SMF import is bounded and uses
  UI stale-result suppression rather than a cooperative `AbortSignal`.
- Real renderer evidence targets Chromium on Windows. Broader browsers, authoritative transport,
  shared audio runtime, persistence, timed video, alignment, and assessment retain their later
  checklist gates.

## Verification

- Repository formatting, lint, typecheck, dependency/license, documentation, corpus, evaluation,
  coverage, production build, and hardened release-policy checks pass.
- Notation: 33 unit tests and two real Chromium tests pass.
- Importing: 25 focused adapter tests pass; the final cross-layer acceptance probe runs 51 tests.
- The full Vitest suite and coverage gate pass; exact totals are recorded by the accepted commit's
  `npm run verify` output.
