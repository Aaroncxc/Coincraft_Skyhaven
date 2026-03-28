import { useGLTF, useAnimations, useTexture } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import {
  TILE_UNIT_SIZE,
  CHAR_3D_MODELS,
  MAIN_CHAR_ALBEDO_MAP,
  MINING_MAN_MODELS,
  MAGIC_MAN_MODELS,
  FIGHT_MAN_SWORD_MODELS,
  FIGHT_MAN_ADV_MODELS,
  FIGHT_MAN_SWORD_FBX_URLS,
  FIGHT_MAN_ADV_FBX_URLS,
  FIGHT_MAN_ALBEDO_MAP,
  FIGHT_MAN_ADV_IDLE_COUNT,
  FIGHT_MAN_SWORD_IDLE_COUNT,
  AXE_PROP_GLB,
  MAIN_CHAR_AXE_CHOP_ANIM_GLB,
  AXE_CHOP_PLAYBACK_SEC,
} from "./assets3d";
import { DEFAULT_WALK_SURFACE_OFFSET_Y } from "./islandSurface";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import { getPlayableAvatarGroundProfile } from "./avatarGrounding";
import type { CharacterPose3D, TpsCameraState } from "./useCharacterMovement";
import {
  getEquippableItemBackTransform,
  getEquippableItemRightHandTransform,
  type EquippableItemId,
  type ItemSocketTransform,
} from "../equipment";
import type { PlayableCharacterId } from "../playableCharacters";
import { FBXLoader } from "./fbxLoader";

Object.values(CHAR_3D_MODELS).forEach((p) => useGLTF.preload(p));
useGLTF.preload(AXE_PROP_GLB);
useGLTF.preload(MAIN_CHAR_AXE_CHOP_ANIM_GLB);
useLoader.preload(FBXLoader, FIGHT_MAN_SWORD_MODELS.base);
useLoader.preload(FBXLoader, FIGHT_MAN_SWORD_MODELS.idle0);
useLoader.preload(FBXLoader, FIGHT_MAN_ADV_MODELS.idle0);

const CROSSFADE_DURATION = 0.14;
const BASE_ROT_Y = -Math.PI / 4;

function isPrevClipJump(prevClipName: string): boolean {
  return (
    prevClipName === "jump" ||
    prevClipName.endsWith("_jump") ||
    prevClipName.endsWith("_fallIdle") ||
    prevClipName.endsWith("_landing")
  );
}

/** Only use `crossFadeFrom(..., warp: true)` when the outgoing clip is not jump (jump uses timeScale≠1; warp breaks the fade). */
function allowCrossfadeWarpFrom(prevClipName: string): boolean {
  return !isPrevClipJump(prevClipName);
}

/** Same clip name as last time only skips a replay if that layer still drives the mixer (avoids T-pose after jump when `prevClipRef` stayed `*_walk` but the action was stopped). */
function isClipLayerActive(action: THREE.AnimationAction | null | undefined): boolean {
  if (!action) return false;
  return action.isRunning() && action.getEffectiveWeight() > 0.02;
}

/**
 * Never `crossFadeFrom` when prev and next are the same action (same ref) — three.js breaks the clip and walk/run stay dead after jump.
 */
function transitionAnimationAction(
  nextAction: THREE.AnimationAction,
  prevAction: THREE.AnimationAction | null,
  prevClipName: string,
  leavingJump: boolean,
): void {
  if (prevAction === nextAction) {
    nextAction.stopFading();
    nextAction.setEffectiveWeight(1);
    nextAction.play();
    return;
  }
  if (leavingJump && prevAction) {
    // Jump often already finished (`LoopOnce` + `clampWhenFinished`) before physics lands, so
    // `isRunning()` is false — fadeIn from 0 then leaves a gap. `crossFadeFrom` also starts
    // walk at weight 0 until the next mixer tick. Snap locomotion on first, then stop jump.
    nextAction.stopFading();
    nextAction.setEffectiveWeight(1);
    nextAction.play();
    prevAction.stop();
    return;
  }
  if (prevAction && prevAction.isRunning()) {
    nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, allowCrossfadeWarpFrom(prevClipName));
  }
  nextAction.play();
}

const CHAR_SCALE = 0.294;
/** FBX from Mixamo uses centimetres (1 unit = 1 cm); GLB characters use metres. */
const FIGHT_MAN_FBX_SCALE = CHAR_SCALE * 0.01;
/**
 * Overlay previews now use the same Fight Man mesh scale as gameplay.
 * An extra orbit-only multiplier pushed the camera inside the torso.
 */
export const FIGHT_MAN_ORBIT_MESH_SCALE_MULT = 1;
const JUMP_ARC_HEIGHT = 0.5;
const JUMP_DURATION_DEFAULT = 0.38;
const SPELL_DURATION_DEFAULT = 1.05;
const DEFAULT_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("default").visualGroundOffsetY;
const MINING_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("mining_man").visualGroundOffsetY;
const MAGIC_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("magic_man").visualGroundOffsetY;
const FIGHT_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("fight_man").visualGroundOffsetY;
/** Max head yaw (rad) toward TPS camera vs body facing; approx. ±54°. */
const FIGHT_MAN_HEAD_YAW_MAX_RAD = 0.95;
/** Lerp toward target head yaw per second (higher = snappier, less fight with fast idle). */
const FIGHT_MAN_HEAD_LOOK_SMOOTH_SPEED = 14;
const warnedMissingRightHandSocketVariants = new Set<PlayableCharacterId>();
const warnedMissingBackSocketVariants = new Set<PlayableCharacterId>();

export type RightHandSocketState = {
  found: boolean;
  variant: PlayableCharacterId;
  nodeName: string | null;
};

export type BackSocketState = {
  found: boolean;
  variant: PlayableCharacterId;
  nodeName: string | null;
};

type BaseProps = {
  pose: CharacterPose3D;
  mouseGroundRef?: MutableRefObject<THREE.Vector3 | null>;
  /** TPS camera state; fight_man uses `viewYaw` for procedural head look (no extra React renders). */
  tpsCameraStateRef?: MutableRefObject<TpsCameraState>;
  /** `preview` is for lightweight overlay canvases; `world` keeps the full gameplay animation set. */
  renderContext?: "world" | "preview";
  equippedRightHand?: EquippableItemId | null;
  equippedRightHandTransformOverride?: ItemSocketTransform | null;
  /** Stowed weapon when in inventory but not on action bar (mutually exclusive with hand in App). */
  stowedBackItem?: EquippableItemId | null;
  equippedBackTransformOverride?: ItemSocketTransform | null;
  onEquippedToolObjectChange?: (toolObject: THREE.Object3D | null) => void;
  onRightHandSocketStateChange?: (state: RightHandSocketState) => void;
  onBackSocketStateChange?: (state: BackSocketState) => void;
  /** Character debug / profile: pass `FIGHT_MAN_ORBIT_MESH_SCALE_MULT` for `fight_man` only. */
  fightManOrbitMeshScaleMult?: number;
};

function applySocketTransform(object: THREE.Object3D, transform: ItemSocketTransform): void {
  object.position.set(transform.position[0], transform.position[1], transform.position[2]);
  object.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
  object.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
}

function disposeObject3D(root: THREE.Object3D): void {
  const disposed = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material || disposed.has(material)) continue;
      material.dispose();
      disposed.add(material);
    }
  });
}

function buildWoodAxePlaceholder(): THREE.Group {
  const group = new THREE.Group();
  group.name = "WoodAxePlaceholder";

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 1.42, 10),
    new THREE.MeshStandardMaterial({ color: 0x6e4b29, roughness: 0.9, metalness: 0.05 }),
  );
  handle.position.set(0, 0.72, 0);

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.36, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xa5b3be, roughness: 0.35, metalness: 0.85 }),
  );
  blade.position.set(0.27, 1.22, 0);

  const bladeCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.4 }),
  );
  bladeCap.position.set(0.05, 1.16, 0);

  group.add(handle);
  group.add(blade);
  group.add(bladeCap);
  return group;
}

function createToolObject(itemId: EquippableItemId): THREE.Object3D {
  switch (itemId) {
    case "wood_axe_placeholder":
      return buildWoodAxePlaceholder();
    default: {
      const fallback = new THREE.Group();
      fallback.name = "UnknownToolPlaceholder";
      return fallback;
    }
  }
}

