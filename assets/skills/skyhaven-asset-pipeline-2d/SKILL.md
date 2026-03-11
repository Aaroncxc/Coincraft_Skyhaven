---
name: skyhaven-asset-pipeline-2d
description: 2D asset pipeline: naming conventions, tile atlases, pivots/anchors for isometric tiles, import rules, scaling.
metadata:
  version: "0.1"
---

# Asset Pipeline 2D

## Use this skill when
- Importing tiles like EMPTY_CROP_TILE, PATH tiles, trees, POI tiles
- Building texture atlases and consistent pivots
- Fixing “floating” misalignment of isometric assets
- Ensuring crisp scaling across DPIs

## Naming conventions (match reference)
- TILES:
  - EMPTY_CROP_TILE
  - HALF_GROWN_CROP_TILE
  - FULL_GROWN_CROP_TILE
  - STONE_CROSS_PATH_TILE
  - STONE_STRAIGHT_UP_PATH_TILE
  - DIRT_LANTERN_PATH_TILE
  - OAK_YELLOW_GLOW_TILE
  - OAK_RED_BERRY_TILE
- POI:
  - POI_FARMING
  - POI_MINING

## Pivot/Anchor rules (critical for iso)
- Ground tile pivot: bottom-center of diamond footprint
- Tall props/POIs: pivot at “contact point” on ground
- Always store pivot metadata alongside asset id.

## Atlas rules
- Prefer a single atlas per biome/island type.
- Avoid runtime texture slicing if possible.
- Keep power-of-two textures where feasible.

## Workflow
1. Establish pivot system in renderer.
2. Create atlas + mapping JSON { id -> frame, pivot }.
3. Validate placement on test island.
4. Add dev overlay to show pivots and bounds.

## Output conventions
- Provide an `assets.manifest.json` example if needed.
- Provide 5-step “alignment debugging” checklist.