// ScanMe Menu V1 — K18: the versions of the editor's in-memory menu (the izlog's
// backend). Publishing appends a version (the newest 20 stay), the list is the
// one menuPublishing.listVersions gives, and a restore follows
// menuPublishing.restoreVersion: refused when the draft moved on, a page with a
// QR card is kept and named, only the DRAFT changes (guests see the same menu
// until Objavi), and restoring the live version exactly discards the draft
// changes.
//
// Everything runs on the invented "Demo restoran" (fixtureMenu("srednji")):
// "Kajmak sa pogačom" 480 RSD and "Pršut sa sirom" 920 RSD on the default page
// "Kompletan meni", the wines shared with "Vinska karta".

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_ERROR } from "../errors/core";
import { canonicalJson, sortSnapshot, type MenuDraftSnapshot } from "../snapshot";
import {
  arhivirajStranicu,
  dodajStranicu,
  objavi,
  obrisiSekciju,
  pocetnoStanje,
  postaviCenu,
  pregledObjave,
  sazetakVerzije,
  stanjeNacrta,
  vratiStranicu,
  type MemorijaKorak,
  type MemorijaStanje,
} from "./memorija";
import { brojRazlika, istorijaVerzija, verzijeIzMemorije, vratiVerziju } from "./memorija-verzije";
import type { StudioVracanjeRezultat } from "./model";

const SADA = 1_760_000_000_000;
const DAN = 86_400_000;
const KAJMAK = "Kajmak sa pogačom";
const PRSUT = "Pršut sa sirom";
const ANA = "Ana Test";
const MARKO = "Marko Test";

// --- helpers ------------------------------------------------------------------

/** A never published draft of the medium fixture; `ja` = who publishes in this memory. */
function pocetno(opcije: Parameters<typeof pocetnoStanje>[1] = {}, ja?: string | null): MemorijaStanje {
  const s = pocetnoStanje(fixtureMenu("srednji").snapshot, opcije);
  return ja === undefined ? s : { ...s, ja };
}

function artikal(s: MemorijaStanje, naziv: string) {
  const found = s.snapshot.articles.find((a) => a.name === naziv);
  if (!found) throw new Error(`fixture article "${naziv}" missing`);
  return found;
}

function stranica(s: MemorijaStanje, naziv: string) {
  const found = s.snapshot.pages.find((p) => p.name === naziv);
  if (!found) throw new Error(`fixture page "${naziv}" missing`);
  return found;
}

function cena(s: MemorijaStanje, naziv: string): number | null {
  return artikal(s, naziv).basePriceRsd;
}

/** The step must have succeeded; returns the next state and the value. */
function uspeh<T>(korak: MemorijaKorak<T>): { stanje: MemorijaStanje; vrednost: T } {
  if (!korak.ishod.ok) throw new Error(`expected success, got ${JSON.stringify(korak.ishod)}`);
  return { stanje: korak.stanje, vrednost: korak.ishod.vrednost };
}

/** The restore must have been done ("vraceno"). */
function vraceno(korak: MemorijaKorak<StudioVracanjeRezultat>) {
  const { stanje, vrednost } = uspeh(korak);
  if (vrednost.status !== "vraceno") throw new Error(`expected a restore, got ${JSON.stringify(vrednost)}`);
  return { stanje, rezultat: vrednost };
}

function promeniCenu(s: MemorijaStanje, naziv: string, nova: number | null): MemorijaStanje {
  const a = artikal(s, naziv);
  return uspeh(postaviCenu(s, a.key, a.basePriceRsd, nova, SADA)).stanje;
}

/** A real publish (with the fingerprint of the preview, as the dialog sends it). */
function objavljeno(s: MemorijaStanje, kada: number): MemorijaStanje {
  const korak = objavi(s, s.revizija, pregledObjave(s, true).otisak, kada);
  const { stanje, vrednost } = uspeh(korak);
  if (vrednost.status !== "objavljeno") throw new Error(`expected a publish, got ${JSON.stringify(vrednost)}`);
  return stanje;
}

function verzija(s: MemorijaStanje, broj: number) {
  const found = s.verzije?.find((v) => v.broj === broj);
  if (!found) throw new Error(`version ${broj} missing`);
  return found;
}

/** Articles guests see: a visible placement in a visible section of a visible, not archived page. */
function prikazaniKljucevi(snapshot: MenuDraftSnapshot): Set<string> {
  const stranice = new Map(snapshot.pages.map((p) => [p.key, p]));
  const sekcije = new Map(snapshot.sections.map((s) => [s.key, s]));
  const kljucevi = new Set<string>();
  for (const prikaz of snapshot.placements) {
    const sekcija = sekcije.get(prikaz.sectionKey);
    const strana = stranice.get(prikaz.pageKey);
    if (prikaz.visibility !== "visible") continue;
    if (!sekcija || sekcija.visibility !== "visible" || sekcija.pageKey !== prikaz.pageKey) continue;
    if (!strana || strana.visibility !== "visible" || strana.archivedAt !== null) continue;
    kljucevi.add(prikaz.articleKey);
  }
  return kljucevi;
}

