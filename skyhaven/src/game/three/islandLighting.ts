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

/** Full day→night→day cycle length (seconds). */
export const DEFAULT_DAY_NIGHT_CYCLE_PERIOD_SEC = 300;

/** Hemisphere / key / fill colors when `lightingAmbiance === "night"` in IslandScene (before cycle). */
export const NIGHT_SCENE_COLORS = {
  sun: "#c8d8f8",
  fill: "#8ea0c0",
  hemiSky: "#4a4680",
  hemiGround: "#120e1c",
  ambient: "#ffffff",
} as const;

export function lerpHexColor(a: string, b: string, t: number): string {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  const c0 = new THREE.Color(a);
  const c1 = new THREE.Color(b);
  return "#" + c0.lerp(c1, u).getHexString();
}

export function lerpIslandLightingParams(
  a: IslandLightingParams,
  b: IslandLightingParams,
  t: number,
): IslandLightingParams {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return {
    sunAzimuthDeg: THREE.MathUtils.lerp(a.sunAzimuthDeg, b.sunAzimuthDeg, u),
    sunElevationDeg: THREE.MathUtils.lerp(a.sunElevationDeg, b.sunElevationDeg, u),
    sunDistance: THREE.MathUtils.lerp(a.sunDistance, b.sunDistance, u),
    sunIntensity: THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, u),
    ambientIntensity: THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, u),
    hemisphereIntensity: THREE.MathUtils.lerp(a.hemisphereIntensity, b.hemisphereIntensity, u),
    fillIntensity: THREE.MathUtils.lerp(a.fillIntensity, b.fillIntensity, u),
    environmentIntensity: THREE.MathUtils.lerp(a.environmentIntensity, b.environmentIntensity, u),
    dayLightWarmth: THREE.MathUtils.lerp(a.dayLightWarmth, b.dayLightWarmth, u),
  };
}

/** Phase ∈ [0,1) from wall clock; seamless at wrap. */
export function dayNightPhaseFromTime(nowMs: number, periodMs: number): number {
  if (periodMs <= 0) return 0;
  const p = nowMs % periodMs;
  return p / periodMs;
}

/**
 * 0 = day peak, 1 = night peak; matches at phase 0 and 1 (cosine → seamless loop).
 */
export function nightBlendFromPhase(phase: number): number {
  return 0.5 + 0.5 * Math.cos(phase * Math.PI * 2);
}

export function blendDayNightColors(day: DayLightColorSample, nightBlend: number): DayLightColorSample {
  const t = THREE.MathUtils.clamp(nightBlend, 0, 1);
  const n = NIGHT_SCENE_COLORS;
  return {
    sun: lerpHexColor(day.sun, n.sun, t),
    fill: lerpHexColor(day.fill, n.fill, t),
    hemiSky: lerpHexColor(day.hemiSky, n.hemiSky, t),
    hemiGround: lerpHexColor(day.hemiGround, n.hemiGround, t),
    ambient: lerpHexColor(day.ambient, n.ambient, t),
  };
}

export type DayNightVisualSnapshot = {
  nightBlend: number;
  lighting: IslandLightingParams;
  colors: DayLightColorSample;
  poiLightMul: number;
  wellGlowDistanceMul: number;
  runeGlowDistanceMul: number;
  forgeIntensity: number;
  forgeDistance: number;
  bloomIntensity: number;
  bloomLuminanceThreshold: number;
};

/** Scalar scene tweaks that were previously binary night on/off in IslandScene. */
export function samplePostProcessForNightBlend(nightBlend: number): Pick<
  DayNightVisualSnapshot,
  | "poiLightMul"
  | "wellGlowDistanceMul"
  | "runeGlowDistanceMul"
  | "forgeIntensity"
  | "forgeDistance"
  | "bloomIntensity"
  | "bloomLuminanceThreshold"
> {
  const t = THREE.MathUtils.clamp(nightBlend, 0, 1);
  return {
    poiLightMul: THREE.MathUtils.lerp(1, 1.58, t),
    wellGlowDistanceMul: THREE.MathUtils.lerp(1, 1.12, t),
    runeGlowDistanceMul: THREE.MathUtils.lerp(1, 1.1, t),
    forgeIntensity: THREE.MathUtils.lerp(0.9, 1.28, t),
    forgeDistance: THREE.MathUtils.lerp(7, 8.5, t),
    bloomIntensity: THREE.MathUtils.lerp(0.55, 0.68, t),
    bloomLuminanceThreshold: THREE.MathUtils.lerp(0.72, 0.42, t),
  };
}

/**
 * Full snapshot for a blend factor: numeric lighting lerps DEFAULT↔NIGHT, colors use day warmth → night palette.
 * Manual day/night: pass nightBlend 0 or 1; auto cycle: pass `nightBlendFromPhase(dayNightPhaseFromTime(now, period))`.
 */
export function getDayNightVisualSnapshot(
  nightBlend: number,
  dayLightWarmth: number,
  dayLightingBaseline: IslandLightingParams = DEFAULT_ISLAND_LIGHTING,
  nightLightingBaseline: IslandLightingParams = NIGHT_ISLAND_LIGHTING,
): DayNightVisualSnapshot {
  const t = THREE.MathUtils.clamp(nightBlend, 0, 1);
  const dayColors = sampleDayLightColors(dayLightWarmth);
  const colors = blendDayNightColors(dayColors, t);
  const lighting = lerpIslandLightingParams(dayLightingBaseline, nightLightingBaseline, t);
  const pp = samplePostProcessForNightBlend(t);
  return {
    nightBlend: t,
    lighting,
    colors,
    ...pp,
  };
}

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

/** @deprecated Prefer `getDayNightVisualSnapshot` + `nightBlendFromPhase`; kept for callers that only need params. */
export function sampleIslandLightingForDayPhase(phase: number): IslandLightingParams {
  const nb = nightBlendFromPhase(phase);
  return getDayNightVisualSnapshot(nb, DEFAULT_ISLAND_LIGHTING.dayLightWarmth).lighting;
}
