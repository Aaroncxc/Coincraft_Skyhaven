import { Environment, Preload, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, FXAA, Outline } from "@react-three/postprocessing";
import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { IslandCamera } from "./IslandCamera";
import { TileModel } from "./TileModel";
import { CharacterModel } from "./CharacterModel";
import { SkullyCompanion } from "./SkullyCompanion";
import { MiningManNPC } from "./MiningManNPC";
import { MagicManNPC } from "./MagicManNPC";
import { FightManNPCWithSuspense } from "./FightManNPC";
import { SpeechBubble } from "./SpeechBubble";
import {
  useCharacterMovement,
  findNearbyInteractable,
  findNearbyRuneTile,
  findNearbyAncientTempleTile,
  buildTileTypeMap,
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
import { WorldParticles, getParticleTileWorldXZ, BUBBLING_DEFAULT_SPAWN_Y } from "./WorldParticles";
import { TileHighlight } from "./TileHighlight";
import { DebugTileWrapper } from "./DebugTileWrapper";
import { ALL_GAME_GLTF_PATHS, TILE_UNIT_SIZE } from "./assets3d";
import type { CameraOccluderEntry } from "./cameraOcclusion";
import { GltfEmissiveSanitize } from "./GltfEmissiveSanitize";
import {
  type IslandLightingParams,
  DEFAULT_ISLAND_LIGHTING,
  sunPositionFromAngles,
} from "./islandLighting";
import { MINE_TILES, DECORATION_TILES, NO_DECORATION_TILES } from "../types";
import type { PlayableCharacterId } from "../playableCharacters";

const MOUSE_GROUND_Y = 0.82;
const mouseGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -MOUSE_GROUND_Y);

/** Well tiles: brighter HDR bubbles + bloom + point fill */
const WELL_BUBBLE_COUNT = 56;
const WELL_BUBBLE_SIZE = 0.085;
const WELL_BUBBLE_COLOR = 0xb8f8ff;
const WELL_BUBBLE_LUMINANCE_BOOST = 3.6;
/** Per-well cyan fill; placed at same XZ/Y as bubbling particles (`getParticleTileWorldXZ`, `BUBBLING_DEFAULT_SPAWN_Y`). */
const WELL_GLOW_POINT_INTENSITY = 2.4;
const WELL_GLOW_POINT_DISTANCE = 5.5;

const RUNE_BUBBLE_COUNT = 56;
const RUNE_BUBBLE_SIZE = 0.085;
const RUNE_BUBBLE_LUMINANCE_BOOST = 3.4;
const RUNE_GLOW_POINT_INTENSITY = 2.4;
const RUNE_GLOW_POINT_DISTANCE = 5.5;
const RUNE_BUBBLE_COLOR_CYCLE = { from: 0xffcc55, to: 0xcc2200, periodSec: 7 } as const;
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
}: {
  mouseGroundRef: MutableRefObject<THREE.Vector3 | null>;
  tpsCameraStateRef: MutableRefObject<TpsCameraState>;
}) {
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const hitVec = useRef(new THREE.Vector3());
  const centerNdc = useMemo(() => new THREE.Vector2(0, 0), []);
  useFrame((state) => {
    raycaster.setFromCamera(tpsCameraStateRef.current.active ? centerNdc : state.pointer, camera);
    if (raycaster.ray.intersectPlane(mouseGroundPlane, hitVec.current)) {
      mouseGroundRef.current = hitVec.current.clone();
    } else {
      mouseGroundRef.current = null;
    }
  });
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
  onCancelMiniAction?: () => void;
  isMiniActionActive?: boolean;
  onRuneVfxToggle?: (tileGx: number, tileGy: number) => void;
  /** E near Ancient Temple opens character roster (React overlay). */
  onOpenCharacterSelect?: () => void;
  /** Active playable skin; duplicate world NPC hidden when it matches. */
  playableVariant?: PlayableCharacterId;
  onTpsModeChange?: (active: boolean) => void;
  /** When true, vignette is shown (expanded/fullscreen only, not compact/transparent) */
  showVignette?: boolean;
  /** Sun + ambient/fill/env; in debug mode usually driven by sliders. */
  islandLighting?: IslandLightingParams;
};

