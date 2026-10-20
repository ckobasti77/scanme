// K20 tests of the floor layout editor "Raspored". No DOM in the edge-runtime
// environment: the surfaces are checked as renderToStaticMarkup strings, and
// everything that moves (keys, dragging, optimistic layouts) lives in the pure
// helpers of raspored-logika.ts, tested here with the grid rules of
// lib/menu/floor-layout.ts. Invented data only (Demo restoran).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuLokalRasporedSr as t } from "@/lib/i18n/sr/menu-lokal-raspored";
import { FLOOR_MIN_ROWS, type FloorLayout } from "@/lib/menu/floor-layout";
import type { LokalPozicija, LokalRadnje, LokalZona } from "@/lib/menu/lokal/model";
import { Raspored } from "./raspored";
import {
  BEZ_ZONE_KLJUC,
  brojMesta,
  brojSedista,
  efektivniRasporedi,
  geometrija,
  najavaPromene,
  ocistiPreklapanja,
  opisMesta,
  planCuvanja,
  pikseliUCelije,
  polozajTekst,
  pomerajUCelije,
  potvrdiPreklapanja,
  povrsiRasporeda,
  prebaciIzbor,
  prikazMesta,
  prikvaciPomeraj,
  primeniPreklapanja,
  primeniTaster,
  putanjaMreze,
  redosledCitanja,
  redoviPovrsi,
  skratiOznaku,
  susedUSmeru,
  tekstGreske,
  velicinaTekst,
  vratiPreklapanja,
  type Preklapanja,
  type Preklapanje,
} from "./raspored-logika";

// --- Data ---------------------------------------------------------------------------

const L = (x: number, y: number, w: number, h: number, shape: FloorLayout["shape"] = "rect"): FloorLayout => ({
  x,
  y,
  w,
  h,
  shape,
});

const zona = (id: string, name: string, order: number): LokalZona => ({ id, key: id, name, order });

const mesto = (id: string, label: string, preko: Partial<LokalPozicija> = {}): LokalPozicija => ({
  id,
  key: id,
  kind: "table",
  label,
  seats: 4,
  zoneId: null,
  layout: null,
  order: 0,
  ...preko,
});

const ZONE = [zona("z-sala", "Glavna sala", 0), zona("z-terasa", "Terasa", 1), zona("z-vip", "VIP", 2)];

const POZICIJE: LokalPozicija[] = [
  mesto("p-1", "Sto 1", { seats: 2, zoneId: "z-sala", layout: L(6, 2, 3, 2), order: 0 }),
  mesto("p-2", "Sto 2", { seats: 2, zoneId: "z-sala", layout: L(12, 2, 2, 2, "round"), order: 1 }),
  mesto("p-3", "Sto 3", { seats: 4, zoneId: "z-sala", layout: L(0, 5, 4, 2), order: 2 }),
  mesto("p-9", "Sto 9", { zoneId: "z-terasa", layout: L(1, 1, 3, 2), order: 3 }),
  mesto("p-sank", "Šank", { kind: "other", seats: null, order: 4 }),
  mesto("p-soba", "Soba 101", { kind: "room", seats: null, order: 5 }),
];

const RADNJE: Pick<LokalRadnje, "setLayout" | "setLayouts"> = {
  setLayout: async () => ({ ok: true }),
  setLayouts: async () => ({ ok: true }),
};

const render = (zones: LokalZona[], positions: LokalPozicija[]) =>
  renderToStaticMarkup(
    <Raspored zones={zones} positions={positions} radnje={RADNJE} onOtvoriPoziciju={() => undefined} />,
  );

/** The opening tag of the grid button of a position (quote-aware: a class may hold ">"). */
function tagMesta(html: string, id: string): string {
  const poz = html.indexOf(`data-mesto="${id}"`);
  if (poz < 0) throw new Error(`no position ${id} in the markup`);
  const pocetak = html.lastIndexOf("<button", poz);
  let navodnik = "";
  for (let i = poz; i < html.length; i += 1) {
    const znak = html[i];
    if (navodnik) {
      if (znak === navodnik) navodnik = "";
    } else if (znak === '"' || znak === "'") {
      navodnik = znak;
    } else if (znak === ">") {
      return html.slice(pocetak, i + 1);
    }
  }
  throw new Error("unterminated tag");
}

const atribut = (tag: string, ime: string): string | null => new RegExp(`\\s${ime}="([^"]*)"`).exec(tag)?.[1] ?? null;
const klase = (tag: string): string[] => (atribut(tag, "class") ?? "").split(/\s+/);
const broji = (html: string, trazeno: string) => html.split(trazeno).length - 1;

/** The markup of one surface (from its section to the next one). */
function sekcija(html: string, kljuc: string): string {
  const pocetak = html.indexOf(`data-povrs-rasporeda="${kljuc}"`);
  if (pocetak < 0) throw new Error(`no surface ${kljuc}`);
  const sledeca = html.indexOf("data-povrs-rasporeda=", pocetak + 1);
  return html.slice(pocetak, sledeca < 0 ? undefined : sledeca);
}

// --- Surfaces -------------------------------------------------------------------------

