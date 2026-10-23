import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminViewModeOverride,
  AdminViewToggle,
  type AdminColumn,
  type AdminDataViewProps,
} from "./index";

// Admin UX A1 — SSR markup of the shared Tabela/Kartice view. Interaction
// (clicks, keyboard, storage) is covered by lib/admin-v1/view-mode.test.ts;
// vitest runs without a DOM (edge-runtime).

type Row = { id: string; name: string; city: string | null };
const rows: Row[] = [
  { id: "r1", name: "TEST Žika", city: "Niš" },
  { id: "r2", name: "TEST Ana", city: null },
];
const columns: AdminColumn<Row>[] = [
  { id: "name", header: "Naziv", cell: (row) => row.name, sortValue: (row) => row.name, rowHeader: true },
  { id: "city", header: "Grad", cell: (row) => row.city ?? "—", hideBelow: "xl" },
];

function view(overrides: Partial<AdminDataViewProps<Row>> = {}) {
  return renderToStaticMarkup(
    <AdminDataView
      listKey="test.lista"
      caption="TEST lista"
      rows={rows}
      getRowId={(row) => row.id}
      columns={columns}
      renderCard={(row) => <AdminDataCard title={row.name} badges={<AdminStatus label="TEST aktivan" tone="active" />} fields={[{ label: "Grad", value: row.city ?? "—" }]} />}
      rowActions={(row, context) => <button type="button" data-action={`${row.id}-${context.view}`}>Otvori</button>}
      {...overrides}
    />,
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("AdminDataView (A1)", () => {
  test("without a saved choice both views render and CSS picks Tabela on desktop, Kartice on the phone", () => {
    const html = view();
    expect(html).toContain('data-admin-primitive="data-view"');
    expect(html).toContain('data-view-mode="auto"');
    expect(html).toContain("<table");
    expect(html).toMatch(/role="region"[^>]*class="[^"]*hidden lg:block"/);
    expect(html).toContain("lg:hidden");
    expect(html).toContain('<caption class="sr-only">TEST lista</caption>');
    expect(html).toContain('<ul aria-label="TEST lista"');
  });

  test("the md breakpoint switches earlier", () => {
    const html = view({ autoBreakpoint: "md" });
    expect(html).toContain("hidden md:block");
    expect(html).toContain("md:hidden");
  });

  test("a chosen view renders only that view", () => {
    const table = view({ view: "tabela" });
    expect(table).toContain("<table");
    expect(table).not.toContain('<ul aria-label="TEST lista"');
    expect(table).toContain('data-view-mode="tabela"');
    const cards = view({ view: "kartice" });
    expect(cards).not.toContain("<table");
    expect(cards).toContain('data-admin-primitive="data-card"');
    // The preview override behaves like the URL value.
    const forced = renderToStaticMarkup(<AdminViewModeOverride value="kartice">{
      <AdminDataView listKey="x" caption="X" rows={rows} getRowId={(row) => row.id} columns={columns} renderCard={(row) => row.name} />
    }</AdminViewModeOverride>);
    expect(forced).toContain('data-view-mode="kartice"');
    expect(forced).not.toContain("<table");
  });

  test("the switch is a keyboard radiogroup with icons and text, on the right of the bar", () => {
    const html = view({ view: "kartice", toolbar: <span>TEST filteri</span> });
    expect(html).toContain(`role="radiogroup" aria-label="${adminUiSr.viewToggleLabel}"`);
    expect(count(html, 'role="radio"')).toBe(2);
    expect(html).toMatch(/role="radio" aria-checked="false" tabindex="-1" data-view="tabela"/);
    expect(html).toMatch(/role="radio" aria-checked="true" tabindex="0" data-view="kartice"/);
    expect(html).toContain(adminUiSr.viewTable);
    expect(html).toContain(adminUiSr.viewCards);
    expect(html.indexOf("TEST filteri")).toBeLessThan(html.indexOf('role="radiogroup"'));
    const standalone = renderToStaticMarkup(<AdminViewToggle value="tabela" onChange={() => undefined} />);
    expect(standalone).toMatch(/aria-checked="true" tabindex="0" data-view="tabela"/);
  });

  test("a card and a row offer the same actions", () => {
    const html = view();
    expect(count(html, 'data-action="r1-tabela"')).toBe(1);
    expect(count(html, 'data-action="r1-kartice"')).toBe(1);
    expect(count(html, 'data-action="r2-tabela"')).toBe(1);
    expect(count(html, 'data-action="r2-kartice"')).toBe(1);
  });

  test("sortable headers are buttons; rows, row headers and hidden columns render", () => {
    const html = view({ view: "tabela" });
    expect(html).toContain(`aria-label="Sortiraj po koloni Naziv"`);
    expect(count(html, "Sortiraj po koloni")).toBe(1);
    expect(html).toContain('<th scope="row"');
    expect(html).toContain("hidden xl:table-cell");
    expect(html).toContain("sticky top-0");
    expect(html).toContain("overflow-x-auto");
    expect(html.indexOf("TEST Žika")).toBeLessThan(html.indexOf("TEST Ana"));
  });

  test("a default sort orders rows and marks the header with aria-sort", () => {
    const asc = view({ view: "tabela", defaultSort: { columnId: "name", direction: "asc" } });
    expect(asc).toContain('aria-sort="ascending"');
    expect(asc.indexOf("TEST Ana")).toBeLessThan(asc.indexOf("TEST Žika"));
    const desc = view({ view: "kartice", defaultSort: { columnId: "name", direction: "desc" } });
    expect(desc.indexOf("TEST Žika")).toBeLessThan(desc.indexOf("TEST Ana"));
  });

  test("loading, empty and error states use the existing primitives", () => {
    expect(view({ rows: undefined })).toContain('data-admin-primitive="loading"');
    const empty = view({ rows: [], empty: { title: "TEST prazno", body: "TEST nema stavki" } });
    expect(empty).toContain('data-admin-primitive="empty"');
    expect(empty).toContain("TEST prazno");
    expect(empty).toContain('role="radiogroup"');
    const error = view({ error: { title: "TEST greška" } });
    expect(error).toContain('data-admin-primitive="error"');
    expect(error).toContain("TEST greška");
    expect(error).not.toContain("<table");
  });

  test("row details render under the row and inside the card", () => {
    const html = view({ rowDetail: (row) => (row.id === "r1" ? <p>TEST detalj</p> : null) });
    expect(count(html, "TEST detalj")).toBe(2);
    expect(html).toContain('colSpan="3"');
  });
});
