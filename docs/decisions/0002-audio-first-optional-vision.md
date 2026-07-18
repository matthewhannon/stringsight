# ADR 0002: Audio-first with optional vision

Status: Accepted  
Date: 2026-07-17

## Context

Audio can identify musical pitch evidence but often cannot determine a unique guitar string or fret. Vision can constrain physical position but is sensitive to angle, light and occlusion. Making either one depend directly on the other would prevent independent evaluation and make camera failure break transcription.

## Decision

Audio and vision are independent evidence producers. Audio-only is a complete supported workflow. Vision publishes calibrated position hypotheses. Fusion consumes both and must preserve the original evidence.

## Consequences

- Camera permission is optional.
- Audio results remain inspectable after fusion.
- Vision can improve, abstain or be disabled without interrupting audio.
- Fusion must demonstrate improvement on a paired held-out corpus before it becomes the default displayed physical interpretation.
