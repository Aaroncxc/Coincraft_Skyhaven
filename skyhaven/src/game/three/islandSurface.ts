import type { AssetKey, IslandMap, TileDef } from "../types";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { TILE_UNIT_SIZE, getModelKeyForAsset } from "./assets3d";
import { buildBlockedFootprintSet } from "./islandWalkability";

export type AssetCollisionProfile = {
  topSurfaceY: number;
  sideWallHeight: number;
  edgeInset: number;
  seamCatchDepth: number;
  stepHeight: number;
  jumpLandHeightMax: number;
};

export const DEFAULT_WALK_SURFACE_OFFSET_Y = 0.82;
export const MAX_STEP_HEIGHT = 0.28;
/** Looser than the player so POI patrol NPCs do not thrash on uneven custom islands. */
export const NPC_PATROL_MAX_STEP_HEIGHT = 0.55;
export const FALL_RESET_MARGIN = 0.75;
export const PLAYER_COLLISION_RADIUS = 0.18;

const SAFE_FLOOR_MARGIN = 1.6;
const HALF_TILE = TILE_UNIT_SIZE * 0.5;

const GRASS_PROFILE: AssetCollisionProfile = {
  topSurfaceY: 0.92,
  sideWallHeight: 0.55,
  edgeInset: 0.12,
  seamCatchDepth: 0.1,
  stepHeight: 0.26,
  jumpLandHeightMax: 1.15,
};

const BASE_STONE_PROFILE: AssetCollisionProfile = {
  topSurfaceY: 0.74,
  sideWallHeight: 0.68,
  edgeInset: 0.08,
  seamCatchDepth: 0.08,
  stepHeight: 0.22,
  jumpLandHeightMax: 1.2,
};

const PATH_PROFILE: AssetCollisionProfile = {
  ...BASE_STONE_PROFILE,
  topSurfaceY: 0.82,
};

const ANCIENT_STONE_PROFILE: AssetCollisionProfile = {
  ...BASE_STONE_PROFILE,
  topSurfaceY: 0.66,
};

/** Dirt should behave exactly like the base grass deck for stepping, landing and support height. */
const DIRT_PROFILE: AssetCollisionProfile = GRASS_PROFILE;

const DEFAULT_COLLISION_PROFILE: AssetCollisionProfile = {
  ...GRASS_PROFILE,
};

type CellBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type WallSegment =
  | { axis: "x"; coord: number; min: number; max: number; normal: -1 | 1 }
  | { axis: "z"; coord: number; min: number; max: number; normal: -1 | 1 };

export type SupportHit = {
  gx: number;
  gy: number;
  tile: TileDef;
  profile: AssetCollisionProfile;
  topY: number;
  bounds: CellBounds;
};

type WalkableCell = SupportHit;

type Bounds = {
  minGx: number;
  maxGx: number;
  minGy: number;
  maxGy: number;
};

export type IslandSurfaceData = {
  walkableCells: Map<string, WalkableCell>;
  blockedCells: Set<string>;
  occupiedCells: Set<string>;
  /** Max walk deck Y per cell for full tile footprint (incl. multi-cell POIs); used so avatars don't sink under tall neighbor meshes at seams. */
  cellFootprintTopY: Map<string, number>;
  outsideEmptyCells: Set<string>;
  boundaryWalls: WallSegment[];
  minSurfaceY: number;
  maxSurfaceY: number;
  safeFloorY: number;
  bounds: Bounds;
};

function cellKey(gx: number, gy: number): string {
  return `${Math.round(gx)},${Math.round(gy)}`;
}

function parseKey(key: string): { gx: number; gy: number } {
  const [gx, gy] = key.split(",").map(Number);
  return { gx, gy };
}

function getCellCenter(g: number): number {
  return g * TILE_UNIT_SIZE;
}

