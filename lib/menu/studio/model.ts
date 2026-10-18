// ScanMe Menu V1 — the editor's view model (K10, docs/meni/planovi/K09.md §1.3).
//
// The editor UI (components/menu/studio/**) never talks to Convex directly:
// it receives `StudioPodaci` and calls `StudioRadnje`. Two implementations
// exist — the Convex one (components/menu/studio/veza) and the in-memory one
// of the izlog (./memorija.ts) — so the dev preview is fully interactive
// without a backend. Ids are plain strings here; the Convex side casts them.

import type { CasValue } from "../cas";
import type { IzgledIzmena } from "../identity/izbor";
import type { MenuIzgledPlan } from "../identity/premium";
import type { MenuMode } from "../modes";
import type { MenuActor } from "../permissions";
import type { MenuPromo } from "../promo";
import type { RoomServiceMarkupScope, RoomServicePriceOrigin } from "../room-service-pricing";
import type { MenuPresentationValues } from "../presentation";
import type { MenuTranslationField, MenuTranslations } from "../translation-status";

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
  /** K18: the draft revision now; a publish review of an older one is stale (master §6.1). */
  revizija?: number;
  /** K18: who changed the draft last and when (null = unknown). */
  poslednjaIzmena?: { ime: string | null; ja: boolean; u: number } | null;
  /** K18: the draft was made from this published version (restore) and is not published yet. */
  vracenoIz?: number | null;
};

// -----------------------------------------------------------------------------
// K18 — who else is in the editor (master §6.1: "sistem prikazuje ko trenutno
// uređuje isti artikal"). A signal, never a lock.
// -----------------------------------------------------------------------------

export type StudioEntitetPrisustva = { vrsta: "article" | "page" | "room_service"; key: string };

/** Another person in this menu's editor now (never the person themself). */
export type StudioPrisutan = {
  /** Stable per person (the user id in the app). */
  id: string;
  ime: string | null;
  /** What they have open (null = the editor, nothing in particular). */
  entitet: StudioEntitetPrisustva | null;
};

// -----------------------------------------------------------------------------
// K18 — versions (master §6.1: the newest 20 publications; a restore makes a NEW
// DRAFT and the public menu does not change until Objavi).
// -----------------------------------------------------------------------------

export type StudioSazetakObjave = {
  cene: number;
  novi: number;
  uklonjeni: number;
  sakriveno: number;
  uklonjenoSaStranice: number;
  obrisano: number;
  redosled: number;
};

export type StudioVerzija = {
  broj: number;
  objavljenoU: number;
  /** Who published it (a name or e-mail; null = unknown). */
  objavio: string | null;
  sazetak: StudioSazetakObjave;
  /** It was published from a draft restored from this version. */
  vracenoIz: number | null;
  /** Guests see this one now. */
  uzivo: boolean;
};

export type StudioVerzije = { uzivo: number | null; verzije: StudioVerzija[] };

export type StudioVracanjeRezultat =
  | {
      status: "vraceno";
      broj: number;
      /** clean = the draft is the live version again (unpublished changes discarded). */
      stanje: "clean" | "dirty";
      /** Rows the draft changed by (0 = it already was this version). */
      izmena: number;
      /** Pages with a QR card kept as they are (a restore never removes them). */
      zadrzaneStranice: string[];
      /** Images of the version that no longer exist (the article got its icon or nothing). */
      bezSlike: number;
    }
  | { status: "odbijeno"; razlog: "stale_draft" };

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
  /** K15: the open article (undefined = loading or none open, null = it no longer exists). */
  detalj?: StudioDetaljArtikla | null;
  /** K16: the languages of the menu (managed in Settings); undefined = loading. */
  jezici?: StudioJezici;
  /** K16: the open translations view (undefined = loading or closed, null = refused). */
  prevodi?: StudioPrevodiPogled | null;
  /** K16: Room service while its context is open (undefined = loading or closed, null = refused). */
  roomServicePodaci?: StudioRoomService | null;
  /** K17: the draft appearance and what the account may choose (undefined = loading, null = refused). */
  izgled?: StudioIzgled | null;
  /** K18: other people in this menu's editor now (lib/menu/studio/presence-view.ts). */
  prisustvo?: readonly StudioPrisutan[];
};

