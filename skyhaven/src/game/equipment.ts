import type { PlayableCharacterId } from "./playableCharacters";

export type EquippableItemId = "wood_axe_placeholder" | "shield_placeholder" | "torch_placeholder";
export type Vec3Tuple = [number, number, number];
export type EquipSlotId = "main_hand" | "off_hand";
export type AttachmentSocketId = "right_hand" | "left_hand" | "back_right" | "back_left" | "hip_left";
export type EquipmentSlotRef =
  | "equipped_main_hand"
  | "equipped_off_hand"
  | "inventory_slot_4"
  | "inventory_slot_5"
  | "inventory_slot_6";

export type ItemSocketTransform = {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
};

export type ItemSocketTransformByVariant = Record<PlayableCharacterId, ItemSocketTransform>;
export type ItemSocketTransformsBySocket = Record<AttachmentSocketId, ItemSocketTransformByVariant>;

export type EquippableItemDef = {
  id: EquippableItemId;
  label: string;
  worldAssetSrc: string;
  thumbnailSrc?: string;
  allowedEquipSlot: EquipSlotId;
  stowSocket: "back_right" | "back_left" | "hip_left";
  combatItem?: boolean;
  socketTransforms: ItemSocketTransformsBySocket;
};

export type EquippedItemSlots = {
  mainHand: EquippableItemId | null;
  offHand: EquippableItemId | null;
};

export type InventoryItemSlots = {
  slot4: EquippableItemId | null;
  slot5: EquippableItemId | null;
  slot6: EquippableItemId | null;
};

export type EquipmentState = {
  equipped: EquippedItemSlots;
  inventoryItems: InventoryItemSlots;
};

export type AttachmentLoadout = Record<AttachmentSocketId, EquippableItemId | null>;

type LegacyV2EquipmentState = {
  actionBar: { primary: EquippableItemId | null };
  inventoryItems: { slot4: EquippableItemId | null };
  equippedRightHand: EquippableItemId | null;
};

type LegacyV3EquipmentState = {
  equipped: EquippedItemSlots;
  inventoryItems: {
    slot4: EquippableItemId | null;
    slot5: EquippableItemId | null;
  };
};

const ALL_ATTACHMENTS: readonly AttachmentSocketId[] = [
  "right_hand",
  "left_hand",
  "back_right",
  "back_left",
  "hip_left",
];

const PLAYABLE_VARIANTS: readonly PlayableCharacterId[] = [
  "default",
  "fight_man",
  "mining_man",
  "magic_man",
];

export const WOOD_AXE_ITEM_ID: EquippableItemId = "wood_axe_placeholder";
export const SHIELD_ITEM_ID: EquippableItemId = "shield_placeholder";
export const TORCH_ITEM_ID: EquippableItemId = "torch_placeholder";
export const EQUIPMENT_STORAGE_KEY = "skyhaven.equipment.v4";
const LEGACY_EQUIPMENT_STORAGE_KEY_V3 = "skyhaven.equipment.v3";
const LEGACY_EQUIPMENT_STORAGE_KEY_V2 = "skyhaven.equipment.v2";

