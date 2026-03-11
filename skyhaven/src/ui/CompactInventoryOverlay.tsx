import { SKYHAVEN_SPRITE_MANIFEST } from "../game/assets";

type CompactInventoryOverlayProps = {
  open: boolean;
};

const SLOT_COUNT = 8;
const SLOT_COORDINATES = [
  { x: 589, y: 1585 },
  { x: 1384, y: 1585 },
  { x: 2178, y: 1585 },
  { x: 2974, y: 1585 },
  { x: 588, y: 2416 },
  { x: 1383, y: 2416 },
  { x: 2179, y: 2416 },
  { x: 2973, y: 2416 },
] as const;

export function CompactInventoryOverlay({ open }: CompactInventoryOverlayProps) {
  const ui = SKYHAVEN_SPRITE_MANIFEST.ui;
  if (!ui.compactInventoryPanel || !ui.compactInventoryHeader || !ui.compactInventoryTab || !ui.compactInventorySlot) {
    return null;
  }

  return (
    <section
      className={`compact-inventory-overlay ${open ? "is-open" : ""}`}
      aria-hidden={!open}
      data-no-window-drag="true"
    >
      <img className="compact-inventory-panel" src={ui.compactInventoryPanel} alt="" />
      <img className="compact-inventory-header" src={ui.compactInventoryHeader} alt="" />
      <img className="compact-inventory-tab" src={ui.compactInventoryTab} alt="" />
      <img className="compact-inventory-title" src={ui.labels.inventory} alt="Inventory" />

      <div className="compact-inventory-grid">
        {Array.from({ length: SLOT_COUNT }).map((_, index) => (
          <img
            key={`compact-slot-${index + 1}`}
            className="compact-inventory-slot"
            src={ui.compactInventorySlot}
            alt=""
            style={{
              left: `${(SLOT_COORDINATES[index].x / 4058) * 100}%`,
              top: `${(SLOT_COORDINATES[index].y / 4054) * 100}%`,
            }}
          />
        ))}
      </div>
    </section>
  );
}
