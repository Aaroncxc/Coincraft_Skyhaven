import { buildTileLookup, coordKey, gridToScreen, sortKey } from "./iso";
import type { AssetKey, CharacterPose, IslandMap, SpriteManifest, TileDef, TileSpringState, Vec2 } from "./types";

type RenderFrameParams = {
  ctx: CanvasRenderingContext2D;
  map: IslandMap;
  springs: Map<string, TileSpringState>;
  hoveredTileId: string | null;
  width: number;
  height: number;
  origin: Vec2;
  images: Map<string, HTMLImageElement> | null;
  manifest: SpriteManifest;
  zoom: number;
  panX: number;
  panY: number;
  characterPose: CharacterPose | null;
  ghostPreviewCell?: { gx: number; gy: number };
  blockedCell?: { gx: number; gy: number };
  /** Show grid overlay for calibration (Press G to toggle) */
  showDebugGrid?: boolean;
};

type DrawTileParams = {
  ctx: CanvasRenderingContext2D;
  map: IslandMap;
  tile: TileDef;
  spring: TileSpringState | undefined;
  origin: Vec2;
  hovered: boolean;
  images: Map<string, HTMLImageElement> | null;
  manifest: SpriteManifest;
};

type PickFromSpriteParams = {
  map: IslandMap;
  x: number;
  y: number;
  origin: Vec2;
  springs: Map<string, TileSpringState>;
  images: Map<string, HTMLImageElement> | null;
  manifest: SpriteManifest;
};

type TilePalette = {
  top: string;
  stroke: string;
};

type AlphaMask = {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
  edgeMask: HTMLCanvasElement | null;
};

type DrawableImage = HTMLImageElement | HTMLCanvasElement;

const DEBUG_GRID =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugGrid") === "1";

const ALPHA_THRESHOLD = 20;
const OUTLINE_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [-2, 0],
  [2, 0],
  [0, -2],
  [0, 2],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const alphaMaskCache = new Map<string, AlphaMask>();

type ContentBounds = { x: number; y: number; width: number; height: number };
const contentBoundsCache = new Map<string, ContentBounds>();
/** Reference tile for normalizing content size/height (grass). Set once when first available. */
let refContentHeight = 0;
let refImgHeight = 0;

const processedTileImageCache = new Map<string, HTMLCanvasElement>();
const COLORKEYED_TILE_SOURCES = new Set<string>([
  "/ingame_assets/expanded/farming/tile_farm_empty.png",
  "/ingame_assets/expanded/farming/tile_farm_half.png",
  "/ingame_assets/expanded/farming/tile_farm_full.png",
  "/ingame_assets/expanded/farming/tile_farm_path_down.png",
  "/ingame_assets/expanded/farming/tile_farm_path_straight.png",
]);
const COLORKEY_BLACK_MAX = 14;

