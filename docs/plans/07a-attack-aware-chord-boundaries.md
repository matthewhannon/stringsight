# Attack-aware chord boundaries

Status: Phases 1-3 implemented July 19, 2026. Phase 4 is implemented behind the production
promotion boundary but is not yet the normal finalization path because it failed the continuous
transition fragmentation gate.

## Outcome

Chord segmentation must distinguish four general behaviors without chord-name, guitar, recording,
or user-specific rules:

1. A ringing chord decays without a new attack: retain the chord.
2. The same chord is strummed again: reinforce and extend the chord without creating a new span.
3. A different chord is strummed: create a boundary when the attack is followed by a stable
   harmonic change.
4. A soft or legato harmonic change has no strong attack: create a boundary only after stronger,
   longer harmonic confirmation.

Attack evidence is neither required nor sufficient by itself. Handling noise can create an attack
without a chord change, while a real legato change can occur without a strong attack. The decoder
must model attack timing and harmonic change as separate evidence axes.

## Why the current structure cannot solve this reliably

- `transientRatio` is averaged across the full 384/768 ms harmonic window. It is a useful
  diagnostic but not a time-localized onset detector.
- `changeValues` is recent chroma pooled from the last two overlapping spectral frames. It is not
  an actual distance or change measurement.
- The live analyzer polls labels from overlapping long and short windows and retains only chord
  spans, not the per-hop evidence that produced them.
- One `push()` can contain multiple analysis hops, but the current implementation analyzes only the
  latest window and discards intermediate hop positions.
- Final fusion creates one observation per acoustic span. If live analysis merges two played
  chords, the post-Stop decoder has no internal observations from which to recover the boundary.
- The current temporal decoder has a constant label-change cost, so it cannot distinguish a
  supported strum/change boundary from decay-driven loss of upper tones.

This work is therefore a frame-retention and decoder change, not another threshold in the existing
span switcher.

## Internal evidence contracts

High-rate observations remain internal to the polyphonic worker. They are not added to the shared
`ChordEvent` contract and are not sent to the UI.

```ts
type AttackObservation = {
  peakTimeMs: number | null;
  spectralFluxZ: number;
  energyRiseDb: number;
  percussiveRatio: number;
  strength: number;
};

type HarmonicEvidence = {
  longChroma: Float32Array;
  shortChroma: Float32Array;
  bassChroma: Float32Array;
  trebleChroma: Float32Array;
  pitchClassActivations: Float32Array;
  activationTotal: number;
  templateScores: Float32Array;
  topCandidates: readonly ChordCandidate[];
  tuningCents: number;
};

type AcousticChordHop = {
  sequence: number;
  time: { startMs: number; endMs: number };
  featureTimeMs: number;
  support: {
    shortStartMs: number;
    longStartMs: number;
    endMs: number;
  };
  activityEnergy: number;
  discontinuity: boolean;
  attack: AttackObservation;
  harmony: HarmonicEvidence;
};

type ChordBoundaryEvidence = {
  atMs: number;
  attackStrength: number;
  harmonicDistance: number;
  novelToneStrength: number;
  candidateMargin: number;
  persistenceMs: number;
  score: number;
  mode: 'attack-change' | 'persistent-change' | 'none';
};
```

`ProvisionalChordResult` will return all observations produced by a push. The worker retains them for
post-Stop analysis while continuing to publish only chord events and compact diagnostics.

Chord templates need a stable catalog and separate APIs for compact scoring and candidate
materialization:

```ts
scoreChordTemplates(observation): Float32Array;
materializeChordCandidates(scores, limit): ChordCandidate[];
```

## Feature extraction

### Attack detector

Add a causal, analysis-only detector over the filtered 16 kHz chord branch:

- 32 ms frames, 10 ms hop, 512-point FFT;
- positive log-magnitude spectral flux over the guitar-relevant band;
- frame RMS and energy rise in dB retained separately;
- a rolling robust median/MAD baseline so behavior is gain- and device-tolerant;
- the strongest peak since the previous chord hop, including its timestamp;
- a short refractory interval so one pick sweep does not become several attacks.

Initial candidate thresholds belong in typed profile configuration and are calibration starting
points, not product truths. Raw normalized components must be retained in diagnostics so they can be
evaluated across the development and held-out corpora. The detector never modifies capture PCM,
Basic Pitch audio, or monophonic audio.

### Harmonic evidence

Expose independent time scales from the acoustic frontend:

- retain the existing long pool for chord identity;
- add a boundary-oriented 128-192 ms harmonic pool;
- retain unnormalized pitch-class activations and total activation before normalization;
- record each feature window's source-time support explicitly;
- do not classify a post-attack chord from a window still dominated by pre-attack audio.

