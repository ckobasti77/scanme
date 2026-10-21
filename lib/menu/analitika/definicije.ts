// ScanMe Menu V1 (K29) — the analytics definitions as code (master §14;
// docs/menu/ANALITIKA-DEFINICIJE.md is the text the panel explains from).
// One table of metrics, the events they come from, which breakdowns
// (dimensions) each keeps, and the rules every number obeys: the Belgrade
// day, the 30-minute session, the rule of 20, the retention windows.
// Pure: Convex (ingest, rollup, queries), the route handler and the browser
// all read it.

/** Raw events are kept this many days after they arrive (master §14.4). */
export const MENU_ANALYTICS_RAW_DAYS = 90;
/** Daily aggregates are kept this many calendar months (master §14.4). */
export const MENU_ANALYTICS_DAILY_MONTHS = 24;
/** A pause of this long (or longer) ends a session (master §14.4). */
export const MENU_ANALYTICS_SESSION_GAP_MS = 30 * 60 * 1000;
/** An open session row is deleted this long after its last event. */
export const MENU_ANALYTICS_SESSION_KEEP_MS = 24 * 60 * 60 * 1000;
/** Percentages and conversions need at least this many in the denominator (master §14.4). */
export const MIN_IMENILAC = 20;
/** Sessions are shown only when at least this share of menu opens carried a session id. */
export const MIN_POKRIVENOST_SESIJA = 0.95;
/** Events per ingest call. */
export const MAX_DOGADJAJA_PO_POZIVU = 10;
/** Distinct values one metric keeps per dimension per day; the rest count as `ostalo`. */
export const MAX_VREDNOSTI_PO_DIMENZIJI = 500;
/** The longest Premium period (days, inclusive). */
export const MAX_DANA_PERIODA = 366;
/** The bucket of values past MAX_VREDNOSTI_PO_DIMENZIJI. */
export const OSTALO = "ostalo";
/** The page dimension value of the Room service page (its page key `_rs` cannot be a record key). */
export const STRANICA_ROOM_SERVICE = "room_service";

// -----------------------------------------------------------------------------
// Events
// -----------------------------------------------------------------------------

/** What the guest's browser reports. Scroll visibility is never an event (§14.2). */
export const KLIJENTSKE_VRSTE = ["stranica", "detalj", "korak"] as const;
/** What the backend records at the moment a request or reservation is written. */
export const SERVERSKE_VRSTE = [
  "zahtev_poslat",
  "zahtev_prihvacen",
  "zahtev_zavrsen",
  "zahtev_otkazan",
  "rezervacija_poslata",
  "rezervacija_prihvacena",
  "rezervacija_odbijena",
  "rezervacija_predlog",
  "rezervacija_realizovana",
  "rezervacija_otkazana",
] as const;

export type KlijentskaVrsta = (typeof KLIJENTSKE_VRSTE)[number];
export type ServerskaVrsta = (typeof SERVERSKE_VRSTE)[number];
export type VrstaDogadjaja = KlijentskaVrsta | ServerskaVrsta;

/** A step of the conversion flow the browser reports after a successful send. */
export const KORACI = ["zahtev", "porudzbina", "rezervacija"] as const;
export type Korak = (typeof KORACI)[number];

/** Device class from the User-Agent (no fingerprint). */
export const UREDJAJI = ["telefon", "tablet", "racunar"] as const;
export type Uredjaj = (typeof UREDJAJI)[number];

export const DIMENZIJE = ["stranica", "artikal", "kartica", "jezik", "uredjaj", "sat", "zahtev", "kanal", "ko"] as const;
export type Dimenzija = (typeof DIMENZIJE)[number];

/** A stored raw event as the rollup reads it (convex `menuAnalyticsEvents`). */
export type SiroviDogadjaj = {
  vrsta: VrstaDogadjaja;
  occurredAt: number;
  dayKey: string;
  sat: number;
  stranica?: string;
  artikal?: string;
  kartica?: string;
  jezik?: string;
  uredjaj?: Uredjaj;
  korak?: Korak;
  sesija?: string;
  zahtev?: "call" | "bill" | "order";
  kanal?: "standard" | "room_service";
  ko?: "guest" | "staff";
};

// -----------------------------------------------------------------------------
// Metrics
// -----------------------------------------------------------------------------

export const METRIKE = [
  "otvaranja",
  "otvaranjaSaSesijom",
  "detalji",
  "skenovi",
  "zahtevi",
  "porudzbine",
  "zahteviPrihvaceni",
  "zahteviZavrseni",
  "zahteviOtkazani",
  "rezervacije",
  "rezervacijePrihvacene",
  "rezervacijeOdbijene",
  "rezervacijePredlozi",
  "rezervacijeRealizovane",
  "rezervacijeOtkazane",
  "sesije",
  "sesijeSaDetaljem",
  "sesijeSaZahtevom",
  "sesijeSaPorudzbinom",
  "sesijeSaRezervacijom",
] as const;
export type Metrika = (typeof METRIKE)[number];

