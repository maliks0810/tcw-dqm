import React, { useEffect, useRef, useState } from "react";
import { useOktaAuth } from "@okta/okta-react";
import { USE_OKTA } from "../../../services/auth-mode";

type HeaderProps = {
  onExportClick?: () => void;
  modeToggleLabel?: string;
  onModeToggleClick?: () => void;
  onBulkStatusClick?: () => void;
  bulkStatusLabel?: string;
  onBulkAssignClick?: () => void;
  bulkAssignLabel?: string;
  // Save Column Order sits between Bulk Status and Bulk Assign in
  // the header. Rendered only when a callback is supplied — the
  // parent decides visibility (today: SM / SM Benchmark / TOD SOD
  // rule groups, and only after the operator has drag-reordered
  // the grid). Optional label + saving-in-flight signal so the
  // parent can flip the copy while the POST is in flight.
  onSaveColumnOrderClick?: () => void;
  saveColumnOrderLabel?: string;
  saveColumnOrderSaving?: boolean;
  // Transient success / error message rendered inline right of the
  // Save Column Order button. Parent auto-clears it after a few
  // seconds so the header row doesn't stay noisy. Not shown when
  // the button itself isn't rendered.
  saveColumnOrderMessage?: string;
  // DM_USER.ROLE for the current operator, rendered beside the page
  // title. Empty string / undefined renders nothing — that's the
  // least-privileged default the page uses before the role fetch
  // resolves and for users absent from DM_USER, and a stray empty
  // badge next to the title would just be noise.
  dmRole?: string;
  // Settings gear (right of Export to Excel) and its menu. The gear
  // renders only when this callback is supplied, so the parent
  // controls visibility. Fired by the "Clear Filters" item.
  onClearFilters?: () => void;
  clearFiltersEnabled?: boolean;
  // Settings → Reset Column Headers. Rendered only when supplied AND
  // enabled; the parent disables it when no LHS rule group is
  // selected, since there is no scope whose saved layout could be
  // cleared. Shown-but-disabled rather than hidden so the menu
  // doesn't change shape as the operator moves around the tree.
  onResetColumnHeaders?: () => void;
  resetColumnHeadersEnabled?: boolean;
  // Settings → Show Hidden Columns. Replaces the in-grid "Show all"
  // link. Disabled when the on-screen grid has nothing hidden.
  onShowHiddenColumns?: () => void;
  showHiddenColumnsEnabled?: boolean;
  breakdown?: React.ReactNode;
  breakdownLeftOffset?: number;
};

