import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SKYHAVEN_SPRITE_MANIFEST } from "./game/assets";
import {
  addTile,
  canDirectionalCloneTile,
  createVisualCloneTemplate,
  getDirectionalCloneDisabledReason,
  getLineClonePreview,
  hydrateCustomIsland,
  hydrateIslandOverride,
  instantiateVisualCloneTile,
  persistCustomIsland,
  persistIslandOverride,
  removeTile,
  updateTile,
} from "./game/customIsland";
import islandFarming from "./game/island.farming.json";
import islandMining from "./game/island.mining.json";
import {
  addDebugResources,
  canAfford,
  grantResources,
  hydrateInventory,
  persistInventory,
  resetInventoryToStarter,
  spendResources,
  type Inventory,
} from "./game/inventory";
import { LEVEL_CAP, awardExp, hydrateProgression, persistProgression, xpToNextLevel } from "./game/progression";
import { getSessionExp, getSessionRewards, getTileRecipe, scaleRewardsForLevel } from "./game/resources";
import { advancePomodoroPhase, formatDurationHms, getRemainingMs, hydrateSession, MINI_ACTION_DURATION, persistSession, startSession } from "./game/session";
import { useGameClock } from "./game/useGameClock";
import type { TileEditAnchor } from "./game/useSkyhavenLoop";
import { IslandScene } from "./game/three/IslandScene";
import type { CharacterMovementDebugSnapshot } from "./game/three/useCharacterMovement";
import {
  DEBUG_NIGHT_SKY_BG_URL,
  DEFAULT_ISLAND_LIGHTING,
  type IslandLightingAmbiance,
  type IslandLightingParams,
} from "./game/three/islandLighting";
import type {
  AssetKey,
  CloneLineState,
  FocusDuration,
  FocusSession,
  IslandId,
  IslandMap,
  ProgressionState,
  ResourceAmount,
  TileDef,
} from "./game/types";
import { DECORATION_TILES } from "./game/types";
import { ClockOverlay } from "./ui/ClockOverlay";
import { DebugDock, type DebugSurfaceScope, type DebugSurfaceVizMode } from "./ui/DebugDock";
import { Hud } from "./ui/Hud";
import { Sidebar, type SidebarSection } from "./ui/Sidebar";
import { StatusTag } from "./ui/StatusTag";
import { CompactInventoryOverlay } from "./ui/CompactInventoryOverlay";
import { ProfileOverlay } from "./ui/ProfileOverlay";
import { WindowChrome } from "./ui/WindowChrome";
import { CanvasGizmoSheet } from "./ui/CanvasGizmoSheet";
import { PoiActionOverlay } from "./ui/PoiActionOverlay";
import { useIslandMusic, MUSIC_PLAYLIST_LENGTH } from "./game/useIslandMusic";
import { useWorldAmbience } from "./game/useWorldAmbience";
import { addActionTime, hydrateActionStats, persistActionStats, type ActionStats } from "./game/actionStats";
import { hydrateProfile, type PlayerProfile } from "./game/profile";
import { hydrateQuests, persistQuests, type DailyQuest } from "./game/dailyQuests";
import { PlannerOverlay } from "./ui/planner/PlannerOverlay";
import { CharacterSelectOverlay } from "./ui/CharacterSelectOverlay";
import { LuxTpsDialogueOverlay } from "./ui/LuxTpsDialogueOverlay";
import { CharacterDebugOverlay } from "./ui/CharacterDebugOverlay";
import {
  hydratePlayableCharacter,
  persistPlayableCharacter,
  isPlayableCharacterUnlocked,
  type PlayableCharacterId,
} from "./game/playableCharacters";
import { isSkyhavenWidgetRuntime } from "./runtime/isWidgetRuntime";
import {
  hydrateEquipment,
  moveEquipmentItem,
  persistEquipment,
  type EquipmentSlotRef,
  type EquipmentState,
} from "./game/equipment";
import { type PoiActionRequest } from "./game/poiActions";
import { DEFAULT_WALK_SURFACE_OFFSET_Y, getTileWalkSurfaceOffsetY } from "./game/three/islandSurface";

const EXPANDED_WINDOW_SIZE = { width: 960, height: 618 };
const COMPACT_WINDOW_SIZE = { width: 520, height: 520 };
const APP_ENTRANCE_DURATION_MS = 1500;
const XP_GAIN_PULSE_MS = 900;

function MovementDebugHud({
  snapshotRef,
  open,
}: {
  snapshotRef: MutableRefObject<CharacterMovementDebugSnapshot | null>;
  open: boolean;
}) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => bump((n) => n + 1), 110);
    return () => window.clearInterval(id);
  }, [open]);
  if (!open) return null;
  const s = snapshotRef.current;
  const panel: CSSProperties = {
    position: "absolute",
    bottom: 12,
    left: 12,
    zIndex: 200,
    minWidth: 168,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid rgba(136, 204, 255, 0.28)",
    background: "rgba(10, 14, 22, 0.88)",
    color: "#c8d4e0",
    fontFamily: "ui-monospace, Consolas, monospace",
    fontSize: 10,
    lineHeight: 1.45,
    pointerEvents: "none",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  };
  const row = (label: string, value: string) => (
    <div key={label}>
      <span style={{ color: "#6a7a8c" }}>{label}: </span>
      {value}
    </div>
  );
  return (
    <div data-no-window-drag="true" style={panel}>
      <div style={{ fontWeight: 700, color: "#88ccff", marginBottom: 4, fontSize: 11 }}>
        Movement debug
      </div>
      {!s ? (
        <div style={{ opacity: 0.65 }}>No snapshot yet</div>
      ) : (
        <>
          {row("anim", s.animState)}
          {row("chopTimer", s.chopTimer.toFixed(3))}
          {row("chopPlaySec", s.chopPlaybackSec.toFixed(3))}
          {row("rollTimer", s.rollTimer.toFixed(3))}
          {row("mouseFwd", s.mouseForwardActive ? "1" : "0")}
          {row("steer", s.steeringActive ? "1" : "0")}
        </>
      )}
    </div>
  );
}

type WindowMode = "expanded" | "compact";

