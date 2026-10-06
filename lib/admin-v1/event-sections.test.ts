import { describe, expect, test } from "vitest";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import {
  EVENT_SECTION_PATHS,
  eventBasePath,
  eventDetailHref,
  eventNavGroups,
  eventPathSegments,
  eventSectionHref,
  eventSectionTitle,
  pickCurrentEvent,
  resolveEventSection,
  switchEventHref,
} from "./event-sections";

// Admin UX A2 — section routes of `Događaji`.

const REQUIRED = [
  "pregled", "modeli", "qr", "izlagaci", "import",
  "interakcije/glas-publike", "interakcije/ankete", "interakcije/pasos", "interakcije/forme",
  "leadovi", "leadovi/follow-up", "leadovi/podesavanja",
  "sponzorisano", "izvestaji", "brisanje",
];

describe("event section registry (A2)", () => {
  test("every slug required by ADMIN-UX-ZAHTEVI §2 is a section, and nothing else", () => {
    expect([...EVENT_SECTION_PATHS].sort()).toEqual([...REQUIRED].sort());
  });

  test("slug ↔ section: each path resolves to itself and back to the same URL", () => {
    for (const path of REQUIRED) {
      const resolved = resolveEventSection(path.split("/"));
      expect(resolved).toEqual({ kind: "section", path });
      expect(eventSectionHref("/admin/dogadjaji/test-em", resolved!.path)).toBe(`/admin/dogadjaji/test-em/${path}`);
      expect(adminEventsSr.sectionLabels[resolved!.path as keyof typeof adminEventsSr.sectionLabels].length).toBeGreaterThan(0);
    }
  });

  test("details: modeli/<id> and qr/<kod>; other sections have no detail", () => {
    expect(resolveEventSection(["modeli", "k57abc123"])).toEqual({ kind: "section", path: "modeli", detailId: "k57abc123" });
    expect(resolveEventSection(["qr", "7KQ2M9XA"])).toEqual({ kind: "section", path: "qr", detailId: "7KQ2M9XA" });
    expect(resolveEventSection(["izlagaci", "x"])).toBeNull();
    expect(resolveEventSection(["modeli", "a b"])).toBeNull();
    expect(resolveEventSection(["modeli", "x", "y"])).toBeNull();
    expect(eventDetailHref("/admin/dogadjaji/test-em", "qr", "7KQ2M9XA", { prikaz: "kartice" })).toBe("/admin/dogadjaji/test-em/qr/7KQ2M9XA?prikaz=kartice");
  });

  test("no segment → Pregled, `interakcije` → Glas publike; unknown → null", () => {
    expect(resolveEventSection(undefined)).toEqual({ kind: "redirect", path: "pregled" });
    expect(resolveEventSection([])).toEqual({ kind: "redirect", path: "pregled" });
    expect(resolveEventSection(["interakcije"])).toEqual({ kind: "redirect", path: "interakcije/glas-publike" });
    expect(resolveEventSection(["nepostoji"])).toBeNull();
    expect(resolveEventSection(["interakcije", "nepostoji"])).toBeNull();
    expect(resolveEventSection(["leadovi", "nepostoji"])).toBeNull();
  });

  test("segments are read from the pathname below the event base", () => {
    const base = eventBasePath("test-em");
    expect(eventPathSegments("/admin/dogadjaji/test-em/leadovi/follow-up", base)).toEqual(["leadovi", "follow-up"]);
    expect(eventPathSegments("/admin/dogadjaji/test-em", base)).toEqual([]);
    expect(eventPathSegments("/admin/dogadjaji/test-em2/qr", base)).toEqual([]);
  });

  test("page titles name the section or the detail", () => {
    expect(eventSectionTitle(resolveEventSection(["leadovi", "podesavanja"]))).toBe(`${adminEventsSr.sectionLabels["leadovi/podesavanja"]} · ${adminEventsSr.pageTitle}`);
    expect(eventSectionTitle(resolveEventSection(["modeli", "m1"]))).toBe(`${adminEventsSr.detailModelTitle} · ${adminEventsSr.pageTitle}`);
    expect(eventSectionTitle(null)).toBe(adminEventsSr.pageTitle);
  });
});

