import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

export type RackRockerSwitchProps = {
  disabled?: boolean;
  label: string;
  offLabel?: string;
  onLabel?: string;
  onPressedChange: (pressed: boolean) => void;
  pressed: boolean;
  stateLabel: string;
};

export function RackRockerSwitch({
  disabled = false,
  label,
  offLabel = 'Off',
  onLabel = 'On',
  onPressedChange,
  pressed,
  stateLabel,
}: RackRockerSwitchProps) {
  return (
    <div className="ss-rack-rocker-control">
      <span className="ss-rack-control-label">{label}</span>
      <div className="ss-rack-rocker-row">
        <span>{offLabel}</span>
        <button
          aria-label={label}
          aria-pressed={pressed}
          className={`ss-rack-rocker ${pressed ? 'is-active' : ''}`.trim()}
          disabled={disabled}
          onClick={() => onPressedChange(!pressed)}
          type="button"
        >
          <span aria-hidden="true" className="ss-rack-rocker-paddle">
            <i />
          </span>
        </button>
        <span>{onLabel}</span>
      </div>
      <span className="ss-rack-rocker-state">{stateLabel}</span>
    </div>
  );
}

export type RackStatusLampProps = {
  active: boolean;
  label: string;
  status: string;
  tone?: 'active' | 'danger' | 'warning';
};

export function RackStatusLamp({ active, label, status, tone = 'active' }: RackStatusLampProps) {
  return (
    <span className="ss-rack-lamp-control">
      <span className="ss-rack-control-label">{label}</span>
      <span
        aria-label={`${label}: ${status}`}
        className={`ss-rack-panel-lamp ss-rack-panel-lamp--${tone} ${active ? 'is-lit' : ''}`.trim()}
        role="status"
      />
    </span>
  );
}

export type RackSegmentedMeterProps = {
  label: string;
  stops: readonly string[];
  value: number;
  valueText: string;
};

export function RackSegmentedMeter({ label, stops, value, valueText }: RackSegmentedMeterProps) {
  const boundedValue = Math.min(100, Math.max(0, value));
  const litSegments = boundedValue === 0 ? 0 : Math.ceil((boundedValue / 100) * stops.length);

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(boundedValue)}
      aria-valuetext={valueText}
      className="ss-rack-segmented-meter"
      role="meter"
    >
      {stops.map((stop, index) => (
        <span className="ss-rack-meter-stop" key={`${stop}-${String(index)}`}>
          <small>{stop}</small>
          <i
            className={`${index < litSegments ? 'is-lit' : ''} ${
              index === litSegments - 1 ? 'is-current' : ''
            }`.trim()}
          />
        </span>
      ))}
    </div>
  );
}

export type RackUtilityKeyProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  engraving?: string;
};

export function RackUtilityKey({
  children,
  className = '',
  engraving,
  type = 'button',
  ...props
}: RackUtilityKeyProps) {
  return (
    <span className="ss-rack-utility-control">
      <button className={`ss-rack-utility-key ${className}`.trim()} type={type} {...props}>
        {children}
      </button>
      {engraving !== undefined && <span className="ss-rack-engraving">{engraving}</span>}
    </span>
  );
}

export type RackRecordPunchProps = {
  actionLabel?: string;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
  recording: boolean;
  stateLabel: string;
};

export function RackRecordPunch({
  actionLabel = 'Record',
  disabled = false,
  onClick,
  recording,
  pressed = recording,
  stateLabel,
}: RackRecordPunchProps) {
  return (
    <span className="ss-rack-record-control">
      <span className="ss-rack-control-label">Record</span>
      <span className="ss-rack-record-row">
        <span className="ss-rack-record-bezel">
          <button
            aria-label={actionLabel}
            aria-pressed={pressed}
            className={`ss-rack-record-punch ${pressed ? 'is-engaged' : ''} ${
              recording ? 'is-recording' : ''
            }`.trim()}
            disabled={disabled}
            onClick={onClick}
            type="button"
          >
            <span aria-hidden="true" />
          </button>
        </span>
        <span className="ss-rack-record-state">{stateLabel}</span>
      </span>
    </span>
  );
}

