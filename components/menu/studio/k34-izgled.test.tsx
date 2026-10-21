// K34: Izgled > Za goste lets the venue choose WHICH filters guests get (master §7.2), not only
// whether there are filters. The choice is a list of checkboxes under the switch.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { EditorIzlog } from "@/components/menu/izlog/editor-izlog";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_FILTER_CODES } from "@/lib/menu/filters";
import { parseEditorPreview } from "@/lib/menu/izlog-params";
import { nazivFiltera } from "../javni/alati";
import { ZaGoste } from "./izgled/za-goste";

const t = menuStudioSr.izgled.zaGoste;
const nista = () => {};

function render(filteri: string[], onemoguceno = false) {
  return renderToStaticMarkup(
    <ZaGoste
      pretraga
      filteri={filteri}
      valuta={false}
      onemoguceno={onemoguceno}
      onPretraga={nista}
      onFilteri={nista}
      onValuta={nista}
    />,
  );
}

function checkboxes(html: string) {
  return [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0]);
}

describe("K34: the filter choice in Izgled", () => {
  test("filters off: no choice of filters is shown", () => {
    const html = render([]);
    expect(html).not.toContain("data-filteri-izbor");
    expect(html).not.toContain(t.filteriKoji);
  });

  test("filters on: one checkbox per supported filter, named, the chosen ones checked", () => {
    const html = render(["vegan", "promo"]);
    const fieldset = /<fieldset data-filteri-izbor=""[\s\S]*?<\/fieldset>/.exec(html)?.[0] ?? "";
    expect(fieldset).toContain(`<legend`);
    expect(fieldset).toContain(t.filteriKoji);
    const polja = checkboxes(fieldset);
    expect(polja).toHaveLength(MENU_FILTER_CODES.length);
    expect(polja.filter((polje) => /\schecked=""/.test(polje))).toHaveLength(2);
    for (const kod of MENU_FILTER_CODES) expect(fieldset).toContain(nazivFiltera(kod));
  });

  test("never a price filter among the choices (master §7.2, §20)", () => {
    const html = render([...MENU_FILTER_CODES]);
    expect(html.toLowerCase()).not.toMatch(/raspon|cena od|price/);
  });

  test("read-only editing disables every choice", () => {
    const html = render(["vegan"], true);
    const fieldset = /<fieldset data-filteri-izbor=""[\s\S]*?<\/fieldset>/.exec(html)?.[0] ?? "";
    expect(checkboxes(fieldset).every((polje) => /\sdisabled=""/.test(polje))).toBe(true);
  });
});

// K34: the live preview draws the draft through the public renderer, but the editor's rows carry
// no images, variant prices, promotions, tags or allergens; the note says so instead of letting
// the owner think they are missing. And the note is no longer a fixed id (two previews can show).
describe("K34: the preview note", () => {
  test("names what the live preview does not show, and is not a fixed id", () => {
    const html = renderToStaticMarkup(<EditorIzlog params={parseEditorPreview({})} />);
    const napomena = /<p data-pregled-napomena=""[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? "";
    expect(napomena).toBe(menuStudioSr.pregled.napomena);
    for (const deo of ["Slike", "cene varijanti", "akcije", "oznake", "alergeni"]) expect(napomena).toContain(deo);
    expect(html).not.toContain('id="studio-pregled-napomena"');
  }, 30_000);
});
