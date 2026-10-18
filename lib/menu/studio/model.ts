// ScanMe Menu V1 — the editor's view model (K10, docs/meni/planovi/K09.md §1.3).
//
// The editor UI (components/menu/studio/**) never talks to Convex directly:
// it receives `StudioPodaci` and calls `StudioRadnje`. Two implementations
// exist — the Convex one (components/menu/studio/veza) and the in-memory one
// of the izlog (./memorija.ts) — so the dev preview is fully interactive
// without a backend. Ids are plain strings here; the Convex side casts them.

import type { CasValue } from "../cas";
import type { MenuMode } from "../modes";
import type { MenuActor } from "../permissions";

export type StudioKontekst = {
  lokal: string;
  slug: string;
  rezim: MenuMode;
  actor: Exclude<MenuActor, "staff">;
  /** menu.edit and client editing switched on. */
  mozeUredjivanje: boolean;
  /** menu.publish and client editing switched on. */
  mozeObjavu: boolean;
  /** menu.availability: live "Privremeno nedostupno", independent of client editing. */
  mozeDostupnost: boolean;
  plan: "standard" | "premium";
  /** Room service: Premium AND switched on in Funkcionalnosti (master §13.4). */
  roomService: boolean;
};

export type StudioStranica = {
  id: string;
  key: string;
  slug: string;
  naziv: string;
  podrazumevana: boolean;
  arhivirana: boolean;
  sakrivena: boolean;
  /** An active QR card points here: delete and archive are refused (master §3.2). */
  imaQr: boolean;
  brojPrikaza: number;
};

export type StudioMedij = "image" | "icon" | "none";

export type StudioArtikal = {
  id: string;
  key: string;
  vrsta: "item" | "combo";
  naziv: string;
  opis: string | null;
  /** THE base price in whole dinars, shared by every standard page (master §5.3). */
  cena: number | null;
  kolicina: number | null;
  jedinica: string | null;
  medij: StudioMedij;
  ikonica: string | null;
  varijante: boolean;
  /** Combo whose component price changed: "Proveri cenu" (master §5.4). */
  proveriCenu: boolean;
};

export type StudioRed = {
  prikazId: string;
  redosled: number;
  /** "Sakrij" on this page (draft). */
  sakriven: boolean;
  artikal: StudioArtikal;
};

export type StudioSekcija = {
  id: string;
  key: string;
  naziv: string;
  redosled: number;
  redovi: StudioRed[];
};

export type StudioRadniSadrzaj = {
  stranica: { id: string; key: string; naziv: string; podrazumevana: boolean; arhivirana: boolean };
  sekcije: StudioSekcija[];
  /** A ceiling cut the lists (very large page). */
  skraceno: boolean;
};

export type StudioStatusNacrta = {
  stanje: "never_published" | "clean" | "dirty";
  objavljenaVerzija: number | null;
  objavljenoU: number | null;
};

/** Everything the editor shows. undefined = still loading. */
export type StudioPodaci = {
  kontekst: StudioKontekst;
  stranice: StudioStranica[] | undefined;
  sadrzaj: StudioRadniSadrzaj | null | undefined;
  status: StudioStatusNacrta | undefined;
  /** Article keys marked "Privremeno nedostupno" right now (live). */
  nedostupni: ReadonlySet<string>;
  /** False while the connection to the server is down (the editor says so). */
  povezano: boolean;
};

// -----------------------------------------------------------------------------
// Outcomes of actions
// -----------------------------------------------------------------------------

export type StudioGreska = {
  ok: false;
  vrsta: "greska";
  /** A machine code (`menu/…`, `plan/…`) with text in menu-domen, or "mreza". */
  kod: string;
  /** Worth retrying as is (network, timeout); a refusal is not. */
  ponovljivo: boolean;
};

