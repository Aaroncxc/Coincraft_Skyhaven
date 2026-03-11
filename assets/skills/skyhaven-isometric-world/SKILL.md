---
name: skyhaven-isometric-world
description: Isometric tile world: grid coords <-> screen coords, depth sorting, POIs, hit testing, island definitions.
metadata:
  version: "0.1"
---

# Skyhaven Isometric World

## Use this skill when
- Implementing the isometric island renderer (tile map + POIs)
- Adding new tile types (path, crop states, trees)
- Fixing click/hover selection on diamond tiles
- Implementing depth sorting layers

## Core model
- Grid coordinates: (gx, gy) on a 2D grid
- Screen coordinates:
  - sx = (gx - gy) * (tileW / 2)
  - sy = (gx + gy) * (tileH / 2)
- Each tile has:
  - type (string)
  - layer (ground/path/prop/poi)
  - flags (walkable, interactable, blocks)

## Depth sorting rule (simple + robust)
- sortKey = (gx + gy) * 1000 + layerOrder + localYOffset
- POIs and tall props add a positive y-offset to render “in front” correctly.

## Hit testing (mouse -> tile)
- Convert mouse (sx, sy) to approx grid via inverse transform
- Confirm diamond containment test to avoid edge mispicks
- Support “hover nearest valid tile” fallback when close to border

## Island definitions
- Use JSON islands:
  - tiles: array of { gx, gy, type }
  - poi: array of { id, gx, gy, kind, interactRadius }
  - spawn: { gx, gy }
- Keep configs deterministic and diff-friendly.

## Workflow
1. Confirm tileW/tileH and anchor/pivot conventions in renderer.
2. Implement transforms and a single source of truth for conversions.
3. Implement draw order and layer system.
4. Add selection + debug overlay (optional: show gx,gy on hover).
5. Add POIs: mine, farm with interactable hotspots.

## Output conventions
- Provide a small island JSON example if needed.
- Provide 1–2 sanity tests: coordinate conversion + pick correctness.