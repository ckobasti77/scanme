import type { ProductId } from "@/lib/scanme-pricing";

export interface PrelaunchDict {
  skip: string;
  nav: {
    aria: string;
    homeAria: string;
    menu: string;
    story: string;
    services: string;
    products: string;
    fair: string;
    partners: string;
    contact: string;
    cta: string;
  };
  hero: {
    partner: string;
    fairName: string;
    primaryCta: string;
    secondaryCta: string;
  };
  fair: {
    eyebrow: string;
    title: string;
    body: string;
    organizerLink: string;
    location: string;
    year: string;
    bannerTitle: string;
    partnerBrand: string;
    cta: string;
    status: {
      live: string;
      /** {date} = prvi dan sledećeg sajma. */
      next: string;
      ended: string;
    };
    events: Array<{ name: string; date: string; shortDate: string; startLabel: string }>;
  };
  services: {
    eyebrow: string;
    title: string;
    body: string;
    available: string;
    soon: string;
    cta: string;
    soonNote: string;
    items: Array<{ name: string; body: string; status: "available" | "soon" }>;
  };
  story: {
    title: string;
  };
  products: {
    eyebrow: string;
    title: string;
    body: string;
    selectorAria: string;
    previewLabel: string;
    selectedLabel: string;
    useCase: string;
    noPrice: string;
    cta: string;
    names: Record<ProductId, string>;
    descriptions: Record<ProductId, string>;
  };
  lead: {
    eyebrow: string;
    title: string;
    body: string;
    benefitTitle: string;
    benefits: string[];
    formAria: string;
    name: string;
    business: string;
    businessType: string;
    businessTypePlaceholder: string;
    businessTypes: string[];
    city: string;
    contactLegend: string;
    contactHint: string;
    phone: string;
    email: string;
    interestLegend: string;
    interests: string[];
    message: string;
    messagePlaceholder: string;
    website: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successBody: string;
    genericError: string;
    connectionError: string;
    validation: {
      name: string;
      business: string;
      businessType: string;
      contactPhone: string;
      contactEmail: string;
      email: string;
      phone: string;
      interest: string;
    };
  };
  contact: {
    eyebrow: string;
    title: string;
    body: string;
    emailLabel: string;
    form: {
      formAria: string;
      cityLabel: string;
      interestAria: string;
      /** Prvi red poruke za uslugu bez tačne `interest` vrednosti. */
      interestLinePrefix: string;
      services: Array<{
        value: string;
        label: string;
        interest: "review" | "not_sure";
        tag?: string;
        messageLabel?: string;
      }>;
      defaultService: string;
      submit: string;
      submitting: string;
      successTitle: string;
      successBody: string;
    };
  };
  partners: {
    eyebrow: string;
    title: string;
    body: string;
    scanmeBody: string;
    enigmaBody: string;
    visit: string;
    boothPartnersLabel: string;
    boothPartners: string[];
  };
  footer: {
    body: string;
    fair: string;
    phoneLabel: string;
    phone: string;
    emailLabel: string;
    email: string;
    rights: string;
  };
}

