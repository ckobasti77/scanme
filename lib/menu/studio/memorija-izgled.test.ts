// ScanMe Menu V1 (K17) — Izgled on the in-memory menu of the izlog: the same
// compare-and-set and the same rules as the Convex mutation, a change lands in
// the DRAFT (revision +1, "dirty") and the published snapshot keeps the old
// appearance until Objavi. Fixture: "Demo restoran" (fixtureMenu("srednji")).
// A conflict carries the saved and the tried values of the change's fields as
// JSON text (the form the editor's save queue holds Izgled in; model.ts).

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import type { IzgledIzmena } from "../identity/izbor";
import { MENU_DEFAULT_PRESENTATION } from "../presentation";
import { objavi, pocetnoStanje, pregledObjave, stanjeNacrta, type MemorijaKorak, type MemorijaStanje } from "./memorija";
import { izgledIzMemorije, izgledNacrta, izgledPlan, postaviIzgled } from "./memorija-izgled";

const SADA = 1_760_000_000_000;
const PREMIUM_REQUIRED = "plan/premium_required";
const INVALID_INPUT = "menu/invalid_input";
const UNREADABLE = "presentation/unreadable";
const UNREADABLE_BRAND = ["#8C2633", "#FFFFFF", "#AAAAAA"];

/** A published menu with a clean draft; the account is Standard unless `premium`. */
const stanje = (premium = false): MemorijaStanje =>
  pocetnoStanje(fixtureMenu("srednji").snapshot, { objavljeno: { verzija: 1, u: 0 }, premium });

function uspeh(korak: MemorijaKorak): MemorijaStanje {
  expect(korak.ishod).toEqual({ ok: true, vrednost: null });
  return korak.stanje;
}

function greskaKod(korak: MemorijaKorak): string {
  if (korak.ishod.ok || korak.ishod.vrsta !== "greska") throw new Error(`not a refusal: ${JSON.stringify(korak.ishod)}`);
  return korak.ishod.kod;
}

/** Objavi with the confirmation the publish preview asks for, when it asks. */
function objaviSve(s: MemorijaStanje): MemorijaStanje {
  const otisak = pregledObjave(s, true).otisak;
  const korak = objavi(s, s.revizija, otisak, SADA);
  expect(korak.ishod).toMatchObject({ ok: true, vrednost: { status: "objavljeno" } });
  return korak.stanje;
}

describe("the fixture", () => {
  test("starts published and clean, with no drafted appearance", () => {
    const s = stanje();
    expect(stanjeNacrta(s)).toBe("clean");
    expect(s.revizija).toBe(1);
    expect(s.snapshot.presentation ?? null).toBeNull();
  });
});

