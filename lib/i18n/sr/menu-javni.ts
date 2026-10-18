import type { MenuJavniDict } from "../types";

// ScanMe Menu V1 — the public menu a guest reads (K13). Short, plain Serbian
// for a guest at the table; sentences address the guest with "Vi". Names of
// allergens, tags and "Privremeno nedostupno" stay in menu-domen (one wording
// for the editor and the guest). Placeholders are filled via fmt().
export const menuJavniSr = {
  meta: {
    naslov: "{lokal} · Meni",
    naslovStranice: "{stranica} · {lokal}",
    opis: "Meni i ponuda lokala {lokal}.",
  },
  razdelnik: {
    uvod: "Izaberite stranicu menija",
    meni: "Meni",
    stranice: "Stranice menija",
  },
  navigacija: {
    sekcije: "Sekcije menija",
    sadrzaj: "Sadržaj",
    otvoriSadrzaj: "Otvori sadržaj menija",
    sveStranice: "Sve stranice menija",
    stranice: "Stranice menija",
    sveKategorije: "Sve kategorije",
    kategorije: "Kategorije menija",
    sledeca: "Sledeća: {naziv}",
  },
  kategorije: {
    artikli: {
      one: "{n} artikal",
      few: "{n} artikla",
      many: "{n} artikala",
    },
  },
  artikal: {
    redovnaCena: "Redovna cena",
    akcijskaCena: "Akcijska cena",
    nedostupnoOpis: "Ovaj artikal trenutno nije dostupan.",
  },
  detalj: {
    zatvori: "Zatvori",
    varijante: "Veličine i cene",
    dodaci: "Dodaci",
    biraSeJedno: "bira se jedno",
    biraSeVise: "može više",
    obavezno: "obavezno",
    izborOdDo: "od {min} do {max}",
    izborDo: "do {max}",
    izborTacno: "tačno {n}",
    sastav: "U ponudi je",
    kolicinaKomada: "{n} ×",
    oznake: "Oznake",
    alergeni: "Alergeni",
    alergeniNepoznato: "Lokal nije uneo alergene za ovaj artikal.",
    alergeniNista: "Lokal nije naveo alergene za ovaj artikal.",
    drugo: "Drugo: {tekst}",
    akcijaDo: "Akcija važi do {datum}.",
  },
  stanja: {
    praznoNaslov: "Ova stranica menija je trenutno prazna",
    praznoOpis: "Lokal još nije dodao artikle na ovu stranicu.",
    praznoPitajte: "Pitajte osoblje za ponudu.",
    praznoMeniNaslov: "Meni je trenutno prazan",
    praznoMeniOpis: "Lokal još nije objavio nijednu stranicu menija.",
    nedostupnaNaslov: "Ova stranica menija nije dostupna",
    nedostupnaOpis: "Možda je uklonjena ili je link netačan. Ostatak menija je i dalje tu.",
    otvoriMeni: "Otvori meni",
    nijeDostupanNaslov: "Meni trenutno nije dostupan",
    nijeDostupanOpis: "Lokal je privremeno sklonio meni. Pitajte osoblje za ponudu.",
    sadrzajNaslov: "Sadržaj menija",
    novaVerzija: "Meni je osvežen.",
    prikaziNovu: "Prikaži novu verziju",
  },
  podnozje: {
    pokrece: "Meni pokreće ScanMe",
    kratko: "ScanMe",
  },
  izlog: {
    naslov: "Izlog: javni meni",
  },
} satisfies MenuJavniDict;
