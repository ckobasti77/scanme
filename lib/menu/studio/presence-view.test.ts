// ScanMe Menu V1 (K18) — who else is in the editor: the list of other people,
// their names and the sentences about them. Pure logic; the data is invented.

import { describe, expect, test } from "vitest";
import { fmt } from "../../i18n/format";
import { menuStudioObjavljivanjeSr } from "../../i18n/sr/menu-studio-objava";
import type { StudioPrisutan } from "./model";
import {
  drugiUEditoru,
  imenaPoArtiklu,
  imeOsobe,
  inicijali,
  naEntitetu,
  nowBucket,
  osobe,
  PRISUSTVO_KORAK_MS,
  PRISUSTVO_OTKUCAJ_MS,
  PRISUSTVO_TTL_MS,
  recenicaOsoba,
  spisakImena,
  type UnosPrisustva,
} from "./presence-view";

const t = menuStudioObjavljivanjeSr.prisustvo;
const dvoje = (a: string, b: string) => fmt(t.dvoje, { a, b });

// --- builders -----------------------------------------------------------------

const SADA = 1_800_000_000_000;

function unos(userId: string, overrides: Partial<UnosPrisustva> = {}): UnosPrisustva {
  return {
    userId,
    name: userId,
    isMe: false,
    entityType: "article",
    entityKey: "ar_a",
    since: SADA - 1_000,
    ...overrides,
  };
}

function prisutan(id: string, ime: string | null, entitet: StudioPrisutan["entitet"] = null): StudioPrisutan {
  return { id, ime, entitet };
}

const clanak = (key: string) => ({ vrsta: "article" as const, key });

// --- constants and the clock --------------------------------------------------

describe("constants", () => {
  test("a row lives 45 s; the heartbeat comes well inside it; the clock steps 15 s", () => {
    expect(PRISUSTVO_TTL_MS).toBe(45_000);
    expect(PRISUSTVO_KORAK_MS).toBe(15_000);
    expect(PRISUSTVO_OTKUCAJ_MS * 2).toBeLessThan(PRISUSTVO_TTL_MS);
  });
});

describe("nowBucket", () => {
  test("rounds the clock down to the step", () => {
    expect(nowBucket(0)).toBe(0);
    expect(nowBucket(PRISUSTVO_KORAK_MS - 1)).toBe(0);
    expect(nowBucket(PRISUSTVO_KORAK_MS)).toBe(PRISUSTVO_KORAK_MS);
    expect(nowBucket(2 * PRISUSTVO_KORAK_MS + 14_999)).toBe(2 * PRISUSTVO_KORAK_MS);
  });

  test("a large real-world timestamp lands on a multiple of the step, never ahead of the clock", () => {
    const korak = nowBucket(1_800_000_012_345);
    expect(korak % PRISUSTVO_KORAK_MS).toBe(0);
    expect(korak).toBeLessThanOrEqual(1_800_000_012_345);
    expect(1_800_000_012_345 - korak).toBeLessThan(PRISUSTVO_KORAK_MS);
  });

  test("the same bucket for the whole step (one subscription argument per step)", () => {
    const pocetak = 7 * PRISUSTVO_KORAK_MS;
    expect(nowBucket(pocetak + 1)).toBe(nowBucket(pocetak + PRISUSTVO_KORAK_MS - 1));
    expect(nowBucket(pocetak + PRISUSTVO_KORAK_MS)).toBe(pocetak + PRISUSTVO_KORAK_MS);
  });
});

// --- drugiUEditoru ------------------------------------------------------------

