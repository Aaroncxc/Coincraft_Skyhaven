import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COUNT = 300;
const AREA_PADDING = 1.5;
const Y_MIN = -0.1;
const Y_MAX = 2.2;
const DRIFT_SPEED = 0.12;
const WOBBLE_AMP = 0.3;
const WOBBLE_FREQ = 0.6;
const BASE_SIZE = 0.012;

type ParticleColor = "white" | "yellow" | "red";

function rgbForColor(kind: ParticleColor, brightness: number): [number, number, number] {
  const b = brightness;
  switch (kind) {
    case "white":
      return [b * 0.95, b, b * 0.85];
    case "yellow":
      return [1 * b, 0.92 * b, 0.2 * b];
    case "red":
      return [1 * b, 0.28 * b, 0.22 * b];
    default:
      return [b, b, b];
  }
}

type Seed = {
  x: number;
  y: number;
  z: number;
  phase: number;
  driftAngle: number;
  driftSpeed: number;
  wobbleFreq: number;
  wobbleAmp: number;
  size: number;
  brightness: number;
  colorKind: ParticleColor;
};

function makeSeeds(
  cx: number,
  cz: number,
  halfW: number,
  halfH: number
): Seed[] {
  const seeds: Seed[] = [];
  for (let i = 0; i < COUNT; i++) {
    const r = Math.random();
    const colorKind: ParticleColor =
      r < 0.5 ? "white" : r < 0.75 ? "yellow" : "red";
    seeds.push({
      x: cx + (Math.random() - 0.5) * 2 * (halfW + AREA_PADDING),
      y: Y_MIN + Math.random() * (Y_MAX - Y_MIN),
      z: cz + (Math.random() - 0.5) * 2 * (halfH + AREA_PADDING),
      phase: Math.random() * Math.PI * 2,
      driftAngle: Math.random() * Math.PI * 2,
      driftSpeed: DRIFT_SPEED * (0.4 + Math.random() * 0.6),
      wobbleFreq: WOBBLE_FREQ * (0.6 + Math.random() * 0.8),
      wobbleAmp: WOBBLE_AMP * (0.5 + Math.random()),
      size: BASE_SIZE * (0.6 + Math.random() * 0.8),
      brightness: 0.55 + Math.random() * 0.45,
      colorKind,
    });
  }
  return seeds;
}

type AmbientParticlesProps = {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfHeight: number;
};

export function AmbientParticles({
  centerX,
  centerZ,
  halfWidth,
  halfHeight,
}: AmbientParticlesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () => makeSeeds(centerX, centerZ, halfWidth, halfHeight),
    [centerX, centerZ, halfWidth, halfHeight]
  );

  const colorsArr = useMemo(() => {
    const arr = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const [r, g, b] = rgbForColor(seeds[i].colorKind, seeds[i].brightness);
      arr[i * 3] = r;
      arr[i * 3 + 1] = g;
      arr[i * 3 + 2] = b;
    }
    return arr;
  }, [seeds]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;

    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];

      const driftX = Math.cos(s.driftAngle) * s.driftSpeed * t;
      const driftZ = Math.sin(s.driftAngle) * s.driftSpeed * t;
      const wobbleY = Math.sin(t * s.wobbleFreq + s.phase) * s.wobbleAmp * 0.15;
      const wobbleX = Math.sin(t * s.wobbleFreq * 0.7 + s.phase + 1.3) * s.wobbleAmp * 0.08;

      const rangeW = (halfWidth + AREA_PADDING) * 2;
      const rangeH = (halfHeight + AREA_PADDING) * 2;
      const originX = centerX - halfWidth - AREA_PADDING;
      const originZ = centerZ - halfHeight - AREA_PADDING;

      let px = ((s.x + driftX + wobbleX - originX) % rangeW);
      if (px < 0) px += rangeW;
      px += originX;

      let pz = ((s.z + driftZ - originZ) % rangeH);
      if (pz < 0) pz += rangeH;
      pz += originZ;

      const yRange = Y_MAX - Y_MIN;
      let py = ((s.y + wobbleY - Y_MIN) % yRange);
      if (py < 0) py += yRange;
      py += Y_MIN;

      const edgeFadeX =
        1 -
        Math.max(
          0,
          (Math.abs(px - centerX) - halfWidth) / AREA_PADDING
        );
      const edgeFadeZ =
        1 -
        Math.max(
          0,
          (Math.abs(pz - centerZ) - halfHeight) / AREA_PADDING
        );
      const fade = Math.max(0, Math.min(1, edgeFadeX * edgeFadeZ));

      const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + s.phase);
      const scale = s.size * fade * pulse;

      dummy.position.set(px, py, pz);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const b = s.brightness * fade * pulse;
      const [r, g, bl] = rgbForColor(s.colorKind, b);
      colorsArr[i * 3] = r;
      colorsArr[i * 3 + 1] = g;
      colorsArr[i * 3 + 2] = bl;
    }

    mesh.instanceMatrix.needsUpdate = true;
    const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    if (attr) {
      (attr.array as Float32Array).set(colorsArr);
      attr.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 5, 5]}>
        <instancedBufferAttribute
          attach="attributes-color"
          args={[colorsArr, 3]}
        />
      </sphereGeometry>
      <meshBasicMaterial
        vertexColors
        toneMapped={false}
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
