const STORAGE_KEY = "skyhaven.axeGlow.v1";

export const DEFAULT_AXE_GLOW_ENABLED = true;

export function loadAxeGlowEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_AXE_GLOW_ENABLED;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_AXE_GLOW_ENABLED;
    return raw === "1";
  } catch {
    return DEFAULT_AXE_GLOW_ENABLED;
  }
}

export function saveAxeGlowEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
