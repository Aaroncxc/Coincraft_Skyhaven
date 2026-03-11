import type { SpriteManifest } from "./types";

export async function loadSpriteImages(manifest: SpriteManifest): Promise<Map<string, HTMLImageElement>> {
  const sources = new Set<string>();
  for (const meta of Object.values(manifest.tile)) {
    sources.add(meta.src);
  }
  sources.add(manifest.poi.mine.src);
  sources.add(manifest.island.complete.src);
  for (const frame of manifest.characters.main.walkLeft) {
    sources.add(frame);
  }
  for (const frame of manifest.characters.main.walkRight) {
    sources.add(frame);
  }
  if (manifest.scene.debugGridSrc) {
    sources.add(manifest.scene.debugGridSrc);
  }

  const imageMap = new Map<string, HTMLImageElement>();
  const jobs = Array.from(sources).map(async (src) => {
    const image = await loadImage(src);
    if (image) {
      imageMap.set(src, image);
    }
  });
  await Promise.all(jobs);
  return imageMap;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      console.warn(`Skyhaven asset load failed: ${src}`);
      resolve(null);
    };
    image.src = src;
  });
}
