import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useEffect } from "react";
import * as THREE from "three";
import type { OrthographicCamera as ThreeOrthographicCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { TILE_UNIT_SIZE } from "./assets3d";
import type { CharacterPose3D } from "./useCharacterMovement";

const ISO_ANGLE_X = Math.atan(1 / Math.SQRT2);
const ISO_ANGLE_Y = Math.PI / 4;
const CAMERA_DISTANCE = 20;
const DEFAULT_ZOOM = 80;
const MIN_ZOOM = 30;
const MAX_ZOOM = 250;
const FOLLOW_ZOOM_THRESHOLD = 140;
const FOLLOW_STIFFNESS = 6;
const FOLLOW_DEAD_ZONE = 0.02;

type IslandCameraProps = {
  characterPose?: CharacterPose3D | null;
  followCharacter?: boolean;
  orbitEnabled?: boolean;
};

export function IslandCamera({ characterPose, followCharacter = false, orbitEnabled = true }: IslandCameraProps) {
  const cameraRef = useRef<ThreeOrthographicCamera>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    if (!cameraRef.current) return;
    cameraRef.current.zoom = DEFAULT_ZOOM;
    cameraRef.current.updateProjectionMatrix();
  }, []);

  useFrame((_, delta) => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (!followCharacter || !characterPose) return;

    const zoom = cameraRef.current.zoom;
    if (zoom < FOLLOW_ZOOM_THRESHOLD) return;

    const targetX = characterPose.gx * TILE_UNIT_SIZE;
    const targetZ = characterPose.gy * TILE_UNIT_SIZE;
    const target = controlsRef.current.target;

    const dx = targetX - target.x;
    const dz = targetZ - target.z;

    if (Math.abs(dx) < FOLLOW_DEAD_ZONE && Math.abs(dz) < FOLLOW_DEAD_ZONE) return;

    const alpha = 1 - Math.exp(-FOLLOW_STIFFNESS * delta);
    target.x += dx * alpha;
    target.z += dz * alpha;
    controlsRef.current.update();
  });

  const camX = CAMERA_DISTANCE * Math.sin(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X);
  const camY = CAMERA_DISTANCE * Math.sin(ISO_ANGLE_X);
  const camZ = CAMERA_DISTANCE * Math.cos(ISO_ANGLE_Y) * Math.cos(ISO_ANGLE_X);

  return (
    <>
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        position={[camX, camY, camZ]}
        zoom={DEFAULT_ZOOM}
        near={0.1}
        far={1000}
      />
      <OrbitControls
        ref={controlsRef}
        enabled={orbitEnabled}
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
        target={[1.5, 0, 1.5]}
        enableDamping
        dampingFactor={0.1}
        zoomSpeed={1.2}
        rotateSpeed={0.5}
        panSpeed={0.8}
      />
    </>
  );
}
