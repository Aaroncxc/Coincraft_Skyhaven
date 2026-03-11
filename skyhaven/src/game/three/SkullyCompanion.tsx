import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";
import type { CharacterPose3D } from "./useCharacterMovement";

const SKULLY_PATH = "/ingame_assets/3d/Skully_Companion.glb";
useGLTF.preload(SKULLY_PATH);

const SKULLY_SCALE = 0.04;
const FOLLOW_OFFSET = { x: -0.3, z: 0.3 };
const HOVER_BASE_Y = 1.15;
const HOVER_AMPLITUDE = 0.035;
const HOVER_PERIOD = 3.2;
const FOLLOW_SMOOTHING = 3.8;
const MOMENTUM_DECAY = 0.94;
const MOMENTUM_STRENGTH = 0.08;

const BASE_ROT_Y = -Math.PI / 4;
const IDLE_LOOK_AMPLITUDE = 0.45;
const IDLE_LOOK_PERIOD = 5.0;
const ROT_SMOOTHING = 3.0;

type Props = {
  pose: CharacterPose3D;
};

export function SkullyCompanion({ pose }: Props) {
  const gltf = useGLTF(SKULLY_PATH);
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const velocityRef = useRef(new THREE.Vector3());
  const prevTargetRef = useRef(new THREE.Vector3());
  const timeRef = useRef(0);
  const isMovingRef = useRef(false);

  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.side = THREE.DoubleSide;
          mat.depthWrite = true;
          mat.depthTest = true;
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
    const hoverY = HOVER_BASE_Y + Math.sin(timeRef.current / HOVER_PERIOD * Math.PI * 2) * HOVER_AMPLITUDE;

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
    const lagX = targetX + vel.x * 6;
    const lagZ = targetZ + vel.z * 6;

    const sm = 1 - Math.exp(-FOLLOW_SMOOTHING * delta);
    pos.x += (lagX - pos.x) * sm;
    pos.y += (hoverY - pos.y) * sm;
    pos.z += (lagZ - pos.z) * sm;

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
    groupRef.current.rotation.x += (tiltX - groupRef.current.rotation.x) * sm * 0.5;
    groupRef.current.rotation.z += (tiltZ - groupRef.current.rotation.z) * sm * 0.5;
  });

  return (
    <group
      ref={groupRef}
      position={[
        pose.gx * TILE_UNIT_SIZE + FOLLOW_OFFSET.x,
        HOVER_BASE_Y,
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
