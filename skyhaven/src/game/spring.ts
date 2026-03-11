import type { TileSpringState } from "./types";

export const STIFFNESS = 170;
export const DAMPING = 26;
export const HOVER_LIFT = 12;
export const NEIGHBOR_IMPULSE = 26;
export const EPSILON = 0.005;

export function createSpringState(): TileSpringState {
  return { ox: 0, oy: 0, vx: 0, vy: 0 };
}

export function integrateSpring(
  state: TileSpringState,
  targetX: number,
  targetY: number,
  dtSeconds: number
): void {
  const dt = Math.max(0.0001, Math.min(0.05, dtSeconds));
  const ax = STIFFNESS * (targetX - state.ox) - DAMPING * state.vx;
  const ay = STIFFNESS * (targetY - state.oy) - DAMPING * state.vy;

  state.vx += ax * dt;
  state.vy += ay * dt;
  state.ox += state.vx * dt;
  state.oy += state.vy * dt;

  if (
    Math.abs(state.ox - targetX) < EPSILON &&
    Math.abs(state.oy - targetY) < EPSILON &&
    Math.abs(state.vx) < EPSILON &&
    Math.abs(state.vy) < EPSILON
  ) {
    state.ox = targetX;
    state.oy = targetY;
    state.vx = 0;
    state.vy = 0;
  }
}
