import { canAfford, type Inventory } from "../game/inventory";
import { getTileRecipe } from "../game/resources";
import type { AssetKey, IslandId, TileDef } from "../game/types";

const TOOLBOX_THUMBS: Partial<Record<AssetKey, string>> = {
  base: "/ingame_assets/expanded/toolbox/thumb_base.png",
  grass: "/ingame_assets/expanded/toolbox/thumb_grass.png",
  pathCross: "/ingame_assets/expanded/toolbox/thumb_pathCross.png",
  pathStraight: "/ingame_assets/expanded/toolbox/thumb_pathStraight.png",
  pathStraightAlt: "/ingame_assets/expanded/toolbox/thumb_pathStraightAlt.png",
  tree1: "/ingame_assets/expanded/toolbox/thumb_tree1.png",
  treeMiddle: "/ingame_assets/expanded/toolbox/thumb_tree1.png",
  farmSlot: "/ingame_assets/expanded/toolbox/thumb_farmSlot.png",
  farmEmpty: "/ingame_assets/expanded/toolbox/thumb_farmEmpty.png",
  farmHalf: "/ingame_assets/expanded/toolbox/thumb_farmHalf.png",
  farmFull: "/ingame_assets/expanded/toolbox/thumb_farmFull.png",
  farmPath: "/ingame_assets/expanded/toolbox/thumb_farmPath.png",
  mineTile: "/ingame_assets/expanded/toolbox/thumb_mineTile.png",
  farm2x2: "/ingame_assets/expanded/toolbox/thumb_farm2x2.png",
  poisFarming: "/ingame_assets/expanded/toolbox/thumb_poisFarming.png",
  grasBlumen: "/ingame_assets/expanded/toolbox/thumb_grasBlumen.png",
  taverne: "/ingame_assets/expanded/toolbox/thumb_taverne.png",
  floatingForge: "/ingame_assets/expanded/toolbox/thumb_floatingForge.png",
  farmingChicken: "/ingame_assets/expanded/toolbox/thumb_farmingChicken.png",
  bushTile: "/ingame_assets/expanded/toolbox/thumb_bushTile.png",
};

type BaukastenPanelProps = {
  inventory: Inventory;
  onInventoryReset?: () => void;
  onDebugAddResources?: () => void;
  selectedTileType: AssetKey | null;
  onSelectTile: (type: AssetKey | null) => void;
  eraseMode: boolean;
  onEraseModeChange: (value: boolean) => void;
  selectedIslandId: IslandId;
  windowMode: "expanded" | "compact";
  editSelectedTile?: TileDef | null;
  editGizmoMode?: "translate" | "scale";
  onEditGizmoModeChange?: (mode: "translate" | "scale") => void;
  onEditRotate?: () => void;
  onEditDelete?: () => void;
  onEditCopyScale?: () => void;
  onEditPasteScale?: () => void;
  hasEditClipboard?: boolean;
  editUniformScale?: boolean;
  onEditUniformScaleChange?: (v: boolean) => void;
  onEditToggleBlocked?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  editingDecoration?: boolean;
  onEditingDecorationChange?: (v: boolean) => void;
};

const RESOURCE_LABELS: Record<string, string> = {
  ore: "O", wheat: "W", wood: "H",
};

const RESOURCE_COLORS: Record<string, string> = {
  ore: "#e67e22",
  wheat: "#f1c40f",
  wood: "#8b4513",
};

function CostChips({ cost }: { cost: { resourceId: string; amount: number }[] }) {
  return (
    <div className="baukasten-tile-costs">
      {cost.map((item) => (
        <span
          key={item.resourceId}
          className="baukasten-cost-chip"
          style={{ "--chip-color": RESOURCE_COLORS[item.resourceId] ?? "#6b7a8a" } as React.CSSProperties}
        >
          <span className="baukasten-cost-dot" aria-hidden />
          {item.amount} {RESOURCE_LABELS[item.resourceId] ?? item.resourceId}
        </span>
      ))}
    </div>
  );
}

