import { describe, expect, test } from "vitest";
import {
  KONOBAR_EKRANI,
  KONOBAR_EKRAN_KORAK,
  LOKAL_POGLEDI,
  LOKAL_POGLED_KORAK,
  PANEL_SEKCIJE,
  PANEL_SEKCIJA_KORAK,
  PANEL_ULOGA_AKTER,
  firstParam,
  izlogHref,
  parseEditorPreview,
  parseKonobarPreview,
  parseLokalPreview,
  parsePanelPreview,
  parsePublicPreview,
  parseTema,
  pickOptional,
  pickParam,
} from "./izlog-params";

describe("izlog parameters: helpers", () => {
  test("a repeated parameter counts by its first value", () => {
    expect(firstParam(["tamna", "svetla"])).toBe("tamna");
    expect(firstParam("svetla")).toBe("svetla");
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam([])).toBeUndefined();
  });

  test("pickParam: allowed value, otherwise the fallback", () => {
    const allowed = ["a", "b"] as const;
    expect(pickParam("b", allowed, "a")).toBe("b");
    expect(pickParam("c", allowed, "a")).toBe("a");
    expect(pickParam("", allowed, "a")).toBe("a");
    expect(pickParam(undefined, allowed, "a")).toBe("a");
    expect(pickParam(["b", "a"], allowed, "a")).toBe("b");
    // Case matters: the URL vocabulary is lower case only.
    expect(pickParam("B", allowed, "a")).toBe("a");
  });

  test("izlogHref keeps the given order and drops empty values", () => {
    expect(izlogHref("/dev/menu-panel-preview", {})).toBe("/dev/menu-panel-preview");
    expect(izlogHref("/dev/menu-panel-preview", { sekcija: "tim", tema: null })).toBe(
      "/dev/menu-panel-preview?sekcija=tim",
    );
    expect(izlogHref("/dev/menu-konobar-preview", { ekran: "sala-raspored", tema: "tamna", x: "" })).toBe(
      "/dev/menu-konobar-preview?ekran=sala-raspored&tema=tamna",
    );
    expect(izlogHref("/a", { q: "a b&c" })).toBe("/a?q=a%20b%26c");
  });

  test("pickOptional: allowed value, otherwise null", () => {
    expect(pickOptional("a", ["a"] as const)).toBe("a");
    expect(pickOptional("x", ["a"] as const)).toBeNull();
    expect(pickOptional(undefined, ["a"] as const)).toBeNull();
  });
});

describe("?tema=", () => {
  test("svetla and tamna force the app theme", () => {
    expect(parseTema("svetla")).toBe("svetla");
    expect(parseTema("tamna")).toBe("tamna");
  });

  test("absent or unknown keeps the app's own theme (null), never an error", () => {
    for (const value of [undefined, "", "dark", "light", "Tamna", "tamna ", "1"]) {
      expect(parseTema(value)).toBeNull();
    }
    expect(parseTema(["nepoznato", "tamna"])).toBeNull();
    expect(parseTema(["tamna", "svetla"])).toBe("tamna");
  });

  test("every route parser reads it", () => {
    const params = { tema: "tamna" };
    expect(parsePanelPreview(params).tema).toBe("tamna");
    expect(parseKonobarPreview(params).tema).toBe("tamna");
    expect(parseLokalPreview(params).tema).toBe("tamna");
    expect(parseEditorPreview(params).tema).toBe("tamna");
    expect(parsePublicPreview(params).tema).toBe("tamna");
  });
});

describe("/dev/menu-panel-preview", () => {
  test("defaults with no parameters", () => {
    expect(parsePanelPreview({})).toEqual({
      tema: null,
      sekcija: "pocetna",
      plan: "standard",
      uloga: "vlasnik",
      stanje: null,
      fiokaOtvorena: false,
    });
  });

  test("known values are read", () => {
    expect(
      parsePanelPreview({ sekcija: "primitivi", plan: "premium", uloga: "urednik", fioka: "otvorena" }),
    ).toEqual({ tema: null, sekcija: "primitivi", plan: "premium", uloga: "urednik", stanje: null, fiokaOtvorena: true });
  });

  test("K08: staff and ScanMe admin roles and the whole-screen states of the shell", () => {
    expect(parsePanelPreview({ uloga: "osoblje" }).uloga).toBe("osoblje");
    expect(parsePanelPreview({ uloga: "admin" }).uloga).toBe("admin");
    for (const stanje of ["ucitava", "prijava", "neaktivno", "bez-pristupa"] as const) {
      expect(parsePanelPreview({ stanje }).stanje).toBe(stanje);
    }
    expect(parsePanelPreview({ stanje: "malo-podataka" }).stanje).toBeNull();
    expect(PANEL_ULOGA_AKTER).toEqual({ vlasnik: "owner", menadzer: "manager", urednik: "editor", osoblje: "staff", admin: "admin" });
  });

  test("unknown values fall back to the default state", () => {
    expect(parsePanelPreview({ sekcija: "kuhinja", plan: "enterprise", uloga: "konobar", stanje: "pokvareno", fioka: "da" })).toEqual(
      parsePanelPreview({}),
    );
  });

  test("the eight sections of master §13.1 plus the primitives page, each with its step", () => {
    expect(PANEL_SEKCIJE).toEqual([
      "pocetna",
      "editor",
      "operativa",
      "lokal",
      "funkcionalnosti",
      "tim",
      "analitika",
      "podesavanja",
      "primitivi",
    ]);
    for (const sekcija of PANEL_SEKCIJE) {
      expect(PANEL_SEKCIJA_KORAK[sekcija].korak).toMatch(/^K\d\d$/);
    }
    expect(PANEL_SEKCIJA_KORAK.primitivi.korak).toBe("K07");
  });
});

