import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  Suspense,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE, FIGHT_MAN_MODELS } from "./assets3d";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import { getNpcGroundProfile } from "./avatarGrounding";
import type { IslandMap } from "../types";
import {
  buildBlockedFootprintSet,
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

Object.values(FIGHT_MAN_MODELS).forEach((p) => useGLTF.preload(p));

const CHAR_SCALE = 0.294;
const BASE_ROT_Y = -Math.PI / 4;
const CROSSFADE_DURATION = 0.2;
const PATROL_SPEED = 0.55;
const PATROL_PAUSE_MIN = 2;
const PATROL_PAUSE_MAX = 4;
const TALK_DURATION_FALLBACK = 6;
const NPC_TILE_DWELL_RESET_SEC = 4;
const FIGHT_GROUND_OFFSET_Y = getNpcGroundProfile("fightMan").visualGroundOffsetY;

type NpcState = "walk" | "pause" | "talk";

type Props = {
  island: IslandMap;
  patrolIslandKey: string;
  isTalking: boolean;
  npcPosRef: MutableRefObject<{ gx: number; gy: number } | null>;
  playerGx: number;
  playerGy: number;
};

function randomPatrolClip(): "walk" | "counterstrike" {
  return Math.random() < 0.5 ? "walk" : "counterstrike";
}

function findKaserneTile(island: IslandMap): { gx: number; gy: number } | null {
  for (const t of island.tiles) {
    if (t.type === "kaserneTile") return { gx: t.gx, gy: t.gy };
  }
  return null;
}

/**
 * Build a blocked-footprint set that also includes the kaserne's 2x2 footprint,
 * even when the tile isn't marked `blocked` by the user.
 */
function buildNpcBlockedSet(island: IslandMap, kaserne: { gx: number; gy: number }): Set<string> {
  const base = buildBlockedFootprintSet(island);
  const span = SKYHAVEN_SPRITE_MANIFEST.tile["kaserneTile"]?.gridSpan;
  const w = span?.w ?? 2;
  const h = span?.h ?? 2;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      base.add(`${kaserne.gx + dx},${kaserne.gy + dy}`);
    }
  }
  return base;
}

