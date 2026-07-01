import React, { useEffect, useRef } from "react";

export type SortState = { key: string; dir: "asc" | "desc" } | null;

// Ordering helper: empties sink to the bottom, both-numeric compares
// numerically, otherwise localeCompare for stable, locale-aware
// alphabetic order.
export function compareValues(a: string, b: string): number {
  if (a === "" && b === "") return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const an = Number(a);
  const bn = Number(b);
  if (
    Number.isFinite(an) &&
    Number.isFinite(bn) &&
    a.trim() !== "" &&
    b.trim() !== ""
  ) {
    if (an !== bn) return an - bn;
  }
  return a.localeCompare(b);
}

export type SortableThProps = {
  colKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  width?: number;
  onStartResize: (key: string, e: React.MouseEvent) => void;
  menuOpen: boolean;
  onMenuToggle: (open: boolean) => void;
  onSortDir: (dir: "asc" | "desc") => void;
  onHide: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  children: React.ReactNode;
};

// Wraps a <th> with click-to-sort (three-way cycle: asc → desc → off),
// a compact ▲/▼ indicator when the column is the sort key, a ⋮ overflow
// menu (sort asc / desc / pin / hide), and a thin right-edge drag handle
// that resizes the column width. Any interactive child (ColumnFilter's ▾,
// the ⋮ menu, the resize handle) stops propagation so the sort handler
// doesn't fire on those interactions.
export default function SortableTh({
  colKey,
  sort,
  onSort,
  width,
  onStartResize,
  menuOpen,
  onMenuToggle,
  onSortDir,
  onHide,
  pinned,
  onTogglePin,
  children,
}: SortableThProps) {
  const active = sort?.key === colKey;
  const arrow = active && sort?.dir === "asc" ? " ▲" : active ? " ▼" : "";
  const style = width
    ? { width, minWidth: width, maxWidth: width }
    : undefined;
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onMenuToggle(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen, onMenuToggle]);
  return (
    <th
      style={style}
      className={
        "dq-th-sortable" +
        (active ? " dq-th-sorted" : "") +
        (pinned ? " dq-th-pinned" : "")
      }
      onClick={() => onSort(colKey)}
    >
      <span className="dq-th-inner">
        {children}
        {arrow && <span className="dq-th-arrow">{arrow}</span>}
      </span>
      <span
        className="dq-th-menu-wrap"
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      >
        <button
          type="button"
          className="dq-th-menu-btn"
          title="Column options"
          aria-label="Column options"
          onClick={(e) => {
            e.stopPropagation();
            onMenuToggle(!menuOpen);
          }}
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="dq-th-menu-popover" role="menu">
            <button
              type="button"
              role="menuitem"
              className="dq-th-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                onSortDir("asc");
                onMenuToggle(false);
              }}
            >
              <span className="dq-th-menu-icon" aria-hidden="true">▲</span>
              Sort ascending
            </button>
            <button
              type="button"
              role="menuitem"
              className="dq-th-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                onSortDir("desc");
                onMenuToggle(false);
              }}
            >
              <span className="dq-th-menu-icon" aria-hidden="true">▼</span>
              Sort descending
            </button>
            <button
              type="button"
              role="menuitem"
              className="dq-th-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
                onMenuToggle(false);
              }}
            >
              <span className="dq-th-menu-icon" aria-hidden="true">📌</span>
              {pinned ? "Unpin column" : "Pin column"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="dq-th-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                onHide();
                onMenuToggle(false);
              }}
            >
              <span className="dq-th-menu-icon" aria-hidden="true">⊘</span>
              Hide column
            </button>
          </div>
        )}
      </span>
      <span
        className="dq-col-resize-handle"
        onMouseDown={(e) => onStartResize(colKey, e)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="presentation"
      />
    </th>
  );
}
