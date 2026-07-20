import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ToolButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
};

export function ToolButton({
  children,
  className = '',
  variant = 'secondary',
  ...props
}: ToolButtonProps) {
  return (
    <button
      className={`tool-button tool-button--${variant} ${className}`.trim()}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}
