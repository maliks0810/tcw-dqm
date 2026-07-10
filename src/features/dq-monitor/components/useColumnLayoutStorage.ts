import { useEffect } from "react";

// Shape persisted per grid. All fields are optional so an older or newer
// version of the app can round-trip missing keys as defaults.
export type PersistedColumnLayout = {
  columnOrder?: string[];
  pinned?: string[];
  hidden?: string[];
  widths?: Record<string, number>;
};

// Read the persisted layout for a specific grid. Safe against SSR (no
// window), a malformed JSON blob, or a schema drift — any error means
// "no persisted state" and the grid falls back to its built-in defaults.
export function loadColumnLayout(storageKey: string): PersistedColumnLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as PersistedColumnLayout;
    return {
      columnOrder: Array.isArray(p.columnOrder) ? p.columnOrder : undefined,
      pinned: Array.isArray(p.pinned) ? p.pinned : undefined,
      hidden: Array.isArray(p.hidden) ? p.hidden : undefined,
      widths:
        p.widths && typeof p.widths === "object" && !Array.isArray(p.widths)
          ? p.widths
          : undefined,
    };
  } catch {
    return null;
  }
}

// Persist the current layout snapshot. Silently swallows QuotaExceeded /
// SecurityError (private-mode Firefox, disabled storage) — a save failure
// must never blow up the grid.
export function saveColumnLayout(
  storageKey: string,
  layout: PersistedColumnLayout
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    /* quota / security — ignore */
  }
}

// Auto-persist whenever any of the layout inputs change. Runs after
// render so the initial hydration + first useEffect pass is a no-op
// round-trip.
export function usePersistedColumnLayout(
  storageKey: string,
  columnOrder: string[],
  pinnedCols: Set<string>,
  hiddenCols: Set<string>,
  colWidths: Record<string, number>
): void {
  useEffect(() => {
    saveColumnLayout(storageKey, {
      columnOrder,
      pinned: Array.from(pinnedCols),
      hidden: Array.from(hiddenCols),
      widths: colWidths,
    });
  }, [storageKey, columnOrder, pinnedCols, hiddenCols, colWidths]);
}
