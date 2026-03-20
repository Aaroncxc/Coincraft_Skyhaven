import * as THREE from "three";

function stripOne(material: THREE.Material): void {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    material.emissiveMap = null;
    material.emissive.setHex(0x000000);
    material.emissiveIntensity = 0;
    material.needsUpdate = true;
  }
}

/** Remove glTF-baked emission so scene lights read correctly; do not dispose shared textures. */
export function stripEmbeddedEmissive(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) {
      if (m) stripOne(m);
    }
  } else if (material) {
    stripOne(material);
  }
}

/** Strip emission on every mesh under `root` (mutates materials in the glTF cache). */
export function stripEmbeddedEmissiveFromObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      stripEmbeddedEmissive(child.material);
    }
  });
}