function cloneWoodAxeFromGltf(axeTemplate: THREE.Object3D): THREE.Group {
  const group = axeTemplate.clone(true) as THREE.Group;
  group.name = "WoodAxeGltf";
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
  tuneSkinnedSceneMaterials(group);
  return group;
}

function makeEquippedToolObject(itemId: EquippableItemId, axeTemplate: THREE.Object3D): THREE.Object3D {
  if (itemId === "wood_axe_placeholder") {
    return cloneWoodAxeFromGltf(axeTemplate);
  }
  return createToolObject(itemId);
}

/** GLB rigs use `RightHand`; Mixamo FBX often uses `mixamorigRightHand` / `mixamorig:RightHand`. */
function findRightHandAttachmentBone(modelRoot: THREE.Object3D): THREE.Object3D | null {
  const exact = [
    "RightHand",
    "mixamorigRightHand",
    "MixamorigRightHand",
    "mixamorig:RightHand",
    "Mixamorig:RightHand",
  ];
  for (const name of exact) {
    const o = modelRoot.getObjectByName(name);
    if (o) return o;
  }
  let found: THREE.Object3D | null = null;
  modelRoot.traverse((child) => {
    if (found) return;
    const n = child.name;
    if (/(^|[.:])RightHand$/i.test(n)) {
      found = child;
      return;
    }
    const leaf = n.includes(":") ? n.split(":").pop()! : n.includes("|") ? n.split("|").pop()! : n;
    if (/^mixamorigRightHand$/i.test(leaf) || /^RightHand$/i.test(leaf)) {
      found = child;
    }
  });
  return found;
}

/** Upper spine / chest; GLB and Mixamo naming varies. */
function findBackAttachmentBone(modelRoot: THREE.Object3D): THREE.Object3D | null {
  const exact = [
    "Spine2",
    "spine_02",
    "mixamorigSpine2",
    "Chest",
    "UpperChest",
    "mixamorigSpine1",
    "mixamorigSpine",
    "Spine1",
    "spine1",
  ];
  for (const name of exact) {
    const o = modelRoot.getObjectByName(name);
    if (o) return o;
  }
  let found: THREE.Object3D | null = null;
  modelRoot.traverse((child) => {
    if (found) return;
    const n = child.name;
    const leaf = n.includes(":") ? n.split(":").pop()! : n.includes("|") ? n.split("|").pop()! : n;
    if (/spine2$/i.test(leaf) || /^chest$/i.test(leaf) || /upperchest/i.test(leaf)) {
      found = child;
    }
  });
  if (!found) {
    modelRoot.traverse((child) => {
      if (found) return;
      const n = child.name;
      const leaf = n.includes(":") ? n.split(":").pop()! : n.includes("|") ? n.split("|").pop()! : n;
      if (/spine/i.test(leaf) && !/shoulder/i.test(leaf)) {
        found = child;
      }
    });
  }
  return found;
}

function useAttachRightHandSocket(
  modelRef: RefObject<THREE.Group | null>,
  rightHandSocket: THREE.Group,
  playableVariant: PlayableCharacterId,
  onRightHandSocketStateChange?: (state: RightHandSocketState) => void,
): boolean {
  const [socketReady, setSocketReady] = useState(false);

  useEffect(() => {
    const modelRoot = modelRef.current;
    if (!modelRoot) {
      setSocketReady(false);
      return;
    }

    const rightHand = findRightHandAttachmentBone(modelRoot);
    if (!rightHand) {
      setSocketReady(false);
      if (!warnedMissingRightHandSocketVariants.has(playableVariant)) {
        warnedMissingRightHandSocketVariants.add(playableVariant);
        console.warn(
          `[CharacterModel] Missing RightHand socket for playableVariant "${playableVariant}".`,
        );
      }
      onRightHandSocketStateChange?.({
        found: false,
        variant: playableVariant,
        nodeName: null,
      });
      return;
    }

    onRightHandSocketStateChange?.({
      found: true,
      variant: playableVariant,
      nodeName: rightHand.name,
    });
    setSocketReady(true);
    rightHand.add(rightHandSocket);

    return () => {
      setSocketReady(false);
      rightHand.remove(rightHandSocket);
      onRightHandSocketStateChange?.({
        found: false,
        variant: playableVariant,
        nodeName: rightHand.name,
      });
    };
  }, [modelRef, onRightHandSocketStateChange, playableVariant, rightHandSocket]);

  return socketReady;
}

function useEquippedRightHandTool(
  rightHandSocket: THREE.Group,
  socketReady: boolean,
  equippedRightHand: EquippableItemId | null,
  axeTemplate: THREE.Object3D,
  playableVariant: PlayableCharacterId,
  equippedRightHandTransformOverride?: ItemSocketTransform | null,
  onEquippedToolObjectChange?: (toolObject: THREE.Object3D | null) => void,
): void {
  const toolObjectRef = useRef<THREE.Object3D | null>(null);
  const transformOverrideRef = useRef<ItemSocketTransform | null | undefined>(
    equippedRightHandTransformOverride,
  );
  transformOverrideRef.current = equippedRightHandTransformOverride;
  useEffect(() => {
    const previousTool = toolObjectRef.current;
    if (previousTool) {
      rightHandSocket.remove(previousTool);
      onEquippedToolObjectChange?.(null);
      disposeObject3D(previousTool);
      toolObjectRef.current = null;
    }

    if (!socketReady || !equippedRightHand) {
      return;
    }

    const toolObject = makeEquippedToolObject(equippedRightHand, axeTemplate);
    const initialTransform =
      transformOverrideRef.current ??
      getEquippableItemRightHandTransform(equippedRightHand, playableVariant);
    if (initialTransform) {
      applySocketTransform(toolObject, initialTransform);
    }
    rightHandSocket.add(toolObject);
    toolObjectRef.current = toolObject;
    onEquippedToolObjectChange?.(toolObject);

    return () => {
      rightHandSocket.remove(toolObject);
      onEquippedToolObjectChange?.(null);
      disposeObject3D(toolObject);
      if (toolObjectRef.current === toolObject) {
        toolObjectRef.current = null;
      }
    };
  }, [equippedRightHand, rightHandSocket, axeTemplate, onEquippedToolObjectChange, socketReady]);

  useLayoutEffect(() => {
    if (!socketReady || !equippedRightHand || !toolObjectRef.current) return;
    const transform =
      equippedRightHandTransformOverride ??
      getEquippableItemRightHandTransform(equippedRightHand, playableVariant);
    if (!transform) return;
    applySocketTransform(toolObjectRef.current, transform);
  }, [
    equippedRightHand,
    equippedRightHandTransformOverride,
    playableVariant,
    socketReady,
  ]);
}

function useAttachBackSocket(
  modelRef: RefObject<THREE.Group | null>,
  backSocket: THREE.Group,
  playableVariant: PlayableCharacterId,
  onBackSocketStateChange?: (state: BackSocketState) => void,
): boolean {
  const [socketReady, setSocketReady] = useState(false);

  useEffect(() => {
    const modelRoot = modelRef.current;
    if (!modelRoot) {
      setSocketReady(false);
      return;
    }

    const backBone = findBackAttachmentBone(modelRoot);
    if (!backBone) {
      setSocketReady(false);
      if (!warnedMissingBackSocketVariants.has(playableVariant)) {
        warnedMissingBackSocketVariants.add(playableVariant);
        console.warn(
          `[CharacterModel] Missing back (spine/chest) socket for playableVariant "${playableVariant}".`,
        );
      }
      onBackSocketStateChange?.({
        found: false,
        variant: playableVariant,
        nodeName: null,
      });
      return;
    }

    onBackSocketStateChange?.({
      found: true,
      variant: playableVariant,
      nodeName: backBone.name,
    });
    setSocketReady(true);
    backBone.add(backSocket);

    return () => {
      setSocketReady(false);
      backBone.remove(backSocket);
      onBackSocketStateChange?.({
        found: false,
        variant: playableVariant,
        nodeName: backBone.name,
      });
    };
  }, [modelRef, onBackSocketStateChange, playableVariant, backSocket]);

  return socketReady;
}

