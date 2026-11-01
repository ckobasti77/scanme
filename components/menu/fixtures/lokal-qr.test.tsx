// Izlog fixtures of "Lokal i QR": every state builds, ids and card codes are
// unique, every stored layout is valid and non-overlapping on the surface of
// its zone, the cards cover the situations the screen has to show, and the
// data runs through the in-memory rules of lib/menu/lokal/memorija.ts.

import { describe, expect, test } from "vitest";
import { isValidLayout, overlaps, placeLayouts, type FloorLayout } from "@/lib/menu/floor-layout";
import { FLOOR_ERROR } from "@/lib/menu/errors/floor";
import { isMenuKey } from "@/lib/menu/keys";
import { memorijaOd, primeniRadnju } from "@/lib/menu/lokal/memorija";
import type { LokalKartica, LokalPodaci, LokalPozicija } from "@/lib/menu/lokal/model";
import { fixtureLokalPodaci, LOKAL_QR_ARHIVIRANA_STRANICA, type LokalQrStanje } from "./lokal-qr";
import { IZLOG_SADA } from "./lokal";

const STANJA: LokalQrStanje[] = ["restoran", "prazno", "bez-zona", "hotel"];
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing: ${what}`);
  return value;
}

function allUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function position(podaci: LokalPodaci, label: string): LokalPozicija {
  return must(podaci.positions.find((p) => p.label === label), `position ${label}`);
}

function cardsOf(podaci: LokalPodaci, label: string): LokalKartica[] {
  const id = position(podaci, label).id;
  return podaci.cards.filter((card) => card.link?.positionId === id);
}

function pageKey(podaci: LokalPodaci, slug: string): string {
  return must(podaci.pages.find((page) => page.slug === slug), `page ${slug}`).key;
}

/** The surfaces of the data: "Bez zone" and every zone. */
function surfaces(podaci: LokalPodaci): (string | null)[] {
  return [null, ...podaci.zones.map((zone) => zone.id)];
}

function storedLayouts(podaci: LokalPodaci, zoneId: string | null): FloorLayout[] {
  return podaci.positions.flatMap((p) => (p.zoneId === zoneId && p.layout ? [p.layout] : []));
}

describe.each(STANJA)("fixtureLokalPodaci(%s)", (stanje) => {
  test("builds a plain, deterministic model, fresh on every call", () => {
    const first = fixtureLokalPodaci(stanje);
    const second = fixtureLokalPodaci(stanje);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.positions).not.toBe(first.positions);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first.cardsTruncated).toBe(false);
  });

  test("ids, keys, slugs and card codes are unique", () => {
    const podaci = fixtureLokalPodaci(stanje);
    expect(allUnique(podaci.zones.map((z) => z.id))).toBe(true);
    expect(allUnique(podaci.zones.map((z) => z.name))).toBe(true);
    expect(allUnique(podaci.positions.map((p) => p.id))).toBe(true);
    expect(allUnique(podaci.positions.map((p) => p.key))).toBe(true);
    expect(allUnique(podaci.positions.map((p) => p.label))).toBe(true);
    expect(allUnique(podaci.cards.map((c) => c.id))).toBe(true);
    expect(allUnique(podaci.cards.map((c) => c.cardCode))).toBe(true);
    expect(allUnique(podaci.pages.map((p) => p.key))).toBe(true);
    expect(allUnique(podaci.pages.map((p) => p.slug))).toBe(true);
  });

  test("keys are valid menu keys and card codes use the card alphabet", () => {
    const podaci = fixtureLokalPodaci(stanje);
    podaci.zones.forEach((z) => expect(isMenuKey(z.key, "zone")).toBe(true));
    podaci.positions.forEach((p) => expect(isMenuKey(p.key, "position")).toBe(true));
    podaci.pages.forEach((p) => expect(isMenuKey(p.key, "page")).toBe(true));
    podaci.cards.forEach((c) => expect(c.cardCode).toMatch(CODE_PATTERN));
  });

  test("every stored layout is valid and none overlaps another on its surface", () => {
    const podaci = fixtureLokalPodaci(stanje);
    for (const zoneId of surfaces(podaci)) {
      const layouts = storedLayouts(podaci, zoneId);
      layouts.forEach((layout, index) => {
        expect(isValidLayout(layout)).toBe(true);
        layouts.slice(index + 1).forEach((other) => expect(overlaps(layout, other)).toBe(false));
      });
      // What the plan draws (stored layouts plus the placed ones) is overlap-free too.
      const items = podaci.positions
        .filter((p) => p.zoneId === zoneId)
        .map((p) => ({ id: p.id, kind: p.kind, order: p.order, layout: p.layout }));
      const drawn = Array.from(placeLayouts(items).values());
      drawn.forEach((layout, index) => {
        drawn.slice(index + 1).forEach((other) => expect(overlaps(layout, other)).toBe(false));
      });
    }
  });

  test("positions point at existing zones; the cards at existing positions and pages, apart from the documented broken ones", () => {
    const podaci = fixtureLokalPodaci(stanje);
    const zoneIds = new Set(podaci.zones.map((z) => z.id));
    const positionIds = new Set(podaci.positions.map((p) => p.id));
    const pageKeys = new Set(podaci.pages.map((p) => p.key));
    podaci.positions.forEach((p) => expect(p.zoneId === null || zoneIds.has(p.zoneId)).toBe(true));
    const brokenPages: string[] = [];
    for (const card of podaci.cards) {
      if (card.link?.positionId) expect(positionIds.has(card.link.positionId)).toBe(true);
      if (card.link?.pageKey && !pageKeys.has(card.link.pageKey)) brokenPages.push(card.link.pageKey);
    }
    expect(brokenPages).toEqual(stanje === "restoran" ? [LOKAL_QR_ARHIVIRANA_STRANICA] : []);
  });

  test("scans are consistent with the izlog clock", () => {
    const podaci = fixtureLokalPodaci(stanje);
    for (const card of podaci.cards) {
      expect(card.createdAt).toBeLessThan(IZLOG_SADA);
      expect(card.totalScans >= 0 && Number.isInteger(card.totalScans)).toBe(true);
      if (card.totalScans === 0) {
        expect(card.lastScanAt).toBeNull();
      } else {
        const last = must(card.lastScanAt ?? undefined, `lastScanAt of ${card.label}`);
        expect(last).toBeLessThanOrEqual(IZLOG_SADA);
        expect(last).toBeGreaterThanOrEqual(card.createdAt);
      }
    }
  });

  test("pages: one default page, internal names as in the editor", () => {
    const podaci = fixtureLokalPodaci(stanje);
    expect(podaci.pages.filter((p) => p.isDefault)).toHaveLength(1);
    expect(podaci.pages[0]).toMatchObject({ name: "Kompletan meni", slug: "glavni", isDefault: true });
    expect(podaci.pages.length).toBeGreaterThanOrEqual(2);
  });
});

describe("restoran", () => {
  const podaci = fixtureLokalPodaci("restoran");

  test("has three zones with their tables and the bar without a zone", () => {
    expect(podaci.zones.map((z) => z.name)).toEqual(["Glavna sala", "Terasa", "VIP"]);
    expect(podaci.positions).toHaveLength(16);
    expect(position(podaci, "Šank")).toMatchObject({ kind: "other", zoneId: null });
    expect(podaci.positions.filter((p) => p.zoneId === null)).toHaveLength(1);
    const perZone = podaci.zones.map((z) => podaci.positions.filter((p) => p.zoneId === z.id).length);
    expect(perZone).toEqual([8, 4, 3]);
    expect(podaci.positions.every((p) => p.layout !== null)).toBe(true);
  });

  test("each zone starts at the origin of its own grid and stays inside the columns", () => {
    for (const zone of podaci.zones) {
      const layouts = storedLayouts(podaci, zone.id);
      expect(Math.min(...layouts.map((l) => l.x))).toBe(0);
      expect(Math.min(...layouts.map((l) => l.y))).toBeLessThanOrEqual(1);
      expect(Math.max(...layouts.map((l) => l.x + l.w))).toBeLessThanOrEqual(24);
    }
    expect(position(podaci, "Sto 1").layout).toEqual({ x: 0, y: 0, w: 2, h: 2, shape: "round" });
    expect(position(podaci, "Šank").layout).toEqual({ x: 0, y: 0, w: 3, h: 4, shape: "rect" });
  });

  test("pages: the full menu, the wine list and breakfast", () => {
    expect(podaci.pages.map((p) => [p.name, p.slug])).toEqual([
      ["Kompletan meni", "glavni"],
      ["Vinska karta", "vinska-karta"],
      ["Doručak", "dorucak"],
    ]);
  });

  test("tables 1-12 each have one active card that opens the menu's entry", () => {
    for (let n = 1; n <= 12; n += 1) {
      const cards = cardsOf(podaci, `Sto ${n}`).filter((c) => c.opensMenu);
      const own = cards.filter((c) => c.label === `Sto ${n}`);
      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({
        status: "active",
        managedByScanMe: false,
        opensMenu: true,
        link: { pageKey: null, active: true },
      });
    }
  });

  test("table 13 has two cards, one of them for the wine list", () => {
    const cards = cardsOf(podaci, "Sto 13");
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.link?.pageKey).sort()).toEqual([null, pageKey(podaci, "vinska-karta")].sort());
  });

  test("table 14 has a disabled card, table 15 and the bar have none", () => {
    expect(cardsOf(podaci, "Sto 14").map((c) => c.status)).toEqual(["disabled"]);
    expect(cardsOf(podaci, "Sto 15")).toEqual([]);
    expect(cardsOf(podaci, "Šank")).toEqual([]);
  });

  test("a bar card opens the wine list without a position", () => {
    const card = must(podaci.cards.find((c) => c.label === "Šank, vinska karta"), "bar card");
    expect(card.link).toEqual({ pageKey: pageKey(podaci, "vinska-karta"), positionId: null, active: true });
    expect(card.opensMenu).toBe(true);
  });

  test("one card is managed by ScanMe, one leads elsewhere, one points at an archived page", () => {
    const managed = podaci.cards.filter((c) => c.managedByScanMe);
    expect(managed).toHaveLength(1);
    expect(managed[0]).toMatchObject({ status: "active", opensMenu: true, link: null });

    const elsewhere = podaci.cards.filter((c) => !c.opensMenu);
    expect(elsewhere).toHaveLength(1);
    expect(elsewhere[0].link?.positionId).toBe(position(podaci, "Sto 3").id);

    const archived = podaci.cards.filter((c) => c.link?.pageKey === LOKAL_QR_ARHIVIRANA_STRANICA);
    expect(archived).toHaveLength(1);
    expect(podaci.pages.some((p) => p.key === LOKAL_QR_ARHIVIRANA_STRANICA)).toBe(false);
    expect(isMenuKey(LOKAL_QR_ARHIVIRANA_STRANICA, "page")).toBe(true);
  });

  test("scans vary: some cards were never scanned, some recently, some long ago", () => {
    const never = podaci.cards.filter((c) => c.lastScanAt === null);
    expect(never.length).toBeGreaterThanOrEqual(2);
    expect(new Set(podaci.cards.map((c) => c.totalScans)).size).toBeGreaterThan(10);
    const recent = podaci.cards.filter((c) => c.lastScanAt !== null && IZLOG_SADA - c.lastScanAt < 60 * 60_000);
    const old = podaci.cards.filter((c) => c.lastScanAt !== null && IZLOG_SADA - c.lastScanAt > 7 * 24 * 60 * 60_000);
    expect(recent.length).toBeGreaterThanOrEqual(3);
    expect(old.length).toBeGreaterThanOrEqual(2);
  });
});

describe("bez-zona", () => {
  const podaci = fixtureLokalPodaci("bez-zona");

  test("has no zones and every position is in 'Bez zone'", () => {
    expect(podaci.zones).toEqual([]);
    expect(podaci.positions).toHaveLength(8);
    expect(podaci.positions.every((p) => p.zoneId === null && p.kind === "table")).toBe(true);
  });

  test("has a handful of cards, some tables without one", () => {
    expect(podaci.cards.length).toBe(8);
    expect(cardsOf(podaci, "Sto 5")).toEqual([]);
    expect(cardsOf(podaci, "Sto 8").map((c) => c.status)).toEqual(["disabled"]);
    expect(cardsOf(podaci, "Sto 3")).toHaveLength(2);
  });
});

describe("hotel", () => {
  const podaci = fixtureLokalPodaci("hotel");
  const rooms = podaci.positions.filter((p) => p.kind === "room");

  test("has two zones with the tables and rooms 101-124 without a layout", () => {
    expect(podaci.zones.map((z) => z.name)).toEqual(["Restoran", "Lobi bar"]);
    expect(podaci.positions.filter((p) => p.kind === "table")).toHaveLength(12);
    expect(rooms.map((r) => r.label)).toEqual(Array.from({ length: 24 }, (_, index) => `Soba ${101 + index}`));
    expect(rooms.every((r) => r.layout === null && r.zoneId === null && r.seats === null)).toBe(true);
  });

  test("rooms 101-110 have a card, the other rooms none", () => {
    const withCards = rooms.filter((r) => cardsOf(podaci, r.label).length > 0).map((r) => r.label);
    expect(withCards).toEqual(Array.from({ length: 10 }, (_, index) => `Soba ${101 + index}`));
  });

  test("pages are the full menu and the bar list (Room service is not a page)", () => {
    expect(podaci.pages.map((p) => p.name)).toEqual(["Kompletan meni", "Bar karta"]);
  });
});

describe("prazno", () => {
  test("has pages only", () => {
    const podaci = fixtureLokalPodaci("prazno");
    expect(podaci.positions).toEqual([]);
    expect(podaci.zones).toEqual([]);
    expect(podaci.cards).toEqual([]);
    expect(podaci.pages.map((p) => p.slug)).toEqual(["glavni", "vinska-karta", "dorucak"]);
  });
});

describe("the default state", () => {
  test("is the restaurant", () => {
    expect(fixtureLokalPodaci()).toEqual(fixtureLokalPodaci("restoran"));
  });
});

describe("the fixtures under the in-memory rules", () => {
  test("a table with an active card cannot be archived; one without can", () => {
    const stanje = memorijaOd(fixtureLokalPodaci("restoran"));
    const sto1 = position(stanje.podaci, "Sto 1");
    const sto15 = position(stanje.podaci, "Sto 15");
    expect(primeniRadnju(stanje, { vrsta: "archivePosition", positionId: sto1.id }).ishod).toEqual({
      ok: false,
      code: FLOOR_ERROR.positionHasQr,
    });
    expect(primeniRadnju(stanje, { vrsta: "archivePosition", positionId: sto15.id }).ishod).toEqual({ ok: true });
    // Sto 3 also has a card that leads elsewhere, but its own active card still blocks it.
    expect(
      primeniRadnju(stanje, { vrsta: "archivePosition", positionId: position(stanje.podaci, "Sto 3").id }).ishod,
    ).toEqual({ ok: false, code: FLOOR_ERROR.positionHasQr });
  });

  test("'Napravi kartice za mesta bez kartice' has work and adds unique codes", () => {
    const stanje = memorijaOd(fixtureLokalPodaci("restoran"));
    const bezKartice = stanje.podaci.positions.filter(
      (p) => !stanje.podaci.cards.some((c) => c.link?.positionId === p.id),
    );
    expect(bezKartice.map((p) => p.label).sort()).toEqual(["Sto 15", "Šank"]);
    const korak = primeniRadnju(stanje, {
      vrsta: "mintForPositions",
      positionIds: bezKartice.map((p) => p.id),
      pageKey: null,
    });
    expect(korak.ishod).toEqual({ ok: true });
    const kodovi = korak.stanje.podaci.cards.map((c) => c.cardCode);
    expect(kodovi).toHaveLength(stanje.podaci.cards.length + 2);
    expect(allUnique(kodovi)).toBe(true);
  });

  test("the adopted card is read-only, the archived-page card can be relinked", () => {
    const stanje = memorijaOd(fixtureLokalPodaci("restoran"));
    const managed = must(stanje.podaci.cards.find((c) => c.managedByScanMe), "managed card");
    expect(primeniRadnju(stanje, { vrsta: "setCardActive", cardId: managed.id, active: false }).ishod).toEqual({
      ok: false,
      code: FLOOR_ERROR.cardReadOnly,
    });
    const archived = must(
      stanje.podaci.cards.find((c) => c.link?.pageKey === LOKAL_QR_ARHIVIRANA_STRANICA),
      "archived-page card",
    );
    const relinked = primeniRadnju(stanje, {
      vrsta: "linkCard",
      cardId: archived.id,
      link: { pageKey: stanje.podaci.pages[0].key, positionId: null },
    });
    expect(relinked.ishod).toEqual({ ok: true });
  });

  test("a hotel room gets its place from the plan, and a new table fits beside the others", () => {
    const stanje = memorijaOd(fixtureLokalPodaci("hotel"));
    const korak = primeniRadnju(stanje, {
      vrsta: "createPosition",
      input: { kind: "table", label: "Sto 13", seats: 4, zoneId: stanje.podaci.zones[0].id },
    });
    expect(korak.ishod).toEqual({ ok: true });
    const nova = must(korak.stanje.podaci.positions.find((p) => p.label === "Sto 13"), "new table");
    const layouts = storedLayouts(korak.stanje.podaci, stanje.podaci.zones[0].id);
    expect(layouts).toHaveLength(9);
    layouts.forEach((layout, index) => {
      layouts.slice(index + 1).forEach((other) => expect(overlaps(layout, other)).toBe(false));
    });
    expect(nova.layout).not.toBeNull();
  });
});
