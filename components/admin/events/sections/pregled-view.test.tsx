import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { eventNavGroups } from "@/lib/admin-v1/event-sections";
import { FAIR_DASHBOARD_RULES, FAIR_LEAD_DELIVERY_DEADLINE_MS } from "@/lib/fair-contract";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import {
  dashboardActionHref,
  dashboardSectionUrgency,
  sortDashboardActions,
  timeLeftText,
  withNavUrgency,
  type EventDashboardData,
} from "../dashboard-logic";
import { previewDashboard } from "../preview-dashboard-fixtures";
import { EventDashboardView } from "./pregled-view";

// Admin UX A10 — `pregled`: order by tone, the links to filtered sections,
// the empty state, the three phases, KPI without fake zeros, section cards
// and the navigation badges from the same result.

// The shared next/link stub keeps only href/className; these checks read the item link's aria-label.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const d = adminEventsSr.dashboard;
const BASE = "/admin/dogadjaji/test-sajam";
type Action = EventDashboardData["actions"][number];

const render = (dashboard: EventDashboardData) => renderToStaticMarkup(<EventDashboardView dashboard={dashboard} now={dashboard.at} base={BASE} />);
const rulesInOrder = (html: string) => [...html.matchAll(/data-rule="([a-z_]+)"/g)].map((match) => match[1]);

