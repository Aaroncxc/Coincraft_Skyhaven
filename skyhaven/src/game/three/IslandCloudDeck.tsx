import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { IslandMap } from "../types";
import { CLOUDS_GLB } from "./assets3d";

useGLTF.preload(CLOUDS_GLB);

/** Stable seed from island tiles for deterministic cloud scatter (no flicker on re-render). */
export function hashIslandForClouds(island: IslandMap): number {
  let h = (island.tiles.length * 1009) >>> 0;
  for (const t of island.tiles) {
    h = (Math.imul(h ^ t.gx, 83492791) + Math.imul(t.gy, 19349663)) >>> 0;
    let idHash = 0;
    for (let i = 0; i < t.id.length; i += 1) {
      idHash = (Math.imul(31, idHash) + t.id.charCodeAt(i)) >>> 0;
    }
    h = (h ^ idHash) >>> 0;
  }
  return h || 1;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMergedCloudGeometry(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.geometry) return;
    const g = obj.geometry.clone();
    g.applyMatrix4(obj.matrixWorld);
    parts.push(g);
  });
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) {
    g.dispose();
  }
  return merged;
}

/** Top deck layer: more instances + tighter Y band + bias up toward island underside. */
const CLOUD_LAYERS = [
  {
    count: 54,
    opacity: 0.82,
    yBandMin: -1.65,
    yBandMax: 1.85,
    depthBiasTowardIsland: true,
  },
  { count: 44, opacity: 0.5 },
  { count: 56, opacity: 0.26 },
] as const;

const MARGIN_FRAC = 0.38;
/** Vertical band relative to safeFloorY: negative = up into island underside for “sea of clouds”. */
const Y_BAND_MIN = -1.4;
const Y_BAND_MAX = 3.8;
const LAYER_Y_SEP = 0.35;
const SCALE_MIN = 0.42;
const SCALE_MAX = 1.55;

/** Halo ring just outside island AABB; count scales with perimeter. */
const RING_OUTSET = 0.85;
const RING_Y_MIN = -1.1;
const RING_Y_MAX = 2.0;
const RING_PERIMETER_DENSITY = 0.34;
const RING_COUNT_BASE = 6;
const RING_COUNT_MIN = 16;
const RING_COUNT_MAX = 240;
const MAX_RING = 256;
const RING_OPACITY = 0.7;
const RING_SCALE_MIN = 0.38;
const RING_SCALE_MAX = 1.35;
const RING_SEED_SALT = 0x6a09e667;

function computeRingCount(planeW: number, planeH: number): number {
  const perimeter = 2 * (planeW + planeH);
  const n = Math.round(RING_COUNT_BASE + RING_PERIMETER_DENSITY * perimeter);
  return Math.min(
    MAX_RING,
    Math.max(RING_COUNT_MIN, Math.min(RING_COUNT_MAX, n)),
  );
}

export type IslandCloudDeckProps = {
  island: IslandMap;
  planeCx: number;
  planeCz: number;
  planeW: number;
  planeH: number;
  safeFloorY: number;
};

