import { SKYHAVEN_SPRITE_MANIFEST } from "../game/assets";
import { EQUIPPABLE_ITEMS, type EquipmentState, type EquippableItemId } from "../game/equipment";
import type { PlayableCharacterId } from "../game/playableCharacters";

type HudProps = {
  playerHp: number;
  playerMaxHp: number;
  expLevel: number;
  expCurrent: number;
  expMax: number;
  expIsMaxLevel: boolean;
  expGainPulse: boolean;
  equipmentState: EquipmentState;
  playableVariant: PlayableCharacterId;
  tpsModeActive: boolean;
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

type QuickSlotCardProps = {
  title: string;
  itemId?: EquippableItemId | null;
  disabled?: boolean;
};

function QuickSlotCard({
  title,
  itemId = null,
  disabled = false,
}: QuickSlotCardProps) {
  const itemDef = itemId ? EQUIPPABLE_ITEMS[itemId] : null;

  return (
    <div className={`hud-quick-slot ${itemDef ? "is-filled" : "is-empty"} ${disabled ? "is-disabled" : ""}`}>
      <div className="hud-quick-slot-glass" aria-hidden="true" />
      <div className="hud-quick-slot-content">
        <span className="hud-quick-slot-title">{title}</span>
        {itemDef?.thumbnailSrc ? (
          <div className="hud-quick-slot-thumb-wrap">
            <img className="hud-quick-slot-thumb" src={itemDef.thumbnailSrc} alt="" draggable={false} />
          </div>
        ) : (
          <div className="hud-quick-slot-placeholder" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

export function Hud({
  playerHp,
  playerMaxHp,
  expLevel,
  expCurrent,
  expMax,
  expIsMaxLevel,
  expGainPulse,
  equipmentState,
  playableVariant,
  tpsModeActive,
}: HudProps) {
  const { bars } = SKYHAVEN_SPRITE_MANIFEST.ui;
  const expText = expIsMaxLevel ? `LVL ${expLevel} MAX` : `LVL ${expLevel} EXP ${expCurrent}/${expMax}`;
  const expClasses = ["is-exp", expGainPulse ? "is-gaining" : ""].filter(Boolean).join(" ");
  const offhandDisabled = playableVariant !== "fight_man";
  const weaponItemId = equipmentState.equipped.mainHand;
  const offhandItemId = equipmentState.equipped.offHand;

  return (
    <>
      <header className="hud-panel">
        <StatBar
          text={`HP ${playerHp}/${playerMaxHp}`}
          value={playerHp}
          max={playerMaxHp}
          trackSrc={bars.staminaTrack}
          fillSrc={bars.staminaFill}
          rowClassName="is-health"
          fillClipClassName="is-health"
        />
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
      <nav
        className={`hud-quickbar ${tpsModeActive ? "is-visible" : "is-hidden"}`}
        aria-label="Quick slots"
        aria-hidden={!tpsModeActive}
      >
        <QuickSlotCard title="Waffe" itemId={weaponItemId} />
        <QuickSlotCard title="Offhand" itemId={offhandItemId} disabled={offhandDisabled} />
        <QuickSlotCard title="Healing" />
        <QuickSlotCard title="Schutz" />
      </nav>
    </>
  );
}
