import { SKYHAVEN_SPRITE_MANIFEST } from "./assets";
import { TILE_UNIT_SIZE } from "./three/assets3d";
import type { AssetKey, CloneDirection, IslandMap, TileDef } from "./types";

export const CUSTOM_ISLAND_STORAGE_KEY = "skyhaven.customIsland.v1";

export type GridCoord = { gx: number; gy: number };

export type VisualCloneTemplate = {
  type: AssetKey;
  layerOrder?: number;
  localYOffset?: number;
  anchorY?: number;
  offsetX?: number;
  offsetY?: number;
  pos3dOffset?: { x: number; y: number; z: number };
  scale3d?: { x: number; y: number; z: number };
  rotY?: number;
  blocked?: boolean;
  vfxEnabled?: boolean;
};

export type CloneLinePreview = {
  validTarget: boolean;
  targetOnRay: boolean;
  cells: GridCoord[];
  blockedCell: GridCoord | null;
};

const CLONE_DIRECTION_STEPS: Record<CloneDirection, GridCoord> = {
  up: { gx: 0, gy: -1 },
  upRight: { gx: 1, gy: -1 },
  right: { gx: 1, gy: 0 },
  downRight: { gx: 1, gy: 1 },
  down: { gx: 0, gy: 1 },
  downLeft: { gx: -1, gy: 1 },
  left: { gx: -1, gy: 0 },
  upLeft: { gx: -1, gy: -1 },
};

const CLONE_DIRECTION_ENTRIES = Object.entries(CLONE_DIRECTION_STEPS) as Array<[CloneDirection, GridCoord]>;

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

export function getDirectionalCloneStep(direction: CloneDirection): GridCoord {
  return CLONE_DIRECTION_STEPS[direction];
}

function getCloneDirectionForTarget(source: GridCoord, target: GridCoord): CloneDirection | null {
  const deltaGx = target.gx - source.gx;
  const deltaGy = target.gy - source.gy;

  if (deltaGx === 0 && deltaGy === 0) {
    return null;
  }

  const deltaLength = Math.hypot(deltaGx, deltaGy);
  let bestDirection: CloneDirection | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const [direction, step] of CLONE_DIRECTION_ENTRIES) {
    const dot = deltaGx * step.gx + deltaGy * step.gy;
    if (dot <= 0) {
      continue;
    }

    const stepLength = Math.hypot(step.gx, step.gy);
    const score = dot / (deltaLength * stepLength);
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}

export function getDirectionalCloneDisabledReason(tile: TileDef | null | undefined): string | null {
  if (!tile) {
    return "Select a tile first.";
  }

  const spriteMeta = SKYHAVEN_SPRITE_MANIFEST.tile[tile.type];
  if (spriteMeta?.gridSpan) {
    return "2x2 tiles cannot be cloned yet.";
  }

  if (tile.decoration) {
    return "Tiles with decoration cannot be cloned yet.";
  }

  return null;
}

export function canDirectionalCloneTile(tile: TileDef | null | undefined): boolean {
  return getDirectionalCloneDisabledReason(tile) === null;
}

export function createVisualCloneTemplate(tile: TileDef): VisualCloneTemplate {
  const basePosX = tile.gx * TILE_UNIT_SIZE;
  const basePosZ = tile.gy * TILE_UNIT_SIZE;

  return {
    type: tile.type,
    layerOrder: tile.layerOrder,
    localYOffset: tile.localYOffset,
    anchorY: tile.anchorY,
    offsetX: tile.offsetX,
    offsetY: tile.offsetY,
    pos3dOffset: tile.pos3d
      ? {
          x: tile.pos3d.x - basePosX,
          y: tile.pos3d.y,
          z: tile.pos3d.z - basePosZ,
        }
      : undefined,
    scale3d: tile.scale3d ? { ...tile.scale3d } : undefined,
    rotY: tile.rotY,
    blocked: tile.blocked,
    vfxEnabled: tile.vfxEnabled,
  };
}

