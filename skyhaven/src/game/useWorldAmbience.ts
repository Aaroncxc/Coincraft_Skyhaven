import { useEffect, useRef } from "react";

const SFX_BASE = "/ingame_assets/sfx";

const WIND_URL = `${SFX_BASE}/Wind Resonant.wav`;

const AMBIENCE_TRACKS: readonly string[] = [
  `${SFX_BASE}/Alien Lifeforms Ambience.wav`,
  `${SFX_BASE}/Game Background Ambience Calm Dark  Creatures Quacks.wav`,
  `${SFX_BASE}/Game Background Ambience Distant Creatues Eerie Dark Movements Moans.wav`,
  `${SFX_BASE}/Sci-Fi World Creature Screams Background.wav`,
];

/** Per-mode trim (multiplied by master × SFX). Wind kept subtle; iso especially low. */
const WIND_ISO_GAIN = 0.028;
const WIND_TPS_GAIN = 0.09;
const AMB_ISO_GAIN = 0.09;
const AMB_TPS_GAIN = 0.32;

const CROSSFADE_SEC = 4;
/** Overlap when looping the same wind file so the seam is inaudible. */
const WIND_LOOP_CROSSFADE_SEC = 3.2;
const AMB_START_FADEIN_SEC = 0.5;
const MODE_BLEND_MS = 520;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function pickRandomAmbience(): string {
  const i = Math.floor(Math.random() * AMBIENCE_TRACKS.length);
  return AMBIENCE_TRACKS[i] ?? AMBIENCE_TRACKS[0];
}

function disposeAudio(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.pause();
  el.onended = null;
  el.ontimeupdate = null;
  el.oncanplaythrough = null;
  el.src = "";
  el.load();
}

/**
 * Post-intro world ambience: wind (seamless dual-player loop) + random ambience with crossfades.
 * Volume follows SFX and Master sliders; iso vs TPS uses separate gains with a short smooth transition.
 */