function getBaseCellBounds(gx: number, gy: number, inset: number): CellBounds {
  const cx = getCellCenter(gx);
  const cz = getCellCenter(gy);
  return {
    minX: cx - HALF_TILE + inset,
    maxX: cx + HALF_TILE - inset,
    minZ: cz - HALF_TILE + inset,
    maxZ: cz + HALF_TILE - inset,
  };
}

function buildCellFootprintTopYMap(island: IslandMap): Map<string, number> {
  const map = new Map<string, number>();
  for (const tile of island.tiles) {
    const span = SKYHAVEN_SPRITE_MANIFEST.tile[tile.type]?.gridSpan;
    const w = span?.w ?? 1;
    const h = span?.h ?? 1;
    const profile = getTileCollisionProfile(tile);
    const topY = getTileOriginY(tile) + profile.topSurfaceY;
    for (let iy = 0; iy < h; iy += 1) {
      for (let ix = 0; ix < w; ix += 1) {
        const gx = tile.gx + ix;
        const gy = tile.gy + iy;
        const key = cellKey(gx, gy);
        const prev = map.get(key);
        map.set(key, prev == null ? topY : Math.max(prev, topY));
      }
    }
  }
  return map;
}

/** Highest deck among neighboring cells whose full tile AABB contains (wx, wz). */
function getMaxFootprintSurfaceY(surface: IslandSurfaceData, wx: number, wz: number): number {
  const cx = Math.round(wx / TILE_UNIT_SIZE);
  const cz = Math.round(wz / TILE_UNIT_SIZE);
  let maxY = -Infinity;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const gx = cx + dx;
      const gy = cz + dy;
      const topY = surface.cellFootprintTopY.get(cellKey(gx, gy));
      if (topY == null) continue;
      const b = getBaseCellBounds(gx, gy, 0);
      if (wx >= b.minX && wx <= b.maxX && wz >= b.minZ && wz <= b.maxZ) {
        if (topY > maxY) maxY = topY;
      }
    }
  }
  return maxY;
}

function isWalkableNeighbor(walkableCells: Map<string, WalkableCell>, gx: number, gy: number): boolean {
  return walkableCells.has(cellKey(gx, gy));
}

function isOccupiedNeighbor(occupiedCells: Set<string>, gx: number, gy: number): boolean {
  return occupiedCells.has(cellKey(gx, gy));
}

function isOutsideNeighbor(outsideEmptyCells: Set<string>, gx: number, gy: number): boolean {
  return outsideEmptyCells.has(cellKey(gx, gy));
}

function buildOccupiedCellSet(island: IslandMap): Set<string> {
  const set = new Set<string>();
  for (const tile of island.tiles) {
    set.add(cellKey(tile.gx, tile.gy));
  }
  for (const key of buildBlockedFootprintSet(island)) {
    set.add(key);
  }
  return set;
}

function buildBounds(occupiedCells: Set<string>): Bounds {
  if (occupiedCells.size === 0) {
    return { minGx: -1, maxGx: 5, minGy: -1, maxGy: 5 };
  }

  let minGx = Infinity;
  let maxGx = -Infinity;
  let minGy = Infinity;
  let maxGy = -Infinity;
  for (const key of occupiedCells) {
    const { gx, gy } = parseKey(key);
    if (gx < minGx) minGx = gx;
    if (gx > maxGx) maxGx = gx;
    if (gy < minGy) minGy = gy;
    if (gy > maxGy) maxGy = gy;
  }
  return { minGx, maxGx, minGy, maxGy };
}

function buildOutsideEmptyCells(occupiedCells: Set<string>, bounds: Bounds): Set<string> {
  const outside = new Set<string>();
  const queue: Array<{ gx: number; gy: number }> = [];
  const pad = 2;
  const minGx = bounds.minGx - pad;
  const maxGx = bounds.maxGx + pad;
  const minGy = bounds.minGy - pad;
  const maxGy = bounds.maxGy + pad;

  const push = (gx: number, gy: number) => {
    if (gx < minGx || gx > maxGx || gy < minGy || gy > maxGy) return;
    const key = cellKey(gx, gy);
    if (occupiedCells.has(key) || outside.has(key)) return;
    outside.add(key);
    queue.push({ gx, gy });
  };

  push(minGx, minGy);

  while (queue.length > 0) {
    const current = queue.shift()!;
    push(current.gx + 1, current.gy);
    push(current.gx - 1, current.gy);
    push(current.gx, current.gy + 1);
    push(current.gx, current.gy - 1);
  }

  return outside;
}

