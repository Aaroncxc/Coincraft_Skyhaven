export type ActionType = "mining" | "farming" | "roaming" | "cooking" | "woodcutting" | "harvesting";

export type ResourceId = "ore" | "wheat" | "wood";

export type ResourceAmount = { resourceId: ResourceId; amount: number };

export type TileRecipe = {
  tileType: AssetKey;
  cost: ResourceAmount[];
};

export type FocusDuration = 15 | 30 | 60 | 120;

export type IslandId = "mining" | "farming" | "custom";

export type AssetKey =
  | "base"
  | "baseV2"
  | "baseV4"
  | "baseV7"
  | "grass"
  | "grassV2"
  | "grassV4"
  | "pathCross"
  | "pathCrossV2"
  | "pathStraight"
  | "pathStraightV4"
  | "pathStraightV5"
  | "pathStraightV6"
  | "pathStraightAlt"
  | "pathStraightAltV4"
  | "pathStraightAltV5"
  | "tree1"
  | "tree1V3"
  | "tree2"
  | "tree2V0"
  | "tree2V1"
  | "mineTile"
  | "mineTileV2"
  | "farmEmpty"
  | "farmSlot"
  | "farmHalf"
  | "farmFull"
  | "farmPath"
  | "farmPathCross"
  | "farmPathStraight"
  | "farmPathUp"
  | "farmPathDown"
  | "farmPoi"
  | "dirt"
  | "treeMiddle"
  | "farm2x2"
  | "poisFarming"
  | "grasBlumen"
  | "taverne"
  | "floatingForge"
  | "farmingChicken"
  | "bushTile"
  | "statueAaron";

export const TREE_TILES: readonly AssetKey[] = ["treeMiddle"];
export const FARM_TILES: readonly AssetKey[] = ["farm2x2"];
export const MINE_TILES: readonly AssetKey[] = ["mineTile", "mineTileV2"];
export const DECORATION_TILES: readonly AssetKey[] = ["statueAaron"];
export const NO_DECORATION_TILES: readonly AssetKey[] = [
  "mineTile", "mineTileV2", "farmPoi", "poisFarming",
  "farm2x2", "farmSlot", "farmHalf", "farmFull", "farmEmpty",
  "tree1", "tree1V3", "tree2", "tree2V0", "tree2V1", "treeMiddle",
];

export type PomodoroPhase = "work" | "break" | "longBreak";

export type FocusSession = {
  active: boolean;
  actionType: ActionType;
  startedAt: number;
  endsAt: number;
  durationMin: FocusDuration;
  pomodoroMode?: boolean;
  pomodoroRound?: number;
  pomodoroTotalRounds?: number;
  pomodoroPhase?: PomodoroPhase;
};

export type ProgressionState = {
  level: number;
  expInLevel: number;
  totalExp: number;
};

export type TileDef = {
  id: string;
  gx: number;
  gy: number;
  type: AssetKey;
  /** Override manifest layerOrder for draw order */
  layerOrder?: number;
  /** Override manifest localYOffset for depth sorting */
  localYOffset?: number;
  /** Override manifest anchorY for vertical position */
  anchorY?: number;
  /** Pixel offset for placement (shift tile left/right, up/down) */
  offsetX?: number;
  offsetY?: number;
  /** 3D position override set via debug gizmo */
  pos3d?: { x: number; y: number; z: number };
  /** 3D scale override set via debug gizmo */
  scale3d?: { x: number; y: number; z: number };
  /** Y-axis rotation in radians (multiples of π/2) */
  rotY?: number;
  /** If true, the player controller cannot walk onto this tile */
  blocked?: boolean;
  /** Decoration model placed on top of this tile */
  decoration?: AssetKey;
  /** Decoration 3D position offset (local to tile surface) */
  decoPos3d?: { x: number; y: number; z: number };
  /** Decoration 3D scale override */
  decoScale3d?: { x: number; y: number; z: number };
  /** Decoration Y-axis rotation in radians */
  decoRotY?: number;
};

