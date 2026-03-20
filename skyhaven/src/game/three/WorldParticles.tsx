import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";

export type WorldParticleStyle = "floating" | "rising" | "pulsating" | "bubbling" | "smoke";

type WorldParticlesProps = {
  positions: { gx: number; gy: number }[];
  style: WorldParticleStyle;
  color?: number;
  count?: number;
  size?: number;
  tileSize?: number;
  /** Multiplies bubbling particle brightness (HDR-friendly for bloom); default 1 */
  luminanceBoost?: number;
  /** Vertical spawn offset (world units) */
  offsetY?: number;
  /** Horizontal spawn offset in X (world units), added to tile center */
  offsetX?: number;
  /** Horizontal spawn offset in Z (world units), added to tile center */
  offsetZ?: number;
  /** Bubbling only: smooth oscillation between two colors (sine, one full cycle per periodSec). */
  bubblingColorCycle?: { from: number; to: number; periodSec: number };
};

type Particle = {
  baseX: number;
  baseY: number;
  baseZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
};

/** World XZ for particle spawn; must match InstancedTileGroup (1x1 = grid corner, 2x2 = tile center). */
export function getParticleTileWorldXZ(gx: number, gy: number, tileSize: number = 1) {
  const half = tileSize > 1 ? TILE_UNIT_SIZE * 0.5 : 0;
  return {
    x: gx * TILE_UNIT_SIZE + half,
    z: gy * TILE_UNIT_SIZE + half,
  };
}

export const BUBBLING_DEFAULT_SPAWN_Y = 0.5;

function getWorldPosition(gx: number, gy: number, tileSize: number) {
  return getParticleTileWorldXZ(gx, gy, tileSize);
}

function getStyleParams(style: WorldParticleStyle) {
  switch (style) {
    case "floating":
      return { riseSpeed: 0.02, floatAmp: 0.04, floatFreq: 1.5, lifeMin: 4, lifeMax: 7 };
    case "rising":
      return { riseSpeed: 0.12, floatAmp: 0.02, floatFreq: 2, lifeMin: 2, lifeMax: 4 };
    case "pulsating":
      return { riseSpeed: 0.01, floatAmp: 0.03, floatFreq: 3, lifeMin: 5, lifeMax: 8 };
    case "bubbling":
      return { riseSpeed: 0.32, floatAmp: 0.04, floatFreq: 5, lifeMin: 1.5, lifeMax: 2.5 };
    case "smoke":
      return { riseSpeed: 0.06, floatAmp: 0.03, floatFreq: 1.2, lifeMin: 3, lifeMax: 5 };
    default:
      return { riseSpeed: 0.05, floatAmp: 0.03, floatFreq: 2, lifeMin: 3, lifeMax: 5 };
  }
}

