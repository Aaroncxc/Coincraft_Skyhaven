import type { PlayableCharacterId } from "../playableCharacters";

export type AvatarGroundProfile = {
  visualGroundOffsetY: number;
  collisionRadius: number;
  stepHeight: number;
  jumpVelocity: number;
};

const DEFAULT_PLAYER_PROFILE: AvatarGroundProfile = {
  visualGroundOffsetY: 0,
  collisionRadius: 0.18,
  stepHeight: 0.28,
  jumpVelocity: 2.65,
};

const PLAYER_GROUND_PROFILES: Record<PlayableCharacterId, AvatarGroundProfile> = {
  default: DEFAULT_PLAYER_PROFILE,
  mining_man: {
    ...DEFAULT_PLAYER_PROFILE,
    visualGroundOffsetY: 0.18,
  },
  magic_man: {
    ...DEFAULT_PLAYER_PROFILE,
    visualGroundOffsetY: 0.06,
  },
  fight_man: {
    ...DEFAULT_PLAYER_PROFILE,
    visualGroundOffsetY: 0.08,
  },
};

/**
 * POI NPCs share the island with the default avatar (visualGroundOffsetY 0). Playable skins use
 * PLAYER_GROUND_PROFILES for rig pivots when *you* play as mining/fight/magic — NPCs are tuned
 * separately so feet sit on the walk deck next to the default character.
 */
const NPC_GROUND_PROFILES = {
  miningMan: {
    ...DEFAULT_PLAYER_PROFILE,
    visualGroundOffsetY: 0.05,
  },
  magicMan: {
    ...DEFAULT_PLAYER_PROFILE,
    visualGroundOffsetY: 0.06,
  },
  fightMan: {
    ...DEFAULT_PLAYER_PROFILE,
    visualGroundOffsetY: 0.03,
  },
} as const;

export type NpcGroundProfileId = keyof typeof NPC_GROUND_PROFILES;

export function getPlayableAvatarGroundProfile(playableVariant: PlayableCharacterId): AvatarGroundProfile {
  return PLAYER_GROUND_PROFILES[playableVariant] ?? DEFAULT_PLAYER_PROFILE;
}

export function getNpcGroundProfile(profileId: NpcGroundProfileId): AvatarGroundProfile {
  return NPC_GROUND_PROFILES[profileId];
}
