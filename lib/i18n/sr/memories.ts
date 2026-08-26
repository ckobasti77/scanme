import type { MemoriesDict } from "../types";

// Memories copy: the ConvexError messages raised by convex/memories.ts and
// convex/cards.ts (TASK-14), plus the guest screens' chrome (TASK-17).
// Guest-facing lines render on the /m/[code] surfaces; host-facing lines in
// the card/quota manager.
export const memoriesSr = {
  // Guest-facing.
  spaceNotFound: "Ovaj prostor za uspomene ne postoji ili je uklonjen.",
  spaceNotActive: "Prostor za uspomene trenutno ne prima fotografije.",
  notActivated: "Prostor za uspomene još nije aktiviran.",
  windowNotOpen: "Otpremanje fotografija još nije počelo.",
  windowClosed: "Vreme za otpremanje fotografija je isteklo.",
  sessionMissing: "Trenutno nema otvorene sesije za otpremanje.",
  sessionClosed: "Ova sesija je zatvorena za nove fotografije.",
  guestNotFound:
    "Vaš pristup nije prepoznat. Skenirajte karticu sa stola još jednom.",
  quotaReached: "Dostigli ste limit od {limit} fotografija.",
  rateLimited: "Previše zahteva odjednom. Sačekajte trenutak pa pokušajte ponovo.",
  photoNotFound: "Fotografija nije pronađena.",
  // TASK-16 — reservation retry/release + the client upload pipeline.
  releaseUnavailable: "Ova fotografija je već obrađena i ne može da se poništi.",
  notAnImage: "Ovaj fajl nije fotografija. Izaberite sliku iz galerije.",
  decodeFailed:
    "Ova fotografija ne može da se učita. Pokušajte sa drugom fotografijom.",
  uploadFailed: "Otpremanje nije uspelo. Proverite vezu pa pokušajte ponovo.",
  uploadRejected: "Ova fotografija ne može da se otpremi.",
  // Host-facing.
  grantInvalid: "Dodatni broj fotografija mora biti ceo broj između 1 i 500.",
  grantScopeMismatch: "Izabrana sesija ili gost ne pripada ovom prostoru.",
  cardNotFound: "Kartica nije pronađena.",
  cardTargetInvalid: "Odredište kartice nije ispravno podešeno.",
  cardUrlUnsafe: "Spoljašnja adresa mora biti javna https:// adresa.",
  cardCodeGenerationFailed:
    "Generisanje koda kartice nije uspelo. Pokušajte ponovo.",
  cardBusinessMismatch: "Odredište ne pripada ovom lokalu.",
  cardMintCountInvalid: "Broj kartica mora biti ceo broj između 1 i 50.",
  spaceNotOneOff: "Ova radnja je moguća samo za jednokratni prostor.",
  spaceWindowInvalid: "Novo vreme zatvaranja mora biti u budućnosti.",
  spaceStatusInvalid: "Ovu radnju nije moguće izvršiti u trenutnom stanju.",
  // --- TASK-17: the guest screens. Ti-form on purpose — a guest at a party
  // (per the brief's own copy); the Vi-form refusals above stay as raised.
  metaLandingTitle: "Uspomene · {name}",
  metaMyPhotosTitle: "Moje slike · {name}",
  metaGalleryTitle: "Galerija · {name}",
  heroTagline: "Ostavi uspomenu sa večeras.",
  socialProofZero: "Večeras još nema slika — tvoja može biti prva.",
  socialProofOne: "Večeras je već stigla jedna slika.",
  socialProofFew: "Večeras su već stigle {count} slike.",
  socialProofMany: "Večeras je već stiglo {count} slika.",
  quotaRemainingOne: "Možeš da dodaš još jednu sliku.",
  quotaRemainingFew: "Možeš da dodaš još {count} slike.",
  quotaRemainingMany: "Možeš da dodaš još {count} slika.",
  addPhotosAction: "Dodaj slike",
  addPhotoActionOne: "Dodaj sliku",
  itemQueued: "Čeka u redu",
  itemPreparing: "Priprema se…",
  itemUploading: "Šalje se… {percent}%",
  itemProcessing: "Obrađuje se…",
  itemSaved: "Sačuvano",
  itemWaitingNetwork: "Čeka vezu…",
  itemRetrying: "Pokušava ponovo…",
  itemRetryAction: "Pokušaj ponovo",
  itemRemoveAction: "Ukloni",
  itemPreviewAlt: "Slika koja se dodaje",
  itemDeleteAction: "Obriši",
  deleteDialogTitle: "Obrisati ovu sliku?",
  deleteDialogBody:
    "Slika nestaje iz uspomena, a tebi se oslobađa mesto za novu.",
  deleteConfirm: "Obriši",
  deleteCancel: "Zadrži",
  deleteError: "Brisanje nije uspelo. Pokušaj ponovo.",
  actionError: "Nije uspelo. Pokušaj ponovo.",
  sheetClose: "Zatvori",
  sheetAria: "Pregled slike",
  visibilityEveryone: "Vide svi",
  visibilityHostOnly: "Samo ja i domaćin",
  visibilityToggleAria: "Ko vidi ovu sliku",
  visibilityLocked: "Za ovaj prostor izbor vidljivosti nije dostupan.",
  stateBeforeTitle: "Još nije počelo",
  stateBeforeBody: "Dodavanje slika počinje {date} u {time}.",
  stateBeforeBodyNoDate: "Dodavanje slika još nije počelo. Vrati se malo kasnije.",
  stateClosedTitle: "Veče je završeno",
  stateClosedBody:
    "Vreme za dodavanje slika je isteklo. Tvoje slike ostaju tvoje — uvek možeš da ih pogledaš.",
  statePausedTitle: "Kratka pauza",
  statePausedBody: "Domaćin je privremeno zaustavio primanje slika.",
  stateNotActivatedTitle: "Još malo pa počinjemo",
  stateNotActivatedBody: "Ovaj prostor za uspomene još nije spreman za slike.",
  stateQuotaTitle: "Sve tvoje slike su tu",
  stateQuotaBody:
    "Tvoja mesta za večeras su popunjena. Ako obrišeš neku sliku, oslobađa se mesto za novu.",
  stateNoIdentityTitle: "Skeniraj karticu sa stola",
  stateNoIdentityBody:
    "Da dodaš slike, skeniraj karticu sa stola još jednom — tako znamo koje slike su tvoje.",
  offlineBanner:
    "Nema interneta. Slike čekaju u redu i krenuće same čim se veza vrati.",
  tonightHeading: "Tvoje slike večeras",
  myPhotosTitle: "Moje slike",
  myPhotosEmpty: "Još nema tvojih slika.",
  myPhotosLink: "Moje slike",
  photoAlt: "Uspomena {index}",
  photoPendingLabel: "Slika u pripremi",
  galleryTitle: "Galerija večeri",
  galleryLink: "Pogledaj galeriju",
  galleryEmpty: "Još nema slika za večeras.",
  galleryLoading: "Učitavanje galerije…",
  galleryLoadMore: "Prikaži još",
  backToUploadLink: "Dodaj još slika",
  footerBrand: "ScanMe Uspomene",
  // TASK-20 — retention window + guest erasure.
  retentionNoteMy:
    "Tvoje slike se čuvaju najviše {days} dana, a zatim se automatski brišu.",
  privacyLink: "Politika privatnosti",
  wipeAllAction: "Obriši sve moje slike",
  wipeDialogTitle: "Obrisati sve tvoje slike?",
  wipeDialogBody:
    "Sve tvoje slike nestaju — iz svih prikaza, sa servera i iz uspomena događaja ako ih je domaćin tamo uvrstio. Ovo ne može da se opozove.",
  wipeConfirm: "Obriši sve",
  wipeCancel: "Odustani",
  wipeSuccess: "Tvoje slike su obrisane.",
  wipeError: "Brisanje nije uspelo. Pokušaj ponovo.",
  consentUpdatedBadge: "Ažurirano obaveštenje",
} as const satisfies MemoriesDict;
