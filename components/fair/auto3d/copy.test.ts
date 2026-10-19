import { describe, expect, test } from "vitest";
import { initialState, reduce } from "@/lib/auto3d/state";
import { TOUR_STEPS } from "@/lib/auto3d/tour";
import { DEFAULT_URL_STATE, parseUrlState } from "@/lib/auto3d/url-state";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { PARTS } from "@/lib/auto3d/catalog";
import { announcement, listParts, PAINT_LABEL, partsCount, tourCaption } from "./copy";

const start = () => initialState(DEFAULT_URL_STATE);

describe("lista delova (A13: grana sa grupom nije bila testirana)", () => {
  test("grupa bez upita daje delove te grupe redom iz kataloga", () => {
    expect(listParts("", "motor")).toEqual(PARTS.filter((p) => p.system === "motor").map((p) => p.id));
    expect(listParts("", null)).toEqual(PARTS.map((p) => p.id));
  });

  test("upit i grupa: samo pogoci iz te grupe", () => {
    expect(listParts("pumpa", null)).toEqual(expect.arrayContaining(["pumpa_goriva", "visokopritisna_pumpa"]));
    const inGroup = listParts("pumpa", "energija");
    expect(inGroup.length).toBeGreaterThan(0);
    for (const id of inGroup) expect(PARTS.find((p) => p.id === id)?.system).toBe("energija");
    expect(listParts("pumpa", "kocnice")).toEqual([]);
  });
});

describe("brojevi i aria-live najave", () => {
  test("deo, dela, delova", () => {
    expect(partsCount(1)).toBe("1 deo");
    expect(partsCount(3)).toBe("3 dela");
    expect(partsCount(9)).toBe("9 delova");
    expect(partsCount(78)).toBe("78 delova");
    expect(partsCount(21)).toBe("21 deo");
  });

  test("izbor dela, sa dva komada", () => {
    const s = start();
    expect(announcement(s, reduce(s, { type: "select", part: "turbopunjac", origin: "list" }))).toBe(
      "Izabran deo: Turbopunjač, Motor, dva komada.",
    );
    expect(announcement(s, reduce(s, { type: "select", part: "hauba", origin: "canvas" }))).toBe("Izabran deo: Hauba, Karoserija.");
  });

  test("grupa, sve grupe, režim, status; hover se ne najavljuje", () => {
    const s = start();
    const g = reduce(s, { type: "group", group: "motor" });
    expect(announcement(s, g)).toBe("Grupa Motor: 9 delova. Ostali delovi su prigušeni.");
    expect(announcement(g, reduce(g, { type: "group", group: null }))).toBe(t.announceGroupAll);
    expect(announcement(s, reduce(s, { type: "mode", mode: "kostur" }))).toBe("Prikaz: Kostur.");
    expect(announcement(s, reduce(s, { type: "status", status: "ready" }))).toBe(t.announceReady);
    expect(announcement(s, reduce(s, { type: "status", status: "nowebgl" }))).toBe(t.announceNoWebgl);
    expect(announcement(s, reduce(s, { type: "hover", part: "karter" }))).toBeNull();
    expect(announcement(s, reduce(s, { type: "query", query: "kocnica" }))).toBe("Pretraga: 9 delova.");
    expect(announcement(s, reduce(s, { type: "query", query: "xyz" }))).toBe("Nema dela za „xyz“.");
    expect(announcement(s, reduce(s, { type: "query", query: " " }))).toBeNull();
  });

  test("A10: tura, pauza, boja i presek; koraci ture i kiosk petlja se ne najavljuju", () => {
    const s = start();
    const tour = reduce(s, { type: "tour", active: true });
    expect(announcement(s, tour)).toBe(t.announceTourStart);
    const step = reduce(tour, { type: "tourStep", step: 3 });
    expect(announcement(tour, step)).toBeNull();
    expect(announcement(step, reduce(step, { type: "tour", active: true, paused: true }))).toBe(t.announceTourPaused);
    expect(announcement(step, reduce(step, { type: "tourEnd" }))).toBe(t.announceTourEnd);
    // Izbor dela tokom ture prekida turu i najavljuje deo (A13).
    const picked = reduce(step, { type: "select", part: "karter", origin: "canvas" });
    expect(picked.tour.active).toBe(false);
    expect(announcement(step, picked)).toBe(`${t.announceTourEnd} Izabran deo: Karter, Motor.`);
    expect(announcement(s, reduce(s, { type: "paint", paint: "bela" }))).toBe(`Boja laka: ${PAINT_LABEL.bela}.`);
    const cut = reduce(s, { type: "section", t: 0.5 });
    expect(announcement(s, cut)).toBe(t.announceSectionOn);
    expect(announcement(cut, reduce(cut, { type: "section", t: 0.7 }))).toBeNull();
    expect(announcement(cut, reduce(cut, { type: "section", t: null }))).toBe(t.announceSectionOff);
    const kiosk = initialState(parseUrlState({ kiosk: "1" }));
    const loop = reduce(kiosk, { type: "kioskPhase", phase: "tura" });
    expect(announcement(kiosk, loop)).toBeNull();
    expect(announcement(loop, reduce(loop, { type: "tourStep", step: 2 }))).toBeNull();
  });

  test("A10: titl ture: uvod, sistem iz rečnika delova, kraj", () => {
    expect(tourCaption(0)).toMatchObject({ title: t.tourIntroTitle, system: null });
    expect(tourCaption(0).text).toContain("78 delova u 10 sistema");
    const i = TOUR_STEPS.findIndex((x) => x.id === "motor");
    expect(tourCaption(i)).toEqual({ title: delovi.systems.motor.name, text: delovi.systems.motor.description, system: "motor" });
    expect(tourCaption(TOUR_STEPS.length - 1)).toMatchObject({ title: t.tourOutroTitle, text: t.tourOutroText, system: null });
  });
});
