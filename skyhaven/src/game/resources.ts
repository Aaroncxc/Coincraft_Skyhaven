import type { ActionType, AssetKey, FocusDuration, ResourceAmount, ResourceId } from "./types";

/** Rewards per action type and duration: ore, wheat, wood only */
export const SESSION_REWARDS: Record<ActionType, Partial<Record<FocusDuration, Partial<Record<ResourceId, number>>>>> = {
  mining: {
    30: { ore: 5 },
    60: { ore: 12 },
    120: { ore: 28 },
  },
  farming: {
    30: { wheat: 6 },
    60: { wheat: 14 },
    120: { wheat: 32 },
  },
  roaming: {
    30: { wood: 2 },
    60: { wood: 5 },
    120: { wood: 12 },
  },
  cooking: {
    30: { wood: 3 },
    60: { wood: 7 },
    120: { wood: 16 },
  },
  woodcutting: {
    15: { wood: 3 },
  },
  harvesting: {
    15: { wheat: 4 },
  },
};

export const SESSION_EXP_REWARDS: Partial<Record<FocusDuration, number>> = {
  15: 25,
  30: 40,
  60: 90,
  120: 210,
};

function getResourceMultiplierForLevel(level: number): number {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.trunc(level)) : 1;
  const rawMultiplier = 1 + 0.12 * (safeLevel - 1);

  if (rawMultiplier <= 3.0) {
    return rawMultiplier;
  }

  return 3.0 + (1.0 - Math.exp(-(rawMultiplier - 3.0) / 1.2));
}

/** Tile placement costs: ore, wheat, wood only */
export const TILE_RECIPES: Array<{ tileType: AssetKey; cost: ResourceAmount[] }> = [
  { tileType: "base", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "baseV2", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "baseV4", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "baseV7", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "grass", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "grassV2", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "grassV4", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathCross", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "pathCrossV2", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "pathStraight", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathStraightV4", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathStraightV5", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathStraightV6", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathStraightAlt", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathStraightAltV4", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "pathStraightAltV5", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "ancientStone", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "ancientStoneWall", cost: [{ resourceId: "wood", amount: 3 }] },
  { tileType: "ancientCornerWall", cost: [{ resourceId: "wood", amount: 3 }] },
  { tileType: "tree1", cost: [{ resourceId: "wood", amount: 3 }] },
  { tileType: "tree1V3", cost: [{ resourceId: "wood", amount: 3 }] },
  { tileType: "treeMiddle", cost: [{ resourceId: "wood", amount: 3 }] },
  { tileType: "tree2", cost: [{ resourceId: "wood", amount: 5 }] },
  { tileType: "tree2V0", cost: [{ resourceId: "wood", amount: 5 }] },
  { tileType: "tree2V1", cost: [{ resourceId: "wood", amount: 5 }] },
  { tileType: "farmSlot", cost: [{ resourceId: "wheat", amount: 2 }, { resourceId: "wood", amount: 1 }] },
  { tileType: "farmEmpty", cost: [{ resourceId: "wheat", amount: 1 }, { resourceId: "wood", amount: 1 }] },
  { tileType: "farmHalf", cost: [{ resourceId: "wheat", amount: 3 }, { resourceId: "wood", amount: 2 }] },
  { tileType: "farmFull", cost: [{ resourceId: "wheat", amount: 4 }, { resourceId: "wood", amount: 2 }] },
  { tileType: "farmPath", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "farmPathCross", cost: [{ resourceId: "wood", amount: 3 }] },
  { tileType: "farmPathStraight", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "farmPathUp", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "farmPathDown", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "farmPoi", cost: [{ resourceId: "ore", amount: 5 }, { resourceId: "wood", amount: 10 }, { resourceId: "wheat", amount: 4 }] },
  { tileType: "mineTile", cost: [{ resourceId: "ore", amount: 8 }, { resourceId: "wood", amount: 10 }] },
  { tileType: "mineTileV2", cost: [{ resourceId: "ore", amount: 8 }, { resourceId: "wood", amount: 10 }] },
  { tileType: "farm2x2", cost: [{ resourceId: "wheat", amount: 6 }, { resourceId: "wood", amount: 4 }] },
  { tileType: "poisFarming", cost: [{ resourceId: "ore", amount: 5 }, { resourceId: "wood", amount: 10 }, { resourceId: "wheat", amount: 4 }] },
  { tileType: "grasBlumen", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "taverne", cost: [{ resourceId: "ore", amount: 10 }, { resourceId: "wood", amount: 15 }, { resourceId: "wheat", amount: 8 }] },
  { tileType: "floatingForge", cost: [{ resourceId: "ore", amount: 12 }, { resourceId: "wood", amount: 10 }, { resourceId: "wheat", amount: 4 }] },
  { tileType: "farmingChicken", cost: [{ resourceId: "wheat", amount: 10 }, { resourceId: "wood", amount: 8 }, { resourceId: "ore", amount: 3 }] },
  { tileType: "bushTile", cost: [{ resourceId: "wood", amount: 2 }] },
  { tileType: "dirt", cost: [{ resourceId: "wood", amount: 1 }] },
  { tileType: "statueAaron", cost: [{ resourceId: "ore", amount: 8 }, { resourceId: "wood", amount: 5 }] },
  { tileType: "magicTower", cost: [{ resourceId: "ore", amount: 10 }, { resourceId: "wood", amount: 12 }, { resourceId: "wheat", amount: 6 }] },
  { tileType: "wellTile", cost: [{ resourceId: "ore", amount: 6 }, { resourceId: "wood", amount: 4 }] },
  { tileType: "well2Tile", cost: [{ resourceId: "ore", amount: 6 }, { resourceId: "wood", amount: 4 }] },
  { tileType: "halfGrownCropTile", cost: [{ resourceId: "wheat", amount: 4 }, { resourceId: "wood", amount: 2 }] },
];

export function getSessionRewards(
  actionType: ActionType,
  durationMin: FocusDuration
): ResourceAmount[] {
  const byDuration = SESSION_REWARDS[actionType];
  if (!byDuration) return [];
  const rewards = byDuration[durationMin];
  if (!rewards) return [];
  return Object.entries(rewards)
    .filter(([, amount]) => amount > 0)
    .map(([resourceId, amount]) => ({ resourceId: resourceId as ResourceId, amount: amount as number }));
}

export function getTileRecipe(tileType: AssetKey): ResourceAmount[] | null {
  const recipe = TILE_RECIPES.find((r) => r.tileType === tileType);
  return recipe ? recipe.cost : null;
}

export function getSessionExp(durationMin: FocusDuration): number {
  return SESSION_EXP_REWARDS[durationMin] ?? 0;
}

export function scaleRewardsForLevel(rewards: ResourceAmount[], level: number): ResourceAmount[] {
  if (rewards.length === 0) {
    return rewards;
  }

  const multiplier = getResourceMultiplierForLevel(level);

  return rewards.map((reward) => {
    const baseAmount = Math.max(0, Math.trunc(reward.amount));
    const scaledAmount = Math.max(baseAmount, Math.round(baseAmount * multiplier));
    return {
      resourceId: reward.resourceId,
      amount: scaledAmount,
    };
  });
}
