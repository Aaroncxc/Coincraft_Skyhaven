import { SKYHAVEN_SPRITE_MANIFEST } from "../game/assets";

type HudProps = {
  expLevel: number;
  expCurrent: number;
  expMax: number;
  expIsMaxLevel: boolean;
  expGainPulse: boolean;
};

type StatBarProps = {
  text: string;
  value: number;
  max: number;
  trackSrc: string;
  fillSrc: string;
  rowClassName?: string;
  fillClipClassName?: string;
  percentOverride?: number;
};

function StatBar({
  text,
  value,
  max,
  trackSrc,
  fillSrc,
  rowClassName,
  fillClipClassName,
  percentOverride,
}: StatBarProps) {
  const safeMax = max > 0 ? max : 1;
  const percent = percentOverride ?? Math.max(0, Math.min(100, (value / safeMax) * 100));
  const rowClasses = ["hud-bar-row", rowClassName].filter(Boolean).join(" ");
  const fillClipClasses = ["hud-bar-fill-clip", fillClipClassName].filter(Boolean).join(" ");

  return (
    <div className={rowClasses}>
      <img className="hud-bar-track" src={trackSrc} alt="" />
      <div className={fillClipClasses} style={{ width: `${percent}%` }}>
        <img className="hud-bar-fill" src={fillSrc} alt="" />
      </div>
      <span className="hud-bar-text">{text}</span>
    </div>
  );
}

export function Hud({
  expLevel,
  expCurrent,
  expMax,
  expIsMaxLevel,
  expGainPulse,
}: HudProps) {
  const { bars } = SKYHAVEN_SPRITE_MANIFEST.ui;
  const expText = expIsMaxLevel ? `LVL ${expLevel} MAX` : `LVL ${expLevel} EXP ${expCurrent}/${expMax}`;
  const expClasses = ["is-exp", expGainPulse ? "is-gaining" : ""].filter(Boolean).join(" ");

  return (
    <header className="hud-panel">
      <StatBar
        text={expText}
        value={expCurrent}
        max={expMax}
        trackSrc={bars.expTrack}
        fillSrc={bars.expFill}
        rowClassName={expClasses}
        fillClipClassName={expClasses}
        percentOverride={expIsMaxLevel ? 100 : undefined}
      />
    </header>
  );
}
