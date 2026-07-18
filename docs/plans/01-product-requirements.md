# StringSight Product Requirements

Status: Accepted baseline  
Last updated: 2026-07-17  
Checklist parent: `BUILD_CHECKLIST.md`, item 1

## 1. Purpose

This document defines the first complete release of StringSight and the measurable requirements that guide architecture, implementation, evaluation, and release decisions.

StringSight is a local-first web application that listens to a guitarist and, when a camera is enabled, watches the fretboard. It produces time-aligned candidates for notes and chords, estimates scales and keys across a phrase, and uses visible fretboard and hand position to improve the physical interpretation of ambiguous audio. The application presents likely tablature as an inference with confidence and alternatives, not as guaranteed ground truth.

These requirements are a baseline, not a claim that every target has already been achieved. If evidence forces a material change, update this document and record the reason in `docs/decisions/` before changing the implementation contract.

## 2. Product goals

StringSight must:

1. Provide a useful audio-only guitar transcription workflow.
2. Improve ambiguous guitar-specific results by adding optional webcam evidence.
3. Preserve and expose uncertainty throughout the processing pipeline.
4. Distinguish direct observations, deterministic transformations, model predictions, fused inferences, and user corrections.
5. Process raw microphone and webcam data locally by default.
6. Remain responsive during live audio and video processing on supported desktop hardware.
7. Produce reproducible sessions that can be replayed, inspected, corrected, evaluated, and exported.
8. Explain what GPT-5.6 contributed without making remote model access a dependency of core transcription.

## 3. Primary users

### 3.1 Guitarist exploring a phrase

The player wants to see the notes, chords, and possible scale they played without entering notation manually.

### 3.2 Guitarist recovering an idea

The player recorded a short improvisation and wants a time-aligned musical timeline and probable tablature that can be reviewed and corrected.

### 3.3 Learner investigating the fretboard

The player wants to understand how detected pitches relate to possible string and fret positions, including cases where several fingerings can produce the same pitch.

### 3.4 Judge or evaluator

The evaluator needs a deterministic path to run StringSight, understand its architecture and limitations, and compare audio-only results with audio-video fusion.

## 4. Primary user journeys

### 4.1 Live audio-only recognition

1. The user opens StringSight in a supported browser.
2. The user grants microphone permission and selects an input device.
3. StringSight reports input health and model readiness.
4. The user starts a session and plays notes, chords, or a short phrase.
5. StringSight displays provisional results with confidence.
6. After enough context is available, StringSight replaces or supplements them with finalized results.
7. The user stops, replays, inspects, and optionally corrects the session.
8. The user saves or exports the result.

### 4.2 Audio with optional vision

1. The user completes the audio setup.
2. The user enables a webcam and grants permission.
3. StringSight automatically looks for the guitar fretboard; it does not require manual corner selection.
4. The UI guides camera placement and reports whether the neck, fret index, and hand are confidently detected.
5. The user records a phrase.
6. StringSight shows audio-only candidates and fused guitar-position candidates as separately inspectable results.
7. The user can disable vision at any time without losing the session.

### 4.3 Review and correction

1. The user opens a saved or newly recorded session.
2. Audio playback, visual overlays, notes, chords, and probable tablature remain synchronized.
3. The user inspects the evidence and alternate candidates for an event.
4. The user corrects an event without deleting the original prediction.
5. Exports retain both provenance and corrections.

### 4.4 Remote musical interpretation

1. The local pipeline produces structured, finalized musical events.
2. The user explicitly requests additional interpretation.
3. StringSight shows what structured data will be sent remotely.
4. GPT-5.6 returns schema-constrained possible keys, scales, progressions, and explanations.
5. StringSight labels that response as model interpretation and keeps it separate from local detection results.
6. Failure or unavailability leaves local transcription fully operational.

## 5. Evidence and result model

Every result exposed by the system must have one of these provenance categories:

| Category               | Meaning                                     | Examples                                                    |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Observation            | Directly measured input or geometry         | PCM samples, spectral energy, hand landmarks, line segments |
| Transformation         | Deterministic conversion of observations    | Frequency to MIDI, homography, fret-spacing calculation     |
| Prediction             | Output from a detector or learned model     | Pitch candidates, Basic Pitch note events, hand landmarks   |
| Fusion inference       | Guitar state inferred from multiple sources | Likely string/fret, chord voicing, visual fret alignment    |
| Musical interpretation | Higher-level contextual analysis            | Key, scale, chord progression, GPT-5.6 explanation          |
| User correction        | Explicit user-authored result               | Corrected note, chord, timing, or fingering                 |

Every prediction, fusion inference, and musical interpretation must include:

- A start time and, when applicable, an end time.
- One or more ranked candidates.
- A normalized confidence or documented score.
- Provenance identifying the subsystem and model/algorithm version.
- Enough diagnostic context to explain why the candidate was produced.
- An explicit unresolved state when evidence is insufficient.

The UI must never silently replace a user correction with a later model result.

## 6. Supported first-release environment

### 6.1 Platform

- Current stable desktop Chrome and Edge.
- Windows and macOS are primary operating systems.
- The application is delivered as an HTTPS website and installable PWA where supported.
- Required browser capabilities are `getUserMedia`, Web Audio, `AudioWorklet`, Web Workers, WebAssembly, IndexedDB, and a supported GPU or CPU execution path for vision models.

### 6.2 Instrument and recording conditions

- One six-string guitar in standard tuning: `E2 A2 D3 G3 B3 E4`.
- No capo in the first release.
- One foreground instrument; background speech or music is not a supported input.
- Direct microphone input or a reasonably quiet room.
- Single notes, deliberate phrases, and clearly articulated chords.
- A webcam view that contains a useful portion of the fretboard.
- Left- and right-handed playing should be representable in the data model; right-handed playing is the primary evaluated configuration until the paired corpus includes both.

## 7. Functional requirements

### 7.1 Capture and session control

- **CAP-001:** The user can select microphone and camera devices independently.
- **CAP-002:** The application reports actual device settings and processing readiness.
- **CAP-003:** The user can start, pause, resume, stop, replay, and discard a session.
- **CAP-004:** Live capture and fixture replay use the same downstream subsystem contracts.
- **CAP-005:** Audio remains operational when camera permission is denied, the camera is absent, or vision fails.
- **CAP-006:** Device loss and permission changes produce actionable recovery states.

### 7.2 Audio analysis

- **AUD-001:** The application detects candidate note onsets and their times.
- **AUD-002:** For monophonic input, it returns ranked MIDI pitch candidates, note names, pitch classes, tuning offset, and confidence.
- **AUD-003:** For polyphonic input, it returns time-aligned candidate pitch sets.
- **AUD-004:** It returns ranked chord candidates for supported chord qualities.
- **AUD-005:** It distinguishes provisional live results from finalized results.
- **AUD-006:** It preserves raw audio-analysis results after fusion so improvement or regression can be evaluated.
- **AUD-007:** Silence, noise, clipping, bends, vibrato, uncertain octave, and unsupported density have explicit states rather than forced labels.

### 7.3 Supported musical outputs

- **MUS-001:** Notes are represented internally as MIDI numbers with pitch class, octave, frequency, and cents offset when available.
- **MUS-002:** The evaluated guitar pitch range is `E2` through `E6`, while the schema permits extension.
- **MUS-003:** Initial chord qualities are major, minor, dominant seventh, major seventh, minor seventh, suspended second, suspended fourth, diminished, and power chord.
- **MUS-004:** Initial scale interpretations are major, natural minor, major pentatonic, minor pentatonic, and blues.
- **MUS-005:** Chord inversions and omitted or doubled notes are represented as evidence, not discarded.
- **MUS-006:** Key and scale results are ranked interpretations over a configurable time window.
- **MUS-007:** Enharmonic spelling can change with musical context without changing the underlying pitch.

### 7.4 Virtual guitar model

- **GTR-001:** The system maps every configured string/fret location to an absolute pitch.
- **GTR-002:** Given audio pitch evidence, it enumerates all physically possible locations in the supported fret range.
- **GTR-003:** It represents tuning, handedness, scale length, fret count, and future capo position explicitly.
- **GTR-004:** It assigns a documented transition cost between sequential guitar states.
- **GTR-005:** It does not claim a unique fingering when multiple states remain plausible.

### 7.5 Vision analysis

- **VIS-001:** Fretboard detection is automatic and requires no manual corner or fret selection.
- **VIS-002:** The application may guide camera placement and ask the user to hold the guitar steady, but the user is not required to label geometry.
- **VIS-003:** The system detects a candidate neck quadrilateral and maps it into a canonical coordinate system.
- **VIS-004:** It detects available evidence from neck edges, fret wires, strings, nut, and inlay markers.
- **VIS-005:** It fits fret geometry to the equal-tempered spacing model.
- **VIS-006:** It may maintain several absolute fret-index hypotheses when the nut and useful markers are not visible.
- **VIS-007:** It returns a time-aligned probability distribution over hand fret regions.
- **VIS-008:** Fine fingertip-to-string contact is optional evidence and is never fabricated when occlusion prevents observation.
- **VIS-009:** The UI displays the detected fret grid and reports low-confidence, lost, or ambiguous tracking.

### 7.6 Multimodal fusion