describe("povrsiRasporeda", () => {
  test("one surface per zone in zone order, then Bez zone", () => {
    const povrsi = povrsiRasporeda([ZONE[2], ZONE[0], ZONE[1]], POZICIJE);
    expect(povrsi.map((p) => p.kljuc)).toEqual(["z-sala", "z-terasa", "z-vip", BEZ_ZONE_KLJUC]);
    expect(povrsi[0].pozicije.map((p) => p.id)).toEqual(["p-1", "p-2", "p-3"]);
    expect(povrsi[2].pozicije).toEqual([]);
    expect(povrsi[3].pozicije.map((p) => p.id)).toEqual(["p-sank", "p-soba"]);
    expect(povrsi[3].zona).toBeNull();
    expect(povrsi.every((p) => !p.bezNaslova)).toBe(true);
  });

  test("Bez zone only when it has positions", () => {
    const samoSala = POZICIJE.filter((p) => p.zoneId === "z-sala");
    expect(povrsiRasporeda(ZONE, samoSala).map((p) => p.kljuc)).toEqual(["z-sala", "z-terasa", "z-vip"]);
  });

  test("a position of an unknown zone lands in Bez zone, so none is invisible", () => {
    const povrsi = povrsiRasporeda(ZONE, [mesto("p-x", "Sto 7", { zoneId: "z-obrisana" })]);
    expect(povrsi.at(-1)?.kljuc).toBe(BEZ_ZONE_KLJUC);
    expect(povrsi.at(-1)?.pozicije.map((p) => p.id)).toEqual(["p-x"]);
  });

  test("a venue without zones has one surface with no zone heading", () => {
    const povrsi = povrsiRasporeda([], POZICIJE);
    expect(povrsi).toHaveLength(1);
    expect(povrsi[0].bezNaslova).toBe(true);
    expect(povrsi[0].pozicije).toHaveLength(POZICIJE.length);
  });

  test("no positions → no surfaces, even with zones", () => {
    expect(povrsiRasporeda(ZONE, [])).toEqual([]);
    expect(povrsiRasporeda([], [])).toEqual([]);
  });

  test("the order of positions is stable: order, then id (never the layout)", () => {
    const povrsi = povrsiRasporeda([], [mesto("b", "B", { order: 1 }), mesto("a2", "A2", { order: 0 }), mesto("a1", "A1", { order: 0 })]);
    expect(povrsi[0].pozicije.map((p) => p.id)).toEqual(["a1", "a2", "b"]);
  });
});

