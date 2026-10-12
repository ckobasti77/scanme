import { describe, expect, test } from "vitest";
import { EVENT_SECTION_PATHS } from "@/lib/admin-v1/event-sections";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-v1/navigation";
import { ADMIN_FRAME_PREVIEW_BASE, adminRoute, isFramedAdminPath, previewHref } from "@/lib/admin-v2/frame/routes";
import { sidebarUrlFields } from "@/lib/admin-v2/query/url-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { groupControlKind } from "./accordion";
import { DEFAULT_SIDEBAR, resolveAdminSidebar } from "./registry";

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
    expect(resolveAdminSidebar("/admin")).toBe(DEFAULT_SIDEBAR);
    expect(resolveAdminSidebar("/admin/memories")).toBe(DEFAULT_SIDEBAR);
    expect(DEFAULT_SIDEBAR.blocks).toEqual(["jumps"]);
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
    expect(resolveAdminSidebar("/dev/admin-clients-preview")).toBe(DEFAULT_SIDEBAR);
  });

  test("an unknown event path keeps the navigation (the page shows its own not-found state)", () => {
    const config = resolveAdminSidebar(`${EVENT}/nepostoji`);
    expect(config.id).toBe("dogadjaji/nepoznato");
    expect(config.nav?.length).toBeGreaterThan(0);
  });
});
