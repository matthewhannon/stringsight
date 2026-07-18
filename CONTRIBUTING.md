# Contributing to StringSight

Thank you for helping improve StringSight.

By submitting a contribution, you represent that you have the right to submit it and agree that it
may be distributed under the repository's [MIT License](LICENSE). Do not submit confidential code,
private recordings, personal data, or material copied from a source whose terms are incompatible
with this repository.

New runtime packages, model files, fixtures, fonts, icons, or other third-party assets must include
their source, version, license, and required attribution. Model files also require a cryptographic
checksum. Recordings labeled `private-evaluation-only` must remain outside the repository.

Keep handoffs, generated specifications, scratch notes, and temporary implementation artifacts out
of Git. Use the ignored `.local/`, `notes/`, `scratch/`, `specs/`, `temp/`, `tmp/`, `docs/_drafts/`,
or `docs/_local/` directories, or an ignored `.local.md`, `.draft.md`, `.notes.md`, `.spec.md`, or
`.tmp.md` suffix. Promote only deliberately reviewed, durable documentation into tracked `docs/`
locations such as `docs/plans/`, `docs/decisions/`, and `docs/verification/`.

Before submitting a change, run:

```sh
npm run verify
npm run test:e2e
```

See [ADR 0005](docs/decisions/0005-mit-open-source-and-license-policy.md) for the complete license
policy.