function getIdentityTransform(): ItemSocketTransform {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

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

export function cloneItemSocketTransformsBySocket(
  transforms: ItemSocketTransformsBySocket,
): ItemSocketTransformsBySocket {
  return {
    right_hand: cloneItemSocketTransformByVariant(transforms.right_hand),
    left_hand: cloneItemSocketTransformByVariant(transforms.left_hand),
    back_right: cloneItemSocketTransformByVariant(transforms.back_right),
    back_left: cloneItemSocketTransformByVariant(transforms.back_left),
    hip_left: cloneItemSocketTransformByVariant(transforms.hip_left),
  };
}

function buildIdentityTransformsByVariant(): ItemSocketTransformByVariant {
  const identity = getIdentityTransform();
  return {
    default: cloneItemSocketTransform(identity),
    fight_man: cloneItemSocketTransform(identity),
    mining_man: cloneItemSocketTransform(identity),
    magic_man: cloneItemSocketTransform(identity),
  };
}

function buildSocketTransforms(
  overrides: Partial<Record<AttachmentSocketId, Partial<ItemSocketTransformByVariant>>>,
): ItemSocketTransformsBySocket {
  const socketTransforms = {} as ItemSocketTransformsBySocket;
  for (const socketId of ALL_ATTACHMENTS) {
    const byVariant = buildIdentityTransformsByVariant();
    const socketOverrides = overrides[socketId] ?? {};
    for (const variant of PLAYABLE_VARIANTS) {
      const nextTransform = socketOverrides[variant];
      if (!nextTransform) continue;
      byVariant[variant] = cloneItemSocketTransform(nextTransform);
    }
    socketTransforms[socketId] = byVariant;
  }
  return socketTransforms;
}

export const EQUIPPABLE_ITEMS: Record<EquippableItemId, EquippableItemDef> = {
  [WOOD_AXE_ITEM_ID]: {
    id: WOOD_AXE_ITEM_ID,
    label: "Wood Axe",
    worldAssetSrc: "/ingame_assets/3d/Waffen/Axt.glb",
    thumbnailSrc: "/ingame_assets/3d/Waffen/Axt_Inventar_Thumbnail.png",
    allowedEquipSlot: "main_hand",
    stowSocket: "back_right",
    combatItem: true,
    socketTransforms: buildSocketTransforms({
      right_hand: {
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
      back_right: {
        default: {
          position: [0, 22, -18],
          rotation: [0, 3.1416, 0.2],
          scale: [38, 38, 38],
        },
        fight_man: {
          position: [-1.7985, 4.2126, -18],
          rotation: [2.9544, 0.0945, 1.1084],
          scale: [48.51, 48.51, 48.51],
        },
        mining_man: {
          position: [0, 0.12, -0.14],
          rotation: [0, 3.1416, 0.2],
          scale: [0.09, 0.09, 0.09],
        },
        magic_man: {
          position: [0, 0.12, -0.14],
          rotation: [0, 3.1416, 0.2],
          scale: [0.09, 0.09, 0.09],
        },
      },
    }),
  },
  [SHIELD_ITEM_ID]: {
    id: SHIELD_ITEM_ID,
    label: "Shield",
    worldAssetSrc: "/ingame_assets/3d/Waffen/Shield.glb",
    thumbnailSrc: "/ingame_assets/3d/Waffen/Shield_Inventar_Thumbnail.png",
    allowedEquipSlot: "off_hand",
    stowSocket: "back_left",
    combatItem: true,
    socketTransforms: buildSocketTransforms({
      left_hand: {
        default: {
          position: [-16.5, 18.4, 5.6],
          rotation: [1.485, -0.188, 1.544],
          scale: [16.5, 16.5, 16.5],
        },
        fight_man: {
          position: [-3.2982, -4.4411, -5.5325],
          rotation: [-3.1274, 0.2239, 1.7977],
          scale: [58.6, 58.6, 58.6],
        },
        mining_man: {
          position: [-4.6, 8.8, 1.8],
          rotation: [1.465, -0.02, 1.34],
          scale: [6.4, 6.4, 6.4],
        },
        magic_man: {
          position: [-4.4, 8.2, 1.2],
          rotation: [1.452, -0.08, 1.28],
          scale: [6.4, 6.4, 6.4],
        },
      },
      back_left: {
        default: {
          position: [8.5, 21.5, -17.5],
          rotation: [0.12, 3.1416, -0.34],
          scale: [13.6, 13.6, 13.6],
        },
        fight_man: {
          position: [12.2207, 4.4598, -24.4758],
          rotation: [3.1085, 0.2496, 2.4589],
          scale: [49.31, 49.31, 49.31],
        },
        mining_man: {
          position: [0.07, 0.09, -0.13],
          rotation: [0.14, 3.1416, -0.24],
          scale: [0.032, 0.032, 0.032],
        },
        magic_man: {
          position: [0.07, 0.09, -0.13],
          rotation: [0.14, 3.1416, -0.24],
          scale: [0.032, 0.032, 0.032],
        },
      },
    }),
  },
  [TORCH_ITEM_ID]: {
    id: TORCH_ITEM_ID,
    label: "Torch",
    worldAssetSrc: "/ingame_assets/3d/Torch_Decoration.glb",
    thumbnailSrc: "/ingame_assets/3d/Waffen/Fackel_Inventar_Thumbnail.png",
    allowedEquipSlot: "off_hand",
    stowSocket: "hip_left",
    socketTransforms: buildSocketTransforms({
      left_hand: {
        default: {
          position: [-28.1172, 18.552, 9.7968],
          rotation: [1.6403, -0.0699, -3.1069],
          scale: [56.24, 63.47, 46.94],
        },
        fight_man: {
          position: [-20.167, 17.9573, 6.3068],
          rotation: [-1.2077, 0.1385, 1.4792],
          scale: [46.81, 46.81, 46.81],
        },
        mining_man: {
          position: [-2, -2, 6],
          rotation: [1.6336, 0.12, -1.1938],
          scale: [20, 20, 20],
        },
        magic_man: {
          position: [-2, -2, 6],
          rotation: [1.6336, 0.12, -1.1938],
          scale: [20, 20, 20],
        },
      },
      hip_left: {
        default: {
          position: [-8.5, 4.5, 3.4],
          rotation: [0.24, 1.5708, -1.18],
          scale: [32, 32, 32],
        },
        fight_man: {
          position: [-26.8, -9.4, 5.2001],
          rotation: [1.0844, 0.3459, -0.4538],
          scale: [42, 42, 42],
        },
        mining_man: {
          position: [-0.05, 0.01, 0.02],
          rotation: [0.24, 1.5708, -1.18],
          scale: [0.075, 0.075, 0.075],
        },
        magic_man: {
          position: [-0.05, 0.01, 0.02],
          rotation: [0.24, 1.5708, -1.18],
          scale: [0.075, 0.075, 0.075],
        },
      },
    }),
  },
};

const DEFAULT_ATTACHMENT_LOADOUT: AttachmentLoadout = {
  right_hand: null,
  left_hand: null,
  back_right: null,
  back_left: null,
  hip_left: null,
};

const DEFAULT_EQUIPMENT: EquipmentState = {
  equipped: {
    mainHand: null,
    offHand: null,
  },
  inventoryItems: {
    slot4: WOOD_AXE_ITEM_ID,
    slot5: SHIELD_ITEM_ID,
    slot6: TORCH_ITEM_ID,
  },
};

const DEFAULT_INVENTORY_SLOT_BY_ITEM: Record<
  EquippableItemId,
  "inventory_slot_4" | "inventory_slot_5" | "inventory_slot_6"
> = {
  [WOOD_AXE_ITEM_ID]: "inventory_slot_4",
  [SHIELD_ITEM_ID]: "inventory_slot_5",
  [TORCH_ITEM_ID]: "inventory_slot_6",
};

function isValidEquippableItemId(value: unknown): value is EquippableItemId {
  return typeof value === "string" && value in EQUIPPABLE_ITEMS;
}

function isValidEquippedState(value: unknown): value is EquippedItemSlots {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.mainHand === null || isValidEquippableItemId(record.mainHand)) &&
    (record.offHand === null || isValidEquippableItemId(record.offHand))
  );
}

