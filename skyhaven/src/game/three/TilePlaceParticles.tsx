import { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { TileDef } from "../types";
import { TILE_UNIT_SIZE } from "./assets3d";

const PARTICLES_PER_BURST = 28;
const BURST_LIFETIME = 1.0;
const MAX_BURSTS = 8;
const MAX_INSTANCES = PARTICLES_PER_BURST * MAX_BURSTS;

type Burst = {
  cx: number;
  cz: number;
  born: number;
};

type ParticleSeed = {
  angle: number;
  speed: number;
  rise: number;
  size: number;
  colorIdx: number;
};

const PALETTE = [
  new THREE.Color(0xc8e6c9),
  new THREE.Color(0xa5d6a7),
  new THREE.Color(0xfff9c4),
  new THREE.Color(0xdcedc8),
  new THREE.Color(0xffffff),
];

function makeSeeds(count: number): ParticleSeed[] {
  const seeds: ParticleSeed[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      angle: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
      rise: 0.1 + Math.random() * 0.4,
      size: 0.025 + Math.random() * 0.03,
      colorIdx: Math.floor(Math.random() * PALETTE.length),
    });
  }
  return seeds;
}

export function TilePlaceParticles({ tiles }: { tiles: TileDef[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const burstsRef = useRef<Burst[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(() => makeSeeds(MAX_INSTANCES), []);

  const colorsArr = useMemo(() => new Float32Array(MAX_INSTANCES * 3).fill(1), []);

  const prevSnapshotRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const curSnapshot = new Map<string, string>();
    for (const t of tiles) curSnapshot.set(t.id, t.type);
    const prev = prevSnapshotRef.current;

    if (prev.size > 0) {
      for (const tile of tiles) {
        const prevType = prev.get(tile.id);
        if (prevType === undefined || prevType !== tile.type) {
          const cx = tile.gx * TILE_UNIT_SIZE;
          const cz = tile.gy * TILE_UNIT_SIZE;
          burstsRef.current.push({ cx, cz, born: -1 });
          if (burstsRef.current.length > MAX_BURSTS) {
            burstsRef.current.shift();
          }
        }
      }
    }

    prevSnapshotRef.current = curSnapshot;
  }, [tiles]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const now = state.clock.elapsedTime;

    for (const b of burstsRef.current) {
      if (b.born < 0) b.born = now;
    }

    burstsRef.current = burstsRef.current.filter(
      (b) => b.born >= 0 && now - b.born < BURST_LIFETIME
    );

    let idx = 0;

    for (const burst of burstsRef.current) {
      const t = Math.min(1, (now - burst.born) / BURST_LIFETIME);
      const easeOut = 1 - (1 - t) * (1 - t);
      const fade = Math.max(0, 1 - t * t * t);

      for (let p = 0; p < PARTICLES_PER_BURST && idx < MAX_INSTANCES; p++) {
        const s = seeds[idx];
        const dist = s.speed * 0.55 * easeOut;
        const px = burst.cx + Math.cos(s.angle) * dist;
        const pz = burst.cz + Math.sin(s.angle) * dist;
        const py = s.rise * easeOut * (1 - t * 0.6);

        const scale = s.size * fade;

        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);

        const c = PALETTE[s.colorIdx];
        colorsArr[idx * 3] = c.r * fade;
        colorsArr[idx * 3 + 1] = c.g * fade;
        colorsArr[idx * 3 + 2] = c.b * fade;

        idx++;
      }
    }

    for (let i = idx; i < MAX_INSTANCES; i++) {
      dummy.position.set(0, -50, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (attr) {
      (attr.array as Float32Array).set(colorsArr);
      attr.needsUpdate = true;
    }
    mesh.count = idx || 0;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_INSTANCES]} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 6]}>
        <instancedBufferAttribute attach="attributes-color" args={[colorsArr, 3]} />
      </sphereGeometry>
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
