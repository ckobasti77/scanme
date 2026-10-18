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

// K11 — group actions and deletion with consequences (master §5.6, §13.4).

/** One price of `Promeni cene`, with the price the owner saw (compare-and-set). */
export type StudioPromenaCene = { artikalId: string; ocekivana: number | null; nova: number };

export type StudioCeneRezultat =
  | { status: "promenjeno"; broj: number }
  /** A price changed meanwhile: nothing was written (all or nothing). */
  | { status: "konflikt"; artikli: { artikalId: string; sacuvano: number | null }[] };

/** What deleting one article removes: the pages that show it and the combos that contain it. */
export type StudioUticajArtikla = {
  artikalId: string;
  naziv: string;
  vrsta: "item" | "combo";
  stranice: { naziv: string; arhivirana: boolean; prikaza: number }[];
  /** Names of the combo articles that lose it (and get "Proveri cenu"). */
  kombo: string[];
  varijante: number;
  roomService: boolean;
};

export type StudioUticajBrisanja = {
  artikli: StudioUticajArtikla[];
  /** Confirms exactly this impact; a changed impact needs a new look. */
  token: string;
  /** An article is on more places than one deletion may remove. */
  prevelik: boolean;
};

export type StudioBrisanjeRezultat =
  | { status: "obrisano"; broj: number }
  /** The impact changed since it was shown: nothing was deleted. */
  | { status: "potvrdi"; uticaj: StudioUticajBrisanja };

export type StudioSekcijaStranice = { id: string; naziv: string };

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
  // K11 — order: drag and drop and `Premesti` (draft).
  /** Moves a row into `uSekciju` (same page), directly before `prePrikaza` (null = the end). */
  premestiPrikaz(prikazId: string, uSekciju: string, prePrikaza: string | null): Promise<StudioIshod>;
  premestiSekciju(sekcijaId: string, naIndeks: number): Promise<StudioIshod>;
  // K11 — article states and `Izaberi više` (one call each, at most 200 ids).
  /** LIVE: "Privremeno nedostupno" goes to guests at once, without Objavi. */
  postaviDostupnost(artikalIds: readonly string[], dostupno: boolean): Promise<StudioIshod<{ promenjeno: number }>>;
  postaviVidljivost(prikazIds: readonly string[], sakriveno: boolean): Promise<StudioIshod<{ promenjeno: number }>>;
  ukloniSaStranice(prikazIds: readonly string[]): Promise<StudioIshod<{ uklonjeno: number }>>;
  premestiUSekciju(prikazIds: readonly string[], sekcijaId: string): Promise<StudioIshod<{ premesteno: number; preskoceno: number }>>;
  dodajNaStranicu(artikalIds: readonly string[], sekcijaId: string): Promise<StudioIshod<{ dodato: number; preskoceno: number }>>;
  sekcijeStranice(stranicaId: string): Promise<StudioIshod<StudioSekcijaStranice[]>>;
  postaviCene(promene: readonly StudioPromenaCene[]): Promise<StudioIshod<StudioCeneRezultat>>;
  uticajBrisanja(artikalIds: readonly string[]): Promise<StudioIshod<StudioUticajBrisanja>>;
  obrisiArtikle(artikalIds: readonly string[], token: string): Promise<StudioIshod<StudioBrisanjeRezultat>>;
};
