# Microphone Capture and Audio Transport

**Status:** Complete  
**Checklist item:** 5  
**Depends on:** Shared contracts/timebase and evaluation corpus

## Objective

StringSight needs one reliable timestamped PCM stream that can originate from live microphone capture or a deterministic recording replay. Downstream analysis must not know which source produced it. Audio continuity has priority over rendering and future video work.

## Supported path

- Desktop Chrome and Edge.
- One selected microphone, captured as mono `Float32` PCM. When an interface exposes multiple
  channels despite the mono request, the worklet averages all available channels into a stable
  mono stream. Channel handling does not change between render quanta.
- Browser voice-processing constraints disabled when supported.
- `AudioWorklet` capture with bounded chunks and minimal work on the render thread.
- Worker-owned recording assembly and transport acknowledgements.
- Session-relative timestamps derived from an explicit `AudioContext` anchor.

## Component responsibilities

| Component               | Responsibility                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| `MicrophoneCapture`     | Permission, device selection, `AudioContext`, track lifecycle, worklet wiring, session timestamps, backpressure |
| PCM capture worklet     | Copy render quanta into fixed chunks, compute peak/RMS/clipping counts, transfer PCM                            |
| Audio transport worker  | Validate ordering, acknowledge chunks, assemble recordings, report buffered duration                            |
| `RecordingReplaySource` | Re-chunk stored PCM through the same `PcmChunk` subscriber interface                                            |
| React capture panel     | Explain permission, select a device, show state/diagnostics, waveform, level, and recovery actions              |

The level meter is logarithmic dBFS rather than a linear amplitude percentage. Its waveform is
auto-scaled for visibility without altering captured PCM. A silent synthetic −24 dBFS meter check
passes a known sine wave through the same signal analyzer and display math, separating software
meter correctness from microphone/interface gain problems.

The main thread coordinates these pieces but does not run per-sample DSP. The worklet never imports application libraries, allocates per render quantum after initialization, or performs network/storage work.

## Capture lifecycle

1. On page load, report capability support without requesting permission.
2. A user gesture calls `getUserMedia` with mono audio plus echo cancellation, noise suppression, and automatic gain control requested off.
3. Create/resume `AudioContext`, record the session/audio clock anchor, and load the capture worklet.
4. Connect `MediaStreamAudioSourceNode` to the worklet. The worklet connects through a zero-gain node so it remains scheduled without audible monitoring or feedback.
5. Transfer chunks to the transport worker and publish small UI snapshots at a throttled rate.
6. On stop, flush the worklet, stop tracks, close the context, finalize worker recording assembly, and retain the result in memory for replay.
7. Replay emits identical chunk contracts with the original relative sample timing and a `replay` source tag.

## PCM contract

Each chunk contains:

- Schema version and stable sequence number.
- Session-relative start time and duration.
- Sample rate, channel count (`1`), and frame count.
- Source (`microphone` or `replay`).
- Peak, RMS, clipping count, silence state, and discontinuity flag.
- Transferable `Float32Array` PCM data.

A recording contains its source format, exact duration/frame count, discontinuity count, start timestamp, and contiguous PCM data. Downstream algorithms consume chunks, not browser nodes.

## Backpressure and continuity

- The controller tracks unacknowledged worker chunks.
- A configurable in-flight limit prevents unbounded main-thread/worker message growth.
- If the limit is exceeded, the affected chunk is explicitly marked/dropped and a discontinuity diagnostic is raised; the application never silently pretends continuity.
- Chunk sequence and starting sample frame are checked in the worker.
- UI rendering consumes throttled snapshots and may skip visual updates without skipping analysis chunks.
- Video work will reduce quality before audio transport limits are changed.

## Diagnostics and failures

Visible diagnostics include requested/actual sample rate, device label, channel count, voice-processing settings, chunk duration, dropped chunks, discontinuities, RMS/peak, silence duration, clipping, and recording duration.

Recovery behavior:

- Permission denied: explain how to grant microphone access and keep the page usable.
- No device or device busy: allow retry and device reselection.
- Unsupported APIs: explain supported browsers; never show a broken start control.
- Track ended/device removed: stop cleanly, preserve captured PCM, and offer reconnection.
- Audio context suspension: attempt resume after a user gesture and surface failure.
- Worklet/worker error: finalize what is recoverable, expose a processing error, and allow a fresh session.
- Prolonged silence and clipping: show warnings without stopping capture.

## Privacy

- No microphone request occurs before explicit user action.
- Raw PCM remains in the browser and is held in memory for this slice.
- Device labels remain local and are not placed in telemetry or exported diagnostics by default.
- There is no remote endpoint in this item.

## Verification

Automated verification covers:

- Signal diagnostics and chunk invariants.
- Timestamp/sample-frame mapping.
- Replay chunk equivalence and cancellation.
- Worker assembly, sequence discontinuity, and flush behavior.
- Permission/error mapping with mocked browser APIs.
- Chromium fake-device capture through the real worklet and UI.

Real-hardware verification is required once automation passes. The user will verify one short recording with their actual browser, microphone, permission state, input selection, level, waveform, stop/replay, silence warning, and unplug/reconnect behavior where practical. Results should be recorded in `docs/verification/05-audio-capture-hardware.md`.

## Acceptance

Item 5 is complete when live and replayed sources emit equivalent timestamped contracts; capture does not monitor audibly; diagnostics expose actual device behavior; discontinuities are explicit; automated verification passes; and one supported-browser hardware check is documented. Automated implementation can be complete before the hardware check, but the checklist item remains open until that evidence exists.
