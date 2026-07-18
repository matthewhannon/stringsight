# Third-party notices

StringSight depends on open-source software. This file records production dependencies distributed
with the application. Complete copyright and license text ships in
`public/THIRD_PARTY_LICENSES.txt`. Dependency versions and transitive details remain locked in
`package-lock.json`.

## Runtime dependencies

### `react`

- Project: React
- Version: 19.2.7
- Source: https://github.com/facebook/react
- License: MIT

### `react-dom`

- Project: React DOM
- Version: 19.2.7
- Source: https://github.com/facebook/react
- License: MIT

### `scheduler`

- Project: Scheduler
- Version: 0.27.0
- Source: https://github.com/facebook/react
- License: MIT

### `zod`

- Project: Zod
- Version: 4.4.3
- Source: https://github.com/colinhacks/zod
- License: MIT

## Maintenance process

When adding or updating a runtime dependency:

1. Verify its source, exact version, license, redistribution terms, and model/data terms where
   applicable.
2. Record every production package from the lock file in this file, including runtime transitives.
3. Add its complete required notices to `public/THIRD_PARTY_LICENSES.txt`.
4. Commit the updated `package-lock.json` and notices together.
5. Run `npm run dependencies:check`.
6. Record model assets separately in `public/models/README.md` with an exact version and checksum.

Development-only tools are recorded by `package-lock.json` and are not bundled into the production application. Their licenses must still be reviewed before adoption.

See `docs/decisions/0005-mit-open-source-and-license-policy.md` for the accepted license policy and
review triggers.
