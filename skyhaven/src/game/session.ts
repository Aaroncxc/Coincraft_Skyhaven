import type { ActionType, FocusDuration, FocusSession, LegacyActionType, PomodoroPhase } from "./types";

export const SESSION_STORAGE_KEY = "skyhaven.focusSession.v1";
export const DURATION_OPTIONS: FocusDuration[] = [30, 60, 120];
export const MINI_ACTION_DURATION: FocusDuration = 15;

export const POMODORO_WORK_MS = 25 * 60 * 1000;
export const POMODORO_BREAK_MS = 5 * 60 * 1000;
export const POMODORO_LONG_BREAK_MS = 15 * 60 * 1000;
export const POMODORO_TOTAL_ROUNDS = 4;

const DURATION_TO_MS: Record<FocusDuration, number> = {
  15: 15 * 60 * 1000,
  30: 30 * 60 * 1000,
  60: 60 * 60 * 1000,
  120: 120 * 60 * 1000,
};

const ACTION_MIGRATION: Record<LegacyActionType, ActionType> = {
  roaming: "magic",
  cooking: "fight",
};

export function normalizeActionType(actionType: ActionType | LegacyActionType): ActionType {
  return ACTION_MIGRATION[actionType as LegacyActionType] ?? (actionType as ActionType);
}

export function startSession(
  actionType: ActionType,
  durationMin: FocusDuration,
  now = Date.now(),
  metadata: Partial<FocusSession> = {},
): FocusSession {
  return {
    active: true,
    actionType: normalizeActionType(actionType),
    startedAt: now,
    endsAt: now + DURATION_TO_MS[durationMin],
    durationMin,
    ...metadata,
  };
}

export function startPomodoroSession(
  actionType: ActionType,
  now = Date.now(),
  metadata: Partial<FocusSession> = {},
): FocusSession {
  return {
    active: true,
    actionType: normalizeActionType(actionType),
    startedAt: now,
    endsAt: now + POMODORO_WORK_MS,
    durationMin: 30,
    ...metadata,
    pomodoroMode: true,
    pomodoroRound: 1,
    pomodoroTotalRounds: POMODORO_TOTAL_ROUNDS,
    pomodoroPhase: "work",
  };
}

export function advancePomodoroPhase(session: FocusSession, now = Date.now()): FocusSession | null {
  if (!session.pomodoroMode) return null;
  const round = session.pomodoroRound ?? 1;
  const totalRounds = session.pomodoroTotalRounds ?? POMODORO_TOTAL_ROUNDS;

  if (session.pomodoroPhase === "work") {
    const isLastRound = round >= totalRounds;
    const nextPhase: PomodoroPhase = isLastRound ? "longBreak" : "break";
    const breakMs = isLastRound ? POMODORO_LONG_BREAK_MS : POMODORO_BREAK_MS;
    return {
      ...session,
      startedAt: now,
      endsAt: now + breakMs,
      pomodoroPhase: nextPhase,
    };
  }

  if (session.pomodoroPhase === "break") {
    return {
      ...session,
      startedAt: now,
      endsAt: now + POMODORO_WORK_MS,
      pomodoroRound: round + 1,
      pomodoroPhase: "work",
    };
  }

  // longBreak finished -> cycle complete
  return null;
}

export function persistSession(session: FocusSession | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function isValidFocusSession(value: unknown): value is FocusSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<FocusSession> & { actionType?: ActionType | LegacyActionType };
  const normalizedActionType =
    candidate.actionType != null ? normalizeActionType(candidate.actionType) : null;
  return (
    candidate.active === true &&
    (normalizedActionType === "mining" ||
      normalizedActionType === "farming" ||
      normalizedActionType === "magic" ||
      normalizedActionType === "fight" ||
      normalizedActionType === "woodcutting" ||
      normalizedActionType === "harvesting") &&
    typeof candidate.startedAt === "number" &&
    typeof candidate.endsAt === "number" &&
    (candidate.durationMin === 15 || candidate.durationMin === 30 || candidate.durationMin === 60 || candidate.durationMin === 120)
  );
}

export function hydrateSession(now = Date.now()): FocusSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!isValidFocusSession(parsed)) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    if (now >= parsed.endsAt) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    const next: FocusSession = {
      ...(parsed as FocusSession),
      actionType: normalizeActionType((parsed as FocusSession & { actionType: ActionType | LegacyActionType }).actionType),
    };
    if (next.actionType !== (parsed as FocusSession).actionType) {
      persistSession(next);
    }
    return next;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function getRemainingMs(session: FocusSession, now = Date.now()): number {
  return Math.max(0, session.endsAt - now);
}

export function formatDurationHms(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
