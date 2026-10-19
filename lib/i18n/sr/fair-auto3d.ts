// Tekst stranice /sajam/3d i 3D Rendgen pregledača (P10, A03 §4.4).
//
// Samostalan modul po obrascu landing-packages.ts: interfejs + `as const satisfies`, bez izmene
// zajedničkog registra. Imena delova i sistema su u fair-auto3d-delovi.ts. A04 donosi ključeve
// scene i učitavanja; A05 (raspored, grupe, lista, kartica), A10 (tura, kiosk, režimi) i A11 (paket)
// dodaju svoje. Sekcija paketa (A11) obraća se izlagaču sa „Vi“; ostatak stranice posetiocu sa „ti“.
// Stavke prva tri nivoa su iz CLAUDE-MAPA-BACKEND-KONTEKST-V2.md §3 i BACKEND-HANDOFF.md §4.1, a
// stavke nivoa 3D Rendgen iz PLAN P4; kontakt je isti kao u components/offer-footer.tsx (P11).

export interface FairAuto3dTierCopy {
  name: string;
  price: string;
  unit: string;
  /** Red iznad stavki: šta nivo nasleđuje. `null` za najniži nivo. */
  inherits: string | null;
  items: readonly string[];
}

export interface FairAuto3dStepCopy {
  title: string;
  text: string;
  link: string;
}

export interface FairAuto3dPackagesCopy {
  sectionLabel: string;
  title: string;
  lead: string;
  tiersLabel: string;
  tiers: {
    included: FairAuto3dTierCopy;
    starter: FairAuto3dTierCopy;
    napredni: FairAuto3dTierCopy;
    rendgen: FairAuto3dTierCopy;
  };
  rendgenBadge: string;
  rendgenNote: string;
  standTitle: string;
  stepsLabel: string;
  stepNumber: string;
  steps: readonly [FairAuto3dStepCopy, FairAuto3dStepCopy, FairAuto3dStepCopy];
  contactTitle: string;
  contactText: string;
  contactPhoneLabel: string;
  contactPhone: string;
  contactPhoneHref: string;
  contactPerson: string;
  contactEmailLabel: string;
  contactEmail: string;
  contactEmailHref: string;
  contactCall: string;
  contactCallAria: string;
  contactWrite: string;
  contactWriteAria: string;
}

export interface FairAuto3dDict {
  metaTitle: string;
  metaDescription: string;
  lockupTitle: string;
  lockupEvent: string;
  lockupLabel: string;
  title: string;
  lead: string;
  posterAlt: string;
  sceneRole: string;
  sceneLabel: string;
  sceneHint: string;
  loading: string;
  loadButton: string;
  errorLoad: string;
  retry: string;
  noWebgl: string;
  contextLost: string;
  explodeLabel: string;
  explodeOpen: string;
  explodeClose: string;
  selectedClose: string;
  instancesTwo: string;
  announceSelected: string;
  announceReady: string;
  announceNoWebgl: string;
  // A05: raspored, grupe, lista, kartica, telefon
  metaTitlePart: string;
  metaSiteName: string;
  summary: string;
  skipToParts: string;
  groupsTitle: string;
  groupsAll: string;
  groupsLabel: string;
  partsCountOne: string;
  partsCountFew: string;
  partsCountMany: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchClear: string;
  searchEmpty: string;
  listLabel: string;
  groupActive: string;
  groupShowAll: string;
  tabsLabel: string;
  tabGroups: string;
  tabParts: string;
  tabPart: string;
  panelClose: string;
  allParts: string;
  partEmptyTitle: string;
  partEmpty: string;
  partEmptyAction: string;
  instancesTwoLong: string;
  cardSpecs: string;
  cardSpecLabel: string;
  cardSpecValue: string;
  cardFact: string;
  exampleNote: string;
  cardPrev: string;
  cardNext: string;
  cardPrevAria: string;
  cardNextAria: string;
  cardPosition: string;
  cardNav: string;
  copyLink: string;
  linkCopied: string;
  copyFieldLabel: string;
  modeLabel: string;
  modeRendgen: string;
  modeLak: string;
  modeKostur: string;
  homeView: string;
  announceSelectedTwo: string;
  announceGroup: string;
  announceGroupAll: string;
  announceMode: string;
  announceSearch: string;
  announceError: string;
  // A10: tura, kiosk, presek, boje laka
  tourStart: string;
  tourDuration: string;
  tourLabel: string;
  tourPause: string;
  tourResume: string;
  tourNext: string;
  tourExit: string;
  tourPosition: string;
  tourIntroTitle: string;
  tourIntroText: string;
  tourOutroTitle: string;
  tourOutroText: string;
  announceTourStart: string;
  announceTourEnd: string;
  announceTourPaused: string;
  kioskEvent: string;
  kioskQrTitle: string;
  kioskQrText: string;
  kioskQrLabel: string;
  kioskTouchHint: string;
  kioskLegend: string;
  sectionLabel: string;
  sectionToggle: string;
  sectionOff: string;
  sectionDepth: string;
  announceSectionOn: string;
  announceSectionOff: string;
  paintLabel: string;
  paintGrafit: string;
  paintPlava: string;
  paintCrvena: string;
  paintZelena: string;
  paintSrebro: string;
  paintBela: string;
  announcePaint: string;
  // A11: paket „3D Rendgen“ za izlagače
  packages: FairAuto3dPackagesCopy;
}

