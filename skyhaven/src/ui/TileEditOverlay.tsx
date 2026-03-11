import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MoveTileResult } from "../game/customIsland";
import type { TileDef } from "../game/types";
import type { TileEditAnchor } from "../game/useSkyhavenLoop";

type TileUpdate = {
  layerOrder?: number;
  anchorY?: number;
  localYOffset?: number;
  offsetX?: number;
  offsetY?: number;
};

type TileEditOverlayProps = {
  anchor: TileEditAnchor | null;
  tile: TileDef | null;
  tileW: number;
  tileH: number;
  onClose: () => void;
  onUpdateTile: (gx: number, gy: number, updates: TileUpdate) => void;
  onMoveTileBy: (deltaGx: number, deltaGy: number) => MoveTileResult;
  onBlockedTarget: (target: { gx: number; gy: number } | null) => void;
};

type OffsetDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
};

type GridDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  appliedDeltaGx: number;
  appliedDeltaGy: number;
};

type OverlayPlacement = "above" | "right" | "left";

type OverlayLayout = {
  placement: OverlayPlacement;
  x: number;
  y: number;
};

type OverlayOffset = {
  x: number;
  y: number;
};

type MenuDragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
};

const OFFSET_MIN = -40;
const OFFSET_MAX = 40;
const OFFSET_STEP = 2;
const LAYER_MIN = 0;
const LAYER_MAX = 300;
const LAYER_STEP = 10;
const HEIGHT_MIN_PERCENT = 0;
const HEIGHT_MAX_PERCENT = 95;
const HEIGHT_STEP_PERCENT = 5;
const DEPTH_MIN = 0;
const DEPTH_MAX = 100;
const DEPTH_STEP = 5;
const OVERLAY_MARGIN = 10;
const ABOVE_GAP = 14;
const SIDE_GAP = 12;
const SIDE_SWITCH_HYSTERESIS = 12;
const PLACEMENT_SWITCH_MS = 220;
const REPOSITION_EPSILON = 0.3;