const FALLBACK_TILE_PALETTES: Record<AssetKey, TilePalette> = {
  base: { top: "rgba(173, 131, 81, 0.65)", stroke: "rgba(241, 212, 152, 0.75)" },
  baseV2: { top: "rgba(173, 131, 81, 0.65)", stroke: "rgba(241, 212, 152, 0.75)" },
  baseV4: { top: "rgba(173, 131, 81, 0.65)", stroke: "rgba(241, 212, 152, 0.75)" },
  baseV7: { top: "rgba(173, 131, 81, 0.65)", stroke: "rgba(241, 212, 152, 0.75)" },
  grass: { top: "rgba(114, 167, 92, 0.65)", stroke: "rgba(215, 241, 194, 0.75)" },
  grassV2: { top: "rgba(114, 167, 92, 0.65)", stroke: "rgba(215, 241, 194, 0.75)" },
  grassV4: { top: "rgba(114, 167, 92, 0.65)", stroke: "rgba(215, 241, 194, 0.75)" },
  pathCross: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathCrossV2: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraight: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraightV4: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraightV5: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraightV6: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraightAlt: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraightAltV4: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  pathStraightAltV5: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  ancientStone: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  ancientStoneWall: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  ancientCornerWall: { top: "rgba(188, 165, 111, 0.65)", stroke: "rgba(244, 228, 179, 0.75)" },
  tree1: { top: "rgba(126, 160, 92, 0.65)", stroke: "rgba(228, 244, 202, 0.75)" },
  tree1V3: { top: "rgba(126, 160, 92, 0.65)", stroke: "rgba(228, 244, 202, 0.75)" },
  tree2: { top: "rgba(126, 160, 92, 0.65)", stroke: "rgba(228, 244, 202, 0.75)" },
  tree2V0: { top: "rgba(126, 160, 92, 0.65)", stroke: "rgba(228, 244, 202, 0.75)" },
  tree2V1: { top: "rgba(126, 160, 92, 0.65)", stroke: "rgba(228, 244, 202, 0.75)" },
  mineTile: { top: "rgba(164, 133, 93, 0.65)", stroke: "rgba(237, 211, 168, 0.75)" },
  mineTileV2: { top: "rgba(164, 133, 93, 0.65)", stroke: "rgba(237, 211, 168, 0.75)" },
  farmEmpty: { top: "rgba(170, 129, 76, 0.65)", stroke: "rgba(237, 205, 150, 0.75)" },
  farmSlot: { top: "rgba(168, 126, 72, 0.65)", stroke: "rgba(235, 199, 141, 0.75)" },
  farmHalf: { top: "rgba(157, 138, 74, 0.65)", stroke: "rgba(232, 218, 157, 0.75)" },
  farmFull: { top: "rgba(140, 158, 72, 0.65)", stroke: "rgba(222, 240, 166, 0.75)" },
  farmPath: { top: "rgba(170, 144, 98, 0.65)", stroke: "rgba(239, 218, 171, 0.75)" },
  farmPathCross: { top: "rgba(186, 162, 112, 0.65)", stroke: "rgba(244, 227, 177, 0.75)" },
  farmPathStraight: { top: "rgba(186, 162, 112, 0.65)", stroke: "rgba(244, 227, 177, 0.75)" },
  farmPathUp: { top: "rgba(178, 156, 107, 0.65)", stroke: "rgba(242, 223, 176, 0.75)" },
  farmPathDown: { top: "rgba(178, 156, 107, 0.65)", stroke: "rgba(242, 223, 176, 0.75)" },
  farmPoi: { top: "rgba(178, 142, 92, 0.65)", stroke: "rgba(240, 207, 158, 0.75)" },
  dirt: { top: "rgba(140, 110, 70, 0.65)", stroke: "rgba(210, 180, 130, 0.75)" },
  treeMiddle: { top: "rgba(126, 160, 92, 0.65)", stroke: "rgba(228, 244, 202, 0.75)" },
  farm2x2: { top: "rgba(140, 158, 72, 0.65)", stroke: "rgba(222, 240, 166, 0.75)" },
  poisFarming: { top: "rgba(150, 140, 80, 0.65)", stroke: "rgba(230, 220, 150, 0.75)" },
  grasBlumen: { top: "rgba(114, 167, 92, 0.65)", stroke: "rgba(215, 241, 194, 0.75)" },
  taverne: { top: "rgba(160, 120, 80, 0.65)", stroke: "rgba(230, 200, 150, 0.75)" },
  floatingForge: { top: "rgba(180, 110, 50, 0.65)", stroke: "rgba(255, 180, 100, 0.75)" },
  farmingChicken: { top: "rgba(190, 160, 80, 0.65)", stroke: "rgba(250, 230, 140, 0.75)" },
  bushTile: { top: "rgba(100, 150, 80, 0.65)", stroke: "rgba(200, 235, 170, 0.75)" },
  statueAaron: { top: "rgba(160, 160, 170, 0.65)", stroke: "rgba(200, 200, 210, 0.75)" },
  magicTower: { top: "rgba(100, 80, 140, 0.65)", stroke: "rgba(180, 160, 220, 0.75)" },
  wellTile: { top: "rgba(140, 150, 160, 0.65)", stroke: "rgba(200, 210, 220, 0.75)" },
  well2Tile: { top: "rgba(140, 150, 160, 0.65)", stroke: "rgba(200, 210, 220, 0.75)" },
  halfGrownCropTile: { top: "rgba(160, 140, 80, 0.65)", stroke: "rgba(220, 200, 130, 0.75)" },
  cottaTile: { top: "rgba(150, 130, 90, 0.65)", stroke: "rgba(210, 190, 140, 0.75)" },
  ancientTempleTile: { top: "rgba(140, 150, 120, 0.65)", stroke: "rgba(200, 215, 180, 0.75)" },
  kaserneTile: { top: "rgba(130, 120, 100, 0.65)", stroke: "rgba(200, 190, 165, 0.75)" },
  runeTile: { top: "rgba(150, 130, 110, 0.65)", stroke: "rgba(220, 180, 140, 0.75)" },
};

