// Jedno stanje stranice /sajam/3d i njegov reducer (A03 §4.2). Čisto: React ga drži u malom
// store-u (components/fair/auto3d/store.ts), a pregledač samo prima komande iz njega.

import type { Instance, PartId, SystemId } from "./catalog";
import { clamp01 } from "./explode";
import { modeForGroup, type Mode } from "./filter";
import type { KioskPhaseId } from "./kiosk";
import { DEFAULT_PAINT, type PaintId } from "./paints";
import { TOUR_STEPS } from "./tour";
import { systemOfPart, type UrlState } from "./url-state";

export type Status = "poster" | "loading" | "ready" | "error" | "nowebgl" | "lost";
export type Origin = "canvas" | "list" | "url" | "tour" | "kiosk";
export type PanelTab = "grupe" | "delovi" | "deo";

export type Auto3dState = {
  mode: Mode;
  part: PartId | null;
  instance: Instance | "";
  origin: Origin | null;
  hover: PartId | null;
  group: SystemId | null;
  /** Rasklapanje 0–1. */
  explode: number;
  /** Presek 0–1 ili isključen (A10). */
  section: number | null;
  /** Id boje laka (A10). */
  paint: PaintId;
  /** Vođena tura (A10): korak iz lib/auto3d/tour.ts i pauza. */
  tour: { active: boolean; step: number; paused: boolean };
  kiosk: boolean;
  /** Kiosk: petlja radi (niko ne dira ekran); prvi dodir je gasi, a 45 s mirovanja je vraća (A10). */
  kioskAuto: boolean;
  /** Kiosk: trenutna faza petlje, ili null kad petlja ne radi. */
  kioskPhase: KioskPhaseId | null;
  status: Status;
  /** Napredak učitavanja 0–1, ili null kad ukupna veličina nije poznata. */
  progress: number | null;
  tab: PanelTab;
  query: string;
  /** Otvaranje dela je napravilo unos u istoriji (odluka E9). */
  pushedPart: boolean;
  /** Desktop: panel sa listom delova je otvoren (izbor grupe u traci ili „Svi delovi“). */
  listOpen: boolean;
  /** Brojač zahteva „Početni pogled“; most zove `frameStart()` kad se promeni. */
  view: number;
};

export type Action =
  | { type: "select"; part: PartId; instance?: Instance | ""; origin: Origin }
  | { type: "close" }
  | { type: "hover"; part: PartId | null }
  | { type: "group"; group: SystemId | null; openList?: boolean }
  | { type: "mode"; mode: Mode }
  | { type: "explode"; p: number }
  | { type: "section"; t: number | null }
  | { type: "paint"; paint: PaintId }
  | { type: "tour"; active: boolean; step?: number; paused?: boolean }
  | { type: "tourStep"; step: number }
  | { type: "tourEnd" }
  | { type: "kioskReset" }
  | { type: "kioskTouch" }
  | { type: "kioskPhase"; phase: KioskPhaseId }
  | { type: "status"; status: Status; progress?: number | null }
  | { type: "tab"; tab: PanelTab }
  | { type: "query"; query: string }
  | { type: "pushed"; pushed: boolean }
  | { type: "list"; open: boolean }
  | { type: "home" }
  | { type: "url"; url: UrlState };

const TOUR_OFF: Auto3dState["tour"] = { active: false, step: 0, paused: false };

export function initialState(url: UrlState): Auto3dState {
  const base: Auto3dState = {
    mode: "rendgen",
    part: null,
    instance: "",
    origin: null,
    hover: null,
    group: null,
    explode: 0,
    section: null,
    paint: DEFAULT_PAINT,
    tour: TOUR_OFF,
    kiosk: false,
    kioskAuto: false,
    kioskPhase: null,
    status: "poster",
    progress: null,
    tab: "grupe",
    query: "",
    pushedPart: false,
    listOpen: false,
    view: 0,
  };
  return reduce(base, { type: "url", url });
}