function useStowedBackTool(
  backSocket: THREE.Group,
  socketReady: boolean,
  stowedBackItem: EquippableItemId | null,
  axeTemplate: THREE.Object3D,
  playableVariant: PlayableCharacterId,
  equippedBackTransformOverride?: ItemSocketTransform | null,
  onEquippedToolObjectChange?: (toolObject: THREE.Object3D | null) => void,
): void {
  const toolObjectRef = useRef<THREE.Object3D | null>(null);
  const transformOverrideRef = useRef<ItemSocketTransform | null | undefined>(
    equippedBackTransformOverride,
  );
  transformOverrideRef.current = equippedBackTransformOverride;
  useEffect(() => {
    const previousTool = toolObjectRef.current;
    if (previousTool) {
      backSocket.remove(previousTool);
      onEquippedToolObjectChange?.(null);
      disposeObject3D(previousTool);
      toolObjectRef.current = null;
    }

    if (!socketReady || !stowedBackItem) {
      return;
    }

    const toolObject = makeEquippedToolObject(stowedBackItem, axeTemplate);
    const initialTransform =
      transformOverrideRef.current ?? getEquippableItemBackTransform(stowedBackItem, playableVariant);
    if (initialTransform) {
      applySocketTransform(toolObject, initialTransform);
    }
    backSocket.add(toolObject);
    toolObjectRef.current = toolObject;
    onEquippedToolObjectChange?.(toolObject);

    return () => {
      backSocket.remove(toolObject);
      onEquippedToolObjectChange?.(null);
      disposeObject3D(toolObject);
      if (toolObjectRef.current === toolObject) {
        toolObjectRef.current = null;
      }
    };
  }, [
    stowedBackItem,
    backSocket,
    axeTemplate,
    onEquippedToolObjectChange,
    playableVariant,
    socketReady,
  ]);

  useLayoutEffect(() => {
    if (!socketReady || !stowedBackItem || !toolObjectRef.current) return;
    const transform =
      equippedBackTransformOverride ??
      getEquippableItemBackTransform(stowedBackItem, playableVariant);
    if (!transform) return;
    applySocketTransform(toolObjectRef.current, transform);
  }, [stowedBackItem, equippedBackTransformOverride, playableVariant, socketReady]);
}

function tuneSkinnedSceneMaterials(scene: THREE.Object3D): void {
  scene.traverse((child) => {
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
}

function useCharacterFrame(
  outerRef: RefObject<THREE.Group | null>,
  modelRef: RefObject<THREE.Group | null>,
  poseRef: React.MutableRefObject<CharacterPose3D>,
  mouseGroundRef: MutableRefObject<THREE.Vector3 | null> | undefined,
  groundOffsetY: number,
): void {
  const jumpArcTimer = useRef(0);
  const wasJumping = useRef(false);

  useFrame((_, delta) => {
    if (!outerRef.current) return;
    const p = poseRef.current;
    const offsetY = groundOffsetY;
    const tx = p.gx * TILE_UNIT_SIZE;
    const tz = p.gy * TILE_UNIT_SIZE;
    const pos = outerRef.current.position;

    const sm = 1 - Math.exp(-12 * delta);
    const isJumping = p.animState === "jump";
    const isRolling = p.animState === "roll";
    const isCombatLocked = p.animState === "chop" || p.animState === "attack";
    if (isJumping && !wasJumping.current) {
      jumpArcTimer.current = 0;
    }
    wasJumping.current = isJumping;
    if (isJumping || isRolling || isCombatLocked) {
      pos.x = tx;
      pos.z = tz;
    } else {
      pos.x += (tx - pos.x) * sm;
      pos.z += (tz - pos.z) * sm;
    }

    let targetY: number;
    if (p.worldY != null) {
      targetY = p.worldY + offsetY;
    } else {
      let arcY = 0;
      if (isJumping) {
        jumpArcTimer.current += delta;
        const dur = p.jumpDuration ?? JUMP_DURATION_DEFAULT;
        const t = Math.min(1, jumpArcTimer.current / dur);
        const ascentPortion = 0.46;
        let arcNorm = 0;
        if (t < ascentPortion) {
          const u = t / ascentPortion;
          arcNorm = Math.sin((u * Math.PI) / 2);
        } else {
          const u = (t - ascentPortion) / (1 - ascentPortion);
          arcNorm = Math.cos((u * Math.PI) / 2);
        }
        arcY = JUMP_ARC_HEIGHT * Math.max(0, arcNorm);
      }
      targetY = (p.surfaceY ?? DEFAULT_WALK_SURFACE_OFFSET_Y) + arcY + offsetY;
    }
    if (p.worldY != null && p.grounded === false) {
      pos.y = targetY;
    } else {
      pos.y += (targetY - pos.y) * sm;
      if (Math.abs(pos.y - targetY) <= 1e-4) {
        pos.y = targetY;
      }
    }

    if (modelRef.current) {
      const hasMoveInput = p.animState === "walk" || p.animState === "run";
      const useMouseLook = hasMoveInput && p.isManualMove;
      const mousePos = mouseGroundRef?.current;
      let targetRot: number;
      if (p.facingAngle != null) {
        targetRot = p.facingAngle;
      } else if (useMouseLook && mousePos) {
        const cx = pos.x;
        const cz = pos.z;
        const dx = mousePos.x - cx;
        const dz = mousePos.z - cz;
        if (Math.abs(dx) > 1e-5 || Math.abs(dz) > 1e-5) {
          targetRot = Math.atan2(dx, dz);
        } else {
          targetRot = p.direction === "right" ? BASE_ROT_Y + Math.PI : BASE_ROT_Y;
        }
      } else {
        targetRot = p.direction === "right" ? BASE_ROT_Y + Math.PI : BASE_ROT_Y;
      }
      const cur = modelRef.current.rotation.y;
      let diff = targetRot - cur;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      modelRef.current.rotation.y += diff * sm;
    }
  });
}

function DefaultCharacterModel({
  pose,
  mouseGroundRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  stowedBackItem = null,
  equippedBackTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
  onBackSocketStateChange,
}: BaseProps) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const prevClipRef = useRef("");
  const lastChopSwingIdRef = useRef<number | undefined>(undefined);
  const initDoneRef = useRef(false);

  const idleToggleRef = useRef<boolean>(false);

  const idleGltf = useGLTF(CHAR_3D_MODELS.idle);
  const idle2Gltf = useGLTF(CHAR_3D_MODELS.idle2);
  const walkGltf = useGLTF(CHAR_3D_MODELS.walk);
  const runGltf = useGLTF(CHAR_3D_MODELS.run);
  const skillGltf = useGLTF(CHAR_3D_MODELS.skill);
  const alertGltf = useGLTF(CHAR_3D_MODELS.alert);
  const jumpGltf = useGLTF(CHAR_3D_MODELS.jump);
  const spellGltf = useGLTF(CHAR_3D_MODELS.spell);
  const rollGltf = useGLTF(CHAR_3D_MODELS.roll);
  const axePropGltf = useGLTF(AXE_PROP_GLB);
  const axeChopGltf = useGLTF(MAIN_CHAR_AXE_CHOP_ANIM_GLB);

  const modelScene = useMemo(
    () => SkeletonUtils.clone(idleGltf.scene) as THREE.Group,
    [idleGltf.scene],
  );
  const rightHandSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "RightHandSocket";
    return socket;
  }, []);
  const backSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "BackSocket";
    return socket;
  }, []);

  useMemo(() => {
    tuneSkinnedSceneMaterials(modelScene);
  }, [modelScene]);

  const bodyAlbedo = useTexture(MAIN_CHAR_ALBEDO_MAP, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
  });

  useLayoutEffect(() => {
    bodyAlbedo.colorSpace = THREE.SRGBColorSpace;
    bodyAlbedo.flipY = false;
    bodyAlbedo.needsUpdate = true;
    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.map = bodyAlbedo;
          mat.needsUpdate = true;
        }
      }
    });
  }, [modelScene, bodyAlbedo]);

  const allClips = useMemo(() => {
    const clips: THREE.AnimationClip[] = [];
    const ROOT_TRANSLATION_TRACK = /(^|\.)(armature|root|hips|mixamorighips)\.position$/i;
    const add = (
      anims: THREE.AnimationClip[],
      name: string,
      options: { stripRootTranslation?: boolean } = {},
    ) => {
      if (anims.length > 0) {
        const c = anims[0].clone();
        if (options.stripRootTranslation) {
          c.tracks = c.tracks.filter((track) => !ROOT_TRANSLATION_TRACK.test(track.name));
        }
        c.name = name;
        clips.push(c);
      }
    };
    add(idleGltf.animations, "idle");
    add(idle2Gltf.animations, "idle2");
    add(walkGltf.animations, "walk");
    add(runGltf.animations, "run");
    add(skillGltf.animations, "skill");
    add(alertGltf.animations, "alert");
    add(jumpGltf.animations, "jump");
    add(spellGltf.animations, "spell");
    add(rollGltf.animations, "roll", { stripRootTranslation: true });
    add(axeChopGltf.animations, "chopAxe");
    return clips;
  }, [
    idleGltf.animations,
    idle2Gltf.animations,
    walkGltf.animations,
    runGltf.animations,
    skillGltf.animations,
    alertGltf.animations,
    jumpGltf.animations,
    spellGltf.animations,
    rollGltf.animations,
    axeChopGltf.animations,
  ]);

  const { actions } = useAnimations(allClips, modelRef);

  const hasRightHandSocket = useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "default",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    hasRightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "default",
    equippedRightHandTransformOverride,
    onEquippedToolObjectChange,
  );

  const hasBackSocket = useAttachBackSocket(
    modelRef,
    backSocket,
    "default",
    onBackSocketStateChange,
  );
  useStowedBackTool(
    backSocket,
    hasBackSocket,
    stowedBackItem,
    axePropGltf.scene,
    "default",
    equippedBackTransformOverride,
    onEquippedToolObjectChange,
  );

  useEffect(() => {
    if (initDoneRef.current) return;
    const idle = actions["idle"];
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      prevClipRef.current = "idle";
      initDoneRef.current = true;
    }
  }, [actions]);

  useLayoutEffect(() => {
    if (!initDoneRef.current) return;
    let target: string;
    switch (pose.animState) {
      case "walk":
        target = "walk";
        break;
      case "run":
        target = "run";
        break;
      case "attack":
        target = "alert";
        break;
      case "chop":
        target =
          equippedRightHand === "wood_axe_placeholder" && actions["chopAxe"]
            ? "chopAxe"
            : "skill";
        break;
      case "jump":
        target = "jump";
        break;
      case "spell":
        target = "spell";
        break;
      case "roll":
        target = "roll";
        break;
      default: {
        const prev = prevClipRef.current;
        if (
          (prev === "idle" || prev === "idle2") &&
          isClipLayerActive(actions[prev])
        ) {
          return;
        }
        idleToggleRef.current = !idleToggleRef.current;
        target = idleToggleRef.current ? "idle2" : "idle";
        break;
      }
    }

    const chopSwingReplay =
      pose.animState === "chop" &&
      pose.chopSwingId != null &&
      pose.chopSwingId !== lastChopSwingIdRef.current;
    if (chopSwingReplay) {
      lastChopSwingIdRef.current = pose.chopSwingId;
    }
    if (
      target === prevClipRef.current &&
      !chopSwingReplay &&
      isClipLayerActive(actions[target])
    ) {
      return;
    }

    const nextAction = actions[target];
    const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
    if (!nextAction) return;
    const clipDuration = nextAction.getClip().duration;

    nextAction.reset();
    if (
      pose.animState === "attack" ||
      pose.animState === "chop" ||
      pose.animState === "jump" ||
      pose.animState === "spell" ||
      pose.animState === "roll"
    ) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      let desiredDuration = clipDuration;
      if (pose.animState === "jump") {
        desiredDuration = pose.jumpDuration ?? JUMP_DURATION_DEFAULT;
      } else if (pose.animState === "roll") {
        desiredDuration = pose.rollDuration ?? clipDuration;
      } else if (pose.animState === "chop") {
        desiredDuration = pose.chopDuration ?? AXE_CHOP_PLAYBACK_SEC;
      } else if (pose.animState === "spell") {
        desiredDuration = SPELL_DURATION_DEFAULT;
      }
      if (clipDuration > 1e-4 && desiredDuration > 1e-4) {
        nextAction.timeScale = clipDuration / desiredDuration;
      } else {
        nextAction.timeScale = 1;
      }
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1;
      nextAction.clampWhenFinished = false;
    }

    const prevName = prevClipRef.current;
    const leavingJump = isPrevClipJump(prevName) && pose.animState !== "jump";
    transitionAnimationAction(nextAction, prevAction, prevName, leavingJump);
    prevClipRef.current = target;
  }, [
    pose.animState,
    actions,
    pose.jumpDuration,
    pose.rollDuration,
    pose.chopDuration,
    pose.chopSwingId,
    equippedRightHand,
  ]);

  useCharacterFrame(outerRef, modelRef, poseRef, mouseGroundRef, DEFAULT_GROUND_OFFSET_Y);

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive object={modelScene} />
        </group>
      </group>
    </group>
  );
}

