import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE, MAGIC_MAN_MODELS } from "./assets3d";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import { getNpcGroundProfile } from "./avatarGrounding";
import type { IslandMap } from "../types";
import {
  buildMagicManPatrolBlockedSet,
  buildWalkableCellSet,
  findNearestValidCell,
  getWalkableTileList,
  isAvatarCellValid,
  pickReachablePatrolCell,
} from "./islandWalkability";
import {
  buildIslandSurfaceData,
  canNpcPatrolStepBetweenCells,
  getNpcSupportWorldY,
} from "./islandSurface";
import type { TargetableSnapshot } from "./targetLock";

Object.values(MAGIC_MAN_MODELS).forEach((p) => useGLTF.preload(p));

const CHAR_SCALE = 0.294;
const BASE_ROT_Y = -Math.PI / 4;
const CROSSFADE_DURATION = 0.2;
const PATROL_SPEED = 0.55;
const PATROL_PAUSE_MIN = 2;
const PATROL_PAUSE_MAX = 4;
const SPELL_INTERVAL_MIN = 8;
const SPELL_INTERVAL_MAX = 15;
const SPELL_FALLBACK_DURATION = 2.4;
const TALK_DURATION = 6;
const NPC_TILE_DWELL_RESET_SEC = 4;
const MAGIC_GROUND_OFFSET_Y = getNpcGroundProfile("magicMan").visualGroundOffsetY;

type NpcState = "walk" | "idle" | "spell" | "talk";

type Props = {
  island: IslandMap;
  patrolIslandKey: string;
  isTalking: boolean;
  npcPosRef: React.MutableRefObject<TargetableSnapshot | null>;
  playerGx: number;
  playerGy: number;
};

function findMagicTowerTile(island: IslandMap): { gx: number; gy: number } | null {
  for (const t of island.tiles) {
    if (t.type === "magicTower") return { gx: t.gx, gy: t.gy };
  }
  return null;
}

