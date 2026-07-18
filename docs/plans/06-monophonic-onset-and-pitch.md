# Monophonic Onset and Pitch Detection

**Status:** Complete; automated corpus and structured private real-guitar benchmark passed  
**Checklist item:** 6  
**Depends on:** Microphone capture, replay, shared audio contracts, evaluation corpus

## Objective

Turn the timestamped mono PCM stream into provisional and finalized single-note events. Each event
must preserve onset time, ranked pitch alternatives, frequency, MIDI note, pitch class, cents
offset, confidence, provenance, and diagnostic uncertainty. Live microphone chunks and deterministic
replay chunks use the same worker and analyzer.

## Algorithm choice

The first evaluated implementation is project-owned DSP rather than a runtime pitch library:

- Adaptive short-block energy changes identify likely note attacks. A refractory interval prevents
  one pick transient from becoming several onsets. A fast-attack, slow-release energy envelope
  prevents sub-period RMS changes on low strings from retriggering a sustained note.
- A YIN-style cumulative-mean normalized difference function estimates fundamental frequency. It
  is well suited to monophonic music and explicitly exposes periodicity/clarity instead of forcing a
  pitch from every frame.
- Median smoothing across recent confident frames stabilizes the displayed note while retaining
  cents movement. Sustained cents variation is reported as possible bend/vibrato rather than erased.
- Ranked octave alternatives remain in the event contract because octave errors are a known guitar
  failure mode.

This is the evaluated alternative allowed by the checklist's Pitchy requirement. It avoids a model
download and lets StringSight test every numeric step. It is accepted only if corpus and hardware
evidence meet the item targets; Pitchy remains a replaceable candidate behind the same contract.

References:

- [A. de Cheveigné and H. Kawahara, “YIN, a fundamental frequency estimator for speech and
  music,” JASA 111(4), 2002](https://pubmed.ncbi.nlm.nih.gov/12002874/).
- [J. P. Bello et al., “A tutorial on onset detection in music signals,” IEEE TASLP 13(5),
  2005](https://dblp.org/rec/journals/taslp/BelloDADDS05.html).

## Processing path

1. `AudioWorklet` and capture transport continue to own lossless PCM capture.
2. The main-thread analysis controller copies each subscriber chunk into the analysis worker. The
   recording worker retains its original transferable buffer; neither consumer can detach the
   other's data.
3. The worker preserves native-rate capture but low-pass filters and resamples its private analysis
   branch to 16 kHz. It maintains bounded energy, pitch-window, and smoothing state and never
   touches React.
4. Worker updates contain onset observations, note-event upserts, analysis state, and measured
   source-to-result latency.
5. The controller validates updates, replaces events by stable ID, and publishes a small immutable
   UI snapshot.
6. Replay resets the run and feeds the same worker protocol, producing deterministic results.

## States and uncertainty

- `silence`: input is below the adaptive signal floor.
- `transient`: an onset exists but insufficient periodic audio has accumulated.
- `tracking`: a stable pitch candidate is available.
- `uncertain`: energy exists but periodicity is too weak or contradictory.
- `bend-or-vibrato`: a note remains identifiable while cents values vary materially.

Low-clarity frames do not create forced note labels. New onsets finalize the previous event. Sustained
silence finalizes the current event. Discontinuities reset temporal state and are exposed in
diagnostics.

## Configuration baseline

- Evaluated range: `E2` (82.41 Hz / MIDI 40) through `E6` (1318.51 Hz / MIDI 88).
- Energy blocks: approximately 5 ms.
- Analysis sample rate: 16 kHz after a causal fourth-order anti-alias low-pass filter.
- Pitch window: approximately 85 ms, long enough for low-guitar fundamentals while remaining inside
  the 120 ms provisional-result budget.
- Pitch analysis cadence: approximately 20 ms.
- Onset refractory interval: 70 ms.
- Silence finalization hold: 70 ms.
- Default YIN normalized-difference threshold: 0.15.

Configuration is explicit and versioned so evaluation reports can identify the exact detector.

## UI

The capture slice gains a note-analysis panel showing:

- Current best note, frequency, cents offset, and confidence.
- Ranked alternatives and evidence.
- Timestamped onset/note timeline with provisional versus finalized state.
- Analysis state, latency, low-confidence status, and reset behavior.

The UI does not reinterpret or rename detector output. Later music-theory work remains a separate
subsystem.

## Verification

Automated tests cover:

- Frequency/MIDI/note-name/cents conversion across the supported guitar range.
- YIN pitch accuracy, silence refusal, octave alternatives, and low-clarity refusal.
- Onset timing, refractory behavior, decay/silence finalization, note changes, bends/vibrato, and
  discontinuity reset.
- Worker protocol validation, live/replay equivalence, cancellation/reset, and bounded state.
- UI event replacement, ranked alternatives, accessibility, and error/uncertain states.
- Development and held-out corpus reports with separate monophonic accuracy, onset error, and
  source-to-result latency.

The structured real-guitar baseline uses open strings, a fretted scale, repeated notes, and
intentional silence. Bend and vibrato behavior has automated coverage and remains part of the
expanded private recording matrix rather than the Item 6 closure gate. Results and known failure
modes are recorded before the checklist item closes. The reviewed fixture workflow and performance
design are documented in
`docs/plans/06a-analysis-performance-and-real-guitar-benchmark.md`.

## Acceptance

Item 6 completes when deliberate monophonic corpus notes achieve at least 90% top-1 and 97% top-3
pitch accuracy, median onset error is at most 40 ms, p95 onset error is at most 100 ms, provisional
results meet p95 120 ms on supported hardware, low-confidence input remains unresolved, and a
real-guitar run confirms the visible timeline is useful and recoverable.