const ROOT_TRANSLATION_TRACK_FIGHT = /(^|[.:])(armature|root|hips|mixamorighips)\.position$/i;
type FightManClipPolicy =
  | {
      prefix: "adv";
      key: keyof typeof FIGHT_MAN_ADV_MODELS;
      outName: string;
      stripRootTranslation?: boolean;
    }
  | {
      prefix: "sword";
      key: keyof typeof FIGHT_MAN_SWORD_MODELS;
      outName: string;
      stripRootTranslation?: boolean;
    };

const FIGHT_MAN_CLIP_DEFAULTS = Object.freeze({
  stripRootTranslation: true,
});

const FIGHT_MAN_WORLD_CLIP_POLICIES: readonly FightManClipPolicy[] = [
  { prefix: "adv", key: "idle0", outName: "idle0" },
  { prefix: "adv", key: "rmbLook", outName: "rmbLook" },
  { prefix: "adv", key: "walk", outName: "walk" },
  { prefix: "adv", key: "strafeWalkL", outName: "strafeWalkL" },
  { prefix: "adv", key: "strafeWalkR", outName: "strafeWalkR" },
  { prefix: "adv", key: "run", outName: "run" },
  { prefix: "adv", key: "strafeRunL", outName: "strafeL" },
  { prefix: "adv", key: "strafeRunR", outName: "strafeR" },
  { prefix: "adv", key: "turn90L", outName: "turn90L" },
  { prefix: "adv", key: "turn90R", outName: "turn90R" },
  { prefix: "adv", key: "jump", outName: "jump" },
  { prefix: "adv", key: "fallIdle", outName: "fallIdle" },
  { prefix: "adv", key: "landing", outName: "landing" },
  { prefix: "adv", key: "roll", outName: "roll" },
  { prefix: "adv", key: "spell", outName: "spell" },
  { prefix: "sword", key: "idle0", outName: "idle0" },
  { prefix: "sword", key: "rmbLook", outName: "rmbLook" },
  { prefix: "sword", key: "walk", outName: "walk" },
  { prefix: "sword", key: "strafeWalkL", outName: "strafeWalkL" },
  { prefix: "sword", key: "strafeWalkR", outName: "strafeWalkR" },
  { prefix: "sword", key: "run", outName: "run" },
  { prefix: "sword", key: "strafeRunL", outName: "strafeL" },
  { prefix: "sword", key: "strafeRunR", outName: "strafeR" },
  { prefix: "sword", key: "turn90L", outName: "turn90L" },
  { prefix: "sword", key: "turn90R", outName: "turn90R" },
  { prefix: "sword", key: "jump", outName: "jump" },
  { prefix: "sword", key: "fallIdle", outName: "fallIdle" },
  { prefix: "sword", key: "landing", outName: "landing" },
  { prefix: "sword", key: "attack", outName: "attack" },
  { prefix: "sword", key: "skill", outName: "skill" },
  { prefix: "sword", key: "spell", outName: "spell" },
  { prefix: "sword", key: "roll", outName: "roll" },
] as const;

const FIGHT_MAN_PREVIEW_CLIP_POLICIES: readonly FightManClipPolicy[] = [
  { prefix: "adv", key: "idle0", outName: "idle0" },
  { prefix: "sword", key: "idle0", outName: "idle0" },
] as const;

function resolveFightManClipUrl(policy: FightManClipPolicy): string {
  return policy.prefix === "adv"
    ? FIGHT_MAN_ADV_MODELS[policy.key]
    : FIGHT_MAN_SWORD_MODELS[policy.key];
}

function cloneFirstAnimationClip(
  animations: THREE.AnimationClip[],
  outName: string,
  options: { stripRootTranslation?: boolean } = {},
): THREE.AnimationClip | null {
  if (animations.length === 0) return null;
  const c = animations[0].clone();
  c.name = outName;
  if (options.stripRootTranslation) {
    c.tracks = c.tracks.filter((track) => !ROOT_TRANSLATION_TRACK_FIGHT.test(track.name));
  }
  return c;
}

