import { useEffect, useRef, useState, type RefObject } from "react";
import { SKYHAVEN_SPRITE_MANIFEST } from "./assets";
import { loadSpriteImages } from "./assetLoader";
import { buildTileLookup, coordKey, getPlacementCell, gridToScreen, pickTileFromScreen } from "./iso";
import { computeSceneOrigin, drawIslandFrame, pickTileFromSpriteAlpha } from "./render";
import { HOVER_LIFT, NEIGHBOR_IMPULSE, createSpringState, integrateSpring } from "./spring";
import type { AssetKey, CharacterPose, IslandMap, TileDef, TileSpringState, Vec2 } from "./types";

type PointerState = {
  x: number;
  y: number;
  inside: boolean;
};

type PanDragState = {
  active: boolean;
  pointerId: number | null;
  lastX: number;
  lastY: number;
};

type PatrolState = {
  from: { gx: number; gy: number };
  toIndex: number;
  segmentT: number;
  segmentDurationSec: number;
  walkClock: number;
  pose: CharacterPose;
};

type MovementKeys = {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
};

type GridBounds = {
  minGx: number;
  maxGx: number;
  minGy: number;
  maxGy: number;
};

type UseSkyhavenLoopResult = {
  hoveredTileId: string | null;
  nowMs: number;
};

export type TileEditAnchor = {
  x: number;
  y: number;
  centerY: number;
  visible: boolean;
  zoom: number;
};

type UseSkyhavenLoopOptions = {
  selectedIslandId?: string;
  centerXRatio?: number;
  centerYRatio?: number;
  characterActive?: boolean;
  onBobOffsetChange?: (offsetPx: number) => void;
  onViewTransformChange?: (view: { bobY: number; zoom: number; panX: number; panY: number }) => void;
  suspendHover?: boolean;
  buildMode?: boolean;
  eraseMode?: boolean;
  selectedTileType?: AssetKey | null;
  onPlaceTile?: (gx: number, gy: number, type: AssetKey) => void;
  onRemoveTile?: (gx: number, gy: number) => void;
  selectedTileForEdit?: { gx: number; gy: number } | null;
  onSelectTileForEdit?: (gx: number, gy: number) => void;
  onClearTileForEdit?: () => void;
  onTileEditAnchorChange?: (anchor: TileEditAnchor) => void;
  blockedTargetCell?: { gx: number; gy: number } | null;
  /** Show isometric grid overlay for calibration (press G to toggle) */
  showDebugGrid?: boolean;
  onToggleDebugGrid?: () => void;
};

const MIN_ZOOM = 0.38;
const MAX_ZOOM = 1.55;
const ZOOM_IN_FACTOR = 1.08;
const ZOOM_OUT_FACTOR = 0.9;
const CAMERA_FOLLOW_ZOOM_THRESHOLD = 1.48;
const CAMERA_FOLLOW_X_RATIO = 0.52;
const CAMERA_FOLLOW_Y_RATIO = 0.54;
const CAMERA_FOLLOW_STIFFNESS = 8;
const CAMERA_FOLLOW_DEAD_ZONE_PX = 1;
const FLOAT_BOB_AMPLITUDE = 6;
const FLOAT_BOB_PERIOD_MS = 4200;
const PATROL_WAYPOINTS: ReadonlyArray<{ gx: number; gy: number }> = [
  { gx: 0.8, gy: 2.3 },
  { gx: 1.1, gy: 1.1 },
  { gx: 2.2, gy: 0.9 },
  { gx: 2.6, gy: 1.8 },
  { gx: 2.0, gy: 2.6 },
  { gx: 1.1, gy: 2.0 },
  { gx: 1.8, gy: 1.6 },
  { gx: 1.4, gy: 2.5 },
];
const PATROL_GRID_SPEED = 0.62;
const PATROL_ANIM_FPS = 24;
const MANUAL_GRID_SPEED = 1.2;
const MANUAL_ANIM_FPS = 18;
const IDLE_AUTOPATROL_DELAY_SEC = 7;
const GRID_EDGE_MARGIN = 0.24;

