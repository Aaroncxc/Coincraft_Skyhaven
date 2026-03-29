import { Environment, Preload, useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette, FXAA, Outline } from "@react-three/postprocessing";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { SKYHAVEN_SPRITE_MANIFEST } from "../assets";
import { IslandCamera } from "./IslandCamera";
import { TileModel } from "./TileModel";
import { CharacterModel } from "./CharacterModel";
import { SkullyCompanion } from "./SkullyCompanion";
import { MiningManNPC } from "./MiningManNPC";
import { MagicManNPC } from "./MagicManNPC";
import { FightManNPCWithSuspense } from "./FightManNPC";
import { EnemyRobot } from "./EnemyRobot";
import { pickRandomLuxFightLine } from "../npcDialogue";
import { SpeechBubble } from "./SpeechBubble";
import {
  useCharacterMovement,
  findNearbyInteractable,
  findNearbyRuneTile,
  findNearbyAncientTempleTile,
  buildTileTypeMap,
  type CharacterMovementDebugSnapshot,
  type PlayerAttackSnapshot,
  type SpellCastEvent,
  type TpsCameraState,
} from "./useCharacterMovement";
import { InteractPrompt } from "./InteractPrompt";
import { GhostPreview } from "./GhostPreview";
import { TilePlaceParticles } from "./TilePlaceParticles";
import { AmbientParticles } from "./AmbientParticles";
import { ChopParticles } from "./ChopParticles";
import { SpellParticles } from "./SpellParticles";
import { MagicTowerParticles } from "./MagicTowerParticles";
import { MagicTowerHoverSfx } from "./MagicTowerHoverSfx";
import { TorchBurnLoopSfx } from "./TorchBurnLoopSfx";
import { FpsReporter } from "./FpsReporter";
import { WorldParticles, getParticleTileWorldXZ, BUBBLING_DEFAULT_SPAWN_Y } from "./WorldParticles";
import { TileHighlight } from "./TileHighlight";
import { DebugTileWrapper } from "./DebugTileWrapper";
import { IslandCloudDeck } from "./IslandCloudDeck";
import { ALL_GAME_FBX_PATHS, ALL_GAME_GLTF_PATHS, TILE_UNIT_SIZE } from "./assets3d";
import { FBXLoader } from "./fbxLoader";
import type { CameraOccluderEntry } from "./cameraOcclusion";
import { GltfEmissiveSanitize } from "./GltfEmissiveSanitize";
import {
  type IslandLightingAmbiance,
  type IslandLightingParams,
  type DayNightVisualSnapshot,
  DEFAULT_DAY_NIGHT_CYCLE_PERIOD_SEC,
  DEFAULT_ISLAND_LIGHTING,
  NIGHT_ISLAND_LIGHTING,
  blendDayNightColors,
  dayNightPhaseFromTime,
  getDayNightVisualSnapshot,
  nightBlendFromPhase,
  sampleDayLightColors,
  samplePostProcessForNightBlend,
  sunPositionFromAngles,
} from "./islandLighting";
import {
  buildIslandSurfaceData,
  getSurfaceYAtCell,
  DEFAULT_WALK_SURFACE_OFFSET_Y,
  getTileCollisionProfile,
  getTileOriginY,
} from "./islandSurface";
import { MINE_TILES, DECORATION_TILES, NO_DECORATION_TILES } from "../types";
import type { PlayableCharacterId } from "../playableCharacters";
import { findNearbyPoiAction, type PoiActionRequest } from "../poiActions";
import type { FocusSession } from "../types";
import type { AttachmentLoadout, EquippableItemId } from "../equipment";

/** Well tiles: brighter HDR bubbles + bloom + point fill */
const WELL_BUBBLE_COUNT = 56;
const WELL_BUBBLE_SIZE = 0.085;
const WELL_BUBBLE_COLOR = 0xb8f8ff;
const WELL_BUBBLE_LUMINANCE_BOOST = 3.6;
/** Per-well cyan fill; placed at same XZ/Y as bubbling particles (`getParticleTileWorldXZ`, `BUBBLING_DEFAULT_SPAWN_Y`). */
const WELL_GLOW_POINT_INTENSITY = 2.4;
const WELL_GLOW_POINT_DISTANCE = 5.5;

/** Rune: helix VFX (not bubbling like wells); sits higher above the tile. */
const RUNE_HELIX_COUNT = 46;
const RUNE_HELIX_SIZE = 0.074;
const RUNE_HELIX_LUMINANCE_BOOST = 3.55;
const RUNE_VFX_OFFSET_Y = 1.1;
const RUNE_GLOW_POINT_Y = 1.18;
const RUNE_GLOW_POINT_INTENSITY = 2.55;
const RUNE_GLOW_POINT_DISTANCE = 5.75;
const RUNE_HELIX_COLOR_CYCLE = { from: 0xffcc55, to: 0xcc2200, periodSec: 7 } as const;
const HOVER_OUTLINE_SELECTION_LAYER = 10;

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function MouseGroundTracker({
  mouseGroundRef,
  tpsCameraStateRef,
  groundY,
}: {
  mouseGroundRef: MutableRefObject<THREE.Vector3 | null>;
  tpsCameraStateRef: MutableRefObject<TpsCameraState>;
  groundY: number;
}) {
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const hitVec = useRef(new THREE.Vector3());
  const centerNdc = useMemo(() => new THREE.Vector2(0, 0), []);
  const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY));
  /** After IslandCamera (-1), before character movement (0): same-frame pointer ray for iso + fresh hit after TPS toggle. */
  useFrame((state) => {
    planeRef.current.set(new THREE.Vector3(0, 1, 0), -groundY);
    raycaster.setFromCamera(tpsCameraStateRef.current.active ? centerNdc : state.pointer, camera);
    if (raycaster.ray.intersectPlane(planeRef.current, hitVec.current)) {
      mouseGroundRef.current = hitVec.current.clone();
    } else {
      mouseGroundRef.current = null;
    }
  }, -0.5);
  return null;
}
import type { IslandMap, AssetKey, CloneLineState, TileDef } from "../types";
import type { TileEditAnchor } from "../useSkyhavenLoop";
import { useThree, useFrame, type ThreeEvent } from "@react-three/fiber";

