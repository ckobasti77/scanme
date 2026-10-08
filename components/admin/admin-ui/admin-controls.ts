// Admin UX A2 — form control and button classes of the admin screens (were
// duplicated in admin-events.tsx and admin-events-interactions.tsx).

export const adminFieldClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";
export const adminPrimaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-on-ink)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";
export const adminSecondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";
/**
 * Sajam 2026 N2 — a field typed on the fair floor (Poveži nalepnicu, QR,
 * model): 16 px below `sm`, so iOS does not zoom on focus. Only these flows
 * use it; the other admin forms keep adminFieldClass (14 px) unchanged.
 */
export const adminTouchFieldClass = `${adminFieldClass} max-sm:text-base`;
