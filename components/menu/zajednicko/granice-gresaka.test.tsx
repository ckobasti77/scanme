// K33 render tests: the error boundaries of the Menu routes. Each one is
// announced (role="alert"), has exactly one h1, says what failed and offers
// "Pokušaj ponovo"; the public menu boundary stays neutral (no panel tokens).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import JavniMeniGreska from "@/app/[slug]/meni/error";
import MenuEditorGreska from "@/app/[slug]/meni/editor/error";
import KonobarGreska from "@/app/[slug]/konobar/error";
import MenuPanelSekcijaGreska from "@/app/[slug]/client-panel/meni/error";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";

const props = { error: Object.assign(new Error("x"), { digest: "d" }), unstable_retry: () => {} };
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("granice grešaka Menu ruta (K33)", () => {
  test("javni meni: neutralan ekran, jedan h1, najava i Pokušaj ponovo", () => {
    const html = renderToStaticMarkup(<JavniMeniGreska {...props} />);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain('role="alert"');
    expect(html).toContain(menuJavniSr.stanja.greskaNaslov);
    expect(html).toContain(menuJavniSr.stanja.pokusajPonovo);
    expect(html).not.toContain("--mp-");
    expect(html).not.toContain("x</");
  });

  test("konobarski panel: površina konobara, jedan h1, najava", () => {
    const html = renderToStaticMarkup(<KonobarGreska {...props} />);
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain('data-povrsina="konobar"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(menuKonobarSr.greska.panelNaslov);
    expect(html).toContain(menuZajednickoSr.stanja.pokusajPonovo);
  });

  test("stari editor i sekcija panela: greška panela, ne tekst za gosta", () => {
    for (const html of [renderToStaticMarkup(<MenuEditorGreska {...props} />), renderToStaticMarkup(<MenuPanelSekcijaGreska {...props} />)]) {
      expect(html).toContain('role="alert"');
      expect(html).toContain(menuPanelSr.stanja.greskaNaslov);
      expect(html).not.toContain(menuJavniSr.stanja.greskaOpis);
    }
    expect(count(renderToStaticMarkup(<MenuEditorGreska {...props} />), "<h1")).toBe(1);
    expect(count(renderToStaticMarkup(<MenuPanelSekcijaGreska {...props} />), "<h1")).toBe(1);
  });
});