function buildCellBounds(
  walkableCells: Map<string, WalkableCell>,
  occupiedCells: Set<string>,
  outsideEmptyCells: Set<string>,
  gx: number,
  gy: number,
  profile: AssetCollisionProfile,
): CellBounds {
  const bounds = getBaseCellBounds(gx, gy, profile.edgeInset);

  const extendSide = (side: "west" | "east" | "north" | "south") => {
    switch (side) {
      case "west":
        bounds.minX = getCellCenter(gx) - HALF_TILE;
        break;
      case "east":
        bounds.maxX = getCellCenter(gx) + HALF_TILE;
        break;
      case "north":
        bounds.minZ = getCellCenter(gy) - HALF_TILE;
        break;
      case "south":
        bounds.maxZ = getCellCenter(gy) + HALF_TILE;
        break;
    }
  };

  const seamSide = (side: "west" | "east" | "north" | "south") => {
    switch (side) {
      case "west":
        bounds.minX = Math.max(bounds.minX - profile.seamCatchDepth, getCellCenter(gx) - HALF_TILE);
        break;
      case "east":
        bounds.maxX = Math.min(bounds.maxX + profile.seamCatchDepth, getCellCenter(gx) + HALF_TILE);
        break;
      case "north":
        bounds.minZ = Math.max(bounds.minZ - profile.seamCatchDepth, getCellCenter(gy) - HALF_TILE);
        break;
      case "south":
        bounds.maxZ = Math.min(bounds.maxZ + profile.seamCatchDepth, getCellCenter(gy) + HALF_TILE);
        break;
    }
  };

  const applyNeighbor = (
    nx: number,
    ny: number,
    side: "west" | "east" | "north" | "south",
  ) => {
    if (isWalkableNeighbor(walkableCells, nx, ny)) {
      seamSide(side);
      return;
    }
    if (isOccupiedNeighbor(occupiedCells, nx, ny) || isOutsideNeighbor(outsideEmptyCells, nx, ny)) {
      extendSide(side);
    }
  };

  applyNeighbor(gx - 1, gy, "west");
  applyNeighbor(gx + 1, gy, "east");
  applyNeighbor(gx, gy - 1, "north");
  applyNeighbor(gx, gy + 1, "south");

  return bounds;
}

function buildBoundaryWalls(
  walkableCells: Map<string, WalkableCell>,
  occupiedCells: Set<string>,
  outsideEmptyCells: Set<string>,
): WallSegment[] {
  const walls: WallSegment[] = [];

  for (const cell of walkableCells.values()) {
    const westKey = cellKey(cell.gx - 1, cell.gy);
    if (!occupiedCells.has(westKey) && outsideEmptyCells.has(westKey)) {
      walls.push({
        axis: "x",
        coord: getCellCenter(cell.gx) - HALF_TILE,
        min: getCellCenter(cell.gy) - HALF_TILE,
        max: getCellCenter(cell.gy) + HALF_TILE,
        normal: -1,
      });
    }

    const eastKey = cellKey(cell.gx + 1, cell.gy);
    if (!occupiedCells.has(eastKey) && outsideEmptyCells.has(eastKey)) {
      walls.push({
        axis: "x",
        coord: getCellCenter(cell.gx) + HALF_TILE,
        min: getCellCenter(cell.gy) - HALF_TILE,
        max: getCellCenter(cell.gy) + HALF_TILE,
        normal: 1,
      });
    }

    const northKey = cellKey(cell.gx, cell.gy - 1);
    if (!occupiedCells.has(northKey) && outsideEmptyCells.has(northKey)) {
      walls.push({
        axis: "z",
        coord: getCellCenter(cell.gy) - HALF_TILE,
        min: getCellCenter(cell.gx) - HALF_TILE,
        max: getCellCenter(cell.gx) + HALF_TILE,
        normal: -1,
      });
    }

    const southKey = cellKey(cell.gx, cell.gy + 1);
    if (!occupiedCells.has(southKey) && outsideEmptyCells.has(southKey)) {
      walls.push({
        axis: "z",
        coord: getCellCenter(cell.gy) + HALF_TILE,
        min: getCellCenter(cell.gx) - HALF_TILE,
        max: getCellCenter(cell.gx) + HALF_TILE,
        normal: 1,
      });
    }
  }

  return walls;
}

