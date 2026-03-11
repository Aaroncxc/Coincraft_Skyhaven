import { useState } from "react";
import { SKYHAVEN_SPRITE_MANIFEST } from "../game/assets";
import { DURATION_OPTIONS } from "../game/session";
import type { ActionType, AssetKey, FocusDuration, IslandId, TileDef } from "../game/types";
import type { Inventory } from "../game/inventory";
import { BaukastenPanel } from "./BaukastenPanel";

export type SidebarSection = "Main Menu" | "Focus Actions" | "Shop" | "Islands" | "Options" | "Toolbox";

type SidebarProps = {
  selectedSection: SidebarSection | null;
  onSelectSection: (section: SidebarSection) => void;
  selectedDuration: FocusDuration;
  onSelectDuration: (duration: FocusDuration) => void;
  activeAction: ActionType | null;
  onStartAction: (action: ActionType) => void;
  selectedIslandId: IslandId;
  islandPreviewById: Record<IslandId, string>;
  islandNameById: Record<IslandId, string>;
  onCycleIsland: (direction: -1 | 1) => void;
  windowMode: "expanded" | "compact";
  inventory: Inventory;
  selectedTileType: AssetKey | null;
  onSelectTile: (type: AssetKey | null) => void;
  eraseMode: boolean;
  onEraseModeChange: (v: boolean) => void;
  onInventoryReset?: () => void;
  onDebugAddResources?: () => void;
  isDragging?: boolean;
  musicEnabled?: boolean;
  onMusicEnabledChange?: (v: boolean) => void;
  musicTrackIndex?: number;
  onMusicPrev?: () => void;
  onMusicNext?: () => void;
  masterVolume?: number;
  onMasterVolumeChange?: (v: number) => void;
  sfxVolume?: number;
  onSfxVolumeChange?: (v: number) => void;
  editSelectedTile?: TileDef | null;
  editGizmoMode?: "translate" | "scale";
  onEditGizmoModeChange?: (mode: "translate" | "scale") => void;
  onEditRotate?: () => void;
  onEditDelete?: () => void;
  onEditToggleBlocked?: () => void;
  onEditCopyScale?: () => void;
  onEditPasteScale?: () => void;
  hasEditClipboard?: boolean;
  editUniformScale?: boolean;
  onEditUniformScaleChange?: (v: boolean) => void;
  onProfileOpen?: () => void;
  onStartPomodoro?: (action: ActionType) => void;
  isPomodoroActive?: boolean;
  pomodoroRound?: number;
  pomodoroTotalRounds?: number;
  pomodoroPhase?: string;
  onDailyQuestsOpen?: () => void;
  onBuildUndo?: () => void;
  buildCanUndo?: boolean;
  editingDecoration?: boolean;
  onEditingDecorationChange?: (v: boolean) => void;
};

type SidebarPanelKind = "main" | "focus" | "shop" | "islands" | "options" | "toolbox";

const ALL_SECTIONS: SidebarSection[] = ["Main Menu", "Focus Actions", "Shop", "Islands", "Options", "Toolbox"];
const ACTIONS: ActionType[] = ["mining", "farming", "roaming", "cooking"];
const MAIN_MENU_ITEMS = ["Profile", "Daily Quests", "Achievements"];
const SHOP_ITEMS = ["Starter Pack", "Boost Booster", "Skin Crate"];

const LABEL_KEYS: Record<SidebarSection, keyof typeof SKYHAVEN_SPRITE_MANIFEST.ui.labels> = {
  "Main Menu": "mainMenu",
  "Focus Actions": "focusActions",
  Shop: "shop",
  Islands: "islands",
  Options: "options",
  Toolbox: "baukasten", // reuses baukasten asset; can add label_toolbox later
};

