import type { ActionType } from "./types";

export type QuestStatus = "planned" | "active" | "completed" | "skipped";

export type DailyQuest = {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  focusAction?: ActionType;
  status: QuestStatus;
  xpAwarded: number;
  createdAt: number;
};

const STORAGE_KEY = "skyhaven.dailyQuests.v1";

let idCounter = Date.now();

export function generateQuestId(): string {
  return `q_${(idCounter++).toString(36)}`;
}

export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function createQuest(partial: {
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  focusAction?: ActionType;
  description?: string;
}): DailyQuest {
  return {
    id: generateQuestId(),
    title: partial.title,
    description: partial.description,
    date: partial.date ?? todayDateStr(),
    startTime: partial.startTime,
    endTime: partial.endTime,
    focusAction: partial.focusAction,
    status: "planned",
    xpAwarded: 0,
    createdAt: Date.now(),
  };
}

export function getQuestXp(quest: DailyQuest): number {
  if (!quest.startTime || !quest.endTime) return 20;
  const [sh, sm] = quest.startTime.split(":").map(Number);
  const [eh, em] = quest.endTime.split(":").map(Number);
  const durationMin = (eh * 60 + em) - (sh * 60 + sm);
  if (durationMin <= 0) return 20;
  if (durationMin < 30) return 20;
  if (durationMin <= 60) return 40;
  if (durationMin <= 120) return 60;
  return 80;
}

export function persistQuests(quests: DailyQuest[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(quests));
}

export function hydrateQuests(): DailyQuest[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q: unknown) =>
        q !== null &&
        typeof q === "object" &&
        typeof (q as DailyQuest).id === "string" &&
        typeof (q as DailyQuest).title === "string"
    );
  } catch {
    return [];
  }
}

export function getQuestsForDate(quests: DailyQuest[], date: string): DailyQuest[] {
  return quests.filter((q) => q.date === date);
}

export function getQuestsForWeek(quests: DailyQuest[], startDate: Date): DailyQuest[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }
  return quests.filter((q) => days.includes(q.date));
}

export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
