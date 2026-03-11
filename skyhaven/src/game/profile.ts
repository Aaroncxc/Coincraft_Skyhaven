export type PlayerProfile = {
  name: string;
  createdAt: number;
};

const STORAGE_KEY = "skyhaven.profile.v1";

export function hydrateProfile(): PlayerProfile {
  if (typeof window === "undefined") {
    return { name: "Adventurer", createdAt: Date.now() };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
      if (typeof parsed.name === "string" && typeof parsed.createdAt === "number") {
        return parsed as PlayerProfile;
      }
    }
  } catch {
    /* fall through */
  }
  const fresh: PlayerProfile = { name: "Adventurer", createdAt: Date.now() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

export function persistProfile(profile: PlayerProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
