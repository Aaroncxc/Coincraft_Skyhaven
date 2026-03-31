import { useEffect, useState, type CSSProperties } from "react";
import { canAfford, type Inventory } from "../game/inventory";
import { getTileRecipe } from "../game/resources";
import type { AssetKey, CloneLineState, IslandId, TileDef, TileStackLevel } from "../game/types";

const TOOLBOX_THUMBS: Partial<Record<AssetKey, string>> = {
  base: "/ingame_assets/expanded/toolbox/thumb_base.png",
  grass: "/ingame_assets/expanded/toolbox/thumb_grass.png",
  dirt: "/ingame_assets/Mining_Island_Assets/Dirt_tile.png",
  pathCross: "/ingame_assets/expanded/toolbox/thumb_pathCross.png",
  pathStraight: "/ingame_assets/expanded/toolbox/thumb_pathStraight.png",
  ancientStone: "/ingame_assets/3d/AnicientStone_Tile.png",
  ancientStoneWall: "/ingame_assets/3d/AnicientStoneWall_Tile.png",
  ancientCornerWall: "/ingame_assets/3d/AnicientCornerStoneWall_Tile.png",
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
  statueAaron: "/ingame_assets/3d/Statue_Toolbox_Thumbnail.png",
  torchDecoration: "/ingame_assets/3d/Waffen/Fackel_Inventar_Thumbnail.png",
  magicTower: "/ingame_assets/3d/Magic_Tower.png",
  wellTile: "/ingame_assets/3d/Well_Tile_Round.png",
  well2Tile: "/ingame_assets/3d/Well_Tile_Square.png",
  halfGrownCropTile: "/ingame_assets/3d/Half_grown_Crop_Tile.png",
  cottaTile: "/ingame_assets/3d/Cottn_Tile.png",
  ancientTempleTile: "/ingame_assets/3d/Temple_Tile.png",
  kaserneTile: "/ingame_assets/3d/Kaserne_Tile.png",
  runeTile: "/ingame_assets/3d/Rune_Tile.png",
  airShipPort: "/ingame_assets/3d/Magic_Tower.png",
};

type BaukastenPanelProps = {
  inventory: Inventory;
  onInventoryReset?: () => void;
  onDebugAddResources?: () => void;
  selectedTileType: AssetKey | null;
  onSelectTile: (type: AssetKey | null) => void;
  eraseMode: boolean;
  onEraseModeChange: (value: boolean) => void;
  selectedBuildLayer: TileStackLevel;
  onBuildLayerChange: (value: TileStackLevel) => void;
  selectedIslandId: IslandId;
  windowMode: "expanded" | "compact";
  editSelectedTile?: TileDef | null;
  editGizmoMode?: "translate" | "scale";
  onEditGizmoModeChange?: (mode: "translate" | "scale") => void;
  onEditRotate?: () => void;
  onEditDelete?: () => void;
  onEditCopyScale?: () => void;
  editUniformScale?: boolean;
  onEditUniformScaleChange?: (v: boolean) => void;
  onEditToggleBlocked?: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
  editingDecoration?: boolean;
  onEditingDecorationChange?: (v: boolean) => void;
  cloneState?: CloneLineState | null;
  cloneEligible?: boolean;
  cloneDisabledReason?: string | null;
};

const RESOURCE_LABELS: Record<string, string> = {
  ore: "O", wheat: "W", wood: "H",
};

const RESOURCE_COLORS: Record<string, string> = {
  ore: "#e67e22",
  wheat: "#f1c40f",
  wood: "#8b4513",
};

type BaukastenTileEntry = {
  type: AssetKey;
  label: string;
};

type BaukastenCategoryId = "ground_paths" | "nature" | "farming_pois" | "buildings" | "decor";

type BaukastenCategory = {
  id: BaukastenCategoryId;
  label: string;
  tiles: BaukastenTileEntry[];
};

function CostChips({ cost }: { cost: { resourceId: string; amount: number }[] }) {
  return (
    <div className="baukasten-tile-costs">
      {cost.map((item) => (
        <span
          key={item.resourceId}
          className="baukasten-cost-chip"
          style={{ "--chip-color": RESOURCE_COLORS[item.resourceId] ?? "#6b7a8a" } as CSSProperties}
        >
          <span className="baukasten-cost-dot" aria-hidden />
          {item.amount} {RESOURCE_LABELS[item.resourceId] ?? item.resourceId}
        </span>
      ))}
    </div>
  );
}

const DEFAULT_BAUKASTEN_CATEGORY_ID: BaukastenCategoryId = "ground_paths";