describe("pickCurrentEvent (A2 redirect rule)", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-10-10T12:00:00+02:00");
  const past = { slug: "past", startsAt: now - 30 * day, endsAt: now - 27 * day, status: "ended" };
  const older = { slug: "older", startsAt: now - 60 * day, endsAt: now - 57 * day, status: "ended" };
  const running = { slug: "running", startsAt: now - day, endsAt: now + day, status: "live" };
  const soon = { slug: "soon", startsAt: now + 5 * day, endsAt: now + 7 * day, status: "published" };
  const later = { slug: "later", startsAt: now + 40 * day, endsAt: now + 42 * day, status: "published" };

  test("the event in progress wins", () => {
    expect(pickCurrentEvent([later, past, running, soon], now)?.slug).toBe("running");
  });

  test("else the nearest upcoming one", () => {
    expect(pickCurrentEvent([later, past, soon], now)?.slug).toBe("soon");
  });

  test("else the last one by end", () => {
    expect(pickCurrentEvent([older, past], now)?.slug).toBe("past");
  });

  test("archived only when nothing else exists; no events → null", () => {
    const archivedRunning = { ...running, slug: "archived", status: "archived" };
    expect(pickCurrentEvent([archivedRunning, past], now)?.slug).toBe("past");
    expect(pickCurrentEvent([archivedRunning], now)?.slug).toBe("archived");
    expect(pickCurrentEvent([], now)).toBeNull();
  });

  test("an event ends at endsAt (exclusive)", () => {
    expect(pickCurrentEvent([{ ...running, endsAt: now }, soon], now)?.slug).toBe("soon");
  });
});

describe("event switch keeps the section (A2)", () => {
  test("the section and event-independent filters stay; ID filters and details are dropped", () => {
    const query = { prikaz: "kartice", paket: "napredni", izlagac: "p1", model: "m1", q: "volta" } as const;
    expect(switchEventHref(eventBasePath("amf"), resolveEventSection(["leadovi", "follow-up"]), query)).toBe("/admin/dogadjaji/amf/leadovi/follow-up?q=volta&paket=napredni&prikaz=kartice");
    expect(switchEventHref(eventBasePath("amf"), resolveEventSection(["modeli", "m1"]), {})).toBe("/admin/dogadjaji/amf/modeli");
    expect(switchEventHref(eventBasePath("amf"), null, {})).toBe("/admin/dogadjaji/amf/pregled");
    expect(switchEventHref("/dev/admin-events-preview", resolveEventSection(["qr"]), {}, { dogadjaj: "test-amf" })).toBe("/dev/admin-events-preview/qr?dogadjaj=test-amf");
  });
});

describe("eventNavGroups marks the open section (A2)", () => {
  const href = (path: string) => `/x/${path}`;

  test("exactly one item is active; its parent is highlighted", () => {
    const groups = eventNavGroups(href, "interakcije/ankete");
    const all = groups.flatMap((group) => group.items.flatMap((item) => [item, ...(item.children ?? [])]));
    expect(all.filter((item) => item.active).map((item) => item.id)).toEqual(["interakcije/ankete"]);
    const parent = groups.flatMap((group) => group.items).find((item) => item.id === "interakcije");
    expect(parent?.activeChild).toBe(true);
    expect(parent?.href).toBe("/x/interakcije/glas-publike");
    expect(parent?.children?.map((child) => child.id)).toEqual(["interakcije/glas-publike", "interakcije/ankete", "interakcije/pasos", "interakcije/forme"]);
  });

  test("every section is reachable from the navigation, in groups with labels", () => {
    const groups = eventNavGroups(href, null);
    const ids = groups.flatMap((group) => group.items.flatMap((item) => (item.children ? item.children.map((child) => child.id) : [item.id])));
    expect(ids.sort()).toEqual([...REQUIRED].sort());
    expect(groups.map((group) => group.label)).toEqual([undefined, adminEventsSr.navGroups.katalog, adminEventsSr.navGroups.sajam, adminEventsSr.navGroups.posle]);
    expect(groups.flatMap((group) => group.items).some((item) => item.active || item.activeChild)).toBe(false);
  });

  test("Izlagači replaces Event-only klijenti", () => {
    expect(adminEventsSr.sectionLabels.izlagaci).toBe("Izlagači");
    expect(JSON.stringify(adminEventsSr)).not.toContain("Event-only klijenti");
  });
});
