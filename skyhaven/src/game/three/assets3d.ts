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
  torchDecoration: "/ingame_assets/3d/Torch_Decoration.glb",
  magicTower: "/ingame_assets/3d/MagicTowerTile_POI.glb",
  wellTile: "/ingame_assets/3d/Ancient_Stone_Well_Tile.glb",
  well2Tile: "/ingame_assets/3d/Well2_Tile.glb",
  halfGrownCropTile: "/ingame_assets/3d/Half_grown3D_Crop_Tile.glb",
  cottaTile: "/ingame_assets/3d/Cotta_Tile.glb",
  ancientTempleTile: "/ingame_assets/3d/ancientTemple_Tile.glb",
  kaserneTile: "/ingame_assets/3d/Kaserne1_Tile.glb",
  runeTile: "/ingame_assets/3d/Rune_tile.glb",
  airShipPort: "/ingame_assets/3d/AirCraftShip/AnlegeStelleAirShip.glb",
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
  torchDecoration: "torchDecoration",
  magicTower: "magicTower",
  wellTile: "wellTile",
  well2Tile: "well2Tile",
  halfGrownCropTile: "halfGrownCropTile",
  cottaTile: "cottaTile",
  ancientTempleTile: "ancientTempleTile",
  kaserneTile: "kaserneTile",
  runeTile: "runeTile",
  airShipPort: "airShipPort",
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

export const ENEMY_ROBOT_MODELS = {
  base: "/ingame_assets/3d/EnemyRobot/Meshy_AI_First_Enemy_biped_Character_output.glb",
  walk: "/ingame_assets/3d/EnemyRobot/Meshy_AI_First_Enemy_biped_Animation_Walking_withSkin.glb",
  attack: "/ingame_assets/3d/EnemyRobot/Meshy_AI_First_Enemy_biped_Animation_Charged_Upward_Slash_withSkin.glb",
} as const;

const FIGHT_MAN_SWORD_DIR = "/ingame_assets/3d/Fight_Man_Real/Main_Movement/FBX";
const FIGHT_MAN_ADV_DIR = "/ingame_assets/3d/Fight_Man_Real/Main_Movement/FBX_Adventure";

/** Sword-and-shield animation set (active when axe is equipped). */
export const FIGHT_MAN_SWORD_MODELS = {
  base: `${FIGHT_MAN_SWORD_DIR}/Meshy_AI_mainy_0321192423_texture.fbx`,
  idle0: `${FIGHT_MAN_SWORD_DIR}/sword and shield idle.fbx`,
  walk: `${FIGHT_MAN_SWORD_DIR}/Sword And Shield Walk.fbx`,
  walkBack: `${FIGHT_MAN_SWORD_DIR}/Sword And Shield Walk Backwards.fbx`,
  strafeWalkL: `${FIGHT_MAN_SWORD_DIR}/sword and shield strafe.fbx`,
  strafeWalkR: `${FIGHT_MAN_SWORD_DIR}/sword and shield strafe (2).fbx`,
  run: `${FIGHT_MAN_SWORD_DIR}/sword and shield run.fbx`,
  runBack: `${FIGHT_MAN_SWORD_DIR}/Sword And Shield Run Back.fbx`,
  strafeRunL: `${FIGHT_MAN_SWORD_DIR}/sword and shield run.fbx`,
  strafeRunR: `${FIGHT_MAN_SWORD_DIR}/sword and shield run (2).fbx`,
  turn90L: `${FIGHT_MAN_SWORD_DIR}/sword and shield turn.fbx`,
  turn90R: `${FIGHT_MAN_SWORD_DIR}/sword and shield turn (2).fbx`,
  attack1: `${FIGHT_MAN_SWORD_DIR}/sword and shield attack.fbx`,
  attack2: `${FIGHT_MAN_SWORD_DIR}/sword and shield attack (2).fbx`,
  attack3: `${FIGHT_MAN_SWORD_DIR}/sword and shield attack (3).fbx`,
  chop: `${FIGHT_MAN_SWORD_DIR}/sword and shield attack (4).fbx`,
  /** Legacy aliases kept so existing references stay valid during migration. */
  attack: `${FIGHT_MAN_SWORD_DIR}/sword and shield attack.fbx`,
  skill: `${FIGHT_MAN_SWORD_DIR}/sword and shield attack (2).fbx`,
  block: `${FIGHT_MAN_SWORD_DIR}/sword and shield block.fbx`,
  blockIdle: `${FIGHT_MAN_SWORD_DIR}/sword and shield block idle.fbx`,
  spell: `${FIGHT_MAN_SWORD_DIR}/draw sword 1.fbx`,
  roll: `${FIGHT_MAN_SWORD_DIR}/sword and shield turn.fbx`,
  /** Same Mixamo jump as adventure set; sword pack has no dedicated jump FBX. */
  jump: `${FIGHT_MAN_ADV_DIR}/jumping up.fbx`,
  fallIdle: `${FIGHT_MAN_ADV_DIR}/falling idle.fbx`,
  landing: `${FIGHT_MAN_ADV_DIR}/Falling To Landing.fbx`,
  climbWall: `${FIGHT_MAN_ADV_DIR}/Climbing Up Wall.fbx`,
  climbTop: `${FIGHT_MAN_ADV_DIR}/Climbing To Top.fbx`,
  /** TPS RMB look: head-friendly idle (same path as adventure set). */
  rmbLook: `${FIGHT_MAN_ADV_DIR}/idleHeadMove.fbx`,
} as const;

