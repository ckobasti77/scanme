// ScanMe Menu V1 — K15: the article detail's actions on the in-memory menu
// (the izlog's backend). Same rules as the Convex mutations: compare-and-set
// on the value last seen, linked add-on groups that change for every linked
// article or — with a scope — for one article's own copy, allergens that are
// recorded only while the venue keeps them, promotions with a Premium schedule.
//
// Everything runs on the invented "Demo restoran" (fixtureMenu("srednji")),
// deep-frozen, so a function that mutates its input throws.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../../components/menu/fixtures";
import { MENU_MAX_VARIANTS_PER_ARTICLE } from "../limits";
import { detaljIzSnapshota } from "./detalj";
import {
  dodajOpciju,
  dodajVarijantu,
  izmeniGrupu,
  izmeniOpciju,
  izmeniPolje,
  izmeniVarijantu,
  kanonskiAlergeni,
  novaGrupa,
  obrisiOpciju,
  obrisiVarijantu,
  postaviAkciju,
  postaviAlergene,
  postaviMedij,
  postaviOznake,
  postaviPrekidace,
  primeniGrupuNa,
  sacuvajOtpremljenuSliku,
  traziArtikle,
  uticajGrupe,
} from "./memorija-detalj";
import { noviKombo, pocetnoStanje, type MemorijaKorak, type MemorijaStanje } from "./memorija";
import type { StudioAlergeni } from "./model";
import { foldSerbian, normalizeArticleName } from "../text";
import type { MenuPromo } from "../promo";

const SADA = 1_760_000_000_000;
const PRILOZI = "Izaberite dva priloga";
const PECENJE = "Stepen pečenja";

const NOT_FOUND = "menu/not_found";
const INVALID = "menu/invalid_input";
const LIMIT = "menu/limit_reached";

// --- helpers ------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
  }
  return value;
}

function stanje(opcije: Parameters<typeof pocetnoStanje>[1] = { premium: false }): MemorijaStanje {
  return deepFreeze(pocetnoStanje(structuredClone(fixtureMenu("srednji").snapshot), opcije));
}

function saPostavkom(s: MemorijaStanje, allergensEnabled: boolean | null): MemorijaStanje {
  return deepFreeze({
    ...s,
    snapshot: { ...s.snapshot, settings: { ...s.snapshot.settings, allergensEnabled } },
  });
}

function artikal(s: MemorijaStanje, naziv: string) {
  const found = s.snapshot.articles.find((a) => a.name === naziv);
  if (!found) throw new Error(`fixture article "${naziv}" missing`);
  return found;
}

function grupaKey(s: MemorijaStanje, naziv: string): string {
  const found = s.snapshot.addonGroups.find((g) => g.name === naziv);
  if (!found) throw new Error(`fixture group "${naziv}" missing`);
  return found.key;
}

function detalj(s: MemorijaStanje, naziv: string, slikaUrl?: (id: string) => string | null) {
  const d = detaljIzSnapshota(s.snapshot, artikal(s, naziv).key, slikaUrl);
  if (!d) throw new Error(`no detail for "${naziv}"`);
  return d;
}

const grupe = (s: MemorijaStanje, naziv: string) => detalj(s, naziv).grupe;

function opcijaKey(s: MemorijaStanje, groupKey: string, naziv: string): string {
  const found = s.snapshot.addonOptions.find((o) => o.groupKey === groupKey && o.name === naziv);
  if (!found) throw new Error(`fixture option "${naziv}" missing`);
  return found.key;
}

function kod(korak: MemorijaKorak<unknown>): string | null {
  const ishod = korak.ishod;
  return !ishod.ok && ishod.vrsta === "greska" ? ishod.kod : null;
}

function jeKonflikt(korak: MemorijaKorak<unknown>): boolean {
  const ishod = korak.ishod;
  return !ishod.ok && ishod.vrsta === "konflikt";
}

function vrednost<T>(korak: MemorijaKorak<T>): T {
  if (!korak.ishod.ok) throw new Error(`step failed: ${JSON.stringify(korak.ishod)}`);
  return korak.ishod.vrednost;
}

function izmenjeno(korak: MemorijaKorak<unknown>, pre: MemorijaStanje): MemorijaStanje {
  expect(korak.ishod.ok).toBe(true);
  expect(korak.stanje.revizija).toBe(pre.revizija + 1);
  return korak.stanje;
}

/** Refusal, conflict or no-op: nothing is written (same state object, same revision). */
function nistaNijeUpisano(korak: MemorijaKorak<unknown>, pre: MemorijaStanje) {
  expect(korak.stanje).toBe(pre);
  expect(korak.stanje.revizija).toBe(pre.revizija);
}

function jedinstveniKljucevi(s: MemorijaStanje) {
  const kljucevi = [...s.snapshot.addonGroups.map((g) => g.key), ...s.snapshot.addonOptions.map((o) => o.key)];
  expect(new Set(kljucevi).size).toBe(kljucevi.length);
}

/** "Izaberite dva priloga" is linked to Pileći file, Svinjski vrat and Mešano meso; add Ćevapi and Ražnjići. */
function povezano() {
  const s0 = stanje();
  const g = grupaKey(s0, PRILOZI);
  const s = izmenjeno(primeniGrupuNa(s0, g, [artikal(s0, "Ćevapi").key, artikal(s0, "Ražnjići").key]), s0);
  return { s0, s, g, cevapi: artikal(s0, "Ćevapi").key };
}

const IME_PRILOZA = ["Pomfrit", "Pečeni krompir", "Pirinač sa povrćem", "Grilovano povrće", "Kajmak"];

// -----------------------------------------------------------------------------
// Fixture sanity
// -----------------------------------------------------------------------------