describe("postaviIzgled writes to the draft", () => {
  test("bumps the revision by exactly 1 and the draft becomes dirty", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviIzgled(s0, { density: "standard" }, { density: "dense" }));
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(stanjeNacrta(s1)).toBe("dirty");
    expect(s1.snapshot.presentation?.density).toBe("dense");
    expect(izgledNacrta(s1).density).toBe("dense");
  });

  test("several fields in one change are still one revision step", () => {
    const s0 = stanje();
    const s1 = uspeh(
      postaviIzgled(s0, { density: "standard", emphasis: "calm", search: false }, { density: "airy", emphasis: "bold", search: true }),
    );
    expect(s1.revizija).toBe(s0.revizija + 1);
    expect(izgledNacrta(s1)).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "airy", emphasis: "bold", search: true });
  });

  test("every change is its own step", () => {
    const s1 = uspeh(postaviIzgled(stanje(), { density: "standard" }, { density: "dense" }));
    const s2 = uspeh(postaviIzgled(s1, { emphasis: "calm" }, { emphasis: "bold" }));
    expect(s2.revizija).toBe(3);
  });

  test("the published snapshot keeps the old appearance until Objavi", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviIzgled(s0, { density: "standard" }, { density: "dense" }));
    expect(s1.objavljeno).toBe(s0.objavljeno);
    expect(s1.objavljeno?.presentation ?? null).toBeNull();
    expect(s1.objavljenaVerzija).toBe(1);
    expect(s1.objavljenaRevizija).toBe(1);
  });

  test("after Objavi the published snapshot has the new appearance", () => {
    const s1 = uspeh(postaviIzgled(stanje(), { density: "standard" }, { density: "dense" }));
    const s2 = objaviSve(s1);
    expect(s2.objavljeno?.presentation?.density).toBe("dense");
    expect(s2.objavljenaVerzija).toBe(2);
    expect(stanjeNacrta(s2)).toBe("clean");
  });

  test("the rest of the draft is untouched", () => {
    const s0 = stanje();
    const s1 = uspeh(postaviIzgled(s0, { density: "standard" }, { density: "dense" }));
    expect({ ...s1.snapshot, presentation: null }).toEqual({ ...s0.snapshot, presentation: null });
  });

  test("a second change expects the value the first one saved", () => {
    const s1 = uspeh(postaviIzgled(stanje(), { density: "standard" }, { density: "dense" }));
    const zastarelo = postaviIzgled(s1, { density: "standard" }, { density: "airy" });
    expect(zastarelo.ishod).toMatchObject({ ok: false, vrsta: "konflikt", sacuvano: '{"density":"dense"}', pokusano: '{"density":"airy"}' });
    const s2 = uspeh(postaviIzgled(s1, { density: "dense" }, { density: "airy" }));
    expect(izgledNacrta(s2).density).toBe("airy");
  });

  test("brand colours are compared as a list and stored in the canonical form", () => {
    const s1 = uspeh(
      postaviIzgled(stanje(), { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8c2633"] }),
    );
    expect(izgledNacrta(s1)).toMatchObject({ paletteId: "brend", brandColors: ["#8C2633"] });
    const s2 = uspeh(postaviIzgled(s1, { brandColors: ["#8C2633"] }, { brandColors: ["#1F5F7A"] }));
    expect(izgledNacrta(s2).brandColors).toEqual(["#1F5F7A"]);
    const staro = postaviIzgled(s1, { brandColors: null }, { brandColors: ["#1F5F7A"] });
    expect(staro.ishod).toMatchObject({ ok: false, vrsta: "konflikt", sacuvano: '{"brandColors":["#8C2633"]}' });
  });

  test("filters are normalised into the canonical order", () => {
    const s1 = uspeh(postaviIzgled(stanje(), { filters: [] }, { filters: ["promo", "vegan"] }));
    expect(izgledNacrta(s1).filters).toEqual(["vegan", "promo"]);
  });

  test("a layout change drops the old variant", () => {
    const s1 = uspeh(postaviIzgled(stanje(true), { layoutVariant: null }, { layoutVariant: "kartice" }));
    expect(izgledNacrta(s1).layoutVariant).toBe("kartice");
    const s2 = uspeh(postaviIzgled(s1, { layout: "flow" }, { layout: "compact" }));
    expect(izgledNacrta(s2).layout).toBe("compact");
    expect("layoutVariant" in izgledNacrta(s2)).toBe(false);
  });
});

describe("postaviIzgled: compare-and-set", () => {
  test("an expected value that is not the current one is a conflict and the state is unchanged", () => {
    const s0 = stanje();
    const korak = postaviIzgled(s0, { density: "airy" }, { density: "dense" });
    expect(korak.ishod).toMatchObject({ ok: false, vrsta: "konflikt" });
    expect(korak.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: '{"density":"standard"}', pokusano: '{"density":"dense"}' });
    expect(korak.stanje).toBe(s0);
    expect(korak.stanje.revizija).toBe(1);
    expect(stanjeNacrta(korak.stanje)).toBe("clean");
  });

  test("a conflict on one field refuses the whole change", () => {
    const s0 = stanje();
    const korak = postaviIzgled(s0, { density: "standard", emphasis: "bold" }, { density: "dense", emphasis: "calm" });
    expect(korak.ishod).toMatchObject({
      ok: false,
      vrsta: "konflikt",
      sacuvano: '{"density":"standard","emphasis":"calm"}',
      pokusano: '{"density":"dense","emphasis":"calm"}',
    });
    expect(korak.stanje).toBe(s0);
  });

  test("an absent variant is expected as null", () => {
    expect(postaviIzgled(stanje(true), { layoutVariant: null }, { layoutVariant: "kartice" }).ishod.ok).toBe(true);
    const konflikt = postaviIzgled(stanje(true), { layoutVariant: "kartice" }, { layoutVariant: "kartice" });
    expect(konflikt.ishod).toMatchObject({ ok: false, vrsta: "konflikt", sacuvano: '{"layoutVariant":null}' });
  });
});

