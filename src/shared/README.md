# Shared subsystem

This directory owns the stable boundaries that allow audio, vision, music, fusion, workers, persistence, and UI orchestration to evolve independently.

## Rules

- Public contracts are exported through `index.ts`.
- Persisted and cross-thread payloads use versioned Zod schemas.
- Prediction contracts contain ranked candidates, confidence, provenance, timing, and diagnostics.
- Session timestamps are monotonic milliseconds relative to one session origin.
- Binary buffers travel as transferables beside a validated message envelope.
- Shared code cannot import implementation code from another subsystem. ESLint enforces this direction.
- Contract changes require schema-version review and, for persisted data, a migration plan.

## Practice System foundations

`contracts/practice.ts` defines bounded, independently versioned Practice Document, evidence, take,
media, sync-map, and assessment boundaries without extending the observed microphone `Session`.
Practice Document v1 uses PPQ 960, half-open integer ranges, tick-zero ordered maps, canonical guitar
positions with derived pitch, and document-wide stable semantic IDs.

`contracts/practice-support.ts` and `contracts/practice-semantics.ts` own the frozen bounded support
profile, stable import-loss findings, and closed native semantic vocabulary. Opaque technique IDs are
not persisted. Relationship techniques name their target note; each string/note has its own sounding
duration.

`canonical-json.ts` and `practice-identity.ts` provide bounded deterministic canonical JSON,
domain-separated SHA-256 projections, qualified identities, and golden bytes/digests.
`contracts/practice-migration.ts` is the explicit native interchange/migration boundary; v1 is the
first supported Practice Document version, so no fictitious older schema is silently accepted.

These files are the Item 11 foundation, not its completion. Rich take discontinuity/media
provenance, assessment match records, import draft/report aggregates, cross-aggregate golden
fixtures, and final acceptance review remain open.

See `docs/plans/03-architecture-and-contracts.md` for the complete data flow and thread ownership model.
