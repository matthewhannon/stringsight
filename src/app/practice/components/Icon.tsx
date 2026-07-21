type IconName =
  | 'chevron-left'
  | 'close'
  | 'export'
  | 'import'
  | 'menu'
  | 'microphone'
  | 'minus'
  | 'plus'
  | 'record'
  | 'stop';

type IconProps = {
  name: IconName;
};

const paths: Record<IconName, React.ReactNode> = {
  'chevron-left': <path d="m14 18-6-6 6-6" />,
  close: (
    <>
      <path d="m7 7 10 10" />
      <path d="M17 7 7 17" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v7h14v-7" />
    </>
  ),
  import: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  microphone: (
    <>
      <rect height="11" rx="4" width="7" x="8.5" y="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  plus: (
    <>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </>
  ),
  record: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  stop: <rect fill="currentColor" height="11" rx="1" stroke="none" width="11" x="6.5" y="6.5" />,
};

export function Icon({ name }: IconProps) {
  return (
    <svg aria-hidden="true" className="practice-icon" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
        {paths[name]}
      </g>
    </svg>
  );
}