describe("postaviIzgled: the expected values must name the patch fields", () => {
  const s0 = stanje();

  test("a missing expected field is invalid input", () => {
    const korak = postaviIzgled(s0, {}, { density: "dense" });
    expect(greskaKod(korak)).toBe(INVALID_INPUT);
    expect(korak.stanje).toBe(s0);
  });

  test("an extra expected field is invalid input", () => {
    const korak = postaviIzgled(s0, { density: "standard", emphasis: "calm" }, { density: "dense" });
    expect(greskaKod(korak)).toBe(INVALID_INPUT);
    expect(korak.stanje).toBe(s0);
  });

  test("an expected field with another name is invalid input", () => {
    const korak = postaviIzgled(s0, { emphasis: "calm" }, { density: "dense" });
    expect(greskaKod(korak)).toBe(INVALID_INPUT);
    expect(korak.stanje).toBe(s0);
  });

  test("a patch of one field with one missing of two is invalid input", () => {
    const korak = postaviIzgled(s0, { density: "standard" }, { density: "dense", emphasis: "bold" });
    expect(greskaKod(korak)).toBe(INVALID_INPUT);
  });

  test("an empty patch is invalid input", () => {
    const korak = postaviIzgled(s0, {}, {});
    expect(greskaKod(korak)).toBe(INVALID_INPUT);
    expect(korak.stanje).toBe(s0);
  });

  test("the refusal is final, not worth retrying", () => {
    expect(postaviIzgled(s0, {}, { density: "dense" }).ishod).toEqual({
      ok: false,
      vrsta: "greska",
      kod: INVALID_INPUT,
      ponovljivo: false,
    });
  });

  test("an unknown value is invalid input", () => {
    const korak = postaviIzgled(s0, { density: "standard" }, { density: "huge" } as unknown as IzgledIzmena);
    expect(greskaKod(korak)).toBe(INVALID_INPUT);
    expect(korak.stanje).toBe(s0);
  });
});

