import type { IslandMap } from "./types";
import { MINE_TILES } from "./types";

export type PlayableCharacterId = "default" | "fight_man" | "mining_man" | "magic_man";

const STORAGE_KEY = "skyhaven.playableCharacter.v1";

export const PLAYABLE_CHARACTER_ORDER: PlayableCharacterId[] = [
  "default",
  "fight_man",
  "mining_man",
  "magic_man",
];

export function isPlayableCharacterUnlocked(id: PlayableCharacterId, homeIsland: IslandMap): boolean {
  if (id === "default") return true;
  const tiles = homeIsland.tiles;
  if (id === "fight_man") return tiles.some((t) => t.type === "kaserneTile");
  if (id === "mining_man") return tiles.some((t) => (MINE_TILES as readonly string[]).includes(t.type));
  if (id === "magic_man") return tiles.some((t) => t.type === "magicTower");
  return false;
}

export function hydratePlayableCharacter(): PlayableCharacterId {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isPlayableId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "default";
}

export function persistPlayableCharacter(id: PlayableCharacterId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

function isPlayableId(s: string): s is PlayableCharacterId {
  return (
    s === "default" ||
    s === "fight_man" ||
    s === "mining_man" ||
    s === "magic_man"
  );
}
