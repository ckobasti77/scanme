import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { eventNavGroups } from "@/lib/admin-v1/event-sections";
import type { SidebarConfig, SidebarLive, SidebarState } from "@/lib/admin-v2/sidebar/types";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { AdminPageHeader } from "./admin-page-header";
import { AdminSidebarView } from "./admin-sidebar-view";

// ADMIN v2 — the markup of the contextual sidebar (ZADATAK §3) and the
// contract the chain checks on it: every filter group has a toggle with
// `data-admin-filter-toggle`, `aria-expanded` and `aria-controls`; up to 7
// options are a radio list in `role="radiogroup"`, more a search-select.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => <a href={href} {...rest}>{children}</a>,
}));

const many = Array.from({ length: 8 }, (_, index) => ({ value: `k${index + 1}`, label: `TEST Klijent ${index + 1}` }));

const config: SidebarConfig = {
  id: "test/lista",
  context: { id: "dogadjaj", label: "Događaj" },
  nav: [{ id: "glavno", items: [{ id: "a", href: "/admin/test/a", label: "TEST A", active: true }, { id: "b", href: "/admin/test/b", label: "TEST B", active: false, urgency: { tone: "hitno", count: 3 } }] }],
  navLabel: "TEST navigacija",
  views: { key: "pogled", label: "Pogledi", defaultValue: "sve", items: [{ value: "sve", label: "Sve" }, { value: "danas", label: "Danas" }] },
  search: { key: "q", label: "Pretraga liste", placeholder: "TEST naziv" },
  groups: [
    { id: "status", label: "Status", options: [{ value: "aktivan", label: "Aktivni" }, { value: "arhiviran", label: "Arhivirani" }] },
    { id: "klijent", label: "Klijent" },
    { id: "model", label: "Model", chipOnly: true },
  ],
  sort: { key: "sort", label: "Sortiranje", defaultValue: "hitnost", options: [{ value: "hitnost", label: "Hitnost" }, { value: "naziv", label: "Naziv" }] },
};

const live: SidebarLive = {
  context: { value: "e1", options: [{ value: "e1", label: "TEST Sajam" }, { value: "e2", label: "TEST AMF" }], onChange: () => undefined },
  viewCounts: { sve: 12, danas: 4 },
  options: { status: [{ value: "aktivan", label: "Aktivni", count: 9 }, { value: "arhiviran", label: "Arhivirani", count: 3 }], klijent: many },
};

const html = (state: SidebarState = {}, data: SidebarLive = live) => renderToStaticMarkup(<AdminSidebarView config={config} live={data} state={state} onPatch={() => undefined} />);
const toggles = (markup: string) => markup.match(/<button[^>]*data-admin-filter-toggle=""[^>]*>/g) ?? [];

