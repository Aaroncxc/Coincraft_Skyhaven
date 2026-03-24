import type { ActionType, LegacyActionType } from "./types";

export type ActionStats = Record<ActionType, number>;

const STORAGE_KEY = "skyhaven.actionStats.v1";

function emptyStats(): ActionStats {
  return { mining: 0, farming: 0, magic: 0, fight: 0, woodcutting: 0, harvesting: 0 };
}

function migrateLegacyActionStatKey(action: ActionType | LegacyActionType): ActionType {
  if (action === "roaming") return "magic";
  if (action === "cooking") return "fight";
  return action;
}

export function hydrateActionStats(): ActionStats {
  if (typeof window === "undefined") return emptyStats();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Partial<Record<ActionType | LegacyActionType, number>>;
    const stats = emptyStats();
    for (const key of Object.keys(parsed) as Array<ActionType | LegacyActionType>) {
      const normalizedKey = migrateLegacyActionStatKey(key);
      if (typeof parsed[key] === "number" && parsed[key]! >= 0) {
        stats[normalizedKey] += parsed[key]!;
      }
    }
    return stats;
  } catch {
    return emptyStats();
  }
}

export function persistActionStats(stats: ActionStats): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function addActionTime(stats: ActionStats, action: ActionType, ms: number): ActionStats {
  return { ...stats, [action]: stats[action] + Math.max(0, ms) };
}
