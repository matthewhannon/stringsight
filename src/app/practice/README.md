# Practice workspace

This directory is the active StringSight application shell. It implements the approved calm,
tab-centered practice design and connects directly to the existing local audio controllers.

## Implemented and connected

- Microphone connection and disconnection.
- Live input level, device state, and capture warnings.
- Take recording, pause/resume, finalization, and replay analysis.
- Live monophonic note candidates and tuning offset.
- Live polyphonic chord candidates, confidence, alternatives, lifecycle, and diagnostics.
- Current local session evidence counts and persistence-backed session state.
- Local UI state for practice layout, score views, and panel sizing.
- Canonical blank-score authoring, semantic inspection, undo/redo, and bounded notation preview.
- Exact-fixture import review for GP8 basic, parsing-only/rejected GP5, rejected GP7 and MusicXML,
  and the declared Type-1 SMF fixture. Review never replaces the current document automatically.
- Authored-document SMF Type-1 export with explicit semantic-loss reporting.

## Explicitly unavailable

- Durable document persistence and native open/save are not connected.
- Video is a static reference frame. Playback, camera capture, media attachment, intrinsic media
  metadata, sync anchors, and full-screen playback are not connected.
- Reference playback, shared transport seeking, loop playback, metronome audio, and count-in audio
  are not connected, so the product does not expose interactive controls for them.
- Automated assessment, weak-range detection, expected-versus-observed alignment, A/B blending,
  and review markers are not shown until they have real data and behavior.
- The setlist remains a single working-copy view; durable save remains unavailable.

The initial hackathon profile omits reference synthesis and sound banks. Third-party parser and
renderer objects stay behind adapters; only canonical StringSight documents enter editor state.

Unavailable behavior is omitted from the interactive surface or described as passive status.
