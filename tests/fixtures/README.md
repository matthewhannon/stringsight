# Evaluation fixtures

This directory contains StringSight's versioned evaluation corpus. `corpus.v1.json` is the source of truth; generated media must not be used without its corresponding manifest annotations.

## Fixture tiers

- `procedural`: project-authored, deterministic guitar-like WAV files and SVG frame sequences. These verify timing, transport, evaluation logic, and regression behavior.
- `recorded`: consented real-guitar media with explicit provenance and license metadata. This tier will support product accuracy claims once recognition pipelines exist.

Every fixture records its source and license, relevant conditions, ground truth, development or held-out split, and known limitations. Do not commit personal recordings or third-party media without explicit permission and a documented license.

## Commands

```sh
npm run corpus:generate
npm run corpus:validate
npm run evaluate:self-test
npm run benchmark:monophonic -- --iterations 20
```

See `docs/plans/04-evaluation-corpus.md` for annotation semantics, metrics, split policy, and acceptance criteria.
The local performance report is machine-dependent and ignored by Git. Real-guitar WAV and fixture
exports remain private until their owner explicitly approves project use.
