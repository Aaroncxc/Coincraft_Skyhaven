import type {
  CalibratedMetrics,
  GridCalibration,
  IslandMap,
  TileDef,
  TileSpringState,
  Vec2,
} from "./types";

export function gridToScreen(
  gx: number,
  gy: number,
  originX: number,
  originY: number,
  tileW: number,
  tileH: number
): Vec2 {
  return {
    x: originX + (gx - gy) * (tileW / 2),
    y: originY + (gx + gy) * (tileH / 2),
  };
}

export function screenToGridApprox(
  sx: number,
  sy: number,
  originX: number,
  originY: number,
  tileW: number,
  tileH: number
): Vec2 {
  const localX = sx - originX;
  const localY = sy - originY;
  return {
    x: (localX / (tileW / 2) + localY / (tileH / 2)) / 2,
    y: (localY / (tileH / 2) - localX / (tileW / 2)) / 2,
  };
}

export function buildCalibratedMetrics(
  calibration: GridCalibration,
  width: number,
  height: number
): CalibratedMetrics {
  const stepGX = {
    x: calibration.stepGX.xRatio * width,
    y: calibration.stepGX.yRatio * height,
  };
  const stepGY = {
    x: calibration.stepGY.xRatio * width,
    y: calibration.stepGY.yRatio * height,
  };

  const det = stepGX.x * stepGY.y - stepGY.x * stepGX.y;
  const safeDet = Math.abs(det) < 0.00001 ? 0.00001 : det;

  return {
    origin: {
      gx: calibration.origin.gx,
      gy: calibration.origin.gy,
      x: calibration.origin.xRatio * width,
      y: calibration.origin.yRatio * height,
    },
    stepGX,
    stepGY,
    diamond: {
      halfW: calibration.diamond.halfWRatio * width,
      halfH: calibration.diamond.halfHRatio * height,
    },
    inverse: {
      m11: stepGY.y / safeDet,
      m12: -stepGY.x / safeDet,
      m21: -stepGX.y / safeDet,
      m22: stepGX.x / safeDet,
    },
  };
}

export function gridToScreenCalibrated(gx: number, gy: number, metrics: CalibratedMetrics): Vec2 {
  const dx = gx - metrics.origin.gx;
  const dy = gy - metrics.origin.gy;
  return {
    x: metrics.origin.x + dx * metrics.stepGX.x + dy * metrics.stepGY.x,
    y: metrics.origin.y + dx * metrics.stepGX.y + dy * metrics.stepGY.y,
  };
}

export function screenToGridApproxCalibrated(
  sx: number,
  sy: number,
  metrics: CalibratedMetrics
): Vec2 {
  const dx = sx - metrics.origin.x;
  const dy = sy - metrics.origin.y;
  return {
    x: metrics.origin.gx + dx * metrics.inverse.m11 + dy * metrics.inverse.m12,
    y: metrics.origin.gy + dx * metrics.inverse.m21 + dy * metrics.inverse.m22,
  };
}

export function getTileDiamondPoints(centerX: number, centerY: number, metrics: CalibratedMetrics): Vec2[] {
  const hTop = {
    x: (metrics.stepGX.x + metrics.stepGY.x) * 0.5,
    y: (metrics.stepGX.y + metrics.stepGY.y) * 0.5,
  };
  const hRight = {
    x: (metrics.stepGX.x - metrics.stepGY.x) * 0.5,
    y: (metrics.stepGX.y - metrics.stepGY.y) * 0.5,
  };

  return [
    { x: centerX - hTop.x, y: centerY - hTop.y },
    { x: centerX + hRight.x, y: centerY + hRight.y },
    { x: centerX + hTop.x, y: centerY + hTop.y },
    { x: centerX - hRight.x, y: centerY - hRight.y },
  ];
}

function screenDeltaToGridDelta(dx: number, dy: number, metrics: CalibratedMetrics): Vec2 {
  return {
    x: dx * metrics.inverse.m11 + dy * metrics.inverse.m12,
    y: dx * metrics.inverse.m21 + dy * metrics.inverse.m22,
  };
}

function diamondMetric(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  tileW: number,
  tileH: number
): number {
  return Math.abs(px - centerX) / (tileW / 2) + Math.abs(py - centerY) / (tileH / 2);
}

function diamondMetricCalibrated(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  metrics: CalibratedMetrics
): number {
  const delta = screenDeltaToGridDelta(px - centerX, py - centerY, metrics);
  return Math.abs(delta.x) + Math.abs(delta.y);
}

export function isInsideDiamond(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  tileW: number,
  tileH: number
): boolean {
  return diamondMetric(px, py, centerX, centerY, tileW, tileH) <= 1;
}

export function isInsideDiamondCalibrated(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  metrics: CalibratedMetrics
): boolean {
  return diamondMetricCalibrated(px, py, centerX, centerY, metrics) <= 1;
}

export function coordKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/**
 * Returns the grid cell (gx, gy) whose diamond contains the given world point.
 * Use for placement when clicking on empty space.
 */
