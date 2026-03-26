import type { AssetKey, CloneLineState, TileDef } from "../game/types";
import { DECORATION_VFX_TYPES, VFX_TILE_TYPES } from "../game/types";

type CanvasGizmoSheetProps = {
  selectedTile: TileDef | null;
  gizmoMode: "translate" | "scale";
  onGizmoModeChange: (mode: "translate" | "scale") => void;
  onRotate?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onToggleBlocked?: () => void;
  onToggleVfx?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  uniformScale?: boolean;
  onUniformScaleChange?: (value: boolean) => void;
  editingDecoration?: boolean;
  onEditingDecorationChange?: (value: boolean) => void;
  cloneState?: CloneLineState | null;
  cloneEligible?: boolean;
  cloneDisabledReason?: string | null;
  isDragging?: boolean;
  contextLabel?: string;
};

type IconName = "move" | "scale" | "rotate" | "undo" | "block" | "unblock" | "delete" | "copy" | "vfx";

function SheetIcon({ name }: { name: IconName }) {
  if (name === "move") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18M3 12h18" />
        <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
      </svg>
    );
  }
  if (name === "scale") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 3H3v6M15 21h6v-6M21 9V3h-6M3 15v6h6" />
        <path d="M10 10L3 3M14 14l7 7M14 10l7-7M10 14l-7 7" />
      </svg>
    );
  }
  if (name === "rotate") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
    );
  }
  if (name === "undo") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 8H4V3" />
        <path d="M4 8c1.9-2.5 4.9-4 8.2-4A8.8 8.8 0 0 1 21 12.8 8.8 8.8 0 0 1 12.2 21a8.8 8.8 0 0 1-6.8-3.2" />
      </svg>
    );
  }
  if (name === "block") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="3" ry="3" />
      </svg>
    );
  }
  if (name === "unblock") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="3" ry="3" />
        <path d="M7 17L17 7" />
      </svg>
    );
  }
  if (name === "delete") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14" />
        <path d="M9 7V5h6v2" />
        <path d="M8 7l1 12h6l1-12" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    );
  }
  if (name === "vfx") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="8" cy="10" r="1.5" />
        <circle cx="12" cy="8" r="1.5" />
        <circle cx="16" cy="10" r="1.5" />
        <circle cx="12" cy="14" r="1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" ry="2" />
      <rect x="5" y="5" width="11" height="11" rx="2" ry="2" />
    </svg>
  );
}

