const POPS_MENU_WAV_URL = "/ingame_assets/3d/" + encodeURIComponent("Pops Menu.wav");
const DECORATION_PLACE_WAV_URL =
  "/ingame_assets/3d/" + encodeURIComponent("FOODTware_Teacup Place Down On Small_GENHD1-09327.wav");

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function playOneShot(url: string, volume01: number): void {
  if (volume01 <= 0) return;
  const audio = new Audio(url);
  audio.volume = clamp01(volume01);
  void audio.play().catch(() => {});
}

/** Successful toolbox placement of a non-decoration tile. */
export function playToolboxTilePlaceSfx(volume01: number): void {
  playOneShot(POPS_MENU_WAV_URL, volume01);
}

/** Successful toolbox placement of a decoration on an existing or auto-created base tile. */
export function playToolboxDecorationPlaceSfx(volume01: number): void {
  playOneShot(DECORATION_PLACE_WAV_URL, volume01);
}