export function useSkyhavenLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  island: IslandMap,
  options: UseSkyhavenLoopOptions = {}
): UseSkyhavenLoopResult {
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [spriteImages, setSpriteImages] = useState<Map<string, HTMLImageElement> | null>(null);
  const springsRef = useRef<Map<string, TileSpringState>>(new Map());
  const pointerRef = useRef<PointerState>({ x: 0, y: 0, inside: false });
  const hoveredRef = useRef<string | null>(null);
  const secondRef = useRef<number>(Math.floor(Date.now() / 1000));
  const zoomRef = useRef<number>(1);
  const panRef = useRef<Vec2>({ x: 0, y: 0 });
  const panDragRef = useRef<PanDragState>({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  });
  const movementKeysRef = useRef<MovementKeys>({ w: false, a: false, s: false, d: false });
  const lastManualInputRef = useRef<number>(performance.now());
  const movementModeRef = useRef<"manual" | "idle" | "auto">("idle");
  const gridBoundsRef = useRef<GridBounds>({ minGx: 0, maxGx: 0, minGy: 0, maxGy: 0 });
  const lastFrameRef = useRef<{
    origin: Vec2;
    view: { width: number; height: number };
    zoom: number;
    panX: number;
    viewPanY: number;
  } | null>(null);
  const buildModeOriginRef = useRef<Vec2 | null>(null);
  const initialSpawn = resolveSpawn(island);
  const patrolRef = useRef<PatrolState>({
    from: { gx: initialSpawn.gx, gy: initialSpawn.gy },
    toIndex: 1,
    segmentT: 0.0001,
    segmentDurationSec: computeSegmentDuration(initialSpawn, PATROL_WAYPOINTS[1]),
    walkClock: 0,
    pose: {
      gx: initialSpawn.gx,
      gy: initialSpawn.gy,
      direction: "right",
      frameIndex: 0,
    },
  });

  useEffect(() => {
    let cancelled = false;
    loadSpriteImages(SKYHAVEN_SPRITE_MANIFEST).then((images) => {
      if (!cancelled) {
        setSpriteImages(images);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
    panDragRef.current = { active: false, pointerId: null, lastX: 0, lastY: 0 };
    movementKeysRef.current = { w: false, a: false, s: false, d: false };
    lastManualInputRef.current = performance.now();
    movementModeRef.current = "idle";
    buildModeOriginRef.current = null;
  }, [options.selectedIslandId]);

  useEffect(() => {
    const springs = new Map<string, TileSpringState>();
    for (const tile of island.tiles) {
      springs.set(tile.id, createSpringState());
    }
    springsRef.current = springs;
    hoveredRef.current = null;
    gridBoundsRef.current = computeGridBounds(island);
    const spawn = resolveSpawn(island);
    patrolRef.current = {
      from: { gx: spawn.gx, gy: spawn.gy },
      toIndex: 1,
      segmentT: 0.0001,
      segmentDurationSec: computeSegmentDuration(spawn, PATROL_WAYPOINTS[1]),
      walkClock: 0,
      pose: {
        gx: spawn.gx,
        gy: spawn.gy,
        direction: "right",
        frameIndex: 0,
      },
    };
    setHoveredTileId(null);
  }, [island]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const tileById = new Map<string, TileDef>();
    for (const tile of island.tiles) {
      tileById.set(tile.id, tile);
    }
    const tileLookup = buildTileLookup(island);

    const resizeCanvas = (): { width: number; height: number } => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const deviceWidth = Math.floor(cssWidth * dpr);
      const deviceHeight = Math.floor(cssHeight * dpr);

      if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
        canvas.width = deviceWidth;
        canvas.height = deviceHeight;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: cssWidth, height: cssHeight };
    };

    const updatePointer = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        inside: true,
      };
    };

    const handleEnter = (event: PointerEvent): void => updatePointer(event);
    const handleMove = (event: PointerEvent): void => updatePointer(event);
    const handleLeave = (): void => {
      if (panDragRef.current.active) {
        return;
      }
      pointerRef.current.inside = false;
    };

    const stopPanning = (pointerId?: number): void => {
      if (!panDragRef.current.active) {
        return;
      }
      if (typeof pointerId === "number" && panDragRef.current.pointerId !== pointerId) {
        return;
      }
      panDragRef.current = {
        active: false,
        pointerId: null,
        lastX: 0,
        lastY: 0,
      };
      canvas.classList.remove("is-panning");
    };

    const pickTileAtWorld = (worldX: number, worldY: number, origin: Vec2): TileDef | null => {
      let picked: TileDef | null = null;
      if (spriteImages) {
        picked = pickTileFromSpriteAlpha({
          map: island,
          x: worldX,
          y: worldY,
          origin,
          springs: springsRef.current,
          images: spriteImages,
          manifest: SKYHAVEN_SPRITE_MANIFEST,
        });
      }
      if (!picked) {
        picked = pickTileFromScreen({
          map: island,
          x: worldX,
          y: worldY,
          originX: origin.x,
          originY: origin.y,
          springs: springsRef.current,
          tileLookup,
        });
      }
      return picked;
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.button === 2) {
        if (options.selectedIslandId === "custom") {
          event.preventDefault();
        }
        return;
      }

      if (event.button === 0) {
        const buildMode = options.buildMode ?? false;
        const eraseMode = options.eraseMode ?? false;
        const editMode = !buildMode && !eraseMode && options.selectedIslandId === "custom";
        const tileType = options.selectedTileType;
        const onPlace = options.onPlaceTile;
        const onRemove = options.onRemoveTile;
        const onSelectTileForEdit = options.onSelectTileForEdit;
        const onClearTileForEdit = options.onClearTileForEdit;
        if (pointerRef.current.inside) {
          const frame = lastFrameRef.current;
          if (frame) {
            const world = screenToWorld(
              pointerRef.current.x,
              pointerRef.current.y,
              frame.view.width,
              frame.view.height,
              frame.zoom,
              frame.panX,
              frame.viewPanY
            );

            if (eraseMode && onRemove) {
              event.preventDefault();
              event.stopPropagation();
              const picked = pickTileAtWorld(world.x, world.y, frame.origin);
              if (picked) {
                onRemove(picked.gx, picked.gy);
              }
              return;
            }

            if (buildMode && tileType && onPlace) {
              event.preventDefault();
              event.stopPropagation();
              const picked = pickTileAtWorld(world.x, world.y, frame.origin);
              const cell = picked
                ? { gx: picked.gx, gy: picked.gy }
                : getPlacementCell(world.x, world.y, frame.origin.x, frame.origin.y, island.tileW, island.tileH);
              onPlace(cell.gx, cell.gy, tileType);
              return;
            }

            if (editMode && onSelectTileForEdit && onClearTileForEdit) {
              event.preventDefault();
              event.stopPropagation();
              const picked = pickTileAtWorld(world.x, world.y, frame.origin);
              if (picked) {
                onSelectTileForEdit(picked.gx, picked.gy);
              } else {
                onClearTileForEdit();
              }
              return;
            }
          }
        }
        return;
      }

      if (event.button !== 1 || !pointerRef.current.inside || !hoveredRef.current) {
        return;
      }

      event.preventDefault();
      panDragRef.current = {
        active: true,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      canvas.classList.add("is-panning");
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    };

    const handlePointerPanMove = (event: PointerEvent): void => {
      const drag = panDragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const deltaX = event.clientX - drag.lastX;
      const deltaY = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      panRef.current.x += deltaX;
      panRef.current.y += deltaY;
    };

    const handlePointerUp = (event: PointerEvent): void => {
      if (event.button === 1) {
        stopPanning(event.pointerId);
      }
    };

    const handlePointerCancel = (event: PointerEvent): void => {
      stopPanning(event.pointerId);
    };

    const handleLostCapture = (event: PointerEvent): void => {
      stopPanning(event.pointerId);
    };

    const handleAuxClick = (event: MouseEvent): void => {
      if (event.button === 1) {
        event.preventDefault();
      }
    };

    const handleContextMenu = (event: MouseEvent): void => {
      if (options.selectedIslandId === "custom") {
        event.preventDefault();
      }
    };

    const handleWheel = (event: WheelEvent): void => {
      if (!pointerRef.current.inside || !hoveredRef.current) {
        return;
      }
      event.preventDefault();
      const zoomFactor = event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
      zoomRef.current = clamp(zoomRef.current * zoomFactor, MIN_ZOOM, MAX_ZOOM);
    };

    const clearMovementKeys = (): void => {
      movementKeysRef.current = { w: false, a: false, s: false, d: false };
    };

    const handleKeyChange = (event: KeyboardEvent, pressed: boolean): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "g" && pressed && options.onToggleDebugGrid) {
        event.preventDefault();
        options.onToggleDebugGrid();
        return;
      }
      if (key !== "w" && key !== "a" && key !== "s" && key !== "d") {
        return;
      }

      event.preventDefault();
      movementKeysRef.current[key] = pressed;
      if (pressed) {
        lastManualInputRef.current = performance.now();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => handleKeyChange(event, true);
    const handleKeyUp = (event: KeyboardEvent): void => handleKeyChange(event, false);

    canvas.addEventListener("pointerenter", handleEnter);
    canvas.addEventListener("pointermove", handleMove);
    canvas.addEventListener("pointermove", handlePointerPanMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("lostpointercapture", handleLostCapture);
    canvas.addEventListener("pointerleave", handleLeave);
    canvas.addEventListener("auxclick", handleAuxClick);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("blur", clearMovementKeys);

    let previousTileEditAnchor: TileEditAnchor | null = null;
    const emitTileEditAnchor = (anchor: TileEditAnchor): void => {
      if (!options.onTileEditAnchorChange) {
        return;
      }
      if (
        previousTileEditAnchor &&
        previousTileEditAnchor.visible === anchor.visible &&
        Math.abs(previousTileEditAnchor.x - anchor.x) < 0.3 &&
        Math.abs(previousTileEditAnchor.y - anchor.y) < 0.3 &&
        Math.abs(previousTileEditAnchor.centerY - anchor.centerY) < 0.3 &&
        Math.abs(previousTileEditAnchor.zoom - anchor.zoom) < 0.002
      ) {
        return;
      }
      previousTileEditAnchor = anchor;
      options.onTileEditAnchorChange(anchor);
    };

    let frameId = 0;
    let previousFrame = performance.now();

    const loop = (frameTime: number): void => {
      const deltaSeconds = Math.min(0.05, Math.max(0.0001, (frameTime - previousFrame) / 1000));
      previousFrame = frameTime;

      const view = resizeCanvas();
      const origin = computeSceneOrigin(
        island,
        view.width,
        view.height,
        options.centerXRatio ?? SKYHAVEN_SPRITE_MANIFEST.scene.centerXRatio,
        options.centerYRatio ?? SKYHAVEN_SPRITE_MANIFEST.scene.centerYRatio
      );

      const pointer = pointerRef.current;
      const springs = springsRef.current;
      const zoom = zoomRef.current;
      const pan = panRef.current;

      const buildOrErase = (options.buildMode ?? false) || (options.eraseMode ?? false);
      let effectiveOrigin = origin;
      if (buildOrErase) {
        if (!buildModeOriginRef.current) {
          buildModeOriginRef.current = { x: origin.x, y: origin.y };
        }
        effectiveOrigin = buildModeOriginRef.current;
      } else {
        buildModeOriginRef.current = null;
      }
      const bobOffsetY = Math.sin((frameTime / FLOAT_BOB_PERIOD_MS) * Math.PI * 2) * FLOAT_BOB_AMPLITUDE;
      const patrol = patrolRef.current;
      const focusActionRunning = options.characterActive ?? false;
      const movementKeys = movementKeysRef.current;
      const hasManualInput = hasMovementInput(movementKeys);
      if (hasManualInput) {
        lastManualInputRef.current = frameTime;
      }
      const idleSeconds = (frameTime - lastManualInputRef.current) / 1000;
      const nextMode: "manual" | "idle" | "auto" = focusActionRunning
        ? "auto"
        : hasManualInput
          ? "manual"
          : idleSeconds >= IDLE_AUTOPATROL_DELAY_SEC
            ? "auto"
            : "idle";

      if (nextMode !== movementModeRef.current) {
        if (nextMode === "auto") {
          syncPatrolFromCurrentPose(patrol);
        }
        movementModeRef.current = nextMode;
      }

      if (nextMode === "manual") {
        updateManualPose(patrol, deltaSeconds, movementKeys, gridBoundsRef.current);
      } else if (nextMode === "auto") {
        updatePatrol(patrol, deltaSeconds);
      } else {
        patrol.pose = {
          ...patrol.pose,
          frameIndex: 0,
        };
      }

      const shouldFollowCharacter = zoom >= CAMERA_FOLLOW_ZOOM_THRESHOLD && !panDragRef.current.active;
      if (shouldFollowCharacter) {
        const worldCharacter = gridToScreen(patrol.pose.gx, patrol.pose.gy, effectiveOrigin.x, effectiveOrigin.y, island.tileW, island.tileH);
        const centerX = view.width * 0.5;
        const centerY = view.height * 0.5;
        const desiredScreenX = view.width * CAMERA_FOLLOW_X_RATIO;
        const desiredScreenY = view.height * CAMERA_FOLLOW_Y_RATIO;
        const targetPanX = desiredScreenX - centerX - (worldCharacter.x - centerX) * zoom;
        const targetViewPanY = desiredScreenY - centerY - (worldCharacter.y - centerY) * zoom;
        const targetPanY = targetViewPanY - bobOffsetY;
        const followAlpha = 1 - Math.exp(-CAMERA_FOLLOW_STIFFNESS * deltaSeconds);

        if (Math.abs(targetPanX - pan.x) <= CAMERA_FOLLOW_DEAD_ZONE_PX) {
          pan.x = targetPanX;
        } else {
          pan.x = lerp(pan.x, targetPanX, followAlpha);
        }

        if (Math.abs(targetPanY - pan.y) <= CAMERA_FOLLOW_DEAD_ZONE_PX) {
          pan.y = targetPanY;
        } else {
          pan.y = lerp(pan.y, targetPanY, followAlpha);
        }
      }

      const viewPanY = pan.y + bobOffsetY;
      lastFrameRef.current = {
        origin: effectiveOrigin,
        view,
        zoom,
        panX: pan.x,
        viewPanY,
      };
      options.onBobOffsetChange?.(bobOffsetY);
      options.onViewTransformChange?.({
        bobY: bobOffsetY,
        zoom,
        panX: pan.x,
        panY: pan.y,
      });

      const selectedTileForEdit = options.selectedTileForEdit;
      if (selectedTileForEdit) {
        const selected = tileLookup.get(coordKey(selectedTileForEdit.gx, selectedTileForEdit.gy));
        if (selected) {
          const meta = SKYHAVEN_SPRITE_MANIFEST.tile[selected.type];
          const span = meta.gridSpan;
          const centerGx = span ? selected.gx + (span.w - 1) / 2 : selected.gx;
          const centerGy = span ? selected.gy + (span.h - 1) / 2 : selected.gy;
          const base = gridToScreen(centerGx, centerGy, effectiveOrigin.x, effectiveOrigin.y, island.tileW, island.tileH);
          const spring = springs.get(selected.id);
          const worldX = base.x + (spring?.ox ?? 0) + (selected.offsetX ?? 0);
          const worldY = base.y + (spring?.oy ?? 0) + (selected.offsetY ?? 0);
          const anchorY = selected.anchorY ?? meta.anchorY;
          const worldTopY = worldY - meta.drawH * anchorY;
          const centerScreen = worldToScreen(worldX, worldY, view.width, view.height, zoom, pan.x, viewPanY);
          const topScreen = worldToScreen(worldX, worldTopY, view.width, view.height, zoom, pan.x, viewPanY);
          emitTileEditAnchor({
            x: centerScreen.x,
            y: topScreen.y - 18,
            centerY: centerScreen.y,
            visible: true,
            zoom,
          });
        } else {
          emitTileEditAnchor({
            x: 0,
            y: 0,
            centerY: 0,
            visible: false,
            zoom,
          });
        }
      } else {
        emitTileEditAnchor({
          x: 0,
          y: 0,
          centerY: 0,
          visible: false,
          zoom,
        });
      }

      let nextHoveredId: string | null = null;
      if (!options.suspendHover && pointer.inside) {
        const worldPointer = screenToWorld(pointer.x, pointer.y, view.width, view.height, zoom, pan.x, viewPanY);

        const spriteHovered = pickTileFromSpriteAlpha({
          map: island,
          x: worldPointer.x,
          y: worldPointer.y,
          origin: effectiveOrigin,
          springs,
          images: spriteImages,
          manifest: SKYHAVEN_SPRITE_MANIFEST,
        });

        if (spriteHovered) {
          nextHoveredId = spriteHovered.id;
        } else {
          const fallback = pickTileFromScreen({
            map: island,
            x: worldPointer.x,
            y: worldPointer.y,
            originX: effectiveOrigin.x,
            originY: effectiveOrigin.y,
            springs,
            tileLookup,
          });
          nextHoveredId = fallback?.id ?? null;
        }
      }

      if (nextHoveredId !== hoveredRef.current) {
        if (nextHoveredId) {
          applyNeighborImpulse(nextHoveredId, tileById, tileLookup, island, springs);
        }
        hoveredRef.current = nextHoveredId;
        setHoveredTileId(nextHoveredId);
      }

      for (const tile of island.tiles) {
        const state = springs.get(tile.id);
        if (!state) {
          continue;
        }
        const targetY = tile.id === hoveredRef.current ? -HOVER_LIFT : 0;
        integrateSpring(state, 0, targetY, deltaSeconds);
      }

      let ghostPreviewCell: { gx: number; gy: number } | undefined;
      const buildMode = options.buildMode ?? false;
      const tileType = options.selectedTileType;
      if (buildMode && tileType && pointer.inside) {
        const world = screenToWorld(pointer.x, pointer.y, view.width, view.height, zoom, pan.x, viewPanY);
        let picked: TileDef | null = null;
        if (spriteImages) {
          picked = pickTileFromSpriteAlpha({
            map: island,
            x: world.x,
            y: world.y,
            origin: effectiveOrigin,
            springs,
            images: spriteImages,
            manifest: SKYHAVEN_SPRITE_MANIFEST,
          });
        }
        if (!picked) {
          picked = pickTileFromScreen({
            map: island,
            x: world.x,
            y: world.y,
            originX: effectiveOrigin.x,
            originY: effectiveOrigin.y,
            springs,
            tileLookup,
          });
        }
        ghostPreviewCell = picked
          ? { gx: picked.gx, gy: picked.gy }
          : getPlacementCell(world.x, world.y, effectiveOrigin.x, effectiveOrigin.y, island.tileW, island.tileH);
      }

      drawIslandFrame({
        ctx: context,
        map: island,
        springs,
        hoveredTileId: hoveredRef.current,
        width: view.width,
        height: view.height,
        images: spriteImages,
        manifest: SKYHAVEN_SPRITE_MANIFEST,
        zoom,
        panX: pan.x,
        panY: viewPanY,
        origin: effectiveOrigin,
        characterPose: patrol.pose,
        ghostPreviewCell,
        blockedCell: options.blockedTargetCell ?? undefined,
        showDebugGrid: options.showDebugGrid,
      });

      const second = Math.floor(Date.now() / 1000);
      if (second !== secondRef.current) {
        secondRef.current = second;
        setNowMs(Date.now());
      }

      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frameId);
      canvas.removeEventListener("pointerenter", handleEnter);
      canvas.removeEventListener("pointermove", handleMove);
      canvas.removeEventListener("pointermove", handlePointerPanMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("lostpointercapture", handleLostCapture);
      canvas.removeEventListener("pointerleave", handleLeave);
      canvas.removeEventListener("auxclick", handleAuxClick);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearMovementKeys);
      canvas.classList.remove("is-panning");
    };
  }, [
    canvasRef,
    island,
    spriteImages,
    options.centerXRatio,
    options.centerYRatio,
    options.characterActive,
    options.onBobOffsetChange,
    options.onViewTransformChange,
    options.suspendHover,
    options.buildMode,
    options.eraseMode,
    options.selectedTileType,
    options.onPlaceTile,
    options.onRemoveTile,
    options.selectedTileForEdit,
    options.onSelectTileForEdit,
    options.onClearTileForEdit,
    options.onTileEditAnchorChange,
    options.blockedTargetCell,
    options.selectedIslandId,
    options.showDebugGrid,
    options.onToggleDebugGrid,
  ]);

  return { hoveredTileId, nowMs };
}

