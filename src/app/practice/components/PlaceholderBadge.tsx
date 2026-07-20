type PlaceholderBadgeProps = {
  children: string;
  compact?: boolean;
};

export function PlaceholderBadge({ children, compact = false }: PlaceholderBadgeProps) {
  return (
    <span className={`practice-placeholder-badge ${compact ? 'is-compact' : ''}`.trim()}>
      <span aria-hidden="true">◇</span>
      {children}
    </span>
  );
}
