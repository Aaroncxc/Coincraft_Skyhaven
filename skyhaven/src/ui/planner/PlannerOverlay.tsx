import { useCallback, useState } from "react";
import type { DailyQuest, QuestStatus } from "../../game/dailyQuests";
import {
  createQuest,
  getMonday,
  getQuestXp,
  todayDateStr,
} from "../../game/dailyQuests";
import type { ActionType } from "../../game/types";
import { DayTimeline } from "./DayTimeline";
import { WeekGrid } from "./WeekGrid";
import { MonthGrid } from "./MonthGrid";

type PlannerTab = "today" | "week" | "month";

type PlannerOverlayProps = {
  open: boolean;
  onClose: () => void;
  quests: DailyQuest[];
  onQuestsChange: (quests: DailyQuest[]) => void;
  onQuestCompleted?: (quest: DailyQuest, xp: number) => void;
};

export function PlannerOverlay({ open, onClose, quests, onQuestsChange, onQuestCompleted }: PlannerOverlayProps) {
  const [tab, setTab] = useState<PlannerTab>("today");
  const [selectedDate, setSelectedDate] = useState(todayDateStr);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const now = new Date();
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthMonth, setMonthMonth] = useState(now.getMonth());

  const handleAddQuest = useCallback(
    (data: { title: string; date: string; startTime?: string; endTime?: string; focusAction?: ActionType }) => {
      const quest = createQuest(data);
      onQuestsChange([...quests, quest]);
    },
    [quests, onQuestsChange]
  );

  const handleStatusChange = useCallback(
    (id: string, status: QuestStatus) => {
      const updated = quests.map((q) => {
        if (q.id !== id) return q;
        const next = { ...q, status };
        if (status === "completed" && q.xpAwarded === 0) {
          next.xpAwarded = getQuestXp(q);
          onQuestCompleted?.(next, next.xpAwarded);
        }
        return next;
      });
      onQuestsChange(updated);
    },
    [quests, onQuestsChange, onQuestCompleted]
  );

  const handleDelete = useCallback(
    (id: string) => {
      onQuestsChange(quests.filter((q) => q.id !== id));
    },
    [quests, onQuestsChange]
  );

  const handleDayClick = useCallback(
    (date: string) => {
      setSelectedDate(date);
      setTab("today");
    },
    []
  );

  const handleWeekChange = useCallback(
    (delta: number) => {
      setWeekStart((prev) => {
        const d = new Date(prev);
        d.setDate(d.getDate() + delta * 7);
        return getMonday(d);
      });
    },
    []
  );

  const handleMonthChange = useCallback(
    (delta: number) => {
      setMonthMonth((prev) => {
        const next = prev + delta;
        if (next < 0) {
          setMonthYear((y) => y - 1);
          return 11;
        }
        if (next > 11) {
          setMonthYear((y) => y + 1);
          return 0;
        }
        return next;
      });
    },
    []
  );

  if (!open) return null;

  const todayQuests = quests.filter((q) => q.date === selectedDate);

  return (
    <div className="planner-overlay" data-no-window-drag="true">
      <div className="planner-backdrop" onClick={onClose} />
      <div className="planner-panel">
        <div className="planner-panel-glass" />

        <div className="planner-header">
          <h2 className="planner-title">Daily Quests</h2>
          <div className="planner-tabs">
            {(["today", "week", "month"] as PlannerTab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`planner-tab ${tab === t ? "is-active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "today" ? "Day" : t === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
          <button type="button" className="planner-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="planner-body">
          {tab === "today" && (
            <DayTimeline
              date={selectedDate}
              quests={todayQuests}
              onAddQuest={handleAddQuest}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          )}
          {tab === "week" && (
            <WeekGrid
              weekStart={weekStart}
              quests={quests}
              onDayClick={handleDayClick}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onWeekChange={handleWeekChange}
            />
          )}
          {tab === "month" && (
            <MonthGrid
              year={monthYear}
              month={monthMonth}
              quests={quests}
              onDayClick={handleDayClick}
              onMonthChange={handleMonthChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
