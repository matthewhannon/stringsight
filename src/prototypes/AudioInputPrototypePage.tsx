import { useEffect, useRef, useState } from 'react';

import { Rack, RackModule, RackStatus } from '../ui/rack';

type PrototypeState = 'input-off' | 'listening' | 'recording';
type OpenInformation = 'device' | 'privacy' | null;

type PrototypePresentation = {
  inputOn: boolean;
  recording: boolean;
  timer: string;
};

const presentationByState: Record<PrototypeState, PrototypePresentation> = {
  'input-off': {
    inputOn: false,
    recording: false,
    timer: '00:00.0',
  },
  listening: {
    inputOn: true,
    recording: false,
    timer: '00:00.0',
  },
  recording: {
    inputOn: true,
    recording: true,
    timer: '00:12.4',
  },
};

const deviceOptions = [
  'Nano Cortex (3+4)',
  'Nano Cortex (1+2)',
  'Digital Input (USB3.0 Audio)',
  'Microphone (ROCCAT Juke)',
] as const;

const deviceDisplayNames: Record<(typeof deviceOptions)[number], string> = {
  'Nano Cortex (3+4)': 'NANO CORTEX · INPUTS 3+4',
  'Nano Cortex (1+2)': 'NANO CORTEX · INPUTS 1+2',
  'Digital Input (USB3.0 Audio)': 'DIGITAL INPUT · USB 3.0',
  'Microphone (ROCCAT Juke)': 'ROCCAT JUKE · MICROPHONE',
};

const meterStops = ['−48', '−36', '−24', '−18', '−12', '−6', '−3', '0'] as const;