describe("drugiUEditoru", () => {
  test("nothing in, nothing out", () => {
    expect(drugiUEditoru([], SADA)).toEqual([]);
  });

  test("another person becomes id, name and the entity they have open", () => {
    expect(drugiUEditoru([unos("u_ana", { name: "Ana Marić", entityType: "page", entityKey: "pg_pica" })], SADA)).toEqual([
      { id: "u_ana", ime: "Ana Marić", entitet: { vrsta: "page", key: "pg_pica" } },
    ]);
  });

  test("the person themself is never listed, not even from another tab", () => {
    const izlaz = drugiUEditoru(
      [unos("u_ja", { isMe: true }), unos("u_ja", { isMe: true, entityKey: "ar_b" }), unos("u_ana")],
      SADA,
    );
    expect(izlaz.map((osoba) => osoba.id)).toEqual(["u_ana"]);
  });

  test("a row expires exactly TTL after its last write", () => {
    const since = SADA - PRISUSTVO_TTL_MS;
    expect(drugiUEditoru([unos("u_a", { since: since + 1 })], SADA)).toHaveLength(1);
    expect(drugiUEditoru([unos("u_a", { since })], SADA)).toHaveLength(0);
    expect(drugiUEditoru([unos("u_a", { since: since - 1 })], SADA)).toHaveLength(0);
  });

  test("a fresh row is kept however recent", () => {
    expect(drugiUEditoru([unos("u_a", { since: SADA }), unos("u_b", { since: SADA + 500 })], SADA)).toHaveLength(2);
  });

  test("one entry per person and entity", () => {
    const izlaz = drugiUEditoru([unos("u_a"), unos("u_a"), unos("u_a")], SADA);
    expect(izlaz).toHaveLength(1);
  });

  test("the same person on two different entities is two entries", () => {
    const izlaz = drugiUEditoru([unos("u_a", { entityKey: "ar_a" }), unos("u_a", { entityKey: "ar_b" })], SADA);
    expect(izlaz.map((osoba) => osoba.entitet?.key)).toEqual(["ar_a", "ar_b"]);
  });

  test("the same key of another type is another entity", () => {
    const izlaz = drugiUEditoru(
      [unos("u_a", { entityType: "article", entityKey: "x" }), unos("u_a", { entityType: "page", entityKey: "x" })],
      SADA,
    );
    expect(izlaz.map((osoba) => osoba.entitet?.vrsta)).toEqual(["article", "page"]);
  });

  test("two people on the same entity are two entries", () => {
    const izlaz = drugiUEditoru([unos("u_a"), unos("u_b")], SADA);
    expect(izlaz.map((osoba) => osoba.id)).toEqual(["u_a", "u_b"]);
  });

  test("the first row of a person and entity wins (its name is kept)", () => {
    const izlaz = drugiUEditoru([unos("u_a", { name: "Ana" }), unos("u_a", { name: "Ana M." })], SADA);
    expect(izlaz).toEqual([{ id: "u_a", ime: "Ana", entitet: { vrsta: "article", key: "ar_a" } }]);
  });

  test("an expired row does not hide a live row of the same person and entity", () => {
    const izlaz = drugiUEditoru(
      [unos("u_a", { since: SADA - PRISUSTVO_TTL_MS - 1 }), unos("u_a", { name: "Ana", since: SADA - 100 })],
      SADA,
    );
    expect(izlaz).toEqual([{ id: "u_a", ime: "Ana", entitet: { vrsta: "article", key: "ar_a" } }]);
  });

  test("a row of mine does not hide another person", () => {
    const izlaz = drugiUEditoru([unos("u_ja", { isMe: true }), unos("u_ana")], SADA);
    expect(izlaz.map((osoba) => osoba.id)).toEqual(["u_ana"]);
  });

  test("all three kinds of entity are known", () => {
    const izlaz = drugiUEditoru(
      [
        unos("u_a", { entityType: "article", entityKey: "ar_1" }),
        unos("u_b", { entityType: "page", entityKey: "pg_1" }),
        unos("u_c", { entityType: "room_service", entityKey: "rs" }),
      ],
      SADA,
    );
    expect(izlaz.map((osoba) => osoba.entitet)).toEqual([
      { vrsta: "article", key: "ar_1" },
      { vrsta: "page", key: "pg_1" },
      { vrsta: "room_service", key: "rs" },
    ]);
  });

  test("an unknown entity type means the person is in the editor, nothing in particular", () => {
    const izlaz = drugiUEditoru([unos("u_a", { entityType: "calendar", entityKey: "k1" })], SADA);
    expect(izlaz).toEqual([{ id: "u_a", ime: "u_a", entitet: null }]);
  });

  test("no entity, or a type without a key, is also no entity", () => {
    const izlaz = drugiUEditoru(
      [
        unos("u_a", { entityType: null, entityKey: null }),
        unos("u_b", { entityType: "article", entityKey: null }),
        unos("u_c", { entityType: null, entityKey: "ar_a" }),
        unos("u_d", { entityType: "article", entityKey: "" }),
      ],
      SADA,
    );
    expect(izlaz.map((osoba) => osoba.entitet)).toEqual([null, null, null, null]);
  });

  test("a person with several rows without an entity is listed once", () => {
    const izlaz = drugiUEditoru(
      [unos("u_a", { entityType: null, entityKey: null }), unos("u_a", { entityType: "calendar", entityKey: "k" })],
      SADA,
    );
    expect(izlaz).toHaveLength(1);
    expect(izlaz[0].entitet).toBeNull();
  });

  test("names are trimmed; a blank or missing name is null", () => {
    const izlaz = drugiUEditoru(
      [unos("u_a", { name: "  Ana  " }), unos("u_b", { name: "   " }), unos("u_c", { name: null }), unos("u_d", { name: "" })],
      SADA,
    );
    expect(izlaz.map((osoba) => osoba.ime)).toEqual(["Ana", null, null, null]);
  });

  test("the order of the server is kept", () => {
    const izlaz = drugiUEditoru([unos("u_z"), unos("u_a"), unos("u_m")], SADA);
    expect(izlaz.map((osoba) => osoba.id)).toEqual(["u_z", "u_a", "u_m"]);
  });

  test("the input is not changed", () => {
    const ulaz = [unos("u_a"), unos("u_ja", { isMe: true })];
    const kopija = JSON.parse(JSON.stringify(ulaz));
    drugiUEditoru(ulaz, SADA);
    expect(ulaz).toEqual(kopija);
  });
});

