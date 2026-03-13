export type EquippableItemId = "wood_axe_placeholder";

export type Vec3Tuple = [number, number, number];

export type ItemSocketTransform = {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
};

export type EquippableItemDef = {
  id: EquippableItemId;
  label: string;
  rightHand: ItemSocketTransform;
};

export const EQUIPPABLE_ITEMS: Record<EquippableItemId, EquippableItemDef> = {
  wood_axe_placeholder: {
    id: "wood_axe_placeholder",
    label: "Wood Axe",
    rightHand: {
      position: [0.03, -0.05, 0.04],
      rotation: [Math.PI * 0.5, 0, Math.PI * 0.35],
      scale: [0.22, 0.22, 0.22],
    },
  },
};

export type ActionBarState = {
  primary: EquippableItemId | null;
};

export type InventoryItemSlots = {
  slot4: EquippableItemId | null;
};

export type EquipmentState = {
  actionBar: ActionBarState;
  inventoryItems: InventoryItemSlots;
  equippedRightHand: EquippableItemId | null;
};

export type EquipmentSlotRef = "inventory_slot_4" | "action_primary";

export const EQUIPMENT_STORAGE_KEY = "skyhaven.equipment.v2";

const AXE_ID: EquippableItemId = "wood_axe_placeholder";
const DEFAULT_EQUIPMENT: EquipmentState = {
  actionBar: { primary: null },
  inventoryItems: { slot4: AXE_ID },
  equippedRightHand: null,
};

function isValidEquippableItemId(value: unknown): value is EquippableItemId {
  return typeof value === "string" && value in EQUIPPABLE_ITEMS;
}

function isValidActionBar(value: unknown): value is ActionBarState {
  if (!value || typeof value !== "object") return false;
  const primary = (value as Record<string, unknown>).primary;
  return primary === null || isValidEquippableItemId(primary);
}

function isValidInventoryItems(value: unknown): value is InventoryItemSlots {
  if (!value || typeof value !== "object") return false;
  const slot4 = (value as Record<string, unknown>).slot4;
  return slot4 === null || isValidEquippableItemId(slot4);
}

function isValidEquipment(value: unknown): value is EquipmentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isValidActionBar(record.actionBar) &&
    isValidInventoryItems(record.inventoryItems) &&
    (record.equippedRightHand === null || isValidEquippableItemId(record.equippedRightHand))
  );
}

function withDerivedRightHand(state: EquipmentState): EquipmentState {
  return { ...state, equippedRightHand: state.actionBar.primary };
}

function normalizeEquipment(state: EquipmentState): EquipmentState {
  const hasAxeInAction = state.actionBar.primary === AXE_ID;
  const hasAxeInInventory = state.inventoryItems.slot4 === AXE_ID;

  let next: EquipmentState = {
    actionBar: { primary: hasAxeInAction ? AXE_ID : null },
    inventoryItems: { slot4: hasAxeInInventory ? AXE_ID : null },
    equippedRightHand: null,
  };

  // If corrupted state has item in both places, keep action slot authoritative.
  if (hasAxeInAction && hasAxeInInventory) {
    next = {
      ...next,
      inventoryItems: { slot4: null },
    };
  }

  // If item disappeared from both places, restore to inventory slot.
  if (!hasAxeInAction && !hasAxeInInventory) {
    next = {
      ...next,
      inventoryItems: { slot4: AXE_ID },
    };
  }

  return withDerivedRightHand(next);
}

function cloneEquipment(state: EquipmentState): EquipmentState {
  return {
    actionBar: { primary: state.actionBar.primary },
    inventoryItems: { slot4: state.inventoryItems.slot4 },
    equippedRightHand: state.equippedRightHand,
  };
}

function getSlotValue(state: EquipmentState, slot: EquipmentSlotRef): EquippableItemId | null {
  return slot === "action_primary" ? state.actionBar.primary : state.inventoryItems.slot4;
}

function setSlotValue(
  state: EquipmentState,
  slot: EquipmentSlotRef,
  item: EquippableItemId | null,
): void {
  if (slot === "action_primary") {
    state.actionBar.primary = item;
    return;
  }
  state.inventoryItems.slot4 = item;
}

export function hydrateEquipment(): EquipmentState {
  if (typeof window === "undefined") return cloneEquipment(DEFAULT_EQUIPMENT);
  const raw = window.localStorage.getItem(EQUIPMENT_STORAGE_KEY);
  if (!raw) return cloneEquipment(DEFAULT_EQUIPMENT);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidEquipment(parsed)) {
      return cloneEquipment(DEFAULT_EQUIPMENT);
    }
    return normalizeEquipment({
      actionBar: { primary: parsed.actionBar.primary },
      inventoryItems: { slot4: parsed.inventoryItems.slot4 },
      equippedRightHand: parsed.equippedRightHand,
    });
  } catch {
    return cloneEquipment(DEFAULT_EQUIPMENT);
  }
}

export function persistEquipment(equipment: EquipmentState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(equipment));
}

export function moveEquipmentItem(
  equipment: EquipmentState,
  from: EquipmentSlotRef,
  to: EquipmentSlotRef,
): EquipmentState {
  if (from === to) return equipment;

  const next = cloneEquipment(equipment);
  const sourceItem = getSlotValue(next, from);
  const targetItem = getSlotValue(next, to);
  if (!sourceItem || targetItem) return equipment;

  setSlotValue(next, from, null);
  setSlotValue(next, to, sourceItem);
  return normalizeEquipment(next);
}
