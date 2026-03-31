import { SKYHAVEN_SPRITE_MANIFEST } from "./assets";
import { DECORATION_TILES, TILE_STACK_WORLD_HEIGHT, type AssetKey, type IslandMap, type TileDef, type TileStackLevel } from "./types";

export const DEFAULT_TILE_STACK_LEVEL: TileStackLevel = 0;
export const UPPER_TILE_STACK_LEVEL: TileStackLevel = 1;

export function normalizeTileStackLevel(stackLevel?: number | null): TileStackLevel {
  return stackLevel === UPPER_TILE_STACK_LEVEL ? UPPER_TILE_STACK_LEVEL : DEFAULT_TILE_STACK_LEVEL;
}

export function getTileStackLevel(tile: Pick<TileDef, "stackLevel"> | null | undefined): TileStackLevel {
  return normalizeTileStackLevel(tile?.stackLevel);
}

export function getTileStackBaseY(stackLevel?: number | null): number {
  return normalizeTileStackLevel(stackLevel) * TILE_STACK_WORLD_HEIGHT;
}

export function getTileSlotKey(gx: number, gy: number, stackLevel?: number | null): string {
  return `${gx},${gy},${normalizeTileStackLevel(stackLevel)}`;
}

export function compareTilesByStack(a: Pick<TileDef, "id" | "stackLevel">, b: Pick<TileDef, "id" | "stackLevel">): number {
  const stackDelta = getTileStackLevel(a) - getTileStackLevel(b);
  if (stackDelta !== 0) return stackDelta;
  return a.id.localeCompare(b.id);
}

export function findTileAtStack(
  island: IslandMap,
  gx: number,
  gy: number,
  stackLevel?: number | null,
): TileDef | null {
  const normalizedStackLevel = normalizeTileStackLevel(stackLevel);
  return island.tiles.find((tile) => tile.gx === gx && tile.gy === gy && getTileStackLevel(tile) === normalizedStackLevel) ?? null;
}

export function findTopTileAtCell(island: IslandMap, gx: number, gy: number): TileDef | null {
  let best: TileDef | null = null;
  for (const tile of island.tiles) {
    if (tile.gx !== gx || tile.gy !== gy) continue;
    if (!best || compareTilesByStack(best, tile) < 0) {
      best = tile;
    }
  }
  return best;
}

export function isUpperLayerTileEligible(type: AssetKey): boolean {
  if ((DECORATION_TILES as readonly string[]).includes(type)) return false;
  const span = SKYHAVEN_SPRITE_MANIFEST.tile[type]?.gridSpan;
  return (span?.w ?? 1) === 1 && (span?.h ?? 1) === 1;
}
