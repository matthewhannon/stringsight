import { useEffect, useRef, type ReactNode } from 'react';

type DrawerProps = {
  children: ReactNode;
  className?: string;
  eyebrow: string;
  id: string;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Drawer({
  children,
  className = '',
  eyebrow,
  id,
  onClose,
  open,
  title,
}: DrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <aside
      aria-hidden={!open}
      aria-labelledby={`${id}-title`}
      aria-modal={open ? 'false' : undefined}
      className={`practice-drawer ${className} ${open ? 'is-open' : ''}`.trim()}
      id={id}
      role="dialog"
    >
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <button
          aria-label={`Close ${eyebrow.toLowerCase()}`}
          onClick={onClose}
          ref={closeButton}
          type="button"
        >
          ×
        </button>
      </header>
      {children}
    </aside>
  );
}
