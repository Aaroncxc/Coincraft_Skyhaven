import { useRef } from "react";
import type { DailyQuest, QuestStatus } from "../../game/dailyQuests";
import { QuestCard } from "./QuestCard";
import { QuickAddQuest } from "./QuickAddQuest";
import type { ActionType } from "../../game/types";

type DayTimelineProps = {
  date: string;
  quests: DailyQuest[];
  onAddQuest: (data: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    focusAction?: ActionType;
  }) => void;
  onStatusChange: (id: string, status: QuestStatus) => void;
  onDelete: (id: string) => void;
};

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6);

function timeToPercent(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return ((h - 6) * 60 + m) / (18 * 60) * 100;
}

export function DayTimeline({ date, quests, onAddQuest, onStatusChange, onDelete }: DayTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timedQuests = quests.filter((q) => q.startTime && q.endTime);
  const untimedQuests = quests.filter((q) => !q.startTime || !q.endTime);

  const nowDate = new Date();
  const isToday =
    date ===
    `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}-${String(nowDate.getDate()).padStart(2, "0")}`;
  const nowPercent = isToday
    ? ((nowDate.getHours() - 6) * 60 + nowDate.getMinutes()) / (18 * 60) * 100
    : -1;

  const dateObj = new Date(date + "T00:00:00");
  const dayLabel = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="day-timeline">
      <div className="day-timeline-header">
        <h3 className="day-timeline-date">{dayLabel}</h3>
        {isToday && <span className="day-timeline-today-badge">Today</span>}
      </div>

      {untimedQuests.length > 0 && (
        <div className="day-timeline-untimed">
          {untimedQuests.map((q) => (
            <QuestCard key={q.id} quest={q} onStatusChange={onStatusChange} onDelete={onDelete} />
          ))}
        </div>
      )}

      <div className="day-timeline-grid" ref={timelineRef}>
        {HOURS.map((hour) => (
          <div key={hour} className="day-timeline-slot">
            <span className="day-timeline-hour">{String(hour).padStart(2, "0")}:00</span>
            <div className="day-timeline-slot-line" />
          </div>
        ))}

        {nowPercent >= 0 && nowPercent <= 100 && (
          <div className="day-timeline-now" style={{ top: `${nowPercent}%` }}>
            <span className="day-timeline-now-dot" />
            <span className="day-timeline-now-line" />
          </div>
        )}

        {timedQuests.map((q) => {
          const top = timeToPercent(q.startTime!);
          const bottom = timeToPercent(q.endTime!);
          const height = Math.max(bottom - top, 2);
          return (
            <div
              key={q.id}
              className={`day-timeline-block is-${q.status}`}
              style={{ top: `${top}%`, height: `${height}%` }}
            >
              <QuestCard quest={q} compact onStatusChange={onStatusChange} onDelete={onDelete} />
            </div>
          );
        })}
      </div>

      <QuickAddQuest date={date} onAdd={onAddQuest} />
    </div>
  );
}