function prikazaniArtikli(snapshot: MenuDraftSnapshot): number {
  return prikazaniKljucevi(snapshot).size;
}

function zamrzni<T>(vrednost: T): T {
  if (vrednost !== null && typeof vrednost === "object" && !Object.isFrozen(vrednost)) {
    Object.freeze(vrednost);
    for (const dete of Object.values(vrednost)) zamrzni(dete);
  }
  return vrednost;
}

/** What a state is made of, as JSON (the sets as lists), to prove nothing changed in place. */
function otisakStanja(s: MemorijaStanje): string {
  return JSON.stringify({ ...s, nedostupni: [...s.nedostupni], qrStranice: [...s.qrStranice], slike: undefined });
}

function istiMeni(a: MenuDraftSnapshot, b: MenuDraftSnapshot): boolean {
  return canonicalJson(sortSnapshot(a)) === canonicalJson(sortSnapshot(b));
}

/**
 * v1 (Kajmak 480, Pršut 920, published by Ana) and v2 (Kajmak 500, Pršut 950,
 * published by Marko), v2 live and the draft the same as v2 (clean).
 */
function uzivoV2(): MemorijaStanje {
  const s0 = pocetno({}, ANA);
  const s1 = objavljeno(s0, SADA);
  const s2 = promeniCenu(promeniCenu({ ...s1, ja: MARKO }, KAJMAK, 500), PRSUT, 950);
  return objavljeno(s2, SADA + DAN);
}

/** The same, with an unpublished edit on top (Kajmak 520): the draft is dirty. */
function uzivoV2SaIzmenom(): MemorijaStanje {
  return promeniCenu(uzivoV2(), KAJMAK, 520);
}

// --- objavi: the version history ----------------------------------------------------

describe("objavi appends versions", () => {
  test("the first publish of a never published draft is version 1, by the state's own person", () => {
    const s0 = pocetno({}, ANA);
    expect(s0.verzije ?? []).toEqual([]);
    const s1 = objavljeno(s0, SADA);

    expect(s1.verzije).toHaveLength(1);
    const v1 = s1.verzije![0];
    expect(v1.broj).toBe(1);
    expect(v1.ko).toBe(ANA);
    expect(v1.u).toBe(SADA);
    expect(v1.snapshot).toBe(s0.snapshot);
    expect(v1.vracenoIz).toBeNull();
    // Every article guests see is new in the first version, nothing else changed.
    const prikazani = prikazaniArtikli(s0.snapshot);
    expect(prikazani).toBeGreaterThan(0);
    expect(prikazani).toBeLessThan(s0.snapshot.articles.length);
    expect(v1.sazetak).toEqual({
      cene: 0,
      novi: prikazani,
      uklonjeni: 0,
      sakriveno: 0,
      uklonjenoSaStranice: 0,
      obrisano: 0,
      redosled: 0,
    });
    expect(s1.objavljenaVerzija).toBe(1);
  });

  test("a state with nobody to name publishes with ko null", () => {
    const s0 = pocetno();
    expect(s0.ja).toBeUndefined();
    expect(objavljeno(s0, SADA).verzije![0].ko).toBeNull();
    expect(objavljeno(pocetno({}, null), SADA).verzije![0].ko).toBeNull();
  });

  test("the next version stores the summary against the previous one and the draft it published", () => {
    const s1 = objavljeno(pocetno({}, ANA), SADA);
    const s2 = promeniCenu(s1, KAJMAK, 520);
    const s3 = objavljeno(s2, SADA + DAN);
    const v2 = verzija(s3, 2);
    expect(v2.snapshot).toBe(s2.snapshot);
    expect(v2.sazetak).toEqual(sazetakVerzije(s1.snapshot, s2.snapshot));
    expect(v2.sazetak).toMatchObject({ cene: 1, novi: 0, uklonjeni: 0 });
    // The older version is untouched.
    expect(verzija(s3, 1)).toBe(verzija(s1, 1));
    expect(s3.verzije!.map((v) => v.broj)).toEqual([1, 2]);
  });

  test("a refused publish does not append a version", () => {
    const s1 = objavljeno(pocetno({}, ANA), SADA);
    // Nothing changed since the last publish.
    expect(objavi(s1, s1.revizija, undefined, SADA + DAN).stanje).toBe(s1);
    // A newer draft than the person saw.
    const s2 = promeniCenu(s1, KAJMAK, 520);
    const zastarelo = objavi(s2, s2.revizija - 1, undefined, SADA + DAN);
    expect(zastarelo.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "stale_draft" } });
    expect(zastarelo.stanje.verzije).toHaveLength(1);
    // A price that guests need and the draft does not have.
    const s3 = promeniCenu(s2, PRSUT, null);
    const nevazece = objavi(s3, s3.revizija, undefined, SADA + DAN);
    expect(nevazece.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "validation_failed" } });
    expect(nevazece.stanje.verzije).toHaveLength(1);
  });

  test("only the newest 20 versions stay: after 23 publishes the numbers are 4..23", () => {
    let s = objavljeno(pocetno({}, ANA), SADA);
    let kajmak = cena(s, KAJMAK)!;
    for (let i = 2; i <= 23; i += 1) {
      kajmak += 1;
      s = objavljeno(promeniCenu(s, KAJMAK, kajmak), SADA + i * DAN);
      expect(s.verzije).toHaveLength(Math.min(i, 20));
      expect(s.objavljenaVerzija).toBe(i);
    }
    expect(s.verzije!.map((v) => v.broj)).toEqual(Array.from({ length: 20 }, (_, i) => i + 4));
    // The newest is the live one with its own time; the oldest kept still has its own draft.
    expect(verzija(s, 23).u).toBe(SADA + 23 * DAN);
    expect(verzija(s, 4).snapshot.articles.find((a) => a.name === KAJMAK)!.basePriceRsd).toBe(483);
    expect(verzija(s, 23).snapshot).toBe(s.snapshot);
    expect(verzijeIzMemorije(s).verzije.map((v) => v.broj)).toEqual(Array.from({ length: 20 }, (_, i) => 23 - i));
  });

  test("a publish after a restore carries vracenoIz, and the next state forgets it", () => {
    const s2 = uzivoV2();
    const vracena = vraceno(vratiVerziju(s2, 1, s2.revizija)).stanje;
    expect(vracena.vracenoIz).toBe(1);

    const s3 = objavljeno(vracena, SADA + 2 * DAN);
    expect(s3.verzije!.map((v) => [v.broj, v.vracenoIz])).toEqual([
      [1, null],
      [2, null],
      [3, 1],
    ]);
    expect(verzija(s3, 3).sazetak.cene).toBe(2);
    expect(verzija(s3, 3).snapshot).toBe(vracena.snapshot);
    expect(s3.vracenoIz).toBeNull();
    expect(s3.objavljenaVerzija).toBe(3);

    // The marker is for that one version only.
    const s4 = objavljeno(promeniCenu(s3, KAJMAK, 530), SADA + 3 * DAN);
    expect(verzija(s4, 4).vracenoIz).toBeNull();
  });
});