// --- names --------------------------------------------------------------------

describe("imeOsobe", () => {
  test("a name is shown as it is, trimmed", () => {
    expect(imeOsobe("Ana")).toBe("Ana");
    expect(imeOsobe("  Marko Petrović ")).toBe("Marko Petrović");
  });

  test("no usable name is 'Član tima' from the dictionary", () => {
    expect(imeOsobe(null)).toBe(t.clanTima);
    expect(imeOsobe("")).toBe(t.clanTima);
    expect(imeOsobe("   ")).toBe(t.clanTima);
  });
});

describe("osobe", () => {
  test("nobody is nobody", () => {
    expect(osobe([])).toEqual([]);
  });

  test("everyone once: a person on two entities counts once", () => {
    const izlaz = osobe([
      prisutan("u_a", "Ana", clanak("ar_1")),
      prisutan("u_a", "Ana", clanak("ar_2")),
      prisutan("u_b", "Marko", null),
    ]);
    expect(izlaz).toEqual([
      { id: "u_a", ime: "Ana" },
      { id: "u_b", ime: "Marko" },
    ]);
  });

  test("the first name of a person is kept", () => {
    expect(osobe([prisutan("u_a", "Ana", null), prisutan("u_a", "Ana M.", clanak("ar_1"))])).toEqual([{ id: "u_a", ime: "Ana" }]);
  });

  test("sorted by name, ignoring case", () => {
    const izlaz = osobe([prisutan("u3", "Zoran"), prisutan("u1", "Ana"), prisutan("u2", "marko")]);
    expect(izlaz.map((osoba) => osoba.ime)).toEqual(["Ana", "marko", "Zoran"]);
  });

  test("equal names are ordered by id, so the list is stable", () => {
    const izlaz = osobe([prisutan("u_2", "Marko"), prisutan("u_1", "Marko")]);
    expect(izlaz.map((osoba) => osoba.id)).toEqual(["u_1", "u_2"]);
  });

  test("a person without a name is listed as 'Član tima'", () => {
    const izlaz = osobe([prisutan("u_1", null), prisutan("u_2", "   ")]);
    expect(izlaz).toEqual([
      { id: "u_1", ime: t.clanTima },
      { id: "u_2", ime: t.clanTima },
    ]);
  });
});

