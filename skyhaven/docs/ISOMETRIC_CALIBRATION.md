# Isometric Grid Calibration Guide

## Why Figma Looks Right and the Game Might Not

**Figma** lets you place assets pixel-perfect. You align by eye, and everything snaps to your art. The isometric grid in Figma is visual—you see it and place accordingly.

**The game** uses a mathematical formula:

```
screenX = originX + (gx - gy) × (tileW / 2)
screenY = originY + (gx + gy) × (tileH / 2)
```

If `tileW` and `tileH` don’t match the proportions of your assets, the grid and sprites won’t line up.

---

## Key Parameters

| Parameter | Current | Meaning |
|-----------|---------|---------|
| **tileW** | 176 | Horizontal step (gx or gy) in pixels |
| **tileH** | 88 | Vertical step per grid cell |
| **drawW / drawH** | 196–224 | Pixel size of each tile sprite |
| **anchorY** | 0.65–0.71 | Pivot: 0.71 = 71% from top (ground at bottom) |

**Isometric diamond (one cell):** width = tileW (176px), height = tileH (88px) → 2:1 ratio.

---

## Matching Your Reference (Farming Island Full)

### 1. Measure in Figma

In your Figma design:

- Measure the **base diamond** of one tile (top flat surface).
- Note **width** and **height** of that diamond.
- These should become `tileW` and `tileH`.

Typical rules:

- Width : height ≈ 2 : 1 for standard isometric.
- If your diamond is e.g. 200×100, use `tileW: 200`, `tileH: 100`.

### 2. Match Sprite Size to Grid

Sprite `drawW` and `drawH` should fit the diamond:

- Diamond width = tileW, height = tileH.
- Sprite should cover at least the diamond; extra can overflow for art.
- If sprites are much bigger (e.g. 222px) than the diamond (176px), they’ll overlap and look “squashed” or misaligned.

Options:

- **A)** Export assets at diamond size (e.g. 176×88 or proportional).
- **B)** Keep asset size but scale at runtime so the base fits the diamond.
- **C)** Change `tileW`/`tileH` so they match the pixel size of one tile in your assets.

### 3. Adjust anchorY for Height

- Higher **anchorY** (e.g. 0.8) → sprite sits lower, more “in the ground”.
- Lower **anchorY** (e.g. 0.5) → sprite floats higher.

For the reference, tiles look flush with the ground → aim for anchorY around 0.65–0.75.

---

## Debug Grid Overlay

Use the debug grid to see the computed diamond vs. your sprites.

**Toggle:** Press **G** in the app to show/hide the grid overlay.

The grid draws the diamond per cell; sprites should align with these diamonds. If sprites overflow or sit outside the diamonds, adjust `tileW`/`tileH` or `drawW`/`drawH`/`anchorY`.

---

## Quick Fix Checklist

1. **Grid looks crooked**
   - Ensure `tileW / tileH = 2` (or whatever your Figma grid uses).
   - Check that the game’s formulas match your Figma isometric angle (typically 26.565° for 2:1).

2. **Tiles don’t align**
   - Compare `drawW`/`drawH` with `tileW`/`tileH`.
   - Scale sprites or change `tileW`/`tileH` until the base of each tile matches the diamond.

3. **Tiles float or sink**
   - Change `anchorY` in `assets.ts` (or per-tile overrides).
   - Lower value = higher; higher value = lower.

4. **Straight lines look bent**
   - Usually from mixed cell sizes or wrong `tileW`/`tileH`.
   - Keep all cells the same size and aspect ratio.

---

## Deriving tileW / tileH from Your Art

1. Open your reference in an image editor.
2. Measure one tile’s diamond:
   - Horizontal tip-to-tip = `tileW`
   - Vertical tip-to-tip = `tileH`
3. Set these in `island.farming.json` (or your island JSON):

```json
{
  "tileW": 200,
  "tileH": 100,
  "tiles": [...]
}
```

4. Update `assets.ts` so `drawW` and `drawH` match or are scaled to fit this grid.
