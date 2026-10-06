import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import type { PackageModel } from "@/components/admin/events/exhibitor-packages";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { interactionExhibitorHref } from "@/lib/admin-v1/event-sections";
import { buildInteractionExhibitorRows, interactionListQuery, type InteractionExhibitorSource } from "@/lib/admin-v1/interaction-exhibitors";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventInteractionExhibitorView } from "./interakcije-izlagac-view";
import { EventInteractionExhibitorsView } from "./interakcije-izlagaci-view";

// Izlagači 2026 — `interakcije` as SSR markup: one link, the exhibitor cards
// (default only with Starter/Napredni, "Svi izlagači" everyone), logo and
// website on the card, packages right in the list, and the exhibitor's page
// with its four parts. TEST data only.

// The shared next/link stub keeps only href/className; the accessible names are checked here.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const t = adminEventsSr.interactionExhibitors;
const page = adminEventsSr.exhibitorPage;
const BASE = "/admin/dogadjaji/test-sajam";
const HOUR = 3_600_000;
const NOW = Date.parse("2026-10-09T12:00:00+02:00");
const day = { id: "d1", dateKey: "2026-10-09", label: "TEST dan 1", startsAt: NOW - 3 * HOUR, endsAt: NOW + 7 * HOUR };
const LOGO = "/fair/izlagaci/2026/test-a.jpg";

const source: InteractionExhibitorSource = {
  participations: [
    { id: "p-a", accountId: "a-a", businessId: "b-a", externalKey: "izl26-test-a" },
    { id: "p-b", accountId: "a-b", businessId: "b-b", externalKey: "izl26-test-b" },
    { id: "p-c", accountId: "a-c", businessId: "b-c", externalKey: "izl26-test-c" },
  ],
  models: [
    { id: "m1", participationId: "p-a", brandId: "br1", tier: "advanced", packageActivatedAt: NOW - 48 * HOUR, status: "published" },
    { id: "m2", participationId: "p-a", brandId: "br1", tier: "starter", packageActivatedAt: NOW - 48 * HOUR, status: "published" },
    { id: "m3", participationId: "p-b", brandId: "br2", tier: "included", packageActivatedAt: NOW - 48 * HOUR, status: "published" },
  ],
  accounts: new Map([["a-a", { name: "TEST Izlagač A", websiteUrl: "https://www.example.com/test-a" }], ["a-b", { name: "TEST Izlagač B", websiteUrl: null }], ["a-c", { name: "TEST Izlagač C", websiteUrl: null }]]),
  businesses: new Map([["b-a", { name: "TEST Izlagač A", logoUrl: LOGO }], ["b-b", { name: "TEST Izlagač B", logoUrl: null }], ["b-c", { name: "TEST Izlagač C", logoUrl: null }]]),
  brands: new Map([["br1", "TEST Volta"], ["br2", "TEST Om"]]),
  days: [day],
  questions: [{ id: "q1", modelId: "m1", dayId: "d1", status: "published", showOnSponsoredRotation: false }],
  surveys: [],
  passports: [{ exhibitorId: "p-a", brandId: "br1", state: "active" }],
};
const ROWS = buildInteractionExhibitorRows(source, NOW);
const PACKAGES: Record<string, PackageModel[]> = {
  "p-a": [
    { id: "m1", name: "TEST Volta X1", brandName: "TEST Volta", tier: "advanced", packageActivatedAt: NOW - 48 * HOUR, status: "published" },
    { id: "m2", name: "TEST Volta X2", brandName: "TEST Volta", tier: "starter", packageActivatedAt: NOW + 30 * HOUR, status: "published" },
    { id: "m4", name: "TEST Volta X4", brandName: "TEST Volta", tier: "included", packageActivatedAt: NOW - 48 * HOUR, status: "published" },
  ],
  "p-b": [{ id: "m3", name: "TEST Om Z3", brandName: "TEST Om", tier: "included", packageActivatedAt: NOW - 48 * HOUR, status: "published" }],
};
const ok = async () => ({ ok: true as const });

function list(query: AdminQueryState = {}, rows = ROWS) {
  return renderToStaticMarkup(
    <AdminViewModeOverride value={query.prikaz === "tabela" ? "tabela" : "kartice"}>
      <EventInteractionExhibitorsView
        rows={rows}
        dayLabel={day.label}
        query={query}
        onQueryChange={() => undefined}
        exhibitorHref={(id) => interactionExhibitorHref(BASE, id, interactionListQuery(query))}
        packagesOf={(id) => PACKAGES[id] ?? []}
        onUpgrade={ok}
        now={NOW}
        importHref={`${BASE}/import`}
      />
    </AdminViewModeOverride>,
  );
}

function exhibitorPage(id: string) {
  const row = ROWS.find((entry) => entry.id === id) ?? null;
  return renderToStaticMarkup(
    <EventInteractionExhibitorView
      exhibitor={row}
      models={PACKAGES[id] ?? []}
      now={NOW}
      listHref={`${BASE}/interakcije?paket=svi`}
      profileHref={row ? `/admin/klijenti/${row.accountId}` : null}
      modelsHref={`${BASE}/modeli?izlagac=${id}`}
      importHref={`${BASE}/import`}
      onUpgrade={ok}
      parts={{ "glas-publike": <p>TEST deo glas</p>, ankete: <p>TEST deo ankete</p>, pasos: <p>TEST deo pasos</p>, forme: <p>TEST deo forme</p> }}
    />,
  );
}

