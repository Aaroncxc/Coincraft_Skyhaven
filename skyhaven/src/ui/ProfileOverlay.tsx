import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas } from "@react-three/fiber";
import type { ActionType, ProgressionState, ResourceId } from "../game/types";
import type { ActionStats } from "../game/actionStats";
import type { PlayerProfile } from "../game/profile";
import type { Inventory } from "../game/inventory";
import {
  EQUIPPABLE_ITEMS,
  getStowedBackItemFromEquipment,
  type EquipmentState,
  type EquipmentSlotRef,
  type EquippableItemId,
} from "../game/equipment";
import type { PlayableCharacterId } from "../game/playableCharacters";
import { PlayableCharacterPreviewScene } from "./PlayableCharacterPreviewScene";

type ProfileTab = "loadout" | "stats";

type LoadoutInventorySlot =
  | { kind: "resource"; resourceId: ResourceId }
  | { kind: "axe_slot" }
  | { kind: "empty"; label: string };

type ProfileOverlayProps = {
  open: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  progression: ProgressionState;
  actionStats: ActionStats;
  inventory: Inventory;
  equipmentState: EquipmentState;
  playableVariant: PlayableCharacterId;
  onMoveItem: (from: EquipmentSlotRef, to: EquipmentSlotRef) => void;
};

const ACTION_LABELS: Record<ActionType, string> = {
  mining: "Mining",
  farming: "Farming",
  magic: "Magic",
  fight: "Fight",
  woodcutting: "Woodcutting",
  harvesting: "Harvesting",
};

const ACTION_ORDER: ActionType[] = [
  "mining",
  "farming",
  "magic",
  "fight",
  "woodcutting",
  "harvesting",
];

const LOADOUT_INVENTORY_SLOTS: LoadoutInventorySlot[] = [
  { kind: "resource", resourceId: "ore" },
  { kind: "resource", resourceId: "wheat" },
  { kind: "resource", resourceId: "wood" },
  { kind: "axe_slot" },
  { kind: "empty", label: "Empty" },
  { kind: "empty", label: "Empty" },
];

const RESOURCE_LABELS: Record<ResourceId, string> = {
  ore: "Ore",
  wheat: "Wheat",
  wood: "Wood",
};

type PointerDragState = {
  source: EquipmentSlotRef;
  itemId: EquippableItemId;
  pointerId: number;
  x: number;
  y: number;
};

