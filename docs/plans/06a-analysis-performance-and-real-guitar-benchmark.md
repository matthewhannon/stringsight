# Analysis Performance and Real-Guitar Benchmark

**Status:** Complete; three structured private real-guitar takes passed  
**Extends:** Checklist item 6  
**Depends on:** Monophonic analyzer, capture replay, evaluation corpus

## Objective

Improve live analysis throughput without changing lossless capture, and make real-guitar accuracy
measurable without using StringSight's predictions as their own ground truth.

## Optimized analysis path

- Microphone recording stays at the browser/device sample rate.
- The analysis worker applies a causal fourth-order Butterworth low-pass filter, then reduces its
  private stream to 16 kHz. The filter cutoff is 90% of the destination Nyquist frequency.
- Live microphone chunks, replay chunks, procedural evaluation, and recorded evaluation all use
  `StreamingMonophonicPipeline`; there is no separate benchmark-only detector path.
- YIN reuses its difference, normalized-difference, and pitch-window arrays between frames. This
  removes the largest repeated allocations from the pitch loop and reduces garbage-collection
  jitter.
- Worker messages report input and analysis sample rates independently so the optimization remains
  observable.

The local performance harness runs warmed repeated passes over all monophonic fixtures and reports
processing time, real-time factor, and throughput. Its machine-dependent report is intentionally
ignored by Git.

```sh
npm run benchmark:monophonic -- --iterations 20
```

## Real-guitar export workflow

The in-app benchmark panel guides a structured take and exports two local files:

1. A canonical mono 16-bit PCM WAV containing the untouched captured sample rate.
2. A fixture JSON file containing recording conditions and only notes explicitly reviewed by the
   player.

Every detected event must be assigned its true note or explicitly excluded as a false event before
the label file can be downloaded. Detector guesses are displayed for comparison but are never
copied into ground truth automatically. Event times are normalized to the first sample of the WAV.

Recorded fixture provenance stores explicit consent and usage permission. The UI defaults to
`private-evaluation-only`; nothing uploads or enters the repository automatically.

## Initial recording protocol

- Two seconds of room silence.
- Open strings `E2 A2 D3 G3 B3 E4`, each ringing for approximately one second.
- Approximately one second of silence between notes.
- Two seconds of room silence at the end.
- Stable input gain for the entire take.

After the open-string take, separate development recordings should cover fretted low/mid/high
notes, repeated articulation, a slow scale, soft/loud dynamics, vibrato, a bend, muted transients,
and normal room noise. A later recording session—not merely another take in the same session—will
form the held-out set.

## Acceptance

The implementation portion is complete when the filtered 16 kHz branch is chunk-invariant, rejects
out-of-band energy, preserves supported guitar pitch and timestamps, exposes its rates, exports WAV
and schema-valid reviewed labels, and passes the full project verification suite. Real-guitar
accuracy claims remain pending until reviewed development and held-out takes are added and scored.
