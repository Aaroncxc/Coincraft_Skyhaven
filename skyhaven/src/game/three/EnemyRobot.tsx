import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import { ENEMY_ROBOT_MODELS, TILE_UNIT_SIZE } from "./assets3d";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import { getNpcGroundProfile } from "./avatarGrounding";
import { MINE_TILES, type IslandMap } from "../types";
import {
  buildMiningManPatrolBlockedSet,
  buildWalkableCellSet,
  findNearestValidCell,
  getWalkableTileList,
  isAvatarCellValid,
  pickReachablePatrolCell,
} from "./islandWalkability";
import { buildIslandSurfaceData, canNpcPatrolStepBetweenCells, getNpcSupportWorldY } from "./islandSurface";
import type { CharacterPose3D, PlayerAttackSnapshot } from "./useCharacterMovement";

Object.values(ENEMY_ROBOT_MODELS).forEach((path) => useGLTF.preload(path));

const CHAR_SCALE = 0.294;
const BASE_ROT_Y = -Math.PI / 4;
const CROSSFADE_DURATION = 0.18;
const PATROL_SPEED = 0.52;
const CHASE_SPEED = 0.96;
const PATROL_PAUSE_MIN = 1.4;
const PATROL_PAUSE_MAX = 2.8;
const PATROL_RADIUS = 6;
const AGGRO_ENTER_RANGE = 4.6;
const AGGRO_KEEP_RANGE = 6.2;
const ATTACK_RANGE = 1.28;
const ATTACK_COOLDOWN = 1.05;
const ATTACK_HIT_START_NORM = 0.36;
const ATTACK_HIT_END_NORM = 0.58;
const PLAYER_AXE_DAMAGE = 25;
const ROBOT_ATTACK_DAMAGE = 20;
const PLAYER_DAMAGE_IFRAME_SEC = 0.6;
const PLAYER_RESPAWN_IFRAME_SEC = 2.0;
const ENEMY_MAX_HP = 80;
const DEATH_FADE_DURATION = 0.45;
const HEALTH_BAR_REVEAL_DURATION = 2.4;
const HIT_FLASH_DURATION = 0.12;
const WORLD_HP_BAR_Y = 2.38;
const FRONTAL_CONE_COS = Math.cos(Math.PI * 0.48);
const PLAYER_ATTACK_RANGE = 1.48;
const PLAYER_ATTACK_CONE_COS = Math.cos(Math.PI * 0.42);
const ENEMY_GROUND_OFFSET_Y = getNpcGroundProfile("enemyRobot").visualGroundOffsetY;

type EnemyState = "patrol_walk" | "patrol_pause" | "chase" | "attack" | "dead";

type Props = {
  island: IslandMap;
  patrolIslandKey: string;
  playerPose: CharacterPose3D;
  combatEnabled: boolean;
  playerAttackRef: MutableRefObject<PlayerAttackSnapshot | null>;
  respawnToken: number;
  onPlayerDamage: (damage: number) => void;
  onAliveChange?: (alive: boolean) => void;
};

type FadableMaterialEntry = {
  material: THREE.Material;
  baseOpacity: number;
  baseTransparent: boolean;
};

function findMineTile(island: IslandMap): { gx: number; gy: number } | null {
  for (const tile of island.tiles) {
    if ((MINE_TILES as readonly string[]).includes(tile.type)) {
      return { gx: tile.gx, gy: tile.gy };
    }
  }
  return null;
}

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function getFacingAngle(fromGx: number, fromGy: number, toGx: number, toGy: number): number {
  return Math.atan2((toGx - fromGx) * TILE_UNIT_SIZE, (toGy - fromGy) * TILE_UNIT_SIZE);
}

function isInFacingCone(
  facingAngle: number | null | undefined,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
  cosThreshold: number,
): boolean {
  if (facingAngle == null) return true;
  const toX = toGx - fromGx;
  const toY = toGy - fromGy;
  const len = Math.hypot(toX, toY);
  if (len <= 1e-5) return true;
  const forwardX = Math.sin(facingAngle);
  const forwardY = Math.cos(facingAngle);
  return (forwardX * toX + forwardY * toY) / len >= cosThreshold;
}

