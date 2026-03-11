import type { AssetKey } from "../types";

export const TILE_UNIT_SIZE = 1;

export const TILE_3D_MODELS: Record<string, string> = {
  grass: "/ingame_assets/3d/GrassIsland.glb",
  pathCross: "/ingame_assets/3d/IslandStonePath.glb",
  pathStraight: "/ingame_assets/3d/IslandStoneStraight.glb",
  mine: "/ingame_assets/3d/MiningIsland.glb",
  tree: "/ingame_assets/3d/oak_red_berry_Tile.glb",
  dirt: "/ingame_assets/3d/DirtTile.glb",
  treeMiddle: "/ingame_assets/3d/TreeMiddle.glb",
  farm2x2: "/ingame_assets/3d/Farm2_2.glb",
  poisFarming: "/ingame_assets/3d/POIs_Farming.glb",
  grasBlumen: "/ingame_assets/3d/GrasBlumenTile.glb",
  taverne: "/ingame_assets/3d/TaverneIsland.glb",
  floatingForge: "/ingame_assets/3d/Floating_Forge.glb",
  farmingChicken: "/ingame_assets/3d/Farming_Chicken.glb",
  bushTile: "/ingame_assets/3d/BushTile.glb",
  statueAaron: "/ingame_assets/3d/Statue_Aaron.glb",
};

const ASSET_KEY_TO_MODEL: Record<AssetKey, string> = {
  base: "grass",
  baseV2: "grass",
  baseV4: "grass",
  baseV7: "grass",
  grass: "grass",
  grassV2: "grass",
  grassV4: "grass",

  pathCross: "pathCross",
  pathCrossV2: "pathCross",

  pathStraight: "pathStraight",
  pathStraightV4: "pathStraight",
  pathStraightV5: "pathStraight",
  pathStraightV6: "pathStraight",
  pathStraightAlt: "pathStraight",
  pathStraightAltV4: "pathStraight",
  pathStraightAltV5: "pathStraight",

  tree1: "tree",
  tree1V3: "tree",
  tree2: "tree",
  tree2V0: "tree",
  tree2V1: "tree",

  mineTile: "mine",
  mineTileV2: "mine",

  farmEmpty: "grass",
  farmSlot: "grass",
  farmHalf: "grass",
  farmFull: "grass",
  farmPath: "pathStraight",
  farmPathCross: "pathCross",
  farmPathStraight: "pathStraight",
  farmPathUp: "pathStraight",
  farmPathDown: "pathStraight",
  farmPoi: "mine",

  dirt: "dirt",
  treeMiddle: "treeMiddle",
  farm2x2: "farm2x2",
  poisFarming: "poisFarming",
  grasBlumen: "grasBlumen",
  taverne: "taverne",
  floatingForge: "floatingForge",
  farmingChicken: "farmingChicken",
  bushTile: "bushTile",
  statueAaron: "statueAaron",
};

export function getModelKeyForAsset(assetKey: AssetKey): string {
  return ASSET_KEY_TO_MODEL[assetKey] ?? "grass";
}

export function getModelPath(modelKey: string): string {
  return TILE_3D_MODELS[modelKey] ?? TILE_3D_MODELS.grass;
}

export function getModelPathForAsset(assetKey: AssetKey): string {
  return getModelPath(getModelKeyForAsset(assetKey));
}

export const ALL_MODEL_PATHS = Object.values(TILE_3D_MODELS);

export const MINING_MAN_MODELS = {
  base: "/ingame_assets/3d/Mining_Man/Meshy_AI_Character_output.glb",
  walk: "/ingame_assets/3d/Mining_Man/Walking_withSkin.glb",
  attack: "/ingame_assets/3d/Mining_Man/Attack_withSkin.glb",
  talk: "/ingame_assets/3d/Mining_Man/Talk_with_Left_Hand_Raised_withSkin.glb",
};

export const CHAR_3D_MODELS = {
  base: "/ingame_assets/3d/Main_Char/Meshy_AI_Character_output.glb",
  idle: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Idle_8_withSkin.glb",
  idle2: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Idle_13_withSkin.glb",
  walk: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Walking_withSkin.glb",
  run: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Running_withSkin.glb",
  skill: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Skill_03_withSkin.glb",
  alert: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Alert_withSkin.glb",
  jump: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Jump_Over_Obstacle_2_withSkin.glb",
  spell: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Charged_Spell_Cast_2_withSkin.glb",
  roll: "/ingame_assets/3d/Main_Char/Meshy_AI_Animation_Roll_Dodge_1_withSkin.glb",
};
