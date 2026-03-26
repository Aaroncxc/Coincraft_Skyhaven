import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AssetKey } from "../types";

type Particle = {
  baseX: number;
  y: number;
  baseZ: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
  vy: number;
};

const PRESETS: Record<
  string,
  {
    color: number;
    count: number;
    size: number;
    lightColor: string;
    lightIntensity: number;
    lightDistance: number;
    spawnSpread: number;
    riseSpeed: number;
    floatFreq: number;
    lifeMin: number;
    lifeMax: number;
  }
> = {
  torchDecoration: {
    color: 0xff6a22,
    count: 20,
    size: 0.03,
    lightColor: "#ff7820",
    lightIntensity: 3.2,
    lightDistance: 5.5,
    spawnSpread: 0.06,
    riseSpeed: 0.055,
    floatFreq: 3.2,
    lifeMin: 4,
    lifeMax: 7,
  },
  statueAaron: {
    color: 0xa8d4ff,
    count: 16,
    size: 0.022,
    lightColor: "#c4e4ff",
    lightIntensity: 2.0,
    lightDistance: 4.2,
    spawnSpread: 0.22,
    riseSpeed: 0.012,
    floatFreq: 3,
    lifeMin: 5,
    lifeMax: 8,
  },
};

type Props = {
  decoration: AssetKey;
  /** Top of mesh in decoration group space (after normScale). */
  emitterLocalY: number;
  enabled: boolean;
};

export function DecorationMysticParticles({ decoration, emitterLocalY, enabled }: Props) {
  const preset = PRESETS[decoration] ?? PRESETS.statueAaron;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef<Particle[]>([]);
  const spawnTimerRef = useRef(0);
  const colorObj = useMemo(() => new THREE.Color(preset.color), [preset.color]);

  const colorsArr = useMemo(() => {
    const arr = new Float32Array(preset.count * 3);
    for (let i = 0; i < preset.count; i++) {
      colorObj.toArray(arr, i * 3);
    }
    return arr;
  }, [preset.count, colorObj]);

  useEffect(() => {
    particlesRef.current = [];
    spawnTimerRef.current = 0;
  }, [decoration, emitterLocalY, enabled]);

  useFrame((state, delta) => {
    if (!enabled) return;
    const mesh = meshRef.current;
    const light = lightRef.current;
    if (!mesh) return;

    const dt = Math.min(0.05, delta);
    const SPAWN_INTERVAL = 0.085;
    const elapsed = state.clock.elapsedTime;

    if (light) {
      light.position.set(0, emitterLocalY + 0.02, 0);
      const pulse = 0.88 + 0.12 * Math.sin(elapsed * 1.4);
      light.intensity = preset.lightIntensity * pulse;
    }

    if (particlesRef.current.length === 0) {
      dummy.scale.setScalar(0);
      for (let i = 0; i < preset.count; i++) {
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    spawnTimerRef.current += dt;
    while (spawnTimerRef.current >= SPAWN_INTERVAL && particlesRef.current.length < preset.count) {
      spawnTimerRef.current -= SPAWN_INTERVAL;
      const spread = preset.spawnSpread;
      const spreadX = (Math.random() - 0.5) * spread;
      const spreadZ = (Math.random() - 0.5) * spread;
      const life = preset.lifeMin + Math.random() * (preset.lifeMax - preset.lifeMin);
      particlesRef.current.push({
        baseX: spreadX,
        y: emitterLocalY,
        baseZ: spreadZ,
        life,
        maxLife: life,
        size: preset.size * (0.75 + Math.random() * 0.5),
        phase: Math.random() * Math.PI * 2,
        vy: preset.riseSpeed * (0.65 + Math.random() * 0.7),
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
      p.y += p.vy * dt * 0.3;
      const pulse = 0.7 + 0.3 * Math.sin(elapsed * preset.floatFreq + p.phase);
      dummy.position.set(p.baseX, p.y, p.baseZ);
      dummy.scale.setScalar(p.size * (p.life / p.maxLife) * pulse);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      colorObj.toArray(colorsArr, i * 3);
      const alpha = 0.45 + 0.45 * pulse;
      colorsArr[i * 3] *= alpha;
      colorsArr[i * 3 + 1] *= alpha;
      colorsArr[i * 3 + 2] *= alpha;
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

  if (!enabled) return null;

  return (
    <group>
      <pointLight
        ref={lightRef}
        color={preset.lightColor}
        intensity={preset.lightIntensity}
        distance={preset.lightDistance}
        decay={2}
      />
      <instancedMesh ref={meshRef} args={[undefined, undefined, preset.count]} frustumCulled={false}>
        <sphereGeometry args={[1, 4, 4]}>
          <instancedBufferAttribute attach="attributes-color" args={[colorsArr, 3]} />
        </sphereGeometry>
        <meshBasicMaterial
          vertexColors
          toneMapped={false}
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
}