function formatHm(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function ProfileCharacterScene({
  equippedRightHand,
  stowedBackItem,
  playableVariant,
  onOrbitStart,
  onOrbitEnd,
}: {
  equippedRightHand: EquippableItemId | null;
  stowedBackItem: EquippableItemId | null;
  playableVariant: PlayableCharacterId;
  onOrbitStart: () => void;
  onOrbitEnd: () => void;
}) {
  return (
    <PlayableCharacterPreviewScene
      playableVariant={playableVariant}
      equippedRightHand={equippedRightHand}
      stowedBackItem={stowedBackItem}
      onOrbitStart={onOrbitStart}
      onOrbitEnd={onOrbitEnd}
    />
  );
}

export function ProfileOverlay({
  open,
  onClose,
  profile,
  progression,
  actionStats,
  inventory,
  equipmentState,
  playableVariant,
  onMoveItem,
}: ProfileOverlayProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("loadout");
  const [isViewerDragging, setIsViewerDragging] = useState(false);
  const [dragSource, setDragSource] = useState<EquipmentSlotRef | null>(null);
  const [dropTarget, setDropTarget] = useState<EquipmentSlotRef | null>(null);
  const [pointerDrag, setPointerDrag] = useState<PointerDragState | null>(null);
  const actionSlotRef = useRef<HTMLDivElement | null>(null);
  const inventoryAxeSlotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveTab("loadout");
    setIsViewerDragging(false);
    setDragSource(null);
    setDropTarget(null);
    setPointerDrag(null);
  }, [open]);

  const totalMs = ACTION_ORDER.reduce((sum, key) => sum + actionStats[key], 0);
  const initials = profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const actionItemId = equipmentState.actionBar.primary;
  const inventoryAxeItemId = equipmentState.inventoryItems.slot4;
  const actionItemLabel = actionItemId ? EQUIPPABLE_ITEMS[actionItemId].label : null;
  const actionItemThumb = actionItemId ? EQUIPPABLE_ITEMS[actionItemId].thumbnailSrc : undefined;
  const inventoryAxeThumb =
    inventoryAxeItemId != null ? EQUIPPABLE_ITEMS[inventoryAxeItemId].thumbnailSrc : undefined;
  const pointerDragLabel = pointerDrag ? EQUIPPABLE_ITEMS[pointerDrag.itemId].label : null;
  const pointerDragThumb = pointerDrag
    ? EQUIPPABLE_ITEMS[pointerDrag.itemId].thumbnailSrc
    : undefined;
  const canMoveInventoryToAction = inventoryAxeItemId !== null && actionItemId === null;
  const canMoveActionToInventory = actionItemId !== null && inventoryAxeItemId === null;

  const handleOrbitStart = useCallback(() => setIsViewerDragging(true), []);
  const handleOrbitEnd = useCallback(() => setIsViewerDragging(false), []);

  const clearDragState = useCallback(() => {
    setPointerDrag(null);
    setDragSource(null);
    setDropTarget(null);
  }, []);

  const resolveDropTargetFromPoint = useCallback(
    (x: number, y: number, source: EquipmentSlotRef): EquipmentSlotRef | null => {
      if (source === "inventory_slot_4" && canMoveInventoryToAction) {
        const actionRect = actionSlotRef.current?.getBoundingClientRect();
        if (
          actionRect &&
          x >= actionRect.left &&
          x <= actionRect.right &&
          y >= actionRect.top &&
          y <= actionRect.bottom
        ) {
          return "action_primary";
        }
      }

      if (source === "action_primary" && canMoveActionToInventory) {
        const inventoryRect = inventoryAxeSlotRef.current?.getBoundingClientRect();
        if (
          inventoryRect &&
          x >= inventoryRect.left &&
          x <= inventoryRect.right &&
          y >= inventoryRect.top &&
          y <= inventoryRect.bottom
        ) {
          return "inventory_slot_4";
        }
      }

      return null;
    },
    [canMoveActionToInventory, canMoveInventoryToAction],
  );

  useEffect(() => {
    if (!pointerDrag) return;

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerDrag.pointerId) return;
      setPointerDrag((previous) =>
        previous && previous.pointerId === event.pointerId
          ? { ...previous, x: event.clientX, y: event.clientY }
          : previous,
      );
      setDropTarget(resolveDropTargetFromPoint(event.clientX, event.clientY, pointerDrag.source));
    };

    const handlePointerUp = (event: PointerEvent): void => {
      if (event.pointerId !== pointerDrag.pointerId) return;
      const target = resolveDropTargetFromPoint(event.clientX, event.clientY, pointerDrag.source);
      if (target !== null) {
        onMoveItem(pointerDrag.source, target);
      }
      clearDragState();
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerUp, true);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerUp, true);
    };
  }, [clearDragState, onMoveItem, pointerDrag, resolveDropTargetFromPoint]);

  const handleActionPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !actionItemId) return;
      event.preventDefault();
      event.stopPropagation();
      setDragSource("action_primary");
      setPointerDrag({
        source: "action_primary",
        itemId: actionItemId,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
      setDropTarget(resolveDropTargetFromPoint(event.clientX, event.clientY, "action_primary"));
    },
    [actionItemId, resolveDropTargetFromPoint],
  );

  const handleInventoryAxePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !inventoryAxeItemId) return;
      event.preventDefault();
      event.stopPropagation();
      setDragSource("inventory_slot_4");
      setPointerDrag({
        source: "inventory_slot_4",
        itemId: inventoryAxeItemId,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      });
      setDropTarget(resolveDropTargetFromPoint(event.clientX, event.clientY, "inventory_slot_4"));
    },
    [inventoryAxeItemId, resolveDropTargetFromPoint],
  );

  return (
    <section
      className={`profile-overlay ${open ? "is-open" : ""}`}
      aria-hidden={!open}
      data-no-window-drag="true"
    >
      <div className="profile-panel-glass">
        <button
          type="button"
          className="profile-close-btn"
          onClick={onClose}
          aria-label="Close profile"
        >
          x
        </button>

        <div className="profile-tabs" role="tablist" aria-label="Profile tabs">
          <button
            type="button"
            role="tab"
            className={`profile-tab ${activeTab === "loadout" ? "is-active" : ""}`}
            aria-selected={activeTab === "loadout"}
            onClick={() => setActiveTab("loadout")}
          >
            Loadout
          </button>
          <button
            type="button"
            role="tab"
            className={`profile-tab ${activeTab === "stats" ? "is-active" : ""}`}
            aria-selected={activeTab === "stats"}
            onClick={() => setActiveTab("stats")}
          >
            Stats
          </button>
        </div>

        {activeTab === "loadout" ? (
          <div className="profile-loadout-layout">
            <div className="profile-loadout-left">
              <div
                className={`profile-character-stage ${isViewerDragging ? "is-dragging" : ""}`}
                data-no-window-drag="true"
              >
                {open ? (
                  <Canvas
                    className="profile-character-canvas"
                    gl={{ antialias: true, alpha: true }}
                    dpr={[1, 1.6]}
                  >
                    <ProfileCharacterScene
                      equippedRightHand={equipmentState.equippedRightHand}
                      stowedBackItem={getStowedBackItemFromEquipment(equipmentState)}
                      playableVariant={playableVariant}
                      onOrbitStart={handleOrbitStart}
                      onOrbitEnd={handleOrbitEnd}
                    />
                  </Canvas>
                ) : null}
              </div>

              <div className="profile-action-slotbar">
                <span className="profile-slotbar-title">Action Slot</span>
                <div
                  className={`profile-action-slot ${
                    actionItemId ? "is-equipped" : "is-empty"
                  } ${dropTarget === "action_primary" ? "is-drop-target" : ""} ${
                    dragSource === "action_primary" ? "is-dragging-source" : ""
                  } ${actionItemId ? "is-draggable" : ""} ${
                    actionItemThumb ? "has-glass-tile" : ""
                  }`}
                  ref={actionSlotRef}
                  data-no-window-drag="true"
                  onPointerDown={handleActionPointerDown}
                >
                  {actionItemLabel && actionItemThumb ? (
                    <div className="profile-equip-glass-tile profile-equip-glass-tile--action">
                      <img
                        src={actionItemThumb}
                        alt=""
                        className="profile-equip-glass-thumb"
                        draggable={false}
                      />
                      <div className="profile-equip-glass-text">
                        <span className="profile-action-slot-item">{actionItemLabel}</span>
                        <span className="profile-action-slot-state">
                          Drag back to Slot 4 to unequip
                        </span>
                      </div>
                    </div>
                  ) : actionItemLabel ? (
                    <>
                      <span className="profile-action-slot-item">{actionItemLabel}</span>
                      <span className="profile-action-slot-state">Drag back to Slot 4 to unequip</span>
                    </>
                  ) : (
                    <>
                      <span className="profile-action-slot-item">Empty Action Slot</span>
                      <span className="profile-action-slot-state">Drag axe from Inventory Slot 4</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-loadout-right">
              <span className="profile-inventory-title">Inventory</span>
              <div className="profile-inventory-grid">
                {LOADOUT_INVENTORY_SLOTS.map((slot, index) => {
                  if (slot.kind === "resource") {
                    return (
                      <div
                        key={`inventory-resource-slot-${slot.resourceId}`}
                        className="profile-inventory-slot"
                      >
                        <span className="profile-inventory-resource">{RESOURCE_LABELS[slot.resourceId]}</span>
                        <span className="profile-inventory-value">{inventory[slot.resourceId] ?? 0}</span>
                      </div>
                    );
                  }

                  if (slot.kind === "axe_slot") {
                    const hasAxe = inventoryAxeItemId !== null;
                    return (
                      <div
                        key="inventory-item-slot-4"
                        className={`profile-inventory-slot profile-inventory-item-slot ${
                          hasAxe ? "is-item" : "is-empty"
                        } ${dropTarget === "inventory_slot_4" ? "is-drop-target" : ""} ${
                          dragSource === "inventory_slot_4" ? "is-dragging-source" : ""
                        } ${hasAxe && inventoryAxeThumb ? "has-glass-tile" : ""}`}
                        ref={inventoryAxeSlotRef}
                        data-no-window-drag="true"
                        onPointerDown={handleInventoryAxePointerDown}
                      >
                        {hasAxe && inventoryAxeThumb ? (
                          <div className="profile-equip-glass-tile profile-equip-glass-tile--inventory">
                            <img
                              src={inventoryAxeThumb}
                              alt=""
                              className="profile-equip-glass-thumb"
                              draggable={false}
                            />
                            <div className="profile-equip-glass-text">
                              <span className="profile-inventory-resource">
                                {EQUIPPABLE_ITEMS[inventoryAxeItemId].label}
                              </span>
                              <span className="profile-inventory-item-hint">Drag to Action Slot</span>
                            </div>
                          </div>
                        ) : hasAxe ? (
                          <>
                            <span className="profile-inventory-resource">
                              {EQUIPPABLE_ITEMS[inventoryAxeItemId].label}
                            </span>
                            <span className="profile-inventory-item-hint">Drag to Action Slot</span>
                          </>
                        ) : (
                          <>
                            <span className="profile-inventory-resource">Slot 4</span>
                            <span className="profile-inventory-empty">Drop tool here</span>
                          </>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`inventory-empty-slot-${index + 1}`}
                      className="profile-inventory-slot is-empty"
                    >
                      <span className="profile-inventory-empty">{slot.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="profile-stats-pane">
            <div className="profile-header">
              <div className="profile-avatar">{initials}</div>
              <div className="profile-info">
                <span className="profile-name">{profile.name}</span>
                <span className="profile-level">Level {progression.level}</span>
                <span className="profile-date">Since {formatDate(profile.createdAt)}</span>
              </div>
            </div>

            <div className="profile-stats-section">
              <span className="profile-stats-title">Focus Time</span>
              <ul className="profile-stats-list">
                {ACTION_ORDER.map((action) => (
                  <li key={action} className="profile-stats-row">
                    <span className="profile-stats-label">{ACTION_LABELS[action]}</span>
                    <span className="profile-stats-dots" />
                    <span className="profile-stats-value">{formatHm(actionStats[action])}</span>
                  </li>
                ))}
              </ul>
              <div className="profile-stats-divider" />
              <div className="profile-stats-row profile-stats-total">
                <span className="profile-stats-label">Total</span>
                <span className="profile-stats-dots" />
                <span className="profile-stats-value">{formatHm(totalMs)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {pointerDrag ? (
        <div
          className={`profile-drag-ghost ${pointerDragThumb ? "profile-drag-ghost--with-thumb" : ""}`}
          style={{ left: pointerDrag.x + 12, top: pointerDrag.y + 14 }}
          data-no-window-drag="true"
        >
          {pointerDragThumb ? (
            <img
              src={pointerDragThumb}
              alt=""
              className="profile-drag-ghost-thumb"
              draggable={false}
            />
          ) : null}
          {pointerDragLabel ? (
            <span className="profile-drag-ghost-label">{pointerDragLabel}</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
