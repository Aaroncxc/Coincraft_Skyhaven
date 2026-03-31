import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { SKULLY_MODEL_PATH, TILE_UNIT_SIZE } from "./assets3d";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import type { CharacterPose3D } from "./useCharacterMovement";
import { DEFAULT_WALK_SURFACE_OFFSET_Y } from "./islandSurface";

useGLTF.preload(SKULLY_MODEL_PATH);

const SKULLY_SCALE = 0.04;
const FOLLOW_OFFSET = { x: -0.3, z: 0.3 };
const HOVER_OFFSET_Y = 0.33;
const HOVER_AMPLITUDE = 0.042;
const HOVER_PERIOD = 3.45;
/** Phase offset vs. a “default” bob so Skully feels out of sync with the world tick. */
const HOVER_PHASE_OFFSET = Math.PI * 0.82;
/** Slower XZ follow = more delay behind the character. */
const FOLLOW_POSITION_SMOOTHING = 1.45;
/** Catch up floor height without killing the hover sine. */
const FOLLOW_HEIGHT_SMOOTHING = 2.6;
const MOMENTUM_DECAY = 0.94;
const MOMENTUM_STRENGTH = 0.05;
/** Was 6; lower = less lead, reads as more lag behind the player. */
const FOLLOW_EXTRAPOLATION = 1.2;

const BASE_ROT_Y = -Math.PI / 4;
const IDLE_LOOK_AMPLITUDE = 0.45;
const IDLE_LOOK_PERIOD = 5.0;
const ROT_SMOOTHING = 3.0;

type Props = {
  pose: CharacterPose3D;
};

export function SkullyCompanion({ pose }: Props) {
  const gltf = useGLTF(SKULLY_MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const velocityRef = useRef(new THREE.Vector3());
  const prevTargetRef = useRef(new THREE.Vector3());
  const smoothedBaseYRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const isMovingRef = useRef(false);

  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
          mat.depthTest = true;
          stripEmbeddedEmissive(mat);
          tuneRigPbrForIslandLighting(mat);
          scalePbrRoughness(mat);
          mat.needsUpdate = true;
        }
      }
    });
    return clone;
  }, [gltf.scene]);

  useFrame((_, delta) => {
    if (!groupRef.current || !modelRef.current) return;
    timeRef.current += delta;

    const targetX = pose.gx * TILE_UNIT_SIZE + FOLLOW_OFFSET.x;
    const targetZ = pose.gy * TILE_UNIT_SIZE + FOLLOW_OFFSET.z;
    const baseSurfaceY = pose.worldY ?? pose.surfaceY ?? DEFAULT_WALK_SURFACE_OFFSET_Y;
    const baseYTarget = baseSurfaceY + HOVER_OFFSET_Y;
    if (smoothedBaseYRef.current == null) smoothedBaseYRef.current = baseYTarget;
    const ySmH = 1 - Math.exp(-FOLLOW_HEIGHT_SMOOTHING * delta);
    smoothedBaseYRef.current += (baseYTarget - smoothedBaseYRef.current) * ySmH;

    const bob =
      Math.sin((timeRef.current / HOVER_PERIOD) * Math.PI * 2 + HOVER_PHASE_OFFSET) * HOVER_AMPLITUDE;

    const prevTarget = prevTargetRef.current;
    const targetDx = targetX - prevTarget.x;
    const targetDz = targetZ - prevTarget.z;
    prevTarget.set(targetX, 0, targetZ);

    const vel = velocityRef.current;
    vel.x = vel.x * MOMENTUM_DECAY + targetDx * MOMENTUM_STRENGTH;
    vel.z = vel.z * MOMENTUM_DECAY + targetDz * MOMENTUM_STRENGTH;

    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const moving = speed > 0.001;
    isMovingRef.current = moving;

    const pos = groupRef.current.position;
    const lagX = targetX + vel.x * FOLLOW_EXTRAPOLATION;
    const lagZ = targetZ + vel.z * FOLLOW_EXTRAPOLATION;

    const smPos = 1 - Math.exp(-FOLLOW_POSITION_SMOOTHING * delta);
    pos.x += (lagX - pos.x) * smPos;
    pos.z += (lagZ - pos.z) * smPos;
    pos.y = smoothedBaseYRef.current + bob;

    const baseRot = pose.direction === "right" ? BASE_ROT_Y + Math.PI : BASE_ROT_Y;
    let targetRotY: number;
    if (moving) {
      targetRotY = baseRot;
    } else {
      const idleLook = Math.sin(timeRef.current / IDLE_LOOK_PERIOD * Math.PI * 2) * IDLE_LOOK_AMPLITUDE;
      targetRotY = baseRot + idleLook;
    }

    const curRot = modelRef.current.rotation.y;
    let diff = targetRotY - curRot;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const rotSm = 1 - Math.exp(-ROT_SMOOTHING * delta);
    modelRef.current.rotation.y += diff * rotSm;

    const headNod = moving ? 0.18 : 0;
    const curNod = modelRef.current.rotation.x;
    modelRef.current.rotation.x += (headNod - curNod) * rotSm;

    const tiltX = -vel.z * 1.8;
    const tiltZ = vel.x * 1.8;
    groupRef.current.rotation.x += (tiltX - groupRef.current.rotation.x) * smPos * 0.5;
    groupRef.current.rotation.z += (tiltZ - groupRef.current.rotation.z) * smPos * 0.5;
  });

  return (
    <group
      ref={groupRef}
      position={[
        pose.gx * TILE_UNIT_SIZE + FOLLOW_OFFSET.x,
        (pose.worldY ?? pose.surfaceY ?? DEFAULT_WALK_SURFACE_OFFSET_Y) + HOVER_OFFSET_Y,
        pose.gy * TILE_UNIT_SIZE + FOLLOW_OFFSET.z,
      ]}
    >
      <group ref={modelRef}>
        <group scale={SKULLY_SCALE}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}
