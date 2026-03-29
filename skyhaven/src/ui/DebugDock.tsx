import { useMemo, useState } from "react";
import type { IslandLightingAmbiance, IslandLightingParams } from "../game/three/islandLighting";
import {
  DEFAULT_DAY_NIGHT_CYCLE_PERIOD_SEC,
  DEFAULT_ISLAND_LIGHTING,
  NIGHT_ISLAND_LIGHTING,
} from "../game/three/islandLighting";
import type { TileDef } from "../game/types";

export type DebugSurfaceScope = "all" | "sameType" | "selection";
export type DebugSurfaceVizMode = "single" | "audit" | "off";

type DebugDockSection = "tile" | "audit" | "lighting" | "session";

export type DebugDockProps = {
  selectedTile: TileDef | null;
  debugPlacementType: string | null;
  onDebugPlacementTypeChange: (type: string | null) => void;
  surfaceVizMode: DebugSurfaceVizMode;
  onSurfaceVizModeChange: (mode: DebugSurfaceVizMode) => void;
  surfaceScope: DebugSurfaceScope;
  onSurfaceScopeChange: (scope: DebugSurfaceScope) => void;
  surfaceTypeFilter: string | null;
  surfaceTypeOptions: string[];
  onSurfaceTypeFilterChange: (type: string | null) => void;
  surfaceValue: number;
  surfaceValueMixed: boolean;
  surfaceTargetCount: number;
  surfaceVisibleCount: number;
  batchSelectionCount: number;
  batchPickMode: boolean;
  onBatchPickModeChange: (value: boolean) => void;
  onSurfaceChangeStart: () => void;
  onSurfaceChange: (value: number) => void;
  onSurfaceChangeEnd: () => void;
  onResetSurfaceToAuto: () => void;
  onMatchSelectedSurface: () => void;
  onClearBatchSelection: () => void;
  onAddSameTypeToBatchSelection: () => void;
  onSelectAllBatchTiles: () => void;
  onCopyTransform?: () => void;
  onPasteTransform?: () => void;
  hasClipboard?: boolean;
  onSave: () => void;
  onExitDebug: () => void;
  onDeselectTile: () => void;
  onExportJson?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  islandLighting: IslandLightingParams;
  onIslandLightingChange: (next: IslandLightingParams) => void;
  /** Tag- / Nacht-Vorschau: steuert Hintergrundbild (App) und Insel-Beleuchtung. */
  lightingAmbiance?: IslandLightingAmbiance;
  onLightingAmbianceChange?: (next: IslandLightingAmbiance) => void;
  /** Looped day/night from wall clock (disables manual Day/Night while on). */
  autoDayNightCycle?: boolean;
  onAutoDayNightCycleChange?: (enabled: boolean) => void;
  debugShowFps?: boolean;
  onDebugShowFpsChange?: (show: boolean) => void;
  isDragging?: boolean;
};

const WALK_SURFACE_MIN = -0.5;
const WALK_SURFACE_MAX = 2;
const WALK_SURFACE_STEP = 0.01;

const PLACEABLE_TYPES = [
  { key: "grass", label: "Grass" },
  { key: "dirt", label: "Dirt" },
  { key: "pathCross", label: "Path Cross" },
  { key: "pathStraight", label: "Path Straight" },
  { key: "ancientStone", label: "Ancient Stone" },
  { key: "ancientStoneWall", label: "Stone Wall" },
  { key: "ancientCornerWall", label: "Corner Wall" },
  { key: "mine", label: "Mine" },
  { key: "tree", label: "Tree" },
  { key: "treeMiddle", label: "Tree Mid" },
  { key: "farm2x2", label: "Farm 2x2" },
  { key: "poisFarming", label: "Farm POI" },
  { key: "grasBlumen", label: "Grass Flowers" },
  { key: "taverne", label: "Taverne" },
  { key: "floatingForge", label: "Forge" },
  { key: "farmingChicken", label: "Chicken" },
  { key: "torchDecoration", label: "Torch" },
  { key: "magicTower", label: "Magic Tower" },
  { key: "wellTile", label: "Well" },
  { key: "well2Tile", label: "Well Square" },
  { key: "halfGrownCropTile", label: "Half Crop" },
  { key: "cottaTile", label: "Cotta" },
  { key: "ancientTempleTile", label: "Temple" },
  { key: "kaserneTile", label: "Kaserne" },
  { key: "runeTile", label: "Rune" },
] as const;

const shellStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 220,
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 8,
  pointerEvents: "none",
};

