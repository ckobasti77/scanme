// The billing cycle's pure half (TASK-32, RFC-002 §2.5–§2.6): constants,
// calendar arithmetic, and the four-status derivation. No I/O and no clock —
// callers pass `now` in, so the same function serves mutations (Date.now is
// legal there) and queries (which must never read the wall clock; the client
// supplies `now` as an argument).
//
// The statuses are DERIVED, never stored (§2.6: "a stored status column would
// drift from the underlying facts"). The only stored billing state is the
// account's paid-through date (`accounts.planValidUntil`) and the cron-flipped
// `accounts.status: "expired"` — both facts, not labels.

export const DAY_MS = 24 * 60 * 60 * 1000;

// "Ističe za manje od 14 dana" — fixed by the spec (§2.6).
export const EXPIRING_SOON_DAYS = 14;

// Grace after the due date before an account counts as expired. Covers the
// nalog-za-prenos lag (the client paid; the money and the admin entry arrive
// days later). A code constant like PLAN_LIMITS: tuning it is a deploy, never
// a migration. Owner may adjust — flagged in docs/tasks/BLOCKED.md.
export const GRACE_DAYS = 7;

export type BillingPeriod = "monthly" | "annual";

// Calendar advance in UTC: +1 month / +1 year with day-of-month clamping
// (Jan 31 + 1 month → Feb 28/29, Feb 29 + 1 year → Feb 28), so a client billed
// on the 31st never drifts into the 3rd of the month after next.
export function addBillingPeriod(fromMs: number, period: BillingPeriod): number {
  const from = new Date(fromMs);
  const target = new Date(fromMs);
  if (period === "annual") {
    target.setUTCFullYear(target.getUTCFullYear() + 1);
  } else {
    target.setUTCMonth(target.getUTCMonth() + 1);
  }
  if (target.getUTCDate() !== from.getUTCDate()) {
    target.setUTCDate(0); // overflowed into the next month — clamp to its last day
  }
  return target.getTime();
}

// The four operational statuses (§2.6). Values are code enums; the UI
// localizes ("aktivan" · "ističe za < 14 dana" · "istekao" · "plaćeno ali
// nikad podešeno").
export type BillingLifecycleStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "paid_never_configured";

export interface BillingStatusInput {
  accountStatus: "active" | "suspended" | "expired";
  /** accounts.planValidUntil — the account's paid-through / next-billing date; null = no cycle tracked. */
  nextBillingAt: number | null;
  /** Any ACTIVE serviceProfile on any of the account's locations. */
  hasActiveService: boolean;
  /** At least one of those active services has published config / content. */
  anyServiceConfigured: boolean;
  now: number;
}

// Priority (most→least severe): expired > paid_never_configured >
// expiring_soon > active.
//   • expired — the cron already flipped the account, OR the grace window has
//     elapsed live (the derivation never waits for the sweep). A suspended
//     account lands here too: capability-wise it is cut off (getEntitlement
//     step 3 requires status "active"), and the raw accountStatus rides along
//     in the read model for the UI to distinguish.
//   • paid_never_configured — the churn predictor (§2.6): the account owns at
//     least one active (= granted/paid) service and has configured NONE of
//     them. A client who set up one of two services is engaged, not silent —
//     so the flag means "nothing configured at all", per-service gaps are
//     reported separately as `unconfiguredServices`.
//   • expiring_soon — due within 14 days, INCLUDING already past due inside
//     grace ("ko kasni" reads off nextBillingAt < now / negative daysLeft).
export function deriveBillingStatus(input: BillingStatusInput): BillingLifecycleStatus {
  const { accountStatus, nextBillingAt, hasActiveService, anyServiceConfigured, now } =
    input;
  if (accountStatus === "expired" || accountStatus === "suspended") return "expired";
  if (nextBillingAt !== null && now >= nextBillingAt + GRACE_DAYS * DAY_MS) {
    return "expired";
  }
  if (hasActiveService && !anyServiceConfigured) return "paid_never_configured";
  if (
    nextBillingAt !== null &&
    nextBillingAt - now < EXPIRING_SOON_DAYS * DAY_MS
  ) {
    return "expiring_soon";
  }
  return "active";
}