function getProfileForAsset(assetKey: AssetKey): AssetCollisionProfile {
  const modelKey = getModelKeyForAsset(assetKey);
  switch (modelKey) {
    case "pathCross":
    case "pathStraight":
      return PATH_PROFILE;
    case "ancientStone":
      return ANCIENT_STONE_PROFILE;
    case "dirt":
      return DIRT_PROFILE;
    case "grass":
      return GRASS_PROFILE;
    default:
      return DEFAULT_COLLISION_PROFILE;
  }
}

export function getTileCollisionProfile(tile: TileDef): AssetCollisionProfile {
  const baseProfile = getProfileForAsset(tile.type);
  if (tile.walkSurfaceOffsetY == null) {
    return baseProfile;
  }
  return {
    ...baseProfile,
    topSurfaceY: tile.walkSurfaceOffsetY,
  };
}

export function getTileOriginY(tile: TileDef): number {
  return tile.pos3d?.y ?? 0;
}

export function getTileWalkSurfaceOffsetY(tile: TileDef): number {
  return getTileCollisionProfile(tile).topSurfaceY;
}

export function getTileSurfaceY(tile: TileDef): number {
  return getTileOriginY(tile) + getTileWalkSurfaceOffsetY(tile);
}

export function buildIslandSurfaceData(island: IslandMap): IslandSurfaceData {
  const occupiedCells = buildOccupiedCellSet(island);
  const blockedCells = buildBlockedFootprintSet(island);
  const bounds = buildBounds(occupiedCells);
  const outsideEmptyCells = buildOutsideEmptyCells(occupiedCells, bounds);
  const walkableCells = new Map<string, WalkableCell>();
  let minSurfaceY = Infinity;
  let maxSurfaceY = -Infinity;

  for (const tile of island.tiles) {
    if (tile.blocked) continue;
    const profile = getTileCollisionProfile(tile);
    const topY = getTileOriginY(tile) + profile.topSurfaceY;
    const key = cellKey(tile.gx, tile.gy);
    walkableCells.set(key, {
      gx: tile.gx,
      gy: tile.gy,
      tile,
      profile,
      topY,
      bounds: getBaseCellBounds(tile.gx, tile.gy, profile.edgeInset),
    });
    if (topY < minSurfaceY) minSurfaceY = topY;
    if (topY > maxSurfaceY) maxSurfaceY = topY;
  }

  for (const cell of walkableCells.values()) {
    cell.bounds = buildCellBounds(
      walkableCells,
      occupiedCells,
      outsideEmptyCells,
      cell.gx,
      cell.gy,
      cell.profile,
    );
  }

  if (!isFinite(minSurfaceY) || !isFinite(maxSurfaceY)) {
    minSurfaceY = DEFAULT_WALK_SURFACE_OFFSET_Y;
    maxSurfaceY = DEFAULT_WALK_SURFACE_OFFSET_Y;
  }

  const cellFootprintTopY = buildCellFootprintTopYMap(island);

  return {
    walkableCells,
    blockedCells,
    occupiedCells,
    cellFootprintTopY,
    outsideEmptyCells,
    boundaryWalls: buildBoundaryWalls(walkableCells, occupiedCells, outsideEmptyCells),
    minSurfaceY,
    maxSurfaceY,
    safeFloorY: minSurfaceY - SAFE_FLOOR_MARGIN,
    bounds,
  };
}