export default function App() {
  const [customIsland, setCustomIsland] = useState<IslandMap>(() => hydrateCustomIsland());
  const [miningIsland, setMiningIsland] = useState<IslandMap>(() => hydrateIslandOverride("mining", islandMining as IslandMap));
  const [farmingIsland, setFarmingIsland] = useState<IslandMap>(() => hydrateIslandOverride("farming", islandFarming as IslandMap));
  const islandsById = useMemo<Record<IslandId, IslandMap>>(
    () => ({
      mining: miningIsland,
      farming: farmingIsland,
      custom: customIsland,
    }),
    [customIsland, miningIsland, farmingIsland]
  );
  const islandOrder = useMemo<IslandId[]>(() => ["mining", "farming", "custom"], []);
  const islandPreviewById = useMemo<Record<IslandId, string>>(
    () => ({
      mining: SKYHAVEN_SPRITE_MANIFEST.island.complete.src,
      farming: "/ingame_assets/expanded/farming/farming_complete.png",
      custom: SKYHAVEN_SPRITE_MANIFEST.island.complete.src,
    }),
    []
  );
  const islandNameById = useMemo<Record<IslandId, string>>(
    () => ({
      mining: "Mining",
      farming: "Farming",
      custom: "Home",
    }),
    []
  );
  const shellRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [windowMode, setWindowMode] = useState<WindowMode>("expanded");
  const [isAppEntering, setIsAppEntering] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isWindowAnimating, setIsWindowAnimating] = useState<boolean>(false);
  const [windowResizeTarget, setWindowResizeTarget] = useState<WindowMode | null>(null);
  const [isMinimalMode, setIsMinimalMode] = useState<boolean>(false);
  const [isInventoryOverlayOpen, setIsInventoryOverlayOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState<boolean>(false);
  const [characterSelectOpen, setCharacterSelectOpen] = useState(false);
  const [characterDebugOpen, setCharacterDebugOpen] = useState(false);
  const [playableCharacterId, setPlayableCharacterId] = useState<PlayableCharacterId>(() =>
    hydratePlayableCharacter(),
  );
  const [tpsModeActive, setTpsModeActive] = useState(false);
  const [luxTpsDialogue, setLuxTpsDialogue] = useState<{ open: boolean; text: string }>({
    open: false,
    text: "",
  });
  const handleLuxTpsDialogueChange = useCallback((payload: { open: boolean; text: string }) => {
    setLuxTpsDialogue((prev) =>
      prev.open === payload.open && prev.text === payload.text ? prev : payload,
    );
  }, []);
  const tpsNpcDialogueDismissRef = useRef<(() => boolean) | null>(null);
  const characterMovementDebugRef = useRef<CharacterMovementDebugSnapshot | null>(null);
  const [movementDebugHudOpen, setMovementDebugHudOpen] = useState(false);
  const [dailyQuests, setDailyQuests] = useState<DailyQuest[]>(() => hydrateQuests());
  const [actionStats, setActionStats] = useState<ActionStats>(() => hydrateActionStats());
  const [profile] = useState<PlayerProfile>(() => hydrateProfile());
  const [selectedSection, setSelectedSection] = useState<SidebarSection | null>("Main Menu");
  const [selectedIslandId, setSelectedIslandId] = useState<IslandId>("mining");
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [musicTrackIndex, setMusicTrackIndex] = useState(0);
  const [masterVolume, setMasterVolume] = useState(() => (isSkyhavenWidgetRuntime() ? 72 : 0));
  const [sfxVolume, setSfxVolume] = useState(() => (isSkyhavenWidgetRuntime() ? 78 : 0));
  const [menuSfxVolume, setMenuSfxVolume] = useState(() => (isSkyhavenWidgetRuntime() ? 74 : 0));
  const [musicVolume, setMusicVolume] = useState(() => (isSkyhavenWidgetRuntime() ? 100 : 0));
  useIslandMusic(selectedIslandId, musicEnabled, musicTrackIndex, masterVolume, musicVolume);
  useWorldAmbience(tpsModeActive, masterVolume, sfxVolume);
  const [session, setSession] = useState<FocusSession | null>(() => hydrateSession());
  const [pendingPoiAction, setPendingPoiAction] = useState<PoiActionRequest | null>(null);
  const [inventory, setInventory] = useState(() => hydrateInventory());
  const [equipment, setEquipment] = useState<EquipmentState>(() => hydrateEquipment());
  const [progression, setProgression] = useState<ProgressionState>(() => hydrateProgression());
  const [expGainPulse, setExpGainPulse] = useState(false);
  const [selectedTileType, setSelectedTileType] = useState<AssetKey | null>(null);
  const [eraseMode, setEraseMode] = useState(false);
  const [selectedTileForEdit, setSelectedTileForEdit] = useState<{ gx: number; gy: number } | null>(null);
  const [, setTileEditAnchor] = useState<TileEditAnchor | null>(null);
  const [blockedTargetCell, setBlockedTargetCell] = useState<{ gx: number; gy: number } | null>(null);
  const [cloneState, setCloneState] = useState<CloneLineState | null>(null);
  const [clonePreviewCells, setClonePreviewCells] = useState<Array<{ gx: number; gy: number }>>([]);
  const [cloneBlockedCell, setCloneBlockedCell] = useState<{ gx: number; gy: number } | null>(null);
  const [noResourcesHint, setNoResourcesHint] = useState(false);
  const noResourcesTimerRef = useRef<number | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  /** Sun/sky/POI lighting + day/night; edited in Debug Dock, persists after leaving debug. */
  const [sceneIslandLighting, setSceneIslandLighting] = useState<IslandLightingParams>(() => ({
    ...DEFAULT_ISLAND_LIGHTING,
  }));
  const [sceneLightingAmbiance, setSceneLightingAmbiance] = useState<IslandLightingAmbiance>("day");
  const [debugGizmoMode, setDebugGizmoMode] = useState<"translate" | "scale">("translate");
  const [debugSelectedTileId, setDebugSelectedTileId] = useState<string | null>(null);
  const [debugBatchSelectionIds, setDebugBatchSelectionIds] = useState<Set<string>>(() => new Set());
  const [debugSurfaceScope, setDebugSurfaceScope] = useState<DebugSurfaceScope>("all");
  const [debugSurfaceVizMode, setDebugSurfaceVizMode] = useState<DebugSurfaceVizMode>("single");
  const [debugSurfaceTypeFilter, setDebugSurfaceTypeFilter] = useState<string | null>(null);
  const [debugBatchPickMode, setDebugBatchPickMode] = useState(false);
  const [debugIsland, setDebugIsland] = useState<IslandMap | null>(null);
  const debugIslandRef = useRef<IslandMap | null>(null);
  const debugSurfaceEditSessionRef = useRef<{ active: boolean; pushed: boolean }>({ active: false, pushed: false });
  const debugPendingRef = useRef<Map<string, { pos3d: { x: number; y: number; z: number }; scale3d: { x: number; y: number; z: number } }>>(new Map());
  const debugUndoStackRef = useRef<IslandMap[]>([]);
  const debugRedoStackRef = useRef<IslandMap[]>([]);
  const [debugCanUndo, setDebugCanUndo] = useState(false);
  const [debugCanRedo, setDebugCanRedo] = useState(false);

  const debugPushUndo = useCallback(() => {
    if (!debugIslandRef.current) return;
    const snapshot = { ...debugIslandRef.current, tiles: debugIslandRef.current.tiles.map((t) => ({ ...t })) };
    debugUndoStackRef.current = [...debugUndoStackRef.current.slice(-49), snapshot];
    debugRedoStackRef.current = [];
    setDebugCanUndo(true);
    setDebugCanRedo(false);
  }, []);

  const handleDebugUndo = useCallback(() => {
    const stack = debugUndoStackRef.current;
    if (stack.length === 0 || !debugIslandRef.current) return;
    const prev = stack[stack.length - 1];
    debugUndoStackRef.current = stack.slice(0, -1);
    const curSnapshot = { ...debugIslandRef.current, tiles: debugIslandRef.current.tiles.map((t) => ({ ...t })) };
    debugRedoStackRef.current = [...debugRedoStackRef.current, curSnapshot];
    debugIslandRef.current = prev;
    setDebugIsland(prev);
    setDebugCanUndo(debugUndoStackRef.current.length > 0);
    setDebugCanRedo(true);
  }, []);

  const handleDebugRedo = useCallback(() => {
    const stack = debugRedoStackRef.current;
    if (stack.length === 0 || !debugIslandRef.current) return;
    const next = stack[stack.length - 1];
    debugRedoStackRef.current = stack.slice(0, -1);
    const curSnapshot = { ...debugIslandRef.current, tiles: debugIslandRef.current.tiles.map((t) => ({ ...t })) };
    debugUndoStackRef.current = [...debugUndoStackRef.current, curSnapshot];
    debugIslandRef.current = next;
    setDebugIsland(next);
    setDebugCanUndo(true);
    setDebugCanRedo(debugRedoStackRef.current.length > 0);
  }, []);
  const customIslandRef = useRef<IslandMap>(customIsland);
  const selectedTileForEditRef = useRef<{ gx: number; gy: number } | null>(selectedTileForEdit);
  const blockedTargetTimerRef = useRef<number | null>(null);
  const expGainPulseTimerRef = useRef<number | null>(null);
  const miniActionTileRef = useRef<{ gx: number; gy: number; originalType: AssetKey; islandId: IslandId } | null>(null);
  const regrowTimerRef = useRef<number | null>(null);
  const buildUndoStackRef = useRef<Array<{ island: IslandMap; inventory: Inventory }>>([]);
  const [buildCanUndo, setBuildCanUndo] = useState(false);
  const island = islandsById[selectedIslandId];

  useEffect(() => {
    customIslandRef.current = customIsland;
  }, [customIsland]);

  useEffect(() => {
    setPlayableCharacterId((cur) => {
      if (isPlayableCharacterUnlocked(cur, customIsland)) return cur;
      persistPlayableCharacter("default");
      return "default";
    });
  }, [customIsland]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setIsAppEntering(false);
    }, APP_ENTRANCE_DURATION_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    const shell = document.querySelector(".skyhaven-app-shell");
    if (shell) {
      shell.classList.toggle("is-fullscreen", isFullscreen);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (windowMode !== "expanded" || debugMode) {
      setCharacterDebugOpen(false);
    }
  }, [debugMode, windowMode]);

  useEffect(() => {
    selectedTileForEditRef.current = selectedTileForEdit;
  }, [selectedTileForEdit]);

  useEffect(() => {
    if (!debugIsland) return;
    const validIds = new Set(debugIsland.tiles.map((tile) => tile.id));
    const validTypes = new Set<string>(debugIsland.tiles.map((tile) => tile.type));
    setDebugBatchSelectionIds((previous) => {
      let changed = false;
      const next = new Set<string>();
      previous.forEach((tileId) => {
        if (validIds.has(tileId)) {
          next.add(tileId);
        } else {
          changed = true;
        }
      });
      return changed ? next : previous;
    });
    if (debugSelectedTileId && !validIds.has(debugSelectedTileId)) {
      setDebugSelectedTileId(null);
    }
    if (debugSurfaceTypeFilter && !validTypes.has(debugSurfaceTypeFilter)) {
      setDebugSurfaceTypeFilter(null);
    }
  }, [debugIsland, debugSelectedTileId, debugSurfaceTypeFilter]);

  useEffect(() => {
    return () => {
      if (blockedTargetTimerRef.current !== null) {
        window.clearTimeout(blockedTargetTimerRef.current);
      }
      if (expGainPulseTimerRef.current !== null) {
        window.clearTimeout(expGainPulseTimerRef.current);
      }
      if (noResourcesTimerRef.current !== null) {
        window.clearTimeout(noResourcesTimerRef.current);
      }
    };
  }, []);

  const triggerNoResourcesHint = useCallback(() => {
    setNoResourcesHint(true);
    if (noResourcesTimerRef.current !== null) {
      window.clearTimeout(noResourcesTimerRef.current);
    }
    noResourcesTimerRef.current = window.setTimeout(() => {
      setNoResourcesHint(false);
      noResourcesTimerRef.current = null;
    }, 2200);
  }, []);

  const clearClonePreview = useCallback(() => {
    setClonePreviewCells([]);
    setCloneBlockedCell(null);
  }, []);

  const cancelDirectionalClone = useCallback(() => {
    setCloneState(null);
    clearClonePreview();
  }, [clearClonePreview]);

  const handlePlaceTile = useCallback(
    (gx: number, gy: number, type: AssetKey) => {
      if (selectedIslandId !== "custom") return;
      const recipe = getTileRecipe(type);
      if (!recipe || !canAfford(inventory, recipe)) {
        if (recipe && !canAfford(inventory, recipe)) {
          triggerNoResourcesHint();
        }
        return;
      }
      const nextInv = spendResources(inventory, recipe);
      if (!nextInv) return;

      buildUndoStackRef.current = [
        ...buildUndoStackRef.current.slice(-49),
        { island: customIslandRef.current, inventory },
      ];
      setBuildCanUndo(true);

      let nextIsland: IslandMap;
      if ((DECORATION_TILES as readonly string[]).includes(type)) {
        nextIsland = updateTile(customIslandRef.current, gx, gy, { decoration: type });
      } else {
        nextIsland = addTile(customIslandRef.current, gx, gy, type);
      }

      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      setInventory(nextInv);
      persistCustomIsland(nextIsland);
      persistInventory(nextInv);
    },
    [selectedIslandId, inventory, triggerNoResourcesHint]
  );

  const handleRemoveTile = useCallback(
    (gx: number, gy: number) => {
      if (selectedIslandId !== "custom") return;

      buildUndoStackRef.current = [
        ...buildUndoStackRef.current.slice(-49),
        { island: customIslandRef.current, inventory },
      ];
      setBuildCanUndo(true);

      const nextIsland = removeTile(customIslandRef.current, gx, gy);
      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      setSelectedTileForEdit((previous) => {
        if (!previous) {
          selectedTileForEditRef.current = previous;
          return previous;
        }
        const next = previous.gx === gx && previous.gy === gy ? null : previous;
        selectedTileForEditRef.current = next;
        return next;
      });
      persistCustomIsland(nextIsland);
    },
    [selectedIslandId, inventory]
  );

  const handleBuildUndo = useCallback(() => {
    const stack = buildUndoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    buildUndoStackRef.current = stack.slice(0, -1);
    setBuildCanUndo(stack.length > 1);
    customIslandRef.current = prev.island;
    setCustomIsland(prev.island);
    setInventory(prev.inventory);
    persistCustomIsland(prev.island);
    persistInventory(prev.inventory);
  }, []);

  const pushBuildUndoSnapshot = useCallback(() => {
    buildUndoStackRef.current = [
      ...buildUndoStackRef.current.slice(-49),
      { island: customIslandRef.current, inventory },
    ];
    setBuildCanUndo(true);
  }, [inventory]);

  const handleSelectTileForEdit = useCallback(
    (gx: number, gy: number) => {
      if (selectedIslandId !== "custom") return;
      selectedTileForEditRef.current = { gx, gy };
      setSelectedTileForEdit({ gx, gy });
    },
    [selectedIslandId]
  );

  const handleTileEditAnchorChange = useCallback((anchor: TileEditAnchor) => {
    setTileEditAnchor(anchor);
  }, []);

  const handleBlockedTarget = useCallback((target: { gx: number; gy: number } | null) => {
    if (blockedTargetTimerRef.current !== null) {
      window.clearTimeout(blockedTargetTimerRef.current);
      blockedTargetTimerRef.current = null;
    }
    setBlockedTargetCell(target);
    if (target) {
      blockedTargetTimerRef.current = window.setTimeout(() => {
        setBlockedTargetCell(null);
        blockedTargetTimerRef.current = null;
      }, 260);
    }
  }, []);

  const handleDebugTileSelect = useCallback((tileId: string) => {
    setDebugSelectedTileId(tileId);
  }, []);

  const handleDebugTileChange = useCallback(
    (tileId: string, pos3d: { x: number; y: number; z: number }, scale3d: { x: number; y: number; z: number }, rotY?: number) => {
      debugPendingRef.current.set(tileId, { pos3d, scale3d });
      const src = debugIslandRef.current;
      if (!src) return;
      const tile = src.tiles.find((t) => t.id === tileId);
      if (tile) {
        const nextIsland = updateTile(src, tile.gx, tile.gy, { pos3d, scale3d, rotY: rotY ?? tile.rotY });
        debugIslandRef.current = nextIsland;
        setDebugIsland(nextIsland);
      }
    },
    [],
  );

  const handleDebugSave = useCallback(() => {
    if (!debugIslandRef.current) return;
    const saved = debugIslandRef.current;
    persistIslandOverride(selectedIslandId, saved);
    if (selectedIslandId === "custom") {
      customIslandRef.current = saved;
      setCustomIsland(saved);
    } else if (selectedIslandId === "mining") {
      setMiningIsland(saved);
    } else if (selectedIslandId === "farming") {
      setFarmingIsland(saved);
    }
    debugPendingRef.current.clear();
  }, [selectedIslandId]);

  const handleExitDebug = useCallback(() => {
    if (debugIslandRef.current) {
      const saved = debugIslandRef.current;
      persistIslandOverride(selectedIslandId, saved);
      if (selectedIslandId === "custom") {
        customIslandRef.current = saved;
        setCustomIsland(saved);
      } else if (selectedIslandId === "mining") {
        setMiningIsland(saved);
      } else if (selectedIslandId === "farming") {
        setFarmingIsland(saved);
      }
    }
    setDebugMode(false);
    setDebugSelectedTileId(null);
    setDebugBatchSelectionIds(new Set());
    setDebugSurfaceScope("all");
    setDebugSurfaceVizMode("single");
    setDebugSurfaceTypeFilter(null);
    setDebugBatchPickMode(false);
    debugSurfaceEditSessionRef.current.active = false;
    debugSurfaceEditSessionRef.current.pushed = false;
    setDebugPlacementType(null);
    debugIslandRef.current = null;
    setDebugIsland(null);
    debugPendingRef.current.clear();
  }, [selectedIslandId]);

  const handleDebugDeleteTile = useCallback(() => {
    if (!debugSelectedTileId || !debugIslandRef.current) return;
    const tile = debugIslandRef.current.tiles.find((t) => t.id === debugSelectedTileId);
    if (tile) {
      debugPushUndo();
      const nextIsland = removeTile(debugIslandRef.current, tile.gx, tile.gy);
      debugIslandRef.current = nextIsland;
      setDebugIsland(nextIsland);
    }
    setDebugSelectedTileId(null);
  }, [debugSelectedTileId, debugPushUndo]);

  const handleDebugRotateTile = useCallback(() => {
    if (!debugSelectedTileId || !debugIslandRef.current) return;
    const tile = debugIslandRef.current.tiles.find((t) => t.id === debugSelectedTileId);
    if (tile) {
      debugPushUndo();
      const currentRotY = tile.rotY ?? 0;
      const nextRotY = currentRotY + Math.PI / 2;
      const nextIsland = updateTile(debugIslandRef.current, tile.gx, tile.gy, { rotY: nextRotY });
      debugIslandRef.current = nextIsland;
      setDebugIsland(nextIsland);
    }
  }, [debugSelectedTileId, debugPushUndo]);

  const handleDebugToggleBlocked = useCallback(() => {
    if (!debugSelectedTileId || !debugIslandRef.current) return;
    const tile = debugIslandRef.current.tiles.find((t) => t.id === debugSelectedTileId);
    if (tile) {
      debugPushUndo();
      const nextIsland = updateTile(debugIslandRef.current, tile.gx, tile.gy, { blocked: !tile.blocked });
      debugIslandRef.current = nextIsland;
      setDebugIsland(nextIsland);
    }
  }, [debugSelectedTileId, debugPushUndo]);

  const applyDebugWalkSurfaceOffsetToTileIds = useCallback(
    (tileIds: readonly string[], value: number | undefined, mode: "session" | "immediate" = "immediate") => {
      if (!debugIslandRef.current || tileIds.length === 0) return;
      const idSet = new Set(tileIds);
      let changed = false;
      const nextTiles = debugIslandRef.current.tiles.map((tile) => {
        if (!idSet.has(tile.id) || tile.walkSurfaceOffsetY === value) {
          return tile;
        }
        changed = true;
        return { ...tile, walkSurfaceOffsetY: value };
      });
      if (!changed) return;
      if (mode === "session") {
        if (!debugSurfaceEditSessionRef.current.pushed) {
          debugPushUndo();
          debugSurfaceEditSessionRef.current.pushed = true;
        }
      } else {
        debugPushUndo();
      }
      const nextIsland = { ...debugIslandRef.current, tiles: nextTiles };
      debugIslandRef.current = nextIsland;
      setDebugIsland(nextIsland);
    },
    [debugPushUndo],
  );

  const handleDebugBatchTileToggle = useCallback((tileId: string) => {
    setDebugBatchSelectionIds((previous) => {
      const next = new Set(previous);
      if (next.has(tileId)) {
        next.delete(tileId);
      } else {
        next.add(tileId);
      }
      return next;
    });
  }, []);

  const [debugPlacementType, setDebugPlacementType] = useState<string | null>(null);
  const [debugGizmoDragging, setDebugGizmoDragging] = useState(false);
  const [debugUniformScale, setDebugUniformScale] = useState(true);
  const [debugClipboard, setDebugClipboard] = useState<{
    scale3d?: { x: number; y: number; z: number };
    rotY?: number;
  } | null>(null);

  const [editGizmoMode, setEditGizmoMode] = useState<"translate" | "scale">("translate");
  const [editSelectedTileId, setEditSelectedTileId] = useState<string | null>(null);
  const [editUniformScale, setEditUniformScale] = useState(true);
  const [editGizmoDragging, setEditGizmoDragging] = useState(false);
  const [editingDecoration, setEditingDecoration] = useState(false);

  const handleDebugDraggingChange = useCallback((dragging: boolean) => {
    if (dragging) debugPushUndo();
    setDebugGizmoDragging(dragging);
  }, [debugPushUndo]);

  const handleCopyTransform = useCallback(() => {
    if (!debugSelectedTileId || !debugIslandRef.current) return;
    const tile = debugIslandRef.current.tiles.find((t) => t.id === debugSelectedTileId);
    if (!tile) return;
    setDebugClipboard({
      scale3d: tile.scale3d ? { ...tile.scale3d } : undefined,
      rotY: tile.rotY,
    });
  }, [debugSelectedTileId]);

  const handlePasteTransform = useCallback(() => {
    if (!debugClipboard || !debugSelectedTileId || !debugIslandRef.current) return;
    const tile = debugIslandRef.current.tiles.find((t) => t.id === debugSelectedTileId);
    if (!tile) return;
    debugPushUndo();
    const updates: { scale3d?: { x: number; y: number; z: number }; rotY?: number } = {};
    if (debugClipboard.scale3d) updates.scale3d = { ...debugClipboard.scale3d };
    if (debugClipboard.rotY != null) updates.rotY = debugClipboard.rotY;
    const nextIsland = updateTile(debugIslandRef.current, tile.gx, tile.gy, updates);
    debugIslandRef.current = nextIsland;
    setDebugIsland(nextIsland);
  }, [debugClipboard, debugSelectedTileId, debugPushUndo]);

  const handleExportJson = useCallback(() => {
    const island = debugIslandRef.current;
    if (!island) return;
    const json = JSON.stringify(island, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `island.${selectedIslandId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedIslandId]);

  const handleDebugPlaceTile = useCallback(
    (gx: number, gy: number, modelKey: string) => {
      if (!debugIslandRef.current) return;
      const typeMap: Record<string, AssetKey> = {
        grass: "grass",
        dirt: "dirt",
        pathCross: "pathCross",
        pathStraight: "pathStraight",
        ancientStone: "ancientStone",
        ancientStoneWall: "ancientStoneWall",
        ancientCornerWall: "ancientCornerWall",
        mine: "mineTile",
        tree: "tree1",
        treeMiddle: "treeMiddle",
        farm2x2: "farm2x2",
        poisFarming: "poisFarming",
        grasBlumen: "grasBlumen",
        taverne: "taverne",
        floatingForge: "floatingForge",
        farmingChicken: "farmingChicken",
        magicTower: "magicTower",
        wellTile: "wellTile",
        well2Tile: "well2Tile",
        halfGrownCropTile: "halfGrownCropTile",
        cottaTile: "cottaTile",
        ancientTempleTile: "ancientTempleTile",
        kaserneTile: "kaserneTile",
        runeTile: "runeTile",
      };
      const assetKey = typeMap[modelKey];
      if (!assetKey) return;
      debugPushUndo();
      const nextIsland = addTile(debugIslandRef.current, gx, gy, assetKey);
      debugIslandRef.current = nextIsland;
      setDebugIsland(nextIsland);
    },
    [debugPushUndo],
  );

  const isCustomEditing =
    selectedIslandId === "custom" &&
    selectedSection === "Toolbox" &&
    windowMode === "expanded" &&
    !debugMode;
  const sceneEditMode =
    isCustomEditing &&
    selectedTileType === null &&
    !eraseMode &&
    cloneState === null;

  const activeEditTile = useMemo<TileDef | null>(() => {
    if (!editSelectedTileId || !isCustomEditing) {
      return null;
    }
    return customIsland.tiles.find((tile) => tile.id === editSelectedTileId) ?? null;
  }, [customIsland, editSelectedTileId, isCustomEditing]);

  const activeDebugTile = useMemo<TileDef | null>(() => {
    if (!debugMode || !debugSelectedTileId || !debugIsland) {
      return null;
    }
    return debugIsland.tiles.find((tile) => tile.id === debugSelectedTileId) ?? null;
  }, [debugIsland, debugMode, debugSelectedTileId]);

  const debugBatchSelectionIdArray = useMemo(() => Array.from(debugBatchSelectionIds), [debugBatchSelectionIds]);
  const debugSurfaceTypeOptions = useMemo(
    () => (debugIsland ? Array.from(new Set(debugIsland.tiles.map((tile) => tile.type))).sort() : []),
    [debugIsland],
  );

  const debugSurfaceAuditTargetTileIds = useMemo(() => {
    if (!debugIsland) return [] as string[];
    if (debugSurfaceScope === "selection") {
      return debugIsland.tiles
        .filter((tile) => debugBatchSelectionIds.has(tile.id))
        .map((tile) => tile.id);
    }
    if (debugSurfaceScope === "sameType") {
      if (!activeDebugTile) return [] as string[];
      return debugIsland.tiles
        .filter((tile) => tile.type === activeDebugTile.type)
        .map((tile) => tile.id);
    }
    return debugIsland.tiles
      .filter((tile) => !debugSurfaceTypeFilter || tile.type === debugSurfaceTypeFilter)
      .map((tile) => tile.id);
  }, [activeDebugTile, debugBatchSelectionIds, debugIsland, debugSurfaceScope, debugSurfaceTypeFilter]);

  const debugSurfaceEditableTileIds = useMemo(() => {
    if (debugSurfaceVizMode === "audit") {
      return debugSurfaceAuditTargetTileIds;
    }
    return activeDebugTile ? [activeDebugTile.id] : [];
  }, [activeDebugTile, debugSurfaceAuditTargetTileIds, debugSurfaceVizMode]);

  const debugSurfaceEditableTiles = useMemo(() => {
    if (!debugIsland || debugSurfaceEditableTileIds.length === 0) return [] as TileDef[];
    const idSet = new Set(debugSurfaceEditableTileIds);
    return debugIsland.tiles.filter((tile) => idSet.has(tile.id));
  }, [debugIsland, debugSurfaceEditableTileIds]);

  const debugSurfaceValueMixed = useMemo(() => {
    if (debugSurfaceEditableTiles.length <= 1) return false;
    const baseline = getTileWalkSurfaceOffsetY(debugSurfaceEditableTiles[0]);
    return debugSurfaceEditableTiles.some((tile) => Math.abs(getTileWalkSurfaceOffsetY(tile) - baseline) > 0.0001);
  }, [debugSurfaceEditableTiles]);

  const debugSurfaceControlValue = useMemo(() => {
    if (activeDebugTile && debugSurfaceEditableTileIds.includes(activeDebugTile.id)) {
      return getTileWalkSurfaceOffsetY(activeDebugTile);
    }
    if (debugSurfaceEditableTiles.length > 0) {
      return getTileWalkSurfaceOffsetY(debugSurfaceEditableTiles[0]);
    }
    return DEFAULT_WALK_SURFACE_OFFSET_Y;
  }, [activeDebugTile, debugSurfaceEditableTileIds, debugSurfaceEditableTiles]);

  const handleDebugClearBatchSelection = useCallback(() => {
    setDebugBatchSelectionIds(new Set());
  }, []);

  const handleDebugAddSameTypeToBatchSelection = useCallback(() => {
    if (!activeDebugTile || !debugIsland) return;
    setDebugBatchSelectionIds(
      new Set(debugIsland.tiles.filter((tile) => tile.type === activeDebugTile.type).map((tile) => tile.id)),
    );
  }, [activeDebugTile, debugIsland]);

  const handleDebugSelectAllBatchTiles = useCallback(() => {
    if (!debugIsland) return;
    setDebugBatchSelectionIds(new Set(debugIsland.tiles.map((tile) => tile.id)));
  }, [debugIsland]);

  const handleDebugSurfaceEditStart = useCallback(() => {
    debugSurfaceEditSessionRef.current.active = true;
    debugSurfaceEditSessionRef.current.pushed = false;
  }, []);

  const handleDebugSurfaceEditEnd = useCallback(() => {
    debugSurfaceEditSessionRef.current.active = false;
    debugSurfaceEditSessionRef.current.pushed = false;
  }, []);

  const handleDebugLiveSurfaceChange = useCallback(
    (value: number) => {
      applyDebugWalkSurfaceOffsetToTileIds(
        debugSurfaceEditableTileIds,
        value,
        debugSurfaceEditSessionRef.current.active ? "session" : "immediate",
      );
    },
    [applyDebugWalkSurfaceOffsetToTileIds, debugSurfaceEditableTileIds],
  );

  const handleDebugBatchMatchSelected = useCallback(() => {
    if (!activeDebugTile) return;
    applyDebugWalkSurfaceOffsetToTileIds(
      debugSurfaceEditableTileIds,
      getTileWalkSurfaceOffsetY(activeDebugTile),
    );
  }, [activeDebugTile, applyDebugWalkSurfaceOffsetToTileIds, debugSurfaceEditableTileIds]);

  const handleDebugBatchResetToAuto = useCallback(() => {
    applyDebugWalkSurfaceOffsetToTileIds(debugSurfaceEditableTileIds, undefined);
  }, [applyDebugWalkSurfaceOffsetToTileIds, debugSurfaceEditableTileIds]);

  const cloneDisabledReason = useMemo(
    () => getDirectionalCloneDisabledReason(activeEditTile),
    [activeEditTile]
  );
  const cloneEligible = activeEditTile !== null && cloneDisabledReason === null;

  const handleEditTileSelect = useCallback((tileId: string) => {
    setEditSelectedTileId(tileId || null);
    setEditingDecoration(false);
  }, []);

  const handleEditTileDeselect = useCallback(() => {
    setEditSelectedTileId(null);
    cancelDirectionalClone();
  }, [cancelDirectionalClone]);

  const handleEditTileChange = useCallback(
    (tileId: string, pos3d: { x: number; y: number; z: number }, scale3d: { x: number; y: number; z: number }, rotY?: number) => {
      const src = customIslandRef.current;
      const tile = src.tiles.find((t) => t.id === tileId);
      if (tile) {
        const nextIsland = updateTile(src, tile.gx, tile.gy, { pos3d, scale3d, rotY: rotY ?? tile.rotY });
        customIslandRef.current = nextIsland;
        setCustomIsland(nextIsland);
        persistCustomIsland(nextIsland);
      }
    },
    [],
  );

  const handleEditDecoChange = useCallback(
    (tileId: string, decoPos3d: { x: number; y: number; z: number }, decoScale3d: { x: number; y: number; z: number }, decoRotY: number) => {
      const src = customIslandRef.current;
      const tile = src.tiles.find((t) => t.id === tileId);
      if (tile) {
        const nextIsland = updateTile(src, tile.gx, tile.gy, { decoPos3d, decoScale3d, decoRotY });
        customIslandRef.current = nextIsland;
        setCustomIsland(nextIsland);
        persistCustomIsland(nextIsland);
      }
    },
    [],
  );

  const handleEditDraggingChange = useCallback((dragging: boolean) => {
    if (dragging) {
      pushBuildUndoSnapshot();
    }
    setEditGizmoDragging(dragging);
  }, [pushBuildUndoSnapshot]);

  const handleEditDeleteTile = useCallback(() => {
    if (!editSelectedTileId) return;
    const tile = customIslandRef.current.tiles.find((t) => t.id === editSelectedTileId);
    if (tile) {
      pushBuildUndoSnapshot();
      const nextIsland = removeTile(customIslandRef.current, tile.gx, tile.gy);
      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      persistCustomIsland(nextIsland);
    }
    setEditSelectedTileId(null);
  }, [editSelectedTileId, pushBuildUndoSnapshot]);

  const handleEditRotateTile = useCallback(() => {
    if (!editSelectedTileId) return;
    const tile = customIslandRef.current.tiles.find((t) => t.id === editSelectedTileId);
    if (tile) {
      pushBuildUndoSnapshot();
      const currentRotY = tile.rotY ?? 0;
      const nextRotY = currentRotY + Math.PI / 2;
      const nextIsland = updateTile(customIslandRef.current, tile.gx, tile.gy, { rotY: nextRotY });
      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      persistCustomIsland(nextIsland);
    }
  }, [editSelectedTileId, pushBuildUndoSnapshot]);

  const handleEditToggleBlocked = useCallback(() => {
    if (!editSelectedTileId) return;
    const tile = customIslandRef.current.tiles.find((t) => t.id === editSelectedTileId);
    if (tile) {
      pushBuildUndoSnapshot();
      const nextIsland = updateTile(customIslandRef.current, tile.gx, tile.gy, { blocked: !tile.blocked });
      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      persistCustomIsland(nextIsland);
    }
  }, [editSelectedTileId, pushBuildUndoSnapshot]);

  const handleEditToggleVfx = useCallback(() => {
    if (!editSelectedTileId) return;
    const tile = customIslandRef.current.tiles.find((t) => t.id === editSelectedTileId);
    if (tile) {
      pushBuildUndoSnapshot();
      const nextVfxEnabled = !tile.vfxEnabled;
      const updates: { vfxEnabled: boolean; runeVfxLit?: boolean } = { vfxEnabled: nextVfxEnabled };
      if (tile.type === "runeTile") {
        updates.runeVfxLit = false;
      }
      const nextIsland = updateTile(customIslandRef.current, tile.gx, tile.gy, updates);
      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      persistCustomIsland(nextIsland);
    }
  }, [editSelectedTileId, pushBuildUndoSnapshot]);

  const handleRuneVfxToggle = useCallback(
    (gx: number, gy: number) => {
      if (selectedIslandId !== "custom") return;
      const src = customIslandRef.current;
      const tile = src.tiles.find((t) => t.gx === gx && t.gy === gy && t.type === "runeTile");
      if (!tile || tile.vfxEnabled !== true) return;
      const nextIsland = updateTile(src, gx, gy, { runeVfxLit: !tile.runeVfxLit });
      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      persistCustomIsland(nextIsland);
    },
    [selectedIslandId],
  );

  const handleToggleLineClone = useCallback(() => {
    if (!activeEditTile || !canDirectionalCloneTile(activeEditTile)) {
      return;
    }
    setSelectedTileType(null);
    setEraseMode(false);
    setCloneState((previous) =>
      previous?.sourceTileId === activeEditTile.id ? null : { sourceTileId: activeEditTile.id }
    );
    clearClonePreview();
  }, [activeEditTile, clearClonePreview]);

  const handleCloneHoverChange = useCallback(
    (cell: { gx: number; gy: number } | null) => {
      if (!cloneState) {
        clearClonePreview();
        return;
      }

      const sourceTile = customIslandRef.current.tiles.find((tile) => tile.id === cloneState.sourceTileId) ?? null;
      const preview = getLineClonePreview(customIslandRef.current, sourceTile, cell);
      setClonePreviewCells(preview.cells);
      setCloneBlockedCell(preview.blockedCell);
    },
    [cloneState, clearClonePreview]
  );

  const handleConfirmLineCloneTarget = useCallback(
    (gx: number, gy: number) => {
      if (!cloneState) {
        return;
      }

      const sourceTile = customIslandRef.current.tiles.find((tile) => tile.id === cloneState.sourceTileId) ?? null;
      const preview = getLineClonePreview(customIslandRef.current, sourceTile, { gx, gy });

      if (!preview.validTarget || !sourceTile) {
        setClonePreviewCells(preview.cells);
        setCloneBlockedCell(preview.blockedCell);
        return;
      }

      const recipe = getTileRecipe(sourceTile.type);
      if (!recipe) {
        return;
      }

      const totalCost = scaleResourceAmounts(recipe, preview.cells.length);
      if (!canAfford(inventory, totalCost)) {
        triggerNoResourcesHint();
        return;
      }

      const nextInventory = spendResources(inventory, totalCost);
      if (!nextInventory) {
        triggerNoResourcesHint();
        return;
      }

      const template = createVisualCloneTemplate(sourceTile);
      let nextIsland = customIslandRef.current;
      for (const cell of preview.cells) {
        const cloneTile = instantiateVisualCloneTile(template, cell.gx, cell.gy);
        nextIsland = addTile(nextIsland, cell.gx, cell.gy, template.type, cloneTile);
      }

      buildUndoStackRef.current = [
        ...buildUndoStackRef.current.slice(-49),
        { island: customIslandRef.current, inventory },
      ];
      setBuildCanUndo(true);

      customIslandRef.current = nextIsland;
      setCustomIsland(nextIsland);
      setInventory(nextInventory);
      persistCustomIsland(nextIsland);
      persistInventory(nextInventory);
      clearClonePreview();
    },
    [cloneState, inventory, triggerNoResourcesHint, clearClonePreview]
  );

  const handleDeselectTileForEdit = useCallback(() => {
    selectedTileForEditRef.current = null;
    setSelectedTileForEdit(null);
    setBlockedTargetCell(null);
    if (blockedTargetTimerRef.current !== null) {
      window.clearTimeout(blockedTargetTimerRef.current);
      blockedTargetTimerRef.current = null;
    }
  }, []);

  const { nowMs } = useGameClock();
 
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    if (!isMinimalMode) {
      shell.style.setProperty("--minimal-clock-scale", "0.56");
      shell.style.setProperty("--island-pan-x", "0px");
      shell.style.setProperty("--island-pan-y", "0px");
      shell.style.setProperty("--island-zoom", "1");
      shell.style.setProperty("--minimal-clock-left", "28px");
      shell.style.setProperty("--minimal-clock-top", "83%");
    }
  }, [isMinimalMode]);

  useEffect(() => {
    if (!session?.active) {
      return;
    }
    if (getRemainingMs(session, nowMs) <= 0) {
      const baseRewards = getSessionRewards(session.actionType, session.durationMin);
      const scaledRewards = scaleRewardsForLevel(baseRewards, progression.level);
      if (scaledRewards.length > 0) {
        setInventory((prev) => {
          const next = grantResources(prev, scaledRewards);
          persistInventory(next);
          return next;
        });
      }

      const expGain = getSessionExp(session.durationMin);
      if (expGain > 0) {
        setProgression((previous) => {
          const { next } = awardExp(previous, expGain);
          persistProgression(next);
          return next;
        });

        setExpGainPulse(true);
        if (expGainPulseTimerRef.current !== null) {
          window.clearTimeout(expGainPulseTimerRef.current);
        }
        expGainPulseTimerRef.current = window.setTimeout(() => {
          setExpGainPulse(false);
          expGainPulseTimerRef.current = null;
        }, XP_GAIN_PULSE_MS);
      }

      setActionStats((prev) => {
        const updated = addActionTime(prev, session.actionType, session.durationMin * 60_000);
        persistActionStats(updated);
        return updated;
      });

      if (
        (session.actionType === "woodcutting" || session.actionType === "harvesting") &&
        miniActionTileRef.current
      ) {
        const { gx, gy, originalType, islandId } = miniActionTileRef.current;
        const setter =
          islandId === "mining" ? setMiningIsland :
          islandId === "farming" ? setFarmingIsland :
          setCustomIsland;

        setter((prev) => {
          const next = updateTile(prev, gx, gy, { type: "dirt" });
          if (islandId === "custom") persistCustomIsland(next);
          else persistIslandOverride(islandId, next);
          return next;
        });

        if (regrowTimerRef.current !== null) {
          window.clearTimeout(regrowTimerRef.current);
        }
        regrowTimerRef.current = window.setTimeout(() => {
          regrowTimerRef.current = null;
          setter((prev) => {
            const next = updateTile(prev, gx, gy, { type: originalType });
            if (islandId === "custom") persistCustomIsland(next);
            else persistIslandOverride(islandId, next);
            return next;
          });
        }, 5_000);

        miniActionTileRef.current = null;
      }

      if (session.pomodoroMode) {
        const nextPhase = advancePomodoroPhase(session);
        if (nextPhase) {
          setSession(nextPhase);
          persistSession(nextPhase);
        } else {
          setSession(null);
          persistSession(null);
        }
      } else {
        setSession(null);
        persistSession(null);
      }
    }
  }, [nowMs, session, progression.level, selectedIslandId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      let handled = false;

      if (event.key === "Escape") {
        if (tpsModeActive && tpsNpcDialogueDismissRef.current?.()) {
          handled = true;
        }
        if (!handled && pendingPoiAction) {
          setPendingPoiAction(null);
          handled = true;
        }
        if (!handled && cloneState) {
          cancelDirectionalClone();
          handled = true;
        }
        if (!handled && selectedTileForEditRef.current) {
          selectedTileForEditRef.current = null;
          setSelectedTileForEdit(null);
          handled = true;
        }
        if (!handled && session?.active) {
          setSession(null);
          persistSession(null);
          setSelectedSection("Main Menu");
          handled = true;
        }
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const target = event.target as HTMLElement | null;
        const isInputFocused =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          (target?.isContentEditable ?? false);
        if (!isInputFocused) {
          if (debugMode && debugSelectedTileId) {
            handleDebugDeleteTile();
            handled = true;
          } else if (!debugMode && editSelectedTileId && isCustomEditing) {
            handleEditDeleteTile();
            handled = true;
          }
        }
      }

      if (handled) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    cancelDirectionalClone,
    cloneState,
    debugMode,
    debugSelectedTileId,
    editSelectedTileId,
    handleDebugDeleteTile,
    handleEditDeleteTile,
    isCustomEditing,
    session?.active,
    tpsModeActive,
  ]);

  useEffect(() => {
    if (windowMode !== "compact" && isMinimalMode) {
      setIsMinimalMode(false);
    }
  }, [windowMode, isMinimalMode]);

  useEffect(() => {
    if (windowMode !== "compact" && isInventoryOverlayOpen) {
      setIsInventoryOverlayOpen(false);
    }
  }, [windowMode, isInventoryOverlayOpen]);

  useEffect(() => {
    const editModeActive =
      selectedIslandId === "custom" &&
      windowMode === "expanded" &&
      !isMinimalMode &&
      selectedTileType === null &&
      !eraseMode;
    if (!editModeActive && selectedTileForEditRef.current) {
      selectedTileForEditRef.current = null;
      setSelectedTileForEdit(null);
    }
    if (!editModeActive) {
      handleBlockedTarget(null);
    }
  }, [selectedIslandId, windowMode, isMinimalMode, selectedTileType, eraseMode, handleBlockedTarget]);

  useEffect(() => {
    if (!cloneState) {
      return;
    }

    const sourceTile = customIsland.tiles.find((tile) => tile.id === cloneState.sourceTileId) ?? null;
    const shouldCancel =
      !isCustomEditing ||
      selectedIslandId !== "custom" ||
      selectedTileType !== null ||
      eraseMode ||
      !editSelectedTileId ||
      editSelectedTileId !== cloneState.sourceTileId ||
      !sourceTile ||
      !canDirectionalCloneTile(sourceTile);

    if (shouldCancel) {
      cancelDirectionalClone();
    }
  }, [
    cancelDirectionalClone,
    cloneState,
    customIsland,
    editSelectedTileId,
    eraseMode,
    isCustomEditing,
    selectedIslandId,
    selectedTileType,
  ]);

  const handleToggleCompact = (): void => {
    if (isWindowAnimating) {
      return;
    }

    const currentMode = windowMode;
    const nextMode: WindowMode = windowMode === "expanded" ? "compact" : "expanded";
    const nextSize = nextMode === "compact" ? COMPACT_WINDOW_SIZE : EXPANDED_WINDOW_SIZE;
    const appWindow = getCurrentWindow();
    const startSize = {
      width: Math.max(320, Math.round(window.innerWidth)),
      height: Math.max(320, Math.round(window.innerHeight)),
    };

    setIsWindowAnimating(true);
    setWindowResizeTarget(nextMode);
    if (nextMode !== "compact" && isMinimalMode) {
      setIsMinimalMode(false);
    }
    void appWindow
      .unmaximize()
      .catch(() => {
        // no-op
      })
      .then(() => animateWindowResize(appWindow, startSize, nextSize, 460))
      .then(() => {
        setWindowMode(nextMode);
        if (nextMode !== "compact") {
          setIsMinimalMode(false);
        }
      })
      .catch(() => {
        console.warn("Skyhaven: failed to toggle compact window size.");
        setWindowMode(currentMode);
      })
      .finally(() => {
        setIsWindowAnimating(false);
        setWindowResizeTarget(null);
      });
  };

  const handleToggleMinimalMode = (): void => {
    if (windowMode !== "compact" || isWindowAnimating) {
      return;
    }
    setIsMinimalMode((previous) => {
      const next = !previous;
      if (next) {
        setIsInventoryOverlayOpen(false);
      }
      return next;
    });
  };

  const handleToggleFullscreen = (): void => {
    if (isWindowAnimating) return;
    const appWindow = getCurrentWindow();
    const next = !isFullscreen;
    void appWindow.setFullscreen(next).then(() => {
      setIsFullscreen(next);
      if (next && windowMode === "compact") {
        setWindowMode("expanded");
        setIsMinimalMode(false);
      }
    }).catch(() => {
      console.warn("Skyhaven: fullscreen toggle failed.");
    });
  };

  const handleMenuToggle = (): void => {
    if (windowMode !== "compact" || isMinimalMode) {
      return;
    }
    setIsInventoryOverlayOpen((prev) => !prev);
  };

  const handleTileAction = useCallback(
    (actionType: "woodcutting" | "harvesting", tileGx: number, tileGy: number) => {
      if (session) return;
      const tile = island.tiles.find((t) => t.gx === tileGx && t.gy === tileGy);
      if (!tile) return;
      miniActionTileRef.current = { gx: tileGx, gy: tileGy, originalType: tile.type, islandId: selectedIslandId };
      const now = Date.now();
      const DEV_DURATION_MS = 5_000; // 5 seconds for testing
      const newSession: FocusSession = {
        active: true,
        actionType,
        startedAt: now,
        endsAt: now + DEV_DURATION_MS,
        durationMin: MINI_ACTION_DURATION,
      };
      setSession(newSession);
      persistSession(newSession);
    },
    [session, island, selectedIslandId],
  );

  const handlePoiActionRequest = useCallback((request: PoiActionRequest) => {
    if (session?.active) return;
    setPendingPoiAction(request);
    setIsInventoryOverlayOpen(false);
  }, [session]);

  const handleClosePoiAction = useCallback(() => {
    setPendingPoiAction(null);
  }, []);

  const handleStartPoiAction = useCallback((durationMin: FocusDuration) => {
    if (!pendingPoiAction || session?.active) return;
    const nextSession = startSession(pendingPoiAction.actionType, durationMin, Date.now(), {
      sourceIslandId: pendingPoiAction.islandId,
      sourcePoiType: pendingPoiAction.tileType,
      sourceTileGx: pendingPoiAction.tileGx,
      sourceTileGy: pendingPoiAction.tileGy,
      anchorGx: pendingPoiAction.anchorGx,
      anchorGy: pendingPoiAction.anchorGy,
      facingAngle: pendingPoiAction.facingAngle,
    });
    setSession(nextSession);
    persistSession(nextSession);
    setPendingPoiAction(null);
  }, [pendingPoiAction, session]);

  const handleCancelMiniAction = useCallback(() => {
    if (!session) return;
    if (session.actionType !== "woodcutting" && session.actionType !== "harvesting") return;
    miniActionTileRef.current = null;
    setSession(null);
    persistSession(null);
  }, [session]);

  const handleSelectSection = (section: SidebarSection): void => {
    setSelectedSection((previous) => (previous === section ? null : section));
    setIsInventoryOverlayOpen(false);
    setIsProfileOpen(false);
  };

  const handleMoveProfileItem = useCallback((from: EquipmentSlotRef, to: EquipmentSlotRef) => {
    setEquipment((previous) => {
      const next = moveEquipmentItem(previous, from, to);
      persistEquipment(next);
      return next;
    });
  }, []);

  const handleCycleIsland = useCallback(
    (direction: -1 | 1): void => {
      selectedTileForEditRef.current = null;
      setSelectedTileForEdit(null);
      handleBlockedTarget(null);
      setSelectedIslandId((previous) => {
        const currentIndex = islandOrder.indexOf(previous);
        if (currentIndex < 0) {
          return islandOrder[0];
        }
        const nextIndex = (currentIndex + direction + islandOrder.length) % islandOrder.length;
        return islandOrder[nextIndex];
      });
      setIsInventoryOverlayOpen(false);
    },
    [islandOrder, handleBlockedTarget]
  );

  const handleCloseWindow = (): void => {
    void getCurrentWindow().close().catch(() => {
      console.warn("Skyhaven: failed to close window.");
    });
  };

  const activeAction = session?.active ? session.actionType : null;
  const activePoiSession =
    session?.active &&
    (session.actionType === "mining" ||
      session.actionType === "farming" ||
      session.actionType === "magic" ||
      session.actionType === "fight") &&
    session.anchorGx != null &&
    session.anchorGy != null
      ? session
      : null;
  const remainingMs = session?.active ? getRemainingMs(session, nowMs) : 0;
  const countdownText = formatDurationHms(remainingMs);
  const pomodoroLabel = session?.pomodoroMode
    ? session.pomodoroPhase === "work"
      ? `POMODORO ${session.pomodoroRound}/${session.pomodoroTotalRounds}`
      : session.pomodoroPhase === "break"
        ? "SHORT BREAK"
        : "LONG BREAK"
    : null;
  const statusText = noResourcesHint
    ? "Not enough resources!"
    : pomodoroLabel
      ? `${pomodoroLabel} - ${(activeAction ?? "").toUpperCase()}`
      : activeAction
        ? `${activeAction.toUpperCase()}...`
        : "IDLE";
  const expLevel = progression.level;
  const expIsMaxLevel = progression.level >= LEVEL_CAP;
  const expMax = xpToNextLevel(progression.level);
  const expCurrent = expIsMaxLevel ? expMax : progression.expInLevel;
  const frameBackground =
    windowMode === "compact"
      ? SKYHAVEN_SPRITE_MANIFEST.ui.compactBackground ?? SKYHAVEN_SPRITE_MANIFEST.ui.background
      : sceneLightingAmbiance === "night"
        ? DEBUG_NIGHT_SKY_BG_URL
        : SKYHAVEN_SPRITE_MANIFEST.ui.background;

  return (
    <div className="skyhaven-shell" ref={shellRef}>
      <div
        ref={frameRef}
        className={`skyhaven-frame ${windowMode === "compact" ? "is-compact" : "is-expanded"} ${
          isWindowAnimating ? "is-window-animating" : ""
        } ${windowResizeTarget ? `resize-to-${windowResizeTarget}` : ""} ${isMinimalMode ? "is-minimal" : ""} ${
          isAppEntering ? "is-app-entering" : ""
        } ${isFullscreen ? "is-fullscreen" : ""} ${
          windowMode === "expanded" && selectedIslandId === "custom" && selectedSection === "Toolbox"
            ? "is-toolbox-open"
            : ""
        }`}
      >
        <img className="frame-bg" src={frameBackground} alt="" />

        <ClockOverlay timeText={countdownText} compact={windowMode === "compact"} minimal={isMinimalMode} />
        <div
          className="island-canvas"
          data-no-window-drag={
            debugMode ||
            tpsModeActive ||
            (selectedIslandId === "custom" &&
              windowMode === "expanded" &&
              !isMinimalMode &&
              (selectedTileType !== null ||
                eraseMode ||
                selectedTileForEdit !== null ||
                isCustomEditing))
              ? "true"
              : undefined
          }
          style={{ width: "100%", height: "100%" }}
        >
          <Canvas
            shadows
            gl={{ antialias: true, alpha: true }}
            onCreated={(state) => {
              state.gl.shadowMap.enabled = true;
              state.gl.shadowMap.type = THREE.BasicShadowMap;
            }}
            style={{ width: "100%", height: "100%", background: "transparent" }}
          >
            <IslandScene
              island={debugMode && debugIsland ? debugIsland : island}
              islandLighting={sceneIslandLighting}
              lightingAmbiance={sceneLightingAmbiance}
              selectedIslandId={selectedIslandId}
              buildMode={selectedIslandId === "custom" && selectedTileType !== null}
              eraseMode={selectedIslandId === "custom" && eraseMode}
              selectedTileType={selectedTileType}
              selectedTileForEdit={selectedTileForEdit}
              characterActive={true}
              onPlaceTile={handlePlaceTile}
              onRemoveTile={handleRemoveTile}
              onSelectTileForEdit={handleSelectTileForEdit}
              onClearTileForEdit={handleDeselectTileForEdit}
              onTileEditAnchorChange={handleTileEditAnchorChange}
              blockedTargetCell={blockedTargetCell}
              cloneState={cloneState}
              clonePreviewCells={clonePreviewCells}
              cloneBlockedCell={cloneBlockedCell}
              onCloneHoverChange={handleCloneHoverChange}
              onCloneTarget={handleConfirmLineCloneTarget}
              debugMode={debugMode}
              debugGizmoMode={debugGizmoMode}
              onDebugTileSelect={handleDebugTileSelect}
              debugSelectedTileId={debugSelectedTileId}
              debugBatchSelectionIds={debugBatchSelectionIdArray}
              debugSurfaceTargetTileIds={debugSurfaceAuditTargetTileIds}
              debugSurfaceVizMode={debugSurfaceVizMode}
              debugBatchPickMode={debugBatchPickMode}
              onDebugBatchTileToggle={handleDebugBatchTileToggle}
              onDebugTileChange={handleDebugTileChange}
              debugPlacementType={debugPlacementType}
              onDebugPlaceTile={handleDebugPlaceTile}
              onDebugDraggingChange={handleDebugDraggingChange}
              debugUniformScale={debugUniformScale}
              editMode={sceneEditMode}
              editGizmoMode={editGizmoMode}
              editSelectedTileId={editSelectedTileId}
              onEditTileSelect={handleEditTileSelect}
              onEditTileDeselect={handleEditTileDeselect}
              onEditTileChange={handleEditTileChange}
              onEditDraggingChange={handleEditDraggingChange}
              editUniformScale={editUniformScale}
              editingDecoration={editingDecoration}
              onEditDecoChange={handleEditDecoChange}
              onTileAction={handleTileAction}
              onPoiActionRequest={handlePoiActionRequest}
              onCancelMiniAction={handleCancelMiniAction}
              poiMenuOpen={pendingPoiAction != null}
              activePoiSession={activePoiSession}
              isMiniActionActive={session?.actionType === "woodcutting" || session?.actionType === "harvesting"}
              onRuneVfxToggle={handleRuneVfxToggle}
              onOpenCharacterSelect={() => setCharacterSelectOpen(true)}
              playableVariant={playableCharacterId}
              equippedRightHand={equipment.equippedRightHand}
              onTpsModeChange={setTpsModeActive}
              onLuxTpsDialogueChange={handleLuxTpsDialogueChange}
              tpsNpcDialogueDismissRef={tpsNpcDialogueDismissRef}
              playerSfxVolume={sfxVolume}
              showVignette={(windowMode === "expanded" || isFullscreen) && !isMinimalMode}
              movementDebugRef={characterMovementDebugRef}
            />
          </Canvas>
        </div>
        <LuxTpsDialogueOverlay open={luxTpsDialogue.open} text={luxTpsDialogue.text} />
        <CanvasGizmoSheet
          selectedTile={debugMode ? activeDebugTile : activeEditTile}
          gizmoMode={debugMode ? debugGizmoMode : editGizmoMode}
          onGizmoModeChange={debugMode ? setDebugGizmoMode : setEditGizmoMode}
          onRotate={debugMode ? handleDebugRotateTile : handleEditRotateTile}
          onCopy={debugMode ? handleCopyTransform : handleToggleLineClone}
          onDelete={debugMode ? handleDebugDeleteTile : handleEditDeleteTile}
          onToggleBlocked={debugMode ? handleDebugToggleBlocked : handleEditToggleBlocked}
          onToggleVfx={debugMode ? undefined : handleEditToggleVfx}
          onUndo={debugMode ? handleDebugUndo : handleBuildUndo}
          canUndo={debugMode ? debugCanUndo : buildCanUndo}
          uniformScale={debugMode ? debugUniformScale : editUniformScale}
          onUniformScaleChange={debugMode ? setDebugUniformScale : setEditUniformScale}
          editingDecoration={debugMode ? false : editingDecoration}
          onEditingDecorationChange={debugMode ? undefined : setEditingDecoration}
          cloneState={debugMode ? null : cloneState}
          cloneEligible={debugMode ? true : cloneEligible}
          cloneDisabledReason={debugMode ? null : cloneDisabledReason}
          isDragging={debugMode ? debugGizmoDragging : editGizmoDragging}
          contextLabel={debugMode ? "Debug Canvas Editor" : "Canvas Editor"}
        />
        {debugMode && (
          <DebugDock
            selectedTile={activeDebugTile}
            debugPlacementType={debugPlacementType}
            onDebugPlacementTypeChange={setDebugPlacementType}
            surfaceVizMode={debugSurfaceVizMode}
            onSurfaceVizModeChange={setDebugSurfaceVizMode}
            surfaceScope={debugSurfaceScope}
            onSurfaceScopeChange={setDebugSurfaceScope}
            surfaceTypeFilter={debugSurfaceTypeFilter}
            surfaceTypeOptions={debugSurfaceTypeOptions}
            onSurfaceTypeFilterChange={setDebugSurfaceTypeFilter}
            surfaceValue={debugSurfaceControlValue}
            surfaceValueMixed={debugSurfaceValueMixed}
            surfaceTargetCount={debugSurfaceEditableTileIds.length}
            surfaceVisibleCount={debugIsland?.tiles.length ?? 0}
            batchPickMode={debugBatchPickMode}
            onBatchPickModeChange={setDebugBatchPickMode}
            batchSelectionCount={debugBatchSelectionIdArray.length}
            onSurfaceChangeStart={handleDebugSurfaceEditStart}
            onSurfaceChange={handleDebugLiveSurfaceChange}
            onSurfaceChangeEnd={handleDebugSurfaceEditEnd}
            onClearBatchSelection={handleDebugClearBatchSelection}
            onAddSameTypeToBatchSelection={handleDebugAddSameTypeToBatchSelection}
            onSelectAllBatchTiles={handleDebugSelectAllBatchTiles}
            onMatchSelectedSurface={handleDebugBatchMatchSelected}
            onResetSurfaceToAuto={handleDebugBatchResetToAuto}
            onCopyTransform={handleCopyTransform}
            onPasteTransform={handlePasteTransform}
            hasClipboard={debugClipboard !== null}
            onSave={handleDebugSave}
            onExitDebug={handleExitDebug}
            onDeselectTile={() => setDebugSelectedTileId(null)}
            isDragging={debugGizmoDragging}
            onExportJson={handleExportJson}
            canUndo={debugCanUndo}
            canRedo={debugCanRedo}
            onUndo={handleDebugUndo}
            onRedo={handleDebugRedo}
            islandLighting={sceneIslandLighting}
            onIslandLightingChange={setSceneIslandLighting}
            lightingAmbiance={sceneLightingAmbiance}
            onLightingAmbianceChange={setSceneLightingAmbiance}
          />
        )}

        <MovementDebugHud
          snapshotRef={characterMovementDebugRef}
          open={movementDebugHudOpen && windowMode === "expanded"}
        />
        {!debugMode && windowMode === "expanded" && !characterDebugOpen && (
          <div
            data-no-window-drag="true"
            style={{
              position: "absolute",
              bottom: 12,
              right: 12,
              zIndex: 200,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              pointerEvents: "auto",
            }}
          >
            <button
              data-no-window-drag="true"
              onClick={() => setMovementDebugHudOpen((v) => !v)}
              style={{
                background: movementDebugHudOpen ? "rgba(40, 56, 78, 0.92)" : "rgba(15, 20, 30, 0.85)",
                border: "1px solid rgba(136, 204, 255, 0.34)",
                borderRadius: 6,
                padding: "6px 14px",
                color: movementDebugHudOpen ? "#b8d8ff" : "#88ccff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(6px)",
              }}
            >
              {movementDebugHudOpen ? "Hide anim debug" : "Anim debug"}
            </button>
            <button
              data-no-window-drag="true"
              onClick={() => {
                setCharacterSelectOpen(false);
                setIsProfileOpen(false);
                setIsPlannerOpen(false);
                setCharacterDebugOpen(true);
              }}
              style={{
                background: "rgba(15, 20, 30, 0.85)",
                border: "1px solid rgba(255, 211, 107, 0.34)",
                borderRadius: 6,
                padding: "6px 14px",
                color: "#ffd36b",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(6px)",
              }}
            >
              Character Debug
            </button>
            <button
              data-no-window-drag="true"
              onClick={() => {
                const snapshot = { ...islandsById[selectedIslandId], tiles: [...islandsById[selectedIslandId].tiles] };
                debugIslandRef.current = snapshot;
                setDebugIsland(snapshot);
                debugUndoStackRef.current = [];
                debugRedoStackRef.current = [];
                setDebugCanUndo(false);
                setDebugCanRedo(false);
                setDebugSelectedTileId(null);
                setDebugBatchSelectionIds(new Set());
                setDebugSurfaceScope("all");
                setDebugSurfaceVizMode("single");
                setDebugSurfaceTypeFilter(null);
                setDebugBatchPickMode(false);
                debugSurfaceEditSessionRef.current.active = false;
                debugSurfaceEditSessionRef.current.pushed = false;
                setDebugPlacementType(null);
                setCharacterDebugOpen(false);
                setDebugMode(true);
                setSelectedTileForEdit(null);
                setSelectedTileType(null);
                setEraseMode(false);
              }}
              style={{
                background: "rgba(15, 20, 30, 0.85)",
                border: "1px solid rgba(136, 204, 255, 0.3)",
                borderRadius: 6,
                padding: "6px 14px",
                color: "#88ccff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                backdropFilter: "blur(6px)",
              }}
            >
              Debug Mode
            </button>
          </div>
        )}

        <CompactInventoryOverlay open={windowMode === "compact" && !isMinimalMode && isInventoryOverlayOpen} />
        <ProfileOverlay
          open={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          profile={profile}
          progression={progression}
          actionStats={actionStats}
          inventory={inventory}
          equipmentState={equipment}
          playableVariant={playableCharacterId}
          onMoveItem={handleMoveProfileItem}
        />
        <CharacterDebugOverlay
          open={characterDebugOpen}
          onClose={() => setCharacterDebugOpen(false)}
          currentPlayableVariant={playableCharacterId}
          equippedRightHand={equipment.equippedRightHand}
        />
        <CharacterSelectOverlay
          open={characterSelectOpen}
          onClose={() => setCharacterSelectOpen(false)}
          homeIsland={customIsland}
          selectedId={playableCharacterId}
          onSelect={(id) => {
            setPlayableCharacterId(id);
            persistPlayableCharacter(id);
          }}
        />
        <PlannerOverlay
          open={isPlannerOpen}
          onClose={() => setIsPlannerOpen(false)}
          quests={dailyQuests}
          onQuestsChange={(next) => { setDailyQuests(next); persistQuests(next); }}
          onQuestCompleted={(_quest, xp) => {
            if (xp > 0) {
              setProgression((prev) => {
                const { next } = awardExp(prev, xp);
                persistProgression(next);
                return next;
              });
              setExpGainPulse(true);
              if (expGainPulseTimerRef.current !== null) {
                window.clearTimeout(expGainPulseTimerRef.current);
              }
              expGainPulseTimerRef.current = window.setTimeout(() => {
                setExpGainPulse(false);
                expGainPulseTimerRef.current = null;
              }, XP_GAIN_PULSE_MS);
            }
          }}
        />
        <PoiActionOverlay
          open={pendingPoiAction != null}
          request={pendingPoiAction}
          onClose={handleClosePoiAction}
          onStart={handleStartPoiAction}
        />

        <Hud
          expLevel={expLevel}
          expCurrent={expCurrent}
          expMax={expMax}
          expIsMaxLevel={expIsMaxLevel}
          expGainPulse={expGainPulse}
        />

        {!debugMode && (
          <Sidebar
            selectedSection={selectedSection}
            onSelectSection={handleSelectSection}
            selectedIslandId={selectedIslandId}
            islandPreviewById={islandPreviewById}
            islandNameById={islandNameById}
            onCycleIsland={handleCycleIsland}
            windowMode={windowMode}
            inventory={inventory}
            selectedTileType={selectedTileType}
            onSelectTile={setSelectedTileType}
            eraseMode={eraseMode}
            onEraseModeChange={setEraseMode}
            onInventoryReset={() => setInventory(resetInventoryToStarter())}
            onDebugAddResources={() => setInventory(addDebugResources(inventory))}
            isDragging={debugGizmoDragging || editGizmoDragging}
            editSelectedTile={activeEditTile}
            editGizmoMode={editGizmoMode}
            onEditGizmoModeChange={setEditGizmoMode}
            onEditRotate={handleEditRotateTile}
            onEditDelete={handleEditDeleteTile}
            onEditToggleBlocked={handleEditToggleBlocked}
            onEditCopyScale={handleToggleLineClone}
            editUniformScale={editUniformScale}
            onEditUniformScaleChange={setEditUniformScale}
            musicEnabled={musicEnabled}
            onMusicEnabledChange={setMusicEnabled}
            musicTrackIndex={musicTrackIndex}
            onMusicPrev={() => {
              setMusicTrackIndex((i) => (i - 1 + MUSIC_PLAYLIST_LENGTH) % MUSIC_PLAYLIST_LENGTH);
              setMusicEnabled(true);
            }}
            onMusicNext={() => {
              setMusicTrackIndex((i) => (i + 1) % MUSIC_PLAYLIST_LENGTH);
              setMusicEnabled(true);
            }}
            masterVolume={masterVolume}
            onMasterVolumeChange={setMasterVolume}
            musicVolume={musicVolume}
            onMusicVolumeChange={setMusicVolume}
            sfxVolume={sfxVolume}
            onSfxVolumeChange={setSfxVolume}
            menuSfxVolume={menuSfxVolume}
            onMenuSfxVolumeChange={setMenuSfxVolume}
            onProfileOpen={() => { setIsProfileOpen(true); setIsInventoryOverlayOpen(false); }}
            onDailyQuestsOpen={() => { setIsPlannerOpen(true); setIsInventoryOverlayOpen(false); }}
            onBuildUndo={handleBuildUndo}
            buildCanUndo={buildCanUndo}
            editingDecoration={editingDecoration}
            onEditingDecorationChange={setEditingDecoration}
            cloneState={cloneState}
            cloneEligible={cloneEligible}
            cloneDisabledReason={cloneDisabledReason}
          />
        )}

        <StatusTag text={statusText} />
        <WindowChrome
          onToggleCompact={handleToggleCompact}
          onToggleMinimal={handleToggleMinimalMode}
          onToggleFullscreen={handleToggleFullscreen}
          onClose={handleCloseWindow}
          onMenu={handleMenuToggle}
          menuActive={windowMode === "compact" && !isMinimalMode && isInventoryOverlayOpen}
          isBusy={isWindowAnimating}
          minimalMode={isMinimalMode}
          showMinimalToggle={windowMode === "compact" || isMinimalMode}
          isFullscreen={isFullscreen}
          showFullscreenToggle={windowMode === "expanded" && !isMinimalMode}
        />

        <div className="frame-border" aria-hidden />
      </div>
    </div>
  );
}

function scaleResourceAmounts(cost: ResourceAmount[], factor: number): ResourceAmount[] {
  if (factor <= 0) {
    return [];
  }

  return cost.map((entry) => ({
    resourceId: entry.resourceId,
    amount: entry.amount * factor,
  }));
}

async function animateWindowResize(
  appWindow: ReturnType<typeof getCurrentWindow>,
  from: { width: number; height: number },
  to: { width: number; height: number },
  durationMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAtMs = performance.now();
    let running = true;
    let settled = false;
    let frameHandle = 0;
    let lastApplied = { width: from.width, height: from.height };
    let pendingSize: { width: number; height: number } | null = null;
    let inFlight = false;
    let finalRequested = false;
    let lastPushAt = startedAtMs - 34;
    const pushIntervalMs = 1000 / 30;

    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      running = false;
      window.cancelAnimationFrame(frameHandle);
      reject(error);
    };

    const maybeResolve = (): void => {
      if (!finalRequested || inFlight || pendingSize || settled) {
        return;
      }
      settled = true;
      resolve();
    };

    const flushPendingSize = (): void => {
      if (!running || settled || inFlight || !pendingSize) {
        maybeResolve();
        return;
      }
      const next = pendingSize;
      pendingSize = null;
      if (!next) {
        maybeResolve();
        return;
      }
      if (next.width === lastApplied.width && next.height === lastApplied.height) {
        flushPendingSize();
        return;
      }
      inFlight = true;
      void appWindow
        .setSize(new LogicalSize(next.width, next.height))
        .then(() => {
          lastApplied = next;
        })
        .catch((error) => {
          fail(error);
        })
        .finally(() => {
          inFlight = false;
          flushPendingSize();
        });
    };

    const enqueueSize = (width: number, height: number, force = false): void => {
      if (!force && width === lastApplied.width && height === lastApplied.height) {
        return;
      }
      pendingSize = { width, height };
      flushPendingSize();
    };

    const step = (): void => {
      if (!running || settled) {
        return;
      }

      const now = performance.now();
      const elapsed = now - startedAtMs;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeInOutQuint(t);
      const width = Math.round(lerp(from.width, to.width, eased));
      const height = Math.round(lerp(from.height, to.height, eased));

      if (now - lastPushAt >= pushIntervalMs || t >= 1) {
        lastPushAt = now;
        enqueueSize(width, height);
      }

      if (t < 1) {
        frameHandle = window.requestAnimationFrame(step);
        return;
      }

      finalRequested = true;
      enqueueSize(to.width, to.height, true);
      running = false;
      maybeResolve();
    };

    frameHandle = window.requestAnimationFrame(step);
  });
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}
