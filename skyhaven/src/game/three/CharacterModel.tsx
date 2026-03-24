import { useGLTF, useAnimations, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
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
  FIGHT_MAN_MODELS,
  AXE_PROP_GLB,
  MAIN_CHAR_AXE_CHOP_ANIM_GLB,
  AXE_CHOP_PLAYBACK_SEC,
} from "./assets3d";
import { DEFAULT_WALK_SURFACE_OFFSET_Y } from "./islandSurface";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";
import { scalePbrRoughness } from "./islandGltfMeshDefaults";
import { tuneRigPbrForIslandLighting } from "./tuneRigPbr";
import { getPlayableAvatarGroundProfile } from "./avatarGrounding";
import type { CharacterPose3D } from "./useCharacterMovement";
import {
  getEquippableItemRightHandTransform,
  type EquippableItemId,
  type ItemSocketTransform,
} from "../equipment";
import type { PlayableCharacterId } from "../playableCharacters";

Object.values(CHAR_3D_MODELS).forEach((p) => useGLTF.preload(p));
useGLTF.preload(AXE_PROP_GLB);
useGLTF.preload(MAIN_CHAR_AXE_CHOP_ANIM_GLB);

const CROSSFADE_DURATION = 0.14;
const BASE_ROT_Y = -Math.PI / 4;

const CHAR_SCALE = 0.294;
const JUMP_ARC_HEIGHT = 0.5;
const JUMP_DURATION_DEFAULT = 0.38;
const SPELL_DURATION_DEFAULT = 1.05;
const DEFAULT_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("default").visualGroundOffsetY;
const MINING_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("mining_man").visualGroundOffsetY;
const MAGIC_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("magic_man").visualGroundOffsetY;
const FIGHT_GROUND_OFFSET_Y = getPlayableAvatarGroundProfile("fight_man").visualGroundOffsetY;
const warnedMissingRightHandSocketVariants = new Set<PlayableCharacterId>();

export type RightHandSocketState = {
  found: boolean;
  variant: PlayableCharacterId;
  nodeName: string | null;
};

