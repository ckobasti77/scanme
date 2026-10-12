import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

// ADMIN v2 — Proizvodi: no filter block above the lists. The search and the
// filters are in the sidebar and in the URL; `?venue=` switches the page from
// the list of venues to the inventory of that venue. SSR markup, like the
// other admin views.

const nav = vi.hoisted(() => ({ search: "" }));
const queries = vi.hoisted(() => ({ calls: [] as { args: unknown }[], venueRow: null as unknown }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/operativa/proizvodi",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push() {}, replace() {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (_ref: unknown, args: unknown) => {
    queries.calls.push({ args });
    const venue = args !== "skip" && (args as { sort?: string }).sort === "urgency";
    return { results: venue && queries.venueRow ? [queries.venueRow] : [], status: "Exhausted", loadMore: () => undefined };
  },
  useQuery: () => undefined,
  useMutation: () => () => Promise.resolve(),
}));

import { AdminSidebarView } from "@/components/admin/frame/admin-sidebar-view";
import { resolveAdminSidebar } from "@/lib/admin-v2/sidebar/registry";
import { adminProductsSr as dict } from "@/lib/i18n/sr/admin-products";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminProductsWorkspace } from "./admin-products";
import { AdminProductsPreview } from "./admin-products-surface";

function preview(search = "") {
  nav.search = search;
  return renderToStaticMarkup(<AdminProductsPreview />);
}

function sidebar(search = "") {
  return renderToStaticMarkup(<AdminSidebarView config={resolveAdminSidebar("/admin/operativa/proizvodi", search)} state={{}} onPatch={() => undefined} />);
}

const toggles = (html: string) => html.match(/data-admin-filter-toggle=""/g)?.length ?? 0;
const cards = (html: string) => html.match(/data-product-card/g)?.length ?? 0;

beforeEach(() => {
  nav.search = "";
  queries.calls = [];
  queries.venueRow = null;
});

describe("Proizvodi: list of venues", () => {
  test("one H1 and the header; no search, select, tabs or sort line above the list", () => {
    const html = preview();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(`>${dict.pageTitle}</h1>`);
    expect(html).toContain(adminV1Sr.navOperations);
    expect(html).toContain(dict.previewBadge);
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain(dict.venueSortLabel);
    expect(html).not.toContain(dict.venueSortUrgency);
    expect(html).not.toContain(dict.venueFilterLabel);
  });

  test("the columns read QR 11 · NFC 9 (not 11 / 9); an empty value is an empty cell, not a dash", () => {
    const html = preview();
    expect(html).toContain("QR 11 · NFC 9");
    expect(html).not.toContain("11 / 9");
    expect(html).not.toContain(">—<");
  });

  test("the URL state filters the venues: lokali and the search", () => {
    expect(preview().match(/data-venue-trigger/g)).toHaveLength(6);
    expect(preview("?lokali=problem")).toContain("Bistro Most — Kej");
    expect(preview("?lokali=problem")).not.toContain("Studio Forma — Vračar");
    expect(preview("?lokali=active")).toContain("Bistro Most — Centar");
    expect(preview("?lokali=active")).not.toContain("Bistro Most — Kej");
    expect(preview("?q=forma")).toContain("Studio Forma — Vračar");
    expect(preview("?q=forma")).not.toContain("Bistro Most — Kej");
    const none = preview("?q=nepostojeci");
    expect(none).toContain(dict.noVenueResultsTitle);
    expect(none).not.toContain("data-venue-trigger");
  });

  test("the table and the cards break on the width of the screen, not the window", () => {
    const html = preview();
    expect(html).toContain("@container");
    expect(html).toContain("hidden @4xl:block");
    expect(html).toContain("@4xl:hidden");
    expect(html).not.toContain("min-w-[70rem]");
    expect(html).not.toMatch(/class="[^"]*\bxl:(hidden|block)\b/);
  });

  test("the sidebar has the search and the one group; no sort and no views", () => {
    const html = sidebar();
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(dict.venueSearchLabel);
    expect(toggles(html)).toBe(1);
    expect(html).toContain(`>${dict.venueFilterLabel}</span>`);
    expect(html).toContain(adminV1Sr.navOperations);
    for (const label of [dict.pageTitle, dict.qrModuleTitle]) expect(html).toContain(label);
  });
});

