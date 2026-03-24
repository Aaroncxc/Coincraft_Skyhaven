import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getParticleTileWorldXZ } from "./WorldParticles";

const ORANGE_PARTICLE_COUNT = 25;
const PARTICLE_LIFETIME_MIN = 3;
const PARTICLE_LIFETIME_MAX = 5;
const RISE_SPEED = 0.08;
const FLOAT_AMPLITUDE = 0.03;
const FLOAT_FREQ = 2;
const BASE_SIZE = 0.018;
const SPAWN_INTERVAL = 0.15;
const ORANGE_BASE_OFFSET_Y = 0.9;

const RING_COUNT = 3;
const RING_CYCLE_DURATION = 5.6;
const RING_START_OFFSET_Y = -0.26;
const RING_END_OFFSET_Y = -1.58;
const RING_RADIUS = 1.42;
const RING_THICKNESS = 0.08;
const RING_GLOW_THICKNESS = 0.17;
const RING_PULSE_SCALE = 0.22;
const RING_STACK_GAP = 0.22;
const RING_RADIUS_GAP = 0.08;
const RING_DOWNWARD_SHRINK = 0.32;
const RING_LIGHT_HEIGHT_OFFSET = -0.58;
const RING_LIGHT_INTENSITY = 3.05;
const RING_LIGHT_DISTANCE = 6.4;
const RING_BURST_PROGRESS_THRESHOLD = 0.84;
const BURST_PARTICLE_CAPACITY = 72;
const BURST_PARTICLES_PER_RING = 10;
const BURST_LIFE_MIN = 0.38;
const BURST_LIFE_MAX = 0.82;
const BURST_SPEED_MIN = 0.18;
const BURST_SPEED_MAX = 0.62;
const BURST_UPWARD_SPEED_MIN = 0.05;
const BURST_UPWARD_SPEED_MAX = 0.22;
const BURST_GRAVITY = 0.7;
const BURST_SIZE_MIN = 0.018;
const BURST_SIZE_MAX = 0.05;

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

type BurstParticle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  warmMix: number;
};

export type MagicTowerParticleAnchor = {
  id: string;
  gx: number;
  gy: number;
  surfaceY: number;
};

type MagicTowerParticlesProps = {
  magicTowerTiles: MagicTowerParticleAnchor[];
};

function getMagicTowerWorldCenter(gx: number, gy: number) {
  return getParticleTileWorldXZ(gx, gy, 2);
}