const dockStyle: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  width: 58,
  padding: 6,
  borderRadius: 12,
  border: "1px solid rgba(136, 204, 255, 0.28)",
  background: "rgba(10, 14, 22, 0.84)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
};

const dockButtonBase: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  borderRadius: 8,
  border: "1px solid rgba(136, 204, 255, 0.18)",
  background: "rgba(38, 48, 68, 0.72)",
  color: "#8fa6bc",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.16s ease",
};

const panelStyle: React.CSSProperties = {
  pointerEvents: "auto",
  width: 332,
  maxHeight: "calc(100vh - 24px)",
  overflowY: "auto",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(136, 204, 255, 0.24)",
  background: "rgba(15, 20, 30, 0.88)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 10px 34px rgba(0,0,0,0.36)",
  color: "#dce8f2",
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 11,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(136, 204, 255, 0.16)",
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  color: "#88ccff",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 12,
};

const sectionTitleStyle: React.CSSProperties = {
  marginBottom: 6,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "#7fbfe8",
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 4,
  color: "#93a8bc",
};

const valueStyle: React.CSSProperties = {
  color: "#dce8f2",
  fontFamily: "monospace",
};

const actionButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 30,
  borderRadius: 8,
  border: "1px solid rgba(136, 204, 255, 0.18)",
  background: "rgba(43, 58, 80, 0.72)",
  color: "#dce8f2",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const mutedButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(34, 42, 58, 0.82)",
  color: "#a4b6c8",
};

const primaryButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(80, 170, 255, 0.2)",
  border: "1px solid rgba(80, 170, 255, 0.36)",
  color: "#9fd9ff",
};

const warningButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(255, 164, 59, 0.18)",
  border: "1px solid rgba(255, 164, 59, 0.34)",
  color: "#ffc57b",
};

const dangerButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: "rgba(255, 84, 84, 0.18)",
  border: "1px solid rgba(255, 84, 84, 0.32)",
  color: "#ff8b8b",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 6,
};

const segmentButtonStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 30,
  borderRadius: 8,
  border: "1px solid rgba(136, 204, 255, 0.18)",
  background: "rgba(34, 44, 60, 0.82)",
  color: "#8fa6bc",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const rangeStyle: React.CSSProperties = {
  width: "100%",
  marginBottom: 6,
  accentColor: "#88ccff",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 32,
  borderRadius: 8,
  border: "1px solid rgba(136, 204, 255, 0.2)",
  background: "rgba(20, 26, 36, 0.9)",
  color: "#dce8f2",
  padding: "0 10px",
  boxSizing: "border-box",
};

const chipWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

function fmt(n: number): string {
  return n.toFixed(2);
}

function sliderLabel(): React.CSSProperties {
  return {
    ...infoRowStyle,
    marginBottom: 3,
    color: "#93a8bc",
  };
}

