import { useCallback, useState } from "react";
import type { IslandLightingParams } from "../game/three/islandLighting";
import { DEFAULT_ISLAND_LIGHTING } from "../game/three/islandLighting";
import type { TileDef } from "../game/types";

export type DebugPanelProps = {
  selectedTile: TileDef | null;
  gizmoMode: "translate" | "scale";
  onGizmoModeChange: (mode: "translate" | "scale") => void;
  onSave: () => void;
  onExitDebug: () => void;
  onDeselectTile: () => void;
  onDeleteTile: () => void;
  onRotateTile: () => void;
  debugPlacementType: string | null;
  onDebugPlacementTypeChange: (type: string | null) => void;
  isDragging?: boolean;
  uniformScale?: boolean;
  onUniformScaleChange?: (v: boolean) => void;
  onExportJson?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCopyTransform?: () => void;
  onPasteTransform?: () => void;
  hasClipboard?: boolean;
  onToggleBlocked?: () => void;
  islandLighting: IslandLightingParams;
  onIslandLightingChange: (next: IslandLightingParams) => void;
};

const panelBaseStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 200,
  background: "rgba(15, 20, 30, 0.72)",
  border: "1px solid rgba(136, 204, 255, 0.3)",
  borderRadius: 8,
  padding: "6px 10px",
  minWidth: 170,
  maxHeight: "calc(100vh - 24px)",
  overflowY: "auto" as const,
  color: "#e8ecf0",
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: 11,
  pointerEvents: "auto" as const,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(136, 204, 255, 0.08)",
  transition: "opacity 0.25s ease, transform 0.25s ease",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 5,
  paddingBottom: 4,
  borderBottom: "1px solid rgba(136, 204, 255, 0.2)",
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 12,
  color: "#88ccff",
  letterSpacing: 0.5,
};

const btnGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 5,
};

const btnBase: React.CSSProperties = {
  flex: 1,
  padding: "3px 7px",
  border: "1px solid rgba(136, 204, 255, 0.3)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 600,
  transition: "all 0.15s ease",
};

const btnInactive: React.CSSProperties = {
  ...btnBase,
  background: "rgba(40, 50, 70, 0.6)",
  color: "#8899aa",
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  background: "rgba(136, 204, 255, 0.2)",
  color: "#88ccff",
  borderColor: "#88ccff",
};

const actionBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 600,
  marginBottom: 4,
};

const saveBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: "rgba(80, 200, 120, 0.25)",
  color: "#50c878",
  border: "1px solid rgba(80, 200, 120, 0.4)",
};

const deleteBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: "rgba(255, 80, 80, 0.2)",
  color: "#ff6666",
  border: "1px solid rgba(255, 80, 80, 0.3)",
};

const exportBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: "rgba(80, 140, 255, 0.2)",
  color: "#6eaaff",
  border: "1px solid rgba(80, 140, 255, 0.35)",
};

const exitBtnStyle: React.CSSProperties = {
  ...actionBtnStyle,
  background: "rgba(255, 80, 80, 0.2)",
  color: "#ff6666",
  border: "1px solid rgba(255, 80, 80, 0.3)",
  marginBottom: 0,
};

const PLACEABLE_TYPES = [
  { key: "grass", label: "Grass" },
  { key: "dirt", label: "Dirt" },
  { key: "pathCross", label: "Path Cross" },
  { key: "pathStraight", label: "Path Straight" },
  { key: "ancientStone", label: "Ancient Stone" },
  { key: "ancientStoneWall", label: "Ancient Stone Wall" },
  { key: "ancientCornerWall", label: "Ancient Corner Wall" },
  { key: "mine", label: "Mine" },
  { key: "tree", label: "Tree" },
  { key: "treeMiddle", label: "Tree Mid" },
  { key: "farm2x2", label: "Farm 2x2" },
  { key: "poisFarming", label: "POIs Farm" },
  { key: "grasBlumen", label: "Gras Blumen" },
  { key: "taverne", label: "Taverne" },
  { key: "floatingForge", label: "Forge" },
  { key: "farmingChicken", label: "Chicken" },
  { key: "magicTower", label: "Magic Tower" },
  { key: "wellTile", label: "Well" },
  { key: "well2Tile", label: "Well (Square)" },
  { key: "halfGrownCropTile", label: "Half-grown Crop" },
  { key: "cottaTile", label: "Cotta" },
  { key: "ancientTempleTile", label: "Ancient Temple" },
  { key: "runeTile", label: "Rune" },
];

