import type { DailyQuest, QuestStatus } from "../../game/dailyQuests";
import { getMonday } from "../../game/dailyQuests";
import { QuestCard } from "./QuestCard";

type WeekGridProps = {
  weekStart: Date;
  quests: DailyQuest[];
  onDayClick: (date: string) => void;
  onStatusChange: (id: string, status: QuestStatus) => void;
  onDelete: (id: string) => void;
  onWeekChange: (delta: number) => void;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return formatDateStr(new Date());
}

export function WeekGrid({ weekStart, quests, onDayClick, onStatusChange, onDelete, onWeekChange }: WeekGridProps) {
  const monday = getMonday(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = todayStr();

  return (
    <div className="week-grid">
      <div className="week-grid-nav">
        <button type="button" className="week-nav-btn" onClick={() => onWeekChange(-1)}>
          ◀
        </button>
        <span className="week-nav-label">
          {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
          {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <button type="button" className="week-nav-btn" onClick={() => onWeekChange(1)}>
          ▶
        </button>
      </div>

      <div className="week-grid-header">
        {DAY_NAMES.map((name) => (
          <span key={name} className="week-grid-day-name">
            {name}
          </span>
        ))}
      </div>

      <div className="week-grid-body">
        {days.map((day) => {
          const dateStr = formatDateStr(day);
          const dayQuests = quests.filter((q) => q.date === dateStr);
          const isToday = dateStr === today;

          return (
            <div
              key={dateStr}
              className={`week-grid-cell ${isToday ? "is-today" : ""}`}
              onClick={() => onDayClick(dateStr)}
            >
              <span className="week-cell-date">{day.getDate()}</span>
              <div className="week-cell-quests">
                {dayQuests.slice(0, 3).map((q) => (
                  <QuestCard key={q.id} quest={q} compact onStatusChange={onStatusChange} onDelete={onDelete} />
                ))}
                {dayQuests.length > 3 && (
                  <span className="week-cell-more">+{dayQuests.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
