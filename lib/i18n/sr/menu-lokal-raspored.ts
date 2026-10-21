// ScanMe Menu V1 (K20) — Serbian text of the floor layout editor of "Lokal i QR"
// (components/menu/lokal/raspored/**). Part of the `menu-lokal` surface
// (lib/i18n/sr/menu-lokal.ts → `raspored`). Placeholders are filled via fmt().
import type { MenuLokalRasporedDict } from "../types";

export const menuLokalRasporedSr = {
  /** Accessible name of the whole layout when the venue has no zones. */
  oblast: "Raspored mesta",
  /** No position exists yet: nothing to arrange. */
  prazno: {
    naslov: "Još nema mesta za raspored",
    opis: "Prvo dodajte mesta u Listi.",
  },
  bezZone: "Bez zone",
  /** {n} positions; srPluralCategory "one" takes `mesto`, the rest `mesta`. */
  mesto: "{n} mesto",
  mesta: "{n} mesta",
  /** {n} seats; "one" takes `sediste`, the rest `sedista`. */
  sediste: "{n} sedište",
  sedista: "{n} sedišta",
  /** A zone without positions. */
  praznaZona: "U ovoj zoni još nema mesta. Zonu mesta menjate kad otvorite mesto.",
  /** Accessible name of one grid. {zona}. */
  grupa: "Raspored zone „{zona}“",
  /** Help line above all surfaces. */
  pomoc: {
    tastatura:
      "Tab dolazi do rasporeda, a strelice prelaze s mesta na mesto. Enter ili Space bira mesto. Kad je mesto izabrano, strelice ga pomeraju, Shift + strelice menjaju veličinu (desno i dole povećavaju, levo i gore smanjuju), O menja oblik, U otvara mesto, a Esc poništava izbor.",
    pokazivac:
      "Mesto možete i prevući: mišem ili, na telefonu, zadržanim prstom. Prevlačenje ide polje po polje i ostaje u istoj zoni.",
  },
  legenda: {
    naslov: "Oznake",
    sto: "Sto: pun okvir",
    soba: "Soba: ikonica kreveta",
    ostalo: "Ostalo, na primer šank: isprekidan okvir",
    oblik: "Oblik: pravougaonik ili krug (taster O)",
    izabrano: "Izabrano: tamna ivica i kvačica",
  },
  /** Kind of a position inside its accessible name. */
  vrsta: {
    table: "sto",
    room: "soba",
    other: "ostalo",
  },
  oblik: {
    rect: "pravougaonik",
    round: "krug",
  },
  /** {kolona}, {red}: 1-based for people. */
  polozaj: "kolona {kolona}, red {red}",
  /** {sirina}, {visina} in grid cells. */
  velicina: "{sirina} × {visina} polja",
  /** Strip of the selected position. */
  izabrano: {
    naslov: "Izabrano mesto",
    uredi: "Uredi mesto",
    uKrug: "Napravi krug",
    uPravougaonik: "Napravi pravougaonik",
    ponisti: "Poništi izbor",
  },
  automatski: {
    dugme: "Rasporedi automatski",
    pitanjeZona: "Rasporediti sva mesta u ovoj zoni automatski? Sadašnji raspored ove zone biće zamenjen.",
    pitanjeSve: "Rasporediti sva mesta automatski? Sadašnji raspored biće zamenjen.",
    potvrdi: "Rasporedi",
    odustani: "Odustani",
    gotovo: "Mesta su raspoređena automatski.",
  },
  /** The list alternative to small grid targets. {n}. */
  lista: {
    zona: "Mesta u ovoj zoni ({n})",
    sva: "Sva mesta ({n})",
    opis: "Ista mesta kao u rasporedu, kao veća dugmad. Izbor prenosi fokus na mesto u rasporedu.",
  },
  /** Live announcements. {naziv}, {kolona}, {red}, {sirina}, {visina}, {oblik}. */
  najava: {
    izabrano: "Izabrano mesto: {naziv}. Strelice ga pomeraju.",
    ponisteno: "Izbor je poništen.",
    pomereno: "{naziv}: kolona {kolona}, red {red}",
    velicina: "{naziv}: {sirina} × {visina} polja",
    oblik: "{naziv}: oblik je {oblik}",
    nemozeDalje: "Ne može dalje.",
    nemozeVelicina: "Veličina se ne može dalje menjati.",
    cuvaSe: "Čuva se…",
  },
  /** A drop on a taken spot or outside the layout. */
  zauzeto: "Mesto je zauzeto ili van rasporeda.",
  /** A save failed and the position went back. {naziv}, {razlog}. */
  nijeSacuvano: "Promena za „{naziv}“ nije sačuvana, mesto je vraćeno. {razlog}",
  greskaOpste: "Došlo je do greške. Pokušajte ponovo.",
  zatvori: "Zatvori poruku",
  /** Spoken by the drag library. {naziv}. */
  prevlacenje: {
    uputstvo: "Prevucite mesto mišem ili zadržanim prstom. Tastaturom izaberite mesto pa koristite strelice.",
    podignuto: "Podignuto mesto: {naziv}.",
    otkazano: "Prevlačenje je otkazano.",
  },
} satisfies MenuLokalRasporedDict;