export function IslandCloudDeck({
  island,
  planeCx,
  planeCz,
  planeW,
  planeH,
  safeFloorY,
}: IslandCloudDeckProps) {
  const gltf = useGLTF(CLOUDS_GLB);
  const seed = useMemo(() => hashIslandForClouds(island), [island]);

  const baseGeometry = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const geo = buildMergedCloudGeometry(clone);
    clone.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
      }
    });
    return geo;
  }, [gltf.scene]);

  const layer0Ref = useRef<THREE.InstancedMesh>(null);
  const layer1Ref = useRef<THREE.InstancedMesh>(null);
  const layer2Ref = useRef<THREE.InstancedMesh>(null);
  const layerRefs = [layer0Ref, layer1Ref, layer2Ref];
  const ringRef = useRef<THREE.InstancedMesh>(null);

  const ringCount = useMemo(() => computeRingCount(planeW, planeH), [planeW, planeH]);

  const ringMaterial = useMemo(
    () =>
      baseGeometry
        ? new THREE.MeshLambertMaterial({
            color: 0xd0e2f2,
            transparent: true,
            opacity: RING_OPACITY,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        : null,
    [baseGeometry],
  );

  const materials = useMemo(
    () =>
      baseGeometry
        ? CLOUD_LAYERS.map(
            (layer) =>
              new THREE.MeshLambertMaterial({
                color: 0xd8e8f5,
                transparent: true,
                opacity: layer.opacity,
                depthWrite: false,
                side: THREE.DoubleSide,
              }),
          )
        : [],
    [baseGeometry],
  );

  const matricesPerLayer = useMemo(() => {
    if (!baseGeometry) return null;
    const rnd = mulberry32(seed);
    const margin = MARGIN_FRAC * Math.max(planeW, planeH, 8);
    const halfW = (planeW + margin) * 0.5;
    const halfH = (planeH + margin) * 0.5;
    const dummy = new THREE.Object3D();
    const mats: THREE.Matrix4[][] = CLOUD_LAYERS.map(() => []);

    for (let layerIndex = 0; layerIndex < CLOUD_LAYERS.length; layerIndex += 1) {
      const layer = CLOUD_LAYERS[layerIndex]!;
      for (let i = 0; i < layer.count; i += 1) {
        const u = rnd();
        const v = rnd();
        const x = planeCx + (u * 2 - 1) * halfW;
        const z = planeCz + (v * 2 - 1) * halfH;
        let depthT = rnd();
        if ("depthBiasTowardIsland" in layer && layer.depthBiasTowardIsland) {
          depthT = rnd() * rnd();
        }
        const yMin = "yBandMin" in layer && layer.yBandMin !== undefined ? layer.yBandMin : Y_BAND_MIN;
        const yMax = "yBandMax" in layer && layer.yBandMax !== undefined ? layer.yBandMax : Y_BAND_MAX;
        const y = safeFloorY - (yMin + depthT * (yMax - yMin)) - layerIndex * LAYER_Y_SEP;
        const s = SCALE_MIN + rnd() * (SCALE_MAX - SCALE_MIN);
        dummy.position.set(x, y, z);
        dummy.rotation.set(rnd() * 0.08 - 0.04, rnd() * Math.PI * 2, rnd() * 0.08 - 0.04);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mats[layerIndex]!.push(dummy.matrix.clone());
      }
    }

    return mats;
  }, [baseGeometry, planeCx, planeCz, planeH, planeW, safeFloorY, seed]);

  const ringMatrices = useMemo(() => {
    if (!baseGeometry) return null;
    const rnd = mulberry32((seed ^ RING_SEED_SALT) >>> 0);
    const a = planeW * 0.5 + RING_OUTSET;
    const b = planeH * 0.5 + RING_OUTSET;
    const dummy = new THREE.Object3D();
    const mats: THREE.Matrix4[] = [];
    for (let i = 0; i < ringCount; i += 1) {
      const t = i / Math.max(ringCount, 1);
      const theta = t * Math.PI * 2 + (rnd() - 0.5) * (0.45 / Math.max(ringCount, 1));
      const rScale = 1 + (rnd() - 0.5) * 0.14;
      const x = planeCx + a * rScale * Math.cos(theta);
      const z = planeCz + b * rScale * Math.sin(theta);
      const depthT = rnd();
      const y = safeFloorY - (RING_Y_MIN + depthT * (RING_Y_MAX - RING_Y_MIN));
      const s = RING_SCALE_MIN + rnd() * (RING_SCALE_MAX - RING_SCALE_MIN);
      dummy.position.set(x, y, z);
      dummy.rotation.set(rnd() * 0.06 - 0.03, rnd() * Math.PI * 2, rnd() * 0.06 - 0.03);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
    }
    return mats;
  }, [baseGeometry, planeCx, planeCz, planeH, planeW, ringCount, safeFloorY, seed]);

  useLayoutEffect(() => {
    if (!matricesPerLayer) return;
    for (let l = 0; l < CLOUD_LAYERS.length; l += 1) {
      const mesh = layerRefs[l]?.current;
      if (!mesh) continue;
      const mats = matricesPerLayer[l]!;
      for (let i = 0; i < mats.length; i += 1) {
        mesh.setMatrixAt(i, mats[i]!);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [matricesPerLayer]);

  useLayoutEffect(() => {
    const mesh = ringRef.current;
    if (!mesh || !ringMatrices || !ringMaterial) return;
    for (let i = 0; i < ringMatrices.length; i += 1) {
      mesh.setMatrixAt(i, ringMatrices[i]!);
    }
    mesh.count = ringMatrices.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [ringMatrices, ringMaterial]);

  useLayoutEffect(
    () => () => {
      for (const m of materials) {
        m.dispose();
      }
      ringMaterial?.dispose();
    },
    [materials, ringMaterial],
  );

  useEffect(
    () => () => {
      baseGeometry?.dispose();
    },
    [baseGeometry],
  );

  if (!baseGeometry || !matricesPerLayer || !ringMaterial || !ringMatrices) return null;

  return (
    <group>
      <instancedMesh
        ref={ringRef}
        args={[baseGeometry, ringMaterial, MAX_RING]}
        frustumCulled
        castShadow={false}
        receiveShadow={false}
      />
      {CLOUD_LAYERS.map((layer, l) => (
        <instancedMesh
          key={l}
          ref={layerRefs[l]!}
          args={[baseGeometry, materials[l]!, layer.count]}
          frustumCulled
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  );
}
