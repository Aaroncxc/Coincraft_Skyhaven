---
name: skyhaven-economy-loot-inventory
description: Economy layer: loot tables by action/duration, rare cosmetic drops, inventory slots, stamina/exp progression.
metadata:
  version: "0.1"
---

# Economy / Loot / Inventory

## Use this skill when
- Implementing rare loot chances tied to focus duration
- Adding inventory and “gear required” checks
- Implementing EXP + stamina progression and costs
- Balancing reward output per minute

## Data structures (keep JSON-driven)
- Items: { id, name, type, rarity, icon, stackable }
- Gear: { id, slot, modifiers }
- LootTable: per actionType + duration:
  - guaranteed: [{ itemId, amount }]
  - weighted: [{ itemId, weight }]
  - rareRoll: { chance, itemPool }

## Reward resolution algorithm (deterministic optional)
- Seed RNG from session startedAt + playerId (optional)
- Compute:
  - base rewards scaled by duration
  - stamina cost
  - rare roll chance scaled by duration
  - apply gear modifiers (“better loot”, “more coins”, etc.)

## Inventory rules
- Slots shown in UI (top quick slots + full inventory view)
- Count uses per item, stack limits, add/remove semantics

## Workflow
1. Define item + loot schema.
2. Implement reward resolver + tests.
3. Implement inventory store + add/remove operations.
4. Hook UI (inventory slots) + session completion payouts.

## Output conventions
- Provide sample loot table JSON for mining/farming 30/60/120.
- Provide balancing notes (coins/min, rare chance bounds).