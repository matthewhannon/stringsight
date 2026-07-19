# Private real-guitar recording corpus

**Status:** Implemented foundation; chord capture workflow ready for reviewed recordings
**Checklist parent:** Item 6 verification and Item 7 evaluation input

## Objective

Reuse the same real guitar performances across analyzer changes without repeatedly asking the player
to reproduce them. Imported audio must travel through the normal replay contract, while batch
evaluation runs the same analyzer implementation directly for deterministic, faster-than-realtime
measurement.

## Privacy boundary

Private guitar media and labels live under `.local/guitar-corpus/`, which is ignored by Git. The
application reads selected WAV files locally and does not upload them. A private corpus fixture must
remain `private-evaluation-only`; the batch command rejects any other license classification.

Recommended layout:

```text
.local/guitar-corpus/
  corpus.local.json
  audio/
    open-strings.wav
  fixtures/
    open-strings.fixture.json
  reports/
    monophonic-baseline.local.json
```

The manifest maps reviewed fixture documents to their WAV files:

```json
{
  "schemaVersion": 1,
  "corpusId": "stringsight-private-guitar-v1",
  "recordings": [
    {
      "id": "open-strings",
      "audioPath": "audio/open-strings.wav",
      "fixturePath": "fixtures/open-strings.fixture.json"
    }
  ]
}
```

Paths must be relative to the manifest and may not escape its directory. IDs must be unique and
must match the corresponding reviewed fixture.

## Interactive workflow

The audio-input module accepts PCM WAV files. Import validates the RIFF/WAVE structure, supports
integer PCM at 8, 16, 24, or 32 bits plus 32-bit IEEE float, and deterministically averages multiple
channels to mono. The resulting `CapturedRecording` is replayed through the existing timestamped
`PcmChunk` subscribers, so the same workers and UI receive live and imported recordings.

The evaluation bench switches between a monophonic open-string protocol and a polyphonic chord
sequence protocol. Finalized chord suggestions are preselected, can be corrected or excluded, and
export a private fixture whose chord symbols, pitch classes, timing, provenance, and WAV identity
remain paired. The first chord take uses C, A minor, G, and E minor with two seconds of sustain and
two seconds of silence between changes.

## Batch workflow

Run:

```sh
npm run evaluate:private-guitar -- --manifest .local/guitar-corpus/corpus.local.json
```

The command validates the manifest, fixture privacy, fixture/WAV duration agreement, and
monophonic labels. It writes an ignored local report containing top-1/top-3 pitch accuracy, onset
metrics, per-recording diagnostics, and processing time. Item 7 will extend this same private corpus
with reviewed chord labels and polyphonic metrics.

## Completion criteria

- A selected WAV follows the same replay and run-isolation path as a browser recording.
- Stereo input is averaged consistently rather than selecting a channel dynamically.
- Invalid, truncated, unsupported, empty, or path-traversing inputs fail visibly.
- Private batch reports are reproducible without copying media into the public fixture corpus.
- The full public verification suite remains independent of private media.