export function getSupportsAt(surface: IslandSurfaceData, worldX: number, worldZ: number): SupportHit[] {
  const candidates: SupportHit[] = [];
  const cx = Math.round(worldX / TILE_UNIT_SIZE);
  const cz = Math.round(worldZ / TILE_UNIT_SIZE);

  for (let gy = cz - 2; gy <= cz + 2; gy += 1) {
    for (let gx = cx - 2; gx <= cx + 2; gx += 1) {
      const cell = surface.walkableCells.get(cellKey(gx, gy));
      if (!cell) continue;
      if (
        worldX >= cell.bounds.minX &&
        worldX <= cell.bounds.maxX &&
        worldZ >= cell.bounds.minZ &&
        worldZ <= cell.bounds.maxZ
      ) {
        candidates.push(cell);
      }
    }
  }

  candidates.sort((a, b) => b.topY - a.topY);
  return candidates;
}

export function getSurfaceYAtCell(surface: IslandSurfaceData, gx: number, gy: number): number {
  return surface.walkableCells.get(cellKey(gx, gy))?.topY ?? surface.safeFloorY;
}

function resolveSupportedSurfaceYAtWorld(
  surface: IslandSurfaceData,
  worldX: number,
  worldZ: number,
  fallbackGx: number,
  fallbackGy: number,
): number | null {
  const hits = getSupportsAt(surface, worldX, worldZ);
  if (hits.length > 0) {
    return hits[0].topY;
  }

  const targetGx = Math.round(fallbackGx);
  const targetGy = Math.round(fallbackGy);
  const targetTopY = surface.walkableCells.get(cellKey(targetGx, targetGy))?.topY;
  if (targetTopY != null) {
    return targetTopY;
  }

  const footprintY = getMaxFootprintSurfaceY(surface, worldX, worldZ);
  if (isFinite(footprintY)) {
    return footprintY;
  }

  return null;
}

function resolveSurfaceYAtWorld(
  surface: IslandSurfaceData,
  worldX: number,
  worldZ: number,
  fallbackGx: number,
  fallbackGy: number,
): number {
  return resolveSupportedSurfaceYAtWorld(surface, worldX, worldZ, fallbackGx, fallbackGy) ?? surface.safeFloorY;
}

export function getSupportedSurfaceYAtWorldGrid(surface: IslandSurfaceData, gx: number, gy: number): number | null {
  const wx = gx * TILE_UNIT_SIZE;
  const wz = gy * TILE_UNIT_SIZE;
  return resolveSupportedSurfaceYAtWorld(surface, wx, wz, gx, gy);
}

/** Ground height under fractional grid coords (support-first, seam-fallback only when no walkable target cell resolves). */
export function getSurfaceYAtWorldGrid(surface: IslandSurfaceData, gx: number, gy: number): number {
  const wx = gx * TILE_UNIT_SIZE;
  const wz = gy * TILE_UNIT_SIZE;
  return resolveSurfaceYAtWorld(surface, wx, wz, gx, gy);
}

/** Same priority as grounded player (`supportY` then deck fallback) for POI patrol NPC feet height. */
export function getNpcSupportWorldY(surface: IslandSurfaceData, gx: number, gy: number): number {
  return getSupportedSurfaceYAtWorldGrid(surface, gx, gy) ?? getSurfaceYAtWorldGrid(surface, gx, gy);
}

