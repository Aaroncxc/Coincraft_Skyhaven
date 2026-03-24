import { Html } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import * as THREE from "three";

type Props = {
  visible: boolean;
  position: THREE.Vector3 | [number, number, number];
  /** When omitted, uses the default mining/magic NPC line. */
  text?: string;
};

const SPEECH_TEXT =
  "Hey du, ich hab gehört es soll hier eine ultra Mine geben. In der gibts safe DIAMONDS zu holen. Ich bin gespannt wer von uns beiden sie zuerst findet!";

export function SpeechBubble({ visible, position, text }: Props) {
  const displayText = text ?? SPEECH_TEXT;
  const [opacity, setOpacity] = useState(0);
  const fadeRef = useRef<number | null>(null);

  useEffect(() => {
    if (fadeRef.current != null) {
      cancelAnimationFrame(fadeRef.current);
      fadeRef.current = null;
    }

    if (visible) {
      setOpacity(1);
    } else if (opacity > 0) {
      let start: number | null = null;
      const startOp = opacity;
      const animate = (ts: number) => {
        if (start === null) start = ts;
        const t = Math.min(1, (ts - start) / 400);
        setOpacity(startOp * (1 - t));
        if (t < 1) fadeRef.current = requestAnimationFrame(animate);
      };
      fadeRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (fadeRef.current != null) cancelAnimationFrame(fadeRef.current);
    };
  }, [visible]);

  if (opacity <= 0 && !visible) return null;

  return (
    <Html
      position={position}
      center
      style={{
        pointerEvents: "none",
        opacity,
        transition: visible ? "opacity 0.3s ease-in" : undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          width: 360,
          maxWidth: 360,
          padding: "10px 18px",
          borderRadius: 14,
          background: "rgba(15, 20, 35, 0.65)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(136, 204, 255, 0.3)",
          color: "#c8dde8",
          fontFamily: '"Jersey10", sans-serif',
          fontSize: 14,
          lineHeight: 1.4,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
          whiteSpace: "pre-wrap",
          userSelect: "none",
        }}
      >
        {displayText}
        <div
          style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid rgba(15, 20, 35, 0.65)",
          }}
        />
      </div>
    </Html>
  );
}