function isValidInventoryItems(value: unknown): value is InventoryItemSlots {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.slot4 === null || isValidEquippableItemId(record.slot4)) &&
    (record.slot5 === null || isValidEquippableItemId(record.slot5)) &&
    (record.slot6 === null || isValidEquippableItemId(record.slot6))
  );
}

function isValidEquipment(value: unknown): value is EquipmentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return isValidEquippedState(record.equipped) && isValidInventoryItems(record.inventoryItems);
}

function isValidLegacyV2Equipment(value: unknown): value is LegacyV2EquipmentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const actionBar = record.actionBar as Record<string, unknown> | null;
  const inventoryItems = record.inventoryItems as Record<string, unknown> | null;
  return (
    !!actionBar &&
    !!inventoryItems &&
    (actionBar.primary === null || isValidEquippableItemId(actionBar.primary)) &&
    (inventoryItems.slot4 === null || isValidEquippableItemId(inventoryItems.slot4)) &&
    (record.equippedRightHand === null || isValidEquippableItemId(record.equippedRightHand))
  );
}

function isValidLegacyV3Equipment(value: unknown): value is LegacyV3EquipmentState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const inventoryItems = record.inventoryItems as Record<string, unknown> | null;
  return (
    isValidEquippedState(record.equipped) &&
    !!inventoryItems &&
    (inventoryItems.slot4 === null || isValidEquippableItemId(inventoryItems.slot4)) &&
    (inventoryItems.slot5 === null || isValidEquippableItemId(inventoryItems.slot5))
  );
}