describe("A10 Pregled view", () => {
  test("„Šta treba da uradim“: hitno on top, then uskoro, then info; each item has its sentence and opens its section filtered", () => {
    const sajam = previewDashboard("sajam");
    // The view sorts by itself: give it the items reversed.
    const html = render({ ...sajam, actions: [...sajam.actions].reverse() });
    const order = rulesInOrder(html);
    expect(order).toEqual(sortDashboardActions(sajam.actions).map((row) => row.rule));
    const tones = order.map((rule) => sajam.actions.find((row) => row.rule === rule)!.tone);
    expect(tones.indexOf("uskoro")).toBeGreaterThan(tones.lastIndexOf("hitno"));
    expect(tones.indexOf("info")).toBeGreaterThan(tones.lastIndexOf("uskoro"));
    expect(html.indexOf('data-rule="question_missing_today"')).toBeLessThan(html.indexOf('data-rule="reports_pending_review"'));

    for (const [rule, href] of [
      ["question_missing_today", `${BASE}/interakcije?dan=2026-10-10`],
      ["reports_pending_review", `${BASE}/izvestaji?status=ceka-odobrenje`],
      ["published_without_qr", `${BASE}/modeli?status=objavljen&amp;qr=nema`],
      ["leads_undelivered", `${BASE}/leadovi?isporuka=ne`],
      ["advanced_photo_missing", `${BASE}/modeli?paket=napredni&amp;foto=nema`],
      ["passport_missing", `${BASE}/interakcije?stanje=nije-napravljen`],
    ] as const) {
      expect({ rule, linked: html.includes(`href="${href}"`) }).toEqual({ rule, linked: true });
    }
    for (const text of [
      d.rules.question_missing_today.title, "Starter i Napredni modeli nemaju objavljeno pitanje Glasa publike za TEST dan 2.",
      d.open.interakcije, `aria-label="${d.open.izvestaji}: ${d.rules.reports_pending_review.title}"`,
      "Rok za predaju izlagačima je 15. 11. 2026. (preostalo dana: 36).", "Hitno 4 · uskoro 2 · info 3",
    ]) {
      expect(html).toContain(text);
    }
    // The tone is always written next to its color.
    expect(html).toContain('data-admin-primitive="urgency" data-tone="hitno"');
    expect(html).toContain(">Hitno<");
    expect(html).not.toMatch(/FAIR_[A-Z_]+|[a-z]+_[a-z_]+\b(?=<)/);
  });

  test("every backend rule has a title, a sentence and a section link text", () => {
    for (const rule of FAIR_DASHBOARD_RULES) {
      expect(d.rules[rule].title.length).toBeGreaterThan(3);
      expect(d.rules[rule].body.length).toBeGreaterThan(10);
    }
    const action: Action = { rule: "leads_undelivered", tone: "uskoro", count: 3, section: "leadovi", query: { isporuka: "ne" }, deadlineAt: FAIR_LEAD_DELIVERY_DEADLINE_MS };
    expect(render({ ...previewDashboard("posle"), actions: [action] })).toContain("(preostalo dana: 26)");
  });

  test("empty list: „Sve je spremno“ with a short summary and no items", () => {
    const html = render({ ...previewDashboard("sajam"), actions: [] });
    expect(html).toContain(d.readyTitle);
    expect(html).toContain("Objavljeno je 34 od 37 modela, dodeljeno QR kodova: 33.");
    expect(html).not.toContain("data-rule=");
    expect(html).not.toContain(d.todoHelp);
  });

  test("three phases: phase badge, countdown to the next deadline, fair days with today marked", () => {
    const pre = render(previewDashboard("pre"));
    for (const text of [d.phase.pre, d.deadline.opening, "1 d 14 h", "9. 10. 2026. 00:00", "9. 10. 2026. – 11. 10. 2026.", "TEST dan 1"]) expect(pre).toContain(text);
    expect(pre).not.toContain('aria-current="date"');

    const sajam = render(previewDashboard("sajam"));
    for (const text of ["Sajamski dan 2 od 3", d.deadline.day_end, "13 h 20 min", "10. 10. 2026. 23:59", `· ${d.todayTag}`]) expect(sajam).toContain(text);
    expect(sajam).toMatch(/<li aria-current="date"[^>]*><span>TEST dan 2<\/span>/);

    const posle = render(previewDashboard("posle"));
    for (const text of [d.phase.posle, d.deadline.lead_delivery, "15. 11. 2026. 23:59", d.rules.pii_purge_countdown.title, "26 d", "16. 11. 2026. u 00:00."]) expect(posle).toContain(text);
    // The deletion is the only info item, so it comes last.
    expect(rulesInOrder(posle).at(-1)).toBe("pii_purge_countdown");
  });

  test("KPI row: one number per function; a function no package has is left out, never a zero", () => {
    const sajam = render(previewDashboard("sajam"));
    for (const text of [d.kpi.models, "34/37", "Za sve 9 · Starter 18 · Napredni 10", d.kpi.qr, "33/100", d.kpi.scans, "412", "ukupno 1286 · jedinstveni 903", d.kpi.leads, "neisporučeno 14 od 23", d.kpi.questionsToday, "15/20", d.kpi.reports]) {
      expect(sajam).toContain(text);
    }
    expect(sajam).toContain('aria-label="Brojevi"');
    expect(sajam).toContain(`href="${BASE}/izvestaji?status=ceka-odobrenje"`);

    const base = previewDashboard("posle");
    const html = render({ ...base, kpis: { ...base.kpis, leads: null, questions: null, reports: null, qr: { assigned: 0, inventory: null, inventoryCapped: false } } });
    for (const text of [d.kpi.leads, d.kpi.questionsToday, d.kpi.reports, "Pitanja za"]) expect(html).not.toContain(text);
    expect(html).toContain(d.kpi.qrNoInventory);
    expect(render(previewDashboard("pre"))).toContain("Pitanja za TEST dan 1");
    // After the fair the totals and the open deliveries replace "today".
    const posle = render(previewDashboard("posle"));
    for (const text of [d.kpi.scansTotal, "3954", "jedinstveni 2710", d.kpi.leadsUndelivered, "od 61 primljenih"]) expect(posle).toContain(text);
    for (const text of [d.kpi.scans, d.kpi.leads]) expect(posle).not.toContain(text);
  });

  test("seven section cards with 2–3 numbers, a link and the urgency of their items", () => {
    const html = render(previewDashboard("sajam"));
    expect([...html.matchAll(/data-card="([a-z]+)"/g)].map((match) => match[1])).toEqual(["modeli", "qr", "interakcije", "leadovi", "sponzorisano", "izvestaji", "izlagaci"]);
    for (const path of ["modeli", "qr", "interakcije", "leadovi", "sponzorisano", "izvestaji", "izlagaci"]) expect(html).toContain(`href="${BASE}/${path}"`);
    // Izveštaji: 3 waiting for approval + 1 failed, both hitno.
    expect(html).toMatch(/data-card="izvestaji"[\s\S]*?Hitno: 4[\s\S]*?<\/article>/);
    expect(html).toContain(d.cards.sponzorisano.autoOn);

    const base = previewDashboard("pre");
    const empty = render({ ...base, sections: { ...base.sections, leadovi: null, sponzorisano: null, izvestaji: null } });
    for (const text of [d.cards.leadovi.none, d.cards.sponzorisano.none, d.cards.izvestaji.none]) expect(empty).toContain(text);
  });
});