/** Torch-carry locomotion clips (used when the torch is equipped in the main hand). */
export const FIGHT_MAN_TORCH_MODELS = {
  walk: `${FIGHT_MAN_ADV_DIR}/Standing Torch Walk Forward.fbx`,
  run: `${FIGHT_MAN_ADV_DIR}/Standing Torch Run Forward.fbx`,
} as const;

/** Adventure animation set (default, no weapon). idle (2).fbx excluded (corrupt). Second idles omitted for consistent foot height vs walk. */
export const FIGHT_MAN_ADV_MODELS = {
  base: `${FIGHT_MAN_ADV_DIR}/Meshy_AI_mainy_0321192423_texture.fbx`,
  idle0: `${FIGHT_MAN_ADV_DIR}/idle.fbx`,
  rmbLook: `${FIGHT_MAN_ADV_DIR}/idleHeadMove.fbx`,
  walk: `${FIGHT_MAN_ADV_DIR}/walking.fbx`,
  strafeWalkL: `${FIGHT_MAN_ADV_DIR}/Left Strafe Walking.fbx`,
  strafeWalkR: `${FIGHT_MAN_ADV_DIR}/Right Strafe Walking.fbx`,
  run: `${FIGHT_MAN_ADV_DIR}/running.fbx`,
  strafeRunL: `${FIGHT_MAN_ADV_DIR}/Left Strafe.fbx`,
  strafeRunR: `${FIGHT_MAN_ADV_DIR}/Right Strafe.fbx`,
  turn90L: `${FIGHT_MAN_ADV_DIR}/left turn.fbx`,
  turn90R: `${FIGHT_MAN_ADV_DIR}/right turn.fbx`,
  jump: `${FIGHT_MAN_ADV_DIR}/jumping up.fbx`,
  fallIdle: `${FIGHT_MAN_ADV_DIR}/falling idle.fbx`,
  landing: `${FIGHT_MAN_ADV_DIR}/Falling To Landing.fbx`,
  climbWall: `${FIGHT_MAN_ADV_DIR}/Climbing Up Wall.fbx`,
  climbTop: `${FIGHT_MAN_ADV_DIR}/Climbing To Top.fbx`,
  roll: `${FIGHT_MAN_ADV_DIR}/falling to roll.fbx`,
  spell: `${FIGHT_MAN_ADV_DIR}/stand to cover.fbx`,
} as const;

export const FIGHT_MAN_ADV_IDLE_COUNT = 1;
export const FIGHT_MAN_SWORD_IDLE_COUNT = 1;

/** Sword-only unique URLs (NPC + preload). */
export const FIGHT_MAN_SWORD_FBX_URLS: string[] = Array.from(new Set(Object.values(FIGHT_MAN_SWORD_MODELS)));

/** Adventure-only unique URLs (animations only, excludes base mesh — playable shares sword base). */
export const FIGHT_MAN_ADV_FBX_URLS: string[] = Array.from(
  new Set(
    Object.entries(FIGHT_MAN_ADV_MODELS)
      .filter(([k]) => k !== "base")
      .map(([, v]) => v),
  ),
);

export const FIGHT_MAN_TORCH_FBX_URLS: string[] = Array.from(
  new Set(Object.values(FIGHT_MAN_TORCH_MODELS)),
);

/** All unique URLs for the playable model (sword + adventure animations). */
export const FIGHT_MAN_FBX_UNIQUE_URLS: string[] = Array.from(
  new Set([...FIGHT_MAN_SWORD_FBX_URLS, ...FIGHT_MAN_ADV_FBX_URLS, ...FIGHT_MAN_TORCH_FBX_URLS]),
);

/** Albedo for Aaron / fight_man (GLB often ships without embedded `map`; filename as on disk). */
export const FIGHT_MAN_ALBEDO_MAP =
  "/ingame_assets/3d/Fight_Man_Real/Fighting_Man_Terxture.png";

/** Shared albedo atlas for the playable character (overrides embedded GLB `map` in CharacterModel). */
export const MAIN_CHAR_ALBEDO_MAP = "/ingame_assets/3d/Main_Char/texture_0.png";

/** Wood axe prop (right hand). */
export const AXE_PROP_GLB = "/ingame_assets/3d/Waffen/Axt.glb";
export const SHIELD_PROP_GLB = "/ingame_assets/3d/Waffen/Shield.glb";
export const TORCH_PROP_GLB = "/ingame_assets/3d/Torch_Decoration.glb";

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

/** Every .glb used in the main island Canvas (tiles, player, NPCs, Skully). Fight Man uses FBX, not listed here. */
export const ALL_GAME_GLTF_PATHS = Array.from(
  new Set([
    ...ALL_MODEL_PATHS,
    ...Object.values(MINING_MAN_MODELS),
    ...Object.values(MAGIC_MAN_MODELS),
    ...Object.values(ENEMY_ROBOT_MODELS),
    ...Object.values(CHAR_3D_MODELS),
    SKULLY_MODEL_PATH,
    "/ingame_assets/3d/AirCraftShip/AirShipFirst.glb",
    AXE_PROP_GLB,
    SHIELD_PROP_GLB,
    TORCH_PROP_GLB,
    MAIN_CHAR_AXE_CHOP_ANIM_GLB,
    CLOUDS_GLB,
  ]),
);

/** Sword FBX plus torch locomotion are preloaded eagerly; full adventure pack stays on demand. */
export const ALL_GAME_FBX_PATHS: string[] = [...FIGHT_MAN_SWORD_FBX_URLS, ...FIGHT_MAN_TORCH_FBX_URLS];
