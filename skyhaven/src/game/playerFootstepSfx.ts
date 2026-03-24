const FOOTSTEP_WAV_URLS = [
  "/ingame_assets/3d/Main_Char/MainCharFootstep.wav",
  "/ingame_assets/3d/Main_Char/MainCharFootstep_1.wav",
] as const;

const MIN_INTERVAL_MS = 130;

let lastPlayTimeMs = 0;
let footstepClipIndex = 0;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * One-shot footstep; respects min interval so rapid movement does not stack clips harshly.
 * @param volume01 0–1 (already scaled by master SFX if desired)
 */
export function playPlayerFootstep(volume01: number): void {
  if (volume01 <= 0) return;
  const now = performance.now();
  if (now - lastPlayTimeMs < MIN_INTERVAL_MS) return;
  lastPlayTimeMs = now;

  const url = FOOTSTEP_WAV_URLS[footstepClipIndex];
  footstepClipIndex = (footstepClipIndex + 1) % FOOTSTEP_WAV_URLS.length;

  const audio = new Audio(url);
  audio.volume = clamp01(volume01);
  void audio.play().catch(() => {});
}
