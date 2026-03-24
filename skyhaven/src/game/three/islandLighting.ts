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
  /**
   * Day only: 0 = cooler baseline, 1 = stronger golden / amber key + fill + sky tint.
   * Ignored when `lightingAmbiance === "night"`.
   */
  dayLightWarmth: number;
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
  dayLightWarmth: 0.32,
};

/** Frame image behind the canvas when `sceneLightingAmbiance === "night"` (`public/ingame_assets/expanded/ui/sky-night.png`). */
export const DEBUG_NIGHT_SKY_BG_URL = "/ingame_assets/expanded/ui/sky-night.png";

/**
 * Moon-lit preset for debug night preview: weak directional key, low IBL, stronger blue fill.
 * Wells / forge / rune point lights are scaled up in `IslandScene` when `lightingAmbiance === "night"`.
 */
export const NIGHT_ISLAND_LIGHTING: IslandLightingParams = {
  sunAzimuthDeg: 108,
  sunElevationDeg: 36,
  sunDistance: 30,
  sunIntensity: 0.36,
  ambientIntensity: 0.075,
  hemisphereIntensity: 0.22,
  fillIntensity: 0.28,
  environmentIntensity: 0.045,
  dayLightWarmth: 0,
};

export type IslandLightingAmbiance = "day" | "night";

/**
 * Azimuth: degrees in XZ plane, 0° = +Z, 90° = +X (viewed from above).
 * Elevation: degrees above horizon (0 = horizontal, 90 = zenith).
 */
const _dayCool = {
  sun: "#fff1dc",
  fill: "#b4c6ff",
  hemiSky: "#9eb8e8",
  hemiGround: "#1a1510",
  ambient: "#ffffff",
} as const;

const _dayWarm = {
  sun: "#ffe8b8",
  fill: "#e6cf98",
  hemiSky: "#d4c4a8",
  hemiGround: "#241c14",
  ambient: "#fff6e8",
} as const;

export type DayLightColorSample = {
  sun: string;
  fill: string;
  hemiSky: string;
  hemiGround: string;
  ambient: string;
};

/** Blend day directional / hemisphere / ambient colors toward a warmer look. */
export function sampleDayLightColors(warmth: number): DayLightColorSample {
  const t = THREE.MathUtils.clamp(warmth, 0, 1);
  const sun = new THREE.Color(_dayCool.sun).lerp(new THREE.Color(_dayWarm.sun), t);
  const fill = new THREE.Color(_dayCool.fill).lerp(new THREE.Color(_dayWarm.fill), t);
  const hemiSky = new THREE.Color(_dayCool.hemiSky).lerp(new THREE.Color(_dayWarm.hemiSky), t);
  const hemiGround = new THREE.Color(_dayCool.hemiGround).lerp(new THREE.Color(_dayWarm.hemiGround), t);
  const ambient = new THREE.Color(_dayCool.ambient).lerp(new THREE.Color(_dayWarm.ambient), t);
  return {
    sun: "#" + sun.getHexString(),
    fill: "#" + fill.getHexString(),
    hemiSky: "#" + hemiSky.getHexString(),
    hemiGround: "#" + hemiGround.getHexString(),
    ambient: "#" + ambient.getHexString(),
  };
}

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
    dayLightWarmth: THREE.MathUtils.lerp(0.12, DEFAULT_ISLAND_LIGHTING.dayLightWarmth, day),
  };
}
