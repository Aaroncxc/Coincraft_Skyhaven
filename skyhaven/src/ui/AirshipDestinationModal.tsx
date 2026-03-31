import type { IslandId } from "../game/types";

type AirshipDestinationModalProps = {
  open: boolean;
  onSelect: (islandId: Extract<IslandId, "mining" | "farming">) => void;
  onCancel: () => void;
};

export function AirshipDestinationModal({ open, onSelect, onCancel }: AirshipDestinationModalProps) {
  if (!open) return null;

  return (
    <div className="poi-action-overlay" data-no-window-drag="true" onClick={onCancel}>
      <div className="poi-action-card" onClick={(event) => event.stopPropagation()}>
        <div className="poi-action-kicker">Airship</div>
        <h3 className="poi-action-title">Choose destination</h3>
        <p className="poi-action-copy">Travel to another island. You stay in third-person view until arrival.</p>

        <div className="poi-action-duration-row">
          <button type="button" className="poi-action-duration-pill" onClick={() => onSelect("mining")}>
            Mining
          </button>
          <button type="button" className="poi-action-duration-pill" onClick={() => onSelect("farming")}>
            Farming
          </button>
        </div>

        <button type="button" className="poi-action-close-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