function buildFightManAnimationClips(
  fbxByUrl: Map<string, THREE.Group>,
  policies: readonly FightManClipPolicy[],
): THREE.AnimationClip[] {
  const clips: THREE.AnimationClip[] = [];
  for (const policy of policies) {
    const clip = cloneFirstAnimationClip(
      fbxByUrl.get(resolveFightManClipUrl(policy))?.animations ?? [],
      `${policy.prefix}_${policy.outName}`,
      {
        stripRootTranslation:
          policy.stripRootTranslation ?? FIGHT_MAN_CLIP_DEFAULTS.stripRootTranslation,
      },
    );
    if (clip) {
      clips.push(clip);
    }
  }
  return clips;
}

function FightManPreviewModel({
  pose,
  mouseGroundRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  stowedBackItem = null,
  equippedBackTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
  onBackSocketStateChange,
  fightManOrbitMeshScaleMult = 1,
}: BaseProps) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const fightManMeshScale = FIGHT_MAN_FBX_SCALE * fightManOrbitMeshScaleMult;
  const hipsBoneRef = useRef<THREE.Bone | null>(null);
  const hipsRestPositionRef = useRef<THREE.Vector3 | null>(null);

  const baseRoot = useLoader(FBXLoader, FIGHT_MAN_SWORD_MODELS.base) as THREE.Group;
  const swordIdleRoot = useLoader(FBXLoader, FIGHT_MAN_SWORD_MODELS.idle0) as THREE.Group;
  const advIdleRoot = useLoader(FBXLoader, FIGHT_MAN_ADV_MODELS.idle0) as THREE.Group;
  const axePropGltf = useGLTF(AXE_PROP_GLB);
  const modelScene = useMemo(
    () => SkeletonUtils.clone(baseRoot) as THREE.Group,
    [baseRoot],
  );

  const rightHandSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "RightHandSocket";
    return socket;
  }, []);
  const backSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "BackSocket";
    return socket;
  }, []);

  useMemo(() => {
    tuneSkinnedSceneMaterials(modelScene);
  }, [modelScene]);

  const bodyAlbedo = useTexture(FIGHT_MAN_ALBEDO_MAP, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
  });

  useLayoutEffect(() => {
    bodyAlbedo.colorSpace = THREE.SRGBColorSpace;
    bodyAlbedo.flipY = false;
    bodyAlbedo.needsUpdate = true;
    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.map = bodyAlbedo;
          mat.needsUpdate = true;
        }
      }
    });
  }, [modelScene, bodyAlbedo]);

  useLayoutEffect(() => {
    const hipsBone = findFightManHipsBone(modelScene);
    hipsBoneRef.current = hipsBone;
    hipsRestPositionRef.current = hipsBone ? hipsBone.position.clone() : null;
  }, [modelScene]);

  const allClips = useMemo(() => {
    const fbxByUrl = new Map<string, THREE.Group>([
      [FIGHT_MAN_SWORD_MODELS.base, baseRoot],
      [FIGHT_MAN_SWORD_MODELS.idle0, swordIdleRoot],
      [FIGHT_MAN_ADV_MODELS.idle0, advIdleRoot],
    ]);
    return buildFightManAnimationClips(fbxByUrl, FIGHT_MAN_PREVIEW_CLIP_POLICIES);
  }, [baseRoot, swordIdleRoot, advIdleRoot]);

  const { actions } = useAnimations(allClips, modelRef);

  const hasRightHandSocket = useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "fight_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    hasRightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "fight_man",
    equippedRightHandTransformOverride,
    onEquippedToolObjectChange,
  );

  const hasBackSocket = useAttachBackSocket(
    modelRef,
    backSocket,
    "fight_man",
    onBackSocketStateChange,
  );
  useStowedBackTool(
    backSocket,
    hasBackSocket,
    stowedBackItem,
    axePropGltf.scene,
    "fight_man",
    equippedBackTransformOverride,
    onEquippedToolObjectChange,
  );

  useEffect(() => {
    const preferredName = equippedRightHand ? "sword_idle0" : "adv_idle0";
    const nextAction =
      actions[preferredName] ?? actions["adv_idle0"] ?? actions["sword_idle0"];
    if (!nextAction) return;

    for (const action of Object.values(actions)) {
      if (!action || action === nextAction) continue;
      action.stop();
    }

    nextAction.reset();
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.timeScale = 1;
    nextAction.clampWhenFinished = false;
    nextAction.play();
  }, [actions, equippedRightHand]);

  useFrame(() => {
    const hipsBone = hipsBoneRef.current;
    const restPosition = hipsRestPositionRef.current;
    if (!hipsBone || !restPosition) return;
    hipsBone.position.x = restPosition.x;
    hipsBone.position.z = restPosition.z;
  }, 100);

  useCharacterFrame(outerRef, modelRef, poseRef, mouseGroundRef, FIGHT_GROUND_OFFSET_Y);

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={fightManMeshScale}>
          <primitive object={modelScene} />
        </group>
      </group>
    </group>
  );
}

function wrapFightManAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function findFightManHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Bone)) return;
    const shortName = child.name.replace(/^.*:/, "");
    if (/^head$/i.test(shortName)) {
      found = child;
    }
  });
  return found;
}

function findFightManHipsBone(root: THREE.Object3D): THREE.Bone | null {
  let found: THREE.Bone | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof THREE.Bone)) return;
    const shortName = child.name.replace(/^.*:/, "");
    if (/^mixamorighips$/i.test(shortName) || /^hips$/i.test(shortName)) {
      found = child;
    }
  });
  return found;
}

function fightManLocomotionActionName(
  prefix: string,
  animState: "walk" | "run",
  locomotionStrafe: CharacterPose3D["locomotionStrafe"],
): string {
  const s = locomotionStrafe ?? "none";
  if (animState === "walk") {
    if (s === "left") return `${prefix}_strafeWalkL`;
    if (s === "right") return `${prefix}_strafeWalkR`;
    return `${prefix}_walk`;
  }
  if (s === "left") return `${prefix}_strafeL`;
  if (s === "right") return `${prefix}_strafeR`;
  return `${prefix}_run`;
}

function pickRandomIdleClipName(
  prefix: string,
  idleCount: number,
  lastIndex: number,
): { name: string; index: number } {
  let next: number;
  do {
    next = Math.floor(Math.random() * idleCount);
  } while (next === lastIndex && idleCount > 1);
  return { name: `${prefix}_idle${next}`, index: next };
}

