import type { PlayableCharacterId } from "./playableCharacters";

export type EquippableItemId = "wood_axe_placeholder";

export type Vec3Tuple = [number, number, number];

export type ItemSocketTransform = {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
};

export type ItemSocketTransformByVariant = Record<PlayableCharacterId, ItemSocketTransform>;

export type EquippableItemDef = {
  id: EquippableItemId;
  label: string;
  /** Optional inventory / UI thumbnail (profile slots, drag ghost). */
  thumbnailSrc?: string;
  rightHandByVariant: ItemSocketTransformByVariant;
  /** Stowed on back when item is in inventory but not on action bar (tune in Character Debug). */
  backByVariant: ItemSocketTransformByVariant;
};

export const WOOD_AXE_ITEM_ID: EquippableItemId = "wood_axe_placeholder";

export function cloneItemSocketTransform(transform: ItemSocketTransform): ItemSocketTransform {
  return {
    position: [...transform.position] as Vec3Tuple,
    rotation: [...transform.rotation] as Vec3Tuple,
    scale: [...transform.scale] as Vec3Tuple,
  };
}

export function cloneItemSocketTransformByVariant(
  transforms: ItemSocketTransformByVariant,
): ItemSocketTransformByVariant {
  return {
    default: cloneItemSocketTransform(transforms.default),
    fight_man: cloneItemSocketTransform(transforms.fight_man),
    mining_man: cloneItemSocketTransform(transforms.mining_man),
    magic_man: cloneItemSocketTransform(transforms.magic_man),
  };
}

export const EQUIPPABLE_ITEMS: Record<EquippableItemId, EquippableItemDef> = {
  [WOOD_AXE_ITEM_ID]: {
    id: WOOD_AXE_ITEM_ID,
    label: "Wood Axe",
    thumbnailSrc: "/ingame_assets/3d/Waffen/Axt_Inventar_Thumbnail.png",
    rightHandByVariant: {
      default: {
        position: [28.1172, 18.552, 9.7968],
        rotation: [1.6403, 0.0699, 3.1069],
        scale: [56.24, 63.47, 46.94],
      },
      fight_man: {
        position: [-1.0279, 22.5909, -29.8135],
        rotation: [-0.7883, -1.3582, -1.127],
        scale: [46.81, 46.81, 46.81],
      },
      mining_man: {
        position: [2, -2, 6],
        rotation: [1.6336, -0.12, 1.1938],
        scale: [20, 20, 20],
      },
      magic_man: {
        position: [2, -2, 6],
        rotation: [1.6336, -0.12, 1.1938],
        scale: [20, 20, 20],
      },
    },
    backByVariant: {
      default: {
        position: [0, 18, -12],
        rotation: [0, Math.PI, 0.25],
        scale: [40, 40, 40],
      },
      fight_man: {
        position: [0, 22, -18],
        rotation: [0, Math.PI, 0.2],
        scale: [38, 38, 38],
      },
      mining_man: {
        position: [0, 0.12, -0.14],
        rotation: [0, Math.PI, 0.2],
        scale: [0.09, 0.09, 0.09],
      },
      magic_man: {
        position: [0, 0.12, -0.14],
        rotation: [0, Math.PI, 0.2],
        scale: [0.09, 0.09, 0.09],
      },
    },
  },
};

export function getEquippableItemRightHandTransform(
  itemId: EquippableItemId,
  playableVariant: PlayableCharacterId,
): ItemSocketTransform | null {
  const itemDef = EQUIPPABLE_ITEMS[itemId];
  if (!itemDef) return null;
  return cloneItemSocketTransform(
    itemDef.rightHandByVariant[playableVariant] ?? itemDef.rightHandByVariant.default,
  );
}

export function getEquippableItemDefaultRightHandByVariant(
  itemId: EquippableItemId,
): ItemSocketTransformByVariant | null {
  const itemDef = EQUIPPABLE_ITEMS[itemId];
  if (!itemDef) return null;
  return cloneItemSocketTransformByVariant(itemDef.rightHandByVariant);
}

export function getEquippableItemBackTransform(
  itemId: EquippableItemId,
  playableVariant: PlayableCharacterId,
): ItemSocketTransform | null {
  const itemDef = EQUIPPABLE_ITEMS[itemId];
  if (!itemDef) return null;
  return cloneItemSocketTransform(
    itemDef.backByVariant[playableVariant] ?? itemDef.backByVariant.default,
  );
}

export function getEquippableItemDefaultBackByVariant(
  itemId: EquippableItemId,
): ItemSocketTransformByVariant | null {
  const itemDef = EQUIPPABLE_ITEMS[itemId];
  if (!itemDef) return null;
  return cloneItemSocketTransformByVariant(itemDef.backByVariant);
}

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

/** Wood axe on back when it lives in slot 4 but is not on the action bar (not in hand). */
export function getStowedBackItemFromEquipment(state: EquipmentState): EquippableItemId | null {
  if (state.actionBar.primary != null) return null;
  if (state.inventoryItems.slot4 !== WOOD_AXE_ITEM_ID) return null;
  return WOOD_AXE_ITEM_ID;
}

export type EquipmentSlotRef = "inventory_slot_4" | "action_primary";

export const EQUIPMENT_STORAGE_KEY = "skyhaven.equipment.v2";

const DEFAULT_EQUIPMENT: EquipmentState = {
  actionBar: { primary: null },
  inventoryItems: { slot4: WOOD_AXE_ITEM_ID },
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
  const hasAxeInAction = state.actionBar.primary === WOOD_AXE_ITEM_ID;
  const hasAxeInInventory = state.inventoryItems.slot4 === WOOD_AXE_ITEM_ID;

  let next: EquipmentState = {
    actionBar: { primary: hasAxeInAction ? WOOD_AXE_ITEM_ID : null },
    inventoryItems: { slot4: hasAxeInInventory ? WOOD_AXE_ITEM_ID : null },
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
      inventoryItems: { slot4: WOOD_AXE_ITEM_ID },
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
