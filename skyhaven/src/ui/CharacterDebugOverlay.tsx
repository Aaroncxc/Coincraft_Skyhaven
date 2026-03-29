import { TransformControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  EQUIPPABLE_ITEMS,
  cloneItemSocketTransform,
  getEquippableItemDefaultSocketByVariant,
  type AttachmentLoadout,
  type AttachmentSocketId,
  type EquipmentState,
  type EquippableItemId,
  type ItemSocketTransform,
  type ItemSocketTransformByVariant,
} from "../game/equipment";
import {
  PLAYABLE_CHARACTER_ORDER,
  type PlayableCharacterId,
} from "../game/playableCharacters";
import {
  type AttachmentSocketState,
} from "../game/three/CharacterModel";
import {
  PLAYABLE_PREVIEW_POSE,
  PlayableCharacterPreviewScene,
} from "./PlayableCharacterPreviewScene";

type GizmoMode = "translate" | "rotate" | "scale";

type CharacterDebugOverlayProps = {
  open: boolean;
  onClose: () => void;
  currentPlayableVariant: PlayableCharacterId;
  equipmentState: EquipmentState;
  axeGlowEnabled: boolean;
  onAxeGlowEnabledChange: (enabled: boolean) => void;
};

type CharacterDebugSceneProps = {
  playableVariant: PlayableCharacterId;
  socketId: AttachmentSocketId;
  previewItemId: EquippableItemId;
  transform: ItemSocketTransform;
  axeGlowEnabled: boolean;
  animationPaused: boolean;
  gizmoMode: GizmoMode;
  gizmoDragging: boolean;
  onTransformChange: (transform: ItemSocketTransform) => void;
  onGizmoDraggingChange: (dragging: boolean) => void;
  onAttachmentSocketStateChange: (state: AttachmentSocketState) => void;
};

const CHARACTER_LABELS: Record<PlayableCharacterId, string> = {
  default: "Main Char",
  fight_man: "Fight Man",
  mining_man: "Mining Man",
  magic_man: "Magic Man",
};

const SOCKET_LABELS: Record<AttachmentSocketId, string> = {
  right_hand: "Right Hand",
  left_hand: "Left Hand",
  back_right: "Back Right",
  back_left: "Back Left",
  hip_left: "Hip Left",
};

const SOCKET_NODE_LABELS: Record<AttachmentSocketId, string> = {
  right_hand: "RightHand",
  left_hand: "LeftHand",
  back_right: "back (spine / chest)",
  back_left: "back (spine / chest)",
  hip_left: "hip (hips / pelvis)",
};

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

function getInitialTransforms(
  itemId: EquippableItemId,
  socketId: AttachmentSocketId,
): ItemSocketTransformByVariant {
  return getEquippableItemDefaultSocketByVariant(itemId, socketId) ?? buildFallbackTransforms();
}

function buildInitialTransformState(): Record<EquippableItemId, Record<AttachmentSocketId, ItemSocketTransformByVariant>> {
  const result = {} as Record<EquippableItemId, Record<AttachmentSocketId, ItemSocketTransformByVariant>>;
  for (const itemId of Object.keys(EQUIPPABLE_ITEMS) as EquippableItemId[]) {
    result[itemId] = {
      right_hand: getInitialTransforms(itemId, "right_hand"),
      left_hand: getInitialTransforms(itemId, "left_hand"),
      back_right: getInitialTransforms(itemId, "back_right"),
      back_left: getInitialTransforms(itemId, "back_left"),
      hip_left: getInitialTransforms(itemId, "hip_left"),
    };
  }
  return result;
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
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= 1e-6);
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