describe("Raspored markup", () => {
  const html = render(ZONE, POZICIJE);

  test("headings follow the zone order, Bez zone last; an empty zone says so", () => {
    const redom = ["Glavna sala", "Terasa", "VIP", "Bez zone"].map((naziv) => html.indexOf(`>${naziv}</h3>`));
    expect(redom.every((i) => i >= 0)).toBe(true);
    expect([...redom].sort((a, b) => a - b)).toEqual(redom);
    expect(sekcija(html, "z-vip")).toContain(t.praznaZona);
    expect(sekcija(html, "z-vip")).not.toContain("<details");
  });

  test("each heading carries the number of positions in correct Serbian", () => {
    expect(sekcija(html, "z-sala")).toContain(">3 mesta<");
    expect(sekcija(html, "z-terasa")).toContain(">1 mesto<");
    expect(sekcija(html, "z-vip")).toContain(">0 mesta<");
    expect(sekcija(html, BEZ_ZONE_KLJUC)).toContain(">2 mesta<");
  });

  test("every section is named by its heading", () => {
    expect(sekcija(html, "z-sala")).toMatch(/aria-labelledby="[^"]+"/);
  });

  test("a venue without zones: one surface, no zone heading, named as the layout", () => {
    const bez = render([], POZICIJE.filter((p) => p.zoneId === null));
    expect(bez).not.toContain("<h3");
    expect(broji(bez, "<section")).toBe(1);
    expect(bez).toContain(`aria-label="${t.oblast}"`);
    expect(bez).toContain(`Sva mesta (2)`);
  });

  test("positions stand at their effective layout, as percentages of the grid", () => {
    // Glavna sala: lowest bottom is 7 → 8 rows.
    const sala = sekcija(html, "z-sala");
    expect(sala).toContain('data-redova="8"');
    expect(sala).toContain("aspect-ratio:24 / 8");
    expect(atribut(tagMesta(html, "p-1"), "style")).toContain("left:25%;top:25%;width:12.5%;height:25%");
    expect(atribut(tagMesta(html, "p-3"), "style")).toContain("left:0%;top:62.5%;width:16.6667%;height:25%");
    // Terasa: bottom 3 → the minimum of 6 rows.
    expect(sekcija(html, "z-terasa")).toContain('data-redova="6"');
    expect(atribut(tagMesta(html, "p-9"), "style")).toContain("left:4.1667%;top:16.6667%;width:12.5%;height:33.3333%");
  });

  test("a position without a stored layout is drawn at its automatic spot", () => {
    expect(atribut(tagMesta(html, "p-sank"), "style")).toContain("left:0%;top:0%;width:16.6667%;height:33.3333%");
    // The room is placed after it, one empty cell apart (x = 5).
    expect(atribut(tagMesta(html, "p-soba"), "style")).toContain("left:20.8333%;top:0%;width:12.5%;height:33.3333%");
  });

  test("a round position is rounded-full and says so; a rectangle is not", () => {
    const krug = tagMesta(html, "p-2");
    expect(klase(krug)).toContain("rounded-full");
    expect(atribut(krug, "data-oblik")).toBe("round");
    const pravougaonik = tagMesta(html, "p-1");
    expect(klase(pravougaonik)).not.toContain("rounded-full");
    expect(atribut(pravougaonik, "data-oblik")).toBe("rect");
  });

  test("every position is a real button with a full accessible name and a pressed state", () => {
    for (const pozicija of POZICIJE) {
      const tag = tagMesta(html, pozicija.id);
      expect(tag.startsWith("<button")).toBe(true);
      expect(atribut(tag, "type")).toBe("button");
      expect(atribut(tag, "aria-pressed")).toBe("false");
      expect(atribut(tag, "aria-label")).toContain(pozicija.label);
    }
    expect(atribut(tagMesta(html, "p-1"), "aria-label")).toBe(
      "Sto 1, sto, 2 sedišta, kolona 7, red 3, 3 × 2 polja, pravougaonik",
    );
    expect(atribut(tagMesta(html, "p-soba"), "aria-label")).toBe(
      "Soba 101, soba, kolona 6, red 1, 3 × 2 polja, pravougaonik",
    );
  });

  test("kind is not colour alone: a room has its icon, another place a dashed frame", () => {
    expect(klase(tagMesta(html, "p-sank"))).toContain("border-dashed");
    expect(klase(tagMesta(html, "p-1"))).not.toContain("border-dashed");
    expect(atribut(tagMesta(html, "p-soba"), "data-vrsta")).toBe("room");
    expect(html).toContain("lucide-bed-double");
  });

  test("the full label and the short one are both in the markup (the container picks)", () => {
    const tag = tagMesta(html, "p-1");
    const iza = html.slice(html.indexOf(tag) + tag.length, html.indexOf("</button>", html.indexOf(tag)));
    expect(iza).toContain(">Sto 1<");
    expect(iza).toContain(">1<");
  });

  test("roving tab stop: exactly one tab stop per surface, the first in reading order", () => {
    const sala = sekcija(html, "z-sala");
    expect(broji(sala, 'tabindex="0"')).toBe(1);
    expect(broji(sala, 'tabindex="-1"')).toBe(2);
    expect(atribut(tagMesta(html, "p-1"), "tabindex")).toBe("0");
    expect(atribut(tagMesta(html, "p-2"), "tabindex")).toBe("-1");
    // Bez zone: the shank (0,0) comes before the room (5,0).
    expect(atribut(tagMesta(html, "p-sank"), "tabindex")).toBe("0");
    expect(atribut(tagMesta(html, "p-soba"), "tabindex")).toBe("-1");
  });

  test("the help line lists the keys and the grids are described by it", () => {
    expect(html).toContain("Shift + strelice menjaju veličinu");
    expect(html).toContain("O menja oblik");
    expect(html).toContain("U otvara mesto");
    expect(html).toContain("Esc poništava izbor");
    const pomocId = /<div id="([^"]+)"[^>]*><p>Tab dolazi/.exec(html)?.[1];
    expect(pomocId).toBeTruthy();
    expect(broji(html, `aria-describedby="${pomocId}"`)).toBe(3);
  });

  test("the legend names the shape and kind hints in text", () => {
    for (const rec of [t.legenda.sto, t.legenda.soba, t.legenda.ostalo, t.legenda.oblik, t.legenda.izabrano]) {
      expect(html).toContain(rec);
    }
  });

  test("accessible list: a collapsed details per surface with a 44 px button per position", () => {
    const sala = sekcija(html, "z-sala");
    expect(broji(html, "<details")).toBe(3);
    expect(sala).toContain("<summary");
    expect(sala).toContain("Mesta u ovoj zoni (3)");
    expect(broji(sala, "data-lista-mesto=")).toBe(3);
    expect(sala).toContain("min-h-[var(--mp-meta)]");
    expect(sekcija(html, BEZ_ZONE_KLJUC)).toContain("Mesta u ovoj zoni (2)");
    for (const pozicija of POZICIJE) {
      expect(html).toContain(`data-lista-mesto="${pozicija.id}"`);
    }
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  test("the list names its positions in natural order (Sto 2 before Sto 10)", () => {
    const deset = [mesto("a", "Sto 10", { order: 0 }), mesto("b", "Sto 2", { order: 1 })];
    const prikaz = render([], deset);
    expect(prikaz.indexOf('data-lista-mesto="b"')).toBeLessThan(prikaz.indexOf('data-lista-mesto="a"'));
  });

  test("every surface with positions has the automatic arrangement and a polite status region", () => {
    expect(broji(html, t.automatski.dugme)).toBe(3);
    expect(broji(html, 'role="status"')).toBe(3);
    expect(broji(html, 'aria-live="polite"')).toBe(3);
    expect(html).not.toContain('role="alert"');
  });

  test("the confirmation of the automatic arrangement is closed at first", () => {
    expect(html).not.toContain(t.automatski.pitanjeZona);
    expect(html).not.toContain(t.automatski.potvrdi + "<");
  });

  test("no selection at first: no selected strip", () => {
    expect(html).not.toContain("data-izabrano-traka");
    expect(html).not.toContain('data-izabrano=""');
  });

  test("no motion without the user's consent: transitions are off with reduced motion", () => {
    expect(klase(tagMesta(html, "p-1"))).toContain("motion-reduce:transition-none");
    expect(html).toContain("motion-reduce:transition-none");
  });

  test("the drag library's English never reaches the markup", () => {
    expect(html).not.toMatch(/draggable|droppable|Picked up|press the space|arrow keys/i);
  });

  test("no English words in the text of the screen", () => {
    const tekst = html.replace(/<[^>]*>/g, " ");
    expect(tekst).not.toMatch(/\b(the|and|please|click|drag|drop|move|resize|select|selected|saving|error|try again)\b/i);
    expect(JSON.stringify(t)).not.toMatch(/\b(the|and|please|click|drag|drop|move|resize|selected|saving|error|try again)\b/i);
  });

  test("no positions at all: only the short empty text, no surface and no button", () => {
    const prazno = render(ZONE, []);
    expect(prazno).toContain(t.prazno.opis);
    expect(prazno).toContain("Prvo dodajte mesta u Listi.");
    expect(prazno).toContain(t.prazno.naslov);
    expect(prazno).not.toContain("<section");
    expect(prazno).not.toContain("<button");
    expect(prazno).not.toContain("<details");
    expect(prazno).not.toContain("data-mesto=");
  });
});

