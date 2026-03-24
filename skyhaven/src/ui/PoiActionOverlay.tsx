import { POI_ACTION_DURATION_OPTIONS, type PoiActionRequest } from "../game/poiActions";
import type { FocusDuration } from "../game/types";

type PoiActionOverlayProps = {
  open: boolean;
  request: PoiActionRequest | null;
  onClose: () => void;
  onStart: (duration: FocusDuration) => void;
};

export function PoiActionOverlay({ open, request, onClose, onStart }: PoiActionOverlayProps) {
  if (!open || !request) return null;

  return (
    <div className="poi-action-overlay" data-no-window-drag="true" onClick={onClose}>
      <div className="poi-action-card" onClick={(event) => event.stopPropagation()}>
        <div className="poi-action-kicker">POI Action</div>
        <h3 className="poi-action-title">{request.label}</h3>
        <p className="poi-action-copy">
          Wähle, wie lange dein Charakter an diesem POI aktiv sein soll.
        </p>

        <div className="poi-action-duration-row">
          {POI_ACTION_DURATION_OPTIONS.map((duration) => (
            <button
              key={duration}
              type="button"
              className="poi-action-duration-pill"
              onClick={() => onStart(duration)}
            >
              {duration}m
            </button>
          ))}
        </div>

        <button type="button" className="poi-action-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
