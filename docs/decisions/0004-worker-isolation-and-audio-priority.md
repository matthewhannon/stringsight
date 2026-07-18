# ADR 0004: Worker isolation and audio priority

Status: Accepted  
Date: 2026-07-17

## Context

Audio transport has hard continuity requirements while polyphonic inference, OpenCV and MediaPipe can consume substantial CPU, GPU and memory. Running these workloads on the main thread would create rendering stalls and audio gaps.

## Decision

Use an `AudioWorklet` only for bounded capture and transport work. Run audio analysis, polyphonic inference, vision and fusion in dedicated workers. Keep orchestration and rendering on the main thread. Reduce vision quality before audio quality when resources are constrained.

## Consequences

- Worker startup, warmup, progress, cancellation and failure need explicit protocols.
- Binary payloads should be transferred rather than copied where ownership permits.
- Algorithms must be callable outside worker entry points so fixture tests do not require a browser worker.
- Workers must support cooperative cancellation and safe restart.
