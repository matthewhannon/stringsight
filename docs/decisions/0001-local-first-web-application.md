# ADR 0001: Local-first web application

Status: Accepted  
Date: 2026-07-17

## Context

StringSight needs microphone capture, webcam capture, low-latency processing, worker isolation, local model execution and an easily accessible judge experience. A native desktop application could expose specialized audio drivers but would add packaging and platform work before the signal-processing architecture is proven.

## Decision

Build StringSight as an HTTPS web application with installable PWA behavior where supported. Process raw audio and video locally by default. Target current desktop Chrome and Edge first.

## Consequences

- Web Audio, `AudioWorklet`, Web Workers, WebAssembly, IndexedDB and browser media permissions are platform foundations.
- Native-driver integrations such as ASIO are not part of the first release.
- Browser capability checks and explicit unsupported states are required.
- A later native wrapper must reuse the same contracts and may not move signal-processing logic into the UI layer.