// --- verzijeIzMemorije ----------------------------------------------------------------

describe("verzijeIzMemorije", () => {
  test("no versions yet: nothing is live and the list is empty", () => {
    expect(verzijeIzMemorije(pocetno())).toEqual({ uzivo: null, verzije: [] });
    expect(verzijeIzMemorije({ ...pocetno(), verzije: [] })).toEqual({ uzivo: null, verzije: [] });
  });

  test("newest first, and only the live number is uzivo", () => {
    const s = objavljeno(vraceno(vratiVerziju(uzivoV2(), 1, uzivoV2().revizija)).stanje, SADA + 2 * DAN);
    const lista = verzijeIzMemorije(s);
    expect(lista.uzivo).toBe(3);
    expect(lista.verzije.map((v) => v.broj)).toEqual([3, 2, 1]);
    expect(lista.verzije.map((v) => v.uzivo)).toEqual([true, false, false]);
  });

  test("the live number decides uzivo, not the position in the list", () => {
    const s = { ...uzivoV2(), objavljenaVerzija: 1 };
    const lista = verzijeIzMemorije(s);
    expect(lista.uzivo).toBe(1);
    expect(lista.verzije.map((v) => [v.broj, v.uzivo])).toEqual([
      [2, false],
      [1, true],
    ]);
  });

  test("the fields are mapped: time, who published, summary and the restore marker", () => {
    const s = objavljeno({ ...vraceno(vratiVerziju(uzivoV2(), 1, uzivoV2().revizija)).stanje, ja: null }, SADA + 2 * DAN);
    for (const stavka of verzijeIzMemorije(s).verzije) {
      const izvor = verzija(s, stavka.broj);
      expect(stavka.objavljenoU).toBe(izvor.u);
      expect(stavka.objavio).toBe(izvor.ko);
      expect(stavka.sazetak).toBe(izvor.sazetak);
      expect(stavka.vracenoIz).toBe(izvor.vracenoIz);
    }
    const poBroju = new Map(verzijeIzMemorije(s).verzije.map((v) => [v.broj, v]));
    expect(poBroju.get(1)).toMatchObject({ objavljenoU: SADA, objavio: ANA, vracenoIz: null });
    expect(poBroju.get(2)).toMatchObject({ objavljenoU: SADA + DAN, objavio: MARKO, vracenoIz: null });
    expect(poBroju.get(3)).toMatchObject({ objavljenoU: SADA + 2 * DAN, objavio: null, vracenoIz: 1 });
    expect(poBroju.get(2)!.sazetak.cene).toBe(2);
  });

  test("it does not reorder the state's own list", () => {
    const s = uzivoV2();
    const pre = s.verzije!.map((v) => v.broj);
    verzijeIzMemorije(s);
    expect(s.verzije!.map((v) => v.broj)).toEqual(pre);
    expect(pre).toEqual([1, 2]);
  });
});

// --- vratiVerziju -------------------------------------------------------------------------