describe("the fixture the tests rely on", () => {
  test("Demo restoran keeps allergens and has the two groups", () => {
    const s = stanje();
    expect(s.snapshot.settings.allergensEnabled).toBe(true);
    expect(grupe(s, "Pileći file na žaru").map((g) => g.naziv)).toEqual([PRILOZI]);
    expect(grupe(s, "Vešalica").map((g) => g.naziv)).toEqual([PECENJE]);
    expect(grupe(s, "Ćevapi")).toEqual([]);
    expect(detalj(s, "Ćevapi").varijante).toHaveLength(2);
    expect(detalj(s, "Ražnjići").alergeni).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Linked add-on groups
// -----------------------------------------------------------------------------

describe("linking a group to more articles", () => {
  test("primeniGrupuNa links, counts, and bumps the revision once for the batch", () => {
    const s0 = stanje();
    const g = grupaKey(s0, PRILOZI);
    const korak = primeniGrupuNa(s0, g, [artikal(s0, "Ćevapi").key, artikal(s0, "Ražnjići").key]);
    expect(vrednost(korak)).toEqual({ dodato: 2, preskoceno: 0 });
    expect(korak.stanje.revizija).toBe(s0.revizija + 1);
    for (const naziv of ["Ćevapi", "Ražnjići", "Pileći file na žaru"]) {
      const lista = grupe(korak.stanje, naziv);
      expect(lista).toHaveLength(1);
      expect(lista[0].id).toBe(g);
      expect(lista[0].brojArtikala).toBe(5);
      expect(lista[0].opcije.map((o) => o.naziv)).toEqual(IME_PRILOZA);
    }
    expect(detalj(korak.stanje, "Ćevapi").ukljuceno.dodaci).toBe(true);
  });

  test("articles that already have the group are skipped; nothing new means no revision", () => {
    const { s, g } = povezano();
    const opet = primeniGrupuNa(s, g, [artikal(s, "Ćevapi").key, artikal(s, "Ražnjići").key]);
    expect(vrednost(opet)).toEqual({ dodato: 0, preskoceno: 2 });
    expect(opet.stanje.revizija).toBe(s.revizija);
    const mesano = primeniGrupuNa(s, g, [artikal(s, "Ćevapi").key, artikal(s, "Sarma").key]);
    expect(vrednost(mesano)).toEqual({ dodato: 1, preskoceno: 1 });
    expect(mesano.stanje.revizija).toBe(s.revizija + 1);
  });

  test("duplicate ids count once; empty list, unknown group and unknown article are refused", () => {
    const s = stanje();
    const g = grupaKey(s, PRILOZI);
    const cevapi = artikal(s, "Ćevapi").key;
    expect(vrednost(primeniGrupuNa(s, g, [cevapi, cevapi]))).toEqual({ dodato: 1, preskoceno: 0 });
    expect(kod(primeniGrupuNa(s, g, []))).toBe(INVALID);
    expect(kod(primeniGrupuNa(s, "nema", [cevapi]))).toBe(NOT_FOUND);
    expect(kod(primeniGrupuNa(s, g, [cevapi, "nema"]))).toBe(NOT_FOUND);
    nistaNijeUpisano(primeniGrupuNa(s, g, []), s);
  });

  test("uticajGrupe lists every linked article", () => {
    const { s, g } = povezano();
    const uticaj = vrednost(uticajGrupe(s, g));
    expect(uticaj.ukupno).toBe(5);
    expect(uticaj.skraceno).toBe(false);
    expect(uticaj.artikli.map((a) => a.naziv).sort()).toEqual(
      ["Ćevapi", "Mešano meso (za dvoje)", "Pileći file na žaru", "Ražnjići", "Svinjski vrat"].sort(),
    );
    expect(uticaj.artikli.map((a) => a.id).sort()).toEqual(
      ["Ćevapi", "Mešano meso (za dvoje)", "Pileći file na žaru", "Ražnjići", "Svinjski vrat"].map((n) => artikal(s, n).key).sort(),
    );
    expect(kod(uticajGrupe(s, "nema"))).toBe(NOT_FOUND);
  });
});

describe("izmeniGrupu on a linked group", () => {
  test("without a scope it renames the group for ALL linked articles", () => {
    const { s, g } = povezano();
    const korak = izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "Dva priloga" }, null);
    const sledece = izmenjeno(korak, s);
    for (const naziv of ["Ćevapi", "Ražnjići", "Pileći file na žaru", "Svinjski vrat", "Mešano meso (za dvoje)"]) {
      const lista = grupe(sledece, naziv);
      expect(lista).toHaveLength(1);
      expect(lista[0].id).toBe(g);
      expect(lista[0].naziv).toBe("Dva priloga");
      expect(lista[0].brojArtikala).toBe(5);
    }
    expect(sledece.snapshot.addonGroups).toHaveLength(s.snapshot.addonGroups.length);
    expect(sledece.brojac).toBe(s.brojac);
  });

  test("with a scope the article gets an independent copy and the others keep the old group", () => {
    const { s, g, cevapi } = povezano();
    const stariOpcijeKljucevi = new Set(s.snapshot.addonOptions.filter((o) => o.groupKey === g).map((o) => o.key));
    const sledece = izmenjeno(izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "Samo za ćevape" }, cevapi), s);

    const kopija = grupe(sledece, "Ćevapi");
    expect(kopija).toHaveLength(1);
    expect(kopija[0].id).not.toBe(g);
    expect(kopija[0].key).not.toBe(g);
    expect(kopija[0].naziv).toBe("Samo za ćevape");
    expect(kopija[0].brojArtikala).toBe(1);
    expect(kopija[0].izbor).toBe("multiple");
    expect(kopija[0].obavezna).toBe(true);
    expect([kopija[0].min, kopija[0].max]).toEqual([2, 2]);
    expect(kopija[0].opcije.map((o) => [o.naziv, o.doplata])).toEqual(
      s.snapshot.addonOptions.filter((o) => o.groupKey === g).sort((a, b) => a.order - b.order).map((o) => [o.name, o.priceDeltaRsd]),
    );
    // New keys all the way down.
    for (const opcija of kopija[0].opcije) expect(stariOpcijeKljucevi.has(opcija.key)).toBe(false);

    for (const naziv of ["Ražnjići", "Pileći file na žaru", "Svinjski vrat", "Mešano meso (za dvoje)"]) {
      const lista = grupe(sledece, naziv);
      expect(lista).toHaveLength(1);
      expect(lista[0].id).toBe(g);
      expect(lista[0].naziv).toBe(PRILOZI);
      expect(lista[0].brojArtikala).toBe(4);
      expect(lista[0].opcije.map((o) => o.naziv)).toEqual(IME_PRILOZA);
    }
    // The old group is untouched; one group and its options were added.
    expect(sledece.snapshot.addonGroups.find((x) => x.key === g)).toEqual(s.snapshot.addonGroups.find((x) => x.key === g));
    expect(sledece.snapshot.addonGroups).toHaveLength(s.snapshot.addonGroups.length + 1);
    expect(sledece.snapshot.addonOptions).toHaveLength(s.snapshot.addonOptions.length + IME_PRILOZA.length);
    expect(vrednost(uticajGrupe(sledece, g)).ukupno).toBe(4);
    expect(vrednost(uticajGrupe(sledece, kopija[0].id)).artikli.map((a) => a.naziv)).toEqual(["Ćevapi"]);
    jedinstveniKljucevi(sledece);
  });

  test("a scoped change keeps the position of the link on the article", () => {
    const { s, g, cevapi } = povezano();
    const pre = s.snapshot.articleAddonGroups.find((r) => r.articleKey === cevapi && r.groupKey === g)!;
    const sledece = izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "X" }, cevapi).stanje;
    const redovi = sledece.snapshot.articleAddonGroups.filter((r) => r.articleKey === cevapi);
    expect(redovi).toHaveLength(1);
    expect(redovi[0].order).toBe(pre.order);
  });

  test("a stale expected value is a conflict: nothing is written and NO copy is made", () => {
    const { s, g, cevapi } = povezano();
    const korak = izmeniGrupu(s, g, { naziv: "Stari naziv" }, { naziv: "Novi" }, cevapi);
    expect(jeKonflikt(korak)).toBe(true);
    expect(korak.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: PRILOZI, pokusano: "Novi" });
    nistaNijeUpisano(korak, s);
    expect(korak.stanje.snapshot.addonGroups).toHaveLength(s.snapshot.addonGroups.length);
    expect(korak.stanje.snapshot.addonOptions).toHaveLength(s.snapshot.addonOptions.length);
    expect(korak.stanje.brojac).toBe(s.brojac);
  });

  test("a no-op change with a scope makes no copy either", () => {
    const { s, g, cevapi } = povezano();
    const korak = izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: `  ${PRILOZI} ` }, cevapi);
    expect(korak.ishod.ok).toBe(true);
    nistaNijeUpisano(korak, s);
  });

  test("a scoped change on a group only that article uses changes the group itself (no copy)", () => {
    const s0 = stanje();
    const razn = artikal(s0, "Ražnjići").key;
    const s = izmenjeno(novaGrupa(s0, razn, { naziv: "Sos", izbor: "single", obavezna: false, min: null, max: null }, [{ naziv: "Ljuti", doplata: 0 }]), s0);
    const g = grupe(s, "Ražnjići")[0].id;
    const sledece = izmenjeno(izmeniGrupu(s, g, { naziv: "Sos" }, { naziv: "Sosovi" }, razn), s);
    const lista = grupe(sledece, "Ražnjići");
    expect(lista).toHaveLength(1);
    expect(lista[0].id).toBe(g);
    expect(lista[0].naziv).toBe("Sosovi");
    expect(sledece.snapshot.addonGroups).toHaveLength(s.snapshot.addonGroups.length);
    expect(sledece.snapshot.addonOptions).toHaveLength(s.snapshot.addonOptions.length);
    expect(sledece.brojac).toBe(s.brojac);
  });

  test("a scope on an article the group is not linked to is refused", () => {
    const { s, g } = povezano();
    const korak = izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "X" }, artikal(s, "Sarma").key);
    expect(kod(korak)).toBe("article/addon_group_not_attached");
    nistaNijeUpisano(korak, s);
  });

  test("rule changes: valid, contradictory (no copy) and malformed calls", () => {
    const { s, g, cevapi } = povezano();
    const siroko = izmenjeno(izmeniGrupu(s, g, { max: 2 }, { max: 3 }, null), s);
    expect(grupe(siroko, "Ražnjići")[0]).toMatchObject({ min: 2, max: 3 });

    const protivurecno = izmeniGrupu(s, g, { min: 2 }, { min: 4 }, cevapi);
    expect(kod(protivurecno)).toBe("article/addon_rules_invalid");
    nistaNijeUpisano(protivurecno, s);

    expect(kod(izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "  " }, null))).toBe(INVALID);
    expect(kod(izmeniGrupu(s, g, {}, {}, null))).toBe(INVALID);
    expect(kod(izmeniGrupu(s, g, {}, { naziv: "X" }, null))).toBe(INVALID);
    expect(kod(izmeniGrupu(s, "nema", { naziv: "a" }, { naziv: "b" }, null))).toBe(NOT_FOUND);
  });
});