export function useWorldAmbience(tpsModeActive: boolean, masterVolume: number, sfxVolume: number): void {
  const windSlotsRef = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null]);
  const windPlayingIdxRef = useRef(0);
  const windHandoverScheduledRef = useRef(false);
  const windCrossfadeRafRef = useRef<number | null>(null);

  const ambRef = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null]);
  const playingIdxRef = useRef(0);
  const handoverScheduledRef = useRef(false);
  const crossfadeRafRef = useRef<number | null>(null);
  const mainLoopRafRef = useRef<number | null>(null);
  const introFadeActiveRef = useRef(false);

  const tpsRef = useRef(tpsModeActive);
  const masterRef = useRef(masterVolume);
  const sfxRef = useRef(sfxVolume);
  const modeBlendRef = useRef(tpsModeActive ? 1 : 0);
  const prevTpsRef = useRef(tpsModeActive);
  const modeTweenRef = useRef<{ from: number; to: number; start: number } | null>(null);

  tpsRef.current = tpsModeActive;
  masterRef.current = masterVolume;
  sfxRef.current = sfxVolume;

  useEffect(() => {
    const w0 = new Audio(WIND_URL);
    const w1 = new Audio(WIND_URL);
    w0.loop = false;
    w1.loop = false;
    windSlotsRef.current = [w0, w1];

    const a = new Audio();
    const b = new Audio();
    ambRef.current = [a, b];

    const getMix = (): number => {
      const m = Math.max(0, Math.min(100, masterRef.current)) / 100;
      const s = Math.max(0, Math.min(100, sfxRef.current)) / 100;
      return m * s;
    };

    const windVolume = (): number => {
      const mix = getMix();
      const g = WIND_ISO_GAIN + modeBlendRef.current * (WIND_TPS_GAIN - WIND_ISO_GAIN);
      return clamp01(mix * g);
    };

    const ambVolume = (): number => {
      const mix = getMix();
      const g = AMB_ISO_GAIN + modeBlendRef.current * (AMB_TPS_GAIN - AMB_ISO_GAIN);
      return clamp01(mix * g);
    };

    const applyWindSlotVol = (idx: number, vol01: number): void => {
      const slot = windSlotsRef.current[idx];
      if (slot) {
        slot.volume = clamp01(vol01);
      }
    };

    const applyAmbSlotVol = (idx: number, vol01: number): void => {
      const slot = ambRef.current[idx];
      if (slot) {
        slot.volume = clamp01(vol01);
      }
    };

    const mainLoop = (): void => {
      const now = performance.now();

      if (tpsRef.current !== prevTpsRef.current) {
        prevTpsRef.current = tpsRef.current;
        modeTweenRef.current = {
          from: modeBlendRef.current,
          to: tpsRef.current ? 1 : 0,
          start: now,
        };
      }

      const tw = modeTweenRef.current;
      if (tw) {
        const u = Math.min(1, (now - tw.start) / MODE_BLEND_MS);
        modeBlendRef.current = tw.from + (tw.to - tw.from) * u;
        if (u >= 1) {
          modeBlendRef.current = tw.to;
          modeTweenRef.current = null;
        }
      }

      if (windCrossfadeRafRef.current == null) {
        const wi = windPlayingIdxRef.current;
        const w = windSlotsRef.current[wi];
        if (w && !w.paused) {
          applyWindSlotVol(wi, windVolume());
        }
      }

      if (crossfadeRafRef.current == null && !introFadeActiveRef.current) {
        const pi = playingIdxRef.current;
        const slot = ambRef.current[pi];
        if (slot && !slot.paused) {
          applyAmbSlotVol(pi, ambVolume());
        }
      }

      mainLoopRafRef.current = requestAnimationFrame(mainLoop);
    };

    mainLoopRafRef.current = requestAnimationFrame(mainLoop);

    const attachWindTimeupdate = (idx: number): void => {
      const slot = windSlotsRef.current[idx];
      if (!slot) return;

      const onTime = (): void => {
        if (windHandoverScheduledRef.current || windCrossfadeRafRef.current != null) return;
        const d = slot.duration;
        if (!Number.isFinite(d) || d <= 0) return;
        if (slot.currentTime < 0.12) return;
        const remain = d - slot.currentTime;
        const lead = Math.min(WIND_LOOP_CROSSFADE_SEC, Math.max(0.45, d * 0.08));
        if (remain <= lead && remain > 0) {
          windHandoverScheduledRef.current = true;
          slot.ontimeupdate = null;
          slot.onended = null;
          const fadeSec = Math.min(WIND_LOOP_CROSSFADE_SEC, Math.max(0.3, remain));
          beginWindCrossfade(idx, fadeSec);
        }
      };

      const onEnd = (): void => {
        if (windHandoverScheduledRef.current || windCrossfadeRafRef.current != null) return;
        windHandoverScheduledRef.current = true;
        slot.ontimeupdate = null;
        slot.onended = null;
        beginWindCrossfade(idx, Math.min(WIND_LOOP_CROSSFADE_SEC, 0.75));
      };

      slot.ontimeupdate = onTime;
      slot.onended = onEnd;
    };

    const beginWindCrossfade = (outIdx: number, fadeSec: number): void => {
      if (windCrossfadeRafRef.current != null) {
        cancelAnimationFrame(windCrossfadeRafRef.current);
        windCrossfadeRafRef.current = null;
      }

      const inIdx = 1 - outIdx;
      const outEl = windSlotsRef.current[outIdx];
      const inEl = windSlotsRef.current[inIdx];
      if (!outEl || !inEl) {
        windHandoverScheduledRef.current = false;
        return;
      }

      outEl.ontimeupdate = null;
      outEl.onended = null;

      inEl.src = WIND_URL;
      inEl.loop = false;

      const startFade = (): void => {
        inEl.oncanplaythrough = null;
        inEl.currentTime = 0;
        void inEl.play().catch(() => {
          windHandoverScheduledRef.current = false;
          attachWindTimeupdate(outIdx);
        });

        const fadeMs = Math.max(180, fadeSec * 1000);
        const start = performance.now();
        const tick = (): void => {
          const t = Math.min(1, (performance.now() - start) / fadeMs);
          const targetVol = windVolume();
          applyWindSlotVol(outIdx, targetVol * (1 - t));
          applyWindSlotVol(inIdx, targetVol * t);

          if (t < 1) {
            windCrossfadeRafRef.current = requestAnimationFrame(tick);
          } else {
            windCrossfadeRafRef.current = null;
            outEl.pause();
            outEl.currentTime = 0;
            applyWindSlotVol(inIdx, targetVol);
            windPlayingIdxRef.current = inIdx;
            windHandoverScheduledRef.current = false;
            attachWindTimeupdate(inIdx);
          }
        };
        windCrossfadeRafRef.current = requestAnimationFrame(tick);
      };

      inEl.oncanplaythrough = startFade;
      inEl.load();
    };

    const startWind = (): void => {
      const slot = windSlotsRef.current[0];
      if (!slot) return;
      slot.src = WIND_URL;
      const onReady = (): void => {
        slot.oncanplaythrough = null;
        windPlayingIdxRef.current = 0;
        windHandoverScheduledRef.current = false;
        applyWindSlotVol(0, windVolume());
        void slot.play().catch(() => {});
        attachWindTimeupdate(0);
      };
      slot.oncanplaythrough = onReady;
      slot.load();
    };

    const startFirstAmbience = (): void => {
      const url = pickRandomAmbience();
      const slot = ambRef.current[0];
      if (!slot) return;
      slot.loop = false;
      slot.src = url;
      const onReady = (): void => {
        slot.oncanplaythrough = null;
        slot.volume = 0;
        playingIdxRef.current = 0;
        handoverScheduledRef.current = false;
        introFadeActiveRef.current = true;
        void slot.play().catch(() => {
          introFadeActiveRef.current = false;
        });
        const start = performance.now();
        const tickIn = (): void => {
          const t = Math.min(1, (performance.now() - start) / (AMB_START_FADEIN_SEC * 1000));
          const vNow = ambVolume();
          applyAmbSlotVol(0, vNow * t);
          if (t < 1) {
            requestAnimationFrame(tickIn);
          } else {
            applyAmbSlotVol(0, vNow);
            introFadeActiveRef.current = false;
            attachTimeupdate(0);
          }
        };
        requestAnimationFrame(tickIn);
      };
      slot.oncanplaythrough = onReady;
      slot.load();
    };

    const attachTimeupdate = (idx: number): void => {
      const slot = ambRef.current[idx];
      if (!slot) return;

      const onTime = (): void => {
        if (handoverScheduledRef.current || crossfadeRafRef.current != null) return;
        const d = slot.duration;
        if (!Number.isFinite(d) || d <= 0) return;
        if (slot.currentTime < 0.15) return;
        const remain = d - slot.currentTime;
        const crossfadeLead = Math.min(CROSSFADE_SEC, Math.max(0.55, d * 0.12));
        if (remain <= crossfadeLead && remain > 0) {
          handoverScheduledRef.current = true;
          slot.ontimeupdate = null;
          slot.onended = null;
          const fadeSec = Math.min(CROSSFADE_SEC, Math.max(0.35, d - slot.currentTime));
          beginAmbCrossfade(idx, fadeSec);
        }
      };

      const onEnd = (): void => {
        if (handoverScheduledRef.current || crossfadeRafRef.current != null) return;
        handoverScheduledRef.current = true;
        slot.ontimeupdate = null;
        slot.onended = null;
        beginAmbCrossfade(idx, Math.min(CROSSFADE_SEC, 0.85));
      };

      slot.ontimeupdate = onTime;
      slot.onended = onEnd;
    };

    const beginAmbCrossfade = (outIdx: number, fadeSec: number): void => {
      if (crossfadeRafRef.current != null) {
        cancelAnimationFrame(crossfadeRafRef.current);
        crossfadeRafRef.current = null;
      }

      const inIdx = 1 - outIdx;
      const outEl = ambRef.current[outIdx];
      const inEl = ambRef.current[inIdx];
      if (!outEl || !inEl) {
        handoverScheduledRef.current = false;
        return;
      }

      outEl.ontimeupdate = null;
      outEl.onended = null;

      const nextUrl = pickRandomAmbience();
      inEl.loop = false;
      inEl.src = nextUrl;

      const startFade = (): void => {
        inEl.oncanplaythrough = null;
        void inEl.play().catch(() => {
          handoverScheduledRef.current = false;
          attachTimeupdate(outIdx);
        });

        const fadeMs = Math.max(200, fadeSec * 1000);
        const start = performance.now();
        const tick = (): void => {
          const t = Math.min(1, (performance.now() - start) / fadeMs);
          const targetVol = ambVolume();
          const outV = targetVol * (1 - t);
          const inV = targetVol * t;
          applyAmbSlotVol(outIdx, outV);
          applyAmbSlotVol(inIdx, inV);

          if (t < 1) {
            crossfadeRafRef.current = requestAnimationFrame(tick);
          } else {
            crossfadeRafRef.current = null;
            outEl.pause();
            outEl.src = "";
            outEl.load();
            applyAmbSlotVol(inIdx, targetVol);
            playingIdxRef.current = inIdx;
            handoverScheduledRef.current = false;
            attachTimeupdate(inIdx);
          }
        };
        crossfadeRafRef.current = requestAnimationFrame(tick);
      };

      inEl.oncanplaythrough = startFade;
      inEl.load();
    };

    startWind();
    startFirstAmbience();

    return () => {
      if (mainLoopRafRef.current != null) {
        cancelAnimationFrame(mainLoopRafRef.current);
        mainLoopRafRef.current = null;
      }
      if (crossfadeRafRef.current != null) {
        cancelAnimationFrame(crossfadeRafRef.current);
        crossfadeRafRef.current = null;
      }
      if (windCrossfadeRafRef.current != null) {
        cancelAnimationFrame(windCrossfadeRafRef.current);
        windCrossfadeRafRef.current = null;
      }
      const [wx, wy] = windSlotsRef.current;
      disposeAudio(wx);
      disposeAudio(wy);
      windSlotsRef.current = [null, null];
      const [x, y] = ambRef.current;
      disposeAudio(x);
      disposeAudio(y);
      ambRef.current = [null, null];
      handoverScheduledRef.current = false;
      windHandoverScheduledRef.current = false;
      introFadeActiveRef.current = false;
    };
  }, []);
}
