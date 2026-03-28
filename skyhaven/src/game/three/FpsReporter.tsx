import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";

const SMOOTH_FRAMES = 40;

type Props = {
  outRef: MutableRefObject<{ fps: number }>;
};

/** Writes smoothed FPS (rolling mean delta) into `outRef` for a DOM overlay. */
export function FpsReporter({ outRef }: Props) {
  const deltasRef = useRef<number[]>([]);

  useFrame((_, delta) => {
    const buf = deltasRef.current;
    buf.push(delta);
    if (buf.length > SMOOTH_FRAMES) buf.shift();
    const sum = buf.reduce((a, b) => a + b, 0);
    const avg = sum / buf.length;
    outRef.current.fps = avg > 1e-6 ? Math.round(1 / avg) : 0;
  });

  return null;
}