export function WorldParticles({
  positions,
  style,
  color = 0xffffff,
  count = 15,
  size = 0.02,
  tileSize = 1,
  luminanceBoost = 1,
  offsetY,
  offsetX = 0,
  offsetZ = 0,
  bubblingColorCycle,
}: WorldParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef<Particle[]>([]);
  const spawnTimerRef = useRef(0);
  const cycleA = useMemo(() => new THREE.Color(), []);
  const cycleB = useMemo(() => new THREE.Color(), []);
  const cycleMix = useMemo(() => new THREE.Color(), []);

  const totalCount = positions.length * count;
  const params = useMemo(() => getStyleParams(style), [style]);

  const colorObj = useMemo(() => new THREE.Color(color), [color]);
  const colorsArr = useMemo(() => {
    const arr = new Float32Array(totalCount * 3);
    for (let i = 0; i < totalCount; i++) {
      colorObj.toArray(arr, i * 3);
    }
    return arr;
  }, [totalCount, colorObj]);

  useEffect(() => {
    particlesRef.current = [];
    spawnTimerRef.current = 0;
  }, [positions, style, count, tileSize, offsetY, offsetX, offsetZ]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh || positions.length === 0) return;
    const dt = Math.min(0.05, delta);
    const SPAWN_INTERVAL = 0.08;

    let bubblingBaseColor: THREE.Color = colorObj;
    if (style === "bubbling" && bubblingColorCycle) {
      cycleA.setHex(bubblingColorCycle.from);
      cycleB.setHex(bubblingColorCycle.to);
      const u =
        Math.sin(state.clock.elapsedTime * ((Math.PI * 2) / bubblingColorCycle.periodSec)) * 0.5 + 0.5;
      cycleMix.copy(cycleA).lerp(cycleB, u);
      bubblingBaseColor = cycleMix;
    }

    if (particlesRef.current.length === 0) {
      dummy.scale.setScalar(0);
      for (let i = 0; i < totalCount; i++) {
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    spawnTimerRef.current += dt;
    while (spawnTimerRef.current >= SPAWN_INTERVAL && particlesRef.current.length < totalCount) {
      spawnTimerRef.current -= SPAWN_INTERVAL;
      const posIdx = Math.floor(Math.random() * positions.length);
      const pos = positions[posIdx];
      const { x, z } = getWorldPosition(pos.gx, pos.gy, tileSize);
      const baseX = x + offsetX;
      const baseZ = z + offsetZ;
      const spawnSpread = style === "bubbling" ? 0.04 : style === "smoke" ? 0.08 : 0.3;
      const spreadX = (Math.random() - 0.5) * spawnSpread;
      const spreadZ = (Math.random() - 0.5) * spawnSpread;
      const spawnY =
        offsetY !== undefined
          ? offsetY
          : style === "bubbling"
            ? BUBBLING_DEFAULT_SPAWN_Y
            : style === "smoke"
              ? 1.6
              : 0.85;
      const life = params.lifeMin + Math.random() * (params.lifeMax - params.lifeMin);
      particlesRef.current.push({
        baseX: baseX + spreadX,
        baseY: spawnY,
        baseZ: baseZ + spreadZ,
        x: baseX + spreadX,
        y: spawnY,
        z: baseZ + spreadZ,
        vx: (Math.random() - 0.5) * (style === "smoke" ? 0.04 : 0.02),
        vy: params.riseSpeed * (0.7 + Math.random() * 0.6),
        vz: (Math.random() - 0.5) * (style === "smoke" ? 0.04 : 0.02),
        life,
        maxLife: life,
        size: size * (0.7 + Math.random() * 0.6),
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

      if (style === "floating") {
        p.y += p.vy * dt;
        const floatY = Math.sin(state.clock.elapsedTime * params.floatFreq + p.phase) * params.floatAmp;
        p.x = p.baseX + Math.sin(state.clock.elapsedTime * 0.8 + p.phase * 2) * 0.02;
        p.z = p.baseZ + Math.cos(state.clock.elapsedTime * 0.8 + p.phase * 2) * 0.02;
        dummy.position.set(p.x, p.y + floatY, p.z);
      } else if (style === "bubbling") {
        p.y += p.vy * dt;
        const wobble = Math.sin(state.clock.elapsedTime * params.floatFreq + p.phase) * params.floatAmp;
        p.x = p.baseX + Math.sin(state.clock.elapsedTime * 6 + p.phase) * 0.015;
        p.z = p.baseZ + Math.cos(state.clock.elapsedTime * 6 + p.phase * 1.3) * 0.015;
        dummy.position.set(p.x, p.y + wobble, p.z);
        const t = p.life / p.maxLife;
        dummy.scale.setScalar(p.size * t * t);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const brightness = (0.6 + t * 0.4) * luminanceBoost;
        bubblingBaseColor.toArray(colorsArr, i * 3);
        colorsArr[i * 3] *= brightness;
        colorsArr[i * 3 + 1] *= brightness;
        colorsArr[i * 3 + 2] *= brightness;
        continue;
      } else if (style === "rising") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const floatY = Math.sin(state.clock.elapsedTime * params.floatFreq + p.phase) * params.floatAmp;
        dummy.position.set(p.x, p.y + floatY, p.z);
      } else if (style === "smoke") {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const floatY = Math.sin(state.clock.elapsedTime * params.floatFreq + p.phase) * params.floatAmp;
        dummy.position.set(p.x, p.y + floatY, p.z);
        const t = p.life / p.maxLife;
        dummy.scale.setScalar(p.size * t);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        const brightness = 0.4 + t * 0.5;
        colorObj.toArray(colorsArr, i * 3);
        colorsArr[i * 3] *= brightness;
        colorsArr[i * 3 + 1] *= brightness;
        colorsArr[i * 3 + 2] *= brightness;
        continue;
      } else {
        p.y += p.vy * dt * 0.3;
        const pulse = 0.7 + 0.3 * Math.sin(state.clock.elapsedTime * params.floatFreq + p.phase);
        dummy.position.set(p.baseX, p.y, p.baseZ);
        dummy.scale.setScalar(p.size * (p.life / p.maxLife) * pulse);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        colorObj.toArray(colorsArr, i * 3);
        const alpha = 0.4 + 0.4 * pulse;
        colorsArr[i * 3] *= alpha;
        colorsArr[i * 3 + 1] *= alpha;
        colorsArr[i * 3 + 2] *= alpha;
        continue;
      }

      const t = p.life / p.maxLife;
      dummy.scale.setScalar(p.size * t);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const brightness = 0.5 + t * 0.5;
      colorObj.toArray(colorsArr, i * 3);
      colorsArr[i * 3] *= brightness;
      colorsArr[i * 3 + 1] *= brightness;
      colorsArr[i * 3 + 2] *= brightness;
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

  if (positions.length === 0 || totalCount === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, totalCount]} frustumCulled={false}>
      <sphereGeometry args={[1, 4, 4]}>
        <instancedBufferAttribute attach="attributes-color" args={[colorsArr, 3]} />
      </sphereGeometry>
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        transparent
        opacity={1}
        depthWrite={false}
        blending={style === "smoke" ? THREE.NormalBlending : THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
