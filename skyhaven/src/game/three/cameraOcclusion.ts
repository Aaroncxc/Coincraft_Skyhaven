import type * as THREE from "three";
import type { AssetKey } from "../types";

export type CameraOccluderEntry = {
  occluder: THREE.Mesh;
  fadeKey: string;
  fadeEligible: boolean;
};

const NON_FADE_TILE_TYPES = new Set<AssetKey>([
  "base",
  "baseV2",
  "baseV4",
  "baseV7",
  "grass",
  "grassV2",
  "grassV4",
  "pathCross",
  "pathCrossV2",
  "pathStraight",
  "pathStraightV4",
  "pathStraightV5",
  "pathStraightV6",
  "pathStraightAlt",
  "pathStraightAltV4",
  "pathStraightAltV5",
  "dirt",
  "farmEmpty",
  "farmSlot",
  "farmHalf",
  "farmFull",
  "farmPath",
  "farmPathCross",
  "farmPathStraight",
  "farmPathUp",
  "farmPathDown",
]);

export function isTileFadeEligible(tileType: AssetKey): boolean {
  return !NON_FADE_TILE_TYPES.has(tileType);
}
