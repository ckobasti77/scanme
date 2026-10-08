import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FAIR_PRE_EVENT_CATEGORIES, type FairPreEventSummary } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { AdminEventsPreEvent, preEventConfirmMatches, type PreEventActions } from "./admin-events-pre-event";

// Sajam 2026 P1 — „Pre-event podaci“ in `brisanje`: counts per kind, the dry
// run and the reset behind the typed slug (SSR; the actions are TEST stubs).

const t = adminEventsSr.preEvent;
const SLUG = "test-elektromobilnost-2026";
const actions: PreEventActions = {
  dryRun: async () => ({ ok: true, total: 3, capped: false }),
  reset: async (slug) => (slug === SLUG ? { ok: true, total: 3, capped: false } : { ok: false, code: "FAIR_RESET_CONFIRMATION_MISMATCH" }),
};
const summary: FairPreEventSummary = {
  eventId: "test-event",
  eventSlug: SLUG,
  startsAt: Date.parse("2026-10-09T00:00:00+02:00"),
  capPerCategory: 200,
  total: 203,
  capped: true,
  categories: FAIR_PRE_EVENT_CATEGORIES.map((category, index) => ({ category, count: index === 0 ? 200 : index === 1 ? 3 : 0, capped: index === 0 })),
};
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

describe("P1 admin Pre-event podaci", () => {
  test("the boundary, every kind in deletion order with its count, the total and what is never deleted, all in Serbian", () => {
    const html = renderToStaticMarkup(<AdminEventsPreEvent summary={summary} actions={actions} />);
    for (const text of [
      t.title, t.help, t.countsTitle, fmt(t.countsHelp, { cap: 200 }), fmt(t.totalCapped, { total: 203 }), fmt(t.countCapped, { count: 200 }),
      t.dryRun, t.reset, t.keptTitle, ...t.kept, ...FAIR_PRE_EVENT_CATEGORIES.map((category) => t.categories[category]),
    ]) {
      expect(html).toContain(escape(text));
    }
    expect(html).toContain("2026");
    const order = FAIR_PRE_EVENT_CATEGORIES.map((category) => html.indexOf(escape(t.categories[category])));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    // The confirmation (slug field and delete button) opens only after „Resetuj“; no raw enum or code on the page.
    expect(html).not.toContain(t.confirmButton);
    expect(html).not.toContain("<input");
    expect(html).not.toMatch(/\b(email_deliveries|scan_events|FAIR_[A-Z_]+)\b/);
  });

  test("an empty event, a missing overview and an exact total have understandable states", () => {
    const empty = { ...summary, total: 0, capped: false, categories: summary.categories.map((row) => ({ ...row, count: 0, capped: false })) };
    const emptyHtml = renderToStaticMarkup(<AdminEventsPreEvent summary={empty} actions={actions} />);
    expect(emptyHtml).toContain(t.empty);
    expect(emptyHtml).toContain(escape(fmt(t.total, { total: 0 })));
    expect(renderToStaticMarkup(<AdminEventsPreEvent summary={undefined} actions={undefined} />)).toContain(t.unavailable);
  });

  test("the delete is unlocked only by the event's exact slug", () => {
    expect(preEventConfirmMatches(SLUG, SLUG)).toBe(true);
    expect(preEventConfirmMatches(`  ${SLUG} `, SLUG)).toBe(true);
    for (const typed of ["", "elektromobilnost-2026", SLUG.toUpperCase(), `${SLUG}x`, "test-elektromobilnost"]) {
      expect(preEventConfirmMatches(typed, SLUG)).toBe(false);
    }
    expect(preEventConfirmMatches("", "")).toBe(false);
    // The backend refusal has its own Serbian text.
    expect(adminEventsSr.issues.FAIR_RESET_CONFIRMATION_MISMATCH.length).toBeGreaterThan(0);
    expect(adminEventsSr.deliveryErrors.PRE_EVENT.length).toBeGreaterThan(0);
  });
});