function buildSocketExportText(
  socketId: AttachmentSocketId,
  transforms: ItemSocketTransformByVariant,
): string {
  const lines = [`${socketId}: {`];
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

function buildCombinedExportText(
  transformsBySocket: Record<AttachmentSocketId, ItemSocketTransformByVariant>,
): string {
  return [
    "socketTransforms: {",
    buildSocketExportText("right_hand", transformsBySocket.right_hand)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    buildSocketExportText("left_hand", transformsBySocket.left_hand)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    buildSocketExportText("back_right", transformsBySocket.back_right)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    buildSocketExportText("back_left", transformsBySocket.back_left)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    buildSocketExportText("hip_left", transformsBySocket.hip_left)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    "}",
  ].join("\n");
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

function CharacterDebugScene({
  playableVariant,
  socketId,
  previewItemId,
  transform,
  axeGlowEnabled,
  animationPaused,
  gizmoMode,
  gizmoDragging,
  onTransformChange,
  onGizmoDraggingChange,
  onAttachmentSocketStateChange,
}: CharacterDebugSceneProps) {
  const [toolObject, setToolObject] = useState<THREE.Object3D | null>(null);
  const controlsRef = useRef<any>(null);
  const previewKey = `${playableVariant}:${socketId}:${previewItemId}`;
  const attachmentLoadout = useMemo<AttachmentLoadout>(
    () => ({
      right_hand: socketId === "right_hand" ? previewItemId : null,
      left_hand: socketId === "left_hand" ? previewItemId : null,
      back_right: socketId === "back_right" ? previewItemId : null,
      back_left: socketId === "back_left" ? previewItemId : null,
      hip_left: socketId === "hip_left" ? previewItemId : null,
    }),
    [previewItemId, socketId],
  );
  const attachmentTransformOverrides = useMemo(
    () => ({ [socketId]: transform }) as Partial<Record<AttachmentSocketId, ItemSocketTransform | null>>,
    [socketId, transform],
  );

  const handleAttachmentObjectChange = useCallback(
    (changedSocketId: AttachmentSocketId, object: THREE.Object3D | null) => {
      if (changedSocketId !== socketId) return;
      setToolObject(object);
    },
    [socketId],
  );

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
  }, [gizmoMode, onGizmoDraggingChange, toolObject]);

  useEffect(() => {
    setToolObject(null);
  }, [previewKey]);

  return (
    <>
      <PlayableCharacterPreviewScene
        key={previewKey}
        playableVariant={playableVariant}
        attachmentLoadout={attachmentLoadout}
        attachmentTransformOverrides={attachmentTransformOverrides}
        axeGlowEnabled={axeGlowEnabled}
        animationPaused={animationPaused}
        orbitEnabled={!gizmoDragging}
        onAttachmentObjectChange={handleAttachmentObjectChange}
        onAttachmentSocketStateChange={onAttachmentSocketStateChange}
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
  equipmentState,
  axeGlowEnabled,
  onAxeGlowEnabledChange,
}: CharacterDebugOverlayProps) {
  const defaultPreviewItemId =
    equipmentState.equipped.mainHand ??
    equipmentState.equipped.offHand ??
    equipmentState.inventoryItems.slot4 ??
    equipmentState.inventoryItems.slot5 ??
    equipmentState.inventoryItems.slot6 ??
    "wood_axe_placeholder";

  const [selectedVariant, setSelectedVariant] = useState<PlayableCharacterId>(currentPlayableVariant);
  const [selectedItemId, setSelectedItemId] = useState<EquippableItemId>(defaultPreviewItemId);
  const [socketId, setSocketId] = useState<AttachmentSocketId>("right_hand");
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [workingTransforms, setWorkingTransforms] = useState(() => buildInitialTransformState());
  const [socketStates, setSocketStates] = useState<Partial<Record<AttachmentSocketId, AttachmentSocketState>>>({});
  const [animationPaused, setAnimationPaused] = useState(false);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedVariant(currentPlayableVariant);
    setSelectedItemId(defaultPreviewItemId);
    setSocketId("right_hand");
    setGizmoMode("translate");
    setAnimationPaused(false);
    setSocketStates({});
    setGizmoDragging(false);
    setCopyFeedback(null);
    setWorkingTransforms(buildInitialTransformState());
  }, [currentPlayableVariant, defaultPreviewItemId, open]);

  useEffect(() => {
    if (!copyFeedback) return;
    const timerId = window.setTimeout(() => setCopyFeedback(null), 2200);
    return () => window.clearTimeout(timerId);
  }, [copyFeedback]);

  const itemTransforms = workingTransforms[selectedItemId];
  const activeTransform = itemTransforms[socketId][selectedVariant];
  const exportText = useMemo(
    () => buildSocketExportText(socketId, itemTransforms[socketId]),
    [itemTransforms, socketId],
  );
  const combinedExportText = useMemo(
    () => buildCombinedExportText(itemTransforms),
    [itemTransforms],
  );

  const handleTransformChange = useCallback(
    (transform: ItemSocketTransform) => {
      startTransition(() => {
        const nextTransform = cloneItemSocketTransform(transform);
        setWorkingTransforms((previous) => {
          const current = previous[selectedItemId][socketId][selectedVariant];
          if (areTransformsEqual(current, nextTransform)) return previous;
          return {
            ...previous,
            [selectedItemId]: {
              ...previous[selectedItemId],
              [socketId]: {
                ...previous[selectedItemId][socketId],
                [selectedVariant]: nextTransform,
              },
            },
          };
        });
      });
    },
    [selectedItemId, selectedVariant, socketId],
  );

  const handleAttachmentSocketStateChange = useCallback((state: AttachmentSocketState) => {
    setSocketStates((previous) => {
      const current = previous[state.socketId];
      if (
        current?.found === state.found &&
        current?.variant === state.variant &&
        current?.nodeName === state.nodeName
      ) {
        return previous;
      }
      return {
        ...previous,
        [state.socketId]: state,
      };
    });
  }, []);

  const handleResetCurrent = useCallback(() => {
    const defaults = getInitialTransforms(selectedItemId, socketId);
    setWorkingTransforms((previous) => ({
      ...previous,
      [selectedItemId]: {
        ...previous[selectedItemId],
        [socketId]: {
          ...previous[selectedItemId][socketId],
          [selectedVariant]: cloneItemSocketTransform(defaults[selectedVariant]),
        },
      },
    }));
  }, [selectedItemId, selectedVariant, socketId]);

  const handleResetAll = useCallback(() => {
    setWorkingTransforms((previous) => ({
      ...previous,
      [selectedItemId]: {
        right_hand: getInitialTransforms(selectedItemId, "right_hand"),
        left_hand: getInitialTransforms(selectedItemId, "left_hand"),
        back_right: getInitialTransforms(selectedItemId, "back_right"),
        back_left: getInitialTransforms(selectedItemId, "back_left"),
        hip_left: getInitialTransforms(selectedItemId, "hip_left"),
      },
    }));
  }, [selectedItemId]);

  const handleCopyExport = useCallback(async () => {
    const copied = await copyTextToClipboard(exportText);
    setCopyFeedback(copied ? "Export copied to clipboard." : "Clipboard copy failed.");
  }, [exportText]);

  const handleCopyCombinedExport = useCallback(async () => {
    const copied = await copyTextToClipboard(combinedExportText);
    setCopyFeedback(copied ? "Combined export copied to clipboard." : "Clipboard copy failed.");
  }, [combinedExportText]);

  if (!open) return null;

  const socketState = socketStates[socketId];
  const socketMissing = socketState?.variant === selectedVariant && socketState.found === false;

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
              Tune item attachments per playable for right hand, left hand, back right and back left.
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
            <div className={`character-debug-stage${gizmoDragging ? " is-gizmo-dragging" : ""}`}>
              <Canvas
                className="character-debug-canvas"
                gl={{ antialias: true, alpha: true }}
                dpr={[1, 1.8]}
              >
                <CharacterDebugScene
                  playableVariant={selectedVariant}
                  socketId={socketId}
                  previewItemId={selectedItemId}
                  transform={activeTransform}
                  axeGlowEnabled={axeGlowEnabled}
                animationPaused={animationPaused}
                gizmoMode={gizmoMode}
                gizmoDragging={gizmoDragging}
                onTransformChange={handleTransformChange}
                onGizmoDraggingChange={setGizmoDragging}
                onAttachmentSocketStateChange={handleAttachmentSocketStateChange}
              />
              </Canvas>
            </div>

            <div className={`character-debug-stage-note${socketMissing ? " is-warning" : ""}`}>
              {socketMissing ? (
                <>
                  Missing <code>{SOCKET_NODE_LABELS[socketId]}</code> socket on{" "}
                  <strong>{CHARACTER_LABELS[selectedVariant]}</strong>.{" "}
                  <strong>{EQUIPPABLE_ITEMS[selectedItemId].label}</strong> cannot attach there until the rig exposes a usable bone.
                </>
              ) : (
                <>
                  Preview item: <strong>{EQUIPPABLE_ITEMS[selectedItemId].label}</strong> on{" "}
                  <strong>{SOCKET_LABELS[socketId]}</strong>.
                </>
              )}
            </div>
          </div>

          <div className="character-debug-sidebar">
            <section className="character-debug-section">
              <span className="character-debug-section-title">Item</span>
              <div className="character-debug-chip-row">
                {(Object.keys(EQUIPPABLE_ITEMS) as EquippableItemId[]).map((itemId) => (
                  <button
                    key={itemId}
                    type="button"
                    className={`character-debug-chip${selectedItemId === itemId ? " is-active" : ""}`}
                    onClick={() => setSelectedItemId(itemId)}
                  >
                    {EQUIPPABLE_ITEMS[itemId].label}
                  </button>
                ))}
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Socket</span>
              <div className="character-debug-chip-row">
                {(["right_hand", "left_hand", "back_right", "back_left", "hip_left"] as AttachmentSocketId[]).map((nextSocketId) => (
                  <button
                    key={nextSocketId}
                    type="button"
                    className={`character-debug-chip${socketId === nextSocketId ? " is-active" : ""}`}
                    onClick={() => setSocketId(nextSocketId)}
                  >
                    {SOCKET_LABELS[nextSocketId]}
                  </button>
                ))}
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Character</span>
              <div className="character-debug-chip-row">
                {PLAYABLE_CHARACTER_ORDER.map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    className={`character-debug-chip${selectedVariant === variant ? " is-active" : ""}`}
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
                    className={`character-debug-chip${gizmoMode === mode ? " is-active" : ""}`}
                    onClick={() => setGizmoMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Animation</span>
              <div className="character-debug-chip-row">
                <button
                  type="button"
                  className={`character-debug-chip${!animationPaused ? " is-active" : ""}`}
                  onClick={() => setAnimationPaused(false)}
                >
                  Playing
                </button>
                <button
                  type="button"
                  className={`character-debug-chip${animationPaused ? " is-active" : ""}`}
                  onClick={() => setAnimationPaused(true)}
                >
                  Paused
                </button>
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Axe Glow</span>
              <div className="character-debug-chip-row">
                <button
                  type="button"
                  className={`character-debug-chip${axeGlowEnabled ? " is-active" : ""}`}
                  onClick={() => onAxeGlowEnabledChange(true)}
                >
                  On
                </button>
                <button
                  type="button"
                  className={`character-debug-chip${!axeGlowEnabled ? " is-active" : ""}`}
                  onClick={() => onAxeGlowEnabledChange(false)}
                >
                  Off
                </button>
              </div>
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Preview Pose</span>
              <div className="character-debug-transform-list">
                <div className="character-debug-transform-row">
                  <span>surfaceY</span>
                  <code>{PLAYABLE_PREVIEW_POSE.surfaceY?.toFixed(4) ?? "—"}</code>
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
                  Reset Item
                </button>
                <button
                  type="button"
                  className="character-debug-btn primary"
                  onClick={handleCopyExport}
                >
                  Export Socket
                </button>
                <button
                  type="button"
                  className="character-debug-btn primary"
                  onClick={handleCopyCombinedExport}
                >
                  Export Item
                </button>
              </div>
              {copyFeedback ? (
                <div className="character-debug-copy-feedback">{copyFeedback}</div>
              ) : null}
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Export Socket</span>
              <textarea
                className="character-debug-export"
                value={exportText}
                readOnly
                spellCheck={false}
              />
            </section>

            <section className="character-debug-section">
              <span className="character-debug-section-title">Export Item</span>
              <textarea
                className="character-debug-export"
                value={combinedExportText}
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