// --- Geometry and pixels -----------------------------------------------------------------

describe("geometrija", () => {
  test("percentages of the grid, rounded to four decimals", () => {
    expect(geometrija(L(6, 2, 3, 2), 8)).toEqual({ levo: 25, vrh: 25, sirina: 12.5, visina: 25 });
    expect(geometrija(L(1, 1, 3, 2), 6)).toEqual({ levo: 4.1667, vrh: 16.6667, sirina: 12.5, visina: 33.3333 });
  });

  test("the origin and the full width", () => {
    expect(geometrija(L(0, 0, 1, 1), 6)).toEqual({ levo: 0, vrh: 0, sirina: 4.1667, visina: 16.6667 });
    const g = geometrija(L(16, 4, 8, 8), 12);
    expect(g.levo + g.sirina).toBeCloseTo(100, 3);
  });
});

describe("redoviPovrsi and efektivniRasporedi", () => {
  test("at least the minimum rows, grows with the lowest position plus one", () => {
    expect(redoviPovrsi(new Map())).toBe(FLOOR_MIN_ROWS);
    expect(redoviPovrsi(new Map([["a", L(0, 0, 2, 2)]]))).toBe(FLOOR_MIN_ROWS);
    expect(redoviPovrsi(new Map([["a", L(0, 9, 2, 2)]]))).toBe(12);
  });

  test("stored layouts stay; unplaced positions get a free spot; overrides win", () => {
    const sala = povrsiRasporeda(ZONE, POZICIJE)[0].pozicije;
    const bez = povrsiRasporeda(ZONE, POZICIJE)[3].pozicije;
    expect(efektivniRasporedi(sala, new Map()).get("p-1")).toEqual(L(6, 2, 3, 2));
    const slobodna = efektivniRasporedi(bez, new Map());
    expect(slobodna.get("p-sank")).toEqual(L(0, 0, 4, 2));
    expect(slobodna.get("p-soba")).toEqual(L(5, 0, 3, 2));
    const preklapanja: Preklapanja = new Map([["p-sank", { layout: L(10, 4, 4, 2), potvrdjeno: false, ranije: null }]]);
    const pomereno = efektivniRasporedi(bez, preklapanja);
    expect(pomereno.get("p-sank")).toEqual(L(10, 4, 4, 2));
    // The room is not moved by an override of the shank: it keeps looking for its free spot.
    expect(pomereno.get("p-soba")).toEqual(L(0, 0, 3, 2));
  });

  test("an empty surface has no layouts", () => {
    expect(efektivniRasporedi([], new Map()).size).toBe(0);
  });
});

describe("pikseliUCelije", () => {
  test("rounds to whole cells", () => {
    expect(pikseliUCelije(37, 18)).toBe(2);
    expect(pikseliUCelije(-37, 18)).toBe(-2);
    expect(pikseliUCelije(8, 18)).toBe(0);
    expect(pikseliUCelije(9, 18)).toBe(1);
    expect(pikseliUCelije(360, 18)).toBe(20);
  });

  test("never -0 and never NaN, whatever the input", () => {
    expect(Object.is(pikseliUCelije(-5, 18), 0)).toBe(true);
    expect(pikseliUCelije(-9, 18)).toBe(0);
    expect(pikseliUCelije(10, 0)).toBe(0);
    expect(pikseliUCelije(10, -4)).toBe(0);
    expect(pikseliUCelije(Number.NaN, 10)).toBe(0);
    expect(pikseliUCelije(Number.POSITIVE_INFINITY, 10)).toBe(0);
    expect(pikseliUCelije(10, Number.NaN)).toBe(0);
  });
});

