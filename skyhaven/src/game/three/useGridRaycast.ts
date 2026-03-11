import { useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";
import type { IslandMap, TileDef, AssetKey } from "../types";

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const intersection = new THREE.Vector3();

export type GridRaycastCallbacks = {
  onHoverTile?: (tile: TileDef | null) => void;
  onPlaceTile?: (gx: number, gy: number, type: AssetKey) => void;
  onRemoveTile?: (gx: number, gy: number) => void;
  onSelectTileForEdit?: (gx: number, gy: number) => void;
  onClearTileForEdit?: () => void;
};

export type GridRaycastOptions = {
  buildMode: boolean;
  eraseMode: boolean;
  selectedTileType: AssetKey | null;
  selectedIslandId: string;
};

function worldToGrid(worldX: number, worldZ: number): { gx: number; gy: number } {
  return {
    gx: Math.round(worldX / TILE_UNIT_SIZE),
    gy: Math.round(worldZ / TILE_UNIT_SIZE),
  };
}

function findTileAtGrid(island: IslandMap, gx: number, gy: number): TileDef | null {
  return island.tiles.find((t) => t.gx === gx && t.gy === gy) ?? null;
}

export function useGridRaycast(
  island: IslandMap,
  callbacks: GridRaycastCallbacks,
  opts: GridRaycastOptions
) {
  const { camera } = useThree();
  const hoveredTileRef = useRef<TileDef | null>(null);
  const ghostCellRef = useRef<{ gx: number; gy: number } | null>(null);

  const getGroundHit = useCallback(
    (event: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.ray.intersectPlane(groundPlane, intersection);
      return hit;
    },
    [camera]
  );

  const handlePointerMove = useCallback(
    (event: THREE.Event & { clientX: number; clientY: number }) => {
      const canvas = (event.target as unknown as { ownerDocument?: { querySelector: (s: string) => HTMLCanvasElement | null } })
        ?.ownerDocument?.querySelector?.("canvas");
      if (!canvas) return;

      const hit = getGroundHit(event as unknown as { clientX: number; clientY: number }, canvas);
      if (!hit) {
        if (hoveredTileRef.current) {
          hoveredTileRef.current = null;
          callbacks.onHoverTile?.(null);
        }
        ghostCellRef.current = null;
        return;
      }

      const { gx, gy } = worldToGrid(hit.x, hit.z);
      const tile = findTileAtGrid(island, gx, gy);

      if (tile !== hoveredTileRef.current) {
        hoveredTileRef.current = tile;
        callbacks.onHoverTile?.(tile);
      }

      if (opts.buildMode && opts.selectedTileType) {
        ghostCellRef.current = { gx, gy };
      } else {
        ghostCellRef.current = null;
      }
    },
    [island, callbacks, opts.buildMode, opts.selectedTileType, getGroundHit]
  );

  const handleClick = useCallback(
    (event: THREE.Event & { clientX: number; clientY: number }) => {
      const canvas = (event.target as unknown as { ownerDocument?: { querySelector: (s: string) => HTMLCanvasElement | null } })
        ?.ownerDocument?.querySelector?.("canvas");
      if (!canvas) return;

      const hit = getGroundHit(event as unknown as { clientX: number; clientY: number }, canvas);
      if (!hit) return;

      const { gx, gy } = worldToGrid(hit.x, hit.z);

      if (opts.eraseMode) {
        const tile = findTileAtGrid(island, gx, gy);
        if (tile) callbacks.onRemoveTile?.(tile.gx, tile.gy);
        return;
      }

      if (opts.buildMode && opts.selectedTileType) {
        callbacks.onPlaceTile?.(gx, gy, opts.selectedTileType);
        return;
      }

      if (opts.selectedIslandId === "custom" && !opts.buildMode && !opts.eraseMode) {
        const tile = findTileAtGrid(island, gx, gy);
        if (tile) {
          callbacks.onSelectTileForEdit?.(tile.gx, tile.gy);
        } else {
          callbacks.onClearTileForEdit?.();
        }
      }
    },
    [island, callbacks, opts, getGroundHit]
  );

  return { handlePointerMove, handleClick, ghostCell: ghostCellRef };
}
