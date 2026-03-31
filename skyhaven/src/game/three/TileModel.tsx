import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getTileStackBaseY } from "../tileStack";
import { DECORATION_VFX_TYPES, type TileDef } from "../types";
import { getModelKeyForAsset, getModelPath, getModelPathForAsset, TILE_UNIT_SIZE } from "./assets3d";
import { isTileFadeEligible, type CameraOccluderEntry } from "./cameraOcclusion";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import {
  MULTI_CELL,
  computeTileGltfNormalization,
  getNormalizationModelKey,
} from "./tileGltfNormalization";
import { DecorationMysticParticles } from "./DecorationMysticParticles";

const DECORATION_SIZE_FACTOR = 0.45;
const CAMERA_OCCLUDER_PAD = 0.12;
/** Keep in sync with IslandCamera LOS ray; avoid layer 2 (OutlineEffect). */
const CAMERA_OCCLUSION_LAYER = 11;
const FADE_MIN_OPACITY = 0.45;
const FADE_IN_SPEED = 12;
const FADE_OUT_SPEED = 8;

type TileModelProps = {
  tile: TileDef;
  hovered?: boolean;
  faded?: boolean;
  decorationFaded?: boolean;
  showBlocked?: boolean;
  onHoverEnter?: () => void;
  onHoverLeave?: () => void;
  cameraOccludersRef?: MutableRefObject<CameraOccluderEntry[]>;
};

type FadableMaterialState = {
  material: THREE.Material;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  alphaTest: number;
};

const _emissiveColor = new THREE.Color(0x88ccff);
const _blockedColor = new THREE.Color(0xff4444);

function snapshotFadableMaterial(material: THREE.Material): FadableMaterialState {
  return {
    material,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
    alphaTest: material.alphaTest,
  };
}

function applyFadeToMaterialStates(states: readonly FadableMaterialState[], fadeAlpha: number): void {
  const fadeActive = fadeAlpha > 0.001;
  for (const state of states) {
    const nextTransparent = fadeActive ? true : state.transparent;
    const nextDepthWrite = fadeActive ? false : state.depthWrite;
    const nextOpacity = fadeActive
      ? THREE.MathUtils.lerp(state.opacity, Math.min(state.opacity, FADE_MIN_OPACITY), fadeAlpha)
      : state.opacity;

    if (state.material.transparent !== nextTransparent || state.material.depthWrite !== nextDepthWrite) {
      state.material.transparent = nextTransparent;
      state.material.depthWrite = nextDepthWrite;
      state.material.needsUpdate = true;
    }
    state.material.opacity = nextOpacity;
    if (!fadeActive && state.material.alphaTest !== state.alphaTest) {
      state.material.alphaTest = state.alphaTest;
      state.material.needsUpdate = true;
    }
  }
}