ALL_GAME_GLTF_PATHS.forEach((path) => useGLTF.preload(path));

const noopHover = (_id: string | null) => {};
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function StrongShadowRenderer() {
  const gl = useThree((s) => s.gl);
  useLayoutEffect(() => {
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.BasicShadowMap;
  }, [gl]);
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
  onCancelMiniAction,
  isMiniActionActive = false,
  onRuneVfxToggle,
  onOpenCharacterSelect,
  playableVariant = "default",
  onTpsModeChange,
  showVignette = false,
  islandLighting: islandLightingProp = DEFAULT_ISLAND_LIGHTING,
}: IslandSceneProps) {
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [hoveredOutlineRef, setHoveredOutlineRef] = useState<THREE.Group | null>(null);
  const [ghostCell, setGhostCell] = useState<{ gx: number; gy: number } | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [miningManTalking, setMiningManTalking] = useState(false);
  const [magicManTalking, setMagicManTalking] = useState(false);
  const [fightManTalking, setFightManTalking] = useState(false);
  const [tpsModeActive, setTpsModeActive] = useState(false);
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

  const magicTowerTile = useMemo(() => {
    if (!hasMagicTower) return null;
    const t = island.tiles.find((x) => x.type === "magicTower");
    return t && t.vfxEnabled === true ? { gx: t.gx, gy: t.gy } : null;
  }, [island, hasMagicTower]);

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

  const handleNpcInteract = useCallback((npcId: string) => {
    if (npcId === "miningMan") {
      setMiningManTalking(true);
      setTimeout(() => setMiningManTalking(false), 6000);
    } else if (npcId === "magicMan") {
      setMagicManTalking(true);
      setTimeout(() => setMagicManTalking(false), 6000);
    } else if (npcId === "fightMan") {
      setFightManTalking(true);
      setTimeout(() => setFightManTalking(false), 6000);
    }
  }, []);

  const charPose = useCharacterMovement(island, characterActive && !debugMode && !editMode, {
    onTileAction,
    onCancelMiniAction,
    isMiniActionActive,
    mouseGroundRef,
    tpsCameraStateRef,
    spellCastRef,
    onNpcInteract: handleNpcInteract,
    npcPositionsRef: npcPositionsMapRef,
    onRuneVfxToggle,
    onOpenCharacterSelect,
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
  const nearbyInteract = useMemo(
    () => (isMiniActionActive ? null : findNearbyInteractable(charPose.gx, charPose.gy, tileTypeMap)),
    [charPose.gx, charPose.gy, tileTypeMap, isMiniActionActive],
  );

  const nearbyRune = useMemo(
    () => (isMiniActionActive ? null : findNearbyRuneTile(charPose.gx, charPose.gy, island)),
    [charPose.gx, charPose.gy, island, isMiniActionActive],
  );

  const nearbyTemple = useMemo(
    () => (isMiniActionActive ? null : findNearbyAncientTempleTile(charPose.gx, charPose.gy, island)),
    [charPose.gx, charPose.gy, island, isMiniActionActive],
  );

  const nearbyNpc = useMemo(() => {
    if (isMiniActionActive) return null;
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
  }, [charPose.gx, charPose.gy, hasMiningTile, hasMagicTower, hasKaserneTile, isMiniActionActive]);

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

  const islandLighting = islandLightingProp;

  const sunPosition = useMemo(
    () =>
      sunPositionFromAngles(
        gridExtent.planeCx,
        0,
        gridExtent.planeCz,
        islandLighting.sunAzimuthDeg,
        islandLighting.sunElevationDeg,
        islandLighting.sunDistance,
      ),
    [
      gridExtent.planeCx,
      gridExtent.planeCz,
      islandLighting.sunAzimuthDeg,
      islandLighting.sunElevationDeg,
      islandLighting.sunDistance,
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
      <StrongShadowRenderer />
      <Suspense fallback={null}>
        <GltfEmissiveSanitize />
        <Environment preset="apartment" environmentIntensity={islandLighting.environmentIntensity} />
      </Suspense>
      <MouseGroundTracker mouseGroundRef={mouseGroundRef} tpsCameraStateRef={tpsCameraStateRef} />
      <IslandCamera
        characterPose={charPose}
        followCharacter={characterActive && !debugMode && !editMode}
        orbitEnabled={!gizmoDragging}
        tpsCameraStateRef={tpsCameraStateRef}
        cameraOccludersRef={cameraOccludersRef}
        tpsEnabled={
          characterActive &&
          !debugMode &&
          !editMode &&
          !buildMode &&
          !eraseMode &&
          !cloneState
        }
      />

      <hemisphereLight
        args={["#9eb8e8", "#1a1510", islandLighting.hemisphereIntensity]}
      />
      <ambientLight intensity={islandLighting.ambientIntensity} />
      <directionalLight
        ref={sunLightRef}
        position={sunPosition}
        intensity={islandLighting.sunIntensity}
        color="#fff1dc"
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-bias={-0.00015}
        shadow-normalBias={0.012}
        shadow-camera-near={0.15}
        shadow-camera-far={Math.max(shadowOrthoExtent * 14, 120)}
      />
      <directionalLight
        position={[-10, 6, -12]}
        intensity={islandLighting.fillIntensity}
        color="#b4c6ff"
      />

      {wellTiles.map((w) => {
        const { x, z } = getParticleTileWorldXZ(w.gx, w.gy, 1);
        return (
          <pointLight
            key={`well-vfx-light-${w.gx}-${w.gy}`}
            position={[x, BUBBLING_DEFAULT_SPAWN_Y, z]}
            color={0x88e8ff}
            intensity={WELL_GLOW_POINT_INTENSITY}
            distance={WELL_GLOW_POINT_DISTANCE}
            decay={2}
          />
        );
      })}
      {runeTiles.map((r) => {
        const { x, z } = getParticleTileWorldXZ(r.gx, r.gy, 1);
        return (
          <pointLight
            key={`rune-vfx-light-${r.gx}-${r.gy}`}
            position={[x, BUBBLING_DEFAULT_SPAWN_Y, z]}
            color={0xff5533}
            intensity={RUNE_GLOW_POINT_INTENSITY}
            distance={RUNE_GLOW_POINT_DISTANCE}
            decay={2}
          />
        );
      })}
      {vfxForgeLightXZ && (
        <pointLight
          position={[vfxForgeLightXZ.x, 1.45, vfxForgeLightXZ.z]}
          color={0xffaa66}
          intensity={0.9}
          distance={7}
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
          onDeselect={() => onDebugTileSelect?.("")}
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
                gizmoMode={debugGizmoMode}
                onSelect={() => onDebugTileSelect?.(tile.id)}
                onChange={(pos3d, scale3d, rotY) =>
                  onDebugTileChange?.(tile.id, pos3d, scale3d, rotY)
                }
                onDraggingChange={handleDebugDraggingChange}
                uniformScale={debugUniformScale}
              />
            ))}
            <Suspense fallback={null}>
              <CharacterModel
                pose={charPose}
                mouseGroundRef={mouseGroundRef}
                playableVariant={playableVariant}
              />
            </Suspense>
            <SkullyCompanion pose={charPose} />
            <ChopParticles
              gx={charPose.gx}
              gy={charPose.gy}
              isChopping={charPose.animState === "chop"}
            />
            <SpellParticles spellCastRef={spellCastRef} />
            {hasMagicTower && magicTowerTile && (
              <MagicTowerParticles magicTowerTile={magicTowerTile} />
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
                style="bubbling"
                color={RUNE_BUBBLE_COLOR_CYCLE.from}
                count={RUNE_BUBBLE_COUNT}
                size={RUNE_BUBBLE_SIZE}
                luminanceBoost={RUNE_BUBBLE_LUMINANCE_BOOST}
                bubblingColorCycle={RUNE_BUBBLE_COLOR_CYCLE}
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
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasMagicTower && playableVariant !== "magic_man" && (
              <MagicManNPC
                island={island}
                isTalking={magicManTalking}
                npcPosRef={magicManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasKaserneTile && playableVariant !== "fight_man" && (
              <FightManNPCWithSuspense
                island={island}
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
                  playableVariant={playableVariant}
                />
              </Suspense>
              <SkullyCompanion pose={charPose} />
              <ChopParticles
                gx={charPose.gx}
                gy={charPose.gy}
                isChopping={charPose.animState === "chop"}
              />
              <SpellParticles spellCastRef={spellCastRef} />
              {hasMagicTower && magicTowerTile && (
                <MagicTowerParticles magicTowerTile={magicTowerTile} />
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
                  style="bubbling"
                  color={RUNE_BUBBLE_COLOR_CYCLE.from}
                  count={RUNE_BUBBLE_COUNT}
                  size={RUNE_BUBBLE_SIZE}
                  luminanceBoost={RUNE_BUBBLE_LUMINANCE_BOOST}
                  bubblingColorCycle={RUNE_BUBBLE_COLOR_CYCLE}
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
                  isTalking={miningManTalking}
                  npcPosRef={npcPosRef}
                  playerGx={charPose.gx}
                  playerGy={charPose.gy}
                />
              )}
              {hasMagicTower && playableVariant !== "magic_man" && (
                <MagicManNPC
                  island={island}
                  isTalking={magicManTalking}
                  npcPosRef={magicManNpcPosRef}
                  playerGx={charPose.gx}
                  playerGy={charPose.gy}
                />
              )}
              {hasKaserneTile && playableVariant !== "fight_man" && (
                <FightManNPCWithSuspense
                  island={island}
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
                playableVariant={playableVariant}
              />
            </Suspense>
            <SkullyCompanion pose={charPose} />
            <ChopParticles
              gx={charPose.gx}
              gy={charPose.gy}
              isChopping={charPose.animState === "chop"}
            />
            <SpellParticles spellCastRef={spellCastRef} />
            {hasMagicTower && magicTowerTile && (
              <MagicTowerParticles magicTowerTile={magicTowerTile} />
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
                style="bubbling"
                color={RUNE_BUBBLE_COLOR_CYCLE.from}
                count={RUNE_BUBBLE_COUNT}
                size={RUNE_BUBBLE_SIZE}
                luminanceBoost={RUNE_BUBBLE_LUMINANCE_BOOST}
                bubblingColorCycle={RUNE_BUBBLE_COLOR_CYCLE}
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
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasMagicTower && playableVariant !== "magic_man" && (
              <MagicManNPC
                island={island}
                isTalking={magicManTalking}
                npcPosRef={magicManNpcPosRef}
                playerGx={charPose.gx}
                playerGy={charPose.gy}
              />
            )}
            {hasKaserneTile && playableVariant !== "fight_man" && (
              <FightManNPCWithSuspense
                island={island}
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
          <InteractPrompt tileGx={nearbyInteract.tileGx} tileGy={nearbyInteract.tileGy} />
        )}

        {nearbyRune && !nearbyInteract && !debugMode && !editMode && (
          <InteractPrompt tileGx={nearbyRune.gx} tileGy={nearbyRune.gy} />
        )}

        {nearbyTemple &&
          !nearbyInteract &&
          !nearbyRune &&
          !debugMode &&
          !editMode && (
          <InteractPrompt tileGx={nearbyTemple.gx} tileGy={nearbyTemple.gy} />
        )}

        {nearbyNpc &&
          !nearbyInteract &&
          !nearbyRune &&
          !nearbyTemple &&
          !debugMode &&
          !editMode &&
          !miningManTalking &&
          !magicManTalking &&
          !fightManTalking && (
          <InteractPrompt tileGx={nearbyNpc.gx} tileGy={nearbyNpc.gy} />
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
            visible={fightManTalking}
            position={[
              fightManNpcPosRef.current.gx * TILE_UNIT_SIZE,
              2.2,
              fightManNpcPosRef.current.gy * TILE_UNIT_SIZE,
            ]}
          />
        )}

        <Preload all />
      </Suspense>

      <EffectComposer>
        <Bloom intensity={0.55} luminanceThreshold={0.72} luminanceSmoothing={0.08} mipmapBlur />
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
    </>
  );
}
