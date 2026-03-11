---
name: skyhaven-character-autonomy
description: Autonomous character: roaming, POI approach, state machine, simple pathfinding on isometric grid, animation hooks.
metadata:
  version: "0.1"
---

# Character Autonomy

## Use this skill when
- Implementing the little character that walks around the island autonomously
- Tying focus actions to behavior (walk to POI, idle, “work” loop)
- Adding pathfinding / avoidance / walkable tiles

## Behavior states
- Idle (short pauses)
- Roam (pick random reachable tile, walk)
- GoToPOI(poiId)
- Working(actionType) (loop anim near POI)
- Returning / Cooldown (optional)

## Movement
- Use grid-based A* on walkable tiles OR simple greedy if island small.
- Convert path grid coords to screen positions and tween step-by-step.
- Keep movement time-based (speed * dt), not frame-based.

## Integration with Focus Actions
- When session starts:
  - state => GoToPOI (mine/farm) or Roam
- When reaches target:
  - state => Working
- On session end:
  - state => Roam/Idle

## Workflow
1. Implement state machine (pure logic) + renderer binding.
2. Implement walkable map from tile definitions.
3. Implement pathfinding (A* minimal).
4. Add arrival radius to POIs.
5. Add animation hooks (idle/walk/work).

## Output conventions
- Provide a small state transition table.
- Provide debug toggles (show path, show state).