describe("naEntitetu", () => {
  const prisutni = [
    prisutan("u_marko", "Marko", clanak("ar_1")),
    prisutan("u_ana", "Ana", clanak("ar_1")),
    prisutan("u_ana", "Ana", clanak("ar_2")),
    prisutan("u_zoran", "Zoran", { vrsta: "page", key: "ar_1" }),
    prisutan("u_ivan", "Ivan", null),
    prisutan("u_rs", "Mira", { vrsta: "room_service", key: "rs" }),
  ];

  test("the names of the people with exactly this entity open, sorted", () => {
    expect(naEntitetu(prisutni, "article", "ar_1")).toEqual(["Ana", "Marko"]);
  });

  test("the same key of another kind of entity is not this entity", () => {
    expect(naEntitetu(prisutni, "page", "ar_1")).toEqual(["Zoran"]);
  });

  test("a person on another entity, or on none, is not counted", () => {
    expect(naEntitetu(prisutni, "article", "ar_2")).toEqual(["Ana"]);
    expect(naEntitetu(prisutni, "article", "ar_9")).toEqual([]);
    expect(naEntitetu(prisutni, "room_service", "rs")).toEqual(["Mira"]);
  });

  test("a person listed twice on the same entity is named once", () => {
    expect(naEntitetu([prisutan("u_a", "Ana", clanak("ar_1")), prisutan("u_a", "Ana", clanak("ar_1"))], "article", "ar_1")).toEqual([
      "Ana",
    ]);
  });
});

describe("imenaPoArtiklu", () => {
  test("no one, or no one on an article, is an empty map", () => {
    expect(imenaPoArtiklu([]).size).toBe(0);
    expect(
      imenaPoArtiklu([prisutan("u_a", "Ana", null), prisutan("u_b", "Marko", { vrsta: "page", key: "pg_1" })]).size,
    ).toBe(0);
  });

  test("article key to the sorted names of the people editing it", () => {
    const mapa = imenaPoArtiklu([
      prisutan("u_marko", "Marko", clanak("ar_1")),
      prisutan("u_ana", "Ana", clanak("ar_1")),
      prisutan("u_zoran", "Zoran", clanak("ar_2")),
    ]);
    expect([...mapa.keys()]).toEqual(["ar_1", "ar_2"]);
    expect(mapa.get("ar_1")).toEqual(["Ana", "Marko"]);
    expect(mapa.get("ar_2")).toEqual(["Zoran"]);
  });

  test("pages and Room service are not articles", () => {
    const mapa = imenaPoArtiklu([
      prisutan("u_a", "Ana", { vrsta: "page", key: "ar_1" }),
      prisutan("u_b", "Marko", { vrsta: "room_service", key: "ar_1" }),
      prisutan("u_c", "Zoran", clanak("ar_1")),
    ]);
    expect(mapa.get("ar_1")).toEqual(["Zoran"]);
    expect(mapa.size).toBe(1);
  });

  test("one person with two articles open appears at both", () => {
    const mapa = imenaPoArtiklu([prisutan("u_a", "Ana", clanak("ar_1")), prisutan("u_a", "Ana", clanak("ar_2"))]);
    expect(mapa.get("ar_1")).toEqual(["Ana"]);
    expect(mapa.get("ar_2")).toEqual(["Ana"]);
  });

  test("an article nobody has open is absent", () => {
    expect(imenaPoArtiklu([prisutan("u_a", "Ana", clanak("ar_1"))]).has("ar_2")).toBe(false);
  });
});

// --- inicijali ----------------------------------------------------------------

describe("inicijali", () => {
  test("two initials from a first and last name", () => {
    expect(inicijali("Marko Petrović")).toBe("MP");
  });

  test("one initial from a single name", () => {
    expect(inicijali("Ana")).toBe("A");
  });

  test("nothing to take from is '?'", () => {
    expect(inicijali(null)).toBe("?");
    expect(inicijali("")).toBe("?");
    expect(inicijali("   ")).toBe("?");
  });

  test("only the first two words count", () => {
    expect(inicijali("Marko Jovan Petrović")).toBe("MJ");
  });

  test("lower case becomes upper case; extra spaces are ignored", () => {
    expect(inicijali("  ana   marić ")).toBe("AM");
  });

  test("letters with diacritics stay themselves in upper case", () => {
    expect(inicijali("čedomir đorđević")).toBe("ČĐ");
  });
});

// --- phrases ------------------------------------------------------------------