const FALLBACK_PALETTE: TilePalette = {
  top: "rgba(120, 160, 96, 0.62)",
  stroke: "rgba(225, 245, 211, 0.74)",
};

function getTileSortKey(tile: TileDef, manifest: SpriteManifest): number {
  const meta = manifest.tile[tile.type];
  const layerOrder = tile.layerOrder ?? meta?.layerOrder ?? 0;
  const localYOffset = tile.localYOffset ?? meta?.localYOffset ?? 0;
  const span = meta?.gridSpan;
  const sortGx = span ? tile.gx + (span.w - 1) / 2 : tile.gx;
  const sortGy = span ? tile.gy + (span.h - 1) / 2 : tile.gy;
  return sortKey(sortGx, sortGy, layerOrder, localYOffset);
}

export function computeSceneOrigin(
  map: IslandMap,
  width: number,
  height: number,
  centerXRatio = 0.52,
  centerYRatio = 0.45
): Vec2 {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const tile of map.tiles) {
    const point = gridToScreen(tile.gx, tile.gy, 0, 0, map.tileW, map.tileH);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const worldCenterX = (minX + maxX) / 2;
  const worldCenterY = (minY + maxY) / 2;

  return {
    x: width * centerXRatio - worldCenterX,
    y: height * centerYRatio - worldCenterY,
  };
}

export function drawIslandFrame({
  ctx,
  map,
  springs,
  hoveredTileId,
  width,
  height,
  origin,
  images,
  manifest,
  zoom,
  panX,
  panY,
  characterPose,
  ghostPreviewCell,
  blockedCell,
  showDebugGrid,
}: RenderFrameParams): void {
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  ctx.save();
  ctx.translate(centerX + panX, centerY + panY);
  ctx.scale(zoom, zoom);
  ctx.translate(-centerX, -centerY);

  const sortedTiles = [...map.tiles].sort(
    (a, b) => getTileSortKey(a, manifest) - getTileSortKey(b, manifest)
  );
  const tileLookup = buildTileLookup(map);
  const mainCharacterSprite = resolveCharacterFrame(characterPose, images, manifest);

  for (const tile of sortedTiles) {
    drawTile({
      ctx,
      map,
      tile,
      spring: springs.get(tile.id),
      origin,
      hovered: tile.id === hoveredTileId,
      images,
      manifest,
    });
  }

  if (showDebugGrid ?? DEBUG_GRID) {
    drawDebugGrid(ctx, map, origin);
  }

  if (ghostPreviewCell) {
    drawPlacementGhost(ctx, map, origin, ghostPreviewCell);
  }

  if (blockedCell) {
    drawBlockedCellMarker(ctx, map, origin, blockedCell);
  }

  for (const poi of map.poi) {
    const poiTile = tileLookup.get(coordKey(poi.gx, poi.gy));
    if (!poiTile || poiTile.id !== hoveredTileId) {
      continue;
    }

    const spring = springs.get(poiTile.id);
    const center = gridToScreen(poi.gx, poi.gy, origin.x, origin.y, map.tileW, map.tileH);
    drawPoiMarker(ctx, center.x + (spring?.ox ?? 0), center.y + (spring?.oy ?? 0), map.tileW, map.tileH);
  }

  if (characterPose && mainCharacterSprite) {
    drawMainCharacter(ctx, map, origin, manifest, mainCharacterSprite, characterPose);
  }

  ctx.restore();
}