function updatePatrol(state: PatrolState, deltaSeconds: number): void {
  if (PATROL_WAYPOINTS.length < 2) {
    return;
  }

  if (state.toIndex < 0 || state.toIndex >= PATROL_WAYPOINTS.length) {
    state.toIndex = 0;
  }

  const previousIsoX = state.pose.gx - state.pose.gy;
  state.walkClock += deltaSeconds;

  const duration = Math.max(0.001, state.segmentDurationSec);
  state.segmentT += deltaSeconds / duration;

  while (state.segmentT >= 1) {
    state.segmentT -= 1;
    const reached = PATROL_WAYPOINTS[state.toIndex];
    state.from = { gx: reached.gx, gy: reached.gy };
    state.toIndex = pickNextWaypointIndex(state.toIndex);
    state.segmentDurationSec = computeSegmentDuration(state.from, PATROL_WAYPOINTS[state.toIndex]);
  }

  const from = state.from;
  const to = PATROL_WAYPOINTS[state.toIndex];
  const localT = state.segmentT;
  const nextGx = lerp(from.gx, to.gx, localT);
  const nextGy = lerp(from.gy, to.gy, localT);
  const nextIsoX = nextGx - nextGy;
  const velocityIsoX = nextIsoX - previousIsoX;
  const facing =
    Math.abs(velocityIsoX) > 0.0001 ? (velocityIsoX > 0 ? "right" : "left") : state.pose.direction;

  state.pose = {
    gx: nextGx,
    gy: nextGy,
    direction: facing,
    frameIndex: Math.floor(state.walkClock * PATROL_ANIM_FPS),
  };
}