function MagicTowerEmitter({ tower }: { tower: MagicTowerParticleAnchor }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const burstMeshRef = useRef<THREE.InstancedMesh>(null);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
  const ringGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const glowLightRef = useRef<THREE.PointLight>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const burstDummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef<Particle[]>([]);
  const burstParticlesRef = useRef<Array<BurstParticle | null>>(
    Array.from({ length: BURST_PARTICLE_CAPACITY }, () => null),
  );
  const ringPrevProgressRef = useRef<number[]>(Array.from({ length: RING_COUNT }, () => -1));
  const spawnTimerRef = useRef(0);
  const ringBrightColor = useMemo(() => new THREE.Color().setRGB(3.55, 1.82, 6.35), []);
  const ringCoreColor = useMemo(() => new THREE.Color().setRGB(2.42, 0.98, 4.8), []);
  const ringDeepColor = useMemo(() => new THREE.Color().setRGB(1.02, 0.24, 3.2), []);
  const ringWarmColor = useMemo(() => new THREE.Color().setRGB(2.15, 0.56, 1.95), []);
  const ringEmberColor = useMemo(() => new THREE.Color().setRGB(1.55, 0.34, 1.24), []);

  useEffect(() => {
    particlesRef.current = [];
    burstParticlesRef.current = Array.from({ length: BURST_PARTICLE_CAPACITY }, () => null);
    ringPrevProgressRef.current = Array.from({ length: RING_COUNT }, () => -1);
    spawnTimerRef.current = 0;
  }, [tower.gx, tower.gy, tower.id, tower.surfaceY]);

  const colorsArr = useMemo(() => {
    const arr = new Float32Array(ORANGE_PARTICLE_COUNT * 3);
    for (let i = 0; i < ORANGE_PARTICLE_COUNT; i++) {
      arr[i * 3] = 1;
      arr[i * 3 + 1] = 0.7;
      arr[i * 3 + 2] = 0.27;
    }
    return arr;
  }, []);
  const burstColorsArr = useMemo(() => {
    const arr = new Float32Array(BURST_PARTICLE_CAPACITY * 3);
    return arr;
  }, []);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const burstMesh = burstMeshRef.current;
    const dt = Math.min(0.05, delta);
    const { x: cx, z: cz } = getMagicTowerWorldCenter(tower.gx, tower.gy);
    const particleBaseY = tower.surfaceY + ORANGE_BASE_OFFSET_Y;
    const ringStartY = tower.surfaceY + RING_START_OFFSET_Y;
    const ringEndY = tower.surfaceY + RING_END_OFFSET_Y;
    const ringMidY = tower.surfaceY + (RING_START_OFFSET_Y + RING_END_OFFSET_Y) * 0.5;
    const elapsed = state.clock.elapsedTime;
    const glowLight = glowLightRef.current;

    if (glowLight) {
      const pulse = 0.9 + 0.1 * Math.sin(elapsed * 0.75 + tower.gx * 0.7 + tower.gy * 0.9);
      glowLight.position.set(cx, ringMidY + RING_LIGHT_HEIGHT_OFFSET, cz);
      glowLight.intensity = RING_LIGHT_INTENSITY * pulse;
    }

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = ringRefs.current[i];
      const glowRing = ringGlowRefs.current[i];
      if (!ring || !glowRing) continue;
      const progress = (elapsed / RING_CYCLE_DURATION + i / RING_COUNT) % 1;
      const previousProgress = ringPrevProgressRef.current[i];
      const stackOffset = -i * RING_STACK_GAP;
      const travel = THREE.MathUtils.smootherstep(progress, 0, 1);
      const pulse = Math.sin(travel * Math.PI);
      const radiusScale = Math.max(
        0.45,
        1 + pulse * RING_PULSE_SCALE - travel * RING_DOWNWARD_SHRINK + i * RING_RADIUS_GAP,
      );
      const glowScale = radiusScale * 1.08;
      const opacity = Math.max(0, 0.98 * Math.pow(1 - travel, 1.15));
      const glowOpacity = Math.max(0, 0.52 * Math.pow(1 - travel, 0.9));
      const ringY = THREE.MathUtils.lerp(ringStartY, ringEndY, travel) + stackOffset;
      const material = ring.material as THREE.MeshBasicMaterial;
      const glowMaterial = glowRing.material as THREE.MeshBasicMaterial;
      ring.position.set(cx, ringY, cz);
      ring.scale.setScalar(radiusScale);
      glowRing.position.set(cx, ringY, cz);
      glowRing.scale.setScalar(glowScale);
      material.opacity = opacity;
      glowMaterial.opacity = glowOpacity;
      material.color
        .copy(ringBrightColor)
        .lerp(ringCoreColor, 0.32 + progress * 0.36)
        .lerp(ringWarmColor, 0.04 + progress * 0.1)
        .lerp(ringDeepColor, 0.16 + progress * 0.34);
      glowMaterial.color
        .copy(ringBrightColor)
        .lerp(ringWarmColor, 0.05 + travel * 0.08)
        .lerp(ringEmberColor, 0.04 + travel * 0.08)
        .lerp(ringDeepColor, 0.08 + travel * 0.18);

      if (previousProgress >= 0 && previousProgress > RING_BURST_PROGRESS_THRESHOLD && progress < 0.18) {
        const burstY = ringEndY + stackOffset;
        const burstRadius = RING_RADIUS * radiusScale;
        for (let burstIndex = 0; burstIndex < BURST_PARTICLES_PER_RING; burstIndex++) {
          const slot = burstParticlesRef.current.findIndex((particle) => particle == null || particle.life <= 0);
          if (slot === -1) break;
          const angle = (burstIndex / BURST_PARTICLES_PER_RING) * Math.PI * 2 + Math.random() * 0.4;
          const radius = burstRadius * (0.72 + Math.random() * 0.22);
          const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);
          const life = BURST_LIFE_MIN + Math.random() * (BURST_LIFE_MAX - BURST_LIFE_MIN);
          burstParticlesRef.current[slot] = {
            x: cx + Math.cos(angle) * radius,
            y: burstY + (Math.random() - 0.5) * 0.04,
            z: cz + Math.sin(angle) * radius,
            vx: Math.cos(angle) * speed,
            vy: BURST_UPWARD_SPEED_MIN + Math.random() * (BURST_UPWARD_SPEED_MAX - BURST_UPWARD_SPEED_MIN),
            vz: Math.sin(angle) * speed,
            life,
            maxLife: life,
            size: BURST_SIZE_MIN + Math.random() * (BURST_SIZE_MAX - BURST_SIZE_MIN),
            warmMix: Math.random(),
          };
        }
      }
      ringPrevProgressRef.current[i] = progress;
    }

    if (!mesh) return;

    let instanceMatrixDirty = false;
    let colorDirty = false;
    if (particlesRef.current.length === 0) {
      dummy.scale.setScalar(0);
      for (let i = 0; i < ORANGE_PARTICLE_COUNT; i++) {
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        colorsArr[i * 3] = 0;
        colorsArr[i * 3 + 1] = 0;
        colorsArr[i * 3 + 2] = 0;
      }
      instanceMatrixDirty = true;
      colorDirty = true;
    }

    spawnTimerRef.current += dt;
    while (spawnTimerRef.current >= SPAWN_INTERVAL && particlesRef.current.length < ORANGE_PARTICLE_COUNT) {
      spawnTimerRef.current -= SPAWN_INTERVAL;
      const life = PARTICLE_LIFETIME_MIN + Math.random() * (PARTICLE_LIFETIME_MAX - PARTICLE_LIFETIME_MIN);
      const offsetX = (Math.random() - 0.5) * 0.4;
      const offsetZ = (Math.random() - 0.5) * 0.4;
      particlesRef.current.push({
        x: cx + offsetX,
        y: particleBaseY,
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
        colorsArr[i * 3] = 0;
        colorsArr[i * 3 + 1] = 0;
        colorsArr[i * 3 + 2] = 0;
        instanceMatrixDirty = true;
        colorDirty = true;
        continue;
      }

      anyAlive = true;
      p.y += p.vy * dt;
      const t = p.life / p.maxLife;
      const floatY = Math.sin(elapsed * FLOAT_FREQ + p.phase) * FLOAT_AMPLITUDE * t;
      const scale = p.size * t;

      dummy.position.set(p.x, p.y + floatY, p.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      instanceMatrixDirty = true;

      const shimmer = 0.05 * Math.sin(elapsed * 3 + p.phase);
      const brightness = 0.48 + t * 0.52 + shimmer;
      colorsArr[i * 3] = 1 * brightness;
      colorsArr[i * 3 + 1] = 0.68 * brightness;
      colorsArr[i * 3 + 2] = 0.27 * brightness;
      colorDirty = true;
    }

    if (instanceMatrixDirty) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (colorDirty) {
      const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      if (attr) {
        (attr.array as Float32Array).set(colorsArr);
        attr.needsUpdate = true;
      }
    }

    if (!anyAlive && particles.length > 0) {
      particlesRef.current = [];
    }

    if (!burstMesh) return;

    let burstInstanceDirty = false;
    let burstColorDirty = false;
    const burstParticles = burstParticlesRef.current;
    for (let i = 0; i < burstParticles.length; i++) {
      const p = burstParticles[i];
      if (!p) {
        burstDummy.scale.setScalar(0);
        burstDummy.updateMatrix();
        burstMesh.setMatrixAt(i, burstDummy.matrix);
        burstColorsArr[i * 3] = 0;
        burstColorsArr[i * 3 + 1] = 0;
        burstColorsArr[i * 3 + 2] = 0;
        burstInstanceDirty = true;
        burstColorDirty = true;
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        burstParticles[i] = null;
        burstDummy.scale.setScalar(0);
        burstDummy.updateMatrix();
        burstMesh.setMatrixAt(i, burstDummy.matrix);
        burstColorsArr[i * 3] = 0;
        burstColorsArr[i * 3 + 1] = 0;
        burstColorsArr[i * 3 + 2] = 0;
        burstInstanceDirty = true;
        burstColorDirty = true;
        continue;
      }

      p.vy -= BURST_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.985;
      p.vz *= 0.985;

      const lifeT = p.life / p.maxLife;
      const scale = p.size * Math.pow(lifeT, 0.72);
      burstDummy.position.set(p.x, p.y, p.z);
      burstDummy.scale.setScalar(scale);
      burstDummy.updateMatrix();
      burstMesh.setMatrixAt(i, burstDummy.matrix);
      burstInstanceDirty = true;

      const color = new THREE.Color()
        .copy(ringBrightColor)
        .lerp(ringCoreColor, 0.24 + p.warmMix * 0.18)
        .lerp(ringWarmColor, 0.06 + p.warmMix * 0.08)
        .lerp(ringDeepColor, 0.14 + (1 - lifeT) * 0.32);
      burstColorsArr[i * 3] = color.r * lifeT;
      burstColorsArr[i * 3 + 1] = color.g * lifeT;
      burstColorsArr[i * 3 + 2] = color.b * lifeT;
      burstColorDirty = true;
    }

    if (burstInstanceDirty) {
      burstMesh.instanceMatrix.needsUpdate = true;
    }
    if (burstColorDirty) {
      const burstAttr = burstMesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      if (burstAttr) {
        (burstAttr.array as Float32Array).set(burstColorsArr);
        burstAttr.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, ORANGE_PARTICLE_COUNT]}
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
      <instancedMesh
        ref={burstMeshRef}
        args={[undefined, undefined, BURST_PARTICLE_CAPACITY]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 5]}>
          <instancedBufferAttribute attach="attributes-color" args={[burstColorsArr, 3]} />
        </sphereGeometry>
        <meshBasicMaterial
          vertexColors
          toneMapped={false}
          transparent
          opacity={0.96}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
      {Array.from({ length: RING_COUNT }).map((_, index) => (
        <mesh
          key={`${tower.id}-ring-${index}`}
          ref={(node) => {
            ringRefs.current[index] = node;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          frustumCulled={false}
          renderOrder={20}
        >
          <ringGeometry args={[Math.max(0.01, RING_RADIUS - RING_THICKNESS), RING_RADIUS, 96]} />
          <meshBasicMaterial
            color="#cf7cff"
            toneMapped={false}
            transparent
            opacity={0.98}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      {Array.from({ length: RING_COUNT }).map((_, index) => (
        <mesh
          key={`${tower.id}-ring-glow-${index}`}
          ref={(node) => {
            ringGlowRefs.current[index] = node;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          frustumCulled={false}
          renderOrder={19}
        >
          <ringGeometry
            args={[
              Math.max(0.01, RING_RADIUS - RING_GLOW_THICKNESS),
              RING_RADIUS + RING_GLOW_THICKNESS * 0.22,
              96,
            ]}
          />
          <meshBasicMaterial
            color="#b56cff"
            toneMapped={false}
            transparent
            opacity={0.62}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      <pointLight
        ref={glowLightRef}
        color="#bf6bff"
        intensity={RING_LIGHT_INTENSITY}
        distance={RING_LIGHT_DISTANCE}
        decay={2}
      />
    </group>
  );
}

export function MagicTowerParticles({ magicTowerTiles }: MagicTowerParticlesProps) {
  if (magicTowerTiles.length === 0) return null;

  return (
    <group>
      {magicTowerTiles.map((tower) => (
        <MagicTowerEmitter key={tower.id} tower={tower} />
      ))}
    </group>
  );
}
