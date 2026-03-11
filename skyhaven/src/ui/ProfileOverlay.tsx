import type { ActionType, ProgressionState } from "../game/types";
import type { ActionStats } from "../game/actionStats";
import type { PlayerProfile } from "../game/profile";

type ProfileOverlayProps = {
  open: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  progression: ProgressionState;
  actionStats: ActionStats;
};

const ACTION_LABELS: Record<ActionType, string> = {
  mining: "Mining",
  farming: "Farming",
  roaming: "Roaming",
  cooking: "Cooking",
  woodcutting: "Woodcutting",
  harvesting: "Harvesting",
};

const ACTION_ORDER: ActionType[] = [
  "mining",
  "farming",
  "roaming",
  "cooking",
  "woodcutting",
  "harvesting",
];

function formatHm(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function ProfileOverlay({
  open,
  onClose,
  profile,
  progression,
  actionStats,
}: ProfileOverlayProps) {
  const totalMs = ACTION_ORDER.reduce((sum, key) => sum + actionStats[key], 0);
  const initials = profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section
      className={`profile-overlay ${open ? "is-open" : ""}`}
      aria-hidden={!open}
      data-no-window-drag="true"
    >
      <div className="profile-panel-glass">
        <button
          type="button"
          className="profile-close-btn"
          onClick={onClose}
          aria-label="Close profile"
        >
          ✕
        </button>

        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-info">
            <span className="profile-name">{profile.name}</span>
            <span className="profile-level">Level {progression.level}</span>
            <span className="profile-date">Since {formatDate(profile.createdAt)}</span>
          </div>
        </div>

        <div className="profile-stats-section">
          <span className="profile-stats-title">Focus Time</span>
          <ul className="profile-stats-list">
            {ACTION_ORDER.map((action) => (
              <li key={action} className="profile-stats-row">
                <span className="profile-stats-label">{ACTION_LABELS[action]}</span>
                <span className="profile-stats-dots" />
                <span className="profile-stats-value">{formatHm(actionStats[action])}</span>
              </li>
            ))}
          </ul>
          <div className="profile-stats-divider" />
          <div className="profile-stats-row profile-stats-total">
            <span className="profile-stats-label">Total</span>
            <span className="profile-stats-dots" />
            <span className="profile-stats-value">{formatHm(totalMs)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