function cloneEquipment(state: EquipmentState): EquipmentState {
  return {
    equipped: {
      mainHand: state.equipped.mainHand,
      offHand: state.equipped.offHand,
    },
    inventoryItems: {
      slot4: state.inventoryItems.slot4,
      slot5: state.inventoryItems.slot5,
      slot6: state.inventoryItems.slot6,
    },
  };
}

function createEmptyEquipmentState(): EquipmentState {
  return {
    equipped: {
      mainHand: null,
      offHand: null,
    },
    inventoryItems: {
      slot4: null,
      slot5: null,
      slot6: null,
    },
  };
}

function getSlotValue(state: EquipmentState, slot: EquipmentSlotRef): EquippableItemId | null {
  switch (slot) {
    case "equipped_main_hand":
      return state.equipped.mainHand;
    case "equipped_off_hand":
      return state.equipped.offHand;
    case "inventory_slot_4":
      return state.inventoryItems.slot4;
    case "inventory_slot_5":
      return state.inventoryItems.slot5;
    case "inventory_slot_6":
      return state.inventoryItems.slot6;
    default:
      return null;
  }
}

function setSlotValue(
  state: EquipmentState,
  slot: EquipmentSlotRef,
  itemId: EquippableItemId | null,
): void {
  switch (slot) {
    case "equipped_main_hand":
      state.equipped.mainHand = itemId;
      return;
    case "equipped_off_hand":
      state.equipped.offHand = itemId;
      return;
    case "inventory_slot_4":
      state.inventoryItems.slot4 = itemId;
      return;
    case "inventory_slot_5":
      state.inventoryItems.slot5 = itemId;
      return;
    case "inventory_slot_6":
      state.inventoryItems.slot6 = itemId;
      return;
  }
}

function getPreferredSlotOrder(itemId: EquippableItemId): readonly EquipmentSlotRef[] {
  const item = EQUIPPABLE_ITEMS[itemId];
  if (item.allowedEquipSlot === "main_hand") {
    return [
      "equipped_main_hand",
      "inventory_slot_4",
      "inventory_slot_6",
      "inventory_slot_5",
      "equipped_off_hand",
    ];
  }
  return [
    "equipped_off_hand",
    "inventory_slot_5",
    "inventory_slot_4",
    "inventory_slot_6",
    "equipped_main_hand",
  ];
}

function getFirstFreeInventorySlot(
  state: EquipmentState,
): "inventory_slot_4" | "inventory_slot_5" | "inventory_slot_6" | null {
  if (state.inventoryItems.slot4 == null) return "inventory_slot_4";
  if (state.inventoryItems.slot5 == null) return "inventory_slot_5";
  if (state.inventoryItems.slot6 == null) return "inventory_slot_6";
  return null;
}

function pickFallbackSlot(state: EquipmentState, itemId: EquippableItemId): EquipmentSlotRef {
  const preferredInventorySlot = DEFAULT_INVENTORY_SLOT_BY_ITEM[itemId];
  if (getSlotValue(state, preferredInventorySlot) == null) {
    return preferredInventorySlot;
  }
  const freeInventorySlot = getFirstFreeInventorySlot(state);
  if (freeInventorySlot) return freeInventorySlot;
  return preferredInventorySlot;
}