describe("add-on options of a linked group", () => {
  test("izmeniOpciju without a scope changes it for all linked articles", () => {
    const { s, g } = povezano();
    const kajmak = opcijaKey(s, g, "Kajmak");
    const sledece = izmenjeno(izmeniOpciju(s, kajmak, { doplata: 80 }, { doplata: 100 }, null), s);
    for (const naziv of ["Ćevapi", "Ražnjići", "Svinjski vrat"]) {
      expect(grupe(sledece, naziv)[0].opcije.find((o) => o.naziv === "Kajmak")?.doplata).toBe(100);
    }
  });

  test("izmeniOpciju with a scope changes only the copy of that article", () => {
    const { s, g, cevapi } = povezano();
    const kajmak = opcijaKey(s, g, "Kajmak");
    const sledece = izmenjeno(izmeniOpciju(s, kajmak, { naziv: "Kajmak", doplata: 80 }, { naziv: "Domaći kajmak", doplata: 120 }, cevapi), s);

    const kopija = grupe(sledece, "Ćevapi")[0];
    expect(kopija.id).not.toBe(g);
    expect(kopija.brojArtikala).toBe(1);
    expect(kopija.opcije.map((o) => o.naziv)).toEqual([...IME_PRILOZA.slice(0, 4), "Domaći kajmak"]);
    expect(kopija.opcije.find((o) => o.naziv === "Domaći kajmak")?.doplata).toBe(120);
    expect(kopija.opcije.find((o) => o.naziv === "Domaći kajmak")?.key).not.toBe(kajmak);

    const ostali = grupe(sledece, "Ražnjići")[0];
    expect(ostali.id).toBe(g);
    expect(ostali.brojArtikala).toBe(4);
    expect(ostali.opcije.map((o) => [o.naziv, o.doplata])).toEqual([
      ["Pomfrit", 0],
      ["Pečeni krompir", 0],
      ["Pirinač sa povrćem", 0],
      ["Grilovano povrće", 60],
      ["Kajmak", 80],
    ]);
    jedinstveniKljucevi(sledece);
  });

  test("izmeniOpciju: stale value = conflict without a copy; no-op; bad input", () => {
    const { s, g, cevapi } = povezano();
    const kajmak = opcijaKey(s, g, "Kajmak");
    const stara = izmeniOpciju(s, kajmak, { doplata: 70 }, { doplata: 100 }, cevapi);
    expect(stara.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: 80, pokusano: 100 });
    nistaNijeUpisano(stara, s);
    const staroIme = izmeniOpciju(s, kajmak, { naziv: "Maslac" }, { naziv: "X" }, cevapi);
    expect(jeKonflikt(staroIme)).toBe(true);
    nistaNijeUpisano(staroIme, s);

    const isto = izmeniOpciju(s, kajmak, { doplata: 80 }, { doplata: 80 }, cevapi);
    expect(isto.ishod.ok).toBe(true);
    nistaNijeUpisano(isto, s);

    expect(kod(izmeniOpciju(s, kajmak, {}, {}, null))).toBe(INVALID);
    expect(kod(izmeniOpciju(s, kajmak, {}, { doplata: 100 }, null))).toBe(INVALID);
    expect(kod(izmeniOpciju(s, kajmak, { doplata: 80 }, { doplata: -5 }, null))).toBe(INVALID);
    expect(kod(izmeniOpciju(s, kajmak, { naziv: "Kajmak" }, { naziv: " " }, null))).toBe(INVALID);
    expect(kod(izmeniOpciju(s, "nema", { doplata: 1 }, { doplata: 2 }, null))).toBe(NOT_FOUND);
    expect(kod(izmeniOpciju(s, kajmak, { doplata: 80 }, { doplata: 90 }, artikal(s, "Sarma").key))).toBe("article/addon_group_not_attached");
  });

  test("dodajOpciju without a scope adds to the shared group", () => {
    const { s, g } = povezano();
    const sledece = izmenjeno(dodajOpciju(s, g, { naziv: " Salata ", doplata: 50 }, null), s);
    for (const naziv of ["Ćevapi", "Ražnjići", "Svinjski vrat"]) {
      const opcije = grupe(sledece, naziv)[0].opcije;
      expect(opcije).toHaveLength(6);
      expect(opcije[5]).toMatchObject({ naziv: "Salata", doplata: 50 });
    }
  });

  test("dodajOpciju with a scope adds to the copy only", () => {
    const { s, g, cevapi } = povezano();
    const sledece = izmenjeno(dodajOpciju(s, g, { naziv: "Salata", doplata: 50 }, cevapi), s);
    const kopija = grupe(sledece, "Ćevapi")[0];
    expect(kopija.id).not.toBe(g);
    expect(kopija.brojArtikala).toBe(1);
    expect(kopija.opcije).toHaveLength(6);
    expect(kopija.opcije[5]).toMatchObject({ naziv: "Salata", doplata: 50 });
    const ostali = grupe(sledece, "Ražnjići")[0];
    expect(ostali.id).toBe(g);
    expect(ostali.brojArtikala).toBe(4);
    expect(ostali.opcije).toHaveLength(5);
    jedinstveniKljucevi(sledece);
  });

  test("dodajOpciju refusals write nothing and make no copy", () => {
    const { s, g, cevapi } = povezano();
    for (const korak of [
      dodajOpciju(s, g, { naziv: "  ", doplata: 0 }, cevapi),
      dodajOpciju(s, g, { naziv: "Salata", doplata: -1 }, cevapi),
      dodajOpciju(s, g, { naziv: "Salata", doplata: 1.5 }, cevapi),
      dodajOpciju(s, "nema", { naziv: "Salata", doplata: 0 }, null),
      dodajOpciju(s, g, { naziv: "Salata", doplata: 0 }, artikal(s, "Sarma").key),
    ]) {
      expect(korak.ishod.ok).toBe(false);
      nistaNijeUpisano(korak, s);
    }
    expect(kod(dodajOpciju(s, g, { naziv: "Salata", doplata: 0 }, artikal(s, "Sarma").key))).toBe("article/addon_group_not_attached");
  });

  test("a full group refuses another option before any copy is made", () => {
    let s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    s = novaGrupa(s, razn, { naziv: "Pun", izbor: "multiple", obavezna: false, min: null, max: null }, []).stanje;
    const g = grupe(s, "Ražnjići")[0].id;
    s = primeniGrupuNa(s, g, [artikal(s, "Sarma").key]).stanje;
    for (let i = 0; i < 30; i += 1) s = vrednost1(dodajOpciju(s, g, { naziv: `Opcija ${i}`, doplata: 0 }, null));
    const pun = dodajOpciju(s, g, { naziv: "Previše", doplata: 0 }, razn);
    expect(kod(pun)).toBe(LIMIT);
    nistaNijeUpisano(pun, s);
  });

  test("obrisiOpciju without a scope deletes it for everyone", () => {
    const { s, g } = povezano();
    const sledece = izmenjeno(obrisiOpciju(s, opcijaKey(s, g, "Kajmak"), null), s);
    for (const naziv of ["Ćevapi", "Ražnjići", "Svinjski vrat"]) {
      expect(grupe(sledece, naziv)[0].opcije.map((o) => o.naziv)).toEqual(IME_PRILOZA.slice(0, 4));
    }
  });

  test("obrisiOpciju with a scope deletes it from the copy only", () => {
    const { s, g, cevapi } = povezano();
    const sledece = izmenjeno(obrisiOpciju(s, opcijaKey(s, g, "Kajmak"), cevapi), s);
    const kopija = grupe(sledece, "Ćevapi")[0];
    expect(kopija.id).not.toBe(g);
    expect(kopija.brojArtikala).toBe(1);
    expect(kopija.opcije.map((o) => o.naziv)).toEqual(IME_PRILOZA.slice(0, 4));
    const ostali = grupe(sledece, "Ražnjići")[0];
    expect(ostali.id).toBe(g);
    expect(ostali.brojArtikala).toBe(4);
    expect(ostali.opcije.map((o) => o.naziv)).toEqual(IME_PRILOZA);
    jedinstveniKljucevi(sledece);
  });

  test("obrisiOpciju on a group only that article uses deletes in place (no copy)", () => {
    const s = stanje();
    const vesalica = artikal(s, "Vešalica").key;
    const g = grupaKey(s, PECENJE);
    // "Stepen pečenja" is linked to three articles: scoped delete copies.
    const kopirano = izmenjeno(obrisiOpciju(s, opcijaKey(s, g, "Dobro pečeno"), vesalica), s);
    expect(grupe(kopirano, "Vešalica")[0].id).not.toBe(g);
    // Detach the others so only Vešalica keeps the group: now it is edited in place.
    const sama = {
      ...s,
      snapshot: { ...s.snapshot, articleAddonGroups: s.snapshot.articleAddonGroups.filter((r) => r.groupKey !== g || r.articleKey === vesalica) },
    };
    deepFreeze(sama);
    const mesto = izmenjeno(obrisiOpciju(sama, opcijaKey(sama, g, "Dobro pečeno"), vesalica), sama);
    expect(grupe(mesto, "Vešalica")[0].id).toBe(g);
    expect(grupe(mesto, "Vešalica")[0].opcije.map((o) => o.naziv)).toEqual(["Slabo pečeno", "Srednje pečeno"]);
    expect(mesto.snapshot.addonGroups).toHaveLength(sama.snapshot.addonGroups.length);
    expect(mesto.brojac).toBe(sama.brojac);
  });

  test("obrisiOpciju: unknown option and unattached scope are refused", () => {
    const { s, g } = povezano();
    expect(kod(obrisiOpciju(s, "nema", null))).toBe(NOT_FOUND);
    const korak = obrisiOpciju(s, opcijaKey(s, g, "Kajmak"), artikal(s, "Sarma").key);
    expect(kod(korak)).toBe("article/addon_group_not_attached");
    nistaNijeUpisano(korak, s);
  });
});

