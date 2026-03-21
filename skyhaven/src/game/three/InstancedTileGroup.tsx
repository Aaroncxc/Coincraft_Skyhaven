import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TileDef } from "../types";
import { getModelPathForAsset, getModelKeyForAsset, TILE_UNIT_SIZE } from "./assets3d";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";

type InstancedTileGroupProps = {
  tiles: TileDef[];
  hoveredTileId: string | null;
};

type TileGroup = {
  modelKey: string;
  modelPath: string;
  tiles: TileDef[];
};

function groupTilesByModel(tiles: TileDef[]): TileGroup[] {
  const groups = new Map<string, TileGroup>();
  for (const tile of tiles) {
    const modelKey = getModelKeyForAsset(tile.type);
    const existing = groups.get(modelKey);
    if (existing) {
      existing.tiles.push(tile);
    } else {
      groups.set(modelKey, {
        modelKey,
        modelPath: getModelPathForAsset(tile.type),
        tiles: [tile],
      });
    }
  }
  return Array.from(groups.values());
}

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
  kaserneTile: { w: 2, h: 2 },
};

const normCache = new Map<string, { scale: number; offsetY: number }>();

function getNormalization(scene: THREE.Object3D, path: string, modelKey: string): { scale: number; offsetY: number } {
  const cached = normCache.get(path);
  if (cached) return cached;
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const multi = MULTI_CELL[modelKey];
  const footprint = multi ? Math.max(multi.w, multi.h) * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const maxDim = Math.max(size.x, size.z);
  let scale = maxDim > 0 ? footprint / maxDim : 1;
  const override = SCALE_OVERRIDES[modelKey];
  if (override) scale *= override;
  const offsetY = -box.min.y * scale;
  const result = { scale, offsetY };
  normCache.set(path, result);
  return result;
}

function ModelGroup({ group, hoveredTileId }: { group: TileGroup; hoveredTileId: string | null }) {
  const { scene } = useGLTF(group.modelPath);
  const { scale, offsetY } = useMemo(() => getNormalization(scene, group.modelPath, group.modelKey), [scene, group.modelPath, group.modelKey]);

  const meshes = useMemo(() => {
    const result: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) result.push(child);
    });
    return result;
  }, [scene]);

  return (
    <>
      {meshes.map((mesh, mi) => (
        <InstancedMeshForGeometry
          key={mi}
          mesh={mesh}
          tiles={group.tiles}
          modelKey={group.modelKey}
          scale={scale}
          offsetY={offsetY}
          hoveredTileId={hoveredTileId}
        />
      ))}
    </>
  );
}

function InstancedMeshForGeometry({
  mesh,
  tiles,
  modelKey,
  scale: normScale,
  offsetY,
  hoveredTileId,
}: {
  mesh: THREE.Mesh;
  tiles: TileDef[];
  modelKey: string;
  scale: number;
  offsetY: number;
  hoveredTileId: string | null;
}) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPos = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  const multi = MULTI_CELL[modelKey];
  const cellOffX = multi ? ((multi.w - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const cellOffZ = multi ? ((multi.h - 1) * TILE_UNIT_SIZE) / 2 : 0;

  useEffect(() => {
    if (!instancedRef.current) return;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const hoverLift = tile.id === hoveredTileId ? 0.08 : 0;
      tempPos.set(
        tile.gx * TILE_UNIT_SIZE + cellOffX,
        offsetY + hoverLift,
        tile.gy * TILE_UNIT_SIZE + cellOffZ
      );
      tempQuat.identity();
      tempScale.set(normScale, normScale, normScale);
      tempMatrix.compose(tempPos, tempQuat, tempScale);
      instancedRef.current.setMatrixAt(i, tempMatrix);
    }
    instancedRef.current.instanceMatrix.needsUpdate = true;
  }, [tiles, hoveredTileId, normScale, offsetY, cellOffX, cellOffZ, tempMatrix, tempPos, tempQuat, tempScale]);

  const geometry = mesh.geometry;
  const material = useMemo(() => {
    const raw = mesh.material;
    if (Array.isArray(raw)) {
      return raw.map((m) => {
        const c = m.clone();
        stripEmbeddedEmissive(c);
        scalePbrRoughness(c);
        return c;
      });
    }
    const c = raw.clone();
    stripEmbeddedEmissive(c);
    scalePbrRoughness(c);
    return c;
  }, [mesh]);

  return (
    <instancedMesh
      ref={instancedRef}
      args={[geometry, material, tiles.length]}
      castShadow
      receiveShadow
    />
  );
}

export function InstancedTileGroup({ tiles, hoveredTileId }: InstancedTileGroupProps) {
  const groups = useMemo(() => groupTilesByModel(tiles), [tiles]);

  return (
    <>
      {groups.map((group) => (
        <ModelGroup
          key={group.modelKey}
          group={group}
          hoveredTileId={hoveredTileId}
        />
      ))}
    </>
  );
}
