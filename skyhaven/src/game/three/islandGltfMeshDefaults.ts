import * as THREE from "three";
import { stripEmbeddedEmissive } from "./stripGltfEmissive";

/**
 * Minimum roughness after tuning (0–1). High value = almost no specular highlight, matte look.
 * Tune here if you want slightly more or less sheen.
 */
export const ISLAND_GLTF_ROUGHNESS_FLOOR = 0.97;

const ROUGHNESS_TUNED_KEY = "skyhavenRoughnessTuned";

/** Push roughness up toward matte once per material (clone copies userData → no double apply). */
export function scalePbrRoughness(material: THREE.Material | THREE.Material[]): void {
  const one = (m: THREE.Material) => {
    if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial)) return;
    if (m.userData[ROUGHNESS_TUNED_KEY]) return;
    m.roughness = Math.min(1, Math.max(m.roughness, ISLAND_GLTF_ROUGHNESS_FLOOR));
    m.userData[ROUGHNESS_TUNED_KEY] = true;
  };
  if (Array.isArray(material)) {
    for (const m of material) {
      if (m) one(m);
    }
  } else if (material) {
    one(material);
  }
}

/** Strip emissive, matte roughness, shadow cast/receive on every Mesh (mutates cached glTF scenes). */
export function applyIslandGltfMeshDefaults(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    if (!child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!m) continue;
      stripEmbeddedEmissive(m);
      scalePbrRoughness(m);
    }
  });
}
