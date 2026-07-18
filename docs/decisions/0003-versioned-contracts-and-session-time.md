# ADR 0003: Versioned runtime contracts and monotonic session time

Status: Accepted  
Date: 2026-07-17

## Context

StringSight passes data among the main thread, audio worklets, several workers, persistence, fixture replay and an optional server. TypeScript types disappear at runtime, wall clocks can change, and each subsystem may evolve at a different rate.

## Decision

Use Zod schemas at cross-thread, persistence, import and server boundaries. Persist event times as monotonic milliseconds relative to a single session origin. Version worker protocols independently from persisted schemas. Record algorithm versions in provenance.

## Consequences

- Invalid messages fail at their boundary instead of contaminating downstream state.
- Contract changes require compatibility review.
- Audio and media clocks need explicit anchors into session time.
- Fixture replay can reproduce event timing without depending on wall-clock time.
- Validation has a measurable cost and should occur at boundaries, not repeatedly inside tight DSP loops.