export function MagicManNPC({ island, patrolIslandKey, isTalking, npcPosRef, playerGx, playerGy }: Props) {
  const islandRef = useRef(island);
  islandRef.current = island;

  useEffect(() => {
    return () => {
      npcPosRef.current = null;
    };
  }, [npcPosRef]);

  const baseGltf = useGLTF(MAGIC_MAN_MODELS.base);
  const walkGltf = useGLTF(MAGIC_MAN_MODELS.walk);
  const idleGltf = useGLTF(MAGIC_MAN_MODELS.idle);
  const zauberGltf = useGLTF(MAGIC_MAN_MODELS.zauber);

  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const baseSceneRef = useRef<THREE.Group | THREE.Object3D>(null);
  const prevClipRef = useRef("");
  const initDoneRef = useRef(false);

  const stateRef = useRef<NpcState>("walk");
  const gxRef = useRef(0);
  const gyRef = useRef(0);
  const facingAngleRef = useRef(BASE_ROT_Y);
  const targetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const pauseTimerRef = useRef(0);
  const spellIntervalTimerRef = useRef(
    SPELL_INTERVAL_MIN + Math.random() * (SPELL_INTERVAL_MAX - SPELL_INTERVAL_MIN),
  );
  const spellTimerRef = useRef(0);
  const talkTimerRef = useRef(0);
  const dwellTimerRef = useRef(0);
  const lastDwellRoundedKeyRef = useRef("");

  const magicTowerTile = useMemo(() => findMagicTowerTile(island), [island]);
  const walkableTiles = useMemo(() => getWalkableTileList(island), [island]);
  const walkableCells = useMemo(() => buildWalkableCellSet(island), [island]);
  const patrolBlockedFootprint = useMemo(() => buildMagicManPatrolBlockedSet(island), [island]);
  const patrolTiles = useMemo(() => {
    const filtered = walkableTiles.filter((t) => !patrolBlockedFootprint.has(`${t.gx},${t.gy}`));
    return filtered.length > 0 ? filtered : walkableTiles;
  }, [walkableTiles, patrolBlockedFootprint]);
  const surfaceData = useMemo(() => buildIslandSurfaceData(island), [island]);

  const towerLayoutKey = useMemo(() => {
    const mt = findMagicTowerTile(island);
    return mt ? `${patrolIslandKey}:${mt.gx},${mt.gy}` : "";
  }, [island, patrolIslandKey]);

  useLayoutEffect(() => {
    if (!towerLayoutKey) return;
    const isl = islandRef.current;
    const tower = findMagicTowerTile(isl);
    if (!tower) return;
    const rawWt = getWalkableTileList(isl);
    const bf = buildMagicManPatrolBlockedSet(isl);
    let wt = rawWt.filter((t) => !bf.has(`${t.gx},${t.gy}`));
    if (wt.length === 0) wt = rawWt;
    if (wt.length === 0) return;
    const wc = buildWalkableCellSet(isl);
    const sd = buildIslandSurfaceData(isl);
    const safe = findNearestValidCell(tower.gx, tower.gy, wc, bf);
    gxRef.current = safe.gx;
    gyRef.current = safe.gy;
    targetRef.current = pickReachablePatrolCell(
      wt,
      wc,
      bf,
      tower.gx,
      tower.gy,
      safe.gx,
      safe.gy,
    );
    lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
    dwellTimerRef.current = 0;
    const ox = outerRef.current;
    if (ox) {
      const y = getNpcSupportWorldY(sd, safe.gx, safe.gy) + MAGIC_GROUND_OFFSET_Y;
      ox.position.set(safe.gx * TILE_UNIT_SIZE, y, safe.gy * TILE_UNIT_SIZE);
    }
  }, [towerLayoutKey]);

  const pickPatrolTarget = useCallback(
    (cx: number, cy: number) => {
      if (!magicTowerTile) return { gx: Math.round(cx), gy: Math.round(cy) };
      return pickReachablePatrolCell(
        patrolTiles,
        walkableCells,
        patrolBlockedFootprint,
        magicTowerTile.gx,
        magicTowerTile.gy,
        cx,
        cy,
      );
    },
    [magicTowerTile, patrolTiles, walkableCells, patrolBlockedFootprint],
  );

  useMemo(() => {
    baseGltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = true;
        mat.depthTest = true;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (mat.transparent && mat.map) {
            mat.alphaTest = 0.5;
            mat.transparent = false;
          }
        }
        stripEmbeddedEmissive(mat);
        tuneRigPbrForIslandLighting(mat);
        scalePbrRoughness(mat);
        mat.needsUpdate = true;
      }
    });
  }, [baseGltf.scene]);

  const allClips = useMemo(() => {
    const clips: THREE.AnimationClip[] = [];
    const add = (anims: THREE.AnimationClip[], slotName: string) => {
      const source = (anims ?? [])[0];
      if (source) {
        const c = source.clone();
        c.name = slotName;
        clips.push(c);
      }
    };
    add(walkGltf.animations, "walk");
    add(idleGltf.animations, "idle");
    add(zauberGltf.animations, "zauber");
    return clips;
  }, [walkGltf.animations, idleGltf.animations, zauberGltf.animations]);

  const { actions } = useAnimations(allClips, baseSceneRef);

  const playClip = useCallback(
    (name: string, loop: boolean) => {
      const nextAction = actions[name];
      const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
      if (!nextAction) return;
      if (name === prevClipRef.current) return;
      for (const [actionName, action] of Object.entries(actions)) {
        if (!action || actionName === name) continue;
        action.fadeOut(CROSSFADE_DURATION);
        action.stop();
      }
      nextAction.reset();
      nextAction.clampWhenFinished = !loop;
      nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      if (prevAction && prevAction.isRunning()) {
        nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
      }
      nextAction.play();
      prevClipRef.current = name;
    },
    [actions],
  );

  const resetSpellInterval = useCallback(() => {
    spellIntervalTimerRef.current = SPELL_INTERVAL_MIN + Math.random() * (SPELL_INTERVAL_MAX - SPELL_INTERVAL_MIN);
  }, []);

  useEffect(() => {
    if (initDoneRef.current) return;
    const walk = actions["walk"];
    if (walk) {
      walk.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      prevClipRef.current = "walk";
      initDoneRef.current = true;
    }
  }, [actions]);

  useEffect(() => {
    if (isTalking && stateRef.current !== "talk") {
      stateRef.current = "talk";
      talkTimerRef.current = TALK_DURATION;
      playClip("idle", true);
    }
  }, [isTalking, playClip]);

  useFrame((_, delta) => {
    if (!outerRef.current || !magicTowerTile || walkableCells.size === 0) return;
    const dt = Math.min(0.05, delta);

    if (!isAvatarCellValid(walkableCells, patrolBlockedFootprint, gxRef.current, gyRef.current)) {
      const safe = findNearestValidCell(
        magicTowerTile.gx,
        magicTowerTile.gy,
        walkableCells,
        patrolBlockedFootprint,
      );
      gxRef.current = safe.gx;
      gyRef.current = safe.gy;
      targetRef.current = pickPatrolTarget(safe.gx, safe.gy);
      dwellTimerRef.current = 0;
      lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
      if (stateRef.current === "idle") {
        stateRef.current = "walk";
        playClip("walk", true);
      }
    }

    let state = stateRef.current;
    if (state === "talk") {
      talkTimerRef.current -= dt;
      if (talkTimerRef.current <= 0) {
        stateRef.current = "walk";
        targetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
        playClip("walk", true);
      }
    } else if (state === "spell") {
      spellTimerRef.current -= dt;
      if (spellTimerRef.current <= 0) {
        stateRef.current = "idle";
        playClip("idle", true);
      }
    } else if (state === "idle") {
      pauseTimerRef.current -= dt;
      spellIntervalTimerRef.current -= dt;

      if (pauseTimerRef.current <= 0) {
        stateRef.current = "walk";
        targetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
        playClip("walk", true);
      } else if (spellIntervalTimerRef.current <= 0 && actions["zauber"]) {
        stateRef.current = "spell";
        spellTimerRef.current = Math.max(actions["zauber"]?.getClip().duration ?? SPELL_FALLBACK_DURATION, 0.1);
        resetSpellInterval();
        playClip("zauber", false);
      }
    } else {
      const target = targetRef.current;
      const dx = target.gx - gxRef.current;
      const dy = target.gy - gyRef.current;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.08) {
        gxRef.current = target.gx;
        gyRef.current = target.gy;
        stateRef.current = "idle";
        pauseTimerRef.current = PATROL_PAUSE_MIN + Math.random() * (PATROL_PAUSE_MAX - PATROL_PAUSE_MIN);
        playClip("idle", true);
      } else {
        const step = (PATROL_SPEED * dt) / dist;
        const newGx = gxRef.current + dx * step;
        const newGy = gyRef.current + dy * step;
        if (
          !isAvatarCellValid(walkableCells, patrolBlockedFootprint, newGx, newGy) ||
          !canNpcPatrolStepBetweenCells(surfaceData, gxRef.current, gyRef.current, newGx, newGy)
        ) {
          stateRef.current = "walk";
          targetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
          playClip("walk", true);
          const ndx = targetRef.current.gx - gxRef.current;
          const ndy = targetRef.current.gy - gyRef.current;
          if (Math.abs(ndx) > 1e-4 || Math.abs(ndy) > 1e-4) {
            facingAngleRef.current = Math.atan2(ndx * TILE_UNIT_SIZE, ndy * TILE_UNIT_SIZE);
          }
        } else {
          gxRef.current = newGx;
          gyRef.current = newGy;
          const wx = dx * TILE_UNIT_SIZE;
          const wz = dy * TILE_UNIT_SIZE;
          if (Math.abs(wx) > 1e-4 || Math.abs(wz) > 1e-4) {
            facingAngleRef.current = Math.atan2(wx, wz);
          }
        }
      }
    }

    state = stateRef.current;
    const endState = state;
    const dwellRounded = `${Math.round(gxRef.current)},${Math.round(gyRef.current)}`;
    const countDwell = endState === "walk" || endState === "idle";
    if (countDwell) {
      if (dwellRounded !== lastDwellRoundedKeyRef.current) {
        lastDwellRoundedKeyRef.current = dwellRounded;
        dwellTimerRef.current = 0;
      } else {
        dwellTimerRef.current += dt;
        if (dwellTimerRef.current >= NPC_TILE_DWELL_RESET_SEC) {
          const safe = findNearestValidCell(magicTowerTile.gx, magicTowerTile.gy, walkableCells, patrolBlockedFootprint);
          gxRef.current = safe.gx;
          gyRef.current = safe.gy;
          targetRef.current = pickPatrolTarget(safe.gx, safe.gy);
          dwellTimerRef.current = 0;
          lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
          if (endState === "idle") {
            stateRef.current = "walk";
            playClip("walk", true);
          }
        }
      }
    } else {
      lastDwellRoundedKeyRef.current = dwellRounded;
      dwellTimerRef.current = 0;
    }

    const tx = gxRef.current * TILE_UNIT_SIZE;
    const tz = gyRef.current * TILE_UNIT_SIZE;
    const pos = outerRef.current.position;
    const sm = 1 - Math.exp(-10 * delta);
    pos.x += (tx - pos.x) * sm;
    pos.z += (tz - pos.z) * sm;
    const rgx = Math.round(gxRef.current);
    const rgy = Math.round(gyRef.current);
    const supportY = getNpcSupportWorldY(surfaceData, rgx, rgy);
    const targetY = supportY + MAGIC_GROUND_OFFSET_Y;
    pos.y += (targetY - pos.y) * sm;

    npcPosRef.current = {
      id: "magicMan",
      kind: "npc",
      alive: true,
      gx: gxRef.current,
      gy: gyRef.current,
      surfaceY: supportY,
      worldY: pos.y,
    };

    if (modelRef.current) {
      let targetRot = facingAngleRef.current;
      if (stateRef.current === "talk") {
        const toPlayerX = playerGx * TILE_UNIT_SIZE - tx;
        const toPlayerZ = playerGy * TILE_UNIT_SIZE - tz;
        if (Math.abs(toPlayerX) > 1e-4 || Math.abs(toPlayerZ) > 1e-4) {
          targetRot = Math.atan2(toPlayerX, toPlayerZ);
          facingAngleRef.current = targetRot;
        }
      }
      const cur = modelRef.current.rotation.y;
      let diff = targetRot - cur;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      modelRef.current.rotation.y += diff * sm;
    }
  });

  if (!magicTowerTile) return null;

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive ref={baseSceneRef} object={baseGltf.scene} />
        </group>
      </group>
    </group>
  );
}