export type RackDetailKeyProps = {
  controls: string;
  label: string;
  onClick: () => void;
  open: boolean;
};

export function RackDetailKey({ controls, label, onClick, open }: RackDetailKeyProps) {
  return (
    <button
      aria-controls={controls}
      aria-expanded={open}
      aria-label={`${label} details`}
      className={`ss-rack-detail-key ${open ? 'is-open' : ''}`.trim()}
      onClick={onClick}
      type="button"
    >
      <strong>Detail</strong>
      <span>{label}</span>
    </button>
  );
}

export type RackSourceOption = {
  label: string;
  value: string;
};

export type RackSourceSelectorProps = {
  label: string;
  onChange: (value: string) => void;
  options: readonly RackSourceOption[];
  value: string;
};

export function RackSourceSelector({ label, onChange, options, value }: RackSourceSelectorProps) {
  const generatedId = useId().replaceAll(':', '');
  const [open, setOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState({ maxHeight: 420, placement: 'below' });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (open) optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open) return;

    const positionMenu = () => {
      const button = buttonRef.current;
      if (button === null) return;

      const menuGap = 5;
      const viewportPadding = 12;
      const preferredMaxHeight = 420;
      const buttonBounds = button.getBoundingClientRect();
      const spaceBelow = Math.max(
        0,
        window.innerHeight - buttonBounds.bottom - viewportPadding - menuGap,
      );
      const spaceAbove = Math.max(0, buttonBounds.top - viewportPadding - menuGap);
      const placement =
        spaceBelow >= Math.min(240, preferredMaxHeight) || spaceBelow >= spaceAbove
          ? 'below'
          : 'above';
      const availableSpace = placement === 'below' ? spaceBelow : spaceAbove;

      setMenuLayout({
        maxHeight: Math.max(96, Math.min(preferredMaxHeight, Math.floor(availableSpace))),
        placement,
      });
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  const focusOption = (index: number) => {
    if (options.length === 0) return;
    const wrappedIndex = (index + options.length) % options.length;
    optionRefs.current[wrappedIndex]?.focus();
  };

  const selectOption = (option: RackSourceOption) => {
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <div
      className={`ss-rack-source-selector ${open ? 'is-open' : ''}`.trim()}
      onBlur={(event) => {
        if (!controlRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
      ref={controlRef}
    >
      <span className="ss-rack-source-label" id={`${generatedId}-label`}>
        {label}
      </span>
      <button
        aria-controls={`${generatedId}-options`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="ss-rack-source-button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        ref={buttonRef}
        role="combobox"
        type="button"
      >
        <span aria-hidden="true" className="ss-rack-source-display">
          <small>Selected input</small>
          <strong>{selectedOption?.label ?? 'No input sources found'}</strong>
        </span>
        <span aria-hidden="true" className="ss-rack-selector-key">
          <i />
          <i />
        </span>
      </button>

      {open && options.length > 0 && (
        <ul
          aria-label={`Available ${label.toLocaleLowerCase()}s`}
          className={`ss-rack-source-menu ss-rack-source-menu--${menuLayout.placement}`}
          id={`${generatedId}-options`}
          role="listbox"
          style={{ maxHeight: menuLayout.maxHeight }}
        >
          {options.map((option, index) => (
            <li
              aria-selected={option.value === value}
              className={option.value === value ? 'is-selected' : ''}
              id={`${generatedId}-option-${String(index)}`}
              key={`${option.value}-${String(index)}`}
              onClick={() => selectOption(option)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusOption(index + 1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  focusOption(index - 1);
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  focusOption(0);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  focusOption(options.length - 1);
                } else if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectOption(option);
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                  buttonRef.current?.focus();
                }
              }}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              role="option"
              tabIndex={-1}
            >
              <span>{option.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