describe("Interakcije: exhibitor cards", () => {
  test("the default view shows only exhibitors with Starter or Napredni, with logo, website and a link to their page", () => {
    const html = list();
    expect(html).toContain(fmt(t.count, { shown: 1, total: 3 }));
    expect(html).toContain("TEST Izlagač A");
    expect(html).not.toContain("TEST Izlagač B");
    expect(html).toContain(`src="${LOGO}"`);
    expect(html).toMatch(/<a href="https:\/\/www\.example\.com\/test-a"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    expect(html).toContain(">example.com/test-a<");
    expect(html).toContain(`href="${BASE}/interakcije/p-a"`);
    expect(html).toContain(`aria-label="${fmt(t.openAria, { name: "TEST Izlagač A" })}"`);
    expect(html).toContain(`aria-label="${fmt(t.packagesAria, { name: "TEST Izlagač A" })}"`);
    // Glas publike today: m1 has a published question, m2 none.
    expect(html).toContain(fmt(t.questionsValue, { covered: 1, required: 2 }));
    expect(html).toContain(`${t.packages.interakcije}`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Sa interakcijama/);
  });

  test("`Svi izlagači` shows everyone; without a logo the initials, without cars a short note; filters travel to the page", () => {
    const html = list({ paket: "svi", q: "test" });
    expect(html).toContain(fmt(t.count, { shown: 3, total: 3 }));
    for (const name of ["TEST Izlagač A", "TEST Izlagač B", "TEST Izlagač C"]) expect(html).toContain(name);
    expect(html).toContain(">TI<");
    expect(html).toContain(t.noModels);
    expect(html).toContain(`href="${BASE}/interakcije/p-b?q=test&amp;paket=svi"`);
  });

  test("nobody with interactions yet: one tap to every exhibitor; no exhibitors at all: where they come from", () => {
    const none = buildInteractionExhibitorRows({ ...source, models: [] }, NOW);
    const html = list({}, none);
    expect(html).toContain(t.emptyTitle);
    expect(html).toContain(t.emptyShowAll);
    expect(list({}, [])).toContain(t.noExhibitorsTitle);
  });
});

describe("Interakcije: the exhibitor's page", () => {
  test("who it is, its packages and the four parts with a jump row", () => {
    const html = exhibitorPage("p-a");
    expect(html).toContain(`href="${BASE}/interakcije?paket=svi"`);
    expect(html).toMatch(/<h2[^>]*>TEST Izlagač A<\/h2>/);
    expect(html).toContain(`src="${LOGO}"`);
    expect(html).toContain('href="/admin/klijenti/a-a"');
    expect(html).toContain(`href="${BASE}/modeli?izlagac=p-a"`);
    expect(html).toContain(page.packagesTitle);
    for (const part of ["glas-publike", "ankete", "pasos", "forme"]) {
      expect(html).toContain(`id="${part}"`);
      expect(html).toContain(`href="#${part}"`);
    }
    for (const text of ["TEST deo glas", "TEST deo ankete", "TEST deo pasos", "TEST deo forme"]) expect(html).toContain(text);
  });

  test("packages: only upgrades per car, the highest one marked, a package that starts later shows its date, bulk with counts", () => {
    const html = exhibitorPage("p-a");
    expect(html).toContain(page.highestTier);
    expect(html).toContain(`aria-label="${fmt(page.upgradeAria, { tier: adminEventsSr.tiers.advanced, model: "TEST Volta X2" })}"`);
    expect(html).toContain(`aria-label="${fmt(page.upgradeAria, { tier: adminEventsSr.tiers.starter, model: "TEST Volta X4" })}"`);
    expect(html).not.toContain(`aria-label="${fmt(page.upgradeAria, { tier: adminEventsSr.tiers.starter, model: "TEST Volta X2" })}"`);
    expect(html).toContain(page.pendingFrom.split("{")[0]);
    expect(html).toContain(fmt(page.bulkTo, { tier: adminEventsSr.tiers.starter, count: 1 }));
    expect(html).toContain(fmt(page.bulkTo, { tier: adminEventsSr.tiers.advanced, count: 2 }));
    // With interactions the cars fold away behind one button, so the four parts come first.
    expect(html).toMatch(new RegExp(`aria-expanded="false"[^>]*>${fmt(page.carsShow, { count: 3 }).replace(/[()]/g, "\\$&")}`));
    expect(html).toMatch(/<div id="[^"]+" hidden="">/);
    // Without interactions the cars are open: that is what the page is for then.
    expect(exhibitorPage("p-b")).not.toMatch(/<div id="[^"]+" hidden="">/);
  });

  test("without Starter/Napredni the parts wait for a package; without cars the import; unknown exhibitor: not found", () => {
    const b = exhibitorPage("p-b");
    expect(b).toContain(page.noInteractionsTitle);
    expect(b).not.toContain('id="glas-publike"');
    expect(b).toContain(page.noWebsite);
    const c = exhibitorPage("p-c");
    expect(c).toContain(page.packagesEmptyTitle);
    expect(c).toContain(`href="${BASE}/import"`);
    const missing = exhibitorPage("nema");
    expect(missing).toContain(page.notFoundTitle);
    expect(missing).toContain(`href="${BASE}/interakcije?paket=svi"`);
  });
});
