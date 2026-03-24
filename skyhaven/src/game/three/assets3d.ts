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
  ancientStone: "/ingame_assets/3d/AncientStone_Tile.glb",
  ancientStoneWall: "/ingame_assets/3d/AncientStoneWall_Tile.glb",
  ancientCornerWall: "/ingame_assets/3d/AncientCornerWall_Til.glb",
  statueAaron: "/ingame_assets/3d/Statue_Aaron.glb",
  magicTower: "/ingame_assets/3d/MagicTowerTile_POI.glb",
  wellTile: "/ingame_assets/3d/Ancient_Stone_Well_Tile.glb",
  well2Tile: "/ingame_assets/3d/Well2_Tile.glb",
  halfGrownCropTile: "/ingame_assets/3d/Half_grown3D_Crop_Tile.glb",
  cottaTile: "/ingame_assets/3d/Cotta_Tile.glb",
  ancientTempleTile: "/ingame_assets/3d/ancientTemple_Tile.glb",
  kaserneTile: "/ingame_assets/3d/Kaserne1_Tile.glb",
  runeTile: "/ingame_assets/3d/Rune_tile.glb",
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

  ancientStone: "ancientStone",
  ancientStoneWall: "ancientStoneWall",
  ancientCornerWall: "ancientCornerWall",

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
  magicTower: "magicTower",
  wellTile: "wellTile",
  well2Tile: "well2Tile",
  halfGrownCropTile: "halfGrownCropTile",
  cottaTile: "cottaTile",
  ancientTempleTile: "ancientTempleTile",
  kaserneTile: "kaserneTile",
  runeTile: "runeTile",
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

/** Skully companion (not in TILE_3D_MODELS). */
export const SKULLY_MODEL_PATH = "/ingame_assets/3d/Skully_Companion.glb";

export const MINING_MAN_MODELS = {
  base: "/ingame_assets/3d/Mining_Man/Meshy_AI_Character_output.glb",
  walk: "/ingame_assets/3d/Mining_Man/Walking_withSkin.glb",
  attack: "/ingame_assets/3d/Mining_Man/Attack_withSkin.glb",
  talk: "/ingame_assets/3d/Mining_Man/Talk_with_Left_Hand_Raised_withSkin.glb",
};

export const MAGIC_MAN_MODELS = {
  base: "/ingame_assets/3d/Magic_Man/Meshy_AI_biped/Meshy_AI_biped/Meshy_AI_Character_output.glb",
  walk: "/ingame_assets/3d/Magic_Man/Meshy_AI_biped/Meshy_AI_biped/Meshy_AI_Animation_Walking_withSkin.glb",
  idle: "/ingame_assets/3d/Magic_Man/Meshy_AI_biped/Meshy_AI_biped/Meshy_AI_Animation_Idle_11_withSkin.glb",
  zauber: "/ingame_assets/3d/Magic_Man/Meshy_AI_biped/Meshy_AI_biped/Meshy_AI_Animation_Call_Gesture_withSkin.glb",
};

export const FIGHT_MAN_MODELS = {
  base: "/ingame_assets/3d/Fight_Man_Real/Meshy_AI_mainy_biped/Meshy_AI_mainy_biped_Character_output.glb",
  /** Playable fight_man + fallback clip assembly. */
  anims: "/ingame_assets/3d/Fight_Man_Real/Meshy_AI_mainy_biped/Meshy_AI_mainy_biped_Meshy_AI_Meshy_Merged_Animations.glb",
  /** Shift-sprint for playable fight_man (separate GLB). */
  sprint: "/ingame_assets/3d/Fight_Man_Real/Meshy_AI_mainy_biped/fightman_sprint.glb",
  /** Fight Man NPC: patrol picks walk or counterstrike at random; E-interact plays taunt. */
  npcWalk: "/ingame_assets/3d/Fight_Man_Real/Meshy_AI_mainy_biped/Animation_Walking_withSkin.glb",
  npcCounterstrike: "/ingame_assets/3d/Fight_Man_Real/Meshy_AI_mainy_biped/Counterstrike_withSkin.glb",
  npcTaunt: "/ingame_assets/3d/Fight_Man_Real/Meshy_AI_mainy_biped/Chest_Pound_Taunt_withSkin.glb",
};

/** Shared albedo atlas for the playable character (overrides embedded GLB `map` in CharacterModel). */
export const MAIN_CHAR_ALBEDO_MAP = "/ingame_assets/3d/Main_Char/texture_0.png";

/** Wood axe prop (right hand). */
export const AXE_PROP_GLB = "/ingame_assets/3d/Waffen/Axt.glb";

/** Chop animation for default main character (same rig as base char). */
export const MAIN_CHAR_AXE_CHOP_ANIM_GLB = "/ingame_assets/3d/Main_Char/Axt_Schlag_Anim.glb";

/** Wall-clock chop length; must match `useCharacterMovement` chop timer and `pose.chopDuration`. */
export const AXE_CHOP_PLAYBACK_SEC = 0.92;

/** Volumetric-style cloud cards under islands (`IslandCloudDeck`, instanced). */
export const CLOUDS_GLB = "/ingame_assets/3d/Clouds.glb";

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

/** Every .glb used in the main island Canvas (tiles, player, NPCs, Skully). */
export const ALL_GAME_GLTF_PATHS = Array.from(
  new Set([
    ...ALL_MODEL_PATHS,
    ...Object.values(MINING_MAN_MODELS),
    ...Object.values(MAGIC_MAN_MODELS),
    ...Object.values(FIGHT_MAN_MODELS),
    ...Object.values(CHAR_3D_MODELS),
    SKULLY_MODEL_PATH,
    AXE_PROP_GLB,
    MAIN_CHAR_AXE_CHOP_ANIM_GLB,
    CLOUDS_GLB,
  ]),
);
