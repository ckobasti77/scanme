import { describe, expect, test } from "vitest";
import { detectColumns } from "./columns";
import { parseImportTable } from "./parse";
import { buildImportTemplateCsv } from "./template";
import { buildImportPayload, locateImportIssue, parsePackageFrom, parseTier, parseYesNo, type ImportCatalogContext } from "./to-payload";

// Admin UX A5 — pasted table → import JSON v1 (contract §12, unchanged).

const context: ImportCatalogContext = {
  eventCode: "test-em26",
  participations: [
    { id: "p-a", externalKey: "test-em26-izlagac-a", exhibitorName: "TEST Izlagač A", smkCode: "SMK-TEST-FAIR-A", smlCode: "SML-TEST-FAIR-A" },
    { id: "p-b", externalKey: "test-em26-izlagac-b", exhibitorName: "TEST Izlagač B", smkCode: "SMK-TEST-FAIR-B", smlCode: "SML-TEST-FAIR-B" },
  ],
  stands: [
    { id: "s-a1", participationId: "p-a", externalKey: "test-em26-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "test-loc-em-a1" },
  ],
  models: [{ externalKey: "test-em26-volta-x1", participationId: "p-a", brandName: "TEST Volta", displayName: "TEST Volta X1", variant: "TEST Premium" }],
};

function build(text: string, defaults = {}) {
  const table = parseImportTable(text);
  return buildImportPayload(table.rows, detectColumns(table.headers), context, defaults);
}

describe("fair import table → payload (A5)", () => {
  test("rows group into participation → brand (+ stand) → models; specifications are ordered pairs in column order", () => {
    const result = build([
      "Izlagač\tBrend\tŠtand\tModel\tVarijanta\tCena\tPaket\tPasoš\tSpec: Snaga\tSpec 1 naziv\tSpec 1 vrednost\tSpec: Domet",
      "TEST Izlagač A\tTEST Volta\tTEST-A1\tTEST Volta X2\t\tTEST cena\tStarter\tda\tTEST 150 kW\tTEST Pogon\tTEST zadnji\tTEST 400 km",
      "test izlagac a\tTEST Volta\tTEST-A1\tTEST Volta X3\tTEST LR\tTEST cena\tnapredni\tne\t\t\t\tTEST 500 km",
    ].join("\n"));
    expect(result.issues).toEqual([]);
    expect(result.payload).toEqual({
      version: 1,
      eventCode: "test-em26",
      participations: [{
        externalKey: "test-em26-izlagac-a",
        accountExternalKey: "SMK-TEST-FAIR-A",
        businessExternalKey: "SML-TEST-FAIR-A",
        brands: [{
          externalKey: "test-volta",
          name: "TEST Volta",
          stand: { externalKey: "test-em26-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "test-loc-em-a1" },
          models: [
            {
              externalKey: "test-em26-test-volta-test-volta-x2",
              displayName: "TEST Volta X2",
              priceText: "TEST cena",
              packageTier: "starter",
              specifications: [
                { label: "Snaga", value: "TEST 150 kW", order: 1 },
                { label: "TEST Pogon", value: "TEST zadnji", order: 2 },
                { label: "Domet", value: "TEST 400 km", order: 3 },
              ],
              passportEligible: true,
            },
            {
              externalKey: "test-em26-test-volta-test-volta-x3-test-lr",
              displayName: "TEST Volta X3",
              variant: "TEST LR",
              priceText: "TEST cena",
              packageTier: "advanced",
              specifications: [{ label: "Domet", value: "TEST 500 km", order: 1 }],
              passportEligible: false,
            },
          ],
        }],
      }],
    });
  });

  test("an empty price is left out (the backend writes the contract fallback with a warning), never invented", () => {
    const result = build("Izlagač;Brend;Štand;Model;Cena;Paket;Pasoš\nTEST Izlagač A;TEST Volta;TEST-A1;TEST Volta X9;;Starter;da\n");
    const model = result.payload.participations[0].brands[0].models[0];
    expect(model).not.toHaveProperty("priceText");
    expect(result.rows[0].price).toBe("");
    expect(result.skipped).toBe(0);
  });

  test("the same model as in the event keeps its externalKey (a second import updates, does not duplicate)", () => {
    const result = build("Izlagač;Brend;Štand;Model;Varijanta;Paket;Pasoš\nTEST Izlagač A;test volta;TEST-A1;TEST Volta X1;TEST Premium;Napredni;da\n");
    expect(result.payload.participations[0].brands[0].models[0].externalKey).toBe("test-em26-volta-x1");
  });

  test("defaults fill columns the exhibitor's table does not have; a cell wins over its default", () => {
    const result = build("Model\tPaket\nTEST Volta X5\t\nTEST Volta X6\tNapredni\n", {
      participationId: "p-a", brand: "TEST Volta", standId: "s-a1", tier: "starter", passport: true, packageFrom: "2026-10-09 09:00",
    });
    expect(result.issues).toEqual([]);
    const models = result.payload.participations[0].brands[0].models;
    expect(models.map((model) => model.packageTier)).toEqual(["starter", "advanced"]);
    expect(models[0].packageActiveFrom).toBe("2026-10-09T07:00:00.000Z");
  });

  test("row problems are reported per row and column, and only those rows are skipped", () => {
    const result = build([
      "Izlagač;Brend;Štand;Model;Paket;Pasoš",
      "TEST Izlagač A;TEST Volta;TEST-A1;TEST Volta X7;Starter;da",
      "TEST Nepoznat;TEST Volta;TEST-A1;TEST Volta X8;Platinum;",
      "TEST Izlagač B;TEST Om;TEST-NOVI;;Starter;da",
      "TEST Izlagač A;TEST Volta;TEST-A1;TEST Volta X7;Starter;da",
    ].join("\n"));
    expect(result.issues).toEqual([
      { line: 3, field: "exhibitor", code: "IMPORT_EXHIBITOR_UNKNOWN", severity: "error" },
      { line: 3, field: "package", code: "IMPORT_PACKAGE_INVALID", severity: "error" },
      { line: 3, field: "passport", code: "IMPORT_PASSPORT_MISSING", severity: "error" },
      { line: 4, field: "model", code: "IMPORT_MODEL_MISSING", severity: "error" },
      { line: 4, field: "mapLocationId", code: "IMPORT_STAND_LOCATION_MISSING", severity: "error" },
      { line: 5, field: "modelKey", code: "IMPORT_DUPLICATE_MODEL", severity: "error" },
    ]);
    expect(result.skipped).toBe(3);
    expect(result.payload.participations[0].brands[0].models.map((model) => model.displayName)).toEqual(["TEST Volta X7"]);
  });

  test("new exhibitor by SMK + SML, new stand with its map location; one brand on two stands gets two keys", () => {
    const result = build([
      "Izlagač,SMK,SML,Brend,Štand,Lokacija na mapi,Model,Paket,Pasoš",
      "TEST Novi,smk-test-novi,SML-TEST-NOVI,TEST Kulon,TEST-N1,test-loc-n1,TEST K1,Starter,da",
      "TEST Novi,SMK-TEST-NOVI,SML-TEST-NOVI,TEST Kulon,TEST-N2,test-loc-n2,TEST K2,Starter,da",
    ].join("\n"));
    const [participation] = result.payload.participations;
    expect(participation.externalKey).toBe("test-em26-test-novi");
    expect(participation.accountExternalKey).toBe("SMK-TEST-NOVI");
    expect(participation.brands.map((brand) => [brand.externalKey, brand.stand.externalKey, brand.stand.mapLocationId])).toEqual([
      ["test-kulon-test-n1", "test-em26-stand-test-n1", "test-loc-n1"],
      ["test-kulon-test-n2", "test-em26-stand-test-n2", "test-loc-n2"],
    ]);
  });

  test("a value without its specification label is a warning; the row is still imported", () => {
    const result = build("Izlagač;Brend;Štand;Model;Paket;Pasoš;Spec 1 naziv;Spec 1 vrednost\nTEST Izlagač A;TEST Volta;TEST-A1;TEST X;Starter;da;;TEST 5\n");
    expect(result.issues).toEqual([{ line: 2, field: "specifications", code: "IMPORT_SPEC_LABEL_MISSING", severity: "warning" }]);
    expect(result.payload.participations[0].brands[0].models[0].specifications).toEqual([]);
  });

  test("the template's TEST row converts without a problem", () => {
    const result = build(buildImportTemplateCsv());
    expect(result.issues).toEqual([]);
    expect(result.payload.participations).toHaveLength(1);
  });

  test("dry-run errors are shown per row: an issue path → the row and field it came from", () => {
    const result = build([
      "Izlagač;Brend;Štand;Model;Paket;Pasoš",
      "TEST Izlagač A;TEST Volta;TEST-A1;TEST Volta X2;Starter;da",
      "TEST Izlagač B;TEST Om;TEST-A1;TEST Om Z1;Starter;da",
      "TEST Izlagač A;TEST Volta;TEST-A1;TEST Volta X3;Starter;da",
    ].join("\n"));
    const { trace } = result;
    expect(locateImportIssue("participations[0].brands[0].models[1].priceText", trace)).toEqual({ line: 4, field: "price" });
    expect(locateImportIssue("participations[0].brands[0].models[0].specifications[2].label", trace)).toEqual({ line: 2, field: "specifications" });
    expect(locateImportIssue("participations[1].brands[0].stand.mapLocationId", trace)).toEqual({ line: 3, field: "mapLocationId" });
    expect(locateImportIssue("participations[1].brands[0].stand", trace)).toEqual({ line: 3, field: "standCode" });
    expect(locateImportIssue("participations[1].brands[0].name", trace)).toEqual({ line: 3, field: "brand" });
    expect(locateImportIssue("participations[1].accountExternalKey", trace)).toEqual({ line: 3, field: "smk" });
    expect(locateImportIssue("participations[1]", trace)).toEqual({ line: 3, field: "exhibitor" });
    expect(locateImportIssue("eventCode", trace)).toEqual({ line: null, field: null });
  });

  test("cell values: package names, yes/no, package start as ISO or a Belgrade wall clock", () => {
    expect([parseTier("Za sve izlagače"), parseTier("STARTER"), parseTier("Napredni"), parseTier("Premium")]).toEqual(["included", "starter", "advanced", null]);
    expect([parseYesNo("Da"), parseYesNo("NE"), parseYesNo("yes"), parseYesNo("x"), parseYesNo("možda")]).toEqual([true, false, true, true, null]);
    expect(parsePackageFrom("2026-10-09T09:00:00+02:00")).toBe("2026-10-09T09:00:00+02:00");
    expect(parsePackageFrom("9.10.2026. 09:00")).toBe("2026-10-09T07:00:00.000Z");
    expect(parsePackageFrom("2026-11-01")).toBe("2026-10-31T23:00:00.000Z");
    expect(parsePackageFrom("31.2.2026.")).toBeNull();
    expect(parsePackageFrom("sutra")).toBeNull();
  });
});
