# ADR 0009: Practice contract time and content identity

- **Status:** Proposed
- **Date:** 2026-07-20
- **Architecture:** `../plans/10-practice-system-architecture.md#4-canonical-domain-model`

## Context

Checklist Item 11 establishes the durable contracts that later editor, import, transport,
persistence, take, media, and assessment implementations will reference. A contract version cannot
permit multiple implicit tick grids or bare digests whose schema and projection are unknown.
Canonicalization also needs resource boundaries because imported or persisted input is untrusted.

The Practice System aggregates remain independent: authored documents/revisions, observed evidence
snapshots, immutable takes, media identity and mutable availability, reference/take sync maps, and
derived assessments cannot mutate or substitute for one another.

## Proposed decision

### Musical time

Practice Document contract v1 fixes `ppq` to 960 integer ticks per quarter note. Persisted musical
ranges are non-empty and half-open. Tempo, meter, and key maps start at tick zero and have strictly
increasing unique ticks. Practice speed remains a runtime rational multiplier and never rewrites
authored ticks or tempo.

Changing PPQ requires a new document contract version and an explicit migration. It is not a
per-document preference.

### Canonical JSON

Use `stringsight-canonical-json/v1` for the bounded JSON data domain. It sorts object keys by their
JavaScript string order, preserves array order, normalizes negative zero to zero, uses JSON string
escaping, and encodes the result as UTF-8. It rejects undefined, bigint, functions, symbols,
non-finite numbers, accessors, hidden or symbol properties, sparse/extended arrays, non-plain
objects, and cycles rather than applying implicit `toJSON` or coercion.

The implementation enforces exported depth, node, key, string, object-property, array-length, and
qualifier limits. Limit and data-domain errors have stable codes and JSON-pointer paths.

### Qualified hashes and projections

Every durable digest is SHA-256 over a domain-separated canonical envelope. The externally stored
identity contains all of:

```text
algorithm = sha256
canonicalizationId = stringsight-canonical-json
canonicalizationVersion = 1
schemaId + schemaVersion
projectionId + projectionVersion
digestHex
```

No bare digest is accepted. A frozen projection registry owns materializers and exclusion rules for
document content, expected events, revision identity, observed evidence, take core, media identity,
both sync-map kinds, and assessment. Self-hash fields are excluded from their own projection. The
take-core projection does not gain an outward mutable attachment/map link.

Golden canonical bytes and digests cover real Practice Document expected-event and media-identity
projections. Projection changes require a projection-version change and new goldens.

### Initial migration boundary

Practice Document v1 is the first supported version. The migration registry currently validates and
deep-detaches v1 with a deterministic trace and rejects missing, malformed, unsupported legacy, and
future versions. No fictitious v0 is invented. Every newly supported historical version must add a
fixture-backed route to the then-current version.

## Consequences

- Editor and persistence code can reference stable integer time and qualified content identity.
- Exact MIDI and expected-event projections remain derived from canonical guitar coordinates.
- Import or storage payloads cannot trigger unbounded canonical traversal within the declared
  limits.
- Independent aggregate schemas may evolve separately while hashes still name their exact domain.
- This ADR remains Proposed until the remaining Item 11 take, assessment, import-report, and
  cross-aggregate fixtures pass independent review.
