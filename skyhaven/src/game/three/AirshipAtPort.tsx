import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import type { IslandMap, TileDef } from "../types";
import { getTileStackBaseY } from "../tileStack";
import { TILE_UNIT_SIZE } from "./assets3d";
import { MULTI_CELL } from "./tileGltfNormalization";
import { getSurfaceYAtWorldGrid, type IslandSurfaceData } from "./islandSurface";
import { MagicDescendingRingsFX } from "./MagicDescendingRingsFX";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";

export const AIRSHIP_GLB_URL = "/ingame_assets/3d/AirCraftShip/AirShipFirst.glb";

/** Hull scale: much larger than early prototype; tuned for dock-at-island-rim read. */
const AIRSHIP_SCALE = 3.35;
/** How far past the tile AABB the ship sits (world units); keeps bulk outside the buildable deck. */
const RIM_OUTWARD = TILE_UNIT_SIZE * 2.15;
/** Extra Y so the ship deck lines up with the dock surface (GLB pivot sits low on the hull). */
const AIRSHIP_VERTICAL_LIFT = 2.08;

/** Full hover cycle (s): first half = vertical bob only; second half = lateral drift + yaw (y ≈ 0). */
const HOVER_CYCLE_SEC = 15;
const HOVER_BOB_AMP = 0.07;
const HOVER_DRIFT_AMP_XZ = 0.11;
const HOVER_YAW_AMP_RAD = 0.045;
/** Lower-hull anchor so the standard mage-tower ring motion starts from the ship underside. */
const AIRSHIP_THRUSTER_RING_EDGE_OFFSET_LOCAL = 0.06;

function hashPhaseSeeds(id: string): { a: number; b: number; c: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (n: number) => (((h >>> (n * 7)) & 0xffff) / 0xffff) * Math.PI * 2;
  return { a: u(0), b: u(1), c: u(2) };
}

/** Stagger ring cycle per port tile so two docks don’t pulse in sync. */
function hashRingPhaseOffsetSec(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 628) / 100;
}

type Props = {
  island: IslandMap;
  portTiles: TileDef[];
  surfaceData: IslandSurfaceData;
};

function getIslandTileGridBounds(island: IslandMap): { minGx: number; maxGx: number; minGy: number; maxGy: number } {
  let minGx = Infinity;
  let maxGx = -Infinity;
  let minGy = Infinity;
  let maxGy = -Infinity;
  for (const t of island.tiles) {
    const span = SKYHAVEN_SPRITE_MANIFEST.tile[t.type]?.gridSpan;
    const w = span?.w ?? 1;
    const h = span?.h ?? 1;
    minGx = Math.min(minGx, t.gx);
    maxGx = Math.max(maxGx, t.gx + w - 1);
    minGy = Math.min(minGy, t.gy);
    maxGy = Math.max(maxGy, t.gy + h - 1);
  }
  if (!Number.isFinite(minGx)) {
    return { minGx: 0, maxGx: 0, minGy: 0, maxGy: 0 };
  }
  return { minGx, maxGx, minGy, maxGy };
}

type RimSide = "west" | "east" | "south" | "north";

function pickRimSide(portCx: number, portCz: number, minX: number, maxX: number, minZ: number, maxZ: number): RimSide {
  const dWest = portCx - minX;
  const dEast = maxX - portCx;
  const dSouth = portCz - minZ;
  const dNorth = maxZ - portCz;
  const m = Math.min(dWest, dEast, dSouth, dNorth);
  if (m === dWest) return "west";
  if (m === dEast) return "east";
  if (m === dSouth) return "south";
  return "north";
}

