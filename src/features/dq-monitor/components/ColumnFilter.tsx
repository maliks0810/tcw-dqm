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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isOpen) searchInputRef.current?.focus();
  }, [isOpen]);
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
    const onResize = () => onToggle(false);
    // Capture phase so scrolls inside nested containers (table grids)
    // are caught and we close the popover rather than leaving it stranded.
    // BUT: ignore scrolls originating inside the popover itself — the
    // list is scrollable and dragging its scrollbar (or wheeling over
    // it) fires scroll events that used to close the popover mid-drag.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && popoverRef.current && popoverRef.current.contains(t)) return;
      onToggle(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
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

  // Typing narrows the ticked set, Excel-style: the matches become the
  // selection and everything else is dropped.
  //
  // Previously typing only narrowed the visible LIST while the draft
  // stayed at "everything ticked" (open() seeds it from filter ??
  // allValues). Clicking OK then hit the coversAll branch in apply()
  // and CLEARED the filter — so the obvious gesture, type a rule name
  // and press OK, did the opposite of what it looked like, and the only
  // way through was to untick (Select All) first and then tick the row.
  //
  // Clearing the box deliberately leaves the draft alone rather than
  // re-ticking everything: the list re-expands with the matches still
  // ticked, so what is on screen is still exactly what OK will apply.
  const onSearchChange = (next: string) => {
    setSearch(next);
    if (next.trim() === "") return;
    const needle = next.toLowerCase();
    setDraft(
      new Set(allValues.filter((v) => v.toLowerCase().includes(needle)))
    );
  };

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
    // "Everything ticked → no filter" must be a true coverage test,
    // not a size comparison. allValues can change while the popover is
    // open (SSE-driven refetches swap the row set), so equal sizes can
    // hide different membership — e.g. draft {A,B} vs values [A,D]
    // — and a size check would silently discard the user's selection.
    const coversAll = allValues.every((v) => draft.has(v));
    if (draft.size === 0 || coversAll) {
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
        aria-label={active ? "Filter applied" : "Filter"}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) onToggle(false);
          else open();
        }}
      >
        {/* Excel-style filter funnel. currentColor lets the existing
            dq-col-filter-btn / dq-col-filter-btn-active CSS drive the
            fill for hover / applied-filter states — no color logic
            baked into the SVG itself. */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2 3h12l-4.5 5v5h-3v-5z"
            fill="currentColor"
          />
        </svg>
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
            ref={searchInputRef}
            className="dq-col-filter-search"
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter applies, the way it does in Excel's filter box.
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
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
            {/* A search that matches nothing leaves the draft empty, and
                an empty draft means "clear the filter" — so OK would
                answer a typo by showing every row, which reads as the
                filter being ignored. Block it instead; Clear is still
                right there for actually clearing. */}
            <button
              type="button"
              className="dq-col-filter-apply"
              onClick={apply}
              disabled={search.trim() !== "" && visible.length === 0}
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