export function canStepBetweenCells(
  surface: IslandSurfaceData,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
  maxStepHeight: number = MAX_STEP_HEIGHT,
): boolean {
  const fromKey = cellKey(Math.round(fromGx), Math.round(fromGy));
  const toKey = cellKey(Math.round(toGx), Math.round(toGy));
  if (fromKey === toKey) return true;
  const toCell = surface.walkableCells.get(toKey);
  if (!toCell) return false;
  const fromY = getSurfaceYAtWorldGrid(surface, fromGx, fromGy);
  const toY = getSurfaceYAtWorldGrid(surface, toGx, toGy);
  return Math.abs(toY - fromY) <= maxStepHeight;
}

/**
 * POI patrol NPCs: step check uses each cell's baked `topY` (walk deck), not fractional
 * `getSurfaceYAtWorldGrid` — avoids false rejects and Y flicker on seams between grass tiles.
 */
export function canNpcPatrolStepBetweenCells(
  surface: IslandSurfaceData,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
  maxStepHeight: number = NPC_PATROL_MAX_STEP_HEIGHT,
): boolean {
  const fromKey = cellKey(fromGx, fromGy);
  const toKey = cellKey(toGx, toGy);
  if (fromKey === toKey) return true;
  const toCell = surface.walkableCells.get(toKey);
  if (!toCell) return false;
  const fromCell = surface.walkableCells.get(fromKey);
  const fromY = fromCell?.topY ?? getSurfaceYAtWorldGrid(surface, fromGx, fromGy);
  const toY = toCell.topY;
  return Math.abs(toY - fromY) <= maxStepHeight;
}

function getBlockedBounds(gx: number, gy: number): CellBounds {
  return getBaseCellBounds(gx, gy, 0);
}

function isInsideBounds(bounds: CellBounds, x: number, z: number, radius = 0): boolean {
  return (
    x >= bounds.minX - radius &&
    x <= bounds.maxX + radius &&
    z >= bounds.minZ - radius &&
    z <= bounds.maxZ + radius
  );
}

export function isInsideBlockedCell(surface: IslandSurfaceData, x: number, z: number, radius = 0): boolean {
  const cx = Math.round(x / TILE_UNIT_SIZE);
  const cz = Math.round(z / TILE_UNIT_SIZE);

  for (let gy = cz - 2; gy <= cz + 2; gy += 1) {
    for (let gx = cx - 2; gx <= cx + 2; gx += 1) {
      const key = cellKey(gx, gy);
      if (!surface.blockedCells.has(key)) continue;
      if (isInsideBounds(getBlockedBounds(gx, gy), x, z, radius)) {
        return true;
      }
    }
  }

  return false;
}

export function getBlockedPenetrationDepth(
  surface: IslandSurfaceData,
  x: number,
  z: number,
  radius = 0,
): number {
  const cx = Math.round(x / TILE_UNIT_SIZE);
  const cz = Math.round(z / TILE_UNIT_SIZE);
  let bestDepth = Infinity;

  for (let gy = cz - 2; gy <= cz + 2; gy += 1) {
    for (let gx = cx - 2; gx <= cx + 2; gx += 1) {
      const key = cellKey(gx, gy);
      if (!surface.blockedCells.has(key)) continue;

      const bounds = getBlockedBounds(gx, gy);
      if (!isInsideBounds(bounds, x, z, radius)) continue;

      const minX = bounds.minX - radius;
      const maxX = bounds.maxX + radius;
      const minZ = bounds.minZ - radius;
      const maxZ = bounds.maxZ + radius;
      const depth = Math.min(
        Math.abs(x - minX),
        Math.abs(maxX - x),
        Math.abs(z - minZ),
        Math.abs(maxZ - z),
      );
      bestDepth = Math.min(bestDepth, depth);
    }
  }

  return isFinite(bestDepth) ? bestDepth : 0;
}

