import { SKYHAVEN_SPRITE_MANIFEST } from "./assets";
import { DEFAULT_TILE_STACK_LEVEL, getTileSlotKey, getTileStackBaseY, getTileStackLevel, normalizeTileStackLevel } from "./tileStack";
import { TILE_UNIT_SIZE } from "./three/assets3d";
import { VFX_TILE_TYPES, type AssetKey, type CloneDirection, type IslandMap, type TileDef, type TileStackLevel } from "./types";

export const CUSTOM_ISLAND_STORAGE_KEY = "skyhaven.customIsland.v1";

export type GridCoord = { gx: number; gy: number };

export type VisualCloneTemplate = {
  type: AssetKey;
  stackLevel?: TileStackLevel;
  layerOrder?: number;
  localYOffset?: number;
  anchorY?: number;
  offsetX?: number;
  offsetY?: number;
  walkSurfaceOffsetY?: number;
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
const VALID_TILE_TYPES = new Set<AssetKey>(Object.keys(SKYHAVEN_SPRITE_MANIFEST.tile) as AssetKey[]);
const MAX_SANITIZED_TILE_COUNT = 4096;
const MAX_SANITIZED_POI_COUNT = 256;
const MAX_GRID_COORD_ABS = 512;
const MAX_WORLD_POS_ABS = TILE_UNIT_SIZE * MAX_GRID_COORD_ABS * 2;
const MAX_SURFACE_OFFSET_ABS = 32;
const MAX_LAYER_ORDER_ABS = 10_000;
const MAX_PIXEL_OFFSET_ABS = 4_096;
const MAX_ANCHOR_Y = 4;
const MIN_SCALE_COMPONENT = 0.05;
const MAX_SCALE_COMPONENT = 20;
const MAX_ROTATION_ABS = Math.PI * 16;

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

function sanitizeFiniteNumber(
  value: unknown,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY, integer = false } = options;
  const normalized = integer ? Math.round(value) : value;
  if (normalized < min || normalized > max) return undefined;
  return normalized;
}

function sanitizeAssetKey(value: unknown): AssetKey | undefined {
  if (typeof value !== "string") return undefined;
  return VALID_TILE_TYPES.has(value as AssetKey) ? (value as AssetKey) : undefined;
}

function sanitizeVector3(
  value: unknown,
  axisOptions: {
    x: { min: number; max: number };
    y: { min: number; max: number };
    z: { min: number; max: number };
  },
): { x: number; y: number; z: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const vector = value as Record<string, unknown>;
  const x = sanitizeFiniteNumber(vector.x, axisOptions.x);
  const y = sanitizeFiniteNumber(vector.y, axisOptions.y);
  const z = sanitizeFiniteNumber(vector.z, axisOptions.z);
  if (x === undefined || y === undefined || z === undefined) return undefined;
  return { x, y, z };
}

function sanitizeScale3(value: unknown): { x: number; y: number; z: number } | undefined {
  return sanitizeVector3(value, {
    x: { min: MIN_SCALE_COMPONENT, max: MAX_SCALE_COMPONENT },
    y: { min: MIN_SCALE_COMPONENT, max: MAX_SCALE_COMPONENT },
    z: { min: MIN_SCALE_COMPONENT, max: MAX_SCALE_COMPONENT },
  });
}

function makeSafeTileId(value: unknown, gx: number, gy: number, stackLevel: TileStackLevel): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return `c-${gx}-${gy}-${stackLevel}`;
}