function syncPatrolFromCurrentPose(state: PatrolState): void {
  if (!PATROL_WAYPOINTS.length) {
    return;
  }

  const nearestIndex = findNearestWaypointIndex(state.pose.gx, state.pose.gy);
  state.from = { gx: state.pose.gx, gy: state.pose.gy };
  state.toIndex = pickNextWaypointIndex(nearestIndex);
  state.segmentT = 0;
  state.segmentDurationSec = computeSegmentDuration(state.from, PATROL_WAYPOINTS[state.toIndex]);
}

function updateManualPose(state: PatrolState, deltaSeconds: number, keys: MovementKeys, bounds: GridBounds): void {
  let moveGX = 0;
  let moveGY = 0;

  if (keys.w) {
    moveGX -= 1;
    moveGY -= 1;
  }
  if (keys.s) {
    moveGX += 1;
    moveGY += 1;
  }
  if (keys.a) {
    moveGX -= 1;
    moveGY += 1;
  }
  if (keys.d) {
    moveGX += 1;
    moveGY -= 1;
  }

  const length = Math.hypot(moveGX, moveGY);
  if (length < 0.0001) {
    state.pose = {
      ...state.pose,
      frameIndex: 0,
    };
    return;
  }

  const step = (MANUAL_GRID_SPEED * deltaSeconds) / length;
  const rawGx = state.pose.gx + moveGX * step;
  const rawGy = state.pose.gy + moveGY * step;
  const nextGx = clamp(rawGx, bounds.minGx + GRID_EDGE_MARGIN, bounds.maxGx - GRID_EDGE_MARGIN);
  const nextGy = clamp(rawGy, bounds.minGy + GRID_EDGE_MARGIN, bounds.maxGy - GRID_EDGE_MARGIN);
  const movedX = nextGx - state.pose.gx;
  const movedY = nextGy - state.pose.gy;
  if (Math.abs(movedX) < 0.0001 && Math.abs(movedY) < 0.0001) {
    state.pose = {
      ...state.pose,
      frameIndex: 0,
    };
    return;
  }

  const previousIsoX = state.pose.gx - state.pose.gy;
  const nextIsoX = nextGx - nextGy;
  const velocityIsoX = nextIsoX - previousIsoX;
  const facing =
    Math.abs(velocityIsoX) > 0.0001 ? (velocityIsoX > 0 ? "right" : "left") : state.pose.direction;

  state.walkClock += deltaSeconds;
  state.pose = {
    gx: nextGx,
    gy: nextGy,
    direction: facing,
    frameIndex: Math.floor(state.walkClock * MANUAL_ANIM_FPS),
  };
}

