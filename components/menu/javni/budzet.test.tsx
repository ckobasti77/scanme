// K14 performance budget of the public menu (plan K12 §7.2): HTML size,
// gzip, DOM elements and the props of the one client boundary, for a small
// (≈ 20 articles, `fixtureMenu("mali")`) and a large (≈ 400, `fixtureMenu("veliki")`)
// menu in all three layouts, through the REAL renderer over the izlog
// fixtures. No Convex deployment and no browser: the page HTML is estimated
// as the server markup + the props as the RSC payload carries them (a JSON
// string inside the page) + the shell of the root layout, measured once from
// the production build (MENU_LJUSKA_B). The numbers are printed for the
// recipe and the progress log; real production measurement stays for Jovan.

import { gzipSync } from "node:zlib";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { javniIzlog } from "@/components/menu/fixtures/javni";
import { JavniIzlog } from "@/components/menu/izlog/javni-izlog";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { parsePublicPreview } from "@/lib/menu/izlog-params";
import { brojArtikala } from "@/lib/menu/public-view";

vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img">) =>
    createElement("img", {
      src: props.src,
      alt: props.alt,
      width: props.width,
      height: props.height,
      sizes: props.sizes,
      className: props.className,
      loading: props.loading,
    }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => createElement("a", { href, ...rest }, children),
}));

/**
 * The root layout's own HTML around a page (head, fonts, scripts, the RSC
 * bootstrap), measured from `.next/server/app/_not-found.html` after
 * `npm run build` in K14 (rounded up). Recorded in the recipe.
 */
const MENU_LJUSKA_B = 16_000;

type Velicina = "mali" | "veliki";
type Layout = "tok" | "kategorije" | "kompaktno";

/** Plan K12 §7.2. */
const BUDZET = {
  mali: { htmlB: 80_000, gzipB: 20_000, elementi: 1_000, propsB: 20_000 },
  veliki: { htmlB: 600_000, gzipB: 110_000, elementi: 8_000, propsB: 220_000 },
} as const;
const VELIKI_ELEMENTI: Record<Layout, number> = { tok: 8_000, kompaktno: 5_000, kategorije: 600 };

function meri(velicina: Velicina, layout: Layout, dodatno: Record<string, string> = {}) {
  const params = parsePublicPreview({
    primer: "kafic",
    layout,
    ...(velicina === "veliki" ? { stanje: "veliki" } : {}),
    ...dodatno,
  });
  const prikaz = javniIzlog(params);
  if (prikaz.vrsta !== "stranica") throw new Error("expected a page");
  const markup = renderToStaticMarkup(<JavniIzlog params={params} />);
  const props = JSON.stringify({
    view: prikaz.view,
    izgled: javniIzgled(prikaz.presentation),
    slike: prikaz.slike,
    sadaMs: prikaz.sadaMs,
    nedostupni: prikaz.nedostupni,
    kurs: prikaz.kurs,
  });
  // The RSC payload carries the props once more, as an escaped string in a script.
  const html = `${markup}${JSON.stringify(props)}`;
  const htmlB = Buffer.byteLength(html, "utf8") + MENU_LJUSKA_B;
  const gzipB = gzipSync(html).length + Math.round(MENU_LJUSKA_B / 3);
  const elementi = (markup.match(/<[a-zA-Z]/g) ?? []).length;
  const propsB = Buffer.byteLength(props, "utf8");
  const artikli = brojArtikala(prikaz.view.sekcije);
  console.info(
    `[K14 budzet] ${velicina} ${layout}${Object.keys(dodatno).length ? ` ${new URLSearchParams(dodatno)}` : ""}: ` +
      `artikli=${artikli} html=${(htmlB / 1000).toFixed(1)} KB gzip=${(gzipB / 1000).toFixed(1)} KB ` +
      `elementi=${elementi} props=${(propsB / 1000).toFixed(1)} KB`,
  );
  return { htmlB, gzipB, elementi, propsB, artikli };
}

describe("public menu performance budget (plan K12 §7.2)", () => {
  for (const layout of ["tok", "kategorije", "kompaktno"] as const) {
    test(`mali meni, ${layout}: within the small budget`, () => {
      const m = meri("mali", layout);
      expect(m.artikli).toBeGreaterThanOrEqual(15);
      expect(m.artikli).toBeLessThanOrEqual(30);
      expect(m.htmlB).toBeLessThanOrEqual(BUDZET.mali.htmlB);
      expect(m.gzipB).toBeLessThanOrEqual(BUDZET.mali.gzipB);
      expect(m.elementi).toBeLessThanOrEqual(BUDZET.mali.elementi);
      expect(m.propsB).toBeLessThanOrEqual(BUDZET.mali.propsB);
    });

    test(`veliki meni, ${layout}: within the large budget`, () => {
      const m = meri("veliki", layout);
      expect(m.artikli).toBeGreaterThanOrEqual(350);
      expect(m.htmlB).toBeLessThanOrEqual(BUDZET.veliki.htmlB);
      expect(m.gzipB).toBeLessThanOrEqual(BUDZET.veliki.gzipB);
      expect(m.elementi).toBeLessThanOrEqual(VELIKI_ELEMENTI[layout]);
      expect(m.propsB).toBeLessThanOrEqual(BUDZET.veliki.propsB);
    });
  }

  test("veliki meni, the worst case (Tok with an icon on every row, allergens marked, EUR shown)", () => {
    const m = meri("veliki", "tok", { mediji: "ikonica", alergen: "mleko,gluten", valuta: "eur" });
    expect(m.htmlB).toBeLessThanOrEqual(BUDZET.veliki.htmlB);
    expect(m.gzipB).toBeLessThanOrEqual(BUDZET.veliki.gzipB);
    expect(m.elementi).toBeLessThanOrEqual(BUDZET.veliki.elementi);
    expect(m.propsB).toBeLessThanOrEqual(BUDZET.veliki.propsB);
  });
});