function sanitizeTile(value: unknown): TileDef | null {
  if (!value || typeof value !== "object") return null;
  const tile = value as Record<string, unknown>;
  const gx = sanitizeFiniteNumber(tile.gx, { min: -MAX_GRID_COORD_ABS, max: MAX_GRID_COORD_ABS, integer: true });
  const gy = sanitizeFiniteNumber(tile.gy, { min: -MAX_GRID_COORD_ABS, max: MAX_GRID_COORD_ABS, integer: true });
  const type = sanitizeAssetKey(tile.type);
  if (gx === undefined || gy === undefined || !type) return null;

  const stackLevel = normalizeTileStackLevel(
    sanitizeFiniteNumber(tile.stackLevel, { min: 0, max: 1, integer: true }),
  );
  const nextTile: TileDef = {
    id: makeSafeTileId(tile.id, gx, gy, stackLevel),
    gx,
    gy,
    type,
  };

  if (stackLevel !== DEFAULT_TILE_STACK_LEVEL) nextTile.stackLevel = stackLevel;

  const layerOrder = sanitizeFiniteNumber(tile.layerOrder, {
    min: -MAX_LAYER_ORDER_ABS,
    max: MAX_LAYER_ORDER_ABS,
    integer: true,
  });
  if (layerOrder !== undefined) nextTile.layerOrder = layerOrder;

  const localYOffset = sanitizeFiniteNumber(tile.localYOffset, {
    min: -MAX_PIXEL_OFFSET_ABS,
    max: MAX_PIXEL_OFFSET_ABS,
    integer: true,
  });
  if (localYOffset !== undefined) nextTile.localYOffset = localYOffset;

  const anchorY = sanitizeFiniteNumber(tile.anchorY, { min: 0, max: MAX_ANCHOR_Y });
  if (anchorY !== undefined) nextTile.anchorY = anchorY;

  const offsetX = sanitizeFiniteNumber(tile.offsetX, { min: -MAX_PIXEL_OFFSET_ABS, max: MAX_PIXEL_OFFSET_ABS });
  if (offsetX !== undefined) nextTile.offsetX = offsetX;

  const offsetY = sanitizeFiniteNumber(tile.offsetY, { min: -MAX_PIXEL_OFFSET_ABS, max: MAX_PIXEL_OFFSET_ABS });
  if (offsetY !== undefined) nextTile.offsetY = offsetY;

  const walkSurfaceOffsetY = sanitizeFiniteNumber(tile.walkSurfaceOffsetY, {
    min: -MAX_SURFACE_OFFSET_ABS,
    max: MAX_SURFACE_OFFSET_ABS,
  });
  if (walkSurfaceOffsetY !== undefined) nextTile.walkSurfaceOffsetY = walkSurfaceOffsetY;

  const pos3d = sanitizeVector3(tile.pos3d, {
    x: { min: -MAX_WORLD_POS_ABS, max: MAX_WORLD_POS_ABS },
    y: { min: -MAX_WORLD_POS_ABS, max: MAX_WORLD_POS_ABS },
    z: { min: -MAX_WORLD_POS_ABS, max: MAX_WORLD_POS_ABS },
  });
  if (pos3d) nextTile.pos3d = pos3d;

  const scale3d = sanitizeScale3(tile.scale3d);
  if (scale3d) nextTile.scale3d = scale3d;

  const rotY = sanitizeFiniteNumber(tile.rotY, { min: -MAX_ROTATION_ABS, max: MAX_ROTATION_ABS });
  if (rotY !== undefined) nextTile.rotY = rotY;

  if (typeof tile.blocked === "boolean") nextTile.blocked = tile.blocked;

  const decoration = sanitizeAssetKey(tile.decoration);
  if (decoration) nextTile.decoration = decoration;

  const decoPos3d = sanitizeVector3(tile.decoPos3d, {
    x: { min: -MAX_WORLD_POS_ABS, max: MAX_WORLD_POS_ABS },
    y: { min: -MAX_WORLD_POS_ABS, max: MAX_WORLD_POS_ABS },
    z: { min: -MAX_WORLD_POS_ABS, max: MAX_WORLD_POS_ABS },
  });
  if (decoPos3d) nextTile.decoPos3d = decoPos3d;

  const decoScale3d = sanitizeScale3(tile.decoScale3d);
  if (decoScale3d) nextTile.decoScale3d = decoScale3d;

  const decoRotY = sanitizeFiniteNumber(tile.decoRotY, { min: -MAX_ROTATION_ABS, max: MAX_ROTATION_ABS });
  if (decoRotY !== undefined) nextTile.decoRotY = decoRotY;

  if (typeof tile.vfxEnabled === "boolean") nextTile.vfxEnabled = tile.vfxEnabled;
  if (typeof tile.runeVfxLit === "boolean") nextTile.runeVfxLit = tile.runeVfxLit;

  return nextTile;
}

