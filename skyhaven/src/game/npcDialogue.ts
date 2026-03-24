/** Lux — Fighter Trainer (FightMan NPC). Random one line per E interact. */
export const LUX_FIGHT_TRAINER_LINES = [
  "You swing too wide. The sky don't forgive mistakes.",
  "Fighting ain't about winning. It's about not being the one who falls.",
  "Stand your ground… or the sky takes it from you.",
] as const;

export function pickRandomLuxFightLine(): string {
  const i = Math.floor(Math.random() * LUX_FIGHT_TRAINER_LINES.length);
  return LUX_FIGHT_TRAINER_LINES[i];
}
