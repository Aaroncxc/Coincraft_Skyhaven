import { TransformControls, useGLTF } from "@react-three/drei";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { TileDef } from "../types";
import { getModelKeyForAsset, getModelPathForAsset, TILE_UNIT_SIZE } from "./assets3d";

export type DebugTileWrapperProps = {
  tile: TileDef;
  selected: boolean;
  gizmoMode: "translate" | "scale";
  uniformScale?: boolean;
  editingDecoration?: boolean;
  buildMode?: boolean;
  onSelect: () => void;
  onChange: (pos3d: { x: number; y: number; z: number }, scale3d: { x: number; y: number; z: number }, rotY: number) => void;
  onDecoChange?: (decoPos3d: { x: number; y: number; z: number }, decoScale3d: { x: number; y: number; z: number }, decoRotY: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
};

const SCALE_OVERRIDES: Record<string, number> = {
  tree: 1.35,
};

const MULTI_CELL: Record<string, { w: number; h: number }> = {
  mine: { w: 2, h: 2 },
  poisFarming: { w: 2, h: 2 },
  taverne: { w: 2, h: 2 },
  floatingForge: { w: 2, h: 2 },
  farmingChicken: { w: 2, h: 2 },
  magicTower: { w: 2, h: 2 },
};

export function DebugTileWrapper({
  tile,
  selected,
  gizmoMode,
  onSelect,
  onChange,
  onDecoChange,
  onDraggingChange,
  uniformScale = false,
  editingDecoration = false,
  buildMode = false,
}: DebugTileWrapperProps) {
  const modelKey = getModelKeyForAsset(tile.type);
  const modelPath = getModelPathForAsset(tile.type);
  const { scene } = useGLTF(modelPath);
  const objRef = useRef<THREE.Group>(null!);
  const controlsRef = useRef<any>(null);
  const prevUniformRef = useRef<number | null>(null);
  const lastOnChangeRef = useRef(0);
  const dragActiveRef = useRef(false);

  const cloned = useMemo(() => scene.clone(true), [scene]);

  const { normScale, offsetY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const multi = MULTI_CELL[modelKey];
    const footprint = multi
      ? Math.max(multi.w, multi.h) * TILE_UNIT_SIZE
      : TILE_UNIT_SIZE;
    const maxDim = Math.max(size.x, size.z);
    let s = maxDim > 0 ? footprint / maxDim : 1;
    const override = SCALE_OVERRIDES[modelKey];
    if (override) s *= override;
    return { normScale: s, offsetY: -box.min.y * s };
  }, [scene, modelKey]);

  const multi = MULTI_CELL[modelKey];
  const gridOffX = multi ? ((multi.w - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const gridOffZ = multi ? ((multi.h - 1) * TILE_UNIT_SIZE) / 2 : 0;
  const hitW = multi ? multi.w * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const hitD = multi ? multi.h * TILE_UNIT_SIZE : TILE_UNIT_SIZE;
  const hitH = TILE_UNIT_SIZE * 0.9;
  const defaultX = tile.gx * TILE_UNIT_SIZE + gridOffX;
  const defaultZ = tile.gy * TILE_UNIT_SIZE + gridOffZ;

  const initX = tile.pos3d ? tile.pos3d.x : defaultX;
  const initY = tile.pos3d ? tile.pos3d.y : 0;
  const initZ = tile.pos3d ? tile.pos3d.z : defaultZ;

  const initSX = tile.scale3d ? tile.scale3d.x : 1;
  const initSY = tile.scale3d ? tile.scale3d.y : 1;
  const initSZ = tile.scale3d ? tile.scale3d.z : 1;
  const initRotY = tile.rotY ?? 0;

  const isTree = modelKey === "tree" || modelKey === "treeMiddle";

  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        child.raycast = () => {};
        child.material = child.material.clone();
        if (isTree && (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhysicalMaterial)) {
          child.material.roughness = 0.98;
          child.material.metalness = 0;
        }
      }
    });
  }, [cloned, isTree]);

  useLayoutEffect(() => {
    if (!objRef.current) return;
    if (dragActiveRef.current) return;
    objRef.current.position.set(initX, initY, initZ);
    objRef.current.scale.set(initSX, initSY, initSZ);
    objRef.current.rotation.set(0, initRotY, 0);
  }, [tile.id, initX, initY, initZ, initSX, initSY, initSZ, initRotY]);

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const handleDraggingChanged = (event: { value: boolean }) => {
      dragActiveRef.current = event.value;
      if (!event.value) {
        prevUniformRef.current = null;
        if (objRef.current) {
          const p = objRef.current.position;
          const s = objRef.current.scale;
          const ry = objRef.current.rotation.y;
          const clampRange = TILE_UNIT_SIZE * 1.5;
          const cx = gizmoMode === "scale" ? initX : Math.max(defaultX - clampRange, Math.min(defaultX + clampRange, p.x));
          const cy = gizmoMode === "scale" ? initY : Math.max(-3.0, Math.min(5.0, p.y));
          const cz = gizmoMode === "scale" ? initZ : Math.max(defaultZ - clampRange, Math.min(defaultZ + clampRange, p.z));
          const minS = 0.2, maxS = 3.0;
          const sx = Math.max(minS, Math.min(maxS, s.x));
          const sy = Math.max(minS, Math.min(maxS, s.y));
          const sz = Math.max(minS, Math.min(maxS, s.z));
          onChange({ x: cx, y: cy, z: cz }, { x: sx, y: sy, z: sz }, ry);
        }
      }
      onDraggingChange?.(event.value);
    };

    ctrl.addEventListener("dragging-changed", handleDraggingChanged);
    return () => {
      ctrl.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [selected, onDraggingChange, onChange, defaultX, defaultZ, gizmoMode, initX, initY, initZ]);

  const handleObjectChange = useCallback(() => {
    if (!objRef.current) return;
    const p = objRef.current.position;
    const s = objRef.current.scale;
    const ry = objRef.current.rotation.y;

    const clampRange = TILE_UNIT_SIZE * 1.5;
    let cx: number, cy: number, cz: number;
    if (gizmoMode === "scale") {
      cx = initX;
      cy = initY;
      cz = initZ;
    } else {
      cx = Math.max(defaultX - clampRange, Math.min(defaultX + clampRange, p.x));
      cy = Math.max(-3.0, Math.min(5.0, p.y));
      cz = Math.max(defaultZ - clampRange, Math.min(defaultZ + clampRange, p.z));
      if (cx !== p.x || cy !== p.y || cz !== p.z) p.set(cx, cy, cz);
    }

    const minS = 0.2;
    const maxS = 3.0;
    let sx = Math.max(minS, Math.min(maxS, s.x));
    let sy = Math.max(minS, Math.min(maxS, s.y));
    let sz = Math.max(minS, Math.min(maxS, s.z));

    if (uniformScale) {
      const prev = prevUniformRef.current ?? sx;
      let changed = sx;
      if (Math.abs(sx - prev) > 0.001) changed = sx;
      else if (Math.abs(sy - prev) > 0.001) changed = sy;
      else if (Math.abs(sz - prev) > 0.001) changed = sz;
      const u = Math.max(minS, Math.min(maxS, changed));
      sx = u; sy = u; sz = u;
      prevUniformRef.current = u;
    }

    if (sx !== s.x || sy !== s.y || sz !== s.z) {
      s.set(sx, sy, sz);
    }

    const now = performance.now();
    if (now - lastOnChangeRef.current >= 80) {
      lastOnChangeRef.current = now;
      onChange(
        { x: cx, y: cy, z: cz },
        { x: sx, y: sy, z: sz },
        ry,
      );
    }
  }, [onChange, defaultX, defaultZ, uniformScale, gizmoMode, initX, initY, initZ]);

  const selectedColor = selected ? 0xffdd44 : undefined;
  const showTileGizmo = selected && !editingDecoration && !buildMode;
  const showDecoGizmo = selected && editingDecoration && !!tile.decoration && !buildMode;

  return (
    <>
      <group ref={objRef}>
        <mesh
          position={[0, hitH / 2, 0]}
          onClick={
            buildMode
              ? undefined
              : (e) => {
                  e.stopPropagation();
                  onSelect();
                }
          }
        >
          <boxGeometry args={[hitW, hitH, hitD]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <group position={[0, offsetY, 0]}>
          <primitive object={cloned} scale={[normScale, normScale, normScale]} />
        </group>
        {selected && (
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[TILE_UNIT_SIZE * 0.44, TILE_UNIT_SIZE * 0.56, 48]} />
            <meshBasicMaterial color={selectedColor} transparent opacity={0.82} side={THREE.DoubleSide} />
          </mesh>
        )}
        {tile.blocked && (
          <mesh position={[0, TILE_UNIT_SIZE * 0.9 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[TILE_UNIT_SIZE * 0.85, TILE_UNIT_SIZE * 0.85]} />
            <meshBasicMaterial color={0xff4444} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
        {tile.decoration && (
          <EditableDecoration
            tile={tile}
            showGizmo={showDecoGizmo}
            gizmoMode={gizmoMode}
            uniformScale={uniformScale}
            onDecoChange={onDecoChange}
            onDraggingChange={onDraggingChange}
          />
        )}
      </group>
      {showTileGizmo && (
        <TransformControls
          ref={controlsRef}
          object={objRef.current}
          mode={gizmoMode}
          size={2.0}
          translationSnap={gizmoMode === "translate" ? 0.1 : undefined}
          scaleSnap={0.05}
          onObjectChange={handleObjectChange}
        />
      )}
    </>
  );
}

const DECO_SIZE_FACTOR = 0.45;
const DECO_SURFACE_Y = 0.82;

function EditableDecoration({
  tile,
  showGizmo,
  gizmoMode,
  uniformScale,
  onDecoChange,
  onDraggingChange,
}: {
  tile: TileDef;
  showGizmo: boolean;
  gizmoMode: "translate" | "scale";
  uniformScale: boolean;
  onDecoChange?: (decoPos3d: { x: number; y: number; z: number }, decoScale3d: { x: number; y: number; z: number }, decoRotY: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const decoPath = getModelPathForAsset(tile.decoration as import("../types").AssetKey);
  const { scene } = useGLTF(decoPath);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const decoRef = useRef<THREE.Group>(null!);
  const decoCtrlRef = useRef<any>(null);
  const prevUniformRef = useRef<number | null>(null);
  const lastOnChangeRef = useRef(0);
  const decoDragActiveRef = useRef(false);

  const { scale: normScale, offsetY: decoOffsetY } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z);
    const s = maxDim > 0 ? (TILE_UNIT_SIZE * DECO_SIZE_FACTOR) / maxDim : 1;
    return { scale: s, offsetY: -box.min.y * s };
  }, [scene]);

  const initDX = tile.decoPos3d?.x ?? 0;
  const initDY = (tile.decoPos3d?.y ?? 0) + DECO_SURFACE_Y + decoOffsetY;
  const initDZ = tile.decoPos3d?.z ?? 0;
  const initDSX = tile.decoScale3d?.x ?? 1;
  const initDSY = tile.decoScale3d?.y ?? 1;
  const initDSZ = tile.decoScale3d?.z ?? 1;
  const initDRotY = tile.decoRotY ?? 0;

  useEffect(() => {
    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.raycast = () => {};
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        if (child.material) child.material = child.material.clone();
      }
    });
  }, [cloned]);

  useLayoutEffect(() => {
    if (!decoRef.current) return;
    if (decoDragActiveRef.current) return;
    decoRef.current.position.set(initDX, initDY, initDZ);
    decoRef.current.scale.set(initDSX, initDSY, initDSZ);
    decoRef.current.rotation.set(0, initDRotY, 0);
  }, [tile.id, tile.decoration, initDX, initDY, initDZ, initDSX, initDSY, initDSZ, initDRotY]);

  useEffect(() => {
    const ctrl = decoCtrlRef.current;
    if (!ctrl) return;

    const handleDraggingChanged = (event: { value: boolean }) => {
      decoDragActiveRef.current = event.value;
      if (!event.value && decoRef.current) {
        prevUniformRef.current = null;
        const p = decoRef.current.position;
        const s = decoRef.current.scale;
        const ry = decoRef.current.rotation.y;
        const baseY = DECO_SURFACE_Y + decoOffsetY;
        const clampR = TILE_UNIT_SIZE * 0.6;
        const cx = gizmoMode === "scale" ? initDX : Math.max(-clampR, Math.min(clampR, p.x));
        const cy = gizmoMode === "scale" ? initDY : Math.max(baseY - 0.3, Math.min(baseY + 1.0, p.y));
        const cz = gizmoMode === "scale" ? initDZ : Math.max(-clampR, Math.min(clampR, p.z));
        const minS = 0.1, maxS = 5.0;
        const sx = Math.max(minS, Math.min(maxS, s.x));
        const sy = Math.max(minS, Math.min(maxS, s.y));
        const sz = Math.max(minS, Math.min(maxS, s.z));
        onDecoChange?.(
          { x: cx, y: cy - baseY, z: cz },
          { x: sx, y: sy, z: sz },
          ry,
        );
      }
      onDraggingChange?.(event.value);
    };

    ctrl.addEventListener("dragging-changed", handleDraggingChanged);
    return () => {
      ctrl.removeEventListener("dragging-changed", handleDraggingChanged);
    };
  }, [showGizmo, onDraggingChange, onDecoChange, gizmoMode, decoOffsetY, initDX, initDY, initDZ]);

  const handleDecoObjectChange = useCallback(() => {
    if (!decoRef.current) return;
    const p = decoRef.current.position;
    const s = decoRef.current.scale;
    const ry = decoRef.current.rotation.y;

    const baseY = DECO_SURFACE_Y + decoOffsetY;
    const clampR = TILE_UNIT_SIZE * 0.6;

    let cx: number, cy: number, cz: number;
    if (gizmoMode === "scale") {
      cx = initDX;
      cy = initDY;
      cz = initDZ;
    } else {
      cx = Math.max(-clampR, Math.min(clampR, p.x));
      cy = Math.max(baseY - 0.3, Math.min(baseY + 1.0, p.y));
      cz = Math.max(-clampR, Math.min(clampR, p.z));
      if (cx !== p.x || cy !== p.y || cz !== p.z) p.set(cx, cy, cz);
    }

    const minS = 0.1, maxS = 5.0;
    let sx = Math.max(minS, Math.min(maxS, s.x));
    let sy = Math.max(minS, Math.min(maxS, s.y));
    let sz = Math.max(minS, Math.min(maxS, s.z));

    if (uniformScale) {
      const prev = prevUniformRef.current ?? sx;
      let changed = sx;
      if (Math.abs(sx - prev) > 0.001) changed = sx;
      else if (Math.abs(sy - prev) > 0.001) changed = sy;
      else if (Math.abs(sz - prev) > 0.001) changed = sz;
      const u = Math.max(minS, Math.min(maxS, changed));
      sx = u; sy = u; sz = u;
      prevUniformRef.current = u;
    }

    if (sx !== s.x || sy !== s.y || sz !== s.z) s.set(sx, sy, sz);

    const now = performance.now();
    if (now - lastOnChangeRef.current >= 80) {
      lastOnChangeRef.current = now;
      onDecoChange?.(
        { x: cx, y: cy - baseY, z: cz },
        { x: sx, y: sy, z: sz },
        ry,
      );
    }
  }, [onDecoChange, uniformScale, gizmoMode, decoOffsetY, initDX, initDY, initDZ]);

  return (
    <>
      <group ref={decoRef}>
        <primitive object={cloned} scale={[normScale, normScale, normScale]} />
      </group>
      {showGizmo && (
        <TransformControls
          ref={decoCtrlRef}
          object={decoRef.current}
          mode={gizmoMode}
          size={1.55}
          translationSnap={gizmoMode === "translate" ? 0.05 : undefined}
          scaleSnap={0.05}
          onObjectChange={handleDecoObjectChange}
        />
      )}
    </>
  );
}
