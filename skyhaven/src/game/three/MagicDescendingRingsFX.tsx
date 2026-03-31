import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Matched to `MagicTowerParticles` ring pass (descending lilac rings + glow + pulse light). */
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

export type MagicDescendingRingsFXProps = {
  /**
   * Local Y anchor before parent scale (e.g. mid-belly of scaled GLB).
   * Ring path uses same offset deltas as the tower, divided by `scaleDenominator`.
   */
  anchorLocalY?: number;
  /** World-space-equivalent offsets before dividing by `scaleDenominator` (defaults match tower-style fall). */
  ringStartOffsetY?: number;
  /** More negative = rings travel further downward (world-ish units, scaled by `1/scaleDenominator`). */
  ringEndOffsetY?: number;
  /** Time offset (seconds) so multiple instances don’t cycle in lockstep. */
  phaseOffsetSec?: number;
  /** Parent uniform scale (e.g. airship 3.35) so ring size / fall match tower in world space. */
  scaleDenominator?: number;
  /** Slightly dimmer than tower when nested in a busy scene. */
  lightIntensityMul?: number;
  /** Optional direct local-space start height. Overrides `anchorLocalY + ringStartOffsetY`. */
  ringStartLocalY?: number;
  /** Optional direct local-space end height. Overrides `anchorLocalY + ringEndOffsetY`. */
  ringEndLocalY?: number;
  /**
   * 1 = default (fade along full fall). Lower (e.g. 0.62) = rings go transparent earlier in the descent
   * while still following the same Y path.
   */
  fadeOutCompleteAtTravel?: number;
};

/**
 * Horizontal ring meshes that travel downward and fade — same motion/material recipe as `MagicTowerParticles`.
 * Intended as child of a scaled group (local space).
 */
export function MagicDescendingRingsFX({
  anchorLocalY = 0.92,
  ringStartOffsetY = RING_START_OFFSET_Y,
  ringEndOffsetY = RING_END_OFFSET_Y,
  phaseOffsetSec = 0,
  scaleDenominator = 1,
  lightIntensityMul = 0.9,
  ringStartLocalY,
  ringEndLocalY,
  fadeOutCompleteAtTravel = 1,
}: MagicDescendingRingsFXProps) {
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);
  const ringGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const glowLightRef = useRef<THREE.PointLight>(null);
  const inv = 1 / Math.max(0.001, scaleDenominator);
  const ringR = RING_RADIUS * inv;
  const ringThick = RING_THICKNESS * inv;
  const ringGlowThick = RING_GLOW_THICKNESS * inv;
  const stackGap = RING_STACK_GAP * inv;
  const radiusGap = RING_RADIUS_GAP * inv;

  const ringStartY = ringStartLocalY ?? (anchorLocalY + ringStartOffsetY * inv);
  const ringEndY = ringEndLocalY ?? (anchorLocalY + ringEndOffsetY * inv);
  const ringMidY = anchorLocalY + ((ringStartOffsetY + ringEndOffsetY) * 0.5) * inv;
  const lightYOffset = RING_LIGHT_HEIGHT_OFFSET * inv;
  const lightBaseY =
    ringStartLocalY != null || ringEndLocalY != null
      ? THREE.MathUtils.lerp(ringStartY, ringEndY, 0.5)
      : ringMidY;

  const ringBrightColor = useMemo(() => new THREE.Color().setRGB(3.55, 1.82, 6.35), []);
  const ringCoreColor = useMemo(() => new THREE.Color().setRGB(2.42, 0.98, 4.8), []);
  const ringDeepColor = useMemo(() => new THREE.Color().setRGB(1.02, 0.24, 3.2), []);
  const ringWarmColor = useMemo(() => new THREE.Color().setRGB(2.15, 0.56, 1.95), []);
  const ringEmberColor = useMemo(() => new THREE.Color().setRGB(1.55, 0.34, 1.24), []);

  const fadeSpan = Math.max(0.08, fadeOutCompleteAtTravel);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime + phaseOffsetSec;
    const glowLight = glowLightRef.current;
    if (glowLight) {
      const pulse = 0.9 + 0.1 * Math.sin(elapsed * 0.75 + phaseOffsetSec);
      const progress0 = (elapsed / RING_CYCLE_DURATION) % 1;
      const travel0 = THREE.MathUtils.smootherstep(progress0, 0, 1);
      const fadeU0 = Math.min(1, travel0 / fadeSpan);
      const lightFade = Math.pow(1 - fadeU0, 1.12);
      glowLight.position.set(0, lightBaseY + lightYOffset, 0);
      glowLight.intensity = RING_LIGHT_INTENSITY * pulse * lightIntensityMul * lightFade;
    }

    for (let i = 0; i < RING_COUNT; i++) {
      const ring = ringRefs.current[i];
      const glowRing = ringGlowRefs.current[i];
      if (!ring || !glowRing) continue;
      const progress = (elapsed / RING_CYCLE_DURATION + i / RING_COUNT) % 1;
      const stackOffset = -i * stackGap;
      const travel = THREE.MathUtils.smootherstep(progress, 0, 1);
      const fadeU = Math.min(1, travel / fadeSpan);
      const pulse = Math.sin(travel * Math.PI);
      const radiusScale = Math.max(
        0.45,
        1 + pulse * RING_PULSE_SCALE - travel * RING_DOWNWARD_SHRINK + i * radiusGap,
      );
      const glowScale = radiusScale * 1.08;
      const opacity = Math.max(0, 0.98 * Math.pow(1 - fadeU, 1.35));
      const glowOpacity = Math.max(0, 0.52 * Math.pow(1 - fadeU, 1.12));
      const ringY = THREE.MathUtils.lerp(ringStartY, ringEndY, travel) + stackOffset;
      const material = ring.material as THREE.MeshBasicMaterial;
      const glowMaterial = glowRing.material as THREE.MeshBasicMaterial;
      ring.position.set(0, ringY, 0);
      ring.scale.setScalar(radiusScale);
      glowRing.position.set(0, ringY, 0);
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
    }
  });

  const innerR = Math.max(0.01, ringR - ringThick);
  const glowInner = Math.max(0.01, ringR - ringGlowThick);
  const glowOuter = ringR + ringGlowThick * 0.22;

  return (
    <group>
      <pointLight
        ref={glowLightRef}
        position={[0, lightBaseY + lightYOffset, 0]}
        color="#bf6bff"
        intensity={RING_LIGHT_INTENSITY * lightIntensityMul}
        distance={RING_LIGHT_DISTANCE}
        decay={2}
      />
      {Array.from({ length: RING_COUNT }).map((_, index) => (
        <mesh
          key={`magic-ring-${index}`}
          ref={(node) => {
            ringRefs.current[index] = node;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          frustumCulled={false}
          renderOrder={20}
        >
          <ringGeometry args={[innerR, ringR, 96]} />
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
          key={`magic-ring-glow-${index}`}
          ref={(node) => {
            ringGlowRefs.current[index] = node;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          frustumCulled={false}
          renderOrder={19}
        >
          <ringGeometry args={[glowInner, glowOuter, 96]} />
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
    </group>
  );
}
