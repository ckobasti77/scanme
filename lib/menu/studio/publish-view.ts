// ScanMe Menu V1 — what the publish dialog shows and whether `Objavi meni` may
// run (K18; master §6.1: "objavljivanje treba da bude svesna radnja";
// "greške blokiraju objavu; upozorenja dozvoljavaju objavu tek nakon svesne
// potvrde"; "proverava da li su nastale novije izmene od poslednjeg previewa").
//
// PURE. The server checks everything again at publish time (K05: stale_draft,
// validation_failed, confirmation_required); this is the same decision made
// visible BEFORE the click, so the dialog can say why the button waits.

import type { AutosaveZbir } from "./autosave-queue";
import type { StudioCiljProblema, StudioPregledObjave, StudioSazetakObjave } from "./model";

// -----------------------------------------------------------------------------
// Consequences ("broj izmenjenih cena, novih i uklonjenih artikala,
// strukturnih izmena")
// -----------------------------------------------------------------------------

export type DetaljStrukture = "sakriveno" | "uklonjenoSaStranice" | "obrisano" | "redosled";

export type RedPosledica =
  | { vrsta: "cene" | "novi" | "uklonjeni"; broj: number }
  | { vrsta: "strukturne"; broj: number; detalji: { vrsta: DetaljStrukture; broj: number }[] };

/** The lines of "Šta se menja", in the master's order; a count of 0 is not a line. */
export function redoviPosledica(sazetak: StudioSazetakObjave | null): RedPosledica[] {
  if (!sazetak) return [];
  const redovi: RedPosledica[] = [];
  if (sazetak.cene > 0) redovi.push({ vrsta: "cene", broj: sazetak.cene });
  if (sazetak.novi > 0) redovi.push({ vrsta: "novi", broj: sazetak.novi });
  if (sazetak.uklonjeni > 0) redovi.push({ vrsta: "uklonjeni", broj: sazetak.uklonjeni });
  const detalji = (["sakriveno", "uklonjenoSaStranice", "obrisano", "redosled"] as const)
    .map((vrsta) => ({ vrsta, broj: sazetak[vrsta] }))
    .filter((detalj) => detalj.broj > 0);
  const strukturne = detalji.reduce((zbir, detalj) => zbir + detalj.broj, 0);
  if (strukturne > 0) redovi.push({ vrsta: "strukturne", broj: strukturne, detalji });
  return redovi;
}

// -----------------------------------------------------------------------------
// Errors and warnings, grouped so each article is ONE line with ONE way to it
// -----------------------------------------------------------------------------

export type ProblemArtikla = {
  artikalKey: string;
  /** Codes of this article, first-seen order, without repeats. */
  kodovi: string[];
  /** Where the article is; null = the server did not say (the dialog still opens it). */
  cilj: StudioCiljProblema | null;
  /** Some issue is about a variant or an add-on group (the detail opens that group). */
  uVarijantama: boolean;
};

export type ProblemObjave = { kod: string; jezik: string | null; broj: number | null };

export type GrupisaniProblemi = { artikli: ProblemArtikla[]; ostali: ProblemObjave[] };

type Problem = { kod: string; artikalKey: string | null; jezik?: string | null; broj?: number | null; entitetKey?: string | null };

/** Article issues by article (first-seen order), and the issues of the whole publication. */
export function grupisiProbleme(
  problemi: readonly Problem[],
  ciljevi: Readonly<Record<string, StudioCiljProblema>> | undefined,
): GrupisaniProblemi {
  const poArtiklu = new Map<string, ProblemArtikla>();
  const ostali: ProblemObjave[] = [];
  for (const problem of problemi) {
    if (!problem.artikalKey) {
      ostali.push({ kod: problem.kod, jezik: problem.jezik ?? null, broj: problem.broj ?? null });
      continue;
    }
    let red = poArtiklu.get(problem.artikalKey);
    if (!red) {
      red = { artikalKey: problem.artikalKey, kodovi: [], cilj: ciljevi?.[problem.artikalKey] ?? null, uVarijantama: false };
      poArtiklu.set(problem.artikalKey, red);
    }
    if (!red.kodovi.includes(problem.kod)) red.kodovi.push(problem.kod);
    if (problem.entitetKey) red.uVarijantama = true;
  }
  return { artikli: [...poArtiklu.values()], ostali };
}

