import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TileDef } from "../types";
import { getModelKeyForAsset, getModelPathForAsset, TILE_UNIT_SIZE } from "./assets3d";

const DECORATION_SIZE_FACTOR = 0.45;

type TileModelProps = {
  tile: TileDef;
  hovered?: boolean;
  showBlocked?: boolean;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
};

const SCALE_OVERRIDES: Record<string, number> = {
  tree: 1.35,
};

const MULTI_CELL: Record<string, { w: number; h: number }> = {
  mine: { w: 2, h: 2 },
  poisFarming: { w: 2, h: 2 },
  taverne: { w: 2, h: 2 },
  floatingForge: { w: 2, h: 2 },
  farmingChicken: { w: 2, h: 2 },
};

const normalizeCache = new Map<string, { scale: number; offsetY: number }>();

function computeNormalization(scene: THREE.Object3D, path: string, modelKey: string): { scale: number; offsetY: number } {
  const cached = normalizeCache.get(path);
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
  normalizeCache.set(path, result);
  return result;
}

const _emissiveColor = new THREE.Color(0x88ccff);
const _blockedColor = new THREE.Color(0xff4444);

export function TileModel({ tile, hovered, showBlocked, onHoverEnter, onHoverLeave }: TileModelProps) {
  const modelKey = getModelKeyForAsset(tile.type);
  const modelPath = getModelPathForAsset(tile.type);
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const hoveredRef = useRef(false);
  const glowIntensityRef = useRef(0);

  const cloned = useMemo(() => scene.clone(true), [scene]);

  const { scale, offsetY } = useMemo(() => computeNormalization(scene, modelPath, modelKey), [scene, modelPath, modelKey]);

  const multi = MULTI_CELL[modelKey];
  const gridOffsetX = multi ? ((multi.w - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const gridOffsetZ = multi ? ((multi.h - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const basePosX = tile.gx * TILE_UNIT_SIZE + gridOffsetX;
  const basePosZ = tile.gy * TILE_UNIT_SIZE + gridOffsetZ;
  const posX = tile.pos3d ? tile.pos3d.x : basePosX;
  const posY3d = tile.pos3d ? tile.pos3d.y : 0;
  const posZ = tile.pos3d ? tile.pos3d.z : basePosZ;
  const scaleX = tile.scale3d ? scale * tile.scale3d.x : scale;
  const scaleY = tile.scale3d ? scale * tile.scale3d.y : scale;
  const scaleZ = tile.scale3d ? scale * tile.scale3d.z : scale;
  const rotY = tile.rotY ?? 0;

  const isTree = modelKey === "tree" || modelKey === "treeMiddle";

  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.raycast = () => {};
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          if (isTree && (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhysicalMaterial)) {
            child.material.roughness = 0.98;
            child.material.metalness = 0;
          }
        }
      }
    });
  }, [cloned, isTree]);

  hoveredRef.current = !!hovered;

  useFrame((_, delta) => {
    const target = hoveredRef.current ? 1 : 0;
    const speed = 8;
    glowIntensityRef.current += (target - glowIntensityRef.current) * Math.min(1, speed * delta);
    if (Math.abs(glowIntensityRef.current - target) < 0.01) glowIntensityRef.current = target;

    const intensity = glowIntensityRef.current;
    const liftY = intensity * 0.02;
    if (groupRef.current) {
      groupRef.current.position.y = offsetY + posY3d + liftY;
    }

    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.copy(_emissiveColor);
        child.material.emissiveIntensity = intensity * 0.4;
      }
    });
  });

  const hitW = multi ? multi.w * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const hitD = multi ? multi.h * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const hitH = TILE_UNIT_SIZE * 0.9;

  const isBlocked = !!tile.blocked && !!showBlocked;

  return (
    <group ref={groupRef} position={[posX, offsetY + posY3d, posZ]} rotation={[0, rotY, 0]}>
      <primitive object={cloned} scale={[scaleX, scaleY, scaleZ]} />
      <mesh
        position={[0, hitH / 2, 0]}
        onPointerOver={onHoverEnter ? (e) => { e.stopPropagation(); onHoverEnter(); } : undefined}
        onPointerOut={onHoverLeave ? (e) => { e.stopPropagation(); onHoverLeave(); } : undefined}
      >
        <boxGeometry args={[hitW, hitH, hitD]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {isBlocked && (
        <mesh position={[0, hitH + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[hitW * 0.85, hitD * 0.85]} />
          <meshBasicMaterial color={_blockedColor} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {tile.decoration && <DecorationModel tile={tile} parentOffsetY={offsetY} />}
    </group>
  );
}

const DECO_SURFACE_Y = 0.82;

function DecorationModel({ tile, parentOffsetY }: { tile: TileDef; parentOffsetY: number }) {
  const decoPath = getModelPathForAsset(tile.decoration as import("../types").AssetKey);
  const { scene } = useGLTF(decoPath);
  const decoCloned = useMemo(() => scene.clone(true), [scene]);

  const { scale: normScale, offsetY: decoOffsetY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const s = maxDim > 0 ? (TILE_UNIT_SIZE * DECORATION_SIZE_FACTOR) / maxDim : 1;
    return { scale: s, offsetY: -box.min.y * s };
  }, [scene]);

  useEffect(() => {
    decoCloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        if (child.material) {
          child.material = child.material.clone();
        }
      }
    });
  }, [decoCloned]);

  const baseY = DECO_SURFACE_Y - parentOffsetY + decoOffsetY;
  const dx = tile.decoPos3d?.x ?? 0;
  const dy = (tile.decoPos3d?.y ?? 0) + baseY;
  const dz = tile.decoPos3d?.z ?? 0;
  const dsx = tile.decoScale3d?.x ?? 1;
  const dsy = tile.decoScale3d?.y ?? 1;
  const dsz = tile.decoScale3d?.z ?? 1;
  const dRotY = tile.decoRotY ?? 0;

  return (
    <group position={[dx, dy, dz]} scale={[dsx, dsy, dsz]} rotation={[0, dRotY, 0]}>
      <primitive object={decoCloned} scale={[normScale, normScale, normScale]} />
    </group>
  );
}
