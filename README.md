# StringSight

StringSight is a local-first guitar pitch and chord monitor presented as a compact audio rack. Select
a microphone or audio-interface input, switch the input on, and get immediate signal, note, tuning,
and chord feedback without sending raw audio to a server.

The project is being built for OpenAI Build Week. See the
[current project status](docs/project-status.md), [build checklist](BUILD_CHECKLIST.md), and
[product requirements](docs/plans/01-product-requirements.md) for the implementation state and
first-release contract.

## Built with Codex and GPT-5.6

StringSight was developed end to end with **OpenAI Codex and GPT-5.6** as the primary AI engineering
collaborator. The project owner supplied the product direction, guitar and music context, priorities,
design feedback, and final acceptance decisions; Codex worked directly in the repository and running
application to turn that direction into a tested release.

Codex and GPT-5.6 were used throughout the project to:

- Explore the codebase and translate product ideas into implementation plans and typed architecture
- Build and refine the React rack interface, Web Audio pipeline, analysis workers, and music logic
- Debug live microphone, device-selection, pitch, chord, layout, and browser behavior
- Delegate independent audits and focused implementation tasks to parallel agents
- Create and maintain unit, integration, evaluation, and Playwright browser tests
- Run formatting, linting, type checking, coverage, evaluation, and production-build verification
- Manage experimental branches, commits, release cleanup, GitHub publishing, and documentation

Codex and GPT-5.6 were development tools for the entire project, not runtime dependencies of the
shipped application. StringSight does not call an OpenAI API while monitoring; pitch and chord audio
processing runs locally in the browser.

## What the MVP can do

The default workspace opens with only the **Audio Input** rack module. It provides:

- System-default and named microphone/audio-interface selection
- Live input waveform, calibrated level meter, signal indicator, and clipping indicator
- At-a-glance single-note monitoring with tuning offset
- At-a-glance live chord monitoring
- Local mode, active device sample rate, and analyzer version in the module header
- Browser-local audio processing and an explicit privacy status

Use **+ Add module** to open either focused analysis view:

- **Pitch analysis** shows the detected note, cents offset, detected and target frequencies, and a
  tuning meter. Analysis details reveal diagnostics and recent-note history only when needed.
- **Chord analysis** shows the leading chord candidate, match strength, and a 12-note pitch-class
  spread by default. Analysis details swap in chord quality, bass, ranked alternatives, processing
  diagnostics, and a bounded chord timeline.

Pitch and chord analysis can be shown independently or together. Once both are installed, the add
control is hidden because the MVP has no additional user-facing modules. **Edit rack** can reorder or
remove them, and the chosen layout is retained locally.

The chord analyzer uses the accurate profile by default. Development-only evaluation and session
review implementations remain in the source tree but are intentionally hidden from the product UI.

## Setup

Requirements:

- Node.js 24.18.0
- npm 11.16.0
- Current desktop Chrome or Edge for the supported application experience

Clone, install, and start the development server:

```sh
git clone https://github.com/matthewhannon/stringsight.git
cd stringsight
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`, choose a source, and press **Input**. Some browsers reveal full device
names only after microphone permission has been granted. Add Pitch analysis, Chord analysis, or both
for the amount of detail you want while playing.

The repository includes `.nvmrc` and `.node-version`. `package.json` also enforces the supported
Node.js and npm major versions.

## Development

The rack is also available directly at `http://127.0.0.1:5173/#capture`. Microphone access is
requested only after pressing **Input**; raw PCM remains local to the browser.

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

Raw microphone data stays on the device during normal operation. Webcam processing, fretboard
vision, and remote analysis are not part of the current MVP.

## License

StringSight is open source under the [MIT License](LICENSE). Production dependencies and the
attribution process are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and complete
notices ship with the application in `public/THIRD_PARTY_LICENSES.txt`. Models, fixtures, and user
recordings retain their separately recorded terms; private evaluation media is not part of the
open-source distribution. See
[ADR 0005](docs/decisions/0005-mit-open-source-and-license-policy.md) for the dependency and asset
policy.
