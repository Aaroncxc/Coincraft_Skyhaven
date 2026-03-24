/** Matches `public/ingame_assets/3d/Waffen/...` (spaces encoded for URL). */
const AXE_SWING_WAV_URL =
  "/ingame_assets/3d/Waffen/" +
  encodeURIComponent("Weapons and Impacts Axe Swing Swipe Attack Movement 01.wav");

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** One-shot axe swing; volume follows Sidebar SFX (same idea as footsteps). */
export function playAxeSwingSfx(volume01: number): void {
  if (volume01 <= 0) return;
  const audio = new Audio(AXE_SWING_WAV_URL);
  audio.volume = clamp01(volume01);
  void audio.play().catch(() => {});
}