export const BAUKASTEN_TILES: Array<{ type: AssetKey; label: string }> = [
  { type: "base", label: "Base" },
  { type: "dirt", label: "Dirt" },
  { type: "pathCross", label: "Path X" },
  { type: "pathStraight", label: "Path Straight" },
  { type: "tree1", label: "Tree" },
  { type: "treeMiddle", label: "Tree Mid" },
  { type: "farmSlot", label: "Farm" },
  { type: "mineTile", label: "POIs Mining" },
  { type: "farm2x2", label: "Farm 2x2" },
  { type: "poisFarming", label: "POIs Farm" },
  { type: "grasBlumen", label: "Gras Blumen" },
  { type: "taverne", label: "Taverne" },
  { type: "floatingForge", label: "Forge" },
  { type: "farmingChicken", label: "Chicken" },
  { type: "bushTile", label: "Bush" },
  { type: "statueAaron", label: "Statue" },
];

const RESOURCE_LABELS_FULL: Record<string, string> = {
  ore: "Ore", wheat: "Wheat", wood: "Wood",
};

function formatCostTitle(cost: { resourceId: string; amount: number }[]): string {
  return cost.map((item) => `${item.amount} ${RESOURCE_LABELS_FULL[item.resourceId] ?? item.resourceId}`).join(", ");
}

