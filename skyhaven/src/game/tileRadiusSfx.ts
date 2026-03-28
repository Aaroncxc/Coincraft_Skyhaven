/** Width/height in island grid cells (e.g. magic tower POI = 2×2). */
export type TileFootprint = { w: number; h: number };

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Minimum Chebyshev (chessboard) distance from a listener cell to any cell in a
 * rectangle footprint `[originGx, originGx + spanW) × [originGy, originGy + spanH)`.
 */
export function chebyshevDistToRectFootprint(
  pgx: number,
  pgy: number,
  originGx: number,
  originGy: number,
  spanW: number,
  spanH: number,
): number {
  let minD = Infinity;
  for (let x = originGx; x < originGx + spanW; x += 1) {
    for (let y = originGy; y < originGy + spanH; y += 1) {
      const d = Math.max(Math.abs(pgx - x), Math.abs(pgy - y));
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/**
 * TPS / first-person style: loud near the POI, very quiet at 3 tiles, silent from 4+.
 * `tileDist` = Chebyshev distance in whole tiles (see `chebyshevDistToRectFootprint`).
 */
export function tpsTileRadiusGain(tileDist: number): number {
  if (tileDist >= 4) return 0;
  if (tileDist <= 2) return 1;
  return 0.12;
}

function smoothstep01(t: number): number {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
}

/** World-space AABB on XZ for a grid footprint starting at `(originGx, originGy)` with `spanW × spanH` cells. */
export function footprintWorldBoundsXZ(
  originGx: number,
  originGy: number,
  spanW: number,
  spanH: number,
  tileUnitSize: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: originGx * tileUnitSize,
    maxX: (originGx + spanW) * tileUnitSize,
    minZ: originGy * tileUnitSize,
    maxZ: (originGy + spanH) * tileUnitSize,
  };
}

/**
 * Shortest distance in world XZ from `(worldX, worldZ)` to the closed axis-aligned footprint rectangle.
 * Inside or on the edge → `0`.
 */
export function euclideanDistWorldToFootprintRectXZ(
  worldX: number,
  worldZ: number,
  originGx: number,
  originGy: number,
  spanW: number,
  spanH: number,
  tileUnitSize: number,
): number {
  const { minX, maxX, minZ, maxZ } = footprintWorldBoundsXZ(originGx, originGy, spanW, spanH, tileUnitSize);
  const cx = Math.min(Math.max(worldX, minX), maxX);
  const cz = Math.min(Math.max(worldZ, minZ), maxZ);
  return Math.hypot(worldX - cx, worldZ - cz);
}

/** Relative volume in the “far” band (at ~3 tiles), matched to the old stepped curve. */
const TPS_EUCLIDEAN_FAR_GAIN = 0.12;

/**
 * TPS: smooth gain from euclidean ground distance. Full level within 2 tile lengths of the footprint edge,
 * smoothstep down to `TPS_EUCLIDEAN_FAR_GAIN` by 3 tiles, then to 0 by 4 tiles (distances in world units).
 */
export function tpsEuclideanTileRadiusGain(distWorld: number, tileUnitSize: number): number {
  if (tileUnitSize <= 0 || !Number.isFinite(distWorld)) return 0;
  const r1 = 2 * tileUnitSize;
  const r2 = 3 * tileUnitSize;
  const r3 = 4 * tileUnitSize;
  if (distWorld >= r3) return 0;
  if (distWorld <= r1) return 1;
  if (distWorld <= r2) {
    const t = (distWorld - r1) / (r2 - r1);
    return 1 + smoothstep01(t) * (TPS_EUCLIDEAN_FAR_GAIN - 1);
  }
  const t = (distWorld - r2) / (r3 - r2);
  return TPS_EUCLIDEAN_FAR_GAIN * (1 - smoothstep01(t));
}

/**
 * Isometric overview: one shared loop; scale slightly with tower count without
 * growing linearly (avoids stacking N identical loops too loud).
 */
export function isoMultiSourceHumScalar(sourceCount: number): number {
  if (sourceCount <= 0) return 0;
  return Math.min(1 + 0.35 * Math.max(0, sourceCount - 1), 1.65);
}
