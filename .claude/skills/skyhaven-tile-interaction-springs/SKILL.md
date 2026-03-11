---
name: skyhaven-tile-interaction-springs
description: “Satisfying” tile hover physics: springy micro-bounce, neighbor push, highlight arrows, interaction states.
metadata:
  version: "0.1"
---

# Tile Interaction Springs

## Use this skill when
- Implementing the “hover over tiles” animation described in the spec
- Adding “springy” micro motion that stays elegant (thin lines / slick feel)
- Making tiles subtly push each other without breaking grid alignment
- Adding interaction feedback (glow, arrows, outlines)

## Target behavior (from reference)
- On hover: hovered tile lifts/offsets slightly, returns with a damped spring.
- Neighbor tiles receive a tiny impulse (push-away), also damped.
- Tiles remain anchored to their grid positions (no drift).

## Recommended physics (simple, stable)
For each tile:
- basePos = fixed (from isometric transform)
- offset = (ox, oy), velocity = (vx, vy)
- spring toward targetOffset:
  - targetOffset = hover ? (0, -HOVER_LIFT) : (0, 0)
  - acceleration = k*(targetOffset - offset) - c*velocity
- Update with delta time, clamp to avoid jitter.

Neighbor push:
- On hover enter, add small impulse to neighbors:
  - neighbor.velocity += normalize(neighborBase - hoveredBase) * IMPULSE

## Visual feedback
- Hover outline (soft, not thick)
- Optional arrow markers on POIs / interactable tiles
- Click state: slightly stronger bounce + short highlight pulse

## Workflow
1. Implement per-tile spring integrator.
2. Add hover enter/leave detection (from picking).
3. Add neighbor impulse on hover enter.
4. Tune constants for “slick” feel (critical damping-ish).
5. Add perf guardrails (cap updates, reuse objects).

## Output conventions
- Expose constants in a small params block:
  - stiffness, damping, hoverLift, neighborImpulse
- Provide a 30-second tuning checklist.