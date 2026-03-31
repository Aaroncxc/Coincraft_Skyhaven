import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TileDef } from "../types";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { TILE_UNIT_SIZE, MAGIC_MAN_MODELS } from "./assets3d";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import { getNpcGroundProfile } from "./avatarGrounding";
import type { IslandSurfaceData } from "./islandSurface";
import { getNpcSupportWorldY } from "./islandSurface";

useGLTF.preload(MAGIC_MAN_MODELS.idle);

const CHAR_SCALE = 0.294;
const BASE_ROT_Y = -Math.PI / 4;
const FACE_PLAYER_RADIUS = 2.6;
const GROUND_OFFSET_Y = getNpcGroundProfile("magicMan").visualGroundOffsetY;

type Props = {
  portTile: TileDef;
  surfaceData: IslandSurfaceData;
  playerGx: number;
  playerGy: number;
};

export function AirshipDockMageNPC({ portTile, surfaceData, playerGx, playerGy }: Props) {
  const idleGltf = useGLTF(MAGIC_MAN_MODELS.idle);
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const sceneRef = useRef<THREE.Group | THREE.Object3D>(null);

  const span = SKYHAVEN_SPRITE_MANIFEST.tile.airShipPort?.gridSpan ?? { w: 2, h: 2 };
  const centerGx = portTile.gx + (span.w - 1) * 0.5;
  const centerGy = portTile.gy + (span.h - 1) * 0.5;
  const rgx = Math.round(centerGx);
  const rgy = Math.round(centerGy);

  useMemo(() => {
    idleGltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = true;
        mat.depthTest = true;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.transparent && mat.map) {
            mat.alphaTest = 0.5;
            mat.transparent = false;
          }
        }
        stripEmbeddedEmissive(mat);
        tuneRigPbrForIslandLighting(mat);
        scalePbrRoughness(mat);
        mat.needsUpdate = true;
      }
    });
  }, [idleGltf.scene]);

  const clips = useMemo(() => {
    const raw = idleGltf.animations?.[0];
    if (!raw) return [];
    const c = raw.clone();
    c.name = "idle";
    return [c];
  }, [idleGltf.animations]);

  const { actions } = useAnimations(clips, sceneRef);

  useEffect(() => {
    const idle = actions["idle"];
    if (!idle) return;
    idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
  }, [actions]);

  useFrame((_, delta) => {
    const outer = outerRef.current;
    const model = modelRef.current;
    if (!outer) return;
    const dt = Math.min(0.05, delta);
    const supportY = getNpcSupportWorldY(surfaceData, rgx, rgy);
    const targetY = supportY + GROUND_OFFSET_Y;
    const tx = centerGx * TILE_UNIT_SIZE;
    const tz = centerGy * TILE_UNIT_SIZE;
    const sm = 1 - Math.exp(-12 * dt);
    outer.position.x += (tx - outer.position.x) * sm;
    outer.position.z += (tz - outer.position.z) * sm;
    outer.position.y += (targetY - outer.position.y) * sm;

    if (model) {
      const px = playerGx * TILE_UNIT_SIZE;
      const pz = playerGy * TILE_UNIT_SIZE;
      const dx = px - outer.position.x;
      const dz = pz - outer.position.z;
      const dist = Math.hypot(dx, dz) / TILE_UNIT_SIZE;
      let targetRot = BASE_ROT_Y;
      if (dist <= FACE_PLAYER_RADIUS && (Math.abs(dx) > 1e-4 || Math.abs(dz) > 1e-4)) {
        targetRot = Math.atan2(dx, dz);
      }
      const cur = model.rotation.y;
      let diff = targetRot - cur;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      model.rotation.y += diff * sm;
    }
  });

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive ref={sceneRef} object={idleGltf.scene} />
        </group>
      </group>
    </group>
  );
}
