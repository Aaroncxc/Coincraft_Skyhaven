---
name: skyhaven-master
description: Orchestrates all Skyhaven skills to build the Tauri-based 2D desktop widget game end-to-end (shell, iso world, UI, focus actions, economy, autonomy, asset pipeline).
metadata:
  version: "0.1"
---

# Skyhaven Master (Tauri)

## Use this skill when
- Bootstrapping the repo into a working vertical slice
- Coordinating multiple features across shell + rendering + UI + gameplay
- Keeping scope tight: “vertical slice first, polish second”

## Project goal (from reference images)
A small Tauri desktop widget showing an isometric floating island with:
- Top HUD: EXP + Stamina bars
- Left menu: Main Menu / Inventory / Focus Actions / Shop / Options
- Big clock overlay (behind island)
- Status tag bottom-left (“MINING…”, “FARMING…”)
- Tile hover “spring” micro-bounce + tiny neighbor impulse
- POIs: Mine + Farm tiles
- Focus actions: Mining / Farming / Roaming with 30/60/120 minute sessions

## Skill routing (default)
- Shell & packaging: skyhaven-widget-shell
- Iso world + picking: skyhaven-isometric-world
- Hover bounce: skyhaven-tile-interaction-springs
- HUD/menus: skyhaven-ui-hud-and-menus
- Focus sessions: skyhaven-focus-actions-timer
- Autonomy: skyhaven-character-autonomy
- Economy/loot: skyhaven-economy-loot-inventory
- Assets: skyhaven-asset-pipeline-2d

## Execution rules
- Build a runnable vertical slice ASAP (even with placeholder art).
- Keep diffs small; avoid refactors unless necessary.
- No heavy dependencies unless justified (Pixi ok; avoid big UI libs early).
- Persist focus session state so app can be closed and reopened.

## Deliverable definition for “vertical slice complete”
- `npm run dev` starts the UI inside Tauri dev window
- Island renders, tiles can be hovered (spring)
- Left menu can select Focus Action
- Selecting an action starts a session with a visible big clock countdown
- Status tag updates (MINING…/FARMING…/ROAMING…)
- Minimal EXP/Stamina bars update with mock values

## Output conventions
- Always provide: modified files list + run commands + verification checklist.