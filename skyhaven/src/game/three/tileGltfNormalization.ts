import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";

export const SCALE_OVERRIDES: Record<string, number> = {
  tree: 1.35,
};

export const MULTI_CELL: Record<string, { w: number; h: number }> = {
  mine: { w: 2, h: 2 },
  poisFarming: { w: 2, h: 2 },
  taverne: { w: 2, h: 2 },
  floatingForge: { w: 2, h: 2 },
  farmingChicken: { w: 2, h: 2 },
  magicTower: { w: 2, h: 2 },
  cottaTile: { w: 2, h: 2 },
  ancientTempleTile: { w: 2, h: 2 },
  kaserneTile: { w: 2, h: 2 },
  airShipPort: { w: 2, h: 2 },
};

/**
 * Visual mesh uses `modelKey` GLB; scale / ground offset are derived from `referenceKey`'s bounds
 * so the tile matches grid placement (e.g. dirt aligns like grass).
 */
export const NORMALIZATION_REFERENCE_MODEL: Record<string, string> = {
  dirt: "grass",
};

export type TileGltfNormalization = {
  scale: number;
  offsetY: number;
  size: THREE.Vector3;
  center: THREE.Vector3;
};

const normalizeCache = new Map<string, TileGltfNormalization>();

export function computeTileGltfNormalization(
  scene: THREE.Object3D,
  cachePath: string,
  modelKeyForNorm: string,
): TileGltfNormalization {
  const cached = normalizeCache.get(cachePath);
  if (cached) return cached;

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const multi = MULTI_CELL[modelKeyForNorm];
  const footprint = multi ? Math.max(multi.w, multi.h) * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const maxDim = Math.max(size.x, size.z);
  let scale = maxDim > 0 ? footprint / maxDim : 1;
  const override = SCALE_OVERRIDES[modelKeyForNorm];
  if (override) scale *= override;
  const offsetY = -box.min.y * scale;

  const result = { scale, offsetY, size, center };
  normalizeCache.set(cachePath, result);
  return result;
}

export function getNormalizationModelKey(modelKey: string): string {
  return NORMALIZATION_REFERENCE_MODEL[modelKey] ?? modelKey;
}