export type IslandSceneProps = {
  island: IslandMap;
  selectedIslandId?: string;
  buildMode?: boolean;
  eraseMode?: boolean;
  selectedTileType?: AssetKey | null;
  selectedTileForEdit?: { gx: number; gy: number } | null;
  characterActive?: boolean;
  onPlaceTile?: (gx: number, gy: number, type: AssetKey) => void;
  onRemoveTile?: (gx: number, gy: number) => void;
  onSelectTileForEdit?: (gx: number, gy: number) => void;
  onClearTileForEdit?: () => void;
  onTileEditAnchorChange?: (anchor: TileEditAnchor) => void;
  blockedTargetCell?: { gx: number; gy: number } | null;
  cloneState?: CloneLineState | null;
  clonePreviewCells?: Array<{ gx: number; gy: number }>;
  cloneBlockedCell?: { gx: number; gy: number } | null;
  onCloneHoverChange?: (cell: { gx: number; gy: number } | null) => void;
  onCloneTarget?: (gx: number, gy: number) => void;
  debugMode?: boolean;
  debugGizmoMode?: "translate" | "scale";
  onDebugTileSelect?: (tileId: string) => void;
  debugSelectedTileId?: string | null;
  debugBatchSelectionIds?: string[];
  debugSurfaceTargetTileIds?: string[];
  debugSurfaceVizMode?: "single" | "audit" | "off";
  debugBatchPickMode?: boolean;
  onDebugBatchTileToggle?: (tileId: string) => void;
  onDebugTileChange?: (
    tileId: string,
    pos3d: { x: number; y: number; z: number },
    scale3d: { x: number; y: number; z: number },
    rotY?: number,
  ) => void;
  debugPlacementType?: string | null;
  onDebugPlaceTile?: (gx: number, gy: number, modelKey: string) => void;
  onDebugDraggingChange?: (dragging: boolean) => void;
  debugUniformScale?: boolean;
  editMode?: boolean;
  editGizmoMode?: "translate" | "scale";
  editSelectedTileId?: string | null;
  onEditTileSelect?: (tileId: string) => void;
  onEditTileDeselect?: () => void;
  onEditTileChange?: (
    tileId: string,
    pos3d: { x: number; y: number; z: number },
    scale3d: { x: number; y: number; z: number },
    rotY?: number,
  ) => void;
  onEditDraggingChange?: (dragging: boolean) => void;
  editUniformScale?: boolean;
  editingDecoration?: boolean;
  onEditDecoChange?: (
    tileId: string,
    decoPos3d: { x: number; y: number; z: number },
    decoScale3d: { x: number; y: number; z: number },
    decoRotY: number,
  ) => void;
  onTileAction?: (actionType: "woodcutting" | "harvesting", tileGx: number, tileGy: number) => void;
  onPoiActionRequest?: (request: PoiActionRequest) => void;
  onCancelMiniAction?: () => void;
  poiMenuOpen?: boolean;
  activePoiSession?: FocusSession | null;
  isMiniActionActive?: boolean;
  onRuneVfxToggle?: (tileGx: number, tileGy: number) => void;
  /** E near Ancient Temple opens character roster (React overlay). */
  onOpenCharacterSelect?: () => void;
  /** Active playable skin; duplicate world NPC hidden when it matches. */
  playableVariant?: PlayableCharacterId;
  /** Current renderable item-to-socket loadout for hands and back sockets. */
  attachmentLoadout?: AttachmentLoadout;
  /** Equipped items affect combat locomotion and blocking input. */
  equippedMainHand?: EquippableItemId | null;
  equippedOffHand?: EquippableItemId | null;
  respawnToken?: number;
  onPlayerDamage?: (damage: number) => void;
  forceIsoToken?: number;
  /** Lightweight local halo around the player's axe; shared with previews. */
  axeGlowEnabled?: boolean;
  onTpsModeChange?: (active: boolean) => void;
  /** TPS + Lux (fight man) dialogue: drives DOM overlay in App. */
  onLuxTpsDialogueChange?: (payload: { open: boolean; text: string }) => void;
  /** App sets ESC handler; dismiss active mining/magic/fight NPC talk in TPS. Returns true if a dialogue was open. */
  tpsNpcDialogueDismissRef?: MutableRefObject<(() => boolean) | null>;
  /** 0–100; footstep SFX for the playable character (Sidebar SFX Vol). */
  playerSfxVolume?: number;
  /** 0–100; multiplied with SFX for spatial POI loops (e.g. magic tower hum). */
  masterVolume?: number;
  /** When true, vignette is shown (expanded/fullscreen only, not compact/transparent) */
  showVignette?: boolean;
  /** Sun + ambient/fill/env; in debug mode usually driven by sliders. */
  islandLighting?: IslandLightingParams;
  /** Day vs night look: moon colors, stronger POI lights, slightly punchier bloom. */
  lightingAmbiance?: IslandLightingAmbiance;
  /** When true, lerps day↔night from wall clock over `dayNightCyclePeriodSec` (seamless loop). */
  autoDayNightCycle?: boolean;
  /** Full cycle length in seconds (default 300 = 5 min). */
  dayNightCyclePeriodSec?: number;
  /** Filled each frame by `useCharacterMovement` when present (anim / chop / TPS input debug). */
  movementDebugRef?: MutableRefObject<CharacterMovementDebugSnapshot | null>;
  shadowsEnabled?: boolean;
  postProcessingEnabled?: boolean;
  cloudsEnabled?: boolean;
  debugShowFps?: boolean;
  fpsHudRef?: MutableRefObject<{ fps: number }>;
};

ALL_GAME_GLTF_PATHS.forEach((path) => useGLTF.preload(path));
ALL_GAME_FBX_PATHS.forEach((path) => useLoader.preload(FBXLoader, path));

const noopHover = (_id: string | null) => {};
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function StrongShadowRenderer({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.shadowMap.enabled = enabled;
    if (enabled) gl.shadowMap.type = THREE.BasicShadowMap;
  }, [gl, enabled]);
  return null;
}

function worldToGrid(worldX: number, worldZ: number): { gx: number; gy: number } {
  return {
    gx: Math.round(worldX / TILE_UNIT_SIZE),
    gy: Math.round(worldZ / TILE_UNIT_SIZE),
  };
}

export function getGridExtent(island: IslandMap): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  planeW: number;
  planeH: number;
  planeCx: number;
  planeCz: number;
} {
  if (!island.tiles.length) {
    const minX = -1 * TILE_UNIT_SIZE;
    const maxX = 5 * TILE_UNIT_SIZE;
    const minZ = -1 * TILE_UNIT_SIZE;
    const maxZ = 5 * TILE_UNIT_SIZE;
    return {
      minX, maxX, minZ, maxZ,
      planeW: maxX - minX,
      planeH: maxZ - minZ,
      planeCx: (minX + maxX) / 2,
      planeCz: (minZ + maxZ) / 2,
    };
  }
  let minGx = Infinity, maxGx = -Infinity, minGy = Infinity, maxGy = -Infinity;
  for (const t of island.tiles) {
    if (t.gx < minGx) minGx = t.gx;
    if (t.gx > maxGx) maxGx = t.gx;
    if (t.gy < minGy) minGy = t.gy;
    if (t.gy > maxGy) maxGy = t.gy;
  }
  const pad = 2;
  const minX = (minGx - pad) * TILE_UNIT_SIZE;
  const maxX = (maxGx + pad) * TILE_UNIT_SIZE;
  const minZ = (minGy - pad) * TILE_UNIT_SIZE;
  const maxZ = (maxGy + pad) * TILE_UNIT_SIZE;
  return {
    minX, maxX, minZ, maxZ,
    planeW: maxX - minX,
    planeH: maxZ - minZ,
    planeCx: (minX + maxX) / 2,
    planeCz: (minZ + maxZ) / 2,
  };
}