describe("Proizvodi: inventory of a venue (?venue=)", () => {
  const venue = "?venue=business-kej";

  test("the header names the venue; Tabela / Vizuelno stays by the list; no select or search", () => {
    const html = preview(venue);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(">Bistro Most — Kej</h1>");
    expect(html).toContain(dict.breadcrumb);
    expect(html).toContain(`>${dict.backToVenues}</button>`);
    expect(html).toContain(`aria-label="${dict.viewLabel}"`);
    expect(html).toContain(`>${dict.viewTable}</button>`);
    expect(html).toContain(`>${dict.viewVisual}</button>`);
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain(`>${dict.venueFilterLabel}<`);
  });

  test("the summary names the counts; empty design, position and destination leave no dash", () => {
    const html = preview(venue);
    expect(html).toContain("data-admin-summary");
    for (const label of [dict.products, dict.qr, dict.nfc, dict.problems]) expect(html).toContain(label);
    expect(html).not.toContain(">—<");
  });

  test("the URL state filters the inventory: type, status, service and the search", () => {
    expect(cards(preview(venue))).toBe(5);
    expect(cards(preview(`${venue}&tip=stickers`))).toBe(1);
    expect(cards(preview(`${venue}&status=problem`))).toBe(1);
    expect(cards(preview(`${venue}&usluga=google_review`))).toBe(2);
    expect(cards(preview(`${venue}&q=sto 4`))).toBe(1);
    const none = preview(`${venue}&q=nepostojeci`);
    expect(cards(none)).toBe(0);
    expect(none).toContain(dict.noSearchProductsTitle);
  });

  test("a venue the list does not know says so and offers the way back", () => {
    const html = preview("?venue=nepoznat");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(dict.noVenueResultsTitle);
    expect(html).toContain(`>${dict.backToVenues}</button>`);
  });

  test("the sidebar swaps to the inventory filters: search plus type, design, service, status", () => {
    const html = sidebar(venue);
    expect(html.match(/type="search"/g)).toHaveLength(1);
    expect(html).toContain(dict.inventorySearchLabel);
    expect(toggles(html)).toBe(4);
    for (const label of [dict.filterType, dict.filterDesign, dict.filterService, dict.filterStatus]) expect(html).toContain(`>${label}</span>`);
    expect(html).not.toContain(dict.venueFilterLabel);
  });
});

describe("Proizvodi: the workspace sends the same query arguments as before", () => {
  const row = {
    businessId: "business-test", accountId: "account-test", ownerDisplayName: "TEST Klijent", smkCode: "SMK-TEST", venueName: "TEST Lokal", smlCode: "SML-TEST-01", city: null,
    productCount: 4, qrCount: 3, nfcCount: 2, problemCount: 0, serviceTypes: [], clientStatus: "active", isProductProjectionComplete: false,
  };
  const render = (search: string) => { nav.search = search; return renderToStaticMarkup(<AdminProductsWorkspace />); };
  const venueArgs = () => queries.calls.map((call) => call.args).filter((args) => (args as { sort?: string })?.sort === "urgency");
  const inventoryArgs = () => queries.calls.map((call) => call.args).filter((args) => (args as { sort?: string })?.sort === "smf");

  test("empty state: the venues by urgency, no inventory query", () => {
    render("");
    expect(venueArgs()[0]).toEqual({ filter: "all", sort: "urgency" });
    expect(inventoryArgs()).toHaveLength(0);
    expect(queries.calls.some((call) => call.args === "skip")).toBe(true);
  });

  test("lokali and the search become the venue arguments", () => {
    render("?q=kej&lokali=problem");
    expect(venueArgs()[0]).toEqual({ search: "kej", filter: "problem", sort: "urgency" });
  });

  test("a venue in the URL queries its inventory with the filters", () => {
    queries.venueRow = row;
    const html = render("?venue=business-test&tip=stickers&dizajn=custom&usluga=scanme_links&status=problem&q=007");
    expect(inventoryArgs()[0]).toEqual({
      accountId: "account-test", businessId: "business-test", search: "007", productType: "stickers", design: "custom", service: "scanme_links", state: "problem", sort: "smf", direction: "asc",
    });
    expect(html).toContain(">TEST Lokal</h1>");
  });

  test("a status without a finished product total shows no 'Nije dostupno' reason", () => {
    queries.venueRow = row;
    const html = render("");
    expect(html).toContain("TEST Lokal");
    expect(html).toContain(dict.stateActive);
    expect(html).not.toContain(dict.unknownValue);
    expect(html).toContain("QR 3 · NFC 2");
  });
});
