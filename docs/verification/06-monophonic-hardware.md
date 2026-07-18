# Monophonic Note Detection Hardware Verification

**Status:** Structured reviewed baseline passed  
**Browser:** Chrome or Edge desktop  
**Implementation plan:** `docs/plans/06-monophonic-onset-and-pitch.md`

Automated DSP, protocol, UI, build, and simulated-browser verification is complete. The procedural
monophonic corpus currently reports:

- 9 deliberately monophonic notes across development and held-out fixtures.
- 100% top-1 and top-3 pitch accuracy.
- 100% onset precision/recall, 0 ms median onset error, and 5 ms p95 onset error.
- 85 ms p95 provisional algorithm latency and 70 ms p95 finalization latency.
- Polyphonic chord fixtures explicitly excluded from the monophonic quality claim.

The machine-readable evidence is `tests/fixtures/reports/monophonic-quality.v1.json`. These are
deterministic synthesized fixtures; they verify the implementation but do not replace real-guitar
evidence.

An informal microphone run on 2026-07-17 confirmed that the live note display responds plausibly.
It did not include reviewed labels, device details, or a preserved WAV, so it is not counted as the
accuracy verification. The in-app **Real-guitar benchmark** section now captures that evidence.

The first structured open-string attempt exposed a phase-sensitive onset bug: six played notes
produced 12 events, with duplicate low-string events spaced approximately 80–110 ms apart. Five
millisecond RMS blocks were following the waveform cycle closely enough to look like repeated
attacks. Analyzer 0.2.1 now uses a fast-attack, 30 ms release energy envelope. The exact fluctuating
low-string pattern is covered by a regression test.

Three subsequent reviewed takes on 2026-07-17 used the Nano Cortex processed USB 3/4 endpoint at
48 kHz. They produced 18 correct top-1 pitches from 18 deliberate attacks with no duplicate or
extra events:

- Open strings `E2 A2 D3 G3 B3 E4`: 6 played, 6 finalized, 6 correct.
- A-minor pentatonic from fifth position `A2 C3 D3 E3 G3 A3 C4 D4 E4`: 9 played, 9 finalized,
  9 correct.
- Repeated `A3` at D-string fret 7: 3 played with muted gaps, 3 finalized, 3 correct.

The exported WAVs peaked at -12.0, -9.2, and -16.1 dBFS respectively. Offline processing of each
WAV reproduced the reviewed pitch sequence and event count. The media and label files remain
outside the repository under their `private-evaluation-only` license; this document records only
aggregate verification results.

## Tester instructions

1. Refresh `http://127.0.0.1:5173/#benchmark` so the optimized worker and benchmark UI load.
2. Select the guitar input, press **Start microphone**, and wait at least one second before playing.
3. Play and let ring: low E open (`E2`), A open (`A2`), D open (`D3`), G open (`G3`), B open
   (`B3`), and high E open (`E4`). Confirm the large note label and timeline are plausible.
4. Play a slow five-note scale with separated attacks. Confirm the onset count and timeline advance
   once per note rather than fluttering repeatedly during each sustain.
5. Repeat the same note three times. Confirm three finalized events are produced.
6. Hold one note, add gentle vibrato, then perform a slow bend. Confirm the pitch movement state may
   appear and cents change without creating a stream of unrelated notes.
7. Mute the strings and remain quiet. Confirm StringSight returns to **Waiting for a note** rather
   than forcing a pitch.
8. Press **Stop**. Confirm the last event finalizes. Press **Replay analysis** and confirm the
   deterministic timeline is rebuilt.
9. In **Ground-truth review**, select the note you truly played for each event or exclude a false
   event. Download both the benchmark WAV and reviewed labels.
10. Record any incorrect octave, delayed/missed attack, false onset, confidence problem, worker
    latency spike, or dropped analysis chunk. A wrong result is useful evidence; do not tune around it
    without preserving the example.

## Result record

- Date: 2026-07-17 (America/Los_Angeles)
- Tester: Project owner
- Browser/version: Codex in-app Chromium browser; exact version not preserved in fixture export
- Input device/interface: Nano Cortex USB 3/4 processed signal, 48 kHz
- Open-string labels passed: yes, 6/6
- Slow scale timeline passed: yes, 9/9 with no extra events
- Repeated-note onsets passed: yes, exactly 3/3
- Bend/vibrato state passed: not exercised in the structured hardware baseline; automated coverage passes
- Silence refusal passed: yes, muted gaps produced no additional events
- Stop/replay determinism passed: yes, offline WAV processing reproduced all event counts and pitches
- Maximum worker processing latency: not preserved in the exported fixture metadata
- Dropped analysis chunks: not preserved in the exported fixture metadata
- Observed octave errors: none across 18 reviewed notes
- Notes: Input-route diagnosis found that Nano Cortex USB 1/2 exposes the quieter dry path while
  USB 3/4 exposes the processed signal. This remains hardware-specific verification context; the
  product now presents a device-neutral input selector and generic multi-input guidance.