export function CanvasGizmoSheet({
  selectedTile,
  gizmoMode,
  onGizmoModeChange,
  onRotate,
  onCopy,
  onDelete,
  onToggleBlocked,
  onToggleVfx,
  onUndo,
  canUndo = false,
  uniformScale = true,
  onUniformScaleChange,
  editingDecoration = false,
  onEditingDecorationChange,
  cloneState = null,
  cloneEligible = true,
  cloneDisabledReason = null,
  isDragging = false,
  contextLabel = "Editor",
}: CanvasGizmoSheetProps) {
  const visible = selectedTile !== null;
  if (!visible || !selectedTile) return null;

  const showDecorationToggle = !!selectedTile.decoration && !!onEditingDecorationChange;
  const showCopyHint = typeof onCopy === "function";
  const isVfxTile = (VFX_TILE_TYPES as readonly AssetKey[]).includes(selectedTile.type);
  const isVfxDecoration =
    !!selectedTile.decoration &&
    (DECORATION_VFX_TYPES as readonly AssetKey[]).includes(selectedTile.decoration as AssetKey);
  const showVfxButton =
    typeof onToggleVfx === "function" && (isVfxTile || isVfxDecoration);

  return (
    <div
      className={`canvas-gizmo-sheet${visible ? " is-visible" : ""}${isDragging ? " is-dragging" : ""}`}
      data-no-window-drag="true"
    >
      <div className="canvas-gizmo-sheet-header">
        <span className="canvas-gizmo-sheet-title">{contextLabel}</span>
        <span className="canvas-gizmo-sheet-tile">
          {selectedTile.type} ({selectedTile.gx},{selectedTile.gy})
        </span>
      </div>

      {showDecorationToggle ? (
        <div className="canvas-gizmo-row">
          <button
            type="button"
            className={`canvas-gizmo-pill${!editingDecoration ? " is-active" : ""}`}
            onClick={() => onEditingDecorationChange?.(false)}
          >
            Tile
          </button>
          <button
            type="button"
            className={`canvas-gizmo-pill${editingDecoration ? " is-active" : ""}`}
            onClick={() => onEditingDecorationChange?.(true)}
          >
            Decoration
          </button>
        </div>
      ) : null}

      <div className="canvas-gizmo-row canvas-gizmo-row--icon-3">
        <button
          type="button"
          className={`canvas-gizmo-pill canvas-gizmo-btn--icon${gizmoMode === "translate" ? " is-active" : ""}`}
          onClick={() => onGizmoModeChange("translate")}
          title="Move"
          aria-label="Move"
        >
          <SheetIcon name="move" />
        </button>
        <button
          type="button"
          className={`canvas-gizmo-pill canvas-gizmo-btn--icon${gizmoMode === "scale" ? " is-active" : ""}`}
          onClick={() => onGizmoModeChange("scale")}
          title="Scale"
          aria-label="Scale"
        >
          <SheetIcon name="scale" />
        </button>
        <button
          type="button"
          className="canvas-gizmo-pill canvas-gizmo-btn--icon"
          onClick={() => onRotate?.()}
          title="Rotate 90 degrees"
          aria-label="Rotate 90 degrees"
        >
          <SheetIcon name="rotate" />
        </button>
      </div>

      {gizmoMode === "scale" ? (
        <label className="canvas-gizmo-checkbox">
          <input
            type="checkbox"
            checked={uniformScale}
            onChange={(event) => onUniformScaleChange?.(event.target.checked)}
          />
          Uniform Scale
        </label>
      ) : null}

      <div className={`canvas-gizmo-row${showVfxButton ? " canvas-gizmo-row--icon-5" : " canvas-gizmo-row--icon-4"}`}>
        <button
          type="button"
          className={`canvas-gizmo-action canvas-gizmo-btn--icon${canUndo ? "" : " is-disabled"}`}
          onClick={() => onUndo?.()}
          disabled={!canUndo}
          title="Undo"
          aria-label="Undo"
        >
          <SheetIcon name="undo" />
        </button>
        <button
          type="button"
          className={`canvas-gizmo-action canvas-gizmo-btn--icon${selectedTile.blocked ? " is-warn" : ""}`}
          onClick={() => onToggleBlocked?.()}
          title={selectedTile.blocked ? "Unblock tile" : "Block tile"}
          aria-label={selectedTile.blocked ? "Unblock tile" : "Block tile"}
        >
          <SheetIcon name={selectedTile.blocked ? "unblock" : "block"} />
        </button>
        {showVfxButton ? (
          <button
            type="button"
            className={`canvas-gizmo-action canvas-gizmo-btn--icon${selectedTile.vfxEnabled === true ? " is-active" : ""}`}
            onClick={() => onToggleVfx?.()}
            title="VFX an/aus"
            aria-label="Toggle VFX"
          >
            <SheetIcon name="vfx" />
          </button>
        ) : null}
        <button
          type="button"
          className="canvas-gizmo-action canvas-gizmo-btn--icon is-danger"
          onClick={() => onDelete?.()}
          title="Delete tile"
          aria-label="Delete tile"
        >
          <SheetIcon name="delete" />
        </button>
        <button
          type="button"
          className={`canvas-gizmo-action canvas-gizmo-btn--icon${cloneState ? " is-active" : ""}`}
          onClick={() => onCopy?.()}
          disabled={!cloneEligible && !cloneState}
          title={cloneState ? "Cancel copy mode" : "Copy this tile in a straight line"}
          aria-label={cloneState ? "Cancel copy mode" : "Copy this tile in a straight line"}
        >
          <SheetIcon name="copy" />
        </button>
      </div>

      {showCopyHint && cloneState ? (
        <div className="canvas-gizmo-hint is-active">
          Copy active - click an empty cell on the same line.
        </div>
      ) : cloneDisabledReason ? (
        <div className="canvas-gizmo-hint">{cloneDisabledReason}</div>
      ) : null}
    </div>
  );
}