export function Sidebar({
  selectedSection,
  onSelectSection,
  selectedDuration,
  onSelectDuration,
  activeAction,
  onStartAction,
  selectedIslandId,
  islandPreviewById,
  islandNameById,
  onCycleIsland,
  windowMode,
  inventory,
  selectedTileType,
  onSelectTile,
  eraseMode,
  onEraseModeChange,
  onInventoryReset,
  onDebugAddResources,
  isDragging = false,
  musicEnabled = true,
  onMusicEnabledChange,
  musicTrackIndex = 0,
  onMusicPrev,
  onMusicNext,
  masterVolume = 72,
  onMasterVolumeChange,
  sfxVolume = 78,
  onSfxVolumeChange,
  editSelectedTile,
  editGizmoMode,
  onEditGizmoModeChange,
  onEditRotate,
  onEditDelete,
  onEditToggleBlocked,
  onEditCopyScale,
  onEditPasteScale,
  hasEditClipboard,
  editUniformScale,
  onEditUniformScaleChange,
  onProfileOpen,
  onStartPomodoro,
  isPomodoroActive = false,
  pomodoroRound = 1,
  pomodoroTotalRounds = 4,
  pomodoroPhase,
  onDailyQuestsOpen,
  onBuildUndo,
  buildCanUndo = false,
  editingDecoration = false,
  onEditingDecorationChange,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const ui = SKYHAVEN_SPRITE_MANIFEST.ui;

  const baseSections =
    selectedSection === "Focus Actions"
      ? ALL_SECTIONS.filter((section) => section !== "Shop" && section !== "Options")
      : ALL_SECTIONS;

  const showToolbox = selectedIslandId === "custom" && windowMode === "expanded";
  const visibleSections = showToolbox ? baseSections : baseSections.filter((s) => s !== "Toolbox");
  const isToolboxOpen = selectedSection === "Toolbox" && showToolbox;

  return (
    <aside
      className={`left-sidebar ${isToolboxOpen ? "is-toolbox-open" : ""} ${collapsed ? "is-collapsed" : ""}`}
      data-no-window-drag="true"
      style={isDragging ? { opacity: 0.15, pointerEvents: "none" } : undefined}
    >
      <button
        type="button"
        className="sidebar-collapse-tab"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {collapsed ? "▶" : "◀"}
      </button>
      {isToolboxOpen ? (
        <div className="sidebar-group is-toolbox-takeover">
          <button
            type="button"
            className="sidebar-item is-selected"
            onClick={() => onSelectSection("Main Menu")}
            title="Close Toolbox"
          >
            <div className="sidebar-item-glass-bg" />
            <span className="sidebar-item-text-label">TOOLBOX</span>
          </button>
          <div className={`sidebar-dropdown kind-toolbox is-open`} aria-hidden={false}>
            <section className="section-panel panel-toolbox">
              <div className="panel-glass-bg" />
              <BaukastenPanel
                inventory={inventory}
                onInventoryReset={onInventoryReset}
                onDebugAddResources={onDebugAddResources}
                selectedTileType={selectedTileType}
                onSelectTile={onSelectTile}
                eraseMode={eraseMode}
                onEraseModeChange={onEraseModeChange}
                selectedIslandId={selectedIslandId}
                windowMode={windowMode}
                editSelectedTile={editSelectedTile}
                editGizmoMode={editGizmoMode}
                onEditGizmoModeChange={onEditGizmoModeChange}
                onEditRotate={onEditRotate}
                onEditDelete={onEditDelete}
                onEditToggleBlocked={onEditToggleBlocked}
                onEditCopyScale={onEditCopyScale}
                onEditPasteScale={onEditPasteScale}
                hasEditClipboard={hasEditClipboard}
                editUniformScale={editUniformScale}
                onEditUniformScaleChange={onEditUniformScaleChange}
                onUndo={onBuildUndo}
                canUndo={buildCanUndo}
                editingDecoration={editingDecoration}
                onEditingDecorationChange={onEditingDecorationChange}
              />
            </section>
          </div>
        </div>
      ) : (
      visibleSections.map((section) => {
        const isSelected = selectedSection === section;
        const panelKind = toPanelKind(section);
        const isPanelOpen = isSelected && panelKind !== null;
        const isToolboxSection = section === "Toolbox";
        return (
          <div key={section} className="sidebar-group">
            <button
              type="button"
              className={`sidebar-item ${isSelected ? "is-selected" : ""}`}
              onClick={() => onSelectSection(section)}
            >
              <div className="sidebar-item-glass-bg" />
              {isToolboxSection ? (
                <span className="sidebar-item-text-label">TOOLBOX</span>
              ) : (
                <img
                  className="sidebar-item-label"
                  src={ui.labels[LABEL_KEYS[section]] ?? ui.labels.focusActions}
                  alt={section}
                />
              )}
            </button>

            {panelKind ? (
              <div className={`sidebar-dropdown kind-${panelKind} ${isPanelOpen ? "is-open" : ""}`} aria-hidden={!isPanelOpen}>
                <section className={`section-panel panel-${panelKind}`}>
                  <div className="panel-glass-bg" />

                  {panelKind === "focus" ? (
                    <>
                      <div className="duration-row">
                        {DURATION_OPTIONS.map((duration) => (
                          <button
                            key={duration}
                            type="button"
                            className={`duration-pill ${selectedDuration === duration && !isPomodoroActive ? "is-selected" : ""}`}
                            onClick={() => onSelectDuration(duration)}
                          >
                            {duration}m
                          </button>
                        ))}
                        <button
                          type="button"
                          className={`duration-pill is-pomodoro ${isPomodoroActive ? "is-selected" : ""}`}
                          onClick={() => onStartPomodoro?.(ACTIONS[0])}
                          title="Pomodoro: 25min work / 5min break x4"
                        >
                          {isPomodoroActive ? `P ${pomodoroRound}/${pomodoroTotalRounds}` : "Pomo"}
                        </button>
                      </div>

                      {isPomodoroActive && pomodoroPhase && (
                        <div className="pomodoro-status">
                          {pomodoroPhase === "work"
                            ? `Work ${pomodoroRound}/${pomodoroTotalRounds}`
                            : pomodoroPhase === "break"
                              ? "Short Break"
                              : "Long Break"}
                        </div>
                      )}

                      <div className="action-list">
                        {ACTIONS.map((action) => (
                          <button
                            key={action}
                            type="button"
                            className={`action-item ${activeAction === action ? "is-active" : ""}`}
                            onClick={() => isPomodoroActive ? onStartPomodoro?.(action) : onStartAction(action)}
                          >
                            - {action[0].toUpperCase()}
                            {action.slice(1)}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {panelKind === "main" ? (
                    <div className="generic-list">
                      {MAIN_MENU_ITEMS.map((label) => (
                        <button
                          key={label}
                          type="button"
                          className="generic-item"
                          onClick={
                            label === "Profile" ? onProfileOpen
                            : label === "Daily Quests" ? onDailyQuestsOpen
                            : undefined
                          }
                        >
                          - {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {panelKind === "shop" ? (
                    <div className="generic-list">
                      {SHOP_ITEMS.map((label) => (
                        <button key={label} type="button" className="generic-item">
                          - {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {panelKind === "islands" ? (
                    <div className="islands-selector">
                      <button
                        type="button"
                        className="islands-arrow-btn is-left"
                        onClick={() => onCycleIsland(-1)}
                        aria-label="Previous island"
                      >
                        {ui.islandsArrowLeft ? <img src={ui.islandsArrowLeft} alt="" className="islands-arrow-icon" /> : "<"}
                      </button>

                      <div className="islands-preview-wrap">
                        <img className="islands-preview" src={islandPreviewById[selectedIslandId]} alt={islandNameById[selectedIslandId]} />
                        <div className="islands-name">{islandNameById[selectedIslandId]}</div>
                      </div>

                      <button
                        type="button"
                        className="islands-arrow-btn is-right"
                        onClick={() => onCycleIsland(1)}
                        aria-label="Next island"
                      >
                        {ui.islandsArrowRight ? <img src={ui.islandsArrowRight} alt="" className="islands-arrow-icon" /> : ">"}
                      </button>
                    </div>
                  ) : null}

                  {panelKind === "toolbox" ? (
                    <BaukastenPanel
                      inventory={inventory}
                      onInventoryReset={onInventoryReset}
                      onDebugAddResources={onDebugAddResources}
                      selectedTileType={selectedTileType}
                      onSelectTile={onSelectTile}
                      eraseMode={eraseMode}
                      onEraseModeChange={onEraseModeChange}
                      selectedIslandId={selectedIslandId}
                      windowMode={windowMode}
                      editSelectedTile={editSelectedTile}
                      editGizmoMode={editGizmoMode}
                      onEditGizmoModeChange={onEditGizmoModeChange}
                      onEditRotate={onEditRotate}
                      onEditDelete={onEditDelete}
                      onEditToggleBlocked={onEditToggleBlocked}
                      onEditCopyScale={onEditCopyScale}
                      onEditPasteScale={onEditPasteScale}
                      hasEditClipboard={hasEditClipboard}
                      editUniformScale={editUniformScale}
                      onEditUniformScaleChange={onEditUniformScaleChange}
                      onUndo={onBuildUndo}
                      canUndo={buildCanUndo}
                      editingDecoration={editingDecoration}
                      onEditingDecorationChange={onEditingDecorationChange}
                    />
                  ) : null}

                  {panelKind === "options" ? (
                    <div className="settings-list">
                      <div className="settings-row">
                        <span className="settings-label">Music</span>
                        <div className="settings-music-skip">
                          <button
                            type="button"
                            className="settings-skip-btn"
                            onClick={onMusicPrev}
                            title="Previous track"
                            aria-label="Previous track"
                          >
                            ⏮
                          </button>
                          <button
                            type="button"
                            className="settings-skip-btn"
                            onClick={onMusicNext}
                            title="Next track"
                            aria-label="Next track"
                          >
                            ⏭
                          </button>
                        </div>
                      </div>

                      <label className="settings-row">
                        <span className="settings-label">Master Vol</span>
                        <input
                          className="settings-slider"
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={masterVolume}
                          onChange={(event) => onMasterVolumeChange?.(Number(event.target.value))}
                        />
                      </label>

                      <label className="settings-row">
                        <span className="settings-label">SFX Vol</span>
                        <input
                          className="settings-slider"
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={sfxVolume}
                          onChange={(event) => onSfxVolumeChange?.(Number(event.target.value))}
                        />
                      </label>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}
          </div>
        );
      })
      )}
    </aside>
  );
}

function toPanelKind(section: SidebarSection): SidebarPanelKind | null {
  if (section === "Main Menu") {
    return "main";
  }
  if (section === "Focus Actions") {
    return "focus";
  }
  if (section === "Shop") {
    return "shop";
  }
  if (section === "Islands") {
    return "islands";
  }
  if (section === "Options") {
    return "options";
  }
  if (section === "Toolbox") {
    return "toolbox";
  }
  return null;
}
