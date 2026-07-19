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

### `@tensorflow/tfjs-backend-cpu`

- Project: TensorFlow.js CPU backend
- Version: 4.22.0
- Source: https://github.com/tensorflow/tfjs
- License: Apache-2.0

### `@tensorflow/tfjs-backend-wasm`

- Project: TensorFlow.js WebAssembly backend
- Version: 4.22.0
- Source: https://github.com/tensorflow/tfjs
- License: Apache-2.0

### `@tensorflow/tfjs-converter`

- Project: TensorFlow.js model converter runtime
- Version: 4.22.0
- Source: https://github.com/tensorflow/tfjs
- License: Apache-2.0

### `@tensorflow/tfjs-core`

- Project: TensorFlow.js Core
- Version: 4.22.0
- Source: https://github.com/tensorflow/tfjs
- License: Apache-2.0

### `@types/emscripten`

- Project: Emscripten type definitions
- Version: 0.0.34
- Source: https://github.com/DefinitelyTyped/DefinitelyTyped
- License: MIT

### `@types/long`

- Project: long type definitions
- Version: 4.0.2
- Source: https://github.com/DefinitelyTyped/DefinitelyTyped
- License: MIT

### `@types/offscreencanvas`

- Project: OffscreenCanvas type definitions
- Version: 2019.7.3
- Source: https://github.com/DefinitelyTyped/DefinitelyTyped
- License: MIT

### `@types/seedrandom`

- Project: seedrandom type definitions
- Version: 2.4.34
- Source: https://github.com/DefinitelyTyped/DefinitelyTyped
- License: MIT

### `@webgpu/types`

- Project: WebGPU type definitions
- Version: 0.1.38
- Source: https://github.com/gpuweb/types
- License: BSD-3-Clause

### `long`

- Project: long.js
- Version: 4.0.0
- Source: https://github.com/dcodeIO/long.js
- License: Apache-2.0

### `node-fetch`

- Project: node-fetch
- Version: 2.6.13
- Source: https://github.com/node-fetch/node-fetch
- License: MIT

### `node-fetch/node_modules/tr46`

- Project: tr46
- Version: 0.0.3
- Source: https://github.com/Sebmaster/tr46.js
- License: MIT

### `node-fetch/node_modules/webidl-conversions`

- Project: webidl-conversions
- Version: 3.0.1
- Source: https://github.com/jsdom/webidl-conversions
- License: BSD-2-Clause

### `node-fetch/node_modules/whatwg-url`

- Project: whatwg-url
- Version: 5.0.0
- Source: https://github.com/jsdom/whatwg-url
- License: MIT

### `seedrandom`

- Project: seedrandom
- Version: 3.0.5
- Source: https://github.com/davidbau/seedrandom
- License: MIT

## Model assets and adapted source

### Spotify Basic Pitch

- Version: `v1.0.1`, commit `16d4c6a68e2c070726ba7c26a64c13eab4a434c4`
- Source: https://github.com/spotify/basic-pitch-ts
- License: Apache-2.0
- Distributed files and checksums: `public/models/README.md`
- Copyright 2022 Spotify AB

StringSight adapts the upstream inference-window and note-decoding behavior. Adapted files retain
Spotify's copyright and Apache-2.0 header and identify StringSight modifications.

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
