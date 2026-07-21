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
- Local UI state for practice layout, score views, tempo, loop, metronome, count-in, and panel sizing.

## Explicit placeholders

- The displayed score/tab is demo data. Score creation, editing, import, and document persistence are
  not connected.
- Video is a static reference frame. Playback, camera capture, media attachment, intrinsic media
  metadata, sync anchors, and full-screen playback are not connected.
- MIDI is a presentation-only preview inside Advanced analysis. MIDI import, editing, and shared
  synchronization are not connected.
- Reference playback, shared transport seeking, loop playback, metronome audio, and count-in audio
  are not connected. Their controls currently demonstrate interaction and intended hierarchy.
- Automated assessment, weak-range detection, expected-versus-observed alignment, A/B blending,
  and review markers are placeholders.
- The setlist, imports, new document, and save controls are placeholders.

Architecture acceptance did not connect these surfaces. alphaTab is not installed or connected,
and the initial hackathon profile omits alphaSynth/reference synthesis and sound banks. The next
production work is the renderer-independent canonical guitar model, not notation UI integration.

Placeholder UI is labelled in-product with an amber outlined badge or explanatory helper copy.