export function TileModel({
  tile,
  hovered,
  faded,
  decorationFaded,
  showBlocked,
  onHoverEnter,
  onHoverLeave,
  cameraOccludersRef,
}: TileModelProps) {
  const modelKey = getModelKeyForAsset(tile.type);
  const modelPath = getModelPathForAsset(tile.type);
  const { scene } = useGLTF(modelPath);
  const normalizationModelKey = getNormalizationModelKey(modelKey);
  const normalizationPath = getModelPath(normalizationModelKey);
  const { scene: normalizationScene } = useGLTF(normalizationPath);
  const groupRef = useRef<THREE.Group>(null);
  const cameraOccluderRef = useRef<THREE.Mesh>(null);
  const hoveredRef = useRef(false);
  const glowIntensityRef = useRef(0);
  const fadedRef = useRef(false);
  const fadeAlphaRef = useRef(0);
  const materialStatesRef = useRef<FadableMaterialState[]>([]);

  const cloned = useMemo(() => scene.clone(true), [scene]);

  const { scale, offsetY, size, center } = useMemo(
    () => computeTileGltfNormalization(normalizationScene, normalizationPath, normalizationModelKey),
    [normalizationScene, normalizationPath, normalizationModelKey],
  );

  const multi = MULTI_CELL[modelKey];
  const gridOffsetX = multi ? ((multi.w - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const gridOffsetZ = multi ? ((multi.h - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const basePosX = tile.gx * TILE_UNIT_SIZE + gridOffsetX;
  const basePosZ = tile.gy * TILE_UNIT_SIZE + gridOffsetZ;
  const posX = tile.pos3d ? tile.pos3d.x : basePosX;
  const posY3d = tile.pos3d ? tile.pos3d.y : getTileStackBaseY(tile.stackLevel);
  const posZ = tile.pos3d ? tile.pos3d.z : basePosZ;
  const scaleX = tile.scale3d ? scale * tile.scale3d.x : scale;
  const scaleY = tile.scale3d ? scale * tile.scale3d.y : scale;
  const scaleZ = tile.scale3d ? scale * tile.scale3d.z : scale;
  const rotY = tile.rotY ?? 0;

  const isTree = modelKey === "tree" || modelKey === "treeMiddle";
  const fadeEligible = isTileFadeEligible(tile.type);

  useEffect(() => {
    const materialStates: FadableMaterialState[] = [];
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.raycast = () => {};
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((material) => {
              const clonedMaterial = material.clone();
              stripEmbeddedEmissive(clonedMaterial);
              scalePbrRoughness(clonedMaterial);
              if (
                isTree &&
                (clonedMaterial instanceof THREE.MeshStandardMaterial ||
                  clonedMaterial instanceof THREE.MeshPhysicalMaterial)
              ) {
                clonedMaterial.metalness = 0;
              }
              materialStates.push(snapshotFadableMaterial(clonedMaterial));
              return clonedMaterial;
            });
          } else {
            const clonedMaterial = child.material.clone();
            stripEmbeddedEmissive(clonedMaterial);
            scalePbrRoughness(clonedMaterial);
            if (
              isTree &&
              (clonedMaterial instanceof THREE.MeshStandardMaterial ||
                clonedMaterial instanceof THREE.MeshPhysicalMaterial)
            ) {
              clonedMaterial.metalness = 0;
            }
            materialStates.push(snapshotFadableMaterial(clonedMaterial));
            child.material = clonedMaterial;
          }
        }
      }
    });
    materialStatesRef.current = materialStates;
    return () => {
      materialStatesRef.current = [];
    };
  }, [cloned, isTree]);

  useEffect(() => {
    if (!cameraOccludersRef) return;
    const occluder = cameraOccluderRef.current;
    if (!occluder) return;
    occluder.layers.set(CAMERA_OCCLUSION_LAYER);
    const entry: CameraOccluderEntry = {
      occluder,
      fadeKey: `tile:${tile.id}`,
      fadeEligible,
    };
    cameraOccludersRef.current.push(entry);
    return () => {
      const index = cameraOccludersRef.current.findIndex((candidate) => candidate.occluder === occluder);
      if (index >= 0) cameraOccludersRef.current.splice(index, 1);
    };
  }, [cameraOccludersRef, fadeEligible, tile.id]);

  hoveredRef.current = !!hovered;
  fadedRef.current = !!faded;

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

    const fadeTarget = fadedRef.current ? 1 : 0;
    const fadeSpeed = fadeTarget > fadeAlphaRef.current ? FADE_IN_SPEED : FADE_OUT_SPEED;
    fadeAlphaRef.current += (fadeTarget - fadeAlphaRef.current) * Math.min(1, fadeSpeed * delta);
    if (Math.abs(fadeAlphaRef.current - fadeTarget) < 0.01) {
      fadeAlphaRef.current = fadeTarget;
    }
    applyFadeToMaterialStates(materialStatesRef.current, fadeAlphaRef.current);
  });

  const hitW = multi ? multi.w * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const hitD = multi ? multi.h * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const hitH = TILE_UNIT_SIZE * 0.9;
  const occluderW = Math.max(size.x * scaleX + CAMERA_OCCLUDER_PAD, TILE_UNIT_SIZE * 0.6);
  const occluderH = Math.max(size.y * scaleY + CAMERA_OCCLUDER_PAD, TILE_UNIT_SIZE * 0.6);
  const occluderD = Math.max(size.z * scaleZ + CAMERA_OCCLUDER_PAD, TILE_UNIT_SIZE * 0.6);
  const occluderX = center.x * scaleX;
  const occluderY = center.y * scaleY;
  const occluderZ = center.z * scaleZ;

  const isBlocked = !!tile.blocked && !!showBlocked;

  return (
    <group ref={groupRef} position={[posX, offsetY + posY3d, posZ]} rotation={[0, rotY, 0]}>
      <primitive object={cloned} scale={[scaleX, scaleY, scaleZ]} />
      <mesh ref={cameraOccluderRef} position={[occluderX, occluderY, occluderZ]}>
        <boxGeometry args={[occluderW, occluderH, occluderD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
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
      {tile.decoration && (
        <DecorationModel
          tile={tile}
          parentOffsetY={offsetY}
          faded={decorationFaded}
          cameraOccludersRef={cameraOccludersRef}
        />
      )}
    </group>
  );
}

const DECO_SURFACE_Y = 0.82;

function DecorationModel({
  tile,
  parentOffsetY,
  faded,
  cameraOccludersRef,
}: {
  tile: TileDef;
  parentOffsetY: number;
  faded?: boolean;
  cameraOccludersRef?: MutableRefObject<CameraOccluderEntry[]>;
}) {
  const decoPath = getModelPathForAsset(tile.decoration as import("../types").AssetKey);
  const { scene } = useGLTF(decoPath);
  const decoCloned = useMemo(() => scene.clone(true), [scene]);
  const decoOccluderRef = useRef<THREE.Mesh>(null);
  const fadedRef = useRef(false);
  const fadeAlphaRef = useRef(0);
  const materialStatesRef = useRef<FadableMaterialState[]>([]);

  const { scale: normScale, offsetY: decoOffsetY, size, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const s = maxDim > 0 ? (TILE_UNIT_SIZE * DECORATION_SIZE_FACTOR) / maxDim : 1;
    return { scale: s, offsetY: -box.min.y * s, size, center };
  }, [scene]);

  const mysticEmitterLocalY = useMemo(() => {
    const box = new THREE.Box3().setFromObject(decoCloned);
    const lift = tile.decoration === "torchDecoration" ? 0.05 : 0.1;
    return box.max.y * normScale + lift;
  }, [decoCloned, normScale, tile.decoration]);

  const showMysticVfx =
    !!tile.decoration &&
    (DECORATION_VFX_TYPES as readonly string[]).includes(tile.decoration) &&
    tile.vfxEnabled === true;

  useEffect(() => {
    const materialStates: FadableMaterialState[] = [];
    decoCloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map((material) => {
              const clonedMaterial = material.clone();
              stripEmbeddedEmissive(clonedMaterial);
              scalePbrRoughness(clonedMaterial);
              materialStates.push(snapshotFadableMaterial(clonedMaterial));
              return clonedMaterial;
            });
          } else {
            const clonedMaterial = child.material.clone();
            stripEmbeddedEmissive(clonedMaterial);
            scalePbrRoughness(clonedMaterial);
            materialStates.push(snapshotFadableMaterial(clonedMaterial));
            child.material = clonedMaterial;
          }
        }
      }
    });
    materialStatesRef.current = materialStates;
    return () => {
      materialStatesRef.current = [];
    };
  }, [decoCloned]);

  useEffect(() => {
    if (!cameraOccludersRef) return;
    const occluder = decoOccluderRef.current;
    if (!occluder) return;
    occluder.layers.set(CAMERA_OCCLUSION_LAYER);
    const entry: CameraOccluderEntry = {
      occluder,
      fadeKey: `deco:${tile.id}`,
      fadeEligible: true,
    };
    cameraOccludersRef.current.push(entry);
    return () => {
      const index = cameraOccludersRef.current.findIndex((candidate) => candidate.occluder === occluder);
      if (index >= 0) cameraOccludersRef.current.splice(index, 1);
    };
  }, [cameraOccludersRef, tile.id]);

  fadedRef.current = !!faded;

  useFrame((_, delta) => {
    const fadeTarget = fadedRef.current ? 1 : 0;
    const fadeSpeed = fadeTarget > fadeAlphaRef.current ? FADE_IN_SPEED : FADE_OUT_SPEED;
    fadeAlphaRef.current += (fadeTarget - fadeAlphaRef.current) * Math.min(1, fadeSpeed * delta);
    if (Math.abs(fadeAlphaRef.current - fadeTarget) < 0.01) {
      fadeAlphaRef.current = fadeTarget;
    }
    applyFadeToMaterialStates(materialStatesRef.current, fadeAlphaRef.current);
  });

  const baseY = DECO_SURFACE_Y - parentOffsetY + decoOffsetY;
  const dx = tile.decoPos3d?.x ?? 0;
  const dy = (tile.decoPos3d?.y ?? 0) + baseY;
  const dz = tile.decoPos3d?.z ?? 0;
  const dsx = tile.decoScale3d?.x ?? 1;
  const dsy = tile.decoScale3d?.y ?? 1;
  const dsz = tile.decoScale3d?.z ?? 1;
  const dRotY = tile.decoRotY ?? 0;
  const occluderW = Math.max(size.x * normScale + CAMERA_OCCLUDER_PAD, TILE_UNIT_SIZE * 0.45);
  const occluderH = Math.max(size.y * normScale + CAMERA_OCCLUDER_PAD, TILE_UNIT_SIZE * 0.45);
  const occluderD = Math.max(size.z * normScale + CAMERA_OCCLUDER_PAD, TILE_UNIT_SIZE * 0.45);
  const occluderX = center.x * normScale;
  const occluderY = center.y * normScale;
  const occluderZ = center.z * normScale;

  return (
    <group position={[dx, dy, dz]} scale={[dsx, dsy, dsz]} rotation={[0, dRotY, 0]}>
      <mesh ref={decoOccluderRef} position={[occluderX, occluderY, occluderZ]}>
        <boxGeometry args={[occluderW, occluderH, occluderD]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive object={decoCloned} scale={[normScale, normScale, normScale]} />
      {showMysticVfx && tile.decoration ? (
        <DecorationMysticParticles
          decoration={tile.decoration}
          emitterLocalY={mysticEmitterLocalY}
          enabled
        />
      ) : null}
    </group>
  );
}