function select(s: Auto3dState, part: PartId, instance: Instance | "", origin: Origin): Auto3dState {
  const system = systemOfPart(part);
  const group = s.group !== null && s.group !== system ? null : s.group;
  const mode = s.mode === "kostur" && system === "karoserija" ? "rendgen" : s.mode;
  return { ...s, part, instance, origin, group, mode, tab: "deo" };
}

function close(s: Auto3dState): Auto3dState {
  return { ...s, part: null, instance: "", origin: null, pushedPart: false, tab: s.tab === "deo" ? "delovi" : s.tab };
}

/** Korak ture: izolovana grupa, rasklapanje i kadar; tura ide u rendgenu, bez preseka, dela i liste. */
function tourStep(s: Auto3dState, step: number): Auto3dState {
  const def = TOUR_STEPS[step];
  if (!def) return s;
  return {
    ...close(s),
    mode: "rendgen",
    section: null,
    group: def.group,
    explode: def.explode,
    listOpen: false,
    hover: null,
    tour: { ...s.tour, active: true, step },
  };
}

/** Korisnikova radnja prekida turu (PLAN §6: „prekida se na dodir“). Koraci ture i kioska ne prekidaju. */
function interruptsTour(a: Action): boolean {
  switch (a.type) {
    case "select":
      return a.origin !== "tour" && a.origin !== "kiosk";
    case "list":
      return a.open;
    case "group":
    case "mode":
    case "explode":
    case "section":
    case "home":
      return true;
    default:
      return false;
  }
}

/** Faza kiosk petlje: tura (korak 0), a posle nje ceo auto, rasklopljen ili sklopljen po fazi. */
function kioskPhase(s: Auto3dState, phase: KioskPhaseId): Auto3dState {
  if (!s.kiosk || !s.kioskAuto) return s;
  // Tura počinje iz kanonskog početnog kadra (`view` vraća kameru i kad se grupa ne menja).
  if (phase === "tura") return { ...tourStep({ ...s, tour: { active: true, step: 0, paused: false } }, 0), kioskPhase: phase, view: s.view + 1 };
  const explode = phase === "rasklapanje" || phase === "drzanje" ? 1 : 0;
  return { ...close(s), mode: "rendgen", section: null, group: null, explode, listOpen: false, tour: TOUR_OFF, kioskPhase: phase };
}

export function reduce(s: Auto3dState, a: Action): Auto3dState {
  return apply(s.tour.active && interruptsTour(a) ? { ...s, tour: TOUR_OFF } : s, a);
}

