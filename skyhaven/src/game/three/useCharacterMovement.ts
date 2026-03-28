import { useRef, useEffect, useState, useMemo, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import { useFrame } from "@react-three/fiber";
import type { ActionType, AssetKey, FocusSession, IslandId, IslandMap } from "../types";
import { TREE_TILES, FARM_TILES } from "../types";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { buildPoiActionRequest, findNearbyPoiAction, type PoiActionRequest } from "../poiActions";
import { AXE_CHOP_PLAYBACK_SEC, TILE_UNIT_SIZE } from "./assets3d";
import { getPlayableAvatarGroundProfile } from "./avatarGrounding";
import {
  buildBlockedFootprintSet,
  findNearestValidCell,
  isAvatarCellValid,
  resolveReachableTargetValid,
} from "./islandWalkability";
import {
  buildIslandSurfaceData,
  canStepBetweenCells,
  FALL_RESET_MARGIN,
  getSurfaceYAtWorldGrid,
  getSupportedSurfaceYAtWorldGrid,
  resolveHorizontalCollision,
  type IslandSurfaceData,
} from "./islandSurface";
import type * as THREE from "three";
import { playPlayerFootstep } from "../playerFootstepSfx";
import { playAxeSwingSfx } from "../playerAxeSwingSfx";
import { WOOD_AXE_ITEM_ID, type EquippableItemId } from "../equipment";

export type CharacterPose3D = {
  gx: number;
  gy: number;
  surfaceY?: number;
  worldY?: number;
  verticalVelocity?: number;
  grounded?: boolean;
  direction: "left" | "right";
  animState: "idle" | "walk" | "run" | "jump" | "attack" | "chop" | "spell" | "roll";
  /** true when moving from WASD; false when patrol or idle (used so look direction follows mouse only on manual move) */
  isManualMove: boolean;
  /** Mouse-steering lateral move vs look (fight_man strafe clips); TPS / grid-cardinal uses "none". */
  locomotionStrafe?: "none" | "left" | "right";
  /** set during jump; used by CharacterModel for arc timing */
  jumpDuration?: number;
  /** set during roll; used by CharacterModel for clip timing */
  rollDuration?: number;
  /** set during axe chop; must match movement chop timer (see AXE_CHOP_PLAYBACK_SEC). */
  chopDuration?: number;
  /** Incremented on each new axe swing so `CharacterModel` can restart `chopAxe` when target clip unchanged. */
  chopSwingId?: number;
  /** when set, overrides direction-based rotation to face this angle (radians) */
  facingAngle?: number;
  /** Fight Man TPS: in-place turn toward camera (`adv_`/`sword_` turn90L/R clips). */
  fightManTurnStep?: "left" | "right";
  /** TPS: RMB / pointer-look active (`IslandCamera` steering); drives Fight Man `rmbLook` clip + head IK gating. */
  tpsRmbLook?: boolean;
};

export type CharacterMovementDebugSnapshot = {
  animState: CharacterPose3D["animState"];
  chopTimer: number;
  chopPlaybackSec: number;
  rollTimer: number;
  mouseForwardActive: boolean;
  steeringActive: boolean;
};

type MovementKeys = { w: boolean; a: boolean; s: boolean; d: boolean };
type ActionKeys = { shift: boolean; space: boolean };
type PatrolPhase = "inactive" | "walking" | "paused";

const MANUAL_GRID_SPEED = 1.2;
const MANUAL_RUN_GRID_SPEED = MANUAL_GRID_SPEED * 1.8;
const TPS_ACCEL = 10;
const TPS_DECEL = 14;
const TPS_STOP_EPSILON = 0.001;
const TPS_MOVE_ANIM_EPSILON = 0.03;
const PATROL_GRID_SPEED = 0.62;

/** Wood-axe swing WAV is loud vs. footsteps; applied after sidebar SFX 0–100. */
const AXE_SWING_SFX_GAIN = 0.36;
function axeSwingVolume01(playerSfxVolume: number): number {
  return (Math.max(0, Math.min(100, playerSfxVolume)) / 100) * AXE_SWING_SFX_GAIN;
}
const IDLE_AUTOPATROL_DELAY_SEC = 7;
const PATROL_PAUSE_MIN = 2;
const PATROL_PAUSE_MAX = 5;
const JUMP_DURATION = 0.52;
const GRAVITY = 8.4;
const LAND_SNAP_DISTANCE = 0.2;
const ROLL_DURATION = 0.96;
const ROLL_DISTANCE = 1.05;
const INPUT_STUCK_UNSTICK_SEC = 2.5;
const TPS_STUCK_VEL_EPS = 0.04;
const ISO_FRAME_MOVE_EPS = 0.002;

const FIGHT_MAN_TURN_CLIP_SEC = 0.55;
const FIGHT_MAN_TURN_COOLDOWN_SEC = 1.2;
/** Idle TPS: if |camera yaw − body yaw| exceeds this, play a step turn (radians ~64°). */
const FIGHT_MAN_TURN_DELTA_MIN_RAD = 1.12;

function wrapMovementAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}
/**
 * World-units between footstep SFX (travel distance × TILE_UNIT_SIZE).
 * Tuned to the default main-char walk/run GLB cadence (was ~0.44; sounded ~2× too fast).
 */
const FOOTSTEP_WALK_DIST_SCALE = 0.9;
const FOOTSTEP_RUN_DIST_SCALE = FOOTSTEP_WALK_DIST_SCALE * 0.72;
/** Applied after sidebar SFX 0–100 → 0–1 (half of the previous 0.62 trim). */
const FOOTSTEP_VOLUME_GAIN = 0.31;
/** Extra trim by camera: ortho / isometric very quiet; TPS full level. */
const FOOTSTEP_ISO_CAMERA_GAIN = 0.1;
/** TPS footsteps were much louder than iso; trim vs. sidebar SFX. */
const FOOTSTEP_TPS_CAMERA_GAIN = 0.42;

function resolveSpawn(island: IslandMap): { gx: number; gy: number } {
  if (isFinite(island.spawn?.gx) && isFinite(island.spawn?.gy)) {
    return { gx: island.spawn!.gx, gy: island.spawn!.gy };
  }
  if (island.tiles.length > 0) {
    return { gx: island.tiles[0].gx, gy: island.tiles[0].gy };
  }
  return { gx: 1, gy: 1 };
}

function buildTileSet(island: IslandMap): Set<string> {
  const s = new Set<string>();
  for (const t of island.tiles) {
    if (!t.blocked) s.add(`${t.gx},${t.gy}`);
  }
  return s;
}

function hasTraversableTileAt(
  tileSet: Set<string>,
  surface: IslandSurfaceData,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
  maxStepHeight?: number,
): boolean {
  const roundedToGx = Math.round(toGx);
  const roundedToGy = Math.round(toGy);
  return (
    tileSet.has(`${roundedToGx},${roundedToGy}`) &&
    canStepBetweenCells(surface, fromGx, fromGy, roundedToGx, roundedToGy, maxStepHeight)
  );
}

function clampTargetToTraversableSurface(
  surface: IslandSurfaceData,
  tileSet: Set<string>,
  startGx: number,
  startGy: number,
  targetGx: number,
  targetGy: number,
  samples = 12,
  maxStepHeight?: number,
): { gx: number; gy: number } {
  let bestGx = startGx;
  let bestGy = startGy;
  let prevGx = startGx;
  let prevGy = startGy;

  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const gx = startGx + (targetGx - startGx) * t;
    const gy = startGy + (targetGy - startGy) * t;
    if (!hasTraversableTileAt(tileSet, surface, prevGx, prevGy, gx, gy, maxStepHeight)) {
      break;
    }
    bestGx = gx;
    bestGy = gy;
    prevGx = gx;
    prevGy = gy;
  }

  return { gx: bestGx, gy: bestGy };
}

function isPoiFocusAction(actionType: ActionType): actionType is "mining" | "farming" | "magic" | "fight" {
  return actionType === "mining" || actionType === "farming" || actionType === "magic" || actionType === "fight";
}

function getPoiActionAnimState(actionType: ActionType): CharacterPose3D["animState"] {
  switch (actionType) {
    case "magic":
      return "spell";
    case "fight":
      return "attack";
    case "mining":
    case "farming":
    default:
      return "chop";
  }
}

function canMoveGroundedToCell(
  tileSet: Set<string>,
  blockedFootprintSet: Set<string>,
  surface: IslandSurfaceData,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
  maxStepHeight: number,
): boolean {
  const targetKey = `${Math.round(toGx)},${Math.round(toGy)}`;
  if (blockedFootprintSet.has(targetKey)) return false;
  if (!tileSet.has(targetKey)) return true;
  return canStepBetweenCells(surface, fromGx, fromGy, toGx, toGy, maxStepHeight);
}

export function buildTileTypeMap(island: IslandMap): Map<string, AssetKey> {
  const m = new Map<string, AssetKey>();
  for (const t of island.tiles) {
    m.set(`${t.gx},${t.gy}`, t.type);
  }
  return m;
}

export type InteractResult = {
  action: "woodcutting" | "harvesting";
  tileGx: number;
  tileGy: number;
};

