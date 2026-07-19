# StringSight

StringSight is a local-first guitar-analysis web application. The current working product captures
guitar audio, detects monophonic notes, produces live ranked chord candidates from independent
chroma evidence, and finalizes polyphonic note sets locally with Spotify Basic Pitch. Planned
modules will add fretboard vision, scales, likely playing positions, and multimodal fusion.

The project is being built for OpenAI Build Week. See the
[current project status](docs/project-status.md), [build checklist](BUILD_CHECKLIST.md), and
[product requirements](docs/plans/01-product-requirements.md) for the implementation state and
first-release contract.

## Current status

Working now:

- Device-neutral microphone and audio-interface selection
- Local PCM capture, calibrated input metering, recording, and replay
- Local WAV import through the same replay and analysis interfaces
- Monophonic onset and pitch detection with confidence and ranked alternatives
- Dedicated-worker chroma analysis with ranked provisional chord candidates
- Worker-isolated Basic Pitch transcription with WASM-first execution and CPU fallback
- Finalized ranked note sets plus reconciled chord timelines
- Event timelines and reviewed private note/chord evaluation-fixture export
- A reusable realistic rack interface for product modules

Planned next:

- Private real-guitar chord evaluation and performance measurement
- Optional fretboard and hand-position vision
- Guitar-aware audio and vision fusion
- Scale, chord-voicing, and likely string/fret interpretation

## Requirements

- Node.js 24.18.0
- npm 11.16.0
- Current desktop Chrome or Edge for the supported application experience

The repository includes `.nvmrc` and `.node-version`. `package.json` also enforces the supported Node.js and npm major versions.

## Development

```sh
npm install
npm run dev
```

The application is available at `http://127.0.0.1:5173`.

The current audio-capture slice is available at `http://127.0.0.1:5173/#capture`. Microphone access is requested only after pressing **Start microphone**; raw PCM remains local to the browser.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm run dependencies:check
npm run corpus:validate
npm run evaluate:self-test
npm run test:coverage
npm run build
npm run test:e2e
```

Run the non-browser checks together with:

```sh
npm run verify
```

Install the Chromium test browser once before running the end-to-end suite locally:

```sh
npx playwright install chromium
```

## Source boundaries

- `src/app/`: application composition and user interface
- `src/ui/rack/`: reusable realistic rack frame, modules, controls, and design tokens
- `src/audio/`: implemented capture, transport, monophonic analysis, and provisional polyphonic chord analysis
- `src/vision/`: camera, fretboard, fret indexing, and hand-position evidence
- `src/fusion/`: multimodal time alignment and guitar-state inference
- `src/evaluation/`: versioned corpus schemas, deterministic metrics, and report generation
- `src/music/`: deterministic music theory and virtual fretboard logic
- `src/shared/`: versioned contracts, timing, errors, confidence, and provenance
- `src/workers/`: worker entry points and transport adapters
- `tests/fixtures/`: licensed, versioned evaluation inputs and ground truth
- `tests/e2e/`: supported browser workflows
- `docs/plans/`: focused implementation plans
- `docs/decisions/`: architecture decision records

Detailed boundaries and typed subsystem contracts are defined in checklist item 3.

## Evaluation corpus

Generate and validate the project-authored procedural corpus with:

```sh
npm run corpus:generate
npm run corpus:validate
npm run evaluate:self-test
```

The corpus contains separate development and held-out fixtures with licensed guitar-like WAV signals, paired fretboard frame sequences, ground truth, and a machine-readable harness report. Procedural results validate the engineering harness; they are not presented as real-world recognition accuracy. See the [evaluation plan](docs/plans/04-evaluation-corpus.md) for the metric and dataset policy.

Reviewed real-guitar recordings can remain in the ignored `.local/guitar-corpus/` directory and be
evaluated without entering the public repository:

```sh
npm run evaluate:private-guitar -- --manifest .local/guitar-corpus/corpus.local.json
```

See the [private recording corpus plan](docs/plans/06b-private-recording-corpus.md) for the manifest,
directory layout, validation rules, and privacy boundary.

## Privacy baseline

Raw microphone data stays on the device during normal operation. Webcam processing and remote
analysis are planned, not currently active. Any future remote feature will be optional and will use
minimized structured musical events rather than continuous raw media by default.

## License

StringSight is open source under the [MIT License](LICENSE). Production dependencies and the
attribution process are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and complete
notices ship with the application in `public/THIRD_PARTY_LICENSES.txt`. Models, fixtures, and user
recordings retain their separately recorded terms; private evaluation media is not part of the
open-source distribution. See
[ADR 0005](docs/decisions/0005-mit-open-source-and-license-policy.md) for the dependency and asset
policy.