function moveTowardTarget(params: {
  gx: number;
  gy: number;
  targetGx: number;
  targetGy: number;
  speed: number;
  dt: number;
  walkableCells: Set<string>;
  blockedFootprint: Set<string>;
  surfaceData: ReturnType<typeof buildIslandSurfaceData>;
}): { gx: number; gy: number; moved: boolean } {
  const { gx, gy, targetGx, targetGy, speed, dt, walkableCells, blockedFootprint, surfaceData } = params;
  const dx = targetGx - gx;
  const dy = targetGy - gy;
  const dist = Math.hypot(dx, dy);
  if (dist <= 1e-5) {
    return { gx, gy, moved: false };
  }
  const step = Math.min(1, (speed * dt) / dist);
  let nextGx = gx + dx * step;
  let nextGy = gy + dy * step;
  const canMoveBoth =
    isAvatarCellValid(walkableCells, blockedFootprint, nextGx, nextGy) &&
    canNpcPatrolStepBetweenCells(surfaceData, gx, gy, nextGx, nextGy);
  if (canMoveBoth) {
    return { gx: nextGx, gy: nextGy, moved: true };
  }
  const canMoveX =
    isAvatarCellValid(walkableCells, blockedFootprint, nextGx, gy) &&
    canNpcPatrolStepBetweenCells(surfaceData, gx, gy, nextGx, gy);
  const canMoveY =
    isAvatarCellValid(walkableCells, blockedFootprint, gx, nextGy) &&
    canNpcPatrolStepBetweenCells(surfaceData, gx, gy, gx, nextGy);
  if (canMoveX && !canMoveY) {
    return { gx: nextGx, gy, moved: true };
  }
  if (canMoveY && !canMoveX) {
    return { gx, gy: nextGy, moved: true };
  }
  return { gx, gy, moved: false };
}