export function findNearbyInteractable(
  gx: number,
  gy: number,
  tileTypeMap: Map<string, AssetKey>,
): InteractResult | null {
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of offsets) {
    const tx = cx + dx;
    const ty = cy + dy;
    const type = tileTypeMap.get(`${tx},${ty}`);
    if (!type) continue;
    if ((TREE_TILES as readonly string[]).includes(type))
      return { action: "woodcutting", tileGx: tx, tileGy: ty };
    if ((FARM_TILES as readonly string[]).includes(type))
      return { action: "harvesting", tileGx: tx, tileGy: ty };
  }
  return null;
}

/** Adjacent rune tile with toolbox VFX armed (vfxEnabled); E toggles runeVfxLit in-game. */
export function findNearbyRuneTile(
  gx: number,
  gy: number,
  island: IslandMap,
): { gx: number; gy: number } | null {
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of offsets) {
    const tx = cx + dx;
    const ty = cy + dy;
    const t = island.tiles.find((x) => x.gx === tx && x.gy === ty && x.type === "runeTile");
    if (t?.vfxEnabled === true) {
      return { gx: t.gx, gy: t.gy };
    }
  }
  return null;
}

function ancientTempleFootprintKeys(island: IslandMap): Set<string> {
  const keys = new Set<string>();
  const span = SKYHAVEN_SPRITE_MANIFEST.tile.ancientTempleTile?.gridSpan ?? { w: 2, h: 2 };
  const w = span.w;
  const h = span.h;
  for (const t of island.tiles) {
    if (t.type !== "ancientTempleTile") continue;
    for (let gy = t.gy; gy < t.gy + h; gy++) {
      for (let gx = t.gx; gx < t.gx + w; gx++) {
        keys.add(`${gx},${gy}`);
      }
    }
  }
  return keys;
}

/** Max Chebyshev steps from player cell to any temple footprint cell (2×2 POI needs a bit of reach). */
const ANCIENT_TEMPLE_INTERACT_CHEBYSHEV = 2;

