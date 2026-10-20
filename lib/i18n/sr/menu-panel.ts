import type { MenuPanelDict } from "../types";

// ScanMe Menu V1 — the client panel shell and its sections (K08). Sentences
// address the client with "Vi" like the rest of Menu; buttons are short verbs.
// A section whose screen is not built yet says honestly what will be there,
// never a number (master §20: mockup numbers are not data). The mode line
// itself ("ScanMe Menu · Ugostiteljstvo") comes from menu-domen.serviceLabel.
export const menuPanelSr = {
  meta: {
    naslov: "{sekcija} · ScanMe Menu",
    naslovPanela: "ScanMe Menu",
  },
  sekcije: {
    pocetna: "Početna",
    editor: "Editor",
    operativa: "Operativa",
    lokal: "Lokal i QR",
    funkcionalnosti: "Funkcionalnosti",
    tim: "Tim i pristupi",
    analitika: "Analitika",
    podesavanja: "Podešavanja",
  },
  shell: {
    preskoci: "Pređi na sadržaj",
    navigacija: "Sekcije ScanMe Menu",
    otvoriNavigaciju: "Sekcije",
    skupiNavigaciju: "Skupi navigaciju",
    prosiriNavigaciju: "Proširi navigaciju",
    uloga: "Vaša uloga: {uloga}",
    ostaleSekcije: "Ostale sekcije vide vlasnik i menadžer.",
    nazadNaKlijentskiPanel: "Nazad na klijentski panel",
    premium: "Premium nalog",
  },
  sekcija: {
    opisi: {
      pocetna: "Pregled lokala i menija na jednom mestu.",
      editor: "Ponuda, izgled i objava menija.",
      operativa: "Šta se trenutno dešava u lokalu i ko od osoblja radi na kom zahtevu.",
      lokal: "Stolovi, sobe, zone i QR kartice lokala.",
      funkcionalnosti: "Šta gost može da uradi sa menija.",
      tim: "Ko radi u ScanMe Menu i šta sme.",
      analitika: "Kako gosti koriste meni.",
      podesavanja: "Radno vreme, jezici i ostala podešavanja celog lokala.",
    },
    uPripremi: "U pripremi",
    praznoNaslov: "Šta ćete ovde raditi",
    praznoOpis: {
      pocetna:
        "Ovde ćete na prvi pogled videti da li nešto traži pažnju, šta se dešava u lokalu i da li gosti vide poslednju verziju menija.",
      operativa:
        "Ovde ćete pratiti rad lokala. Zahteve gostiju i dalje preuzima i završava osoblje u konobarskom panelu.",
      lokal:
        "Ovde ćete urediti stolove i sobe, rasporediti ih u sali i povezati svaku QR karticu sa njenim mestom.",
      funkcionalnosti:
        "Ovde ćete birati šta gost može da uradi sa menija. Svaka radnja je opciona i uključujete je samo ako vam treba.",
      tim: "Ovde ćete pozvati članove tima, dodeliti im uloge i postaviti PIN za osoblje koje radi u konobarskom panelu.",
      analitika:
        "Ovde ćete videti kako gosti koriste meni. Prikazuju se samo stvarni podaci, a uz svaku brojku piše šta se tačno broji.",
      podesavanja: "Ovde ćete podesiti ono što važi za ceo lokal, a ne samo za izgled menija.",
    },
    staDolazi: "Šta će biti ovde",
    stavke: {
      pocetna: [
        { tekst: "Šta traži vašu pažnju" },
        { tekst: "Zahtevi gostiju i rezervacije koji trenutno čekaju", dozvola: "operations.read" },
        { tekst: "Kako su gosti koristili meni u poslednjih 7 dana", dozvola: "analytics.read" },
        { tekst: "Da li u meniju ima izmena koje gosti još ne vide" },
        { tekst: "Prečice do delova panela koje najčešće koristite" },
      ],
      operativa: [
        { tekst: "Aktivni zahtevi gostiju i ko ih je preuzeo" },
        { tekst: "Aktivne rezervacije" },
        { tekst: "Zahtevi koji predugo čekaju" },
        { tekst: "Filteri po vrsti zahteva, konobaru i zoni" },
        { tekst: "Kratak podsetnik konobaru koji je zadužen za zahtev" },
      ],
      lokal: [
        { tekst: "Stolovi i sobe sa nazivom ili brojem" },
        { tekst: "Raspored sale, kao crtež ili tabela" },
        { tekst: "Broj mesta za sto, ako želite" },
        { tekst: "Zone, samo ako ih lokal koristi" },
        { tekst: "QR kartice: koja pripada kom stolu ili sobi i da li radi" },
      ],
      funkcionalnosti: [
        { tekst: "Poziv konobara" },
        { tekst: "Zahtev za račun" },
        { tekst: "Porudžbina kao zahtev konobaru" },
        { tekst: "Rezervacije preko ScanMe forme ili vašeg sistema rezervacija" },
        { tekst: "Room service", premium: true },
      ],
      tim: [
        { tekst: "Članovi tima i njihove uloge: Vlasnik, Menadžer i Urednik" },
        { tekst: "Osoblje sa trocifrenim PIN-om za konobarski panel" },
        { tekst: "Ko ima pristup i od kada" },
        { tekst: "Zone osoblja, samo ako ih lokal koristi" },
      ],
      analitika: [
        { tekst: "Koliko puta je meni otvoren i koji se artikli najviše gledaju" },
        { tekst: "Zahtevi gostiju po vrsti i šta je s njima bilo" },
        { tekst: "Rezervacije i porudžbine i šta je s njima bilo" },
        { tekst: "Skeniranja po QR kartici" },
        { tekst: "Kretanje za poslednjih 7 i 30 dana" },
        { tekst: "Duži periodi po vašem izboru, poređenje i filteri", premium: true },
        { tekst: "Izvoz u tabelu (CSV)", premium: true },
      ],
      podesavanja: [
        { tekst: "Radno vreme lokala" },
        { tekst: "Jezici menija: srpski i još jedan" },
        { tekst: "Više od dva jezika menija", premium: true },
        { tekst: "Poslovni email za odgovore gostima" },
        { tekst: "Podešavanja brenda i naloga koja ne pripadaju izgledu menija" },
      ],
    },
    premiumOznaka: "Premium",
    premiumUkljucen: "uključeno u vaš Premium nalog",
    premiumZakljucan: "dostupno uz Premium nalog",
    premiumNapomena: "Stavke sa oznakom Premium dolaze uz Premium nalog. Za više informacija pišite nam iz klijentskog panela.",
    napomenaMenadzer: {
      tim: "Ulogu Vlasnik može da dodeli samo vlasnik.",
      podesavanja: "Naplatu i vlasništvo naloga vodi vlasnik.",
    },
    otvoriEditor: "Otvori Editor",
    zaSadaEditor: "Meni već sada uređujete u Editoru, koji se otvara na posebnom ekranu.",
  },
  stanja: {
    ucitavanje: "Učitava se ScanMe Menu…",
    prijavaNaslov: "Prijavite se",
    prijavaOpis: "Prijavite se nalogom lokala da biste otvorili ScanMe Menu.",
    prijavaDugme: "Prijavi se",
    bezPristupaNaslov: "Ovaj nalog ne otvara ScanMe Menu",
    bezPristupaOpis: "ScanMe Menu panel je za vlasnika, menadžera i urednika lokala.",
    nazadNaKlijentskiPanel: "Nazad na klijentski panel",
    vlasnikNaslov: "Upravljate ovim lokalom?",
    vlasnikOpis:
      "Proverite da li ste prijavljeni nalogom kojim upravljate lokalom. Ako se ScanMe Menu ni tada ne otvara, možda još nije uključen: javite nam se iz klijentskog panela.",
    osobljeNaslov: "Radite u smeni?",
    osobljeOpis:
      "Osoblje ne koristi klijentski panel. Zahteve gostiju preuzimate u konobarskom panelu, svojim trocifrenim PIN-om.",
    osobljeDugme: "Kako da uđem u konobarski panel",
    neaktivnoNaslov: "ScanMe Menu trenutno nije aktivan",
    neaktivnoOpis:
      "ScanMe Menu je za ovaj lokal trenutno isključen. Ako to ne očekujete, javite nam se iz klijentskog panela.",
    zabranjenoNaslov: "Ovu sekciju vide vlasnik i menadžer lokala",
    zabranjenoOpis:
      "Vaša uloga je {uloga}: uređujete i objavljujete meni. Ako vam treba ova sekcija, zamolite vlasnika ili menadžera.",
    idiNaPocetnu: "Nazad na Početnu",
    greskaNaslov: "Ova sekcija nije učitana",
  },
  ulaz: {
    naziv: "ScanMe Menu",
    opis: "Uređujte meni, QR kartice i tim i pratite kako gosti koriste meni.",
    dugme: "Otvori ScanMe Menu",
  },
  konobar: {
    naslov: "Kako se ulazi u konobarski panel",
    opis: "Konobarski panel otvarate linkom ili QR kodom koji ste dobili od vlasnika ili menadžera lokala.",
    koraci: [
      "Otvorite taj link ili skenirajte QR kod.",
      "Unesite svoj trocifreni PIN.",
      "Uređaj pamti prijavu do 12 sati ili dok se ne odjavite.",
    ],
    bezLinka: "Nemate link ili QR kod? Zamolite vlasnika ili menadžera lokala da vam ih pošalje.",
    vlasnik: "Vlasnik ste ili menadžer? Idite na klijentski panel.",
  },
} as const satisfies MenuPanelDict;
