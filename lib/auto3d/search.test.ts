import { describe, expect, test } from "vitest";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { PARTS } from "./catalog";
import { catalogDocs, fold, queryTokens, searchParts, type SearchDoc } from "./search";

const docs = catalogDocs(
  (id) => delovi.parts[id].name,
  (id) => delovi.systems[id].name,
);

const names = (ids: readonly string[]) => ids.map((id) => delovi.parts[id as keyof typeof delovi.parts].name);

describe("pretraga delova bez dijakritika", () => {
  test("č i ć → c, š → s, ž → z, đ → dj i d", () => {
    expect(fold("Čeljust ćošak Šasija Žica")).toBe("celjust cosak sasija zica");
    expect(fold("Hlađenje")).toBe("hladjenje");
    expect(fold("Hlađenje", "d")).toBe("hladenje");
    expect(fold("Felna 21″, R21")).toBe("felna 21 r21");
  });

  test("„kocnica“ nalazi delove sa „Kočnica/kočnice/kočnicom“ i grupu Kočnice", () => {
    const hits = searchParts(docs, "kocnica");
    expect(hits).toContain("kocioni_modul"); // „Servo kočnice i ABS/ESP modul“
    expect(hits).toContain("celjust_zadnja"); // „… ručnom kočnicom“
    expect(hits).toContain("disk_prednji"); // grupa „Kočnice i točkovi“
    expect(searchParts(docs, "Kočnica")).toEqual(hits);
  });

  test("đ se piše kao dj ili d", () => {
    expect(searchParts(docs, "hladj")).toContain("hladnjak"); // grupa „Hlađenje“
    expect(searchParts(docs, "hladen")).toContain("creva_hladjenja");
    expect(searchParts(docs, "hlađen")).toContain("creva_hladjenja");
  });

  test("turbo, sa i bez dijakritika", () => {
    expect(searchParts(docs, "turbo")[0]).toBe("turbopunjac");
    expect(searchParts(docs, "TURBOPUNJAC")).toEqual(["turbopunjac"]);
    expect(searchParts(docs, "turbopunjač")).toEqual(["turbopunjac"]);
  });

  test("više reči su AND", () => {
    const hits = searchParts(docs, "prednji disk");
    expect(hits).toEqual(["disk_prednji"]);
    expect(searchParts(docs, "zadnja felna")).toEqual(["felna_zadnja"]);
    expect(searchParts(docs, "felna kardan")).toEqual([]);
  });

  test("pogodak po nazivu sistema", () => {
    const hits = searchParts(docs, "vesanje");
    expect(hits.length).toBe(PARTS.filter((p) => p.system === "vesanje").length);
  });

  test("početak naziva ide pre sredine", () => {
    const sample: SearchDoc[] = [
      { id: "karter", name: "Prednji disk", system: "X" },
      { id: "hauba", name: "Disk", system: "X" },
      { id: "krov", name: "Ventilisani disk", system: "X" },
      { id: "prag", name: "Kardisk", system: "X" },
    ];
    expect(names(searchParts(sample, "disk"))).toEqual(names(["hauba", "karter", "krov", "prag"]));
  });

  test("prazan upit vraća sve delove redom", () => {
    expect(searchParts(docs, "")).toEqual(PARTS.map((p) => p.id));
    expect(searchParts(docs, "   ")).toEqual(PARTS.map((p) => p.id));
  });

  test("reči upita: osnova bez završnog samoglasnika samo za 4+ slova", () => {
    expect(queryTokens("Kočnica far gume")).toEqual(["kocnic", "far", "gum"]);
  });

  test("ćirilica se čita kao latinica (A13)", () => {
    expect(fold("Кочнице ЂУБРЕ љуска џеп")).toBe("kocnice djubre ljuska dzep");
    expect(searchParts(docs, "кочнице")).toEqual(searchParts(docs, "kočnice"));
    expect(searchParts(docs, "турбо")[0]).toBe("turbopunjac");
    // Latinični digrafi kao jedan znak (ǉ, ǌ, ǆ) rastavljaju se na dva slova.
    expect(fold("ǉuska ǌiva ǆep")).toBe("ljuska njiva dzep");
    // Upit na ćirilici nije prazan upit: ne vraća sve delove.
    expect(searchParts(docs, "кочнице").length).toBeLessThan(PARTS.length);
  });

  test("množina na -ovi/-evi traži osnovu (A13)", () => {
    expect(queryTokens("diskovi farovi kočnice")).toEqual(["disk", "far", "kocnic"]);
    expect(searchParts(docs, "diskovi")).toEqual(expect.arrayContaining(["disk_prednji", "disk_zadnji"]));
    expect(searchParts(docs, "farovi")).toContain("far");
  });

  test("broj sa jedinicom bez razmaka", () => {
    expect(searchParts(docs, "48v")).toContain("baterija_48v");
    expect(searchParts(docs, "48 V")).toContain("starter_generator");
  });
});
