import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { eventNavGroups } from "@/lib/admin-v1/event-sections";
import type { MissionProgress } from "@/components/admin/admin-ui/use-mission-progress";
import { advanceLedger, markClearShown, missionBoard, type MissionBoard } from "@/lib/admin-v2/missions";
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

// ADMIN v2 X2 — what the lists outside Događaji need from the same component.
describe("the sidebar of the other pages", () => {
  const render = (page: SidebarConfig, data: SidebarLive = {}, state: SidebarState = {}) => renderToStaticMarkup(<AdminSidebarView config={page} live={data} state={state} onPatch={() => undefined} />);

  test("a context list is always open: the members with their counts, no accordion toggle", () => {
    const markup = render(
      { id: "test/tim", context: { id: "clan", label: "Član tima", list: true }, views: { key: "tab", label: "Prikaz", defaultValue: "pregled", items: [{ value: "pregled", label: "Pregled" }, { value: "zadaci", label: "Zadaci" }] } },
      { context: { value: "u2", options: [{ value: "u1", label: "TEST Član A", count: 6 }, { value: "u2", label: "TEST Član B", count: 2 }], onChange: () => undefined } },
    );
    expect(toggles(markup)).toHaveLength(0);
    expect(markup).toMatch(/role="radiogroup" aria-label="Član tima"/);
    expect(markup).toMatch(/>TEST Član A<\/span><span[^>]*>6<\/span>/);
    // The chosen member is the checked row; the view block follows it.
    expect(markup).toMatch(/<input type="radio"[^>]*checked=""[^>]*\/><span[^>]*>TEST Član B</);
    expect(markup.indexOf("Član tima")).toBeLessThan(markup.indexOf(">Prikaz<"));
  });

  test("a group that always has a value has no Sve and marks its default", () => {
    const page: SidebarConfig = { id: "test/finansije", groups: [{ id: "period", label: "Period", defaultValue: "mesec", options: [{ value: "mesec", label: "Ovaj mesec" }, { value: "godina", label: "Godina" }] }] };
    const markup = render(page);
    expect(markup).toContain('>Period</span><span class="text-[var(--admin-text-muted)]"> · Ovaj mesec</span>');
    expect(markup).not.toContain(`>${adminUiSr.filters.any}<`);
    expect(markup).toMatch(/<input type="radio"[^>]*checked=""[^>]*\/><span[^>]*>Ovaj mesec</);
    expect(markup).not.toContain(adminUiSr.filters.clearAll);
  });

  test("a default only the page knows acts like the configured one: no Sve, the default marked, no chip; a choice is a chip", () => {
    const page: SidebarConfig = { id: "test/posta", groups: [{ id: "nalog", label: "Sanduče" }] };
    const data: SidebarLive = { options: { nalog: [{ value: "a", label: "TEST sanduče A" }, { value: "b", label: "TEST sanduče B" }] }, defaults: { nalog: "a" } };
    const markup = render(page, data);
    expect(markup).toContain('>Sanduče</span><span class="text-[var(--admin-text-muted)]"> · TEST sanduče A</span>');
    expect(markup).not.toContain(`>${adminUiSr.filters.any}<`);
    expect(markup).toMatch(/<input type="radio"[^>]*checked=""[^>]*\/><span[^>]*>TEST sanduče A</);
    expect(markup).not.toContain(adminUiSr.filters.clearAll);
    // Without the page's default the same group offers "Sve" and has no summary.
    const plain = render(page, { options: data.options });
    expect(plain).toContain(`>${adminUiSr.filters.any}<`);
    expect(plain).not.toContain(" · TEST sanduče A");
    const chosen = render(page, data, { nalog: "b" });
    expect(chosen).toContain('>Sanduče</span><span class="text-[var(--admin-text-muted)]"> · TEST sanduče B</span>');
    expect(chosen).toContain("Sanduče: TEST sanduče B");
  });

  test("a search written on Enter says so and hints the phone keyboard; an ordinary search has neither", () => {
    const markup = render({ id: "test/enter", search: { key: "q", label: "TEST pretraga", submit: true } }, {}, { q: "ponuda" });
    expect(markup.match(/type="search"/g)).toHaveLength(1);
    expect(markup).toContain('value="ponuda"');
    expect(markup).toContain(adminUiSr.filters.searchOnEnter);
    expect(markup).toMatch(/enterkeyhint="search"/i);
    expect(markup).toMatch(/aria-describedby="[^"]+-hint"/);
    expect(html()).not.toContain(adminUiSr.filters.searchOnEnter);
    expect(html()).not.toMatch(/enterkeyhint/i);
    expect(html()).not.toContain("aria-describedby");
  });

  test("a group that waits for another choice says so instead of an empty list", () => {
    const page: SidebarConfig = { id: "test/zadaci", groups: [{ id: "lokal", label: "Lokal", emptyText: "Prvo izaberi klijenta." }] };
    expect(render(page)).toContain("Prvo izaberi klijenta.");
    expect(render(page, { options: { lokal: [{ value: "l1", label: "TEST Lokal" }] } })).not.toContain("Prvo izaberi klijenta.");
  });

  test("Misije danas: the open missions with their counts and links; all solved shows one calm line", () => {
    const page: SidebarConfig = { id: "test/dashboard", blocks: ["missions", "jumps"], jumps: [{ href: "/admin/zadaci?pogled=overdue", label: "Zadaci koji kasne" }] };
    const jumps = [{ href: "/admin/zadaci?pogled=overdue", label: "Zadaci koji kasne" }];
    const open = renderToStaticMarkup(
      <AdminSidebarView
        config={page}
        live={{ missions: [{ id: "hitno", label: "Hitne stavke", count: 3, tone: "hitno", href: "/admin" }, { id: "inbox", label: "Nepročitani razgovori", count: 0, tone: "info" }] }}
        state={{}}
        onPatch={() => undefined}
        jumps={jumps}
      />,
    );
    expect(open).toContain(adminUiSr.frame.missionsTitle);
    expect(open).toMatch(/Hitne stavke<\/span><span data-urgency="hitno"/);
    expect(open).toContain("Hitno: 3");
    // X4 — without a ledger (the first paint) nothing is solved yet: the ring is empty and names the progress in missions.
    expect(open).toContain('role="img" aria-label="Misije danas: 0 od 1 misije rešeno"');
    expect(open).toContain(">0 od 1 misije rešeno<");
    expect(open).not.toContain("data-mission-progress");
    expect(open).not.toContain("data-mission-confirm");
    // A mission with nothing to do is not listed.
    expect(open).not.toContain("Nepročitani razgovori");
    expect(open.indexOf(adminUiSr.frame.missionsTitle)).toBeLessThan(open.indexOf(adminUiSr.frame.jumpsTitle));
    expect(open).toContain('href="/admin/zadaci?pogled=overdue"');

    const clear = render(page, { missions: [{ id: "hitno", label: "Hitne stavke", count: 0, tone: "hitno" }] });
    expect(clear).toContain(adminUiSr.frame.missionsClear);
    expect(clear).toContain('data-mission-clear="empty"');
    expect(clear).not.toContain(adminUiSr.missions.clearTitle);
    // Until the page publishes its data there is no missions block (no invented zero).
    expect(render(page)).not.toContain(adminUiSr.frame.missionsTitle);
  });

  test("Misije danas with the progress of the day: the ring, „1 od 3 misije rešeno“, a row's own progress and „Sve čisto“ once", () => {
    const page: SidebarConfig = { id: "test/dashboard", blocks: ["missions"] };
    const DAY = "2026-10-12";
    const mission = (id: string, label: string, count: number, tone: "hitno" | "uskoro" | "info") => ({ id, label, count, tone });
    const start = [mission("hitno", "Hitne stavke", 3, "hitno"), mission("kasne", "Zadaci koji kasne", 1, "hitno"), mission("danas", "Stavke za danas", 2, "uskoro"), mission("inbox", "Nepročitani razgovori", 4, "info")];
    // Two urgent items and both items for today were solved; one overdue task still waits untouched.
    const missions = [mission("hitno", "Hitne stavke", 1, "hitno"), start[1], mission("danas", "Stavke za danas", 0, "uskoro"), start[3]];
    const ledger = advanceLedger(advanceLedger(null, start, DAY).ledger, missions, DAY).ledger;
    const view = (list: typeof missions, board: MissionBoard, confirm: MissionProgress["confirm"] = null) =>
      renderToStaticMarkup(<AdminSidebarView config={page} live={{ missions: list }} state={{}} onPatch={() => undefined} missions={{ board, confirm }} />);

    const open = view(missions, missionBoard(missions, ledger));
    // One of the three missions is solved; the info line is not a mission.
    expect(open).toContain('aria-label="Misije danas: 1 od 3 misije rešeno"');
    expect(open).toContain(">1 od 3 misije rešeno<");
    // Inside a mission the solved items stand beside its row, once there are some (said in words to a screen reader).
    expect(open).toMatch(/data-mission="hitno".*?Hitne stavke<\/span><span data-mission-progress=""[^>]*><span aria-hidden="true">2 od 3<\/span><span class="sr-only">rešeno stavki: 2 od 3<\/span><\/span><span data-urgency="hitno"/);
    expect(open).toMatch(/data-mission="kasne"(?:(?!data-mission-progress).)*Hitno: 1/);
    expect(open).toMatch(/data-mission="inbox"(?:(?!data-mission-progress).)*Info: 4/);
    // The solved mission is no longer listed; the rest are in the order hitno, uskoro, info.
    expect(open).not.toContain('data-mission="danas"');
    expect(open.indexOf('data-mission="hitno"')).toBeLessThan(open.indexOf('data-mission="kasne"'));
    expect(open.indexOf('data-mission="kasne"')).toBeLessThan(open.indexOf('data-mission="inbox"'));

    // A mission with nothing left is confirmed as solved, in the progress line, and announced.
    const confirmed = view(missions, missionBoard(missions, ledger), { seq: 1, items: [{ label: "Stavke za danas", done: 2, total: 2, complete: true }] });
    expect(confirmed).toContain("data-mission-confirm");
    expect(confirmed).toContain('<span role="status" class="sr-only">Rešeno: Stavke za danas</span>');
    // A mission that only lost an item says how far it is, never that it is solved.
    const part = view(missions, missionBoard(missions, ledger), { seq: 2, items: [{ label: "Hitne stavke", done: 2, total: 3, complete: false }] });
    expect(part).toContain('<span role="status" class="sr-only">Rešeno 2 od 3 · Hitne stavke</span>');
    expect(part).not.toContain("Rešeno: Hitne stavke");

    // A number the read could only give as "at least" says so, also to a screen reader.
    const capped = missions.map((item) => (item.id === "kasne" ? { ...item, count: 4, capped: true } : item));
    const more = view(capped, missionBoard(capped, ledger));
    expect(more).toMatch(/data-mission="kasne".*?<span aria-hidden="true">4\+<\/span><span class="sr-only">Hitno: 4\+<\/span>/);

    const none = start.map((item) => ({ ...item, count: item.tone === "info" ? 4 : 0 }));
    const solved = advanceLedger(ledger, none, DAY).ledger;
    const celebrate = view(none, missionBoard(none, solved));
    expect(celebrate).toContain('data-mission-clear="celebrate"');
    expect(celebrate).toContain(adminUiSr.missions.clearTitle);
    expect(celebrate).toContain("3 od 3 misije rešeno");
    expect(celebrate).toContain(adminUiSr.missions.clearBody);
    // The info line is still listed above it.
    expect(celebrate).toContain('data-mission="inbox"');
    // While the numbers are being replaced (the Dashboard scope was switched and the new ones are on their way)
    // only the rows are shown: no progress and no all-clear is claimed from numbers of another scope.
    const pending = renderToStaticMarkup(<AdminSidebarView config={page} live={{ missions }} state={{}} onPatch={() => undefined} missions={{ board: missionBoard(missions, null), confirm: null, pending: true }} />);
    expect(pending).toContain('data-mission="hitno"');
    expect(pending).not.toContain("data-mission-summary");
    expect(pending).not.toContain("data-mission-clear");
    const pendingNone = renderToStaticMarkup(<AdminSidebarView config={page} live={{ missions: none }} state={{}} onPatch={() => undefined} missions={{ board: missionBoard(none, null), confirm: null, pending: true }} />);
    expect(pendingNone).not.toContain("data-mission-clear");
    expect(pendingNone).not.toContain(adminUiSr.frame.missionsClear);

    const later = view(none, missionBoard(none, markClearShown(solved)));
    expect(later).toContain('data-mission-clear="quiet"');
    expect(later).toContain(adminUiSr.missions.clearQuiet);
    expect(later).not.toContain(adminUiSr.missions.clearTitle);
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