export function instantiateVisualCloneTile(
  template: VisualCloneTemplate,
  gx: number,
  gy: number
): Partial<
  Pick<
    TileDef,
    "type" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "vfxEnabled"
  >
> {
  const nextTile: Partial<
    Pick<
      TileDef,
      "type" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "vfxEnabled"
    >
  > = {
    type: template.type,
    layerOrder: template.layerOrder,
    localYOffset: template.localYOffset,
    anchorY: template.anchorY,
    offsetX: template.offsetX,
    offsetY: template.offsetY,
    scale3d: template.scale3d ? { ...template.scale3d } : undefined,
    rotY: template.rotY,
    blocked: template.blocked,
    vfxEnabled: template.vfxEnabled,
  };

  if (template.pos3dOffset) {
    nextTile.pos3d = {
      x: gx * TILE_UNIT_SIZE + template.pos3dOffset.x,
      y: template.pos3dOffset.y,
      z: gy * TILE_UNIT_SIZE + template.pos3dOffset.z,
    };
  }

  return nextTile;
}

export function getLineClonePreview(
  island: IslandMap,
  sourceTile: TileDef | null | undefined,
  target: GridCoord | null | undefined
): CloneLinePreview {
  if (!sourceTile || !target) {
    return { validTarget: false, targetOnRay: false, cells: [], blockedCell: null };
  }

  if (!canDirectionalCloneTile(sourceTile)) {
    return { validTarget: false, targetOnRay: false, cells: [], blockedCell: null };
  }

  const sourceCoord = { gx: sourceTile.gx, gy: sourceTile.gy };
  const direction = getCloneDirectionForTarget(sourceCoord, target);
  if (!direction) {
    return { validTarget: false, targetOnRay: false, cells: [], blockedCell: null };
  }

  const step = getDirectionalCloneStep(direction);
  const steps = getDirectionalCloneStepCount(sourceCoord, target, step);
  if (steps === null) {
    return { validTarget: false, targetOnRay: false, cells: [], blockedCell: null };
  }
  const snappedTarget = {
    gx: sourceTile.gx + step.gx * steps,
    gy: sourceTile.gy + step.gy * steps,
  };
  const targetOnRay = snappedTarget.gx === target.gx && snappedTarget.gy === target.gy;

  const cells: GridCoord[] = [];
  for (let index = 1; index <= steps; index += 1) {
    const nextCoord = {
      gx: sourceTile.gx + step.gx * index,
      gy: sourceTile.gy + step.gy * index,
    };
    const occupied = island.tiles.some((tile) => tile.gx === nextCoord.gx && tile.gy === nextCoord.gy);
    if (occupied) {
      return {
        validTarget: false,
        targetOnRay,
        cells,
        blockedCell: nextCoord,
      };
    }
    cells.push(nextCoord);
  }

  return {
    validTarget: cells.length > 0,
    targetOnRay,
    cells,
    blockedCell: null,
  };
}

export function addTile(
  island: IslandMap,
  gx: number,
  gy: number,
  type: AssetKey,
  overrides?: Partial<
    Pick<
      TileDef,
      "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "pos3d" | "scale3d" | "rotY" | "blocked"
    >
  >
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
  updates: Partial<Pick<TileDef, "type" | "gx" | "gy" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "decoration" | "decoPos3d" | "decoScale3d" | "decoRotY" | "vfxEnabled" | "runeVfxLit">>
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

function getDirectionalCloneStepCount(source: GridCoord, target: GridCoord, step: GridCoord): number | null {
  const deltaGx = target.gx - source.gx;
  const deltaGy = target.gy - source.gy;

  const stepLengthSq = step.gx * step.gx + step.gy * step.gy;
  if (stepLengthSq <= 0) {
    return null;
  }

  const projectedSteps = (deltaGx * step.gx + deltaGy * step.gy) / stepLengthSq;
  if (projectedSteps < 1) {
    return null;
  }

  return Math.max(1, Math.round(projectedSteps));
}
