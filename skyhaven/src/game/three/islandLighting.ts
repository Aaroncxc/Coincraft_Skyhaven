import * as THREE from "three";

/** Sun & fill lighting tuned in debug; matches previous fixed directional position (~cx+16, 9, cz+5). */
export type IslandLightingParams = {
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  sunDistance: number;
  sunIntensity: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
  fillIntensity: number;
  environmentIntensity: number;
};

export const DEFAULT_ISLAND_LIGHTING: IslandLightingParams = {
  sunAzimuthDeg: 72.65,
  sunElevationDeg: 28.26,
  sunDistance: 19.03,
  sunIntensity: 2.75,
  ambientIntensity: 0.06,
  hemisphereIntensity: 0.12,
  fillIntensity: 0.18,
  environmentIntensity: 0.2,
};

/**
 * Azimuth: degrees in XZ plane, 0° = +Z, 90° = +X (viewed from above).
 * Elevation: degrees above horizon (0 = horizontal, 90 = zenith).
 */
export function sunPositionFromAngles(
  pivotX: number,
  pivotY: number,
  pivotZ: number,
  azimuthDeg: number,
  elevationDeg: number,
  distance: number,
): [number, number, number] {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  const cosEl = Math.cos(el);
  const x = pivotX + distance * cosEl * Math.sin(az);
  const z = pivotZ + distance * cosEl * Math.cos(az);
  const y = pivotY + distance * Math.sin(el);
  return [x, y, z];
}

/**
 * Placeholder for a future day/night cycle: map phase ∈ [0,1] (e.g. midnight→midnight) to lighting.
 * Smooth curves avoid pops at wrap.
 */
export function sampleIslandLightingForDayPhase(phase: number): IslandLightingParams {
  const sunArc = Math.sin(phase * Math.PI * 2);
  const day = (sunArc + 1) * 0.5;
  const elevation = THREE.MathUtils.lerp(8, 58, day);
  const azimuth = (phase * 360 + 90) % 360;
  return {
    ...DEFAULT_ISLAND_LIGHTING,
    sunAzimuthDeg: azimuth,
    sunElevationDeg: elevation,
    sunIntensity: THREE.MathUtils.lerp(0.35, 2.75, day),
    ambientIntensity: THREE.MathUtils.lerp(0.14, 0.04, day),
    hemisphereIntensity: THREE.MathUtils.lerp(0.22, 0.1, day),
    fillIntensity: THREE.MathUtils.lerp(0.28, 0.12, day),
    environmentIntensity: THREE.MathUtils.lerp(0.08, 0.22, day),
  };
}
