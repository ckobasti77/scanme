// K34 (master §13.4, ZAKLJUČANO): "Tablet koristi strukturu u draweru, centralni radni prostor i
// preview kao preklop." At 1024–1279 px (`siroko`, landscape tablets) the editor used to keep the
// structure as a column; now only the desktop (≥ 1280 px) has it. The width hook is mocked, since
// server markup always renders the desktop.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { parseEditorPreview } from "@/lib/menu/izlog-params";

const sirina = vi.hoisted(() => ({ vrednost: "siroko" as "desktop" | "siroko" | "usko" }));
vi.mock("./shell/use-sirina", () => ({ useSirina: () => sirina.vrednost }));

function render(sirinaProzora: "desktop" | "siroko" | "usko", query: Record<string, string> = {}) {
  sirina.vrednost = sirinaProzora;
  return renderToStaticMarkup(<EditorIzlog params={parseEditorPreview(query)} />);
}

describe("K34: the editor on a tablet keeps the structure in the drawer", () => {
  test("1024–1279 px: the structure opens from the drawer button, there is no structure column", () => {
    const html = render("siroko");
    expect(html).toContain('data-studio="siroko"');
    expect(html.match(/data-struktura-dugme=""/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("grid-cols-[17rem_minmax(0,1fr)]");
  }, 30_000);

  test("768–1023 px: the same drawer, as before", () => {
    const html = render("usko");
    expect(html.match(/data-struktura-dugme=""/g) ?? []).toHaveLength(1);
  }, 30_000);

  test("desktop: the structure is a column again and there is no drawer button", () => {
    const html = render("desktop");
    expect(html).not.toContain("data-struktura-dugme");
    expect(html).toContain("grid-cols-[17rem_minmax(0,1fr)_24rem]");
  }, 30_000);

  test("Izgled on a wide tablet keeps its side preview (no page structure there at all)", () => {
    const html = render("siroko", { tab: "izgled" });
    expect(html).not.toContain("data-struktura-dugme");
    expect(html).toContain("grid-cols-[minmax(0,1fr)_21rem]");
  }, 30_000);
});
