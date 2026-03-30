export type TargetableKind = "npc" | "enemy";

export type TargetableSnapshot = {
  id: string;
  kind: TargetableKind;
  gx: number;
  gy: number;
  surfaceY?: number;
  worldY?: number;
  alive: boolean;
};

export type TargetLockState = {
  activeTargetId: string | null;
};

export function normalizeTargetLockAngle(angle: number): number {
  const tau = Math.PI * 2;
  let normalized = angle % tau;
  if (normalized < 0) normalized += tau;
  return normalized;
}

export function getTargetLockAngle(fromGx: number, fromGy: number, targetGx: number, targetGy: number): number {
  return normalizeTargetLockAngle(Math.atan2(targetGx - fromGx, targetGy - fromGy));
}
