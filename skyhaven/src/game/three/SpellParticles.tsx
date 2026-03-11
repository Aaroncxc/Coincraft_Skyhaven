import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { MutableRefObject } from "react";
import type { SpellCastEvent } from "./useCharacterMovement";

const TILE_SURFACE_Y = 0.82;
const BALL_SPEED = 5;
const BALL_LIFETIME = 1.4;
const BALL_INITIAL_RADIUS = 0.2;
const CORE_COLOR = new THREE.Color(0xaaddff);
const GLOW_COLOR = new THREE.Color(0x4488dd);

type EnergyBall = {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  life: number;
  maxLife: number;
};

type SpellParticlesProps = {
  spellCastRef: MutableRefObject<SpellCastEvent | null>;
};

export function SpellParticles({ spellCastRef }: SpellParticlesProps) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const ballRef = useRef<EnergyBall | null>(null);
  const lastEventRef = useRef<SpellCastEvent | null>(null);

  const coreMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: CORE_COLOR.clone(),
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: GLOW_COLOR.clone(),
        transparent: true,
        opacity: 0.5,
        toneMapped: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const dt = Math.min(0.05, delta);

    const event = spellCastRef.current;
    if (event && event !== lastEventRef.current) {
      lastEventRef.current = event;
      ballRef.current = {
        x: event.posX,
        y: TILE_SURFACE_Y + 0.55,
        z: event.posZ,
        dirX: event.dirX,
        dirZ: event.dirZ,
        life: BALL_LIFETIME,
        maxLife: BALL_LIFETIME,
      };
    }

    const ball = ballRef.current;
    if (!ball) {
      group.scale.setScalar(0);
      return;
    }

    ball.life -= dt;
    if (ball.life <= 0) {
      ballRef.current = null;
      lastEventRef.current = null;
      spellCastRef.current = null;
      group.scale.setScalar(0);
      return;
    }

    ball.x += ball.dirX * BALL_SPEED * dt;
    ball.z += ball.dirZ * BALL_SPEED * dt;

    const t = ball.life / ball.maxLife;
    const fade = t * t;
    const pulse = 0.9 + 0.1 * Math.sin(state.clock.elapsedTime * 12);
    const coreScale = BALL_INITIAL_RADIUS * pulse * fade;
    const glowScale = BALL_INITIAL_RADIUS * 2.2 * pulse * fade;

    group.position.set(ball.x, ball.y, ball.z);
    coreMat.opacity = 0.9 * fade;
    glowMat.opacity = 0.35 * fade;
    coreMat.color.lerpColors(CORE_COLOR, GLOW_COLOR, (1 - t) * 0.5);
    glowMat.color.copy(coreMat.color);

    if (coreRef.current) coreRef.current.scale.setScalar(coreScale);
    if (glowRef.current) glowRef.current.scale.setScalar(glowScale);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={glowRef} material={glowMat}>
        <sphereGeometry args={[1, 12, 12]} />
      </mesh>
      <mesh ref={coreRef} material={coreMat}>
        <sphereGeometry args={[1, 16, 16]} />
      </mesh>
    </group>
  );
}
