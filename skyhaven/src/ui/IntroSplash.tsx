import { useEffect, useRef, useState } from "react";
import { getIntroMusicElement } from "./introMusicController";
import { isSkyhavenWidgetRuntime } from "../runtime/isWidgetRuntime";

const BG_SRC = "/ingame_assets/IntroScreen/IntroAnimation_Back.png";
const FRONT_RIGHT_SRC = "/ingame_assets/IntroScreen/IntroAnimation_Front_Right.png";
const FRONT_SRC = "/ingame_assets/IntroScreen/IntroAnimation_Front.png";
const INTRO_2_SRC = "/ingame_assets/IntroScreen/Intro_2.png";
const INTRO_2_FRONT_SRC = "/ingame_assets/IntroScreen/Intro_2_Front.png";
const INTRO_TEXT_SRC = "/ingame_assets/IntroScreen/IntroText.png";
const MULTIKUNST_SRC = "/ingame_assets/IntroScreen/multikunst_kleiner_rand 1.png";

const INTRO_BG_ROTATION_KEY = "skyhaven-intro-bg-rotation";

type IntroBgVariant = "layered" | "intro2";

/** Avoid double localStorage bump when React StrictMode runs the initializer twice in dev. */
let strictModeIntroVariantPicked = false;
let strictModeIntroVariant: IntroBgVariant = "layered";

function pickIntroBgVariant(): IntroBgVariant {
  if (typeof window === "undefined") return "layered";
  if (strictModeIntroVariantPicked) return strictModeIntroVariant;
  strictModeIntroVariantPicked = true;
  const c = Number(window.localStorage.getItem(INTRO_BG_ROTATION_KEY) ?? 0);
  strictModeIntroVariant = Number.isFinite(c) && c % 2 === 1 ? "intro2" : "layered";
  window.localStorage.setItem(INTRO_BG_ROTATION_KEY, String(c + 1));
  return strictModeIntroVariant;
}

type IntroSplashProps = {
  fadingOut: boolean;
  onStart: () => void;
};

export function IntroSplash({ fadingOut, onStart }: IntroSplashProps) {
  const [bgVariant] = useState<IntroBgVariant>(pickIntroBgVariant);
  const [muted, setMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const bgSrc = bgVariant === "intro2" ? INTRO_2_SRC : BG_SRC;
  const showLayeredForeground = bgVariant === "layered";
  const isIntro2 = bgVariant === "intro2";

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
      <div className={`intro-splash-card${isIntro2 ? " intro-splash-card--intro2" : ""}`}>
        {/* Background layer */}
        <img
          className="intro-splash-bg"
          src={bgSrc}
          alt=""
          draggable={false}
        />

        {showLayeredForeground ? (
          <>
            <img
              className="intro-splash-layer intro-splash-front-right"
              src={FRONT_RIGHT_SRC}
              alt=""
              draggable={false}
            />
            <img
              className="intro-splash-layer intro-splash-front"
              src={FRONT_SRC}
              alt=""
              draggable={false}
            />
          </>
        ) : null}

        {/* Vignette overlay */}
        <div className="intro-splash-vignette" />

        {/* intro2: IntroText under Intro_2_Front (z-index via .intro-splash-card--intro2) */}
        <img
          className="intro-splash-title"
          src={INTRO_TEXT_SRC}
          alt="CoinCraft Skyhaven"
          draggable={false}
        />

        {isIntro2 ? (
          <img
            className="intro-splash-intro2-front"
            src={INTRO_2_FRONT_SRC}
            alt=""
            draggable={false}
          />
        ) : null}

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
