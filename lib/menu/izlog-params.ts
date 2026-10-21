// ScanMe Menu V1 — parameters of the izlog (dev preview routes, K07).
//
// The five /dev/menu-*-preview routes read their query string only through
// these pure parsers. Rule (docs/MENI-PLAN.md §7): an unknown or malformed
// value gives the default state, never an error; a repeated parameter
// (`?a=1&a=2`) counts by its first value. Each screen value also names the
// run step that builds it, so a route can say honestly which step is missing.

import { normalizujAlergene } from "./allergen-warnings";
import { normalizujFiltere } from "./filters";
import { MENU_SOURCE_LANGUAGE, MENU_TRANSLATION_LANGUAGES } from "./languages";
import { MENU_PRETRAGA_MAX } from "./search";

export type IzlogSearchParams = Record<string, string | string[] | undefined>;

/** The app theme the izlog forces while a route is open; null = keep the app's own theme. */
export type IzlogTema = "svetla" | "tamna";

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `value` when it is one of `allowed`, otherwise `fallback`. */
export function pickParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const first = firstParam(value);
  return first !== undefined && (allowed as readonly string[]).includes(first) ? (first as T) : fallback;
}

/** `value` when it is one of `allowed`, otherwise null (the parameter is absent). */
export function pickOptional<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  const first = firstParam(value);
  return first !== undefined && (allowed as readonly string[]).includes(first) ? (first as T) : null;
}

export const IZLOG_TEME = ["svetla", "tamna"] as const;

export function parseTema(value: string | string[] | undefined): IzlogTema | null {
  return pickOptional(value, IZLOG_TEME);
}

/**
 * A link inside the izlog: `path` plus the given parameters in the given
 * order; null, undefined and "" are left out (so `tema: null` keeps the URL clean).
 */
