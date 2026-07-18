# Audio subsystem

Owns microphone capture, audio transport, onset detection, pitch candidates, and monophonic note
events. It must not depend on UI implementation details.

## Capture implementation

- `capture/microphone.ts`: permission, devices, `AudioContext`, worklet/worker orchestration, backpressure, errors, and diagnostics.
- `worklets/pcm-capture.worklet.ts`: fixed-size mono PCM chunks and render-thread signal statistics.
- `../workers/audio-transport.worker.ts`: sequence validation, buffering, acknowledgements, and recording assembly.
- `capture/replay.ts`: deterministic recordings emitted through the same PCM chunk contract.

Raw PCM is transferred to the recording worker and remains local. Chunk listeners run synchronously before buffer ownership transfers; they must copy data if it needs to outlive that callback.

If the browser exposes more than one input channel, the worklet deterministically averages every
available channel to mono. It never switches channels based on the loudest render block.
