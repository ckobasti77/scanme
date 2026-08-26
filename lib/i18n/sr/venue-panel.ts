import type { VenuePanelDict } from "../types";

// Owner-facing Venue workflow copy inside the client panel (TASK-13,
// components/client-panel/venue-panel-section.tsx). The plain-Serbian lifecycle
// labels and the STEP-3 legibility banner live here; the server's refusals
// (schedule overlap, publish-required, revision conflict, …) reuse the
// venue-editor ConvexError strings, so they are NOT duplicated on this surface.
// `{...}` placeholders are filled via fmt().
export const venuePanelSr = {
  tabLabel: "ScanMe Venue",
  eyebrow: "ScanMe Venue",
  signOut: "Odjava",
  loadError: "Podaci o događajima nisu učitani.",

  statusDraft: "Nacrt",
  statusScheduled: "Zakazan",
  statusLive: "Uživo",
  statusEnded: "Završen",
  statusArchived: "Arhiviran",

  bannerLiveCurrentTitle: "Uživo — posetioci vide vašu najnoviju verziju.",
  bannerLiveCurrentBody:
    "Događaj je aktivan i objavljena stranica je usklađena sa vašim izmenama. Nema šta da se objavljuje.",
  bannerLiveStaleTitle: "Uživo, ali imate neobjavljene izmene.",
  bannerLiveStaleBody:
    "Posetioci trenutno vide prethodnu objavljenu verziju. Kliknite „Objavi izmene“ da bi videli najnovije.",
  bannerScheduledTitle: "Zakazano za {date}.",
  bannerScheduledBody:
    "Objavljena verzija je spremna. Kad termin počne, stranica automatski prelazi uživo.",
  bannerScheduledStaleTitle: "Zakazano, ali imate neobjavljene izmene.",
  bannerScheduledStaleBody:
    "Termin je postavljen, ali nacrt sadrži izmene koje nisu objavljene. Objavite ih pre početka da bi bile vidljive.",
  bannerPublishedUnscheduledTitle: "Objavljeno, ali još nije zakazano.",
  bannerPublishedUnscheduledBody:
    "Dizajn je objavljen, ali posetioci ga ne vide dok ne postavite termin. Kliknite „Zakaži“.",
  bannerDraftTitle: "Nacrt — još nije objavljeno.",
  bannerDraftBody:
    "Uredite stranicu i objavite je, pa je zatim zakažite da bi posetioci mogli da je vide.",
  bannerEndedTitle: "Događaj je završen.",
  bannerEndedBody:
    "Javna stranica ga više ne prikazuje uživo. Arhivirajte ga, ili duplirajte dizajn za sledeći termin.",

  chipVisible: "Vidljivo posetiocima",
  chipHidden: "Nije vidljivo",
  chipUnpublished: "Neobjavljene izmene",

  currentEventHeading: "Trenutni događaj",
  goesLiveLabel: "Počinje",
  endsLabel: "Završava se",
  ranLabel: "Održano",
  notScheduledLabel: "Termin nije postavljen",
  unpublishedTag: "Neobjavljene izmene",

  editAction: "Uredi stranicu",
  openPublicAction: "Otvori javnu stranicu",
  publishAction: "Objavi izmene",
  scheduleAction: "Zakaži",
  rescheduleAction: "Ponovo zakaži",
  endNowAction: "Završi sada",
  archiveAction: "Arhiviraj",
  createEventAction: "Napravi novi događaj",
  duplicateAction: "Dupliraj prethodni",
  duplicateNamedAction: "Dupliraj: {title}",

  emptyTitle: "Napravite prvi događaj",
  emptyBody:
    "Venue je aktiviran za vaš lokal. Napravite prvi događaj da biste počeli da uređujete njegovu stranicu, pa je objavite i zakažite.",

  needsArchiveTitle: "Događaj čeka arhiviranje",
  needsArchiveBody:
    "Poslednji događaj je završen. Arhivirajte ga da bi se pojavio u „Prošli događaji“, ili duplirajte njegov dizajn za sledeći termin.",

  pastEventsHeading: "Prošli događaji",
  pastEventsEmpty: "Još nema završenih događaja.",
  pastEventViewAction: "Pogledaj",
  pastEventArchivedOn: "Arhivirano {date}",

  createDialogTitle: "Novi događaj",
  createDialogBody:
    "Napravite prazan nacrt. Njegov dizajn uređujete u editoru, a zatim ga objavite i zakažite.",
  createTitleLabel: "Naziv događaja",
  createTitlePlaceholder: "npr. Petak uživo",
  createSlugLabel: "Adresa (opciono)",
  createSlugHint: "Javna adresa: /{slug}",
  createSlugEmptyError:
    "Naziv mora sadržati bar jedno slovo ili cifru za automatsku adresu.",
  createConfirm: "Napravi",
  createCancel: "Otkaži",
  createSuccess: "Novi događaj je napravljen.",
  createError: "Događaj nije napravljen.",

  duplicateDialogTitle: "Dupliraj događaj",
  duplicateDialogBody:
    "Kopira poslednji objavljeni dizajn („{title}“) u novi nacrt. Menjate samo ono što je specifično za novi termin.",
  duplicateNoSource:
    "Nema objavljenog događaja za dupliranje. Prvo objavite jedan događaj.",
  duplicateSuccess: "Dizajn je dupliran u novi nacrt.",
  duplicateError: "Dupliranje nije uspelo.",

  scheduleDialogTitle: "Zakaži događaj",
  scheduleDialogBody:
    "Postavite početak i kraj. Kad termin počne, stranica automatski prelazi uživo, a na kraju se sama završava.",
  scheduleStartLabel: "Početak",
  scheduleEndLabel: "Kraj",
  scheduleTimezoneNote: "Vreme je po beogradskom vremenu (Europe/Belgrade).",
  scheduleMissingTimes: "Postavite i početak i kraj.",
  scheduleConfirm: "Zakaži",
  scheduleCancel: "Otkaži",
  scheduleSuccess: "Događaj je zakazan.",
  scheduleError: "Zakazivanje nije uspelo.",

  publishDialogTitle: "Objaviti izmene?",
  publishDialogBody:
    "Objavljivanje čini vaš najnoviji nacrt vidljivim posetiocima. Ovim postaje javna verzija stranice.",
  publishConfirm: "Objavi",
  publishSuccess: "Izmene su objavljene.",
  publishError: "Objavljivanje nije uspelo.",
  publishConflictTitle: "Neko je u međuvremenu objavio",
  publishConflictBody:
    "Nacrt je izmenjen na drugom uređaju otkako je ova stranica učitana. Osvežite da biste videli najnovije stanje, pa pokušajte ponovo.",
  publishConflictReload: "Osveži",

  endDialogTitle: "Završiti događaj sada?",
  endDialogBody:
    "Javna stranica prestaje da prikazuje događaj uživo i prelazi u stanje „završeno“. Ovo se ne vraća automatski — da biste ga ponovo prikazali, zakažite novi termin.",
  endConfirm: "Završi sada",
  endCancel: "Otkaži",
  endSuccess: "Događaj je završen.",
  endError: "Događaj nije završen.",

  archiveDialogTitle: "Arhivirati događaj?",
  archiveDialogBody:
    "Događaj se trajno arhivira i pojavljuje u „Prošli događaji“. Javna stranica ga više ne prikazuje kao aktivan.",
  archivePhotosNote:
    "Izbor fotografija za trajno čuvanje biće dostupan uz ScanMe Memories.",
  archiveConfirm: "Arhiviraj",
  archiveCancel: "Otkaži",
  archiveSuccess: "Događaj je arhiviran.",
  archiveError: "Arhiviranje nije uspelo.",
} as const satisfies VenuePanelDict;
