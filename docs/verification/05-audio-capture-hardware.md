# Audio Capture Hardware Verification

**Status:** Core supported-device run passed  
**Browser:** Chrome or Edge desktop  
**Implementation plan:** `docs/plans/05-audio-capture.md`

The first real-hardware run is recorded below. Automated tests cover the full workflow and recovery
paths with a simulated Chromium microphone; optional disconnect recovery remains available for a
later hardware-matrix pass.

## Tester instructions

1. Run `npm run dev` and open `http://127.0.0.1:5173/#capture` in current Chrome or Edge.
2. Confirm the browser has not requested microphone permission before pressing **Start microphone**.
3. Select the intended interface or microphone, press **Start microphone**, and allow permission when prompted.
4. Play or strum normally for about ten seconds.
5. Confirm the waveform and input meter move without audible microphone monitoring or feedback.
6. Confirm the actual sample rate and channel count appear. Record whether echo cancellation, noise suppression, and automatic gain report `Off` or `Not reported`.
7. Stay quiet for at least two seconds and confirm the silence warning appears, then play again and confirm it clears.
8. Press **Stop**. Confirm the state becomes **Recording ready**, buffered duration is plausible, and dropped chunks/discontinuities are ideally zero.
9. Press **Replay analysis**. This intentionally re-feeds PCM through StringSight's local analysis input without playing it through the speakers. Confirm the waveform advances and the state returns to **Recording ready**.
10. Optional: start another short recording and disconnect the selected USB interface. Confirm the device-ended warning appears and captured audio is preserved.

Do not deliberately create dangerously loud input to test clipping. If ordinary playing triggers the clipping warning, note the gain setting and whether lowering gain clears it.

## Result record

- Date: 2026-07-17
- Tester: Project owner
- Browser/version: Codex in-app Chromium browser; exact version not recorded
- Operating system: Windows
- Input device/interface: User-selected two-channel audio input; model not recorded
- Reported sample rate/channels: 48,000 Hz / 2 channels
- Echo cancellation: Off
- Noise suppression: Off
- Automatic gain control: Off
- Approximate recording duration: Short functional test; exact duration not recorded
- Dropped chunks: No issue reported
- Discontinuities: No issue reported
- Maximum displayed transport latency: Not recorded
- Permission behavior passed: Passed after browser restart
- Meter/waveform passed: Passed, including the synthetic −24 dBFS software meter check
- Silence recovery passed: Covered by automation; not recorded during this hardware run
- Stop/replay passed: Passed
- Disconnect recovery passed/skipped: Skipped
- Notes: Initial meter display appeared too low because it used linear amplitude and the interface
  exposed two channels. The final implementation uses a dBFS meter, auto-scales only the visual
  waveform, reports the active channel, and selects the strongest interface channel without
  changing captured PCM. The tester confirmed the resulting capture workflow looked correct.
