import { useEffect, useRef } from "react";
import type { IslandId } from "./types";

const MUSIC_BASE = "/ingame_assets/music";

/** Playlist for Options skip (user can switch with prev/next). */
export const MUSIC_PLAYLIST: readonly string[] = [
  `${MUSIC_BASE}/Sinister Slink.mp3`,
  `${MUSIC_BASE}/Cool Jazz.mp3`,
  `${MUSIC_BASE}/IngameMusic_GoldenHour.mp3`,
] as const;

export const MUSIC_PLAYLIST_LENGTH = MUSIC_PLAYLIST.length;

export function useIslandMusic(
  _selectedIslandId: IslandId,
  musicEnabled: boolean,
  musicTrackIndex: number,
  masterVolume: number,
  musicVolume: number,
): void {
  const musicRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const master = Math.max(0, Math.min(100, masterVolume)) / 100;
    const music = Math.max(0, Math.min(100, musicVolume)) / 100;
    const gain = master * music;

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
        audio.volume = gain;
        audio.play().catch(() => {});
      } else {
        musicRef.current.volume = gain;
        if (musicRef.current.paused) musicRef.current.play().catch(() => {});
      }
    } else {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current.src = "";
        musicRef.current = null;
      }
    }
  }, [musicEnabled, musicTrackIndex, masterVolume, musicVolume]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current.src = "";
        musicRef.current = null;
      }
    };
  }, []);
}