export type StudioKonflikt = {
  ok: false;
  vrsta: "konflikt";
  /** The value saved meanwhile (master §6.1: never overwritten silently). */
  sacuvano: CasValue;
  /** The value this person tried to write. */
  pokusano: CasValue;
};

export type StudioIshod<T = null> = { ok: true; vrednost: T } | StudioKonflikt | StudioGreska;

export const ISHOD_OK: StudioIshod = { ok: true, vrednost: null };

export type StudioKandidat = { artikalId: string; naziv: string; cena: number | null };

export type BrziUnosRezultat =
  | { status: "dodato"; artikalId: string; prikazId: string }
  | { status: "slicno"; kandidati: StudioKandidat[] };

export type TabelaOdluka = "novi" | "postojeci" | "preskoci";

export type TabelaUnosRed = {
  sekcijaId: string;
  naziv: string;
  cena: number | null;
  odluka?: TabelaOdluka;
  postojeciId?: string;
};

export type TabelaRezultat =
  | { status: "dodato"; novih: number; postojecih: number; preskoceno: number }
  | { status: "slicno"; redovi: { indeks: number; kandidati: StudioKandidat[] }[] };

export type StudioPregledObjave = {
  revizija: number;
  stanje: StudioStatusNacrta["stanje"];
  mozeObjavu: boolean;
  menjaSe: boolean;
  prevelik: boolean;
  greske: { kod: string; artikalKey: string | null }[];
  upozorenja: { kod: string; artikalKey: string | null; jezik: string | null; broj: number | null }[];
  otisak: string;
  sazetak: {
    cene: number;
    novi: number;
    uklonjeni: number;
    sakriveno: number;
    uklonjenoSaStranice: number;
    obrisano: number;
    redosled: number;
  } | null;
};

export type StudioObjavaRezultat =
  | { status: "objavljeno"; verzija: number }
  | { status: "odbijeno"; razlog: "stale_draft" | "no_changes" | "validation_failed" | "confirmation_required" };

export type StudioRadnje = {
  // Pages (master §3.2) — the page column only.
  dodajStranicu(naziv: string): Promise<StudioIshod<{ id: string }>>;
  preimenujStranicu(id: string, naziv: string, ocekivano: string): Promise<StudioIshod>;
  duplirajStranicu(id: string): Promise<StudioIshod<{ id: string }>>;
  premestiStranicu(id: string, naIndeks: number): Promise<StudioIshod>;
  arhivirajStranicu(id: string): Promise<StudioIshod>;
  vratiStranicu(id: string): Promise<StudioIshod>;
  obrisiStranicu(id: string): Promise<StudioIshod>;
  // Sections.
  dodajSekciju(stranicaId: string, naziv: string): Promise<StudioIshod<{ id: string }>>;
  preimenujSekciju(id: string, naziv: string, ocekivano: string): Promise<StudioIshod>;
  obrisiSekciju(id: string): Promise<StudioIshod>;
  // Articles.
  brziUnos(
    sekcijaId: string,
    unos: { naziv: string; cena: number | null },
    dozvoliDuplikat: boolean,
  ): Promise<StudioIshod<BrziUnosRezultat>>;
  brziUnosVise(stranicaId: string, redovi: TabelaUnosRed[]): Promise<StudioIshod<TabelaRezultat>>;
  dodajPostojeci(sekcijaId: string, artikalId: string): Promise<StudioIshod>;
  noviKombo(
    sekcijaId: string,
    unos: { naziv: string; cena: number | null; sastojci: string[] },
  ): Promise<StudioIshod<{ id: string }>>;
  /** The shared base price (CAS on the price this person last saw). */
  postaviCenu(artikalId: string, ocekivana: number | null, nova: number | null): Promise<StudioIshod>;
  // Publishing (master §6.1).
  pregledObjave(): Promise<StudioIshod<StudioPregledObjave>>;
  objavi(revizija: number, potvrda: string | undefined): Promise<StudioIshod<StudioObjavaRezultat>>;
};
