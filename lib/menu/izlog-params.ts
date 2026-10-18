// ScanMe Menu V1 — parameters of the izlog (dev preview routes, K07).
//
// The five /dev/menu-*-preview routes read their query string only through
// these pure parsers. Rule (docs/MENI-PLAN.md §7): an unknown or malformed
// value gives the default state, never an error; a repeated parameter
// (`?a=1&a=2`) counts by its first value. Each screen value also names the
// run step that builds it, so a route can say honestly which step is missing.

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
  lokal: { korak: "K27" },
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

export type PanelPreviewParams = {
  tema: IzlogTema | null;
  sekcija: PanelSekcija;
  plan: (typeof PANEL_PLANOVI)[number];
  uloga: (typeof PANEL_ULOGE)[number];
  /** `?stanje=ucitava|prijava|neaktivno|bez-pristupa`: a whole-screen state of the shell instead of a section. */
  stanje: PanelStanje | null;
  /** `?fioka=otvorena`: the primitives page opens its drawer example (for snapshots). */
  fiokaOtvorena: boolean;
};

export function parsePanelPreview(params: IzlogSearchParams): PanelPreviewParams {
  return {
    tema: parseTema(params.tema),
    sekcija: pickParam(params.sekcija, PANEL_SEKCIJE, "pocetna"),
    plan: pickParam(params.plan, PANEL_PLANOVI, "standard"),
    uloga: pickParam(params.uloga, PANEL_ULOGE, "vlasnik"),
    stanje: pickOptional(params.stanje, PANEL_STANJA),
    fiokaOtvorena: firstParam(params.fioka) === "otvorena",
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
  rezervacije: { korak: "K25" },
};

export type KonobarPreviewParams = {
  tema: IzlogTema | null;
  /** Default: the work queue, the waiter's main screen. */
  ekran: KonobarEkran;
  offline: boolean;
};

export function parseKonobarPreview(params: IzlogSearchParams): KonobarPreviewParams {
  return {
    tema: parseTema(params.tema),
    ekran: pickParam(params.ekran, KONOBAR_EKRANI, "red"),
    offline: firstParam(params.stanje) === "offline",
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

export type LokalPreviewParams = { tema: IzlogTema | null; pogled: LokalPogled };

export function parseLokalPreview(params: IzlogSearchParams): LokalPreviewParams {
  return {
    tema: parseTema(params.tema),
    pogled: pickParam(params.pogled, LOKAL_POGLEDI, "lista"),
  };
}

// ---------------------------------------------------------------------------
// /dev/menu-editor-preview and /dev/menu-public-preview (existing routes)
// ---------------------------------------------------------------------------

/** K10: the editor's showcase states (docs/MENI-PLAN.md §7); absent = a realistic medium menu. */
export const EDITOR_STANJA = ["prazno", "veliki", "brzi-unos", "izaberi-vise"] as const;
export type EditorStanje = (typeof EDITOR_STANJA)[number];

/** K10: which pane, drawer or overlay is open on the narrower layouts (for snapshots). */
export const EDITOR_POGLEDI = ["struktura", "uredi", "pregled"] as const;
export type EditorPogled = (typeof EDITOR_POGLEDI)[number];

export type EditorPreviewParams = {
  tema: IzlogTema | null;
  /** Existing `?state=empty` (TASK-51); since K10 the same as `stanje=prazno`. */
  empty: boolean;
  /** Existing `?design=dark` (TASK-51): the dark design of the old renderer, not the app theme. */
  darkDesign: boolean;
  /** K10: `stanje=prazno|veliki|brzi-unos`; K11: `izaberi-vise`; null = the medium menu. */
  stanje: EditorStanje | null;
  /** K10: `pogled=struktura|uredi|pregled`. */
  pogled: EditorPogled | null;
  /** K10: `plan=standard|premium` (Premium switches Room service on). */
  plan: (typeof PANEL_PLANOVI)[number];
  /** K10: `editor=stari` shows the legacy editor (legacy menus still use it). */
  stariEditor: boolean;
};

export function parseEditorPreview(params: IzlogSearchParams): EditorPreviewParams {
  const empty = firstParam(params.state) === "empty";
  const stanje = pickOptional(params.stanje, EDITOR_STANJA) ?? (empty ? "prazno" : null);
  return {
    tema: parseTema(params.tema),
    empty: empty || stanje === "prazno",
    darkDesign: firstParam(params.design) === "dark",
    stanje,
    pogled: pickOptional(params.pogled, EDITOR_POGLEDI),
    plan: pickParam(params.plan, PANEL_PLANOVI, "standard"),
    stariEditor: firstParam(params.editor) === "stari",
  };
}

export type PublicPreviewParams = {
  tema: IzlogTema | null;
  /** Existing `?state=long` (TASK-52). */
  long: boolean;
  /** Existing `?design=dark`: the venue's dark palette. The app theme never restyles the public menu (P13). */
  darkDesign: boolean;
};

export function parsePublicPreview(params: IzlogSearchParams): PublicPreviewParams {
  return {
    tema: parseTema(params.tema),
    long: firstParam(params.state) === "long",
    darkDesign: firstParam(params.design) === "dark",
  };
}