export default function Header({
  onExportClick,
  modeToggleLabel,
  onModeToggleClick,
  onBulkStatusClick,
  bulkStatusLabel,
  onBulkAssignClick,
  bulkAssignLabel,
  onSaveColumnOrderClick,
  saveColumnOrderLabel,
  saveColumnOrderSaving,
  saveColumnOrderMessage,
  dmRole,
  onClearFilters,
  clearFiltersEnabled,
  onResetColumnHeaders,
  resetColumnHeadersEnabled,
  onShowHiddenColumns,
  showHiddenColumnsEnabled,
  breakdown,
  breakdownLeftOffset,
}: HeaderProps = {}) {
  const oktaCtx = useOktaAuth();
  const oktaAuth = oktaCtx?.oktaAuth;
  const authState = oktaCtx?.authState;
  const [user, setUser] = useState<string>(USE_OKTA ? "" : "Local User");

  useEffect(() => {
    if (!USE_OKTA) return;
    if (!authState?.isAuthenticated || !oktaAuth) return;

    (async () => {
      const userInfo = await oktaAuth.getUser();
      setUser(
        (userInfo as any)?.preferred_username ||
          (userInfo as any)?.email ||
          "Unknown User"
      );
    })();
  }, [authState?.isAuthenticated, oktaAuth]);

  // Settings dropdown. Closes on outside click and on Escape — same
  // affordances as the grid's per-column ⋮ menu, so the two behave
  // consistently.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  const handleLogout = async () => {
    if (!USE_OKTA || !oktaAuth) return;
    await oktaAuth.signOut({
      postLogoutRedirectUri: `${window.location.origin}/login`,
    });
  };

  // When a breakdown row is supplied, the left column is sized so the
  // breakdown starts at the horizontal position where the Exceptions
  // grid begins (sidebar width + resizer + gaps computed by the
  // caller). Right column keeps its buttons flush right via
  // .dq-header-right's justify-self: end.
  //
  // minmax(max-content, offset) rather than a fixed `offset px`: the
  // offset is the *preferred* start, not a cap. With the sidebar
  // collapsed it shrinks to roughly the rail width, far narrower than
  // the 18px bold title plus the role badge, and a fixed track left the
  // title overflowing into the breakdown's column so the two overlapped.
  //
  // max-content as the MINIMUM is what makes that structurally
  // impossible: the track can never be narrower than the title and badge
  // actually need, at any viewport width. The earlier
  // minmax(offset, auto) did not guarantee this — a fixed minimum sets
  // the track's base size outright and ignores the item's own
  // min-content contribution, so the column only reached the title's
  // width via the "maximize tracks" step, which needs spare room in the
  // header. Squeeze the window and the base size wins and the title
  // spills over the breakdown again.
  //
  // Per the grid spec a max below the min is floored by it, so this
  // reads as: at least the title, exactly the offset when the offset is
  // the larger of the two. Expanded, the offset wins and the breakdown
  // lines up with the grid; collapsed, max-content wins and the
  // breakdown sits just clear of the badge instead.
  const headerStyle: React.CSSProperties | undefined =
    breakdown != null && breakdownLeftOffset != null
      ? {
          gridTemplateColumns: `minmax(max-content, ${breakdownLeftOffset}px) auto 1fr`,
        }
      : undefined;

  return (
    <div className="dq-header" style={headerStyle}>
      <div className="dq-header-left">
        {USE_OKTA && <div className="dq-header-brand">TCW</div>}
        <h1 className="dq-header-title">DATA QUALITY MONITOR</h1>
        {dmRole && <span className="dq-header-role">{dmRole}</span>}
      </div>

      {breakdown != null && (
        <div className="dq-header-breakdown">{breakdown}</div>
      )}

      <div className="dq-header-right">
        {onBulkStatusClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onBulkStatusClick}
          >
            {bulkStatusLabel ?? "Bulk Status"}
          </button>
        )}
        {onSaveColumnOrderClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onSaveColumnOrderClick}
            disabled={saveColumnOrderSaving}
          >
            {saveColumnOrderLabel ?? "Save Column Order"}
          </button>
        )}
        {onSaveColumnOrderClick && saveColumnOrderMessage && (
          <span
            className="dq-header-inline-message"
            role="status"
            aria-live="polite"
          >
            {saveColumnOrderMessage}
          </span>
        )}
        {onBulkAssignClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onBulkAssignClick}
          >
            {bulkAssignLabel ?? "Bulk Assign"}
          </button>
        )}
        {modeToggleLabel && onModeToggleClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onModeToggleClick}
          >
            {modeToggleLabel}
          </button>
        )}
        {onExportClick && (
          <button
            className="dq-export-btn"
            type="button"
            onClick={onExportClick}
          >
            Export to Excel
          </button>
        )}
        {(onClearFilters || onResetColumnHeaders || onShowHiddenColumns) && (
          <div className="dq-settings-wrap" ref={settingsRef}>
            <button
              type="button"
              className="dq-settings-btn"
              title="Settings"
              aria-label="Settings"
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              {/* Material-style gear: a toothed ring with a hollow
                  centre. currentColor lets .dq-settings-btn drive the
                  fill for the default / hover states. */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  fill="currentColor"
                  d="M19.14 12.94a7.6 7.6 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.24-1.12.55-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.86a.5.5 0 0 0 .12.62l2.03 1.58a7.6 7.6 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
                />
              </svg>
            </button>
            {settingsOpen && (
              <div className="dq-settings-menu" role="menu">
                {onClearFilters && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dq-settings-item"
                    disabled={!clearFiltersEnabled}
                    title={
                      clearFiltersEnabled
                        ? undefined
                        : "Switch to the Exceptions grid to clear filters"
                    }
                    onClick={() => {
                      if (!clearFiltersEnabled) return;
                      onClearFilters();
                      setSettingsOpen(false);
                    }}
                  >
                    Clear Filters
                  </button>
                )}
                {onShowHiddenColumns && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dq-settings-item"
                    disabled={!showHiddenColumnsEnabled}
                    title={
                      showHiddenColumnsEnabled
                        ? undefined
                        : "No hidden columns on the Exceptions grid"
                    }
                    onClick={() => {
                      if (!showHiddenColumnsEnabled) return;
                      onShowHiddenColumns();
                      setSettingsOpen(false);
                    }}
                  >
                    Show Hidden Columns
                  </button>
                )}
                {onResetColumnHeaders && (
                  <button
                    type="button"
                    role="menuitem"
                    className="dq-settings-item"
                    disabled={!resetColumnHeadersEnabled}
                    title={
                      resetColumnHeadersEnabled
                        ? undefined
                        : "Select a rule group on the left first"
                    }
                    onClick={() => {
                      if (!resetColumnHeadersEnabled) return;
                      onResetColumnHeaders();
                      setSettingsOpen(false);
                    }}
                  >
                    Reset Column Headers
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {USE_OKTA && (
          <>
            <div className="dq-user">👤 {user}</div>
            <button className="dq-logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </>
        )}
      </div>
    </div>
  );
}
