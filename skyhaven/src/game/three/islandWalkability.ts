import type { IslandMap } from "../types";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";

export function buildWalkableCellSet(island: IslandMap): Set<string> {
  const set = new Set<string>();
  for (const t of island.tiles) {
    if (t.blocked) continue;
    set.add(`${t.gx},${t.gy}`);
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
