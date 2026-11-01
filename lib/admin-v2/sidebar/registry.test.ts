import { describe, expect, test } from "vitest";
import { EVENT_SECTION_PATHS } from "@/lib/admin-v1/event-sections";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-v1/navigation";
import { ADMIN_FRAME_PREVIEW_BASE, adminRoute, isFramedAdminPath, previewHref, routeHref } from "@/lib/admin-v2/frame/routes";
import { taskMissions } from "@/lib/admin-v2/lists/dashboard-missions";
import { readUrlState, sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { groupControlKind, hasSidebarFilters } from "./accordion";
import { CLIENTS_URL_FIELDS } from "./configs/clients";
import { FINANCE_URL_FIELDS } from "./configs/finance";
import { ORDERS_URL_FIELDS, PRODUCTS_URL_FIELDS } from "./configs/operations";
import { SEARCH_URL_FIELDS } from "./configs/search";
import { TASKS_URL_FIELDS } from "./configs/tasks";
import { DEFAULT_SIDEBAR, resolveAdminSidebar, resolveSidebar } from "./registry";

// ADMIN v2 — the sidebar registry by route and the routes of the frame.

const EVENT = "/admin/dogadjaji/test-sajam";

describe("which admin paths get the frame", () => {
  test("the sign-in screen and the Links editor stay without it", () => {
    expect(isFramedAdminPath("/admin/login")).toBe(false);
    expect(isFramedAdminPath("/admin/login/")).toBe(false);
    expect(isFramedAdminPath("/admin/scanme-links/b1/editor")).toBe(false);
  });

  test("every page of the navigation and the older screens are framed", () => {
    const hrefs = ADMIN_NAV_ITEMS.flatMap((item) => [item.href, ...(item.children?.map((child) => child.href) ?? [])]);
    for (const href of [...hrefs, "/admin/pretraga", "/admin/podesavanja", "/admin/posta", "/admin/debug/c1", "/admin/klijenti/a1", "/admin/memories", "/admin/venue", "/admin/customers/b1", `${EVENT}/modeli`]) {
      expect(isFramedAdminPath(href), href).toBe(true);
    }
  });
});

describe("a path as the frame understands it", () => {
  test("an event page: the link base and the segments below it", () => {
    expect(adminRoute(`${EVENT}/leadovi/follow-up`)).toEqual({ key: `${EVENT}/leadovi/follow-up`, events: { base: EVENT, segments: ["leadovi", "follow-up"] }, previewBase: null });
    expect(adminRoute("/admin/dogadjaji")).toEqual({ key: "/admin/dogadjaji", events: null, previewBase: null });
  });

  test("a dev preview stands for its admin route", () => {
    expect(adminRoute("/dev/admin-clients-preview").key).toBe("/admin/klijenti");
    expect(adminRoute("/dev/admin-orders-preview").key).toBe("/admin/operativa/porudzbine");
    expect(adminRoute("/dev/admin-events-preview/modeli/m1").events).toEqual({ base: "/dev/admin-events-preview", segments: ["modeli", "m1"] });
  });

  test("a preview that shows several admin pages picks one by its parameter", () => {
    expect(adminRoute("/dev/admin-services-preview").key).toBe("/admin/usluge/links");
    expect(adminRoute("/dev/admin-services-preview", new URLSearchParams("service=meni")).key).toBe("/admin/usluge/meni");
    expect(adminRoute("/dev/admin-services-preview", new URLSearchParams("service=nepoznato")).key).toBe("/admin/usluge/links");
    expect(adminRoute("/dev/admin-18-preview").key).toBe("/admin/pretraga");
    expect(adminRoute("/dev/admin-18-preview", new URLSearchParams("mode=debug")).key).toBe("/admin/debug/preview");
  });

  test("an admin link stays inside the previews: unchanged in the admin, re-based in the persistent preview, mapped in a single one", () => {
    const admin = adminRoute("/admin/zadaci");
    const single = adminRoute("/dev/admin-tasks-preview");
    const persistent = adminRoute(`${ADMIN_FRAME_PREVIEW_BASE}/zadaci`);
    expect(routeHref("/admin/operativa/qr?status=problem", admin)).toBe("/admin/operativa/qr?status=problem");
    expect(routeHref("/admin/operativa/qr?status=problem", null)).toBe("/admin/operativa/qr?status=problem");
    expect(routeHref("/admin/operativa/qr?status=problem", persistent)).toBe(`${ADMIN_FRAME_PREVIEW_BASE}/operativa/qr?status=problem`);
    expect(routeHref("/admin/operativa/qr?status=problem", single)).toBe("/dev/admin-qr-preview?status=problem");
    expect(routeHref("/admin/usluge/review", single)).toBe("/dev/admin-services-preview?service=review");
    expect(routeHref("/admin/usluge/review?pogled=grace", single)).toBe("/dev/admin-services-preview?service=review&pogled=grace");
    expect(routeHref("/admin", single)).toBe("/dev/admin-dashboard-preview");
    // A page without a preview keeps its admin path.
    expect(routeHref("/admin/memories", single)).toBe("/admin/memories");
  });

  test("the persistent frame preview keeps its own base in every admin link", () => {
    const route = adminRoute(`${ADMIN_FRAME_PREVIEW_BASE}/zadaci`);
    expect(route).toEqual({ key: "/admin/zadaci", events: null, previewBase: ADMIN_FRAME_PREVIEW_BASE });
    expect(adminRoute(ADMIN_FRAME_PREVIEW_BASE).key).toBe("/admin");
    expect(adminRoute(`${ADMIN_FRAME_PREVIEW_BASE}/dogadjaji/qr`).events).toEqual({ base: `${ADMIN_FRAME_PREVIEW_BASE}/dogadjaji`, segments: ["qr"] });
    expect(previewHref("/admin/klijenti", ADMIN_FRAME_PREVIEW_BASE)).toBe(`${ADMIN_FRAME_PREVIEW_BASE}/klijenti`);
    expect(previewHref("/admin", ADMIN_FRAME_PREVIEW_BASE)).toBe(ADMIN_FRAME_PREVIEW_BASE);
    expect(previewHref("/admin/klijenti", null)).toBe("/admin/klijenti");
    expect(previewHref("/sajam/x", ADMIN_FRAME_PREVIEW_BASE)).toBe("/sajam/x");
  });
});

describe("the registry: route → sidebar", () => {
  test("a route without its own configuration shows the default sidebar (quick jumps)", () => {
    for (const path of ["/admin/memories", "/admin/venue", "/admin/debug/c1", "/admin/customers/b1"]) {
      expect(resolveAdminSidebar(path), path).toBe(DEFAULT_SIDEBAR);
    }
    expect(resolveAdminSidebar("/dev/admin-18-preview", "?mode=debug")).toBe(DEFAULT_SIDEBAR);
    expect(DEFAULT_SIDEBAR.blocks).toEqual(["jumps"]);
  });

  test("every page of the navigation, Pretraga and Podešavanja has its own sidebar", () => {
    const hrefs = ADMIN_NAV_ITEMS.flatMap((item) => (item.children ? item.children.map((child) => child.href) : [item.href])).filter((href) => href !== "/admin/dogadjaji");
    const ids = [...hrefs, "/admin/pretraga", "/admin/podesavanja"].map((href) => {
      const config = resolveAdminSidebar(href);
      expect(config, href).not.toBe(DEFAULT_SIDEBAR);
      return config.id;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every Događaji section has the event as context and the section navigation with the open page marked", () => {
    for (const path of EVENT_SECTION_PATHS) {
      const config = resolveAdminSidebar(`${EVENT}/${path}`);
      expect(config.id, path).toBe(`dogadjaji/${path}`);
      expect(config.context).toEqual({ id: "dogadjaj", label: adminEventsSr.eventLabel });
      const links = config.nav!.flatMap((group) => group.items.flatMap((item) => item.children ?? [item]));
      // „Poveži nalepnicu“ is a route without a navigation item (the page header opens it).
      expect(links.filter((item) => item.active).map((item) => item.id)).toEqual(path === "povezi" ? [] : [path]);
      for (const link of links) expect(link.href.startsWith(`${EVENT}/`)).toBe(true);
    }
  });

  test("Modeli: one search and the filter groups in the order of the page; the model is a chip only", () => {
    const config = resolveAdminSidebar(`${EVENT}/modeli`);
    expect(config.search?.key).toBe("q");
    expect(config.groups?.map((group) => group.id)).toEqual(["izlagac", "brend", "model", "paket", "status", "problemi", "qr", "foto"]);
    expect(config.groups?.find((group) => group.id === "model")?.chipOnly).toBe(true);
    expect(sidebarUrlFields(config).map((field) => field.key)).toEqual(["q", "izlagac", "brend", "model", "paket", "status", "problemi", "qr", "foto"]);
    // Every static group of the events is short enough for a radio list.
    for (const group of config.groups ?? []) if (group.options) expect(groupControlKind(group.options.length), group.id).toBe("radio");
  });

  test("the other lists: QR, Izlagači, Interakcije (views), Leadovi (a custom period), Izveštaji", () => {
    expect(resolveAdminSidebar(`${EVENT}/qr`).groups?.map((group) => group.id)).toEqual(["izlagac", "brend", "model", "stanje"]);
    expect(resolveAdminSidebar(`${EVENT}/izlagaci`).groups?.map((group) => group.id)).toEqual(["segment"]);
    const interactions = resolveAdminSidebar(`${EVENT}/interakcije`);
    expect(interactions.views).toMatchObject({ key: "paket", defaultValue: "interakcije" });
    expect(interactions.views?.items.map((item) => item.value)).toEqual(["interakcije", "svi", "napredni", "starter", "za-sve"]);
    const leads = resolveAdminSidebar(`${EVENT}/leadovi`);
    expect(leads.search).toBeUndefined();
    expect(leads.groups?.find((group) => group.id === "period")).toMatchObject({ kind: "custom", keys: ["od", "do"] });
    expect(resolveAdminSidebar(`${EVENT}/izvestaji`).groups?.map((group) => group.id)).toEqual(["dan", "izlagac", "status"]);
  });

  test("a detail page has the navigation but no list filters; the exhibitor's Interakcije page has its own", () => {
    const model = resolveAdminSidebar(`${EVENT}/modeli/m1`);
    expect(model.id).toBe("dogadjaji/modeli/detalj");
    expect(model.groups).toBeUndefined();
    expect(model.search).toBeUndefined();
    expect(resolveAdminSidebar(`${EVENT}/interakcije/p1`).groups?.map((group) => group.id)).toEqual(["status", "stanje", "brend"]);
  });

  test("sections without filters have only the navigation", () => {
    for (const path of ["pregled", "povezi", "import", "sponzorisano", "analitika", "leadovi/follow-up", "leadovi/podesavanja", "brisanje"]) {
      const config = resolveAdminSidebar(`${EVENT}/${path}`);
      expect(config.groups, path).toBeUndefined();
      expect(config.views, path).toBeUndefined();
      expect(config.search, path).toBeUndefined();
    }
  });

  test("the dev previews resolve to the same configuration with their own link base", () => {
    const preview = resolveAdminSidebar("/dev/admin-events-preview/modeli");
    expect(preview.id).toBe("dogadjaji/modeli");
    expect(preview.nav![0].items[0].href).toBe("/dev/admin-events-preview/pregled");
    expect(resolveAdminSidebar(`${ADMIN_FRAME_PREVIEW_BASE}/dogadjaji/qr`).nav![0].items[0].href).toBe(`${ADMIN_FRAME_PREVIEW_BASE}/dogadjaji/pregled`);
    expect(resolveAdminSidebar("/dev/admin-clients-preview")).toBe(resolveAdminSidebar("/admin/klijenti"));
  });

  test("Klijenti, Inbox, Zadaci: search, groups and their URL keys", () => {
    const clients = resolveAdminSidebar("/admin/klijenti");
    expect(sidebarUrlFields(clients).map((field) => field.key)).toEqual(["q", "status", "sort"]);
    expect(clients.sort).toMatchObject({ key: "sort", defaultValue: "urgency" });
    expect(sidebarUrlFields(resolveAdminSidebar("/admin/inbox")).map((field) => field.key)).toEqual(["q", "status", "kanal", "assignee"]);
    const tasks = resolveAdminSidebar("/admin/zadaci");
    expect(tasks.views).toMatchObject({ key: "pogled", defaultValue: "all" });
    expect(tasks.views?.items.map((item) => item.value)).toEqual(["all", "today", "overdue", "deferred", "completed"]);
    expect(tasks.groups?.map((group) => group.id)).toEqual(["assignee", "klijent", "lokal", "objekat"]);
    // 11 linked objects: more than 7, so a search-select.
    expect(groupControlKind(tasks.groups!.find((group) => group.id === "objekat")!.options!.length)).toBe("search");
    expect(tasks.groups!.find((group) => group.id === "lokal")?.emptyText).toBeTruthy();
  });

  test("Operativa: the three pages share the area navigation with the open one marked", () => {
    for (const [path, id] of [["proizvodi", "products"], ["qr", "qr"], ["porudzbine", "orders"]] as const) {
      const config = resolveAdminSidebar(`/admin/operativa/${path}`);
      expect(config.id.startsWith("operativa/"), path).toBe(true);
      const items = config.nav![0].items;
      expect(items.map((item) => item.href)).toEqual(["/admin/operativa/proizvodi", "/admin/operativa/qr", "/admin/operativa/porudzbine"]);
      expect(items.filter((item) => item.active).map((item) => item.id)).toEqual([id]);
    }
    const orders = resolveAdminSidebar("/admin/operativa/porudzbine");
    expect(orders.views).toMatchObject({ key: "pogled", defaultValue: "active" });
    expect(orders.groups?.map((group) => group.id)).toEqual(["assignee", "uplata", "dizajn", "izvrsenje", "problem"]);
    expect(groupControlKind(orders.groups!.find((group) => group.id === "izvrsenje")!.options!.length)).toBe("search");
    expect(orders.sort).toMatchObject({ key: "sort", defaultValue: "updated_desc" });
    expect(resolveAdminSidebar("/admin/operativa/qr").groups?.map((group) => group.id)).toEqual(["veza", "vrsta", "status"]);
  });

  test("Proizvodi has two states on one route: the venue list and, with a venue, its inventory", () => {
    const venues = resolveAdminSidebar("/admin/operativa/proizvodi");
    const inventory = resolveAdminSidebar("/admin/operativa/proizvodi", "?venue=b1");
    expect(venues.id).toBe("operativa/proizvodi");
    expect(venues.groups?.map((group) => group.id)).toEqual(["lokali"]);
    expect(inventory.id).toBe("operativa/proizvodi/lokal");
    expect(inventory.groups?.map((group) => group.id)).toEqual(["tip", "dizajn", "usluga", "status"]);
    // The page reads both states and the venue with one schema.
    expect(readUrlState(PRODUCTS_URL_FIELDS, "?venue=b1&q=sto&tip=stickers&status=problem&lokali=active")).toEqual({ venue: "b1", q: "sto", tip: "stickers", status: "problem", lokali: "active" });
  });

  test("Usluge: one sidebar for the three pages, the open service marked; the dev preview links stay in the preview", () => {
    for (const service of ["links", "review", "meni"]) {
      const config = resolveAdminSidebar(`/admin/usluge/${service}`);
      expect(config.id).toBe(`usluge/${service}`);
      expect(config.views?.items.map((item) => item.value)).toEqual(["all", "active", "grace", "suspended", "problem"]);
      expect(config.nav![0].items.filter((item) => item.active).map((item) => item.href)).toEqual([`/admin/usluge/${service}`]);
    }
    const preview = resolveAdminSidebar("/dev/admin-services-preview", "?service=review");
    expect(preview.id).toBe("usluge/review");
    expect(preview.nav![0].items.map((item) => item.href)).toEqual(["/dev/admin-services-preview", "/dev/admin-services-preview?service=review", "/dev/admin-services-preview?service=meni"]);
    // The frame of a preview names the page it shows (it does not read the query string).
    expect(resolveSidebar({ ...adminRoute("/dev/admin-services-preview"), key: "/admin/usluge/meni" }, new URLSearchParams()).id).toBe("usluge/meni");
  });

  test("Finansije: the period and the category follow the view and always have a value", () => {
    const collected = resolveAdminSidebar("/admin/finansije");
    const expected = resolveAdminSidebar("/admin/finansije", "?tab=expected");
    const profit = resolveAdminSidebar("/admin/finansije", "?tab=profit");
    expect([collected.id, expected.id, profit.id]).toEqual(["finansije/collected", "finansije/expected", "finansije/profit"]);
    expect(collected.groups?.map((group) => group.id)).toEqual(["period", "filter"]);
    expect(expected.groups?.map((group) => group.id)).toEqual(["future", "filter"]);
    expect(profit.groups?.map((group) => group.id)).toEqual(["period", "profit"]);
    for (const group of [...collected.groups!, ...expected.groups!, ...profit.groups!]) expect(group.defaultValue, group.id).toBeTruthy();
    // The parameters the page already had keep their names and values; a default is not kept.
    expect(readUrlState(FINANCE_URL_FIELDS, "?tab=profit&period=year&profit=saas&account=a1")).toEqual({ tab: "profit", period: "year", profit: "saas" });
    expect(readUrlState(FINANCE_URL_FIELDS, "?tab=collected&period=month&filter=total")).toEqual({});
  });

  test("Pretraga: the groups follow the view; the search field stays the page's own key", () => {
    const results = resolveAdminSidebar("/admin/pretraga");
    const activity = resolveAdminSidebar("/admin/pretraga", "?view=activity");
    expect(results.search).toBeUndefined();
    expect(results.groups?.map((group) => group.id)).toEqual(["group", "opseg"]);
    expect(results.groups![0].defaultValue).toBe("clients");
    expect(activity.groups?.map((group) => group.id)).toEqual(["kategorija", "akter", "opseg"]);
    expect(groupControlKind(activity.groups![0].options!.length)).toBe("search");
    expect(readUrlState(SEARCH_URL_FIELDS, "?q=bistro%20most&group=venues&klijent=a1&opseg=TEST%20Klijent")).toEqual({ q: "bistro most", group: "venues", klijent: "a1", opseg: "TEST Klijent" });
  });

  test("Dashboard, profil klijenta, Tim, Podešavanja: views or sections, no list filters", () => {
    const dashboard = resolveAdminSidebar("/admin");
    expect(dashboard.views).toMatchObject({ key: "obim", defaultValue: "all" });
    expect(dashboard.blocks).toEqual(["missions", "jumps"]);
    expect(dashboard.jumps?.length).toBeGreaterThan(3);
    for (const jump of dashboard.jumps ?? []) expect(jump.href.startsWith("/admin/"), jump.href).toBe(true);

    const profile = resolveAdminSidebar("/admin/klijenti/a1");
    expect(profile.id).toBe("klijenti/profil");
    expect(profile.views).toMatchObject({ key: "section", defaultValue: "overview" });
    expect(profile.nav![0].items[0]).toMatchObject({ href: "/admin/klijenti", active: false });
    expect(resolveSidebar({ ...adminRoute("/dev/admin-client-profile-preview"), key: "/admin/klijenti/preview" }, new URLSearchParams()).nav![0].items[0].href).toBe("/dev/admin-clients-preview");

    const team = resolveAdminSidebar("/admin/tim");
    expect(team.context).toEqual({ id: "clan", label: expect.any(String), list: true });
    expect(team.views).toMatchObject({ key: "tab", defaultValue: "overview" });

    const settings = resolveAdminSidebar("/admin/podesavanja");
    expect(settings.views?.items.map((item) => item.value)).toEqual(["general", "subscriptions", "payments", "communication", "pricing", "referral"]);
    for (const config of [dashboard, profile, team, settings]) {
      expect(config.groups, config.id).toBeUndefined();
      expect(config.search, config.id).toBeUndefined();
      expect(hasSidebarFilters(config), config.id).toBe(true);
    }
  });

  test("the jumps of the Dashboard open lists with a filter those lists accept", () => {
    const state = (fields: Parameters<typeof readUrlState>[0], href: string) => readUrlState(fields, href.split("?")[1] ?? "");
    const jumps = resolveAdminSidebar("/admin").jumps!.map((jump) => jump.href);
    // X6 (RX N1) — the overdue and today tasks are missions of the block above the jumps, with the same
    // links; they are no longer repeated as jumps.
    expect(jumps.some((href) => href.startsWith("/admin/zadaci"))).toBe(false);
    expect(taskMissions({ overdue: { items: [] }, today: { items: [] } }).map((mission) => mission.href)).toEqual(["/admin/zadaci?pogled=overdue", "/admin/zadaci?pogled=today"]);
    expect(jumps).toContain("/admin/inbox?status=needs_reply");
    expect(state(TASKS_URL_FIELDS, "/admin/zadaci?pogled=overdue")).toEqual({ pogled: "overdue" });
    expect(state(TASKS_URL_FIELDS, "/admin/zadaci?pogled=today")).toEqual({ pogled: "today" });
    expect(state(sidebarUrlFields(resolveAdminSidebar("/admin/inbox")), "/admin/inbox?status=needs_reply")).toEqual({ status: "needs_reply" });
    expect(state(ORDERS_URL_FIELDS, "/admin/operativa/porudzbine?problem=da")).toEqual({ problem: "da" });
    expect(state(sidebarUrlFields(resolveAdminSidebar("/admin/operativa/qr")), "/admin/operativa/qr?status=problem")).toEqual({ status: "problem" });
    expect(state(PRODUCTS_URL_FIELDS, "/admin/operativa/proizvodi?lokali=problem")).toEqual({ lokali: "problem" });
    expect(state(CLIENTS_URL_FIELDS, "/admin/klijenti?status=archived&sort=name")).toEqual({ status: "archived", sort: "name" });
  });

  test("an unknown event path keeps the navigation (the page shows its own not-found state)", () => {
    const config = resolveAdminSidebar(`${EVENT}/nepostoji`);
    expect(config.id).toBe("dogadjaji/nepoznato");
    expect(config.nav?.length).toBeGreaterThan(0);
  });
});
