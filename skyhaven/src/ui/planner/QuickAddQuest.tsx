import { useRef, useState } from "react";
import type { ActionType } from "../../game/types";

type QuickAddQuestProps = {
  date: string;
  onAdd: (data: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    focusAction?: ActionType;
  }) => void;
};

const ACTIONS: ActionType[] = ["mining", "farming", "magic", "fight"];

export function QuickAddQuest({ date, onAdd }: QuickAddQuestProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [focusAction, setFocusAction] = useState<ActionType | "">("");
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd({
      title: trimmed,
      date,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      focusAction: (focusAction as ActionType) || undefined,
    });
    setTitle("");
    setStartTime("");
    setEndTime("");
    setFocusAction("");
    setExpanded(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      setExpanded(false);
    }
  };

  return (
    <div className={`quick-add ${expanded ? "is-expanded" : ""}`}>
      <div className="quick-add-row">
        <input
          ref={inputRef}
          className="quick-add-input"
          type="text"
          placeholder="+ Add quest..."
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value && !expanded) setExpanded(true);
          }}
          onFocus={() => title && setExpanded(true)}
          onKeyDown={handleKeyDown}
        />
        {title.trim() && (
          <button type="button" className="quick-add-submit" onClick={handleSubmit}>
            Add
          </button>
        )}
      </div>

      {expanded && (
        <div className="quick-add-details">
          <div className="quick-add-time-row">
            <input
              className="quick-add-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="Start"
            />
            <span className="quick-add-time-sep">—</span>
            <input
              className="quick-add-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="End"
            />
          </div>
          <div className="quick-add-focus-row">
            {ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className={`quick-add-focus-pill ${focusAction === a ? "is-selected" : ""}`}
                onClick={() => setFocusAction(focusAction === a ? "" : a)}
              >
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
