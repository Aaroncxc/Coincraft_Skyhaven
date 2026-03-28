const STORAGE_KEY = "skyhaven.graphics.v1";

export type GraphicsSettings = {
  shadowsEnabled: boolean;
  postProcessingEnabled: boolean;
  cloudsEnabled: boolean;
};

export const DEFAULT_GRAPHICS_SETTINGS: GraphicsSettings = {
  shadowsEnabled: true,
  postProcessingEnabled: true,
  cloudsEnabled: true,
};

function clampSettings(partial: Partial<GraphicsSettings>): GraphicsSettings {
  return {
    shadowsEnabled:
      typeof partial.shadowsEnabled === "boolean" ? partial.shadowsEnabled : DEFAULT_GRAPHICS_SETTINGS.shadowsEnabled,
    postProcessingEnabled:
      typeof partial.postProcessingEnabled === "boolean"
        ? partial.postProcessingEnabled
        : DEFAULT_GRAPHICS_SETTINGS.postProcessingEnabled,
    cloudsEnabled:
      typeof partial.cloudsEnabled === "boolean" ? partial.cloudsEnabled : DEFAULT_GRAPHICS_SETTINGS.cloudsEnabled,
  };
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_GRAPHICS_SETTINGS };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPHICS_SETTINGS };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_GRAPHICS_SETTINGS };
    return clampSettings(parsed as Partial<GraphicsSettings>);
  } catch {
    return { ...DEFAULT_GRAPHICS_SETTINGS };
  }
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clampSettings(settings)));
  } catch {
    /* ignore quota / private mode */
  }
}