export function izlogHref(path: string, params: Record<string, string | null | undefined>): string {
  const query = Object.entries(params)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${path}?${query}` : path;
}

/** A screen of the izlog and the run step that builds it. */
type IzlogScreens<T extends string> = Readonly<Record<T, { korak: string }>>;

// ---------------------------------------------------------------------------
// /dev/menu-panel-preview
// ---------------------------------------------------------------------------

export const PANEL_SEKCIJE = [
  "pocetna",
  "editor",
  "operativa",
  "lokal",
  "funkcionalnosti",
  "tim",
  "analitika",
  "podesavanja",
  "primitivi",
] as const;
export type PanelSekcija = (typeof PANEL_SEKCIJE)[number];

/** Which step builds each panel section (docs/meni/planovi/K01.md §8); `primitivi` is K07 itself. */
export const PANEL_SEKCIJA_KORAK: IzlogScreens<PanelSekcija> = {
  pocetna: { korak: "K27" },
  editor: { korak: "K10" },
  operativa: { korak: "K27" },
  lokal: { korak: "K20" },
  funkcionalnosti: { korak: "K27" },
  tim: { korak: "K28" },
  analitika: { korak: "K30" },
  podesavanja: { korak: "K28" },
  primitivi: { korak: "K07" },
};

export const PANEL_PLANOVI = ["standard", "premium"] as const;
/** K08 adds `osoblje` (no client panel: message + waiter-panel link) and `admin` (ScanMe admin). */
export const PANEL_ULOGE = ["vlasnik", "menadzer", "urednik", "osoblje", "admin"] as const;

/** Whole-screen states of the shell (K08); absent = the section itself. */
export const PANEL_STANJA = ["ucitava", "prijava", "neaktivno", "bez-pristupa"] as const;
export type PanelStanje = (typeof PANEL_STANJA)[number];

/** The Menu actor (lib/menu/permissions.ts) behind each izlog role. */
export const PANEL_ULOGA_AKTER = {
  vlasnik: "owner",
  menadzer: "manager",
  urednik: "editor",
  osoblje: "staff",
  admin: "admin",
} as const satisfies Record<(typeof PANEL_ULOGE)[number], string>;

/** K25: how the venue takes reservations in the izlog (`rezervacije=…`); absent = the ScanMe form. */
export const PANEL_REZERVACIJE = ["forma", "eksterni", "iskljuceno"] as const;
export type PanelRezervacije = (typeof PANEL_REZERVACIJE)[number];

/** K27: the content state of Početna and Operativa (`stanje=paznja|mirno`); absent = something needs attention. */
export const PANEL_SADRZAJ_STANJA = ["paznja", "mirno"] as const;
export type PanelSadrzajStanje = (typeof PANEL_SADRZAJ_STANJA)[number];
/** K27: a request of the izlog fixtures (`zahtev=rq_05` opens its read-only detail in Operativa). */
const PANEL_ZAHTEV = /^rq_[a-z0-9]{2,4}$/;

/** K26: the venue mailbox in the izlog (`posta=…`): connected, not connected, the feature switched off, an expired connection. */
export const IZLOG_POSTA = ["povezana", "nije", "nedostupna", "greska"] as const;
export type IzlogPosta = (typeof IZLOG_POSTA)[number];
/** K26: a reply template kind in the izlog (`odgovor=…`, `sablon=…`). */
export const IZLOG_ODGOVORI = ["prihvatanje", "odbijanje", "predlog", "druga"] as const;
export type IzlogOdgovor = (typeof IZLOG_ODGOVORI)[number];
/** K26: where a send from the mailbox stands (`slanje=…`). */
export const IZLOG_SLANJA = ["salje", "poslato", "greska"] as const;
export type IzlogSlanje = (typeof IZLOG_SLANJA)[number];

export type PanelPreviewParams = {
  tema: IzlogTema | null;
  sekcija: PanelSekcija;
  plan: (typeof PANEL_PLANOVI)[number];
  uloga: (typeof PANEL_ULOGE)[number];
  /** `?stanje=ucitava|prijava|neaktivno|bez-pristupa`: a whole-screen state of the shell instead of a section. */
  stanje: PanelStanje | null;
  /** `?fioka=otvorena`: the primitives page opens its drawer example (for snapshots). */
  fiokaOtvorena: boolean;
  /**
   * K25 `rezervacije=forma|eksterni|iskljuceno` (with sekcija=funkcionalnosti): the reservation
   * choice of Funkcionalnosti; null = the ScanMe form.
   */
  rezervacije: PanelRezervacije | null;
  /** K25 `radno-vreme=prazno`: the venue has not entered its working hours yet (the form is locked). */
  bezRadnogVremena: boolean;
  /** K26 `posta=povezana|nije|nedostupna|greska` (with sekcija=podesavanja); default: available, not connected. */
  posta: IzlogPosta;
  /** K26 `povratak=povezano|greska`: what the OAuth callback reported. */
  povratak: "povezano" | "greska" | null;
  /** K26 `sablon=prihvatanje|odbijanje|predlog`: the template open first; `sabloni=1` shows custom templates and a signature. */
  sablon: Exclude<IzlogOdgovor, "druga"> | null;
  sabloniPrilagodjeni: boolean;
  /**
   * K27 `stanje=paznja|mirno` (Početna, Operativa): a venue where something needs attention
   * (default) or a quiet one with nothing waiting. The whole-screen values of `stanje` win.
   */
  sadrzaj: PanelSadrzajStanje;
  /** K27 `ping=poslat` (Operativa): a reminder was just sent for the late, accepted order. */
  pingPoslat: boolean;
  /** K27 `zahtev=rq_05` (Operativa): the read-only detail of that request is open. */
  zahtev: string | null;
  /** K27 `filteri=1` (Operativa): the filter drawer is open (telephone) / filters are shown chosen. */
  filteriOtvoreni: boolean;
};

export function parsePanelPreview(params: IzlogSearchParams): PanelPreviewParams {
  return {
    tema: parseTema(params.tema),
    sekcija: pickParam(params.sekcija, PANEL_SEKCIJE, "pocetna"),
    plan: pickParam(params.plan, PANEL_PLANOVI, "standard"),
    uloga: pickParam(params.uloga, PANEL_ULOGE, "vlasnik"),
    stanje: pickOptional(params.stanje, PANEL_STANJA),
    fiokaOtvorena: firstParam(params.fioka) === "otvorena",
    rezervacije: pickOptional(params.rezervacije, PANEL_REZERVACIJE),
    bezRadnogVremena: firstParam(params["radno-vreme"]) === "prazno",
    posta: pickParam(params.posta, IZLOG_POSTA, "nije"),
    povratak: pickOptional(params.povratak, ["povezano", "greska"] as const),
    sablon: pickOptional(params.sablon, ["prihvatanje", "odbijanje", "predlog"] as const),
    sabloniPrilagodjeni: firstParam(params.sabloni) === "1",
    sadrzaj: pickParam(params.stanje, PANEL_SADRZAJ_STANJA, "paznja"),
    pingPoslat: firstParam(params.ping) === "poslat",
    zahtev: (() => {
      const zahtev = firstParam(params.zahtev);
      return zahtev !== undefined && PANEL_ZAHTEV.test(zahtev) ? zahtev : null;
    })(),
    filteriOtvoreni: firstParam(params.filteri) === "1",
  };
}

// ---------------------------------------------------------------------------
// /dev/menu-konobar-preview
// ---------------------------------------------------------------------------

export const KONOBAR_EKRANI = [
  "red",
  "pin",
  "detalj",
  "sala-raspored",
  "sala-tabela",
  "sto",
  "rezervacije",
] as const;
export type KonobarEkran = (typeof KONOBAR_EKRANI)[number];

export const KONOBAR_EKRAN_KORAK: IzlogScreens<KonobarEkran> = {
  red: { korak: "K22" },
  pin: { korak: "K22" },
  detalj: { korak: "K22" },
  "sala-raspored": { korak: "K23" },
  "sala-tabela": { korak: "K23" },
  sto: { korak: "K23" },
  // reservations remain K25
  rezervacije: { korak: "K25" },
};

/**
 * K22: the state of the shown screen. `blokada` (PIN locked after five wrong
 * tries), `pogresan-pin` (a wrong PIN, attempts left), `bez-peppera` (PINs
 * switched off on the deployment), `prazno` (no active request), `mnogo`
 * (300 waiting requests and the "truncated" note); `offline` as before.
 */
export const KONOBAR_STANJA = ["offline", "blokada", "pogresan-pin", "bez-peppera", "prazno", "mnogo"] as const;
export type KonobarStanje = (typeof KONOBAR_STANJA)[number];

/** K22: who is on the device: a PIN waiter (default) or the Manager with the account. */
export const KONOBAR_ULOGE = ["osoblje", "menadzer"] as const;
export type KonobarUloga = (typeof KONOBAR_ULOGE)[number];

const KONOBAR_ZAHTEV = /^rq_[a-z0-9]{2,4}$/;
/** K23: a zone or a table named in the query (`zona=Terasa`, `sto=Sto 12`): letters, digits, spaces, dashes. */
const KONOBAR_NAZIV = /^[\p{L}\p{N} .-]{1,40}$/u;

function naziv(value: string | string[] | undefined): string | null {
  const first = firstParam(value)?.trim();
  return first && KONOBAR_NAZIV.test(first) ? first : null;
}

export type KonobarPreviewParams = {
  tema: IzlogTema | null;
  /** Default: the work queue, the waiter's main screen. */
  ekran: KonobarEkran;
  /** `stanje=offline` or `veza=offline`: no connection, actions wait. */
  offline: boolean;
  stanje: KonobarStanje | null;
  uloga: KonobarUloga;
  /** `ekran=detalj`: which fixture request is open (default: the order at Sto 7). */
  zahtev: string | null;
  /** `potvrda=otkazi`: the cancel confirmation of the detail is open. */
  potvrdaOtkaza: boolean;
  /** K23 `zauzetost=1`: the venue uses the optional occupancy module (off by default: tables are neutral). */
  zauzetost: boolean;
  /** K23 `zona=<naziv>`: the waiter's own zone (default: every zone). */
  zona: string | null;
  /** K23 `kasni=1`: a threshold of 5 minutes, so several waits are past it. */
  kasni: boolean;
  /** K23 `zvuk=iskljucen`: the device's sound starts switched off. */
  zvukIskljucen: boolean;
  /** K23 `sto=<naziv>` (with ekran=sto): which table is open (default Sto 3, three parallel states). */
  sto: string | null;
  /**
   * K25 `rezervacija=rv_XX` (with ekran=rezervacije): that reservation's detail is open;
   * `rezervacija=1` (with ekran=sto): the table with a bound, late reservation is open.
   */
  rezervacija: string | null;
  /** K25 `otkazana=1`: a guest has just cancelled a reservation (the strip shows). */
  otkazana: boolean;
  /** K26 `odgovor=prihvatanje|odbijanje|predlog|druga`: the kind the sheet "Obavesti gosta" starts with (default: by status). */
  odgovor: IzlogOdgovor | null;
  /** K26 `posta=povezana|nije|nedostupna|greska`: the venue mailbox; default connected (the send button shows). */
  posta: IzlogPosta;
  /** K26 `slanje=salje|poslato|greska`: a send in progress, done or refused; `ishod=1` opens the call outcome. */
  slanje: IzlogSlanje | null;
  ishodPoziva: boolean;
  /** K27 `ping=1`: a quiet reminder from Operativa stands above the queue. */
  podsetnik: boolean;
};

const KONOBAR_REZERVACIJA = /^(?:1|rv_[a-z0-9]{2,4})$/;

export function parseKonobarPreview(params: IzlogSearchParams): KonobarPreviewParams {
  const stanje = pickOptional(params.stanje, KONOBAR_STANJA);
  const zahtev = firstParam(params.zahtev);
  const rezervacija = firstParam(params.rezervacija);
  return {
    tema: parseTema(params.tema),
    ekran: pickParam(params.ekran, KONOBAR_EKRANI, "red"),
    offline: stanje === "offline" || firstParam(params.veza) === "offline",
    stanje,
    uloga: pickParam(params.uloga, KONOBAR_ULOGE, "osoblje"),
    zahtev: zahtev !== undefined && KONOBAR_ZAHTEV.test(zahtev) ? zahtev : null,
    potvrdaOtkaza: firstParam(params.potvrda) === "otkazi",
    zauzetost: firstParam(params.zauzetost) === "1",
    zona: naziv(params.zona),
    kasni: firstParam(params.kasni) === "1",
    zvukIskljucen: firstParam(params.zvuk) === "iskljucen",
    sto: naziv(params.sto),
    rezervacija: rezervacija !== undefined && KONOBAR_REZERVACIJA.test(rezervacija) ? rezervacija : null,
    otkazana: firstParam(params.otkazana) === "1",
    odgovor: pickOptional(params.odgovor, IZLOG_ODGOVORI),
    posta: pickParam(params.posta, IZLOG_POSTA, "povezana"),
    slanje: pickOptional(params.slanje, IZLOG_SLANJA),
    ishodPoziva: firstParam(params.ishod) === "1",
    podsetnik: firstParam(params.ping) === "1",
  };
}

// ---------------------------------------------------------------------------
// /dev/menu-lokal-preview
// ---------------------------------------------------------------------------

export const LOKAL_POGLEDI = ["lista", "raspored", "kartice"] as const;
export type LokalPogled = (typeof LOKAL_POGLEDI)[number];

export const LOKAL_POGLED_KORAK: IzlogScreens<LokalPogled> = {
  lista: { korak: "K20" },
  raspored: { korak: "K20" },
  kartice: { korak: "K20" },
};

/**
 * K20: which invented venue the izlog shows. Absent = "Demo restoran" (three
 * zones, fifteen tables, a bar, cards in every diagnostic state);
 * `prazno` = a venue with no positions yet; `bez-zona` = a café without
 * zones (no zone controls at all, master §9.3); `hotel` = tables and rooms.
 */
export const LOKAL_STANJA = ["prazno", "bez-zona", "hotel"] as const;
export type LokalStanje = (typeof LOKAL_STANJA)[number];

export type LokalPreviewParams = {
  tema: IzlogTema | null;
  pogled: LokalPogled;
  stanje: LokalStanje | null;
  /** `?fokus=pozicija`: the drawer of "Sto 12" is open (for snapshots). */
  fokusPozicija: boolean;
  /** `?modal=stampa`: the print sheet of the QR cards is open. */
  stampa: boolean;
};

export function parseLokalPreview(params: IzlogSearchParams): LokalPreviewParams {
  return {
    tema: parseTema(params.tema),
    pogled: pickParam(params.pogled, LOKAL_POGLEDI, "lista"),
    stanje: pickOptional(params.stanje, LOKAL_STANJA),
    fokusPozicija: firstParam(params.fokus) === "pozicija",
    stampa: firstParam(params.modal) === "stampa",
  };
}

// ---------------------------------------------------------------------------
// /dev/menu-editor-preview and /dev/menu-public-preview (existing routes)
// ---------------------------------------------------------------------------

/** K10: the editor's showcase states (docs/MENI-PLAN.md §7); absent = a realistic medium menu. */
export const EDITOR_STANJA = ["prazno", "veliki", "brzi-unos", "izaberi-vise", "konflikt"] as const;
export type EditorStanje = (typeof EDITOR_STANJA)[number];

/** K10: which pane, drawer or overlay is open on the narrower layouts (for snapshots). */
export const EDITOR_POGLEDI = ["struktura", "uredi", "pregled"] as const;
export type EditorPogled = (typeof EDITOR_POGLEDI)[number];

/**
 * K15: the article detail open (`artikal`: image and allergens; `varijante`: variants and a linked group with its impact).
 * K16: `kombo` (a combo with "Proveri cenu"), `prevodi` (the translations view: missing, stale and an AI suggestion),
 * `room-service` (the Room service context: rules, the three price origins and the price decision dialog open).
 */
export const EDITOR_FOKUSI = ["artikal", "varijante", "kombo", "prevodi", "room-service"] as const;

/**
 * K18: a dialog open on the first render — `objava` (consequences and a warning to confirm), `objava-greske`
 * (two errors that lead to their articles), `objava-zastarelo` (the draft changed after the review), `verzije`.
 */
export const EDITOR_MODALI = ["objava", "objava-greske", "objava-zastarelo", "verzije"] as const;
export type EditorModal = (typeof EDITOR_MODALI)[number];

/** K16: these show Premium features; without `plan` they open on Premium, `plan=standard` shows the locks. */
const PREMIUM_FOKUSI: readonly EditorFokus[] = ["prevodi", "room-service"];
export type EditorFokus = (typeof EDITOR_FOKUSI)[number];

export type EditorPreviewParams = {
  tema: IzlogTema | null;
  /** Existing `?state=empty` (TASK-51); since K10 the same as `stanje=prazno`. */
  empty: boolean;
  /** Existing `?design=dark` (TASK-51): the dark design of the old renderer, not the app theme. */
  darkDesign: boolean;
  /** K10: `stanje=prazno|veliki|brzi-unos`; K11: `izaberi-vise`; K18: `konflikt`; null = the medium menu. */
  stanje: EditorStanje | null;
  /** K10: `pogled=struktura|uredi|pregled`. */
  pogled: EditorPogled | null;
  /** K10: `plan=standard|premium` (Premium switches Room service on). */
  plan: (typeof PANEL_PLANOVI)[number];
  /** K10: `editor=stari` shows the legacy editor (legacy menus still use it). */
  stariEditor: boolean;
  /** K15: `fokus=artikal|varijante` opens the article detail; K16 adds `kombo|prevodi|room-service`; null = the list. */
  fokus: EditorFokus | null;
  /** K17: `tab=izgled` opens the Izgled mode (`plan=premium` unlocks the Premium variants). */
  tab: "izgled" | null;
  /** K17: `paleta=<id>` — the venue's published palette (a curated id; an unknown one is ignored). */
  paleta: string | null;
  /** K18: `modal=objava|objava-greske|objava-zastarelo|verzije`. */
  modal: EditorModal | null;
};

export function parseEditorPreview(params: IzlogSearchParams): EditorPreviewParams {
  const empty = firstParam(params.state) === "empty";
  const stanje = pickOptional(params.stanje, EDITOR_STANJA) ?? (empty ? "prazno" : null);
  const fokus = pickOptional(params.fokus, EDITOR_FOKUSI);
  return {
    tema: parseTema(params.tema),
    empty: empty || stanje === "prazno",
    darkDesign: firstParam(params.design) === "dark",
    stanje,
    pogled: pickOptional(params.pogled, EDITOR_POGLEDI),
    plan: pickParam(params.plan, PANEL_PLANOVI, fokus && PREMIUM_FOKUSI.includes(fokus) ? "premium" : "standard"),
    stariEditor: firstParam(params.editor) === "stari",
    fokus,
    tab: firstParam(params.tab) === "izgled" ? "izgled" : null,
    paleta: pickId(params.paleta),
    modal: pickOptional(params.modal, EDITOR_MODALI),
  };
}

/** K13: the three intentionally different venues of the public izlog (plan K12 §5.4). */
export const JAVNI_PRIMERI = ["kafic", "restoran", "prestizni"] as const;
export type JavniPrimer = (typeof JAVNI_PRIMERI)[number];
export const JAVNI_LAYOUTI = ["tok", "kategorije", "kompaktno"] as const;
export type JavniLayoutParam = (typeof JAVNI_LAYOUTI)[number];
export const JAVNI_MEDIJI = ["slika", "ikonica", "bez"] as const;
export type JavniMedijParam = (typeof JAVNI_MEDIJI)[number];
export const JAVNA_STANJA = ["razdelnik", "veliki", "prazno"] as const;
export type JavnoStanje = (typeof JAVNA_STANJA)[number];

/** A palette id or a page slug as typed in the address bar: lowercase words and dashes. */
const IZLOG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function pickId(value: string | string[] | undefined): string | null {
  const first = firstParam(value);
  return first !== undefined && first.length <= 60 && IZLOG_ID.test(first) ? first : null;
}

export type PublicPreviewParams = {
  tema: IzlogTema | null;
  /** Existing `?state=long` (TASK-52); K13: the same as `stanje=veliki`. */
  long: boolean;
  /** Existing `?design=dark`: the venue's dark palette (K13: `ponoc`). The app theme never restyles the public menu (P13). */
  darkDesign: boolean;
  /** K13 — which venue (identity and content); `restoran` by default. */
  primer: JavniPrimer;
  /** K13 — overrides of the venue's presentation; null = as the venue has it. */
  layout: JavniLayoutParam | null;
  mediji: JavniMedijParam | null;
  /** A palette id; the adapter ignores one it does not know. */
  paleta: string | null;
  stanje: JavnoStanje | null;
  /** K13 — a page of the menu by its slug (e.g. `vinska-karta`). */
  stranica: string | null;
  /** K13 — `Kategorije` opened on a category, by its position (1 = the first). */
  kategorija: number | null;
  /** K13 — `detalj=1`: the detail of the richest article open. */
  detalj: boolean;
  /** K13 — `renderer=stari`: the legacy public renderer (TASK-52 QA). */
  stariRenderer: boolean;
  /** K14 — `alergen=mleko,gluten` (codes of lib/menu/allergens.ts; `mleko` = `milk`): marked from the start. */
  alergeni: string[];
  /** K14 — `jezik=en`: the menu published in two languages, shown in this one. */
  jezik: string | null;
  /** K14 — `valuta=eur`: the EUR switch on (fixture rate) and EUR chosen. */
  valuta: "eur" | null;
  /** K14 — `kurs=star`: the fixture rate is too old, so the switch must not show. */
  starKurs: boolean;
  /** K14 — `pretraga=<tekst>` and `filter=vegan,promo`: search and filters on, filled from the start. */
  pretraga: string | null;
  filteri: string[];
  /** K21 — `pozicija=sto|soba`: the menu opened from a table card (call, bill, cart) or a room card (Room service). */
  pozicija: JavnaPozicijaParam | null;
  /** K21 — `korpa=1`: the cart open with a few lines (with `pozicija`). */
  korpa: boolean;
  /** K21 — `moji-zahtevi=1`: "Moji zahtevi" with a request in every status. */
  mojiZahtevi: boolean;
  /** K21 — `zahtev=poziv|racun|porudzbina`: the confirmation right after sending. */
  zahtev: JavniZahtevParam | null;
  /** K21 — `stanje-zahteva=novi|prihvacen|zavrsen|otkazan`: the status the confirmation shows. */
  stanjeZahteva: JavnoStanjeZahtevaParam | null;
  /** K21 — `greska=cena|nedostupno|limit`: the cart after the server refused it. */
  greska: JavnaGreskaParam | null;
  /** K21 — `veza=offline`: the phone has no connection (nothing can be sent, nothing says "poslato"). */
  offline: boolean;
  /**
   * K25 — `rezervacija=forma|poslato|otkazivanje|otkazano|nevazece|greska`: the reservation screens
   * (the form, the confirmation with the cancel link, the cancel link's page, after cancelling, a
   * wrong link, the form after the server refused it).
   */
  rezervacija: JavnaRezervacijaParam | null;
  /** K25 — `kontakt=email|telefon|oba`: the contact the venue's form asks for (default: both). */
  kontakt: JavniKontaktParam | null;
  /** K25 — `rezervacije=eksterni|iskljuceno`: the venue's own system (a link) or no reservations. */
  rezervacije: JavneRezervacijeParam | null;
};

/** K25 — reservations in the public izlog (docs/MENI-PLAN.md §7). */
export const JAVNE_REZERVACIJE_EKRANI = ["forma", "poslato", "otkazivanje", "otkazano", "nevazece", "greska"] as const;
export type JavnaRezervacijaParam = (typeof JAVNE_REZERVACIJE_EKRANI)[number];
export const JAVNI_KONTAKTI = ["email", "telefon", "oba"] as const;
export type JavniKontaktParam = (typeof JAVNI_KONTAKTI)[number];
export const JAVNE_REZERVACIJE = ["eksterni", "iskljuceno"] as const;
export type JavneRezervacijeParam = (typeof JAVNE_REZERVACIJE)[number];

/** K21 — guest requests in the public izlog (docs/MENI-PLAN.md §7; plan K19 §6 K21). */
export const JAVNE_POZICIJE = ["sto", "soba"] as const;
export type JavnaPozicijaParam = (typeof JAVNE_POZICIJE)[number];
export const JAVNI_ZAHTEVI = ["poziv", "racun", "porudzbina"] as const;
export type JavniZahtevParam = (typeof JAVNI_ZAHTEVI)[number];
export const JAVNA_STANJA_ZAHTEVA = ["novi", "prihvacen", "zavrsen", "otkazan"] as const;
export type JavnoStanjeZahtevaParam = (typeof JAVNA_STANJA_ZAHTEVA)[number];
export const JAVNE_GRESKE = ["cena", "nedostupno", "limit"] as const;
export type JavnaGreskaParam = (typeof JAVNE_GRESKE)[number];

/** K14: Serbian words for allergen codes in the izlog address (`alergen=mleko`). */
const IZLOG_ALERGENI: Record<string, string> = {
  mleko: "milk",
  gluten: "gluten",
  jaja: "eggs",
  riba: "fish",
  kikiriki: "peanuts",
  soja: "soybeans",
  orasi: "nuts",
  celer: "celery",
  slacica: "mustard",
  susam: "sesame",
  sulfiti: "sulphites",
  rakovi: "crustaceans",
  lupina: "lupin",
  mekusci: "molluscs",
  drugo: "other",
};

const IZLOG_JEZICI: ReadonlySet<string> = new Set([MENU_SOURCE_LANGUAGE, ...MENU_TRANSLATION_LANGUAGES]);

function pickList(value: string | string[] | undefined): string[] {
  const first = firstParam(value);
  return first ? first.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean).slice(0, 20) : [];
}

export function parsePublicPreview(params: IzlogSearchParams): PublicPreviewParams {
  const kategorija = Number(firstParam(params.kategorija));
  return {
    tema: parseTema(params.tema),
    long: firstParam(params.state) === "long",
    darkDesign: firstParam(params.design) === "dark",
    primer: pickParam(params.primer, JAVNI_PRIMERI, "restoran"),
    layout: pickOptional(params.layout, JAVNI_LAYOUTI),
    mediji: pickOptional(params.mediji, JAVNI_MEDIJI),
    paleta: pickId(params.paleta),
    stanje: pickOptional(params.stanje, JAVNA_STANJA),
    stranica: pickId(params.stranica),
    kategorija: Number.isInteger(kategorija) && kategorija >= 1 && kategorija <= 99 ? kategorija : null,
    detalj: firstParam(params.detalj) === "1",
    stariRenderer: firstParam(params.renderer) === "stari",
    alergeni: normalizujAlergene(pickList(params.alergen).map((kod) => IZLOG_ALERGENI[kod] ?? kod)),
    jezik: pickJezik(params.jezik),
    valuta: firstParam(params.valuta) === "eur" ? "eur" : null,
    starKurs: firstParam(params.kurs) === "star",
    pretraga: pickPretraga(params.pretraga),
    filteri: normalizujFiltere(pickList(params.filter)),
    pozicija: pickOptional(params.pozicija, JAVNE_POZICIJE),
    korpa: firstParam(params.korpa) === "1",
    mojiZahtevi: firstParam(params["moji-zahtevi"]) === "1",
    zahtev: pickOptional(params.zahtev, JAVNI_ZAHTEVI),
    stanjeZahteva: pickOptional(params["stanje-zahteva"], JAVNA_STANJA_ZAHTEVA),
    greska: pickOptional(params.greska, JAVNE_GRESKE),
    offline: firstParam(params.veza) === "offline",
    rezervacija: pickOptional(params.rezervacija, JAVNE_REZERVACIJE_EKRANI),
    kontakt: pickOptional(params.kontakt, JAVNI_KONTAKTI),
    rezervacije: pickOptional(params.rezervacije, JAVNE_REZERVACIJE),
  };
}

function pickJezik(value: string | string[] | undefined): string | null {
  const first = firstParam(value)?.trim().toLowerCase();
  return first && IZLOG_JEZICI.has(first) ? first : null;
}

function pickPretraga(value: string | string[] | undefined): string | null {
  const first = firstParam(value)?.trim();
  return first ? first.slice(0, MENU_PRETRAGA_MAX) : null;
}