export function EnemyRobot({
  island,
  patrolIslandKey,
  playerPose,
  combatEnabled,
  playerAttackRef,
  respawnToken,
  onPlayerDamage,
  onAliveChange,
}: Props) {
  const playerPoseRef = useRef(playerPose);
  playerPoseRef.current = playerPose;
  const onPlayerDamageRef = useRef(onPlayerDamage);
  onPlayerDamageRef.current = onPlayerDamage;
  const onAliveChangeRef = useRef(onAliveChange);
  onAliveChangeRef.current = onAliveChange;

  const baseGltf = useGLTF(ENEMY_ROBOT_MODELS.base);
  const walkGltf = useGLTF(ENEMY_ROBOT_MODELS.walk);
  const attackGltf = useGLTF(ENEMY_ROBOT_MODELS.attack);

  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const healthBarRef = useRef<THREE.Group>(null);
  const healthFillRef = useRef<THREE.Mesh>(null);
  const prevClipRef = useRef("");
  const reportedAliveRef = useRef<boolean | null>(null);

  const stateRef = useRef<EnemyState>("patrol_walk");
  const gxRef = useRef(0);
  const gyRef = useRef(0);
  const facingAngleRef = useRef(BASE_ROT_Y);
  const patrolTargetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const patrolPauseTimerRef = useRef(0);
  const attackCooldownRef = useRef(0);
  const attackTimerRef = useRef(0);
  const attackDurationRef = useRef(attackGltf.animations[0]?.duration ?? 1);
  const attackHitConsumedRef = useRef(false);
  const playerDamageCooldownRef = useRef(PLAYER_RESPAWN_IFRAME_SEC);
  const enemyHpRef = useRef(ENEMY_MAX_HP);
  const hpRevealTimerRef = useRef(0);
  const hitFlashTimerRef = useRef(0);
  const deathFadeTimerRef = useRef(0);
  const lastPlayerSwingHitRef = useRef(0);
  const aggroedRef = useRef(false);
  const prevRespawnTokenRef = useRef(respawnToken);
  const fadeMaterialsRef = useRef<FadableMaterialEntry[]>([]);
  const flashMaterialsRef = useRef<Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial>>([]);

  const mineTile = useMemo(() => findMineTile(island), [island]);
  const walkableTiles = useMemo(() => getWalkableTileList(island), [island]);
  const walkableCells = useMemo(() => buildWalkableCellSet(island), [island]);
  const blockedFootprint = useMemo(() => buildMiningManPatrolBlockedSet(island), [island]);
  const patrolTiles = useMemo(() => {
    const radiusFiltered = walkableTiles.filter((tile) => {
      if (blockedFootprint.has(`${tile.gx},${tile.gy}`)) return false;
      if (!mineTile) return true;
      return Math.abs(tile.gx - mineTile.gx) + Math.abs(tile.gy - mineTile.gy) <= PATROL_RADIUS;
    });
    if (radiusFiltered.length > 0) return radiusFiltered;
    const blockedFiltered = walkableTiles.filter((tile) => !blockedFootprint.has(`${tile.gx},${tile.gy}`));
    return blockedFiltered.length > 0 ? blockedFiltered : walkableTiles;
  }, [blockedFootprint, mineTile, walkableTiles]);
  const surfaceData = useMemo(() => buildIslandSurfaceData(island), [island]);
  const mineLayoutKey = useMemo(() => {
    const tile = findMineTile(island);
    return tile ? `${patrolIslandKey}:${tile.gx},${tile.gy}` : "";
  }, [island, patrolIslandKey]);

  const modelScene = useMemo(
    () => SkeletonUtils.clone(baseGltf.scene) as THREE.Group,
    [baseGltf.scene],
  );

  useMemo(() => {
    const fadeEntries: FadableMaterialEntry[] = [];
    const flashEntries: Array<THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial> = [];
    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const clonedMaterials = (Array.isArray(child.material) ? child.material : [child.material]).map((material) => {
        const nextMaterial = material.clone();
        nextMaterial.side = THREE.DoubleSide;
        nextMaterial.depthWrite = true;
        nextMaterial.depthTest = true;
        stripEmbeddedEmissive(nextMaterial);
        tuneRigPbrForIslandLighting(nextMaterial);
        scalePbrRoughness(nextMaterial);
        nextMaterial.needsUpdate = true;
        fadeEntries.push({
          material: nextMaterial,
          baseOpacity: nextMaterial.opacity,
          baseTransparent: nextMaterial.transparent,
        });
        if (nextMaterial instanceof THREE.MeshStandardMaterial || nextMaterial instanceof THREE.MeshPhysicalMaterial) {
          flashEntries.push(nextMaterial);
        }
        return nextMaterial;
      });
      child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0]!;
    });
    fadeMaterialsRef.current = fadeEntries;
    flashMaterialsRef.current = flashEntries;
  }, [modelScene]);

  const allClips = useMemo(() => {
    const clips: THREE.AnimationClip[] = [];
    const addFirst = (animations: THREE.AnimationClip[], name: string) => {
      if (animations.length <= 0) return;
      const clip = animations[0].clone();
      clip.name = name;
      clips.push(clip);
    };
    addFirst(baseGltf.animations, "idle");
    addFirst(walkGltf.animations, "walk");
    addFirst(attackGltf.animations, "attack");
    return clips;
  }, [attackGltf.animations, baseGltf.animations, walkGltf.animations]);

  const { actions } = useAnimations(allClips, modelRef);

  const playClip = useCallback(
    (name: "idle" | "walk" | "attack", loop: boolean) => {
      const nextAction = actions[name];
      if (!nextAction) return;
      if (prevClipRef.current === name) {
        if (!loop && !nextAction.isRunning()) {
          nextAction.reset().play();
        }
        return;
      }
      const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
      nextAction.enabled = true;
      nextAction.reset();
      nextAction.clampWhenFinished = !loop;
      nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      if (prevAction && prevAction !== nextAction && prevAction.isRunning()) {
        nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
      }
      nextAction.play();
      prevClipRef.current = name;
    },
    [actions],
  );

  const reportAlive = useCallback((alive: boolean) => {
    if (reportedAliveRef.current === alive) return;
    reportedAliveRef.current = alive;
    onAliveChangeRef.current?.(alive);
  }, []);

  const pickPatrolTarget = useCallback(
    (cx: number, cy: number) => {
      if (!mineTile) return { gx: Math.round(cx), gy: Math.round(cy) };
      return pickReachablePatrolCell(
        patrolTiles,
        walkableCells,
        blockedFootprint,
        mineTile.gx,
        mineTile.gy,
        cx,
        cy,
        { anchorRadius: PATROL_RADIUS },
      );
    },
    [blockedFootprint, mineTile, patrolTiles, walkableCells],
  );

  const resetEncounter = useCallback(() => {
    if (!mineTile) return;
    const safe = findNearestValidCell(mineTile.gx, mineTile.gy, walkableCells, blockedFootprint);
    gxRef.current = safe.gx;
    gyRef.current = safe.gy;
    facingAngleRef.current = BASE_ROT_Y;
    patrolTargetRef.current = pickPatrolTarget(safe.gx, safe.gy);
    patrolPauseTimerRef.current = 0;
    attackCooldownRef.current = 0;
    attackTimerRef.current = 0;
    attackHitConsumedRef.current = false;
    playerDamageCooldownRef.current = PLAYER_RESPAWN_IFRAME_SEC;
    enemyHpRef.current = ENEMY_MAX_HP;
    hpRevealTimerRef.current = 0;
    hitFlashTimerRef.current = 0;
    deathFadeTimerRef.current = 0;
    lastPlayerSwingHitRef.current = 0;
    aggroedRef.current = false;
    stateRef.current = "patrol_walk";
    playClip("walk", true);
    reportAlive(true);
    if (outerRef.current) {
      outerRef.current.visible = true;
      const y = getNpcSupportWorldY(surfaceData, safe.gx, safe.gy) + ENEMY_GROUND_OFFSET_Y;
      outerRef.current.position.set(safe.gx * TILE_UNIT_SIZE, y, safe.gy * TILE_UNIT_SIZE);
    }
  }, [blockedFootprint, mineTile, pickPatrolTarget, playClip, reportAlive, surfaceData, walkableCells]);

  const startDeath = useCallback(() => {
    stateRef.current = "dead";
    attackTimerRef.current = 0;
    attackCooldownRef.current = 0;
    attackHitConsumedRef.current = true;
    aggroedRef.current = false;
    hpRevealTimerRef.current = 0.9;
    hitFlashTimerRef.current = HIT_FLASH_DURATION;
    deathFadeTimerRef.current = DEATH_FADE_DURATION;
    playClip("idle", true);
    reportAlive(false);
  }, [playClip, reportAlive]);

  useLayoutEffect(() => {
    if (!mineLayoutKey) return;
    resetEncounter();
  }, [mineLayoutKey, resetEncounter]);

  useEffect(() => {
    if (prevRespawnTokenRef.current === respawnToken) return;
    prevRespawnTokenRef.current = respawnToken;
    resetEncounter();
  }, [resetEncounter, respawnToken]);

  useEffect(() => {
    if (actions["idle"]) {
      playClip("idle", true);
    }
  }, [actions, playClip]);

  useFrame((state, delta) => {
    const outer = outerRef.current;
    const model = modelRef.current;
    if (!outer || !model || !mineTile || walkableCells.size === 0) return;

    const dt = Math.min(0.05, delta);
    const player = playerPoseRef.current;
    const playerDist = Math.hypot(player.gx - gxRef.current, player.gy - gyRef.current);

    if (!isAvatarCellValid(walkableCells, blockedFootprint, gxRef.current, gyRef.current)) {
      const safe = findNearestValidCell(mineTile.gx, mineTile.gy, walkableCells, blockedFootprint);
      gxRef.current = safe.gx;
      gyRef.current = safe.gy;
      patrolTargetRef.current = pickPatrolTarget(safe.gx, safe.gy);
      stateRef.current = "patrol_walk";
      playClip("walk", true);
    }

    if (attackCooldownRef.current > 0) attackCooldownRef.current = Math.max(0, attackCooldownRef.current - dt);
    if (playerDamageCooldownRef.current > 0) {
      playerDamageCooldownRef.current = Math.max(0, playerDamageCooldownRef.current - dt);
    }
    if (hpRevealTimerRef.current > 0) hpRevealTimerRef.current = Math.max(0, hpRevealTimerRef.current - dt);
    if (hitFlashTimerRef.current > 0) hitFlashTimerRef.current = Math.max(0, hitFlashTimerRef.current - dt);

    if (enemyHpRef.current > 0) {
      const swing = playerAttackRef.current;
      if (
        swing &&
        swing.active &&
        swing.hitActive &&
        swing.swingId > 0 &&
        swing.swingId !== lastPlayerSwingHitRef.current &&
        playerDist <= PLAYER_ATTACK_RANGE &&
        isInFacingCone(
          swing.facingAngle ?? player.facingAngle ?? null,
          swing.gx,
          swing.gy,
          gxRef.current,
          gyRef.current,
          PLAYER_ATTACK_CONE_COS,
        )
      ) {
        lastPlayerSwingHitRef.current = swing.swingId;
        enemyHpRef.current = Math.max(0, enemyHpRef.current - PLAYER_AXE_DAMAGE);
        hpRevealTimerRef.current = HEALTH_BAR_REVEAL_DURATION;
        hitFlashTimerRef.current = HIT_FLASH_DURATION;
        if (!aggroedRef.current) {
          aggroedRef.current = true;
        }
        if (enemyHpRef.current <= 0) {
          startDeath();
        } else if (stateRef.current !== "attack") {
          stateRef.current = "chase";
          playClip("walk", true);
        }
      }
    }

    if (stateRef.current === "dead") {
      deathFadeTimerRef.current = Math.max(0, deathFadeTimerRef.current - dt);
      if (deathFadeTimerRef.current <= 0) {
        outer.visible = false;
      }
    } else {
      const canAggro = combatEnabled && enemyHpRef.current > 0;
      const keepAggro = aggroedRef.current && playerDist <= AGGRO_KEEP_RANGE;
      const enterAggro = playerDist <= AGGRO_ENTER_RANGE;

      if (canAggro && (enterAggro || keepAggro)) {
        aggroedRef.current = true;
        hpRevealTimerRef.current = Math.max(hpRevealTimerRef.current, 0.9);
      } else if (!keepAggro) {
        aggroedRef.current = false;
      }

      if (!canAggro || !aggroedRef.current) {
        if (stateRef.current === "attack" || stateRef.current === "chase") {
          stateRef.current = "patrol_pause";
          patrolPauseTimerRef.current = 0.35;
          playClip("idle", true);
        }
      }

      if (stateRef.current === "attack") {
        attackTimerRef.current = Math.max(0, attackTimerRef.current - dt);
        facingAngleRef.current = getFacingAngle(gxRef.current, gyRef.current, player.gx, player.gy);
        const elapsed = attackDurationRef.current - attackTimerRef.current;
        const hitStart = attackDurationRef.current * ATTACK_HIT_START_NORM;
        const hitEnd = attackDurationRef.current * ATTACK_HIT_END_NORM;
        if (
          !attackHitConsumedRef.current &&
          elapsed >= hitStart &&
          elapsed <= hitEnd
        ) {
          attackHitConsumedRef.current = true;
          if (playerDamageCooldownRef.current <= 0 && playerDist <= ATTACK_RANGE + 0.12) {
            const blocked =
              Boolean(player.isBlocking) &&
              isInFacingCone(
                player.facingAngle ?? null,
                player.gx,
                player.gy,
                gxRef.current,
                gyRef.current,
                FRONTAL_CONE_COS,
              );
            if (!blocked) {
              onPlayerDamageRef.current(ROBOT_ATTACK_DAMAGE);
              playerDamageCooldownRef.current = PLAYER_DAMAGE_IFRAME_SEC;
            }
          }
        }
        if (attackTimerRef.current <= 0) {
          attackCooldownRef.current = ATTACK_COOLDOWN;
          stateRef.current = aggroedRef.current ? "chase" : "patrol_pause";
          patrolPauseTimerRef.current = aggroedRef.current ? 0 : 0.5;
          playClip(aggroedRef.current ? "walk" : "idle", true);
        }
      } else if (aggroedRef.current) {
        const chaseTarget = findNearestValidCell(player.gx, player.gy, walkableCells, blockedFootprint);
        facingAngleRef.current = getFacingAngle(gxRef.current, gyRef.current, player.gx, player.gy);
        if (playerDist <= ATTACK_RANGE && attackCooldownRef.current <= 0) {
          stateRef.current = "attack";
          attackDurationRef.current = attackGltf.animations[0]?.duration ?? 1;
          attackTimerRef.current = attackDurationRef.current;
          attackHitConsumedRef.current = false;
          playClip("attack", false);
        } else {
          stateRef.current = "chase";
          playClip("walk", true);
          const next = moveTowardTarget({
            gx: gxRef.current,
            gy: gyRef.current,
            targetGx: chaseTarget.gx,
            targetGy: chaseTarget.gy,
            speed: CHASE_SPEED,
            dt,
            walkableCells,
            blockedFootprint,
            surfaceData,
          });
          gxRef.current = next.gx;
          gyRef.current = next.gy;
        }
      } else if (stateRef.current === "patrol_pause") {
        patrolPauseTimerRef.current = Math.max(0, patrolPauseTimerRef.current - dt);
        playClip("idle", true);
        if (patrolPauseTimerRef.current <= 0) {
          patrolTargetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
          stateRef.current = "patrol_walk";
          playClip("walk", true);
        }
      } else {
        stateRef.current = "patrol_walk";
        const target = patrolTargetRef.current;
        const distToTarget = Math.hypot(target.gx - gxRef.current, target.gy - gyRef.current);
        if (distToTarget < 0.08) {
          gxRef.current = target.gx;
          gyRef.current = target.gy;
          patrolPauseTimerRef.current = PATROL_PAUSE_MIN + Math.random() * (PATROL_PAUSE_MAX - PATROL_PAUSE_MIN);
          stateRef.current = "patrol_pause";
          playClip("idle", true);
        } else {
          const next = moveTowardTarget({
            gx: gxRef.current,
            gy: gyRef.current,
            targetGx: target.gx,
            targetGy: target.gy,
            speed: PATROL_SPEED,
            dt,
            walkableCells,
            blockedFootprint,
            surfaceData,
          });
          if (!next.moved) {
            patrolTargetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
          } else {
            gxRef.current = next.gx;
            gyRef.current = next.gy;
            facingAngleRef.current = getFacingAngle(gxRef.current, gyRef.current, target.gx, target.gy);
          }
          playClip("walk", true);
        }
      }
    }

    const tx = gxRef.current * TILE_UNIT_SIZE;
    const tz = gyRef.current * TILE_UNIT_SIZE;
    const sm = 1 - Math.exp(-10 * delta);
    outer.position.x += (tx - outer.position.x) * sm;
    outer.position.z += (tz - outer.position.z) * sm;
    const targetY = getNpcSupportWorldY(surfaceData, gxRef.current, gyRef.current) + ENEMY_GROUND_OFFSET_Y;
    outer.position.y += (targetY - outer.position.y) * sm;

    let rotDiff = wrapAngle(facingAngleRef.current - model.rotation.y);
    model.rotation.y += rotDiff * sm;

    const deathAlpha =
      stateRef.current === "dead" ? Math.max(0, deathFadeTimerRef.current / DEATH_FADE_DURATION) : 1;
    const flashStrength = HIT_FLASH_DURATION > 0 ? hitFlashTimerRef.current / HIT_FLASH_DURATION : 0;

    for (const entry of fadeMaterialsRef.current) {
      entry.material.opacity = entry.baseOpacity * deathAlpha;
      entry.material.transparent = entry.baseTransparent || deathAlpha < 0.999;
      entry.material.depthWrite = deathAlpha >= 0.999;
      entry.material.needsUpdate = true;
    }
    for (const material of flashMaterialsRef.current) {
      material.emissive.setRGB(0.62 * flashStrength, 0.18 * flashStrength, 0.04 * flashStrength);
      material.emissiveIntensity = flashStrength > 0 ? 1 : 0;
      material.needsUpdate = true;
    }

    if (healthBarRef.current) {
      const hpRatio = Math.max(0, Math.min(1, enemyHpRef.current / ENEMY_MAX_HP));
      const hpVisible =
        deathAlpha > 0.05 &&
        enemyHpRef.current > 0 &&
        (aggroedRef.current || hpRevealTimerRef.current > 0 || enemyHpRef.current < ENEMY_MAX_HP);
      healthBarRef.current.visible = hpVisible;
      healthBarRef.current.position.set(0, WORLD_HP_BAR_Y, 0);
      healthBarRef.current.quaternion.copy(state.camera.quaternion);
      if (healthFillRef.current) {
        healthFillRef.current.scale.x = hpRatio;
        healthFillRef.current.position.x = -0.48 + hpRatio * 0.48;
      }
    }
  });

  if (!mineTile) return null;

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive object={modelScene} />
        </group>
      </group>
      <group ref={healthBarRef} visible={false}>
        <mesh>
          <planeGeometry args={[1.04, 0.12]} />
          <meshBasicMaterial color="#110b0b" transparent opacity={0.72} depthWrite={false} />
        </mesh>
        <mesh ref={healthFillRef} position={[-0.48, 0, 0.002]}>
          <planeGeometry args={[0.96, 0.08]} />
          <meshBasicMaterial color="#f55d4f" transparent opacity={0.94} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
