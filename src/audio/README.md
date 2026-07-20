# Audio subsystem

Owns microphone capture, audio transport, onset detection, pitch candidates, and monophonic note
events. It must not depend on UI implementation details.

## Capture implementation

- `capture/microphone.ts`: independent connection/recording state, permission, devices,
  `AudioContext`, worklet/worker orchestration, backpressure, errors, and diagnostics.
- `worklets/pcm-capture.worklet.ts`: bounded monitoring summaries, transient analyzer PCM, and
  separately sequenced recording PCM.
- `../workers/audio-transport.worker.ts`: sequence validation, buffering, acknowledgements, and recording assembly.
- `capture/replay.ts`: deterministic recordings emitted through the same PCM chunk contract.

Raw PCM remains local. Monitoring PCM is sent to separate fixed-window transient analyzers, then
discarded without entering the recording transport or session. Monitoring event history is a bounded
rolling window, and the polyphonic worker does not accumulate monitoring PCM, acoustic observations,
or model-finalization input. Recording PCM is separately sequenced and retained only for the bounded
take. Chunk listeners run synchronously before buffer ownership transfers; they must copy data if it
needs to outlive that callback.

If the browser exposes more than one input channel, the worklet deterministically averages every
available channel to mono. It never switches channels based on the loudest render block.
