import type { VenueDict } from "../types";

// Public venue page copy (TASK-09): route metadata, the three lifecycle states,
// the twelve block renderers' chrome, and the submitReservation error messages
// a guest sees on the public form. Placeholders are filled via fmt().
export const venueSr = {
  // Route metadata.
  metaEventTitle: "{title} · {name}",
  metaVenueTitle: "{name} · Događaji",
  metaDescription: "Pogledajte šta se dešava, sačuvajte datum i rezervišite svoje mesto.",
  metaArchiveTitle: "Arhiva događaja · {name}",
  metaArchiveDescription: "Pogledajte kako je bilo na prethodnim događajima.",
  // Segment 404.
  notFoundTitle: "Stranica nije pronađena",
  notFoundBody:
    "Ova adresa ne vodi ni do jednog događaja. Proverite link ili skenirajte kod ponovo.",
  // Lifecycle states + template chrome.
  liveBadge: "Uživo",
  beforeBadge: "Uskoro",
  endedBadge: "Završeno",
  beforeEmptyTitle: "Pripremamo nešto novo",
  beforeEmptyBody: "Sledeći događaj još nije objavljen. Sačuvajte ovu stranicu i navratite uskoro.",
  afterTitle: "Hvala što ste bili uz nas",
  afterBody: "Događaj je završen. Pogledajte kako je bilo.",
  inactiveTitle: "Stranica trenutno nije aktivna",
  inactiveBody: "Ova stranica je privremeno pauzirana. Navratite kasnije.",
  poweredBy: "Pokreće ScanMe",
  archiveLink: "Pogledaj arhivu",
  currentEventLink: "Aktuelni događaj",
  eventPageEndedNote: "Ovaj događaj je završen.",
  // countdown block.
  countdownAria: "Odbrojavanje do početka događaja",
  countdownDays: "dana",
  countdownHours: "sati",
  countdownMinutes: "min",
  countdownSeconds: "sek",
  countdownDone: "Počelo je!",
  // eventDateTime block.
  whenLabel: "Kada",
  whereLabel: "Gde",
  addToCalendarLabel: "Dodaj u kalendar",
  googleCalendarLink: "Google kalendar",
  icsDownloadLink: "Preuzmi .ics",
  // program block.
  programHeading: "Program",
  // map block.
  mapOpenLink: "Otvori mapu",
  mapLoadButton: "Učitaj mapu",
  mapPrivacyNote: "Mapa se učitava sa Google servera tek kada je otvorite.",
  mapIframeTitle: "Mapa lokacije",
  // gallery block.
  galleryImageAlt: "Fotografija {index}",
  lightboxOpenAria: "Uvećaj fotografiju {index}",
  lightboxLabel: "{index} / {count}",
  lightboxClose: "Zatvori pregled",
  lightboxPrev: "Prethodna fotografija",
  lightboxNext: "Sledeća fotografija",
  // profileCards block — "Ko vas očekuje" reads equally for a DJ lineup and a
  // salon's stylists; "Nastupaju" assumed a stage.
  profileCardsHeading: "Ko vas očekuje",
  // priceList block — "Cenovnik" is what a kafana AND a frizerski salon hang on
  // the wall; "Meni" is reserved for the future ScanMe Menu product.
  priceListHeading: "Cenovnik",
  // reservation block — form chrome.
  reservationHeading: "Rezervacije",
  fieldName: "Ime i prezime",
  fieldPhone: "Telefon",
  fieldEmail: "Email",
  fieldPartySize: "Broj osoba",
  fieldNote: "Napomena",
  optionalSuffix: "(opciono)",
  reservationSubmit: "Pošalji rezervaciju",
  reservationSubmitting: "Šaljemo…",
  reservationSuccessDefault: "Rezervacija je primljena. Vidimo se!",
  reservationErrorGeneric: "Slanje nije uspelo. Pokušajte ponovo.",
  reservationDeadlineNote: "Rezervacije su otvorene do {date}.",
  // reservation backend errors.
  reservationUnavailable: "Rezervacije nisu dostupne za ovaj događaj.",
  reservationClosed: "Rezervacije su zatvorene.",
  reservationDeadlinePassed: "Rok za rezervacije je istekao.",
  reservationFull: "Sva mesta su popunjena.",
  reservationRateLimited: "Trenutno stiže mnogo zahteva. Pokušajte ponovo za minut.",
  reservationNameRequired: "Unesite ime i prezime.",
  reservationPartySizeInvalid: "Broj osoba mora biti između 1 i 500.",
  // share block.
  shareHeading: "Podeli",
  shareCopy: "Kopiraj link",
  shareCopied: "Kopirano!",
  shareWhatsapp: "WhatsApp",
  shareViber: "Viber",
  shareFacebook: "Facebook",
  shareX: "X",
  shareDefaultMessage: "Pogledaj ovaj događaj: {title}",
  // pastEvents block + archive page.
  pastEventsHeading: "Prošli događaji",
  pastEventsEmpty: "Još nema arhiviranih događaja.",
  archiveTitle: "Arhiva",
  archiveEmpty: "Arhiva je za sada prazna.",
  archivePhotoCount: "{count} fotografija",
} as const satisfies VenueDict;