export function TileEditOverlay({
  anchor,
  tile,
  tileW,
  tileH,
  onClose,
  onUpdateTile,
  onMoveTileBy,
  onBlockedTarget,
}: TileEditOverlayProps) {
  const [gizmoMode, setGizmoMode] = useState<"offset" | "grid">("offset");
  const [showMore, setShowMore] = useState(false);
  const [blockedPulse, setBlockedPulse] = useState(false);
  const [layout, setLayout] = useState<OverlayLayout>({ placement: "above", x: 0, y: 0 });
  const [menuOffset, setMenuOffset] = useState<OverlayOffset>({ x: 0, y: 0 });
  const [isPlacementSwitching, setIsPlacementSwitching] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const blockedTimerRef = useRef<number | null>(null);
  const placementSwitchTimerRef = useRef<number | null>(null);
  const placementRef = useRef<OverlayPlacement>("above");
  const anchorRef = useRef<TileEditAnchor | null>(anchor);
  const visibleRef = useRef(false);
  const menuOffsetRef = useRef<OverlayOffset>({ x: 0, y: 0 });
  const menuDragRef = useRef<MenuDragState | null>(null);
  const offsetDragRef = useRef<OffsetDragState | null>(null);
  const gridDragRef = useRef<GridDragState | null>(null);

  useEffect(() => {
    return () => {
      if (blockedTimerRef.current !== null) {
        window.clearTimeout(blockedTimerRef.current);
      }
      if (placementSwitchTimerRef.current !== null) {
        window.clearTimeout(placementSwitchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    offsetDragRef.current = null;
    gridDragRef.current = null;
    menuDragRef.current = null;
    menuOffsetRef.current = { x: 0, y: 0 };
    setMenuOffset({ x: 0, y: 0 });
    onBlockedTarget(null);
  }, [tile?.id, onBlockedTarget]);

  const visible = Boolean(anchor?.visible && tile);
  const zoom = anchor?.zoom ?? 1;

  const offsetX = tile?.offsetX ?? 0;
  const offsetY = tile?.offsetY ?? 0;
  const layerOrder = tile?.layerOrder ?? 0;
  const anchorYPercent = clamp(
    Math.round((tile?.anchorY ?? 0.71) * 100),
    HEIGHT_MIN_PERCENT,
    HEIGHT_MAX_PERCENT
  );
  const localYOffset = tile?.localYOffset ?? 0;
  anchorRef.current = anchor;
  visibleRef.current = visible;
  menuOffsetRef.current = menuOffset;

  useEffect(() => {
    if (!visible) {
      menuDragRef.current = null;
      setIsPlacementSwitching(false);
    }
  }, [visible]);

  useEffect(() => {
    const clearMenuDrag = (): void => {
      menuDragRef.current = null;
    };
    window.addEventListener("pointerup", clearMenuDrag);
    window.addEventListener("pointercancel", clearMenuDrag);
    return () => {
      window.removeEventListener("pointerup", clearMenuDrag);
      window.removeEventListener("pointercancel", clearMenuDrag);
    };
  }, []);

  const triggerPlacementSwitch = useCallback((): void => {
    setIsPlacementSwitching(true);
    if (placementSwitchTimerRef.current !== null) {
      window.clearTimeout(placementSwitchTimerRef.current);
    }
    placementSwitchTimerRef.current = window.setTimeout(() => {
      setIsPlacementSwitching(false);
      placementSwitchTimerRef.current = null;
    }, PLACEMENT_SWITCH_MS);
  }, []);

  const recomputeLayout = useCallback((): void => {
    if (!visibleRef.current) {
      return;
    }
    const currentAnchor = anchorRef.current;
    if (!currentAnchor?.visible) {
      return;
    }
    const overlayElement = overlayRef.current;
    const cardElement = cardRef.current;
    const frameElement = overlayElement?.parentElement;
    if (!overlayElement || !cardElement || !frameElement) {
      return;
    }

    const frameWidth = frameElement.clientWidth;
    const frameHeight = frameElement.clientHeight;
    if (frameWidth <= 0 || frameHeight <= 0) {
      return;
    }

    const cardRect = cardElement.getBoundingClientRect();
    const cardWidth = cardRect.width;
    const cardHeight = cardRect.height;
    if (cardWidth <= 0 || cardHeight <= 0) {
      return;
    }

    const anchorX = Number.isFinite(currentAnchor.x) ? currentAnchor.x : 0;
    const anchorY = Number.isFinite(currentAnchor.y) ? currentAnchor.y : 0;
    const anchorCenterY = Number.isFinite(currentAnchor.centerY) ? currentAnchor.centerY : anchorY;

    const aboveX = anchorX - cardWidth * 0.5;
    const aboveY = anchorY - ABOVE_GAP - cardHeight;
    const rightX = anchorX + SIDE_GAP;
    const rightY = anchorCenterY - cardHeight * 0.5;
    const leftX = anchorX - SIDE_GAP - cardWidth;
    const leftY = anchorCenterY - cardHeight * 0.5;

    const fitsFrame = (x: number, y: number): boolean =>
      x >= OVERLAY_MARGIN &&
      y >= OVERLAY_MARGIN &&
      x + cardWidth <= frameWidth - OVERLAY_MARGIN &&
      y + cardHeight <= frameHeight - OVERLAY_MARGIN;

    const rightFree = frameWidth - OVERLAY_MARGIN - (rightX + cardWidth);
    const leftFree = leftX - OVERLAY_MARGIN;

    let nextPlacement: OverlayPlacement = "above";
    if (!fitsFrame(aboveX, aboveY)) {
      const rightFits = fitsFrame(rightX, rightY);
      const leftFits = fitsFrame(leftX, leftY);
      if (rightFits && leftFits) {
        nextPlacement = chooseSidePlacement(placementRef.current, rightFree, leftFree);
      } else if (rightFits) {
        nextPlacement = "right";
      } else if (leftFits) {
        nextPlacement = "left";
      } else {
        nextPlacement = chooseSidePlacement(placementRef.current, rightFree, leftFree);
      }
    }

    let nextX = aboveX;
    let nextY = aboveY;
    if (nextPlacement === "right") {
      nextX = rightX;
      nextY = rightY;
    } else if (nextPlacement === "left") {
      nextX = leftX;
      nextY = leftY;
    }

    const manualOffset = menuOffsetRef.current;
    const maxX = Math.max(OVERLAY_MARGIN, frameWidth - OVERLAY_MARGIN - cardWidth);
    const maxY = Math.max(OVERLAY_MARGIN, frameHeight - OVERLAY_MARGIN - cardHeight);
    const clampedX = clamp(nextX + manualOffset.x, OVERLAY_MARGIN, maxX);
    const clampedY = clamp(nextY + manualOffset.y, OVERLAY_MARGIN, maxY);

    if (placementRef.current !== nextPlacement) {
      placementRef.current = nextPlacement;
      triggerPlacementSwitch();
    }

    setLayout((previous) => {
      if (
        previous.placement === nextPlacement &&
        Math.abs(previous.x - clampedX) < REPOSITION_EPSILON &&
        Math.abs(previous.y - clampedY) < REPOSITION_EPSILON
      ) {
        return previous;
      }
      return {
        placement: nextPlacement,
        x: clampedX,
        y: clampedY,
      };
    });
  }, [triggerPlacementSwitch]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    recomputeLayout();
  }, [visible, showMore, tile?.id, anchor?.x, anchor?.y, anchor?.centerY, recomputeLayout]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const overlayElement = overlayRef.current;
    const cardElement = cardRef.current;
    const frameElement = overlayElement?.parentElement;
    if (!overlayElement || !cardElement || !frameElement) {
      return;
    }

    let frameRequestId: number | null = null;
    const scheduleRecompute = (): void => {
      if (frameRequestId !== null) {
        return;
      }
      frameRequestId = window.requestAnimationFrame(() => {
        frameRequestId = null;
        recomputeLayout();
      });
    };

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => scheduleRecompute());
      observer.observe(frameElement);
      observer.observe(cardElement);
    }
    window.addEventListener("resize", scheduleRecompute);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRecompute);
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
    };
  }, [visible, tile?.id, recomputeLayout]);

  const triggerBlockedPulse = (): void => {
    setBlockedPulse(true);
    if (blockedTimerRef.current !== null) {
      window.clearTimeout(blockedTimerRef.current);
    }
    blockedTimerRef.current = window.setTimeout(() => {
      setBlockedPulse(false);
      blockedTimerRef.current = null;
    }, 170);
  };

  const updateOffset = (nextOffsetX: number, nextOffsetY: number): void => {
    if (!tile) {
      return;
    }
    const snappedX = snapClamp(nextOffsetX, OFFSET_STEP, OFFSET_MIN, OFFSET_MAX);
    const snappedY = snapClamp(nextOffsetY, OFFSET_STEP, OFFSET_MIN, OFFSET_MAX);
    if (snappedX === offsetX && snappedY === offsetY) {
      return;
    }
    onUpdateTile(tile.gx, tile.gy, {
      offsetX: snappedX,
      offsetY: snappedY,
    });
  };

  const handleOffsetNudge = (deltaX: number, deltaY: number): void => {
    updateOffset(offsetX + deltaX, offsetY + deltaY);
  };

  const handleOffsetPadPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!tile || gizmoMode !== "offset") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    offsetDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleOffsetPadPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = offsetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !tile || gizmoMode !== "offset") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const zoomScale = Math.max(0.35, zoom);
    const deltaX = (event.clientX - drag.startClientX) / zoomScale;
    const deltaY = (event.clientY - drag.startClientY) / zoomScale;
    updateOffset(drag.startOffsetX + deltaX, drag.startOffsetY + deltaY);
  };

  const clearOffsetDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = offsetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    offsetDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const moveGridStep = (deltaGx: number, deltaGy: number): boolean => {
    if (!tile) {
      return false;
    }
    const result = onMoveTileBy(deltaGx, deltaGy);
    if (!result.moved) {
      const coord = result.attemptedCoord;
      onBlockedTarget(
        Number.isFinite(coord.gx) && Number.isFinite(coord.gy)
          ? coord
          : null
      );
      triggerBlockedPulse();
      return false;
    }
    onBlockedTarget(null);
    return true;
  };

  const handleGridNudge = (deltaGx: number, deltaGy: number): void => {
    moveGridStep(deltaGx, deltaGy);
  };

  const handleGridPadPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!tile || gizmoMode !== "grid") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    gridDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      appliedDeltaGx: 0,
      appliedDeltaGy: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleGridPadPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = gridDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !tile || gizmoMode !== "grid") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    const stepX = truncTowardZero(deltaX / Math.max(22, tileW * zoom * 0.46));
    const stepY = truncTowardZero(deltaY / Math.max(16, tileH * zoom * 0.46));
    const targetDeltaGx = stepY + stepX;
    const targetDeltaGy = stepY - stepX;

    let remainingGx = targetDeltaGx - drag.appliedDeltaGx;
    let remainingGy = targetDeltaGy - drag.appliedDeltaGy;
    if (remainingGx === 0 && remainingGy === 0) {
      return;
    }

    let appliedGx = drag.appliedDeltaGx;
    let appliedGy = drag.appliedDeltaGy;
    while (remainingGx !== 0 || remainingGy !== 0) {
      const stepDeltaGx = remainingGx === 0 ? 0 : Math.sign(remainingGx);
      const stepDeltaGy = remainingGy === 0 ? 0 : Math.sign(remainingGy);
      const moved = moveGridStep(stepDeltaGx, stepDeltaGy);
      if (!moved) {
        break;
      }
      appliedGx += stepDeltaGx;
      appliedGy += stepDeltaGy;
      remainingGx = targetDeltaGx - appliedGx;
      remainingGy = targetDeltaGy - appliedGy;
    }

    gridDragRef.current = {
      ...drag,
      appliedDeltaGx: appliedGx,
      appliedDeltaGy: appliedGy,
    };
  };

  const clearGridDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = gridDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    gridDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleMenuHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!visible || !tile || event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && target.closest("button, input, select, textarea, label, a")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    menuDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: menuOffsetRef.current.x,
      startOffsetY: menuOffsetRef.current.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMenuHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = menuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextOffset = {
      x: drag.startOffsetX + (event.clientX - drag.startClientX),
      y: drag.startOffsetY + (event.clientY - drag.startClientY),
    };
    menuOffsetRef.current = nextOffset;
    setMenuOffset(nextOffset);
    recomputeLayout();
  };

  const clearMenuHeaderDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = menuDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    menuDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    recomputeLayout();
  };

  return (
    <div
      ref={overlayRef}
      className={`tile-edit-overlay placement-${layout.placement} ${visible ? "is-visible" : ""} ${
        isPlacementSwitching ? "is-placement-switching" : ""
      }`}
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
      }}
      data-no-window-drag="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {tile ? (
        <div ref={cardRef} className={`tile-edit-card ${blockedPulse ? "is-blocked" : ""}`}>
          <div
            className="tile-edit-header is-draggable"
            onPointerDown={handleMenuHeaderPointerDown}
            onPointerMove={handleMenuHeaderPointerMove}
            onPointerUp={clearMenuHeaderDrag}
            onPointerCancel={clearMenuHeaderDrag}
            onLostPointerCapture={clearMenuHeaderDrag}
          >
            <span className="tile-edit-title">Tile ({tile.gx}, {tile.gy})</span>
            <button type="button" className="tile-edit-close" onClick={onClose}>
              x
            </button>
          </div>

          <div className="tile-edit-mode-switch">
            <button
              type="button"
              className={`tile-edit-mode-btn ${gizmoMode === "offset" ? "is-active" : ""}`}
              onClick={() => setGizmoMode("offset")}
            >
              Offset
            </button>
            <button
              type="button"
              className={`tile-edit-mode-btn ${gizmoMode === "grid" ? "is-active" : ""}`}
              onClick={() => setGizmoMode("grid")}
            >
              Grid
            </button>
          </div>

          <div className="tile-gizmo-block">
            <button
              type="button"
              className="tile-gizmo-arrow up"
              onClick={() =>
                gizmoMode === "offset"
                  ? handleOffsetNudge(0, -OFFSET_STEP)
                  : handleGridNudge(-1, -1)
              }
            >
              Up
            </button>
            <button
              type="button"
              className="tile-gizmo-arrow left"
              onClick={() =>
                gizmoMode === "offset"
                  ? handleOffsetNudge(-OFFSET_STEP, 0)
                  : handleGridNudge(-1, 1)
              }
            >
              Left
            </button>

            <div
              className={`tile-gizmo-pad ${gizmoMode === "offset" ? "is-offset" : "is-grid"}`}
              onPointerDown={gizmoMode === "offset" ? handleOffsetPadPointerDown : handleGridPadPointerDown}
              onPointerMove={gizmoMode === "offset" ? handleOffsetPadPointerMove : handleGridPadPointerMove}
              onPointerUp={gizmoMode === "offset" ? clearOffsetDrag : clearGridDrag}
              onPointerCancel={gizmoMode === "offset" ? clearOffsetDrag : clearGridDrag}
              onLostPointerCapture={gizmoMode === "offset" ? clearOffsetDrag : clearGridDrag}
            >
              <span>{gizmoMode === "offset" ? "Drag" : "Drag Snap"}</span>
            </div>

            <button
              type="button"
              className="tile-gizmo-arrow right"
              onClick={() =>
                gizmoMode === "offset"
                  ? handleOffsetNudge(OFFSET_STEP, 0)
                  : handleGridNudge(1, -1)
              }
            >
              Right
            </button>
            <button
              type="button"
              className="tile-gizmo-arrow down"
              onClick={() =>
                gizmoMode === "offset"
                  ? handleOffsetNudge(0, OFFSET_STEP)
                  : handleGridNudge(1, 1)
              }
            >
              Down
            </button>
          </div>

          <div className="tile-edit-values">
            <span>X {offsetX}</span>
            <span>Y {offsetY}</span>
          </div>

          <div className="tile-edit-quick-actions">
            <button
              type="button"
              onClick={() => onUpdateTile(tile.gx, tile.gy, { offsetX: 0, offsetY: 0 })}
            >
              Reset Offset
            </button>
            <button type="button" onClick={() => setShowMore((previous) => !previous)}>
              {showMore ? "Less" : "More"}
            </button>
            <button type="button" onClick={onClose}>
              Done
            </button>
          </div>

          <div className={`tile-edit-more ${showMore ? "is-open" : ""}`}>
            <label className="tile-edit-slider-row">
              <span>Layer</span>
              <input
                type="range"
                min={LAYER_MIN}
                max={LAYER_MAX}
                step={LAYER_STEP}
                value={layerOrder}
                onChange={(event) =>
                  onUpdateTile(tile.gx, tile.gy, { layerOrder: Number(event.target.value) })
                }
              />
              <span>{layerOrder}</span>
            </label>

            <label className="tile-edit-slider-row">
              <span>Height</span>
              <input
                type="range"
                min={HEIGHT_MIN_PERCENT}
                max={HEIGHT_MAX_PERCENT}
                step={HEIGHT_STEP_PERCENT}
                value={anchorYPercent}
                onChange={(event) =>
                  onUpdateTile(tile.gx, tile.gy, {
                    anchorY: Number(event.target.value) / 100,
                  })
                }
              />
              <span>{anchorYPercent}%</span>
            </label>

            <label className="tile-edit-slider-row">
              <span>Depth</span>
              <input
                type="range"
                min={DEPTH_MIN}
                max={DEPTH_MAX}
                step={DEPTH_STEP}
                value={localYOffset}
                onChange={(event) =>
                  onUpdateTile(tile.gx, tile.gy, {
                    localYOffset: Number(event.target.value),
                  })
                }
              />
              <span>{localYOffset}</span>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function chooseSidePlacement(
  previous: OverlayPlacement,
  rightFree: number,
  leftFree: number
): OverlayPlacement {
  const preferred: OverlayPlacement = rightFree >= leftFree ? "right" : "left";
  if (previous !== "right" && previous !== "left") {
    return preferred;
  }
  const previousFree = previous === "right" ? rightFree : leftFree;
  const otherFree = previous === "right" ? leftFree : rightFree;
  if (previousFree + SIDE_SWITCH_HYSTERESIS >= otherFree) {
    return previous;
  }
  return preferred;
}

function truncTowardZero(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

function snapClamp(value: number, step: number, min: number, max: number): number {
  const snapped = Math.round(value / step) * step;
  return clamp(snapped, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
