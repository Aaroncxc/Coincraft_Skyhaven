import { SKYHAVEN_SPRITE_MANIFEST } from "../game/assets";

type WindowChromeProps = {
  onToggleCompact: () => void;
  onToggleMinimal: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
  onMenu: () => void;
  menuActive?: boolean;
  isBusy?: boolean;
  minimalMode?: boolean;
  showMinimalToggle?: boolean;
  isFullscreen?: boolean;
  showFullscreenToggle?: boolean;
};

export function WindowChrome({
  onToggleCompact,
  onToggleMinimal,
  onToggleFullscreen,
  onClose,
  onMenu,
  menuActive = false,
  isBusy = false,
  minimalMode = false,
  showMinimalToggle = false,
  isFullscreen = false,
  showFullscreenToggle = false,
}: WindowChromeProps) {
  const { chrome } = SKYHAVEN_SPRITE_MANIFEST.ui;

  return (
    <>
      <div className="window-controls-left">
        <button
          type="button"
          className="chrome-btn is-close"
          aria-label="Close"
          onClick={onClose}
          data-no-window-drag="true"
        >
          <img src={chrome.closeCircle} alt="" className="chrome-base" />
          <img src={chrome.closeLine1} alt="" className="chrome-overlay line-a" />
          <img src={chrome.closeLine2} alt="" className="chrome-overlay line-b" />
        </button>

        <button
          type="button"
          className="chrome-btn is-expand"
          aria-label="Toggle compact mode"
          onClick={onToggleCompact}
          data-no-window-drag="true"
          disabled={isBusy}
        >
          <img src={chrome.expandCircle} alt="" className="chrome-base" />
          <img src={chrome.expandArrow} alt="" className="chrome-overlay arrow" />
        </button>

        {showFullscreenToggle && (
          <button
            type="button"
            className={`chrome-btn is-fullscreen-toggle ${isFullscreen ? "is-active" : ""}`}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={onToggleFullscreen}
            data-no-window-drag="true"
            disabled={isBusy}
          >
            <img src={chrome.expandCircle} alt="" className="chrome-base" />
            <span className="fullscreen-icon chrome-overlay">{isFullscreen ? "\u25a3" : "\u2922"}</span>
          </button>
        )}

        {showMinimalToggle ? (
          <button
            type="button"
            className={`chrome-btn is-minimal-toggle ${minimalMode ? "is-active" : ""}`}
            aria-label={minimalMode ? "Exit minimal mode" : "Enter minimal mode"}
            onClick={onToggleMinimal}
            data-no-window-drag="true"
            disabled={isBusy}
          >
            <span className="minimal-ring" />
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className={`chrome-btn is-menu-toggle window-controls-right ${menuActive ? "is-active" : ""}`}
        aria-label="Menu"
        data-no-window-drag="true"
        onClick={onMenu}
        disabled={isBusy}
      >
        <img src={chrome.expandCircle} alt="" className="chrome-base" />
        <span className="menu-icon chrome-overlay">≡</span>
      </button>
    </>
  );
}
