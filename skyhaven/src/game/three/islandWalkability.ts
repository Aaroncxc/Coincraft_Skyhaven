import type { AssetKey, IslandMap } from "../types";
import { MINE_TILES } from "../types";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { findTopTileAtCell } from "../tileStack";

export function buildWalkableCellSet(island: IslandMap): Set<string> {
  const set = new Set<string>();
  for (const t of island.tiles) {
    if (t.blocked) continue;
    const top = findTopTileAtCell(island, t.gx, t.gy);
    if (top?.blocked) continue;
    const span = SKYHAVEN_SPRITE_MANIFEST.tile[t.type]?.gridSpan;
    const w = span?.w ?? 1;
    const h = span?.h ?? 1;
    if (w > 1 || h > 1) {
      if (top?.id !== t.id) continue;
      for (let gy = t.gy; gy < t.gy + h; gy += 1) {
        for (let gx = t.gx; gx < t.gx + w; gx += 1) {
          const ct = findTopTileAtCell(island, gx, gy);
          if (ct?.blocked) continue;
          set.add(`${gx},${gy}`);
        }
      }
    } else {
      set.add(`${t.gx},${t.gy}`);
    }
  }
  return set;
}

/** Cells covered by multi-tile blocked POIs (gridSpan), including anchor. */
export function buildBlockedFootprintSet(island: IslandMap): Set<string> {
  const set = new Set<string>();
  for (const t of island.tiles) {
    if (!t.blocked) continue;
    const span = SKYHAVEN_SPRITE_MANIFEST.tile[t.type]?.gridSpan;
    const w = span?.w ?? 1;
    const h = span?.h ?? 1;
    for (let gy = t.gy; gy < t.gy + h; gy++) {
      for (let gx = t.gx; gx < t.gx + w; gx++) {
        set.add(`${gx},${gy}`);
      }
    }
  }
  return set;
}

function addManifestGridFootprintForTiles(
  island: IslandMap,
  typePredicate: (type: AssetKey) => boolean,
  into: Set<string>,
): void {
  for (const t of island.tiles) {
    if (!typePredicate(t.type)) continue;
    const span = SKYHAVEN_SPRITE_MANIFEST.tile[t.type]?.gridSpan;
    const w = span?.w ?? 2;
    const h = span?.h ?? 2;
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) {
        into.add(`${t.gx + dx},${t.gy + dy}`);
      }
    }
  }
}

/** User-blocked POI cells + full mine mesh footprint (2×2), even when the tile is not marked blocked. */
export function buildMiningManPatrolBlockedSet(island: IslandMap): Set<string> {
  const set = buildBlockedFootprintSet(island);
  addManifestGridFootprintForTiles(island, (ty) => (MINE_TILES as readonly AssetKey[]).includes(ty), set);
  return set;
}

/** User-blocked POI cells + magic tower 2×2 footprint, even when the tile is not marked blocked. */
export function buildMagicManPatrolBlockedSet(island: IslandMap): Set<string> {
  const set = buildBlockedFootprintSet(island);
  addManifestGridFootprintForTiles(island, (ty) => ty === "magicTower", set);
  return set;
}

export function getWalkableTileList(island: IslandMap): { gx: number; gy: number }[] {
  return island.tiles.filter((t) => !t.blocked).map((t) => ({ gx: t.gx, gy: t.gy }));
}

export function isAvatarCellValid(
  walkable: Set<string>,
  blockedFootprint: Set<string>,
  gx: number,
  gy: number,
): boolean {
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  const key = `${cx},${cy}`;
  return walkable.has(key) && !blockedFootprint.has(key);
}

function parseKey(key: string): { gx: number; gy: number } {
  const [a, b] = key.split(",");
  return { gx: Number(a), gy: Number(b) };
}

/**
 * Nearest cell that is walkable and not inside a blocked POI footprint.
 * Starts BFS from rounded(fromGx, fromGy); expands up to maxRadius (Chebyshev steps).
 */