export function DebugDock({
  selectedTile,
  debugPlacementType,
  onDebugPlacementTypeChange,
  surfaceVizMode,
  onSurfaceVizModeChange,
  surfaceScope,
  onSurfaceScopeChange,
  surfaceTypeFilter,
  surfaceTypeOptions,
  onSurfaceTypeFilterChange,
  surfaceValue,
  surfaceValueMixed,
  surfaceTargetCount,
  surfaceVisibleCount,
  batchSelectionCount,
  batchPickMode,
  onBatchPickModeChange,
  onSurfaceChangeStart,
  onSurfaceChange,
  onSurfaceChangeEnd,
  onResetSurfaceToAuto,
  onMatchSelectedSurface,
  onClearBatchSelection,
  onAddSameTypeToBatchSelection,
  onSelectAllBatchTiles,
  onCopyTransform,
  onPasteTransform,
  hasClipboard = false,
  onSave,
  onExitDebug,
  onDeselectTile,
  onExportJson,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  islandLighting,
  onIslandLightingChange,
  lightingAmbiance = "day",
  onLightingAmbianceChange,
  autoDayNightCycle = false,
  onAutoDayNightCycleChange,
  debugShowFps = false,
  onDebugShowFpsChange,
  isDragging = false,
}: DebugDockProps) {
  const [openSection, setOpenSection] = useState<DebugDockSection | null>(null);

  const wrapperStyle = useMemo<React.CSSProperties>(
    () => ({
      ...shellStyle,
      opacity: isDragging ? 0.15 : 1,
    }),
    [isDragging],
  );

  const disabledInteraction = isDragging ? { pointerEvents: "none" as const } : undefined;

  const patchLighting = (key: keyof IslandLightingParams, value: number) => {
    onIslandLightingChange({ ...islandLighting, [key]: value });
  };

  const renderSegment = (
    value: string,
    active: boolean,
    onClick: () => void,
  ) => (
    <button
      key={value}
      type="button"
      onClick={onClick}
      style={{
        ...segmentButtonStyle,
        ...(active
          ? {
              background: "rgba(136, 204, 255, 0.18)",
              border: "1px solid rgba(136, 204, 255, 0.4)",
              color: "#d7f2ff",
            }
          : null),
      }}
    >
      {value}
    </button>
  );

  return (
    <div style={wrapperStyle} data-no-window-drag="true">
      {openSection ? (
        <div style={{ ...panelStyle, ...disabledInteraction }}>
          <div style={headerStyle}>
            <div>
              <div style={titleStyle}>Debug Dock</div>
              <div style={{ fontSize: 10, color: "#6f869b" }}>
                {selectedTile ? `${selectedTile.type} @ ${selectedTile.gx},${selectedTile.gy}` : "No tile selected"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenSection(null)}
              style={{ ...mutedButtonStyle, width: 34, minHeight: 28, padding: 0 }}
            >
              x
            </button>
          </div>

          {onDebugShowFpsChange ? (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0 10px",
                fontSize: 11,
                color: "#b8c8d8",
                cursor: "pointer",
                borderBottom: "1px solid rgba(136, 204, 255, 0.12)",
                marginBottom: 8,
              }}
            >
              <input
                type="checkbox"
                checked={debugShowFps}
                onChange={(e) => onDebugShowFpsChange(e.target.checked)}
              />
              <span>Show FPS (top right)</span>
            </label>
          ) : null}

          {openSection === "tile" ? (
            <>
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Tile</div>
                {selectedTile ? (
                  <>
                    <div style={infoRowStyle}>
                      <span>Type</span>
                      <span style={valueStyle}>{selectedTile.type}</span>
                    </div>
                    <div style={infoRowStyle}>
                      <span>Grid</span>
                      <span style={valueStyle}>
                        {selectedTile.gx}, {selectedTile.gy}
                      </span>
                    </div>
                    <div style={infoRowStyle}>
                      <span>Blocked</span>
                      <span style={valueStyle}>{selectedTile.blocked ? "Yes" : "No"}</span>
                    </div>
                    <div style={rowStyle}>
                      <button type="button" onClick={onCopyTransform} style={mutedButtonStyle}>
                        Copy Transform
                      </button>
                      <button
                        type="button"
                        onClick={onPasteTransform}
                        disabled={!hasClipboard}
                        style={
                          hasClipboard
                            ? mutedButtonStyle
                            : { ...mutedButtonStyle, opacity: 0.45, cursor: "default" }
                        }
                      >
                        Paste Transform
                      </button>
                    </div>
                    <button type="button" onClick={onDeselectTile} style={mutedButtonStyle}>
                      Deselect Tile
                    </button>
                  </>
                ) : (
                  <div style={{ color: "#73879b" }}>Click a tile in the scene to inspect it.</div>
                )}
              </div>

              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Add Tile</div>
                <div style={chipWrapStyle}>
                  {PLACEABLE_TYPES.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      onClick={() =>
                        onDebugPlacementTypeChange(debugPlacementType === tile.key ? null : tile.key)
                      }
                      style={{
                        ...segmentButtonStyle,
                        flex: "0 0 auto",
                        padding: "0 8px",
                        minHeight: 28,
                        ...(debugPlacementType === tile.key
                          ? {
                              background: "rgba(136, 204, 255, 0.2)",
                              border: "1px solid rgba(136, 204, 255, 0.42)",
                              color: "#d8f6ff",
                            }
                          : null),
                      }}
                    >
                      {tile.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {openSection === "audit" ? (
            <>
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Visualization</div>
                <div style={rowStyle}>
                  {renderSegment("Single", surfaceVizMode === "single", () => onSurfaceVizModeChange("single"))}
                  {renderSegment("Audit", surfaceVizMode === "audit", () => onSurfaceVizModeChange("audit"))}
                  {renderSegment("Off", surfaceVizMode === "off", () => onSurfaceVizModeChange("off"))}
                </div>
                <div style={infoRowStyle}>
                  <span>Visible planes</span>
                  <span style={valueStyle}>{surfaceVizMode === "audit" ? surfaceVisibleCount : selectedTile ? 1 : 0}</span>
                </div>
                <div style={infoRowStyle}>
                  <span>Target tiles</span>
                  <span style={valueStyle}>{surfaceTargetCount}</span>
                </div>
              </div>

              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Audit Scope</div>
                <div style={rowStyle}>
                  {renderSegment("All", surfaceScope === "all", () => onSurfaceScopeChange("all"))}
                  {renderSegment("Same Type", surfaceScope === "sameType", () => onSurfaceScopeChange("sameType"))}
                  {renderSegment("Selection", surfaceScope === "selection", () => onSurfaceScopeChange("selection"))}
                </div>
                <div style={sliderLabel()}>
                  <span>Type filter</span>
                  <span style={valueStyle}>{surfaceTypeFilter ?? "All Types"}</span>
                </div>
                <select
                  value={surfaceTypeFilter ?? "__all__"}
                  onChange={(event) =>
                    onSurfaceTypeFilterChange(event.target.value === "__all__" ? null : event.target.value)
                  }
                  disabled={surfaceScope !== "all"}
                  style={
                    surfaceScope === "all"
                      ? selectStyle
                      : { ...selectStyle, opacity: 0.55, cursor: "default" }
                  }
                >
                  <option value="__all__">All Types</option>
                  {surfaceTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Live Surface</div>
                <div style={sliderLabel()}>
                  <span>Current value</span>
                  <span style={valueStyle}>
                    {surfaceValueMixed ? `Mixed (${fmt(surfaceValue)})` : fmt(surfaceValue)}
                  </span>
                </div>
                <input
                  type="range"
                  min={WALK_SURFACE_MIN}
                  max={WALK_SURFACE_MAX}
                  step={WALK_SURFACE_STEP}
                  value={surfaceValue}
                  onFocus={onSurfaceChangeStart}
                  onBlur={onSurfaceChangeEnd}
                  onPointerDown={onSurfaceChangeStart}
                  onPointerUp={onSurfaceChangeEnd}
                  onPointerCancel={onSurfaceChangeEnd}
                  onChange={(event) => onSurfaceChange(Number(event.target.value))}
                  style={rangeStyle}
                />
                <div style={rowStyle}>
                  <button
                    type="button"
                    onClick={onMatchSelectedSurface}
                    style={primaryButtonStyle}
                    disabled={!selectedTile || surfaceTargetCount === 0}
                  >
                    Match Selected
                  </button>
                  <button
                    type="button"
                    onClick={onResetSurfaceToAuto}
                    style={warningButtonStyle}
                    disabled={surfaceTargetCount === 0}
                  >
                    Reset Auto
                  </button>
                </div>
              </div>

              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Selection Helpers</div>
                <button
                  type="button"
                  onClick={() => onBatchPickModeChange(!batchPickMode)}
                  style={batchPickMode ? warningButtonStyle : mutedButtonStyle}
                >
                  {batchPickMode ? "Batch Pick Active" : "Enable Batch Pick"}
                </button>
                <div style={{ marginTop: 6, color: "#73879b" }}>
                  In manual selection scope, clicking tiles toggles them into the batch set.
                </div>
                <div style={{ ...infoRowStyle, marginTop: 6 }}>
                  <span>Manual selection</span>
                  <span style={valueStyle}>{batchSelectionCount}</span>
                </div>
                <div style={rowStyle}>
                  <button type="button" onClick={onClearBatchSelection} style={mutedButtonStyle}>
                    Clear
                  </button>
                  <button type="button" onClick={onAddSameTypeToBatchSelection} style={mutedButtonStyle}>
                    Add Same Type
                  </button>
                </div>
                <button type="button" onClick={onSelectAllBatchTiles} style={mutedButtonStyle}>
                  Select All Tiles
                </button>
              </div>
            </>
          ) : null}

          {openSection === "lighting" ? (
            <>
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Lighting</div>
                <button
                  type="button"
                  onClick={() => onIslandLightingChange({ ...DEFAULT_ISLAND_LIGHTING })}
                  style={mutedButtonStyle}
                >
                  Reset Lighting
                </button>
                {onLightingAmbianceChange ? (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...infoRowStyle, marginBottom: 6, color: "#88ccff" }}>
                      <span>Time of day</span>
                    </div>
                    {onAutoDayNightCycleChange ? (
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                          fontSize: 11,
                          color: "#b8c8d8",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={autoDayNightCycle}
                          onChange={(e) => onAutoDayNightCycleChange(e.target.checked)}
                        />
                        <span>
                          Auto day/night ({Math.round(DEFAULT_DAY_NIGHT_CYCLE_PERIOD_SEC / 60)} min loop)
                        </span>
                      </label>
                    ) : null}
                    <div
                      style={{
                        ...rowStyle,
                        flexWrap: "wrap",
                        opacity: autoDayNightCycle ? 0.45 : 1,
                        pointerEvents: autoDayNightCycle ? "none" : undefined,
                      }}
                    >
                      {renderSegment("Day", lightingAmbiance === "day" && !autoDayNightCycle, () => {
                        onAutoDayNightCycleChange?.(false);
                        onLightingAmbianceChange("day");
                        onIslandLightingChange({
                          ...DEFAULT_ISLAND_LIGHTING,
                          dayLightWarmth:
                            islandLighting.dayLightWarmth ?? DEFAULT_ISLAND_LIGHTING.dayLightWarmth,
                        });
                      })}
                      {renderSegment("Night", lightingAmbiance === "night" && !autoDayNightCycle, () => {
                        onAutoDayNightCycleChange?.(false);
                        onLightingAmbianceChange("night");
                        onIslandLightingChange({
                          ...NIGHT_ISLAND_LIGHTING,
                          dayLightWarmth:
                            islandLighting.dayLightWarmth ?? DEFAULT_ISLAND_LIGHTING.dayLightWarmth,
                        });
                      })}
                    </div>
                    {autoDayNightCycle ? (
                      <div style={{ fontSize: 10, color: "#6f869b", marginTop: 4 }}>
                        Turn off auto or pick Day/Night to edit manual time.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {[
                [
                  "Day warmth",
                  islandLighting.dayLightWarmth ?? DEFAULT_ISLAND_LIGHTING.dayLightWarmth,
                  0,
                  1,
                  0.02,
                  "dayLightWarmth",
                ],
                ["Sun azimuth", islandLighting.sunAzimuthDeg, 0, 360, 1, "sunAzimuthDeg"],
                ["Sun elevation", islandLighting.sunElevationDeg, 5, 88, 0.5, "sunElevationDeg"],
                ["Sun distance", islandLighting.sunDistance, 5, 80, 0.25, "sunDistance"],
                ["Sun intensity", islandLighting.sunIntensity, 0, 6, 0.05, "sunIntensity"],
                ["Ambient", islandLighting.ambientIntensity, 0, 0.5, 0.01, "ambientIntensity"],
                ["Hemisphere", islandLighting.hemisphereIntensity, 0, 1, 0.01, "hemisphereIntensity"],
                ["Fill", islandLighting.fillIntensity, 0, 1, 0.01, "fillIntensity"],
                ["Environment", islandLighting.environmentIntensity, 0, 1, 0.01, "environmentIntensity"],
              ].map(([label, value, min, max, step, key]) => (
                <div key={String(key)} style={sectionStyle}>
                  <div style={sliderLabel()}>
                    <span>{label}</span>
                    <span style={valueStyle}>{Number(value).toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={Number(min)}
                    max={Number(max)}
                    step={Number(step)}
                    value={Number(value)}
                    onChange={(event) =>
                      patchLighting(key as keyof IslandLightingParams, Number(event.target.value))
                    }
                    style={rangeStyle}
                  />
                </div>
              ))}
            </>
          ) : null}

          {openSection === "session" ? (
            <>
              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>History</div>
                <div style={rowStyle}>
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    style={
                      canUndo ? mutedButtonStyle : { ...mutedButtonStyle, opacity: 0.45, cursor: "default" }
                    }
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={onRedo}
                    disabled={!canRedo}
                    style={
                      canRedo ? mutedButtonStyle : { ...mutedButtonStyle, opacity: 0.45, cursor: "default" }
                    }
                  >
                    Redo
                  </button>
                </div>
              </div>

              <div style={sectionStyle}>
                <div style={sectionTitleStyle}>Session</div>
                <button type="button" onClick={onSave} style={primaryButtonStyle}>
                  Save Changes
                </button>
                {onExportJson ? (
                  <div style={{ marginTop: 6 }}>
                    <button type="button" onClick={onExportJson} style={mutedButtonStyle}>
                      Export JSON
                    </button>
                  </div>
                ) : null}
                <div style={{ marginTop: 6 }}>
                  <button type="button" onClick={onExitDebug} style={dangerButtonStyle}>
                    Exit Debug
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div style={{ ...dockStyle, ...disabledInteraction }}>
        {([
          ["tile", "Tile"],
          ["audit", "Audit"],
          ["lighting", "Light"],
          ["session", "Save"],
        ] as Array<[DebugDockSection, string]>).map(([section, label]) => (
          <button
            key={section}
            type="button"
            title={section}
            onClick={() => setOpenSection((current) => (current === section ? null : section))}
            style={{
              ...dockButtonBase,
              ...(openSection === section
                ? {
                    background: "rgba(136, 204, 255, 0.18)",
                    border: "1px solid rgba(136, 204, 255, 0.4)",
                    color: "#e3f7ff",
                  }
                : null),
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
