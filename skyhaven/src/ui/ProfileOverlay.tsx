import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Canvas } from "@react-three/fiber";
import type { ActionType, ProgressionState, ResourceId } from "../game/types";
import type { ActionStats } from "../game/actionStats";
import type { PlayerProfile } from "../game/profile";
import type { Inventory } from "../game/inventory";
import {
  EQUIPPABLE_ITEMS,
  getRenderableAttachmentLoadout,
  isEquipmentSlotCompatible,
  type EquipmentSlotRef,
  type EquipmentState,
  type EquippableItemId,
} from "../game/equipment";
import type { PlayableCharacterId } from "../game/playableCharacters";
import { PlayableCharacterPreviewScene } from "./PlayableCharacterPreviewScene";

type ProfileTab = "loadout" | "stats";

type ProfileOverlayProps = {
  open: boolean;
  onClose: () => void;
  profile: PlayerProfile;
  progression: ProgressionState;
  actionStats: ActionStats;
  inventory: Inventory;
  equipmentState: EquipmentState;
  playableVariant: PlayableCharacterId;
  axeGlowEnabled: boolean;
  onMoveItem: (from: EquipmentSlotRef, to: EquipmentSlotRef) => void;
};

type PointerDragState = {
  source: EquipmentSlotRef;
  itemId: EquippableItemId;
  pointerId: number;
  x: number;
  y: number;
};

