type ClockOverlayProps = {
  timeText: string;
  compact?: boolean;
  minimal?: boolean;
};

export function ClockOverlay({ timeText, compact = false, minimal = false }: ClockOverlayProps) {
  const className = `clock-overlay ${compact ? "is-compact" : ""} ${minimal ? "is-minimal" : ""}`.trim();
  return (
    <div className={className}>
      <span className="clock-value">{timeText}</span>
    </div>
  );
}