type BaseProps = {
  pose: CharacterPose3D;
  mouseGroundRef?: MutableRefObject<THREE.Vector3 | null>;
  equippedRightHand?: EquippableItemId | null;
  equippedRightHandTransformOverride?: ItemSocketTransform | null;
  onEquippedToolObjectChange?: (toolObject: THREE.Object3D | null) => void;
  onRightHandSocketStateChange?: (state: RightHandSocketState) => void;
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

function useAttachRightHandSocket(
  modelRef: RefObject<THREE.Group | null>,
  rightHandSocket: THREE.Group,
  playableVariant: PlayableCharacterId,
  onRightHandSocketStateChange?: (state: RightHandSocketState) => void,
): void {
  useEffect(() => {
    const modelRoot = modelRef.current;
    if (!modelRoot) return;

    const rightHand = modelRoot.getObjectByName("RightHand");
    if (!rightHand) {
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
    rightHand.add(rightHandSocket);

    return () => {
      rightHand.remove(rightHandSocket);
      onRightHandSocketStateChange?.({
        found: false,
        variant: playableVariant,
        nodeName: rightHand.name,
      });
    };
  }, [modelRef, onRightHandSocketStateChange, playableVariant, rightHandSocket]);
}

function useEquippedRightHandTool(
  rightHandSocket: THREE.Group,
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

    if (!equippedRightHand) {
      onEquippedToolObjectChange?.(null);
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
  }, [equippedRightHand, rightHandSocket, axeTemplate, onEquippedToolObjectChange]);

  useLayoutEffect(() => {
    if (!equippedRightHand || !toolObjectRef.current) return;
    const transform =
      equippedRightHandTransformOverride ??
      getEquippableItemRightHandTransform(equippedRightHand, playableVariant);
    if (!transform) return;
    applySocketTransform(toolObjectRef.current, transform);
  }, [
    equippedRightHand,
    equippedRightHandTransformOverride,
    playableVariant,
  ]);
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
    const tx = p.gx * TILE_UNIT_SIZE;
    const tz = p.gy * TILE_UNIT_SIZE;
    const pos = outerRef.current.position;

    const sm = 1 - Math.exp(-12 * delta);
    const isJumping = p.animState === "jump";
    const isRolling = p.animState === "roll";
    if (isJumping && !wasJumping.current) {
      jumpArcTimer.current = 0;
    }
    wasJumping.current = isJumping;
    if (isJumping || isRolling) {
      pos.x = tx;
      pos.z = tz;
    } else {
      pos.x += (tx - pos.x) * sm;
      pos.z += (tz - pos.z) * sm;
    }

    let targetY: number;
    if (p.worldY != null) {
      targetY = p.worldY + groundOffsetY;
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
      targetY = (p.surfaceY ?? DEFAULT_WALK_SURFACE_OFFSET_Y) + arcY + groundOffsetY;
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
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
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

  useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "default",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "default",
    equippedRightHandTransformOverride,
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

  useEffect(() => {
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
        const wasIdle = prev === "idle" || prev === "idle2";
        if (wasIdle) return;
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
    if (target === prevClipRef.current && !chopSwingReplay) return;

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
    }

    if (prevAction && prevAction.isRunning()) {
      nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
    }
    nextAction.play();
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

/** Merged Fight Man GLB lists clips by name (order is not stable); never map by array index. */
function cloneFightManMergedClip(
  animations: THREE.AnimationClip[],
  gltfName: string,
  outName: string,
  stripRootTranslation = false,
): THREE.AnimationClip | null {
  const src = animations.find((c) => c.name === gltfName);
  if (!src) return null;
  const c = src.clone();
  c.name = outName;
  if (stripRootTranslation) {
    const ROOT_TRANSLATION_TRACK = /(^|\.)(armature|root|hips|mixamorighips)\.position$/i;
    c.tracks = c.tracks.filter((track) => !ROOT_TRANSLATION_TRACK.test(track.name));
  }
  return c;
}

function FightManPlayableModel({
  pose,
  mouseGroundRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
}: BaseProps) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const prevClipRef = useRef("");
  const lastChopSwingIdRef = useRef<number | undefined>(undefined);
  const initDoneRef = useRef(false);
  const idleToggleRef = useRef(false);

  const baseGltf = useGLTF(FIGHT_MAN_MODELS.base);
  const animsGltf = useGLTF(FIGHT_MAN_MODELS.anims);
  const sprintGltf = useGLTF(FIGHT_MAN_MODELS.sprint);
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

  useMemo(() => {
    tuneSkinnedSceneMaterials(modelScene);
  }, [modelScene]);

  const allClips = useMemo(() => {
    const merged = animsGltf.animations;
    const clips: THREE.AnimationClip[] = [];
    const push = (out: string, gltf: string, strip = false) => {
      const c = cloneFightManMergedClip(merged, gltf, out, strip);
      if (c) clips.push(c);
    };
    push("walk", "Walking");
    const sprintPick =
      sprintGltf.animations.find((c) => /sprint|run/i.test(c.name)) ?? sprintGltf.animations[0];
    if (sprintPick) {
      const runClip = sprintPick.clone();
      runClip.name = "run";
      clips.push(runClip);
    } else {
      push("run", "Running");
    }
    push("idle", "Walking");
    push("idle2", "Checkout_Gesture");
    if (!clips.some((x) => x.name === "idle2")) {
      const fallback = cloneFightManMergedClip(merged, "Walking", "idle2", false);
      if (fallback) clips.push(fallback);
    }
    push("attack", "Counterstrike");
    push("skill", "Charged_Upward_Slash");
    push("jump", "Running");
    push("spell", "Charged_Upward_Slash");
    push("roll", "Running", true);
    return clips;
  }, [animsGltf.animations, sprintGltf.animations]);

  const { actions } = useAnimations(allClips, modelRef);

  useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "fight_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "fight_man",
    equippedRightHandTransformOverride,
    onEquippedToolObjectChange,
  );

  useEffect(() => {
    if (initDoneRef.current) return;
    const idle = actions["idle"];
    if (idle) {
      idle.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      idle.timeScale = 0.22;
      prevClipRef.current = "idle";
      initDoneRef.current = true;
    }
  }, [actions]);

  useEffect(() => {
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
        target = "attack";
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
        const wasIdle = prev === "idle" || prev === "idle2";
        if (wasIdle) return;
        idleToggleRef.current = !idleToggleRef.current;
        target = idleToggleRef.current ? "idle2" : "idle";
        break;
      }
    }

    const isOneShot =
      pose.animState === "attack" ||
      pose.animState === "chop" ||
      pose.animState === "jump" ||
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
      if (target === prevClipRef.current && !chopSwingReplay) return;
    } else if (pose.animState === "chop") {
      if (target === prevClipRef.current && !chopSwingReplay) return;
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
      if (pose.animState === "jump") {
        desiredDuration = pose.jumpDuration ?? JUMP_DURATION_DEFAULT;
      } else if (pose.animState === "roll") {
        desiredDuration = pose.rollDuration ?? clipDuration;
      } else if (pose.animState === "chop") {
        desiredDuration = pose.chopDuration ?? AXE_CHOP_PLAYBACK_SEC;
      } else if (pose.animState === "spell") {
        desiredDuration = SPELL_DURATION_DEFAULT;
      } else if (pose.animState === "attack") {
        desiredDuration = clipDuration;
      }
      if (clipDuration > 1e-4 && desiredDuration > 1e-4) {
        nextAction.timeScale = clipDuration / desiredDuration;
      } else {
        nextAction.timeScale = 1;
      }
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      if (target === "run") {
        nextAction.timeScale = 1.55;
      } else if (target === "idle") {
        nextAction.timeScale = 0.22;
      } else if (target === "idle2") {
        nextAction.timeScale = 1;
      } else {
        nextAction.timeScale = 1;
      }
    }

    if (prevAction && prevAction.isRunning()) {
      nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
    }
    nextAction.play();
    prevClipRef.current = target;
  }, [pose.animState, actions, pose.jumpDuration, pose.rollDuration, pose.chopDuration, pose.chopSwingId]);

  useCharacterFrame(outerRef, modelRef, poseRef, mouseGroundRef, FIGHT_GROUND_OFFSET_Y);

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