export function pickTileFromSpriteAlpha({
  map,
  x,
  y,
  origin,
  springs,
  images,
  manifest,
}: PickFromSpriteParams): TileDef | null {
  if (!images) {
    return null;
  }

  const sortedTiles = [...map.tiles].sort(
    (a, b) => getTileSortKey(b, manifest) - getTileSortKey(a, manifest)
  );

  for (const tile of sortedTiles) {
    const spriteMeta = manifest.tile[tile.type];
    const sourceImage = images.get(spriteMeta.src);
    if (!sourceImage) {
      continue;
    }
    const tileImage = resolveTileImage(spriteMeta.src, sourceImage);

    const span = spriteMeta.gridSpan;
    const centerGx = span ? tile.gx + (span.w - 1) / 2 : tile.gx;
    const centerGy = span ? tile.gy + (span.h - 1) / 2 : tile.gy;
    const base = gridToScreen(centerGx, centerGy, origin.x, origin.y, map.tileW, map.tileH);
    const spring = springs.get(tile.id);
    let centerX = base.x + (spring?.ox ?? 0);
    let centerY = base.y + (spring?.oy ?? 0);
    centerX += tile.offsetX ?? 0;
    centerY += tile.offsetY ?? 0;
    const effective = getEffectiveTileDraw(tile, spriteMeta, tileImage, manifest);
    const drawX = centerX - effective.drawW * effective.anchorX;
    const drawY = centerY - effective.drawH * effective.anchorY;

    if (x < drawX || y < drawY || x > drawX + effective.drawW || y > drawY + effective.drawH) {
      continue;
    }

    const mask = getAlphaMask(spriteMeta.src, tileImage);
    if (!mask) {
      continue;
    }

    const localX = Math.floor(((x - drawX) / effective.drawW) * mask.width);
    const localY = Math.floor(((y - drawY) / effective.drawH) * mask.height);
    if (alphaAt(mask, localX, localY) > ALPHA_THRESHOLD) {
      return tile;
    }
  }

  return null;
}

function drawTile({
  ctx,
  map,
  tile,
  spring,
  origin,
  hovered,
  images,
  manifest,
}: DrawTileParams): void {
  const spriteMeta = manifest.tile[tile.type];
  const span = spriteMeta.gridSpan;
  const centerGx = span ? tile.gx + (span.w - 1) / 2 : tile.gx;
  const centerGy = span ? tile.gy + (span.h - 1) / 2 : tile.gy;

  const base = gridToScreen(centerGx, centerGy, origin.x, origin.y, map.tileW, map.tileH);
  let centerX = base.x + (spring?.ox ?? 0);
  let centerY = base.y + (spring?.oy ?? 0);
  centerX += tile.offsetX ?? 0;
  centerY += tile.offsetY ?? 0;

  const sourceImage = images?.get(spriteMeta.src) ?? null;
  const tileImage = sourceImage ? resolveTileImage(spriteMeta.src, sourceImage) : null;
  const effective = getEffectiveTileDraw(tile, spriteMeta, tileImage, manifest);
  const drawX = centerX - effective.drawW * effective.anchorX;
  const drawY = centerY - effective.drawH * effective.anchorY;

  if (tileImage) {
    ctx.drawImage(tileImage, drawX, drawY, effective.drawW, effective.drawH);
    if (hovered) {
      drawSpriteOutline(ctx, tileImage, spriteMeta.src, drawX, drawY, effective.drawW, effective.drawH);
    }
  } else {
    drawFallbackTile(ctx, map, tile.type, centerX, centerY);
    if (hovered) {
      drawFallbackHover(ctx, map, centerX, centerY);
    }
  }
}

