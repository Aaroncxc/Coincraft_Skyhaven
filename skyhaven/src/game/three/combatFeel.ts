export type ComboStep = 1 | 2 | 3;

export type CombatHitConfirmSnapshot = {
  token: number;
  comboStep: ComboStep | null;
};

export type CameraFeedbackKind = "attack" | "landing";

export type CameraFeedbackSnapshot = {
  token: number;
  kind: CameraFeedbackKind;
  /** 0..1 normalized intensity; actual camera trauma mapping stays in `IslandCamera`. */
  amount: number;
  comboStep?: ComboStep | null;
};

export const COMBO_INPUT_BUFFER_MAX = 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function getComboHitstopSec(comboStep: ComboStep | null | undefined): number {
  switch (comboStep) {
    case 1:
      return 0.04;
    case 2:
      return 0.055;
    case 3:
      return 0.08;
    default:
      return 0.045;
  }
}

export function getComboAttackCameraFeedbackAmount(comboStep: ComboStep | null | undefined): number {
  switch (comboStep) {
    case 1:
      return 0.3;
    case 2:
      return 0.38;
    case 3:
      return 0.52;
    default:
      return 0.32;
  }
}

export function getComboHitCameraTrauma(comboStep: ComboStep | null | undefined): number {
  switch (comboStep) {
    case 1:
      return 0.14;
    case 2:
      return 0.18;
    case 3:
      return 0.26;
    default:
      return 0.16;
  }
}

export function getLandingCameraFeedbackAmount(fallSpeed: number): number {
  return clamp01((Math.max(0, fallSpeed) - 2.2) / 5.6);
}
