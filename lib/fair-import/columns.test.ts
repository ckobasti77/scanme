import { describe, expect, test } from "vitest";
import { detectColumn, detectColumns, mappingProblems, normalizeHeader, parseTargetKey, targetKey } from "./columns";
import { parseImportTable } from "./parse";
import { buildImportTemplateCsv, IMPORT_TEMPLATE_COLUMNS } from "./template";

// Admin UX A5 — header recognition of the catalog import.

describe("fair import column detection (A5)", () => {
  test("normalize: case, diacritics (đ → dj) and punctuation do not matter", () => {
    expect(normalizeHeader("  IZLAGAČ ")).toBe("izlagac");
    expect(normalizeHeader("Proizvođač")).toBe("proizvodjac");
    expect(normalizeHeader("Cena (RSD)")).toBe("cena rsd");
    expect(normalizeHeader("price_text")).toBe("price text");
  });

  test("Serbian and English synonyms, with or without diacritics", () => {
    const cases: [string, string][] = [
      ["Izlagač", "exhibitor"], ["izlagac", "exhibitor"], ["Exhibitor", "exhibitor"],
      ["Brend", "brand"], ["Marka", "brand"], ["BRAND", "brand"], ["Proizvođač", "brand"],
      ["Model", "model"], ["Naziv modela", "model"],
      ["Varijanta", "variant"], ["Verzija", "variant"], ["Version", "variant"],
      ["Cena", "price"], ["Price", "price"], ["Cena (EUR)", "price"],
      ["Paket", "package"], ["Package", "package"], ["package_tier", "package"],
      ["Štand", "standCode"], ["stand", "standCode"], ["Stand code", "standCode"],
      ["Pasoš", "passport"], ["passport_eligible", "passport"],
      ["QR kod", "qr"], ["resolver_code", "qr"],
      ["Paket važi od", "packageFrom"], ["Fotografija", "photoUrl"], ["photo_source", "photoUrl"],
      ["SMK", "smk"], ["sml kod", "sml"], ["Ključ modela", "modelKey"], ["Lokacija na mapi", "mapLocationId"],
    ];
    for (const [header, field] of cases) expect(detectColumn(header), header).toEqual({ kind: "field", field });
  });

  test("specifications: `Spec: Snaga` keeps the label from the header; column pairs by number", () => {
    expect(detectColumn("Spec: Snaga (kW)")).toEqual({ kind: "spec", label: "Snaga (kW)" });
    expect(detectColumn("Specifikacija – Domet")).toEqual({ kind: "spec", label: "Domet" });
    expect(detectColumn("Tehnički podatak: Masa")).toEqual({ kind: "spec", label: "Masa" });
    expect(detectColumn("Spec 1 naziv")).toEqual({ kind: "specLabel", pair: 1 });
    expect(detectColumn("Specifikacija 2")).toEqual({ kind: "specLabel", pair: 2 });
    expect(detectColumn("Spec 1 vrednost")).toEqual({ kind: "specValue", pair: 1 });
    expect(detectColumn("Value 2")).toEqual({ kind: "specValue", pair: 2 });
  });

  test("unknown and empty headers are ignored; a field is mapped once (first column wins)", () => {
    expect(detectColumn("Napomena")).toEqual({ kind: "ignore" });
    expect(detectColumn("")).toEqual({ kind: "ignore" });
    expect(detectColumns(["Model", "Naziv modela", "Spec: A", "Spec: B"])).toEqual([
      { kind: "field", field: "model" },
      { kind: "ignore" },
      { kind: "spec", label: "A" },
      { kind: "spec", label: "B" },
    ]);
  });

  test("manual mapping: the <select> value round-trips; a spec column takes its label from the header", () => {
    for (const target of [{ kind: "ignore" }, { kind: "field", field: "price" }, { kind: "specLabel", pair: 3 }, { kind: "specValue", pair: 3 }] as const) {
      expect(parseTargetKey(targetKey(target), "x")).toEqual(target);
    }
    expect(parseTargetKey("spec", "Snaga")).toEqual({ kind: "spec", label: "Snaga" });
    expect(parseTargetKey("spec", "Spec: Snaga")).toEqual({ kind: "spec", label: "Snaga" });
    expect(parseTargetKey("field:nepoznato", "x")).toEqual({ kind: "ignore" });
    expect(parseTargetKey("spec-label:99", "x")).toEqual({ kind: "ignore" });
  });

  test("mapping problems: no model column, a field twice, half a pair", () => {
    const problems = mappingProblems([{ kind: "field", field: "price" }, { kind: "field", field: "price" }, { kind: "specLabel", pair: 1 }], ["a", "b", "c"]);
    expect(problems).toEqual({ modelMissing: true, duplicateFields: ["price"], incompletePairs: [1], unlabeledSpecColumns: [] });
  });

  test("the downloadable template: every column is recognised, the example row is TEST", () => {
    const table = parseImportTable(buildImportTemplateCsv());
    expect(table.delimiter).toBe(";");
    expect(table.headers).toEqual(IMPORT_TEMPLATE_COLUMNS.map(([header]) => header));
    const targets = detectColumns(table.headers);
    expect(targets.filter((target) => target.kind === "ignore")).toEqual([]);
    expect(mappingProblems(targets, table.headers)).toEqual({ modelMissing: false, duplicateFields: [], incompletePairs: [], unlabeledSpecColumns: [] });
    expect(table.rows).toHaveLength(1);
    for (const value of table.rows[0].cells.filter(Boolean)) expect(value).toMatch(/TEST|^\d|^da$|^Starter$/i);
  });
});
