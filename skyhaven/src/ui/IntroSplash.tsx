import { useEffect, useRef, useState } from "react";
import { getIntroMusicElement } from "./introMusicController";
import { isSkyhavenWidgetRuntime } from "../runtime/isWidgetRuntime";

const BG_SRC = "/ingame_assets/IntroScreen/IntroAnimation_Back.png";
const FRONT_RIGHT_SRC = "/ingame_assets/IntroScreen/IntroAnimation_Front_Right.png";
const FRONT_SRC = "/ingame_assets/IntroScreen/IntroAnimation_Front.png";
const INTRO_TEXT_SRC = "/ingame_assets/IntroScreen/IntroText.png";
const MULTIKUNST_SRC = "/ingame_assets/IntroScreen/multikunst_kleiner_rand 1.png";

type IntroSplashProps = {
  fadingOut: boolean;
  onStart: () => void;
};

export function IntroSplash({ fadingOut, onStart }: IntroSplashProps) {
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!isSkyhavenWidgetRuntime()) return;

    const ac = new AbortController();
    const audio = getIntroMusicElement();
    audio.volume = 0.45;
    audioRef.current = audio;

    const tryPlay = () => {
      audio.play().catch(() => {
        const resume = () => {
          audio.play().catch(() => {});
        };
        document.addEventListener("pointerdown", resume, { once: true, signal: ac.signal });
        document.addEventListener("keydown", resume, { once: true, signal: ac.signal });
      });
    };
    tryPlay();

    return () => {
      ac.abort();
      // Do not stopIntroMusicCompletely here: StrictMode remount would interrupt; stop when entering game (main.tsx).
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (!fadingOut || !audioRef.current) return;
    const audio = audioRef.current;
    const fadeStep = 0.02;
    const interval = window.setInterval(() => {
      const next = audio.volume - fadeStep;
      if (next <= 0) {
        audio.volume = 0;
        audio.pause();
        window.clearInterval(interval);
      } else {
        audio.volume = next;
      }
    }, 40);
    return () => window.clearInterval(interval);
  }, [fadingOut]);

  return (
    <div className={`intro-splash ${fadingOut ? "is-fade-out" : ""}`}>
      <div className="intro-splash-card">
        {/* Background layer */}
        <img
          className="intro-splash-bg"
          src={BG_SRC}
          alt=""
          draggable={false}
        />

        {/* Floating house layer */}
        <img
          className="intro-splash-layer intro-splash-front-right"
          src={FRONT_RIGHT_SRC}
          alt=""
          draggable={false}
        />

        {/* Floating character layer */}
        <img
          className="intro-splash-layer intro-splash-front"
          src={FRONT_SRC}
          alt=""
          draggable={false}
        />

        {/* Vignette overlay */}
        <div className="intro-splash-vignette" />

        {/* Title logo top */}
        <img
          className="intro-splash-title"
          src={INTRO_TEXT_SRC}
          alt="CoinCraft Skyhaven"
          draggable={false}
        />

        {/* Start button center */}
        <button
          type="button"
          className="intro-splash-start-btn"
          onClick={onStart}
          aria-label="Start game"
          data-no-window-drag="true"
        >
          Start
        </button>

        {/* Multikunst logo bottom */}
        <img
          className="intro-splash-multikunst"
          src={MULTIKUNST_SRC}
          alt="Multikunst"
          draggable={false}
        />

        {/* Mute toggle */}
        <button
          type="button"
          className="intro-splash-mute-btn"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute music" : "Mute music"}
          data-no-window-drag="true"
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