describe("pomerajUCelije", () => {
  const layout = L(2, 1, 3, 2);

  test("a short drag is whole cells", () => {
    expect(pomerajUCelije({ dxPx: 41, dyPx: 19, celijaPx: 20, layout, redova: 6 })).toEqual({ dx: 2, dy: 1 });
    expect(pomerajUCelije({ dxPx: 0, dyPx: 0, celijaPx: 20, layout, redova: 6 })).toEqual({ dx: 0, dy: 0 });
  });

  test("a drag past the edge lands on the edge (right, left, top, bottom)", () => {
    expect(pomerajUCelije({ dxPx: 5000, dyPx: 0, celijaPx: 20, layout, redova: 6 }).dx).toBe(24 - 3 - 2);
    expect(pomerajUCelije({ dxPx: -5000, dyPx: 0, celijaPx: 20, layout, redova: 6 }).dx).toBe(-2);
    expect(pomerajUCelije({ dxPx: 0, dyPx: -5000, celijaPx: 20, layout, redova: 6 }).dy).toBe(-1);
    expect(pomerajUCelije({ dxPx: 0, dyPx: 5000, celijaPx: 20, layout, redova: 6 }).dy).toBe(6 - 2 - 1);
  });

  test("a position at the origin has no negative room, and never -0", () => {
    const r = pomerajUCelije({ dxPx: -100, dyPx: -100, celijaPx: 20, layout: L(0, 0, 2, 2), redova: 6 });
    expect(Object.is(r.dx, 0)).toBe(true);
    expect(Object.is(r.dy, 0)).toBe(true);
  });

  test("an unknown cell size moves nothing", () => {
    expect(pomerajUCelije({ dxPx: 100, dyPx: 100, celijaPx: 0, layout, redova: 6 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("prikvaciPomeraj", () => {
  test("snaps the drag transform to whole cells inside the grid", () => {
    expect(prikvaciPomeraj({ x: 47, y: -31 }, 20, L(2, 1, 3, 2), 6)).toEqual({ x: 40, y: -20 });
    expect(prikvaciPomeraj({ x: 0, y: 0 }, 20, L(2, 1, 3, 2), 6)).toEqual({ x: 0, y: 0 });
    expect(prikvaciPomeraj({ x: 9999, y: 9999 }, 10, L(2, 1, 3, 2), 6)).toEqual({ x: 190, y: 30 });
  });
});

describe("putanjaMreze", () => {
  test("the hairlines between cells, none on the outer edge", () => {
    const putanja = putanjaMreze(6);
    expect(broji(putanja, "V6")).toBe(23);
    expect(broji(putanja, "H24")).toBe(5);
    expect(putanja.startsWith("M1 0V6")).toBe(true);
    expect(putanja.endsWith("M0 5H24")).toBe(true);
    expect(putanja).not.toContain("M0 0");
    expect(putanja).not.toContain("M24 ");
  });
});

// --- Labels ----------------------------------------------------------------------------------

describe("skratiOznaku", () => {
  test("the number at the end of a label", () => {
    expect(skratiOznaku("Sto 12")).toBe("12");
    expect(skratiOznaku("Soba 101")).toBe("101");
    expect(skratiOznaku("Sto 12a")).toBe("12a");
    expect(skratiOznaku("  Sto 7  ")).toBe("7");
    expect(skratiOznaku("12")).toBe("12");
  });

  test("no number: the first word, cut to three letters and an ellipsis when long", () => {
    expect(skratiOznaku("Šank")).toBe("Šank");
    expect(skratiOznaku("Vinski bar")).toBe("Vin…");
    expect(skratiOznaku("Bašta")).toBe("Baš…");
  });

  test("edge cases: empty, a long number, many words, characters outside the basic plane", () => {
    expect(skratiOznaku("")).toBe("");
    expect(skratiOznaku("   ")).toBe("");
    expect(skratiOznaku("Sto 12345")).toBe("Sto");
    expect(skratiOznaku("Terasa 2. deo")).toBe("Ter…");
    expect(skratiOznaku("😀😀😀😀😀😀")).toBe("😀😀😀…");
  });
});

describe("prikazMesta", () => {
  test("the full label needs 3 cells, a second line needs 2×2 and something to say", () => {
    expect(prikazMesta(L(0, 0, 2, 1), { kind: "table", seats: 4 })).toEqual({ punaOznaka: false, drugiRed: false });
    expect(prikazMesta(L(0, 0, 3, 2), { kind: "table", seats: 4 })).toEqual({ punaOznaka: true, drugiRed: true });
    expect(prikazMesta(L(0, 0, 3, 2), { kind: "table", seats: null })).toEqual({ punaOznaka: true, drugiRed: false });
    expect(prikazMesta(L(0, 0, 2, 2), { kind: "room", seats: null })).toEqual({ punaOznaka: false, drugiRed: true });
    expect(prikazMesta(L(0, 0, 1, 3), { kind: "other", seats: null })).toEqual({ punaOznaka: false, drugiRed: false });
  });
});

describe("Serbian phrases", () => {
  test("positions: one, few, many", () => {
    expect(brojMesta(0)).toBe("0 mesta");
    expect(brojMesta(1)).toBe("1 mesto");
    expect(brojMesta(2)).toBe("2 mesta");
    expect(brojMesta(5)).toBe("5 mesta");
    expect(brojMesta(11)).toBe("11 mesta");
    expect(brojMesta(21)).toBe("21 mesto");
    expect(brojMesta(22)).toBe("22 mesta");
  });

  test("seats", () => {
    expect(brojSedista(1)).toBe("1 sedište");
    expect(brojSedista(4)).toBe("4 sedišta");
    expect(brojSedista(6)).toBe("6 sedišta");
  });

  test("place and size are 1-based for people", () => {
    expect(polozajTekst(L(3, 1, 3, 2))).toBe("kolona 4, red 2");
    expect(velicinaTekst(L(3, 1, 3, 2))).toBe("3 × 2 polja");
  });

  test("the live announcement after a change reads like 'Sto 5: kolona 4, red 2'", () => {
    expect(najavaPromene("pomeranje", "Sto 5", L(3, 1, 3, 2))).toBe("Sto 5: kolona 4, red 2");
    expect(najavaPromene("velicina", "Sto 5", L(3, 1, 4, 2))).toBe("Sto 5: 4 × 2 polja");
    expect(najavaPromene("oblik", "Sto 5", L(3, 1, 3, 3, "round"))).toBe("Sto 5: oblik je krug");
    expect(najavaPromene("oblik", "Sto 5", L(3, 1, 3, 3, "rect"))).toBe("Sto 5: oblik je pravougaonik");
  });

  test("the accessible name of a position", () => {
    expect(opisMesta({ label: "Sto 5", kind: "table", seats: 4 }, L(3, 1, 3, 2, "round"))).toBe(
      "Sto 5, sto, 4 sedišta, kolona 4, red 2, 3 × 2 polja, krug",
    );
    expect(opisMesta({ label: "Šank", kind: "other", seats: null }, L(0, 0, 4, 2))).toBe(
      "Šank, ostalo, kolona 1, red 1, 4 × 2 polja, pravougaonik",
    );
    expect(opisMesta({ label: "Sto 1", kind: "table", seats: 0 }, L(0, 0, 1, 1))).not.toContain("sedišt");
  });

  test("an error code becomes its Serbian text, an unknown one the fallback", () => {
    expect(tekstGreske("floor/invalid_layout", menuDomenSr.errors, t.greskaOpste)).toBe(
      menuDomenSr.errors["floor/invalid_layout"],
    );
    expect(tekstGreske("", menuDomenSr.errors, t.greskaOpste)).toBe(t.greskaOpste);
    expect(tekstGreske("nepoznato/greska", menuDomenSr.errors, t.greskaOpste)).toBe(t.greskaOpste);
    // A key of Object.prototype is not a code.
    expect(tekstGreske("toString", menuDomenSr.errors, t.greskaOpste)).toBe(t.greskaOpste);
  });
});

// --- Keyboard --------------------------------------------------------------------------------

describe("redosledCitanja and susedUSmeru", () => {
  const raspored = new Map<string, FloorLayout>([
    ["c", L(2, 8, 3, 2)],
    ["a", L(2, 2, 3, 2)],
    ["b", L(8, 2, 3, 2)],
    ["d", L(8, 8, 3, 2)],
  ]);

  test("reading order: top to bottom, left to right, ties by id", () => {
    expect(redosledCitanja(raspored)).toEqual(["a", "b", "c", "d"]);
    expect(redosledCitanja(new Map())).toEqual([]);
    expect(redosledCitanja(new Map([["z", L(0, 0, 1, 1)], ["y", L(0, 0, 1, 1)]]))).toEqual(["y", "z"]);
  });

  test("the nearest neighbour in line in each direction, null at the edge", () => {
    expect(susedUSmeru(raspored, "a", "right")).toBe("b");
    expect(susedUSmeru(raspored, "a", "down")).toBe("c");
    expect(susedUSmeru(raspored, "d", "left")).toBe("c");
    expect(susedUSmeru(raspored, "d", "up")).toBe("b");
    expect(susedUSmeru(raspored, "a", "left")).toBeNull();
    expect(susedUSmeru(raspored, "a", "up")).toBeNull();
    expect(susedUSmeru(raspored, "d", "right")).toBeNull();
    expect(susedUSmeru(raspored, "d", "down")).toBeNull();
  });

  test("prefers the one in line over a nearer one off to the side", () => {
    const m = new Map<string, FloorLayout>([
      ["od", L(10, 4, 2, 2)],
      ["blizu-sa-strane", L(16, 12, 2, 2)],
      ["u-liniji", L(10, 16, 2, 2)],
    ]);
    expect(susedUSmeru(m, "od", "down")).toBe("u-liniji");
  });

  test("an unknown position and a single position have no neighbours", () => {
    expect(susedUSmeru(raspored, "nema", "right")).toBeNull();
    expect(susedUSmeru(new Map([["a", L(0, 0, 1, 1)]]), "a", "down")).toBeNull();
  });
});

describe("primeniTaster", () => {
  const A = L(2, 2, 3, 2);
  const B = L(6, 2, 3, 2);
  const C = L(2, 6, 3, 2);
  const raspored = new Map<string, FloorLayout>([["a", A], ["b", B], ["c", C]]);
  const izabran = (key: string, shift = false, preko: Partial<{ fokusId: string; izabranoId: string | null }> = {}) =>
    primeniTaster({ fokusId: "a", izabranoId: "a", layouts: raspored, ...preko }, key, shift);

  test("arrows move the selected position one step, persisted as a new layout", () => {
    expect(izabran("ArrowRight")).toEqual({ vrsta: "izmena", id: "a", layout: L(3, 2, 3, 2), sta: "pomeranje" });
    expect(izabran("ArrowDown")).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 3, 3, 2), sta: "pomeranje" });
    expect(izabran("ArrowLeft")).toEqual({ vrsta: "izmena", id: "a", layout: L(1, 2, 3, 2), sta: "pomeranje" });
    expect(izabran("ArrowUp")).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 1, 3, 2), sta: "pomeranje" });
  });

  test("a step jumps over a neighbour instead of stopping at it", () => {
    const uskoro = new Map<string, FloorLayout>([["a", L(3, 2, 3, 2)], ["b", B]]);
    const ishod = primeniTaster({ fokusId: "a", izabranoId: "a", layouts: uskoro }, "ArrowRight", false);
    expect(ishod).toEqual({ vrsta: "izmena", id: "a", layout: L(9, 2, 3, 2), sta: "pomeranje" });
  });

  test("at the edge of the grid the step is blocked", () => {
    const rub = new Map<string, FloorLayout>([["a", L(0, 0, 3, 2)]]);
    for (const key of ["ArrowLeft", "ArrowUp"]) {
      expect(primeniTaster({ fokusId: "a", izabranoId: "a", layouts: rub }, key, false)).toEqual({
        vrsta: "granica",
        id: "a",
        sta: "pomeranje",
      });
    }
    const desno = new Map<string, FloorLayout>([["a", L(21, 0, 3, 2)]]);
    expect(primeniTaster({ fokusId: "a", izabranoId: "a", layouts: desno }, "ArrowRight", false)).toEqual({
      vrsta: "granica",
      id: "a",
      sta: "pomeranje",
    });
  });

  test("Shift + arrows resize: right and down grow, left and up shrink", () => {
    expect(izabran("ArrowRight", true)).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 2, 4, 2), sta: "velicina" });
    expect(izabran("ArrowDown", true)).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 2, 3, 3), sta: "velicina" });
    expect(izabran("ArrowLeft", true)).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 2, 2, 2), sta: "velicina" });
    expect(izabran("ArrowUp", true)).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 2, 3, 1), sta: "velicina" });
  });

  test("a resize into a neighbour or below the minimum is blocked", () => {
    const tesno = new Map<string, FloorLayout>([["a", L(3, 2, 3, 2)], ["b", B]]);
    expect(primeniTaster({ fokusId: "a", izabranoId: "a", layouts: tesno }, "ArrowRight", true)).toEqual({
      vrsta: "granica",
      id: "a",
      sta: "velicina",
    });
    const malo = new Map<string, FloorLayout>([["a", L(2, 2, 1, 1)]]);
    expect(primeniTaster({ fokusId: "a", izabranoId: "a", layouts: malo }, "ArrowLeft", true)).toEqual({
      vrsta: "granica",
      id: "a",
      sta: "velicina",
    });
  });

  test("O flips the shape (either case), U opens the position, Esc lets it go", () => {
    expect(izabran("o")).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 2, 3, 2, "round"), sta: "oblik" });
    expect(izabran("O", true)).toEqual({ vrsta: "izmena", id: "a", layout: L(2, 2, 3, 2, "round"), sta: "oblik" });
    const krug = new Map<string, FloorLayout>([["a", L(2, 2, 3, 3, "round")]]);
    expect(primeniTaster({ fokusId: "a", izabranoId: "a", layouts: krug }, "o", false)).toEqual({
      vrsta: "izmena",
      id: "a",
      layout: L(2, 2, 3, 3, "rect"),
      sta: "oblik",
    });
    expect(izabran("u")).toEqual({ vrsta: "otvori", id: "a" });
    expect(izabran("U")).toEqual({ vrsta: "otvori", id: "a" });
    expect(izabran("Escape")).toEqual({ vrsta: "izaberi", id: null });
  });

  test("without a selection arrows only move the focus between positions", () => {
    const bez = (key: string, shift = false) =>
      primeniTaster({ fokusId: "a", izabranoId: null, layouts: raspored }, key, shift);
    expect(bez("ArrowRight")).toEqual({ vrsta: "fokus", id: "b" });
    expect(bez("ArrowDown")).toEqual({ vrsta: "fokus", id: "c" });
    // At the edge the focus stays where it is (and the page does not scroll).
    expect(bez("ArrowLeft")).toEqual({ vrsta: "fokus", id: "a" });
    expect(bez("ArrowUp")).toEqual({ vrsta: "fokus", id: "a" });
    expect(bez("Home")).toEqual({ vrsta: "fokus", id: "a" });
    expect(bez("End")).toEqual({ vrsta: "fokus", id: "c" });
    expect(bez("ArrowRight", true)).toEqual({ vrsta: "nista" });
  });

  test("without a selection O, U and Esc do nothing", () => {
    for (const key of ["o", "u", "Escape"]) {
      expect(primeniTaster({ fokusId: "a", izabranoId: null, layouts: raspored }, key, false)).toEqual({ vrsta: "nista" });
    }
  });

  test("another position is selected: the focus moves, the selected one stays", () => {
    expect(izabran("ArrowRight", false, { izabranoId: "b" })).toEqual({ vrsta: "fokus", id: "b" });
    expect(izabran("o", false, { izabranoId: "b" })).toEqual({ vrsta: "nista" });
    expect(izabran("Escape", false, { izabranoId: "b" })).toEqual({ vrsta: "izaberi", id: null });
    expect(izabran("Home", false, { izabranoId: "b" })).toEqual({ vrsta: "fokus", id: "a" });
  });

  test("Home and End leave a selected position alone", () => {
    expect(izabran("Home")).toEqual({ vrsta: "nista" });
    expect(izabran("End")).toEqual({ vrsta: "nista" });
  });

  test("Enter, Space, Tab and other keys are the browser's own", () => {
    for (const key of ["Enter", " ", "Tab", "x", "a", "PageDown", "Shift"]) {
      expect(izabran(key)).toEqual({ vrsta: "nista" });
    }
  });

  test("an unknown position is ignored", () => {
    expect(primeniTaster({ fokusId: "nema", izabranoId: "nema", layouts: raspored }, "ArrowRight", false)).toEqual({
      vrsta: "nista",
    });
  });

  test("a held key walks the position across the grid and stops at the edge (no state is mutated)", () => {
    let stanje = new Map(raspored);
    for (let i = 0; i < 30; i += 1) {
      const ishod = primeniTaster({ fokusId: "c", izabranoId: "c", layouts: stanje }, "ArrowRight", false);
      if (ishod.vrsta !== "izmena") break;
      stanje = new Map(stanje).set("c", ishod.layout);
    }
    expect(stanje.get("c")).toEqual(L(21, 6, 3, 2));
    expect(raspored.get("c")).toEqual(C);
  });
});