// -----------------------------------------------------------------------------
// K17 — Izgled: the appearance of the public menu (master §7.1, §7.4, §15.2)
// -----------------------------------------------------------------------------

export type StudioIzgled = {
  /** The DRAFT appearance (guests see the published one until Objavi). */
  vrednosti: MenuPresentationValues;
  /** Premium design variants and reduced branding (the account). */
  plan: MenuIzgledPlan;
};

// -----------------------------------------------------------------------------
// K16 — translations (master §7.7), Room service (master §5.3) and combos (§5.4)
// -----------------------------------------------------------------------------

export type StudioJezici = {
  izvorni: string;
  /** The translation languages this plan publishes, in the order of Settings. */
  prevodi: string[];
  /** Languages in Settings above the plan's limit (lost Premium): not published, not editable. */
  vanLimita: string[];
  /** Languages the plan allows, the source included (Standard 2). */
  max: number;
  /** AI suggestions: Premium AND a configured key (P7); `razlog` says why not. */
  ai: { dostupno: boolean; razlog: "premium" | "kljuc" | null };
};

export type StudioPrevodVrsta = "page" | "section" | "article" | "variant" | "addonGroup" | "addonOption" | "roomServiceCategory";

/** One translatable thing: its source texts and its translations (all languages). */
export type StudioPrevodStavka = {
  vrsta: StudioPrevodVrsta;
  /** What the action addresses (a Convex id in the app, the key in the izlog). */
  id: string;
  key: string;
  /** Source texts by field; a field absent here is not translated for this kind. */
  izvor: Partial<Record<MenuTranslationField, string | null>>;
  prevodi: MenuTranslations | null;
  /** The heading it is listed under: the page itself, a section (by name), add-on groups or Room service. */
  grupa: { vrsta: "stranica" | "sekcija" | "dodaci" | "room-service"; naziv: string | null };
  /** A variant or add-on: the article or group it belongs to. */
  pripada: string | null;
};

export type StudioPrevodiPogled = {
  /** "stranica" = the open page; "room-service" = the Room service categories. */
  obuhvat: "stranica" | "room-service";
  naslov: string;
  stavke: StudioPrevodStavka[];
  skraceno: boolean;
};

export type StudioPrevodCilj = { vrsta: StudioPrevodVrsta; id: string };

export type StudioRsUpozorenje = {
  stavkaId: string;
  naziv: string;
  staraOsnovna: number | null;
  novaOsnovna: number | null;
  /** The manual Room service price that stays unless the owner recomputes. */
  rsCena: number | null;
  /** What "Ponovo izračunaj prema markup-u" would set. */
  izracunata: number | null;
};

export type StudioRsVarijanta = { key: string; naziv: string; cena: number | null; poreklo: RoomServicePriceOrigin };

export type StudioRsRed = {
  stavkaId: string;
  artikalId: string;
  artikalKey: string;
  naziv: string;
  osnovna: number | null;
  /** Selected for the markup (matters when the markup applies to selected articles). */
  uvecanje: boolean;
  rucna: number | null;
  /** The price a guest in a room pays. */
  cena: number | null;
  poreklo: RoomServicePriceOrigin;
  upozorenje: StudioRsUpozorenje | null;
  varijante: StudioRsVarijanta[];
};

export type StudioRsKategorija = { id: string; key: string; naziv: string; redovi: StudioRsRed[] };

export type StudioRoomService = {
  pravila: { uvecanje: number | null; obuhvat: RoomServiceMarkupScope; naknada: number | null };
  kategorije: StudioRsKategorija[];
  /** Articles of the menu that are not in Room service yet. */
  vanRs: number;
  skraceno: boolean;
};

export type StudioRsPravila = StudioRoomService["pravila"];

