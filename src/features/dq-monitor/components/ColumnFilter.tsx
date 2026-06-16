import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function pruneFilter(
  current: Set<string> | null,
  valid: string[]
): Set<string> | null {
  if (current === null) return current;
  const cleaned = new Set<string>();
  current.forEach((v) => {
    if (valid.includes(v)) cleaned.add(v);
  });
  if (cleaned.size === 0) return null;
  if (cleaned.size === current.size) return current;
  return cleaned;
}

export function useColumnFilter(
  allValues: string[]
): [Set<string> | null, React.Dispatch<React.SetStateAction<Set<string> | null>>] {
  const [filter, setFilter] = useState<Set<string> | null>(null);
  useEffect(() => {
    setFilter((current) => pruneFilter(current, allValues));
  }, [allValues]);
  return [filter, setFilter];
}

type ColumnFilterHeaderProps = {
  label: string;
  allValues: string[];
  filter: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
};

export default function ColumnFilterHeader({
  label,
  allValues,
  filter,
  onChange,
  isOpen,
  onToggle,
}: ColumnFilterHeaderProps) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    // Pin the portaled popover under the trigger button using its
    // screen-space rect, so it escapes any overflow:auto ancestors
    // (e.g. the assets grid scroll container) and overlays the
    // Exceptions grid when its content runs long.
    const place = () => {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 2, left: r.left });
    };
    place();
    const onMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        onToggle(false);
      }
    };
    const onScrollOrResize = () => onToggle(false);
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onScrollOrResize);
    // Capture phase so scrolls inside nested containers (table grids)
    // are caught and we close the popover rather than leaving it stranded.
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [isOpen, onToggle]);

  const open = () => {
    setDraft(new Set(filter ?? allValues));
    setSearch("");
    onToggle(true);
  };

  const visible = useMemo(() => {
    if (!search) return allValues;
    const needle = search.toLowerCase();
    return allValues.filter((v) => v.toLowerCase().includes(needle));
  }, [allValues, search]);

  const allChecked = visible.length > 0 && visible.every((v) => draft.has(v));

  const toggleAll = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        for (const v of visible) next.delete(v);
      } else {
        for (const v of visible) next.add(v);
      }
      return next;
    });
  };

  const toggleOne = (v: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  const apply = () => {
    if (draft.size === 0 || draft.size === allValues.length) {
      onChange(null);
    } else {
      onChange(new Set(draft));
    }
    onToggle(false);
  };

  const clear = () => {
    onChange(null);
    setDraft(new Set(allValues));
    onToggle(false);
  };

  const active = filter !== null;

  return (
    <div className="dq-col-filter-wrap">
      <span>{label}</span>
      <button
        type="button"
        ref={buttonRef}
        className={
          "dq-col-filter-btn" + (active ? " dq-col-filter-btn-active" : "")
        }
        title={active ? "Filter applied" : "Filter"}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) onToggle(false);
          else open();
        }}
      >
        ▾
      </button>
      {isOpen && coords && createPortal(
        <div
          ref={popoverRef}
          className="dq-col-filter-popover dq-col-filter-popover-portal"
          role="presentation"
          style={{ top: coords.top, left: coords.left }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            className="dq-col-filter-search"
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <label className="dq-col-filter-row dq-col-filter-row-all">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
            />
            (Select All)
          </label>
          <div className="dq-col-filter-list">
            {visible.map((v) => (
              <label key={v} className="dq-col-filter-row">
                <input
                  type="checkbox"
                  checked={draft.has(v)}
                  onChange={() => toggleOne(v)}
                />
                {v}
              </label>
            ))}
            {visible.length === 0 && (
              <div className="dq-col-filter-empty">No matches</div>
            )}
          </div>
          <div className="dq-col-filter-actions">
            <button type="button" onClick={clear}>
              Clear
            </button>
            <button
              type="button"
              className="dq-col-filter-apply"
              onClick={apply}
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
