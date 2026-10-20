"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { AdminPanel } from "@/components/admin/admin-primitives";
import { adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

// ADMIN v2 X6 (RX S5) — what `app/admin/error.tsx` shows when a page of the
// admin fails (a query that rejects its arguments, a chunk that did not load).
// It is rendered inside the screen, so the sidebar, the navbar and the way out
// stay. „Očisti filtere“ is a plain link to the same page without its query: a
// full load, so a filter from a bad link cannot fail the page again.

const d = adminUiSr.routeError;

export function AdminRouteError({ onRetry, clearHref }: {
  onRetry: () => void;
  /** The page without its query string; null when the address has none. */
  clearHref: string | null;
}) {
  return (
    <AdminPanel data-admin-route-error="" role="alert" className="grid min-h-72 place-items-center px-5 py-10 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{d.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--admin-text-muted)]">{clearHref ? d.bodyWithFilters : d.body}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={onRetry} className={adminPrimaryButtonClass}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {adminV1Sr.retryAction}
          </button>
          {clearHref ? <a href={clearHref} className={adminSecondaryButtonClass}>{d.clearFilters}</a> : null}
        </div>
      </div>
    </AdminPanel>
  );
}
