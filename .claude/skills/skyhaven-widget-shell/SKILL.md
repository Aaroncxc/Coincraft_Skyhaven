---
name: skyhaven-widget-shell
description: Desktop widget shell (Tauri/Electron): window behavior, always-on-top, sizing, input, performance throttling, packaging.
metadata:
  version: "0.1"
---

# Skyhaven Widget Shell

## Use this skill when
- Setting up Tauri/Electron/Neutralino shell for a 2D widget game
- Implementing window chrome, sizing, always-on-top, startup, tray behavior
- Solving focus/keyboard/mouse interaction issues in a frameless window
- Packaging Windows/macOS builds

## Target UX (from references)
- App behaves like a desktop widget: fast launch, small footprint, stable FPS.
- Optional “clock overlay” can sit behind island rendering without blocking input.

## Architecture defaults (unless repo already decided)
- **Tauri + Vite + TypeScript** for shell + webview UI
- Renderer runs in a single canvas (PixiJS or raw Canvas2D)
- Game loop is time-step based (delta time), never a busy loop

## Constraints
- No polling loops for timers; use requestAnimationFrame + timestamps.
- Throttle render updates when window is hidden/minimized.
- Maintain 60fps target; degrade gracefully to 30fps if needed.

## Implementation workflow
1. Identify current shell (Tauri/Electron). Do not rewrite stack.
2. Ensure window config: size, min size, resizable, decorations.
3. Implement always-on-top toggles as a setting (optional).
4. Ensure idle throttling + visibility pause.
5. Add packaging scripts and CI-ready build commands.

## Output conventions
- List modified files + exact run/build commands.
- Include “how to verify” checklist (startup time, FPS, resizing, click-through).
## Tauri specifics
- Use Vite frontend.
- Keep window lightweight:
  - optional: frameless (decorations: false) for widget feel
  - set fixed/min window size suitable for your island view
- Avoid “always-on-top” hardcoding; expose it as a setting/toggle if you add it.
- Persist settings (window position/size) on close and restore on launch.
- Build commands:
  - dev: `npm run tauri dev`
  - build: `npm run tauri build`