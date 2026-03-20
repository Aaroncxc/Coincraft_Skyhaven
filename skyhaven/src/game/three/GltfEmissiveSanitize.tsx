import { useGLTF } from "@react-three/drei";
import { useLayoutEffect } from "react";
import { ALL_GAME_GLTF_PATHS } from "./assets3d";
import { applyIslandGltfMeshDefaults } from "./islandGltfMeshDefaults";

function StripLoadedGltf({ path }: { path: string }) {
  const gltf = useGLTF(path);
  useLayoutEffect(() => {
    applyIslandGltfMeshDefaults(gltf.scene);
  }, [gltf.scene]);
  return null;
}

/** Emissive strip, roughness scale, shadow flags on every game glTF (shared loader scenes / primitives). */
export function GltfEmissiveSanitize() {
  return (
    <>
      {ALL_GAME_GLTF_PATHS.map((path) => (
        <StripLoadedGltf key={path} path={path} />
      ))}
    </>
  );
}
