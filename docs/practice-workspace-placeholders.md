# Practice workspace implementation status

The dual-canvas practice workspace is the active StringSight desktop interface. Its visual system,
workspace modes, layout controls, responsive behavior, microphone capture, live input meter, note
analysis, chord candidates, take controls, and audio diagnostics are implemented against the current
application services.

## Deliberate placeholders

- **Score and tablature:** the visible “Neon River” passage is demo content. Import, authoring,
  persistence, selection editing, and score playback are not connected yet.
- **MIDI visualization:** the advanced-analysis piano roll is presentation-only. Score/MIDI import,
  synchronization, and authored MIDI editing are not implemented.
- **Video:** the reference/take frame is a static preview. Camera capture, file import, synchronized
  playback, scrubbing, and take switching are not implemented.
- **Shared transport:** reference playback, timeline waveform, review markers, previous/next measure,
  loop, metronome, and count-in controls are interface states only. Microphone recording controls are
  real and are guarded by the audio capture lifecycle.
- **Review:** waveform shapes, A/B comparison, marker cards, blend control, and assessment language
  are illustrative. No score/audio/video alignment or performance grading is claimed.
- **Document library and save:** the setlist contains demo documents. Import, creation, switching,
  and persistence are unavailable, and the header labels the active document as unsaved.
- **Edit mode:** the selection inspector is a layout placeholder; it does not mutate score data.

Placeholder surfaces are labeled in the interface so they cannot be confused with completed product
capabilities.