function MiningPlayableModel({
  pose,
  mouseGroundRef,
  equippedRightHand = null,
  equippedRightHandTransformOverride = null,
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
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

  useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "mining_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "mining_man",
    equippedRightHandTransformOverride,
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

  useEffect(() => {
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
        const wasIdle = prev === "idle" || prev === "idle2";
        if (wasIdle) return;
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
    if (target === prevClipRef.current && !chopSwingReplay) return;

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
    }

    if (prevAction && prevAction.isRunning()) {
      nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
    }
    nextAction.play();
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
  onEquippedToolObjectChange,
  onRightHandSocketStateChange,
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

  useAttachRightHandSocket(
    modelRef,
    rightHandSocket,
    "magic_man",
    onRightHandSocketStateChange,
  );

  useEquippedRightHandTool(
    rightHandSocket,
    equippedRightHand,
    axePropGltf.scene,
    "magic_man",
    equippedRightHandTransformOverride,
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

  useEffect(() => {
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
        const wasIdle = prev === "idle" || prev === "idle2";
        if (wasIdle) return;
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
    if (target === prevClipRef.current && !chopSwingReplay) return;

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
    }

    if (prevAction && prevAction.isRunning()) {
      nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
    }
    nextAction.play();
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
      return <FightManPlayableModel {...rest} />;
    case "mining_man":
      return <MiningPlayableModel {...rest} />;
    case "magic_man":
      return <MagicPlayableModel {...rest} />;
    default:
      return <DefaultCharacterModel {...rest} />;
  }
}
