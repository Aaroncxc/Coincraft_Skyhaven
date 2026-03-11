---
name: skyhaven-ui-hud-and-menus
description: Rebuild HUD + left menu system: EXP/Stamina bars, focus actions panel, inventory slots, status tag, clock overlay.
metadata:
  version: "0.1"
---

# UI HUD and Menus

## Use this skill when
- Building the left sidebar (Main Menu / Inventory / Focus Actions / Shop / Options)
- Implementing EXP + stamina bars at top
- Adding status tag bottom-left (“MINING…”, “FARMING…”)
- Adding the large clock overlay behind the island

## Layout goals (from reference)
- Left menu: stacked buttons, selected panel highlighted.
- Focus Actions: list items like “Mining”, “Roaming”.
- Top: thin bars for EXP and stamina.
- Center top: optional slot buttons (quick slots).
- Large clock: huge typography, low opacity, behind island.

## Interaction rules
- UI must not block core island hover unless intended:
  - pointer events only on UI panels
  - canvas remains interactive elsewhere
- Focus action selection updates game state + status tag.

## Workflow
1. Implement UI as components (React/vanilla) with minimal state store.
2. Bind UI state to game state (selected action, stamina, exp).
3. Add clock overlay (driven by focus timer skill).
4. Make UI theme tokens consistent.

## Output conventions
- Provide component tree and state store keys.
- Provide “verify” steps with screenshots checklist.