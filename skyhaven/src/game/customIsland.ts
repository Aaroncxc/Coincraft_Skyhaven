import type { AssetKey, IslandMap, TileDef } from "./types";

export const CUSTOM_ISLAND_STORAGE_KEY = "skyhaven.customIsland.v1";

function makeDefaultCustomIsland(): IslandMap {
  const tiles: TileDef[] = [];
  const size = 5;
  for (let gy = 0; gy < size; gy++) {
    for (let gx = 0; gx < size; gx++) {
      tiles.push({
        id: `c-${gx}-${gy}`,
        gx,
        gy,
        type: "baseV4",
      });
    }
  }
  return {
    tileW: 176,
    tileH: 88,
    tiles,
    poi: [],
    spawn: { gx: 2, gy: 2 },
  };
}

function isValidIslandMap(value: unknown): value is IslandMap {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.tileW !== "number" || typeof v.tileH !== "number") return false;
  if (!Array.isArray(v.tiles)) return false;
  for (const t of v.tiles as unknown[]) {
    if (!t || typeof t !== "object") return false;
    const tile = t as Record<string, unknown>;
    if (typeof tile.id !== "string" || typeof tile.gx !== "number" || typeof tile.gy !== "number") return false;
    if (typeof tile.type !== "string") return false;
  }
  if (!Array.isArray(v.poi)) return false;
  if (!v.spawn || typeof (v.spawn as { gx?: number }).gx !== "number" || typeof (v.spawn as { gy?: number }).gy !== "number") return false;
  return true;
}

export function hydrateCustomIsland(): IslandMap {
  if (typeof window === "undefined") return makeDefaultCustomIsland();
  const raw = window.localStorage.getItem(CUSTOM_ISLAND_STORAGE_KEY);
  if (!raw) return makeDefaultCustomIsland();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidIslandMap(parsed)) return makeDefaultCustomIsland();
    return parsed;
  } catch {
    return makeDefaultCustomIsland();
  }
}

export function persistCustomIsland(island: IslandMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOM_ISLAND_STORAGE_KEY, JSON.stringify(island));
}

const ISLAND_OVERRIDE_PREFIX = "skyhaven.islandOverride.";

export function persistIslandOverride(islandId: string, island: IslandMap): void {
  if (typeof window === "undefined") return;
  if (islandId === "custom") {
    persistCustomIsland(island);
    return;
  }
  window.localStorage.setItem(ISLAND_OVERRIDE_PREFIX + islandId, JSON.stringify(island));
}

export function hydrateIslandOverride(islandId: string, fallback: IslandMap): IslandMap {
  if (typeof window === "undefined" || islandId === "custom") return fallback;
  const raw = window.localStorage.getItem(ISLAND_OVERRIDE_PREFIX + islandId);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidIslandMap(parsed)) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

export function coordKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

export function addTile(
  island: IslandMap,
  gx: number,
  gy: number,
  type: AssetKey,
  overrides?: Partial<Pick<TileDef, "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY">>
): IslandMap {
  const key = coordKey(gx, gy);
  const existing = island.tiles.find((t) => coordKey(t.gx, t.gy) === key);
  const id = existing ? existing.id : `c-${gx}-${gy}`;
  const nextTiles = island.tiles.filter((t) => coordKey(t.gx, t.gy) !== key);
  nextTiles.push({
    id,
    gx,
    gy,
    type,
    ...overrides,
  });
  return {
    ...island,
    tiles: nextTiles,
  };
}

export function removeTile(island: IslandMap, gx: number, gy: number): IslandMap {
  const key = coordKey(gx, gy);
  return {
    ...island,
    tiles: island.tiles.filter((t) => coordKey(t.gx, t.gy) !== key),
  };
}

export function updateTile(
  island: IslandMap,
  gx: number,
  gy: number,
  updates: Partial<Pick<TileDef, "type" | "gx" | "gy" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "decoration" | "decoPos3d" | "decoScale3d" | "decoRotY">>
): IslandMap {
  const key = coordKey(gx, gy);
  return {
    ...island,
    tiles: island.tiles.map((t) => {
      if (coordKey(t.gx, t.gy) !== key) return t;
      return { ...t, ...updates };
    }),
  };
}

export type MoveTileResult =
  | { moved: true; island: IslandMap; nextCoord: { gx: number; gy: number } }
  | {
      moved: false;
      reason: "source_missing" | "target_occupied" | "same_cell";
      attemptedCoord: { gx: number; gy: number };
    };

export function moveTile(
  island: IslandMap,
  from: { gx: number; gy: number },
  to: { gx: number; gy: number }
): MoveTileResult {
  if (from.gx === to.gx && from.gy === to.gy) {
    return { moved: false, reason: "same_cell", attemptedCoord: { gx: to.gx, gy: to.gy } };
  }

  const fromKey = coordKey(from.gx, from.gy);
  const toKey = coordKey(to.gx, to.gy);
  const source = island.tiles.find((tile) => coordKey(tile.gx, tile.gy) === fromKey);
  if (!source) {
    return { moved: false, reason: "source_missing", attemptedCoord: { gx: to.gx, gy: to.gy } };
  }

  const targetOccupied = island.tiles.some((tile) => coordKey(tile.gx, tile.gy) === toKey);
  if (targetOccupied) {
    return { moved: false, reason: "target_occupied", attemptedCoord: { gx: to.gx, gy: to.gy } };
  }

  const nextIsland: IslandMap = {
    ...island,
    tiles: island.tiles.map((tile) => {
      if (coordKey(tile.gx, tile.gy) !== fromKey) {
        return tile;
      }
      return {
        ...tile,
        gx: to.gx,
        gy: to.gy,
      };
    }),
  };

  return {
    moved: true,
    island: nextIsland,
    nextCoord: { gx: to.gx, gy: to.gy },
  };
}