export type MetrikaDefinicija = {
  /** Standard shows it; `premium` only with advancedAnalytics. */
  plan: "standard" | "premium";
  /** browser = the public menu; server = a request/reservation write; sesija = the rollup's sessions; skenovi = dailyCardMetrics; interno = only for a reliability rule. */
  izvor: "browser" | "server" | "sesija" | "skenovi" | "interno";
  /** The events that feed it (scans come from the card resolver). */
  dogadjaji: readonly VrstaDogadjaja[];
  /** The breakdowns kept per day (the Premium filters). */
  dimenzije: readonly Dimenzija[];
  /** Shown only when sessions are reliable (an identifier and enough coverage). */
  trebaSesije: boolean;
};

const STRANICA_DIM = ["stranica", "kartica", "jezik", "uredjaj", "sat"] as const;

export const DEFINICIJE: Readonly<Record<Metrika, MetrikaDefinicija>> = {
  otvaranja: { plan: "standard", izvor: "browser", dogadjaji: ["stranica"], dimenzije: STRANICA_DIM, trebaSesije: false },
  otvaranjaSaSesijom: { plan: "standard", izvor: "interno", dogadjaji: ["stranica"], dimenzije: [], trebaSesije: false },
  detalji: {
    plan: "standard",
    izvor: "browser",
    dogadjaji: ["detalj"],
    dimenzije: ["artikal", "stranica", "jezik", "uredjaj", "sat"],
    trebaSesije: false,
  },
  skenovi: { plan: "standard", izvor: "skenovi", dogadjaji: [], dimenzije: ["kartica"], trebaSesije: false },
  zahtevi: { plan: "standard", izvor: "server", dogadjaji: ["zahtev_poslat"], dimenzije: ["zahtev", "kanal", "kartica", "sat"], trebaSesije: false },
  porudzbine: { plan: "standard", izvor: "server", dogadjaji: ["zahtev_poslat"], dimenzije: ["kanal"], trebaSesije: false },
  zahteviPrihvaceni: { plan: "standard", izvor: "server", dogadjaji: ["zahtev_prihvacen"], dimenzije: ["zahtev", "kanal"], trebaSesije: false },
  zahteviZavrseni: { plan: "standard", izvor: "server", dogadjaji: ["zahtev_zavrsen"], dimenzije: ["zahtev", "kanal"], trebaSesije: false },
  zahteviOtkazani: { plan: "standard", izvor: "server", dogadjaji: ["zahtev_otkazan"], dimenzije: ["zahtev", "kanal", "ko"], trebaSesije: false },
  rezervacije: { plan: "standard", izvor: "server", dogadjaji: ["rezervacija_poslata"], dimenzije: ["sat"], trebaSesije: false },
  rezervacijePrihvacene: { plan: "standard", izvor: "server", dogadjaji: ["rezervacija_prihvacena"], dimenzije: [], trebaSesije: false },
  rezervacijeOdbijene: { plan: "standard", izvor: "server", dogadjaji: ["rezervacija_odbijena"], dimenzije: [], trebaSesije: false },
  rezervacijePredlozi: { plan: "standard", izvor: "server", dogadjaji: ["rezervacija_predlog"], dimenzije: [], trebaSesije: false },
  rezervacijeRealizovane: { plan: "standard", izvor: "server", dogadjaji: ["rezervacija_realizovana"], dimenzije: [], trebaSesije: false },
  rezervacijeOtkazane: { plan: "standard", izvor: "server", dogadjaji: ["rezervacija_otkazana"], dimenzije: ["ko"], trebaSesije: false },
  sesije: { plan: "standard", izvor: "sesija", dogadjaji: ["stranica", "detalj", "korak"], dimenzije: [], trebaSesije: true },
  sesijeSaDetaljem: { plan: "premium", izvor: "sesija", dogadjaji: ["detalj"], dimenzije: [], trebaSesije: true },
  sesijeSaZahtevom: { plan: "premium", izvor: "sesija", dogadjaji: ["korak"], dimenzije: [], trebaSesije: true },
  sesijeSaPorudzbinom: { plan: "premium", izvor: "sesija", dogadjaji: ["korak"], dimenzije: [], trebaSesije: true },
  sesijeSaRezervacijom: { plan: "premium", izvor: "sesija", dogadjaji: ["korak"], dimenzije: [], trebaSesije: true },
};

