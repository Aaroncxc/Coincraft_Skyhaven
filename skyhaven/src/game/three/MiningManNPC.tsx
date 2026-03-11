import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect, useMemo, useCallback, type MutableRefObject } from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE, MINING_MAN_MODELS } from "./assets3d";
import { MINE_TILES } from "../types";
import type { IslandMap } from "../types";

Object.values(MINING_MAN_MODELS).forEach((p) => useGLTF.preload(p));

const CHAR_SCALE = 0.294;
const TILE_SURFACE_Y = 0.82;
const BASE_ROT_Y = -Math.PI / 4;
const CROSSFADE_DURATION = 0.2;
const PATROL_SPEED = 0.55;
const PATROL_PAUSE_MIN = 2;
const PATROL_PAUSE_MAX = 4;
const ATTACK_INTERVAL_MIN = 8;
const ATTACK_INTERVAL_MAX = 15;
const ATTACK_DURATION = 5;
const TALK_DURATION = 6;
type NpcState = "walk" | "pause" | "attack" | "talk";

type Props = {
  island: IslandMap;
  isTalking: boolean;
  npcPosRef: MutableRefObject<{ gx: number; gy: number } | null>;
  playerGx: number;
  playerGy: number;
};

function findMineTile(island: IslandMap): { gx: number; gy: number } | null {
  for (const t of island.tiles) {
    if ((MINE_TILES as readonly string[]).includes(t.type)) {
      return { gx: t.gx, gy: t.gy };
    }
  }
  return null;
}

function getWalkableTiles(island: IslandMap): { gx: number; gy: number }[] {
  return island.tiles.filter((t) => !t.blocked).map((t) => ({ gx: t.gx, gy: t.gy }));
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

export function MiningManNPC({ island, isTalking, npcPosRef, playerGx, playerGy }: Props) {
  const baseGltf = useGLTF(MINING_MAN_MODELS.base);
  const walkGltf = useGLTF(MINING_MAN_MODELS.walk);
  const attackGltf = useGLTF(MINING_MAN_MODELS.attack);
  const talkGltf = useGLTF(MINING_MAN_MODELS.talk);

  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const prevClipRef = useRef("");
  const initDoneRef = useRef(false);

  const stateRef = useRef<NpcState>("walk");
  const gxRef = useRef(0);
  const gyRef = useRef(0);
  const facingAngleRef = useRef(BASE_ROT_Y);
  const targetRef = useRef<{ gx: number; gy: number }>({ gx: 0, gy: 0 });
  const pauseTimerRef = useRef(0);
  const attackTimerRef = useRef(ATTACK_INTERVAL_MIN + Math.random() * (ATTACK_INTERVAL_MAX - ATTACK_INTERVAL_MIN));
  const attackDurationRef = useRef(0);
  const talkTimerRef = useRef(0);
  const spawnedRef = useRef(false);

  const mineTile = useMemo(() => findMineTile(island), [island]);
  const walkableTiles = useMemo(() => getWalkableTiles(island), [island]);

  useEffect(() => {
    if (!mineTile || walkableTiles.length === 0) return;
    if (!spawnedRef.current) {
      gxRef.current = mineTile.gx;
      gyRef.current = mineTile.gy;
      targetRef.current = pickRandomNearby(walkableTiles, mineTile.gx, mineTile.gy, 3);
      spawnedRef.current = true;
    }
  }, [mineTile, walkableTiles]);

  useMemo(() => {
    baseGltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
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
    add(attackGltf.animations, "attack");
    add(talkGltf.animations, "talk");
    return clips;
  }, [walkGltf.animations, attackGltf.animations, talkGltf.animations]);

  const { actions } = useAnimations(allClips, modelRef);

  const playClip = useCallback(
    (name: string, loop: boolean) => {
      const nextAction = actions[name];
      const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
      if (!nextAction) return;
      if (name === prevClipRef.current) return;
      nextAction.reset();
      if (loop) {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        nextAction.setLoop(THREE.LoopRepeat, Infinity);
      }
      if (prevAction && prevAction.isRunning()) {
        nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
      }
      nextAction.play();
      prevClipRef.current = name;
    },
    [actions],
  );

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
      playClip("talk", true);
    }
  }, [isTalking, playClip]);

  useFrame((_, delta) => {
    if (!outerRef.current || !mineTile || walkableTiles.length === 0) return;
    const dt = Math.min(0.05, delta);
    const state = stateRef.current;

    npcPosRef.current = { gx: gxRef.current, gy: gyRef.current };

    if (state === "talk") {
      talkTimerRef.current -= dt;
      if (talkTimerRef.current <= 0) {
        stateRef.current = "walk";
        targetRef.current = pickRandomNearby(walkableTiles, gxRef.current, gyRef.current, 3);
        playClip("walk", true);
      }
    } else if (state === "attack") {
      attackDurationRef.current -= dt;
      if (attackDurationRef.current <= 0) {
        stateRef.current = "walk";
        attackTimerRef.current = ATTACK_INTERVAL_MIN + Math.random() * (ATTACK_INTERVAL_MAX - ATTACK_INTERVAL_MIN);
        targetRef.current = pickRandomNearby(walkableTiles, gxRef.current, gyRef.current, 3);
        playClip("walk", true);
      }
    } else if (state === "pause") {
      pauseTimerRef.current -= dt;
      if (pauseTimerRef.current <= 0) {
        stateRef.current = "walk";
        targetRef.current = pickRandomNearby(walkableTiles, gxRef.current, gyRef.current, 3);
        playClip("walk", true);
      }
      attackTimerRef.current -= dt;
      if (attackTimerRef.current <= 0) {
        stateRef.current = "attack";
        attackDurationRef.current = ATTACK_DURATION;
        playClip("attack", true);
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
      } else {
        const step = (PATROL_SPEED * dt) / dist;
        gxRef.current += dx * step;
        gyRef.current += dy * step;
        const wx = dx * TILE_UNIT_SIZE;
        const wz = dy * TILE_UNIT_SIZE;
        if (Math.abs(wx) > 1e-4 || Math.abs(wz) > 1e-4) {
          facingAngleRef.current = Math.atan2(wx, wz);
        }
      }

      attackTimerRef.current -= dt;
      if (attackTimerRef.current <= 0) {
        stateRef.current = "attack";
        attackDurationRef.current = ATTACK_DURATION;
        playClip("attack", true);
      }
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
      if (state === "talk") {
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

  if (!mineTile || walkableTiles.length === 0) return null;

  return (
    <group ref={outerRef} position={[mineTile.gx * TILE_UNIT_SIZE, TILE_SURFACE_Y, mineTile.gy * TILE_UNIT_SIZE]}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive object={baseGltf.scene} />
        </group>
      </group>
    </group>
  );
}