/** How many separate things block (one per article, plus whole-publication errors). */
export function brojProblema(grupisani: GrupisaniProblemi): number {
  return grupisani.artikli.length + grupisani.ostali.length;
}

// -----------------------------------------------------------------------------
// May `Objavi meni` run now?
// -----------------------------------------------------------------------------

export type RazlogCekanja =
  /** The review is still loading. */
  | "ucitava"
  /** This person cannot publish (role, or client editing switched off). */
  | "bez-dozvole"
  /** The draft changed after this review: refresh first. */
  | "zastarelo"
  /** Own edits are still being saved: the review would miss them. */
  | "cuva-se"
  /** A field waits for the person's choice after a conflict (their value would silently not go out). */
  | "konflikt"
  /** The version would not fit (the server refuses it as well). */
  | "prevelik"
  /** Errors block. */
  | "greske"
  /** Nothing changes for guests (the server would refuse it as no_changes). */
  | "bez-promena"
  /** Warnings wait for the conscious confirmation. */
  | "potvrda";

export type StanjeObjave = { moze: true; razlog: null } | { moze: false; razlog: RazlogCekanja };

/** The review is of an older draft than the one saved now (anyone's newer edit). */
export function jeZastareo(pregled: Pick<StudioPregledObjave, "revizija"> | null, revizijaSada: number | undefined): boolean {
  return pregled !== null && revizijaSada !== undefined && revizijaSada !== pregled.revizija;
}

/**
 * The decision, in order of what the owner must do first: wait for the
 * review, have the right, refresh a stale review, let own edits save, then
 * fix errors, and only then confirm warnings.
 */
export function stanjeObjave(ulaz: {
  pregled: StudioPregledObjave | null;
  revizijaSada: number | undefined;
  potvrdjeno: boolean;
  cuvanje: AutosaveZbir["stanje"];
  /** Keys of the save queue in conflict (AutosaveRed.brojKonflikata); absent = none. */
  konflikata?: number;
}): StanjeObjave {
  const { pregled } = ulaz;
  const ne = (razlog: RazlogCekanja): StanjeObjave => ({ moze: false, razlog });
  if (!pregled) return ne("ucitava");
  if (!pregled.mozeObjavu) return ne("bez-dozvole");
  if (jeZastareo(pregled, ulaz.revizijaSada)) return ne("zastarelo");
  if (ulaz.cuvanje === "cuva-se") return ne("cuva-se");
  if ((ulaz.konflikata ?? 0) > 0) return ne("konflikt");
  if (pregled.prevelik) return ne("prevelik");
  if (pregled.greske.length > 0) return ne("greske");
  if (!pregled.menjaSe) return ne("bez-promena");
  if (pregled.upozorenja.length > 0 && !ulaz.potvrdjeno) return ne("potvrda");
  return { moze: true, razlog: null };
}

/** What `Objavi meni` sends: the reviewed revision, and the warnings' fingerprint when there were warnings. */
export function zahtevObjave(pregled: StudioPregledObjave): { revizija: number; potvrda: string | undefined } {
  return { revizija: pregled.revizija, potvrda: pregled.upozorenja.length > 0 ? pregled.otisak : undefined };
}

// -----------------------------------------------------------------------------
// The article detail opened from Objavi: is the issue that led here fixed yet?
// -----------------------------------------------------------------------------

export type StanjeArtiklaZaProveru = {
  naziv: string;
  cena: number | null;
  varijanteUkljucene: boolean;
  ceneVarijanti: readonly (number | null)[];
  /** Placements in sections on non-archived pages. */
  prikaza: number;
};

/**
 * The three errors of publishing (lib/menu/errors/publish.ts), checked again on
 * what the editor shows now: true = fixed, false = still there, null = this
 * code is not judged here (warnings: Objavi checks them again).
 */
export function problemResen(kod: string, artikal: StanjeArtiklaZaProveru): boolean | null {
  if (kod === "name_missing") return artikal.naziv.trim() !== "";
  if (kod === "price_missing") return artikal.cena !== null || (artikal.varijanteUkljucene && artikal.ceneVarijanti.some((cena) => cena !== null));
  if (kod === "section_missing") return artikal.prikaza > 0;
  return null;
}
