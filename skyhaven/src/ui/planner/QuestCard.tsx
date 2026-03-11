import type { DailyQuest, QuestStatus } from "../../game/dailyQuests";

type QuestCardProps = {
  quest: DailyQuest;
  compact?: boolean;
  onStatusChange?: (id: string, status: QuestStatus) => void;
  onDelete?: (id: string) => void;
  onEdit?: (quest: DailyQuest) => void;
};

const STATUS_COLORS: Record<QuestStatus, string> = {
  planned: "rgba(240, 185, 58, 0.7)",
  active: "rgba(88, 180, 255, 0.8)",
  completed: "rgba(117, 215, 103, 0.8)",
  skipped: "rgba(140, 140, 140, 0.5)",
};

const ACTION_LABELS: Record<string, string> = {
  mining: "Mining",
  farming: "Farming",
  roaming: "Roaming",
  cooking: "Cooking",
};

export function QuestCard({ quest, compact = false, onStatusChange, onDelete, onEdit }: QuestCardProps) {
  const statusColor = STATUS_COLORS[quest.status];
  const timeLabel =
    quest.startTime && quest.endTime ? `${quest.startTime} - ${quest.endTime}` : quest.startTime ?? "";

  if (compact) {
    return (
      <div
        className="quest-card is-compact"
        style={{ borderLeftColor: statusColor }}
        onClick={() => onEdit?.(quest)}
      >
        <span className="quest-card-title">{quest.title}</span>
        {timeLabel && <span className="quest-card-time">{timeLabel}</span>}
      </div>
    );
  }

  return (
    <div className="quest-card" style={{ borderLeftColor: statusColor }}>
      <div className="quest-card-header">
        <span className="quest-card-title">{quest.title}</span>
        <div className="quest-card-actions">
          {quest.status === "planned" && (
            <button
              type="button"
              className="quest-action-btn"
              onClick={() => onStatusChange?.(quest.id, "active")}
              title="Start"
            >
              ▶
            </button>
          )}
          {quest.status === "active" && (
            <button
              type="button"
              className="quest-action-btn is-complete"
              onClick={() => onStatusChange?.(quest.id, "completed")}
              title="Complete"
            >
              ✓
            </button>
          )}
          <button
            type="button"
            className="quest-action-btn is-delete"
            onClick={() => onDelete?.(quest.id)}
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>

      <div className="quest-card-meta">
        {timeLabel && <span className="quest-card-time">{timeLabel}</span>}
        {quest.focusAction && (
          <span className="quest-card-focus">{ACTION_LABELS[quest.focusAction] ?? quest.focusAction}</span>
        )}
        <span className={`quest-card-status is-${quest.status}`}>{quest.status}</span>
      </div>

      {quest.description && <div className="quest-card-desc">{quest.description}</div>}
    </div>
  );
}