function hasMovementInput(keys: MovementKeys): boolean {
  return keys.w || keys.a || keys.s || keys.d;
}

function findNearestWaypointIndex(gx: number, gy: number): number {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < PATROL_WAYPOINTS.length; i += 1) {
    const waypoint = PATROL_WAYPOINTS[i];
    const distance = Math.hypot(waypoint.gx - gx, waypoint.gy - gy);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = i;
    }
  }
  return nearestIndex;
}

function computeGridBounds(map: IslandMap): GridBounds {
  let minGx = Number.POSITIVE_INFINITY;
  let maxGx = Number.NEGATIVE_INFINITY;
  let minGy = Number.POSITIVE_INFINITY;
  let maxGy = Number.NEGATIVE_INFINITY;
  for (const tile of map.tiles) {
    minGx = Math.min(minGx, tile.gx);
    maxGx = Math.max(maxGx, tile.gx);
    minGy = Math.min(minGy, tile.gy);
    maxGy = Math.max(maxGy, tile.gy);
  }

  if (!Number.isFinite(minGx) || !Number.isFinite(minGy)) {
    return { minGx: 0, maxGx: 0, minGy: 0, maxGy: 0 };
  }

  return { minGx, maxGx, minGy, maxGy };
}

function computeSegmentDuration(from: { gx: number; gy: number }, to: { gx: number; gy: number }): number {
  const distance = Math.hypot(to.gx - from.gx, to.gy - from.gy);
  return Math.max(0.001, distance / PATROL_GRID_SPEED);
}

