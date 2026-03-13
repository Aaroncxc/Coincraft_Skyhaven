import { useEffect, useRef } from "react";
import type { IslandId } from "./types";

const MUSIC_BASE = "/ingame_assets/music";

/** Playlist for Options skip: 3 tracks (user can switch with prev/next). */
export const MUSIC_PLAYLIST: readonly string[] = [
  `${MUSIC_BASE}/Sinister Slink.mp3`,
  `${MUSIC_BASE}/Cool Jazz.mp3`,
  `${MUSIC_BASE}/Sinister Slink.mp3`,
] as const;

export const MUSIC_PLAYLIST_LENGTH = MUSIC_PLAYLIST.length;

const WIND_SFX = `${MUSIC_BASE}/Wind Resonant.wav`;
const WIND_VOLUME = 0.35;
const WIND_MIN_INTERVAL_MS = 12000;
const WIND_MAX_INTERVAL_MS = 35000;

function nextWindDelayMs(): number {
  return WIND_MIN_INTERVAL_MS + Math.random() * (WIND_MAX_INTERVAL_MS - WIND_MIN_INTERVAL_MS);
}

export function useIslandMusic(
  selectedIslandId: IslandId,
  musicEnabled: boolean,
  musicTrackIndex: number,
  masterVolume: number,
  sfxVolume: number
): void {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const windRef = useRef<HTMLAudioElement | null>(null);
  const windTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIslandRef = useRef<IslandId | null>(null);

  useEffect(() => {
    const master = Math.max(0, Math.min(100, masterVolume)) / 100;
    const sfx = Math.max(0, Math.min(100, sfxVolume)) / 100;

    const index = ((musicTrackIndex % MUSIC_PLAYLIST_LENGTH) + MUSIC_PLAYLIST_LENGTH) % MUSIC_PLAYLIST_LENGTH;
    const track = musicEnabled ? MUSIC_PLAYLIST[index] : null;

    if (track) {
      if (!musicRef.current || musicRef.current.src !== window.location.origin + track) {
        if (musicRef.current) {
          musicRef.current.pause();
          musicRef.current.src = "";
        }
        const audio = new Audio(track);
        audio.loop = true;
        musicRef.current = audio;
        audio.volume = master;
        audio.play().catch(() => {});
      } else {
        musicRef.current.volume = master;
        if (musicRef.current.paused) musicRef.current.play().catch(() => {});
      }
    } else {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current.src = "";
        musicRef.current = null;
      }
    }

    if (selectedIslandId !== prevIslandRef.current) {
      prevIslandRef.current = selectedIslandId;
      if (windTimeoutRef.current) {
        clearTimeout(windTimeoutRef.current);
        windTimeoutRef.current = null;
      }
    }

    if (selectedIslandId === "mining" && musicEnabled) {
      const scheduleNext = (): void => {
        windTimeoutRef.current = setTimeout(() => {
          windTimeoutRef.current = null;
          if (!windRef.current) {
            windRef.current = new Audio(WIND_SFX);
          }
          const w = windRef.current;
          w.volume = WIND_VOLUME * sfx;
          w.currentTime = 0;
          w.onended = () => scheduleNext();
          w.play().catch(() => scheduleNext());
        }, nextWindDelayMs());
      };
      if (!windTimeoutRef.current) scheduleNext();
    } else {
      if (windTimeoutRef.current) {
        clearTimeout(windTimeoutRef.current);
        windTimeoutRef.current = null;
      }
      if (windRef.current) {
        windRef.current.pause();
        windRef.current.currentTime = 0;
      }
    }

    return () => {
      if (windTimeoutRef.current) {
        clearTimeout(windTimeoutRef.current);
        windTimeoutRef.current = null;
      }
    };
  }, [selectedIslandId, musicEnabled, musicTrackIndex, masterVolume, sfxVolume]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current.src = "";
        musicRef.current = null;
      }
      if (windRef.current) {
        windRef.current.pause();
        windRef.current = null;
      }
      if (windTimeoutRef.current) {
        clearTimeout(windTimeoutRef.current);
        windTimeoutRef.current = null;
      }
    };
  }, []);
}