describe("prebaciIzbor", () => {
  test("selects, and clears when the same position is chosen again", () => {
    expect(prebaciIzbor(null, "a")).toBe("a");
    expect(prebaciIzbor("b", "a")).toBe("a");
    expect(prebaciIzbor("a", "a")).toBeNull();
  });
});

// --- Saving ----------------------------------------------------------------------------------

describe("planCuvanja", () => {
  const bez = povrsiRasporeda(ZONE, POZICIJE)[3].pozicije;
  const layouts = efektivniRasporedi(bez, new Map());

  test("a surface with stored layouts saves only the changed position", () => {
    const sala = povrsiRasporeda(ZONE, POZICIJE)[0].pozicije;
    const izmene = planCuvanja({
      pozicije: sala,
      preklapanja: new Map(),
      layouts: efektivniRasporedi(sala, new Map()),
      id: "p-1",
      layout: L(7, 2, 3, 2),
    });
    expect(izmene).toEqual([{ positionId: "p-1", layout: L(7, 2, 3, 2) }]);
  });

  test("unplaced positions are stored with it, so they do not jump into the spot it left", () => {
    const izmene = planCuvanja({ pozicije: bez, preklapanja: new Map(), layouts, id: "p-sank", layout: L(10, 4, 4, 2) });
    expect(izmene).toEqual([
      { positionId: "p-soba", layout: L(5, 0, 3, 2) },
      { positionId: "p-sank", layout: L(10, 4, 4, 2) },
    ]);
  });

  test("a position with a save already pending is not stored again", () => {
    const preklapanja: Preklapanja = new Map([["p-soba", { layout: L(5, 0, 3, 2), potvrdjeno: false, ranije: null }]]);
    const izmene = planCuvanja({ pozicije: bez, preklapanja, layouts, id: "p-sank", layout: L(10, 4, 4, 2) });
    expect(izmene).toEqual([{ positionId: "p-sank", layout: L(10, 4, 4, 2) }]);
  });

  test("a stored layout that is not valid counts as unplaced", () => {
    const pokvareno = [mesto("p-a", "A", { layout: L(30, 0, 3, 2) }), mesto("p-b", "B", { layout: L(0, 0, 3, 2), order: 1 })];
    const m = efektivniRasporedi(pokvareno, new Map());
    const izmene = planCuvanja({ pozicije: pokvareno, preklapanja: new Map(), layouts: m, id: "p-b", layout: L(1, 0, 3, 2) });
    expect(izmene.map((i) => i.positionId)).toEqual(["p-a", "p-b"]);
  });
});