export const prelaunchSr: PrelaunchDict = {
  skip: "Pređi na glavni sadržaj",
  nav: {
    aria: "Glavna navigacija",
    homeAria: "ScanMe, početak",
    menu: "Meni",
    story: "Kako radi",
    services: "Usluge",
    products: "Proizvodi",
    fair: "Sajam",
    partners: "Partneri",
    contact: "Kontakt",
    cta: "Pogledaj kako radi",
  },
  hero: {
    partner: "Digitalni partner",
    fairName: "Sajam automobila · Niš 2026",
    primaryCta: "Pogledaj kako radi",
    secondaryCta: "Pogledaj kako radi",
  },
  fair: {
    eyebrow: "ScanMe × Sajam automobila",
    title: "Sajam automobila dobija novu digitalnu dimenziju.",
    body:
      "Kao digitalni partner povezujemo fizički prostor sajma sa informacijama, interakcijama i iskustvima koja posetioci nose sa sobom i nakon izlaska iz hale.",
    organizerLink: "Posetite sajt Sajma automobila",
    location: "Niš · Hala Čair",
    year: "2026",
    bannerTitle: "Sajam automobila",
    partnerBrand: "ScanMe",
    cta: "Otvori digitalni sajam",
    status: {
      live: "U toku",
      next: "Sledeći: {date}",
      ended: "Završeno",
    },
    events: [
      {
        name: "Sajam elektromobilnosti",
        date: "09—11. oktobar",
        shortDate: "09/10/11. okt",
        startLabel: "9. oktobar",
      },
      {
        name: "Auto Moto Fest",
        date: "30. oktobar—01. novembar",
        shortDate: "30/31. okt – 01. nov",
        startLabel: "30. oktobar",
      },
    ],
  },
  services: {
    eyebrow: "ScanMe usluge",
    title: "Usluge",
    body:
      "Mi pripremamo, povezujemo i održavamo ceo put iza skena. Vi dobijate jasno iskustvo za gosta i koristan uvid za svoj biznis.",
    available: "Dostupno",
    soon: "Uskoro",
    cta: "Zatraži ponudu",
    soonNote: "U pripremi",
    items: [
      {
        name: "ScanMe Links",
        body: "Svi važni linkovi vašeg biznisa na jednoj mobilnoj stranici.",
        status: "available",
      },
      {
        name: "ScanMe Review",
        body: "Kratak put od skena do mesta na kom gost ostavlja svoj utisak.",
        status: "available",
      },
      {
        name: "ScanMe Meni",
        body: "Digitalni meni dostupan jednim skenom, bez dodatne aplikacije.",
        status: "soon",
      },
    ],
  },
  story: {
    title: "Od fizičkog predmeta do digitalnog prostora.",
  },
  products: {
    eyebrow: "Fizički proizvodi",
    title: "Digitalna usluga dobija svoje mesto u stvarnom prostoru.",
    body:
      "Izaberite format koji odgovara vašem lokalu ili događaju. Svaki proizvod povezujemo sa ScanMe uslugom i prilagođavamo vašem vizuelnom identitetu.",
    selectorAria: "Izaberite fizički proizvod",
    previewLabel: "Prikaz proizvoda",
    selectedLabel: "Izabrano",
    useCase: "Najbolje za",
    noPrice: "Dizajn, format i količinu dogovaramo prema vašem prostoru.",
    cta: "Zanima me ovaj proizvod",
    names: {
      stickers: "Nalepnice",
      "window-film": "Folija za izlog",
      "two-piece-stand": "Dvodelni stalak",
      "compact-stand": "Kompaktni stalak",
      "premium-engraved-stand": "Premium gravirani stalak",
    },
    descriptions: {
      stickers: "Stolove, pultove i suve unutrašnje površine.",
      "window-film": "Izloge i staklene površine izložene redovnom čišćenju.",
      "two-piece-stand": "Stolove, pultove i recepcije gde se umetak povremeno menja.",
      "compact-stand": "Stabilan prikaz na mestu gde želite čist i jednostavan format.",
      "premium-engraved-stand": "Reprezentativne lokale, hotele, restorane i salone.",
    },
  },
  lead: {
    eyebrow: "Prelaunch prijava",
    title: "Budite među prvima koji će koristiti ScanMe.",
    body:
      "Ostavite nam osnovne podatke i oblast koja vas zanima. Ne kupujete ništa sada — javićemo vam se kada otvorimo prodaju.",
    benefitTitle: "Prelaunch pogodnosti",
    benefits: [
      "Poseban popust kada prodaja počne",
      "Rani pristup informacijama o ponudi",
      "Direktan razgovor o rešenju za vaš biznis",
    ],
    formAria: "Prijava interesovanja za ScanMe",
    name: "Ime i prezime *",
    business: "Naziv biznisa ili organizacije *",
    businessType: "Tip biznisa *",
    businessTypePlaceholder: "Izaberite",
    businessTypes: [
      "Kafić ili restoran",
      "Hotel ili smeštaj",
      "Salon ili studio",
      "Prodavnica",
      "Događaj ili organizacija",
      "Uslužni biznis",
      "Drugo",
    ],
    city: "Grad",
    contactLegend: "Kontakt *",
    contactHint: "Dovoljan je telefon ili imejl.",
    phone: "Telefon",
    email: "Imejl",
    interestLegend: "Zanima me *",
    interests: ["ScanMe Links", "ScanMe Review", "ScanMe Meni", "Fizički proizvodi", "Nisam još siguran"],
    message: "Poruka",
    messagePlaceholder: "Ukratko nam opišite svoj biznis ili šta želite da povežete sa ScanMe uslugom.",
    website: "Veb-sajt",
    submit: "Prijavi interesovanje",
    submitting: "Šaljemo prijavu...",
    successTitle: "Interesovanje je sačuvano.",
    successBody: "Hvala. Javićemo vam se preko telefona ili imejla koji ste ostavili.",
    genericError: "Prijavu trenutno nije moguće poslati.",
    connectionError: "Proverite vezu i pokušajte ponovo.",
    validation: {
      name: "Unesite ime i prezime.",
      business: "Unesite naziv biznisa ili organizacije.",
      businessType: "Izaberite tip biznisa.",
      contactPhone: "Unesite telefon ili imejl.",
      contactEmail: "Unesite imejl ili telefon.",
      email: "Unesite ispravnu imejl adresu.",
      phone: "Unesite ispravan broj telefona.",
      interest: "Izaberite bar jednu oblast interesovanja.",
    },
  },
  contact: {
    eyebrow: "Kontakt",
    title: "Recite nam šta želite da postavite.",
    body:
      "Pošaljite osnovne podatke i šta vas zanima. Javljamo se sa predlogom i realnim rokom — bez obaveze.",
    emailLabel: "Ili pišite direktno na",
    form: {
      formAria: "Upit za ScanMe",
      cityLabel: "Grad",
      interestAria: "Zanima me",
      interestLinePrefix: "Zanima me:",
      services: [
        { value: "links", label: "ScanMe Links", interest: "not_sure", messageLabel: "ScanMe Links" },
        { value: "review", label: "ScanMe Review", interest: "review" },
        { value: "menu", label: "ScanMe Meni", interest: "not_sure", tag: "Uskoro", messageLabel: "ScanMe Meni" },
        { value: "not_sure", label: "Nisam siguran/na", interest: "not_sure" },
      ],
      defaultService: "not_sure",
      submit: "Pošalji upit",
      submitting: "Šaljemo upit...",
      successTitle: "Upit je poslat.",
      successBody: "Hvala. Javićemo se preko telefona ili imejla koji ste ostavili.",
    },
  },
  partners: {
    eyebrow: "Zajedno na štandu",
    title: "ScanMe i EnigmaIT, jedno mesto za digitalni rast.",
    body:
      "Na Sajmu automobila nastupamo zajedno: ScanMe povezuje fizički i digitalni prostor, a EnigmaIT gradi veb-sajtove i softverska rešenja.",
    scanmeBody: "Digitalne usluge i fizički proizvodi koji svaki sken pretvaraju u korisnu akciju.",
    enigmaBody: "Veb-sajtovi i softver projektovani prema stvarnim potrebama poslovanja.",
    visit: "Posetite sajt",
    boothPartnersLabel: "Sa nama na štandu",
    boothPartners: [
      "Agencija za nekretnine",
      "REZ produkcija",
      "NaučiAI",
      "EnigmaDigital",
      "KamuflirajMe",
      "EZOSound",
    ],
  },
  footer: {
    body: "Fizički kontakt pretvaramo u jasan digitalni put — bez dodatne aplikacije i bez tehničkog tereta za vaš tim.",
    fair: "Digitalni partner Sajma automobila · Niš 2026",
    phoneLabel: "Telefon",
    phone: "065/86-444-88 (Aleksa Đorđević)",
    emailLabel: "email",
    email: "office@scanme.rs",
    rights: "© 2026 ScanMe. Sva prava zadržana.",
  },
};