describe("/dev/menu-konobar-preview", () => {
  test("defaults to the work queue, online", () => {
    expect(parseKonobarPreview({})).toEqual({ tema: null, ekran: "red", offline: false });
  });

  test("every documented screen is read and names its step", () => {
    for (const ekran of KONOBAR_EKRANI) {
      expect(parseKonobarPreview({ ekran }).ekran).toBe(ekran);
      expect(KONOBAR_EKRAN_KORAK[ekran].korak).toMatch(/^K2[2-5]$/);
    }
    expect(KONOBAR_EKRAN_KORAK.pin.korak).toBe("K22");
    expect(KONOBAR_EKRAN_KORAK["sala-raspored"].korak).toBe("K23");
    expect(KONOBAR_EKRAN_KORAK.rezervacije.korak).toBe("K25");
  });

  test("stanje=offline; anything else is online", () => {
    expect(parseKonobarPreview({ stanje: "offline" }).offline).toBe(true);
    expect(parseKonobarPreview({ stanje: "online" }).offline).toBe(false);
    expect(parseKonobarPreview({ ekran: "kuhinja" }).ekran).toBe("red");
  });
});

describe("/dev/menu-lokal-preview", () => {
  test("defaults to the list and reads every documented view", () => {
    expect(parseLokalPreview({})).toEqual({ tema: null, pogled: "lista" });
    for (const pogled of LOKAL_POGLEDI) {
      expect(parseLokalPreview({ pogled }).pogled).toBe(pogled);
      expect(LOKAL_POGLED_KORAK[pogled].korak).toBe("K20");
    }
    expect(parseLokalPreview({ pogled: "3d" }).pogled).toBe("lista");
  });
});

describe("existing parameters keep working (TASK-51, TASK-52)", () => {
  // K10 (intended change, ODLUKE K10): the result carries the new editor states;
  // state=empty and design=dark mean what they meant before. K15 adds `fokus` (ODLUKE K15),
  // K17 adds `tab` and `paleta` (ODLUKE K17), K18 adds `modal` (ODLUKE K18).
  test("editor: state=empty and design=dark", () => {
    const podrazumevano = {
      tema: null,
      empty: false,
      darkDesign: false,
      stanje: null,
      pogled: null,
      plan: "standard",
      stariEditor: false,
      fokus: null,
      tab: null,
      paleta: null,
      modal: null,
    };
    expect(parseEditorPreview({})).toEqual(podrazumevano);
    expect(parseEditorPreview({ state: "empty", design: "dark" })).toEqual({
      ...podrazumevano,
      empty: true,
      darkDesign: true,
      stanje: "prazno",
    });
    expect(parseEditorPreview({ state: "full", design: "light" })).toEqual(parseEditorPreview({}));
  });

  test("editor (K10): stanje, pogled, plan and editor=stari; unknown values give the default", () => {
    expect(parseEditorPreview({ stanje: "veliki" }).stanje).toBe("veliki");
    expect(parseEditorPreview({ stanje: "brzi-unos" }).stanje).toBe("brzi-unos");
    expect(parseEditorPreview({ stanje: "prazno" }).empty).toBe(true);
    expect(parseEditorPreview({ stanje: "ogroman" }).stanje).toBeNull();
    expect(parseEditorPreview({ pogled: "pregled" }).pogled).toBe("pregled");
    expect(parseEditorPreview({ pogled: "3d" }).pogled).toBeNull();
    expect(parseEditorPreview({ plan: "premium" }).plan).toBe("premium");
    expect(parseEditorPreview({ plan: "zlatni" }).plan).toBe("standard");
    expect(parseEditorPreview({ editor: "stari" }).stariEditor).toBe(true);
    expect(parseEditorPreview({ editor: "novi" }).stariEditor).toBe(false);
    expect(parseEditorPreview({ stanje: ["veliki", "prazno"] }).stanje).toBe("veliki");
  });

  test("public: state=long and design=dark, independent of ?tema", () => {
    // K13 (intentional): the public izlog gained its own parameters; their defaults are below.
    const PODRAZUMEVANO = {
      primer: "restoran",
      layout: null,
      mediji: null,
      paleta: null,
      stanje: null,
      stranica: null,
      kategorija: null,
      detalj: false,
      stariRenderer: false,
      // K14
      alergeni: [],
      jezik: null,
      valuta: null,
      starKurs: false,
      pretraga: null,
      filteri: [],
    };
    expect(parsePublicPreview({})).toEqual({ tema: null, long: false, darkDesign: false, ...PODRAZUMEVANO });
    expect(parsePublicPreview({ state: "long", design: "dark", tema: "svetla" })).toEqual({
      tema: "svetla",
      long: true,
      darkDesign: true,
      ...PODRAZUMEVANO,
    });
    // The app theme never chooses the venue palette (P13): tema=tamna alone keeps the light design.
    expect(parsePublicPreview({ tema: "tamna" }).darkDesign).toBe(false);
  });
});