export function FightManNPC({ island, patrolIslandKey, isTalking, npcPosRef, playerGx, playerGy }: Props) {
  const islandRef = useRef(island);
  islandRef.current = island;

  const baseGltf = useGLTF(FIGHT_MAN_MODELS.base);
  const walkGltf = useGLTF(FIGHT_MAN_MODELS.npcWalk);
  const counterGltf = useGLTF(FIGHT_MAN_MODELS.npcCounterstrike);
  const tauntGltf = useGLTF(FIGHT_MAN_MODELS.npcTaunt);

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
  const talkTimerRef = useRef(0);
  const dwellTimerRef = useRef(0);
  const lastDwellRoundedKeyRef = useRef("");

  const kaserneTile = useMemo(() => findKaserneTile(island), [island]);
  const walkableTiles = useMemo(() => getWalkableTileList(island), [island]);
  const walkableCells = useMemo(() => buildWalkableCellSet(island), [island]);
  const blockedFootprint = useMemo(
    () => (kaserneTile ? buildNpcBlockedSet(island, kaserneTile) : buildBlockedFootprintSet(island)),
    [island, kaserneTile],
  );
  const surfaceData = useMemo(() => buildIslandSurfaceData(island), [island]);

  const npcWalkableTiles = useMemo(
    () => walkableTiles.filter((t) => !blockedFootprint.has(`${t.gx},${t.gy}`)),
    [walkableTiles, blockedFootprint],
  );

  const kaserneLayoutKey = useMemo(() => {
    const k = findKaserneTile(island);
    return k ? `${patrolIslandKey}:${k.gx},${k.gy}` : "";
  }, [island, patrolIslandKey]);

  useLayoutEffect(() => {
    if (!kaserneLayoutKey) return;
    const isl = islandRef.current;
    const kt = findKaserneTile(isl);
    if (!kt) return;
    const wc = buildWalkableCellSet(isl);
    const bf = buildNpcBlockedSet(isl, kt);
    const wt = getWalkableTileList(isl).filter((t) => !bf.has(`${t.gx},${t.gy}`));
    if (wt.length === 0) return;
    const sd = buildIslandSurfaceData(isl);
    const safe = findNearestValidCell(kt.gx + 2, kt.gy, wc, bf);
    gxRef.current = safe.gx;
    gyRef.current = safe.gy;
    targetRef.current = pickReachablePatrolCell(
      wt,
      wc,
      bf,
      kt.gx,
      kt.gy,
      safe.gx,
      safe.gy,
    );
    lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
    dwellTimerRef.current = 0;
    const ox = outerRef.current;
    if (ox) {
      const y = getNpcSupportWorldY(sd, safe.gx, safe.gy) + FIGHT_GROUND_OFFSET_Y;
      ox.position.set(safe.gx * TILE_UNIT_SIZE, y, safe.gy * TILE_UNIT_SIZE);
    }
  }, [kaserneLayoutKey]);

  const pickPatrolTarget = useCallback(
    (cx: number, cy: number) => {
      if (!kaserneTile) return { gx: Math.round(cx), gy: Math.round(cy) };
      return pickReachablePatrolCell(
        npcWalkableTiles,
        walkableCells,
        blockedFootprint,
        kaserneTile.gx,
        kaserneTile.gy,
        cx,
        cy,
      );
    },
    [kaserneTile, npcWalkableTiles, walkableCells, blockedFootprint],
  );

  useMemo(() => {
    baseGltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
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
    const add = (anims: THREE.AnimationClip[], name: string) => {
      if (anims.length > 0) {
        const c = anims[0].clone();
        c.name = name;
        clips.push(c);
      }
    };
    add(walkGltf.animations, "walk");
    add(counterGltf.animations, "counterstrike");
    add(tauntGltf.animations, "taunt");
    return clips;
  }, [walkGltf.animations, counterGltf.animations, tauntGltf.animations]);

  const { actions } = useAnimations(allClips, baseSceneRef);

  const playClip = useCallback(
    (name: string, loop: boolean) => {
      const nextAction = actions[name];
      const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
      if (!nextAction) return;
      if (name === prevClipRef.current && loop) return;
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

  const playRandomPatrol = useCallback(() => {
    playClip(randomPatrolClip(), true);
  }, [playClip]);

  useEffect(() => {
    if (initDoneRef.current) return;
    const w = actions["walk"];
    const c = actions["counterstrike"];
    if (w || c) {
      playRandomPatrol();
      initDoneRef.current = true;
    }
  }, [actions, playRandomPatrol]);

  useEffect(() => {
    if (isTalking && stateRef.current !== "talk") {
      stateRef.current = "talk";
      const taunt = actions["taunt"];
      talkTimerRef.current = taunt ? Math.max(0.1, taunt.getClip().duration) : TALK_DURATION_FALLBACK;
      playClip("taunt", false);
    }
  }, [isTalking, playClip, actions]);

  useFrame((_, delta) => {
    if (!outerRef.current || !kaserneTile || npcWalkableTiles.length === 0) return;
    const dt = Math.min(0.05, delta);

    npcPosRef.current = { gx: gxRef.current, gy: gyRef.current };

    if (!isAvatarCellValid(walkableCells, blockedFootprint, gxRef.current, gyRef.current)) {
      const safe = findNearestValidCell(kaserneTile.gx + 2, kaserneTile.gy, walkableCells, blockedFootprint);
      gxRef.current = safe.gx;
      gyRef.current = safe.gy;
      targetRef.current = pickPatrolTarget(safe.gx, safe.gy);
      dwellTimerRef.current = 0;
      lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
      if (stateRef.current === "pause") {
        stateRef.current = "walk";
        playRandomPatrol();
      }
    }

    let state = stateRef.current;
    if (state === "talk") {
      talkTimerRef.current -= dt;
      if (talkTimerRef.current <= 0) {
        stateRef.current = "walk";
        targetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
        playRandomPatrol();
      }
    } else if (state === "pause") {
      pauseTimerRef.current -= dt;
      if (pauseTimerRef.current <= 0) {
        stateRef.current = "walk";
        targetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
        playRandomPatrol();
      }
    } else {
      const target = targetRef.current;
      const dx = target.gx - gxRef.current;
      const dy = target.gy - gyRef.current;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.08) {
        gxRef.current = target.gx;
        gyRef.current = target.gy;
        stateRef.current = "pause";
        pauseTimerRef.current = PATROL_PAUSE_MIN + Math.random() * (PATROL_PAUSE_MAX - PATROL_PAUSE_MIN);
        playRandomPatrol();
      } else {
        const step = (PATROL_SPEED * dt) / dist;
        const nextGx = gxRef.current + dx * step;
        const nextGy = gyRef.current + dy * step;
        if (
          !isAvatarCellValid(walkableCells, blockedFootprint, nextGx, nextGy) ||
          !canNpcPatrolStepBetweenCells(surfaceData, gxRef.current, gyRef.current, nextGx, nextGy)
        ) {
          targetRef.current = pickPatrolTarget(gxRef.current, gyRef.current);
          stateRef.current = "walk";
          playRandomPatrol();
          const ndx = targetRef.current.gx - gxRef.current;
          const ndy = targetRef.current.gy - gyRef.current;
          if (Math.abs(ndx) > 1e-4 || Math.abs(ndy) > 1e-4) {
            facingAngleRef.current = Math.atan2(ndx * TILE_UNIT_SIZE, ndy * TILE_UNIT_SIZE);
          }
        } else {
          gxRef.current = nextGx;
          gyRef.current = nextGy;
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
    const countDwell = endState === "walk" || endState === "pause";
    if (countDwell) {
      if (dwellRounded !== lastDwellRoundedKeyRef.current) {
        lastDwellRoundedKeyRef.current = dwellRounded;
        dwellTimerRef.current = 0;
      } else {
        dwellTimerRef.current += dt;
        if (dwellTimerRef.current >= NPC_TILE_DWELL_RESET_SEC) {
          const safe = findNearestValidCell(kaserneTile.gx + 2, kaserneTile.gy, walkableCells, blockedFootprint);
          gxRef.current = safe.gx;
          gyRef.current = safe.gy;
          targetRef.current = pickPatrolTarget(safe.gx, safe.gy);
          dwellTimerRef.current = 0;
          lastDwellRoundedKeyRef.current = `${safe.gx},${safe.gy}`;
          if (endState === "pause") {
            stateRef.current = "walk";
            playRandomPatrol();
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
    const targetY = getNpcSupportWorldY(surfaceData, rgx, rgy) + FIGHT_GROUND_OFFSET_Y;
    pos.y += (targetY - pos.y) * sm;

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

  if (!kaserneTile || npcWalkableTiles.length === 0) return null;

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

/** Isolated Suspense so GLB loading never blanks the whole island scene. */
export function FightManNPCWithSuspense(props: Props) {
  return (
    <Suspense fallback={null}>
      <FightManNPC {...props} />
    </Suspense>
  );
}
