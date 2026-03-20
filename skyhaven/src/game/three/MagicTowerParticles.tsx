import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";

const PARTICLE_COUNT = 25;
const PARTICLE_LIFETIME_MIN = 3;
const PARTICLE_LIFETIME_MAX = 5;
const RISE_SPEED = 0.08;
const FLOAT_AMPLITUDE = 0.03;
const FLOAT_FREQ = 2;
const BASE_SIZE = 0.018;
const SPAWN_INTERVAL = 0.15;

type Particle = {
  x: number;
  y: number;
  z: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
};

type MagicTowerParticlesProps = {
  magicTowerTile: { gx: number; gy: number } | null;
};

function getMagicTowerWorldCenter(gx: number, gy: number) {
  return {
    x: gx * TILE_UNIT_SIZE + TILE_UNIT_SIZE,
    z: gy * TILE_UNIT_SIZE + TILE_UNIT_SIZE,
  };
}

export function MagicTowerParticles({ magicTowerTile }: MagicTowerParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef<Particle[]>([]);
  const spawnTimerRef = useRef(0);

  useEffect(() => {
    particlesRef.current = [];
    spawnTimerRef.current = 0;
  }, [magicTowerTile]);

  const colorsArr = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = 1;
      arr[i * 3 + 1] = 0.7;
      arr[i * 3 + 2] = 0.27;
    }
    return arr;
  }, []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !magicTowerTile) return;
    const dt = Math.min(0.05, delta);
    const { x: cx, z: cz } = getMagicTowerWorldCenter(magicTowerTile.gx, magicTowerTile.gy);
    const baseY = 0.9;

    if (particlesRef.current.length === 0) {
      dummy.scale.setScalar(0);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    spawnTimerRef.current += dt;
    while (spawnTimerRef.current >= SPAWN_INTERVAL && particlesRef.current.length < PARTICLE_COUNT) {
      spawnTimerRef.current -= SPAWN_INTERVAL;
      const life = PARTICLE_LIFETIME_MIN + Math.random() * (PARTICLE_LIFETIME_MAX - PARTICLE_LIFETIME_MIN);
      const offsetX = (Math.random() - 0.5) * 0.4;
      const offsetZ = (Math.random() - 0.5) * 0.4;
      particlesRef.current.push({
        x: cx + offsetX,
        y: baseY,
        z: cz + offsetZ,
        vy: RISE_SPEED * (0.6 + Math.random() * 0.8),
        life,
        maxLife: life,
        size: BASE_SIZE * (0.7 + Math.random() * 0.6),
        phase: Math.random() * Math.PI * 2,
      });
    }

    const particles = particlesRef.current;
    let anyAlive = false;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      anyAlive = true;
      p.y += p.vy * dt;
      const t = p.life / p.maxLife;
      const floatY = Math.sin(state.clock.elapsedTime * FLOAT_FREQ + p.phase) * FLOAT_AMPLITUDE * t;
      const scale = p.size * t;

      dummy.position.set(p.x, p.y + floatY, p.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const brightness = 0.5 + t * 0.5;
      colorsArr[i * 3] = 1 * brightness;
      colorsArr[i * 3 + 1] = (0.65 + Math.random() * 0.1) * brightness;
      colorsArr[i * 3 + 2] = 0.27 * brightness;
    }

    if (anyAlive) {
      mesh.instanceMatrix.needsUpdate = true;
      const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      if (attr) {
        (attr.array as Float32Array).set(colorsArr);
        attr.needsUpdate = true;
      }
    }

    if (!anyAlive && particles.length > 0) {
      particlesRef.current = [];
    }
  });

  if (!magicTowerTile) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 4, 4]}>
        <instancedBufferAttribute attach="attributes-color" args={[colorsArr, 3]} />
      </sphereGeometry>
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
