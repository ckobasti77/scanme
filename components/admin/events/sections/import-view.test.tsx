import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AdminViewModeOverride } from "@/components/admin/admin-ui";
import { detectColumns } from "@/lib/fair-import/columns";
import { parseImportTable } from "@/lib/fair-import/parse";
import { buildImportPayload, type ImportCatalogContext } from "@/lib/fair-import/to-payload";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventImportView, ImportIssuesList, importIssueRows } from "./import-view";

// Admin UX A5 — the import guide: source, mapping (auto + manual), preview
// with the dry run, errors per row and column. SSR markup; the dry run runs
// in an effect, so its rows are checked through importIssueRows.

const guide = adminEventsSr.importGuide;
const context: ImportCatalogContext = {
  eventCode: "test-em26",
  participations: [{ id: "p-a", externalKey: "test-em26-izlagac-a", exhibitorName: "TEST Izlagač A", smkCode: "SMK-TEST-FAIR-A", smlCode: "SML-TEST-FAIR-A" }],
  stands: [{ id: "s-a1", participationId: "p-a", externalKey: "test-em26-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "test-loc-em-a1" }],
  models: [],
};
const TABLE = [
  "Izlagač\tMarka\tŠtand\tNaziv modela\tCena\tPaket\tPasoš\tSpec: Snaga\tNapomena",
  "TEST Izlagač A\tTEST Volta\tTEST-A1\tTEST Volta X1\tTEST cena\tStarter\tda\tTEST 150 kW\tTEST",
  "TEST Izlagač A\tTEST Volta\tTEST-A1\tTEST Volta X2\t\tPlatinum\tda\t\t",
].join("\n");
const actions = { dryRun: async () => ({ ok: false as const, code: "ACTION_FAILED" }), commit: async () => ({ ok: false as const, code: "ACTION_FAILED" }) };

function render(step: "izvor" | "mapiranje" | "pregled", text = TABLE) {
  return renderToStaticMarkup(
    <AdminViewModeOverride value="tabela">
      <EventImportView context={context} actions={actions} initial={{ text, step }} />
    </AdminViewModeOverride>,
  );
}

describe("A5 import guide", () => {
  test("four steps with the current one marked; source kinds include JSON v1 as advanced; template and format help", () => {
    const markup = render("izvor");
    expect(markup).toContain(`aria-label="${guide.stepsAria}"`);
    for (const label of Object.values(guide.steps)) expect(markup).toContain(label);
    expect(markup).toMatch(/aria-current="step"[^>]*>.*?Izvor/);
    for (const label of Object.values(guide.sourceKinds)) expect(markup).toContain(label);
    expect(markup).toContain(guide.template);
    expect(markup).toContain(guide.formatTitle);
    expect(markup).toContain("Prepoznato: 2 redova i 9 kolona (separator: tab).");
  });

  test("mapping: headers recognised by synonym (auto badge), unknown column ignored, every column has its own select", () => {
    const markup = render("mapiranje");
    const selects = markup.match(/<select aria-label="Polje importa za kolonu[\s\S]*?<\/select>/g) ?? [];
    expect(selects).toHaveLength(9);
    const selected = (column: string) => selects.find((select) => select.includes(`kolonu ${column}"`))?.match(/<option value="([^"]+)" selected=""/)?.[1];
    expect(selected("Izlagač")).toBe("field:exhibitor");
    expect(selected("Marka")).toBe("field:brand");
    expect(selected("Naziv modela")).toBe("field:model");
    expect(selected("Spec: Snaga")).toBe("spec");
    expect(selected("Napomena")).toBe("ignore");
    expect(markup).toContain(guide.autoDetected);
    expect(markup).toContain(guide.defaultsTitle);
    expect(markup).not.toContain(guide.problemModelMissing);
  });

  test("a table without a model column cannot go on", () => {
    const markup = render("mapiranje", "Izlagač\tCena\nTEST Izlagač A\tTEST cena");
    expect(markup).toContain(guide.problemModelMissing);
  });

  test("preview: first rows after mapping, skipped rows marked, the dry run is in progress, nothing written yet", () => {
    const markup = render("pregled");
    expect(markup).toContain(guide.previewCaption);
    expect(markup).toContain("TEST Volta X1");
    expect(markup).toContain(guide.priceFallback);
    expect(markup).toContain(guide.rowSkipped);
    expect(markup).toContain(guide.rowReady);
    expect(markup).toContain(guide.checking);
    expect(markup).toContain(guide.rowIssues.IMPORT_PACKAGE_INVALID);
    expect(markup).not.toMatch(/IMPORT_[A-Z_]+|FAIR_[A-Z_]+/);
  });

  test("dry-run errors are shown per row and column, after table problems of the same row, document issues first", () => {
    const table = parseImportTable(TABLE);
    const targets = detectColumns(table.headers);
    const build = buildImportPayload(table.rows, targets, context, {});
    const rows = importIssueRows(build, [
      { severity: "warning", code: "FAIR_PHOTO_MISSING", path: "participations[0].brands[0].models[0].photoUrl" },
      { severity: "error", code: "FAIR_SLUG_TAKEN", path: "participations[0].brands[0].models[0].slug" },
      { severity: "error", code: "FAIR_LINK_NOT_FOUND", path: "participations[0].brands[0].name" },
      { severity: "error", code: "FAIR_IMPORT_TOO_LARGE", path: "participations" },
    ], targets, table.headers);
    expect(rows.map((row) => [row.line, row.column, row.severity, row.text])).toEqual([
      [null, guide.wholeImport, "error", adminEventsSr.issues.FAIR_IMPORT_TOO_LARGE],
      [2, "Naziv modela", "error", adminEventsSr.issues.FAIR_SLUG_TAKEN],
      [2, "Marka", "error", adminEventsSr.issues.FAIR_LINK_NOT_FOUND],
      [2, "URL fotografije · nema kolone", "warning", adminEventsSr.issues.FAIR_PHOTO_MISSING],
      [3, "Paket", "error", guide.rowIssues.IMPORT_PACKAGE_INVALID],
    ]);
    const markup = renderToStaticMarkup(<AdminViewModeOverride value="tabela"><ImportIssuesList rows={rows} /></AdminViewModeOverride>);
    for (const text of [guide.colLine, guide.colColumn, guide.colProblem, "Naziv modela", adminEventsSr.issues.FAIR_SLUG_TAKEN, guide.rowIssues.IMPORT_PACKAGE_INVALID, adminEventsSr.severityError]) {
      expect(markup).toContain(text);
    }
  });
});
