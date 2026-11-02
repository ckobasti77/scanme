// ScanMe Menu V1 (K20) — Serbian text of "Lokal i QR" in the client panel
// (components/menu/lokal/**; master §9, §13.6). Surface `menu-lokal`.
// A position is a "mesto": "sto", "soba" or "ostalo". Plural groups carry one
// key per Serbian category (srPluralCategory: one / few / many).
import type { MenuLokalDict } from "../types";
import { menuLokalRasporedSr } from "./menu-lokal-raspored";

export const menuLokalSr = {
  raspored: menuLokalRasporedSr,

  // The route (components/menu/lokal/lokal-ruta.tsx): loading and the failed read.
  ruta: {
    ucitavanje: "Učitavaju se mesta i QR kartice…",
    greskaNaslov: "Lokal i QR trenutno ne može da se otvori",
    greskaOpis: "Osvežite stranicu. Ako se ponovi, proverite da li imate ulogu Vlasnika ili Menadžera.",
  },

  ekran: {
    naslov: "Lokal i QR",
    opis: "Stolovi, sobe i QR kartice. Gost skenira karticu i meni zna gde sedi.",
    otvoriJavniMeni: "Otvori javni meni",
    otvaraSeUNovomTabu: "(otvara se u novom tabu)",
    pogledi: {
      oznaka: "Prikaz",
      lista: "Lista",
      raspored: "Raspored",
      kartice: "Kartice",
    },
    sazetak: {
      razdelnik: " · ",
      nista: "Još nema mesta ni QR kartica.",
    },
  },

  // Counts with the unit. Seats are "sedišta" so they are never mistaken for "mesta" (positions).
  brojevi: {
    mesta: { one: "{n} mesto", few: "{n} mesta", many: "{n} mesta" },
    zone: { one: "{n} zona", few: "{n} zone", many: "{n} zona" },
    qrKartice: { one: "{n} QR kartica", few: "{n} QR kartice", many: "{n} QR kartica" },
    sedista: { one: "{n} sedište", few: "{n} sedišta", many: "{n} sedišta" },
  },

  vrste: {
    oznaka: "Vrsta mesta",
    table: "Sto",
    room: "Soba",
    other: "Ostalo",
    // Start of the name when several are added at once.
    prefiks: { table: "Sto", room: "Soba", other: "Mesto" },
    // A hint for the name field.
    primer: { table: "Na primer: Sto 12", room: "Na primer: Soba 204", other: "Na primer: Šank" },
  },

  zajednicko: {
    bezZone: "Bez zone",
    zona: "Zona",
    sedista: "Broj sedišta",
    nijeObavezno: "nije obavezno",
    sedistaPomoc: "Ostavite prazno ako broj sedišta nije važan.",
    otkazi: "Otkaži",
    cuvaSe: "Čuva se…",
    nazivPrazan: "Upišite naziv ili broj mesta.",
    nazivPredug: "Naziv može imati najviše {n} znakova.",
    sedistaNeispravno: "Broj sedišta mora biti ceo broj od 1 do {n}.",
    // Shown for a machine code the dictionary of the domain does not know (e.g. a lost connection).
    greskaOpsta: "Nešto nije uspelo. Proverite vezu i pokušajte ponovo.",
    greskaOznaka: "Greška:",
  },

  lista: {
    naslov: "Mesta",
    opis: "Mesta na kojima gost skenira karticu: stolovi, sobe i sve ostalo.",
    oznakaListe: "Mesta u lokalu",
    dodajMesta: "Dodaj mesta",
    zone: "Zone",
    podeliNaZone: "Podeli na zone",
    praznaZona: "U ovoj zoni još nema mesta.",
    uredi: "Uredi",
    urediOznaka: "Uredi {naziv}",
    kartice: {
      imaKartice: { one: "QR: {n} kartica", few: "QR: {n} kartice", many: "QR: {n} kartica" },
      nemaKartice: "Nema QR kartice",
      neRadi: "QR kartica ne radi",
    },
    prazno: {
      naslov: "Još nema mesta",
      opis: "Dodajte stolove ili sobe da bi svaka QR kartica znala gde gost sedi. Meni radi i bez njih: gost ga otvara i kada kartica nema mesto.",
      akcija: "Dodaj prvo mesto",
    },
  },

  dodaj: {
    naslov: "Dodaj mesta",
    opis: "Dodajte jedno mesto ili više njih odjednom, na primer Sto 1 do Sto 10.",
    vrsta: "Šta dodajete",
    nacin: "Koliko mesta",
    jedno: "Jedno mesto",
    vise: "Više odjednom",
    naziv: "Naziv ili broj",
    prefiks: "Početak naziva",
    prefiksPrazan: "Upišite početak naziva, na primer Sto.",
    od: "Počinje od broja",
    odNeispravno: "Upišite ceo broj od {min} do {max}.",
    koliko: "Koliko mesta",
    kolikoPomoc: "Najviše {n} mesta odjednom.",
    kolikoNeispravno: "Upišite broj mesta od 1 do {max}.",
    pregled: "Biće dodato:",
    pregledOpseg: "{od} – {do}",
    dugmeJedno: "Dodaj mesto",
    dugmeVise: {
      one: "Dodaj {n} mesto",
      few: "Dodaj {n} mesta",
      many: "Dodaj {n} mesta",
    },
    uspeh: {
      one: "Dodato je {n} mesto.",
      few: "Dodata su {n} mesta.",
      many: "Dodato je {n} mesta.",
    },
  },

  pozicija: {
    opis: "Promenite naziv, vrstu ili broj sedišta. Ovde su i QR kartice ovog mesta.",
    naziv: "Naziv ili broj",
    vrsta: "Vrsta",
    sacuvaj: "Sačuvaj",
    sacuvano: "Izmene su sačuvane.",
    kartice: {
      naslov: "QR kartice ovog mesta",
      prazno: "Ovo mesto još nema QR karticu.",
      napravi: "Napravi QR karticu za ovo mesto",
      napravljena: "QR kartica je napravljena.",
      kod: "Kod",
    },
    arhiviraj: {
      naslov: "Uklanjanje mesta",
      dugme: "Arhiviraj mesto",
      potvrda:
        "Mesto „{naziv}“ nestaje iz liste i rasporeda. Ako mesto ima aktivnu QR karticu, prvo je povežite sa drugim mestom ili isključite.",
      potvrdi: "Da, arhiviraj",
      odustani: "Ne, zadrži mesto",
      uspeh: "Mesto „{naziv}“ je arhivirano.",
    },
  },

  zone: {
    naslov: "Zone",
    opis: "Zone su opcione. Uključite ih samo ako je lokal zaista podeljen (npr. sala, terasa).",
    prazno: "Još nema zona. Dodajte prvu da biste mesta podelili po delovima lokala.",
    oznakaListe: "Zone lokala",
    novaOznaka: "Naziv nove zone",
    novaPrimer: "Na primer: Sala",
    dodaj: "Dodaj zonu",
    dodata: "Zona „{naziv}“ je dodata.",
    preimenuj: "Preimenuj zonu {naziv}",
    nazivZone: "Naziv zone",
    sacuvaj: "Sačuvaj",
    preimenovana: "Zona je preimenovana u „{naziv}“.",
    gore: "Pomeri zonu {naziv} gore",
    dole: "Pomeri zonu {naziv} dole",
    pomerena: "Zona „{naziv}“ je sada na mestu {mesto} od {ukupno}.",
    arhiviraj: "Arhiviraj zonu {naziv}",
    potvrda: "Mesta iz ove zone prelaze u „Bez zone“.",
    potvrdi: "Da, arhiviraj zonu",
    odustani: "Ne, zadrži zonu",
    arhivirana: "Zona „{naziv}“ je arhivirana. Njena mesta su sada u grupi „Bez zone“.",
    nazivPrazan: "Upišite naziv zone.",
    nazivPredug: "Naziv zone može imati najviše {n} znakova.",
    limit: "Dostignut je najveći broj zona ({n}).",
  },

  kartice: {
    naslov: "QR kartice",
    napomena: "Više kartica za različite stranice ne košta ništa dodatno.",
    oznakaListe: "QR kartice lokala",
    prazno: {
      naslov: "Još nema QR kartica",
      opis: "Napravite kartice za svoja mesta ili jednu karticu za stranicu menija, pa ih odštampajte.",
    },
    traka: {
      oznaka: "Radnje nad karticama",
      zaMesta: "Napravi kartice za mesta bez kartice",
      zaMestaBroj: "Napravi kartice za mesta bez kartice ({n})",
      novaZaStranicu: "Nova kartica za stranicu",
      stampajIzabrane: "Štampaj izabrane ({n})",
      stampajSve: "Štampaj sve",
      izabrano: "Za štampu je izabrano: {n} od {ukupno}.",
    },
    skraceno:
      "Ovde se vidi prvih {n} kartica. Ostale i dalje rade, ali se ne vide na ovom spisku, pa i spisak mesta bez kartice može biti nepotpun.",
    kod: "Kod kartice",
    zaStampu: "Za štampu",
    stanje: {
      aktivna: "Aktivna",
      iskljucena: "Isključena",
      drugoOdrediste: "Otvara nešto drugo",
    },
    drugoOdrediste: "Ova kartica trenutno ne otvara meni, pa se ovde ne može povezati.",
    otvara: {
      prefiks: "Otvara: {odrediste}",
      razdelnik: " · ",
      meni: "Meni",
      ulaz: "Ulaz u meni",
      bezMesta: "bez mesta",
    },
    sken: {
      poslednji: "Poslednji sken: {kada}",
      kadaFormat: "{datum} u {vreme}",
      nikad: "Još nije skenirana",
      ukupno: "Skenova ukupno: {n}",
    },
    problemi: {
      oznaka: "Upozorenje:",
      vezaIskljucena:
        "Veza kartice je isključena, pa gost vidi samo početak menija, bez stranice i mesta. Povežite karticu ponovo.",
      stranicaNedostupna:
        "Stranica koju kartica otvara je arhivirana ili ne postoji, pa gost vidi početak menija. Povežite karticu sa drugom stranicom.",
      pozicijaNedostupna:
        "Mesto koje kartica otvara više ne postoji, pa meni ne zna gde gost sedi. Povežite karticu sa drugim mestom.",
    },
    scanMe: "Ovom karticom upravlja ScanMe.",
    radnje: {
      poveziOznaka: "Poveži",
      poveziAria: "Poveži karticu {naziv}",
      iskljuci: "Isključi",
      iskljuciAria: "Isključi karticu {naziv}",
      ukljuci: "Uključi",
      ukljuciAria: "Uključi karticu {naziv}",
      preuzmi: "Preuzmi SVG",
      preuzmiAria: "Preuzmi SVG za karticu {naziv}",
    },
    iskljuciPotvrda: "Gost koji skenira isključenu karticu vidi poruku da kartica nije aktivna.",
    iskljuciDa: "Da, isključi",
    iskljuciNe: "Ne, ostavi uključenu",
    iskljucena: "Kartica „{naziv}“ je isključena.",
    ukljucena: "Kartica „{naziv}“ je uključena.",
    povezana: "Kartica „{naziv}“ je povezana.",
    preuzeta: "SVG kartice „{naziv}“ je preuzet.",
    povezi: {
      naslov: "Poveži karticu „{naziv}“",
      opis: "Izaberite šta gost vidi kad skenira ovu karticu.",
      stranica: "Stranica menija",
      mesto: "Mesto",
      ulaz: "Ulaz u meni",
      bezMesta: "Bez mesta",
      sacuvaj: "Sačuvaj",
    },
    zaMesta: {
      naslov: "Kartice za mesta bez kartice",
      opis: "Napravićemo po jednu karticu za svako mesto koje je nema.",
      stranica: "Šta kartice otvaraju",
      broj: {
        one: "Biće napravljena {n} kartica.",
        few: "Biće napravljene {n} kartice.",
        many: "Biće napravljeno {n} kartica.",
      },
      serija:
        "Odjednom se pravi najviše {max} kartica. Posle ovih ponovo izaberite istu radnju za preostala mesta ({ostalo}).",
      napravi: "Napravi kartice",
      uspeh: {
        one: "Napravljena je {n} kartica.",
        few: "Napravljene su {n} kartice.",
        many: "Napravljeno je {n} kartica.",
      },
    },
    zaStranicu: {
      naslov: "Nova kartica za stranicu",
      opis: "Na primer kartica za vinsku kartu koja stoji na šanku i nema svoje mesto.",
      stranica: "Stranica koju kartica otvara",
      broj: "Koliko kartica",
      brojPomoc: "Od 1 do {max}.",
      brojNeispravno: "Upišite broj kartica od 1 do {max}.",
      napravi: "Napravi",
      uspeh: {
        one: "Napravljena je {n} kartica.",
        few: "Napravljene su {n} kartice.",
        many: "Napravljeno je {n} kartica.",
      },
    },
  },

  stampa: {
    naslov: "Štampa QR kartica",
    opis: "Svaka kartica ima QR kod, naziv i mali kod za snalaženje. Kartice se ne dele na dve strane.",
    savet: "Za tačnu veličinu QR koda ostavite razmeru štampe na 100 %.",
    stampaj: "Štampaj",
    zatvori: "Zatvori",
    broj: "Kartica za štampu: {n}",
    prazno: "Nema kartica za štampu. Izaberite kartice u prikazu „Kartice“.",
    oznakaListe: "Kartice za štampu",
  },

  qr: {
    oznaka: "QR kod za karticu {naziv}",
  },
} satisfies MenuLokalDict;
