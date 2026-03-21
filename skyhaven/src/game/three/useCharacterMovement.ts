import { useRef, useEffect, useState, useMemo, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { AssetKey, IslandMap } from "../types";
import { TREE_TILES, FARM_TILES } from "../types";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { TILE_UNIT_SIZE } from "./assets3d";
import {
  buildBlockedFootprintSet,
  findNearestValidCell,
  isAvatarCellValid,
  resolveReachableTargetValid,
} from "./islandWalkability";
import type * as THREE from "three";

export type CharacterPose3D = {
  gx: number;
  gy: number;
  direction: "left" | "right";
  animState: "idle" | "walk" | "run" | "jump" | "attack" | "chop" | "spell" | "roll";
  /** true when moving from WASD; false when patrol or idle (used so look direction follows mouse only on manual move) */
  isManualMove: boolean;
  /** set during jump; used by CharacterModel for arc timing */
  jumpDuration?: number;
  /** set during roll; used by CharacterModel for clip timing */
  rollDuration?: number;
  /** when set, overrides direction-based rotation to face this angle (radians) */
  facingAngle?: number;
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
const IDLE_AUTOPATROL_DELAY_SEC = 7;
const PATROL_PAUSE_MIN = 2;
const PATROL_PAUSE_MAX = 5;
const JUMP_DURATION = 0.52;
const JUMP_DISTANCE_MIN = 0.35;
const JUMP_DISTANCE_MAX = 2.0;
const JUMP_DISTANCE_KEYBOARD = 0.85;
const ROLL_DURATION = 0.96;
const ROLL_DISTANCE = 1.05;
const INPUT_STUCK_UNSTICK_SEC = 2.5;
const TPS_STUCK_VEL_EPS = 0.04;
const ISO_FRAME_MOVE_EPS = 0.002;

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

function hasTileAt(tileSet: Set<string>, gx: number, gy: number): boolean {
  return tileSet.has(`${Math.round(gx)},${Math.round(gy)}`);
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
  onTileAction?: (actionType: "woodcutting" | "harvesting", tileGx: number, tileGy: number) => void;
  onCancelMiniAction?: () => void;
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
};

export function useCharacterMovement(
  island: IslandMap,
  _characterActive: boolean,
  options: CharacterMovementOptions = {},
): CharacterPose3D {
  const spawn = resolveSpawn(island);
  const tileSet = useMemo(() => buildTileSet(island), [island]);
  const blockedFootprintSet = useMemo(() => buildBlockedFootprintSet(island), [island]);
  const tileList = useMemo(
    () => island.tiles.filter((t) => !t.blocked).map((t) => ({ gx: t.gx, gy: t.gy })),
    [island],
  );
  const tileTypeMap = useMemo(() => buildTileTypeMap(island), [island]);

  const poseRef = useRef<CharacterPose3D>({
    gx: spawn.gx,
    gy: spawn.gy,
    direction: "right",
    animState: "idle",
    isManualMove: false,
  });
  const keysRef = useRef<MovementKeys>({ w: false, a: false, s: false, d: false });
  const actionKeysRef = useRef<ActionKeys>({ shift: false, space: false });
  const chopTimerRef = useRef<number>(0);
  const autoChopCooldownRef = useRef<number>(0);
  const tileSetRef = useRef(tileSet);
  tileSetRef.current = tileSet;
  const blockedFootprintRef = useRef(blockedFootprintSet);
  blockedFootprintRef.current = blockedFootprintSet;
  const tileListRef = useRef(tileList);
  tileListRef.current = tileList;
  const tileTypeMapRef = useRef(tileTypeMap);
  tileTypeMapRef.current = tileTypeMap;
  const islandRef = useRef(island);
  islandRef.current = island;
  const onTileActionRef = useRef(options.onTileAction);
  onTileActionRef.current = options.onTileAction;
  const onCancelMiniActionRef = useRef(options.onCancelMiniAction);
  onCancelMiniActionRef.current = options.onCancelMiniAction;
  const isMiniActionActiveRef = useRef(options.isMiniActionActive ?? false);
  isMiniActionActiveRef.current = options.isMiniActionActive ?? false;
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
  const spellTimerRef = useRef<number>(0);
  const [renderPose, setRenderPose] = useState<CharacterPose3D>(poseRef.current);
  const prevPoseRef = useRef<CharacterPose3D>(poseRef.current);

  const jumpTimerRef = useRef<number>(0);
  const jumpDurationRef = useRef<number>(JUMP_DURATION);
  const jumpStartRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const jumpTargetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const rollTimerRef = useRef<number>(0);
  const rollStartRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const rollTargetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const lastMoveDir = useRef<{ dx: number; dy: number }>({ dx: 1, dy: 0 });
  const tpsVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const tpsFacingYawRef = useRef<number | undefined>(undefined);
  const wasTpsActiveRef = useRef(false);

  const inputStuckRoundedKeyRef = useRef("");
  const inputStuckTimerRef = useRef(0);

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
    poseRef.current = { gx: sp.gx, gy: sp.gy, direction: "right", animState: "idle", isManualMove: false };
    tpsVelocityRef.current = { x: 0, y: 0 };
    tpsFacingYawRef.current = undefined;
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
        if (pressed && jumpTimerRef.current <= 0) {
          const pose = poseRef.current;
          const keys = keysRef.current;
          let dx = 0, dy = 0;
          const tpsCameraState = getActiveTpsCameraState();
          const tpsViewYaw = tpsCameraState?.viewYaw ?? null;
          const mousePos = mouseGroundRefRef.current?.current;
          const charX = pose.gx * TILE_UNIT_SIZE;
          const charZ = pose.gy * TILE_UNIT_SIZE;
          if (tpsViewYaw != null && (keys.w || keys.s || keys.a || keys.d)) {
            const basis = getBasisFromYaw(tpsViewYaw);
            if (keys.w) { dx += basis.forwardX; dy += basis.forwardZ; }
            if (keys.s) { dx -= basis.forwardX; dy -= basis.forwardZ; }
            if (keys.a) { dx -= basis.leftX; dy -= basis.leftZ; }
            if (keys.d) { dx += basis.leftX; dy += basis.leftZ; }
          } else if (mousePos && (keys.w || keys.s || keys.a || keys.d) && (Math.abs(mousePos.x - charX) > 1e-5 || Math.abs(mousePos.z - charZ) > 1e-5)) {
            const mx = mousePos.x - charX;
            const mz = mousePos.z - charZ;
            const len = Math.hypot(mx, mz);
            if (len > 1e-5) {
              const fwdX = mx / len;
              const fwdZ = mz / len;
              const leftX = -fwdZ;
              const leftZ = fwdX;
              if (keys.w) { dx += fwdX; dy += fwdZ; }
              if (keys.s) { dx -= fwdX; dy -= fwdZ; }
              if (keys.a) { dx += leftX; dy += leftZ; }
              if (keys.d) { dx -= leftX; dy -= leftZ; }
            }
          }
          if (dx === 0 && dy === 0) {
            if (keys.w) dy -= 1;
            if (keys.s) dy += 1;
            if (keys.a) dx -= 1;
            if (keys.d) dx += 1;
          }

          const startGx = pose.gx;
          const startGy = pose.gy;

          if (dx === 0 && dy === 0) {
            jumpStartRef.current = { gx: startGx, gy: startGy };
            jumpTargetRef.current = { gx: startGx, gy: startGy };
            jumpDurationRef.current = JUMP_DURATION;
            jumpTimerRef.current = JUMP_DURATION;
            const facingAngle =
              tpsViewYaw != null ? (tpsFacingYawRef.current ?? tpsViewYaw) : pose.facingAngle;
            if (tpsViewYaw != null) {
              tpsFacingYawRef.current = facingAngle;
            }
            tpsVelocityRef.current = { x: 0, y: 0 };
            poseRef.current = {
              ...pose,
              gx: startGx,
              gy: startGy,
              animState: "jump",
              isManualMove: true,
              jumpDuration: JUMP_DURATION,
              facingAngle,
            };
          } else {
            const len = Math.hypot(dx, dy);
            const dirX = dx / len;
            const dirY = dy / len;

            let jumpDist: number;
            if (tpsViewYaw != null) {
              jumpDist = JUMP_DISTANCE_KEYBOARD;
            } else if (mousePos && (keys.w || keys.s || keys.a || keys.d)) {
              const mouseDist = Math.hypot(mousePos.x - charX, mousePos.z - charZ);
              jumpDist = clamp(mouseDist * 0.55, JUMP_DISTANCE_MIN, JUMP_DISTANCE_MAX);
            } else {
              jumpDist = JUMP_DISTANCE_KEYBOARD;
            }

            const targetGx = startGx + dirX * jumpDist;
            const targetGy = startGy + dirY * jumpDist;
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
            const landGx = landing.gx;
            const landGy = landing.gy;
            const jumpDistActual = Math.hypot(landGx - startGx, landGy - startGy);
            jumpDurationRef.current = JUMP_DURATION * (0.75 + 0.35 * clamp(jumpDistActual / JUMP_DISTANCE_MAX, 0, 1));
            jumpStartRef.current = { gx: startGx, gy: startGy };
            jumpTargetRef.current = { gx: landGx, gy: landGy };
            jumpTimerRef.current = jumpDurationRef.current;
            const dir: "left" | "right" = dirX > 0 ? "right" : dirX < 0 ? "left" : pose.direction;
            const jumpFacingAngle = getFacingAngleFromVector(dirX, dirY);
            if (tpsViewYaw != null) {
              tpsFacingYawRef.current = jumpFacingAngle;
            }
            tpsVelocityRef.current = { x: 0, y: 0 };
            poseRef.current = {
              ...pose,
              gx: startGx,
              gy: startGy,
              direction: dir,
              animState: "jump",
              isManualMove: true,
              jumpDuration: jumpDurationRef.current,
              facingAngle: jumpFacingAngle,
            };
          }
          setRenderPose({ ...poseRef.current });
        }
        actionKeysRef.current.space = pressed;
        return;
      }

      if (k === "g") {
        e.preventDefault();
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (pressed && chopTimerRef.current <= 0) {
          chopTimerRef.current = 0.92;
        }
        return;
      }

      if (k === "v") {
        e.preventDefault();
        lastManualInputRef.current = performance.now();
        patrolPhaseRef.current = "inactive";
        if (pressed && rollTimerRef.current <= 0 && jumpTimerRef.current <= 0) {
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
          const landGx = landing.gx;
          const landGy = landing.gy;
          rollStartRef.current = { gx: startGx, gy: startGy };
          rollTargetRef.current = { gx: landGx, gy: landGy };
          rollTimerRef.current = ROLL_DURATION;
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
          };
          setRenderPose({ ...poseRef.current });
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
          };
          setRenderPose({ ...poseRef.current });
          if (spellCastRefRef.current) {
            spellCastRefRef.current.current = {
              posX: charX + dirX * 0.4,
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
          poseRef.current = { ...pose, direction: dir, isManualMove: false, facingAngle };
          chopTimerRef.current = 0.92;
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
            poseRef.current = { ...pose, direction: dir, isManualMove: false, facingAngle };
            setRenderPose({ ...poseRef.current });
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
            poseRef.current = { ...pose, direction: dir, isManualMove: false, facingAngle };
            setRenderPose({ ...poseRef.current });
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
                poseRef.current = { ...pose, isManualMove: false, facingAngle: angle };
                setRenderPose({ ...poseRef.current });
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
        tpsVelocityRef.current = { x: 0, y: 0 };
        const cur = poseRef.current;
        poseRef.current = {
          ...cur,
          gx: safe.gx,
          gy: safe.gy,
          animState: "idle",
          isManualMove: false,
        };
        inputStuckTimerRef.current = 0;
        inputStuckRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
        prevPoseRef.current = { ...poseRef.current };
        setRenderPose({ ...poseRef.current });
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
      e.preventDefault();
      lastManualInputRef.current = performance.now();
      patrolPhaseRef.current = "inactive";
      if (chopTimerRef.current <= 0) {
        chopTimerRef.current = 0.92;
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
        chopTimerRef.current = 0.92;
        autoChopCooldownRef.current = 2 + Math.random() * 2;
      }
    }

    const pose = poseRef.current;
    const isRunning = actionKeysRef.current.shift;
    const isChopping = chopTimerRef.current > 0;
    const tiles = tileSetRef.current;
    let resolvedTpsFacingAngle = pose.facingAngle;

    if (isMiniActionActiveRef.current) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      if (isChopping) {
        poseRef.current = { ...pose, animState: "chop", isManualMove: false };
      } else {
        poseRef.current = { ...pose, animState: "idle", isManualMove: false };
      }
      if (tpsActive) {
        const facingAngle =
          resolvedTpsFacingAngle ??
          tpsFacingYawRef.current ??
          poseRef.current.facingAngle ??
          tpsViewYaw;
        poseRef.current = { ...poseRef.current, facingAngle };
        tpsFacingYawRef.current = facingAngle;
        wasTpsActiveRef.current = true;
      } else if (wasTpsActiveRef.current) {
        tpsVelocityRef.current = { x: 0, y: 0 };
        tpsFacingYawRef.current = undefined;
        poseRef.current = { ...poseRef.current, facingAngle: undefined };
        wasTpsActiveRef.current = false;
      }
      prevPoseRef.current = { ...poseRef.current };
      setRenderPose({ ...poseRef.current });
      return;
    }

    if (jumpTimerRef.current > 0) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      jumpTimerRef.current -= dt;
      const dur = jumpDurationRef.current;
      const t = clamp(1 - jumpTimerRef.current / dur, 0, 1);
      const start = jumpStartRef.current;
      const target = jumpTargetRef.current;
      const gx = start.gx + (target.gx - start.gx) * t;
      const gy = start.gy + (target.gy - start.gy) * t;
      poseRef.current = { ...pose, gx, gy, animState: "jump", isManualMove: true, jumpDuration: dur };
      resolvedTpsFacingAngle = poseRef.current.facingAngle;
      if (jumpTimerRef.current <= 0) {
        poseRef.current = {
          ...poseRef.current,
          gx: target.gx,
          gy: target.gy,
          animState: hasInput ? (isRunning ? "run" : "walk") : "idle",
          isManualMove: hasInput,
        };
        prevPoseRef.current = { ...poseRef.current };
        setRenderPose({ ...poseRef.current });
      }
    } else if (rollTimerRef.current > 0) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      rollTimerRef.current -= dt;
      const t = clamp(1 - rollTimerRef.current / ROLL_DURATION, 0, 1);
      const start = rollStartRef.current;
      const target = rollTargetRef.current;
      const easeT = 1 - (1 - t) * (1 - t);
      const gx = start.gx + (target.gx - start.gx) * easeT;
      const gy = start.gy + (target.gy - start.gy) * easeT;
      poseRef.current = { ...pose, gx, gy, animState: "roll", isManualMove: true };
      resolvedTpsFacingAngle = poseRef.current.facingAngle;
      if (rollTimerRef.current <= 0) {
        poseRef.current = {
          ...poseRef.current,
          gx: target.gx,
          gy: target.gy,
          animState: hasInput ? (isRunning ? "run" : "walk") : "idle",
          isManualMove: hasInput,
        };
        prevPoseRef.current = { ...poseRef.current };
        setRenderPose({ ...poseRef.current });
      }
    } else if (isChopping) {
      if (tpsActive && mouseForwardActive) {
        chopTimerRef.current = 0;
        poseRef.current = { ...pose, animState: "idle" };
      } else {
      tpsVelocityRef.current = { x: 0, y: 0 };
      poseRef.current = { ...pose, animState: "chop" };
      resolvedTpsFacingAngle = poseRef.current.facingAngle;
      }
    } else if (spellTimerRef.current > 0) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      poseRef.current = { ...pose, animState: "spell" };
      resolvedTpsFacingAngle = poseRef.current.facingAngle;
    } else if (tpsActive) {
      let moveX = 0;
      let moveY = 0;
      const basis = getBasisFromYaw(tpsViewYaw);
      if (keys.w || mouseForwardActive) { moveX += basis.forwardX; moveY += basis.forwardZ; }
      if (keys.s) { moveX -= basis.forwardX; moveY -= basis.forwardZ; }
      if (keys.a) { moveX -= basis.leftX; moveY -= basis.leftZ; }
      if (keys.d) { moveX += basis.leftX; moveY += basis.leftZ; }

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

      const targetCellX = Math.round(nx);
      const targetCellY = Math.round(ny);
      if (!hasTileAt(tiles, targetCellX, targetCellY)) {
        const canMoveX = hasTileAt(tiles, Math.round(pose.gx + velX * dt), Math.round(pose.gy));
        const canMoveY = hasTileAt(tiles, Math.round(pose.gx), Math.round(pose.gy + velY * dt));
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

      const curCellX = Math.round(pose.gx);
      const curCellY = Math.round(pose.gy);
      let allowedMinX = curCellX - 0.45;
      let allowedMaxX = curCellX + 0.45;
      let allowedMinY = curCellY - 0.45;
      let allowedMaxY = curCellY + 0.45;
      if (hasTileAt(tiles, curCellX + 1, curCellY)) allowedMaxX = Math.max(allowedMaxX, curCellX + 1 + 0.45);
      if (hasTileAt(tiles, curCellX - 1, curCellY)) allowedMinX = Math.min(allowedMinX, curCellX - 1 - 0.45);
      if (hasTileAt(tiles, curCellX, curCellY + 1)) allowedMaxY = Math.max(allowedMaxY, curCellY + 1 + 0.45);
      if (hasTileAt(tiles, curCellX, curCellY - 1)) allowedMinY = Math.min(allowedMinY, curCellY - 1 - 0.45);
      const clampedX = clamp(nx, allowedMinX, allowedMaxX);
      const clampedY = clamp(ny, allowedMinY, allowedMaxY);
      if (clampedX !== nx) velX = 0;
      if (clampedY !== ny) velY = 0;
      nx = clampedX;
      ny = clampedY;
      tpsVelocityRef.current = { x: velX, y: velY };

      const actualSpeed = Math.hypot(velX, velY);
      let dirStr: "left" | "right" = pose.direction;
      if (velX > 0.01) dirStr = "right";
      else if (velX < -0.01) dirStr = "left";
      poseRef.current = {
        ...pose,
        gx: nx,
        gy: ny,
        direction: dirStr,
        animState:
          actualSpeed > TPS_MOVE_ANIM_EPSILON
            ? actualSpeed > MANUAL_GRID_SPEED * 1.5
              ? "run"
              : "walk"
            : "idle",
        isManualMove: hasInput || actualSpeed > TPS_MOVE_ANIM_EPSILON,
      };
      if (actualSpeed > TPS_MOVE_ANIM_EPSILON) {
        resolvedTpsFacingAngle = getFacingAngleFromVector(velX, velY);
      } else {
        resolvedTpsFacingAngle = tpsFacingYawRef.current ?? pose.facingAngle ?? tpsViewYaw;
      }
    } else if (hasInput) {
      tpsVelocityRef.current = { x: 0, y: 0 };
      let mgx = 0, mgy = 0;
      const mousePos = mouseGroundRef?.current;
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
          if (keys.w) { mgx += fwdX; mgy += fwdZ; }
          if (keys.s) { mgx -= fwdX; mgy -= fwdZ; }
          if (keys.a) { mgx += leftX; mgy += leftZ; }
          if (keys.d) { mgx -= leftX; mgy -= leftZ; }
        }
      }
      if (mgx === 0 && mgy === 0) {
        if (keys.w) { mgy -= 1; }
        if (keys.s) { mgy += 1; }
        if (keys.a) { mgx -= 1; }
        if (keys.d) { mgx += 1; }
      }

      if (mgx !== 0 || mgy !== 0) {
        lastMoveDir.current = { dx: mgx, dy: mgy };
      }

      const len = Math.hypot(mgx, mgy);
      if (len < 0.0001) {
        poseRef.current = { ...pose, animState: "idle", isManualMove: false };
      } else {
        const speed = isRunning ? MANUAL_RUN_GRID_SPEED : MANUAL_GRID_SPEED;
        const step = (speed * dt) / len;
        let nx = pose.gx + mgx * step;
        let ny = pose.gy + mgy * step;

        const targetCellX = Math.round(nx);
        const targetCellY = Math.round(ny);
        if (!hasTileAt(tiles, targetCellX, targetCellY)) {
          const canMoveX = hasTileAt(tiles, Math.round(pose.gx + mgx * step), Math.round(pose.gy));
          const canMoveY = hasTileAt(tiles, Math.round(pose.gx), Math.round(pose.gy + mgy * step));
          if (canMoveX && !canMoveY) {
            ny = pose.gy;
          } else if (canMoveY && !canMoveX) {
            nx = pose.gx;
          } else {
            nx = pose.gx;
            ny = pose.gy;
          }
        }

        const curCellX = Math.round(pose.gx);
        const curCellY = Math.round(pose.gy);
        let allowedMinX = curCellX - 0.45;
        let allowedMaxX = curCellX + 0.45;
        let allowedMinY = curCellY - 0.45;
        let allowedMaxY = curCellY + 0.45;
        if (hasTileAt(tiles, curCellX + 1, curCellY)) allowedMaxX = Math.max(allowedMaxX, curCellX + 1 + 0.45);
        if (hasTileAt(tiles, curCellX - 1, curCellY)) allowedMinX = Math.min(allowedMinX, curCellX - 1 - 0.45);
        if (hasTileAt(tiles, curCellX, curCellY + 1)) allowedMaxY = Math.max(allowedMaxY, curCellY + 1 + 0.45);
        if (hasTileAt(tiles, curCellX, curCellY - 1)) allowedMinY = Math.min(allowedMinY, curCellY - 1 - 0.45);
        nx = clamp(nx, allowedMinX, allowedMaxX);
        ny = clamp(ny, allowedMinY, allowedMaxY);

        let dirStr: "left" | "right" = pose.direction;
        if (mgx > 0.01) dirStr = "right";
        else if (mgx < -0.01) dirStr = "left";
        poseRef.current = {
          gx: nx,
          gy: ny,
          direction: dirStr,
          animState: isRunning ? "run" : "walk",
          isManualMove: true,
        };
      }
    } else {
      tpsVelocityRef.current = { x: 0, y: 0 };
      const idleSeconds = (performance.now() - lastManualInputRef.current) / 1000;
      const phase = patrolPhaseRef.current;

      if (phase === "walking") {
        const target = patrolTargetRef.current;
        const dx = target.gx - pose.gx;
        const dy = target.gy - pose.gy;
        const dist = Math.hypot(dx, dy);

        if (dist < 0.08) {
          poseRef.current = { ...pose, gx: target.gx, gy: target.gy, animState: "idle", isManualMove: false };
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
          if (hasTileAt(tiles, curCellX + 1, curCellY)) allowedMaxX = Math.max(allowedMaxX, curCellX + 1 + 0.45);
          if (hasTileAt(tiles, curCellX - 1, curCellY)) allowedMinX = Math.min(allowedMinX, curCellX - 1 - 0.45);
          if (hasTileAt(tiles, curCellX, curCellY + 1)) allowedMaxY = Math.max(allowedMaxY, curCellY + 1 + 0.45);
          if (hasTileAt(tiles, curCellX, curCellY - 1)) allowedMinY = Math.min(allowedMinY, curCellY - 1 - 0.45);
          nx = clamp(nx, allowedMinX, allowedMaxX);
          ny = clamp(ny, allowedMinY, allowedMaxY);
          const dir: "left" | "right" = dx < 0 ? "left" : "right";
          poseRef.current = { gx: nx, gy: ny, direction: dir, animState: "walk", isManualMove: false };
        }
      } else if (phase === "paused") {
        patrolPauseTimerRef.current -= dt;
        poseRef.current = { ...pose, animState: "idle", isManualMove: false };
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
        poseRef.current = { ...pose, animState: "idle", isManualMove: false };
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
      poseRef.current = { ...poseRef.current, facingAngle: undefined };
      wasTpsActiveRef.current = false;
    }

    if (
      jumpTimerRef.current <= 0 &&
      rollTimerRef.current <= 0 &&
      !isMiniActionActiveRef.current
    ) {
      const walkable = tileSetRef.current;
      const blocked = blockedFootprintRef.current;
      const p = poseRef.current;
      if (!isAvatarCellValid(walkable, blocked, p.gx, p.gy)) {
        const safe = findNearestValidCell(p.gx, p.gy, walkable, blocked);
        poseRef.current = {
          ...p,
          gx: safe.gx,
          gy: safe.gy,
          animState:
            p.animState === "walk" || p.animState === "run" ? p.animState : "idle",
          isManualMove: hasInput,
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
            poseRef.current = {
              ...poseRef.current,
              gx: safe.gx,
              gy: safe.gy,
              animState: "idle",
              isManualMove: false,
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

    const next = { ...poseRef.current };
    const prev = prevPoseRef.current;
    const facingChanged =
      (next.facingAngle == null && prev.facingAngle != null) ||
      (next.facingAngle != null && prev.facingAngle == null) ||
      (next.facingAngle != null &&
        prev.facingAngle != null &&
        Math.abs(next.facingAngle - prev.facingAngle) > 0.001);
    if (
      next.gx !== prev.gx ||
      next.gy !== prev.gy ||
      next.direction !== prev.direction ||
      next.animState !== prev.animState ||
      next.isManualMove !== prev.isManualMove ||
      facingChanged
    ) {
      prevPoseRef.current = next;
      setRenderPose(next);
    }
  });

  return renderPose;
}
