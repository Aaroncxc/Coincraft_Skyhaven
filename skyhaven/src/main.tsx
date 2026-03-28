import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { isSkyhavenWidgetRuntime } from "./runtime/isWidgetRuntime";
import { IntroSplash } from "./ui/IntroSplash";
import { stopIntroMusicCompletely } from "./ui/introMusicController";
import "./styles.css";

const INTRO_FADE_OUT_MS = 900;

function AppBoot() {
  const [showIntro, setShowIntro] = useState(true);
  const [isIntroFadingOut, setIsIntroFadingOut] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (!isSkyhavenWidgetRuntime()) return;

    const appWindow = getCurrentWindow();
    let pointerDown = false;
    let startX = 0;
    let startY = 0;
    let dragInFlight = false;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-window-drag='true']")) return;

      const rect = shell.getBoundingClientRect();
      const insideShell =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!insideShell) return;

      pointerDown = true;
      dragInFlight = false;
      startX = event.clientX;
      startY = event.clientY;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!pointerDown || dragInFlight) return;
      const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (moved < 3) return;

      dragInFlight = true;
      pointerDown = false;
      void appWindow
        .startDragging()
        .catch(() => {
          console.warn("Skyhaven: window dragging failed (check Tauri permissions).");
        })
        .finally(() => {
          dragInFlight = false;
        });
    };

    const onPointerUp = (): void => {
      pointerDown = false;
      dragInFlight = false;
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, []);

  const handleStart = () => {
    setIsIntroFadingOut(true);
    window.setTimeout(() => {
      stopIntroMusicCompletely();
      setShowIntro(false);
    }, INTRO_FADE_OUT_MS);
  };

  return (
    <div
      ref={shellRef}
      className="skyhaven-app-shell"
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      {showIntro ? (
        <IntroSplash fadingOut={isIntroFadingOut} onStart={handleStart} />
      ) : (
        <App />
      )}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <AppBoot />
  </StrictMode>
);