export function BaukastenPanel({
  inventory,
  onInventoryReset,
  onDebugAddResources,
  selectedTileType,
  onSelectTile,
  eraseMode,
  onEraseModeChange,
  selectedIslandId,
  windowMode,
  editSelectedTile,
  editGizmoMode,
  onEditGizmoModeChange,
  onEditRotate,
  onEditDelete,
  onEditCopyScale,
  onEditPasteScale,
  hasEditClipboard,
  editUniformScale,
  onEditUniformScaleChange,
  onEditToggleBlocked,
  onUndo,
  canUndo = false,
  editingDecoration = false,
  onEditingDecorationChange,
}: BaukastenPanelProps) {
  const visible = selectedIslandId === "custom" && windowMode === "expanded";
  if (!visible) {
    return null;
  }

  const totalResources = (inventory.ore ?? 0) + (inventory.wheat ?? 0) + (inventory.wood ?? 0);
  const hasNoResources = totalResources === 0;
  const resourceSummary = `O:${inventory.ore ?? 0} W:${inventory.wheat ?? 0} H:${inventory.wood ?? 0}`;

  return (
    <div className="baukasten-panel" data-no-window-drag="true">
      <div className="baukasten-header-row">
        <span className="baukasten-resources">{resourceSummary}</span>
        <button
          type="button"
          className={`baukasten-undo-btn${canUndo ? "" : " is-disabled"}`}
          onClick={() => onUndo?.()}
          disabled={!canUndo}
          title="Undo last action"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 3L2 7.5L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2.5 7.5H10.5C12.433 7.5 14 9.067 14 11V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="baukasten-debug-add"
          onClick={() => onDebugAddResources?.()}
          title="+5 Ore, Wheat, Wood (Debug)"
        >
          +5
        </button>
      </div>

      {hasNoResources ? (
        <div className="baukasten-empty-hint">
          <p>No resources. Start Mining, Farming or Roaming to collect resources.</p>
          <button type="button" className="baukasten-reset-btn" onClick={() => onInventoryReset?.()}>
            Load starter resources
          </button>
        </div>
      ) : null}

      <div className="baukasten-palette">
        {BAUKASTEN_TILES.map(({ type: tileType, label }) => {
          const recipe = getTileRecipe(tileType);
          const affordable = recipe ? canAfford(inventory, recipe) : false;
          const isSelected = selectedTileType === tileType;

          return (
            <button
              key={tileType}
              type="button"
              className={`baukasten-tile-btn ${isSelected ? "is-selected" : ""} ${!affordable ? "is-disabled" : ""}`}
              onClick={() => {
                if (eraseMode) {
                  onEraseModeChange(false);
                }
                onSelectTile(isSelected ? null : tileType);
              }}
              disabled={!affordable}
              title={recipe ? `${label} - ${formatCostTitle(recipe)}` : label}
            >
              <div className="baukasten-tile-img-wrap">
                {TOOLBOX_THUMBS[tileType] ? (
                  <img
                    className="baukasten-tile-thumb"
                    src={TOOLBOX_THUMBS[tileType]}
                    alt=""
                  />
                ) : (
                  <span className="baukasten-tile-placeholder" aria-hidden>
                    ?
                  </span>
                )}
              </div>
              {recipe ? <CostChips cost={recipe} /> : null}
            </button>
          );
        })}
      </div>

      {(selectedTileType || eraseMode) ? (
        <div className="baukasten-params">
          <div className="baukasten-mode-hint">
            {eraseMode
              ? "Delete mode active. Click a tile on canvas."
              : `Build mode active: ${selectedTileType ?? "Tile"}`}
          </div>
          <button
            type="button"
            className="baukasten-clear-btn"
            onClick={() => {
              onSelectTile(null);
              onEraseModeChange(false);
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {editSelectedTile && (
        <div className="baukasten-edit-section" data-no-window-drag="true">
          <div className="baukasten-edit-header">
            <span className="baukasten-edit-label">
              {editSelectedTile.type} ({editSelectedTile.gx},{editSelectedTile.gy})
            </span>
          </div>

          {editSelectedTile.decoration && (
            <div className="baukasten-edit-row">
              <button
                type="button"
                className={`baukasten-edit-btn ${!editingDecoration ? "is-active" : ""}`}
                onClick={() => onEditingDecorationChange?.(false)}
                title="Edit tile"
              >
                Tile
              </button>
              <button
                type="button"
                className={`baukasten-edit-btn baukasten-edit-btn--deco ${editingDecoration ? "is-active" : ""}`}
                onClick={() => onEditingDecorationChange?.(true)}
                title="Edit decoration"
              >
                Deko
              </button>
            </div>
          )}

          <div className="baukasten-edit-row">
            <button
              type="button"
              className={`baukasten-edit-btn ${editGizmoMode === "translate" ? "is-active" : ""}`}
              onClick={() => onEditGizmoModeChange?.("translate")}
              title="Move"
            >
              Move
            </button>
            <button
              type="button"
              className={`baukasten-edit-btn ${editGizmoMode === "scale" ? "is-active" : ""}`}
              onClick={() => onEditGizmoModeChange?.("scale")}
              title="Scale"
            >
              Scale
            </button>
            <button
              type="button"
              className="baukasten-edit-btn"
              onClick={() => onEditRotate?.()}
              title="Rotate 90°"
            >
              Rot 90°
            </button>
          </div>

          <div className="baukasten-edit-row">
            <label className="baukasten-edit-checkbox">
              <input
                type="checkbox"
                checked={editUniformScale ?? true}
                onChange={(e) => onEditUniformScaleChange?.(e.target.checked)}
              />
              Uniform
            </label>
          </div>

          <div className="baukasten-edit-row">
            <button
              type="button"
              className="baukasten-edit-btn baukasten-edit-btn--copy"
              onClick={() => onEditCopyScale?.()}
              title="Copy scale & rotation"
            >
              Copy
            </button>
            <button
              type="button"
              className="baukasten-edit-btn baukasten-edit-btn--paste"
              onClick={() => onEditPasteScale?.()}
              disabled={!hasEditClipboard}
              title="Paste scale & rotation"
            >
              Paste
            </button>
            <button
              type="button"
              className="baukasten-edit-btn baukasten-edit-btn--delete"
              onClick={() => onEditDelete?.()}
              title="Delete tile"
            >
              Del
            </button>
          </div>

          <div className="baukasten-edit-row">
            <button
              type="button"
              className={`baukasten-edit-btn ${editSelectedTile.blocked ? "baukasten-edit-btn--unblock" : "baukasten-edit-btn--block"}`}
              onClick={() => onEditToggleBlocked?.()}
              title={editSelectedTile.blocked ? "Unblock tile" : "Block tile"}
            >
              {editSelectedTile.blocked ? "Unblock" : "Block"}
            </button>
          </div>

          {editSelectedTile.scale3d && (
            <div className="baukasten-edit-info" title="Skalierung (X/Y/Z). 1.0 = Originalgröße, 1.5 = 150%">
              S: {editSelectedTile.scale3d.x.toFixed(2)} / {editSelectedTile.scale3d.y.toFixed(2)} / {editSelectedTile.scale3d.z.toFixed(2)}
            </div>
          )}
          {editSelectedTile.rotY != null && (
            <div className="baukasten-edit-info">
              Rot: {((editSelectedTile.rotY * 180) / Math.PI).toFixed(0)}°
            </div>
          )}
        </div>
      )}
    </div>
  );
}