type EquipmentPanelSlot = {
  slotRef: EquipmentSlotRef;
  title: string;
  emptyLabel: string;
  emptyHint: string;
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

const RESOURCE_LABELS: Record<ResourceId, string> = {
  ore: "Ore",
  wheat: "Wheat",
  wood: "Wood",
};

const INVENTORY_EQUIPMENT_SLOTS: EquipmentPanelSlot[] = [
  {
    slotRef: "inventory_slot_4",
    title: "Slot 4",
    emptyLabel: "Slot 4",
    emptyHint: "Stores main-hand gear",
  },
  {
    slotRef: "inventory_slot_5",
    title: "Slot 5",
    emptyLabel: "Slot 5",
    emptyHint: "Stores offhand gear",
  },
  {
    slotRef: "inventory_slot_6",
    title: "Slot 6",
    emptyLabel: "Slot 6",
    emptyHint: "Stores main-hand gear",
  },
];

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

function getEquipmentItemInSlot(
  equipmentState: EquipmentState,
  slotRef: EquipmentSlotRef,
): EquippableItemId | null {
  switch (slotRef) {
    case "equipped_main_hand":
      return equipmentState.equipped.mainHand;
    case "equipped_off_hand":
      return equipmentState.equipped.offHand;
    case "inventory_slot_4":
      return equipmentState.inventoryItems.slot4;
    case "inventory_slot_5":
      return equipmentState.inventoryItems.slot5;
    case "inventory_slot_6":
      return equipmentState.inventoryItems.slot6;
    default:
      return null;
  }
}

function getEquipmentHint(slotRef: EquipmentSlotRef, hasItem: boolean, playableVariant: PlayableCharacterId): string {
  if (slotRef === "equipped_main_hand") {
    return hasItem ? "Drag back to inventory to unequip" : "Drag a main-hand item here";
  }
  if (slotRef === "equipped_off_hand") {
    if (playableVariant !== "fight_man") return "Fight Man only";
    return hasItem ? "Drag back to inventory to unequip" : "Drag an offhand item here";
  }
  if (slotRef === "inventory_slot_4") {
    return hasItem ? "Drag to Main Hand" : "Stores main-hand gear";
  }
  if (slotRef === "inventory_slot_6") {
    return hasItem ? "Drag to Offhand" : "Stores main-hand gear";
  }
  return hasItem ? "Drag to Offhand" : "Stores offhand gear";
}

function isSlotDisabled(slotRef: EquipmentSlotRef, playableVariant: PlayableCharacterId): boolean {
  return slotRef === "equipped_off_hand" && playableVariant !== "fight_man";
}

function ProfileCharacterScene({
  playableVariant,
  attachmentLoadout,
  axeGlowEnabled,
  onOrbitStart,
  onOrbitEnd,
}: {
  playableVariant: PlayableCharacterId;
  attachmentLoadout: ReturnType<typeof getRenderableAttachmentLoadout>;
  axeGlowEnabled: boolean;
  onOrbitStart: () => void;
  onOrbitEnd: () => void;
}) {
  return (
    <PlayableCharacterPreviewScene
      playableVariant={playableVariant}
      attachmentLoadout={attachmentLoadout}
      axeGlowEnabled={axeGlowEnabled}
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
  axeGlowEnabled,
  onMoveItem,
}: ProfileOverlayProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("loadout");
  const [isViewerDragging, setIsViewerDragging] = useState(false);
  const [dragSource, setDragSource] = useState<EquipmentSlotRef | null>(null);
  const [dropTarget, setDropTarget] = useState<EquipmentSlotRef | null>(null);
  const [pointerDrag, setPointerDrag] = useState<PointerDragState | null>(null);
  const slotRefs = useRef<Partial<Record<EquipmentSlotRef, HTMLDivElement | null>>>({});

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
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const renderAttachmentLoadout = useMemo(
    () => getRenderableAttachmentLoadout(equipmentState, playableVariant),
    [equipmentState, playableVariant],
  );

  const slotItems = useMemo(
    () => ({
      equipped_main_hand: equipmentState.equipped.mainHand,
      equipped_off_hand: equipmentState.equipped.offHand,
      inventory_slot_4: equipmentState.inventoryItems.slot4,
      inventory_slot_5: equipmentState.inventoryItems.slot5,
      inventory_slot_6: equipmentState.inventoryItems.slot6,
    }),
    [equipmentState],
  );

  const pointerDragLabel = pointerDrag ? EQUIPPABLE_ITEMS[pointerDrag.itemId].label : null;
  const pointerDragThumb = pointerDrag ? EQUIPPABLE_ITEMS[pointerDrag.itemId].thumbnailSrc : undefined;

  const equipSlots: EquipmentPanelSlot[] = useMemo(
    () => [
      {
        slotRef: "equipped_main_hand",
        title: "Main Hand",
        emptyLabel: "Empty Main Hand",
        emptyHint: "Drag a main-hand item here",
      },
      {
        slotRef: "equipped_off_hand",
        title: "Offhand",
        emptyLabel: playableVariant === "fight_man" ? "Empty Offhand" : "Fight Man Offhand",
        emptyHint: playableVariant === "fight_man" ? "Drag an offhand item here" : "Offhand equip is only active on Fight Man",
      },
    ],
    [playableVariant],
  );

  const handleOrbitStart = useCallback(() => setIsViewerDragging(true), []);
  const handleOrbitEnd = useCallback(() => setIsViewerDragging(false), []);

  const clearDragState = useCallback(() => {
    setPointerDrag(null);
    setDragSource(null);
    setDropTarget(null);
  }, []);

  const canDropToSlot = useCallback(
    (source: EquipmentSlotRef, target: EquipmentSlotRef): boolean => {
      if (source === target) return false;
      const sourceItem = getEquipmentItemInSlot(equipmentState, source);
      if (!sourceItem || getEquipmentItemInSlot(equipmentState, target)) return false;
      if (isSlotDisabled(target, playableVariant)) return false;
      return isEquipmentSlotCompatible(sourceItem, target);
    },
    [equipmentState, playableVariant],
  );

  const resolveDropTargetFromPoint = useCallback(
    (x: number, y: number, source: EquipmentSlotRef): EquipmentSlotRef | null => {
      const allSlots: EquipmentSlotRef[] = [
        "equipped_main_hand",
        "equipped_off_hand",
        "inventory_slot_4",
        "inventory_slot_5",
        "inventory_slot_6",
      ];
      for (const slotRef of allSlots) {
        if (!canDropToSlot(source, slotRef)) continue;
        const rect = slotRefs.current[slotRef]?.getBoundingClientRect();
        if (!rect) continue;
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return slotRef;
        }
      }
      return null;
    },
    [canDropToSlot],
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
      if (target) {
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

  const handleSlotPointerDown = useCallback(
    (slotRef: EquipmentSlotRef) =>
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const itemId = getEquipmentItemInSlot(equipmentState, slotRef);
        if (event.button !== 0 || !itemId || isSlotDisabled(slotRef, playableVariant)) return;
        event.preventDefault();
        event.stopPropagation();
        setDragSource(slotRef);
        setPointerDrag({
          source: slotRef,
          itemId,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        });
        setDropTarget(resolveDropTargetFromPoint(event.clientX, event.clientY, slotRef));
      },
    [equipmentState, playableVariant, resolveDropTargetFromPoint],
  );

  const renderEquipmentSlot = useCallback(
    (slot: EquipmentPanelSlot) => {
      const itemId = slotItems[slot.slotRef];
      const itemDef = itemId ? EQUIPPABLE_ITEMS[itemId] : null;
      const disabled = isSlotDisabled(slot.slotRef, playableVariant);
      const hint = getEquipmentHint(slot.slotRef, itemId != null, playableVariant);
      const isDropTarget = dropTarget === slot.slotRef;
      const isDraggingSource = dragSource === slot.slotRef;
      return (
        <div
          key={slot.slotRef}
          className={`profile-action-slot ${
            itemId ? "is-equipped" : "is-empty"
          } ${isDropTarget ? "is-drop-target" : ""} ${isDraggingSource ? "is-dragging-source" : ""} ${
            itemDef?.thumbnailSrc ? "has-glass-tile" : ""
          } ${disabled ? "is-disabled" : ""}`}
          ref={(node) => {
            slotRefs.current[slot.slotRef] = node;
          }}
          data-no-window-drag="true"
          onPointerDown={handleSlotPointerDown(slot.slotRef)}
          style={disabled ? { opacity: 0.58 } : undefined}
        >
          <span className="profile-slotbar-title">{slot.title}</span>
          {itemDef?.thumbnailSrc ? (
            <div className="profile-equip-glass-tile profile-equip-glass-tile--action">
              <img
                src={itemDef.thumbnailSrc}
                alt=""
                className="profile-equip-glass-thumb"
                draggable={false}
              />
              <div className="profile-equip-glass-text">
                <span className="profile-action-slot-item">{itemDef.label}</span>
                <span className="profile-action-slot-state">{hint}</span>
              </div>
            </div>
          ) : itemDef ? (
            <>
              <span className="profile-action-slot-item">{itemDef.label}</span>
              <span className="profile-action-slot-state">{hint}</span>
            </>
          ) : (
            <>
              <span className="profile-action-slot-item">{slot.emptyLabel}</span>
              <span className="profile-action-slot-state">{disabled ? slot.emptyHint : hint}</span>
            </>
          )}
        </div>
      );
    },
    [dragSource, dropTarget, handleSlotPointerDown, playableVariant, slotItems],
  );

  const renderInventoryItemSlot = useCallback(
    (slot: EquipmentPanelSlot) => {
      const itemId = slotItems[slot.slotRef];
      const itemDef = itemId ? EQUIPPABLE_ITEMS[itemId] : null;
      return (
        <div
          key={slot.slotRef}
          className={`profile-inventory-slot profile-inventory-item-slot ${
            itemId ? "is-item" : "is-empty"
          } ${dropTarget === slot.slotRef ? "is-drop-target" : ""} ${
            dragSource === slot.slotRef ? "is-dragging-source" : ""
          } ${itemDef?.thumbnailSrc ? "has-glass-tile" : ""}`}
          ref={(node) => {
            slotRefs.current[slot.slotRef] = node;
          }}
          data-no-window-drag="true"
          onPointerDown={handleSlotPointerDown(slot.slotRef)}
        >
          {itemDef?.thumbnailSrc ? (
            <div className="profile-equip-glass-tile profile-equip-glass-tile--inventory">
              <img
                src={itemDef.thumbnailSrc}
                alt=""
                className="profile-equip-glass-thumb"
                draggable={false}
              />
              <div className="profile-equip-glass-text">
                <span className="profile-inventory-resource">{itemDef.label}</span>
                <span className="profile-inventory-item-hint">
                  {getEquipmentHint(slot.slotRef, true, playableVariant)}
                </span>
              </div>
            </div>
          ) : itemDef ? (
            <>
              <span className="profile-inventory-resource">{itemDef.label}</span>
              <span className="profile-inventory-item-hint">
                {getEquipmentHint(slot.slotRef, true, playableVariant)}
              </span>
            </>
          ) : (
            <>
              <span className="profile-inventory-resource">{slot.emptyLabel}</span>
              <span className="profile-inventory-empty">{slot.emptyHint}</span>
            </>
          )}
        </div>
      );
    },
    [dragSource, dropTarget, handleSlotPointerDown, playableVariant, slotItems],
  );

  if (!open) return null;

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
                <Canvas
                  className="profile-character-canvas"
                  gl={{ antialias: true, alpha: true }}
                  dpr={[1, 1.6]}
                >
                  <ProfileCharacterScene
                    playableVariant={playableVariant}
                    attachmentLoadout={renderAttachmentLoadout}
                    axeGlowEnabled={axeGlowEnabled}
                    onOrbitStart={handleOrbitStart}
                    onOrbitEnd={handleOrbitEnd}
                  />
                </Canvas>
              </div>

              <div className="profile-action-slotbar">
                {equipSlots.map(renderEquipmentSlot)}
              </div>
            </div>

            <div className="profile-loadout-right">
              <span className="profile-inventory-title">Inventory</span>
              <div className="profile-inventory-grid">
                {(["ore", "wheat", "wood"] as const).map((resourceId) => (
                  <div
                    key={`inventory-resource-slot-${resourceId}`}
                    className="profile-inventory-slot"
                  >
                    <span className="profile-inventory-resource">{RESOURCE_LABELS[resourceId]}</span>
                    <span className="profile-inventory-value">{inventory[resourceId] ?? 0}</span>
                  </div>
                ))}
                {INVENTORY_EQUIPMENT_SLOTS.map(renderInventoryItemSlot)}
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
