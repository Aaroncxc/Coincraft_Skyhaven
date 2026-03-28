import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { clamp01, euclideanDistWorldToFootprintRectXZ, isoMultiSourceHumScalar, tpsEuclideanTileRadiusGain } from "../tileRadiusSfx";
import { TILE_UNIT_SIZE } from "./assets3d";

const MAGE_TOWER_HOVER_URL = "/ingame_assets/sfx/MageTower_Hover.mp3";

const FOOTPRINT_W = 2;
const FOOTPRINT_H = 2;

/** After master×SFX, near the tower in TPS. */
const TPS_NEAR_TRIM = 0.26;
/** After master×SFX, combined iso hum (all towers, one loop). */
const ISO_HUM_TRIM = 0.048;

export type MagicTowerHoverAnchor = { id: string; gx: number; gy: number };

type Props = {
  towers: MagicTowerHoverAnchor[];
  playerGx: number;
  playerGy: number;
  tpsActive: boolean;
  masterVolume: number;
  sfxVolume: number;
};

function disposeAudio(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.pause();
  el.onended = null;
  el.src = "";
  el.load();
}

function mix01(master: number, sfx: number): number {
  const m = Math.max(0, Math.min(100, master)) / 100;
  const s = Math.max(0, Math.min(100, sfx)) / 100;
  return clamp01(m * s);
}

/**
 * Looping hover / hum at each magic tower (VFX-enabled tiles only — same set as particles).
 * TPS: per-tower `HTMLAudioElement`, volume from euclidean XZ distance to the 2×2 footprint with
 * smoothstep fades 2↔3 tiles and 3↔4 tiles (world units).
 * Iso: single shared loop, very quiet, strength scales gently with tower count.
 */
export function MagicTowerHoverSfx({
  towers,
  playerGx,
  playerGy,
  tpsActive,
  masterVolume,
  sfxVolume,
}: Props) {
  const tpsByIdRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isoRef = useRef<HTMLAudioElement | null>(null);
  const propsRef = useRef({
    towers,
    playerGx,
    playerGy,
    tpsActive,
    masterVolume,
    sfxVolume,
  });
  propsRef.current = { towers, playerGx, playerGy, tpsActive, masterVolume, sfxVolume };

  useEffect(() => {
    const map = tpsByIdRef.current;
    const keep = new Set(towers.map((t) => t.id));
    for (const [id, el] of map) {
      if (!keep.has(id)) {
        disposeAudio(el);
        map.delete(id);
      }
    }
    for (const t of towers) {
      if (map.has(t.id)) continue;
      const a = new Audio(MAGE_TOWER_HOVER_URL);
      a.loop = true;
      a.preload = "auto";
      map.set(t.id, a);
    }
  }, [towers]);

  useEffect(() => {
    return () => {
      for (const el of tpsByIdRef.current.values()) disposeAudio(el);
      tpsByIdRef.current.clear();
      disposeAudio(isoRef.current);
      isoRef.current = null;
    };
  }, []);

  useFrame(() => {
    const { towers: tw, playerGx: pgxRaw, playerGy: pgyRaw, tpsActive: tps, masterVolume: m, sfxVolume: s } =
      propsRef.current;
    const mix = mix01(m, s);
    if (tw.length === 0 || mix < 1e-4) {
      for (const el of tpsByIdRef.current.values()) {
        el.volume = 0;
        el.pause();
      }
      const iso = isoRef.current;
      if (iso) {
        iso.volume = 0;
        iso.pause();
      }
      return;
    }

    const playerWorldX = pgxRaw * TILE_UNIT_SIZE;
    const playerWorldZ = pgyRaw * TILE_UNIT_SIZE;
    const map = tpsByIdRef.current;

    if (tps) {
      const iso = isoRef.current;
      if (iso) {
        iso.volume = 0;
        iso.pause();
      }
      for (const t of tw) {
        const el = map.get(t.id);
        if (!el) continue;
        const dWorld = euclideanDistWorldToFootprintRectXZ(
          playerWorldX,
          playerWorldZ,
          t.gx,
          t.gy,
          FOOTPRINT_W,
          FOOTPRINT_H,
          TILE_UNIT_SIZE,
        );
        const g = tpsEuclideanTileRadiusGain(dWorld, TILE_UNIT_SIZE) * TPS_NEAR_TRIM * mix;
        el.volume = clamp01(g);
        if (g > 0.004) {
          if (el.paused) void el.play().catch(() => {});
        } else {
          el.pause();
        }
      }
    } else {
      for (const el of map.values()) {
        el.volume = 0;
        el.pause();
      }
      let iso = isoRef.current;
      if (!iso) {
        iso = new Audio(MAGE_TOWER_HOVER_URL);
        iso.loop = true;
        iso.preload = "auto";
        isoRef.current = iso;
      }
      const scalar = isoMultiSourceHumScalar(tw.length);
      const g = ISO_HUM_TRIM * scalar * mix;
      iso.volume = clamp01(g);
      if (g > 0.004) {
        if (iso.paused) void iso.play().catch(() => {});
      } else {
        iso.pause();
      }
    }
  });

  return null;
}