function vrednost1(korak: MemorijaKorak<unknown>): MemorijaStanje {
  expect(korak.ishod.ok).toBe(true);
  return korak.stanje;
}

// -----------------------------------------------------------------------------
// Variants
// -----------------------------------------------------------------------------

describe("variants", () => {
  test("dodajVarijantu adds a variant and switches variants on", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const korak = dodajVarijantu(s, razn, "  Mala   porcija ", 500);
    const sledece = izmenjeno(korak, s);
    const id = vrednost(korak).id;
    const d = detalj(sledece, "Ražnjići");
    expect(d.ukljuceno.varijante).toBe(true);
    expect(d.varijante).toEqual([{ id, key: id, naziv: "Mala porcija", cena: 500 }]);
    const druga = dodajVarijantu(sledece, razn, "Velika", null);
    expect(detalj(druga.stanje, "Ražnjići").varijante.map((v) => [v.naziv, v.cena])).toEqual([
      ["Mala porcija", 500],
      ["Velika", null],
    ]);
    expect(vrednost(druga).id).not.toBe(id);
  });

  test("dodajVarijantu refuses a combo, bad name, bad price, unknown article", () => {
    const s = stanje();
    const kombo = dodajVarijantu(s, artikal(s, "Ručak dana").key, "Velika", 1500);
    expect(kod(kombo)).toBe("article/not_combo");
    nistaNijeUpisano(kombo, s);
    const razn = artikal(s, "Ražnjići").key;
    expect(kod(dodajVarijantu(s, razn, "   ", 500))).toBe(INVALID);
    expect(kod(dodajVarijantu(s, razn, "x".repeat(61), 500))).toBe(INVALID);
    expect(kod(dodajVarijantu(s, razn, "Mala", -1))).toBe(INVALID);
    expect(kod(dodajVarijantu(s, razn, "Mala", 12.5))).toBe(INVALID);
    expect(kod(dodajVarijantu(s, "nema", "Mala", 500))).toBe(NOT_FOUND);
  });

  test("an article takes at most MENU_MAX_VARIANTS_PER_ARTICLE variants", () => {
    let s = stanje();
    const cevapi = artikal(s, "Ćevapi").key;
    const jos = MENU_MAX_VARIANTS_PER_ARTICLE - 2;
    for (let i = 0; i < jos; i += 1) s = vrednost1(dodajVarijantu(s, cevapi, `Porcija ${i}`, 100 + i));
    expect(detalj(s, "Ćevapi").varijante).toHaveLength(MENU_MAX_VARIANTS_PER_ARTICLE);
    const preko = dodajVarijantu(s, cevapi, "Jedna previše", 1);
    expect(kod(preko)).toBe(LIMIT);
    nistaNijeUpisano(preko, s);
  });

  test("izmeniVarijantu changes name and price by compare-and-set", () => {
    const s = stanje();
    const v = detalj(s, "Ćevapi").varijante[0];
    expect(v).toMatchObject({ naziv: "5 komada", cena: 520 });
    const sledece = izmenjeno(izmeniVarijantu(s, v.id, { naziv: "5 komada", cena: 520 }, { naziv: " 6  komada ", cena: 600 }), s);
    expect(detalj(sledece, "Ćevapi").varijante[0]).toMatchObject({ naziv: "6 komada", cena: 600 });
    expect(detalj(sledece, "Ćevapi").varijante[1]).toMatchObject({ naziv: "10 komada", cena: 880 });
    const cenaNull = izmenjeno(izmeniVarijantu(s, v.id, { cena: 520 }, { cena: null }), s);
    expect(detalj(cenaNull, "Ćevapi").varijante[0].cena).toBeNull();
  });

  test("izmeniVarijantu: conflict, no-op, malformed and unknown", () => {
    const s = stanje();
    const v = detalj(s, "Ćevapi").varijante[0];
    const staro = izmeniVarijantu(s, v.id, { cena: 999 }, { cena: 600 });
    expect(staro.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: 520, pokusano: 600 });
    nistaNijeUpisano(staro, s);
    const staroIme = izmeniVarijantu(s, v.id, { naziv: "stari" }, { naziv: "novi" });
    expect(jeKonflikt(staroIme)).toBe(true);
    nistaNijeUpisano(staroIme, s);

    const isto = izmeniVarijantu(s, v.id, { naziv: "5 komada", cena: 520 }, { naziv: "5 komada", cena: 520 });
    expect(isto.ishod.ok).toBe(true);
    nistaNijeUpisano(isto, s);

    expect(kod(izmeniVarijantu(s, v.id, {}, {}))).toBe(INVALID);
    expect(kod(izmeniVarijantu(s, v.id, {}, { cena: 600 }))).toBe(INVALID);
    expect(kod(izmeniVarijantu(s, v.id, { naziv: "5 komada" }, { naziv: "  " }))).toBe(INVALID);
    expect(kod(izmeniVarijantu(s, v.id, { cena: 520 }, { cena: -3 }))).toBe(INVALID);
    expect(kod(izmeniVarijantu(s, "nema", { cena: 1 }, { cena: 2 }))).toBe(NOT_FOUND);
  });

  test("a variant price change marks the combos that contain the article for a price check", () => {
    const s0 = stanje();
    const corba = artikal(s0, "Teleća čorba").key;
    const paprike = artikal(s0, "Punjene paprike").key;
    expect(artikal(s0, "Ručak dana").priceCheck).toBeNull();

    const dodato = dodajVarijantu(s0, corba, "Velika", 450);
    const s = dodato.stanje;
    const id = vrednost(dodato).id;

    const promena = izmeniVarijantu(s, id, { cena: 450 }, { cena: 500 }, SADA);
    const posle = izmenjeno(promena, s);
    expect(artikal(posle, "Ručak dana").priceCheck).toEqual({ since: SADA, changedComponentKeys: [corba], removedComponentNames: [] });
    // Articles that are not combos are untouched.
    expect(artikal(posle, "Teleća čorba").priceCheck).toBeNull();
    expect(artikal(posle, "Sarma").priceCheck).toBeNull();

    // A second component of the same combo is appended, `since` stays.
    const mala = dodajVarijantu(posle, paprike, "Mala", 600);
    const drugi = izmeniVarijantu(mala.stanje, vrednost(mala).id, { cena: 600 }, { cena: 650 }, SADA + 1000);
    expect(artikal(drugi.stanje, "Ručak dana").priceCheck).toEqual({
      since: SADA,
      changedComponentKeys: [corba, paprike],
      removedComponentNames: [],
    });
  });

  test("a name-only change or an unrelated article leaves the combos alone", () => {
    const s0 = stanje();
    const corba = artikal(s0, "Teleća čorba").key;
    const s = dodajVarijantu(s0, corba, "Velika", 450);
    const id = vrednost(s);
    const samoIme = izmeniVarijantu(s.stanje, id.id,{ naziv: "Velika" }, { naziv: "Velika porcija" }, SADA);
    expect(artikal(samoIme.stanje, "Ručak dana").priceCheck).toBeNull();

    const cevapi = detalj(s0, "Ćevapi").varijante[0];
    const druga = izmeniVarijantu(s0, cevapi.id, { cena: 520 }, { cena: 550 }, SADA);
    expect(druga.stanje.snapshot.articles.every((a) => a.priceCheck === null)).toBe(true);
  });

  test("a combo made now is flagged too when its component's variant price changes", () => {
    const s0 = stanje();
    const sekcija = s0.snapshot.sections.find((x) => x.name === "Sa roštilja")!;
    const cevapi = artikal(s0, "Ćevapi").key;
    const kombo = noviKombo(s0, sekcija.key, { naziv: "Roštilj kombo", cena: 1000, sastojci: [cevapi] });
    const v = detalj(kombo.stanje, "Ćevapi").varijante[0];
    const posle = izmeniVarijantu(kombo.stanje, v.id, { cena: 520 }, { cena: 560 }, SADA);
    expect(artikal(posle.stanje, "Roštilj kombo").priceCheck).toEqual({ since: SADA, changedComponentKeys: [cevapi], removedComponentNames: [] });
    expect(artikal(posle.stanje, "Ručak dana").priceCheck).toBeNull();
  });

  test("obrisiVarijantu removes it; unknown id is refused", () => {
    const s = stanje();
    const v = detalj(s, "Ćevapi").varijante[0];
    const sledece = izmenjeno(obrisiVarijantu(s, v.id), s);
    expect(detalj(sledece, "Ćevapi").varijante.map((x) => x.naziv)).toEqual(["10 komada"]);
    const nema = obrisiVarijantu(s, "nema");
    expect(kod(nema)).toBe(NOT_FOUND);
    nistaNijeUpisano(nema, s);
  });
});

