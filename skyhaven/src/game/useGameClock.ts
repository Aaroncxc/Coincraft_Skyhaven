import { useEffect, useRef, useState } from "react";

/**
 * Provides a `nowMs` timestamp that updates once per second,
 * used for session countdown timing. Extracted from useSkyhavenLoop
 * so the 3D renderer can use it independently.
 */
export function useGameClock(): { nowMs: number } {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const secondRef = useRef<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    let frameId = 0;

    const tick = (): void => {
      const second = Math.floor(Date.now() / 1000);
      if (second !== secondRef.current) {
        secondRef.current = second;
        setNowMs(Date.now());
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  return { nowMs };
}