function AirshipBesidePort({
  tile,
  surfaceData,
  islandBounds,
}: {
  tile: TileDef;
  surfaceData: IslandSurfaceData;
  islandBounds: { minGx: number; maxGx: number; minGy: number; maxGy: number };
}) {
  const motionRef = useRef<THREE.Group>(null);
  const seeds = useMemo(() => hashPhaseSeeds(tile.id), [tile.id]);
  const ringPhaseOffsetSec = useMemo(() => hashRingPhaseOffsetSec(tile.id), [tile.id]);

  const { scene } = useGLTF(AIRSHIP_GLB_URL);
  const clone = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((ch) => {
      if (ch instanceof THREE.Mesh && ch.material) {
        ch.castShadow = true;
        ch.receiveShadow = true;
        const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
        for (const m of mats) {
          stripEmbeddedEmissive(m);
          scalePbrRoughness(m);
        }
      }
    });
    return c;
  }, [scene]);
  const thrusterRingAnchorLocalY = useMemo(() => {
    clone.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(clone);
    if (!Number.isFinite(bounds.min.y) || !Number.isFinite(bounds.max.y)) {
      return 0.15;
    }
    return bounds.min.y + AIRSHIP_THRUSTER_RING_EDGE_OFFSET_LOCAL;
  }, [clone]);

  const multi = MULTI_CELL.airShipPort ?? { w: 2, h: 2 };
  const gridOffsetX = ((multi.w - 1) * TILE_UNIT_SIZE) / 2;
  const gridOffsetZ = ((multi.h - 1) * TILE_UNIT_SIZE) / 2;
  const portCx = tile.gx * TILE_UNIT_SIZE + gridOffsetX;
  const portCz = tile.gy * TILE_UNIT_SIZE + gridOffsetZ;
  const stackY = getTileStackBaseY(tile.stackLevel);
  const groundY = getSurfaceYAtWorldGrid(surfaceData, tile.gx, tile.gy) + stackY;

  const minX = islandBounds.minGx * TILE_UNIT_SIZE;
  const maxX = (islandBounds.maxGx + 1) * TILE_UNIT_SIZE;
  const minZ = islandBounds.minGy * TILE_UNIT_SIZE;
  const maxZ = (islandBounds.maxGy + 1) * TILE_UNIT_SIZE;

  const side = pickRimSide(portCx, portCz, minX, maxX, minZ, maxZ);

  let px = portCx;
  let pz = portCz;
  let rotY = 0;

  // Long axis of hull parallel to island edge; sit just outside the AABB rim.
  switch (side) {
    case "west":
      px = minX - RIM_OUTWARD;
      pz = THREE.MathUtils.clamp(portCz, minZ + TILE_UNIT_SIZE * 0.5, maxZ - TILE_UNIT_SIZE * 0.5);
      rotY = Math.PI / 2;
      break;
    case "east":
      px = maxX + RIM_OUTWARD;
      pz = THREE.MathUtils.clamp(portCz, minZ + TILE_UNIT_SIZE * 0.5, maxZ - TILE_UNIT_SIZE * 0.5);
      rotY = -Math.PI / 2;
      break;
    case "south":
      px = THREE.MathUtils.clamp(portCx, minX + TILE_UNIT_SIZE * 0.5, maxX - TILE_UNIT_SIZE * 0.5);
      pz = minZ - RIM_OUTWARD;
      rotY = 0;
      break;
    case "north":
      px = THREE.MathUtils.clamp(portCx, minX + TILE_UNIT_SIZE * 0.5, maxX - TILE_UNIT_SIZE * 0.5);
      pz = maxZ + RIM_OUTWARD;
      rotY = Math.PI;
      break;
    default:
      break;
  }

  useFrame(({ clock }) => {
    const g = motionRef.current;
    if (!g) return;
    const elapsed = clock.elapsedTime;
    const half = HOVER_CYCLE_SEC * 0.5;
    const u = (elapsed % HOVER_CYCLE_SEC) / half;
    const phase = u < 1 ? 0 : 1;
    const segT = phase === 0 ? u : u - 1;
    const env = Math.sin(segT * Math.PI);

    if (phase === 0) {
      const y = env * HOVER_BOB_AMP;
      g.position.set(0, y, 0);
      g.rotation.set(0, 0, 0);
    } else {
      const x =
        (Math.sin(segT * Math.PI * 2 * 0.73 + seeds.a) * 0.55 +
          Math.sin(segT * Math.PI * 2 * 1.19 + seeds.b) * 0.45) *
        HOVER_DRIFT_AMP_XZ *
        env;
      const z =
        (Math.cos(segT * Math.PI * 2 * 0.61 + seeds.c) * 0.5 +
          Math.sin(segT * Math.PI * 2 * 0.97 + seeds.a * 0.5) * 0.5) *
        HOVER_DRIFT_AMP_XZ *
        env;
      g.position.set(x, 0, z);
      const yaw = Math.sin(segT * Math.PI * 2 * 0.52 + seeds.b) * HOVER_YAW_AMP_RAD * env;
      g.rotation.set(0, yaw, 0);
    }
  });

  return (
    <group position={[px, groundY + AIRSHIP_VERTICAL_LIFT, pz]} rotation={[0, rotY, 0]}>
      <group ref={motionRef}>
        <group scale={AIRSHIP_SCALE}>
          <primitive object={clone} />
          <MagicDescendingRingsFX
            anchorLocalY={thrusterRingAnchorLocalY}
            phaseOffsetSec={ringPhaseOffsetSec}
            scaleDenominator={AIRSHIP_SCALE}
            lightIntensityMul={0.85}
          />
        </group>
      </group>
    </group>
  );
}

export function AirshipAtPort({ island, portTiles, surfaceData }: Props) {
  const islandBounds = useMemo(() => getIslandTileGridBounds(island), [island]);
  return (
    <>
      {portTiles.map((t) => (
        <AirshipBesidePort key={t.id} tile={t} surfaceData={surfaceData} islandBounds={islandBounds} />
      ))}
    </>
  );
}

useGLTF.preload(AIRSHIP_GLB_URL);
