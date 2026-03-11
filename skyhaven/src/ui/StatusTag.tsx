import { SKYHAVEN_SPRITE_MANIFEST } from "../game/assets";

type StatusTagProps = {
  text: string;
};

export function StatusTag({ text }: StatusTagProps) {
  return (
    <div className="status-tag" aria-live="polite">
      <img className="status-bg" src={SKYHAVEN_SPRITE_MANIFEST.ui.statusBg} alt="" />
      <span className="status-text">{text}</span>
    </div>
  );
}