function pickNextWaypointIndex(currentIndex: number): number {
  if (PATROL_WAYPOINTS.length <= 1) {
    return currentIndex;
  }

  const candidates: number[] = [];
  for (let i = 0; i < PATROL_WAYPOINTS.length; i += 1) {
    if (i === currentIndex) {
      continue;
    }
    const from = PATROL_WAYPOINTS[currentIndex];
    const to = PATROL_WAYPOINTS[i];
    const distance = Math.hypot(to.gx - from.gx, to.gy - from.gy);
    if (distance >= 0.9) {
      candidates.push(i);
    }
  }

  const pool = candidates.length ? candidates : PATROL_WAYPOINTS.map((_, index) => index).filter((i) => i !== currentIndex);
  return pool[Math.floor(Math.random() * pool.length)];
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function applyNeighborImpulse(
  hoveredTileId: string,
  tileById: Map<string, TileDef>,
  tileLookup: Map<string, TileDef>,
  island: IslandMap,
  springs: Map<string, TileSpringState>
): void {
  const hovered = tileById.get(hoveredTileId);
  if (!hovered) {
    return;
  }

  const neighbors = [
    tileLookup.get(coordKey(hovered.gx + 1, hovered.gy)),
    tileLookup.get(coordKey(hovered.gx - 1, hovered.gy)),
    tileLookup.get(coordKey(hovered.gx, hovered.gy + 1)),
    tileLookup.get(coordKey(hovered.gx, hovered.gy - 1)),
  ].filter((tile): tile is TileDef => Boolean(tile));

  const hoveredBase = gridToScreen(hovered.gx, hovered.gy, 0, 0, island.tileW, island.tileH);
  for (const neighbor of neighbors) {
    const state = springs.get(neighbor.id);
    if (!state) {
      continue;
    }
    const neighborBase = gridToScreen(neighbor.gx, neighbor.gy, 0, 0, island.tileW, island.tileH);
    const dirX = neighborBase.x - hoveredBase.x;
    const dirY = neighborBase.y - hoveredBase.y;
    const length = Math.hypot(dirX, dirY) || 1;
    state.vx += (dirX / length) * NEIGHBOR_IMPULSE;
    state.vy += (dirY / length) * NEIGHBOR_IMPULSE;
  }
}

function screenToWorld(
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  return {
    x: (x - centerX - panX) / zoom + centerX,
    y: (y - centerY - panY) / zoom + centerY,
  };
}

function worldToScreen(
  x: number,
  y: number,
  width: number,
  height: number,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  return {
    x: centerX + (x - centerX) * zoom + panX,
    y: centerY + (y - centerY) * zoom + panY,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveSpawn(island: IslandMap): { gx: number; gy: number } {
  const gx = island.spawn?.gx;
  const gy = island.spawn?.gy;
  if (Number.isFinite(gx) && Number.isFinite(gy)) {
    return { gx, gy };
  }
  return { gx: PATROL_WAYPOINTS[0].gx, gy: PATROL_WAYPOINTS[0].gy };
}