describe("optimistic overrides", () => {
  const stored = mesto("p-1", "Sto 1", { layout: L(0, 0, 3, 2) });
  const nov = L(4, 0, 3, 2);
  const izmena = { positionId: "p-1", layout: nov };

  test("applying overrides marks them unconfirmed and does not touch the input", () => {
    const prazno: Preklapanja = new Map();
    const sledece = primeniPreklapanja(prazno, [izmena]);
    expect(sledece.get("p-1")).toEqual({ layout: nov, potvrdjeno: false, ranije: null });
    expect(prazno.size).toBe(0);
  });

  test("an override stays while the stored layout is the old one", () => {
    const preklapanja = primeniPreklapanja(new Map(), [izmena]);
    expect(ocistiPreklapanja(preklapanja, [stored])).toBe(preklapanja);
  });

  test("an override goes away once the stored layout equals it, or the position is gone", () => {
    const preklapanja = primeniPreklapanja(new Map(), [izmena]);
    expect(ocistiPreklapanja(preklapanja, [{ ...stored, layout: nov }]).size).toBe(0);
    expect(ocistiPreklapanja(preklapanja, []).size).toBe(0);
  });

  test("an empty map is returned as it is", () => {
    const prazno: Preklapanja = new Map();
    expect(ocistiPreklapanja(prazno, [stored])).toBe(prazno);
  });

  test("a confirmed override stays until the stored layout changes, then goes", () => {
    const potvrdjeno = potvrdiPreklapanja(primeniPreklapanja(new Map(), [izmena]), [izmena], [stored]);
    expect(potvrdjeno.get("p-1")).toEqual({ layout: nov, potvrdjeno: true, ranije: L(0, 0, 3, 2) });
    expect(ocistiPreklapanja(potvrdjeno, [stored])).toBe(potvrdjeno);
    // The server later stores something else (another editor): our override must not shadow it.
    expect(ocistiPreklapanja(potvrdjeno, [{ ...stored, layout: L(9, 9, 3, 2) }]).size).toBe(0);
  });

  test("confirming when the server state already caught up drops the override at once", () => {
    const preklapanja = primeniPreklapanja(new Map(), [izmena]);
    expect(potvrdiPreklapanja(preklapanja, [izmena], [{ ...stored, layout: nov }]).size).toBe(0);
  });

  test("confirming an older save does not touch a newer edit of the same position", () => {
    const novija = { positionId: "p-1", layout: L(8, 0, 3, 2) };
    const preklapanja = primeniPreklapanja(primeniPreklapanja(new Map(), [izmena]), [novija]);
    const posle = potvrdiPreklapanja(preklapanja, [izmena], [stored]);
    expect(posle.get("p-1")).toEqual({ layout: novija.layout, potvrdjeno: false, ranije: null });
  });

  test("a refused save puts back what was shown before", () => {
    const prethodni: Preklapanje = { layout: L(2, 0, 3, 2), potvrdjeno: false, ranije: null };
    const preklapanja = primeniPreklapanja(new Map([["p-1", prethodni]]), [izmena]);
    const vraceno = vratiPreklapanja(preklapanja, [{ ...izmena, prethodno: prethodni }]);
    expect(vraceno.get("p-1")).toEqual(prethodni);
    const bezPrethodnog = vratiPreklapanja(primeniPreklapanja(new Map(), [izmena]), [{ ...izmena, prethodno: undefined }]);
    expect(bezPrethodnog.has("p-1")).toBe(false);
  });

  test("a refused save leaves a newer edit alone", () => {
    const novija = { positionId: "p-1", layout: L(8, 0, 3, 2) };
    const preklapanja = primeniPreklapanja(primeniPreklapanja(new Map(), [izmena]), [novija]);
    const vraceno = vratiPreklapanja(preklapanja, [{ ...izmena, prethodno: undefined }]);
    expect(vraceno.get("p-1")?.layout).toEqual(novija.layout);
  });
});
