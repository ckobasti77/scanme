import { describe, expect, test } from "vitest";
import {
  KONOBAR_EKRANI,
  KONOBAR_EKRAN_KORAK,
  LOKAL_POGLEDI,
  LOKAL_POGLED_KORAK,
  LOKAL_STANJA,
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
      // K25 (intentional): the reservation choice and the working hours, absent by default.
      rezervacije: null,
      bezRadnogVremena: false,
      // K26 (intentional): the mailbox and the templates of Podešavanja.
      posta: "nije",
      povratak: null,
      sablon: null,
      sabloniPrilagodjeni: false,
      // K27 (intentional): Početna and Operativa content state, the ping, the open request and filters.
      sadrzaj: "paznja",
      pingPoslat: false,
      zahtev: null,
      filteriOtvoreni: false,
      // K28 (intentional): the Tim dialog, the venue without zones and the invitation page, absent by default.
      modal: null,
      bezZona: false,
      poziv: null,
    });
  });

  test("known values are read", () => {
    expect(
      parsePanelPreview({ sekcija: "primitivi", plan: "premium", uloga: "urednik", fioka: "otvorena" }),
    ).toEqual({
      tema: null,
      sekcija: "primitivi",
      plan: "premium",
      uloga: "urednik",
      stanje: null,
      fiokaOtvorena: true,
      rezervacije: null,
      bezRadnogVremena: false,
      // K26 (intentional): the mailbox and the templates of Podešavanja.
      posta: "nije",
      povratak: null,
      sablon: null,
      sabloniPrilagodjeni: false,
      // K27 (intentional): Početna and Operativa content state, the ping, the open request and filters.
      sadrzaj: "paznja",
      pingPoslat: false,
      zahtev: null,
      filteriOtvoreni: false,
      // K28 (intentional): the Tim dialog, the venue without zones and the invitation page.
      modal: null,
      bezZona: false,
      poziv: null,
    });
  });

  test("K28: modal, stanje=bez-zona and poziv; unknown values give null / false", () => {
    for (const modal of ["pozivnica", "pin", "link-panela"] as const) {
      expect(parsePanelPreview({ sekcija: "tim", modal }).modal).toBe(modal);
    }
    for (const poziv of ["vazeca", "istekla", "nevazeca", "prijava", "drugi-nalog", "prihvaceno"] as const) {
      expect(parsePanelPreview({ poziv }).poziv).toBe(poziv);
    }
    expect(parsePanelPreview({ modal: "stampa" }).modal).toBeNull();
    expect(parsePanelPreview({ modal: "Pin" }).modal).toBeNull();
    expect(parsePanelPreview({ poziv: "x" }).poziv).toBeNull();
    expect(parsePanelPreview({ poziv: "" }).poziv).toBeNull();
    // stanje=bez-zona is a content state of Tim: the whole-screen stanje stays null.
    expect(parsePanelPreview({ sekcija: "tim", stanje: "bez-zona" })).toMatchObject({
      sekcija: "tim",
      stanje: null,
      bezZona: true,
      sadrzaj: "paznja",
    });
    expect(parsePanelPreview({ stanje: "mirno" }).bezZona).toBe(false);
    expect(parsePanelPreview({ modal: ["pin", "pozivnica"], poziv: ["istekla", "vazeca"] })).toMatchObject({
      modal: "pin",
      poziv: "istekla",
    });
  });

  test("K25: the reservation choice and missing working hours; anything else gives the default", () => {
    expect(parsePanelPreview({ sekcija: "funkcionalnosti", rezervacije: "eksterni" })).toMatchObject({
      sekcija: "funkcionalnosti",
      rezervacije: "eksterni",
    });
    expect(parsePanelPreview({ rezervacije: "iskljuceno", "radno-vreme": "prazno" })).toMatchObject({
      rezervacije: "iskljuceno",
      bezRadnogVremena: true,
    });
    expect(parsePanelPreview({ rezervacije: "telefon", "radno-vreme": "puno" })).toMatchObject({
      rezervacije: null,
      bezRadnogVremena: false,
    });
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

  test("K27: content state, ping, open request and filters; anything else gives the default", () => {
    expect(parsePanelPreview({ sekcija: "operativa", stanje: "mirno", ping: "poslat", zahtev: "rq_05", filteri: "1" })).toMatchObject({
      sekcija: "operativa",
      stanje: null,
      sadrzaj: "mirno",
      pingPoslat: true,
      zahtev: "rq_05",
      filteriOtvoreni: true,
    });
    // A whole-screen state stays a whole-screen state; the content state keeps its default.
    expect(parsePanelPreview({ stanje: "ucitava" })).toMatchObject({ stanje: "ucitava", sadrzaj: "paznja" });
    expect(parsePanelPreview({ stanje: "bucno", ping: "1", zahtev: "../x", filteri: "da" })).toMatchObject({
      sadrzaj: "paznja",
      pingPoslat: false,
      zahtev: null,
      filteriOtvoreni: false,
    });
    expect(parseKonobarPreview({ ping: "1" }).podsetnik).toBe(true);
    expect(parseKonobarPreview({ ping: "poslat" }).podsetnik).toBe(false);
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
    expect(parseKonobarPreview({})).toEqual({
      tema: null,
      ekran: "red",
      offline: false,
      stanje: null,
      uloga: "osoblje",
      zahtev: null,
      potvrdaOtkaza: false,
      // K23: the floor's parameters, all off by default.
      zauzetost: false,
      zona: null,
      kasni: false,
      zvukIskljucen: false,
      sto: null,
      // K25 (intentional): no reservation open, no cancellation strip.
      rezervacija: null,
      otkazana: false,
      // K26 (intentional): the reply sheet starts by status, the mailbox connected.
      odgovor: null,
      posta: "povezana",
      slanje: null,
      ishodPoziva: false,
      // K27 (intentional): no reminder strip.
      podsetnik: false,
    });
  });

  test("K26: the reply sheet (kind, mailbox, send state, call outcome); anything else gives the default", () => {
    expect(parseKonobarPreview({ odgovor: "predlog", posta: "greska", slanje: "poslato", ishod: "1" })).toMatchObject({
      odgovor: "predlog",
      posta: "greska",
      slanje: "poslato",
      ishodPoziva: true,
    });
    expect(parseKonobarPreview({ odgovor: "ljubavno", posta: "zoho", slanje: "odmah", ishod: "da" })).toMatchObject({
      odgovor: null,
      posta: "povezana",
      slanje: null,
      ishodPoziva: false,
    });
    expect(parsePanelPreview({ sekcija: "podesavanja", posta: "nedostupna", povratak: "greska", sablon: "odbijanje", sabloni: "1" })).toMatchObject({
      posta: "nedostupna",
      povratak: "greska",
      sablon: "odbijanje",
      sabloniPrilagodjeni: true,
    });
    expect(parsePanelPreview({ posta: "x", povratak: "x", sablon: "druga" })).toMatchObject({ posta: "nije", povratak: null, sablon: null });
  });

  test("K25: a reservation detail, the table with a reservation and the cancellation strip", () => {
    expect(parseKonobarPreview({ ekran: "rezervacije", rezervacija: "rv_01" })).toMatchObject({
      ekran: "rezervacije",
      rezervacija: "rv_01",
    });
    expect(parseKonobarPreview({ ekran: "sto", rezervacija: "1", otkazana: "1" })).toMatchObject({
      ekran: "sto",
      rezervacija: "1",
      otkazana: true,
    });
    expect(parseKonobarPreview({ rezervacija: "rq_01", otkazana: "da" })).toMatchObject({ rezervacija: null, otkazana: false });
    expect(parseKonobarPreview({ rezervacija: "<script>" }).rezervacija).toBeNull();
  });

  test("K23: occupancy, zone, late threshold, sound and the open table; anything else gives the default", () => {
    const p = parseKonobarPreview({ ekran: "sto", zauzetost: "1", zona: "Terasa", kasni: "1", zvuk: "iskljucen", sto: "Sto 12" });
    expect(p).toMatchObject({ ekran: "sto", zauzetost: true, zona: "Terasa", kasni: true, zvukIskljucen: true, sto: "Sto 12" });
    expect(parseKonobarPreview({ zona: "Glavna sala" }).zona).toBe("Glavna sala");
    expect(parseKonobarPreview({ zauzetost: "da", kasni: "0", zvuk: "ukljucen" })).toMatchObject({
      zauzetost: false,
      kasni: false,
      zvukIskljucen: false,
    });
    expect(parseKonobarPreview({ zona: "<script>" }).zona).toBeNull();
    expect(parseKonobarPreview({ sto: "x".repeat(41) }).sto).toBeNull();
    expect(parseKonobarPreview({ zona: ["VIP", "Terasa"] }).zona).toBe("VIP");
  });

  test("K22: states, role, request and the cancel confirmation; unknown values give the default", () => {
    for (const stanje of ["blokada", "pogresan-pin", "bez-peppera", "prazno", "mnogo"] as const) {
      expect(parseKonobarPreview({ stanje }).stanje).toBe(stanje);
      expect(parseKonobarPreview({ stanje }).offline).toBe(false);
    }
    expect(parseKonobarPreview({ veza: "offline" }).offline).toBe(true);
    expect(parseKonobarPreview({ stanje: "pokvareno" }).stanje).toBeNull();
    expect(parseKonobarPreview({ uloga: "menadzer" }).uloga).toBe("menadzer");
    expect(parseKonobarPreview({ uloga: "vlasnik" }).uloga).toBe("osoblje");
    expect(parseKonobarPreview({ ekran: "detalj", zahtev: "rq_01" }).zahtev).toBe("rq_01");
    expect(parseKonobarPreview({ zahtev: "<script>" }).zahtev).toBeNull();
    expect(parseKonobarPreview({ potvrda: "otkazi" }).potvrdaOtkaza).toBe(true);
    expect(parseKonobarPreview({ potvrda: "da" }).potvrdaOtkaza).toBe(false);
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
    expect(parseLokalPreview({})).toEqual({
      tema: null,
      pogled: "lista",
      stanje: null,
      fokusPozicija: false,
      stampa: false,
    });
    for (const pogled of LOKAL_POGLEDI) {
      expect(parseLokalPreview({ pogled }).pogled).toBe(pogled);
      expect(LOKAL_POGLED_KORAK[pogled].korak).toBe("K20");
    }
    expect(parseLokalPreview({ pogled: "3d" }).pogled).toBe("lista");
  });

  test("K20: venue states, the open drawer and the print sheet; unknown values give the default", () => {
    for (const stanje of LOKAL_STANJA) expect(parseLokalPreview({ stanje }).stanje).toBe(stanje);
    expect(parseLokalPreview({ stanje: "pun" }).stanje).toBeNull();
    expect(parseLokalPreview({ fokus: "pozicija" }).fokusPozicija).toBe(true);
    expect(parseLokalPreview({ fokus: "sto" }).fokusPozicija).toBe(false);
    expect(parseLokalPreview({ modal: "stampa" }).stampa).toBe(true);
    expect(parseLokalPreview({ modal: ["stampa", "x"] }).stampa).toBe(true);
    expect(parseLokalPreview({ modal: "objava" }).stampa).toBe(false);
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
      // K21
      pozicija: null,
      korpa: false,
      mojiZahtevi: false,
      zahtev: null,
      stanjeZahteva: null,
      greska: null,
      offline: false,
      // K25 (intentional): the reservation screens, absent by default.
      rezervacija: null,
      kontakt: null,
      rezervacije: null,
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

  test("public K21: the guest at a position, the cart, Moji zahtevi and their states", () => {
    const params = parsePublicPreview({
      pozicija: "sto",
      korpa: "1",
      "moji-zahtevi": "1",
      zahtev: "racun",
      "stanje-zahteva": "prihvacen",
      greska: "cena",
      veza: "offline",
    });
    expect(params).toMatchObject({
      pozicija: "sto",
      korpa: true,
      mojiZahtevi: true,
      zahtev: "racun",
      stanjeZahteva: "prihvacen",
      greska: "cena",
      offline: true,
    });
    expect(parsePublicPreview({ pozicija: "soba" }).pozicija).toBe("soba");
    // Unknown values give the default state, never an error; the first of a repeated value counts.
    expect(
      parsePublicPreview({ pozicija: "terasa", korpa: "da", zahtev: "kuhinja", "stanje-zahteva": "krenuo", greska: "x", veza: "spora" }),
    ).toMatchObject({ pozicija: null, korpa: false, zahtev: null, stanjeZahteva: null, greska: null, offline: false });
    expect(parsePublicPreview({ pozicija: ["soba", "sto"] }).pozicija).toBe("soba");
  });
  test("public K25: the reservation screens, the contact and the venue system", () => {
    expect(parsePublicPreview({ rezervacija: "poslato", kontakt: "telefon" })).toMatchObject({
      rezervacija: "poslato",
      kontakt: "telefon",
      rezervacije: null,
    });
    expect(parsePublicPreview({ rezervacije: "eksterni" }).rezervacije).toBe("eksterni");
    expect(parsePublicPreview({ rezervacija: "sto", kontakt: "fax", rezervacije: "da" })).toMatchObject({
      rezervacija: null,
      kontakt: null,
      rezervacije: null,
    });
  });
});
