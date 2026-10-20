import { describe, expect, test } from "vitest";
import { cardsOfPosition, dijagnozaKartice, positionsWithoutCard } from "./qr-diagnostics";
import type { LokalKartica, LokalPozicija, LokalStranica } from "./lokal/model";

const PAGE_ALL: LokalStranica = { key: "pg_all", name: "Kompletan meni", slug: "kompletan-meni", isDefault: true };
const PAGE_WINE: LokalStranica = { key: "pg_wine", name: "Vinska karta", slug: "vinska-karta", isDefault: false };

function position(id: string, label: string): LokalPozicija {
  return { id, key: `ps_${id}`, kind: "table", label, seats: null, zoneId: null, layout: null, order: 0 };
}

const T1 = position("p1", "Sto 1");
const T2 = position("p2", "Sto 2");
const T3 = position("p3", "Sto 3");
const ctx = { pages: [PAGE_ALL, PAGE_WINE], positions: [T1, T2, T3] };

function card(overrides: Partial<LokalKartica> = {}): LokalKartica {
  return {
    id: "c1",
    cardCode: "ABCD2345",
    label: "Sto 1",
    status: "active",
    managedByScanMe: false,
    opensMenu: true,
    link: { pageKey: null, positionId: null, active: true },
    totalScans: 3,
    lastScanAt: 1_700_000_000_000,
    createdAt: 1_690_000_000_000,
    ...overrides,
  };
}

describe("dijagnozaKartice: stanje", () => {
  test("an active card that opens the Menu is aktivna", () => {
    expect(dijagnozaKartice(card(), ctx).stanje).toBe("aktivna");
  });

  test("a disabled card is iskljucena and opens nothing", () => {
    const d = dijagnozaKartice(
      card({ status: "disabled", link: { pageKey: "pg_wine", positionId: "p1", active: true } }),
      ctx,
    );
    expect(d.stanje).toBe("iskljucena");
    expect(d.otvara).toBeNull();
    expect(d.problemi).toEqual([]);
  });

  test("a card that no longer opens the Menu is drugo-odrediste and opens nothing", () => {
    const d = dijagnozaKartice(
      card({ opensMenu: false, link: { pageKey: "pg_wine", positionId: "p1", active: true } }),
      ctx,
    );
    expect(d.stanje).toBe("drugo-odrediste");
    expect(d.otvara).toBeNull();
    expect(d.problemi).toEqual([]);
  });

  test("disabled wins over a changed destination", () => {
    expect(dijagnozaKartice(card({ status: "disabled", opensMenu: false }), ctx).stanje).toBe("iskljucena");
  });
});

describe("dijagnozaKartice: otvara", () => {
  test("no link row opens the menu entry with no position and no problem", () => {
    const d = dijagnozaKartice(card({ link: null }), ctx);
    expect(d.otvara).toEqual({ stranica: null, pozicija: null });
    expect(d.problemi).toEqual([]);
  });

  test("an active link without page and position opens the entry", () => {
    const d = dijagnozaKartice(card(), ctx);
    expect(d.otvara).toEqual({ stranica: null, pozicija: null });
    expect(d.problemi).toEqual([]);
  });

  test("a page and a position that exist are both reported", () => {
    const d = dijagnozaKartice(card({ link: { pageKey: "pg_wine", positionId: "p2", active: true } }), ctx);
    expect(d.otvara).toEqual({ stranica: PAGE_WINE, pozicija: T2 });
    expect(d.problemi).toEqual([]);
  });

  test("a page alone and a position alone", () => {
    expect(
      dijagnozaKartice(card({ link: { pageKey: "pg_all", positionId: null, active: true } }), ctx).otvara,
    ).toEqual({ stranica: PAGE_ALL, pozicija: null });
    expect(
      dijagnozaKartice(card({ link: { pageKey: null, positionId: "p3", active: true } }), ctx).otvara,
    ).toEqual({ stranica: null, pozicija: T3 });
  });
});

describe("dijagnozaKartice: problemi", () => {
  test("an inactive link is veza-iskljucena and opens the entry, not its page or position", () => {
    const d = dijagnozaKartice(card({ link: { pageKey: "pg_wine", positionId: "p1", active: false } }), ctx);
    expect(d.stanje).toBe("aktivna");
    expect(d.problemi).toEqual(["veza-iskljucena"]);
    expect(d.otvara).toEqual({ stranica: null, pozicija: null });
  });

  test("a page that is not available is stranica-nedostupna and the entry opens", () => {
    const d = dijagnozaKartice(card({ link: { pageKey: "pg_gone", positionId: "p1", active: true } }), ctx);
    expect(d.problemi).toEqual(["stranica-nedostupna"]);
    expect(d.otvara).toEqual({ stranica: null, pozicija: T1 });
  });

  test("a position that is not available is pozicija-nedostupna and no position opens", () => {
    const d = dijagnozaKartice(card({ link: { pageKey: "pg_wine", positionId: "p_gone", active: true } }), ctx);
    expect(d.problemi).toEqual(["pozicija-nedostupna"]);
    expect(d.otvara).toEqual({ stranica: PAGE_WINE, pozicija: null });
  });

  test("both gone: two problems, in a stable order", () => {
    const d = dijagnozaKartice(card({ link: { pageKey: "pg_gone", positionId: "p_gone", active: true } }), ctx);
    expect(d.problemi).toEqual(["stranica-nedostupna", "pozicija-nedostupna"]);
    expect(d.otvara).toEqual({ stranica: null, pozicija: null });
  });

  test("never invents a position: an unknown one is never replaced by the card label's table", () => {
    // The label says "Sto 1" and p1 exists, but the link names p_gone: nothing is guessed.
    const d = dijagnozaKartice(card({ label: "Sto 1", link: { pageKey: null, positionId: "p_gone", active: true } }), ctx);
    expect(d.otvara?.pozicija).toBeNull();
    expect(d.problemi).toEqual(["pozicija-nedostupna"]);
  });

  test("with no positions or pages at all, links to them are problems, not crashes", () => {
    const d = dijagnozaKartice(
      card({ link: { pageKey: "pg_wine", positionId: "p1", active: true } }),
      { pages: [], positions: [] },
    );
    expect(d.problemi).toEqual(["stranica-nedostupna", "pozicija-nedostupna"]);
  });
});