function apply(s: Auto3dState, a: Action): Auto3dState {
  switch (a.type) {
    case "select":
      return select(s, a.part, a.instance ?? "", a.origin);
    case "close":
      return s.part === null ? s : close(s);
    case "hover":
      return s.hover === a.part ? s : { ...s, hover: a.part };
    case "group": {
      let next: Auto3dState = { ...s, group: a.group, mode: modeForGroup(s.mode, a.group) };
      if (next.part && a.group !== null && systemOfPart(next.part) !== a.group) next = close(next);
      // Traka grupa na desktopu otvara listu te grupe (deo iz iste grupe ostaje na kartici).
      if (a.openList && a.group !== null) next = { ...next, listOpen: true, tab: next.part ? next.tab : "delovi" };
      return next;
    }
    case "mode": {
      let next: Auto3dState = { ...s, mode: a.mode };
      if (a.mode === "kostur" && next.group === "karoserija") next = { ...next, group: null };
      if (a.mode === "kostur" && next.part && systemOfPart(next.part) === "karoserija") next = close(next);
      return next;
    }
    case "explode":
      return { ...s, explode: clamp01(a.p) };
    case "section":
      return { ...s, section: a.t === null ? null : clamp01(a.t) };
    case "paint":
      return { ...s, paint: a.paint };
    case "tour": {
      // Pokretanje: korak 0 (ili zadati) bez pauze. Gašenje ostavlja auto gde je tura stala.
      if (!a.active) return s.tour.active ? { ...s, tour: TOUR_OFF } : s;
      if (!s.tour.active) return { ...tourStep({ ...s, tour: { active: true, step: 0, paused: false } }, a.step ?? 0), view: s.view + 1 };
      const next = a.step !== undefined && a.step !== s.tour.step ? tourStep(s, a.step) : s;
      const paused = a.paused ?? next.tour.paused;
      return paused === next.tour.paused ? next : { ...next, tour: { ...next.tour, paused } };
    }
    case "tourStep":
      return s.tour.active ? tourStep(s, a.step) : s;
    case "tourEnd":
      // Kraj ture: auto se sklapa i vraća na ceo prikaz.
      return s.tour.active ? { ...s, tour: TOUR_OFF, group: null, explode: 0 } : s;
    case "kioskReset":
      return {
        ...close(s),
        mode: "rendgen",
        group: null,
        hover: null,
        explode: 0,
        section: null,
        paint: DEFAULT_PAINT,
        tour: TOUR_OFF,
        kiosk: true,
        kioskAuto: true,
        kioskPhase: null,
        listOpen: false,
        tab: "grupe",
        query: "",
        view: s.view + 1,
      };
    case "kioskTouch":
      return s.kioskAuto ? { ...s, kioskAuto: false, kioskPhase: null, tour: TOUR_OFF } : s;
    case "kioskPhase":
      return kioskPhase(s, a.phase);
    case "status":
      return { ...s, status: a.status, progress: a.progress === undefined ? s.progress : a.progress };
    case "tab":
      return { ...s, tab: a.tab };
    case "query":
      return { ...s, query: a.query };
    case "pushed":
      return s.pushedPart === a.pushed ? s : { ...s, pushedPart: a.pushed };
    case "list":
      // Zatvaranje liste dok je deo izabran vraća karticu.
      if (!a.open) return s.listOpen ? { ...s, listOpen: false, tab: s.part && s.tab === "delovi" ? "deo" : s.tab } : s;
      return { ...s, listOpen: true, tab: "delovi" };
    case "home":
      return { ...s, view: s.view + 1 };
    case "url": {
      const u = a.url;
      let next: Auto3dState = {
        ...s,
        mode: u.rezim,
        kiosk: u.kiosk,
        // Čist `?kiosk=1` pokreće petlju; kiosk sa delom, grupom ili režimom počinje kao da ga je
        // posetilac dodirnuo (prikazuje traženo), a petlja kreće posle 45 s mirovanja.
        kioskAuto: u.kiosk ? (s.kiosk ? s.kioskAuto : !u.deo && !u.grupa && u.rezim === "rendgen") : false,
        group: u.grupa,
        listOpen: s.listOpen || u.grupa !== null,
      };
      next = { ...next, mode: modeForGroup(next.mode, next.group) };
      next = u.deo ? select(next, u.deo, "", "url") : close(next);
      // Link na grupu otvara listu te grupe (na desktopu jezičak „Grupe“ ne postoji).
      if (u.grupa && !u.deo && next.tab === "grupe") next = { ...next, tab: "delovi" };
      // Kiosk ima turu u svojoj petlji, pa `?tura=1` uz `?kiosk=1` ne pokreće posebnu turu.
      const tura = u.tura && !u.kiosk;
      if (tura !== next.tour.active) next = apply(next, { type: "tour", active: tura });
      return next;
    }
  }
}

/** URL koji odgovara stanju (kanonski oblik daje `serializeUrlState`). Petlja kioska ne piše u adresu. */
export function urlFromState(s: Auto3dState): UrlState {
  if (s.kiosk && s.kioskAuto) return { deo: null, grupa: null, rezim: "rendgen", tura: false, kiosk: true };
  return { deo: s.part, grupa: s.group, rezim: s.mode, tura: s.tour.active && !s.kiosk, kiosk: s.kiosk };
}