function sanitizeIslandMap(value: unknown, fallback: IslandMap): { island: IslandMap; changed: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const island = value as Record<string, unknown>;

  const tileW = sanitizeFiniteNumber(island.tileW, { min: 1, max: MAX_PIXEL_OFFSET_ABS }) ?? fallback.tileW;
  const tileH = sanitizeFiniteNumber(island.tileH, { min: 1, max: MAX_PIXEL_OFFSET_ABS }) ?? fallback.tileH;
  if (!Array.isArray(island.tiles)) return null;

  let changed = tileW !== island.tileW || tileH !== island.tileH;
  const tileSlots = new Map<string, TileDef>();
  for (const rawTile of island.tiles.slice(0, MAX_SANITIZED_TILE_COUNT)) {
    const safeTile = sanitizeTile(rawTile);
    if (!safeTile) {
      changed = true;
      continue;
    }
    const slotKey = getTileSlotKey(safeTile.gx, safeTile.gy, safeTile.stackLevel);
    if (tileSlots.has(slotKey)) {
      changed = true;
    }
    tileSlots.set(slotKey, safeTile);
  }
  if ((island.tiles as unknown[]).length > MAX_SANITIZED_TILE_COUNT) {
    changed = true;
  }

  const usedIds = new Set<string>();
  const safeTiles = Array.from(tileSlots.values()).map((tile) => {
    let nextId = tile.id;
    if (usedIds.has(nextId)) {
      changed = true;
      let suffix = 2;
      while (usedIds.has(`${tile.id}-${suffix}`)) suffix += 1;
      nextId = `${tile.id}-${suffix}`;
    }
    usedIds.add(nextId);
    return nextId === tile.id ? tile : { ...tile, id: nextId };
  });
  if (safeTiles.length === 0) return null;

  let safePoi: IslandMap["poi"] = [];
  if (Array.isArray(island.poi)) {
    safePoi = island.poi.slice(0, MAX_SANITIZED_POI_COUNT).flatMap((rawPoi, index) => {
      if (!rawPoi || typeof rawPoi !== "object") {
        changed = true;
        return [];
      }
      const poi = rawPoi as Record<string, unknown>;
      const gx = sanitizeFiniteNumber(poi.gx, { min: -MAX_GRID_COORD_ABS, max: MAX_GRID_COORD_ABS, integer: true });
      const gy = sanitizeFiniteNumber(poi.gy, { min: -MAX_GRID_COORD_ABS, max: MAX_GRID_COORD_ABS, integer: true });
      const interactRadius = sanitizeFiniteNumber(poi.interactRadius, { min: 0.1, max: 10 });
      if (gx === undefined || gy === undefined || interactRadius === undefined || poi.kind !== "mine") {
        changed = true;
        return [];
      }
      const id = typeof poi.id === "string" && poi.id.trim().length > 0 ? poi.id.trim() : `poi-${index}`;
      if (id !== poi.id) changed = true;
      return [{ id, gx, gy, kind: "mine" as const, interactRadius }];
    });
    if ((island.poi as unknown[]).length > MAX_SANITIZED_POI_COUNT) {
      changed = true;
    }
  } else {
    changed = true;
  }

  const spawnObject =
    island.spawn && typeof island.spawn === "object" ? (island.spawn as Record<string, unknown>) : null;
  const safeSpawnGx = sanitizeFiniteNumber(spawnObject?.gx, {
    min: -MAX_GRID_COORD_ABS,
    max: MAX_GRID_COORD_ABS,
    integer: true,
  });
  const safeSpawnGy = sanitizeFiniteNumber(spawnObject?.gy, {
    min: -MAX_GRID_COORD_ABS,
    max: MAX_GRID_COORD_ABS,
    integer: true,
  });
  const tileCellSet = new Set(safeTiles.map((tile) => `${tile.gx},${tile.gy}`));
  let spawn =
    safeSpawnGx !== undefined && safeSpawnGy !== undefined
      ? { gx: safeSpawnGx, gy: safeSpawnGy }
      : { ...fallback.spawn };
  if (safeSpawnGx === undefined || safeSpawnGy === undefined) {
    changed = true;
  }
  if (!tileCellSet.has(`${spawn.gx},${spawn.gy}`)) {
    changed = true;
    const firstTile = safeTiles[0];
    spawn = tileCellSet.has(`${fallback.spawn.gx},${fallback.spawn.gy}`)
      ? { ...fallback.spawn }
      : { gx: firstTile.gx, gy: firstTile.gy };
  }

  return {
    changed,
    island: {
      tileW,
      tileH,
      tiles: safeTiles,
      poi: safePoi,
      spawn,
    },
  };
}