export type StudioKombo = {
  sastojci: { artikalId: string; key: string; naziv: string; kolicina: number; cena: number | null }[];
  /** "Proveri cenu": what changed since the combo price was last decided. */
  proveri: { od: number; promenjeni: string[]; uklonjeni: string[] } | null;
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

export type StudioKandidat = {
  artikalId: string;
  naziv: string;
  cena: number | null;
  /** K16: a combo cannot be a combo component (absent = unknown, treated as an ordinary article). */
  vrsta?: "item" | "combo";
};

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

/** K18: where an issue's article is, so the dialog can take the owner there. */
export type StudioCiljProblema = {
  naziv: string;
  /** A page that shows the article (the default page first); null = on no page. */
  stranicaKey: string | null;
  stranica: string | null;
  /** The article is in Room service. */
  roomService: boolean;
};

export type StudioPregledObjave = {
  revizija: number;
  stanje: StudioStatusNacrta["stanje"];
  mozeObjavu: boolean;
  menjaSe: boolean;
  prevelik: boolean;
  greske: { kod: string; artikalKey: string | null; entitetKey?: string | null }[];
  upozorenja: {
    kod: string;
    artikalKey: string | null;
    jezik: string | null;
    broj: number | null;
    /** K18: the variant or add-on group an article warning is about. */
    entitetKey?: string | null;
  }[];
  otisak: string;
  sazetak: StudioSazetakObjave | null;
  /** K18: the live version before this publish (null = never published). */
  objavljenaVerzija?: number | null;
  /** K18: the articles of the issues by key (lib/menu/publish-targets.ts). */
  ciljevi?: Readonly<Record<string, StudioCiljProblema>>;
  /** K18: the first changed prices, old → new (the count stays in `sazetak.cene`). */
  promeneCena?: { artikalKey: string; naziv: string; pre: number | null; posle: number | null }[];
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

// K15 — the article detail (master §5.5–§5.7, §7.3–§7.6, §7.9, §13.4). One
// subscription while the detail is open (menuStudio.articleDetail in the app,
// lib/menu/studio/detalj.ts in the izlog); nothing per row.

export type StudioVarijanta = { id: string; key: string; naziv: string; cena: number | null };

export type StudioOpcijaDodatka = { id: string; key: string; naziv: string; doplata: number };

export type StudioGrupaDodataka = {
  id: string;
  key: string;
  naziv: string;
  izbor: "single" | "multiple";
  obavezna: boolean;
  /** Advanced rules; null = the default of the choice (lib/menu/addons.ts). */
  min: number | null;
  max: number | null;
  /** Articles the group is linked to, this one included: more than one = a linked (shared) group. */
  brojArtikala: number;
  opcije: StudioOpcijaDodatka[];
};

/** One appearance of the article: page, section, visibility on that page. */
export type StudioPrikazArtikla = {
  prikazId: string;
  stranicaId: string;
  stranica: string;
  podrazumevana: boolean;
  arhivirana: boolean;
  sekcijaId: string;
  sekcija: string;
  sakriven: boolean;
};

export type StudioAlergeni = {
  sadrzi: string[];
  tragovi: string[];
  /** Describes `other` ("Drugo"). */
  drugo: string | null;
};

export type StudioMedijArtikla = { medij: StudioMedij; ikonica: string | null; slikaId: string | null };

export type StudioDetaljArtikla = {
  artikal: StudioArtikal;
  /** The image (when one is set): its preview URL (null while it cannot be shown). */
  slika: { id: string; url: string | null } | null;
  ukljuceno: { varijante: boolean; dodaci: boolean; napomena: boolean };
  varijante: StudioVarijanta[];
  grupe: StudioGrupaDodataka[];
  /** The venue keeps allergens (an optional system of the venue, master §7.3). */
  alergeniUkljuceni: boolean;
  /** null = no record: UNKNOWN, never "safe". */
  alergeni: StudioAlergeni | null;
  oznake: string[];
  akcija: MenuPromo | null;
  prikazi: StudioPrikazArtikla[];
  /** K16: a combo's components and its "Proveri cenu" (null = not a combo). */
  kombo?: StudioKombo | null;
  /** K16: the article and its variants as translatable things. */
  prevodi?: StudioPrevodStavka[];
};

/** A linked group: the articles a change of it reaches (addonGroupUsage). */
export type StudioUticajGrupe = { artikli: { id: string; naziv: string }[]; ukupno: number; skraceno: boolean };

export type StudioPostojecaGrupa = {
  id: string;
  naziv: string;
  izbor: "single" | "multiple";
  obavezna: boolean;
  brojArtikala: number;
};

export type StudioPoljeArtikla = "name" | "description" | "quantityValue" | "quantityUnit";

export type StudioGrupaUnos = {
  naziv: string;
  izbor: "single" | "multiple";
  obavezna: boolean;
  min: number | null;
  max: number | null;
};

/** Where an upload is: bytes sent (0–1), then the server makes the web versions. */
export type StudioNapredakSlike = { faza: "slanje"; udeo: number } | { faza: "obrada" };

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
  /**
   * The shared base price (CAS on the price this person last saw). K16: when
   * the article has a MANUAL Room service price, the value is that warning
   * (old base, new base, RS price) so the editor asks at once; else null.
   */
  postaviCenu(artikalId: string, ocekivana: number | null, nova: number | null): Promise<StudioIshod<StudioRsUpozorenje | null>>;
  // Publishing (master §6.1).
  pregledObjave(): Promise<StudioIshod<StudioPregledObjave>>;
  objavi(revizija: number, potvrda: string | undefined): Promise<StudioIshod<StudioObjavaRezultat>>;
  // K18 — versions: the newest 20 publications; a restore makes a NEW DRAFT (`revizija`
  // = the draft the person saw; a newer one is refused, never overwritten).
  verzije(): Promise<StudioIshod<StudioVerzije>>;
  vratiVerziju(broj: number, revizija: number): Promise<StudioIshod<StudioVracanjeRezultat>>;
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
  // K15 — the article detail. Everything goes into the draft, except availability (live).
  /** Name, description, quantity or unit by compare-and-set (updateArticleFields). */
  izmeniPolje(artikalId: string, polje: StudioPoljeArtikla, ocekivano: CasValue, vrednost: CasValue): Promise<StudioIshod>;
  /** Image, icon or nothing; the icon also stands in for a missing image (setArticleMedia). */
  postaviMedij(artikalId: string, ocekivano: StudioMedijArtikla, novo: StudioMedijArtikla): Promise<StudioIshod>;
  /** Uploads one checked file and makes it the article's image (lib/menu/image-validation.ts). */
  otpremiSliku(
    artikalId: string,
    fajl: File,
    onNapredak: (napredak: StudioNapredakSlike) => void,
  ): Promise<StudioIshod<{ slikaId: string }>>;
  postaviPrekidace(artikalId: string, prekidaci: Partial<StudioDetaljArtikla["ukljuceno"]>): Promise<StudioIshod>;
  dodajVarijantu(artikalId: string, naziv: string, cena: number | null): Promise<StudioIshod<{ id: string }>>;
  izmeniVarijantu(
    varijantaId: string,
    ocekivano: { naziv?: string; cena?: number | null },
    izmena: { naziv?: string; cena?: number | null },
  ): Promise<StudioIshod>;
  obrisiVarijantu(varijantaId: string): Promise<StudioIshod>;
  novaGrupa(artikalId: string, unos: StudioGrupaUnos, opcije: { naziv: string; doplata: number }[]): Promise<StudioIshod<{ id: string }>>;
  postojeceGrupe(): Promise<StudioIshod<StudioPostojecaGrupa[]>>;
  prikaciGrupu(artikalId: string, grupaId: string): Promise<StudioIshod>;
  otkaciGrupu(artikalId: string, grupaId: string): Promise<StudioIshod>;
  uticajGrupe(grupaId: string): Promise<StudioIshod<StudioUticajGrupe>>;
  /**
   * A change of a group or of one of its add-ons. `samoZaArtikal` = an
   * independent copy for that article first (same transaction); null = the
   * change reaches every linked article.
   */
  izmeniGrupu(
    grupaId: string,
    ocekivano: Partial<StudioGrupaUnos>,
    izmena: Partial<StudioGrupaUnos>,
    samoZaArtikal: string | null,
  ): Promise<StudioIshod>;
  dodajOpciju(grupaId: string, opcija: { naziv: string; doplata: number }, samoZaArtikal: string | null): Promise<StudioIshod>;
  izmeniOpciju(
    opcijaId: string,
    ocekivano: { naziv?: string; doplata?: number },
    izmena: { naziv?: string; doplata?: number },
    samoZaArtikal: string | null,
  ): Promise<StudioIshod>;
  obrisiOpciju(opcijaId: string, samoZaArtikal: string | null): Promise<StudioIshod>;
  /** "Primeni i na druge artikle" (applyAddonGroupToArticles). */
  primeniGrupuNa(grupaId: string, artikalIds: readonly string[]): Promise<StudioIshod<{ dodato: number; preskoceno: number }>>;
  /** Articles of the whole menu by name (≤ 50), for "Primeni i na druge artikle". */
  traziArtikle(upit: string): Promise<StudioIshod<StudioKandidat[]>>;
  postaviAlergene(artikalId: string, ocekivano: StudioAlergeni | null, alergeni: StudioAlergeni | null): Promise<StudioIshod>;
  postaviOznake(artikalId: string, ocekivano: readonly string[], oznake: readonly string[]): Promise<StudioIshod>;
  /** Sets, changes or removes (null) the promotion by compare-and-set (setPromo). */
  postaviAkciju(artikalId: string, ocekivano: MenuPromo | null, akcija: MenuPromo | null): Promise<StudioIshod>;
  // K16 — combos (menuCombos): the components (a full new list) and "Zadrži cenu".
  postaviSastav(komboId: string, sastojci: readonly { artikalId: string; kolicina: number }[]): Promise<StudioIshod>;
  zadrziCenuKomboa(komboId: string): Promise<StudioIshod>;
  // K16 — translations (menuTranslations). Typed text is confirmed at once (draft);
  // an AI suggestion is stored next to it and published only after `potvrdiPredlog`.
  prevedi(
    cilj: StudioPrevodCilj,
    jezik: string,
    polje: MenuTranslationField,
    ocekivano: string | null,
    vrednost: string | null,
  ): Promise<StudioIshod>;
  predloziPrevod(cilj: StudioPrevodCilj, jezik: string): Promise<StudioIshod<{ polja: number }>>;
  potvrdiPredlog(cilj: StudioPrevodCilj, jezik: string, izmene: Partial<Record<MenuTranslationField, string>>): Promise<StudioIshod>;
  odbaciPredlog(cilj: StudioPrevodCilj, jezik: string): Promise<StudioIshod>;
  /** A stale translation the owner looked at and keeps ("Prevod je i dalje dobar"). */
  prevodJeDobar(cilj: StudioPrevodCilj, jezik: string): Promise<StudioIshod>;
  // K16 — Room service (menuRoomService; Premium, its own selection, categories and prices).
  rsPravila(ocekivano: Partial<StudioRsPravila>, izmena: Partial<StudioRsPravila>): Promise<StudioIshod>;
  rsDodajKategoriju(naziv: string): Promise<StudioIshod<{ id: string }>>;
  rsPreimenujKategoriju(id: string, naziv: string, ocekivano: string): Promise<StudioIshod>;
  rsPremestiKategoriju(id: string, naIndeks: number): Promise<StudioIshod>;
  rsObrisiKategoriju(id: string): Promise<StudioIshod>;
  /** "Preuzmi ceo meni": a ONE-TIME copy of the visible sections and articles of `Kompletan meni`. */
  rsPreuzmiCeoMeni(): Promise<StudioIshod<{ kategorija: number; artikala: number; vecU: number }>>;
  /** "Dodaj iz postojeće ponude": chosen articles into a category (an article is in RS at most once). */
  rsDodajArtikle(kategorijaId: string, artikalIds: readonly string[]): Promise<StudioIshod<{ dodato: number; vecU: number }>>;
  rsUkloni(stavkaId: string): Promise<StudioIshod>;
  rsPremestiStavku(stavkaId: string, uKategoriju: string, preStavke: string | null): Promise<StudioIshod>;
  rsUvecanje(stavkaIds: readonly string[], primeni: boolean): Promise<StudioIshod>;
  rsRucnaCena(stavkaId: string, ocekivana: number | null, nova: number | null): Promise<StudioIshod>;
  rsResiUpozorenje(stavkaId: string, akcija: "keepManual" | "recomputeFromMarkup"): Promise<StudioIshod>;
  /**
   * K17 — Izgled (menuPresentation.update): one change by compare-and-set; draft.
   * A conflict carries the saved and the tried values of the change's fields as
   * JSON text (lib/menu/studio/izgled-red.ts), the form the save queue holds.
   */
  postaviIzgled(ocekivano: IzgledIzmena, izmena: IzgledIzmena): Promise<StudioIshod>;
};
