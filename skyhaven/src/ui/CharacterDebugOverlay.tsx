import { TransformControls } from "@react-three/drei";
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
  getEquippableItemDefaultBackByVariant,
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
  type BackSocketState,
  type RightHandSocketState,
} from "../game/three/CharacterModel";
import {
  PLAYABLE_PREVIEW_POSE,
  PlayableCharacterPreviewScene,
} from "./PlayableCharacterPreviewScene";

type GizmoMode = "translate" | "rotate" | "scale";
type SocketMode = "right_hand" | "back";

type CharacterDebugOverlayProps = {
  open: boolean;
  onClose: () => void;
  currentPlayableVariant: PlayableCharacterId;
  equippedRightHand: EquippableItemId | null;
};

const CHARACTER_LABELS: Record<PlayableCharacterId, string> = {
  default: "Main Char",
  fight_man: "Fight Man",
  mining_man: "Mining Man",
  magic_man: "Magic Man",
};

const CHARACTER_DEBUG_POSE = PLAYABLE_PREVIEW_POSE;

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

function getInitialBackTransforms(itemId: EquippableItemId): ItemSocketTransformByVariant {
  return getEquippableItemDefaultBackByVariant(itemId) ?? buildFallbackTransforms();
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

function buildBackExportText(transforms: ItemSocketTransformByVariant): string {
  const lines = ["backByVariant: {"];
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
  socketMode: SocketMode;
  previewItemId: EquippableItemId;
  transform: ItemSocketTransform;
  gizmoMode: GizmoMode;
  gizmoDragging: boolean;
  onTransformChange: (transform: ItemSocketTransform) => void;
  onGizmoDraggingChange: (dragging: boolean) => void;
  onRightHandSocketStateChange: (state: RightHandSocketState) => void;
  onBackSocketStateChange: (state: BackSocketState) => void;
};

function CharacterDebugScene({
  playableVariant,
  socketMode,
  previewItemId,
  transform,
  gizmoMode,
  gizmoDragging,
  onTransformChange,
  onGizmoDraggingChange,
  onRightHandSocketStateChange,
  onBackSocketStateChange,
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
      <PlayableCharacterPreviewScene
        playableVariant={playableVariant}
        equippedRightHand={socketMode === "right_hand" ? previewItemId : null}
        stowedBackItem={socketMode === "back" ? previewItemId : null}
        equippedRightHandTransformOverride={socketMode === "right_hand" ? transform : null}
        equippedBackTransformOverride={socketMode === "back" ? transform : null}
        orbitEnabled={!gizmoDragging}
        onEquippedToolObjectChange={handleToolObjectChange}
        onRightHandSocketStateChange={onRightHandSocketStateChange}
        onBackSocketStateChange={onBackSocketStateChange}
      />
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
  const [socketMode, setSocketMode] = useState<SocketMode>("right_hand");
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [workingTransforms, setWorkingTransforms] = useState<ItemSocketTransformByVariant>(() =>
    getInitialTransforms(previewItemId),
  );
  const [workingBackTransforms, setWorkingBackTransforms] = useState<ItemSocketTransformByVariant>(() =>
    getInitialBackTransforms(previewItemId),
  );
  const [rightHandSocketState, setRightHandSocketState] = useState<RightHandSocketState | null>(null);
  const [backSocketState, setBackSocketState] = useState<BackSocketState | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedVariant(currentPlayableVariant);
    setSocketMode("right_hand");
    setGizmoMode("translate");
    setRightHandSocketState(null);
    setBackSocketState(null);
    setGizmoDragging(false);
    setCopyFeedback(null);
    setWorkingTransforms(getInitialTransforms(previewItemId));
    setWorkingBackTransforms(getInitialBackTransforms(previewItemId));
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

  const activeTransform =
    socketMode === "right_hand"
      ? workingTransforms[selectedVariant]
      : workingBackTransforms[selectedVariant];

  const exportText = useMemo(
    () =>
      socketMode === "right_hand"
        ? buildExportText(workingTransforms)
        : buildBackExportText(workingBackTransforms),
    [socketMode, workingTransforms, workingBackTransforms],
  );

  const handleTransformChange = useCallback(
    (transform: ItemSocketTransform) => {
      startTransition(() => {
        const nextTransform = cloneItemSocketTransform(transform);
        if (socketMode === "right_hand") {
          setWorkingTransforms((previous) => {
            if (areTransformsEqual(previous[selectedVariant], nextTransform)) {
              return previous;
            }
            return {
              ...previous,
              [selectedVariant]: nextTransform,
            };
          });
        } else {
          setWorkingBackTransforms((previous) => {
            if (areTransformsEqual(previous[selectedVariant], nextTransform)) {
              return previous;
            }
            return {
              ...previous,
              [selectedVariant]: nextTransform,
            };
          });
        }
      });
    },
    [selectedVariant, socketMode],
  );

  const handleRightHandSocketStateChange = useCallback((state: RightHandSocketState) => {
    setRightHandSocketState((previous) => {
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

  const handleBackSocketStateChange = useCallback((state: BackSocketState) => {
    setBackSocketState((previous) => {
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
    if (socketMode === "right_hand") {
      const defaults = getInitialTransforms(previewItemId);
      setWorkingTransforms((previous) => ({
        ...previous,
        [selectedVariant]: cloneItemSocketTransform(defaults[selectedVariant]),
      }));
    } else {
      const defaults = getInitialBackTransforms(previewItemId);
      setWorkingBackTransforms((previous) => ({
        ...previous,
        [selectedVariant]: cloneItemSocketTransform(defaults[selectedVariant]),
      }));
    }
  }, [previewItemId, selectedVariant, socketMode]);

  const handleResetAll = useCallback(() => {
    if (socketMode === "right_hand") {
      setWorkingTransforms(getInitialTransforms(previewItemId));
    } else {
      setWorkingBackTransforms(getInitialBackTransforms(previewItemId));
    }
  }, [previewItemId, socketMode]);

  const handleCopyExport = useCallback(async () => {
    const copied = await copyTextToClipboard(exportText);
    setCopyFeedback(copied ? "Export copied to clipboard." : "Clipboard copy failed.");
  }, [exportText]);

  if (!open) return null;

  const socketMissing =
    socketMode === "right_hand"
      ? rightHandSocketState?.variant === selectedVariant && rightHandSocketState.found === false
      : backSocketState?.variant === selectedVariant && backSocketState.found === false;

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
              Tune wood axe attachment in hand or on the back (spine / chest socket) per playable
              character.
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
                  socketMode={socketMode}
                  previewItemId={previewItemId}
                  transform={activeTransform}
                  gizmoMode={gizmoMode}
                  gizmoDragging={gizmoDragging}
                  onTransformChange={handleTransformChange}
                  onGizmoDraggingChange={setGizmoDragging}
                  onRightHandSocketStateChange={handleRightHandSocketStateChange}
                  onBackSocketStateChange={handleBackSocketStateChange}
                />
              </Canvas>
            </div>

            <div
              className={`character-debug-stage-note${
                socketMissing ? " is-warning" : ""
              }`}
            >
              {socketMissing ? (
                socketMode === "right_hand" ? (
                  <>
                    Missing <code>RightHand</code> socket on{" "}
                    <strong>{CHARACTER_LABELS[selectedVariant]}</strong>. The axe cannot be attached
                    until that rig exposes a usable hand bone.
                  </>
                ) : (
                  <>
                    Missing back (spine / chest) socket on{" "}
                    <strong>{CHARACTER_LABELS[selectedVariant]}</strong>. The axe cannot be stowed
                    until that rig exposes a usable upper-body bone.
                  </>
                )
              ) : (
                <>
                  Preview item: <strong>Wood Axe</strong>
                  {socketMode === "back"
                    ? " (back / holstered)."
                    : equippedRightHand == null
                      ? " (hand preview; axe not on action bar in loadout)."
                      : " (hand; from current loadout)."}
                </>
              )}
            </div>
          </div>

          <div className="character-debug-sidebar">
            <section className="character-debug-section">
              <span className="character-debug-section-title">Socket</span>
              <div className="character-debug-chip-row">
                <button
                  type="button"
                  className={`character-debug-chip${socketMode === "right_hand" ? " is-active" : ""}`}
                  onClick={() => setSocketMode("right_hand")}
                >
                  Hand
                </button>
                <button
                  type="button"
                  className={`character-debug-chip${socketMode === "back" ? " is-active" : ""}`}
                  onClick={() => setSocketMode("back")}
                >
                  Back
                </button>
              </div>
            </section>

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
              <span className="character-debug-section-title">Preview pose</span>
              <div className="character-debug-transform-list">
                <div className="character-debug-transform-row">
                  <span>surfaceY</span>
                  <code>{CHARACTER_DEBUG_POSE.surfaceY?.toFixed(4) ?? "—"}</code>
                </div>
                <div className="character-debug-transform-row">
                  <span>worldY</span>
                  <code>
                    {PLAYABLE_PREVIEW_POSE.worldY != null
                      ? PLAYABLE_PREVIEW_POSE.worldY.toFixed(4)
                      : "(from surface)"}
                  </code>
                </div>
                <div className="character-debug-transform-row">
                  <span>grounded</span>
                  <code>{String(PLAYABLE_PREVIEW_POSE.grounded ?? true)}</code>
                </div>
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
