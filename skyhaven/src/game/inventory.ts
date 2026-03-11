import type { ResourceAmount, ResourceId } from "./types";

export const INVENTORY_STORAGE_KEY = "skyhaven.inventory.v2";

export type Inventory = Record<ResourceId, number>;

const DEFAULT_INVENTORY: Inventory = {
  ore: 0,
  wheat: 0,
  wood: 0,
};

/** Start with resources so the builder can be used immediately */
const START_INVENTORY: Inventory = {
  ore: 5,
  wheat: 5,
  wood: 10,
};

function isValidInventory(value: unknown): value is Inventory {
  if (!value || typeof value !== "object") return false;
  const keys: ResourceId[] = ["ore", "wheat", "wood"];
  for (const key of keys) {
    const val = (value as Record<string, unknown>)[key];
    if (typeof val !== "number" || val < 0 || !Number.isInteger(val)) return false;
  }
  return true;
}

function totalResources(inv: Inventory): number {
  return inv.ore + inv.wheat + inv.wood;
}

export function hydrateInventory(): Inventory {
  if (typeof window === "undefined") return { ...START_INVENTORY };
  const raw = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
  if (!raw) return { ...START_INVENTORY };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidInventory(parsed)) return { ...START_INVENTORY };
    const merged = { ...DEFAULT_INVENTORY, ...parsed };
    if (totalResources(merged) === 0) return { ...START_INVENTORY };
    return merged;
  } catch {
    return { ...START_INVENTORY };
  }
}

export function persistInventory(inventory: Inventory): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory));
}

/** Reset inventory to starter resources (e.g. after clearing save) */
export function resetInventoryToStarter(): Inventory {
  const inv = { ...START_INVENTORY };
  persistInventory(inv);
  return inv;
}

/** Debug: add resources for testing (ore, wheat, wood) */
export function addDebugResources(inventory: Inventory, amount = 5): Inventory {
  const next = {
    ...inventory,
    ore: (inventory.ore ?? 0) + amount,
    wheat: (inventory.wheat ?? 0) + amount,
    wood: (inventory.wood ?? 0) + amount,
  };
  persistInventory(next);
  return next;
}

export function grantResources(
  inventory: Inventory,
  amounts: ResourceAmount[]
): Inventory {
  const next = { ...inventory };
  for (const { resourceId, amount } of amounts) {
    next[resourceId] = (next[resourceId] ?? 0) + amount;
  }
  return next;
}

export function canAfford(inventory: Inventory, cost: ResourceAmount[]): boolean {
  for (const { resourceId, amount } of cost) {
    if ((inventory[resourceId] ?? 0) < amount) return false;
  }
  return true;
}

export function spendResources(
  inventory: Inventory,
  cost: ResourceAmount[]
): Inventory | null {
  if (!canAfford(inventory, cost)) return null;
  const next = { ...inventory };
  for (const { resourceId, amount } of cost) {
    next[resourceId] = (next[resourceId] ?? 0) - amount;
  }
  return next;
}