describe("the contextual sidebar", () => {
  test("blocks in the order of ZADATAK §3: context, navigation, views, search, filter groups, sort", () => {
    const markup = html();
    const order = ["Događaj", "TEST navigacija", ">Pogledi<", "Pretraga liste", `>${adminUiSr.filters.groups}<`, ">Sortiranje<"].map((text) => markup.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("every group has a toggle with data-admin-filter-toggle, aria-expanded and aria-controls of its body", () => {
    const markup = html();
    // The context and two groups with a control; the chip-only filter has none.
    expect(toggles(markup)).toHaveLength(3);
    for (const toggle of toggles(markup)) {
      expect(toggle).toContain('aria-expanded="false"');
      const controls = /aria-controls="([^"]+)"/.exec(toggle)?.[1];
      expect(controls).toBeTruthy();
      expect(markup).toContain(`id="${controls}"`);
    }
    // Closed groups are out of the tab order and of the accessibility tree.
    expect(markup.match(/class="admin-acc-body"[^>]*inert=""/g)).toHaveLength(3);
  });

  test("up to 7 options: a radio list with counts; more than 7: a search-select", () => {
    const markup = html();
    expect(markup).toMatch(/role="radiogroup"[^>]*>[\s\S]*?>Aktivni<\/span><span[^>]*>9<\/span>/);
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain(`aria-label="${adminUiSr.filters.searchIn.replace("{group}", "Klijent")}"`);
    // The long list is rendered only while its group is open.
    expect(markup).not.toContain("TEST Klijent 1");
    // Exactly 7 options stay a radio list.
    const seven = html({}, { ...live, options: { ...live.options, klijent: many.slice(0, 7) } });
    expect(seven).not.toContain('role="combobox"');
    expect(seven).toContain("TEST Klijent 7");
  });

  test("the header of a group names the choice; views show their counts; the open page is aria-current", () => {
    const markup = html({ status: "aktivan", pogled: "danas" });
    expect(markup).toContain('>Status</span><span class="text-[var(--admin-text-muted)]"> · Aktivni</span>');
    expect(markup).toContain('>Događaj</span><span class="text-[var(--admin-text-muted)]"> · TEST Sajam</span>');
    expect(markup).toMatch(/>Danas<\/span><span[^>]*>4<\/span>/);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toContain('data-urgency="hitno"');
  });

  test("active filters are chips with a remove button and Očisti sve; without filters neither is shown", () => {
    expect(html()).not.toContain(adminUiSr.filters.clearAll);
    const markup = html({ q: "bistro", status: "arhiviran", model: "m1" }, { ...live, options: { ...live.options, model: [{ value: "m1", label: "TEST Model" }] } });
    for (const label of ["Pretraga liste: bistro", "Status: Arhivirani", "Model: TEST Model"]) {
      expect(markup).toContain(`aria-label="${adminUiSr.filters.removeChip.replace("{label}", label)}"`);
    }
    expect(markup).toContain(`>${adminUiSr.filters.clearAll}</button>`);
  });

  test("the search field is one, labelled, and is the target of the page-search shortcut", () => {
    const markup = html({ q: "bistro" });
    expect(markup.match(/type="search"/g)).toHaveLength(1);
    expect(markup).toContain('data-admin-sidebar-search=""');
    expect(markup).toContain('value="bistro"');
    expect(markup).toContain('placeholder="TEST naziv"');
  });

  test("the default sidebar shows the quick jumps it is given", () => {
    const markup = renderToStaticMarkup(<AdminSidebarView config={{ id: "podrazumevano", blocks: ["jumps"] }} state={{}} onPatch={() => undefined} jumps={[{ href: "/admin/zadaci", label: "Zadaci" }]} />);
    expect(markup).toContain(adminUiSr.frame.jumpsTitle);
    expect(markup).toContain('href="/admin/zadaci"');
    expect(toggles(markup)).toHaveLength(0);
  });

  test("the phone drawer uses the same component with 44 px rows", () => {
    const markup = renderToStaticMarkup(<AdminSidebarView config={config} live={live} state={{}} onPatch={() => undefined} large />);
    expect(markup).toContain("min-h-11");
    expect(markup).not.toContain("min-h-9");
    expect(markup).not.toContain("min-h-8");
  });
});

// These checks were on AdminSubnav (Admin UX A2), which the sidebar replaced.
describe("the navigation of an area", () => {
  const nav = (groups: SidebarConfig["nav"]) => renderToStaticMarkup(<AdminSidebarView config={{ id: "test/nav", nav: groups, navLabel: "TEST sekcije" }} state={{}} onPatch={() => undefined} />);
  const count = (markup: string, needle: string) => markup.split(needle).length - 1;

  test("the open page is the only link with aria-current; its parent is a label with its sub-pages under it", () => {
    const markup = nav(eventNavGroups((path) => `/x/${path}`, "leadovi/follow-up"));
    expect(count(markup, '<nav data-sidebar-block="nav" aria-label="TEST sekcije"')).toBe(1);
    expect(count(markup, 'aria-current="page"')).toBe(1);
    expect(markup).toMatch(/<a[^>]*href="\/x\/leadovi\/follow-up"[^>]*aria-current="page"/);
    expect(markup).not.toMatch(/<a[^>]*href="\/x\/pregled"[^>]*aria-current/);
    expect(markup).toContain(`<ul aria-label="${adminEventsSr.navLeads}"`);
    for (const group of Object.values(adminEventsSr.navGroups)) expect(markup).toContain(group);
  });

  test("count and urgency slots render with screen reader text", () => {
    const markup = nav([{ id: "g", items: [{ id: "a", href: "/a", label: "TEST A", active: false, count: 7, urgency: { tone: "hitno", count: 2 } }] }]);
    expect(markup).toContain('data-urgency="hitno"');
    expect(markup).toContain("Hitno: 2");
    expect(markup).toContain(adminUiSr.navCount.replace("{count}", "7"));
  });
});

describe("the page header", () => {
  test("one H1 on a fixed rem scale, the actions beside it; outside the frame there is no Filteri button", () => {
    const markup = renderToStaticMarkup(<AdminPageHeader eyebrow="TEST oblast" title="TEST naslov" description="TEST opis" actions={<button type="button">TEST akcija</button>} />);
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain(">TEST naslov</h1>");
    expect(markup).not.toContain("clamp(");
    expect(markup).toContain("TEST oblast");
    expect(markup).toContain("TEST akcija");
    expect(markup).not.toContain("data-admin-filters-open");
  });
});