- **FUS-001:** Fusion consumes ranked audio candidates, ranked visual position estimates, guitar geometry, and prior state.
- **FUS-002:** It returns ranked guitar states and probable tablature with confidence.
- **FUS-003:** It uses sequence context to prefer physically plausible movement without erasing unusual but well-supported playing.
- **FUS-004:** It can use accumulated audio evidence to re-rank absolute fret-index hypotheses.
- **FUS-005:** It must fall back to audio-only output when vision is absent or harmful.
- **FUS-006:** The user can compare audio-only and fused results for the same event.
- **FUS-007:** High-confidence audio evidence cannot be overridden solely by weak visual evidence.

### 7.7 Review, correction, persistence, and export

- **SES-001:** Sessions persist locally with schema and algorithm versions.
- **SES-002:** Playback remains synchronized with musical events and available visual overlays.
- **SES-003:** Users can inspect alternatives and correct labels, timing, and probable positions.
- **SES-004:** Corrections retain the original result and correction provenance.
- **SES-005:** Sessions can be exported and imported as a reproducible structured bundle.
- **SES-006:** JSON export is required; MIDI export is required when finalized note events contain sufficient timing and pitch information.
- **SES-007:** The user can delete stored sessions and recorded media.

### 7.8 GPT-5.6 interpretation

- **AI-001:** GPT-5.6 is not part of microphone capture, pitch detection, video tracking, or latency-critical fusion.
- **AI-002:** Remote analysis is explicitly initiated by the user.
- **AI-003:** Only minimized structured events and user-provided context are sent by default.
- **AI-004:** Responses use a strict schema and are labeled as model interpretations.
- **AI-005:** The local result remains visible and unchanged.
- **AI-006:** Timeouts, rate limits, missing credentials, network failure, and invalid responses degrade gracefully.
- **AI-007:** The application remains fully usable without an OpenAI API key.

## 8. Behavior without reliable vision

Vision is an optional source of evidence, not a prerequisite.

- With no camera, StringSight provides the complete audio-only workflow.
- While fretboard geometry is detected but absolute indexing is ambiguous, StringSight reports relative positions and multiple indexed hypotheses.
- While the fretboard is visible but the hand is lost, StringSight keeps audio results and omits hand-derived re-ranking.
- When vision conflicts with high-confidence audio, StringSight exposes the conflict and favors the better-calibrated source according to documented fusion rules.
- If vision reduces held-out accuracy, the affected fusion path is disabled until corrected.

## 9. Explicit first-release non-goals

The first complete release does not promise:

- Professional studio or DAW-grade transcription accuracy.
- Separation of guitar from a dense multi-instrument recording.
- Guaranteed exact tablature or fingering from arbitrary camera angles.
- Support for bass, ukulele, extended-range guitars, or other instruments.
- Alternate tunings or capo-aware analysis in the evaluated user experience.
- Mobile-browser support.
- Native desktop audio drivers such as ASIO.
- Automatic transcription of rapid virtuosic passages, tapping, harmonics, or heavily distorted audio.
- Real-time GPT-generated output in the signal-processing loop.
- Automatic cloud upload or long-term remote storage of raw audio or video.
- A hidden single-answer experience that suppresses uncertainty.

These are future extensions, not shortcuts omitted from an otherwise supported contract.

## 10. Performance requirements

Targets are measured on representative current desktop hardware after model warmup unless otherwise specified.

| Metric                                                | First-release target                                           |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Audio transport latency, capture to analysis worker   | p95 <= 20 ms                                                   |
| Provisional monophonic note result after stable onset | p95 <= 120 ms                                                  |
| Finalized monophonic note result after note end       | p95 <= 500 ms                                                  |
| Provisional chord label after chord onset             | p95 <= 350 ms                                                  |
| Finalized short-chord result after chord end          | p95 <= 1,000 ms                                                |
| Vision analysis rate while audio is active            | sustained >= 15 FPS                                            |
| Visual overlay age                                    | p95 <= 150 ms                                                  |
| Main-thread long tasks during active capture          | no recurring tasks > 50 ms                                     |
| Audio continuity                                      | no analysis transport dropout in a 15-minute supported session |
| Session UI responsiveness                             | input response p95 <= 100 ms                                   |
| Warm application readiness excluding permissions      | <= 3 seconds                                                   |
| Model readiness on a typical broadband cold load      | <= 12 seconds with visible progress                            |

If a target cannot be achieved, record the measurement, cause, user impact, and approved requirement change. Do not silently redefine the metric.

## 11. Accuracy and evaluation requirements

Accuracy is measured against the held-out portion of the versioned evaluation corpus. Results must report corpus version, algorithm/model versions, sample counts, confidence calibration, and relevant input conditions.