// -----------------------------------------------------------------------------
// Switches
// -----------------------------------------------------------------------------

describe("postaviPrekidace", () => {
  test("switches change; the same values are a no-op", () => {
    const s = stanje();
    const sledece = izmenjeno(postaviPrekidace(s, artikal(s, "Ražnjići").key, { dodaci: true, napomena: true }), s);
    expect(detalj(sledece, "Ražnjići").ukljuceno).toEqual({ varijante: false, dodaci: true, napomena: true });
    const opet = postaviPrekidace(sledece, artikal(sledece, "Ražnjići").key, { dodaci: true, napomena: true });
    expect(opet.ishod.ok).toBe(true);
    nistaNijeUpisano(opet, sledece);
  });

  test("nothing to set, unknown article, and variants on a combo are refused", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    expect(kod(postaviPrekidace(s, razn, {}))).toBe(INVALID);
    expect(kod(postaviPrekidace(s, "nema", { dodaci: true }))).toBe(NOT_FOUND);
    const kombo = postaviPrekidace(s, artikal(s, "Ručak dana").key, { varijante: true });
    expect(kod(kombo)).toBe("article/not_combo");
    nistaNijeUpisano(kombo, s);
  });
});

// -----------------------------------------------------------------------------
// Allergens
// -----------------------------------------------------------------------------

describe("allergens", () => {
  const sve: StudioAlergeni = { sadrzi: ["milk", "gluten"], tragovi: ["gluten", "eggs"], drugo: null };

  test("kanonskiAlergeni: canonical order, a code in both lists only in sadrzi, empty = null", () => {
    expect(kanonskiAlergeni(sve)).toEqual({ sadrzi: ["gluten", "milk"], tragovi: ["eggs"], drugo: null });
    expect(kanonskiAlergeni({ sadrzi: [], tragovi: [], drugo: "ništa" })).toBeNull();
    expect(kanonskiAlergeni(null)).toBeNull();
    expect(kanonskiAlergeni({ sadrzi: ["sulphites", "eggs", "milk"], tragovi: [], drugo: null })?.sadrzi).toEqual(["eggs", "milk", "sulphites"]);
    // "drugo" only stays with "other".
    expect(kanonskiAlergeni({ sadrzi: ["milk"], tragovi: [], drugo: "orasi" })?.drugo).toBeNull();
    expect(kanonskiAlergeni({ sadrzi: [], tragovi: ["other"], drugo: "  orasi   i  bademi " })).toEqual({
      sadrzi: [],
      tragovi: ["other"],
      drugo: "orasi i bademi",
    });
  });

  test("recorded in canonical order; a code in both lists is only in sadrzi", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const sledece = izmenjeno(postaviAlergene(s, razn, null, sve), s);
    const d = detalj(sledece, "Ražnjići");
    expect(d.alergeni).toEqual({ sadrzi: ["gluten", "milk"], tragovi: ["eggs"], drugo: null });
    expect(d.alergeniUkljuceni).toBe(true);
    expect(artikal(sledece, "Ražnjići").allergens).toEqual({ contains: ["gluten", "milk"], mayContain: ["eggs"], otherText: null });
  });

  test("an empty record is no record (null = unknown, never safe)", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const upisano = postaviAlergene(s, razn, null, sve).stanje;
    const prazno = izmenjeno(postaviAlergene(upisano, razn, sve, { sadrzi: [], tragovi: [], drugo: null }), upisano);
    expect(artikal(prazno, "Ražnjići").allergens).toBeNull();
    expect(detalj(prazno, "Ražnjići").alergeni).toBeNull();

    // An empty record on an article with none is a no-op, and so is null.
    const nista = postaviAlergene(s, razn, null, { sadrzi: [], tragovi: [], drugo: null });
    expect(nista.ishod.ok).toBe(true);
    nistaNijeUpisano(nista, s);
    nistaNijeUpisano(postaviAlergene(s, razn, null, null), s);
  });

  test("'other' needs a text; the text is cleaned and bounded", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    for (const drugo of [null, "", "   "]) {
      const korak = postaviAlergene(s, razn, null, { sadrzi: ["other"], tragovi: [], drugo });
      expect(kod(korak)).toBe(INVALID);
      nistaNijeUpisano(korak, s);
    }
    expect(kod(postaviAlergene(s, razn, null, { sadrzi: [], tragovi: ["other"], drugo: null }))).toBe(INVALID);
    expect(kod(postaviAlergene(s, razn, null, { sadrzi: ["other"], tragovi: [], drugo: "x".repeat(201) }))).toBe(INVALID);

    const ok = izmenjeno(postaviAlergene(s, razn, null, { sadrzi: ["other"], tragovi: [], drugo: "  orasi   i  bademi " }), s);
    expect(detalj(ok, "Ražnjići").alergeni).toEqual({ sadrzi: ["other"], tragovi: [], drugo: "orasi i bademi" });
    const granica = postaviAlergene(s, razn, null, { sadrzi: ["other"], tragovi: [], drugo: "x".repeat(200) });
    expect(granica.ishod.ok).toBe(true);
  });

  test("an unknown code is refused", () => {
    const s = stanje();
    const korak = postaviAlergene(s, artikal(s, "Ražnjići").key, null, { sadrzi: ["kikiriki"], tragovi: [], drugo: null });
    expect(kod(korak)).toBe(INVALID);
    nistaNijeUpisano(korak, s);
    expect(kod(postaviAlergene(s, "nema", null, null))).toBe(NOT_FOUND);
  });

  test.each([null, false])("allergens disabled (%s): recording is refused, clearing is allowed", (postavka) => {
    const s = saPostavkom(stanje(), postavka);
    const razn = artikal(s, "Ražnjići").key;
    const korak = postaviAlergene(s, razn, null, sve);
    expect(kod(korak)).toBe("article/allergens_disabled");
    nistaNijeUpisano(korak, s);
    expect(detalj(s, "Ražnjići").alergeniUkljuceni).toBe(false);

    // Clearing what was recorded earlier still works while the system is off.
    const sKajmak = artikal(s, "Kajmak sa pogačom").key;
    const staro = detalj(s, "Kajmak sa pogačom").alergeni;
    expect(staro).not.toBeNull();
    const ociscen = izmenjeno(postaviAlergene(s, sKajmak, staro, null), s);
    expect(artikal(ociscen, "Kajmak sa pogačom").allergens).toBeNull();
  });

  test("compare-and-set: a stale expected record is a conflict; a reordered equal set is not", () => {
    const s = stanje();
    const kajmak = artikal(s, "Kajmak sa pogačom").key;
    const staro = detalj(s, "Kajmak sa pogačom").alergeni!;
    expect([...staro.sadrzi].sort()).toEqual(["gluten", "milk"]);

    const konfliktni = postaviAlergene(s, kajmak, null, { sadrzi: ["eggs"], tragovi: [], drugo: null });
    expect(jeKonflikt(konfliktni)).toBe(true);
    nistaNijeUpisano(konfliktni, s);
    const pogresan = postaviAlergene(s, kajmak, { sadrzi: ["milk"], tragovi: [], drugo: null }, { sadrzi: ["eggs"], tragovi: [], drugo: null });
    expect(jeKonflikt(pogresan)).toBe(true);
    nistaNijeUpisano(pogresan, s);

    const drugiRedosled = postaviAlergene(s, kajmak, { sadrzi: ["milk", "gluten"], tragovi: [], drugo: null }, { sadrzi: ["eggs", "milk", "gluten"], tragovi: [], drugo: null });
    const sledece = izmenjeno(drugiRedosled, s);
    expect(detalj(sledece, "Kajmak sa pogačom").alergeni?.sadrzi).toEqual(["gluten", "eggs", "milk"]);
  });

  test("the same record again is a no-op", () => {
    const s = stanje();
    const kajmak = artikal(s, "Kajmak sa pogačom").key;
    const staro = detalj(s, "Kajmak sa pogačom").alergeni!;
    const opet = postaviAlergene(s, kajmak, staro, { sadrzi: [...staro.sadrzi].reverse(), tragovi: [], drugo: null });
    expect(opet.ishod.ok).toBe(true);
    nistaNijeUpisano(opet, s);
  });
});

