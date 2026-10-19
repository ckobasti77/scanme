import { describe, expect, test } from "vitest";
import { initialState, reduce, urlFromState, type Auto3dState } from "./state";
import { TOUR_STEPS } from "./tour";
import { DEFAULT_URL_STATE, parseUrlState } from "./url-state";

const start = (): Auto3dState => initialState(DEFAULT_URL_STATE);

describe("reducer stanja /sajam/3d", () => {
  test("1. izbor dela: jezičak Deo; grupa drugog sistema se briše; kostur + karoserija → rendgen", () => {
    let s = reduce({ ...start(), group: "motor" }, { type: "select", part: "hauba", origin: "canvas" });
    expect(s).toMatchObject({ part: "hauba", group: null, tab: "deo", origin: "canvas" });
    s = reduce({ ...start(), group: "motor" }, { type: "select", part: "turbopunjac", instance: "z", origin: "list" });
    expect(s).toMatchObject({ part: "turbopunjac", instance: "z", group: "motor" });
    s = reduce({ ...start(), mode: "kostur" }, { type: "select", part: "hauba", origin: "list" });
    expect(s.mode).toBe("rendgen");
  });

  test("2. grupa drugog sistema zatvara deo; karoserija u kosturu vraća rendgen", () => {
    const withPart = reduce(start(), { type: "select", part: "hauba", origin: "canvas" });
    expect(reduce(withPart, { type: "group", group: "motor" })).toMatchObject({ part: null, group: "motor" });
    expect(reduce(withPart, { type: "group", group: "karoserija" }).part).toBe("hauba");
    expect(reduce({ ...start(), mode: "kostur" }, { type: "group", group: "karoserija" }).mode).toBe("rendgen");
  });

  test("3. kostur zatvara izabrani deo karoserije", () => {
    const roof = reduce(start(), { type: "select", part: "krov", origin: "canvas" });
    expect(reduce(roof, { type: "mode", mode: "kostur" })).toMatchObject({ mode: "kostur", part: null });
    const sump = reduce(start(), { type: "select", part: "karter", origin: "canvas" });
    expect(reduce(sump, { type: "mode", mode: "kostur" }).part).toBe("karter");
  });

  test("4. tura zatvara deo i briše grupu", () => {
    const busy = { ...reduce(start(), { type: "select", part: "karter", origin: "canvas" }), group: "motor" as const };
    expect(reduce(busy, { type: "tour", active: true })).toMatchObject({ part: null, group: null, tour: { active: true, step: 0 } });
  });

  test("5. kioskReset vraća početno stanje sa kioskom", () => {
    const busy: Auto3dState = { ...start(), mode: "lak", group: "motor", explode: 0.7, section: 0.4, part: "karter" };
    expect(reduce(busy, { type: "kioskReset" })).toMatchObject({
      mode: "rendgen",
      part: null,
      group: null,
      explode: 0,
      section: null,
      kiosk: true,
    });
  });

  test("6. rasklapanje i presek su u [0, 1]", () => {
    expect(reduce(start(), { type: "explode", p: 1.7 }).explode).toBe(1);
    expect(reduce(start(), { type: "explode", p: -1 }).explode).toBe(0);
    expect(reduce(start(), { type: "section", t: 2 }).section).toBe(1);
    expect(reduce(start(), { type: "section", t: null }).section).toBeNull();
  });

  test("7. URL: deo pobeđuje grupu; stanje vraća isti URL", () => {
    const s = initialState(parseUrlState({ deo: "turbopunjac", grupa: "motor", rezim: "lak", kiosk: "1" }));
    expect(s).toMatchObject({ part: "turbopunjac", group: "motor", mode: "lak", kiosk: true, origin: "url" });
    expect(urlFromState(s)).toEqual({ deo: "turbopunjac", grupa: "motor", rezim: "lak", tura: false, kiosk: true });
    expect(initialState(parseUrlState({ rezim: "kostur", grupa: "karoserija" })).mode).toBe("rendgen");
  });

  test("zatvaranje bez dela ne menja stanje; isti hover ne pravi novo stanje", () => {
    const s = start();
    expect(reduce(s, { type: "close" })).toBe(s);
    const h = reduce(s, { type: "hover", part: "karter" });
    expect(reduce(h, { type: "hover", part: "karter" })).toBe(h);
  });

  test("A05: traka grupa otvara listu; „Svi delovi“ prebacuje na jezičak Delovi; početni pogled", () => {
    const g = reduce(start(), { type: "group", group: "motor", openList: true });
    expect(g).toMatchObject({ group: "motor", listOpen: true, tab: "delovi" });
    const phone = reduce(start(), { type: "group", group: "motor" });
    expect(phone).toMatchObject({ listOpen: false, tab: "grupe" });
    const card = reduce(reduce(start(), { type: "select", part: "karter", origin: "canvas" }), { type: "group", group: "motor", openList: true });
    expect(card).toMatchObject({ part: "karter", tab: "deo", listOpen: true });
    const list = reduce(card, { type: "list", open: true });
    expect(list).toMatchObject({ part: "karter", tab: "delovi", listOpen: true });
    expect(reduce(list, { type: "list", open: false })).toMatchObject({ listOpen: false, tab: "deo" });
    const idle = start();
    expect(reduce(idle, { type: "list", open: false })).toBe(idle);
    expect(reduce(reduce(start(), { type: "home" }), { type: "home" }).view).toBe(2);
  });

  test("A05: grupa iz adrese otvara listu; zatvaranje dela vraća jezičak Delovi", () => {
    expect(initialState(parseUrlState({ grupa: "kocnice" }))).toMatchObject({ group: "kocnice", listOpen: true, tab: "delovi" });
    expect(initialState(parseUrlState({ deo: "hauba" }))).toMatchObject({ listOpen: false, tab: "deo" });
    const open = reduce(start(), { type: "select", part: "hauba", origin: "list" });
    expect(reduce(open, { type: "close" })).toMatchObject({ part: null, tab: "delovi" });
  });

  test("A10: tura ide korak po korak (grupa, rasklapanje, rendgen, bez preseka i liste)", () => {
    const busy: Auto3dState = { ...start(), mode: "lak", section: 0.5, listOpen: true };
    let s = reduce(busy, { type: "tour", active: true });
    expect(s).toMatchObject({ mode: "rendgen", section: null, listOpen: false, group: null, explode: 0, tour: { active: true, step: 0, paused: false } });
    s = reduce(s, { type: "tourStep", step: 3 });
    expect(s).toMatchObject({ group: TOUR_STEPS[3].group, explode: TOUR_STEPS[3].explode, tour: { step: 3 } });
    const last = TOUR_STEPS.length - 1;
    s = reduce(s, { type: "tourStep", step: last });
    expect(s).toMatchObject({ group: null, explode: 1, tour: { active: true, step: last } });
    expect(reduce(s, { type: "tourStep", step: 99 })).toBe(s);
    expect(reduce(start(), { type: "tourStep", step: 2 }).group).toBeNull();
  });

  test("A10: pauza i nastavak; kraj ture sklapa auto", () => {
    let s = reduce(start(), { type: "tour", active: true });
    s = reduce(s, { type: "tour", active: true, paused: true });
    expect(s.tour).toEqual({ active: true, step: 0, paused: true });
    s = reduce(s, { type: "tour", active: true, paused: false });
    expect(s.tour.paused).toBe(false);
    s = reduce(s, { type: "tourStep", step: TOUR_STEPS.length - 1 });
    expect(reduce(s, { type: "tourEnd" })).toMatchObject({ tour: { active: false }, group: null, explode: 0 });
  });

  test("A10: korisnikova radnja prekida turu i ostavlja auto gde je stala", () => {
    const touring = reduce(reduce(start(), { type: "tour", active: true }), { type: "tourStep", step: 3 });
    const group = TOUR_STEPS[3].group;
    expect(reduce(touring, { type: "select", part: "karter", origin: "canvas" })).toMatchObject({ tour: { active: false }, part: "karter" });
    expect(reduce(touring, { type: "explode", p: 1 })).toMatchObject({ tour: { active: false }, explode: 1, group });
    expect(reduce(touring, { type: "mode", mode: "lak" }).tour.active).toBe(false);
    expect(reduce(touring, { type: "group", group: "kocnice" }).tour.active).toBe(false);
    expect(reduce(touring, { type: "section", t: 0.5 }).tour.active).toBe(false);
    expect(reduce(touring, { type: "home" }).tour.active).toBe(false);
    expect(reduce(touring, { type: "list", open: true }).tour.active).toBe(false);
    expect(reduce(touring, { type: "tour", active: false })).toMatchObject({ tour: { active: false }, group });
    // Hover, status i jezičci ne prekidaju turu.
    expect(reduce(touring, { type: "hover", part: "karter" }).tour.active).toBe(true);
    expect(reduce(touring, { type: "status", status: "ready" }).tour.active).toBe(true);
    expect(reduce(touring, { type: "tab", tab: "delovi" }).tour.active).toBe(true);
  });

  test("A10: ?tura=1 pokreće turu, a uz ?kiosk=1 turu vodi petlja kioska", () => {
    expect(initialState(parseUrlState({ tura: "1" })).tour).toEqual({ active: true, step: 0, paused: false });
    const kiosk = initialState(parseUrlState({ tura: "1", kiosk: "1" }));
    expect(kiosk).toMatchObject({ kiosk: true, kioskAuto: true, tour: { active: false } });
    // Kiosk sa delom počinje „dodirnut“ (prikazuje deo), a petlja kreće posle 45 s mirovanja.
    expect(initialState(parseUrlState({ kiosk: "1", deo: "turbopunjac" }))).toMatchObject({ kioskAuto: false, part: "turbopunjac" });
    expect(initialState(parseUrlState({ kiosk: "1", rezim: "lak" }))).toMatchObject({ kioskAuto: false, mode: "lak" });
    const touring = reduce(start(), { type: "tour", active: true });
    expect(urlFromState(touring).tura).toBe(true);
    expect(urlFromState({ ...touring, kiosk: true }).tura).toBe(false);
  });

  test("A10: kiosk faze: tura, pa ceo auto koji se rasklapa, drži i sklapa", () => {
    let s = initialState(parseUrlState({ kiosk: "1" }));
    s = reduce(s, { type: "kioskPhase", phase: "tura" });
    expect(s).toMatchObject({ kioskPhase: "tura", tour: { active: true, step: 0 } });
    s = reduce(s, { type: "tourStep", step: 4 });
    expect(s.group).toBe(TOUR_STEPS[4].group);
    s = reduce(s, { type: "kioskPhase", phase: "orbita" });
    expect(s).toMatchObject({ kioskPhase: "orbita", tour: { active: false }, group: null, explode: 0 });
    expect(reduce(s, { type: "kioskPhase", phase: "rasklapanje" }).explode).toBe(1);
    expect(reduce(s, { type: "kioskPhase", phase: "drzanje" }).explode).toBe(1);
    expect(reduce(s, { type: "kioskPhase", phase: "sklapanje" }).explode).toBe(0);
    // Van kioska i posle dodira faze se ne primenjuju.
    expect(reduce(start(), { type: "kioskPhase", phase: "rasklapanje" }).explode).toBe(0);
    // Petlja ne piše grupu ture u adresu (adresa ostaje `?kiosk=1`).
    expect(urlFromState(reduce(reduce(s, { type: "kioskPhase", phase: "tura" }), { type: "tourStep", step: 4 }))).toEqual({
      deo: null,
      grupa: null,
      rezim: "rendgen",
      tura: false,
      kiosk: true,
    });
    const touched = reduce(s, { type: "kioskTouch" });
    expect(touched).toMatchObject({ kioskAuto: false, kioskPhase: null, tour: { active: false } });
    expect(reduce(touched, { type: "kioskPhase", phase: "rasklapanje" })).toBe(touched);
  });

  test("A10: kioskReset vraća petlju, podrazumevanu boju i zatvara listu", () => {
    let s = initialState(parseUrlState({ kiosk: "1" }));
    s = reduce(s, { type: "kioskTouch" });
    s = reduce(s, { type: "paint", paint: "bela" });
    s = reduce(s, { type: "select", part: "karter", origin: "canvas" });
    s = reduce(s, { type: "list", open: true });
    expect(reduce(s, { type: "kioskReset" })).toMatchObject({
      kioskAuto: true,
      kioskPhase: null,
      paint: "grafit",
      part: null,
      listOpen: false,
      query: "",
    });
  });
});