describe("vratiVerziju: refusals", () => {
  test("a stale revision is refused as a result, and the state is the same object", () => {
    const s = uzivoV2SaIzmenom();
    for (const revizija of [s.revizija - 1, s.revizija + 1, 0]) {
      const korak = vratiVerziju(s, 1, revizija);
      expect(korak.ishod).toEqual({ ok: true, vrednost: { status: "odbijeno", razlog: "stale_draft" } });
      expect(korak.stanje).toBe(s);
    }
  });

  test("an unknown version number is menu/not_found and nothing changes", () => {
    const s = uzivoV2SaIzmenom();
    for (const broj of [0, 3, 99, -1]) {
      const korak = vratiVerziju(s, broj, s.revizija);
      expect(korak.ishod).toEqual({ ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false });
      expect(korak.stanje).toBe(s);
    }
    expect(MENU_ERROR.notFound).toBe("menu/not_found");
    // No history at all.
    const prazno = pocetno();
    const bez = vratiVerziju(prazno, 1, prazno.revizija);
    expect(bez.ishod).toEqual({ ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false });
    expect(bez.stanje).toBe(prazno);
  });

  test("the revision is checked before the number, as on the server", () => {
    const s = uzivoV2();
    expect(vratiVerziju(s, 99, s.revizija + 5).ishod).toEqual({
      ok: true,
      vrednost: { status: "odbijeno", razlog: "stale_draft" },
    });
  });

  test("a version older than the newest 20 is gone", () => {
    let s = objavljeno(pocetno({}, ANA), SADA);
    for (let i = 2; i <= 23; i += 1) s = objavljeno(promeniCenu(s, KAJMAK, 480 + i), SADA + i * DAN);
    const staro = vratiVerziju(s, 3, s.revizija);
    expect(staro.ishod).toEqual({ ok: false, vrsta: "greska", kod: "menu/not_found", ponovljivo: false });
    expect(staro.stanje).toBe(s);
    expect(vraceno(vratiVerziju(s, 4, s.revizija)).rezultat.broj).toBe(4);
  });
});

describe("vratiVerziju: an older version", () => {
  const pocetnaStanja: [string, () => MemorijaStanje][] = [
    ["a clean draft", uzivoV2],
    ["a dirty draft", uzivoV2SaIzmenom],
  ];

  test.each(pocetnaStanja)("from %s: the draft gets that version's prices and is dirty, marked as restored", (_naziv, napravi) => {
    const pre = napravi();
    const v1 = verzija(pre, 1);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 1, pre.revizija));

    expect(cena(posle, KAJMAK)).toBe(480);
    expect(cena(posle, PRSUT)).toBe(920);
    expect(brojRazlika(posle.snapshot, v1.snapshot)).toBe(0);
    expect(posle.revizija).toBe(pre.revizija + 1);
    expect(stanjeNacrta(posle)).toBe("dirty");
    expect(posle.vracenoIz).toBe(1);
    expect(rezultat).toMatchObject({ status: "vraceno", broj: 1, stanje: "dirty", zadrzaneStranice: [], bezSlike: 0 });
    expect(rezultat.izmena).toBeGreaterThan(0);
    expect(rezultat.izmena).toBe(brojRazlika(pre.snapshot, v1.snapshot));
  });

  test("guests keep seeing the live version: nothing published changes", () => {
    const pre = uzivoV2SaIzmenom();
    const { stanje: posle } = vraceno(vratiVerziju(pre, 1, pre.revizija));
    expect(posle.objavljeno).toBe(pre.objavljeno);
    expect(cena({ ...posle, snapshot: posle.objavljeno! }, KAJMAK)).toBe(500);
    expect(posle.objavljenaVerzija).toBe(2);
    expect(posle.objavljenoU).toBe(pre.objavljenoU);
    expect(posle.objavljenaRevizija).toBe(pre.objavljenaRevizija);
    // The history is not rewritten by a restore: no new version, the old ones are the same objects.
    expect(posle.verzije).toBe(pre.verzije);
    expect(verzijeIzMemorije(posle).uzivo).toBe(2);
  });

  test("restoring it again changes nothing more (the draft already is that version)", () => {
    const pre = uzivoV2SaIzmenom();
    const prvo = vraceno(vratiVerziju(pre, 1, pre.revizija)).stanje;
    const { stanje: drugo, rezultat } = vraceno(vratiVerziju(prvo, 1, prvo.revizija));
    expect(rezultat).toMatchObject({ status: "vraceno", broj: 1, stanje: "dirty", izmena: 0 });
    expect(drugo).toBe(prvo);
  });

  test("an old restore marker is replaced by the version restored last", () => {
    const pre = uzivoV2SaIzmenom();
    const izPrve = vraceno(vratiVerziju(pre, 1, pre.revizija)).stanje;
    expect(izPrve.vracenoIz).toBe(1);
    // v2 is live: coming back to it from the draft of v1 discards the restore.
    const nazad = vraceno(vratiVerziju(izPrve, 2, izPrve.revizija));
    expect(nazad.rezultat.stanje).toBe("clean");
    expect(nazad.stanje.vracenoIz).toBeNull();
  });
});

