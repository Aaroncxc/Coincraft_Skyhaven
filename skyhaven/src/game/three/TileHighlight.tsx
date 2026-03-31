import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { TILE_UNIT_SIZE } from "./assets3d";

type TileHighlightProps = {
  gx: number;
  gy: number;
  y?: number;
  color?: string;
  pulse?: boolean;
};

export function TileHighlight({ gx, gy, y = 0.02, color = "#ffdd44", pulse = true }: TileHighlightProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (pulse) {
      const t = Math.sin(clock.getElapsedTime() * 3) * 0.5 + 0.5;
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + t * 0.25;
    }
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[gx * TILE_UNIT_SIZE, y, gy * TILE_UNIT_SIZE]}
    >
      <planeGeometry args={[TILE_UNIT_SIZE * 0.9, TILE_UNIT_SIZE * 0.9]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}