function GroundInteraction({
  island,
  buildMode,
  eraseMode,
  selectedTileType,
  selectedIslandId,
  onPlaceTile,
  onRemoveTile,
  onSelectTileForEdit,
  onClearTileForEdit,
  onEditTileDeselect,
  cloneState,
  onHoverChange,
  onGhostChange,
  onCloneHoverChange,
  onCloneTarget,
}: {
  island: IslandMap;
  buildMode: boolean;
  eraseMode: boolean;
  selectedTileType: AssetKey | null;
  selectedIslandId: string;
  onPlaceTile?: (gx: number, gy: number, type: AssetKey) => void;
  onRemoveTile?: (gx: number, gy: number) => void;
  onSelectTileForEdit?: (gx: number, gy: number) => void;
  onClearTileForEdit?: () => void;
  onEditTileDeselect?: () => void;
  cloneState?: CloneLineState | null;
  onHoverChange: (tileId: string | null) => void;
  onGhostChange: (cell: { gx: number; gy: number } | null) => void;
  onCloneHoverChange?: (cell: { gx: number; gy: number } | null) => void;
  onCloneTarget?: (gx: number, gy: number) => void;
}) {
  const { camera, gl } = useThree();
  const hoveredRef = useRef<string | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndcVec = useMemo(() => new THREE.Vector2(), []);
  const hitVec = useMemo(() => new THREE.Vector3(), []);

  const findTile = useCallback(
    (gx: number, gy: number): TileDef | null =>
      island.tiles.find((t) => t.gx === gx && t.gy === gy) ?? null,
    [island]
  );

  // Always raycast from pointer through camera onto y=0 plane so grid matches
  // cursor regardless of which mesh was hit first (avoids large mouse offset).
  const getGridFromEvent = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const canvas = gl.domElement;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      ndcVec.x = ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1;
      ndcVec.y = -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndcVec, camera);
      const hit = raycaster.ray.intersectPlane(groundPlane, hitVec);
      if (!hit) return null;
      return worldToGrid(hit.x, hit.z);
    },
    [camera, gl, raycaster, ndcVec, hitVec]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const grid = getGridFromEvent(e);
      if (!grid) {
        if (hoveredRef.current) {
          hoveredRef.current = null;
          onHoverChange(null);
        }
        onGhostChange(null);
        onCloneHoverChange?.(null);
        return;
      }

      const tile = findTile(grid.gx, grid.gy);
      const newId = tile?.id ?? null;
      if (newId !== hoveredRef.current) {
        hoveredRef.current = newId;
        onHoverChange(newId);
      }

      if (cloneState) {
        onCloneHoverChange?.(grid);
        onGhostChange(null);
      } else if (buildMode && selectedTileType) {
        onGhostChange(grid);
      } else {
        onGhostChange(null);
        onCloneHoverChange?.(null);
      }
    },
    [getGridFromEvent, findTile, buildMode, cloneState, selectedTileType, onHoverChange, onGhostChange, onCloneHoverChange]
  );

  const handleClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const grid = getGridFromEvent(e);
      if (!grid) return;

      const tile = findTile(grid.gx, grid.gy);
      const isEmpty = !tile;

      if (eraseMode) {
        if (tile) onRemoveTile?.(tile.gx, tile.gy);
        if (isEmpty) onEditTileDeselect?.();
        return;
      }

      if (cloneState) {
        if (isEmpty) {
          onCloneTarget?.(grid.gx, grid.gy);
        }
        return;
      }

      if (buildMode && selectedTileType) {
        const isDecoration = (DECORATION_TILES as readonly string[]).includes(selectedTileType);
        if (isDecoration) {
          if (tile && !(NO_DECORATION_TILES as readonly string[]).includes(tile.type) && !tile.decoration) {
            onPlaceTile?.(grid.gx, grid.gy, selectedTileType);
          }
        } else if (isEmpty) {
          onPlaceTile?.(grid.gx, grid.gy, selectedTileType);
          onEditTileDeselect?.();
        }
        return;
      }

      if (selectedIslandId === "custom" && !buildMode && !eraseMode) {
        if (tile) {
          onSelectTileForEdit?.(tile.gx, tile.gy);
        } else {
          onClearTileForEdit?.();
          onEditTileDeselect?.();
        }
      }
    },
    [getGridFromEvent, findTile, buildMode, eraseMode, cloneState, selectedTileType, selectedIslandId, onPlaceTile, onRemoveTile, onSelectTileForEdit, onClearTileForEdit, onEditTileDeselect, onCloneTarget]
  );

  const handlePointerLeave = useCallback(() => {
    if (hoveredRef.current) {
      hoveredRef.current = null;
      onHoverChange(null);
    }
    onGhostChange(null);
    onCloneHoverChange?.(null);
  }, [onHoverChange, onGhostChange, onCloneHoverChange]);

  const gridExtent = useMemo(() => getGridExtent(island), [island]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[gridExtent.planeCx, -0.01, gridExtent.planeCz]}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
      onPointerLeave={handlePointerLeave}
    >
      <planeGeometry args={[gridExtent.planeW, gridExtent.planeH]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

function DebugGroundClick({
  island,
  placementType,
  onPlace,
  onDeselect,
}: {
  island: IslandMap;
  placementType: string | null;
  onPlace?: (gx: number, gy: number, modelKey: string) => void;
  onDeselect?: () => void;
}) {
  const gridExtent = useMemo(() => getGridExtent(island), [island]);

  const handleClick = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!e.point) return;
      const grid = worldToGrid(e.point.x, e.point.z);
      const occupied = island.tiles.some((t) => t.gx === grid.gx && t.gy === grid.gy);
      if (occupied) return;
      if (placementType) {
        onPlace?.(grid.gx, grid.gy, placementType);
      } else {
        onDeselect?.();
      }
    },
    [island, placementType, onPlace, onDeselect],
  );

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[gridExtent.planeCx, -0.005, gridExtent.planeCz]}
      onClick={handleClick}
    >
      <planeGeometry args={[gridExtent.planeW, gridExtent.planeH]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

function FloatingBob({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(clock.getElapsedTime() * 1.5) * 0.04;
  });

  return <group ref={groupRef}>{children}</group>;
}

function TileEditAnchorEmitter({
  island,
  selectedTile,
  onTileEditAnchorChange,
}: {
  island: IslandMap;
  selectedTile: { gx: number; gy: number };
  onTileEditAnchorChange?: (anchor: TileEditAnchor) => void;
}) {
  const { camera, gl } = useThree();
  const prevRef = useRef<string>("");

  useFrame(() => {
    if (!onTileEditAnchorChange) return;
    const tile = island.tiles.find(
      (t) => t.gx === selectedTile.gx && t.gy === selectedTile.gy
    );
    if (!tile) {
      onTileEditAnchorChange({ x: 0, y: 0, centerY: 0, visible: false, zoom: 1 });
      return;
    }

    const worldPos = new THREE.Vector3(
      tile.gx * TILE_UNIT_SIZE,
      0.5,
      tile.gy * TILE_UNIT_SIZE
    );
    worldPos.project(camera);

    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    const sx = ((worldPos.x + 1) / 2) * rect.width;
    const sy = ((1 - worldPos.y) / 2) * rect.height;

    const key = `${sx.toFixed(1)},${sy.toFixed(1)}`;
    if (key === prevRef.current) return;
    prevRef.current = key;

    onTileEditAnchorChange({
      x: sx,
      y: sy - 40,
      centerY: sy,
      visible: true,
      zoom: 1,
    });
  });

  return null;
}

