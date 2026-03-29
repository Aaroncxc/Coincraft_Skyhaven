import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Suspense, type ReactNode } from "react";
import type { Object3D } from "three";
import type {
  AttachmentLoadout,
  AttachmentSocketId,
  ItemSocketTransform,
} from "../game/equipment";
import type { PlayableCharacterId } from "../game/playableCharacters";
import {
  CharacterModel,
  FIGHT_MAN_ORBIT_MESH_SCALE_MULT,
  type AttachmentSocketState,
} from "../game/three/CharacterModel";
import { DEFAULT_WALK_SURFACE_OFFSET_Y } from "../game/three/islandSurface";
import type { CharacterPose3D } from "../game/three/useCharacterMovement";

export const PLAYABLE_PREVIEW_POSE: CharacterPose3D = {
  gx: 0,
  gy: 0,
  surfaceY: DEFAULT_WALK_SURFACE_OFFSET_Y,
  grounded: true,
  direction: "right",
  animState: "idle",
  isManualMove: false,
};

const VIEWER_TARGET: [number, number, number] = [0, 0.95, 0];
const VIEWER_CAMERA_POSITION: [number, number, number] = [0.28, 1.68, 1.18];
const VIEWER_MIN_DISTANCE = 0.76;
const VIEWER_MAX_DISTANCE = 2.6;
const VIEWER_MIN_POLAR_ANGLE = 0.34;
const VIEWER_MAX_POLAR_ANGLE = Math.PI * 0.5 - 0.05;
const PREVIEW_SCALE = 1.62;
const PREVIEW_POSITION: [number, number, number] = [0, -0.8, 0];

type PlayableCharacterPreviewSceneProps = {
  playableVariant: PlayableCharacterId;
  attachmentLoadout?: AttachmentLoadout;
  attachmentTransformOverrides?: Partial<Record<AttachmentSocketId, ItemSocketTransform | null>>;
  axeGlowEnabled?: boolean;
  animationPaused?: boolean;
  orbitEnabled?: boolean;
  onOrbitStart?: () => void;
  onOrbitEnd?: () => void;
  onAttachmentObjectChange?: (socketId: AttachmentSocketId, toolObject: Object3D | null) => void;
  onAttachmentSocketStateChange?: (state: AttachmentSocketState) => void;
  children?: ReactNode;
};

export function PlayableCharacterPreviewScene({
  playableVariant,
  attachmentLoadout,
  attachmentTransformOverrides,
  axeGlowEnabled = true,
  animationPaused = false,
  orbitEnabled = true,
  onOrbitStart,
  onOrbitEnd,
  onAttachmentObjectChange,
  onAttachmentSocketStateChange,
  children,
}: PlayableCharacterPreviewSceneProps) {
  const previewKey = `${playableVariant}:${JSON.stringify(attachmentLoadout ?? null)}`;

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={VIEWER_CAMERA_POSITION}
        fov={33}
        near={0.05}
        far={60}
      />
      <OrbitControls
        target={VIEWER_TARGET}
        enablePan={false}
        enableRotate
        enableZoom
        enabled={orbitEnabled}
        minDistance={VIEWER_MIN_DISTANCE}
        maxDistance={VIEWER_MAX_DISTANCE}
        minPolarAngle={VIEWER_MIN_POLAR_ANGLE}
        maxPolarAngle={VIEWER_MAX_POLAR_ANGLE}
        rotateSpeed={0.58}
        zoomSpeed={0.82}
        enableDamping
        dampingFactor={0.09}
        onStart={onOrbitStart}
        onEnd={onOrbitEnd}
      />
      <ambientLight intensity={0.58} />
      <directionalLight position={[2, 4, 3]} intensity={1.55} />
      <directionalLight position={[-2, 3, -1]} intensity={0.58} />
      <group position={PREVIEW_POSITION} scale={PREVIEW_SCALE}>
        <Suspense fallback={null}>
          <CharacterModel
            key={previewKey}
            pose={PLAYABLE_PREVIEW_POSE}
            playableVariant={playableVariant}
            renderContext="preview"
            attachmentLoadout={attachmentLoadout}
            attachmentTransformOverrides={attachmentTransformOverrides}
            axeGlowEnabled={axeGlowEnabled}
            animationPaused={animationPaused}
            fightManOrbitMeshScaleMult={
              playableVariant === "fight_man" ? FIGHT_MAN_ORBIT_MESH_SCALE_MULT : undefined
            }
            onAttachmentObjectChange={onAttachmentObjectChange}
            onAttachmentSocketStateChange={onAttachmentSocketStateChange}
          />
        </Suspense>
      </group>
      {children}
    </>
  );
}
