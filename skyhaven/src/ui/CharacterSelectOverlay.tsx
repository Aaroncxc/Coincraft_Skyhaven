import { useCallback, useEffect, useMemo, useState } from "react";
import type { IslandMap } from "../game/types";
import {
  PLAYABLE_CHARACTER_ORDER,
  type PlayableCharacterId,
  isPlayableCharacterUnlocked,
} from "../game/playableCharacters";

type CharacterSelectOverlayProps = {
  open: boolean;
  onClose: () => void;
  homeIsland: IslandMap;
  selectedId: PlayableCharacterId;
  onSelect: (id: PlayableCharacterId) => void;
};

const LABELS: Record<PlayableCharacterId, string> = {
  default: "Traveler",
  fight_man: "Barracks Fighter",
  mining_man: "Miner",
  magic_man: "Mage",
};

const HINTS: Record<PlayableCharacterId, string> = {
  default: "Always available.",
  fight_man: "Place a Barracks on Home Island to unlock.",
  mining_man: "Place a Mine on Home Island to unlock.",
  magic_man: "Place a Magic Tower on Home Island to unlock.",
};

export function CharacterSelectOverlay({
  open,
  onClose,
  homeIsland,
  selectedId,
  onSelect,
}: CharacterSelectOverlayProps) {
  const [pending, setPending] = useState<PlayableCharacterId>(selectedId);

  useEffect(() => {
    if (open) setPending(selectedId);
  }, [open, selectedId]);

  const unlockedMap = useMemo(() => {
    const m = new Map<PlayableCharacterId, boolean>();
    for (const id of PLAYABLE_CHARACTER_ORDER) {
      m.set(id, isPlayableCharacterUnlocked(id, homeIsland));
    }
    return m;
  }, [homeIsland]);

  const handleApply = useCallback(() => {
    if (!unlockedMap.get(pending)) return;
    onSelect(pending);
    onClose();
  }, [onSelect, onClose, pending, unlockedMap]);

  if (!open) return null;

  return (
    <div
      className="character-select-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose character"
      data-no-window-drag="true"
    >
      <button type="button" className="character-select-backdrop" onClick={onClose} aria-label="Close" />
      <div className="character-select-panel">
        <h2 className="character-select-title">Choose character</h2>
        <p className="character-select-sub">Unlocks are tied to buildings on Home Island.</p>
        <ul className="character-select-list">
          {PLAYABLE_CHARACTER_ORDER.map((id) => {
            const unlocked = unlockedMap.get(id) ?? false;
            const isPending = pending === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  className={`character-select-row ${isPending ? "is-selected" : ""} ${!unlocked ? "is-locked" : ""}`}
                  disabled={!unlocked}
                  onClick={() => unlocked && setPending(id)}
                >
                  <span className="character-select-name">{LABELS[id]}</span>
                  {!unlocked && <span className="character-select-lock">Locked</span>}
                  {unlocked && isPending && <span className="character-select-check">Selected</span>}
                </button>
                {!unlocked && <p className="character-select-hint">{HINTS[id]}</p>}
              </li>
            );
          })}
        </ul>
        <div className="character-select-actions">
          <button type="button" className="character-select-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="character-select-btn primary"
            disabled={!unlockedMap.get(pending)}
            onClick={handleApply}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