| Metric                                                             | First-release target                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Deliberate monophonic notes, top-1 pitch                           | >= 90%                                                                      |
| Deliberate monophonic notes, top-3 pitch                           | >= 97%                                                                      |
| Supported deliberate chords, top-1 label                           | >= 80%                                                                      |
| Supported deliberate chords, top-3 label                           | >= 93%                                                                      |
| Median onset absolute error                                        | <= 40 ms                                                                    |
| p95 onset absolute error                                           | <= 100 ms                                                                   |
| Coarse hand fret region within +/- 1 fret when visibility is valid | >= 85%                                                                      |
| Automatic fretboard detection on supported fixtures                | >= 90% valid detection, <= 2% confident false detection                     |
| Fusion improvement                                                 | >= 5 percentage-point improvement on a predefined ambiguous-position subset |
| Protection of reliable audio                                       | <= 1 percentage-point regression on the high-confidence audio subset        |

The evaluation report must also include failure slices for noise, clipping, dynamics, guitar type, camera angle, lighting, occlusion, skin tone, handedness when available, and hardware class.

## 12. Privacy and security requirements

- Raw microphone and webcam streams remain on the device during normal operation.
- Remote analysis is opt-in and operates on minimized structured events by default.
- The UI explains device permissions before requesting them.
- The UI displays when capture is active.
- OpenAI credentials remain on a server boundary and are never embedded in client assets.
- Diagnostic and error reporting must not include raw media or secrets.
- Stored sessions have visible deletion controls.
- Export is a deliberate user action.
- Third-party dependencies and model licenses are documented and reviewed.

## 13. Accessibility requirements

- All essential workflows are keyboard operable.
- Permission, device, recording, analysis, confidence, and error states have accessible names and text equivalents.
- Color is not the only way provisional, finalized, uncertain, and corrected states are distinguished.
- Focus order and focus restoration are predictable.
- Motion-heavy visualizations respect reduced-motion preferences.
- Text and essential overlays meet WCAG AA contrast targets.
- The timeline has a nonvisual structured representation.
- Audio-dependent output is also presented visually; video-dependent status is also presented textually.

## 14. Browser and hardware compatibility behavior

- StringSight performs a capability check before loading large model assets.
- Unsupported browsers receive a precise explanation and a supported-browser recommendation.
- Missing acceleration triggers a measured lower-quality mode where possible rather than an unexplained failure.
- Video frame rate and resolution may adapt before audio processing quality is reduced.
- Audio processing has priority over vision and remote analysis.
- The application records actual capabilities and quality settings in session diagnostics.

## 15. Release acceptance criteria

The first complete release is acceptable only when:

1. All P0 functional requirements in this document are implemented or explicitly reclassified through a recorded decision.
2. Audio-only recognition is a complete, tested product path.
3. Vision can be enabled and disabled without disrupting audio.
4. Audio-only and fused results can be compared on the same paired evaluation corpus.
5. Fusion meets its improvement and protection targets or remains disabled by default.
6. Performance and accuracy reports are generated from versioned fixtures.
7. A 15-minute supported session completes without audio transport failure or unrecoverable UI degradation.
8. Privacy, security, accessibility, and dependency reviews have no unresolved blocking findings.
9. A clean checkout and the deployed application both pass documented judge workflows.
10. The README explains architecture, setup, evaluation, limitations, Codex collaboration, and GPT-5.6 usage.

## 16. Requirement priorities

Unless explicitly changed in an ADR:

- **P0:** Audio-only session, candidate preservation, virtual fretboard, automatic coarse vision, optional fusion, local persistence, evaluation harness, performance observability, privacy, and error recovery.
- **P1:** Fine fingertip mapping, probable tablature editing, MIDI export, GPT-5.6 interpretation, installable PWA behavior, and expanded chord/scale vocabulary.
- **P2:** Alternate tunings, capo support, mobile browsers, additional instruments, dense-mix separation, and native desktop packaging.

P1 features included in the Devpost demonstration must meet the same quality definition as P0 features. A feature is not promoted into the demo solely because a partial implementation exists.

## 17. Decisions fixed by this baseline

- StringSight starts as a website/PWA rather than a native desktop application.
- Audio is implemented and evaluated before vision and remains independently useful.
- Vision narrows audio candidates; it does not replace the audio pipeline.
- Fretboard calibration is automatic. Guided positioning is allowed; manual corner labeling is not part of the supported workflow.
- The system represents ambiguity explicitly.
- Raw media remains local by default.
- GPT-5.6 operates on structured results outside the real-time loop.
- Tests and evaluation fixtures are part of each subsystem, not a final hardening phase.