export function findNearestValidCell(
  fromGx: number,
  fromGy: number,
  walkable: Set<string>,
  blockedFootprint: Set<string>,
  maxRadius = 12,
): { gx: number; gy: number } {
  const sx = Math.round(fromGx);
  const sy = Math.round(fromGy);
  const startKey = `${sx},${sy}`;
  if (walkable.has(startKey) && !blockedFootprint.has(startKey)) {
    return { gx: sx, gy: sy };
  }

  const visited = new Set<string>([startKey]);
  let frontier: { gx: number; gy: number }[] = [{ gx: sx, gy: sy }];
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let depth = 0; depth < maxRadius && frontier.length > 0; depth += 1) {
    const next: { gx: number; gy: number }[] = [];
    for (const p of frontier) {
      for (const [dx, dy] of neighbors) {
        const nx = p.gx + dx;
        const ny = p.gy + dy;
        const key = `${nx},${ny}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (walkable.has(key) && !blockedFootprint.has(key)) {
          return { gx: nx, gy: ny };
        }
        next.push({ gx: nx, gy: ny });
      }
    }
    frontier = next;
  }

  let best: { gx: number; gy: number } | null = null;
  let bestD = Infinity;
  for (const key of walkable) {
    if (blockedFootprint.has(key)) continue;
    const p = parseKey(key);
    const d = Math.abs(p.gx - sx) + Math.abs(p.gy - sy);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best) return best;
  return { gx: sx, gy: sy };
}

/**
 * 4-neighbor BFS on grid cells that pass `isAvatarCellValid` (for NPC patrol target picking).
 */
export function isPatrolCellReachable(
  walkable: Set<string>,
  blockedFootprint: Set<string>,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
  maxExpanded = 260,
): boolean {
  if (!isAvatarCellValid(walkable, blockedFootprint, toGx, toGy)) return false;

  const sx = Math.round(fromGx);
  const sy = Math.round(fromGy);
  const startKey = `${sx},${sy}`;
  if (!isAvatarCellValid(walkable, blockedFootprint, sx, sy)) return false;

  const goalKey = `${toGx},${toGy}`;
  if (startKey === goalKey) return true;

  const visited = new Set<string>([startKey]);
  const queue: string[] = [startKey];
  let qi = 0;
  let expanded = 0;

  while (qi < queue.length && expanded < maxExpanded) {
    const cur = queue[qi++]!;
    const p = parseKey(cur);
    expanded++;

    const neigh: [number, number][] = [
      [p.gx + 1, p.gy],
      [p.gx - 1, p.gy],
      [p.gx, p.gy + 1],
      [p.gx, p.gy - 1],
    ];
    for (const [nx, ny] of neigh) {
      const nk = `${nx},${ny}`;
      if (visited.has(nk)) continue;
      if (!isAvatarCellValid(walkable, blockedFootprint, nx, ny)) continue;
      if (nk === goalKey) return true;
      visited.add(nk);
      queue.push(nk);
    }
  }
  return false;
}

/**
 * Random patrol cell that is actually reachable from the NPC (avoids unreachable picks across gaps / bad layouts).
 */
export function pickReachablePatrolCell(
  walkableTiles: { gx: number; gy: number }[],
  walkable: Set<string>,
  blockedFootprint: Set<string>,
  anchorGx: number,
  anchorGy: number,
  fromGx: number,
  fromGy: number,
  opts?: { anchorRadius?: number; maxBfsNodes?: number },
): { gx: number; gy: number } {
  const anchorRadius = opts?.anchorRadius ?? 16;
  const maxBfs = opts?.maxBfsNodes ?? 280;

  let pool = walkableTiles.filter(
    (t) => Math.abs(t.gx - anchorGx) + Math.abs(t.gy - anchorGy) <= anchorRadius,
  );
  if (pool.length <= 1) pool = walkableTiles;

  const roundFx = Math.round(fromGx);
  const roundFy = Math.round(fromGy);

  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  for (const t of shuffled) {
    if (t.gx === roundFx && t.gy === roundFy) continue;
    if (
      isPatrolCellReachable(walkable, blockedFootprint, fromGx, fromGy, t.gx, t.gy, maxBfs)
    ) {
      return t;
    }
  }

  const safe = findNearestValidCell(anchorGx, anchorGy, walkable, blockedFootprint);
  const alt = shuffled.find((t) => t.gx !== roundFx || t.gy !== roundFy);
  if (safe.gx === roundFx && safe.gy === roundFy && alt) return alt;
  return safe;
}

/** Like line-of-sampling toward a target, but stops at first invalid (walkable + not blocked footprint) cell. */
export function resolveReachableTargetValid(
  walkable: Set<string>,
  blockedFootprint: Set<string>,
  startGx: number,
  startGy: number,
  targetGx: number,
  targetGy: number,
  samples = 12,
): { gx: number; gy: number } {
  let bestGx = startGx;
  let bestGy = startGy;
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const gx = startGx + (targetGx - startGx) * t;
    const gy = startGy + (targetGy - startGy) * t;
    if (!isAvatarCellValid(walkable, blockedFootprint, gx, gy)) {
      break;
    }
    bestGx = gx;
    bestGy = gy;
  }
  return { gx: bestGx, gy: bestGy };
}