/** Which metric each server event feeds (one each). */
const SERVERSKA_METRIKA: Readonly<Record<ServerskaVrsta, Metrika>> = {
  zahtev_poslat: "zahtevi",
  zahtev_prihvacen: "zahteviPrihvaceni",
  zahtev_zavrsen: "zahteviZavrseni",
  zahtev_otkazan: "zahteviOtkazani",
  rezervacija_poslata: "rezervacije",
  rezervacija_prihvacena: "rezervacijePrihvacene",
  rezervacija_odbijena: "rezervacijeOdbijene",
  rezervacija_predlog: "rezervacijePredlozi",
  rezervacija_realizovana: "rezervacijeRealizovane",
  rezervacija_otkazana: "rezervacijeOtkazane",
};

/** One +1 a raw event adds to a day: the metric and the breakdown values it carries. */
export type Doprinos = { metrika: Metrika; dimenzije: Partial<Record<Dimenzija, string>> };

function vrednostiDimenzija(dogadjaj: SiroviDogadjaj, dimenzije: readonly Dimenzija[]): Partial<Record<Dimenzija, string>> {
  const izlaz: Partial<Record<Dimenzija, string>> = {};
  for (const dimenzija of dimenzije) {
    const vrednost = dimenzija === "sat" ? String(dogadjaj.sat) : dogadjaj[dimenzija];
    if (vrednost !== undefined && vrednost !== "") izlaz[dimenzija] = vrednost;
  }
  return izlaz;
}

/** The metrics one raw event counts in (sessions are added by the rollup, not here). */
export function doprinosi(dogadjaj: SiroviDogadjaj): Doprinos[] {
  switch (dogadjaj.vrsta) {
    case "stranica": {
      const izlaz: Doprinos[] = [
        { metrika: "otvaranja", dimenzije: vrednostiDimenzija(dogadjaj, DEFINICIJE.otvaranja.dimenzije) },
      ];
      if (dogadjaj.sesija) izlaz.push({ metrika: "otvaranjaSaSesijom", dimenzije: {} });
      return izlaz;
    }
    case "detalj":
      return [{ metrika: "detalji", dimenzije: vrednostiDimenzija(dogadjaj, DEFINICIJE.detalji.dimenzije) }];
    case "korak":
      return [];
    default: {
      const metrika = SERVERSKA_METRIKA[dogadjaj.vrsta];
      const izlaz: Doprinos[] = [{ metrika, dimenzije: vrednostiDimenzija(dogadjaj, DEFINICIJE[metrika].dimenzije) }];
      // An order is also counted on its own, by channel (standard pages or Room service).
      if (dogadjaj.vrsta === "zahtev_poslat" && dogadjaj.zahtev === "order") {
        izlaz.push({ metrika: "porudzbine", dimenzije: vrednostiDimenzija(dogadjaj, DEFINICIJE.porudzbine.dimenzije) });
      }
      return izlaz;
    }
  }
}

/** The session steps an event marks (an order is also a request). */
export type KorakSesije = "detalj" | "zahtev" | "porudzbina" | "rezervacija";

export const KORAK_METRIKA: Readonly<Record<KorakSesije, Metrika>> = {
  detalj: "sesijeSaDetaljem",
  zahtev: "sesijeSaZahtevom",
  porudzbina: "sesijeSaPorudzbinom",
  rezervacija: "sesijeSaRezervacijom",
};

export function koraciSesije(dogadjaj: Pick<SiroviDogadjaj, "vrsta" | "korak">): KorakSesije[] {
  if (dogadjaj.vrsta === "detalj") return ["detalj"];
  if (dogadjaj.vrsta !== "korak" || !dogadjaj.korak) return [];
  if (dogadjaj.korak === "porudzbina") return ["zahtev", "porudzbina"];
  return [dogadjaj.korak];
}

// -----------------------------------------------------------------------------
// Rules
// -----------------------------------------------------------------------------

/**
 * A percentage (one decimal, never above 100) only with at least MIN_IMENILAC
 * in the denominator; below that `null` (the panel says "malo podataka").
 */
export function procenat(brojilac: number, imenilac: number): number | null {
  if (!Number.isFinite(imenilac) || imenilac < MIN_IMENILAC) return null;
  const vrednost = Math.round((Math.max(0, brojilac) / imenilac) * 1000) / 10;
  return Math.min(100, vrednost);
}

/** Share of menu opens that carried a session id (0…1), or null without opens. */
export function pokrivenostSesija(otvaranjaSaSesijom: number, otvaranja: number): number | null {
  if (otvaranja <= 0) return null;
  return Math.min(1, otvaranjaSaSesijom / otvaranja);
}

/** Sessions are a number only with an identifier on (almost) every open (§3 of the definitions). */
export function sesijePouzdane(otvaranjaSaSesijom: number, otvaranja: number): boolean {
  const pokrivenost = pokrivenostSesija(otvaranjaSaSesijom, otvaranja);
  return pokrivenost !== null && pokrivenost >= MIN_POKRIVENOST_SESIJA;
}