const tilePaletteBtnBase: React.CSSProperties = {
  padding: "2px 6px",
  border: "1px solid rgba(136, 204, 255, 0.2)",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 9,
  fontWeight: 500,
  background: "rgba(40, 50, 70, 0.5)",
  color: "#8899aa",
  transition: "all 0.15s ease",
};

const tilePaletteBtnActive: React.CSSProperties = {
  ...tilePaletteBtnBase,
  background: "rgba(136, 204, 255, 0.2)",
  color: "#88ccff",
  borderColor: "#88ccff",
};

const infoRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 10,
  color: "#8899aa",
  marginBottom: 2,
};

const valStyle: React.CSSProperties = {
  color: "#c8d8e8",
  fontFamily: "monospace",
  fontSize: 10,
};

function fmt(n: number): string {
  return n.toFixed(2);
}

export function DebugPanel({
  selectedTile,
  gizmoMode,
  onGizmoModeChange,
  onSave,
  onExitDebug,
  onDeselectTile,
  onDeleteTile,
  onRotateTile,
  debugPlacementType,
  onDebugPlacementTypeChange,
  isDragging = false,
  uniformScale = true,
  onUniformScaleChange,
  onExportJson,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onCopyTransform,
  onPasteTransform,
  hasClipboard = false,
  onToggleBlocked,
  islandLighting,
  onIslandLightingChange,
}: DebugPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const patchLighting = useCallback(
    (key: keyof IslandLightingParams, value: number) => {
      onIslandLightingChange({ ...islandLighting, [key]: value });
    },
    [islandLighting, onIslandLightingChange],
  );

  const lightingSectionStyle: React.CSSProperties = {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px solid rgba(136, 204, 255, 0.15)",
  };

  const sliderLabelStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
    fontSize: 10,
    color: "#8899aa",
  };

  const rangeStyle: React.CSSProperties = {
    width: "100%",
    marginBottom: 4,
    accentColor: "#88ccff",
  };

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 200,
    pointerEvents: "none",
    transform: collapsed ? "translateX(calc(100% + 8px))" : "translateX(0)",
    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  const innerStyle: React.CSSProperties = {
    ...panelBaseStyle,
    position: "relative" as const,
    top: "auto",
    right: "auto",
    opacity: isDragging ? 0.15 : 1,
    pointerEvents: isDragging ? "none" as const : "auto" as const,
    transition: "opacity 0.25s ease",
  };

  const collapseTabStyle: React.CSSProperties = {
    position: "absolute",
    left: -28,
    top: 0,
    width: 24,
    height: 48,
    background: "rgba(15, 20, 30, 0.82)",
    border: "1px solid rgba(136, 204, 255, 0.3)",
    borderRight: "none",
    borderRadius: "6px 0 0 6px",
    color: "#88ccff",
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    transition: "background 0.15s ease",
  };

  return (
    <div className="debug-panel-shell" style={wrapperStyle} data-no-window-drag="true">
      <div
        className="debug-panel-collapse-tab"
        style={collapseTabStyle}
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand Debug Panel" : "Collapse Debug Panel"}
      >
        {collapsed ? "◀" : "▶"}
      </div>
      <div className="debug-panel-surface" style={innerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>DEBUG MODE</span>
      </div>

      <div style={lightingSectionStyle}>
        <div style={{ ...infoRowStyle, marginBottom: 4, color: "#88ccff" }}>
          <span>Island lighting</span>
          <button
            type="button"
            className="debug-panel-btn"
            onClick={() => onIslandLightingChange({ ...DEFAULT_ISLAND_LIGHTING })}
            style={{
              ...btnInactive,
              padding: "2px 6px",
              fontSize: 9,
            }}
          >
            Reset
          </button>
        </div>
        <div style={sliderLabelStyle}>
          <span>Sun azimuth (°)</span>
          <span style={valStyle}>{islandLighting.sunAzimuthDeg.toFixed(0)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={islandLighting.sunAzimuthDeg}
          onChange={(e) => patchLighting("sunAzimuthDeg", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Sun elevation (°)</span>
          <span style={valStyle}>{islandLighting.sunElevationDeg.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={5}
          max={88}
          step={0.5}
          value={islandLighting.sunElevationDeg}
          onChange={(e) => patchLighting("sunElevationDeg", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Sun distance</span>
          <span style={valStyle}>{islandLighting.sunDistance.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={5}
          max={80}
          step={0.25}
          value={islandLighting.sunDistance}
          onChange={(e) => patchLighting("sunDistance", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Sun intensity</span>
          <span style={valStyle}>{islandLighting.sunIntensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={6}
          step={0.05}
          value={islandLighting.sunIntensity}
          onChange={(e) => patchLighting("sunIntensity", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Ambient</span>
          <span style={valStyle}>{islandLighting.ambientIntensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={islandLighting.ambientIntensity}
          onChange={(e) => patchLighting("ambientIntensity", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Hemisphere</span>
          <span style={valStyle}>{islandLighting.hemisphereIntensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={islandLighting.hemisphereIntensity}
          onChange={(e) => patchLighting("hemisphereIntensity", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Fill directional</span>
          <span style={valStyle}>{islandLighting.fillIntensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={islandLighting.fillIntensity}
          onChange={(e) => patchLighting("fillIntensity", Number(e.target.value))}
          style={rangeStyle}
        />
        <div style={sliderLabelStyle}>
          <span>Environment</span>
          <span style={valStyle}>{islandLighting.environmentIntensity.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={islandLighting.environmentIntensity}
          onChange={(e) => patchLighting("environmentIntensity", Number(e.target.value))}
          style={rangeStyle}
        />
      </div>

      {selectedTile ? (
        <div style={btnGroupStyle}>
          <button
            className="debug-panel-btn"
            style={gizmoMode === "translate" ? btnActive : btnInactive}
            onClick={() => onGizmoModeChange("translate")}
          >
            Move
          </button>
          <button
            className="debug-panel-btn"
            style={gizmoMode === "scale" ? btnActive : btnInactive}
            onClick={() => onGizmoModeChange("scale")}
          >
            Scale
          </button>
        </div>
      ) : null}

      <div style={btnGroupStyle}>
        <button
          className="debug-panel-btn"
          style={canUndo ? btnInactive : { ...btnInactive, opacity: 0.35, cursor: "default" }}
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button
          className="debug-panel-btn"
          style={canRedo ? btnInactive : { ...btnInactive, opacity: 0.35, cursor: "default" }}
          onClick={onRedo}
          disabled={!canRedo}
        >
          Redo
        </button>
      </div>

      {selectedTile && gizmoMode === "scale" && (
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 5,
          fontSize: 10,
          color: "#8899aa",
          cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={uniformScale}
            onChange={(e) => onUniformScaleChange?.(e.target.checked)}
            style={{ accentColor: "#88ccff", cursor: "pointer" }}
          />
          Uniform Scale (all axes)
        </label>
      )}

      {selectedTile ? (
        <div style={{ marginBottom: 5 }}>
          <div style={{ ...infoRowStyle, marginBottom: 3, color: "#88ccff" }}>
            <span>Tile: {selectedTile.id}</span>
            <button
              className="debug-panel-btn"
              onClick={onDeselectTile}
              style={{
                background: "none",
                border: "none",
                color: "#8899aa",
                cursor: "pointer",
                fontSize: 11,
                padding: "0 4px",
              }}
            >
              ✕
            </button>
          </div>
          <div style={infoRowStyle}>
            <span>Type</span>
            <span style={valStyle}>{selectedTile.type}</span>
          </div>
          <div style={infoRowStyle}>
            <span>Grid</span>
            <span style={valStyle}>
              ({selectedTile.gx}, {selectedTile.gy})
            </span>
          </div>
          {selectedTile.pos3d && (
            <div style={infoRowStyle}>
              <span>Pos3D</span>
              <span style={valStyle}>
                ({fmt(selectedTile.pos3d.x)}, {fmt(selectedTile.pos3d.y)},{" "}
                {fmt(selectedTile.pos3d.z)})
              </span>
            </div>
          )}
          {selectedTile.scale3d && (
            <div style={infoRowStyle}>
              <span>Scale3D</span>
              <span style={valStyle}>
                ({fmt(selectedTile.scale3d.x)}, {fmt(selectedTile.scale3d.y)},{" "}
                {fmt(selectedTile.scale3d.z)})
              </span>
            </div>
          )}
          {selectedTile.rotY != null && selectedTile.rotY !== 0 && (
            <div style={infoRowStyle}>
              <span>Rotation</span>
              <span style={valStyle}>
                {Math.round((selectedTile.rotY * 180) / Math.PI)}°
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <button
              className="debug-panel-btn"
              style={{
                ...actionBtnStyle,
                flex: 1,
                marginBottom: 0,
                background: "rgba(136, 180, 255, 0.2)",
                color: "#88aaff",
                border: "1px solid rgba(136, 180, 255, 0.3)",
              }}
              onClick={onRotateTile}
            >
              Rotate 90°
            </button>
            <button
              className="debug-panel-btn"
              style={{
                ...deleteBtnStyle,
                flex: 1,
                marginBottom: 0,
              }}
              onClick={onDeleteTile}
            >
              Delete
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            <button
              className="debug-panel-btn"
              style={{
                ...actionBtnStyle,
                flex: 1,
                marginBottom: 0,
                background: "rgba(180, 136, 255, 0.2)",
                color: "#aa88ff",
                border: "1px solid rgba(180, 136, 255, 0.3)",
              }}
              onClick={onCopyTransform}
            >
              Copy Scale
            </button>
            <button
              className="debug-panel-btn"
              style={{
                ...actionBtnStyle,
                flex: 1,
                marginBottom: 0,
                background: hasClipboard ? "rgba(180, 136, 255, 0.2)" : "rgba(40, 50, 70, 0.4)",
                color: hasClipboard ? "#aa88ff" : "#556677",
                border: `1px solid ${hasClipboard ? "rgba(180, 136, 255, 0.3)" : "rgba(60, 70, 90, 0.3)"}`,
                cursor: hasClipboard ? "pointer" : "default",
                opacity: hasClipboard ? 1 : 0.5,
              }}
              onClick={onPasteTransform}
              disabled={!hasClipboard}
            >
              Paste Scale
            </button>
          </div>
          <button
            className="debug-panel-btn"
            style={{
              ...actionBtnStyle,
              marginBottom: 0,
              background: selectedTile.blocked ? "rgba(255, 160, 60, 0.25)" : "rgba(255, 80, 80, 0.15)",
              color: selectedTile.blocked ? "#ffaa44" : "#ff6666",
              border: `1px solid ${selectedTile.blocked ? "rgba(255, 160, 60, 0.4)" : "rgba(255, 80, 80, 0.3)"}`,
            }}
            onClick={onToggleBlocked}
          >
            {selectedTile.blocked ? "Unblock Tile" : "Block Tile"}
          </button>
        </div>
      ) : (
        <div
          style={{
            marginBottom: 5,
            fontSize: 10,
            color: "#667788",
            textAlign: "center",
            padding: "4px 0",
          }}
        >
          Click a tile to select it
        </div>
      )}

      <div
        style={{
          marginBottom: 5,
          paddingTop: 5,
          borderTop: "1px solid rgba(136, 204, 255, 0.15)",
        }}
      >
        <div style={{ fontSize: 10, color: "#8899aa", marginBottom: 4 }}>
          Add Tile (click empty cell)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {PLACEABLE_TYPES.map((t) => (
            <button
              key={t.key}
              className="debug-panel-btn"
              style={debugPlacementType === t.key ? tilePaletteBtnActive : tilePaletteBtnBase}
              onClick={() =>
                onDebugPlacementTypeChange(debugPlacementType === t.key ? null : t.key)
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <button className="debug-panel-btn" style={saveBtnStyle} onClick={onSave}>
        Save Changes
      </button>
      {onExportJson && (
        <button className="debug-panel-btn" style={exportBtnStyle} onClick={onExportJson}>
          Export JSON
        </button>
      )}
      <button className="debug-panel-btn" style={exitBtnStyle} onClick={onExitDebug}>
        Exit Debug
      </button>
      </div>
    </div>
  );
}