describe("vratiVerziju: the live version", () => {
  test("while the draft is dirty: the draft is the live snapshot again, clean, not marked as restored", () => {
    const pre = uzivoV2SaIzmenom();
    expect(stanjeNacrta(pre)).toBe("dirty");
    expect(cena(pre, KAJMAK)).toBe(520);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 2, pre.revizija));

    expect(cena(posle, KAJMAK)).toBe(500);
    expect(istiMeni(posle.snapshot, pre.objavljeno!)).toBe(true);
    expect(brojRazlika(posle.snapshot, verzija(pre, 2).snapshot)).toBe(0);
    expect(stanjeNacrta(posle)).toBe("clean");
    expect(posle.revizija).toBe(pre.revizija + 1);
    expect(posle.objavljenaRevizija).toBe(posle.revizija);
    expect(posle.vracenoIz).toBeNull();
    expect(rezultat).toMatchObject({ status: "vraceno", broj: 2, stanje: "clean", zadrzaneStranice: [], bezSlike: 0 });
    expect(rezultat.izmena).toBeGreaterThan(0);
    // And it is still what guests see.
    expect(posle.objavljeno).toBe(pre.objavljeno);
    expect(posle.objavljenaVerzija).toBe(2);
  });

  test("while the draft is clean: nothing to write, the state is the same object", () => {
    const pre = uzivoV2();
    expect(stanjeNacrta(pre)).toBe("clean");
    const korak = vratiVerziju(pre, 2, pre.revizija);
    const { rezultat } = vraceno(korak);
    expect(rezultat).toEqual({ status: "vraceno", broj: 2, stanje: "clean", izmena: 0, zadrzaneStranice: [], bezSlike: 0 });
    expect(korak.stanje).toBe(pre);
  });

  test("a draft that only moved on without a difference (a price changed and changed back) becomes clean", () => {
    const pre = promeniCenu(promeniCenu(uzivoV2(), KAJMAK, 540), KAJMAK, 500);
    expect(stanjeNacrta(pre)).toBe("dirty");
    expect(brojRazlika(pre.snapshot, pre.objavljeno!)).toBe(0);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 2, pre.revizija));
    expect(rezultat).toMatchObject({ stanje: "clean", izmena: 0 });
    expect(stanjeNacrta(posle)).toBe("clean");
    expect(posle.snapshot).toBe(pre.snapshot);
    expect(posle.revizija).toBe(pre.revizija);
    expect(posle.vracenoIz).toBeNull();
  });

  test("settings changed in the draft count as a difference and come back with the restore", () => {
    const s = uzivoV2();
    const pre: MemorijaStanje = {
      ...s,
      revizija: s.revizija + 1,
      snapshot: { ...s.snapshot, settings: { ...s.snapshot.settings, allergensEnabled: !s.snapshot.settings.allergensEnabled } },
    };
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 2, pre.revizija));
    expect(rezultat).toMatchObject({ stanje: "clean", izmena: 1 });
    expect(posle.snapshot.settings).toEqual(s.snapshot.settings);
    expect(stanjeNacrta(posle)).toBe("clean");
  });

  test("a draft restored from an older version and then from the live one is clean again", () => {
    const pre = uzivoV2();
    const izPrve = vraceno(vratiVerziju(pre, 1, pre.revizija)).stanje;
    expect(stanjeNacrta(izPrve)).toBe("dirty");
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(izPrve, 2, izPrve.revizija));
    expect(rezultat).toMatchObject({ stanje: "clean" });
    expect(rezultat.izmena).toBeGreaterThan(0);
    expect(stanjeNacrta(posle)).toBe("clean");
    expect(istiMeni(posle.snapshot, pre.snapshot)).toBe(true);
  });
});

