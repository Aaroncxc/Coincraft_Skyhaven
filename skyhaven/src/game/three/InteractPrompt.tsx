import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PROMPT_Y = 1.8;
const BOB_AMP = 0.06;
const BOB_FREQ = 2.5;
const CIRCLE_SIZE = 64;

function createPromptTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CIRCLE_SIZE;
  canvas.height = CIRCLE_SIZE;
  const ctx = canvas.getContext("2d")!;

  const r = CIRCLE_SIZE / 2;
  ctx.clearRect(0, 0, CIRCLE_SIZE, CIRCLE_SIZE);

  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15, 20, 30, 0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(136, 204, 255, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#88ccff";
  ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("E", r, r + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

type InteractPromptProps = {
  tileGx: number;
  tileGy: number;
  surfaceY?: number;
};

export function InteractPrompt({ tileGx, tileGy, surfaceY = 0.82 }: InteractPromptProps) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => createPromptTexture(), []);
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
      }),
    [texture],
  );

  useFrame((state) => {
    const sprite = spriteRef.current;
    if (!sprite) return;
    const t = state.clock.elapsedTime;
    sprite.position.set(tileGx, surfaceY + (PROMPT_Y - 0.82) + Math.sin(t * BOB_FREQ) * BOB_AMP, tileGy);
  });

  return (
    <sprite
      ref={spriteRef}
      material={material}
      position={[tileGx, surfaceY + (PROMPT_Y - 0.82), tileGy]}
      scale={[0.28, 0.28, 1]}
    />
  );
}
