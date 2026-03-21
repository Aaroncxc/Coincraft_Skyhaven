import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE, MAGIC_MAN_MODELS } from "./assets3d";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import type { IslandMap } from "../types";
import {
  buildBlockedFootprintSet,
  buildWalkableCellSet,
  findNearestValidCell,
  getWalkableTileList,
  isAvatarCellValid,
} from "./islandWalkability";

Object.values(MAGIC_MAN_MODELS).forEach((p) => useGLTF.preload(p));

const CHAR_SCALE = 0.294;
const TILE_SURFACE_Y = 0.82;
const BASE_ROT_Y = -Math.PI / 4;
const CROSSFADE_DURATION = 0.2;
const PATROL_SPEED = 0.55;
const PATROL_PAUSE_MIN = 2;
const PATROL_PAUSE_MAX = 4;
const SPELL_INTERVAL_MIN = 8;
const SPELL_INTERVAL_MAX = 15;
const SPELL_FALLBACK_DURATION = 2.4;
const TALK_DURATION = 6;
const NPC_TILE_DWELL_RESET_SEC = 8;

type NpcState = "walk" | "idle" | "spell" | "talk";

type Props = {
  island: IslandMap;
  isTalking: boolean;
  npcPosRef: React.MutableRefObject<{ gx: number; gy: number } | null>;
  playerGx: number;
  playerGy: number;
};

function findMagicTowerTile(island: IslandMap): { gx: number; gy: number } | null {
  for (const t of island.tiles) {
    if (t.type === "magicTower") return { gx: t.gx, gy: t.gy };
  }
  return null;
}

function pickRandomNearby(
  tiles: { gx: number; gy: number }[],
  cx: number,
  cy: number,
  radius: number,
): { gx: number; gy: number } {
  const nearby = tiles.filter(
    (t) => Math.abs(t.gx - cx) + Math.abs(t.gy - cy) <= radius && (t.gx !== Math.round(cx) || t.gy !== Math.round(cy)),
  );
  const pool = nearby.length > 0 ? nearby : tiles;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function MagicManNPC({ island, isTalking, npcPosRef, playerGx, playerGy }: Props) {
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
  const spawnedRef = useRef(false);
  const dwellTimerRef = useRef(0);
  const lastDwellRoundedKeyRef = useRef("");

  const magicTowerTile = useMemo(() => findMagicTowerTile(island), [island]);
  const walkableTiles = useMemo(() => getWalkableTileList(island), [island]);
  const walkableCells = useMemo(() => buildWalkableCellSet(island), [island]);
  const blockedFootprint = useMemo(() => buildBlockedFootprintSet(island), [island]);

  useEffect(() => {
    if (!magicTowerTile || walkableTiles.length === 0) return;
    if (!spawnedRef.current) {
      const safe = findNearestValidCell(magicTowerTile.gx, magicTowerTile.gy, walkableCells, blockedFootprint);
      gxRef.current = safe.gx;
      gyRef.current = safe.gy;
      targetRef.current = pickRandomNearby(walkableTiles, safe.gx, safe.gy, 3);
      lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
      dwellTimerRef.current = 0;
      spawnedRef.current = true;
    }
  }, [magicTowerTile, walkableTiles, walkableCells, blockedFootprint]);

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
    if (!outerRef.current || !magicTowerTile || walkableTiles.length === 0) return;
    const dt = Math.min(0.05, delta);

    npcPosRef.current = { gx: gxRef.current, gy: gyRef.current };

    if (!isAvatarCellValid(walkableCells, blockedFootprint, gxRef.current, gyRef.current)) {
      const safe = findNearestValidCell(gxRef.current, gyRef.current, walkableCells, blockedFootprint);
      gxRef.current = safe.gx;
      gyRef.current = safe.gy;
      targetRef.current = pickRandomNearby(walkableTiles, safe.gx, safe.gy, 3);
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
        targetRef.current = pickRandomNearby(walkableTiles, gxRef.current, gyRef.current, 3);
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
        targetRef.current = pickRandomNearby(walkableTiles, gxRef.current, gyRef.current, 3);
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
        if (!isAvatarCellValid(walkableCells, blockedFootprint, newGx, newGy)) {
          stateRef.current = "walk";
          targetRef.current = pickRandomNearby(walkableTiles, gxRef.current, gyRef.current, 3);
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
          const safe = findNearestValidCell(magicTowerTile.gx, magicTowerTile.gy, walkableCells, blockedFootprint);
          gxRef.current = safe.gx;
          gyRef.current = safe.gy;
          targetRef.current = pickRandomNearby(walkableTiles, safe.gx, safe.gy, 3);
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
    pos.y = TILE_SURFACE_Y;

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

  if (!magicTowerTile || walkableTiles.length === 0) return null;

  return (
    <group
      ref={outerRef}
      position={[
        magicTowerTile.gx * TILE_UNIT_SIZE,
        TILE_SURFACE_Y,
        magicTowerTile.gy * TILE_UNIT_SIZE,
      ]}
    >
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive ref={baseSceneRef} object={baseGltf.scene} />
        </group>
      </group>
    </group>
  );
}