// -----------------------------------------------------------------------------
// Tags
// -----------------------------------------------------------------------------

describe("tags", () => {
  test("stored in the normalized order, without duplicates", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const sledece = izmenjeno(postaviOznake(s, razn, [], ["homemade", "spicy", "vegan", "spicy"]), s);
    expect(detalj(sledece, "Ražnjići").oznake).toEqual(["vegan", "spicy", "homemade"]);
    expect(artikal(sledece, "Ražnjići").tags).toEqual(["vegan", "spicy", "homemade"]);
  });

  test("an empty list stores null", () => {
    const s = stanje();
    const kajmak = artikal(s, "Kajmak sa pogačom").key;
    const sledece = izmenjeno(postaviOznake(s, kajmak, ["homemade"], []), s);
    expect(artikal(sledece, "Kajmak sa pogačom").tags).toBeNull();
    expect(detalj(sledece, "Kajmak sa pogačom").oznake).toEqual([]);
  });

  test("unknown codes (new or expected) are refused", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const nova = postaviOznake(s, razn, [], ["vegan", "ukusno"]);
    expect(kod(nova)).toBe(INVALID);
    nistaNijeUpisano(nova, s);
    expect(kod(postaviOznake(s, razn, ["ukusno"], ["vegan"]))).toBe(INVALID);
    expect(kod(postaviOznake(s, "nema", [], ["vegan"]))).toBe(NOT_FOUND);
  });

  test("a stale expected list is a conflict; the same set is a no-op", () => {
    const s = stanje();
    const kajmak = artikal(s, "Kajmak sa pogačom").key;
    const stara = postaviOznake(s, kajmak, ["vegan"], ["spicy"]);
    expect(jeKonflikt(stara)).toBe(true);
    nistaNijeUpisano(stara, s);
    const isto = postaviOznake(s, kajmak, ["homemade"], ["homemade", "homemade"]);
    expect(isto.ishod.ok).toBe(true);
    nistaNijeUpisano(isto, s);
    // An expected list in another order is still the same list.
    const sa2 = izmenjeno(postaviOznake(s, artikal(s, "Daska sa mezetom").key, ["recommended"], ["recommended", "new"]), s);
    expect(artikal(sa2, "Daska sa mezetom").tags).toEqual(["recommended", "new"]);
  });
});

// -----------------------------------------------------------------------------
// Promotion
// -----------------------------------------------------------------------------

describe("postaviAkciju", () => {
  const obicna: MenuPromo = { active: true, mode: "percent", percent: 10, label: "promo" };
  const zakazana: MenuPromo = { ...obicna, startsAt: Date.UTC(2026, 9, 25, 7, 0), endsAt: Date.UTC(2026, 10, 1, 7, 0) };

  test("sets, changes and removes a promotion by compare-and-set", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const postavljeno = izmenjeno(postaviAkciju(s, razn, null, obicna), s);
    expect(detalj(postavljeno, "Ražnjići").akcija).toEqual(obicna);
    const promenjeno = izmenjeno(postaviAkciju(postavljeno, razn, obicna, { ...obicna, percent: 20 }), postavljeno);
    expect(detalj(promenjeno, "Ražnjići").akcija).toMatchObject({ percent: 20 });
    const uklonjeno = izmenjeno(postaviAkciju(promenjeno, razn, { ...obicna, percent: 20 }, null), promenjeno);
    expect(detalj(uklonjeno, "Ražnjići").akcija).toBeNull();
  });

  test("a scheduled, active promotion needs Premium", () => {
    const s = stanje({ premium: false });
    const razn = artikal(s, "Ražnjići").key;
    const odbijeno = postaviAkciju(s, razn, null, zakazana);
    expect(kod(odbijeno)).toBe("plan/premium_required");
    nistaNijeUpisano(odbijeno, s);
    // Only a start, or only an end, is a schedule too.
    expect(kod(postaviAkciju(s, razn, null, { ...obicna, startsAt: zakazana.startsAt }))).toBe("plan/premium_required");
    expect(kod(postaviAkciju(s, razn, null, { ...obicna, endsAt: zakazana.endsAt }))).toBe("plan/premium_required");

    const premium = stanje({ premium: true });
    const sledece = izmenjeno(postaviAkciju(premium, artikal(premium, "Ražnjići").key, null, zakazana), premium);
    expect(detalj(sledece, "Ražnjići").akcija).toEqual(zakazana);
  });

  test("a scheduled promotion that is switched off saves on Standard", () => {
    const s = stanje({ premium: false });
    const razn = artikal(s, "Ražnjići").key;
    const sledece = izmenjeno(postaviAkciju(s, razn, null, { ...zakazana, active: false }), s);
    expect(detalj(sledece, "Ražnjići").akcija).toMatchObject({ active: false });
  });

  test("an invalid promotion is article/promo_invalid", () => {
    const s = stanje({ premium: true });
    const razn = artikal(s, "Ražnjići").key;
    for (const akcija of [
      { active: true, mode: "percent", percent: 100 },
      { active: true, mode: "percent", percent: 0 },
      { active: true, mode: "percent" },
      { active: true, mode: "price", priceRsd: 860 },
      { active: true, mode: "price", priceRsd: 900 },
      { active: true, mode: "price" },
      { active: true, mode: "percent", percent: 10, startsAt: 2000, endsAt: 1000 },
    ] as MenuPromo[]) {
      const korak = postaviAkciju(s, razn, null, akcija);
      expect(kod(korak)).toBe("article/promo_invalid");
      nistaNijeUpisano(korak, s);
    }
    // Variants and no base price: a price promotion has nothing to be lower than.
    const bezCene = postaviAkciju(s, artikal(s, "Espresso").key, null, { active: true, mode: "price", priceRsd: 100 });
    expect(kod(bezCene)).toBe("article/promo_invalid");
  });

  test("an article with variants takes a percent promotion but not a price one", () => {
    const s = stanje({ premium: true });
    const cevapi = artikal(s, "Ćevapi").key;
    expect(kod(postaviAkciju(s, cevapi, null, { active: true, mode: "price", priceRsd: 400 }))).toBe("article/promo_invalid");
    expect(izmenjeno(postaviAkciju(s, cevapi, null, obicna), s).snapshot.articles.find((a) => a.key === cevapi)?.promo).toEqual(obicna);
  });

  test("a stale expected promotion is a conflict; the same promotion is a no-op", () => {
    const s = stanje();
    const file = artikal(s, "Pileći file na žaru");
    const stvarna = file.promo!;
    expect(stvarna.mode).toBe("percent");
    const konfliktni = postaviAkciju(s, file.key, null, obicna);
    expect(jeKonflikt(konfliktni)).toBe(true);
    nistaNijeUpisano(konfliktni, s);
    const isto = postaviAkciju(s, file.key, stvarna, { ...stvarna });
    expect(isto.ishod.ok).toBe(true);
    nistaNijeUpisano(isto, s);
    expect(kod(postaviAkciju(s, "nema", null, null))).toBe(NOT_FOUND);
  });

  test("removing a promotion that does not exist is a no-op", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const nista = postaviAkciju(s, razn, null, null);
    expect(nista.ishod.ok).toBe(true);
    nistaNijeUpisano(nista, s);
  });
});

// -----------------------------------------------------------------------------
// Image and icon
// -----------------------------------------------------------------------------

