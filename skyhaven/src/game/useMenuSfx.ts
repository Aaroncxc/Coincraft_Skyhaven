import { useCallback, useMemo, useRef } from "react";

import tap01Url from "../../../assets/Ingame_Assets/SFX/Soft Interface 01 Tap.mp3";
import tap02Url from "../../../assets/Ingame_Assets/SFX/Soft Interface 02 Tap.mp3";
import popUpUrl from "../../../assets/Ingame_Assets/SFX/Soft Interface 03 Pop Up.mp3";
import popCloseUrl from "../../../assets/Ingame_Assets/SFX/Soft Interface 04 Pop Up Close.mp3";
import slidePagesUrl from "../../../assets/Ingame_Assets/SFX/Soft Interface 05 Slide Pages.mp3";
import transitionUrl from "../../../assets/Ingame_Assets/SFX/Tech Transition Appear.wav";

type SoundKey = "tap01" | "tap02" | "popUp" | "popClose" | "slide" | "transition";

export type MenuSfxApi = {
  playTapPrimary: () => void;
  playTapSecondary: () => void;
  playPopUp: () => void;
  playPopClose: () => void;
  playSlide: () => void;
  playTransition: () => void;
};

export function useMenuSfx(masterVolume: number, menuSfxVolume: number): MenuSfxApi {
  const playersRef = useRef<Record<SoundKey, HTMLAudioElement | null>>({
    tap01: null,
    tap02: null,
    popUp: null,
    popClose: null,
    slide: null,
    transition: null,
  });

  const level = useMemo(() => {
    const master = Math.max(0, Math.min(100, masterVolume)) / 100;
    const menu = Math.max(0, Math.min(100, menuSfxVolume)) / 100;
    return master * menu;
  }, [masterVolume, menuSfxVolume]);

  const getUrl = useCallback((key: SoundKey): string => {
    switch (key) {
      case "tap01":
        return tap01Url;
      case "tap02":
        return tap02Url;
      case "popUp":
        return popUpUrl;
      case "popClose":
        return popCloseUrl;
      case "slide":
        return slidePagesUrl;
      case "transition":
        return transitionUrl;
      default:
        return tap01Url;
    }
  }, []);

  const play = useCallback(
    (key: SoundKey) => {
      if (level <= 0.001) return;
      let audio = playersRef.current[key];
      const url = getUrl(key);
      if (!audio) {
        audio = new Audio(url);
        playersRef.current[key] = audio;
      } else if (!audio.src || !audio.src.endsWith(url)) {
        audio.pause();
        audio = new Audio(url);
        playersRef.current[key] = audio;
      }
      audio.volume = level;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    },
    [getUrl, level],
  );

  return useMemo(
    () => ({
      playTapPrimary: () => play("tap01"),
      playTapSecondary: () => play("tap02"),
      playPopUp: () => play("popUp"),
      playPopClose: () => play("popClose"),
      playSlide: () => play("slide"),
      playTransition: () => play("transition"),
    }),
    [play],
  );
}

