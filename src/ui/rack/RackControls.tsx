import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type RackStatusTone = 'active' | 'idle' | 'warning' | 'danger';

export type RackStatusProps = {
  children: ReactNode;
  tone?: RackStatusTone;
};

export function RackStatus({ children, tone = 'idle' }: RackStatusProps) {
  return (
    <span className={`ss-rack-status ss-rack-status--${tone}`}>
      <span aria-hidden="true" className="ss-rack-status-light" />
      {children}
    </span>
  );
}

export type RackButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'hardware' | 'primary';
};

export function RackButton({
  className = '',
  type = 'button',
  variant = 'hardware',
  ...props
}: RackButtonProps) {
  return (
    <button
      className={`ss-rack-button ss-rack-button--${variant} ${className}`.trim()}
      type={type}
      {...props}
    />
  );
}

export type RackValueProps = {
  label: string;
  value: ReactNode;
};

export function RackValue({ label, value }: RackValueProps) {
  return (
    <span className="ss-rack-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}
