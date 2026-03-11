import type { ProgressionState } from "./types";

export const PROGRESSION_STORAGE_KEY = "skyhaven.progression.v1";
export const LEVEL_CAP = 50;

const BASE_XP_TO_NEXT = 180;
const XP_GROWTH_FACTOR = 1.05;

const DEFAULT_PROGRESSION: ProgressionState = {
  level: 1,
  expInLevel: 0,
  totalExp: 0,
};

function toInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.trunc(value);
}

function clampLevel(level: number): number {
  return Math.min(LEVEL_CAP, Math.max(1, Math.trunc(level)));
}

function normalizeProgression(value: unknown): ProgressionState {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PROGRESSION };
  }

  const candidate = value as Partial<ProgressionState>;
  const level = clampLevel(toInt(candidate.level));
  const totalExp = Math.max(0, toInt(candidate.totalExp));
  const capForLevel = xpToNextLevel(level);
  const expInLevel = level >= LEVEL_CAP ? 0 : Math.min(Math.max(0, toInt(candidate.expInLevel)), Math.max(0, capForLevel - 1));

  return {
    level,
    expInLevel,
    totalExp,
  };
}

export function xpToNextLevel(level: number): number {
  const safeLevel = clampLevel(level);
  if (safeLevel >= LEVEL_CAP) {
    return 0;
  }
  return Math.round(BASE_XP_TO_NEXT * Math.pow(XP_GROWTH_FACTOR, safeLevel - 1));
}

export function hydrateProgression(): ProgressionState {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PROGRESSION };
  }

  const raw = window.localStorage.getItem(PROGRESSION_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_PROGRESSION };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeProgression(parsed);
    if (
      normalized.level !== (parsed as Partial<ProgressionState>).level ||
      normalized.expInLevel !== (parsed as Partial<ProgressionState>).expInLevel ||
      normalized.totalExp !== (parsed as Partial<ProgressionState>).totalExp
    ) {
      persistProgression(normalized);
    }
    return normalized;
  } catch {
    window.localStorage.removeItem(PROGRESSION_STORAGE_KEY);
    return { ...DEFAULT_PROGRESSION };
  }
}

export function persistProgression(state: ProgressionState): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeProgression(state);
  window.localStorage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(normalized));
}

export function awardExp(
  state: ProgressionState,
  gainedExp: number
): { next: ProgressionState; levelUps: number; gainedExp: number } {
  const safeGain = Math.max(0, toInt(gainedExp));
  const current = normalizeProgression(state);
  if (safeGain <= 0) {
    return {
      next: current,
      levelUps: 0,
      gainedExp: 0,
    };
  }

  let level = current.level;
  let expInLevel = current.expInLevel;
  let levelUps = 0;
  let remainingGain = safeGain;

  while (remainingGain > 0 && level < LEVEL_CAP) {
    const needed = xpToNextLevel(level) - expInLevel;
    if (needed <= 0) {
      level += 1;
      expInLevel = 0;
      levelUps += 1;
      continue;
    }

    if (remainingGain < needed) {
      expInLevel += remainingGain;
      remainingGain = 0;
      break;
    }

    remainingGain -= needed;
    level += 1;
    expInLevel = 0;
    levelUps += 1;
  }

  if (level >= LEVEL_CAP) {
    level = LEVEL_CAP;
    expInLevel = 0;
  }

  return {
    next: {
      level,
      expInLevel,
      totalExp: current.totalExp + safeGain,
    },
    levelUps,
    gainedExp: safeGain,
  };
}