describe("vratiVerziju: a page with a QR card is never removed", () => {
  /** v2 live; the draft got a page "Dnevna ponuda" and a new Kajmak price after it. */
  function saNovomStranicom(qr: boolean) {
    const s = uzivoV2();
    const dodata = uspeh(dodajStranicu(s, "Dnevna ponuda"));
    const izmenjeno = promeniCenu(dodata.stanje, KAJMAK, 520);
    const kljuc = dodata.vrednost.id;
    return { kljuc, stanje: qr ? { ...izmenjeno, qrStranice: new Set([kljuc]) } : izmenjeno };
  }

  test("the page is kept and named when an older version does not have it", () => {
    const { kljuc, stanje: pre } = saNovomStranicom(true);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 1, pre.revizija));
    expect(rezultat.zadrzaneStranice).toEqual(["Dnevna ponuda"]);
    expect(posle.snapshot.pages.some((p) => p.key === kljuc && p.archivedAt === null)).toBe(true);
    // The rest of the draft is version 1.
    expect(cena(posle, KAJMAK)).toBe(480);
    expect(cena(posle, PRSUT)).toBe(920);
    expect(rezultat).toMatchObject({ stanje: "dirty", broj: 1 });
    expect(posle.vracenoIz).toBe(1);
    expect(posle.qrStranice.has(kljuc)).toBe(true);
    // The version itself does not have the page.
    expect(verzija(posle, 1).snapshot.pages.some((p) => p.key === kljuc)).toBe(false);
  });

  test("without a QR card the same page goes with the restore", () => {
    const { kljuc, stanje: pre } = saNovomStranicom(false);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 1, pre.revizija));
    expect(rezultat.zadrzaneStranice).toEqual([]);
    expect(posle.snapshot.pages.some((p) => p.key === kljuc)).toBe(false);
    expect(posle.snapshot.pages.map((p) => p.name).sort()).toEqual(["Kompletan meni", "Vinska karta"]);
  });

  test("restoring the live version keeps the page too, so the draft is not the live version", () => {
    const { kljuc, stanje: pre } = saNovomStranicom(true);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 2, pre.revizija));
    expect(rezultat.zadrzaneStranice).toEqual(["Dnevna ponuda"]);
    expect(rezultat.stanje).toBe("dirty");
    expect(cena(posle, KAJMAK)).toBe(500);
    expect(posle.snapshot.pages.some((p) => p.key === kljuc)).toBe(true);
    expect(stanjeNacrta(posle)).toBe("dirty");
    expect(posle.vracenoIz).toBe(2);
  });

  test("a page that the version has archived is kept active, and named", () => {
    const s0 = pocetno({}, ANA);
    const dodata = uspeh(dodajStranicu(s0, "Sezonska ponuda"));
    const kljuc = dodata.vrednost.id;
    const arhivirana = uspeh(arhivirajStranicu(dodata.stanje, kljuc, SADA)).stanje;
    const s1 = objavljeno(arhivirana, SADA);
    expect(verzija(s1, 1).snapshot.pages.find((p) => p.key === kljuc)!.archivedAt).not.toBeNull();

    const aktivna = uspeh(vratiStranicu(s1, kljuc)).stanje;
    const pre = { ...aktivna, qrStranice: new Set([kljuc]) };
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(pre, 1, pre.revizija));
    expect(rezultat.zadrzaneStranice).toEqual(["Sezonska ponuda"]);
    expect(posle.snapshot.pages.find((p) => p.key === kljuc)!.archivedAt).toBeNull();
  });
});

describe("vratiVerziju: the input state is never mutated", () => {
  const slucajevi: [string, () => MemorijaStanje, number][] = [
    ["an older version", uzivoV2SaIzmenom, 1],
    ["the live version over a dirty draft", uzivoV2SaIzmenom, 2],
    ["the live version over a clean draft", uzivoV2, 2],
    [
      "an older version with a page kept for its QR card",
      () => {
        const s = uzivoV2();
        const dodata = uspeh(dodajStranicu(s, "Dnevna ponuda"));
        return { ...promeniCenu(dodata.stanje, KAJMAK, 520), qrStranice: new Set([dodata.vrednost.id]) };
      },
      1,
    ],
  ];

  test.each(slucajevi)("%s", (_naziv, napravi, broj) => {
    const pre = zamrzni(structuredClone(napravi()));
    const otisak = otisakStanja(pre);
    const korak = vratiVerziju(pre, broj, pre.revizija);
    expect(korak.ishod.ok).toBe(true);
    expect(otisakStanja(pre)).toBe(otisak);
  });

  test("a refused restore returns the very same state", () => {
    const pre = zamrzni(structuredClone(uzivoV2SaIzmenom()));
    const otisak = otisakStanja(pre);
    expect(vratiVerziju(pre, 1, pre.revizija - 1).stanje).toBe(pre);
    expect(vratiVerziju(pre, 77, pre.revizija).stanje).toBe(pre);
    expect(otisakStanja(pre)).toBe(otisak);
  });
});

// --- brojRazlika --------------------------------------------------------------------------

describe("brojRazlika", () => {
  test("identical snapshots differ by 0", () => {
    const { snapshot } = fixtureMenu("srednji");
    expect(brojRazlika(snapshot, snapshot)).toBe(0);
    expect(brojRazlika(snapshot, structuredClone(snapshot))).toBe(0);
    expect(brojRazlika(snapshot, fixtureMenu("srednji").snapshot)).toBe(0);
  });

  test("one changed price is one row", () => {
    const { snapshot } = fixtureMenu("srednji");
    const izmenjen: MenuDraftSnapshot = {
      ...snapshot,
      articles: snapshot.articles.map((a) => (a.name === KAJMAK ? { ...a, basePriceRsd: 500 } : a)),
    };
    expect(brojRazlika(snapshot, izmenjen)).toBe(1);
    expect(brojRazlika(izmenjen, snapshot)).toBe(1);
  });

  test("a price changed through the editor's own price writer is more than 0", () => {
    const pre = pocetno();
    expect(brojRazlika(pre.snapshot, promeniCenu(pre, PRSUT, 999).snapshot)).toBeGreaterThan(0);
  });

  test("an added row, a removed row and a changed setting each count", () => {
    const { snapshot } = fixtureMenu("srednji");
    const bezPrikaza: MenuDraftSnapshot = { ...snapshot, placements: snapshot.placements.slice(1) };
    expect(brojRazlika(snapshot, bezPrikaza)).toBe(1);
    expect(brojRazlika(bezPrikaza, snapshot)).toBe(1);
    const sviJezici: MenuDraftSnapshot = {
      ...snapshot,
      settings: { ...snapshot.settings, allergensEnabled: !snapshot.settings.allergensEnabled },
    };
    expect(brojRazlika(snapshot, sviJezici)).toBe(1);
  });
});

