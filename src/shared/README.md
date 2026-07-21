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
`contracts/practice-migration.ts` and `contracts/practice-aggregate-migration.ts` are the explicit
native interchange and durable aggregate migration boundaries; v1 is the first supported version,
so no fictitious older schema is silently accepted.

`contracts/practice-import.ts`, `practice-sync.ts`, `practice-import-integrity.ts`, and
`practice-integrity.ts` complete the bounded import, piecewise synchronization, trusted import, and
cross-aggregate integrity seams. Item 11 is accepted; editor commands and native editing workflows
begin in Item 12.

See `docs/plans/03-architecture-and-contracts.md` for the complete data flow and thread ownership model.
