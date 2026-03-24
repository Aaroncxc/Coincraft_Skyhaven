import { SKYHAVEN_SPRITE_MANIFEST } from "./assets";
import type { AssetKey, FocusDuration, IslandId, IslandMap, PoiActionType, TileDef } from "./types";
import { buildBlockedFootprintSet, buildWalkableCellSet } from "./three/islandWalkability";

export type PoiActionDefinition = {
  actionType: PoiActionType;
  label: string;
  tileTypes: readonly AssetKey[];
  interactRadius: number;
};

export type PoiActionCandidate = {
  actionType: PoiActionType;
  label: string;
  tile: TileDef;
  distance: number;
};

export type PoiActionRequest = {
  actionType: PoiActionType;
  label: string;
  islandId: IslandId;
  tileType: AssetKey;
  tileGx: number;
  tileGy: number;
  anchorGx: number;
  anchorGy: number;
  facingAngle: number;
};

export const POI_ACTION_DURATION_OPTIONS: readonly FocusDuration[] = [15, 30, 60, 120];

export const POI_ACTIONS: readonly PoiActionDefinition[] = [
  { actionType: "mining", label: "Mining", tileTypes: ["mineTile", "mineTileV2"], interactRadius: 1.65 },
  { actionType: "farming", label: "Farming", tileTypes: ["farmPoi", "poisFarming"], interactRadius: 1.7 },
  { actionType: "magic", label: "Magic", tileTypes: ["magicTower"], interactRadius: 1.75 },
  { actionType: "fight", label: "Fight", tileTypes: ["kaserneTile"], interactRadius: 1.75 },
] as const;

function getGridSpan(tileType: AssetKey): { w: number; h: number } {
  const span = SKYHAVEN_SPRITE_MANIFEST.tile[tileType]?.gridSpan;
  return {
    w: span?.w ?? 1,
    h: span?.h ?? 1,
  };
}

function getFootprintCells(tile: TileDef): Array<{ gx: number; gy: number }> {
  const span = getGridSpan(tile.type);
  const cells: Array<{ gx: number; gy: number }> = [];
  for (let y = 0; y < span.h; y += 1) {
    for (let x = 0; x < span.w; x += 1) {
      cells.push({ gx: tile.gx + x, gy: tile.gy + y });
    }
  }
  return cells;
}

function getPerimeterCells(tile: TileDef): Array<{ gx: number; gy: number }> {
  const span = getGridSpan(tile.type);
  const cells: Array<{ gx: number; gy: number }> = [];
  for (let gy = tile.gy - 1; gy <= tile.gy + span.h; gy += 1) {
    for (let gx = tile.gx - 1; gx <= tile.gx + span.w; gx += 1) {
      const inside = gx >= tile.gx && gx < tile.gx + span.w && gy >= tile.gy && gy < tile.gy + span.h;
      if (inside) continue;
      const touchesFootprint =
        gx >= tile.gx - 1 && gx <= tile.gx + span.w && gy >= tile.gy - 1 && gy <= tile.gy + span.h;
      if (touchesFootprint) {
        cells.push({ gx, gy });
      }
    }
  }
  return cells;
}

function getFootprintDistance(gx: number, gy: number, tile: TileDef): number {
  let best = Infinity;
  for (const cell of getFootprintCells(tile)) {
    const d = Math.hypot(gx - cell.gx, gy - cell.gy);
    if (d < best) best = d;
  }
  return best;
}

export function findNearbyPoiAction(island: IslandMap, gx: number, gy: number): PoiActionCandidate | null {
  let best: PoiActionCandidate | null = null;
  for (const tile of island.tiles) {
    const def = POI_ACTIONS.find((entry) => entry.tileTypes.includes(tile.type));
    if (!def) continue;
    const distance = getFootprintDistance(gx, gy, tile);
    if (distance > def.interactRadius) continue;
    if (!best || distance < best.distance) {
      best = {
        actionType: def.actionType,
        label: def.label,
        tile,
        distance,
      };
    }
  }
  return best;
}

export function buildPoiActionRequest(
  islandId: IslandId,
  island: IslandMap,
  playerGx: number,
  playerGy: number,
  candidate: PoiActionCandidate,
): PoiActionRequest | null {
  const walkable = buildWalkableCellSet(island);
  const blocked = buildBlockedFootprintSet(island);
  const anchor = getPerimeterCells(candidate.tile)
    .filter((cell) => walkable.has(`${cell.gx},${cell.gy}`) && !blocked.has(`${cell.gx},${cell.gy}`))
    .sort((a, b) => Math.hypot(a.gx - playerGx, a.gy - playerGy) - Math.hypot(b.gx - playerGx, b.gy - playerGy))[0];

  if (!anchor) return null;

  const span = getGridSpan(candidate.tile.type);
  const centerGx = candidate.tile.gx + (span.w - 1) * 0.5;
  const centerGy = candidate.tile.gy + (span.h - 1) * 0.5;
  const facingAngle = Math.atan2(centerGx - anchor.gx, centerGy - anchor.gy);

  return {
    actionType: candidate.actionType,
    label: candidate.label,
    islandId,
    tileType: candidate.tile.type,
    tileGx: candidate.tile.gx,
    tileGy: candidate.tile.gy,
    anchorGx: anchor.gx,
    anchorGy: anchor.gy,
    facingAngle,
  };
}