function normalizeEquipment(state: EquipmentState): EquipmentState {
  const next = createEmptyEquipmentState();
  const sourceState = cloneEquipment(state);
  const occupiedSlots = new Set<EquipmentSlotRef>();
  const allSlots: readonly EquipmentSlotRef[] = [
    "equipped_main_hand",
    "equipped_off_hand",
    "inventory_slot_4",
    "inventory_slot_5",
    "inventory_slot_6",
  ];

  for (const itemId of Object.keys(EQUIPPABLE_ITEMS) as EquippableItemId[]) {
    const preferredSlot = getPreferredSlotOrder(itemId).find((slot) => getSlotValue(sourceState, slot) === itemId);
    const targetSlot = preferredSlot && !occupiedSlots.has(preferredSlot)
      ? preferredSlot
      : pickFallbackSlot(next, itemId);
    setSlotValue(next, targetSlot, itemId);
    occupiedSlots.add(targetSlot);
  }

  for (const slot of allSlots) {
    const itemId = getSlotValue(next, slot);
    if (itemId && !isEquipmentSlotCompatible(itemId, slot)) {
      setSlotValue(next, slot, null);
      setSlotValue(next, pickFallbackSlot(next, itemId), itemId);
    }
  }

  return next;
}

function migrateLegacyV2Equipment(state: LegacyV2EquipmentState): EquipmentState {
  const next = createEmptyEquipmentState();
  if (state.actionBar.primary === WOOD_AXE_ITEM_ID || state.equippedRightHand === WOOD_AXE_ITEM_ID) {
    next.equipped.mainHand = WOOD_AXE_ITEM_ID;
  } else if (state.inventoryItems.slot4 === WOOD_AXE_ITEM_ID) {
    next.inventoryItems.slot4 = WOOD_AXE_ITEM_ID;
  }
  next.inventoryItems.slot5 = SHIELD_ITEM_ID;
  next.inventoryItems.slot6 = TORCH_ITEM_ID;
  return normalizeEquipment(next);
}

function migrateLegacyV3Equipment(state: LegacyV3EquipmentState): EquipmentState {
  const next = createEmptyEquipmentState();
  next.equipped.mainHand = state.equipped.mainHand;
  next.equipped.offHand = state.equipped.offHand;
  next.inventoryItems.slot4 = state.inventoryItems.slot4;
  next.inventoryItems.slot5 = state.inventoryItems.slot5;
  next.inventoryItems.slot6 = TORCH_ITEM_ID;
  return normalizeEquipment(next);
}

export function getEquipmentSlotRefForEquipSlot(slotId: EquipSlotId): EquipmentSlotRef {
  return slotId === "main_hand" ? "equipped_main_hand" : "equipped_off_hand";
}

export function getAttachmentSocketForEquipSlot(slotId: EquipSlotId): AttachmentSocketId {
  return slotId === "main_hand" ? "right_hand" : "left_hand";
}

export function isEquipmentSlotCompatible(
  itemId: EquippableItemId,
  slot: EquipmentSlotRef,
): boolean {
  if (slot === "inventory_slot_4" || slot === "inventory_slot_5" || slot === "inventory_slot_6") return true;
  return getEquipmentSlotRefForEquipSlot(EQUIPPABLE_ITEMS[itemId].allowedEquipSlot) === slot;
}

export function getEquippableItemSocketTransform(
  itemId: EquippableItemId,
  socketId: AttachmentSocketId,
  playableVariant: PlayableCharacterId,
): ItemSocketTransform | null {
  const itemDef = EQUIPPABLE_ITEMS[itemId];
  if (!itemDef) return null;
  const byVariant = itemDef.socketTransforms[socketId];
  return cloneItemSocketTransform(byVariant[playableVariant] ?? byVariant.default);
}

export function getEquippableItemDefaultSocketByVariant(
  itemId: EquippableItemId,
  socketId: AttachmentSocketId,
): ItemSocketTransformByVariant | null {
  const itemDef = EQUIPPABLE_ITEMS[itemId];
  if (!itemDef) return null;
  return cloneItemSocketTransformByVariant(itemDef.socketTransforms[socketId]);
}

