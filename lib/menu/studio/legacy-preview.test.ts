// ScanMe Menu V1 — K10: the interim live preview. The editor feeds its own data
// to the existing public renderer as "lista" groups; what guests would not see
// stays out.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { sadrzajIzSnapshota } from "./iz-snapshota";
import { pregledIzSadrzaja } from "./legacy-preview";
import type { StudioArtikal, StudioRadniSadrzaj, StudioRed, StudioSekcija } from "./model";

const artikal = (key: string, naziv: string, izmena: Partial<StudioArtikal> = {}): StudioArtikal => ({
  id: key,
  key,
  vrsta: "item",
  naziv,
  opis: null,
  cena: 100,
  kolicina: null,
  jedinica: null,
  medij: "none",
  ikonica: null,
  varijante: false,
  proveriCenu: false,
  ...izmena,
});

const red = (sekcijaKey: string, a: StudioArtikal, sakriven = false): StudioRed => ({
  prikazId: `${sekcijaKey}/${a.key}`,
  redosled: 0,
  sakriven,
  artikal: a,
});

const sekcija = (key: string, naziv: string, redovi: StudioRed[]): StudioSekcija => ({
  id: key,
  key,
  naziv,
  redosled: 0,
  redovi,
});

const sadrzaj = (sekcije: StudioSekcija[], naziv = "Kompletan meni"): StudioRadniSadrzaj => ({
  stranica: { id: "pg_1", key: "pg_1", naziv, podrazumevana: true, arhivirana: false },
  sekcije,
  skraceno: false,
});

const NIKO: ReadonlySet<string> = new Set();