export function getPlacementCell(
  worldX: number,
  worldY: number,
  originX: number,
  originY: number,
  tileW: number,
  tileH: number
): { gx: number; gy: number } {
  const approx = screenToGridApprox(worldX, worldY, originX, originY, tileW, tileH);
  const flooredX = Math.floor(approx.x);
  const flooredY = Math.floor(approx.y);
  const roundedX = Math.round(approx.x);
  const roundedY = Math.round(approx.y);
  const ceilX = Math.ceil(approx.x);
  const ceilY = Math.ceil(approx.y);

  const candidates: { gx: number; gy: number }[] = [
    { gx: flooredX, gy: flooredY },
    { gx: ceilX, gy: flooredY },
    { gx: flooredX, gy: ceilY },
    { gx: ceilX, gy: ceilY },
    { gx: roundedX, gy: roundedY },
  ];

  let best: { gx: number; gy: number } | null = null;
  let bestSort = Number.NEGATIVE_INFINITY;

  for (const { gx, gy } of candidates) {
    const center = gridToScreen(gx, gy, originX, originY, tileW, tileH);
    if (isInsideDiamond(worldX, worldY, center.x, center.y, tileW, tileH)) {
      const s = sortKey(gx, gy);
      if (s > bestSort) {
        bestSort = s;
        best = { gx, gy };
      }
    }
  }

  return best ?? { gx: roundedX, gy: roundedY };
}

export function sortKey(gx: number, gy: number, layerOrder = 0, localYOffset = 0): number {
  return (gx + gy) * 1000 + layerOrder + localYOffset;
}

export function buildTileLookup(map: IslandMap): Map<string, TileDef> {
  const lookup = new Map<string, TileDef>();
  for (const tile of map.tiles) {
    lookup.set(coordKey(tile.gx, tile.gy), tile);
  }
  return lookup;
}

type PickParams = {
  map: IslandMap;
  x: number;
  y: number;
  originX: number;
  originY: number;
  springs: Map<string, TileSpringState>;
  tileLookup?: Map<string, TileDef>;
  metrics?: CalibratedMetrics;
};

export function pickTileFromScreen({
  map,
  x,
  y,
  originX,
  originY,
  springs,
  tileLookup,
  metrics,
}: PickParams): TileDef | null {
  const lookup = tileLookup ?? buildTileLookup(map);
  const approx = metrics
    ? screenToGridApproxCalibrated(x, y, metrics)
    : screenToGridApprox(x, y, originX, originY, map.tileW, map.tileH);

  const flooredX = Math.floor(approx.x);
  const flooredY = Math.floor(approx.y);
  const roundedX = Math.round(approx.x);
  const roundedY = Math.round(approx.y);
  const ceilX = Math.ceil(approx.x);
  const ceilY = Math.ceil(approx.y);
  const seen = new Set<string>();
  const candidates: TileDef[] = [];

  const addCandidate = (gx: number, gy: number): void => {
    const key = coordKey(gx, gy);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const tile = lookup.get(key);
    if (tile) {
      candidates.push(tile);
    }
  };

  addCandidate(flooredX, flooredY);
  addCandidate(ceilX, flooredY);
  addCandidate(flooredX, ceilY);
  addCandidate(ceilX, ceilY);
  addCandidate(roundedX, roundedY);

  let winner: TileDef | null = null;
  let winnerSort = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const base = metrics
      ? gridToScreenCalibrated(candidate.gx, candidate.gy, metrics)
      : gridToScreen(candidate.gx, candidate.gy, originX, originY, map.tileW, map.tileH);
    const spring = springs.get(candidate.id);
    const centerX = base.x + (spring?.ox ?? 0);
    const centerY = base.y + (spring?.oy ?? 0);
    const inside = metrics
      ? isInsideDiamondCalibrated(x, y, centerX, centerY, metrics)
      : isInsideDiamond(x, y, centerX, centerY, map.tileW, map.tileH);

    if (!inside) {
      continue;
    }

    const candidateSort = sortKey(candidate.gx, candidate.gy);
    if (candidateSort >= winnerSort) {
      winnerSort = candidateSort;
      winner = candidate;
    }
  }

  if (winner) {
    return winner;
  }

  let nearest: TileDef | null = null;
  let nearestMetric = Number.POSITIVE_INFINITY;
  for (const tile of map.tiles) {
    const base = metrics
      ? gridToScreenCalibrated(tile.gx, tile.gy, metrics)
      : gridToScreen(tile.gx, tile.gy, originX, originY, map.tileW, map.tileH);
    const spring = springs.get(tile.id);
    const centerX = base.x + (spring?.ox ?? 0);
    const centerY = base.y + (spring?.oy ?? 0);
    const metric = metrics
      ? diamondMetricCalibrated(x, y, centerX, centerY, metrics)
      : diamondMetric(x, y, centerX, centerY, map.tileW, map.tileH);
    if (metric < nearestMetric && metric <= 1.15) {
      nearestMetric = metric;
      nearest = tile;
    }
  }

  return nearest;
}
