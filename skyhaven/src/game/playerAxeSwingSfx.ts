/** Matches `public/ingame_assets/3d/Waffen/...` (spaces encoded for URL). */
const AXE_SWING_WAV_URL =
  "/ingame_assets/3d/Waffen/" +
  encodeURIComponent("Weapons and Impacts Axe Swing Swipe Attack Movement 01.wav");
const AXE_FLESH_HIT_1_URL =
  "/ingame_assets/3d/Waffen/" +
  encodeURIComponent("Axe Flesh Hit 1.mp3");
const AXE_HIT_ROCK_URL =
  "/ingame_assets/3d/Waffen/" +
  encodeURIComponent("AXE_HIT_Rock.wav");

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function playOneShot(url: string, volume01: number): void {
  if (volume01 <= 0) return;
  const audio = new Audio(url);
  audio.volume = clamp01(volume01);
  void audio.play().catch(() => {});
}

/** One-shot axe swing; volume follows Sidebar SFX (same idea as footsteps). */
export function playAxeSwingSfx(volume01: number): void {
  playOneShot(AXE_SWING_WAV_URL, volume01);
}

export function playFightManComboAttackSfx(step: 1 | 2 | 3, volume01: number): void {
  switch (step) {
    case 2:
      playOneShot(AXE_FLESH_HIT_1_URL, volume01);
      return;
    case 3:
      playOneShot(AXE_HIT_ROCK_URL, volume01);
      return;
    case 1:
    default:
      playOneShot(AXE_SWING_WAV_URL, volume01);
      return;
  }
}
