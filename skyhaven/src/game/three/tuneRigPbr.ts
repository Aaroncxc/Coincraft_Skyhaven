import * as THREE from "three";

/**
 * Meshy-style character exports often use high metalness; with only a few directional lights and no IBL,
 * metallic surfaces contribute almost no diffuse and look much darker than tile albedo (which is mostly diffuse).
 */
export function tuneRigPbrForIslandLighting(material: THREE.Material | THREE.Material[]): void {
  const one = (m: THREE.Material) => {
    if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
      m.metalness = Math.min(m.metalness, 0.32);
    }
  };
  if (Array.isArray(material)) {
    for (const m of material) {
      if (m) one(m);
    }
  } else if (material) {
    one(material);
  }
}