export const fairAuto3dSr = {
  metaTitle: "3D Rendgen · Auto Moto Fest 2026 · ScanMe",
  metaDescription:
    "Paket za izlagače Auto Moto Festa 2026: Vaš model u 3D rendgenu, svaki deo se klikne i ima svoju specifikaciju. 8.000 RSD po modelu.",
  lockupTitle: "3D Rendgen",
  lockupEvent: "Auto Moto Fest",
  lockupLabel: "3D Rendgen, Auto Moto Fest",
  title: "Limuzina iznutra",
  lead: "Okreni auto, klikni deo i rasklopi ga po sistemima.",
  posterAlt: "Limuzina bez marke u rendgenu: prozirna karoserija, a motor, menjač, vešanje i kočnice u bojama svojih sistema.",
  sceneRole: "3D prikaz",
  sceneLabel: "Limuzina u rendgenu",
  sceneHint: "Strelice okreću auto, plus i minus zumiraju, Home vraća početni pogled. Točkić miša zumira posle klika na scenu.",
  loading: "Učitavam 3D model",
  loadButton: "Učitaj 3D ({size})",
  errorLoad: "3D model nije učitan. Lista delova i kartice rade i bez njega.",
  retry: "Pokušaj ponovo",
  noWebgl: "Ovaj uređaj ne prikazuje 3D. Svi delovi su u listi, sa karticama.",
  contextLost: "Grafika je zastala. Vraćam prikaz.",
  explodeLabel: "Rasklapanje",
  explodeOpen: "Rasklopi",
  explodeClose: "Sklopi",
  selectedClose: "Zatvori deo {name}",
  instancesTwo: "×2",
  announceSelected: "Izabran deo: {name}, {system}.",
  announceReady: "3D model je spreman.",
  announceNoWebgl: "3D prikaz nije dostupan na ovom uređaju. Svi delovi su u listi.",
  metaTitlePart: "{name} · 3D Rendgen · Auto Moto Fest 2026",
  metaSiteName: "ScanMe",
  summary: "{parts} delova u {groups} grupa",
  skipToParts: "Preskoči na listu delova",
  groupsTitle: "Grupe",
  groupsAll: "Sve grupe",
  groupsLabel: "Grupe delova",
  partsCountOne: "{count} deo",
  partsCountFew: "{count} dela",
  partsCountMany: "{count} delova",
  searchLabel: "Pretraži delove",
  searchPlaceholder: "Npr. turbo, kočnica, felna",
  searchClear: "Obriši pretragu",
  searchEmpty: "Nema dela za „{query}“.",
  listLabel: "Delovi limuzine",
  groupActive: "Grupa {name}",
  groupShowAll: "Prikaži sve",
  tabsLabel: "Grupe, delovi i izabrani deo",
  tabGroups: "Grupe",
  tabParts: "Delovi",
  tabPart: "Deo",
  panelClose: "Zatvori panel",
  allParts: "Svi delovi",
  partEmptyTitle: "Nijedan deo nije izabran",
  partEmpty: "Klikni deo na autu ili ga izaberi u listi. Kartica pokazuje opis, specifikacije i zanimljivost.",
  partEmptyAction: "Otvori listu delova",
  instancesTwoLong: "dva komada",
  cardSpecs: "Specifikacije",
  cardSpecLabel: "Podatak",
  cardSpecValue: "Vrednost",
  cardFact: "Zanimljivost",
  exampleNote: "Primer vrednosti. Za vaš model unosimo prave podatke.",
  cardPrev: "Prethodni",
  cardNext: "Sledeći",
  cardPrevAria: "Prethodni deo u grupi: {name}",
  cardNextAria: "Sledeći deo u grupi: {name}",
  cardPosition: "{index} od {total}",
  cardNav: "Delovi iste grupe",
  copyLink: "Kopiraj link",
  linkCopied: "Link na deo je kopiran.",
  copyFieldLabel: "Link na deo, izaberi i kopiraj",
  modeLabel: "Prikaz",
  modeRendgen: "Rendgen",
  modeLak: "Lak",
  modeKostur: "Kostur",
  homeView: "Početni pogled",
  announceSelectedTwo: "Izabran deo: {name}, {system}, dva komada.",
  announceGroup: "Grupa {name}: {count}. Ostali delovi su prigušeni.",
  announceGroupAll: "Prikazane su sve grupe.",
  announceMode: "Prikaz: {mode}.",
  announceSearch: "Pretraga: {count}.",
  announceError: "3D model nije učitan. Lista delova i kartice rade.",
  tourStart: "Vođena tura",
  tourDuration: "1 min",
  tourLabel: "Vođena tura kroz sisteme",
  tourPause: "Pauziraj turu",
  tourResume: "Nastavi turu",
  tourNext: "Sledeći sistem",
  tourExit: "Izađi iz ture",
  tourPosition: "{index} / {total}",
  tourIntroTitle: "Limuzina u rendgenu",
  tourIntroText: "Karoserija je prozirna, a ispod nje je {parts} delova u {groups} sistema. Idemo redom, sistem po sistem.",
  tourOutroTitle: "Sve rasklopljeno",
  tourOutroText: "Ceo auto, rasklopljen po sistemima i fazama. Svaki deo ima svoju karticu sa specifikacijama.",
  announceTourStart: "Tura je počela.",
  announceTourEnd: "Tura je završena.",
  announceTourPaused: "Tura je pauzirana.",
  kioskEvent: "Auto Moto Fest 2026",
  kioskQrTitle: "Nastavi na telefonu",
  kioskQrText: "Skeniraj kod i istraži auto na svom telefonu.",
  kioskQrLabel: "QR kod: otvara 3D Rendgen na telefonu",
  kioskTouchHint: "Dodirni ekran i istraži auto sam",
  kioskLegend: "Sistemi i njihove boje",
  sectionLabel: "Presek",
  sectionToggle: "Presek po dužini",
  sectionOff: "Isključi presek",
  sectionDepth: "Dubina preseka",
  announceSectionOn: "Presek je uključen. Klizač pomera ravan preseka.",
  announceSectionOff: "Presek je isključen.",
  paintLabel: "Boja laka",
  paintGrafit: "Duboki grafit",
  paintPlava: "Ponoćnoplava",
  paintCrvena: "Tamna višnja",
  paintZelena: "Tamnozelena",
  paintSrebro: "Ledeno srebro",
  paintBela: "Bisernobela",
  announcePaint: "Boja laka: {name}.",
  packages: {
    sectionLabel: "Paketi za izlagače",
    title: "Paketi za izlagače, AMF 2026",
    lead: "Cena je po izloženom modelu. Auto Moto Fest, Hala Čair, 30. 10 – 1. 11. 2026.",
    tiersLabel: "Nivoi paketa",
    tiers: {
      included: {
        name: "Za sve izlagače",
        price: "Uključeno",
        unit: "bez doplate",
        inherits: null,
        items: [
          "QR nalepnica za svaki izloženi automobil",
          "Stranica modela: naziv, cena i uređene specifikacije, fotografija je opciona",
          "Lokalno čuvanje i poređenje najviše dva modela u garaži",
          "Zbir ukupnih i jedinstvenih skeniranja štanda",
        ],
      },
      starter: {
        name: "Starter",
        price: "3.000 RSD",
        unit: "po modelu",
        inherits: "Sve iz nivoa Za sve izlagače, plus:",
        items: [
          "Jedna ukupna ocena od 1 do 5",
          "Dugme „Zainteresovan sam“",
          "Jedno pitanje Glasa publike po sajamskom danu",
          "Dnevni presek",
          "Analitika po modelu",
          "Učešće u pasošu brenda kada ceo brend ispunjava uslov",
          "Mogućnost nadogradnje tokom sajma",
        ],
      },
      napredni: {
        name: "Napredni",
        price: "5.000 RSD",
        unit: "po modelu",
        inherits: "Sve poslovne pogodnosti Startera, plus:",
        items: [
          "Prijava za probnu vožnju bez izbora termina",
          "Tri opcione ocene: izgled, specifikacije i cena. Zamenjuju ukupnu ocenu iz Startera",
          "Do pet pitanja Glasa publike po sajamskom danu",
          "Odvojena anketa do pet kratkih pitanja",
          "Proširena analitika",
          "Jedan follow-up email 24–48 sati posle relevantnog sajma",
          "Ravnopravna sponzorisana rotacija na mapi i displejima",
          "Ravnopravna sponzorisana rotacija u Garaži",
        ],
      },
      rendgen: {
        name: "3D Rendgen",
        price: "8.000 RSD",
        unit: "po modelu",
        inherits: "Sve iz nivoa Napredni, plus:",
        items: [
          "3D rendgen stranica Vašeg modela. QR na autu je otvara na telefonu posetioca",
          "Kiosk režim za ekran na štandu",
          "Direktni linkovi na delove, pa QR na pravom delu vodi baš na taj deo",
          "Model prilagođen Vašem autu: klasa karoserije, boja, točkovi, pogon i Vaše specifikacije",
        ],
      },
    },
    rendgenBadge: "Najviši nivo",
    rendgenNote: "Tačna replika po meri je posebna, dogovorena usluga.",
    standTitle: "Kako izgleda na štandu",
    stepsLabel: "Tri koraka na štandu",
    stepNumber: "Korak {index}",
    steps: [
      {
        title: "QR na autu",
        text: "Posetilac skenira QR nalepnicu na Vašem autu. Na telefonu mu se otvara 3D Rendgen modela.",
        link: "Pokrenite turu od jednog minuta",
      },
      {
        title: "Kiosk na ekranu",
        text: "Ekran na štandu sam vrti auto i prolazi kroz sisteme. Kad ga neko dodirne, auto prelazi u njegove ruke, a posle 45 s bez dodira se vraća na početak.",
        link: "Otvorite kiosk prikaz",
      },
      {
        title: "QR na pravom delu",
        text: "QR nalepnica na samom delu, na primer na motoru, vodi pravo na taj deo u 3D-u.",
        link: "Primer: {name}",
      },
    ],
    contactTitle: "Javite nam se",
    contactText: "Pozovite ili pišite. Dogovaramo model Vašeg auta i šta Vam treba na štandu.",
    contactPhoneLabel: "Telefon",
    contactPhone: "065/86-444-88",
    contactPhoneHref: "tel:+381658644488",
    contactPerson: "Aleksa Đorđević",
    contactEmailLabel: "Email",
    contactEmail: "office@scanme.rs",
    contactEmailHref: "mailto:office@scanme.rs",
    contactCall: "Pozovite",
    contactCallAria: "Pozovite {phone}",
    contactWrite: "Napišite",
    contactWriteAria: "Napišite na {email}",
  },
} as const satisfies FairAuto3dDict;
