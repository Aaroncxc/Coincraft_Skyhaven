import { OrbitControls, PerspectiveCamera, TransformControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import {
  WOOD_AXE_ITEM_ID,
  cloneItemSocketTransform,
  getEquippableItemDefaultRightHandByVariant,
  type EquippableItemId,
  type ItemSocketTransform,
  type ItemSocketTransformByVariant,
} from "../game/equipment";
import {
  PLAYABLE_CHARACTER_ORDER,
  type PlayableCharacterId,
} from "../game/playableCharacters";
import {
  CharacterModel,
  type RightHandSocketState,
} from "../game/three/CharacterModel";
import type { CharacterPose3D } from "../game/three/useCharacterMovement";

type GizmoMode = "translate" | "rotate" | "scale";

type CharacterDebugOverlayProps = {
  open: boolean;
  onClose: () => void;
  currentPlayableVariant: PlayableCharacterId;
  equippedRightHand: EquippableItemId | null;
};

const CHARACTER_DEBUG_POSE: CharacterPose3D = {
  gx: 0,
  gy: 0,
  direction: "right",
  animState: "idle",
  isManualMove: false,
};

const CHARACTER_LABELS: Record<PlayableCharacterId, string> = {
  default: "Main Char",
  fight_man: "Fight Man",
  mining_man: "Mining Man",
  magic_man: "Magic Man",
};

const VIEWER_TARGET: [number, number, number] = [0, 0.95, 0];
const VIEWER_CAMERA_POSITION: [number, number, number] = [0.28, 1.68, 1.18];
const VIEWER_MIN_DISTANCE = 0.76;
const VIEWER_MAX_DISTANCE = 2.6;
const VIEWER_MIN_POLAR_ANGLE = 0.34;
const VIEWER_MAX_POLAR_ANGLE = Math.PI * 0.5 - 0.05;
const PREVIEW_SCALE = 1.62;

function buildFallbackTransforms(): ItemSocketTransformByVariant {
  const identity: ItemSocketTransform = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  return {
    default: cloneItemSocketTransform(identity),
    fight_man: cloneItemSocketTransform(identity),
    mining_man: cloneItemSocketTransform(identity),
    magic_man: cloneItemSocketTransform(identity),
  };
}

function getInitialTransforms(itemId: EquippableItemId): ItemSocketTransformByVariant {
  return (
    getEquippableItemDefaultRightHandByVariant(itemId) ??
    buildFallbackTransforms()
  );
}

function readToolTransform(object: THREE.Object3D): ItemSocketTransform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

function roundForExport(value: number): number {
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function areVec3Equal(a: readonly number[], b: readonly number[]): boolean {
  return (
    a.length === b.length &&
    a.every((value, index) => Math.abs(value - b[index]) <= 1e-6)
  );
}

function areTransformsEqual(a: ItemSocketTransform, b: ItemSocketTransform): boolean {
  return (
    areVec3Equal(a.position, b.position) &&
    areVec3Equal(a.rotation, b.rotation) &&
    areVec3Equal(a.scale, b.scale)
  );
}

function formatVecForDisplay(vec: readonly number[]): string {
  return vec.map((value) => roundForExport(value).toFixed(4)).join(", ");
}

function formatVecForCode(vec: readonly number[]): string {
  return `[${vec.map((value) => roundForExport(value)).join(", ")}]`;
}

function buildExportText(transforms: ItemSocketTransformByVariant): string {
  const lines = ["rightHandByVariant: {"];
  for (const variant of PLAYABLE_CHARACTER_ORDER) {
    const transform = transforms[variant];
    lines.push(`  ${variant}: {`);
    lines.push(`    position: ${formatVecForCode(transform.position)},`);
    lines.push(`    rotation: ${formatVecForCode(transform.rotation)},`);
    lines.push(`    scale: ${formatVecForCode(transform.scale)},`);
    lines.push("  },");
  }
  lines.push("}");
  return lines.join("\n");
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the DOM fallback below.
    }
  }

  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

type CharacterDebugSceneProps = {
  playableVariant: PlayableCharacterId;
  equippedRightHand: EquippableItemId;
  transform: ItemSocketTransform;
  gizmoMode: GizmoMode;
  gizmoDragging: boolean;
  onTransformChange: (transform: ItemSocketTransform) => void;
  onGizmoDraggingChange: (dragging: boolean) => void;
  onSocketStateChange: (state: RightHandSocketState) => void;
};

function CharacterDebugScene({
  playableVariant,
  equippedRightHand,
  transform,
  gizmoMode,
  gizmoDragging,
  onTransformChange,
  onGizmoDraggingChange,
  onSocketStateChange,
}: CharacterDebugSceneProps) {
  const [toolObject, setToolObject] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<any>(null);

  const handleToolObjectChange = useCallback((object: THREE.Object3D | null) => {
    setToolObject(object);
  }, []);

  const handleObjectChange = useCallback(() => {
    if (!toolObject) return;
    onTransformChange(readToolTransform(toolObject));
  }, [onTransformChange, toolObject]);

  useEffect(() => {
    if (!toolObject) return;
    onTransformChange(readToolTransform(toolObject));
  }, [onTransformChange, toolObject]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const handleDraggingChanged = (event: { value: boolean }) => {
      onGizmoDraggingChange(event.value);
    };
    controls.addEventListener("dragging-changed", handleDraggingChanged);
    return () => {
      controls.removeEventListener("dragging-changed", handleDraggingChanged);
      onGizmoDraggingChange(false);
    };
  }, [onGizmoDraggingChange, toolObject, gizmoMode]);

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
        enabled={!gizmoDragging}
        minDistance={VIEWER_MIN_DISTANCE}
        maxDistance={VIEWER_MAX_DISTANCE}
        minPolarAngle={VIEWER_MIN_POLAR_ANGLE}
        maxPolarAngle={VIEWER_MAX_POLAR_ANGLE}
        rotateSpeed={0.58}
        zoomSpeed={0.82}
        enableDamping
        dampingFactor={0.09}
      />
      <ambientLight intensity={0.58} />
      <directionalLight position={[2, 4, 3]} intensity={1.55} />
      <directionalLight position={[-2, 3, -1]} intensity={0.58} />
      <group position={[0, -0.8, 0]} scale={PREVIEW_SCALE}>
        <CharacterModel
          pose={CHARACTER_DEBUG_POSE}
          equippedRightHand={equippedRightHand}
          playableVariant={playableVariant}
          equippedRightHandTransformOverride={transform}
          onEquippedToolObjectChange={handleToolObjectChange}
          onRightHandSocketStateChange={onSocketStateChange}
        />
      </group>
      {toolObject ? (
        <TransformControls
          ref={controlsRef}
          object={toolObject}
          mode={gizmoMode}
          size={0.88}
          space="local"
          translationSnap={gizmoMode === "translate" ? 0.01 : undefined}
          rotationSnap={gizmoMode === "rotate" ? THREE.MathUtils.degToRad(1) : undefined}
          scaleSnap={gizmoMode === "scale" ? 0.01 : undefined}
          onObjectChange={handleObjectChange}
        />
      ) : null}
    </>
  );
}

