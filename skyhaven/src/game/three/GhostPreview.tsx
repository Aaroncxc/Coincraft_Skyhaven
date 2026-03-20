import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { AssetKey } from "../types";
import { DECORATION_TILES } from "../types";
import { getModelKeyForAsset, getModelPathForAsset, TILE_UNIT_SIZE } from "./assets3d";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";

type GhostPreviewProps = {
  gx: number;
  gy: number;
  tileType: AssetKey;
};

const DECORATION_SIZE_FACTOR = 0.45;
// Height above tile origin for decorations (between 0.38 too low and 0.92 too high)
const DECO_SURFACE_Y = 0.82;

const SCALE_OVERRIDES: Record<string, number> = {
  tree: 1.35,
};

const MULTI_CELL: Record<string, { w: number; h: number }> = {
  mine: { w: 2, h: 2 },
  poisFarming: { w: 2, h: 2 },
  taverne: { w: 2, h: 2 },
  floatingForge: { w: 2, h: 2 },
  farmingChicken: { w: 2, h: 2 },
  magicTower: { w: 2, h: 2 },
  cottaTile: { w: 2, h: 2 },
  ancientTempleTile: { w: 2, h: 2 },
};

export function GhostPreview({ gx, gy, tileType }: GhostPreviewProps) {
  const modelKey = getModelKeyForAsset(tileType);
  const modelPath = getModelPathForAsset(tileType);
  const { scene } = useGLTF(modelPath);
  const isDecoration = (DECORATION_TILES as readonly string[]).includes(tileType);

  const cloned = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = (child.material as THREE.Material).clone();
        stripEmbeddedEmissive(child.material);
        scalePbrRoughness(child.material);
        (child.material as THREE.MeshStandardMaterial).transparent = true;
        (child.material as THREE.MeshStandardMaterial).opacity = 0.5;
        (child.material as THREE.MeshStandardMaterial).color.set("#88ff88");
      }
    });
    return clone;
  }, [scene]);

  const box = useMemo(() => new THREE.Box3().setFromObject(scene), [scene]);
  const size = useMemo(() => box.getSize(new THREE.Vector3()), [box]);
  const multi = MULTI_CELL[modelKey];
  const maxDim = Math.max(size.x, size.z);

  let scale: number;
  if (isDecoration) {
    scale = maxDim > 0 ? (TILE_UNIT_SIZE * DECORATION_SIZE_FACTOR) / maxDim : 1;
  } else {
    const footprint = multi ? Math.max(multi.w, multi.h) * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
    scale = maxDim > 0 ? footprint / maxDim : 1;
    const override = SCALE_OVERRIDES[modelKey];
    if (override) scale *= override;
  }
  const offsetY = -box.min.y * scale;
  const ghostY = isDecoration ? offsetY + DECO_SURFACE_Y : offsetY;

  const offsetX = multi ? ((multi.w - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const offsetZ = multi ? ((multi.h - 1) * TILE_UNIT_SIZE) / 2 : 0;

  return (
    <group position={[gx * TILE_UNIT_SIZE + offsetX, ghostY, gy * TILE_UNIT_SIZE + offsetZ]}>
      <primitive object={cloned} scale={[scale, scale, scale]} />
    </group>
  );
}
