---
name: skyhaven-focus-actions-timer
description: Focus actions system: durations (30/60/120), timer overlay, stamina/exp rewards, gear gating, completion payout.
metadata:
  version: "0.1"
---

# Focus Actions + Timer

## Use this skill when
- Implementing “Mining/Farming/Roaming” focus actions
- Adding session durations and completion logic
- Driving the big clock overlay
- Implementing gear gating (with/without gear changes allowed interactions)

## Model
- ActionType: "mining" | "farming" | "roaming"
- Duration presets: 30m, 60m, 120m
- Session state:
  - active: boolean
  - actionType
  - startedAt (timestamp)
  - endsAt (timestamp)
  - progress (0..1)
  - rewards (computed on completion)

## Gear gating rules (as in spec intent)
- If required gear missing:
  - allow roaming-only, block POI interaction
- If gear present:
  - allow starting the focus action on POI

## Offline-friendly completion
- Always compute remaining time via Date.now() vs endsAt
- On app reopen: if now >= endsAt => finalize rewards instantly

## Rewards hook (delegated to economy skill)
- On complete: call reward resolver with:
  - actionType, duration, player stats, gear, island modifiers

## Workflow
1. Implement session state + reducer/store.
2. Add duration selection UI.
3. Hook clock overlay to endsAt.
4. Add completion handler + persistence.
5. Add QA scenarios (pause/resume, reopen, time drift).

## Output conventions
- Provide a “state diagram” in text for session lifecycle.
- Provide 6 test cases (edge cases).