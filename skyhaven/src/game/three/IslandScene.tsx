import { Preload, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, FXAA } from "@react-three/postprocessing";
import { Suspense, useCallback, useMemo, useRef, useState, startTransition, type MutableRefObject } from "react";
import * as THREE from "three";
import { IslandCamera } from "./IslandCamera";
import { TileModel } from "./TileModel";
import { CharacterModel } from "./CharacterModel";
import { SkullyCompanion } from "./SkullyCompanion";
import { MiningManNPC } from "./MiningManNPC";
import { SpeechBubble } from "./SpeechBubble";
import { useCharacterMovement, findNearbyInteractable, buildTileTypeMap, type SpellCastEvent } from "./useCharacterMovement";
import { InteractPrompt } from "./InteractPrompt";
import { GhostPreview } from "./GhostPreview";
import { TilePlaceParticles } from "./TilePlaceParticles";
import { AmbientParticles } from "./AmbientParticles";
import { ChopParticles } from "./ChopParticles";
import { SpellParticles } from "./SpellParticles";
import { TileHighlight } from "./TileHighlight";
import { DebugTileWrapper } from "./DebugTileWrapper";
import { ALL_MODEL_PATHS, TILE_UNIT_SIZE } from "./assets3d";
import { MINE_TILES, DECORATION_TILES, NO_DECORATION_TILES } from "../types";

const MOUSE_GROUND_Y = 0.82;
const mouseGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -MOUSE_GROUND_Y);

function MouseGroundTracker({ mouseGroundRef }: { mouseGroundRef: MutableRefObject<THREE.Vector3 | null> }) {
  const { camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const hitVec = useRef(new THREE.Vector3());
  useFrame((state) => {
    raycaster.setFromCamera(state.pointer, camera);
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
  /** When true, vignette is shown (expanded/fullscreen only, not compact/transparent) */
  showVignette?: boolean;
};

ALL_MODEL_PATHS.forEach((path) => useGLTF.preload(path));

const noopHover = (_id: string | null) => {};
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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
  showVignette = false,
}: IslandSceneProps) {
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [ghostCell, setGhostCell] = useState<{ gx: number; gy: number } | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
  const [miningManTalking, setMiningManTalking] = useState(false);
  const mouseGroundRef = useRef<THREE.Vector3 | null>(null);
  const spellCastRef = useRef<SpellCastEvent | null>(null);
  const npcPosRef = useRef<{ gx: number; gy: number } | null>(null);
  const npcPositionsMapRef = useRef(new Map<string, { gx: number; gy: number }>());

  const hasMiningTile = useMemo(
    () => island.tiles.some((t) => (MINE_TILES as readonly string[]).includes(t.type)),
    [island],
  );

  const handleNpcInteract = useCallback((npcId: string) => {
    if (npcId === "miningMan") {
      setMiningManTalking(true);
      setTimeout(() => setMiningManTalking(false), 6000);
    }
  }, []);

  const charPose = useCharacterMovement(island, characterActive && !debugMode && !editMode, {
    onTileAction,
    onCancelMiniAction,
    isMiniActionActive,
    mouseGroundRef,
    spellCastRef,
    onNpcInteract: handleNpcInteract,
    npcPositionsRef: npcPositionsMapRef,
  });

  useFrame(() => {
    const pos = npcPosRef.current;
    if (pos) {
      npcPositionsMapRef.current.set("miningMan", pos);
    } else {
      npcPositionsMapRef.current.delete("miningMan");
    }
  });

  const tileTypeMap = useMemo(() => buildTileTypeMap(island), [island]);
  const nearbyInteract = useMemo(
    () => (isMiniActionActive ? null : findNearbyInteractable(charPose.gx, charPose.gy, tileTypeMap)),
    [charPose.gx, charPose.gy, tileTypeMap, isMiniActionActive],
  );

  const nearbyNpc = useMemo(() => {
    if (!hasMiningTile || isMiniActionActive) return null;
    const npcPos = npcPosRef.current;
    if (!npcPos) return null;
    const dist = Math.hypot(charPose.gx - npcPos.gx, charPose.gy - npcPos.gy);
    return dist <= 1.2 ? npcPos : null;
  }, [charPose.gx, charPose.gy, hasMiningTile, isMiniActionActive]);

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

  return (
    <>
      <MouseGroundTracker mouseGroundRef={mouseGroundRef} />
      <IslandCamera
        characterPose={charPose}
        followCharacter={characterActive && !debugMode && !editMode}
        orbitEnabled={!gizmoDragging}
      />

      <ambientLight intensity={0.45} />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight
        position={[-4, 14, 6]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0005}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
      />

      {/* Grid hidden */}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[gridExtent.planeCx, -0.03, gridExtent.planeCz]}
        receiveShadow
      >
        <planeGeometry args={[gridExtent.planeW, gridExtent.planeH]} />
        <shadowMaterial transparent opacity={0.35} />
      </mesh>

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
            <CharacterModel pose={charPose} mouseGroundRef={mouseGroundRef} />
            <SkullyCompanion pose={charPose} />
            <ChopParticles gx={charPose.gx} gy={charPose.gy} isChopping={charPose.animState === "chop"} />
            <SpellParticles spellCastRef={spellCastRef} />
            {hasMiningTile && (
              <MiningManNPC
                island={island}
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
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
              <CharacterModel pose={charPose} mouseGroundRef={mouseGroundRef} />
              <SkullyCompanion pose={charPose} />
              <ChopParticles gx={charPose.gx} gy={charPose.gy} isChopping={charPose.animState === "chop"} />
              <SpellParticles spellCastRef={spellCastRef} />
              {hasMiningTile && (
                <MiningManNPC
                  island={island}
                  isTalking={miningManTalking}
                  npcPosRef={npcPosRef}
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
                hovered={tile.id === hoveredTileId}
                onHoverEnter={() => setHoveredTileIdSmooth(tile.id)}
                onHoverLeave={() => setHoveredTileIdSmooth(null)}
              />
            ))}
            <CharacterModel pose={charPose} mouseGroundRef={mouseGroundRef} />
            <SkullyCompanion pose={charPose} />
            <ChopParticles gx={charPose.gx} gy={charPose.gy} isChopping={charPose.animState === "chop"} />
            <SpellParticles spellCastRef={spellCastRef} />
            {hasMiningTile && (
              <MiningManNPC
                island={island}
                isTalking={miningManTalking}
                npcPosRef={npcPosRef}
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

        {!debugMode && !editMode && hoveredTileId && !buildMode && !eraseMode && (() => {
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

        {nearbyNpc && !nearbyInteract && !debugMode && !editMode && !miningManTalking && (
          <InteractPrompt tileGx={nearbyNpc.gx} tileGy={nearbyNpc.gy} />
        )}

        {hasMiningTile && npcPosRef.current && (
          <SpeechBubble
            visible={miningManTalking}
            position={[npcPosRef.current.gx * TILE_UNIT_SIZE, 2.2, npcPosRef.current.gy * TILE_UNIT_SIZE]}
          />
        )}

        <Preload all />
      </Suspense>

      <EffectComposer>
        <Bloom intensity={0.35} luminanceThreshold={0.9} luminanceSmoothing={0.025} />
        <Vignette offset={0.3} darkness={0.9} opacity={showVignette ? 1 : 0} />
        <FXAA />
      </EffectComposer>
    </>
  );
}