describe("postaviIzgled: the plan", () => {
  test("a Premium palette on Standard is premium_required and the state is unchanged", () => {
    const s0 = stanje(false);
    const korak = postaviIzgled(s0, { paletteId: "default" }, { paletteId: "vino" });
    expect(greskaKod(korak)).toBe(PREMIUM_REQUIRED);
    expect(korak.stanje).toBe(s0);
    expect(stanjeNacrta(korak.stanje)).toBe("clean");
  });

  test("the same change on Premium is accepted", () => {
    const s1 = uspeh(postaviIzgled(stanje(true), { paletteId: "default" }, { paletteId: "vino" }));
    expect(izgledNacrta(s1).paletteId).toBe("vino");
    expect(s1.revizija).toBe(2);
  });

  test("a Premium font pair, layout variant and reduced branding need Premium", () => {
    const s0 = stanje(false);
    expect(greskaKod(postaviIzgled(s0, { fontPairId: "default" }, { fontPairId: "galerija" }))).toBe(PREMIUM_REQUIRED);
    expect(greskaKod(postaviIzgled(s0, { layoutVariant: null }, { layoutVariant: "kartice" }))).toBe(PREMIUM_REQUIRED);
    expect(greskaKod(postaviIzgled(s0, { branding: "standard" }, { branding: "reduced" }))).toBe(PREMIUM_REQUIRED);
    const p0 = stanje(true);
    expect(postaviIzgled(p0, { fontPairId: "default" }, { fontPairId: "galerija" }).ishod.ok).toBe(true);
    expect(postaviIzgled(p0, { layoutVariant: null }, { layoutVariant: "kartice" }).ishod.ok).toBe(true);
    expect(postaviIzgled(p0, { branding: "standard" }, { branding: "reduced" }).ishod.ok).toBe(true);
  });

  test("a Standard palette and a brand palette work on Standard", () => {
    const s1 = uspeh(postaviIzgled(stanje(false), { paletteId: "default" }, { paletteId: "ponoc" }));
    expect(izgledNacrta(s1).paletteId).toBe("ponoc");
    const s2 = uspeh(
      postaviIzgled(stanje(false), { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8C2633"] }),
    );
    expect(izgledNacrta(s2).paletteId).toBe("brend");
  });

  test("a draft that already has a Premium palette can still be changed on Standard", () => {
    const premium = uspeh(postaviIzgled(stanje(true), { paletteId: "default" }, { paletteId: "vino" }));
    const bezPremiuma: MemorijaStanje = { ...premium, premium: false };
    const s2 = uspeh(postaviIzgled(bezPremiuma, { density: "standard" }, { density: "dense" }));
    expect(izgledNacrta(s2)).toMatchObject({ paletteId: "vino", density: "dense" });
  });

  test("the palette group can be saved again with the Premium palette the draft already has", () => {
    const premium = uspeh(postaviIzgled(stanje(true), { paletteId: "default" }, { paletteId: "vino" }));
    const bezPremiuma: MemorijaStanje = { ...premium, premium: false };
    const noop = postaviIzgled(bezPremiuma, { paletteId: "vino", brandColors: null }, { paletteId: "vino", brandColors: null });
    expect(noop.ishod).toEqual({ ok: true, vrednost: null });
    expect(noop.stanje).toBe(bezPremiuma);
    const s2 = uspeh(postaviIzgled(bezPremiuma, { paletteId: "vino", brandColors: null }, { paletteId: "vino", brandColors: ["#8C2633"] }));
    expect(izgledNacrta(s2)).toMatchObject({ paletteId: "vino", brandColors: ["#8C2633"] });
    expect(s2.revizija).toBe(bezPremiuma.revizija + 1);
  });

  test("another Premium palette is still refused after Premium is lost", () => {
    const premium = uspeh(postaviIzgled(stanje(true), { paletteId: "default" }, { paletteId: "vino" }));
    const bezPremiuma: MemorijaStanje = { ...premium, premium: false };
    const korak = postaviIzgled(bezPremiuma, { paletteId: "vino" }, { paletteId: "sumrak" });
    expect(greskaKod(korak)).toBe(PREMIUM_REQUIRED);
    expect(korak.stanje).toBe(bezPremiuma);
  });
});

describe("postaviIzgled: the brand palette", () => {
  test("an unreadable brand is refused and the state is unchanged", () => {
    const s0 = stanje();
    const korak = postaviIzgled(
      s0,
      { paletteId: "default", brandColors: null },
      { paletteId: "brend", brandColors: UNREADABLE_BRAND },
    );
    expect(greskaKod(korak)).toBe(UNREADABLE);
    expect(korak.stanje).toBe(s0);
    expect(izgledNacrta(korak.stanje).brandColors).toBeNull();
    expect(korak.stanje.revizija).toBe(1);
  });

  test("a readable brand is accepted", () => {
    const s1 = uspeh(
      postaviIzgled(stanje(), { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8C2633"] }),
    );
    expect(izgledNacrta(s1)).toMatchObject({ paletteId: "brend", brandColors: ["#8C2633"] });
  });

  test("invalid brand colours are refused", () => {
    const s0 = stanje();
    const korak = postaviIzgled(s0, { brandColors: null }, { brandColors: ["#12345"] });
    expect(greskaKod(korak)).toBe("presentation/invalid_brand_colors");
    expect(korak.stanje).toBe(s0);
  });
});

describe("postaviIzgled: a change that changes nothing", () => {
  test("is accepted and returns the very same state: the revision does not move", () => {
    const s0 = stanje();
    const korak = postaviIzgled(s0, { density: "standard" }, { density: "standard" });
    expect(korak.ishod).toEqual({ ok: true, vrednost: null });
    expect(korak.stanje).toBe(s0);
    expect(korak.stanje.revizija).toBe(1);
    expect(stanjeNacrta(korak.stanje)).toBe("clean");
  });

  test("the same filters in another order change nothing", () => {
    const s1 = uspeh(postaviIzgled(stanje(), { filters: [] }, { filters: ["vegan", "promo"] }));
    const korak = postaviIzgled(s1, { filters: ["vegan", "promo"] }, { filters: ["promo", "vegan"] });
    expect(korak.ishod).toEqual({ ok: true, vrednost: null });
    expect(korak.stanje).toBe(s1);
  });
});

describe("izgledIzMemorije", () => {
  test("gives the default appearance when the snapshot has no presentation", () => {
    const s = stanje();
    expect(s.snapshot.presentation ?? null).toBeNull();
    expect(izgledIzMemorije(s).vrednosti).toBe(MENU_DEFAULT_PRESENTATION);
    expect(izgledNacrta(s)).toBe(MENU_DEFAULT_PRESENTATION);
  });

  test("gives the drafted appearance once there is one", () => {
    const s1 = uspeh(postaviIzgled(stanje(), { density: "standard" }, { density: "dense" }));
    expect(izgledIzMemorije(s1).vrednosti).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "dense" });
  });

  test("the plan mirrors the account's Premium", () => {
    expect(izgledIzMemorije(stanje(false)).plan).toEqual({ extraLayouts: false, reducedBranding: false });
    expect(izgledIzMemorije(stanje(true)).plan).toEqual({ extraLayouts: true, reducedBranding: true });
    expect(izgledPlan(stanje(true))).toEqual({ extraLayouts: true, reducedBranding: true });
  });

  test("the plan follows the state when Premium is lost", () => {
    expect(izgledIzMemorije({ ...stanje(true), premium: false }).plan).toEqual({ extraLayouts: false, reducedBranding: false });
  });
});