export function getAttachmentLoadoutFromEquipment(state: EquipmentState): AttachmentLoadout {
  const loadout: AttachmentLoadout = { ...DEFAULT_ATTACHMENT_LOADOUT };
  loadout.right_hand = state.equipped.mainHand;
  loadout.left_hand = state.equipped.offHand;
  for (const slot of ["slot4", "slot5", "slot6"] as const) {
    const itemId = state.inventoryItems[slot];
    if (!itemId) continue;
    const itemDef = EQUIPPABLE_ITEMS[itemId];
    if (loadout[itemDef.stowSocket] != null) continue;
    loadout[itemDef.stowSocket] = itemId;
  }
  return loadout;
}

export function getRenderableAttachmentLoadout(
  state: EquipmentState,
  playableVariant: PlayableCharacterId,
): AttachmentLoadout {
  const loadout = getAttachmentLoadoutFromEquipment(state);
  if (playableVariant !== "fight_man" && state.equipped.offHand) {
    const offHandItemId = state.equipped.offHand;
    const itemDef = EQUIPPABLE_ITEMS[offHandItemId];
    loadout.left_hand = null;
    loadout[itemDef.stowSocket] = offHandItemId;
  }
  return loadout;
}

export function isEquippableItemCombatItem(itemId: EquippableItemId | null | undefined): boolean {
  if (!itemId) return false;
  return Boolean(EQUIPPABLE_ITEMS[itemId]?.combatItem);
}

export function hasEquippedCombatItem(
  value: EquipmentState | EquippedItemSlots,
): boolean {
  if ("equipped" in value) {
    return (
      isEquippableItemCombatItem(value.equipped.mainHand) ||
      isEquippableItemCombatItem(value.equipped.offHand)
    );
  }
  return isEquippableItemCombatItem(value.mainHand) || isEquippableItemCombatItem(value.offHand);
}

export function hydrateEquipment(): EquipmentState {
  if (typeof window === "undefined") return cloneEquipment(DEFAULT_EQUIPMENT);
  const nextRaw = window.localStorage.getItem(EQUIPMENT_STORAGE_KEY);
  if (nextRaw) {
    try {
      const parsed = JSON.parse(nextRaw) as unknown;
      if (isValidEquipment(parsed)) {
        return normalizeEquipment(parsed);
      }
    } catch {
      // Fall back to defaults or legacy state below.
    }
  }

  const legacyV3Raw = window.localStorage.getItem(LEGACY_EQUIPMENT_STORAGE_KEY_V3);
  if (legacyV3Raw) {
    try {
      const parsed = JSON.parse(legacyV3Raw) as unknown;
      if (isValidLegacyV3Equipment(parsed)) {
        return migrateLegacyV3Equipment(parsed);
      }
    } catch {
      // Fall through to older legacy state.
    }
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_EQUIPMENT_STORAGE_KEY_V2);
  if (!legacyRaw) return cloneEquipment(DEFAULT_EQUIPMENT);
  try {
    const parsed = JSON.parse(legacyRaw) as unknown;
    if (!isValidLegacyV2Equipment(parsed)) {
      return cloneEquipment(DEFAULT_EQUIPMENT);
    }
    return migrateLegacyV2Equipment(parsed);
  } catch {
    return cloneEquipment(DEFAULT_EQUIPMENT);
  }
}

export function persistEquipment(equipment: EquipmentState): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeEquipment(equipment);
  window.localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(normalized));
  window.localStorage.removeItem(LEGACY_EQUIPMENT_STORAGE_KEY_V3);
  window.localStorage.removeItem(LEGACY_EQUIPMENT_STORAGE_KEY_V2);
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
  if (!sourceItem || targetItem || !isEquipmentSlotCompatible(sourceItem, to)) {
    return equipment;
  }
  setSlotValue(next, from, null);
  setSlotValue(next, to, sourceItem);
  return normalizeEquipment(next);
}
