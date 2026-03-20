import { useCallback, useMemo, useReducer, useRef } from "react";
import type * as THREE from "three";

/**
 * Stable ids + live Object3D list for postprocessing `SelectiveBloom`.
 * InstancedMesh must be registered explicitly (library `Select` only traverses `type === "Mesh"`).
 */
export function useVfxBloomSelection() {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  const mapRef = useRef(new Map<string, THREE.Object3D>());
  const binderCache = useRef(new Map<string, (obj: THREE.Object3D | null) => void>());

  const setTarget = useCallback((id: string, obj: THREE.Object3D | null) => {
    const m = mapRef.current;
    if (obj) m.set(id, obj);
    else m.delete(id);
    bump();
  }, []);

  const bind = useCallback((id: string) => {
    const cache = binderCache.current;
    let fn = cache.get(id);
    if (!fn) {
      fn = (obj: THREE.Object3D | null) => setTarget(id, obj);
      cache.set(id, fn);
    }
    return fn;
  }, [setTarget]);

  const selection = useMemo(() => Array.from(mapRef.current.values()), [version]);

  return { selection, bind, setTarget };
}