For each hop, compare the current short-time evidence with a stable reference for the accepted chord:

- Hellinger distance between normalized chroma distributions;
- score margin between the challenger and accepted chord;
- novel-tone strength from positive activation unexplained by a decay-scaled reference;
- challenger persistence duration;
- proximity of an attack peak to the post-attack harmonic evidence.

The decay scale is estimated from shared pitch classes. Proportional decay and disappearance of
upper tones should produce little novelty; added or replaced tones should produce positive novelty.
The stable reference is frozen while a change is pending and updated slowly only from mature,
accepted frames.

## Live causal decoder

Move transition logic into `online-chord-decoder.ts` with explicit states:

- `idle`
- `establishing`
- `stable`
- `change-pending`
- `release-pending`

Behavior:

- Ring-out: low novelty and no persistent harmonic replacement retain the accepted chord even if
  weaker tones disappear.
- Same-chord re-strum: an attack followed by substantially the same harmony increments attack
  diagnostics and extends the existing event.
- Different-chord strum: attack plus a persistent, post-attack harmonic shift confirms a boundary;
  the final boundary time is the attack peak rather than the later confirmation time.
- Soft/legato change: stronger distance, novel-tone support, and longer persistence can confirm a
  boundary without an attack.
- Attack/noise without harmonic change never creates a split.
- Silence and discontinuities close/reset state rather than becoming musical transitions.

Accurate and Responsive profiles differ only through centralized, typed timing and evidence
configuration. Initial confirmation budgets are approximately 160/240 ms for attack-supported
changes and 320/480 ms for attack-free changes. They must be tuned on development fixtures and
reported unchanged on held-out recordings.

## Post-Stop decoder

Final fusion consumes retained acoustic hops but makes one decision per supported boundary region:

1. Partition active audio at confirmed live boundaries, silence, and discontinuities.
2. Infer a missed boundary only inside an existing partition after sustained acoustic replacement;
   finalized model note edges never create a boundary by themselves.
3. Exclude pre-boundary partial attacks and low-energy decay tails from regional label evidence.
4. Preserve proven full-span acoustic evidence when one live span maps to one region; pool regional
   hop evidence only when Stop splits a formerly merged span.
5. Aggregate Basic Pitch evidence inside each resulting region and apply the existing reliability,
   completeness, defining-tone, and extension checks.
6. Use boundary-conditioned sequence decoding to merge false boundaries and reconcile provisional
   IDs by overlap.

This region layer is deliberately more conservative than a raw per-hop Viterbi path. A
duration-explicit semi-Markov decoder should be considered only if genuine short chords are still
swallowed after the regional approach has broader real-recording coverage.

## Migration sequence

### Phase 1: evidence substrate

- Add typed `AcousticChordHop` records and explicit support timestamps.
- Drain and analyze every due hop, including when one input push spans multiple hops.
- Export compact template score vectors.
- Retain a bounded hop sequence in the worker.
- Preserve current live switching during this phase.

This phase comes first because later attack logic and post-Stop recovery require complete,
source-aligned evidence.

### Phase 2: attack and boundary features

- Add the robust attack detector and isolated unit tests.
- Add harmonic distance, novelty, margin, persistence, and stable-reference tracking.
- Record diagnostics alongside the current switcher before allowing them to affect output.
- Measure feature distributions on synthetic and private development recordings.

### Phase 3: live decoder

- Replace the label-polling switcher with the explicit online state machine.
- First enforce ring-out and same-chord re-strum invariants.
- Then enable attack-supported and persistent attack-free changes.
- Preserve stable provisional event IDs and existing lifecycle semantics.

### Phase 4: final boundary-region fusion

- Pool retained acoustic hops into one observation per supported region.
- Add boundary-conditioned transition costs.
- Allow post-Stop decoding to split a live span when retained acoustic evidence supports it.
- Keep a temporary span-only fallback only for runs without retained hops.

### Phase 5: evaluation and cleanup

- Add boundary, settling, fragmentation, and disagreement metrics to the production browser replay.
- Tune only on assigned development recordings.
- Report held-out results without tuning.
- Retain the span evidence path for one-to-one regions and no-hop fallback; remove only redundant raw
  per-hop polling logic after parity and promotion gates pass.
- Update analyzer/provenance versions and project status.

## Files

Add:

- `src/audio/polyphonic/attack-detector.ts`
- `src/audio/polyphonic/attack-detector.test.ts`
- `src/audio/polyphonic/chord-observations.ts`
- `src/audio/polyphonic/boundary-evidence.ts`
- `src/audio/polyphonic/boundary-evidence.test.ts`
- `src/audio/polyphonic/online-chord-decoder.ts`
- `src/audio/polyphonic/online-chord-decoder.test.ts`

Change:

- `src/audio/polyphonic/harmonic-chroma.ts`
- `src/audio/polyphonic/chords.ts`
- `src/audio/polyphonic/streaming.ts`
- `src/audio/polyphonic/temporal-decoder.ts`
- `src/audio/polyphonic/note-sets.ts`
- `src/audio/polyphonic/finalized-sequence.ts`
- `src/workers/polyphonic-analysis.worker.ts`
- related unit tests and `tests/e2e/private-polyphonic-replay.spec.ts`

## Acceptance gates

### Behavioral invariants

- A decaying chord with selective upper/extension-tone loss produces one chord event.
- Repeated attacks on the same chord remain one chord span while attack diagnostics increase.
- An attack with unchanged harmony does not split.
- A partial upstroke followed by the full chord does not create a short suspended-chord fragment.
- An attacked chord change creates two spans and locates the boundary within one 80 ms chord hop.
- A persistent soft/legato change creates a boundary after the longer profile confirmation.
- Tone loss alone, a short-lived challenger, handling noise, or Basic Pitch note decay cannot create a
  final boundary.
- Silence, muting, discontinuity, and re-entry reset correctly.
- Multi-hop pushes retain every monotonic, source-aligned observation.
- Acoustic evidence inside a formerly merged live span can create two finalized chord events.
- Model-only note-set changes without acoustic change support cannot split the span.

### Regression and product gates

- Existing public browser fixtures remain 100% top-1/top-3.
- Deliberate Asus4, Dm/Dm7, G7, inversion, and power-chord controls do not regress.
- Drop/discontinuity and nonzero source-offset tests remain passing.
- The preserved 19-chord browser replay improves the Em7-to-Am7 boundary without regressing an
  already-correct interval or adding/removing an intended chord event.
- A fresh natural G-D-E or G-D user take retains intended transitions after Stop, creates no brief
  suspension from a partial attack unless it persists, keeps same-chord re-strums together, and
  preserves the sustained final chord as one event.
- The full test, coverage, lint, typecheck, build, dependency, and browser-evaluation gates pass.

### Performance gates

- p95 acoustic worker processing remains below the 80 ms hop budget.
- Retained evidence has predictable bounded growth and stores no per-hop PCM copies.
- Attack analysis remains off the main thread.
- Private replay reports absolute and relative real-time factor so performance changes are visible.

## First implementation slice

Implement only Phase 1 first: exact multi-hop draining, compact `AcousticChordHop` retention,
explicit source-time support, stable template score vectors, and tests. Do not tune attack thresholds
or alter chord decisions until this substrate is verified.

## July 19 implementation result

- Exact hop draining now carries partial hops across ordinary 48 kHz / 2,048-frame callbacks. A
  regression test verifies all 80 ms hops and source timestamps.
- Internal acoustic hops retain compact long/short template score vectors, normalized chroma,
  unnormalized pitch-class activation, bass/treble evidence, attack diagnostics, and source-time
  support. UI events remain compact.
- A causal robust-median/MAD spectral-flux detector supplies attack timing without relying on
  absolute PCM level.
- The live decoder now distinguishes stable, change-pending, and release states. Same-chord attacks
  extend one event, attack-free changes require longer confirmation and healthy activity, and
  confirmed silence resets the harmonic identity buffer so old chords do not contaminate startup.
- The reviewed 97.6-second sequence now produces 18 clean live acoustic spans: every labeled chord
  except the final Am7, with no decay-time D7-to-Am or E7-to-E fragments. Production final fusion
  labels those 18 spans correctly, retaining the historical 18/19 (94.7%) top-1/top-3 score while
  reducing final event count from 19 to 18.
- The remaining Am7 cannot be recovered honestly from this take: the attack is detected, but
  acoustic hops remain Em7/Gsus/Cmaj-like and Basic Pitch reports B-D-G-C-E with no A. A forced Am7
  split would be recording-specific inference rather than supported evidence.
- The first raw per-hop post-Stop trials produced 27-58 transition fragments. The promoted decoder
  now pools one label per boundary region, partitions conservative missed-boundary inference at
  confirmed changes, preserves proven one-to-one span evidence, and uses regional hop pooling only
  for actual splits. The reviewed sequence produces 18 events in the same supported order as the
  former production span path.