export const BAUKASTEN_CATEGORIES: BaukastenCategory[] = [
  {
    id: "ground_paths",
    label: "Boden & Wege",
    tiles: [
      { type: "grass", label: "Grass" },
      { type: "dirt", label: "Dirt" },
      { type: "pathCross", label: "Path X" },
      { type: "pathStraight", label: "Path Straight" },
      { type: "ancientStone", label: "Ancient Stone" },
      { type: "ancientStoneWall", label: "Ancient Stone Wall" },
      { type: "ancientCornerWall", label: "Ancient Corner Wall" },
      { type: "grasBlumen", label: "Gras Blumen" },
    ],
  },
  {
    id: "nature",
    label: "Natur",
    tiles: [
      { type: "tree1", label: "Tree" },
      { type: "treeMiddle", label: "Tree Mid" },
      { type: "bushTile", label: "Bush" },
      { type: "farmingChicken", label: "Chicken" },
    ],
  },
  {
    id: "farming_pois",
    label: "Farming & POIs",
    tiles: [
      { type: "mineTile", label: "POIs Mining" },
      { type: "farm2x2", label: "Farm 2x2" },
      { type: "poisFarming", label: "POIs Farm" },
      { type: "halfGrownCropTile", label: "Half-grown Crop" },
    ],
  },
  {
    id: "buildings",
    label: "Gebäude",
    tiles: [
      { type: "taverne", label: "Taverne" },
      { type: "floatingForge", label: "Forge" },
      { type: "magicTower", label: "Magic Tower" },
      { type: "wellTile", label: "Well" },
      { type: "well2Tile", label: "Well (Square)" },
      { type: "cottaTile", label: "Cotta" },
      { type: "ancientTempleTile", label: "Ancient Temple" },
      { type: "kaserneTile", label: "Kaserne" },
      { type: "runeTile", label: "Rune" },
      { type: "airShipPort", label: "Airship Dock" },
    ],
  },
  {
    id: "decor",
    label: "Deko",
    tiles: [
      { type: "statueAaron", label: "Statue" },
      { type: "torchDecoration", label: "Fackel" },
    ],
  },
];

const TILE_TO_CATEGORY: Partial<Record<AssetKey, BaukastenCategoryId>> = BAUKASTEN_CATEGORIES.reduce(
  (map, category) => {
    for (const tile of category.tiles) {
      map[tile.type] = category.id;
    }
    return map;
  },
  {} as Partial<Record<AssetKey, BaukastenCategoryId>>,
);

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
  selectedBuildLayer,
  onBuildLayerChange,
  selectedIslandId,
  windowMode,
  onUndo,
  canUndo = false,
}: BaukastenPanelProps) {
  const visible = selectedIslandId === "custom" && windowMode === "expanded";
  const [activeCategoryId, setActiveCategoryId] = useState<BaukastenCategoryId>(DEFAULT_BAUKASTEN_CATEGORY_ID);

  useEffect(() => {
    if (!selectedTileType) {
      return;
    }
    const matchingCategoryId = TILE_TO_CATEGORY[selectedTileType];
    if (matchingCategoryId) {
      setActiveCategoryId(matchingCategoryId);
    }
  }, [selectedTileType]);

  const totalResources = (inventory.ore ?? 0) + (inventory.wheat ?? 0) + (inventory.wood ?? 0);
  const hasNoResources = totalResources === 0;
  const resourceSummary = `O:${inventory.ore ?? 0} W:${inventory.wheat ?? 0} H:${inventory.wood ?? 0}`;
  const activeCategory =
    BAUKASTEN_CATEGORIES.find((category) => category.id === activeCategoryId) ?? BAUKASTEN_CATEGORIES[0];

  if (!visible) {
    return null;
  }

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

      <div className="baukasten-tabs" role="tablist" aria-label="Toolbox categories">
        {BAUKASTEN_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            role="tab"
            id={`baukasten-tab-${category.id}`}
            aria-controls={`baukasten-panel-${category.id}`}
            aria-selected={activeCategoryId === category.id}
            className={`baukasten-tab${activeCategoryId === category.id ? " is-active" : ""}`}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="baukasten-layer-block">
        <div className="baukasten-layer-header">
          <span className="baukasten-layer-label">Layer</span>
          <span className="baukasten-layer-hint">{selectedBuildLayer === 0 ? "Ground slot" : "Upper slot"}</span>
        </div>
        <div className="baukasten-layer-toggle" role="group" aria-label="Tile layer">
          <button
            type="button"
            className={`baukasten-layer-btn${selectedBuildLayer === 0 ? " is-active" : ""}`}
            onClick={() => onBuildLayerChange(0)}
          >
            Ground
          </button>
          <button
            type="button"
            className={`baukasten-layer-btn${selectedBuildLayer === 1 ? " is-active" : ""}`}
            onClick={() => onBuildLayerChange(1)}
          >
            Upper
          </button>
        </div>
      </div>

      <div
        className="baukasten-palette"
        role="tabpanel"
        id={`baukasten-panel-${activeCategory.id}`}
        aria-labelledby={`baukasten-tab-${activeCategory.id}`}
      >
        {activeCategory.tiles.map(({ type: tileType, label }) => {
          const recipe = getTileRecipe(tileType);
          const affordable = recipe ? canAfford(inventory, recipe) : false;
          const isSelected = selectedTileType === tileType;

          return (
            <button
              key={tileType}
              type="button"
              data-tile-type={tileType}
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
              ? `Delete mode active on ${selectedBuildLayer === 0 ? "ground" : "upper"} layer.`
              : `Build mode active on ${selectedBuildLayer === 0 ? "ground" : "upper"} layer: ${selectedTileType ?? "Tile"}`}
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

    </div>
  );
}