/** Player near any ancient temple footprint cell (for E menu). */
export function findNearbyAncientTempleTile(
  gx: number,
  gy: number,
  island: IslandMap,
): { gx: number; gy: number } | null {
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  const footprint = ancientTempleFootprintKeys(island);
  if (footprint.size === 0) return null;
  let bestGx = 0;
  let bestGy = 0;
  let bestD = Infinity;
  for (const key of footprint) {
    const [fx, fy] = key.split(",").map(Number);
    const d = Math.max(Math.abs(cx - fx), Math.abs(cy - fy));
    if (d <= ANCIENT_TEMPLE_INTERACT_CHEBYSHEV && d < bestD) {
      bestD = d;
      bestGx = fx;
      bestGy = fy;
    }
  }
  if (bestD > ANCIENT_TEMPLE_INTERACT_CHEBYSHEV) return null;
  return { gx: bestGx, gy: bestGy };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function pickRandomTile(
  tiles: ReadonlyArray<{ gx: number; gy: number }>,
  currentGx: number,
  currentGy: number,
): { gx: number; gy: number } {
  if (tiles.length <= 1) return tiles.length === 1 ? tiles[0] : { gx: currentGx, gy: currentGy };
  const candidates = tiles.filter(
    (t) => Math.abs(t.gx - currentGx) + Math.abs(t.gy - currentGy) > 0.5,
  );
  const pool = candidates.length > 0 ? candidates : tiles;
  return pool[Math.floor(Math.random() * pool.length)];
}

export type SpellCastEvent = {
  posX: number;
  posY: number;
  posZ: number;
  dirX: number;
  dirZ: number;
};

export type TpsCameraState = {
  active: boolean;
  viewYaw: number | null;
  /** True when TPS camera line-of-sight to the character is blocked by occluder geometry. */
  characterOccluded: boolean;
  steeringActive: boolean;
  mouseForwardActive: boolean;
  fadedOccluderKeys: string[];
};

function getFacingAngleFromVector(x: number, z: number): number {
  return Math.atan2(x, z);
}

function getFacingAngleToCell(fromGx: number, fromGy: number, targetGx: number, targetGy: number): number {
  return getFacingAngleFromVector(
    (targetGx - fromGx) * TILE_UNIT_SIZE,
    (targetGy - fromGy) * TILE_UNIT_SIZE,
  );
}

function moveTowardVector2(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  maxDelta: number,
): { x: number; y: number } {
  const deltaX = targetX - currentX;
  const deltaY = targetY - currentY;
  const deltaLen = Math.hypot(deltaX, deltaY);
  if (deltaLen <= 1e-6 || deltaLen <= maxDelta) {
    return { x: targetX, y: targetY };
  }
  const scale = maxDelta / deltaLen;
  return {
    x: currentX + deltaX * scale,
    y: currentY + deltaY * scale,
  };
}

function getBasisFromYaw(yaw: number): {
  forwardX: number;
  forwardZ: number;
  leftX: number;
  leftZ: number;
} {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  return {
    forwardX,
    forwardZ,
    leftX: -forwardZ,
    leftZ: forwardX,
  };
}

export type CharacterMovementOptions = {
  playableVariant?: "default" | "mining_man" | "magic_man" | "fight_man";
  selectedIslandId?: IslandId;
  onTileAction?: (actionType: "woodcutting" | "harvesting", tileGx: number, tileGy: number) => void;
  onPoiActionRequest?: (request: PoiActionRequest) => void;
  onCancelMiniAction?: () => void;
  poiMenuOpen?: boolean;
  activePoiSession?: FocusSession | null;
  isMiniActionActive?: boolean;
  /** Ref to mouse ground hit (world x,z). When set, W/S/A/D move relative to look direction. */
  mouseGroundRef?: MutableRefObject<THREE.Vector3 | null>;
  /** Shared TPS camera state. When active, movement/facing follow the camera view yaw. */
  tpsCameraStateRef?: MutableRefObject<TpsCameraState>;
  /** Ref to receive spell cast events (pos + direction) when C is pressed */
  spellCastRef?: MutableRefObject<SpellCastEvent | null>;
  /** Called when E is pressed near an NPC */
  onNpcInteract?: (npcId: string) => void;
  /** E near a rune tile (vfx armed): toggle in-game glow */
  onRuneVfxToggle?: (tileGx: number, tileGy: number) => void;
  /** E near Ancient Temple: open character selection (handled in React overlay). */
  onOpenCharacterSelect?: () => void;
  /** Ref containing NPC positions keyed by id, updated by IslandScene */
  npcPositionsRef?: MutableRefObject<Map<string, { gx: number; gy: number }>>;
  /** 0–100; scales footstep SFX (Sidebar SFX Vol). */
  playerSfxVolume?: number;
  /** Action-bar item: LMB / G chop only when wood axe is equipped. */
  equippedRightHand?: EquippableItemId | null;
  /** Filled each frame when provided (for Debug dock / tooling). */
  movementDebugRef?: MutableRefObject<CharacterMovementDebugSnapshot | null>;
};

export function useCharacterMovement(
  island: IslandMap,
  _characterActive: boolean,
  options: CharacterMovementOptions = {},
): CharacterPose3D {
  const avatarGroundProfile = useMemo(
    () => getPlayableAvatarGroundProfile(options.playableVariant ?? "default"),
    [options.playableVariant],
  );
  const spawn = resolveSpawn(island);
  const tileSet = useMemo(() => buildTileSet(island), [island]);
  const blockedFootprintSet = useMemo(() => buildBlockedFootprintSet(island), [island]);
  const surfaceData = useMemo(() => buildIslandSurfaceData(island), [island]);
  const tileList = useMemo(
    () => island.tiles.filter((t) => !t.blocked).map((t) => ({ gx: t.gx, gy: t.gy })),
    [island],
  );
  const tileTypeMap = useMemo(() => buildTileTypeMap(island), [island]);

  const poseRef = useRef<CharacterPose3D>({
    gx: spawn.gx,
    gy: spawn.gy,
    surfaceY: getSurfaceYAtWorldGrid(surfaceData, spawn.gx, spawn.gy),
    worldY: getSurfaceYAtWorldGrid(surfaceData, spawn.gx, spawn.gy),
    verticalVelocity: 0,
    grounded: true,
    direction: "right",
    animState: "idle",
    isManualMove: false,
    locomotionStrafe: "none",
  });
  const keysRef = useRef<MovementKeys>({ w: false, a: false, s: false, d: false });
  const actionKeysRef = useRef<ActionKeys>({ shift: false, space: false });
  const chopTimerRef = useRef<number>(0);
  const chopSwingSerialRef = useRef(0);
  const activeChopPlaybackSecRef = useRef(AXE_CHOP_PLAYBACK_SEC);
  const movementDebugRef = options.movementDebugRef;
  const movementDebugRefRef = useRef(movementDebugRef);
  movementDebugRefRef.current = movementDebugRef;
  const autoChopCooldownRef = useRef<number>(0);
  const tileSetRef = useRef(tileSet);
  tileSetRef.current = tileSet;
  const blockedFootprintRef = useRef(blockedFootprintSet);
  blockedFootprintRef.current = blockedFootprintSet;
  const surfaceDataRef = useRef(surfaceData);
  surfaceDataRef.current = surfaceData;
  const tileListRef = useRef(tileList);
  tileListRef.current = tileList;
  const tileTypeMapRef = useRef(tileTypeMap);
  tileTypeMapRef.current = tileTypeMap;
  const islandRef = useRef(island);
  islandRef.current = island;
  const selectedIslandIdRef = useRef(options.selectedIslandId);
  selectedIslandIdRef.current = options.selectedIslandId;
  const onTileActionRef = useRef(options.onTileAction);
  onTileActionRef.current = options.onTileAction;
  const onPoiActionRequestRef = useRef(options.onPoiActionRequest);
  onPoiActionRequestRef.current = options.onPoiActionRequest;
  const onCancelMiniActionRef = useRef(options.onCancelMiniAction);
  onCancelMiniActionRef.current = options.onCancelMiniAction;
  const isMiniActionActiveRef = useRef(options.isMiniActionActive ?? false);
  isMiniActionActiveRef.current = options.isMiniActionActive ?? false;
  const poiMenuOpenRef = useRef(options.poiMenuOpen ?? false);
  poiMenuOpenRef.current = options.poiMenuOpen ?? false;
  const activePoiSessionRef = useRef(options.activePoiSession ?? null);
  activePoiSessionRef.current = options.activePoiSession ?? null;
  const mouseGroundRef = options.mouseGroundRef;
  const mouseGroundRefRef = useRef(mouseGroundRef);
  mouseGroundRefRef.current = mouseGroundRef;
  const tpsCameraStateRef = options.tpsCameraStateRef;
  const tpsCameraStateRefRef = useRef(tpsCameraStateRef);
  tpsCameraStateRefRef.current = tpsCameraStateRef;
  const spellCastRef = options.spellCastRef;
  const spellCastRefRef = useRef(spellCastRef);
  spellCastRefRef.current = spellCastRef;
  const onNpcInteractRef = useRef(options.onNpcInteract);
  onNpcInteractRef.current = options.onNpcInteract;
  const npcPositionsRef = options.npcPositionsRef;
  const npcPositionsRefRef = useRef(npcPositionsRef);
  npcPositionsRefRef.current = npcPositionsRef;
  const onRuneVfxToggleRef = useRef(options.onRuneVfxToggle);
  onRuneVfxToggleRef.current = options.onRuneVfxToggle;
  const onOpenCharacterSelectRef = useRef(options.onOpenCharacterSelect);
  onOpenCharacterSelectRef.current = options.onOpenCharacterSelect;
  const playerSfxVolumeRef = useRef(options.playerSfxVolume ?? 0);
  playerSfxVolumeRef.current = options.playerSfxVolume ?? 0;
  const equippedRightHandRef = useRef<EquippableItemId | null>(options.equippedRightHand ?? null);
  equippedRightHandRef.current = options.equippedRightHand ?? null;
  const playableVariantRef = useRef(options.playableVariant ?? "default");
  playableVariantRef.current = options.playableVariant ?? "default";
  const fightManTurnTimeRef = useRef(0);
  const fightManTurnStepRef = useRef<"left" | "right" | null>(null);
  const fightManTurnStartFacingRef = useRef<number | null>(null);
  const fightManTurnCooldownRef = useRef(0);
  const clearFightManTurnRefs = () => {
    fightManTurnStepRef.current = null;
    fightManTurnTimeRef.current = 0;
    fightManTurnStartFacingRef.current = null;
  };
  const avatarGroundProfileRef = useRef(avatarGroundProfile);
  avatarGroundProfileRef.current = avatarGroundProfile;
  const spellTimerRef = useRef<number>(0);
  const [renderPose, setRenderPose] = useState<CharacterPose3D>(poseRef.current);
  const prevPoseRef = useRef<CharacterPose3D>(poseRef.current);
  const syncPoseWithSurface = (pose: CharacterPose3D): CharacterPose3D => {
    const surfaceY = getSurfaceYAtWorldGrid(surfaceDataRef.current, pose.gx, pose.gy);
    const grounded = pose.grounded ?? true;
    return {
      ...pose,
      surfaceY,
      worldY: grounded ? surfaceY : (pose.worldY ?? surfaceY),
      verticalVelocity: pose.verticalVelocity ?? 0,
      grounded,
    };
  };

  const rollTimerRef = useRef<number>(0);
  const rollStartRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const rollTargetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const lastMoveDir = useRef<{ dx: number; dy: number }>({ dx: 1, dy: 0 });
  const tpsVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tpsFacingYawRef = useRef<number | undefined>(undefined);
  const wasTpsActiveRef = useRef(false);

  const inputStuckRoundedKeyRef = useRef("");
  const inputStuckTimerRef = useRef(0);
  const lastSafeGroundRef = useRef<{ gx: number; gy: number; worldY: number }>({
    gx: spawn.gx,
    gy: spawn.gy,
    worldY: getSurfaceYAtWorldGrid(surfaceData, spawn.gx, spawn.gy),
  });

  const footstepDistAccumRef = useRef(0);
  const footstepPrevGxRef = useRef(poseRef.current.gx);
  const footstepPrevGyRef = useRef(poseRef.current.gy);

  const lastManualInputRef = useRef<number>(performance.now());
  const patrolPhaseRef = useRef<PatrolPhase>("inactive");
  const patrolTargetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const patrolPauseTimerRef = useRef<number>(0);

  const getActiveTpsCameraState = (): { viewYaw: number; mouseForwardActive: boolean } | null => {
    const state = tpsCameraStateRefRef.current?.current;
    if (!state?.active || state.viewYaw == null) return null;
    return {
      viewYaw: state.viewYaw,
      mouseForwardActive: state.mouseForwardActive,
    };
  };

  const prevSpawnRef = useRef(`${spawn.gx},${spawn.gy}`);
  useEffect(() => {
    const sp = resolveSpawn(island);
    const key = `${sp.gx},${sp.gy}`;
    if (key === prevSpawnRef.current) return;
    prevSpawnRef.current = key;
    poseRef.current = syncPoseWithSurface({
      gx: sp.gx,
      gy: sp.gy,
      direction: "right",
      animState: "idle",
      isManualMove: false,
      locomotionStrafe: "none",
    });
    lastSafeGroundRef.current = {
      gx: sp.gx,
      gy: sp.gy,
      worldY: getSurfaceYAtWorldGrid(surfaceDataRef.current, sp.gx, sp.gy),
    };
    tpsVelocityRef.current = { x: 0, y: 0 };
    tpsFacingYawRef.current = undefined;
    footstepDistAccumRef.current = 0;
    footstepPrevGxRef.current = sp.gx;
    footstepPrevGyRef.current = sp.gy;
  }, [island]);

  useEffect(() => {
    const handleKeyChange = (e: KeyboardEvent, pressed: boolean) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const k = e.key.toLowerCase();

      if (k === "shift" || e.key === "Shift") {
        actionKeysRef.current.shift = pressed;
        return;
      }
      if (k === " " || e.key === " ") {
        e.preventDefault();
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (pressed) {
          const pose = poseRef.current;
          if (
            pose.grounded === false ||
            isMiniActionActiveRef.current ||
            poiMenuOpenRef.current ||
            activePoiSessionRef.current
          ) {
            actionKeysRef.current.space = pressed;
            return;
          }
          const tpsCameraState = getActiveTpsCameraState();
          const tpsViewYaw = tpsCameraState?.viewYaw ?? null;
          const lastDir = lastMoveDir.current;
          const jumpFacingAngle =
            tpsViewYaw != null
              ? (tpsFacingYawRef.current ?? tpsViewYaw)
              : Math.abs(lastDir.dx) > 1e-4 || Math.abs(lastDir.dy) > 1e-4
                ? getFacingAngleFromVector(lastDir.dx, lastDir.dy)
                : pose.facingAngle;
          if (tpsViewYaw != null && jumpFacingAngle != null) {
            tpsFacingYawRef.current = jumpFacingAngle;
          }
          poseRef.current = {
            ...pose,
            grounded: false,
            verticalVelocity: avatarGroundProfileRef.current.jumpVelocity,
            animState: "jump",
            isManualMove: true,
            jumpDuration: JUMP_DURATION,
            facingAngle: jumpFacingAngle,
            locomotionStrafe: "none",
          };
          setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
        }
        actionKeysRef.current.space = pressed;
        return;
      }

      if (k === "g") {
        e.preventDefault();
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (
          pressed &&
          chopTimerRef.current <= 0 &&
          equippedRightHandRef.current === WOOD_AXE_ITEM_ID
        ) {
          chopSwingSerialRef.current += 1;
          activeChopPlaybackSecRef.current = AXE_CHOP_PLAYBACK_SEC;
          chopTimerRef.current = AXE_CHOP_PLAYBACK_SEC;
          playAxeSwingSfx(axeSwingVolume01(playerSfxVolumeRef.current));
        }
        return;
      }

      if (k === "v") {
        e.preventDefault();
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (pressed && rollTimerRef.current <= 0 && (poseRef.current.grounded ?? true)) {
          const pose = poseRef.current;
          const charX = pose.gx * TILE_UNIT_SIZE;
          const charZ = pose.gy * TILE_UNIT_SIZE;
          const tpsCameraState = getActiveTpsCameraState();
          const tpsViewYaw = tpsCameraState?.viewYaw ?? null;
          const mousePos = mouseGroundRefRef.current?.current;
          let dirX: number, dirZ: number;
          if (tpsViewYaw != null) {
            const basis = getBasisFromYaw(tpsViewYaw);
            dirX = basis.forwardX;
            dirZ = basis.forwardZ;
          } else if (mousePos && (Math.abs(mousePos.x - charX) > 1e-5 || Math.abs(mousePos.z - charZ) > 1e-5)) {
            const dx = mousePos.x - charX;
            const dz = mousePos.z - charZ;
            const len = Math.hypot(dx, dz);
            dirX = dx / len;
            dirZ = dz / len;
          } else {
            dirX = pose.direction === "right" ? 1 : -1;
            dirZ = 0;
          }
          const startGx = pose.gx;
          const startGy = pose.gy;
          const targetGx = startGx + (dirX / TILE_UNIT_SIZE) * ROLL_DISTANCE;
          const targetGy = startGy + (dirZ / TILE_UNIT_SIZE) * ROLL_DISTANCE;
          const tiles = tileSetRef.current;
          const landing = resolveReachableTargetValid(
            tiles,
            blockedFootprintRef.current,
            startGx,
            startGy,
            targetGx,
            targetGy,
            12,
          );
          const clampedLanding = clampTargetToTraversableSurface(
            surfaceDataRef.current,
            tiles,
            startGx,
            startGy,
            landing.gx,
            landing.gy,
            12,
            avatarGroundProfileRef.current.stepHeight,
          );
          const landGx = clampedLanding.gx;
          const landGy = clampedLanding.gy;
          rollStartRef.current = { gx: startGx, gy: startGy };
          rollTargetRef.current = { gx: landGx, gy: landGy };
          rollTimerRef.current = ROLL_DURATION;
          clearFightManTurnRefs();
          const dir: "left" | "right" = dirX > 0 ? "right" : dirX < 0 ? "left" : pose.direction;
          const rollFacingAngle = getFacingAngleFromVector(dirX, dirZ);
          if (tpsViewYaw != null) {
            tpsFacingYawRef.current = rollFacingAngle;
          }
          tpsVelocityRef.current = { x: 0, y: 0 };
          poseRef.current = {
            ...pose,
            gx: startGx,
            gy: startGy,
            direction: dir,
            animState: "roll",
            isManualMove: true,
            rollDuration: ROLL_DURATION,
            facingAngle: rollFacingAngle,
            locomotionStrafe: "none",
          };
          setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
        }
        return;
      }

      if (k === "c") {
        e.preventDefault();
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (pressed && spellTimerRef.current <= 0 && rollTimerRef.current <= 0) {
          const pose = poseRef.current;
          const charX = pose.gx * TILE_UNIT_SIZE;
          const charZ = pose.gy * TILE_UNIT_SIZE;
          const tpsCameraState = getActiveTpsCameraState();
          const tpsViewYaw = tpsCameraState?.viewYaw ?? null;
          const mousePos = mouseGroundRefRef.current?.current;
          let dirX: number, dirZ: number;
          if (tpsViewYaw != null) {
            const basis = getBasisFromYaw(tpsViewYaw);
            dirX = basis.forwardX;
            dirZ = basis.forwardZ;
          } else if (mousePos && (Math.abs(mousePos.x - charX) > 1e-5 || Math.abs(mousePos.z - charZ) > 1e-5)) {
            const dx = mousePos.x - charX;
            const dz = mousePos.z - charZ;
            const len = Math.hypot(dx, dz);
            dirX = dx / len;
            dirZ = dz / len;
          } else {
            dirX = pose.direction === "right" ? 1 : -1;
            dirZ = 0;
          }
          spellTimerRef.current = 1.05;
          clearFightManTurnRefs();
          const spellFacingAngle = getFacingAngleFromVector(dirX, dirZ);
          if (tpsViewYaw != null) {
            tpsFacingYawRef.current = spellFacingAngle;
          }
          tpsVelocityRef.current = { x: 0, y: 0 };
          poseRef.current = {
            ...pose,
            animState: "spell",
            isManualMove: true,
            facingAngle: spellFacingAngle,
            locomotionStrafe: "none",
            fightManTurnStep: undefined,
          };
          setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
          if (spellCastRefRef.current) {
            spellCastRefRef.current.current = {
              posX: charX + dirX * 0.4,
              posY: pose.worldY ?? pose.surfaceY ?? getSurfaceYAtWorldGrid(surfaceDataRef.current, pose.gx, pose.gy),
              posZ: charZ + dirZ * 0.4,
              dirX,
              dirZ,
            };
          }
        }
        return;
      }

      if (k === "e") {
        e.preventDefault();
        if (!pressed) return;
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        const pose = poseRef.current;
        const tpsCameraState = getActiveTpsCameraState();
        if (!isMiniActionActiveRef.current && !poiMenuOpenRef.current && !activePoiSessionRef.current) {
          const nearbyPoi = findNearbyPoiAction(islandRef.current, pose.gx, pose.gy);
          const selectedIslandId = selectedIslandIdRef.current;
          if (nearbyPoi && selectedIslandId && onPoiActionRequestRef.current) {
            const request = buildPoiActionRequest(selectedIslandId, islandRef.current, pose.gx, pose.gy, nearbyPoi);
            if (request) {
              const dir: "left" | "right" = request.anchorGx < Math.round(pose.gx) ? "left" : "right";
              tpsVelocityRef.current = { x: 0, y: 0 };
              poseRef.current = {
                ...pose,
                gx: request.anchorGx,
                gy: request.anchorGy,
                direction: dir,
                isManualMove: false,
                facingAngle: request.facingAngle,
                locomotionStrafe: "none",
              };
              setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
              onPoiActionRequestRef.current(request);
              return;
            }
          }
        }
        const result = findNearbyInteractable(pose.gx, pose.gy, tileTypeMapRef.current);
        if (result && onTileActionRef.current) {
          const dir: "left" | "right" = result.tileGx < Math.round(pose.gx) ? "left" : "right";
          const facingAngle =
            tpsCameraState != null
              ? getFacingAngleToCell(pose.gx, pose.gy, result.tileGx, result.tileGy)
              : pose.facingAngle;
          if (tpsCameraState != null && facingAngle != null) {
            tpsFacingYawRef.current = facingAngle;
          }
          tpsVelocityRef.current = { x: 0, y: 0 };
          poseRef.current = {
            ...pose,
            direction: dir,
            isManualMove: false,
            facingAngle,
            locomotionStrafe: "none",
          };
          chopSwingSerialRef.current += 1;
          activeChopPlaybackSecRef.current = AXE_CHOP_PLAYBACK_SEC;
          chopTimerRef.current = AXE_CHOP_PLAYBACK_SEC;
          if (equippedRightHandRef.current === WOOD_AXE_ITEM_ID) {
            playAxeSwingSfx(axeSwingVolume01(playerSfxVolumeRef.current));
          }
          autoChopCooldownRef.current = 2 + Math.random() * 2;
          onTileActionRef.current(result.action, result.tileGx, result.tileGy);
        } else {
          const runeHit = findNearbyRuneTile(pose.gx, pose.gy, islandRef.current);
          if (runeHit && onRuneVfxToggleRef.current) {
            const dir: "left" | "right" = runeHit.gx < Math.round(pose.gx) ? "left" : "right";
            const facingAngle =
              tpsCameraState != null
                ? getFacingAngleToCell(pose.gx, pose.gy, runeHit.gx, runeHit.gy)
                : pose.facingAngle;
            if (tpsCameraState != null && facingAngle != null) {
              tpsFacingYawRef.current = facingAngle;
            }
            tpsVelocityRef.current = { x: 0, y: 0 };
            poseRef.current = {
              ...pose,
              direction: dir,
              isManualMove: false,
              facingAngle,
              locomotionStrafe: "none",
            };
            setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
            onRuneVfxToggleRef.current(runeHit.gx, runeHit.gy);
            return;
          }
          const templeHit = findNearbyAncientTempleTile(pose.gx, pose.gy, islandRef.current);
          if (templeHit && onOpenCharacterSelectRef.current) {
            const dir: "left" | "right" = templeHit.gx < Math.round(pose.gx) ? "left" : "right";
            const facingAngle =
              tpsCameraState != null
                ? getFacingAngleToCell(pose.gx, pose.gy, templeHit.gx, templeHit.gy)
                : pose.facingAngle;
            if (tpsCameraState != null && facingAngle != null) {
              tpsFacingYawRef.current = facingAngle;
            }
            tpsVelocityRef.current = { x: 0, y: 0 };
            poseRef.current = {
              ...pose,
              direction: dir,
              isManualMove: false,
              facingAngle,
              locomotionStrafe: "none",
            };
            setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
            onOpenCharacterSelectRef.current();
            return;
          }
          const npcMap = npcPositionsRefRef.current?.current;
          if (npcMap && onNpcInteractRef.current) {
            for (const [id, npcPos] of npcMap) {
              const dist = Math.hypot(pose.gx - npcPos.gx, pose.gy - npcPos.gy);
              if (dist <= 1.2) {
                const toNpcX = (npcPos.gx - pose.gx) * TILE_UNIT_SIZE;
                const toNpcZ = (npcPos.gy - pose.gy) * TILE_UNIT_SIZE;
                const angle = Math.atan2(toNpcX, toNpcZ);
                if (tpsCameraState != null) {
                  tpsFacingYawRef.current = angle;
                }
                tpsVelocityRef.current = { x: 0, y: 0 };
                poseRef.current = {
                  ...pose,
                  isManualMove: false,
                  facingAngle: angle,
                  locomotionStrafe: "none",
                };
                setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
                onNpcInteractRef.current(id);
                break;
              }
            }
          }
        }
        return;
      }

      if (e.code === "F8") {
        e.preventDefault();
        if (!pressed) return;
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        const sp = resolveSpawn(islandRef.current);
        const walkable = tileSetRef.current;
        const blocked = blockedFootprintRef.current;
        const safe = findNearestValidCell(sp.gx, sp.gy, walkable, blocked);
        const safeWorldY = getSurfaceYAtWorldGrid(surfaceDataRef.current, safe.gx, safe.gy);
        lastSafeGroundRef.current = { gx: safe.gx, gy: safe.gy, worldY: safeWorldY };
        tpsVelocityRef.current = { x: 0, y: 0 };
        const cur = poseRef.current;
        poseRef.current = {
          ...cur,
          gx: safe.gx,
          gy: safe.gy,
          surfaceY: safeWorldY,
          worldY: safeWorldY,
          verticalVelocity: 0,
          grounded: true,
          animState: "idle",
          isManualMove: false,
          locomotionStrafe: "none",
        };
        inputStuckTimerRef.current = 0;
        inputStuckRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
        prevPoseRef.current = syncPoseWithSurface({ ...poseRef.current });
        setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
        return;
      }

      if (k !== "w" && k !== "a" && k !== "s" && k !== "d") return;
      e.preventDefault();
      if (pressed) {
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (isMiniActionActiveRef.current && onCancelMiniActionRef.current) {
          onCancelMiniActionRef.current();
        }
      }
      keysRef.current[k] = pressed;
    };
    const down = (e: KeyboardEvent) => handleKeyChange(e, true);
    const up = (e: KeyboardEvent) => handleKeyChange(e, false);
    const blur = () => {
      keysRef.current = { w: false, a: false, s: false, d: false };
      actionKeysRef.current = { shift: false, space: false };
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return;
      if (tag !== "CANVAS") return;
      const tpsState = tpsCameraStateRefRef.current?.current;
      if (tpsState?.active && (tpsState.mouseForwardActive || tpsState.steeringActive || (e.buttons & 2) !== 0)) {
        return;
      }
      if (equippedRightHandRef.current !== WOOD_AXE_ITEM_ID) {
        return;
      }
      e.preventDefault();
      lastManualInputRef.current = performance.now();
      patrolPhaseRef.current = "inactive";
      if (chopTimerRef.current <= 0) {
        chopSwingSerialRef.current += 1;
        activeChopPlaybackSecRef.current = AXE_CHOP_PLAYBACK_SEC;
        chopTimerRef.current = AXE_CHOP_PLAYBACK_SEC;
        playAxeSwingSfx(axeSwingVolume01(playerSfxVolumeRef.current));
      }
    };

    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    window.addEventListener("blur", blur);
    window.addEventListener("pointerdown", handlePointerDown, { passive: false });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(0.05, delta);
    if (fightManTurnCooldownRef.current > 0) {
      fightManTurnCooldownRef.current = Math.max(0, fightManTurnCooldownRef.current - dt);
    }
    const frameStartGx = poseRef.current.gx;
    const frameStartGy = poseRef.current.gy;
    const keys = keysRef.current;
    const tpsCameraState = getActiveTpsCameraState();
    const tpsViewYaw = tpsCameraState?.viewYaw ?? null;
    const mouseForwardActive = tpsCameraState?.mouseForwardActive ?? false;
    const hasInput = keys.w || keys.a || keys.s || keys.d || mouseForwardActive;
    const tpsActive = tpsViewYaw != null;
    if (tpsActive && !wasTpsActiveRef.current) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      tpsFacingYawRef.current = tpsFacingYawRef.current ?? tpsViewYaw;
    }
    if (chopTimerRef.current > 0) chopTimerRef.current -= dt;
    if (spellTimerRef.current > 0) spellTimerRef.current -= dt;

    if (isMiniActionActiveRef.current && !hasInput) {
      autoChopCooldownRef.current -= dt;
      if (autoChopCooldownRef.current <= 0 && chopTimerRef.current <= 0) {
        chopSwingSerialRef.current += 1;
        activeChopPlaybackSecRef.current = AXE_CHOP_PLAYBACK_SEC;
        chopTimerRef.current = AXE_CHOP_PLAYBACK_SEC;
        if (equippedRightHandRef.current === WOOD_AXE_ITEM_ID) {
          playAxeSwingSfx(axeSwingVolume01(playerSfxVolumeRef.current));
        }
        autoChopCooldownRef.current = 2 + Math.random() * 2;
      }
    }

    const pose = poseRef.current;
    const isRunning = actionKeysRef.current.shift;
    const isChopping = chopTimerRef.current > 0;
    const tiles = tileSetRef.current;
    let resolvedTpsFacingAngle = pose.facingAngle;
    const activePoiSession = activePoiSessionRef.current;
    const tpsCamRmb = tpsCameraStateRefRef.current?.current;
    const tpsRmbLookLive = Boolean(tpsCamRmb?.active && tpsCamRmb.steeringActive);

    if (
      activePoiSession &&
      isPoiFocusAction(activePoiSession.actionType) &&
      activePoiSession.anchorGx != null &&
      activePoiSession.anchorGy != null &&
      (pose.grounded ?? true)
    ) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      const lockedPose = syncPoseWithSurface({
        ...pose,
        gx: activePoiSession.anchorGx,
        gy: activePoiSession.anchorGy,
        animState: getPoiActionAnimState(activePoiSession.actionType),
        isManualMove: false,
        facingAngle: activePoiSession.facingAngle ?? pose.facingAngle,
        locomotionStrafe: "none",
        tpsRmbLook: tpsRmbLookLive,
      });
      poseRef.current = lockedPose;
      prevPoseRef.current = lockedPose;
      setRenderPose(lockedPose);
      return;
    }

    if (poiMenuOpenRef.current && (pose.grounded ?? true)) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      poseRef.current = {
        ...pose,
        animState: "idle",
        isManualMove: false,
        locomotionStrafe: "none",
        tpsRmbLook: tpsRmbLookLive,
      };
      prevPoseRef.current = syncPoseWithSurface({ ...poseRef.current });
      setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
      return;
    }

    if (isMiniActionActiveRef.current && (pose.grounded ?? true)) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      if (isChopping) {
        poseRef.current = {
          ...pose,
          animState: "chop",
          isManualMove: false,
          chopDuration: activeChopPlaybackSecRef.current,
          chopSwingId: chopSwingSerialRef.current,
          locomotionStrafe: "none",
        };
      } else {
        poseRef.current = { ...pose, animState: "idle", isManualMove: false, locomotionStrafe: "none" };
      }
      if (tpsActive) {
        const facingAngle =
          resolvedTpsFacingAngle ??
          tpsFacingYawRef.current ??
          poseRef.current.facingAngle ??
          tpsViewYaw;
        poseRef.current = { ...poseRef.current, facingAngle, tpsRmbLook: tpsRmbLookLive };
        tpsFacingYawRef.current = facingAngle;
        wasTpsActiveRef.current = true;
      } else if (wasTpsActiveRef.current) {
        tpsVelocityRef.current = { x: 0, y: 0 };
        tpsFacingYawRef.current = undefined;
        poseRef.current = {
          ...poseRef.current,
          facingAngle: undefined,
          tpsRmbLook: tpsRmbLookLive,
        };
        wasTpsActiveRef.current = false;
      }
      poseRef.current = { ...poseRef.current, tpsRmbLook: tpsRmbLookLive };
      prevPoseRef.current = syncPoseWithSurface({ ...poseRef.current });
      setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
      return;
    }

    if (rollTimerRef.current > 0) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      rollTimerRef.current -= dt;
      const t = clamp(1 - rollTimerRef.current / ROLL_DURATION, 0, 1);
      const start = rollStartRef.current;
      const target = rollTargetRef.current;
      const easeT = 1 - (1 - t) * (1 - t);
      const gx = start.gx + (target.gx - start.gx) * easeT;
      const gy = start.gy + (target.gy - start.gy) * easeT;
      poseRef.current = { ...pose, gx, gy, animState: "roll", isManualMove: true, locomotionStrafe: "none" };
      resolvedTpsFacingAngle = poseRef.current.facingAngle;
      if (rollTimerRef.current <= 0) {
        poseRef.current = {
          ...poseRef.current,
          gx: target.gx,
          gy: target.gy,
          animState: hasInput ? (isRunning ? "run" : "walk") : "idle",
          isManualMove: hasInput,
          locomotionStrafe: "none",
          tpsRmbLook: tpsRmbLookLive,
        };
        prevPoseRef.current = syncPoseWithSurface({ ...poseRef.current });
        setRenderPose(syncPoseWithSurface({ ...poseRef.current }));
      }
    } else if (isChopping) {
      clearFightManTurnRefs();
      tpsVelocityRef.current = { x: 0, y: 0 };
      poseRef.current = {
        ...pose,
        animState: "chop",
        isManualMove: false,
        chopDuration: activeChopPlaybackSecRef.current,
        chopSwingId: chopSwingSerialRef.current,
        locomotionStrafe: "none",
        fightManTurnStep: undefined,
      };
      resolvedTpsFacingAngle = pose.facingAngle;
    } else if (spellTimerRef.current > 0) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      poseRef.current = {
        ...pose,
        animState: "spell",
        locomotionStrafe: "none",
        fightManTurnStep: undefined,
      };
      resolvedTpsFacingAngle = pose.facingAngle;
    } else if (tpsActive) {
      const isFightManTurning =
        playableVariantRef.current === "fight_man" &&
        fightManTurnTimeRef.current > 0 &&
        fightManTurnStepRef.current !== null;

      if (isFightManTurning) {
        fightManTurnTimeRef.current -= dt;
        tpsVelocityRef.current = { x: 0, y: 0 };
        const step = fightManTurnStepRef.current!;
        const startFacing = fightManTurnStartFacingRef.current ?? pose.facingAngle ?? tpsViewYaw;
        if (fightManTurnTimeRef.current <= 0) {
          fightManTurnStepRef.current = null;
          fightManTurnStartFacingRef.current = null;
          resolvedTpsFacingAngle = tpsViewYaw;
          tpsFacingYawRef.current = tpsViewYaw;
          poseRef.current = {
            ...pose,
            gx: pose.gx,
            gy: pose.gy,
            direction: pose.direction,
            animState: "idle",
            isManualMove: false,
            locomotionStrafe: "none",
            facingAngle: tpsViewYaw,
            fightManTurnStep: undefined,
          };
        } else {
          resolvedTpsFacingAngle = startFacing;
          poseRef.current = {
            ...pose,
            gx: pose.gx,
            gy: pose.gy,
            animState: "idle",
            isManualMove: false,
            locomotionStrafe: "none",
            facingAngle: startFacing,
            fightManTurnStep: step,
          };
        }
      } else {
        let moveX = 0;
        let moveY = 0;
        const basis = getBasisFromYaw(tpsViewYaw);
        if (keys.w || mouseForwardActive) {
          moveX += basis.forwardX;
          moveY += basis.forwardZ;
        }
        if (keys.s) {
          moveX -= basis.forwardX;
          moveY -= basis.forwardZ;
        }
        if (keys.a) {
          moveX -= basis.leftX;
          moveY -= basis.leftZ;
        }
        if (keys.d) {
          moveX += basis.leftX;
          moveY += basis.leftZ;
        }

        if (moveX !== 0 || moveY !== 0) {
          lastMoveDir.current = { dx: moveX, dy: moveY };
        }

        const inputLen = Math.hypot(moveX, moveY);
        const targetSpeed = isRunning ? MANUAL_RUN_GRID_SPEED : MANUAL_GRID_SPEED;
        const desiredVelX = inputLen > 1e-4 ? (moveX / inputLen) * targetSpeed : 0;
        const desiredVelY = inputLen > 1e-4 ? (moveY / inputLen) * targetSpeed : 0;
        tpsVelocityRef.current = moveTowardVector2(
          tpsVelocityRef.current.x,
          tpsVelocityRef.current.y,
          desiredVelX,
          desiredVelY,
          (inputLen > 1e-4 ? TPS_ACCEL : TPS_DECEL) * dt,
        );
        if (Math.hypot(tpsVelocityRef.current.x, tpsVelocityRef.current.y) <= TPS_STOP_EPSILON) {
          tpsVelocityRef.current = { x: 0, y: 0 };
        }

        let velX = tpsVelocityRef.current.x;
        let velY = tpsVelocityRef.current.y;
        let nx = pose.gx + velX * dt;
        let ny = pose.gy + velY * dt;
        const grounded = pose.grounded ?? true;
        if (
          grounded &&
          !canMoveGroundedToCell(
            tiles,
            blockedFootprintRef.current,
            surfaceDataRef.current,
            pose.gx,
            pose.gy,
            nx,
            ny,
            avatarGroundProfileRef.current.stepHeight,
          )
        ) {
          const canMoveX = canMoveGroundedToCell(
            tiles,
            blockedFootprintRef.current,
            surfaceDataRef.current,
            pose.gx,
            pose.gy,
            pose.gx + velX * dt,
            pose.gy,
            avatarGroundProfileRef.current.stepHeight,
          );
          const canMoveY = canMoveGroundedToCell(
            tiles,
            blockedFootprintRef.current,
            surfaceDataRef.current,
            pose.gx,
            pose.gy,
            pose.gx,
            pose.gy + velY * dt,
            avatarGroundProfileRef.current.stepHeight,
          );
          if (canMoveX && !canMoveY) {
            ny = pose.gy;
            velY = 0;
          } else if (canMoveY && !canMoveX) {
            nx = pose.gx;
            velX = 0;
          } else {
            nx = pose.gx;
            ny = pose.gy;
            velX = 0;
            velY = 0;
          }
        }

        const resolvedMove = resolveHorizontalCollision(
          surfaceDataRef.current,
          pose.gx,
          pose.gy,
          nx,
          ny,
          avatarGroundProfileRef.current.collisionRadius,
        );
        if (resolvedMove.x !== nx) velX = 0;
        if (resolvedMove.z !== ny) velY = 0;
        nx = resolvedMove.x;
        ny = resolvedMove.z;
        tpsVelocityRef.current = { x: velX, y: velY };

        const actualSpeed = Math.hypot(velX, velY);
        let dirStr: "left" | "right" = pose.direction;
        if (velX > 0.01) dirStr = "right";
        else if (velX < -0.01) dirStr = "left";
        const airbornTps = !(pose.grounded ?? true);

        let locomotionStrafe: NonNullable<CharacterPose3D["locomotionStrafe"]> = "none";
        if (playableVariantRef.current === "fight_man") {
          if (keys.w && keys.a && !keys.s) locomotionStrafe = "left";
          else if (keys.w && keys.d && !keys.s) locomotionStrafe = "right";
        }

        poseRef.current = {
          ...pose,
          gx: nx,
          gy: ny,
          direction: dirStr,
          animState: airbornTps
            ? "jump"
            : actualSpeed > TPS_MOVE_ANIM_EPSILON
              ? actualSpeed > MANUAL_GRID_SPEED * 1.5
                ? "run"
                : "walk"
            : "idle",
          isManualMove: hasInput || actualSpeed > TPS_MOVE_ANIM_EPSILON,
          locomotionStrafe,
          fightManTurnStep: undefined,
        };
        if (actualSpeed > TPS_MOVE_ANIM_EPSILON) {
          resolvedTpsFacingAngle = getFacingAngleFromVector(velX, velY);
        } else {
          resolvedTpsFacingAngle = tpsFacingYawRef.current ?? pose.facingAngle ?? tpsViewYaw;
        }

        const strictTpsIdle =
          actualSpeed <= TPS_MOVE_ANIM_EPSILON &&
          !keys.w &&
          !keys.s &&
          !keys.a &&
          !keys.d &&
          !mouseForwardActive;
        if (
          playableVariantRef.current === "fight_man" &&
          fightManTurnCooldownRef.current <= 0 &&
          !airbornTps &&
          strictTpsIdle &&
          !tpsCamRmb?.steeringActive
        ) {
          const bodyYaw = resolvedTpsFacingAngle;
          const deltaTurn = wrapMovementAngle(tpsViewYaw - bodyYaw);
          if (Math.abs(deltaTurn) >= FIGHT_MAN_TURN_DELTA_MIN_RAD) {
            const step: "left" | "right" = deltaTurn > 0 ? "right" : "left";
            fightManTurnStepRef.current = step;
            fightManTurnStartFacingRef.current = bodyYaw;
            fightManTurnTimeRef.current = FIGHT_MAN_TURN_CLIP_SEC;
            fightManTurnCooldownRef.current = FIGHT_MAN_TURN_COOLDOWN_SEC;
            tpsVelocityRef.current = { x: 0, y: 0 };
            poseRef.current = {
              ...poseRef.current,
              animState: "idle",
              isManualMove: false,
              locomotionStrafe: "none",
              facingAngle: bodyYaw,
              fightManTurnStep: step,
            };
            resolvedTpsFacingAngle = bodyYaw;
          }
        }
      }
    } else if (hasInput) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      let mgx = 0, mgy = 0;
      let mouseRelativeWasd = false;
      const mousePos = mouseGroundRefRef.current?.current ?? null;
      const charX = pose.gx * TILE_UNIT_SIZE;
      const charZ = pose.gy * TILE_UNIT_SIZE;

      if (mousePos && (Math.abs(mousePos.x - charX) > 1e-5 || Math.abs(mousePos.z - charZ) > 1e-5)) {
        const dx = mousePos.x - charX;
        const dz = mousePos.z - charZ;
        const len = Math.hypot(dx, dz);
        if (len > 1e-5) {
          const fwdX = dx / len;
          const fwdZ = dz / len;
          const leftX = -fwdZ;
          const leftZ = fwdX;
          if (keys.w) {
            mgx += fwdX;
            mgy += fwdZ;
            mouseRelativeWasd = true;
          }
          if (keys.s) {
            mgx -= fwdX;
            mgy -= fwdZ;
            mouseRelativeWasd = true;
          }
          if (keys.a) {
            mgx += leftX;
            mgy += leftZ;
            mouseRelativeWasd = true;
          }
          if (keys.d) {
            mgx -= leftX;
            mgy -= leftZ;
            mouseRelativeWasd = true;
          }
        }
      }
      if (mgx === 0 && mgy === 0) {
        mouseRelativeWasd = false;
        if (keys.w) {
          mgy -= 1;
        }
        if (keys.s) {
          mgy += 1;
        }
        if (keys.a) {
          mgx -= 1;
        }
        if (keys.d) {
          mgx += 1;
        }
      }

      let locomotionStrafe: NonNullable<CharacterPose3D["locomotionStrafe"]> = "none";
      if (mouseRelativeWasd && mousePos) {
        const dx = mousePos.x - charX;
        const dz = mousePos.z - charZ;
        const flen = Math.hypot(dx, dz);
        const mlen = Math.hypot(mgx, mgy);
        if (flen > 1e-5 && mlen > 1e-5) {
          const fx = dx / flen;
          const fz = dz / flen;
          const mx = mgx / mlen;
          const mz = mgy / mlen;
          const cross = fx * mz - fz * mx;
          if (Math.abs(cross) >= 0.55) {
            locomotionStrafe = cross > 0 ? "left" : "right";
          }
        }
      }

      if (mgx !== 0 || mgy !== 0) {
        lastMoveDir.current = { dx: mgx, dy: mgy };
      }

      const len = Math.hypot(mgx, mgy);
      const airbornManual = !(pose.grounded ?? true);
      if (len < 0.0001) {
        poseRef.current = {
          ...pose,
          animState: airbornManual ? "jump" : "idle",
          isManualMove: false,
          locomotionStrafe: "none",
        };
      } else {
        const speed = isRunning ? MANUAL_RUN_GRID_SPEED : MANUAL_GRID_SPEED;
        const step = (speed * dt) / len;
        let nx = pose.gx + mgx * step;
        let ny = pose.gy + mgy * step;
        const grounded = pose.grounded ?? true;
        if (
          grounded &&
          !canMoveGroundedToCell(
            tiles,
            blockedFootprintRef.current,
            surfaceDataRef.current,
            pose.gx,
            pose.gy,
            nx,
            ny,
            avatarGroundProfileRef.current.stepHeight,
          )
        ) {
          const canMoveX = canMoveGroundedToCell(
            tiles,
            blockedFootprintRef.current,
            surfaceDataRef.current,
            pose.gx,
            pose.gy,
            pose.gx + mgx * step,
            pose.gy,
            avatarGroundProfileRef.current.stepHeight,
          );
          const canMoveY = canMoveGroundedToCell(
            tiles,
            blockedFootprintRef.current,
            surfaceDataRef.current,
            pose.gx,
            pose.gy,
            pose.gx,
            pose.gy + mgy * step,
            avatarGroundProfileRef.current.stepHeight,
          );
          if (canMoveX && !canMoveY) {
            ny = pose.gy;
          } else if (canMoveY && !canMoveX) {
            nx = pose.gx;
          } else {
            nx = pose.gx;
            ny = pose.gy;
          }
        }

        const resolvedMove = resolveHorizontalCollision(
          surfaceDataRef.current,
          pose.gx,
          pose.gy,
          nx,
          ny,
          avatarGroundProfileRef.current.collisionRadius,
        );
        nx = resolvedMove.x;
        ny = resolvedMove.z;

        let dirStr: "left" | "right" = pose.direction;
        if (mgx > 0.01) dirStr = "right";
        else if (mgx < -0.01) dirStr = "left";
        poseRef.current = {
          ...pose,
          gx: nx,
          gy: ny,
          direction: dirStr,
          animState: airbornManual ? "jump" : isRunning ? "run" : "walk",
          isManualMove: true,
          locomotionStrafe,
        };
      }
    } else {
      tpsVelocityRef.current = { x: 0, y: 0 };
      if (pose.grounded === false) {
        poseRef.current = { ...pose, animState: "jump", isManualMove: false, locomotionStrafe: "none" };
      } else {
      const idleSeconds = (performance.now() - lastManualInputRef.current) / 1000;
      const phase = patrolPhaseRef.current;

      if (phase === "walking") {
        const target = patrolTargetRef.current;
        const dx = target.gx - pose.gx;
        const dy = target.gy - pose.gy;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.08) {
          poseRef.current = {
            ...pose,
            gx: target.gx,
            gy: target.gy,
            animState: "idle",
            isManualMove: false,
            locomotionStrafe: "none",
          };
          patrolPhaseRef.current = "paused";
          patrolPauseTimerRef.current =
            PATROL_PAUSE_MIN + Math.random() * (PATROL_PAUSE_MAX - PATROL_PAUSE_MIN);
        } else {
          const step = (PATROL_GRID_SPEED * dt) / dist;
          let nx = pose.gx + dx * step;
          let ny = pose.gy + dy * step;
          const curCellX = Math.round(pose.gx);
          const curCellY = Math.round(pose.gy);
          let allowedMinX = curCellX - 0.45;
          let allowedMaxX = curCellX + 0.45;
          let allowedMinY = curCellY - 0.45;
          let allowedMaxY = curCellY + 0.45;
          if (
            hasTraversableTileAt(
              tiles,
              surfaceDataRef.current,
              pose.gx,
              pose.gy,
              curCellX + 1,
              curCellY,
              avatarGroundProfileRef.current.stepHeight,
            )
          ) {
            allowedMaxX = Math.max(allowedMaxX, curCellX + 1 + 0.45);
          }
          if (
            hasTraversableTileAt(
              tiles,
              surfaceDataRef.current,
              pose.gx,
              pose.gy,
              curCellX - 1,
              curCellY,
              avatarGroundProfileRef.current.stepHeight,
            )
          ) {
            allowedMinX = Math.min(allowedMinX, curCellX - 1 - 0.45);
          }
          if (
            hasTraversableTileAt(
              tiles,
              surfaceDataRef.current,
              pose.gx,
              pose.gy,
              curCellX,
              curCellY + 1,
              avatarGroundProfileRef.current.stepHeight,
            )
          ) {
            allowedMaxY = Math.max(allowedMaxY, curCellY + 1 + 0.45);
          }
          if (
            hasTraversableTileAt(
              tiles,
              surfaceDataRef.current,
              pose.gx,
              pose.gy,
              curCellX,
              curCellY - 1,
              avatarGroundProfileRef.current.stepHeight,
            )
          ) {
            allowedMinY = Math.min(allowedMinY, curCellY - 1 - 0.45);
          }
          nx = clamp(nx, allowedMinX, allowedMaxX);
          ny = clamp(ny, allowedMinY, allowedMaxY);
          const dir: "left" | "right" = dx < 0 ? "left" : "right";
          poseRef.current = {
            ...pose,
            gx: nx,
            gy: ny,
            direction: dir,
            animState: "walk",
            isManualMove: false,
            locomotionStrafe: "none",
          };
        }
      } else if (phase === "paused") {
        patrolPauseTimerRef.current -= dt;
        poseRef.current = { ...pose, animState: "idle", isManualMove: false, locomotionStrafe: "none" };
        if (patrolPauseTimerRef.current <= 0) {
          const next = pickRandomTile(tileListRef.current, pose.gx, pose.gy);
          patrolTargetRef.current = next;
          patrolPhaseRef.current = "walking";
        }
      } else if (idleSeconds >= IDLE_AUTOPATROL_DELAY_SEC && tileListRef.current.length > 0) {
        const next = pickRandomTile(tileListRef.current, pose.gx, pose.gy);
        patrolTargetRef.current = next;
        patrolPhaseRef.current = "walking";
      } else {
        poseRef.current = { ...pose, animState: "idle", isManualMove: false, locomotionStrafe: "none" };
      }
      }
    }

    if (tpsActive) {
      const actionFacingLocked =
        (poseRef.current.animState === "jump" ||
          poseRef.current.animState === "roll" ||
          poseRef.current.animState === "spell" ||
          poseRef.current.animState === "chop") &&
        poseRef.current.facingAngle != null;
      const nextFacingAngle = actionFacingLocked
        ? poseRef.current.facingAngle
        : (resolvedTpsFacingAngle ?? tpsFacingYawRef.current ?? tpsViewYaw);
      poseRef.current = {
        ...poseRef.current,
        facingAngle: nextFacingAngle,
      };
      tpsFacingYawRef.current = nextFacingAngle;
      wasTpsActiveRef.current = true;
    } else if (wasTpsActiveRef.current) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      tpsFacingYawRef.current = undefined;
      fightManTurnStepRef.current = null;
      fightManTurnTimeRef.current = 0;
      fightManTurnStartFacingRef.current = null;
      poseRef.current = {
        ...poseRef.current,
        facingAngle: undefined,
        fightManTurnStep: undefined,
      };
      wasTpsActiveRef.current = false;
      inputStuckTimerRef.current = 0;
      inputStuckRoundedKeyRef.current = "";
    }

    {
      const p = poseRef.current;
      const supportY = getSupportedSurfaceYAtWorldGrid(surfaceDataRef.current, p.gx, p.gy);
      const fallbackSurfaceY = getSurfaceYAtWorldGrid(surfaceDataRef.current, p.gx, p.gy);
      const currentWorldY = p.worldY ?? p.surfaceY ?? fallbackSurfaceY;
      let grounded = p.grounded ?? true;
      let worldY = currentWorldY;
      let verticalVelocity = p.verticalVelocity ?? 0;

      if (grounded) {
        if (supportY != null) {
          worldY = supportY;
          verticalVelocity = 0;
          lastSafeGroundRef.current = { gx: p.gx, gy: p.gy, worldY: supportY };
        } else {
          grounded = false;
          verticalVelocity = Math.min(verticalVelocity, 0);
        }
      }

      if (!grounded) {
        const prevVerticalVelocity = verticalVelocity;
        worldY += prevVerticalVelocity * dt;
        verticalVelocity = prevVerticalVelocity - GRAVITY * dt;
        if (supportY != null && prevVerticalVelocity <= 0 && worldY <= supportY + LAND_SNAP_DISTANCE) {
          grounded = true;
          worldY = supportY;
          verticalVelocity = 0;
          lastSafeGroundRef.current = { gx: p.gx, gy: p.gy, worldY: supportY };
          if (p.animState === "jump") {
            p.animState = hasInput ? (isRunning ? "run" : "walk") : "idle";
            p.isManualMove = hasInput;
            p.locomotionStrafe = "none";
            p.fightManTurnStep = undefined;
          }
        } else if (
          p.animState !== "roll" &&
          p.animState !== "spell" &&
          p.animState !== "chop" &&
          p.animState !== "attack"
        ) {
          p.animState = "jump";
        }
      }

      if (worldY < surfaceDataRef.current.safeFloorY - FALL_RESET_MARGIN) {
        const safe = lastSafeGroundRef.current;
        chopTimerRef.current = 0;
        poseRef.current = {
          ...p,
          gx: safe.gx,
          gy: safe.gy,
          surfaceY: safe.worldY,
          worldY: safe.worldY,
          verticalVelocity: 0,
          grounded: true,
          animState: "idle",
          isManualMove: false,
          locomotionStrafe: "none",
        };
        tpsVelocityRef.current = { x: 0, y: 0 };
        patrolPhaseRef.current = "inactive";
      } else {
        poseRef.current = {
          ...p,
          surfaceY: supportY ?? fallbackSurfaceY,
          worldY,
          verticalVelocity,
          grounded,
        };
      }
    }

    if (
      (poseRef.current.grounded ?? true) &&
      rollTimerRef.current <= 0 &&
      !isMiniActionActiveRef.current
    ) {
      const walkable = tileSetRef.current;
      const blocked = blockedFootprintRef.current;
      const p = poseRef.current;
      if (!isAvatarCellValid(walkable, blocked, p.gx, p.gy)) {
        const safe = findNearestValidCell(p.gx, p.gy, walkable, blocked);
        const safeWorldY = getSurfaceYAtWorldGrid(surfaceDataRef.current, safe.gx, safe.gy);
        lastSafeGroundRef.current = { gx: safe.gx, gy: safe.gy, worldY: safeWorldY };
        const keepChop = chopTimerRef.current > 0 && p.animState === "chop";
        poseRef.current = {
          ...p,
          gx: safe.gx,
          gy: safe.gy,
          surfaceY: safeWorldY,
          worldY: safeWorldY,
          verticalVelocity: 0,
          grounded: true,
          animState: keepChop
            ? "chop"
            : p.animState === "walk" || p.animState === "run"
              ? p.animState
              : "idle",
          chopDuration: keepChop ? activeChopPlaybackSecRef.current : undefined,
          chopSwingId: keepChop ? chopSwingSerialRef.current : undefined,
          isManualMove: keepChop ? false : hasInput,
          locomotionStrafe:
            keepChop || (p.animState !== "walk" && p.animState !== "run")
              ? "none"
              : (p.locomotionStrafe ?? "none"),
        };
        tpsVelocityRef.current = { x: 0, y: 0 };
        inputStuckTimerRef.current = 0;
        inputStuckRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
      } else if (
        hasInput &&
        chopTimerRef.current <= 0 &&
        spellTimerRef.current <= 0 &&
        p.animState !== "jump" &&
        p.animState !== "roll"
      ) {
        const rk = `${Math.round(p.gx)},${Math.round(p.gy)}`;
        const frameMoved = Math.hypot(poseRef.current.gx - frameStartGx, poseRef.current.gy - frameStartGy);
        const lowProgress = tpsActive
          ? Math.hypot(tpsVelocityRef.current.x, tpsVelocityRef.current.y) < TPS_STUCK_VEL_EPS
          : frameMoved < ISO_FRAME_MOVE_EPS;
        if (lowProgress) {
          if (rk === inputStuckRoundedKeyRef.current) inputStuckTimerRef.current += dt;
          else {
            inputStuckRoundedKeyRef.current = rk;
            inputStuckTimerRef.current = 0;
          }
          if (inputStuckTimerRef.current >= INPUT_STUCK_UNSTICK_SEC) {
            const safe = findNearestValidCell(p.gx, p.gy, walkable, blocked);
            const safeWorldY = getSurfaceYAtWorldGrid(surfaceDataRef.current, safe.gx, safe.gy);
            lastSafeGroundRef.current = { gx: safe.gx, gy: safe.gy, worldY: safeWorldY };
            poseRef.current = {
              ...poseRef.current,
              gx: safe.gx,
              gy: safe.gy,
              surfaceY: safeWorldY,
              worldY: safeWorldY,
              verticalVelocity: 0,
              grounded: true,
              animState: "idle",
              isManualMove: false,
              locomotionStrafe: "none",
            };
            tpsVelocityRef.current = { x: 0, y: 0 };
            inputStuckTimerRef.current = 0;
            inputStuckRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
          }
        } else {
          inputStuckRoundedKeyRef.current = rk;
          inputStuckTimerRef.current = 0;
        }
      } else {
        inputStuckTimerRef.current = 0;
      }
    }

    const next = syncPoseWithSurface({ ...poseRef.current, tpsRmbLook: tpsRmbLookLive });

    {
      const sfx01 = Math.max(0, Math.min(100, playerSfxVolumeRef.current)) / 100;
      const shouldFootstep =
        (next.grounded ?? true) && (next.animState === "walk" || next.animState === "run");

      if (shouldFootstep) {
        const pGx = footstepPrevGxRef.current;
        const pGy = footstepPrevGyRef.current;
        const deltaWorld = Math.hypot(next.gx - pGx, next.gy - pGy) * TILE_UNIT_SIZE;
        footstepDistAccumRef.current += deltaWorld;
        const threshold =
          TILE_UNIT_SIZE *
          (next.animState === "run" ? FOOTSTEP_RUN_DIST_SCALE : FOOTSTEP_WALK_DIST_SCALE);
        if (footstepDistAccumRef.current >= threshold && sfx01 > 0) {
          const cam = tpsCameraStateRefRef.current?.current;
          const tpsAudible = cam?.active === true && cam.viewYaw != null;
          const camGain = tpsAudible ? FOOTSTEP_TPS_CAMERA_GAIN : FOOTSTEP_ISO_CAMERA_GAIN;
          playPlayerFootstep(sfx01 * FOOTSTEP_VOLUME_GAIN * camGain);
          footstepDistAccumRef.current -= threshold;
        }
        footstepPrevGxRef.current = next.gx;
        footstepPrevGyRef.current = next.gy;
      } else {
        footstepDistAccumRef.current = 0;
        footstepPrevGxRef.current = next.gx;
        footstepPrevGyRef.current = next.gy;
      }
    }

    const prev = prevPoseRef.current;
    const surfaceChanged = Math.abs((next.surfaceY ?? 0) - (prev.surfaceY ?? 0)) > 0.001;
    const worldYChanged = Math.abs((next.worldY ?? 0) - (prev.worldY ?? 0)) > 0.001;
    const groundedChanged = (next.grounded ?? true) !== (prev.grounded ?? true);
    const facingChanged =
      (next.facingAngle == null && prev.facingAngle != null) ||
      (next.facingAngle != null && prev.facingAngle == null) ||
      (next.facingAngle != null &&
        prev.facingAngle != null &&
        Math.abs(next.facingAngle - prev.facingAngle) > 0.001);
    const chopSwingChanged = (next.chopSwingId ?? 0) !== (prev.chopSwingId ?? 0);
    const strafeChanged =
      (next.locomotionStrafe ?? "none") !== (prev.locomotionStrafe ?? "none");
    const fightManTurnChanged =
      (next.fightManTurnStep ?? null) !== (prev.fightManTurnStep ?? null);
    const tpsRmbLookChanged = (next.tpsRmbLook ?? false) !== (prev.tpsRmbLook ?? false);
    if (
      next.gx !== prev.gx ||
      next.gy !== prev.gy ||
      next.direction !== prev.direction ||
      next.animState !== prev.animState ||
      next.isManualMove !== prev.isManualMove ||
      facingChanged ||
      surfaceChanged ||
      worldYChanged ||
      groundedChanged ||
      chopSwingChanged ||
      strafeChanged ||
      fightManTurnChanged ||
      tpsRmbLookChanged
    ) {
      prevPoseRef.current = next;
      // Movement runs in R3F `useFrame`; `setState` alone can commit after this frame's GL draw.
      // Jump clips often finish before landing; one stale "jump" props frame leaves a T-pose gap.
      const leavingJumpAnim = prev.animState === "jump" && next.animState !== "jump";
      if (leavingJumpAnim) {
        flushSync(() => setRenderPose(next));
      } else {
        setRenderPose(next);
      }
    }
  });

  useFrame(() => {
    const out = movementDebugRefRef.current;
    if (!out) return;
    const ts = tpsCameraStateRefRef.current?.current;
    out.current = {
      animState: poseRef.current.animState,
      chopTimer: chopTimerRef.current,
      chopPlaybackSec: activeChopPlaybackSecRef.current,
      rollTimer: rollTimerRef.current,
      mouseForwardActive: Boolean(ts?.mouseForwardActive),
      steeringActive: Boolean(ts?.steeringActive),
    };
  }, -10);

  return renderPose;
}