describe("spisakImena", () => {
  test("nobody is an empty string", () => {
    expect(spisakImena([])).toBe("");
  });

  test("one name is the name", () => {
    expect(spisakImena(["Marko"])).toBe("Marko");
  });

  test("two names are joined with the dictionary's 'i'", () => {
    expect(spisakImena(["Marko", "Ana"])).toBe(dvoje("Marko", "Ana"));
    expect(spisakImena(["Marko", "Ana"])).toBe("Marko i Ana");
  });

  test("three names with the default limit of two: two named, one counted", () => {
    expect(spisakImena(["Ana", "Marko", "Zoran"])).toBe(fmt(t.jos, { imena: "Ana, Marko", n: 1 }));
    expect(spisakImena(["Ana", "Marko", "Zoran"])).toBe("Ana, Marko i još 1");
  });

  test("more names: the rest is counted", () => {
    expect(spisakImena(["Ana", "Marko", "Zoran", "Ivan", "Mira"])).toBe(fmt(t.jos, { imena: "Ana, Marko", n: 3 }));
  });

  test("the default limit is two", () => {
    const imena = ["Ana", "Marko", "Zoran", "Ivan"];
    expect(spisakImena(imena)).toBe(spisakImena(imena, 2));
  });

  test("a higher limit names more people", () => {
    expect(spisakImena(["Ana", "Marko", "Zoran", "Ivan"], 3)).toBe(fmt(t.jos, { imena: "Ana, Marko, Zoran", n: 1 }));
  });

  test("when everyone fits, the last name is joined with 'i' and nobody is counted", () => {
    expect(spisakImena(["Ana", "Marko", "Zoran"], 3)).toBe(dvoje("Ana, Marko", "Zoran"));
    expect(spisakImena(["Ana", "Marko", "Zoran"], 10)).toBe(dvoje("Ana, Marko", "Zoran"));
  });

  test("a limit of one name counts the rest even for two people", () => {
    expect(spisakImena(["Marko", "Ana"], 1)).toBe(fmt(t.jos, { imena: "Marko", n: 1 }));
  });
});

describe("recenicaOsoba", () => {
  test("one person: the singular template", () => {
    expect(recenicaOsoba(t.uredjuje, ["Marko"])).toBe(fmt(t.uredjuje.jedan, { imena: "Marko" }));
    expect(recenicaOsoba(t.naArtiklu, ["Marko"])).toBe(fmt(t.naArtiklu.jedan, { imena: "Marko" }));
    expect(recenicaOsoba(t.detalj, ["Marko"])).toBe(fmt(t.detalj.jedan, { imena: "Marko" }));
  });

  test("several people: the plural template", () => {
    expect(recenicaOsoba(t.uredjuje, ["Marko", "Ana"])).toBe(fmt(t.uredjuje.vise, { imena: dvoje("Marko", "Ana") }));
    expect(recenicaOsoba(t.naArtiklu, ["Marko", "Ana"])).toBe(fmt(t.naArtiklu.vise, { imena: dvoje("Marko", "Ana") }));
    expect(recenicaOsoba(t.detalj, ["Marko", "Ana"])).toBe(fmt(t.detalj.vise, { imena: dvoje("Marko", "Ana") }));
  });

  test("the singular and plural templates really differ", () => {
    expect(recenicaOsoba(t.naArtiklu, ["Marko"])).not.toBe(recenicaOsoba(t.naArtiklu, ["Marko", "Ana"]));
  });

  test("with a custom template the names fill {imena}", () => {
    const sablon = { jedan: "[{imena}] radi", vise: "[{imena}] rade" };
    expect(recenicaOsoba(sablon, ["Marko"])).toBe("[Marko] radi");
    expect(recenicaOsoba(sablon, ["Marko", "Ana"])).toBe("[Marko i Ana] rade");
  });

  test("three people are shortened to two names and a count; the limit can be raised", () => {
    expect(recenicaOsoba(t.uredjuje, ["Ana", "Marko", "Zoran"])).toBe(
      fmt(t.uredjuje.vise, { imena: fmt(t.jos, { imena: "Ana, Marko", n: 1 }) }),
    );
    expect(recenicaOsoba(t.uredjuje, ["Ana", "Marko", "Zoran"], 3)).toBe(
      fmt(t.uredjuje.vise, { imena: dvoje("Ana, Marko", "Zoran") }),
    );
  });

  test("it reads as a sentence", () => {
    expect(recenicaOsoba(t.naArtiklu, ["Marko"])).toBe("Marko uređuje");
    expect(recenicaOsoba(t.naArtiklu, ["Marko", "Ana"])).toBe("Marko i Ana uređuju");
  });
});
