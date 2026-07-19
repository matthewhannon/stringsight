# Polyphonic Note and Chord Detection

**Status:** Complete; accepted with reviewed power-chord and inversion coverage
**Checklist item:** 7
**Depends on:** Audio capture and replay, shared prediction contracts, evaluation harness,
monophonic analysis

## Objective

Turn the same timestamped mono PCM used by the monophonic analyzer into ranked, time-aligned note
sets and chord candidates. Live results must arrive quickly and remain visibly provisional. A
higher-accuracy Basic Pitch pass may replace or revise them after enough audio is available or a
recording ends. Both paths stay local, run outside React and the audio worklet, preserve ambiguity,
and can be evaluated independently.

Item 7 does not infer guitar fingering. MIDI notes and pitch classes are measured audio evidence;
voicings and tablature remain later guitar-domain and fusion work.

## Research and selected architecture

### Basic Pitch

Spotify's Basic Pitch is a lightweight, instrument-agnostic automatic music transcription model.
It jointly predicts onsets, note activations, and pitch contours, supports polyphony, and is intended
to work best on one foreground instrument. The official implementation downmixes to mono and
resamples to 22,050 Hz. These properties fit StringSight's initial one-guitar scope.

The official TypeScript package is usable but has not released since `v1.0.1` on 2022-08-05. It
pins TensorFlow.js 3.x and includes `@tonejs/midi`, although StringSight needs neither its MIDI file
API nor an old runtime constraint. StringSight will therefore not import the package as an opaque
application dependency. It will adapt the small Apache-2.0 inference-window and post-processing
code behind a project-owned adapter, retain upstream attribution and modification notices, and load
the official model with an explicitly selected current TensorFlow.js backend. This keeps model
behavior reproducible while allowing the runtime to be updated and benchmarked separately.

The selected upstream model is:

- Repository: <https://github.com/spotify/basic-pitch-ts>
- Tag and commit: `v1.0.1`, `16d4c6a68e2c070726ba7c26a64c13eab4a434c4`
- Package: `@spotify/basic-pitch@1.0.1`, Apache-2.0
- Model graph: `model/model.json`, 174,537 bytes, SHA-256
  `1ED1AAEE3409EC1DC098C8B01F430C0911F6FE9412E7AF8086750F9E8F302F68`
- Model weights: `model/group1-shard1of1.bin`, 742,392 bytes, SHA-256
  `B142A95737A52E1E412D5F92E73D8BB80DFE8D04941ACC0702F11F4524FB377C`
- Published tarball: 599,714 bytes, SHA-256
  `8EFEE25E266E4A06BB2A8F3A86AD934179A2DB2845C1544A9B2E43B37A74A874`
- Input: float mono audio, shape `[batch, 43844, 1]`, 22,050 Hz
- Outputs per window: contours `[batch, 172, 264]`, frames `[batch, 172, 88]`, and onsets
  `[batch, 172, 88]`

The model uses two-second windows with a 7,680-sample overlap and removes half of the overlap from
each adjacent output. The effective hop is 36,164 samples, approximately 1.64 seconds. The adapter
will preserve these upstream constants and add tests around window timestamps and output trimming.

TensorFlow.js is preferred over converting this asset to ONNX for the first integration because
the official browser graph is already under 1 MiB and has a known output contract. ONNX Runtime Web
is maintained and offers WASM and WebGPU execution, but introducing a converted model would add a
second artifact whose numeric equivalence and supported operators must be established. It remains a
fallback if measured TensorFlow.js load, memory, or throughput misses the acceptance budgets.

References:

- [Basic Pitch paper](https://arxiv.org/abs/2203.09893)
- [Official Basic Pitch Python repository](https://github.com/spotify/basic-pitch)
- [Official Basic Pitch TypeScript repository](https://github.com/spotify/basic-pitch-ts)
- [TensorFlow.js browser backends, warmup, and memory guidance](https://www.tensorflow.org/js/guide/platform_environment)
- [ONNX Runtime Web overview](https://onnxruntime.ai/docs/tutorials/web/)

### Temporal decoding and guitar-spectrum preprocessing

Chord labels change far more slowly than audio-analysis frames. Treating every decoded note onset
or offset as a chord boundary over-segments a naturally decaying guitar strum. StringSight therefore
keeps note transcription and chord segmentation as related but separate tasks:

- The Basic Pitch adapter preserves upstream inferred-onset, reverse-onset, Melodia-energy, and
  adjacent-semitone suppression behavior.
- Frame/segment chord scores are decoded jointly with a Viterbi-style transition cost. A weak extra
  pitch must persist before a triad is promoted to a seventh chord.
- The live path uses causal change confirmation rather than switching after one 80 ms observation.
- Continuous acoustic chord spans provide final segmentation. Basic Pitch note sets contribute
  independent note evidence within those spans instead of using every MIDI onset/offset as a chord
  boundary.

The interface exposes two explicit profiles. **Accurate** is the default and uses more confirmation
and a larger transition cost; **Responsive** allows quicker provisional changes. Neither profile
changes the independent low-latency monophonic analyzer.

The production spectral frontend is tuned harmonic-suppressed/NNLS-style chroma: log-frequency
analysis, tuning estimation, spectral whitening, harmonic-template approximate transcription, and
separate bass and treble evidence. A simple EQ is insufficient because simultaneous guitar strings
share frequency bands and overlapping harmonics. Analysis-only band-limiting and attack/sustain
separation remove handling noise and reduce broadband pick-transient influence before the harmonic
frontend without altering capture PCM or the monophonic analyzer.

Primary references:

- [20 Years of Automatic Chord Recognition from Audio](https://archives.ismir.net/ismir2019/paper/000004.pdf)
- [Chord Recognition Using Duration-Explicit Hidden Markov Models](https://archives.ismir.net/ismir2012/paper/000445.pdf)
- [Approximate Note Transcription for the Improved Identification of Difficult Chords](https://webspace.eecs.qmul.ac.uk/s.e.dixon/pub/2010/Mauch-Dixon-ISMIR-2010.pdf)

#### Production frontend stage contract

The implemented pipeline is complete and inspectable. Its stages expose diagnostics and focused
tests; no stage is represented by an unexplained EQ preset or a single fixture-specific threshold.

1. **Analysis-only band limiting.** A stable Butterworth-style high-pass removes DC, handling noise,
   and energy below the supported guitar range. A low-pass attenuates pick/USB noise above the
   harmonics used by the note dictionary. Raw capture and monophonic PCM are untouched.
2. **Harmonic/percussive masking.** A short STFT history uses time- and frequency-axis median
   estimates to retain horizontally persistent harmonic energy and attenuate vertical broadband
   attacks. The transient ratio remains available for change timing rather than being discarded.
3. **Tuning estimation.** Weighted spectral peaks estimate a bounded cents offset. Log-frequency
   filter centers move to the measured tuning before pitch-class folding.
4. **Log-frequency whitening.** Three bins per semitone preserve sub-semitone tuning evidence.
   Running local mean/variance normalization reduces stationary timbre and spectral-envelope bias.
5. **Harmonic-note estimation.** A non-negative least-squares dictionary models each possible guitar
   note as a fundamental plus geometrically decaying harmonics. Note activations—not raw partials—
   feed pitch-class evidence.
6. **Bass and treble evidence.** Low-register activations form a separate bass profile for root and
   inversion reasoning. Treble/whole-range evidence determines chord quality without allowing a
   loud bass harmonic to masquerade as another chord tone.
7. **Multiple time scales.** Short observations locate real attacks and changes. Longer robustly
   pooled observations determine the harmonic label. Accurate and Responsive profiles change
   look-ahead/pooling, not the musical vocabulary or monophonic analyzer.

Personal open-G replays are retained as exploratory diagnostics only and are not promotion evidence
because their recording quality and labels have not been independently reviewed. Synthetic tests
cover tuning offsets, pick transients, true G-to-C changes, silence, and both analysis profiles. The
remaining promotion gates require a licensed or permitted reference collection with reviewed chord
labels, deliberate G5/G/G7/Gmaj7 examples, handling-noise fixtures, and batch accuracy/boundary
reporting on development and held-out splits assigned before tuning.

### Independent provisional evidence

Waiting for a complete Basic Pitch window would make the live chord display feel sluggish. A
project-owned deterministic path therefore computes chroma from short PCM windows and compares it
with explicit chord templates. This path is independent evidence rather than a relabeling of model
notes.

The production implementation applies a 55 Hz–5 kHz analysis-only band-pass, multi-frame
harmonic/percussive soft masks, bounded tuning estimation, three log-frequency bins per semitone,
local spectral whitening, and a 16-partial non-negative harmonic dictionary. Accurate mode pools
12,288 samples (768 ms at 16 kHz); Responsive mode pools 6,144 samples (384 ms). The last two STFT
frames locate changes while the longer pool determines the label. Tests cover silence, explicit
layout validation, detuning, broadband pick attacks, genuine chord changes, bass/treble evidence,
and the profile latency/confirmation distinction.

This deliberately bounded vocabulary matches the existing shared chord qualities: major, minor,
dominant seventh, major seventh, minor seventh, suspended second, suspended fourth, diminished,
power, and unknown. Enharmonic naming and contextual music theory remain Item 8.

## Contracts

Add a `note-set` audio event rather than overloading monophonic `note` events:

- A note-set candidate contains two to six unique MIDI notes, per-note confidence, onset/frame
  evidence, a set confidence and score, and a sequential rank.
- A note-set event has a stable ID, time range, lifecycle, diagnostics, and polyphonic provenance.
- Chord candidates continue to carry root, optional bass, quality, symbol, pitch classes,
  confidence, score, and rank. Their diagnostics identify chroma-only, model-only, or combined
  evidence.
- Worker messages include a run ID. Controllers reject results from an earlier microphone or replay
  run, as the monophonic path already does.

Evaluation predictions gain ranked chord candidates and note-set predictions without removing the
existing flat note and top-chord fields. This is a backward-compatible schema extension at version
1; a schema-version increment is required only when existing serialized fields change meaning or
become invalid.

## Processing paths

### Live provisional path

1. A dedicated polyphonic controller subscribes to the same capture chunks as the recording and
   monophonic controllers. It copies only its own transferable buffer.
2. The polyphonic worker keeps a bounded PCM ring buffer and resamples its analysis branch.
3. Every 80 ms, once the selected evidence window exists, the analyzer emits tuned harmonic chroma
   and ranked chord candidates. Accurate pools 768 ms; Responsive pools 384 ms.
4. Adjacent provisional frames reuse stable event IDs. Accurate mode requires four matching
   challenger frames before changing chord; Responsive mode requires two.
5. Silence closes the current event. Discontinuity resets all spectral and reconciliation state.

### Basic Pitch finalized path

1. Model loading, backend selection, warmup, inference, and tensor disposal occur in the dedicated
   polyphonic worker. The UI receives progress and recoverable failure states.
2. PCM is resampled to 22,050 Hz and divided into the official overlapping windows. Live inference
   may run no more often than each completed model hop; replay/finalization drains all windows.
3. Adapted upstream post-processing converts frame/onset tensors into MIDI note intervals. Thresholds
   are versioned configuration, never hidden constants in UI code.
4. The reconciler trims window margins, merges duplicate same-pitch intervals across overlaps,
   preserves re-articulations with distinct onsets, and resolves contradictory revisions by score
   and lifecycle.
5. Simultaneous active notes remain note-set evidence, but their individual start/end boundaries do
   not become chord boundaries. The continuous acoustic frontend supplies the spans.
6. Finalized candidates fuse 70% acoustic chord evidence with 30% Basic Pitch note-set evidence
   inside each span. Stable provisional identities are retained one-to-one and finalized in place.

Model unavailability must not disable the provisional chroma path. The worker reports the selected
backend, model version, load/warmup/inference timings, rolling maximum memory when available, and
whether output is provisional or finalized.

## Model distribution and update procedure

Before the model enters `public/models/basic-pitch/`:

1. Copy only the two files from the exact upstream tag above.
2. Verify both SHA-256 hashes and expected byte sizes.
3. Record them in `public/models/README.md` with source, license, input/output contract, and this
   update procedure.
4. Add the Apache-2.0 license, Spotify attribution, and prominent notices for adapted source to
   repository and deployed third-party notices.
5. Pin the selected TensorFlow.js packages in `package-lock.json` and include every production
   package in both notice inventories.
6. Run numeric parity fixtures against the unmodified upstream package before accepting an update.
7. Measure compressed production bundle size, first model load, warm load, p50/p95 inference,
   throughput, and memory in supported Chrome and Edge.

An upstream version change is not a routine package bump. Different model bytes, tensor names,
window constants, or post-processing behavior require a new evaluation baseline.

## Evaluation

Automated fixtures include generated major, minor, seventh, suspended, power, diminished, inversion,
omitted-tone, doubled-tone, arpeggiated, detuned, noisy, and silence cases. The private corpus gains
separate chord recordings only after the deterministic path is stable; private media and labels
remain ignored and are never uploaded.

Metrics are reported separately for provisional and finalized output:

- Note precision, recall, F1, onset error, offset error, and frame overlap.
- Exact MIDI-set accuracy, pitch-class-set accuracy, and top-3 set recall.
- Top-1 chord symbol accuracy, top-3 chord recall, root accuracy, and no-chord false-positive rate.
- Reconciliation duplicates, contradictory revisions, and provisional-to-finalized improvement.
- Label changes per held-chord minute, over-segmentation ratio, spurious-chord duration, and chord
  boundary F1.
- Model download size, cold/warm startup, p50/p95 processing latency, real-time factor, peak worker
  memory where the browser exposes it, and dropped chunks.

### Current private regression result

The permitted 19-chord sequence has user-confirmed chord order and automatically proposed silence
boundaries. It is a focused development regression input, not held-out or universal accuracy
evidence. Analyzer version 0.3.0 adds short-window activity hysteresis, decay-time challenger
suppression, continuous root/bass evidence, template coverage, evidence-aware seventh scoring, and
an extension-register reliability check that distinguishes low-position chord tones from isolated
high-register overtone evidence.

| Metric                      |      Accurate |    Responsive |
| --------------------------- | ------------: | ------------: |
| Top-1 chord accuracy        |         89.5% |         89.5% |
| Top-3 recall                |         94.7% |         94.7% |
| Total finalized events      |            20 |            25 |
| Silence-only events         |             2 |             2 |
| Active fragmentation        |         0.95x |         1.21x |
| Boundary precision / recall | 90.0% / 94.7% | 72.0% / 94.7% |
| Real-time factor            |         0.632 |         0.208 |

The register check removes the decay-dependent `Bm -> Bm7` Accurate error without regressing the
Responsive chord result. The remaining structured errors are `Dm -> Dm7` and `Am7 -> Em7`; the
Am7 observation has almost no independent A-root or A-bass evidence. Item 7 remains open until the
broader note/onset/memory acceptance matrix and reviewed power-chord/inversion coverage are also
reported.

### Public finalized-model acceptance matrix

`npm run evaluate:polyphonic-browser` runs the real pinned model in Chromium against the public
C-major development fixture and A-minor held-out fixture, evaluates the full finalized path against
the provisional acoustic path, and writes an ignored machine-readable report to
`.local/evaluation/polyphonic-browser-baseline.local.json`.

| Metric                        | Development C | Held-out Am |    Combined |
| ----------------------------- | ------------: | ----------: | ----------: |
| Finalized note F1             |          100% |        100% |        100% |
| Exact MIDI-set top-1          |          100% |          0% |         50% |
| Pitch-class-set top-1 / top-3 |   100% / 100% | 100% / 100% | 100% / 100% |
| Onset F1                      |          100% |        100% |        100% |
| Finalized chord top-1 / top-3 |   100% / 100% | 100% / 100% | 100% / 100% |

Finalization improves combined chord top-1 from 50% provisional to 100% and adds the note/set output
the provisional path intentionally does not emit. The held-out exact-MIDI miss is reported rather
than hidden: Basic Pitch finds all four Am notes, but the doubled A3 ends early enough that the
longest note-set segment contains A2, E3, and C4. Pitch-class and chord identity remain correct.

On the current Chromium/WASM run, model load plus warmup was 133 ms, inference was 76-78 ms per
1.4-1.5 s fixture (maximum model real-time factor 0.056), and deterministic acoustic analysis was
0.243-0.265x real time. The pinned model is 916,929 bytes; the three packaged WASM runtime variants
total 1,171,360 bytes. Chromium exposed a sampled 56.8 MB JavaScript heap value, but this is not
total worker/process or WASM memory, so the report preserves that scope instead of calling it a
complete peak-memory measurement.

The decoder now rejects note blips of seven frames or fewer (about 81 ms) by default while retaining
an explicit shorter-note option. This removed a transient G harmonic from the C fixture; finalized
note-set provenance is `1.0.1-stringsight.2`.

### Reviewed power-chord and inversion acceptance

A second private recording covers root-position C and G controls, C/E and G/B inversions, E5, A5,
G5, B5, Dm, and Dm7. The user confirmed the requested order and clean performance. FFmpeg silence
detection at -30 dB with at least 800 ms of silence produced exactly ten non-overlapping sounding
regions; the exact millisecond boundaries remain automatically proposed rather than manually
auditioned.

| Metric                  | Accurate | Responsive |
| ----------------------- | -------: | ---------: |
| Overall chord top-1     |    70.0% |      80.0% |
| Overall chord top-3     |   100.0% |     100.0% |
| Inversion chord top-1   |      2/2 |        2/2 |
| Inversion bass accuracy |      2/2 |        2/2 |
| Power-chord top-1       |      1/4 |        2/4 |
| Power-chord top-3       |      4/4 |        4/4 |
| Active fragmentation    |    1.10x |      1.10x |
| Real-time factor        |    0.619 |      0.206 |

Both profiles distinguish the independently recorded Dm and Dm7 at top-1. The power-chord ranking
retains honest ambiguity among bare-fifth, suspended, and major interpretations while placing every
requested power chord in the top three. No fixture-specific ranking change is warranted. Combined
with the public finalized-model matrix, measured runtime/model sizes, browser heap sample with its
documented scope, live/import equivalence coverage, and existing decay/reconciliation regressions,
this completes the Item 7 acceptance matrix.

## Acceptance budgets

The first supported desktop Chrome/Edge implementation is accepted when:

- The provisional deterministic path emits an update within 120 ms after its required analysis
  window is available and does not emit a chord during the silence fixtures.
- Generated clean triads achieve at least 95% top-1 chord accuracy and the expanded noisy/detuned
  generated suite achieves at least 90% top-3 recall.
- Finalized Basic Pitch notes reach at least 90% note F1 and 95% top-3 pitch-class-set recall on the
  development chord corpus; held-out results are reported without tuning to them.
- Finalized chord top-1 accuracy is not worse than the provisional path and improves at least one of
  note F1, set recall, or chord accuracy on the full development suite.
- Duplicate reconciliation produces no duplicate same-pitch event at an overlap boundary in its
  regression fixtures and preserves deliberate repeated attacks.
- Warm finalized analysis is at least real time (`real-time factor <= 1.0`) on the supported test
  machine, model plus runtime sizes are recorded, and normal playback/capture produces no sustained
  dropped analysis chunks.
- Live and imported WAV paths produce equivalent finalized events for the same PCM input.
- One open G strum and natural decay produces one finalized G event without G7/Gmaj7/Em7 fragments;
  deliberate G7 and Gmaj7 voicings remain distinguishable.
- A reviewed private-guitar run covers at least open-position major/minor/power chords and one
  inversion before Item 7 is marked complete.

## Delivery sequence

1. Extend shared and evaluation contracts and their metrics with compatibility tests.
2. Implement and benchmark the deterministic chroma, chord-template, temporal smoothing, and
   reconciliation path without new runtime dependencies.
3. Add the dedicated worker/controller and rack module, preserving the monophonic worker.
4. Add the exact Basic Pitch model, current modular TensorFlow.js runtime, adapted inference and
   post-processing, parity fixtures, notices, and model inventory.
5. Generate the public chord corpus, run private guitar capture, tune only on the development split,
   record held-out/performance results, and then close Item 7.