function PrototypeWaveform({ active }: { active: boolean }) {
  const path = active
    ? 'M 0 50 L 5 50 L 8 42 L 11 61 L 14 36 L 17 67 L 20 45 L 24 53 L 30 49 L 35 50 L 39 28 L 43 72 L 47 39 L 51 61 L 55 46 L 60 52 L 68 49 L 74 50 L 78 34 L 82 66 L 86 41 L 90 58 L 94 48 L 100 50'
    : 'M 0 50 L 100 50';

  return (
    <svg
      aria-label={active ? 'Simulated live input waveform' : 'Input waveform, no active signal'}
      className="waveform audio-input-prototype-waveform"
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 100 100"
    >
      <line className="waveform-center" x1="0" x2="100" y1="50" y2="50" />
      <path className="waveform-line" d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function AudioInputPrototypePage() {
  const [device, setDevice] = useState<(typeof deviceOptions)[number]>(deviceOptions[0]);
  const [openInformation, setOpenInformation] = useState<OpenInformation>(null);
  const [prototypeState, setPrototypeState] = useState<PrototypeState>('input-off');
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceButtonRef = useRef<HTMLButtonElement>(null);
  const sourceControlRef = useRef<HTMLDivElement>(null);
  const sourceOptionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const presentation = presentationByState[prototypeState];

  useEffect(() => {
    if (!sourceOpen) return;

    const selectedIndex = deviceOptions.indexOf(device);
    sourceOptionRefs.current[selectedIndex]?.focus();
  }, [device, sourceOpen]);

  const toggleInput = () => {
    setPrototypeState((current) => (current === 'input-off' ? 'listening' : 'input-off'));
  };

  const toggleRecording = () => {
    setPrototypeState((current) => (current === 'recording' ? 'listening' : 'recording'));
  };

  const focusSourceOption = (index: number) => {
    const wrappedIndex = (index + deviceOptions.length) % deviceOptions.length;
    sourceOptionRefs.current[wrappedIndex]?.focus();
  };

  const selectSource = (option: (typeof deviceOptions)[number]) => {
    setDevice(option);
    setSourceOpen(false);
    window.requestAnimationFrame(() => sourceButtonRef.current?.focus());
  };

  return (
    <div className="rack-workspace audio-input-prototype-page">
      <header className="rack-workspace-header">
        <div className="rack-workspace-title">
          <span className="brand-mark" aria-hidden="true">
            SS
          </span>
          <div>
            <h1>StringSight module workshop</h1>
            <span>Audio input prototype</span>
          </div>
        </div>
        <div className="audio-input-prototype-header-actions">
          <RackStatus>Static prototype</RackStatus>
          <a href="/">Back to current workspace</a>
        </div>
      </header>

      <main className="rack-workspace-main">
        <Rack ariaLabel="StringSight audio-input module prototype">
          <RackModule
            moduleId="audio-input-prototype"
            size="expanded"
            title="Audio input"
            unit="INPUT · 01"
          >
            <section
              aria-label="Static audio input controls"
              className="audio-input-prototype-section"
            >
              <div className="capture-console audio-input-prototype-console">
                <div className="capture-primary audio-input-prototype-signal">
                  <div
                    className={`audio-input-prototype-waveform-frame ${
                      presentation.inputOn ? 'is-active' : 'is-off'
                    }`}
                  >
                    <PrototypeWaveform active={presentation.inputOn} />
                    <time aria-label="Recording duration">{presentation.timer}</time>
                    {!presentation.inputOn && (
                      <span className="audio-input-prototype-waveform-state">Input off</span>
                    )}
                  </div>

                  <div className="audio-input-prototype-level-row">
                    <span className="audio-input-prototype-meter-title">Input level</span>
                    <div
                      aria-label="Simulated input level"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={presentation.inputOn ? 76 : 0}
                      aria-valuetext={
                        presentation.inputOn ? 'Good input level, minus 8.4 dB' : 'No signal'
                      }
                      className="audio-input-prototype-segmented-meter"
                      role="meter"
                    >
                      {meterStops.map((stop, index) => (
                        <span className="audio-input-prototype-meter-stop" key={stop}>
                          <small>{stop}</small>
                          <i
                            className={`${
                              presentation.inputOn && index < 6 ? 'is-lit' : ''
                            } ${index === 5 && presentation.inputOn ? 'is-peak-hold' : ''}`}
                          />
                        </span>
                      ))}
                    </div>
                    <output>{presentation.inputOn ? '−8.4 dB' : 'NO SIGNAL'}</output>
                  </div>

                  <div className="audio-input-prototype-transport" aria-label="Input transport">
                    <div className="audio-input-prototype-input-control">
                      <span className="audio-input-prototype-control-label">Input control</span>
                      <div className="audio-input-prototype-rocker-row">
                        <span>Off</span>
                        <button
                          aria-label="Input"
                          aria-pressed={presentation.inputOn}
                          className={`audio-input-prototype-rocker ${
                            presentation.inputOn ? 'is-active' : ''
                          }`}
                          onClick={toggleInput}
                          type="button"
                        >
                          <span aria-hidden="true" className="audio-input-prototype-rocker-paddle">
                            <i />
                          </span>
                        </button>
                        <span>On</span>
                      </div>
                      <div className="audio-input-prototype-active-state">
                        <span
                          aria-hidden="true"
                          className={`audio-input-prototype-panel-lamp audio-input-prototype-active-lamp ${
                            presentation.inputOn ? 'is-lit' : ''
                          }`}
                        />
                        <output>{presentation.inputOn ? 'ACTIVE' : 'STANDBY'}</output>
                      </div>
                    </div>

                    <div className="audio-input-prototype-status-bank" aria-label="Signal status">
                      <div>
                        <span className="audio-input-prototype-control-label">Signal</span>
                        <span
                          aria-label={presentation.inputOn ? 'Signal present' : 'No signal'}
                          className={`audio-input-prototype-panel-lamp audio-input-prototype-signal-lamp ${
                            presentation.inputOn ? 'is-lit' : ''
                          }`}
                          role="status"
                        />
                      </div>
                      <div>
                        <span className="audio-input-prototype-control-label">Peak</span>
                        <span
                          aria-label="No peak detected"
                          className="audio-input-prototype-panel-lamp audio-input-prototype-peak-lamp"
                          role="status"
                        />
                      </div>
                    </div>

                    <div className="audio-input-prototype-media-control">
                      <span className="audio-input-prototype-control-label">Media</span>
                      <button
                        aria-label="Load audio"
                        className="audio-input-prototype-load-button"
                        type="button"
                      >
                        <span aria-hidden="true" className="audio-input-prototype-load-icon">
                          ⇥
                        </span>
                        <span>Load</span>
                      </button>
                      <span className="audio-input-prototype-engraved-label">Audio file</span>
                    </div>

                    <div className="audio-input-prototype-record-control">
                      <span className="audio-input-prototype-control-label">Record</span>
                      <div className="audio-input-prototype-record-row">
                        <div className="audio-input-prototype-record-bezel">
                          <button
                            aria-label="Record"
                            aria-pressed={presentation.recording}
                            className={`audio-input-prototype-record-button ${
                              presentation.recording ? 'is-recording' : ''
                            }`}
                            disabled={!presentation.inputOn}
                            onClick={toggleRecording}
                            type="button"
                          >
                            <span aria-hidden="true" />
                          </button>
                        </div>
                        <div className="audio-input-prototype-ready-state">
                          <span
                            aria-hidden="true"
                            className={`audio-input-prototype-panel-lamp audio-input-prototype-ready-lamp ${
                              presentation.inputOn ? 'is-lit' : ''
                            }`}
                          />
                          <span>{presentation.inputOn ? 'Ready' : 'Locked'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <aside
                  className="capture-diagnostics audio-input-prototype-controls"
                  aria-label="Input device and details"
                >
                  <span className="audio-input-prototype-source-label" id="prototype-source-label">
                    Source
                  </span>
                  <div
                    className={`audio-input-prototype-source-selector ${
                      sourceOpen ? 'is-open' : ''
                    }`}
                    onBlur={(event) => {
                      if (!sourceControlRef.current?.contains(event.relatedTarget)) {
                        setSourceOpen(false);
                      }
                    }}
                    ref={sourceControlRef}
                  >
                    <button
                      aria-controls="prototype-source-options"
                      aria-expanded={sourceOpen}
                      aria-haspopup="listbox"
                      aria-labelledby="prototype-source-label"
                      className="audio-input-prototype-source-button"
                      onClick={() => setSourceOpen((current) => !current)}
                      onKeyDown={(event) => {
                        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                          event.preventDefault();
                          setSourceOpen(true);
                        }
                      }}
                      ref={sourceButtonRef}
                      role="combobox"
                      type="button"
                    >
                      <span aria-hidden="true" className="audio-input-prototype-source-display">
                        <small>Selected input</small>
                        <strong>{deviceDisplayNames[device]}</strong>
                      </span>
                      <span aria-hidden="true" className="audio-input-prototype-selector-key">
                        <i />
                        <i />
                      </span>
                    </button>

                    {sourceOpen && (
                      <ul
                        aria-label="Available sources"
                        className="audio-input-prototype-source-menu"
                        id="prototype-source-options"
                        role="listbox"
                      >
                        {deviceOptions.map((option, index) => (
                          <li
                            aria-selected={device === option}
                            className={device === option ? 'is-selected' : ''}
                            id={`prototype-source-option-${String(index)}`}
                            key={option}
                            onClick={() => selectSource(option)}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                focusSourceOption(index + 1);
                              } else if (event.key === 'ArrowUp') {
                                event.preventDefault();
                                focusSourceOption(index - 1);
                              } else if (event.key === 'Home') {
                                event.preventDefault();
                                focusSourceOption(0);
                              } else if (event.key === 'End') {
                                event.preventDefault();
                                focusSourceOption(deviceOptions.length - 1);
                              } else if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                selectSource(option);
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                setSourceOpen(false);
                                sourceButtonRef.current?.focus();
                              }
                            }}
                            ref={(element) => {
                              sourceOptionRefs.current[index] = element;
                            }}
                            role="option"
                            tabIndex={-1}
                          >
                            <span>{deviceDisplayNames[option]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="audio-input-prototype-detail-section">
                    <button
                      aria-controls="audio-input-prototype-expanded-information"
                      aria-expanded={openInformation === 'device'}
                      aria-label="Device details"
                      className={`audio-input-prototype-detail-key ${
                        openInformation === 'device' ? 'is-open' : ''
                      }`}
                      onClick={() =>
                        setOpenInformation((current) => (current === 'device' ? null : 'device'))
                      }
                      type="button"
                    >
                      <strong>Detail</strong>
                      <span>Device</span>
                    </button>

                    <button
                      aria-controls="audio-input-prototype-expanded-information"
                      aria-expanded={openInformation === 'privacy'}
                      aria-label="Privacy details"
                      className={`audio-input-prototype-detail-key ${
                        openInformation === 'privacy' ? 'is-open' : ''
                      }`}
                      onClick={() =>
                        setOpenInformation((current) => (current === 'privacy' ? null : 'privacy'))
                      }
                      type="button"
                    >
                      <strong>Detail</strong>
                      <span>Privacy</span>
                    </button>
                  </div>

                  <div className="audio-input-prototype-privacy-status">
                    <span aria-hidden="true" className="audio-input-prototype-privacy-led" />
                    <strong>Audio stays in this browser</strong>
                  </div>

                  <div
                    aria-label="Expanded input information"
                    aria-live="polite"
                    className="audio-input-prototype-detail-viewport"
                    id="audio-input-prototype-expanded-information"
                  >
                    {openInformation === 'device' && (
                      <dl>
                        <div>
                          <dt>Actual sample rate</dt>
                          <dd>48,000 Hz</dd>
                        </div>
                        <div>
                          <dt>Channels</dt>
                          <dd>2</dd>
                        </div>
                        <div>
                          <dt>Channel handling</dt>
                          <dd>Averaged to mono</dd>
                        </div>
                        <div>
                          <dt>Browser processing</dt>
                          <dd>Off</dd>
                        </div>
                        <div>
                          <dt>Transport latency</dt>
                          <dd>0.0 ms</dd>
                        </div>
                        <div>
                          <dt>Dropped audio</dt>
                          <dd>None</dd>
                        </div>
                      </dl>
                    )}
                    {openInformation === 'privacy' && (
                      <p className="audio-input-prototype-privacy-copy">
                        Listening is not saved. Audio is retained only when you record or import a
                        take. Nothing is uploaded automatically, and turning off the input releases
                        the microphone or interface connection.
                      </p>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          </RackModule>
        </Rack>
      </main>

      <footer className="rack-workspace-footer">
        <span>Prototype only · no microphone or file access</span>
        <a href="/">Current StringSight workspace</a>
      </footer>
    </div>
  );
}
