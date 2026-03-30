import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import type { OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { TILE_UNIT_SIZE } from "./assets3d";
import { DEFAULT_WALK_SURFACE_OFFSET_Y } from "./islandSurface";
import type { CharacterPose3D, TpsCameraState } from "./useCharacterMovement";
import type { CameraOccluderEntry } from "./cameraOcclusion";
import type { TargetableSnapshot } from "./targetLock";

const ISO_ANGLE_X = Math.atan(1 / Math.SQRT2);
const ISO_ANGLE_Y = Math.PI / 4;
const CAMERA_DISTANCE = 20;
const DEFAULT_ZOOM = 80;
const MIN_ZOOM = 30;
const MAX_ZOOM = 250;
/** Ortho depth range (cannot disable clipping; widen so large / panned home islands stay in frustum). */
const ISO_ORTHO_NEAR = 0.001;
const ISO_ORTHO_FAR = 25_000;
const FOLLOW_ZOOM_THRESHOLD = 140;
const FOLLOW_STIFFNESS = 6;
const TPS_TARGET_FOLLOW_STIFFNESS = 4.3;
const FOLLOW_DEAD_ZONE = 0.02;

const TPS_FOV = 55;
const TPS_ENTER_ZOOM = 170;
const TPS_EXIT_TO_ISO_ZOOM = 164;
/** Closer = stronger zoom-in (world units from look target). */
const TPS_MIN_DISTANCE = 1.38;
const TPS_MAX_DISTANCE = 6.5;
const TPS_EXIT_DISTANCE = 7.25;
const TPS_TARGET_OFFSET_Y = 0.33;
const DEFAULT_TPS_TARGET_Y = DEFAULT_WALK_SURFACE_OFFSET_Y + TPS_TARGET_OFFSET_Y;
/** Lower = flatter orbit behind character (camera closer to “ground line”). */
const TPS_PITCH_MIN = 0.05;
const TPS_PITCH_MAX = 1.2;
const TPS_LOOK_SENSITIVITY = 0.0024;
const TPS_WHEEL_SPEED = 0.012;
/** Must not collide with postprocessing `OutlineEffect` selection layers (starts at 2). */
const CAMERA_OCCLUSION_LAYER = 11;
/** Ray must get this close to the look target before we treat LOS as clear (character radius). */
const CHAR_LOS_CLEAR_MARGIN = 0.22;
const CHAR_LOS_SMOOTH_SPEED = 14;
const CHAR_LOS_HEAD_OFFSET = 0.42;
const CHAR_LOS_LOWER_TORSO_OFFSET = -0.34;
const CHAR_LOS_SHOULDER_OFFSET = 0.24;

const TPS_ENTER_TRANSITION_DURATION = 0.35;
const TPS_EXIT_TRANSITION_DURATION = 0.45;
const TPS_EXIT_WHEEL_TO_ISO_ZOOM = 0.12;

/** OrbitControls ortho zoom uses fixed multiplicative steps per notch; we drive a target + lerp for smooth scroll / trackpad. */
const ISO_ZOOM_LERP_SPEED = 14;
/** deltaY is often ~100 per mouse notch; scale so one notch moves target zoom noticeably but camera eases in. */
const ISO_ZOOM_WHEEL_SCALE = 0.085;
const TPS_DISTANCE_LERP_SPEED = 16;
const TPS_TARGET_LOCK_FOLLOW_STIFFNESS = 11;
const TPS_TARGET_LOCK_YAW_STIFFNESS = 14;
const TPS_TARGET_LOCK_DISTANCE_BASE = 2.6;
const TPS_TARGET_LOCK_DISTANCE_FACTOR = 0.72;
const TPS_TARGET_LOCK_PITCH_BASE = 0.34;
const TPS_TARGET_LOCK_PITCH_DISTANCE_FACTOR = 0.04;

type CameraMode = "iso" | "tps" | "tps_exit";

type IsoResumeState = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  offset: THREE.Vector3;
};

type TpsExitTransition = {
  fromPos: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  toPos: THREE.Vector3;
  toQuat: THREE.Quaternion;
  fromZoom: number;
  toZoom: number;
  t: number;
};

type IslandCameraProps = {
  characterPose?: CharacterPose3D | null;
  followCharacter?: boolean;
  orbitEnabled?: boolean;
  tpsEnabled?: boolean;
  forceIsoToken?: number;
  tpsCameraStateRef?: MutableRefObject<TpsCameraState>;
  lockedTargetRef?: MutableRefObject<TargetableSnapshot | null>;
  cameraOccludersRef?: MutableRefObject<CameraOccluderEntry[]>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function buildIsoOffset(out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    CAMERA_DISTANCE * Math.sin(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X),
    CAMERA_DISTANCE * Math.sin(ISO_ANGLE_X),
    CAMERA_DISTANCE * Math.cos(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X),
  );
}

