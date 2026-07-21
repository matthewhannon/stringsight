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

See `docs/plans/03-architecture-and-contracts.md` for the complete data flow and thread ownership model.
