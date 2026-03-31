import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";
import type { TargetableSnapshot } from "./targetLock";

const OUTER_RING_INNER_RADIUS = TILE_UNIT_SIZE * 0.4;
const OUTER_RING_OUTER_RADIUS = TILE_UNIT_SIZE * 0.58;
const INNER_RING_INNER_RADIUS = TILE_UNIT_SIZE * 0.24;
const INNER_RING_OUTER_RADIUS = TILE_UNIT_SIZE * 0.31;
const MARKER_Y_OFFSET = 0.038;
const GLOW_SIZE = TILE_UNIT_SIZE * 1.42;
const HEAD_MARKER_NPC_Y = 2.02;
const HEAD_MARKER_ENEMY_Y = 2.16;
const HEAD_RING_RADIUS = TILE_UNIT_SIZE * 0.12;
const HEAD_CORE_SIZE = TILE_UNIT_SIZE * 0.085;

type TargetLockMarkerProps = {
  targetRef: MutableRefObject<TargetableSnapshot | null>;
};

export function TargetLockMarker({ targetRef }: TargetLockMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);
  const innerRingRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const headGroupRef = useRef<THREE.Group>(null);
  const headRingRef = useRef<THREE.Mesh>(null);
  const headCoreRef = useRef<THREE.Mesh>(null);

  const outerMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#f5d782"),
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const innerMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#fff2bb"),
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );
  const glowMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffd76d"),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const headRingMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#ffe8a6"),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const headCoreMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color("#fff8d4"),
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const snapshot = targetRef.current;
    if (!snapshot?.alive) {
      group.visible = false;
      return;
    }

    const elapsed = clock.getElapsedTime();
    const pulse = 1 + Math.sin(elapsed * 5.4) * 0.1;
    const spin = elapsed * 0.9;
    const groundY = snapshot.surfaceY ?? snapshot.worldY ?? 0;
    const worldY = snapshot.worldY ?? groundY;
    const headMarkerBaseY = snapshot.kind === "enemy" ? HEAD_MARKER_ENEMY_Y : HEAD_MARKER_NPC_Y;

    group.visible = true;
    group.position.set(snapshot.gx * TILE_UNIT_SIZE, groundY + MARKER_Y_OFFSET, snapshot.gy * TILE_UNIT_SIZE);

    if (outerRingRef.current) {
      outerRingRef.current.rotation.z = spin;
      outerRingRef.current.scale.setScalar(pulse);
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z = -spin * 1.35;
      innerRingRef.current.scale.setScalar(0.94 + Math.cos(elapsed * 6.2) * 0.05);
    }
    if (glowRef.current) {
      const glowScale = 1 + Math.sin(elapsed * 3.8) * 0.06;
      glowRef.current.scale.setScalar(glowScale);
      glowMaterial.opacity = 0.16 + (Math.sin(elapsed * 4.2) * 0.5 + 0.5) * 0.1;
    }
    if (lightRef.current) {
      lightRef.current.intensity = 0.95 + (Math.sin(elapsed * 4.8) * 0.5 + 0.5) * 0.45;
    }
    if (headGroupRef.current) {
      headGroupRef.current.position.y = worldY - groundY + headMarkerBaseY + Math.sin(elapsed * 4) * 0.05;
      headGroupRef.current.scale.setScalar(0.96 + Math.sin(elapsed * 6.6) * 0.04);
    }
    if (headRingRef.current) {
      headRingRef.current.rotation.z = -spin * 1.9;
      headRingMaterial.opacity = 0.78 + (Math.sin(elapsed * 7) * 0.5 + 0.5) * 0.16;
    }
    if (headCoreRef.current) {
      headCoreRef.current.rotation.y = spin * 2.3;
      headCoreRef.current.rotation.x = Math.sin(elapsed * 3.2) * 0.3;
      headCoreMaterial.opacity = 0.84 + (Math.sin(elapsed * 6) * 0.5 + 0.5) * 0.14;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[GLOW_SIZE * 0.5, 48]} />
        <primitive object={glowMaterial} attach="material" />
      </mesh>
      <mesh ref={outerRingRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[OUTER_RING_INNER_RADIUS, OUTER_RING_OUTER_RADIUS, 56]} />
        <primitive object={outerMaterial} attach="material" />
      </mesh>
      <mesh ref={innerRingRef} rotation={[-Math.PI / 2, 0, 0.2]}>
        <ringGeometry args={[INNER_RING_INNER_RADIUS, INNER_RING_OUTER_RADIUS, 40]} />
        <primitive object={innerMaterial} attach="material" />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.22, 0]}
        color="#ffd977"
        intensity={1.1}
        distance={3.4}
        decay={2}
      />
      <group ref={headGroupRef} position={[0, HEAD_MARKER_NPC_Y, 0]}>
        <mesh ref={headRingRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[HEAD_RING_RADIUS, TILE_UNIT_SIZE * 0.017, 12, 32]} />
          <primitive object={headRingMaterial} attach="material" />
        </mesh>
        <mesh ref={headCoreRef}>
          <octahedronGeometry args={[HEAD_CORE_SIZE, 0]} />
          <primitive object={headCoreMaterial} attach="material" />
        </mesh>
      </group>
    </group>
  );
}
