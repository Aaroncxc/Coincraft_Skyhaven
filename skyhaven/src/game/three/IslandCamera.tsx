import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import type { OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { TILE_UNIT_SIZE } from "./assets3d";
import type { CharacterPose3D, TpsCameraState } from "./useCharacterMovement";

const ISO_ANGLE_X = Math.atan(1 / Math.SQRT2);
const ISO_ANGLE_Y = Math.PI / 4;
const CAMERA_DISTANCE = 20;
const DEFAULT_ZOOM = 80;
const MIN_ZOOM = 30;
const MAX_ZOOM = 250;
const FOLLOW_ZOOM_THRESHOLD = 140;
const FOLLOW_STIFFNESS = 6;
const FOLLOW_DEAD_ZONE = 0.02;

const TPS_FOV = 55;
const TPS_ENTER_ZOOM = 170;
const TPS_EXIT_TO_ISO_ZOOM = 164;
const TPS_MIN_DISTANCE = 2.75;
const TPS_MAX_DISTANCE = 6.5;
const TPS_EXIT_DISTANCE = 7.25;
const TPS_TARGET_Y = 1.15;
const TPS_PITCH_MIN = 0.16;
const TPS_PITCH_MAX = 1.2;
const TPS_LOOK_SENSITIVITY = 0.0024;
const TPS_WHEEL_SPEED = 0.01;
const TPS_OCCLUSION_BUFFER = 0.18;
const TPS_OCCLUSION_MIN_DISTANCE = 0.95;
const TPS_OCCLUSION_RECOVERY = 9;
const CAMERA_OCCLUSION_LAYER = 2;

type CameraMode = "iso" | "tps";

type IslandCameraProps = {
  characterPose?: CharacterPose3D | null;
  followCharacter?: boolean;
  orbitEnabled?: boolean;
  tpsEnabled?: boolean;
  tpsCameraStateRef?: MutableRefObject<TpsCameraState>;
  cameraOccludersRef?: MutableRefObject<THREE.Object3D[]>;
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

export function IslandCamera({
  characterPose,
  followCharacter = false,
  orbitEnabled = true,
  tpsEnabled = false,
  tpsCameraStateRef,
  cameraOccludersRef,
}: IslandCameraProps) {
  const { gl } = useThree();
  const orthoCameraRef = useRef<ThreeOrthographicCamera>(null);
  const perspectiveCameraRef = useRef<ThreePerspectiveCamera>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [mode, setMode] = useState<CameraMode>("iso");
  const targetRef = useRef(new THREE.Vector3(1.5, TPS_TARGET_Y, 1.5));
  const viewYawRef = useRef(wrapAngle(ISO_ANGLE_Y + Math.PI));
  const pitchRef = useRef(ISO_ANGLE_X);
  const distanceRef = useRef(TPS_MAX_DISTANCE);
  const occludedDistanceRef = useRef(TPS_MAX_DISTANCE);
  const pointerLockActiveRef = useRef(false);
  const fallbackDraggingRef = useRef(false);
  const fallbackPointerIdRef = useRef<number | null>(null);
  const lastFallbackPointRef = useRef<{ x: number; y: number } | null>(null);
  const occlusionRaycasterRef = useRef(new THREE.Raycaster());
  const desiredOffsetRef = useRef(new THREE.Vector3());
  const desiredPositionRef = useRef(new THREE.Vector3());
  const rayDirectionRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const camera = orthoCameraRef.current;
    if (!camera) return;
    camera.zoom = DEFAULT_ZOOM;
    camera.updateProjectionMatrix();
  }, []);

  useEffect(() => {
    return () => {
      if (tpsCameraStateRef) {
        tpsCameraStateRef.current.active = false;
        tpsCameraStateRef.current.viewYaw = null;
      }
    };
  }, [tpsCameraStateRef]);

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

  const applyLookDelta = useCallback((deltaX: number, deltaY: number) => {
    viewYawRef.current = wrapAngle(viewYawRef.current - deltaX * TPS_LOOK_SENSITIVITY);
    pitchRef.current = clamp(pitchRef.current - deltaY * TPS_LOOK_SENSITIVITY, TPS_PITCH_MIN, TPS_PITCH_MAX);
  }, []);

  const exitToIso = useCallback(() => {
    stopFallbackDrag();
    exitPointerLock();
    pointerLockActiveRef.current = false;
    occludedDistanceRef.current = distanceRef.current;
    const camera = orthoCameraRef.current;
    if (camera) {
      camera.zoom = TPS_EXIT_TO_ISO_ZOOM;
      camera.updateProjectionMatrix();
    }
    if (tpsCameraStateRef) {
      tpsCameraStateRef.current.active = false;
      tpsCameraStateRef.current.viewYaw = null;
    }
    setMode("iso");
  }, [exitPointerLock, stopFallbackDrag, tpsCameraStateRef]);

  const enterTpsFromIso = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    targetRef.current.set(controls.target.x, TPS_TARGET_Y, controls.target.z);
    viewYawRef.current = wrapAngle(controls.getAzimuthalAngle() + Math.PI);
    pitchRef.current = clamp(Math.PI / 2 - controls.getPolarAngle(), TPS_PITCH_MIN, TPS_PITCH_MAX);
    distanceRef.current = TPS_MAX_DISTANCE;
    occludedDistanceRef.current = TPS_MAX_DISTANCE;
    stopFallbackDrag();
    setMode("tps");
  }, [stopFallbackDrag]);

  useEffect(() => {
    if (mode !== "tps") return;
    if (!tpsEnabled || !followCharacter || !characterPose || !orbitEnabled) {
      exitToIso();
    }
  }, [characterPose, exitToIso, followCharacter, mode, orbitEnabled, tpsEnabled]);

  useEffect(() => {
    if (mode !== "tps") return;

    const canvas = gl.domElement;

    const syncPointerLock = () => {
      const locked = document.pointerLockElement === canvas;
      pointerLockActiveRef.current = locked;
      if (locked) {
        stopFallbackDrag();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;

      if (event.button === 0 && !pointerLockActiveRef.current) {
        try {
          const request = canvas.requestPointerLock?.() as void | Promise<void>;
          if (request && typeof (request as Promise<void>).catch === "function") {
            void (request as Promise<void>).catch(() => {});
          }
        } catch {
          // Ignore lock failures; RMB fallback remains available.
        }
        return;
      }

      if (event.button !== 2 || pointerLockActiveRef.current) return;

      fallbackDraggingRef.current = true;
      fallbackPointerIdRef.current = event.pointerId;
      lastFallbackPointRef.current = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;

      if (pointerLockActiveRef.current) {
        if (event.movementX !== 0 || event.movementY !== 0) {
          applyLookDelta(event.movementX, event.movementY);
        }
        return;
      }

      if (!fallbackDraggingRef.current) return;

      if ((event.buttons & 2) === 0) {
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
      if (fallbackPointerIdRef.current === event.pointerId) {
        canvas.releasePointerCapture?.(event.pointerId);
      }
      stopFallbackDrag();
    };

    const handleWheel = (event: WheelEvent) => {
      if (!tpsEnabled || !followCharacter || !orbitEnabled) return;

      event.preventDefault();
      const desiredDistance = distanceRef.current + event.deltaY * TPS_WHEEL_SPEED;
      if (desiredDistance > TPS_EXIT_DISTANCE) {
        exitToIso();
        return;
      }
      distanceRef.current = clamp(desiredDistance, TPS_MIN_DISTANCE, TPS_MAX_DISTANCE);
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (fallbackDraggingRef.current) {
        event.preventDefault();
      }
    };

    document.addEventListener("pointerlockchange", syncPointerLock);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    syncPointerLock();

    return () => {
      document.removeEventListener("pointerlockchange", syncPointerLock);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      stopFallbackDrag();
      pointerLockActiveRef.current = false;
    };
  }, [applyLookDelta, exitToIso, followCharacter, gl, mode, orbitEnabled, stopFallbackDrag, tpsEnabled]);

  useFrame((_, delta) => {
    const orthoCamera = orthoCameraRef.current;
    const perspectiveCamera = perspectiveCameraRef.current;
    const controls = controlsRef.current;
    if (!orthoCamera || !perspectiveCamera || !controls) return;

    if (mode === "iso" && tpsEnabled && followCharacter && characterPose && orbitEnabled && orthoCamera.zoom >= TPS_ENTER_ZOOM) {
      enterTpsFromIso();
      return;
    }

    const shouldFollowCharacter = followCharacter && characterPose;
    const shouldFollowTarget =
      shouldFollowCharacter &&
      (mode === "tps" || orthoCamera.zoom >= FOLLOW_ZOOM_THRESHOLD);

    if (shouldFollowTarget) {
      const desiredTargetX = characterPose.gx * TILE_UNIT_SIZE;
      const desiredTargetY = TPS_TARGET_Y;
      const desiredTargetZ = characterPose.gy * TILE_UNIT_SIZE;

      const dx = desiredTargetX - targetRef.current.x;
      const dy = desiredTargetY - targetRef.current.y;
      const dz = desiredTargetZ - targetRef.current.z;

      if (
        Math.abs(dx) >= FOLLOW_DEAD_ZONE ||
        Math.abs(dy) >= FOLLOW_DEAD_ZONE ||
        Math.abs(dz) >= FOLLOW_DEAD_ZONE
      ) {
        const alpha = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
        targetRef.current.x += dx * alpha;
        targetRef.current.y += dy * alpha;
        targetRef.current.z += dz * alpha;
      }
    }

    const tpsActive = mode === "tps" && tpsEnabled && followCharacter && !!characterPose;
    if (tpsCameraStateRef) {
      tpsCameraStateRef.current.active = tpsActive;
      tpsCameraStateRef.current.viewYaw = tpsActive ? viewYawRef.current : null;
    }

    if (mode === "iso") {
      if (shouldFollowTarget) {
        controls.target.copy(targetRef.current);
        controls.update();
      } else {
        targetRef.current.set(controls.target.x, TPS_TARGET_Y, controls.target.z);
      }
      return;
    }

    controls.target.copy(targetRef.current);

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

    let allowedDistance = desiredDistance;
    const desiredOffsetLength = desiredOffsetRef.current.length();
    const cameraOccluders = cameraOccludersRef?.current ?? [];
    if (cameraOccluders.length > 0 && desiredOffsetLength > 1e-5) {
      rayDirectionRef.current.copy(desiredOffsetRef.current).normalize();
      const raycaster = occlusionRaycasterRef.current;
      raycaster.set(targetRef.current, rayDirectionRef.current);
      raycaster.layers.set(CAMERA_OCCLUSION_LAYER);
      raycaster.near = 0.05;
      raycaster.far = desiredOffsetLength;
      const hit = raycaster
        .intersectObjects(cameraOccluders, false)
        .find((candidate) => candidate.distance > 0.05);
      if (hit) {
        allowedDistance = clamp(hit.distance - TPS_OCCLUSION_BUFFER, TPS_OCCLUSION_MIN_DISTANCE, desiredDistance);
      }
    }

    if (allowedDistance < occludedDistanceRef.current) {
      occludedDistanceRef.current = allowedDistance;
    } else {
      const alpha = 1 - Math.exp(-TPS_OCCLUSION_RECOVERY * delta);
      occludedDistanceRef.current += (allowedDistance - occludedDistanceRef.current) * alpha;
    }

    const appliedDistance = clamp(occludedDistanceRef.current, TPS_OCCLUSION_MIN_DISTANCE, desiredDistance);
    const appliedScale = desiredDistance > 1e-5 ? appliedDistance / desiredDistance : 1;
    perspectiveCamera.position.copy(targetRef.current).addScaledVector(desiredOffsetRef.current, appliedScale);
    perspectiveCamera.lookAt(targetRef.current);
  });

  const camX = CAMERA_DISTANCE * Math.sin(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X);
  const camY = CAMERA_DISTANCE * Math.sin(ISO_ANGLE_X);
  const camZ = CAMERA_DISTANCE * Math.cos(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X);

  return (
    <>
      <OrthographicCamera
        ref={orthoCameraRef}
        makeDefault={mode === "iso"}
        position={[camX, camY, camZ]}
        zoom={DEFAULT_ZOOM}
        near={0.1}
        far={1000}
      />
      <PerspectiveCamera
        ref={perspectiveCameraRef}
        makeDefault={mode === "tps"}
        fov={TPS_FOV}
        position={[0, 0, 0]}
        near={0.1}
        far={1000}
      />
      <OrbitControls
        ref={controlsRef}
        camera={orthoCameraRef.current ?? undefined}
        enabled={mode === "iso" && orbitEnabled}
        enableRotate={true}
        enablePan={true}
        enableZoom={true}
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
        target={[1.5, TPS_TARGET_Y, 1.5]}
        enableDamping
        dampingFactor={0.1}
        zoomSpeed={1.2}
        rotateSpeed={0.5}
        panSpeed={0.8}
      />
    </>
  );
}
