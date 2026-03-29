import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { TORCH_ITEM_ID, type EquippableItemId } from "../equipment";
import type { PlayableCharacterId } from "../playableCharacters";

const TORCH_BURN_LOOP_URL = "/ingame_assets/3d/Waffen/" + encodeURIComponent("torch burn loop.wav");
const TORCH_TPS_GAIN = 0.12;
const TORCH_ISO_GAIN = 0.055;
const TORCH_FADE_IN_SEC = 0.26;
const TORCH_FADE_OUT_SEC = 0.18;
const TORCH_PAUSE_EPSILON = 0.0015;

type Props = {
  equippedOffHand: EquippableItemId | null;
  playableVariant: PlayableCharacterId;
  torchLit: boolean;
  tpsActive: boolean;
  sfxVolume: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function disposeAudio(el: HTMLAudioElement | null): void {
  if (!el) return;
  el.pause();
  el.onended = null;
  el.src = "";
  el.load();
}

function moveGainTowards(current: number, target: number, deltaSec: number, fadeSec: number): number {
  if (Math.abs(target - current) <= 1e-4) return target;
  const reference = target > current ? Math.max(target, 1e-4) : Math.max(current, 1e-4);
  const step = (reference * deltaSec) / Math.max(fadeSec, 1e-4);
  if (target > current) {
    return Math.min(target, current + step);
  }
  return Math.max(target, current - step);
}

export function TorchBurnLoopSfx({ equippedOffHand, playableVariant, torchLit, tpsActive, sfxVolume }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainRef = useRef(0);
  const propsRef = useRef({
    equippedOffHand,
    playableVariant,
    torchLit,
    tpsActive,
    sfxVolume,
  });
  propsRef.current = { equippedOffHand, playableVariant, torchLit, tpsActive, sfxVolume };

  useEffect(() => {
    const audio = new Audio(TORCH_BURN_LOOP_URL);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audioRef.current = audio;
    return () => {
      disposeAudio(audioRef.current);
      audioRef.current = null;
      gainRef.current = 0;
    };
  }, []);

  useFrame((_, delta) => {
    const audio = audioRef.current;
    if (!audio) return;

    const {
      equippedOffHand: offHand,
      playableVariant: variant,
      torchLit: lit,
      tpsActive: tps,
      sfxVolume: sfx,
    } = propsRef.current;
    const torchEquipped = variant === "fight_man" && offHand === TORCH_ITEM_ID && lit;
    const volume01 = clamp01(Math.max(0, Math.min(100, sfx)) / 100);
    const targetGain = torchEquipped ? volume01 * (tps ? TORCH_TPS_GAIN : TORCH_ISO_GAIN) : 0;
    const fadeSec = targetGain > gainRef.current ? TORCH_FADE_IN_SEC : TORCH_FADE_OUT_SEC;
    const nextGain = moveGainTowards(gainRef.current, targetGain, Math.min(delta, 0.1), fadeSec);

    gainRef.current = nextGain;
    audio.volume = clamp01(nextGain);

    if (targetGain > TORCH_PAUSE_EPSILON) {
      if (audio.paused) void audio.play().catch(() => {});
      return;
    }

    if (nextGain <= TORCH_PAUSE_EPSILON && !audio.paused) {
      audio.pause();
    }
  });

  return null;
}
