# Audio subsystem

Owns microphone capture, audio transport, onset detection, pitch candidates, and monophonic note
events. It must not depend on UI implementation details.

## Capture implementation

- `capture/microphone.ts`: independent connection/recording state, permission, devices,
  `AudioContext`, worklet/worker orchestration, backpressure, errors, and diagnostics.
- `worklets/pcm-capture.worklet.ts`: bounded monitoring summaries and recording-only mono PCM chunks.
- `../workers/audio-transport.worker.ts`: sequence validation, buffering, acknowledgements, and recording assembly.
- `capture/replay.ts`: deterministic recordings emitted through the same PCM chunk contract.

Raw PCM is transferred only while recording and remains local. Monitoring publishes fixed-size
diagnostic summaries without raw PCM retention. Chunk listeners run synchronously before buffer
ownership transfers; they must copy data if it needs to outlive that callback.

If the browser exposes more than one input channel, the worklet deterministically averages every
available channel to mono. It never switches channels based on the loudest render block.
