import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect, useMemo, type MutableRefObject } from "react";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { TILE_UNIT_SIZE, CHAR_3D_MODELS } from "./assets3d";
import type { CharacterPose3D } from "./useCharacterMovement";
import { EQUIPPABLE_ITEMS, type EquippableItemId, type ItemSocketTransform } from "../equipment";

Object.values(CHAR_3D_MODELS).forEach((p) => useGLTF.preload(p));

const CROSSFADE_DURATION = 0.25;
const BASE_ROT_Y = -Math.PI / 4;

const CHAR_SCALE = 0.294;
const TILE_SURFACE_Y = 0.82;
const JUMP_ARC_HEIGHT = 0.55;
const JUMP_DURATION_DEFAULT = 0.38;

type Props = {
  pose: CharacterPose3D;
  mouseGroundRef?: MutableRefObject<THREE.Vector3 | null>;
  equippedRightHand?: EquippableItemId | null;
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

export function CharacterModel({ pose, mouseGroundRef, equippedRightHand = null }: Props) {
  const outerRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const prevClipRef = useRef("");
  const initDoneRef = useRef(false);
  const toolObjectRef = useRef<THREE.Object3D | null>(null);

  const jumpArcTimer = useRef(0);
  const wasJumping = useRef(false);

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
    modelScene.traverse((child) => {
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
    add(idle2Gltf.animations, "idle2");
    add(walkGltf.animations, "walk");
    add(runGltf.animations, "run");
    add(skillGltf.animations, "skill");
    add(alertGltf.animations, "alert");
    add(jumpGltf.animations, "jump");
    add(spellGltf.animations, "spell");
    add(rollGltf.animations, "roll");
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
  ]);

  const { actions } = useAnimations(allClips, modelRef);

  useEffect(() => {
    const modelRoot = modelRef.current;
    if (!modelRoot) return;
    const rightHand = modelRoot.getObjectByName("RightHand");
    if (!rightHand) return;
    rightHand.add(rightHandSocket);
    return () => {
      rightHand.remove(rightHandSocket);
    };
  }, [modelScene, rightHandSocket]);

  useEffect(() => {
    const previousTool = toolObjectRef.current;
    if (previousTool) {
      rightHandSocket.remove(previousTool);
      disposeObject3D(previousTool);
      toolObjectRef.current = null;
    }

    if (!equippedRightHand) return;

    const itemDef = EQUIPPABLE_ITEMS[equippedRightHand];
    if (!itemDef) return;

    const toolObject = createToolObject(equippedRightHand);
    applySocketTransform(toolObject, itemDef.rightHand);
    rightHandSocket.add(toolObject);
    toolObjectRef.current = toolObject;

    return () => {
      rightHandSocket.remove(toolObject);
      disposeObject3D(toolObject);
      if (toolObjectRef.current === toolObject) {
        toolObjectRef.current = null;
      }
    };
  }, [equippedRightHand, rightHandSocket]);

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

    if (target === prevClipRef.current) return;

    const nextAction = actions[target];
    const prevAction = prevClipRef.current ? actions[prevClipRef.current] : null;
    if (!nextAction) return;

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
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (prevAction && prevAction.isRunning()) {
      nextAction.crossFadeFrom(prevAction, CROSSFADE_DURATION, true);
    }
    nextAction.play();
    prevClipRef.current = target;
  }, [pose.animState, actions]);

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

    let arcY = 0;
    if (isJumping) {
      jumpArcTimer.current += delta;
      const dur = p.jumpDuration ?? JUMP_DURATION_DEFAULT;
      const t = Math.min(1, jumpArcTimer.current / dur);
      arcY = JUMP_ARC_HEIGHT * 4 * t * (1 - t);
    }
    pos.y = TILE_SURFACE_Y + arcY;

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