function FightManPlayableModel({
  pose,
  mouseGroundRef,
  tpsCameraStateRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  stowedBackItem = null,
  equippedBackTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
  onBackSocketStateChange,
  fightManOrbitMeshScaleMult = 1,
}: BaseProps) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const prevClipRef = useRef("");
  const lastChopSwingIdRef = useRef<number | undefined>(undefined);
  const initDoneRef = useRef(false);
  const lastIdleIndexRef = useRef(-1);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const hipsBoneRef = useRef<THREE.Bone | null>(null);
  const hipsRestPositionRef = useRef<THREE.Vector3 | null>(null);
  const fightManMeshScale = FIGHT_MAN_FBX_SCALE * fightManOrbitMeshScaleMult;
  const headLookEulerRef = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const headLookSmoothedYRef = useRef(0);

  /** Split loaders: one huge `useLoader(url[])` was crashing the WebView; two stable arrays are OK. */
  const swordFbxRoots = useLoader(FBXLoader, FIGHT_MAN_SWORD_FBX_URLS) as THREE.Group[];
  const advFbxRoots = useLoader(FBXLoader, FIGHT_MAN_ADV_FBX_URLS) as THREE.Group[];
  const fbxByUrl = useMemo(() => {
    const m = new Map<string, THREE.Group>();
    for (let i = 0; i < FIGHT_MAN_SWORD_FBX_URLS.length; i++) {
      m.set(FIGHT_MAN_SWORD_FBX_URLS[i], swordFbxRoots[i]);
    }
    for (let i = 0; i < FIGHT_MAN_ADV_FBX_URLS.length; i++) {
      m.set(FIGHT_MAN_ADV_FBX_URLS[i], advFbxRoots[i]);
    }
    return m;
  }, [swordFbxRoots, advFbxRoots]);

  const baseRoot = fbxByUrl.get(FIGHT_MAN_SWORD_MODELS.base)!;
  const axePropGltf = useGLTF(AXE_PROP_GLB);
  const modelScene = useMemo(
    () => SkeletonUtils.clone(baseRoot) as THREE.Group,
    [baseRoot],
  );

  const rightHandSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "RightHandSocket";
    return socket;
  }, []);
  const backSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "BackSocket";
    return socket;
  }, []);

  useMemo(() => {
    tuneSkinnedSceneMaterials(modelScene);
  }, [modelScene]);

  const bodyAlbedo = useTexture(FIGHT_MAN_ALBEDO_MAP, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false;
  });

  useLayoutEffect(() => {
    bodyAlbedo.colorSpace = THREE.SRGBColorSpace;
    bodyAlbedo.flipY = false;
    bodyAlbedo.needsUpdate = true;
    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.map = bodyAlbedo;
          mat.needsUpdate = true;
        }
      }
    });
  }, [modelScene, bodyAlbedo]);

  useLayoutEffect(() => {
    headBoneRef.current = findFightManHeadBone(modelScene);
  }, [modelScene]);

  useLayoutEffect(() => {
    const hipsBone = findFightManHipsBone(modelScene);
    hipsBoneRef.current = hipsBone;
    hipsRestPositionRef.current = hipsBone ? hipsBone.position.clone() : null;
  }, [modelScene]);

  const allClips = useMemo(
    () => buildFightManAnimationClips(fbxByUrl, FIGHT_MAN_WORLD_CLIP_POLICIES),
    [fbxByUrl],
  );

  const { actions } = useAnimations(allClips, modelRef);

  type FightManAirPhase = "takeoff" | "fall" | "landing" | null;
  const [fightManAirPhase, setFightManAirPhase] = useState<FightManAirPhase>(null);
  const fightManAirPhaseRef = useRef<FightManAirPhase>(null);
  const prevGroundedRef = useRef(true);
  const actionsRef = useRef(actions);
  const equippedRightHandRef = useRef(equippedRightHand);
  const fightManAirPhaseHeadRef = useRef<FightManAirPhase>(null);

  actionsRef.current = actions;
  equippedRightHandRef.current = equippedRightHand;
  fightManAirPhaseHeadRef.current = fightManAirPhase;

  useFrame(() => {
    const p = poseRef.current;
    const grounded = p.grounded ?? true;
    const wasGrounded = prevGroundedRef.current;
    const actMap = actionsRef.current;
    const prefix = equippedRightHandRef.current ? "sword" : "adv";
    const jumpAct = actMap[`${prefix}_jump`];
    const landAct = actMap[`${prefix}_landing`];

    const syncPhase = (next: FightManAirPhase) => {
      if (fightManAirPhaseRef.current === next) return;
      fightManAirPhaseRef.current = next;
      setFightManAirPhase(next);
    };

    const phase = fightManAirPhaseRef.current;

    if (phase && phase !== "landing" && p.animState !== "jump") {
      syncPhase(null);
    }
    if (
      p.animState === "roll" ||
      p.animState === "spell" ||
      p.animState === "chop" ||
      p.animState === "attack"
    ) {
      if (phase) syncPhase(null);
      prevGroundedRef.current = grounded;
      return;
    }

    if (phase === "landing") {
      if (landAct) {
        const dur = landAct.getClip().duration;
        const nearEnd = landAct.isRunning() && dur > 1e-4 && landAct.time >= dur - 0.04;
        const stoppedAtEnd =
          !landAct.isRunning() && dur > 1e-4 && landAct.time >= dur - 0.06;
        if (nearEnd || stoppedAtEnd || dur < 1e-4) syncPhase(null);
      } else {
        syncPhase(null);
      }
      prevGroundedRef.current = grounded;
      return;
    }

    if (grounded && !wasGrounded && (phase === "takeoff" || phase === "fall")) {
      syncPhase("landing");
      prevGroundedRef.current = grounded;
      return;
    }

    if (!grounded && p.animState === "jump" && wasGrounded && phase == null) {
      syncPhase("takeoff");
      prevGroundedRef.current = grounded;
      return;
    }

    if (phase === "takeoff" && jumpAct) {
      const dur = jumpAct.getClip().duration;
      if (dur < 1e-4) {
        syncPhase("fall");
      } else if (jumpAct.isRunning()) {
        if (jumpAct.time >= dur - 0.04) syncPhase("fall");
      } else if (jumpAct.time >= dur - 0.06) {
        syncPhase("fall");
      }
    }

    prevGroundedRef.current = grounded;
  });

  const hasRightHandSocket = useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "fight_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    hasRightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "fight_man",
    equippedRightHandTransformOverride,
    onEquippedToolObjectChange,
  );

  const hasBackSocket = useAttachBackSocket(
    modelRef,
    backSocket,
    "fight_man",
    onBackSocketStateChange,
  );
  useStowedBackTool(
    backSocket,
    hasBackSocket,
    stowedBackItem,
    axePropGltf.scene,
    "fight_man",
    equippedBackTransformOverride,
    onEquippedToolObjectChange,
  );

  useEffect(() => {
    initDoneRef.current = false;
    prevClipRef.current = "";
    lastIdleIndexRef.current = -1;
    fightManAirPhaseRef.current = null;
    setFightManAirPhase(null);
    prevGroundedRef.current = true;
    const idleAdv = actions["adv_idle0"];
    const idleSword = actions["sword_idle0"];
    const idle = idleAdv ?? idleSword;
    const startName = idleAdv ? "adv_idle0" : "sword_idle0";
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      idle.timeScale = 1;
      prevClipRef.current = startName;
      initDoneRef.current = true;
    }
  }, [actions]);

  useLayoutEffect(() => {
    if (!initDoneRef.current) return;
    const prefix = equippedRightHand ? "sword" : "adv";
    const idleCount = equippedRightHand ? FIGHT_MAN_SWORD_IDLE_COUNT : FIGHT_MAN_ADV_IDLE_COUNT;

    let target: string;
    if (pose.fightManTurnStep === "left") {
      target = `${prefix}_turn90L`;
    } else if (pose.fightManTurnStep === "right") {
      target = `${prefix}_turn90R`;
    } else if (fightManAirPhase === "landing") {
      target = `${prefix}_landing`;
    } else if (fightManAirPhase === "fall") {
      target = `${prefix}_fallIdle`;
    } else if (fightManAirPhase === "takeoff") {
      target = `${prefix}_jump`;
    } else {
      switch (pose.animState) {
        case "walk":
          target = fightManLocomotionActionName(prefix, "walk", pose.locomotionStrafe);
          break;
        case "run":
          target = fightManLocomotionActionName(prefix, "run", pose.locomotionStrafe);
          break;
        case "attack":
          target = `${prefix}_attack`;
          break;
        case "chop":
          target = `${prefix}_skill`;
          break;
        case "jump":
          target = `${prefix}_jump`;
          break;
        case "spell":
          target = `${prefix}_spell`;
          break;
        case "roll":
          target = `${prefix}_roll`;
          break;
        default: {
          if (pose.tpsRmbLook) {
            target = `${prefix}_rmbLook`;
            break;
          }
          const prevIdleClip = prevClipRef.current;
          if (
            prevIdleClip.startsWith(`${prefix}_idle`) &&
            isClipLayerActive(actions[prevIdleClip])
          ) {
            return;
          }
          const pick = pickRandomIdleClipName(prefix, idleCount, lastIdleIndexRef.current);
          lastIdleIndexRef.current = pick.index;
          target = pick.name;
          break;
        }
      }
    }

    const isOneShot =
      pose.fightManTurnStep != null ||
      pose.animState === "attack" ||
      pose.animState === "chop" ||
      fightManAirPhase === "takeoff" ||
      fightManAirPhase === "landing" ||
      (pose.animState === "jump" && fightManAirPhase === null) ||
      pose.animState === "spell" ||
      pose.animState === "roll";

    const chopSwingReplay =
      pose.animState === "chop" &&
      pose.chopSwingId != null &&
      pose.chopSwingId !== lastChopSwingIdRef.current;
    if (chopSwingReplay) {
      lastChopSwingIdRef.current = pose.chopSwingId;
    }
    if (!isOneShot) {
      if (
        target === prevClipRef.current &&
        !chopSwingReplay &&
        isClipLayerActive(actions[target])
      ) {
        return;
      }
    } else if (pose.animState === "chop") {
      if (
        target === prevClipRef.current &&
        !chopSwingReplay &&
        isClipLayerActive(actions[target])
      ) {
        return;
      }
    } else if (pose.fightManTurnStep) {
      if (target === prevClipRef.current && isClipLayerActive(actions[target])) {
        return;
      }
    } else if (fightManAirPhase === "takeoff" || fightManAirPhase === "landing") {
      if (target === prevClipRef.current && isClipLayerActive(actions[target])) {
        return;
      }
    }

    const nextAction = actions[target];
    const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
    if (!nextAction) return;
    const clipDuration = nextAction.getClip().duration;

    nextAction.reset();
    if (isOneShot) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      let desiredDuration = clipDuration;
      if (fightManAirPhase === "takeoff" || fightManAirPhase === "landing") {
        desiredDuration = clipDuration;
      } else if (pose.animState === "jump") {
        /** Airborne: natural takeoff clip; grounded edge case keeps legacy scale. */
        desiredDuration = !(pose.grounded ?? true)
          ? clipDuration
          : pose.jumpDuration ?? JUMP_DURATION_DEFAULT;
      } else if (pose.animState === "roll") {
        desiredDuration = pose.rollDuration ?? clipDuration;
      } else if (pose.animState === "chop") {
        desiredDuration = pose.chopDuration ?? AXE_CHOP_PLAYBACK_SEC;
      } else if (pose.animState === "spell") {
        desiredDuration = SPELL_DURATION_DEFAULT;
      } else if (pose.animState === "attack") {
        desiredDuration = clipDuration;
      } else if (pose.fightManTurnStep) {
        desiredDuration = clipDuration;
      }
      if (clipDuration > 1e-4 && desiredDuration > 1e-4) {
        nextAction.timeScale = clipDuration / desiredDuration;
      } else {
        nextAction.timeScale = 1;
      }
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1;
      nextAction.clampWhenFinished = false;
    }

    const prevName = prevClipRef.current;
    const leavingJump =
      isPrevClipJump(prevName) &&
      pose.animState !== "jump" &&
      fightManAirPhase == null &&
      pose.fightManTurnStep == null;
    transitionAnimationAction(nextAction, prevAction, prevName, leavingJump);
    prevClipRef.current = target;
  }, [
    pose.animState,
    pose.grounded,
    pose.locomotionStrafe,
    pose.fightManTurnStep,
    fightManAirPhase,
    actions,
    equippedRightHand,
    pose.jumpDuration,
    pose.rollDuration,
    pose.chopDuration,
    pose.chopSwingId,
    pose.tpsRmbLook,
  ]);

  useFrame((_, delta) => {
    const bone = headBoneRef.current;
    if (!bone) return;
    const p = poseRef.current;
    const rmbLook = Boolean(p.tpsRmbLook);
    if (
      (p.fightManTurnStep && !rmbLook) ||
      p.animState === "jump" ||
      fightManAirPhaseHeadRef.current != null ||
      p.animState === "roll" ||
      p.animState === "spell" ||
      p.animState === "chop" ||
      p.animState === "attack"
    ) {
      headLookSmoothedYRef.current = 0;
      return;
    }
    const cam = tpsCameraStateRef?.current;
    const bodyYaw = p.facingAngle;
    if (!rmbLook || !cam?.active || cam.viewYaw == null || bodyYaw == null) {
      headLookSmoothedYRef.current = 0;
      return;
    }
    const deltaYaw = wrapFightManAngle(cam.viewYaw - bodyYaw);
    const targetY = THREE.MathUtils.clamp(
      deltaYaw,
      -FIGHT_MAN_HEAD_YAW_MAX_RAD,
      FIGHT_MAN_HEAD_YAW_MAX_RAD,
    );
    const dt = Math.min(0.05, delta);
    const t = 1 - Math.exp(-FIGHT_MAN_HEAD_LOOK_SMOOTH_SPEED * dt);
    headLookSmoothedYRef.current = THREE.MathUtils.lerp(headLookSmoothedYRef.current, targetY, t);
    const euler = headLookEulerRef.current;
    euler.setFromQuaternion(bone.quaternion, "YXZ");
    euler.y = headLookSmoothedYRef.current;
    bone.quaternion.setFromEuler(euler);
  }, 100);

  useFrame(() => {
    const hipsBone = hipsBoneRef.current;
    const restPosition = hipsRestPositionRef.current;
    if (!hipsBone || !restPosition) return;
    hipsBone.position.x = restPosition.x;
    hipsBone.position.z = restPosition.z;
  }, 100);

  useCharacterFrame(outerRef, modelRef, poseRef, mouseGroundRef, FIGHT_GROUND_OFFSET_Y);

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={fightManMeshScale}>
          <primitive object={modelScene} />
        </group>
      </group>
    </group>
  );
}