export type PoiDef = {
  id: string;
  gx: number;
  gy: number;
  kind: "mine";
  interactRadius: number;
};

export type IslandMap = {
  tileW: number;
  tileH: number;
  tiles: TileDef[];
  poi: PoiDef[];
  spawn: {
    gx: number;
    gy: number;
  };
};

export type TileSpringState = {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
};

export type SpriteMeta = {
  src: string;
  drawW: number;
  drawH: number;
  anchorX: number;
  anchorY: number;
  /** Draw order layer: 0=ground, 100=path, 200=prop, 300=poi */
  layerOrder?: number;
  /** Y-offset for depth sorting; taller tiles (trees, POIs) use positive values to render in front */
  localYOffset?: number;
  /** Multi-cell span (e.g. {w:2,h:2}); tile is drawn centered across these cells at 2x scale */
  gridSpan?: { w: number; h: number };
};

export type CharacterDirection = "left" | "right";

export type CharacterPose = {
  gx: number;
  gy: number;
  direction: CharacterDirection;
  frameIndex: number;
};

export type CharacterSpriteSet = {
  walkLeft: string[];
  walkRight: string[];
  fps: number;
  drawW: number;
  drawH: number;
  anchorX: number;
  anchorY: number;
};

export type UiSpriteManifest = {
  background: string;
  border: string;
  compactBackground?: string;
  compactBorder?: string;
  compactStateBase?: string;
  compactStateInventory?: string;
  compactInventoryPanel?: string;
  compactInventoryHeader?: string;
  compactInventoryTab?: string;
  compactInventorySlot?: string;
  sidebarButtonBg: string;
  focusPanelBg: string;
  islandsPanelBg?: string;
  islandsArrowLeft?: string;
  islandsArrowRight?: string;
  labels: {
    mainMenu: string;
    inventory: string;
    focusActions: string;
    shop: string;
    islands?: string;
    options: string;
    baukasten?: string;
  };
  statusBg: string;
  bars: {
    expTrack: string;
    expFill: string;
    staminaTrack: string;
    staminaFill: string;
  };
  chrome: {
    closeCircle: string;
    closeLine1: string;
    closeLine2: string;
    expandCircle: string;
    expandArrow: string;
    menuFrame: string;
    menuCap: string;
    menuLineH: string;
    menuLineV: string;
    menuInnerH: string;
    menuInnerV: string;
  };
};

export type IslandRect = {
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
};

export type GridAnchor = {
  gx: number;
  gy: number;
  xRatio: number;
  yRatio: number;
};

export type GridStep = {
  xRatio: number;
  yRatio: number;
};

export type GridDiamond = {
  halfWRatio: number;
  halfHRatio: number;
};

export type GridCalibration = {
  origin: GridAnchor;
  stepGX: GridStep;
  stepGY: GridStep;
  diamond: GridDiamond;
};

export type SpriteManifest = {
  tile: Record<AssetKey, SpriteMeta>;
  poi: {
    mine: SpriteMeta;
  };
  characters: {
    main: CharacterSpriteSet;
  };
  island: {
    complete: SpriteMeta;
  };
  ui: UiSpriteManifest;
  scene: {
    centerXRatio: number;
    centerYRatio: number;
    compactCenterXRatio?: number;
    compactCenterYRatio?: number;
    islandRect?: IslandRect;
    gridCalibration?: GridCalibration;
    debugGridSrc?: string;
  };
};

export type Vec2 = {
  x: number;
  y: number;
};

export type CalibratedMetrics = {
  origin: { gx: number; gy: number; x: number; y: number };
  stepGX: { x: number; y: number };
  stepGY: { x: number; y: number };
  diamond: { halfW: number; halfH: number };
  inverse: {
    m11: number;
    m12: number;
    m21: number;
    m22: number;
  };
};
