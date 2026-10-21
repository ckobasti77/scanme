import { describe, expect, test } from "vitest";

// K31: the vocabulary of docs/menu/RECNIK.md as a check on the Menu dictionaries.
// The legacy-model dictionaries (menu-editor, menu-admin: "grupe" and "stavke" of the
// old menu) are left out on purpose; they go away with the migration.
const LEGACY = new Set(["menu-editor", "menu-admin"]);

const moduli = import.meta.glob("../i18n/sr/menu-*.ts", { eager: true }) as Record<string, Record<string, unknown>>;

function vrednosti(vrednost: unknown, putanja: string, izlaz: Array<[string, string]>) {
  if (typeof vrednost === "string") izlaz.push([putanja, vrednost]);
  else if (Array.isArray(vrednost)) vrednost.forEach((v, i) => vrednosti(v, `${putanja}[${i}]`, izlaz));
  else if (vrednost && typeof vrednost === "object") {
    for (const [k, v] of Object.entries(vrednost)) vrednosti(v, `${putanja}.${k}`, izlaz);
  }
}

const tekstovi: Array<[string, string]> = [];
for (const [putanja, modul] of Object.entries(moduli)) {
  const ime = putanja.replace(/^.*\//, "").replace(/\.ts$/, "");
  if (LEGACY.has(ime)) continue;
  for (const [izvoz, vrednost] of Object.entries(modul)) vrednosti(vrednost, `${ime}.${izvoz}`, tekstovi);
}

/** Forbidden variants (RECNIK.md §1, §2): the word the user must not see, and what to write instead. */
const ZABRANJENO: Array<[RegExp, string]> = [
  [/odredišt|destinacij/i, "„Stranice menija“ / „stranica“"],
  [/narud[zž]bin|narud[zž]b[ae]/i, "„Porudžbina“"],
  [/sobna usluga|posluživanj/i, "„Room service“ / „Posebne usluge“"],
  [/rasprodato|nema na stanju|out of stock/i, "„Privremeno nedostupno“"],
  [/publikuj|pošalji uživo/i, "„Objavi“"],
  [/izbriši|ukloni artikal/i, "„Obriši artikal“"],
  [/skica|\bdraft\b/i, "„Nacrt“"],
  [/\bpreview\b/i, "„Pregled“"],
  [/\b(publish|cancel|delete|save|loading|dashboard)\b/i, "srpska reč"],
  [/panel konobara/i, "„Konobarski panel“"],
  [/\btiket/i, "„Radni red“ / „zahtev“"],
  [/sklonio meni|skloni\b/i, "„Sakrij“"],
  // K34: the shared library exists only in the backend (master §5.2); the client never reads about it.
  [/bibliotek/i, "„postojeća ponuda“ / „artikli menija“"],
  [/\bnull\b|\bundefined\b|\bmutation\b|\bexception\b|\bfailed\b/i, "poruka bez programerskog jezika"],
];

describe("rečnik: zabranjene varijante u Menu rečnicima", () => {
  test("rečnici su učitani", () => {
    expect(tekstovi.length).toBeGreaterThan(1500);
  });

  test.each(ZABRANJENO)("nigde se ne piše %s", (obrazac, umesto) => {
    const nalazi = tekstovi.filter(([, tekst]) => obrazac.test(tekst)).map(([putanja, tekst]) => `${putanja}: ${tekst} → ${umesto}`);
    expect(nalazi).toEqual([]);
  });

  test("Kompletan meni ostaje samo u editoru i izlogu", () => {
    const nalazi = tekstovi
      .filter(([, tekst]) => /kompletan meni/i.test(tekst))
      .map(([putanja]) => putanja)
      .filter((putanja) => !/^menu-(domen|zajednicko|studio|panel)/.test(putanja));
    expect(nalazi).toEqual([]);
  });

  test("cena se piše sa RSD, nikad „din“", () => {
    const nalazi = tekstovi.filter(([, tekst]) => /\d\s?din\b|\bdin\./i.test(tekst)).map(([putanja]) => putanja);
    expect(nalazi).toEqual([]);
  });
});