describe("postaviMedij", () => {
  const nista = { medij: "none", ikonica: null, slikaId: null } as const;

  test("sets an icon by compare-and-set", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const sledece = izmenjeno(postaviMedij(s, razn, nista, { medij: "icon", ikonica: "pljeskavica", slikaId: null }), s);
    expect(artikal(sledece, "Ražnjići")).toMatchObject({ mediaMode: "icon", iconKey: "pljeskavica", imageMediaId: null });
    const staro = postaviMedij(sledece, razn, nista, { medij: "none", ikonica: null, slikaId: null });
    expect(jeKonflikt(staro)).toBe(true);
    nistaNijeUpisano(staro, sledece);
  });

  test("an image without an id is refused", () => {
    const s = stanje();
    const korak = postaviMedij(s, artikal(s, "Ražnjići").key, nista, { medij: "image", ikonica: null, slikaId: null });
    expect(kod(korak)).toBe(INVALID);
    nistaNijeUpisano(korak, s);
  });

  test("an unknown image id is refused", () => {
    const s = stanje();
    const korak = postaviMedij(s, artikal(s, "Ražnjići").key, nista, { medij: "image", ikonica: null, slikaId: "nepoznata" });
    expect(kod(korak)).toBe(NOT_FOUND);
    nistaNijeUpisano(korak, s);
  });

  test("a known image id is accepted and resolves to its URL in the detail", () => {
    const s = deepFreeze({ ...stanje(), slike: new Map([["md_a", "https://slike.test/a.webp"]]) });
    const razn = artikal(s, "Ražnjići").key;
    const sledece = izmenjeno(postaviMedij(s, razn, nista, { medij: "image", ikonica: null, slikaId: "md_a" }), s);
    expect(detalj(sledece, "Ražnjići", (id) => sledece.slike?.get(id) ?? null).slika).toEqual({ id: "md_a", url: "https://slike.test/a.webp" });
    expect(detalj(sledece, "Ražnjići").slika).toEqual({ id: "md_a", url: null });
  });

  test("a blank or over-long icon key is refused; no change is a no-op; unknown article", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    expect(kod(postaviMedij(s, razn, nista, { medij: "icon", ikonica: "  ", slikaId: null }))).toBe(INVALID);
    expect(kod(postaviMedij(s, razn, nista, { medij: "icon", ikonica: "i".repeat(61), slikaId: null }))).toBe(INVALID);
    const isto = postaviMedij(s, razn, nista, nista);
    expect(isto.ishod.ok).toBe(true);
    nistaNijeUpisano(isto, s);
    expect(kod(postaviMedij(s, "nema", nista, nista))).toBe(NOT_FOUND);
  });
});

describe("sacuvajOtpremljenuSliku", () => {
  test("the upload gets a new id in slike and becomes the article's image", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const korak = sacuvajOtpremljenuSliku(s, razn, "https://slike.test/nova.webp");
    const sledece = izmenjeno(korak, s);
    const { slikaId } = vrednost(korak);
    expect(slikaId).toBe("md_mem0001");
    expect(sledece.slike?.get(slikaId)).toBe("https://slike.test/nova.webp");
    expect(sledece.brojac).toBe(1);
    expect(artikal(sledece, "Ražnjići")).toMatchObject({ mediaMode: "image", imageMediaId: slikaId });
    expect(detalj(sledece, "Ražnjići", (id) => sledece.slike?.get(id) ?? null).slika).toEqual({
      id: slikaId,
      url: "https://slike.test/nova.webp",
    });
    expect(s.slike).toBeUndefined();
  });

  test("a second upload keeps the first in slike and does not touch the old map", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const prvi = sacuvajOtpremljenuSliku(s, razn, "https://slike.test/1.webp");
    const drugi = sacuvajOtpremljenuSliku(prvi.stanje, razn, "https://slike.test/2.webp");
    expect(vrednost(drugi).slikaId).toBe("md_mem0002");
    expect(drugi.stanje.slike?.size).toBe(2);
    expect(prvi.stanje.slike?.size).toBe(1);
    expect(drugi.stanje.revizija).toBe(s.revizija + 2);
    expect(artikal(drugi.stanje, "Ražnjići").imageMediaId).toBe("md_mem0002");
  });

  test("an unknown article is refused", () => {
    const s = stanje();
    const korak = sacuvajOtpremljenuSliku(s, "nema", "https://slike.test/x.webp");
    expect(kod(korak)).toBe(NOT_FOUND);
    nistaNijeUpisano(korak, s);
  });
});

// -----------------------------------------------------------------------------
// Basic fields
// -----------------------------------------------------------------------------

describe("izmeniPolje", () => {
  test("name is cleaned and changes by compare-and-set", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const sledece = izmenjeno(izmeniPolje(s, razn, "name", "Ražnjići", "  Ražnjići   sa  lukom "), s);
    expect(artikal(sledece, "Ražnjići sa lukom").key).toBe(razn);
    expect(detalj(sledece, "Ražnjići sa lukom").artikal.naziv).toBe("Ražnjići sa lukom");
  });

  test("name is required and bounded", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    for (const naziv of ["", "   ", "x".repeat(121), null, 5]) {
      const korak = izmeniPolje(s, razn, "name", "Ražnjići", naziv as never);
      expect(kod(korak)).toBe(INVALID);
      nistaNijeUpisano(korak, s);
    }
    expect(izmeniPolje(s, razn, "name", "Ražnjići", "x".repeat(120)).ishod.ok).toBe(true);
  });

  test("a stale expected value is a conflict", () => {
    const s = stanje();
    const korak = izmeniPolje(s, artikal(s, "Ražnjići").key, "name", "Stari naziv", "Novi naziv");
    expect(korak.ishod).toEqual({ ok: false, vrsta: "konflikt", sacuvano: "Ražnjići", pokusano: "Novi naziv" });
    nistaNijeUpisano(korak, s);
  });

  test("the same value is a no-op", () => {
    const s = stanje();
    const korak = izmeniPolje(s, artikal(s, "Ražnjići").key, "name", "Ražnjići", " Ražnjići ");
    expect(korak.ishod.ok).toBe(true);
    nistaNijeUpisano(korak, s);
  });

  test("description, unit and quantity", () => {
    const s = stanje();
    const razn = artikal(s, "Ražnjići").key;
    const opis = izmenjeno(izmeniPolje(s, razn, "description", null, "  Sa   žara "), s);
    expect(artikal(opis, "Ražnjići").description).toBe("Sa žara");
    const prazno = izmenjeno(izmeniPolje(opis, razn, "description", "Sa žara", "   "), opis);
    expect(artikal(prazno, "Ražnjići").description).toBeNull();
    expect(kod(izmeniPolje(s, razn, "description", null, "x".repeat(601)))).toBe(INVALID);

    const kolicina = izmenjeno(izmeniPolje(s, razn, "quantityValue", null, 0.5), s);
    expect(artikal(kolicina, "Ražnjići").quantityValue).toBe(0.5);
    const jedinica = izmenjeno(izmeniPolje(kolicina, razn, "quantityUnit", null, "kg"), kolicina);
    expect(artikal(jedinica, "Ražnjići").quantityUnit).toBe("kg");
    expect(izmeniPolje(jedinica, razn, "quantityValue", 0.5, null).stanje.snapshot.articles.find((a) => a.key === razn)?.quantityValue).toBeNull();

    for (const losa of [0, -1, Number.NaN, 100_001, "5"]) {
      expect(kod(izmeniPolje(s, razn, "quantityValue", null, losa as never))).toBe(INVALID);
    }
    expect(kod(izmeniPolje(s, razn, "quantityUnit", null, "x".repeat(21)))).toBe(INVALID);
    expect(kod(izmeniPolje(s, razn, "quantityUnit", null, 5))).toBe(INVALID);
  });

  test("unknown article", () => {
    const s = stanje();
    expect(kod(izmeniPolje(s, "nema", "name", "a", "b"))).toBe(NOT_FOUND);
  });
});

// -----------------------------------------------------------------------------
// Search
// -----------------------------------------------------------------------------

