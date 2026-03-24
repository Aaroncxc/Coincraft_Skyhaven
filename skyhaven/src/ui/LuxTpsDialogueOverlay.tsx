import { useEffect, useRef, useState } from "react";

const PORTRAIT_SRC = "/ingame_assets/3d/Fight_Man_Real/Talking_Image/Talking_Real.png";

type Props = {
  open: boolean;
  text: string;
};

export function LuxTpsDialogueOverlay({ open, text }: Props) {
  const [opacity, setOpacity] = useState(0);
  const fadeRef = useRef<number | null>(null);

  useEffect(() => {
    if (fadeRef.current != null) {
      cancelAnimationFrame(fadeRef.current);
      fadeRef.current = null;
    }

    if (open) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- match SpeechBubble: fade-out reads opacity when open flips
  }, [open]);

  if (opacity <= 0 && !open) return null;

  return (
    <div className="lux-tps-dialog-root" style={{ opacity, pointerEvents: "none" }} aria-hidden={!open}>
      <div className="lux-tps-dialog-backdrop" />
      <img className="lux-tps-dialog-portrait" src={PORTRAIT_SRC} alt="" draggable={false} />
      <div className="lux-tps-dialog-layout">
        <div className="lux-tps-dialog-panel-wrap">
          <div className="lux-tps-dialog-panel-glass" aria-hidden />
          <div className="lux-tps-dialog-panel-inner">
            <div className="lux-tps-dialog-name">LUX</div>
            <p className="lux-tps-dialog-body">{text}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