export function hydrateCustomIsland(): IslandMap {
  const fallback = makeDefaultCustomIsland();
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(CUSTOM_ISLAND_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeIslandMap(parsed, fallback);
    if (!sanitized) {
      persistCustomIsland(fallback);
      return fallback;
    }
    if (sanitized.changed) {
      persistCustomIsland(sanitized.island);
    }
    return sanitized.island;
  } catch {
    persistCustomIsland(fallback);
    return fallback;
  }
}

export function persistCustomIsland(island: IslandMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_ISLAND_STORAGE_KEY, JSON.stringify(island));
  } catch (error) {
    console.error("Skyhaven: failed to persist custom island.", error);
  }
}

const ISLAND_OVERRIDE_PREFIX = "skyhaven.islandOverride.";

export function persistIslandOverride(islandId: string, island: IslandMap): void {
  if (typeof window === "undefined") return;
  if (islandId === "custom") {
    persistCustomIsland(island);
    return;
  }
  try {
    window.localStorage.setItem(ISLAND_OVERRIDE_PREFIX + islandId, JSON.stringify(island));
  } catch (error) {
    console.error(`Skyhaven: failed to persist island override for "${islandId}".`, error);
  }
}

export function hydrateIslandOverride(islandId: string, fallback: IslandMap): IslandMap {
  if (typeof window === "undefined" || islandId === "custom") return fallback;
  const raw = window.localStorage.getItem(ISLAND_OVERRIDE_PREFIX + islandId);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const sanitized = sanitizeIslandMap(parsed, fallback);
    if (!sanitized) {
      persistIslandOverride(islandId, fallback);
      return fallback;
    }
    if (sanitized.changed) {
      persistIslandOverride(islandId, sanitized.island);
    }
    return sanitized.island;
  } catch {
    persistIslandOverride(islandId, fallback);
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

  if (getTileStackLevel(tile) !== DEFAULT_TILE_STACK_LEVEL) {
    return "Upper-layer tiles cannot be cloned yet.";
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
    stackLevel: getTileStackLevel(tile),
    layerOrder: tile.layerOrder,
    localYOffset: tile.localYOffset,
    anchorY: tile.anchorY,
    offsetX: tile.offsetX,
    offsetY: tile.offsetY,
    walkSurfaceOffsetY: tile.walkSurfaceOffsetY,
    pos3dOffset: tile.pos3d
      ? {
          x: tile.pos3d.x - basePosX,
          y: tile.pos3d.y - getTileStackBaseY(tile.stackLevel),
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
    "type" | "stackLevel" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "walkSurfaceOffsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "vfxEnabled"
  >
> {
  const stackLevel = template.stackLevel ?? DEFAULT_TILE_STACK_LEVEL;
  const nextTile: Partial<
    Pick<
      TileDef,
      "type" | "stackLevel" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "walkSurfaceOffsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "vfxEnabled"
    >
  > = {
    type: template.type,
    stackLevel,
    layerOrder: template.layerOrder,
    localYOffset: template.localYOffset,
    anchorY: template.anchorY,
    offsetX: template.offsetX,
    offsetY: template.offsetY,
    walkSurfaceOffsetY: template.walkSurfaceOffsetY,
    scale3d: template.scale3d ? { ...template.scale3d } : undefined,
    rotY: template.rotY,
    blocked: template.blocked,
    vfxEnabled: template.vfxEnabled,
  };

  if (template.pos3dOffset) {
    nextTile.pos3d = {
      x: gx * TILE_UNIT_SIZE + template.pos3dOffset.x,
      y: getTileStackBaseY(stackLevel) + template.pos3dOffset.y,
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
  const sourceStackLevel = getTileStackLevel(sourceTile);
  for (let index = 1; index <= steps; index += 1) {
    const nextCoord = {
      gx: sourceTile.gx + step.gx * index,
      gy: sourceTile.gy + step.gy * index,
    };
    const occupied = island.tiles.some(
      (tile) =>
        tile.gx === nextCoord.gx &&
        tile.gy === nextCoord.gy &&
        getTileStackLevel(tile) === sourceStackLevel,
    );
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
      "stackLevel" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "pos3d" | "scale3d" | "rotY" | "blocked"
    >
  >,
  stackLevel: TileStackLevel | undefined = DEFAULT_TILE_STACK_LEVEL,
): IslandMap {
  const key = getTileSlotKey(gx, gy, stackLevel);
  const existing = island.tiles.find((tile) => getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) === key);
  const id = existing ? existing.id : `c-${gx}-${gy}-${stackLevel}`;
  const nextTiles = island.tiles.filter((tile) => getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) !== key);
  const vfxDefault =
    (VFX_TILE_TYPES as readonly string[]).includes(type) ? ({ vfxEnabled: true } as const) : {};
  nextTiles.push({
    id,
    gx,
    gy,
    stackLevel,
    type,
    ...vfxDefault,
    ...overrides,
  });
  return {
    ...island,
    tiles: nextTiles,
  };
}

export function removeTile(
  island: IslandMap,
  gx: number,
  gy: number,
  stackLevel: TileStackLevel | undefined = DEFAULT_TILE_STACK_LEVEL,
): IslandMap {
  const key = getTileSlotKey(gx, gy, stackLevel);
  return {
    ...island,
    tiles: island.tiles.filter((tile) => getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) !== key),
  };
}

export function updateTile(
  island: IslandMap,
  gx: number,
  gy: number,
  updates: Partial<Pick<TileDef, "type" | "gx" | "gy" | "stackLevel" | "layerOrder" | "localYOffset" | "anchorY" | "offsetX" | "offsetY" | "walkSurfaceOffsetY" | "pos3d" | "scale3d" | "rotY" | "blocked" | "decoration" | "decoPos3d" | "decoScale3d" | "decoRotY" | "vfxEnabled" | "runeVfxLit">>,
  stackLevel: TileStackLevel | undefined = DEFAULT_TILE_STACK_LEVEL,
): IslandMap {
  const key = getTileSlotKey(gx, gy, stackLevel);
  return {
    ...island,
    tiles: island.tiles.map((tile) => {
      if (getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) !== key) return tile;
      return { ...tile, ...updates };
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
  from: { gx: number; gy: number; stackLevel?: TileStackLevel },
  to: { gx: number; gy: number }
): MoveTileResult {
  if (from.gx === to.gx && from.gy === to.gy) {
    return { moved: false, reason: "same_cell", attemptedCoord: { gx: to.gx, gy: to.gy } };
  }

  const fromKey = getTileSlotKey(from.gx, from.gy, from.stackLevel);
  const source = island.tiles.find((tile) => getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) === fromKey);
  if (!source) {
    return { moved: false, reason: "source_missing", attemptedCoord: { gx: to.gx, gy: to.gy } };
  }

  const targetOccupied = island.tiles.some(
    (tile) =>
      getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) ===
      getTileSlotKey(to.gx, to.gy, source.stackLevel),
  );
  if (targetOccupied) {
    return { moved: false, reason: "target_occupied", attemptedCoord: { gx: to.gx, gy: to.gy } };
  }

  const nextIsland: IslandMap = {
    ...island,
    tiles: island.tiles.map((tile) => {
      if (getTileSlotKey(tile.gx, tile.gy, tile.stackLevel) !== fromKey) {
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