function DebugWalkSurfaceVisualizer({
  tile,
  color = "#35d8ff",
  outlineColor = "#d8fbff",
  opacity = 0.28,
  showMarker = true,
}: {
  tile: TileDef;
  color?: string;
  outlineColor?: string;
  opacity?: number;
  showMarker?: boolean;
}) {
  const span = SKYHAVEN_SPRITE_MANIFEST.tile[tile.type]?.gridSpan;
  const cellsWide = span?.w ?? 1;
  const cellsDeep = span?.h ?? 1;
  const profile = getTileCollisionProfile(tile);
  const surfaceY = getTileOriginY(tile) + profile.topSurfaceY;
  const width = Math.max(cellsWide * TILE_UNIT_SIZE - 0.18, TILE_UNIT_SIZE * 0.4);
  const depth = Math.max(cellsDeep * TILE_UNIT_SIZE - 0.18, TILE_UNIT_SIZE * 0.4);
  const centerX = tile.gx * TILE_UNIT_SIZE + ((cellsWide - 1) * TILE_UNIT_SIZE) / 2;
  const centerZ = tile.gy * TILE_UNIT_SIZE + ((cellsDeep - 1) * TILE_UNIT_SIZE) / 2;
  const outlineGeometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(width, depth);
    const edges = new THREE.EdgesGeometry(plane);
    plane.dispose();
    return edges;
  }, [depth, width]);

  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry]);

  return (
    <group position={[centerX, surfaceY + 0.025, centerZ]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={120}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={outlineGeometry} rotation={[-Math.PI / 2, 0, 0]} renderOrder={121}>
        <lineBasicMaterial color={outlineColor} transparent opacity={0.95} depthWrite={false} />
      </lineSegments>
      {showMarker ? (
        <mesh position={[0, 0.06, 0]} renderOrder={122}>
          <boxGeometry args={[0.045, 0.12, 0.045]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
}

export function IslandScene({
  island,
  selectedIslandId = "mining",
  buildMode = false,
  eraseMode = false,
  selectedTileType = null,
  selectedTileForEdit,
  characterActive = false,
  onPlaceTile,
  onRemoveTile,
  onSelectTileForEdit,
  onClearTileForEdit,
  onTileEditAnchorChange,
  blockedTargetCell,
  cloneState = null,
  clonePreviewCells = [],
  cloneBlockedCell = null,
  onCloneHoverChange,
  onCloneTarget,
  debugMode = false,
  debugGizmoMode = "translate",
  onDebugTileSelect,
  debugSelectedTileId = null,
  debugBatchSelectionIds = [],
  debugSurfaceTargetTileIds = [],
  debugSurfaceVizMode = "single",
  debugBatchPickMode = false,
  onDebugBatchTileToggle,
  onDebugTileChange,
  debugPlacementType = null,
  onDebugPlaceTile,
  onDebugDraggingChange,
  debugUniformScale = false,
  editMode = false,
  editGizmoMode = "translate",
  editSelectedTileId = null,
  onEditTileSelect,
  onEditTileDeselect,
  onEditTileChange,
  onEditDraggingChange,
  editUniformScale = false,
  editingDecoration = false,
  onEditDecoChange,
  onTileAction,
  onPoiActionRequest,
  onCancelMiniAction,
  poiMenuOpen = false,
  activePoiSession = null,
  isMiniActionActive = false,
  onRuneVfxToggle,
  onOpenCharacterSelect,
  playableVariant = "default",
  attachmentLoadout,
  equippedMainHand = null,
  equippedOffHand = null,
  respawnToken = 0,
  onPlayerDamage,
  forceIsoToken = 0,
  axeGlowEnabled = true,
  onTpsModeChange,
  onLuxTpsDialogueChange,
  tpsNpcDialogueDismissRef,
  playerSfxVolume = 0,
  masterVolume = 100,
  showVignette = false,
  islandLighting: islandLightingProp = DEFAULT_ISLAND_LIGHTING,
  lightingAmbiance = "day",
  autoDayNightCycle = false,
  dayNightCyclePeriodSec = DEFAULT_DAY_NIGHT_CYCLE_PERIOD_SEC,
  movementDebugRef,
  shadowsEnabled = true,
  postProcessingEnabled = true,
  cloudsEnabled = true,
  debugShowFps = false,
  fpsHudRef,
}: IslandSceneProps) {
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [hoveredOutlineRef, setHoveredOutlineRef] = useState<THREE.Group | null>(null);
  const [ghostCell, setGhostCell] = useState<{ gx: number; gy: number } | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [miningManTalking, setMiningManTalking] = useState(false);
  const [magicManTalking, setMagicManTalking] = useState(false);
  const [fightManTalking, setFightManTalking] = useState(false);
  const [fightManSpeech, setFightManSpeech] = useState("");
  const [tpsModeActive, setTpsModeActive] = useState(false);
  const [enemyRobotAlive, setEnemyRobotAlive] = useState(true);

  const npcTalkTimersRef = useRef<{ mining: number | null; magic: number | null; fight: number | null }>({
    mining: null,
    magic: null,
    fight: null,
  });
  const miningTalkingRef = useRef(false);
  const magicTalkingRef = useRef(false);
  const fightTalkingRef = useRef(false);
  const playerAttackRef = useRef<PlayerAttackSnapshot | null>(null);
  miningTalkingRef.current = miningManTalking;
  magicTalkingRef.current = magicManTalking;
  fightTalkingRef.current = fightManTalking;

  const clearNpcTalkTimer = useCallback((which: "mining" | "magic" | "fight") => {
    const id = npcTalkTimersRef.current[which];
    if (id != null) window.clearTimeout(id);
    npcTalkTimersRef.current[which] = null;
  }, []);

  const scheduleNpcTalkEnd = useCallback(
    (which: "mining" | "magic" | "fight", setter: (v: boolean) => void) => {
      clearNpcTalkTimer(which);
      npcTalkTimersRef.current[which] = window.setTimeout(() => {
        setter(false);
        npcTalkTimersRef.current[which] = null;
      }, 6000);
    },
    [clearNpcTalkTimer],
  );

  const dismissActiveTpsNpcDialogue = useCallback((): boolean => {
    if (!miningTalkingRef.current && !magicTalkingRef.current && !fightTalkingRef.current) {
      return false;
    }
    clearNpcTalkTimer("mining");
    clearNpcTalkTimer("magic");
    clearNpcTalkTimer("fight");
    setMiningManTalking(false);
    setMagicManTalking(false);
    setFightManTalking(false);
    return true;
  }, [clearNpcTalkTimer]);

  useLayoutEffect(() => {
    const ref = tpsNpcDialogueDismissRef;
    if (!ref) return;
    ref.current = dismissActiveTpsNpcDialogue;
    return () => {
      ref.current = null;
    };
  }, [tpsNpcDialogueDismissRef, dismissActiveTpsNpcDialogue]);
  const [fadedOccluderKeys, setFadedOccluderKeys] = useState<string[]>([]);
  const mouseGroundRef = useRef<THREE.Vector3 | null>(null);
  const tpsCameraStateRef = useRef<TpsCameraState>({
    active: false,
    viewYaw: null,
    characterOccluded: false,
    steeringActive: false,
    mouseForwardActive: false,
    fadedOccluderKeys: [],
  });
  const cameraOccludersRef = useRef<CameraOccluderEntry[]>([]);
  const spellCastRef = useRef<SpellCastEvent | null>(null);
  const npcPosRef = useRef<{ gx: number; gy: number } | null>(null);
  const magicManNpcPosRef = useRef<{ gx: number; gy: number } | null>(null);
  const fightManNpcPosRef = useRef<{ gx: number; gy: number } | null>(null);
  const npcPositionsMapRef = useRef(new Map<string, { gx: number; gy: number }>());
  const prevTpsActiveRef = useRef(false);
  const prevFadedOccluderKeysRef = useRef<string[]>([]);
  const onLuxTpsDialogueChangeRef = useRef(onLuxTpsDialogueChange);
  onLuxTpsDialogueChangeRef.current = onLuxTpsDialogueChange;

  const hasMiningTile = useMemo(
    () => island.tiles.some((t) => (MINE_TILES as readonly string[]).includes(t.type)),
    [island],
  );

  const hasMagicTower = useMemo(
    () => island.tiles.some((t) => t.type === "magicTower"),
    [island],
  );

  const hasKaserneTile = useMemo(
    () => island.tiles.some((t) => t.type === "kaserneTile"),
    [island],
  );

  /** Resets NPC patrol spawn when switching islands or changing tile set (avoids stale grid coords). */
  const npcPatrolIslandKey = useMemo(
    () => `${selectedIslandId}|${island.tiles.map((t) => t.id).sort().join(",")}`,
    [selectedIslandId, island.tiles],
  );
  const enemyRobotPresent = selectedIslandId === "mining" && hasMiningTile;
  const enemyCombatEnabled =
    enemyRobotPresent &&
    playableVariant === "fight_man" &&
    tpsModeActive &&
    !debugMode &&
    !editMode;

  useEffect(() => {
    setEnemyRobotAlive(true);
  }, [npcPatrolIslandKey, respawnToken, selectedIslandId]);

  const wellTiles = useMemo(
    () =>
      island.tiles
        .filter((t) => (t.type === "wellTile" || t.type === "well2Tile") && t.vfxEnabled === true)
        .map((t) => ({ gx: t.gx, gy: t.gy })),
    [island],
  );

  const runeTiles = useMemo(
    () =>
      island.tiles
        .filter((t) => t.type === "runeTile" && t.vfxEnabled === true && t.runeVfxLit === true)
        .map((t) => ({ gx: t.gx, gy: t.gy })),
    [island],
  );

  const forgeTiles = useMemo(
    () =>
      island.tiles
        .filter((t) => t.type === "floatingForge" && t.vfxEnabled === true)
        .map((t) => ({ gx: t.gx, gy: t.gy })),
    [island],
  );

  const vfxForgeLightXZ = useMemo(() => {
    if (forgeTiles.length === 0) return null;
    let sx = 0;
    let sz = 0;
    for (const t of forgeTiles) {
      sx += t.gx * TILE_UNIT_SIZE + TILE_UNIT_SIZE;
      sz += t.gy * TILE_UNIT_SIZE + TILE_UNIT_SIZE;
    }
    return { x: sx / forgeTiles.length, z: sz / forgeTiles.length };
  }, [forgeTiles]);

  const handleNpcInteract = useCallback(
    (npcId: string) => {
      if (npcId === "miningMan") {
        setMiningManTalking(true);
        scheduleNpcTalkEnd("mining", setMiningManTalking);
      } else if (npcId === "magicMan") {
        setMagicManTalking(true);
        scheduleNpcTalkEnd("magic", setMagicManTalking);
      } else if (npcId === "fightMan") {
        setFightManSpeech(pickRandomLuxFightLine());
        setFightManTalking(true);
        scheduleNpcTalkEnd("fight", setFightManTalking);
      }
    },
    [scheduleNpcTalkEnd],
  );

  useEffect(() => {
    const cb = onLuxTpsDialogueChangeRef.current;
    if (!cb) return;
    const open = fightManTalking && tpsModeActive;
    cb({ open, text: open ? fightManSpeech : "" });
  }, [fightManTalking, fightManSpeech, tpsModeActive]);

  const charPose = useCharacterMovement(island, characterActive && !debugMode && !editMode, {
    playableVariant,
    selectedIslandId: selectedIslandId as "mining" | "farming" | "custom",
    onTileAction,
    onPoiActionRequest,
    onCancelMiniAction,
    poiMenuOpen,
    activePoiSession,
    isMiniActionActive,
    mouseGroundRef,
    tpsCameraStateRef,
    spellCastRef,
    onNpcInteract: handleNpcInteract,
    npcPositionsRef: npcPositionsMapRef,
    onRuneVfxToggle,
    onOpenCharacterSelect,
    playerSfxVolume,
    equippedMainHand,
    equippedOffHand,
    combatAttackEnabled: enemyCombatEnabled && enemyRobotAlive,
    respawnToken,
    attackSwingRef: playerAttackRef,
    movementDebugRef,
  });

  useFrame(() => {
    const pos = npcPosRef.current;
    if (pos) {
      npcPositionsMapRef.current.set("miningMan", pos);
    } else {
      npcPositionsMapRef.current.delete("miningMan");
    }
    const magicPos = magicManNpcPosRef.current;
    if (magicPos) {
      npcPositionsMapRef.current.set("magicMan", magicPos);
    } else {
      npcPositionsMapRef.current.delete("magicMan");
    }
    const fightPos = fightManNpcPosRef.current;
    if (fightPos) {
      npcPositionsMapRef.current.set("fightMan", fightPos);
    } else {
      npcPositionsMapRef.current.delete("fightMan");
    }

    const tpsActive = tpsCameraStateRef.current.active;
    if (prevTpsActiveRef.current !== tpsActive) {
      prevTpsActiveRef.current = tpsActive;
      setTpsModeActive(tpsActive);
      if (tpsActive) {
        setHoveredTileId(null);
        setHoveredOutlineRef(null);
      }
      onTpsModeChange?.(tpsActive);
    }

    const nextFadedOccluderKeys = tpsActive ? tpsCameraStateRef.current.fadedOccluderKeys : [];
    if (!sameStringArray(prevFadedOccluderKeysRef.current, nextFadedOccluderKeys)) {
      prevFadedOccluderKeysRef.current = [...nextFadedOccluderKeys];
      setFadedOccluderKeys(nextFadedOccluderKeys);
    }
  });

  useLayoutEffect(() => {
    return () => {
      onTpsModeChange?.(false);
    };
  }, [onTpsModeChange]);

  const tileTypeMap = useMemo(() => buildTileTypeMap(island), [island]);
  const surfaceData = useMemo(() => buildIslandSurfaceData(island), [island]);
  const debugBatchSelectionIdSet = useMemo(
    () => new Set(debugBatchSelectionIds),
    [debugBatchSelectionIds],
  );
  const debugSurfaceTargetIdSet = useMemo(
    () => new Set(debugSurfaceTargetTileIds),
    [debugSurfaceTargetTileIds],
  );
  const selectedDebugTile = useMemo(
    () =>
      debugMode && debugSelectedTileId
        ? island.tiles.find((tile) => tile.id === debugSelectedTileId) ?? null
        : null,
    [debugMode, debugSelectedTileId, island],
  );
  const getCellSurfaceY = useCallback(
    (gx: number, gy: number) => getSurfaceYAtCell(surfaceData, gx, gy),
    [surfaceData],
  );
  const magicTowerTiles = useMemo(
    () =>
      island.tiles
        .filter((tile) => tile.type === "magicTower" && tile.vfxEnabled === true)
        .map((tile) => {
          const center = getParticleTileWorldXZ(tile.gx, tile.gy, 2);
          return {
            id: tile.id,
            gx: tile.gx,
            gy: tile.gy,
            surfaceY: getCellSurfaceY(tile.gx, tile.gy),
            worldX: tile.pos3d?.x ?? center.x,
            worldZ: tile.pos3d?.z ?? center.z,
            baseY: tile.pos3d?.y ?? 0,
            scaleY: tile.scale3d?.y ?? 1,
          };
        }),
    [getCellSurfaceY, island],
  );
  const nearbyPoi = useMemo(
    () => (isMiniActionActive || poiMenuOpen || activePoiSession ? null : findNearbyPoiAction(island, charPose.gx, charPose.gy)),
    [activePoiSession, charPose.gx, charPose.gy, island, isMiniActionActive, poiMenuOpen],
  );
  const nearbyInteract = useMemo(
    () => (isMiniActionActive || poiMenuOpen || activePoiSession ? null : findNearbyInteractable(charPose.gx, charPose.gy, tileTypeMap)),
    [activePoiSession, charPose.gx, charPose.gy, tileTypeMap, isMiniActionActive, poiMenuOpen],
  );

  const nearbyRune = useMemo(
    () => (isMiniActionActive || poiMenuOpen || activePoiSession ? null : findNearbyRuneTile(charPose.gx, charPose.gy, island)),
    [activePoiSession, charPose.gx, charPose.gy, island, isMiniActionActive, poiMenuOpen],
  );

  const nearbyTemple = useMemo(
    () => (isMiniActionActive || poiMenuOpen || activePoiSession ? null : findNearbyAncientTempleTile(charPose.gx, charPose.gy, island)),
    [activePoiSession, charPose.gx, charPose.gy, island, isMiniActionActive, poiMenuOpen],
  );

  const nearbyNpc = useMemo(() => {
    if (isMiniActionActive || poiMenuOpen || activePoiSession) return null;
    let best: { gx: number; gy: number } | null = null;
    let bestDist = 1.2 + 1;
    if (hasMiningTile && npcPosRef.current) {
      const pos = npcPosRef.current;
      const d = Math.hypot(charPose.gx - pos.gx, charPose.gy - pos.gy);
      if (d <= 1.2 && d < bestDist) {
        best = pos;
        bestDist = d;
      }
    }
    if (hasMagicTower && magicManNpcPosRef.current) {
      const pos = magicManNpcPosRef.current;
      const d = Math.hypot(charPose.gx - pos.gx, charPose.gy - pos.gy);
      if (d <= 1.2 && d < bestDist) {
        best = pos;
        bestDist = d;
      }
    }
    if (hasKaserneTile && fightManNpcPosRef.current) {
      const pos = fightManNpcPosRef.current;
      const d = Math.hypot(charPose.gx - pos.gx, charPose.gy - pos.gy);
      if (d <= 1.2 && d < bestDist) {
        best = pos;
        bestDist = d;
      }
    }
    return best;
  }, [activePoiSession, charPose.gx, charPose.gy, hasMiningTile, hasMagicTower, hasKaserneTile, isMiniActionActive, poiMenuOpen]);

  const setHoveredTileIdSmooth = useCallback((id: string | null) => {
    startTransition(() => setHoveredTileId(id));
  }, []);

  const handleDebugDraggingChange = useCallback((dragging: boolean) => {
    setGizmoDragging(dragging);
    onDebugDraggingChange?.(dragging);
  }, [onDebugDraggingChange]);

  const handleEditDraggingChange = useCallback((dragging: boolean) => {
    setGizmoDragging(dragging);
    onEditDraggingChange?.(dragging);
  }, [onEditDraggingChange]);

  const gridExtent = useMemo(() => getGridExtent(island), [island]);
  const fadedOccluderKeySet = useMemo(() => new Set(fadedOccluderKeys), [fadedOccluderKeys]);
  const gameplayOccluderFadeActive = tpsModeActive && !buildMode && !eraseMode;

  const warmth = islandLightingProp.dayLightWarmth ?? DEFAULT_ISLAND_LIGHTING.dayLightWarmth;
  const manualNightBlend = lightingAmbiance === "night" ? 1 : 0;
  const manualSnapshot = useMemo((): DayNightVisualSnapshot => {
    const colors = blendDayNightColors(sampleDayLightColors(warmth), manualNightBlend);
    return {
      nightBlend: manualNightBlend,
      lighting: islandLightingProp,
      colors,
      ...samplePostProcessForNightBlend(manualNightBlend),
    };
  }, [islandLightingProp, manualNightBlend, warmth]);

  const cyclePeriodMs = Math.max(1000, dayNightCyclePeriodSec * 1000);
  const cycleVisualRef = useRef<DayNightVisualSnapshot>(
    getDayNightVisualSnapshot(
      nightBlendFromPhase(dayNightPhaseFromTime(performance.now(), cyclePeriodMs)),
      warmth,
      DEFAULT_ISLAND_LIGHTING,
      NIGHT_ISLAND_LIGHTING,
    ),
  );

  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    if (!autoDayNightCycle) return;
    cycleVisualRef.current = getDayNightVisualSnapshot(
      nightBlendFromPhase(dayNightPhaseFromTime(performance.now(), cyclePeriodMs)),
      warmth,
      DEFAULT_ISLAND_LIGHTING,
      NIGHT_ISLAND_LIGHTING,
    );
    invalidate();
  }, [autoDayNightCycle, cyclePeriodMs, warmth, invalidate]);

  useFrame(() => {
    if (!autoDayNightCycle) return;
    cycleVisualRef.current = getDayNightVisualSnapshot(
      nightBlendFromPhase(dayNightPhaseFromTime(performance.now(), cyclePeriodMs)),
      warmth,
      DEFAULT_ISLAND_LIGHTING,
      NIGHT_ISLAND_LIGHTING,
    );
    invalidate();
  });

  const snap = autoDayNightCycle ? cycleVisualRef.current : manualSnapshot;

  const sunPosition = useMemo(
    () =>
      sunPositionFromAngles(
        gridExtent.planeCx,
        0,
        gridExtent.planeCz,
        snap.lighting.sunAzimuthDeg,
        snap.lighting.sunElevationDeg,
        snap.lighting.sunDistance,
      ),
    [
      gridExtent.planeCx,
      gridExtent.planeCz,
      snap.lighting.sunAzimuthDeg,
      snap.lighting.sunElevationDeg,
      snap.lighting.sunDistance,
    ],
  );

  const worldScene = useThree((s) => s.scene);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);

  const shadowOrthoExtent = useMemo(() => {
    const margin = 8;
    const base = Math.max(gridExtent.planeW, gridExtent.planeH, 14) / 2 + margin;
    return base * 1.35;
  }, [gridExtent.planeW, gridExtent.planeH]);

  useLayoutEffect(() => {
    const sun = sunLightRef.current;
    if (!sun) return;
    const tgt = sun.target;
    if (tgt.parent !== worldScene) {
      tgt.removeFromParent();
      worldScene.add(tgt);
    }
    tgt.position.set(gridExtent.planeCx, 0, gridExtent.planeCz);
    tgt.updateMatrixWorld();
    const cam = sun.shadow.camera;
    const ext = shadowOrthoExtent;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 0.15;
    cam.far = Math.max(ext * 14, 120);
    cam.updateProjectionMatrix();
  }, [worldScene, gridExtent.planeCx, gridExtent.planeCz, shadowOrthoExtent]);

  return (
    <>
      <StrongShadowRenderer enabled={shadowsEnabled} />
      {debugShowFps && fpsHudRef ? <FpsReporter outRef={fpsHudRef} /> : null}
      <Suspense fallback={null}>
        <GltfEmissiveSanitize />
        <Environment preset="apartment" environmentIntensity={snap.lighting.environmentIntensity} />
        {cloudsEnabled ? (
          <IslandCloudDeck
            island={island}
            planeCx={gridExtent.planeCx}
            planeCz={gridExtent.planeCz}
            planeW={gridExtent.planeW}
            planeH={gridExtent.planeH}
            safeFloorY={surfaceData.safeFloorY}
          />
        ) : null}
      </Suspense>
      <MouseGroundTracker
        mouseGroundRef={mouseGroundRef}
        tpsCameraStateRef={tpsCameraStateRef}
        groundY={charPose.surfaceY ?? charPose.worldY ?? DEFAULT_WALK_SURFACE_OFFSET_Y}
      />
      <IslandCamera
        characterPose={charPose}
        followCharacter={characterActive && !debugMode && !editMode}
        orbitEnabled={!gizmoDragging}
        tpsCameraStateRef={tpsCameraStateRef}
        cameraOccludersRef={cameraOccludersRef}
        forceIsoToken={forceIsoToken}
        tpsEnabled={
          characterActive &&
          !debugMode &&
          !editMode &&
          !buildMode &&
          !eraseMode &&
          !cloneState
        }
      />

      {magicTowerTiles.length > 0 && (
        <MagicTowerHoverSfx
          towers={magicTowerTiles}
          playerGx={charPose.gx}
          playerGy={charPose.gy}
          tpsActive={tpsModeActive}
          masterVolume={masterVolume}
          sfxVolume={playerSfxVolume}
        />
      )}
      <TorchBurnLoopSfx
        equippedOffHand={equippedOffHand}
        playableVariant={playableVariant}
        torchLit={Boolean(charPose.isTorchLit)}
        tpsActive={tpsModeActive}
        sfxVolume={playerSfxVolume}
      />

      <hemisphereLight args={[snap.colors.hemiSky, snap.colors.hemiGround, snap.lighting.hemisphereIntensity]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gridExtent.planeCx, surfaceData.safeFloorY, gridExtent.planeCz]}>
        <planeGeometry args={[gridExtent.planeW, gridExtent.planeH]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      <ambientLight color={snap.colors.ambient} intensity={snap.lighting.ambientIntensity} />
      <directionalLight
        ref={sunLightRef}
        position={sunPosition}
        intensity={snap.lighting.sunIntensity}
        color={snap.colors.sun}
        castShadow={shadowsEnabled}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.00015}
        shadow-normalBias={0.012}
        shadow-camera-near={0.15}
        shadow-camera-far={Math.max(shadowOrthoExtent * 14, 120)}
      />
      <directionalLight
        position={[-10, 6, -12]}
        intensity={snap.lighting.fillIntensity}
        color={snap.colors.fill}
      />

      {wellTiles.map((w) => {
        const { x, z } = getParticleTileWorldXZ(w.gx, w.gy, 1);
        return (
          <pointLight
            key={`well-vfx-light-${w.gx}-${w.gy}`}
            position={[x, BUBBLING_DEFAULT_SPAWN_Y, z]}
            color={0x88e8ff}
            intensity={WELL_GLOW_POINT_INTENSITY * snap.poiLightMul}
            distance={WELL_GLOW_POINT_DISTANCE * snap.wellGlowDistanceMul}
            decay={2}
          />
        );
      })}
      {runeTiles.map((r) => {
        const { x, z } = getParticleTileWorldXZ(r.gx, r.gy, 1);
        return (
          <pointLight
            key={`rune-vfx-light-${r.gx}-${r.gy}`}
            position={[x, RUNE_GLOW_POINT_Y, z]}
            color={0xff5533}
            intensity={RUNE_GLOW_POINT_INTENSITY * snap.poiLightMul}
            distance={RUNE_GLOW_POINT_DISTANCE * snap.runeGlowDistanceMul}
            decay={2}
          />
        );
      })}
      {vfxForgeLightXZ && (
        <pointLight
          position={[vfxForgeLightXZ.x, 1.45, vfxForgeLightXZ.z]}
          color={0xffaa66}
          intensity={snap.forgeIntensity}
          distance={snap.forgeDistance}
          decay={2}
        />
      )}
      {/* Grid hidden — no shadow-catcher plane (shadows only on tiles / props) */}

      {!debugMode && !editMode && (
        <GroundInteraction
          island={island}
          buildMode={buildMode}
          eraseMode={eraseMode}
          selectedTileType={selectedTileType}
          selectedIslandId={selectedIslandId}
          onPlaceTile={onPlaceTile}
          onRemoveTile={onRemoveTile}
          onSelectTileForEdit={onSelectTileForEdit}
          onClearTileForEdit={onClearTileForEdit}
          cloneState={cloneState}
          onHoverChange={buildMode ? setHoveredTileIdSmooth : noopHover}
          onGhostChange={setGhostCell}
          onCloneHoverChange={onCloneHoverChange}
          onCloneTarget={onCloneTarget}
        />
      )}

      {editMode && (
        <GroundInteraction
          island={island}
          buildMode={buildMode}
          eraseMode={eraseMode}
          selectedTileType={selectedTileType}
          selectedIslandId={selectedIslandId}
          onPlaceTile={onPlaceTile}
          onRemoveTile={onRemoveTile}
          onSelectTileForEdit={onSelectTileForEdit}
          onClearTileForEdit={onClearTileForEdit}
          onEditTileDeselect={onEditTileDeselect}
          cloneState={cloneState}
          onHoverChange={buildMode ? setHoveredTileIdSmooth : noopHover}
          onGhostChange={setGhostCell}
          onCloneHoverChange={onCloneHoverChange}
          onCloneTarget={onCloneTarget}
        />
      )}

      {debugMode && (
        <DebugGroundClick
          island={island}
          placementType={debugPlacementType}
          onPlace={onDebugPlaceTile}
          onDeselect={debugBatchPickMode ? undefined : () => onDebugTileSelect?.("")}
        />
      )}

      <Suspense fallback={null}>
        {debugMode ? (
          <>
            {island.tiles.map((tile) => (
              <DebugTileWrapper
                key={tile.id}
                tile={tile}
                selected={tile.id === debugSelectedTileId}
                batchSelected={debugBatchSelectionIdSet.has(tile.id)}
                batchPickMode={debugBatchPickMode}
                gizmoMode={debugGizmoMode}
                onSelect={() => onDebugTileSelect?.(tile.id)}
                onBatchToggle={() => onDebugBatchTileToggle?.(tile.id)}
                onChange={(pos3d, scale3d, rotY) =>
                  onDebugTileChange?.(tile.id, pos3d, scale3d, rotY)
                }
                onDraggingChange={handleDebugDraggingChange}
                uniformScale={debugUniformScale}
              />
            ))}
            {debugSurfaceVizMode === "single" && selectedDebugTile ? (
              <DebugWalkSurfaceVisualizer tile={selectedDebugTile} />
            ) : null}
            {debugSurfaceVizMode === "audit"
              ? island.tiles.map((tile) => {
                  const selected = tile.id === debugSelectedTileId;
                  const inTarget = debugSurfaceTargetIdSet.has(tile.id);
                  if (selected) {
                    return <DebugWalkSurfaceVisualizer key={`debug-surface-${tile.id}`} tile={tile} />;
                  }
                  if (inTarget) {
                    return (
                      <DebugWalkSurfaceVisualizer
                        key={`debug-surface-${tile.id}`}
                        tile={tile}
                        color="#ffb347"
                        outlineColor="#ffe0a6"
                        opacity={0.24}
                        showMarker={false}
                      />
                    );
                  }
                  return (
                    <DebugWalkSurfaceVisualizer
                      key={`debug-surface-${tile.id}`}
                      tile={tile}
                      color="#6b7f95"
                      outlineColor="#93aac0"
                      opacity={0.08}
                      showMarker={false}
                    />
                  );
                })
              : null}
            <Suspense fallback={null}>
              <CharacterModel
                pose={charPose}
                mouseGroundRef={mouseGroundRef}
                tpsCameraStateRef={tpsCameraStateRef}
                playableVariant={playableVariant}
                attachmentLoadout={attachmentLoadout}
                axeGlowEnabled={axeGlowEnabled}
              />
            </Suspense>
            <SkullyCompanion pose={charPose} />
            <ChopParticles
              gx={charPose.gx}
              gy={charPose.gy}
              isChopping={charPose.animState === "chop"}
            />
            <SpellParticles spellCastRef={spellCastRef} />
            {magicTowerTiles.length > 0 && (
              <MagicTowerParticles magicTowerTiles={magicTowerTiles} />
            )}
            {wellTiles.length > 0 && (
              <WorldParticles
                positions={wellTiles}
                style="bubbling"
                color={WELL_BUBBLE_COLOR}
                count={WELL_BUBBLE_COUNT}
                size={WELL_BUBBLE_SIZE}
                luminanceBoost={WELL_BUBBLE_LUMINANCE_BOOST}
              />
            )}
            {runeTiles.length > 0 && (
              <WorldParticles
                positions={runeTiles}
                style="runeHelix"
                color={RUNE_HELIX_COLOR_CYCLE.from}
                count={RUNE_HELIX_COUNT}
                size={RUNE_HELIX_SIZE}
                luminanceBoost={RUNE_HELIX_LUMINANCE_BOOST}
                offsetY={RUNE_VFX_OFFSET_Y}
                bubblingColorCycle={RUNE_HELIX_COLOR_CYCLE}
              />
            )}
            {forgeTiles.length > 0 && (
              <WorldParticles
                positions={forgeTiles}
                style="smoke"
                color={0x999999}
                count={14}
                size={0.04}
                tileSize={2}
                offsetY={1.6}
                offsetX={-0.80}
                offsetZ={-0.35}
              />
            )}
            {hasMiningTile && playableVariant !== "mining_man" && (
              <MiningManNPC
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {enemyRobotPresent && (
              <EnemyRobot
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                playerPose={charPose}
                combatEnabled={enemyCombatEnabled}
                playerAttackRef={playerAttackRef}
                respawnToken={respawnToken}
                onPlayerDamage={(damage) => onPlayerDamage?.(damage)}
                onAliveChange={setEnemyRobotAlive}
              />
            )}
            {hasMagicTower && playableVariant !== "magic_man" && (
              <MagicManNPC
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={magicManTalking}
                npcPosRef={magicManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasKaserneTile && playableVariant !== "fight_man" && (
              <FightManNPCWithSuspense
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={fightManTalking}
                npcPosRef={fightManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
          </>
        ) : editMode ? (
          <>
            <FloatingBob>
              {island.tiles.map((tile) => (
                <DebugTileWrapper
                  key={tile.id}
                  tile={tile}
                  selected={tile.id === editSelectedTileId}
                  gizmoMode={editGizmoMode}
                  editingDecoration={tile.id === editSelectedTileId && editingDecoration}
                  buildMode={buildMode || cloneState !== null}
                  onSelect={() => onEditTileSelect?.(tile.id)}
                  onHoverEnter={(ref) => {
                    setHoveredTileIdSmooth(tile.id);
                    setHoveredOutlineRef(ref ?? null);
                  }}
                  onHoverLeave={() => {
                    setHoveredTileIdSmooth(null);
                    setHoveredOutlineRef(null);
                  }}
                  onChange={(pos3d, scale3d, rotY) =>
                    onEditTileChange?.(tile.id, pos3d, scale3d, rotY)
                  }
                  onDecoChange={(decoPos3d, decoScale3d, decoRotY) =>
                    onEditDecoChange?.(tile.id, decoPos3d, decoScale3d, decoRotY)
                  }
                  onDraggingChange={handleEditDraggingChange}
                  uniformScale={editUniformScale}
                />
              ))}
              <Suspense fallback={null}>
              <CharacterModel
                pose={charPose}
                mouseGroundRef={mouseGroundRef}
                tpsCameraStateRef={tpsCameraStateRef}
                playableVariant={playableVariant}
                attachmentLoadout={attachmentLoadout}
                axeGlowEnabled={axeGlowEnabled}
              />
            </Suspense>
            <SkullyCompanion pose={charPose} />
            <ChopParticles
              gx={charPose.gx}
              gy={charPose.gy}
              isChopping={charPose.animState === "chop"}
            />
            <SpellParticles spellCastRef={spellCastRef} />
            {magicTowerTiles.length > 0 && (
              <MagicTowerParticles magicTowerTiles={magicTowerTiles} />
            )}
            {wellTiles.length > 0 && (
              <WorldParticles
                positions={wellTiles}
                style="bubbling"
                color={WELL_BUBBLE_COLOR}
                count={WELL_BUBBLE_COUNT}
                size={WELL_BUBBLE_SIZE}
                luminanceBoost={WELL_BUBBLE_LUMINANCE_BOOST}
              />
            )}
            {runeTiles.length > 0 && (
              <WorldParticles
                positions={runeTiles}
                style="runeHelix"
                color={RUNE_HELIX_COLOR_CYCLE.from}
                count={RUNE_HELIX_COUNT}
                size={RUNE_HELIX_SIZE}
                luminanceBoost={RUNE_HELIX_LUMINANCE_BOOST}
                offsetY={RUNE_VFX_OFFSET_Y}
                bubblingColorCycle={RUNE_HELIX_COLOR_CYCLE}
              />
            )}
            {forgeTiles.length > 0 && (
              <WorldParticles
                positions={forgeTiles}
                style="smoke"
                color={0x999999}
                count={14}
                size={0.04}
                tileSize={2}
                offsetY={1.6}
                offsetX={-0.80}
                offsetZ={-0.35}
              />
            )}
            {hasMiningTile && playableVariant !== "mining_man" && (
              <MiningManNPC
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {enemyRobotPresent && (
              <EnemyRobot
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                playerPose={charPose}
                combatEnabled={enemyCombatEnabled}
                playerAttackRef={playerAttackRef}
                respawnToken={respawnToken}
                onPlayerDamage={(damage) => onPlayerDamage?.(damage)}
                onAliveChange={setEnemyRobotAlive}
              />
            )}
            {hasMagicTower && playableVariant !== "magic_man" && (
              <MagicManNPC
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={magicManTalking}
                npcPosRef={magicManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasKaserneTile && playableVariant !== "fight_man" && (
              <FightManNPCWithSuspense
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={fightManTalking}
                npcPosRef={fightManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            </FloatingBob>

            {ghostCell && selectedTileType && (
              <GhostPreview gx={ghostCell.gx} gy={ghostCell.gy} tileType={selectedTileType} />
            )}
          </>
        ) : (
          <FloatingBob>
            {island.tiles.map((tile) => (
              <TileModel
                key={tile.id}
                tile={tile}
                hovered={!tpsModeActive && tile.id === hoveredTileId}
                faded={gameplayOccluderFadeActive && fadedOccluderKeySet.has(`tile:${tile.id}`)}
                decorationFaded={gameplayOccluderFadeActive && fadedOccluderKeySet.has(`deco:${tile.id}`)}
                onHoverEnter={tpsModeActive ? undefined : () => setHoveredTileIdSmooth(tile.id)}
                onHoverLeave={tpsModeActive ? undefined : () => setHoveredTileIdSmooth(null)}
                cameraOccludersRef={cameraOccludersRef}
              />
            ))}
            <Suspense fallback={null}>
              <CharacterModel
                pose={charPose}
                mouseGroundRef={mouseGroundRef}
                tpsCameraStateRef={tpsCameraStateRef}
                playableVariant={playableVariant}
                attachmentLoadout={attachmentLoadout}
                axeGlowEnabled={axeGlowEnabled}
              />
            </Suspense>
            <SkullyCompanion pose={charPose} />
            <ChopParticles
              gx={charPose.gx}
              gy={charPose.gy}
              isChopping={charPose.animState === "chop"}
            />
            <SpellParticles spellCastRef={spellCastRef} />
            {magicTowerTiles.length > 0 && (
              <MagicTowerParticles magicTowerTiles={magicTowerTiles} />
            )}
            {wellTiles.length > 0 && (
              <WorldParticles
                positions={wellTiles}
                style="bubbling"
                color={WELL_BUBBLE_COLOR}
                count={WELL_BUBBLE_COUNT}
                size={WELL_BUBBLE_SIZE}
                luminanceBoost={WELL_BUBBLE_LUMINANCE_BOOST}
              />
            )}
            {runeTiles.length > 0 && (
              <WorldParticles
                positions={runeTiles}
                style="runeHelix"
                color={RUNE_HELIX_COLOR_CYCLE.from}
                count={RUNE_HELIX_COUNT}
                size={RUNE_HELIX_SIZE}
                luminanceBoost={RUNE_HELIX_LUMINANCE_BOOST}
                offsetY={RUNE_VFX_OFFSET_Y}
                bubblingColorCycle={RUNE_HELIX_COLOR_CYCLE}
              />
            )}
            {forgeTiles.length > 0 && (
              <WorldParticles
                positions={forgeTiles}
                style="smoke"
                color={0x999999}
                count={14}
                size={0.04}
                tileSize={2}
                offsetY={1.6}
                offsetX={-0.80}
                offsetZ={-0.35}
              />
            )}
            {hasMiningTile && playableVariant !== "mining_man" && (
              <MiningManNPC
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {enemyRobotPresent && (
              <EnemyRobot
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                playerPose={charPose}
                combatEnabled={enemyCombatEnabled}
                playerAttackRef={playerAttackRef}
                respawnToken={respawnToken}
                onPlayerDamage={(damage) => onPlayerDamage?.(damage)}
                onAliveChange={setEnemyRobotAlive}
              />
            )}
            {hasMagicTower && playableVariant !== "magic_man" && (
              <MagicManNPC
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={magicManTalking}
                npcPosRef={magicManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasKaserneTile && playableVariant !== "fight_man" && (
              <FightManNPCWithSuspense
                island={island}
                patrolIslandKey={npcPatrolIslandKey}
                isTalking={fightManTalking}
                npcPosRef={fightManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            </FloatingBob>
        )}

        {!debugMode && !editMode && ghostCell && selectedTileType && (
          <GhostPreview gx={ghostCell.gx} gy={ghostCell.gy} tileType={selectedTileType} />
        )}

        {!debugMode &&
          clonePreviewCells.map((cell) => (
            <TileHighlight
              key={`clone-preview-${cell.gx}-${cell.gy}`}
              gx={cell.gx}
              gy={cell.gy}
              color="#66d0ff"
              pulse={false}
            />
          ))}

        {!debugMode && !editMode && !tpsModeActive && hoveredTileId && !buildMode && !eraseMode && (() => {
          const tile = island.tiles.find((t) => t.id === hoveredTileId);
          return tile ? <TileHighlight gx={tile.gx} gy={tile.gy} color="#88ccff" /> : null;
        })()}

        {!debugMode && !editMode && selectedTileForEdit && (
          <TileHighlight gx={selectedTileForEdit.gx} gy={selectedTileForEdit.gy} color="#ffdd44" pulse />
        )}

        {!debugMode && !editMode && blockedTargetCell && (
          <TileHighlight gx={blockedTargetCell.gx} gy={blockedTargetCell.gy} color="#ff4444" pulse={false} />
        )}

        {!debugMode && cloneBlockedCell && (
          <TileHighlight gx={cloneBlockedCell.gx} gy={cloneBlockedCell.gy} color="#ff4444" pulse={false} />
        )}

        {!debugMode && !editMode && selectedTileForEdit && (
          <TileEditAnchorEmitter
            island={island}
            selectedTile={selectedTileForEdit}
            onTileEditAnchorChange={onTileEditAnchorChange}
          />
        )}

        <TilePlaceParticles tiles={island.tiles} />
        <AmbientParticles
          centerX={gridExtent.planeCx}
          centerZ={gridExtent.planeCz}
          halfWidth={gridExtent.planeW / 2}
          halfHeight={gridExtent.planeH / 2}
        />

        {nearbyInteract && !debugMode && !editMode && (
          <InteractPrompt
            tileGx={nearbyInteract.tileGx}
            tileGy={nearbyInteract.tileGy}
            surfaceY={getCellSurfaceY(nearbyInteract.tileGx, nearbyInteract.tileGy)}
          />
        )}

        {nearbyPoi && !debugMode && !editMode && (
          <InteractPrompt
            tileGx={nearbyPoi.tile.gx}
            tileGy={nearbyPoi.tile.gy}
            surfaceY={getCellSurfaceY(nearbyPoi.tile.gx, nearbyPoi.tile.gy)}
          />
        )}

        {nearbyRune && !nearbyPoi && !nearbyInteract && !debugMode && !editMode && (
          <InteractPrompt
            tileGx={nearbyRune.gx}
            tileGy={nearbyRune.gy}
            surfaceY={getCellSurfaceY(nearbyRune.gx, nearbyRune.gy)}
          />
        )}

        {nearbyTemple &&
          !nearbyPoi &&
          !nearbyInteract &&
          !nearbyRune &&
          !debugMode &&
          !editMode && (
          <InteractPrompt
            tileGx={nearbyTemple.gx}
            tileGy={nearbyTemple.gy}
            surfaceY={getCellSurfaceY(nearbyTemple.gx, nearbyTemple.gy)}
          />
        )}

        {nearbyNpc &&
          !nearbyPoi &&
          !nearbyInteract &&
          !nearbyRune &&
          !nearbyTemple &&
          !debugMode &&
          !editMode &&
          !miningManTalking &&
          !magicManTalking &&
          !fightManTalking && (
          <InteractPrompt
            tileGx={nearbyNpc.gx}
            tileGy={nearbyNpc.gy}
            surfaceY={getCellSurfaceY(nearbyNpc.gx, nearbyNpc.gy)}
          />
        )}

        {hasMiningTile && npcPosRef.current && (
          <SpeechBubble
            visible={miningManTalking}
            position={[npcPosRef.current.gx * TILE_UNIT_SIZE, 2.2, npcPosRef.current.gy * TILE_UNIT_SIZE]}
          />
        )}
        {hasMagicTower && magicManNpcPosRef.current && (
          <SpeechBubble
            visible={magicManTalking}
            position={[
              magicManNpcPosRef.current.gx * TILE_UNIT_SIZE,
              2.2,
              magicManNpcPosRef.current.gy * TILE_UNIT_SIZE,
            ]}
          />
        )}
        {hasKaserneTile && fightManNpcPosRef.current && (
          <SpeechBubble
            visible={fightManTalking && !tpsModeActive}
            text={fightManSpeech}
            position={[
              fightManNpcPosRef.current.gx * TILE_UNIT_SIZE,
              2.2,
              fightManNpcPosRef.current.gy * TILE_UNIT_SIZE,
            ]}
          />
        )}

        <Preload all />
      </Suspense>

      {postProcessingEnabled ? (
        <EffectComposer>
          <Bloom
            intensity={snap.bloomIntensity}
            luminanceThreshold={snap.bloomLuminanceThreshold}
            luminanceSmoothing={0.08}
            mipmapBlur
          />
          <Vignette offset={0.3} darkness={0.9} opacity={showVignette ? 1 : 0} />
          <Outline
            selection={hoveredOutlineRef ? [hoveredOutlineRef] : []}
            selectionLayer={HOVER_OUTLINE_SELECTION_LAYER}
            visibleEdgeColor={0x88ccff}
            hiddenEdgeColor={0x224466}
            edgeStrength={4}
            blur={false}
            xRay={false}
          />
          <FXAA />
        </EffectComposer>
      ) : null}
    </>
  );
}