describe("dijagnozaKartice: flags", () => {
  test("nikadSkenirana follows lastScanAt === null", () => {
    expect(dijagnozaKartice(card({ lastScanAt: null }), ctx).nikadSkenirana).toBe(true);
    expect(dijagnozaKartice(card({ lastScanAt: 0 }), ctx).nikadSkenirana).toBe(false);
    expect(dijagnozaKartice(card({ lastScanAt: 5 }), ctx).nikadSkenirana).toBe(false);
  });

  test("samoCitanje follows managedByScanMe, in every state", () => {
    expect(dijagnozaKartice(card({ managedByScanMe: true }), ctx).samoCitanje).toBe(true);
    expect(dijagnozaKartice(card({ managedByScanMe: true, status: "disabled" }), ctx).samoCitanje).toBe(true);
    expect(dijagnozaKartice(card({ managedByScanMe: true, opensMenu: false }), ctx).samoCitanje).toBe(true);
    expect(dijagnozaKartice(card({ managedByScanMe: false }), ctx).samoCitanje).toBe(false);
  });

  test("the flags are reported for non-active cards too", () => {
    const d = dijagnozaKartice(card({ status: "disabled", lastScanAt: null }), ctx);
    expect(d.nikadSkenirana).toBe(true);
  });
});

describe("cardsOfPosition", () => {
  const onT1a = card({ id: "a", link: { pageKey: null, positionId: "p1", active: true } });
  const onT1b = card({ id: "b", status: "disabled", link: { pageKey: "pg_wine", positionId: "p1", active: false } });
  const onT2 = card({ id: "c", link: { pageKey: null, positionId: "p2", active: true } });
  const noPosition = card({ id: "d", link: { pageKey: "pg_wine", positionId: null, active: true } });
  const noLink = card({ id: "e", link: null });
  const all = [onT1a, onT2, onT1b, noPosition, noLink];

  test("returns every card whose link names the position, in the given order, whatever its state", () => {
    expect(cardsOfPosition(all, "p1").map((c) => c.id)).toEqual(["a", "b"]);
    expect(cardsOfPosition(all, "p2").map((c) => c.id)).toEqual(["c"]);
  });

  test("a position nobody stands on, and an empty list", () => {
    expect(cardsOfPosition(all, "p3")).toEqual([]);
    expect(cardsOfPosition([], "p1")).toEqual([]);
  });

  test("does not mutate its input", () => {
    const before = [...all];
    cardsOfPosition(all, "p1");
    expect(all).toEqual(before);
  });
});

describe("positionsWithoutCard", () => {
  test("every position is open when there are no cards", () => {
    expect(positionsWithoutCard([T1, T2, T3], [])).toEqual([T1, T2, T3]);
  });

  test("a position with an active, menu-opening card and an active link is covered", () => {
    const cards = [card({ link: { pageKey: null, positionId: "p1", active: true } })];
    expect(positionsWithoutCard([T1, T2, T3], cards)).toEqual([T2, T3]);
  });

  test("a disabled card does not cover its position", () => {
    const cards = [card({ status: "disabled", link: { pageKey: null, positionId: "p1", active: true } })];
    expect(positionsWithoutCard([T1, T2], cards)).toEqual([T1, T2]);
  });

  test("a card that opens something else does not cover its position", () => {
    const cards = [card({ opensMenu: false, link: { pageKey: null, positionId: "p1", active: true } })];
    expect(positionsWithoutCard([T1, T2], cards)).toEqual([T1, T2]);
  });

  test("an inactive link does not cover its position", () => {
    const cards = [card({ link: { pageKey: null, positionId: "p1", active: false } })];
    expect(positionsWithoutCard([T1, T2], cards)).toEqual([T1, T2]);
  });

  test("a card without a link, or a link without a position, covers nothing", () => {
    const cards = [
      card({ id: "x", link: null }),
      card({ id: "y", link: { pageKey: "pg_wine", positionId: null, active: true } }),
    ];
    expect(positionsWithoutCard([T1, T2], cards)).toEqual([T1, T2]);
  });

  test("one covering card is enough even when another card on the same position is off", () => {
    const cards = [
      card({ id: "off", status: "disabled", link: { pageKey: null, positionId: "p1", active: true } }),
      card({ id: "on", link: { pageKey: null, positionId: "p1", active: true } }),
    ];
    expect(positionsWithoutCard([T1, T2], cards)).toEqual([T2]);
  });

  test("a link to a position that is not in the list changes nothing", () => {
    const cards = [card({ link: { pageKey: null, positionId: "p_gone", active: true } })];
    expect(positionsWithoutCard([T1], cards)).toEqual([T1]);
  });

  test("keeps the order of the positions and does not mutate its input", () => {
    const positions = [T3, T1, T2];
    const cards = [card({ link: { pageKey: null, positionId: "p1", active: true } })];
    expect(positionsWithoutCard(positions, cards)).toEqual([T3, T2]);
    expect(positions).toEqual([T3, T1, T2]);
  });
});