function MiningPlayableModel({
  pose,
  mouseGroundRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  stowedBackItem = null,
  equippedBackTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
  onBackSocketStateChange,
}: BaseProps) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const prevClipRef = useRef("");
  const lastChopSwingIdRef = useRef<number | undefined>(undefined);
  const initDoneRef = useRef(false);
  const idleToggleRef = useRef(false);

  const baseGltf = useGLTF(MINING_MAN_MODELS.base);
  const walkGltf = useGLTF(MINING_MAN_MODELS.walk);
  const attackGltf = useGLTF(MINING_MAN_MODELS.attack);
  const talkGltf = useGLTF(MINING_MAN_MODELS.talk);
  const axePropGltf = useGLTF(AXE_PROP_GLB);

  const modelScene = useMemo(
    () => SkeletonUtils.clone(baseGltf.scene) as THREE.Group,
    [baseGltf.scene],
  );
  const rightHandSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "RightHandSocket";
    return socket;
  }, []);
  const backSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "BackSocket";
    return socket;
  }, []);

  useMemo(() => {
    tuneSkinnedSceneMaterials(modelScene);
  }, [modelScene]);

  const allClips = useMemo(() => {
    const clips: THREE.AnimationClip[] = [];
    const add = (anims: THREE.AnimationClip[], name: string) => {
      if (anims.length > 0) {
        const c = anims[0].clone();
        c.name = name;
        clips.push(c);
      }
    };
    add(walkGltf.animations, "idle");
    add(walkGltf.animations, "idle2");
    add(walkGltf.animations, "walk");
    add(walkGltf.animations, "run");
    add(attackGltf.animations, "skill");
    add(attackGltf.animations, "alert");
    add(attackGltf.animations, "jump");
    add(attackGltf.animations, "spell");
    add(attackGltf.animations, "roll");
    add(talkGltf.animations, "talk");
    return clips;
  }, [walkGltf.animations, attackGltf.animations, talkGltf.animations]);

  const { actions } = useAnimations(allClips, modelRef);

  const hasRightHandSocket = useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "mining_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    hasRightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "mining_man",
    equippedRightHandTransformOverride,
    onEquippedToolObjectChange,
  );

  const hasBackSocket = useAttachBackSocket(
    modelRef,
    backSocket,
    "mining_man",
    onBackSocketStateChange,
  );
  useStowedBackTool(
    backSocket,
    hasBackSocket,
    stowedBackItem,
    axePropGltf.scene,
    "mining_man",
    equippedBackTransformOverride,
    onEquippedToolObjectChange,
  );

  useEffect(() => {
    if (initDoneRef.current) return;
    const idle = actions["idle"];
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      idle.timeScale = 0.18;
      prevClipRef.current = "idle";
      initDoneRef.current = true;
    }
  }, [actions]);

  useLayoutEffect(() => {
    if (!initDoneRef.current) return;
    let target: string;
    switch (pose.animState) {
      case "walk":
        target = "walk";
        break;
      case "run":
        target = "run";
        break;
      case "attack":
        target = "alert";
        break;
      case "chop":
        target = "skill";
        break;
      case "jump":
        target = "jump";
        break;
      case "spell":
        target = "spell";
        break;
      case "roll":
        target = "roll";
        break;
      default: {
        const prev = prevClipRef.current;
        if (
          (prev === "idle" || prev === "idle2") &&
          isClipLayerActive(actions[prev])
        ) {
          return;
        }
        idleToggleRef.current = !idleToggleRef.current;
        target = idleToggleRef.current ? "idle2" : "idle";
        break;
      }
    }

    const chopSwingReplay =
      pose.animState === "chop" &&
      pose.chopSwingId != null &&
      pose.chopSwingId !== lastChopSwingIdRef.current;
    if (chopSwingReplay) {
      lastChopSwingIdRef.current = pose.chopSwingId;
    }
    if (
      target === prevClipRef.current &&
      !chopSwingReplay &&
      isClipLayerActive(actions[target])
    ) {
      return;
    }

    const nextAction = actions[target];
    const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
    if (!nextAction) return;
    const clipDuration = nextAction.getClip().duration;

    nextAction.reset();
    if (target === "idle" || target === "idle2") {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = target === "idle2" ? 0.22 : 0.18;
    } else if (target === "run") {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1.65;
    } else if (target === "walk") {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1;
    } else if (
      pose.animState === "attack" ||
      pose.animState === "chop" ||
      pose.animState === "jump" ||
      pose.animState === "spell" ||
      pose.animState === "roll"
    ) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      let desiredDuration = clipDuration;
      if (pose.animState === "jump") {
        desiredDuration = pose.jumpDuration ?? JUMP_DURATION_DEFAULT;
      } else if (pose.animState === "roll") {
        desiredDuration = pose.rollDuration ?? clipDuration;
      } else if (pose.animState === "chop") {
        desiredDuration = pose.chopDuration ?? AXE_CHOP_PLAYBACK_SEC;
      } else if (pose.animState === "spell") {
        desiredDuration = SPELL_DURATION_DEFAULT;
      }
      if (clipDuration > 1e-4 && desiredDuration > 1e-4) {
        nextAction.timeScale = clipDuration / desiredDuration;
      } else {
        nextAction.timeScale = 1;
      }
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1;
      nextAction.clampWhenFinished = false;
    }

    const prevName = prevClipRef.current;
    const leavingJump = isPrevClipJump(prevName) && pose.animState !== "jump";
    transitionAnimationAction(nextAction, prevAction, prevName, leavingJump);
    prevClipRef.current = target;
  }, [pose.animState, actions, pose.jumpDuration, pose.rollDuration, pose.chopDuration, pose.chopSwingId]);

  useCharacterFrame(outerRef, modelRef, poseRef, mouseGroundRef, MINING_GROUND_OFFSET_Y);

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive object={modelScene} />
        </group>
      </group>
    </group>
  );
}