export function CharacterDebugOverlay({
  open,
  onClose,
  currentPlayableVariant,
  equippedRightHand,
}: CharacterDebugOverlayProps) {
  const previewItemId = equippedRightHand ?? WOOD_AXE_ITEM_ID;
  const [selectedVariant, setSelectedVariant] = useState<PlayableCharacterId>(currentPlayableVariant);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [workingTransforms, setWorkingTransforms] = useState<ItemSocketTransformByVariant>(() =>
    getInitialTransforms(previewItemId),
  );
  const [socketState, setSocketState] = useState<RightHandSocketState | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedVariant(currentPlayableVariant);
    setGizmoMode("translate");
    setSocketState(null);
    setGizmoDragging(false);
    setCopyFeedback(null);
    setWorkingTransforms(getInitialTransforms(previewItemId));
  }, [currentPlayableVariant, open, previewItemId]);

  useEffect(() => {
    if (!copyFeedback) return;
    const timerId = window.setTimeout(() => {
      setCopyFeedback(null);
    }, 2200);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [copyFeedback]);

  const activeTransform = workingTransforms[selectedVariant];
  const exportText = useMemo(
    () => buildExportText(workingTransforms),
    [workingTransforms],
  );

  const handleTransformChange = useCallback(
    (transform: ItemSocketTransform) => {
      startTransition(() => {
        setWorkingTransforms((previous) => {
          const nextTransform = cloneItemSocketTransform(transform);
          if (areTransformsEqual(previous[selectedVariant], nextTransform)) {
            return previous;
          }
          return {
            ...previous,
            [selectedVariant]: nextTransform,
          };
        });
      });
    },
    [selectedVariant],
  );

  const handleSocketStateChange = useCallback((state: RightHandSocketState) => {
    setSocketState((previous) => {
      if (
        previous?.found === state.found &&
        previous?.variant === state.variant &&
        previous?.nodeName === state.nodeName
      ) {
        return previous;
      }
      return state;
    });
  }, []);

  const handleResetCurrent = useCallback(() => {
    const defaults = getInitialTransforms(previewItemId);
    setWorkingTransforms((previous) => ({
      ...previous,
      [selectedVariant]: cloneItemSocketTransform(defaults[selectedVariant]),
    }));
  }, [previewItemId, selectedVariant]);

  const handleResetAll = useCallback(() => {
    setWorkingTransforms(getInitialTransforms(previewItemId));
  }, [previewItemId]);

  const handleCopyExport = useCallback(async () => {
    const copied = await copyTextToClipboard(exportText);
    setCopyFeedback(copied ? "Export copied to clipboard." : "Clipboard copy failed.");
  }, [exportText]);

  if (!open) return null;

  const socketMissing =
    socketState?.variant === selectedVariant && socketState.found === false;

  return (
    <section className="character-debug-overlay" aria-modal="true" role="dialog">
      <button
        type="button"
        className="character-debug-backdrop"
        onClick={onClose}
        aria-label="Close character debug"
      />
      <div className="character-debug-panel" data-no-window-drag="true">
        <div className="character-debug-header">
          <div>
            <h2 className="character-debug-title">Character Debug</h2>
            <p className="character-debug-subtitle">
              Tune the wood axe hand attachment per playable character.
            </p>
          </div>
          <button
            type="button"
            className="character-debug-close-btn"
            onClick={onClose}
            aria-label="Close character debug"
          >
            x
          </button>
        </div>

        <div className="character-debug-layout">
          <div className="character-debug-preview-column">
            <div
              className={`character-debug-stage${
                gizmoDragging ? " is-gizmo-dragging" : ""
              }`}
            >
              <Canvas
                className="character-debug-canvas"
                gl={{ antialias: true, alpha: true }}
                dpr={[1, 1.8]}
              >
                <CharacterDebugScene
                  playableVariant={selectedVariant}
                  equippedRightHand={previewItemId}
                  transform={activeTransform}
                  gizmoMode={gizmoMode}
                  gizmoDragging={gizmoDragging}
                  onTransformChange={handleTransformChange}
                  onGizmoDraggingChange={setGizmoDragging}
                  onSocketStateChange={handleSocketStateChange}
                />
              </Canvas>
            </div>

            <div
              className={`character-debug-stage-note${
                socketMissing ? " is-warning" : ""
              }`}
            >
              {socketMissing ? (
                <>
                  Missing <code>RightHand</code> socket on{" "}
                  <strong>{CHARACTER_LABELS[selectedVariant]}</strong>. The axe cannot be attached
                  until that rig exposes a usable hand bone.
                </>
              ) : (
                <>
                  Preview item: <strong>Wood Axe</strong>
                  {equippedRightHand == null
                    ? " (debug preview active even though the axe is not currently equipped)."
                    : " from the current loadout."}
                </>
              )}
            </div>
          </div>

          <div className="character-debug-sidebar">
            <section className="character-debug-section">
              <span className="character-debug-section-title">Character</span>
              <div className="character-debug-chip-row">
                {PLAYABLE_CHARACTER_ORDER.map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    className={`character-debug-chip${
                      selectedVariant === variant ? " is-active" : ""
                    }`}
                    onClick={() => setSelectedVariant(variant)}
                  >
                    {CHARACTER_LABELS[variant]}
                  </button>
                ))}
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Gizmo</span>
              <div className="character-debug-chip-row">
                {(["translate", "rotate", "scale"] as GizmoMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`character-debug-chip${
                      gizmoMode === mode ? " is-active" : ""
                    }`}
                    onClick={() => setGizmoMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Current Transform</span>
              <div className="character-debug-transform-list">
                <div className="character-debug-transform-row">
                  <span>Position</span>
                  <code>{formatVecForDisplay(activeTransform.position)}</code>
                </div>
                <div className="character-debug-transform-row">
                  <span>Rotation</span>
                  <code>{formatVecForDisplay(activeTransform.rotation)}</code>
                </div>
                <div className="character-debug-transform-row">
                  <span>Scale</span>
                  <code>{formatVecForDisplay(activeTransform.scale)}</code>
                </div>
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Actions</span>
              <div className="character-debug-actions">
                <button
                  type="button"
                  className="character-debug-btn secondary"
                  onClick={handleResetCurrent}
                >
                  Reset Current
                </button>
                <button
                  type="button"
                  className="character-debug-btn secondary"
                  onClick={handleResetAll}
                >
                  Reset All
                </button>
                <button
                  type="button"
                  className="character-debug-btn primary"
                  onClick={handleCopyExport}
                >
                  Export
                </button>
              </div>
              {copyFeedback ? (
                <div className="character-debug-copy-feedback">{copyFeedback}</div>
              ) : null}
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Export</span>
              <textarea
                className="character-debug-export"
                value={exportText}
                readOnly
                spellCheck={false}
              />
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
