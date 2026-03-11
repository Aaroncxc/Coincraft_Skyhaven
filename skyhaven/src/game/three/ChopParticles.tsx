import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 24;
const PARTICLE_LIFETIME = 0.8;
const BURST_SPEED = 2.5;
const GRAVITY = -5;
const BASE_SIZE = 0.025;

type Particle = {
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
};

type ChopParticlesProps = {
  gx: number;
  gy: number;
  isChopping: boolean;
};

export function ChopParticles({ gx, gy, isChopping }: ChopParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particlesRef = useRef<Particle[]>([]);
  const lastChopStateRef = useRef(false);

  const colorsArr = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = 1;
      arr[i * 3 + 1] = 0.85;
      arr[i * 3 + 2] = 0.3;
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(0.05, delta);

    const wasChopping = lastChopStateRef.current;
    lastChopStateRef.current = isChopping;

    if (isChopping && !wasChopping) {
      const cx = gx;
      const cz = gy;
      const particles: Particle[] = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = BURST_SPEED * (0.3 + Math.random() * 0.7);
        const upSpeed = 1.5 + Math.random() * 2.5;
        const life = PARTICLE_LIFETIME * (0.5 + Math.random() * 0.5);
        particles.push({
          vx: Math.cos(angle) * speed * 0.5,
          vy: upSpeed,
          vz: Math.sin(angle) * speed * 0.5,
          life,
          maxLife: life,
          size: BASE_SIZE * (0.6 + Math.random() * 0.8),
        });
      }
      particlesRef.current = particles;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        dummy.position.set(cx, 0.9, cz);
        dummy.scale.setScalar(particles[i].size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    const particles = particlesRef.current;
    if (particles.length === 0) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

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
      p.vy += GRAVITY * dt;

      const mat = new THREE.Matrix4();
      mesh.getMatrixAt(i, mat);
      const pos = new THREE.Vector3();
      pos.setFromMatrixPosition(mat);

      pos.x += p.vx * dt;
      pos.y += p.vy * dt;
      pos.z += p.vz * dt;

      const t = p.life / p.maxLife;
      const scale = p.size * t;

      dummy.position.copy(pos);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const brightness = 0.6 + t * 0.4;
      const r = Math.random() < 0.5 ? 1 * brightness : 0.9 * brightness;
      const g = (0.6 + Math.random() * 0.25) * brightness;
      const b = 0.15 * brightness;
      colorsArr[i * 3] = r;
      colorsArr[i * 3 + 1] = g;
      colorsArr[i * 3 + 2] = b;
    }

    mesh.instanceMatrix.needsUpdate = true;
    const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (attr) {
      (attr.array as Float32Array).set(colorsArr);
      attr.needsUpdate = true;
    }

    if (!anyAlive) {
      particlesRef.current = [];
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PARTICLE_COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 4, 4]}>
        <instancedBufferAttribute
          attach="attributes-color"
          args={[colorsArr, 3]}
        />
      </sphereGeometry>
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
