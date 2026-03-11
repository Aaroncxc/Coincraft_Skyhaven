import type { DailyQuest } from "../../game/dailyQuests";

type MonthGridProps = {
  year: number;
  month: number;
  quests: DailyQuest[];
  onDayClick: (date: string) => void;
  onMonthChange: (delta: number) => void;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

export function MonthGrid({ year, month, quests, onDayClick, onMonthChange }: MonthGridProps) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const cells: Array<{ day: number; dateStr: string } | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: formatDateStr(year, month, d) });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayStr();
  const questsByDate = new Map<string, DailyQuest[]>();
  for (const q of quests) {
    if (!questsByDate.has(q.date)) questsByDate.set(q.date, []);
    questsByDate.get(q.date)!.push(q);
  }

  return (
    <div className="month-grid">
      <div className="month-grid-nav">
        <button type="button" className="month-nav-btn" onClick={() => onMonthChange(-1)}>
          ◀
        </button>
        <span className="month-nav-label">
          {MONTH_NAMES[month]} {year}
        </span>
        <button type="button" className="month-nav-btn" onClick={() => onMonthChange(1)}>
          ▶
        </button>
      </div>

      <div className="month-grid-header">
        {DAY_NAMES.map((name) => (
          <span key={name} className="month-grid-day-name">
            {name}
          </span>
        ))}
      </div>

      <div className="month-grid-body">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="month-grid-cell is-empty" />;
          }

          const dayQuests = questsByDate.get(cell.dateStr) ?? [];
          const isToday = cell.dateStr === today;
          const completedCount = dayQuests.filter((q) => q.status === "completed").length;
          const plannedCount = dayQuests.filter((q) => q.status === "planned" || q.status === "active").length;

          let dotColor = "transparent";
          if (completedCount > 0 && plannedCount === 0) dotColor = "rgba(117, 215, 103, 0.9)";
          else if (completedCount > 0) dotColor = "rgba(240, 185, 58, 0.9)";
          else if (plannedCount > 0) dotColor = "rgba(240, 185, 58, 0.7)";

          return (
            <div
              key={cell.dateStr}
              className={`month-grid-cell ${isToday ? "is-today" : ""} ${dayQuests.length > 0 ? "has-quests" : ""}`}
              onClick={() => onDayClick(cell.dateStr)}
            >
              <span className="month-cell-day">{cell.day}</span>
              {dayQuests.length > 0 && (
                <div className="month-cell-dots">
                  <span className="month-cell-dot" style={{ background: dotColor }} />
                  {dayQuests.length > 1 && (
                    <span className="month-cell-count">{dayQuests.length}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
