# Evaluation Corpus and Measurement Harness

**Status:** Implemented foundation  
**Checklist item:** 4  
**Depends on:** Product requirements and versioned subsystem contracts

## Purpose

StringSight must be tuned against repeatable evidence rather than a favorable live demonstration. This plan defines the ground truth, fixture provenance, dataset split, metrics, and report format used to compare every audio, vision, and fusion implementation.

The first corpus is deterministic and project-authored. It creates guitar-like plucked signals and paired fretboard frame sequences with known answers. These fixtures test plumbing, edge cases, timing, and regression behavior without licensing ambiguity. They are not a substitute for real-guitar validation; consented real recordings will be added using the same manifest before an accuracy claim or release gate is accepted.

## Corpus layout

```text
tests/fixtures/
  corpus.v1.json              # Versioned source of truth
  LICENSE.md                  # Asset provenance and reuse terms
  audio/                      # Deterministically generated mono WAV files
  video/<fixture-id>/         # Ordered SVG frame sequences
  predictions/                # Versioned harness self-test predictions
  reports/                    # Machine-readable evaluation output
```

Generated media is reproducible with `npm run corpus:generate`. The committed manifest and generator version determine the asset bytes. Generated files are committed so browser tests and offline development never depend on a generation service.

## Ground-truth contract

Every fixture has the following required metadata:

- Stable identifier, corpus version, development or held-out split, and source/license record.
- Modalities and relative media paths.
- Recording conditions: guitar type, pickup or microphone profile, dynamics, noise condition, playing position, sample rate, frame rate, and image size where applicable.
- Note intervals with MIDI pitch, onset, offset, velocity, and optional string/fret position.
- Chord intervals with symbol and pitch classes.
- Onset timestamps, including chord attacks as a single onset.
- Visible/occupied fret regions over time, represented as inclusive start/end frets.
- Likely tablature positions where the synthetic performance has an unambiguous construction.

Times use the shared session-relative monotonic millisecond convention. Interval ends cannot precede starts. Development and held-out fixture identifiers may never overlap.

Prediction files are intentionally separate from ground truth. They contain detector outputs plus processing-latency samples and declare the algorithm/version that produced them. An evaluator must never modify or enrich ground truth based on a prediction.

## Initial fixture matrix

The deterministic corpus covers:

| Dimension      | Development                        | Held-out                               |
| -------------- | ---------------------------------- | -------------------------------------- |
| Content        | isolated notes, major chord, scale | minor chord, phrase                    |
| Guitar profile | steel acoustic, clean electric     | nylon acoustic, clean electric         |
| Input profile  | direct/near microphone             | room microphone, laptop microphone     |
| Dynamics       | soft, medium, loud                 | medium, loud                           |
| Noise          | quiet, deterministic room noise    | deterministic fan/room noise           |
| Neck position  | open/low, middle                   | middle, upper                          |
| Video          | straight, lit                      | perspective, dimmer, partial occlusion |

The held-out manifest is visible because this is an open repository, but tuning code must only use fixtures marked `development`. Metrics intended for product claims are reported separately for `held-out` and `all`; they must not be optimized fixture by fixture.

## Deterministic media generation

Audio uses additive synthesis shaped by a fast attack and exponential pluck decay. Each note contains a fundamental, guitar-like harmonic series, deterministic inharmonicity, and condition-dependent noise. Chords sum independently phased plucks before peak normalization. This exercises WAV transport, onset alignment, pitch/chroma logic, and polyphony while preserving exact truth.

Video fixtures are ordered SVG frames representing a perspective fretboard, fret wires, strings, inlay markers, and a simplified fretting-hand occlusion. Conditions vary brightness, perspective, occupied fret range, and occlusion. SVG is used for the initial fixture tier because it is deterministic, inspectable, compact, and browser-decodable. Real camera clips become a separate `recorded` source kind and will use WebM or lossless frame sequences.

The generator uses a fixed named seed. Changing synthesis or rendering behavior requires a new generator version and corpus version, not an in-place silent rewrite.

## Metrics

### Note events

Predicted and true notes are matched one-to-one when MIDI pitch is equal and onset distance is within the configured tolerance. The matcher chooses the smallest onset error first. Report precision, recall, F1, matched count, false positives, false negatives, and mean absolute onset error.

### Chords

At each ground-truth chord interval, the prediction with the greatest positive time overlap is selected. A match requires normalized chord symbols to agree. Report interval accuracy and counts. Pitch-class-set accuracy may be added later without replacing symbol accuracy.

### Onsets

One-to-one nearest matching is used within the configured tolerance. Report precision, recall, F1, matched count, and mean absolute timing error.

### Fret region

For timestamps with both a true and predicted fret interval, report mean and maximum absolute midpoint error in frets, mean interval intersection-over-union, and sample count. Missing predictions remain visible as coverage loss rather than silently becoming zero error.

### Fusion improvement

Report fused note F1 minus audio-only note F1 and fused fret midpoint error reduction versus the audio-only position estimate. Positive deltas mean improvement. Audio and fused predictions are scored independently against identical truth.

### Processing latency

Latency is measured from the latest source sample/frame timestamp required by an output to the monotonic timestamp when that output becomes available. Report count, mean, p50, p95, and maximum milliseconds. Live and finalized paths must use separate series.

## Report format

`evaluation-report.v1` JSON contains:

- Corpus and evaluator versions, generation time, prediction-system identity, and tolerances.
- Results grouped by development, held-out, and all fixtures.
- Aggregate note, chord, onset, fret, fusion, and latency metrics.
- Per-fixture metrics and diagnostics.
- Fixture counts and any exclusions with explicit reasons.

The checked-in initial report is a **harness self-test**, not an accuracy baseline. Its predictions are intentionally perturbed deterministic data used to prove that errors and fusion improvements are measured correctly. The first recognition baseline will be generated after the audio-only detector exists.

## Commands

```sh
npm run corpus:generate
npm run corpus:validate
npm run evaluate:self-test
npm run evaluate -- --predictions <prediction-file> --output <report-file>
```

Generation must be byte-stable on the supported Node version. Validation fails for schema errors, missing assets, duplicate identifiers, split leakage, unsupported corpus versions, or inconsistent timing.

## Test strategy

- Schema tests cover valid manifests and each cross-field invariant.
- Metric tests cover perfect, partial, duplicate, absent, and tolerance-boundary predictions.
- Report tests verify split isolation, aggregation, diagnostic preservation, and deterministic output aside from the explicit generation timestamp.
- Generator tests inspect WAV headers/duration and frame ordering rather than snapshotting large binary files.
- CI runs corpus validation and the evaluator self-test in addition to unit tests.

## Acceptance and limitations

This checklist item is complete when the manifest, deterministic media, validation, metrics, report generation, tests, and checked-in self-test report all work from a clean checkout.

The procedural corpus establishes engineering correctness, not real-world accuracy or demographic/environmental coverage. Before audio, vision, fusion, or release accuracy claims, the corpus must add consented and licensed real-guitar recordings covering the product-requirement variation matrix. Those additions do not require redesigning the evaluator.