function resolveCharacterFrame(
  characterPose: CharacterPose | null,
  images: Map<string, HTMLImageElement> | null,
  manifest: SpriteManifest
): HTMLImageElement | null {
  if (!characterPose || !images) {
    return null;
  }

  const character = manifest.characters.main;
  const frames = characterPose.direction === "left" ? character.walkLeft : character.walkRight;
  if (!frames.length) {
    return null;
  }

  const frame = frames[characterPose.frameIndex % frames.length];
  return images.get(frame) ?? null;
}

function drawMainCharacter(
  ctx: CanvasRenderingContext2D,
  map: IslandMap,
  origin: Vec2,
  manifest: SpriteManifest,
  frame: HTMLImageElement,
  characterPose: CharacterPose
): void {
  const sprite = manifest.characters.main;
  const center = gridToScreen(characterPose.gx, characterPose.gy, origin.x, origin.y, map.tileW, map.tileH);
  const drawX = center.x - sprite.drawW * sprite.anchorX;
  const drawY = center.y - sprite.drawH * sprite.anchorY;
  ctx.drawImage(frame, drawX, drawY, sprite.drawW, sprite.drawH);
}

function drawFallbackTile(
  ctx: CanvasRenderingContext2D,
  map: IslandMap,
  tileType: AssetKey,
  centerX: number,
  centerY: number
): void {
  const palette = FALLBACK_TILE_PALETTES[tileType] ?? FALLBACK_PALETTE;
  const halfW = map.tileW / 2;
  const halfH = map.tileH / 2;

  ctx.fillStyle = palette.top;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - halfH);
  ctx.lineTo(centerX + halfW, centerY);
  ctx.lineTo(centerX, centerY + halfH);
  ctx.lineTo(centerX - halfW, centerY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  map: IslandMap,
  origin: Vec2,
  ghostCell: { gx: number; gy: number }
): void {
  const base = gridToScreen(ghostCell.gx, ghostCell.gy, origin.x, origin.y, map.tileW, map.tileH);
  const halfW = map.tileW / 2;
  const halfH = map.tileH / 2;

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "rgba(120, 220, 100, 0.95)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y - halfH);
  ctx.lineTo(base.x + halfW, base.y);
  ctx.lineTo(base.x, base.y + halfH);
  ctx.lineTo(base.x - halfW, base.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawBlockedCellMarker(
  ctx: CanvasRenderingContext2D,
  map: IslandMap,
  origin: Vec2,
  blockedCell: { gx: number; gy: number }
): void {
  const base = gridToScreen(blockedCell.gx, blockedCell.gy, origin.x, origin.y, map.tileW, map.tileH);
  const halfW = map.tileW / 2;
  const halfH = map.tileH / 2;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = "rgba(206, 68, 55, 0.78)";
  ctx.beginPath();
  ctx.moveTo(base.x, base.y - halfH);
  ctx.lineTo(base.x + halfW, base.y);
  ctx.lineTo(base.x, base.y + halfH);
  ctx.lineTo(base.x - halfW, base.y);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255, 221, 194, 0.96)";
  ctx.lineWidth = 2.4;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y - halfH);
  ctx.lineTo(base.x + halfW, base.y);
  ctx.lineTo(base.x, base.y + halfH);
  ctx.lineTo(base.x - halfW, base.y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawFallbackHover(ctx: CanvasRenderingContext2D, map: IslandMap, centerX: number, centerY: number): void {
  const halfW = map.tileW / 2;
  const halfH = map.tileH / 2;

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "rgba(255, 244, 202, 1)";
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - halfH);
  ctx.lineTo(centerX + halfW, centerY);
  ctx.lineTo(centerX, centerY + halfH);
  ctx.lineTo(centerX - halfW, centerY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 248, 214, 0.98)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - halfH);
  ctx.lineTo(centerX + halfW, centerY);
  ctx.lineTo(centerX, centerY + halfH);
  ctx.lineTo(centerX - halfW, centerY);
  ctx.closePath();
  ctx.stroke();
}