/** Initial iso camera position (matches former JSX props). Do not pass as R3F props — re-renders would stomp TPS→iso restore. */
const ISO_INITIAL_POSITION = new THREE.Vector3(
  CAMERA_DISTANCE * Math.sin(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X),
  CAMERA_DISTANCE * Math.sin(ISO_ANGLE_X),
  CAMERA_DISTANCE * Math.cos(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X),
);

export function IslandCamera({
  characterPose,
  followCharacter = false,
  orbitEnabled = true,
  tpsEnabled = false,
  forceIsoToken = 0,
  tpsCameraStateRef,
  lockedTargetRef,
  cameraOccludersRef,
}: IslandCameraProps) {
  const { gl } = useThree();
  const orthoCameraRef = useRef<ThreeOrthographicCamera>(null);
  const perspectiveCameraRef = useRef<ThreePerspectiveCamera>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [mode, setMode] = useState<CameraMode>("iso");
  const targetRef = useRef(new THREE.Vector3(1.5, DEFAULT_TPS_TARGET_Y, 1.5));
  const viewYawRef = useRef(wrapAngle(ISO_ANGLE_Y + Math.PI));
  const pitchRef = useRef(ISO_ANGLE_X);
  const distanceRef = useRef(TPS_MAX_DISTANCE);
  const charLosSmoothRef = useRef(0);
  const pointerLockActiveRef = useRef(false);
  const targetLockActiveRef = useRef(false);
  const prevTargetLockActiveRef = useRef(false);
  const steeringActiveRef = useRef(false);
  const mouseForwardActiveRef = useRef(false);
  const leftMouseButtonRef = useRef(false);
  const rightMouseButtonRef = useRef(false);
  const fallbackDraggingRef = useRef(false);
  const fallbackPointerIdRef = useRef<number | null>(null);
  const lastFallbackPointRef = useRef<{ x: number; y: number } | null>(null);
  const occlusionRaycasterRef = useRef(new THREE.Raycaster());
  const desiredOffsetRef = useRef(new THREE.Vector3());
  const desiredPositionRef = useRef(new THREE.Vector3());
  const rayDirectionRef = useRef(new THREE.Vector3());
  const camWorldLosRef = useRef(new THREE.Vector3());
  const probeTargetRef = useRef(new THREE.Vector3());
  const probeRightRef = useRef(new THREE.Vector3());
  const tpsEnterStartWorldRef = useRef(new THREE.Vector3());
  const tpsEnterBlendTRef = useRef(1);
  const tpsEnterInitiatedRef = useRef(false);
  const isoResumeStateRef = useRef<IsoResumeState | null>(null);
  const isoRestoreOffsetRef = useRef(new THREE.Vector3());
  const tpsExitTransitionRef = useRef<TpsExitTransition | null>(null);
  const targetZoomRef = useRef(DEFAULT_ZOOM);
  const distanceTargetRef = useRef(TPS_MAX_DISTANCE);
  const modeRef = useRef<CameraMode>("iso");
  modeRef.current = mode;
  const prevForceIsoTokenRef = useRef(forceIsoToken);

  useEffect(() => {
    const camera = orthoCameraRef.current;
    if (!camera) return;
    camera.position.copy(ISO_INITIAL_POSITION);
    camera.zoom = DEFAULT_ZOOM;
    camera.updateProjectionMatrix();
    targetZoomRef.current = camera.zoom;
    const raf = requestAnimationFrame(() => {
      controlsRef.current?.update();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      if (tpsCameraStateRef) {
        tpsCameraStateRef.current.active = false;
        tpsCameraStateRef.current.viewYaw = null;
        tpsCameraStateRef.current.characterOccluded = false;
        tpsCameraStateRef.current.steeringActive = false;
        tpsCameraStateRef.current.mouseForwardActive = false;
        tpsCameraStateRef.current.fadedOccluderKeys = [];
      }
    };
  }, [tpsCameraStateRef]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      if (!orbitEnabled) return;
      if (modeRef.current !== "iso") return;
      event.preventDefault();
      targetZoomRef.current = clamp(
        targetZoomRef.current - event.deltaY * ISO_ZOOM_WHEEL_SCALE,
        MIN_ZOOM,
        MAX_ZOOM,
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [gl, orbitEnabled]);

  const stopFallbackDrag = useCallback(() => {
    fallbackDraggingRef.current = false;
    fallbackPointerIdRef.current = null;
    lastFallbackPointRef.current = null;
  }, []);

  const exitPointerLock = useCallback(() => {
    if (document.pointerLockElement === gl.domElement) {
      document.exitPointerLock();
    }
  }, [gl]);

  const setSteeringActive = useCallback((active: boolean) => {
    steeringActiveRef.current = active;
    if (tpsCameraStateRef) {
      tpsCameraStateRef.current.steeringActive = active;
    }
  }, [tpsCameraStateRef]);

  const setMouseForwardActive = useCallback((active: boolean) => {
    mouseForwardActiveRef.current = active;
    if (tpsCameraStateRef) {
      tpsCameraStateRef.current.mouseForwardActive = active;
    }
  }, [tpsCameraStateRef]);

  const syncMouseForwardActive = useCallback(() => {
    setMouseForwardActive(modeRef.current === "tps" && leftMouseButtonRef.current && rightMouseButtonRef.current);
  }, [setMouseForwardActive]);

  const releaseTpsInputCapture = useCallback(() => {
    stopFallbackDrag();
    exitPointerLock();
    pointerLockActiveRef.current = false;
    leftMouseButtonRef.current = false;
    rightMouseButtonRef.current = false;
    setSteeringActive(false);
    setMouseForwardActive(false);
  }, [exitPointerLock, setMouseForwardActive, setSteeringActive, stopFallbackDrag]);

  const applyLookDelta = useCallback((deltaX: number, deltaY: number) => {
    viewYawRef.current = wrapAngle(viewYawRef.current - deltaX * TPS_LOOK_SENSITIVITY);
    pitchRef.current = clamp(pitchRef.current - deltaY * TPS_LOOK_SENSITIVITY, TPS_PITCH_MIN, TPS_PITCH_MAX);
  }, []);

  const finishExitToIso = useCallback(() => {
    const ortho = orthoCameraRef.current;
    const controls = controlsRef.current;
    const transition = tpsExitTransitionRef.current;
    if (ortho && controls && transition) {
      ortho.position.copy(transition.toPos);
      ortho.quaternion.copy(transition.toQuat);
      ortho.zoom = transition.toZoom;
      ortho.updateProjectionMatrix();
      ortho.updateMatrixWorld();
      targetZoomRef.current = transition.toZoom;
      controls.target.copy(targetRef.current);
      controls.update();
    }
    tpsExitTransitionRef.current = null;
    if (tpsCameraStateRef) {
      tpsCameraStateRef.current.active = false;
      tpsCameraStateRef.current.viewYaw = null;
      tpsCameraStateRef.current.characterOccluded = false;
      tpsCameraStateRef.current.steeringActive = false;
      tpsCameraStateRef.current.mouseForwardActive = false;
      tpsCameraStateRef.current.fadedOccluderKeys = [];
    }
    tpsEnterInitiatedRef.current = false;
    setMode("iso");
  }, [tpsCameraStateRef]);

  const beginExitToIso = useCallback((wheelDeltaY: number) => {
    releaseTpsInputCapture();
    charLosSmoothRef.current = 0;

    const ortho = orthoCameraRef.current;
    const persp = perspectiveCameraRef.current;
    const controls = controlsRef.current;
    const targetZoom = clamp(
      TPS_EXIT_TO_ISO_ZOOM - Math.max(0, wheelDeltaY) * TPS_EXIT_WHEEL_TO_ISO_ZOOM,
      MIN_ZOOM,
      TPS_EXIT_TO_ISO_ZOOM,
    );

    if (ortho && persp && controls) {
      const resumeState = isoResumeStateRef.current;
      const isoOffset = resumeState?.offset ?? buildIsoOffset(isoRestoreOffsetRef.current);

      ortho.position.copy(targetRef.current).add(isoOffset);
      ortho.lookAt(targetRef.current);
      ortho.updateMatrixWorld();

      tpsExitTransitionRef.current = {
        fromPos: persp.position.clone(),
        fromQuat: persp.quaternion.clone(),
        toPos: ortho.position.clone(),
        toQuat: ortho.quaternion.clone(),
        fromZoom: ortho.zoom,
        toZoom: targetZoom,
        t: 0,
      };

      ortho.position.copy(persp.position);
      ortho.quaternion.copy(persp.quaternion);
      ortho.zoom = tpsExitTransitionRef.current.fromZoom;
      ortho.updateProjectionMatrix();
      ortho.updateMatrixWorld();
      setMode("tps_exit");
      return;
    }

    if (ortho) {
      ortho.zoom = targetZoom;
      ortho.updateProjectionMatrix();
      targetZoomRef.current = targetZoom;
    }
    finishExitToIso();
  }, [finishExitToIso, releaseTpsInputCapture]);

  const enterTpsFromIso = useCallback(() => {
    const controls = controlsRef.current;
    const ortho = orthoCameraRef.current;
    if (!controls || !ortho) return;

    ortho.getWorldPosition(tpsEnterStartWorldRef.current);
    isoRestoreOffsetRef.current.copy(ortho.position).sub(controls.target);
    isoResumeStateRef.current = {
      position: ortho.position.clone(),
      quaternion: ortho.quaternion.clone(),
      offset: isoRestoreOffsetRef.current.clone(),
    };
    tpsEnterBlendTRef.current = 0;
    targetRef.current.set(controls.target.x, DEFAULT_TPS_TARGET_Y, controls.target.z);
    viewYawRef.current = wrapAngle(controls.getAzimuthalAngle() + Math.PI);
    pitchRef.current = clamp(Math.PI / 2 - controls.getPolarAngle(), TPS_PITCH_MIN, TPS_PITCH_MAX);
    distanceRef.current = TPS_MAX_DISTANCE;
    distanceTargetRef.current = TPS_MAX_DISTANCE;
    charLosSmoothRef.current = 0;
    leftMouseButtonRef.current = false;
    rightMouseButtonRef.current = false;
    setMouseForwardActive(false);
    setSteeringActive(false);
    stopFallbackDrag();
    setMode("tps");
  }, [setMouseForwardActive, setSteeringActive, stopFallbackDrag]);

  useEffect(() => {
    if (mode !== "tps" && mode !== "tps_exit") return;
    if (!tpsEnabled || !followCharacter || !characterPose || !orbitEnabled) {
      if (mode === "tps") {
        beginExitToIso(0);
      } else {
        finishExitToIso();
      }
    }
  }, [beginExitToIso, characterPose, finishExitToIso, followCharacter, mode, orbitEnabled, tpsEnabled]);

  useEffect(() => {
    if (forceIsoToken === prevForceIsoTokenRef.current) return;
    prevForceIsoTokenRef.current = forceIsoToken;
    if (modeRef.current === "tps") {
      beginExitToIso(0);
    } else if (modeRef.current === "tps_exit") {
      finishExitToIso();
    }
  }, [beginExitToIso, finishExitToIso, forceIsoToken]);

  useEffect(() => {
    if (mode !== "tps") return;

    const canvas = gl.domElement;
    const eventTargetsCanvas = (event: Event) => {
      if (event.target === canvas) return true;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      return path.includes(canvas);
    };

    const syncPointerLock = () => {
      const locked = document.pointerLockElement === canvas;
      if (targetLockActiveRef.current) {
        if (locked) {
          exitPointerLock();
        }
        pointerLockActiveRef.current = false;
        setSteeringActive(false);
        return;
      }
      pointerLockActiveRef.current = locked;
      if (locked) {
        stopFallbackDrag();
        setSteeringActive(true);
      } else if (!fallbackDraggingRef.current) {
        setSteeringActive(false);
      }
    };

    const beginFallbackDrag = (event: PointerEvent) => {
      fallbackDraggingRef.current = true;
      fallbackPointerIdRef.current = event.pointerId;
      lastFallbackPointRef.current = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      setSteeringActive(true);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;
      if (targetLockActiveRef.current) {
        if (event.button === 2) {
          event.preventDefault();
        }
        leftMouseButtonRef.current = false;
        rightMouseButtonRef.current = false;
        setMouseForwardActive(false);
        setSteeringActive(false);
        return;
      }
      if (event.button === 0) {
        leftMouseButtonRef.current = true;
        syncMouseForwardActive();
        event.preventDefault();
        return;
      }
      if (event.button !== 2) return;

      rightMouseButtonRef.current = true;
      event.preventDefault();
      syncMouseForwardActive();
      setSteeringActive(true);

      if (pointerLockActiveRef.current) return;

      const requestPointerLock = canvas.requestPointerLock?.bind(canvas);
      if (!requestPointerLock) {
        beginFallbackDrag(event);
        return;
      }

      try {
        const request = requestPointerLock() as void | Promise<void>;
        if (request && typeof (request as Promise<void>).catch === "function") {
          void (request as Promise<void>).catch(() => {
            if (!pointerLockActiveRef.current) {
              beginFallbackDrag(event);
            }
          });
        }
      } catch {
        beginFallbackDrag(event);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;
      if (targetLockActiveRef.current) return;

      if (pointerLockActiveRef.current) {
        if (event.movementX !== 0 || event.movementY !== 0) {
          applyLookDelta(event.movementX, event.movementY);
        }
        return;
      }

      if (!fallbackDraggingRef.current) return;

      if ((event.buttons & 2) === 0) {
        rightMouseButtonRef.current = false;
        syncMouseForwardActive();
        stopFallbackDrag();
        return;
      }

      const lastPoint = lastFallbackPointRef.current;
      const currentPoint = { x: event.clientX, y: event.clientY };
      if (lastPoint) {
        applyLookDelta(currentPoint.x - lastPoint.x, currentPoint.y - lastPoint.y);
      }
      lastFallbackPointRef.current = currentPoint;
      event.preventDefault();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (targetLockActiveRef.current) {
        if (fallbackPointerIdRef.current === event.pointerId) {
          canvas.releasePointerCapture?.(event.pointerId);
        }
        releaseTpsInputCapture();
        return;
      }
      if (event.button === 0) {
        leftMouseButtonRef.current = false;
        syncMouseForwardActive();
        return;
      }
      if (event.button !== 2 && fallbackPointerIdRef.current !== event.pointerId) return;
      rightMouseButtonRef.current = false;
      syncMouseForwardActive();
      if (fallbackPointerIdRef.current === event.pointerId) {
        canvas.releasePointerCapture?.(event.pointerId);
      }
      stopFallbackDrag();
      setSteeringActive(false);
      exitPointerLock();
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;
      if (targetLockActiveRef.current) {
        if (event.button === 2 && eventTargetsCanvas(event)) {
          event.preventDefault();
        }
        return;
      }
      const canvasRelated =
        pointerLockActiveRef.current ||
        fallbackDraggingRef.current ||
        rightMouseButtonRef.current ||
        eventTargetsCanvas(event);

      if (event.button === 0) {
        if (!canvasRelated) return;
        leftMouseButtonRef.current = true;
        syncMouseForwardActive();
        return;
      }

      if (event.button === 2 && eventTargetsCanvas(event)) {
        rightMouseButtonRef.current = true;
        syncMouseForwardActive();
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (targetLockActiveRef.current) {
        leftMouseButtonRef.current = false;
        rightMouseButtonRef.current = false;
        setMouseForwardActive(false);
        return;
      }
      if (event.button === 0) {
        leftMouseButtonRef.current = false;
        syncMouseForwardActive();
        return;
      }

      if (event.button === 2) {
        rightMouseButtonRef.current = false;
        syncMouseForwardActive();
      }
    };

    const handleWindowBlur = () => {
      if (targetLockActiveRef.current) {
        releaseTpsInputCapture();
        return;
      }
      leftMouseButtonRef.current = false;
      rightMouseButtonRef.current = false;
      syncMouseForwardActive();
    };

    const handleWheel = (event: WheelEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;
      if (targetLockActiveRef.current) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      const nextTarget = distanceTargetRef.current + event.deltaY * TPS_WHEEL_SPEED;
      if (nextTarget > TPS_EXIT_DISTANCE) {
        beginExitToIso(event.deltaY);
        return;
      }
      distanceTargetRef.current = clamp(nextTarget, TPS_MIN_DISTANCE, TPS_MAX_DISTANCE);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    document.addEventListener("pointerlockchange", syncPointerLock);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("blur", handleWindowBlur);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    syncPointerLock();

    return () => {
      document.removeEventListener("pointerlockchange", syncPointerLock);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("blur", handleWindowBlur);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      leftMouseButtonRef.current = false;
      rightMouseButtonRef.current = false;
      stopFallbackDrag();
      pointerLockActiveRef.current = false;
      setMouseForwardActive(false);
      setSteeringActive(false);
    };
  }, [
    applyLookDelta,
    exitPointerLock,
    beginExitToIso,
    followCharacter,
    gl,
    mode,
    orbitEnabled,
    releaseTpsInputCapture,
    setMouseForwardActive,
    setSteeringActive,
    stopFallbackDrag,
    syncMouseForwardActive,
    tpsEnabled,
  ]);

  useFrame((_, delta) => {
    const orthoCamera = orthoCameraRef.current;
    const perspectiveCamera = perspectiveCameraRef.current;
    const controls = controlsRef.current;
    if (!orthoCamera || !perspectiveCamera || !controls) return;

    const enteringTps =
      mode === "iso" &&
      tpsEnabled &&
      followCharacter &&
      characterPose &&
      orbitEnabled &&
      orthoCamera.zoom >= TPS_ENTER_ZOOM;

    if (mode === "tps" || mode === "tps_exit") {
      tpsEnterInitiatedRef.current = false;
    }

    if (enteringTps) {
      if (!tpsEnterInitiatedRef.current) {
        enterTpsFromIso();
        tpsEnterInitiatedRef.current = true;
      }
    } else if (mode === "iso" && orthoCamera.zoom < TPS_ENTER_ZOOM) {
      tpsEnterInitiatedRef.current = false;
    }

    const tpsDriving = mode === "tps" || mode === "tps_exit" || enteringTps;
    const lockedTarget = lockedTargetRef?.current ?? null;
    const targetLockActive = Boolean(mode === "tps" && tpsEnabled && followCharacter && characterPose && lockedTarget?.alive);
    targetLockActiveRef.current = targetLockActive;
    if (targetLockActive !== prevTargetLockActiveRef.current) {
      prevTargetLockActiveRef.current = targetLockActive;
      if (targetLockActive) {
        releaseTpsInputCapture();
        charLosSmoothRef.current = 0;
      }
    }

    const shouldFollowCharacter = followCharacter && characterPose;
    const shouldFollowTarget =
      shouldFollowCharacter &&
      (tpsDriving || orthoCamera.zoom >= FOLLOW_ZOOM_THRESHOLD);

    if (shouldFollowTarget) {
      const playerTargetX = characterPose.gx * TILE_UNIT_SIZE;
      const playerTargetY =
        (characterPose.worldY ?? characterPose.surfaceY ?? DEFAULT_WALK_SURFACE_OFFSET_Y) + TPS_TARGET_OFFSET_Y;
      const playerTargetZ = characterPose.gy * TILE_UNIT_SIZE;

      if (targetLockActive && lockedTarget) {
        const targetWorldX = lockedTarget.gx * TILE_UNIT_SIZE;
        const targetWorldY =
          (lockedTarget.worldY ?? lockedTarget.surfaceY ?? DEFAULT_WALK_SURFACE_OFFSET_Y) + TPS_TARGET_OFFSET_Y;
        const targetWorldZ = lockedTarget.gy * TILE_UNIT_SIZE;
        const desiredTargetX = (playerTargetX + targetWorldX) * 0.5;
        const desiredTargetY = (playerTargetY + targetWorldY) * 0.5 + 0.16;
        const desiredTargetZ = (playerTargetZ + targetWorldZ) * 0.5;
        const followAlpha = 1 - Math.exp(-TPS_TARGET_LOCK_FOLLOW_STIFFNESS * delta);
        targetRef.current.x += (desiredTargetX - targetRef.current.x) * followAlpha;
        targetRef.current.y += (desiredTargetY - targetRef.current.y) * followAlpha;
        targetRef.current.z += (desiredTargetZ - targetRef.current.z) * followAlpha;

        const desiredYaw = wrapAngle(Math.atan2(targetWorldX - playerTargetX, targetWorldZ - playerTargetZ));
        const yawAlpha = 1 - Math.exp(-TPS_TARGET_LOCK_YAW_STIFFNESS * delta);
        viewYawRef.current = wrapAngle(
          viewYawRef.current + wrapAngle(desiredYaw - viewYawRef.current) * yawAlpha,
        );

        const playerTargetDistance = Math.hypot(targetWorldX - playerTargetX, targetWorldZ - playerTargetZ);
        distanceTargetRef.current = clamp(
          TPS_TARGET_LOCK_DISTANCE_BASE + playerTargetDistance * TPS_TARGET_LOCK_DISTANCE_FACTOR,
          TPS_MIN_DISTANCE,
          TPS_MAX_DISTANCE,
        );
        pitchRef.current = clamp(
          TPS_TARGET_LOCK_PITCH_BASE + Math.min(playerTargetDistance, 6) * TPS_TARGET_LOCK_PITCH_DISTANCE_FACTOR,
          TPS_PITCH_MIN,
          TPS_PITCH_MAX,
        );
      } else {
        const dx = playerTargetX - targetRef.current.x;
        const dy = playerTargetY - targetRef.current.y;
        const dz = playerTargetZ - targetRef.current.z;

        if (
          Math.abs(dx) >= FOLLOW_DEAD_ZONE ||
          Math.abs(dy) >= FOLLOW_DEAD_ZONE ||
          Math.abs(dz) >= FOLLOW_DEAD_ZONE
        ) {
          const followStiffness = tpsDriving ? TPS_TARGET_FOLLOW_STIFFNESS : FOLLOW_STIFFNESS;
          const alpha = 1 - Math.exp(-followStiffness * delta);
          targetRef.current.x += dx * alpha;
          targetRef.current.y += dy * alpha;
          targetRef.current.z += dz * alpha;
        }
      }
    }

    const tpsActive = Boolean((mode === "tps" || enteringTps) && tpsEnabled && followCharacter && characterPose);
    const effectiveSteeringActive = tpsActive && !targetLockActive ? steeringActiveRef.current : false;
    const effectiveMouseForwardActive = tpsActive && !targetLockActive ? mouseForwardActiveRef.current : false;
    if (tpsCameraStateRef) {
      tpsCameraStateRef.current.active = tpsActive;
      tpsCameraStateRef.current.viewYaw = tpsActive ? viewYawRef.current : null;
      tpsCameraStateRef.current.steeringActive = effectiveSteeringActive;
      tpsCameraStateRef.current.mouseForwardActive = effectiveMouseForwardActive;
      if (!tpsActive) {
        tpsCameraStateRef.current.characterOccluded = false;
        tpsCameraStateRef.current.steeringActive = false;
        tpsCameraStateRef.current.mouseForwardActive = false;
        tpsCameraStateRef.current.fadedOccluderKeys = [];
        charLosSmoothRef.current = 0;
        setMouseForwardActive(false);
        setSteeringActive(false);
      }
    }

    if (mode === "iso" && !enteringTps) {
      const zoomAlpha = 1 - Math.exp(-ISO_ZOOM_LERP_SPEED * delta);
      const zErr = targetZoomRef.current - orthoCamera.zoom;
      if (Math.abs(zErr) > 1e-4) {
        orthoCamera.zoom += zErr * zoomAlpha;
        orthoCamera.updateProjectionMatrix();
      }

      if (shouldFollowTarget) {
        controls.target.copy(targetRef.current);
        controls.update();
      } else {
        targetRef.current.set(controls.target.x, DEFAULT_TPS_TARGET_Y, controls.target.z);
      }
      return;
    }

    if (mode === "tps_exit") {
      const transition = tpsExitTransitionRef.current;
      if (!transition) {
        finishExitToIso();
        return;
      }

      const resumeState = isoResumeStateRef.current;
      const isoOffset = resumeState?.offset ?? buildIsoOffset(isoRestoreOffsetRef.current);
      transition.toPos.copy(targetRef.current).add(isoOffset);
      orthoCamera.position.copy(transition.toPos);
      orthoCamera.lookAt(targetRef.current);
      orthoCamera.updateMatrixWorld();
      transition.toQuat.copy(orthoCamera.quaternion);

      transition.t = Math.min(1, transition.t + delta / TPS_EXIT_TRANSITION_DURATION);
      const eased = smoothstep01(transition.t);

      perspectiveCamera.position.lerpVectors(transition.fromPos, transition.toPos, eased);
      perspectiveCamera.quaternion.slerpQuaternions(transition.fromQuat, transition.toQuat, eased);

      orthoCamera.position.copy(perspectiveCamera.position);
      orthoCamera.quaternion.copy(perspectiveCamera.quaternion);
      orthoCamera.zoom = THREE.MathUtils.lerp(transition.fromZoom, transition.toZoom, eased);
      orthoCamera.updateProjectionMatrix();
      orthoCamera.updateMatrixWorld();

      if (transition.t >= 1) {
        orthoCamera.position.copy(transition.toPos);
        orthoCamera.quaternion.copy(transition.toQuat);
        orthoCamera.zoom = transition.toZoom;
        orthoCamera.updateProjectionMatrix();
        orthoCamera.updateMatrixWorld();
        finishExitToIso();
      }
      return;
    }

    controls.target.copy(targetRef.current);

    const distAlpha = 1 - Math.exp(-TPS_DISTANCE_LERP_SPEED * delta);
    distanceRef.current += (distanceTargetRef.current - distanceRef.current) * distAlpha;

    const desiredDistance = clamp(distanceRef.current, TPS_MIN_DISTANCE, TPS_MAX_DISTANCE);
    const pitch = clamp(pitchRef.current, TPS_PITCH_MIN, TPS_PITCH_MAX);
    const forwardX = Math.sin(viewYawRef.current);
    const forwardZ = Math.cos(viewYawRef.current);
    const horizontalDistance = Math.cos(pitch) * desiredDistance;

    desiredOffsetRef.current.set(
      -forwardX * horizontalDistance,
      Math.sin(pitch) * desiredDistance,
      -forwardZ * horizontalDistance,
    );
    desiredPositionRef.current.copy(targetRef.current).add(desiredOffsetRef.current);
    const finalTpsPos = desiredPositionRef.current;

    if (tpsEnterBlendTRef.current < 1) {
      tpsEnterBlendTRef.current = Math.min(1, tpsEnterBlendTRef.current + delta / TPS_ENTER_TRANSITION_DURATION);
      const eased = smoothstep01(tpsEnterBlendTRef.current);
      perspectiveCamera.position.lerpVectors(tpsEnterStartWorldRef.current, finalTpsPos, eased);
    } else {
      perspectiveCamera.position.copy(finalTpsPos);
    }
    perspectiveCamera.lookAt(targetRef.current);

    let rawLosBlocked = false;
    const cameraOccluders = cameraOccludersRef?.current ?? [];
    if (tpsActive && cameraOccluders.length > 0 && tpsCameraStateRef) {
      perspectiveCamera.getWorldPosition(camWorldLosRef.current);
      probeRightRef.current.set(Math.cos(viewYawRef.current), 0, -Math.sin(viewYawRef.current));
      let blockedCount = 0;
      const raycaster = occlusionRaycasterRef.current;
      const occluderObjects = cameraOccluders.map((entry) => entry.occluder);
      const occluderEntryMap = new Map<THREE.Object3D, CameraOccluderEntry>();
      const fadedOccluderKeySet = new Set<string>();
      for (const entry of cameraOccluders) {
        occluderEntryMap.set(entry.occluder, entry);
      }
      raycaster.layers.set(CAMERA_OCCLUSION_LAYER);
      raycaster.near = 0.05;

      for (let probeIndex = 0; probeIndex < 5; probeIndex += 1) {
        probeTargetRef.current.copy(targetRef.current);
        if (probeIndex === 1) {
          probeTargetRef.current.y += CHAR_LOS_HEAD_OFFSET;
        } else if (probeIndex === 2) {
          probeTargetRef.current.y += CHAR_LOS_LOWER_TORSO_OFFSET;
        } else if (probeIndex === 3) {
          probeTargetRef.current.addScaledVector(probeRightRef.current, CHAR_LOS_SHOULDER_OFFSET);
        } else if (probeIndex === 4) {
          probeTargetRef.current.addScaledVector(probeRightRef.current, -CHAR_LOS_SHOULDER_OFFSET);
        }

        rayDirectionRef.current.copy(probeTargetRef.current).sub(camWorldLosRef.current);
        const losLen = rayDirectionRef.current.length();
        if (losLen <= 1e-4) continue;

        rayDirectionRef.current.multiplyScalar(1 / losLen);
        raycaster.set(camWorldLosRef.current, rayDirectionRef.current);
        raycaster.far = losLen;
        const hits = raycaster.intersectObjects(occluderObjects, false);
        let probeBlocked = false;
        for (const hit of hits) {
          if (hit.distance <= 0.05 || hit.distance >= losLen - CHAR_LOS_CLEAR_MARGIN) {
            continue;
          }
          probeBlocked = true;
          const occluderEntry = occluderEntryMap.get(hit.object);
          if (occluderEntry?.fadeEligible) {
            fadedOccluderKeySet.add(occluderEntry.fadeKey);
          }
        }
        if (probeBlocked) {
          blockedCount += 1;
        }
      }
      rawLosBlocked = blockedCount >= 2;
      const losAlpha = 1 - Math.exp(-CHAR_LOS_SMOOTH_SPEED * delta);
      charLosSmoothRef.current += ((rawLosBlocked ? 1 : 0) - charLosSmoothRef.current) * losAlpha;
      tpsCameraStateRef.current.characterOccluded = charLosSmoothRef.current > 0.5;
      tpsCameraStateRef.current.fadedOccluderKeys = Array.from(fadedOccluderKeySet).sort();
    } else if (tpsCameraStateRef) {
      charLosSmoothRef.current = 0;
      tpsCameraStateRef.current.characterOccluded = false;
      tpsCameraStateRef.current.fadedOccluderKeys = [];
    }
  }, -1);

  return (
    <>
      <OrthographicCamera
        ref={orthoCameraRef}
        makeDefault={mode === "iso"}
        near={ISO_ORTHO_NEAR}
        far={ISO_ORTHO_FAR}
      />
      <PerspectiveCamera
        ref={perspectiveCameraRef}
        makeDefault={mode === "tps" || mode === "tps_exit"}
        fov={TPS_FOV}
        near={0.1}
        far={1000}
      />
      <OrbitControls
        ref={controlsRef}
        camera={orthoCameraRef.current ?? undefined}
        enabled={mode === "iso" && orbitEnabled}
        enableRotate={true}
        enablePan={true}
        enableZoom={false}
        mouseButtons={{
          LEFT: -1 as unknown as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.ROTATE,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_ROTATE,
        }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={0.2}
        target={[1.5, DEFAULT_TPS_TARGET_Y, 1.5]}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={0.5}
        panSpeed={0.8}
      />
    </>
  );
}