describe("traziArtikle", () => {
  test("'cevapi' finds Ćevapi, diacritics and case ignored", () => {
    const s = stanje();
    const korak = traziArtikle(s, "cevapi");
    const nadjeni = vrednost(korak);
    expect(nadjeni.map((k) => k.naziv)).toContain("Ćevapi");
    expect(nadjeni.find((k) => k.naziv === "Ćevapi")).toEqual({ artikalId: artikal(s, "Ćevapi").key, naziv: "Ćevapi", cena: null, vrsta: "item" });
    expect(vrednost(traziArtikle(s, "ĆEVAPI")).map((k) => k.naziv)).toContain("Ćevapi");
    expect(vrednost(traziArtikle(s, "  cevapi ")).map((k) => k.naziv)).toContain("Ćevapi");
    nistaNijeUpisano(korak, s);
  });

  test("a substring matches and the price is the base price", () => {
    const s = stanje();
    const nadjeni = vrednost(traziArtikle(s, "pljeskavica"));
    expect(nadjeni.map((k) => k.naziv).sort()).toEqual(["Gurmanska pljeskavica", "Pljeskavica sa kajmakom"]);
    expect(nadjeni.find((k) => k.naziv === "Gurmanska pljeskavica")?.cena).toBe(920);
  });

  test("an empty or blank query finds nothing, and so does a miss", () => {
    const s = stanje();
    expect(vrednost(traziArtikle(s, ""))).toEqual([]);
    expect(vrednost(traziArtikle(s, "   "))).toEqual([]);
    expect(vrednost(traziArtikle(s, "???"))).toEqual([]);
    expect(vrednost(traziArtikle(s, "nepostojeci artikal"))).toEqual([]);
  });

  test("at most 50 results, sorted by name", () => {
    const veliki = deepFreeze(pocetnoStanje(structuredClone(fixtureMenu("veliki").snapshot), { premium: false }));
    const poklapanja = veliki.snapshot.articles.filter((a) => normalizeArticleName(a.name).includes("a")).length;
    expect(poklapanja).toBeGreaterThan(50);
    const nadjeni = vrednost(traziArtikle(veliki, "a"));
    expect(nadjeni).toHaveLength(50);
    const nazivi = nadjeni.map((k) => foldSerbian(k.naziv));
    expect(nazivi).toEqual([...nazivi].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

// -----------------------------------------------------------------------------
// Revision and immutability
// -----------------------------------------------------------------------------

describe("revision and immutability", () => {
  test("one change is one revision step, a no-op or refusal is none", () => {
    const s = stanje({ premium: true });
    const razn = artikal(s, "Ražnjići").key;
    const kajmak = artikal(s, "Kajmak sa pogačom").key;
    const g = grupaKey(s, PRILOZI);

    const promene: MemorijaKorak<unknown>[] = [
      izmeniPolje(s, razn, "name", "Ražnjići", "Ražnjići sa žara"),
      postaviMedij(s, razn, { medij: "none", ikonica: null, slikaId: null }, { medij: "icon", ikonica: "x", slikaId: null }),
      sacuvajOtpremljenuSliku(s, razn, "https://slike.test/a.webp"),
      postaviPrekidace(s, razn, { napomena: true }),
      dodajVarijantu(s, razn, "Mala", 400),
      izmeniVarijantu(s, detalj(s, "Ćevapi").varijante[0].id, { cena: 520 }, { cena: 530 }),
      obrisiVarijantu(s, detalj(s, "Ćevapi").varijante[0].id),
      novaGrupa(s, razn, { naziv: "Sos", izbor: "single", obavezna: false, min: null, max: null }, [{ naziv: "Ljuti", doplata: 0 }]),
      primeniGrupuNa(s, g, [razn, artikal(s, "Sarma").key]),
      izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "Prilozi" }, null),
      izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: "Prilozi" }, artikal(s, "Pileći file na žaru").key),
      izmeniOpciju(s, opcijaKey(s, g, "Kajmak"), { doplata: 80 }, { doplata: 90 }, artikal(s, "Svinjski vrat").key),
      dodajOpciju(s, g, { naziv: "Salata", doplata: 10 }, artikal(s, "Svinjski vrat").key),
      obrisiOpciju(s, opcijaKey(s, g, "Kajmak"), artikal(s, "Svinjski vrat").key),
      postaviAlergene(s, razn, null, { sadrzi: ["milk"], tragovi: [], drugo: null }),
      postaviOznake(s, razn, [], ["spicy"]),
      postaviAkciju(s, razn, null, { active: true, mode: "percent", percent: 10 }),
      postaviAkciju(s, razn, null, { active: true, mode: "percent", percent: 10, startsAt: 1000, endsAt: 2000 }),
    ];
    for (const korak of promene) {
      expect(korak.ishod.ok).toBe(true);
      expect(korak.stanje.revizija).toBe(s.revizija + 1);
      expect(korak.stanje).not.toBe(s);
    }

    const nicega: MemorijaKorak<unknown>[] = [
      izmeniPolje(s, razn, "name", "Ražnjići", "Ražnjići"),
      izmeniPolje(s, razn, "name", "pogrešno", "Nešto drugo"),
      izmeniPolje(s, razn, "name", "Ražnjići", ""),
      postaviMedij(s, razn, { medij: "none", ikonica: null, slikaId: null }, { medij: "none", ikonica: null, slikaId: null }),
      postaviMedij(s, razn, { medij: "none", ikonica: null, slikaId: null }, { medij: "image", ikonica: null, slikaId: null }),
      postaviPrekidace(s, razn, { napomena: false }),
      postaviPrekidace(s, razn, {}),
      dodajVarijantu(s, artikal(s, "Ručak dana").key, "Mala", 1),
      izmeniVarijantu(s, detalj(s, "Ćevapi").varijante[0].id, { cena: 1 }, { cena: 530 }),
      obrisiVarijantu(s, "nema"),
      primeniGrupuNa(s, g, [artikal(s, "Pileći file na žaru").key]),
      izmeniGrupu(s, g, { naziv: "pogrešno" }, { naziv: "Prilozi" }, artikal(s, "Pileći file na žaru").key),
      izmeniGrupu(s, g, { naziv: PRILOZI }, { naziv: PRILOZI }, null),
      izmeniOpciju(s, opcijaKey(s, g, "Kajmak"), { doplata: 1 }, { doplata: 90 }, artikal(s, "Svinjski vrat").key),
      postaviAlergene(s, razn, null, null),
      postaviAlergene(s, kajmak, null, { sadrzi: ["milk"], tragovi: [], drugo: null }),
      postaviOznake(s, razn, [], ["ukusno"]),
      postaviOznake(s, kajmak, ["homemade"], ["homemade"]),
      postaviAkciju(s, razn, null, null),
      postaviAkciju(s, razn, null, { active: true, mode: "percent", percent: 100 }),
    ];
    for (const korak of nicega) {
      // primeniGrupuNa returns a fresh state object even when it linked nothing: same snapshot, same revision.
      expect(korak.stanje.snapshot).toBe(s.snapshot);
      expect(korak.stanje.revizija).toBe(s.revizija);
    }
  });

  test("the input state is never mutated (it is deep-frozen), and its JSON is unchanged", () => {
    const s = stanje({ premium: true });
    const pre = JSON.stringify({ ...s, nedostupni: [...s.nedostupni], qrStranice: [...s.qrStranice] });
    const razn = artikal(s, "Ražnjići").key;
    const g = grupaKey(s, PRILOZI);

    // Chain many changes on the same frozen start state: a mutation would throw.
    let t = s;
    t = izmeniPolje(t, razn, "description", null, "Opis").stanje;
    t = sacuvajOtpremljenuSliku(t, razn, "https://slike.test/a.webp").stanje;
    t = dodajVarijantu(t, razn, "Mala", 400).stanje;
    t = primeniGrupuNa(t, g, [razn]).stanje;
    t = izmeniGrupu(t, g, { naziv: PRILOZI }, { naziv: "Samo ražnjići" }, razn).stanje;
    t = dodajOpciju(t, g, { naziv: "Salata", doplata: 10 }, artikal(s, "Svinjski vrat").key).stanje;
    t = obrisiOpciju(t, opcijaKey(t, g, "Kajmak"), null).stanje;
    t = postaviAlergene(t, razn, null, { sadrzi: ["eggs", "gluten"], tragovi: ["gluten"], drugo: null }).stanje;
    t = postaviOznake(t, razn, [], ["vegan"]).stanje;
    t = postaviAkciju(t, razn, null, { active: true, mode: "percent", percent: 10, startsAt: 1000 }).stanje;
    t = postaviPrekidace(t, razn, { dodaci: true }).stanje;
    expect(t.revizija).toBeGreaterThan(s.revizija);

    expect(JSON.stringify({ ...s, nedostupni: [...s.nedostupni], qrStranice: [...s.qrStranice] })).toBe(pre);
  });
});