describe("A10 dashboard logic", () => {
  test("section badges: the most urgent tone per section, info stays on Pregled, a parent carries its pages' badge", () => {
    const actions: Action[] = [
      { rule: "published_without_qr", tone: "hitno", count: 2, section: "modeli", query: {} },
      { rule: "price_missing", tone: "uskoro", count: 5, section: "modeli", query: {} },
      { rule: "published_with_errors", tone: "hitno", count: 1, section: "modeli", query: {} },
      { rule: "follow_up_text_missing", tone: "uskoro", count: 2, section: "leadovi/follow-up", query: {} },
      { rule: "leads_switch_off", tone: "hitno", count: 1, section: "leadovi/podesavanja", query: {} },
      { rule: "passport_hidden", tone: "info", count: 1, section: "interakcije", query: {} },
      { rule: "pii_purge_countdown", tone: "uskoro", count: 6, section: "brisanje", query: {} },
    ];
    const urgency = dashboardSectionUrgency(actions);
    expect(Object.fromEntries(urgency)).toEqual({
      modeli: { tone: "hitno", count: 3 },
      "leadovi/follow-up": { tone: "uskoro", count: 2 },
      "leadovi/podesavanja": { tone: "hitno", count: 1 },
      brisanje: { tone: "uskoro", count: 1 },
    });
    const groups = withNavUrgency(eventNavGroups((path) => `${BASE}/${path}`, "pregled"), urgency);
    const items = groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === "modeli")?.urgency).toEqual({ tone: "hitno", count: 3 });
    expect(items.find((item) => item.id === "pregled")?.urgency).toBeUndefined();
    const leads = items.find((item) => item.id === "leadovi")!;
    expect(leads.urgency).toEqual({ tone: "hitno", count: 1 });
    expect(leads.children?.find((child) => child.id === "leadovi/follow-up")?.urgency).toEqual({ tone: "uskoro", count: 2 });
    expect(items.find((item) => item.id === "interakcije")?.urgency).toBeUndefined();
  });

  test("links keep only known filters; the countdown reads in days, hours or minutes", () => {
    expect(dashboardActionHref(BASE, { section: "izvestaji", query: { status: "ceka-podatke", dan: "2026-10-09", nepoznato: "x" } })).toBe(`${BASE}/izvestaji?status=ceka-podatke&dan=2026-10-09`);
    expect(dashboardActionHref("/dev/admin-events-preview", { section: "leadovi/follow-up", query: { izlagac: "p-c" } }, { dogadjaj: "test-amf" })).toBe("/dev/admin-events-preview/leadovi/follow-up?dogadjaj=test-amf&izlagac=p-c");
    expect(timeLeftText(3 * 86_400_000 + 4 * 3_600_000 + 59_000)).toBe("3 d 4 h");
    expect(timeLeftText(2 * 3_600_000 + 15 * 60_000)).toBe("2 h 15 min");
    expect(timeLeftText(40 * 60_000)).toBe("40 min");
    expect(timeLeftText(-5)).toBe(d.left.now);
  });

  test("the preview phase comes from ?faza= (default sajam)", () => {
    expect(previewDashboard(undefined).phase.kind).toBe("sajam");
    expect(previewDashboard("pre").phase.kind).toBe("pre");
    expect(previewDashboard("posle").phase.kind).toBe("posle");
    expect(previewDashboard("nepoznato").phase.kind).toBe("sajam");
  });
});