function resolveAxisAgainstBoundaryWalls(
  walls: readonly WallSegment[],
  prevPrimary: number,
  nextPrimary: number,
  secondary: number,
  radius: number,
  axis: "x" | "z",
): number {
  let resolved = nextPrimary;
  for (const wall of walls) {
    if (wall.axis !== axis) continue;
    if (secondary < wall.min - radius || secondary > wall.max + radius) continue;

    if (axis === "x") {
      if (wall.normal === 1) {
        const limit = wall.coord - radius;
        if (prevPrimary <= limit && resolved > limit) resolved = limit;
      } else {
        const limit = wall.coord + radius;
        if (prevPrimary >= limit && resolved < limit) resolved = limit;
      }
    } else {
      if (wall.normal === 1) {
        const limit = wall.coord - radius;
        if (prevPrimary <= limit && resolved > limit) resolved = limit;
      } else {
        const limit = wall.coord + radius;
        if (prevPrimary >= limit && resolved < limit) resolved = limit;
      }
    }
  }
  return resolved;
}

function resolveAxisAgainstBlockedCells(
  blockedCells: Set<string>,
  prevPrimary: number,
  nextPrimary: number,
  secondary: number,
  radius: number,
  axis: "x" | "z",
): number {
  let resolved = nextPrimary;
  const center = axis === "x" ? Math.round(resolved / TILE_UNIT_SIZE) : Math.round(secondary / TILE_UNIT_SIZE);
  const other = axis === "x" ? Math.round(secondary / TILE_UNIT_SIZE) : Math.round(resolved / TILE_UNIT_SIZE);

  for (let b = other - 2; b <= other + 2; b += 1) {
    for (let a = center - 2; a <= center + 2; a += 1) {
      const gx = axis === "x" ? a : b;
      const gy = axis === "x" ? b : a;
      const key = cellKey(gx, gy);
      if (!blockedCells.has(key)) continue;

      const bounds = getBlockedBounds(gx, gy);
      if (axis === "x") {
        if (secondary < bounds.minZ - radius || secondary > bounds.maxZ + radius) continue;
        const leftLimit = bounds.minX - radius;
        const rightLimit = bounds.maxX + radius;
        if (prevPrimary <= leftLimit && resolved > leftLimit && resolved < rightLimit) {
          resolved = leftLimit;
        } else if (prevPrimary >= rightLimit && resolved < rightLimit && resolved > leftLimit) {
          resolved = rightLimit;
        }
      } else {
        if (secondary < bounds.minX - radius || secondary > bounds.maxX + radius) continue;
        const nearLimit = bounds.minZ - radius;
        const farLimit = bounds.maxZ + radius;
        if (prevPrimary <= nearLimit && resolved > nearLimit && resolved < farLimit) {
          resolved = nearLimit;
        } else if (prevPrimary >= farLimit && resolved < farLimit && resolved > nearLimit) {
          resolved = farLimit;
        }
      }
    }
  }

  return resolved;
}

export function resolveHorizontalCollision(
  surface: IslandSurfaceData,
  prevX: number,
  prevZ: number,
  nextX: number,
  nextZ: number,
  radius: number = PLAYER_COLLISION_RADIUS,
): { x: number; z: number } {
  let x = nextX;
  let z = nextZ;

  x = resolveAxisAgainstBoundaryWalls(surface.boundaryWalls, prevX, x, prevZ, radius, "x");
  x = resolveAxisAgainstBlockedCells(surface.blockedCells, prevX, x, prevZ, radius, "x");

  z = resolveAxisAgainstBoundaryWalls(surface.boundaryWalls, prevZ, z, x, radius, "z");
  z = resolveAxisAgainstBlockedCells(surface.blockedCells, prevZ, z, x, radius, "z");

  const nextBlockedPenetration = getBlockedPenetrationDepth(surface, x, z, radius);
  if (nextBlockedPenetration > 1e-5) {
    const prevBlockedPenetration = getBlockedPenetrationDepth(surface, prevX, prevZ, radius);
    if (prevBlockedPenetration > 1e-5 && nextBlockedPenetration + 1e-4 < prevBlockedPenetration) {
      return { x, z };
    }
    return { x: prevX, z: prevZ };
  }

  return { x, z };
}
