import { isTauri } from "@tauri-apps/api/core";

/**
 * True when the app runs inside the Tauri webview (desktop widget).
 * False in a normal browser tab (e.g. `vite` without `tauri dev`).
 */
export function isSkyhavenWidgetRuntime(): boolean {
  if (typeof window === "undefined") return false;
  if (isTauri()) return true;
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
  return w.__TAURI_INTERNALS__ !== undefined || w.__TAURI__ !== undefined;
}