function MagicPlayableModel({
  pose,
  mouseGroundRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  stowedBackItem = null,
  equippedBackTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
  onBackSocketStateChange,
}: BaseProps) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const prevClipRef = useRef("");
  const lastChopSwingIdRef = useRef<number | undefined>(undefined);
  const initDoneRef = useRef(false);
  const idleToggleRef = useRef(false);

  const baseGltf = useGLTF(MAGIC_MAN_MODELS.base);
  const walkGltf = useGLTF(MAGIC_MAN_MODELS.walk);
  const idleGltf = useGLTF(MAGIC_MAN_MODELS.idle);
  const zauberGltf = useGLTF(MAGIC_MAN_MODELS.zauber);
  const axePropGltf = useGLTF(AXE_PROP_GLB);

  const modelScene = useMemo(
    () => SkeletonUtils.clone(baseGltf.scene) as THREE.Group,
    [baseGltf.scene],
  );
  const rightHandSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "RightHandSocket";
    return socket;
  }, []);
  const backSocket = useMemo(() => {
    const socket = new THREE.Group();
    socket.name = "BackSocket";
    return socket;
  }, []);

  useMemo(() => {
    tuneSkinnedSceneMaterials(modelScene);
  }, [modelScene]);

  const allClips = useMemo(() => {
    const clips: THREE.AnimationClip[] = [];
    const add = (anims: THREE.AnimationClip[], name: string) => {
      if (anims.length > 0) {
        const c = anims[0].clone();
        c.name = name;
        clips.push(c);
      }
    };
    add(idleGltf.animations, "idle");
    add(idleGltf.animations, "idle2");
    add(walkGltf.animations, "walk");
    add(walkGltf.animations, "run");
    add(zauberGltf.animations, "spell");
    add(zauberGltf.animations, "skill");
    add(idleGltf.animations, "jump");
    add(idleGltf.animations, "alert");
    add(idleGltf.animations, "roll");
    return clips;
  }, [idleGltf.animations, walkGltf.animations, zauberGltf.animations]);

  const { actions } = useAnimations(allClips, modelRef);

  const hasRightHandSocket = useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "magic_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    hasRightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "magic_man",
    equippedRightHandTransformOverride,
    onEquippedToolObjectChange,
  );

  const hasBackSocket = useAttachBackSocket(
    modelRef,
    backSocket,
    "magic_man",
    onBackSocketStateChange,
  );
  useStowedBackTool(
    backSocket,
    hasBackSocket,
    stowedBackItem,
    axePropGltf.scene,
    "magic_man",
    equippedBackTransformOverride,
    onEquippedToolObjectChange,
  );

  useEffect(() => {
    if (initDoneRef.current) return;
    const idle = actions["idle"];
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      prevClipRef.current = "idle";
      initDoneRef.current = true;
    }
  }, [actions]);

  useLayoutEffect(() => {
    if (!initDoneRef.current) return;
    let target: string;
    switch (pose.animState) {
      case "walk":
        target = "walk";
        break;
      case "run":
        target = "run";
        break;
      case "attack":
        target = "alert";
        break;
      case "chop":
        target = "skill";
        break;
      case "jump":
        target = "jump";
        break;
      case "spell":
        target = "spell";
        break;
      case "roll":
        target = "roll";
        break;
      default: {
        const prev = prevClipRef.current;
        if (
          (prev === "idle" || prev === "idle2") &&
          isClipLayerActive(actions[prev])
        ) {
          return;
        }
        idleToggleRef.current = !idleToggleRef.current;
        target = idleToggleRef.current ? "idle2" : "idle";
        break;
      }
    }

    const chopSwingReplay =
      pose.animState === "chop" &&
      pose.chopSwingId != null &&
      pose.chopSwingId !== lastChopSwingIdRef.current;
    if (chopSwingReplay) {
      lastChopSwingIdRef.current = pose.chopSwingId;
    }
    if (
      target === prevClipRef.current &&
      !chopSwingReplay &&
      isClipLayerActive(actions[target])
    ) {
      return;
    }

    const nextAction = actions[target];
    const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
    if (!nextAction) return;
    const clipDuration = nextAction.getClip().duration;

    nextAction.reset();
    if (target === "run") {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1.55;
    } else if (
      pose.animState === "attack" ||
      pose.animState === "chop" ||
      pose.animState === "jump" ||
      pose.animState === "spell" ||
      pose.animState === "roll"
    ) {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
      let desiredDuration = clipDuration;
      if (pose.animState === "jump") {
        desiredDuration = pose.jumpDuration ?? JUMP_DURATION_DEFAULT;
      } else if (pose.animState === "roll") {
        desiredDuration = pose.rollDuration ?? clipDuration;
      } else if (pose.animState === "chop") {
        desiredDuration = pose.chopDuration ?? AXE_CHOP_PLAYBACK_SEC;
      } else if (pose.animState === "spell") {
        desiredDuration = SPELL_DURATION_DEFAULT;
      }
      if (clipDuration > 1e-4 && desiredDuration > 1e-4) {
        nextAction.timeScale = clipDuration / desiredDuration;
      } else {
        nextAction.timeScale = 1;
      }
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.timeScale = 1;
      nextAction.clampWhenFinished = false;
    }

    const prevName = prevClipRef.current;
    const leavingJump = isPrevClipJump(prevName) && pose.animState !== "jump";
    transitionAnimationAction(nextAction, prevAction, prevName, leavingJump);
    prevClipRef.current = target;
  }, [pose.animState, actions, pose.jumpDuration, pose.rollDuration, pose.chopDuration, pose.chopSwingId]);

  useCharacterFrame(outerRef, modelRef, poseRef, mouseGroundRef, MAGIC_GROUND_OFFSET_Y);

  return (
    <group ref={outerRef}>
      <group ref={modelRef}>
        <group scale={CHAR_SCALE}>
          <primitive object={modelScene} />
        </group>
      </group>
    </group>
  );
}

export type CharacterModelProps = BaseProps & {
  playableVariant?: PlayableCharacterId;
};

export function CharacterModel({
  playableVariant = "default",
  ...rest
}: CharacterModelProps) {
  switch (playableVariant) {
    case "fight_man":
      return rest.renderContext === "preview" ? (
        <FightManPreviewModel {...rest} />
      ) : (
        <FightManPlayableModel {...rest} />
      );
    case "mining_man":
      return <MiningPlayableModel {...rest} />;
    case "magic_man":
      return <MagicPlayableModel {...rest} />;
    default:
      return <DefaultCharacterModel {...rest} />;
  }
}