describe("pregledIzSadrzaja", () => {
  test("one 'lista' group per section, in the page's order, with the section as title", () => {
    const pregled = pregledIzSadrzaja(
      "Demo restoran",
      sadrzaj([
        sekcija("sc_a", "Predjela", [red("sc_a", artikal("ar_1", "Gibanica", { cena: 560 }))]),
        sekcija("sc_b", "Dezerti", [red("sc_b", artikal("ar_2", "Baklava", { cena: 360 }))]),
      ]),
      NIKO,
    );
    expect(pregled.businessName).toBe("Demo restoran");
    expect(pregled.design).toBeNull();
    expect(pregled.blockImageUrls).toEqual({});
    expect(pregled.groups.map((g) => [g.shape, g.base.id, g.base.title])).toEqual([
      ["lista", "sc_a", "Predjela"],
      ["lista", "sc_b", "Dezerti"],
    ]);
  });

  test("an item carries the row id, name, price and empty variants and pairings", () => {
    const pregled = pregledIzSadrzaja(
      "Demo restoran",
      sadrzaj([sekcija("sc_a", "Predjela", [red("sc_a", artikal("ar_1", "Gibanica", { cena: 560 }))])]),
      NIKO,
    );
    expect(pregled.groups[0].items).toEqual([
      {
        id: "sc_a/ar_1",
        name: "Gibanica",
        productType: "jelo",
        priceRsd: 560,
        available: true,
        variants: [],
        pairings: [],
      },
    ]);
  });

  test("hidden rows are left out, and so is a section with no shown row", () => {
    const pregled = pregledIzSadrzaja(
      "Demo restoran",
      sadrzaj([
        sekcija("sc_a", "Predjela", [
          red("sc_a", artikal("ar_1", "Gibanica")),
          red("sc_a", artikal("ar_2", "Sarma"), true),
        ]),
        sekcija("sc_b", "Samo sakriveno", [red("sc_b", artikal("ar_3", "Tajna"), true)]),
        sekcija("sc_c", "Prazno", []),
        sekcija("sc_d", "Dezerti", [red("sc_d", artikal("ar_4", "Baklava"))]),
      ]),
      NIKO,
    );
    expect(pregled.groups.map((g) => g.base.title)).toEqual(["Predjela", "Dezerti"]);
    expect(pregled.groups[0].items.map((i) => i.name)).toEqual(["Gibanica"]);
  });

  test("a content with no shown row gives no groups", () => {
    expect(pregledIzSadrzaja("Demo", sadrzaj([]), NIKO).groups).toEqual([]);
  });

  test("an article marked 'Privremeno nedostupno' is shown as unavailable, others as available", () => {
    const pregled = pregledIzSadrzaja(
      "Demo",
      sadrzaj([
        sekcija("sc_a", "Predjela", [
          red("sc_a", artikal("ar_1", "Gibanica")),
          red("sc_a", artikal("ar_2", "Sarma")),
        ]),
      ]),
      new Set(["ar_2"]),
    );
    expect(pregled.groups[0].items.map((i) => [i.name, i.available])).toEqual([
      ["Gibanica", true],
      ["Sarma", false],
    ]);
  });

  test("availability is by article, so a shared article is unavailable in every section", () => {
    const zajednicki = artikal("ar_1", "Tamjanika");
    const pregled = pregledIzSadrzaja(
      "Demo",
      sadrzaj([
        sekcija("sc_a", "Bela vina", [red("sc_a", zajednicki)]),
        sekcija("sc_b", "Preporuka", [red("sc_b", zajednicki)]),
      ]),
      new Set(["ar_1"]),
    );
    expect(pregled.groups.flatMap((g) => g.items.map((i) => i.available))).toEqual([false, false]);
  });

  test("the page name is never a group title", () => {
    const pregled = pregledIzSadrzaja(
      "Demo",
      sadrzaj([sekcija("sc_a", "Predjela", [red("sc_a", artikal("ar_1", "Gibanica"))])], "Kompletan meni"),
      NIKO,
    );
    expect(pregled.groups.map((g) => g.base.title)).not.toContain("Kompletan meni");
    expect(JSON.stringify(pregled)).not.toContain("Kompletan meni");
  });

  test("the price is absent when null, present (even 0) otherwise", () => {
    const pregled = pregledIzSadrzaja(
      "Demo",
      sadrzaj([
        sekcija("sc_a", "Pića", [
          red("sc_a", artikal("ar_1", "Espresso", { cena: null })),
          red("sc_a", artikal("ar_2", "Voda", { cena: 0 })),
          red("sc_a", artikal("ar_3", "Sok", { cena: 240 })),
        ]),
      ]),
      NIKO,
    );
    const [espresso, voda, sok] = pregled.groups[0].items;
    expect("priceRsd" in espresso).toBe(false);
    expect(voda.priceRsd).toBe(0);
    expect(sok.priceRsd).toBe(240);
  });

  test("the description is passed on only when there is one", () => {
    const pregled = pregledIzSadrzaja(
      "Demo",
      sadrzaj([
        sekcija("sc_a", "Predjela", [
          red("sc_a", artikal("ar_1", "Gibanica", { opis: "Topla, sa sirom." })),
          red("sc_a", artikal("ar_2", "Sarma", { opis: null })),
          red("sc_a", artikal("ar_3", "Prebranac", { opis: "" })),
        ]),
      ]),
      NIKO,
    );
    const [a, b, c] = pregled.groups[0].items;
    expect(a.description).toBe("Topla, sa sirom.");
    expect("description" in b).toBe(false);
    expect("description" in c).toBe(false);
  });

  test("the icon is passed on only for mediaMode icon with an icon key", () => {
    const pregled = pregledIzSadrzaja(
      "Demo",
      sadrzaj([
        sekcija("sc_a", "Predjela", [
          red("sc_a", artikal("ar_1", "Kajmak", { medij: "icon", ikonica: "kajmak" })),
          red("sc_a", artikal("ar_2", "Bez slike", { medij: "none", ikonica: "kajmak" })),
          red("sc_a", artikal("ar_3", "Slika", { medij: "image", ikonica: "kajmak" })),
          red("sc_a", artikal("ar_4", "Ikona bez ključa", { medij: "icon", ikonica: null })),
        ]),
      ]),
      NIKO,
    );
    const stavke = pregled.groups[0].items;
    expect(stavke[0].iconKey).toBe("kajmak");
    expect("iconKey" in stavke[1]).toBe(false);
    expect("iconKey" in stavke[2]).toBe(false);
    expect("iconKey" in stavke[3]).toBe(false);
  });

  test("a whole fixture page: only what guests would see", () => {
    const menu = fixtureMenu("srednji");
    const glavna = menu.snapshot.pages.find((p) => p.isDefault)!;
    const radni = sadrzajIzSnapshota(menu.snapshot, glavna.key)!;
    const pregled = pregledIzSadrzaja(menu.venueName, radni, new Set(menu.unavailableArticleKeys));

    expect(pregled.businessName).toBe("Demo restoran");
    expect(pregled.groups.map((g) => g.base.title)).toEqual(radni.sekcije.map((s) => s.naziv));
    const stavke = pregled.groups.flatMap((g) => g.items);
    // The hidden placement stays out; every other row is there.
    const sviRedovi = radni.sekcije.flatMap((s) => s.redovi);
    expect(stavke).toHaveLength(sviRedovi.filter((r) => !r.sakriven).length);
    expect(stavke.map((i) => i.name)).not.toContain("Jagnjetina ispod sača");
    // Live availability: "Riblja čorba" and "Čokoladni sufle" are out right now.
    expect(stavke.filter((i) => !i.available).map((i) => i.name).sort()).toEqual(["Riblja čorba", "Čokoladni sufle"]);
    // An article priced only through variants has no price here.
    const cevapi = stavke.find((i) => i.name === "Ćevapi")!;
    expect("priceRsd" in cevapi).toBe(false);
    expect(stavke.find((i) => i.name === "Gibanica")?.priceRsd).toBe(560);
  });
});
