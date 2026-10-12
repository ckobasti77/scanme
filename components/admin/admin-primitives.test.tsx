import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "./admin-primitives";

// X5 — empty states and errors have one shape: a title (what is empty or did
// not work), a body (why, what is next) and, where it makes sense, an action.

describe("AdminEmptyState", () => {
  test("title, body and no action by default", () => {
    const html = renderToStaticMarkup(<AdminEmptyState title="Nema porudžbina" body="Nove porudžbine se pojavljuju same." />);
    expect(html).toContain("<h2");
    expect(html).toContain("Nema porudžbina");
    expect(html).toContain("Nove porudžbine se pojavljuju same.");
    expect(html).not.toContain("<button");
  });

  test("the action sits under the body", () => {
    const html = renderToStaticMarkup(<AdminEmptyState title="T" body="B" action={<button type="button">Očisti filtere</button>} />);
    expect(html.indexOf("B</p>")).toBeLessThan(html.indexOf("Očisti filtere"));
  });
});

describe("AdminErrorState", () => {
  test("same shape as the empty state, retry only when there is a handler", () => {
    const plain = renderToStaticMarkup(<AdminErrorState title="Zadaci nisu učitani" body="Pokušaj ponovo." />);
    expect(plain).toContain('role="alert"');
    expect(plain).toContain("<h2");
    expect(plain).not.toContain("<button");
    const retry = renderToStaticMarkup(<AdminErrorState title="T" body="B" onRetry={() => undefined} />);
    expect(retry).toContain("<button");
  });
});

describe("AdminLoadingState", () => {
  test("a skeleton by the shape of the content", () => {
    expect(renderToStaticMarkup(<AdminLoadingState />)).toContain('data-shape="panel"');
    const table = renderToStaticMarkup(<AdminLoadingState shape="table" label="Učitavanje liste" />);
    expect(table).toContain('data-shape="table"');
    expect(table).toContain("Učitavanje liste");
    expect(table.match(/h-9/g)?.length).toBe(20);
  });
});