function drawSpriteOutline(
  ctx: CanvasRenderingContext2D,
  image: DrawableImage,
  sourceKey: string,
  drawX: number,
  drawY: number,
  drawW: number,
  drawH: number
): void {
  const edgeMask = getEdgeMask(sourceKey, image);
  if (!edgeMask) {
    return;
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.92;
  for (const [offsetX, offsetY] of OUTLINE_OFFSETS) {
    ctx.drawImage(edgeMask, drawX + offsetX, drawY + offsetY, drawW, drawH);
  }
  ctx.restore();
}

function getEdgeMask(sourceKey: string, image: DrawableImage): HTMLCanvasElement | null {
  const mask = getAlphaMask(sourceKey, image);
  if (!mask) {
    return null;
  }

  if (mask.edgeMask) {
    return mask.edgeMask;
  }

  const canvas = createScratchCanvas(mask.width, mask.height);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const edgeImage = context.createImageData(mask.width, mask.height);
  const target = edgeImage.data;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const index = y * mask.width + x;
      if (mask.alpha[index] <= ALPHA_THRESHOLD || !hasTransparentNeighbor(mask.alpha, mask.width, mask.height, x, y)) {
        continue;
      }

      const pixel = index * 4;
      target[pixel] = 255;
      target[pixel + 1] = 244;
      target[pixel + 2] = 188;
      target[pixel + 3] = 255;
    }
  }

  context.putImageData(edgeImage, 0, 0);
  mask.edgeMask = canvas;
  return canvas;
}

function getAlphaMask(sourceKey: string, image: DrawableImage): AlphaMask | null {
  const cached = alphaMaskCache.get(sourceKey);
  if (cached) {
    return cached;
  }

  const width = imageWidth(image);
  const height = imageHeight(image);
  if (!width || !height) {
    return null;
  }

  const canvas = createScratchCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const rgba = context.getImageData(0, 0, width, height).data;
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    alpha[p] = rgba[i + 3];
  }

  const mask: AlphaMask = {
    width,
    height,
    alpha,
    edgeMask: null,
  };
  alphaMaskCache.set(sourceKey, mask);

  const bounds = getContentBoundsFromMask(mask);
  if (bounds) {
    contentBoundsCache.set(sourceKey, bounds);
  }
  return mask;
}