// --- istorijaVerzija ----------------------------------------------------------------------

describe("istorijaVerzija", () => {
  const TIM = [ANA, MARKO, "Jelena Test"];
  const { snapshot } = fixtureMenu("srednji");

  test("n versions numbered 1..n, the last one is the given snapshot", () => {
    const istorija = istorijaVerzija(snapshot, 6, SADA, TIM);
    expect(istorija.map((v) => v.broj)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(istorija[5].snapshot).toBe(snapshot);
    expect(istorija.every((v) => v.vracenoIz === null)).toBe(true);
  });

  test("the times ascend and the last one is poslednjaU", () => {
    const istorija = istorijaVerzija(snapshot, 6, SADA, TIM);
    expect(istorija[5].u).toBe(SADA);
    for (let i = 1; i < istorija.length; i += 1) expect(istorija[i].u).toBeGreaterThan(istorija[i - 1].u);
    expect(istorija[0].u).toBeLessThan(SADA);
  });

  test("who published rotates over the team; without a team nobody is named", () => {
    const istorija = istorijaVerzija(snapshot, 7, SADA, TIM);
    expect(istorija.map((v) => v.ko)).toEqual([ANA, MARKO, "Jelena Test", ANA, MARKO, "Jelena Test", ANA]);
    expect(istorijaVerzija(snapshot, 3, SADA, []).map((v) => v.ko)).toEqual([null, null, null]);
  });

  test("zero or fewer versions is an empty history", () => {
    expect(istorijaVerzija(snapshot, 0, SADA, TIM)).toEqual([]);
    expect(istorijaVerzija(snapshot, -3, SADA, TIM)).toEqual([]);
  });

  test("one version is the snapshot itself, all of it new", () => {
    const [jedina, ...ostalo] = istorijaVerzija(snapshot, 1, SADA, TIM);
    expect(ostalo).toEqual([]);
    expect(jedina).toMatchObject({ broj: 1, u: SADA, ko: ANA, vracenoIz: null });
    expect(jedina.snapshot).toBe(snapshot);
    expect(jedina.sazetak.novi).toBe(prikazaniArtikli(snapshot));
    expect(jedina.sazetak.cene).toBe(0);
  });

  test("each version differs a little from the next, and its summary is against the previous one", () => {
    const istorija = istorijaVerzija(snapshot, 5, SADA, TIM);
    for (let i = 1; i < istorija.length; i += 1) {
      expect(brojRazlika(istorija[i - 1].snapshot, istorija[i].snapshot)).toBeGreaterThan(0);
      expect(istorija[i].sazetak).toEqual(sazetakVerzije(istorija[i - 1].snapshot, istorija[i].snapshot));
    }
    expect(istorija[0].sazetak).toEqual(sazetakVerzije(null, istorija[0].snapshot));
    // Older menus cost less: the newest has the highest sum of base prices.
    const zbir = (s: MenuDraftSnapshot) => s.articles.reduce((sum, a) => sum + (a.basePriceRsd ?? 0), 0);
    expect(zbir(istorija[4].snapshot)).toBeGreaterThan(zbir(istorija[0].snapshot));
  });

  test("the given snapshot is not changed and the history is usable as the memory's versions", () => {
    const zamrznut = zamrzni(structuredClone(snapshot));
    const istorija = istorijaVerzija(zamrznut, 5, SADA, TIM);
    expect(brojRazlika(zamrznut, snapshot)).toBe(0);

    const s = { ...pocetnoStanje(zamrznut, { objavljeno: { verzija: 5, u: SADA } }), verzije: istorija };
    expect(verzijeIzMemorije(s).verzije.map((v) => [v.broj, v.uzivo])).toEqual([
      [5, true],
      [4, false],
      [3, false],
      [2, false],
      [1, false],
    ]);
    const { stanje: posle, rezultat } = vraceno(vratiVerziju(s, 3, s.revizija));
    expect(rezultat).toMatchObject({ broj: 3, stanje: "dirty" });
    expect(rezultat.izmena).toBeGreaterThan(0);
    expect(posle.vracenoIz).toBe(3);
    expect(brojRazlika(posle.snapshot, istorija[2].snapshot)).toBe(0);
  });
});

// --- pregledObjave: where the issues are and the price changes --------------------------

describe("pregledObjave: ciljevi and promeneCena", () => {
  test("a cleared price is an error whose target names the article and the default page", () => {
    const s0 = pocetno();
    const kajmak = artikal(s0, KAJMAK);
    const s1 = promeniCenu(s0, KAJMAK, null);
    const pregled = pregledObjave(s1, true);
    const zadata = stranica(s1, "Kompletan meni");

    expect(zadata.isDefault).toBe(true);
    expect(pregled.greske).toEqual([{ kod: "price_missing", artikalKey: kajmak.key }]);
    expect(pregled.ciljevi).toEqual({
      [kajmak.key]: { naziv: KAJMAK, stranicaKey: zadata.key, stranica: "Kompletan meni", roomService: false },
    });
  });

  test("an article on two pages points at the default page", () => {
    const s0 = pocetno();
    const tamjanika = artikal(s0, "Tamjanika");
    const stranice = new Set(s0.snapshot.placements.filter((p) => p.articleKey === tamjanika.key).map((p) => p.pageKey));
    expect(stranice).toEqual(new Set([stranica(s0, "Kompletan meni").key, stranica(s0, "Vinska karta").key]));

    const pregled = pregledObjave(promeniCenu(s0, "Tamjanika", null), true);
    expect(pregled.greske.map((g) => g.artikalKey)).toEqual([tamjanika.key]);
    expect(pregled.ciljevi![tamjanika.key]).toEqual({
      naziv: "Tamjanika",
      stranicaKey: stranica(s0, "Kompletan meni").key,
      stranica: "Kompletan meni",
      roomService: false,
    });
  });

  test("an article left on no page (a warning) has a target without a page", () => {
    const s0 = pocetno();
    const prilozi = s0.snapshot.sections.find((sec) => sec.name === "Prilozi")!;
    const s1 = uspeh(obrisiSekciju(s0, prilozi.key)).stanje;
    const pregled = pregledObjave(s1, true);
    expect(pregled.upozorenja.length).toBeGreaterThan(0);
    for (const upozorenje of pregled.upozorenja) {
      expect(upozorenje.kod).toBe("article_unplaced");
      const cilj = pregled.ciljevi![upozorenje.artikalKey!];
      expect(cilj).toEqual({
        naziv: s1.snapshot.articles.find((a) => a.key === upozorenje.artikalKey)!.name,
        stranicaKey: null,
        stranica: null,
        roomService: false,
      });
    }
  });

  test("a draft with no issues has no targets", () => {
    expect(pregledObjave(pocetno(), true).ciljevi).toEqual({});
  });

  test("changed prices come with the old and the new price, by name", () => {
    const s1 = objavljeno(pocetno({}, ANA), SADA);
    const s2 = promeniCenu(promeniCenu(s1, PRSUT, 900), KAJMAK, 520);
    const pregled = pregledObjave(s2, true);
    expect(pregled.promeneCena).toEqual([
      { artikalKey: artikal(s2, KAJMAK).key, naziv: KAJMAK, pre: 480, posle: 520 },
      { artikalKey: artikal(s2, PRSUT).key, naziv: PRSUT, pre: 920, posle: 900 },
    ]);
    expect(pregled.sazetak!.cene).toBe(2);
  });

  test("the list holds the first 20 changes by name while the summary counts all of them", () => {
    const s1 = objavljeno(pocetno({}, ANA), SADA);
    const prikazani = prikazaniKljucevi(s1.snapshot);
    const izmenjivi = s1.snapshot.articles.filter(
      (a) => a.kind === "item" && a.basePriceRsd !== null && prikazani.has(a.key),
    );
    expect(izmenjivi.length).toBeGreaterThanOrEqual(25);
    let s2 = s1;
    for (const a of izmenjivi.slice(0, 25)) s2 = promeniCenu(s2, a.name, a.basePriceRsd! + 10);

    const pregled = pregledObjave(s2, true);
    expect(pregled.sazetak!.cene).toBe(25);
    expect(pregled.promeneCena).toHaveLength(20);
    const imena = pregled.promeneCena!.map((p) => p.naziv);
    expect(imena).toEqual([...imena].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (const promena of pregled.promeneCena!) expect(promena.posle).toBe(promena.pre! + 10);
  });

  test("a cleared price shows as old -> null next to its error", () => {
    const s1 = objavljeno(pocetno({}, ANA), SADA);
    const s2 = promeniCenu(s1, KAJMAK, null);
    const pregled = pregledObjave(s2, true);
    expect(pregled.promeneCena).toEqual([{ artikalKey: artikal(s2, KAJMAK).key, naziv: KAJMAK, pre: 480, posle: null }]);
    expect(pregled.greske).toEqual([{ kod: "price_missing", artikalKey: artikal(s2, KAJMAK).key }]);
  });

  test("a never published draft has no price changes and no live version", () => {
    const pregled = pregledObjave(promeniCenu(pocetno(), KAJMAK, 520), true);
    expect(pregled.promeneCena).toEqual([]);
    expect(pregled.objavljenaVerzija).toBeNull();
  });

  test("the live version is the one before this publish", () => {
    const s1 = objavljeno(pocetno({}, ANA), SADA);
    expect(pregledObjave(s1, true).objavljenaVerzija).toBe(1);
    expect(pregledObjave(s1, true).promeneCena).toEqual([]);
    const s2 = objavljeno(promeniCenu(s1, KAJMAK, 520), SADA + DAN);
    expect(pregledObjave(promeniCenu(s2, KAJMAK, 530), true).objavljenaVerzija).toBe(2);
  });
});