function getContentBoundsFromMask(mask: AlphaMask): ContentBounds | null {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (mask.alpha[y * mask.width + x] > ALPHA_THRESHOLD) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX > maxX || minY > maxY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/** Returns content bounds for a tile image (non-transparent pixels). Caches by src. */
function getContentBounds(sourceKey: string, image: DrawableImage): ContentBounds | null {
  const cached = contentBoundsCache.get(sourceKey);
  if (cached) return cached;
  const mask = getAlphaMask(sourceKey, image);
  if (!mask) return null;
  const bounds = getContentBoundsFromMask(mask);
  if (bounds) contentBoundsCache.set(sourceKey, bounds);
  return bounds;
}

type EffectiveDraw = { drawW: number; drawH: number; anchorX: number; anchorY: number };

function getEffectiveTileDraw(
  tile: TileDef,
  spriteMeta: { src: string; drawW: number; drawH: number; anchorX: number; anchorY: number },
  tileImage: DrawableImage | null,
  manifest: SpriteManifest
): EffectiveDraw {
  let drawW = spriteMeta.drawW;
  let drawH = spriteMeta.drawH;
  let anchorX = spriteMeta.anchorX;
  let anchorY = tile.anchorY ?? spriteMeta.anchorY;
  if (tileImage) {
    const imgW = imageWidth(tileImage);
    const imgH = imageHeight(tileImage);
    const bounds = getContentBounds(spriteMeta.src, tileImage);
    const refSrc = manifest.tile.grass?.src;
    if (bounds && refSrc && imgW > 0 && imgH > 0) {
      const tileRatio = bounds.height / imgH;
      if (refContentHeight <= 0 && spriteMeta.src === refSrc && bounds.height > 0) {
        refContentHeight = bounds.height;
        refImgHeight = imgH;
      }

      if (refContentHeight > 0 && refImgHeight > 0 && bounds.height > 0) {
        const refRatio = refContentHeight / refImgHeight;
        const scale = refRatio / tileRatio;
        if (Number.isFinite(scale) && scale > 0) {
          drawW = imgW * scale;
          drawH = imgH * scale;
          const nextAnchorY = (bounds.y + bounds.height) / imgH;
          if (Number.isFinite(nextAnchorY)) {
            anchorY = nextAnchorY;
          }
        }
      }
    }
  }
  return {
    drawW,
    drawH,
    anchorX,
    anchorY,
  };
}

function resolveTileImage(sourceKey: string, image: HTMLImageElement): DrawableImage {
  if (!COLORKEYED_TILE_SOURCES.has(sourceKey)) {
    return image;
  }

  const cached = processedTileImageCache.get(sourceKey);
  if (cached) {
    return cached;
  }

  const width = imageWidth(image);
  const height = imageHeight(image);
  if (!width || !height) {
    return image;
  }

  const canvas = createScratchCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return image;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha <= 0) {
      continue;
    }
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    if (red <= COLORKEY_BLACK_MAX && green <= COLORKEY_BLACK_MAX && blue <= COLORKEY_BLACK_MAX) {
      data[i + 3] = 0;
    }
  }

  context.putImageData(imageData, 0, 0);
  processedTileImageCache.set(sourceKey, canvas);
  return canvas;
}

function hasTransparentNeighbor(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): boolean {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const nx = x + offsetX;
      const ny = y + offsetY;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        return true;
      }

      const neighbor = ny * width + nx;
      if (alpha[neighbor] <= ALPHA_THRESHOLD) {
        return true;
      }
    }
  }

  return false;
}

function createScratchCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function imageWidth(image: DrawableImage): number {
  if (image instanceof HTMLImageElement) {
    return image.naturalWidth || image.width;
  }
  return image.width;
}

function imageHeight(image: DrawableImage): number {
  if (image instanceof HTMLImageElement) {
    return image.naturalHeight || image.height;
  }
  return image.height;
}

function alphaAt(mask: AlphaMask, x: number, y: number): number {
  const safeX = Math.max(0, Math.min(mask.width - 1, x));
  const safeY = Math.max(0, Math.min(mask.height - 1, y));
  return mask.alpha[safeY * mask.width + safeX];
}

function drawPoiMarker(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  tileW: number,
  tileH: number
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(140, 245, 108, 0.96)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY - tileH * 0.22, tileW * 0.23, tileH * 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(14, 17, 11, 0.92)";
  ctx.font = "700 14px Impact, 'Arial Narrow Bold', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MINE", centerX, centerY - tileH * 0.6);
  ctx.restore();
}

function drawDebugGrid(ctx: CanvasRenderingContext2D, map: IslandMap, origin: Vec2): void {
  ctx.save();
  ctx.strokeStyle = "rgba(58, 204, 255, 0.38)";
  ctx.lineWidth = 1;

  for (const tile of map.tiles) {
    const center = gridToScreen(tile.gx, tile.gy, origin.x, origin.y, map.tileW, map.tileH);
    const halfW = map.tileW / 2;
    const halfH = map.tileH / 2;

    ctx.beginPath();
    ctx.moveTo(center.x, center.y - halfH);
    ctx.lineTo(center.x + halfW, center.y);
    ctx.lineTo(center.x, center.y + halfH);
    ctx.lineTo(center.x - halfW, center.y);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 88, 88, 0.92)";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
