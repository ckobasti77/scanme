import type { VenueEditorDict } from "../types";

// Venue editor copy. `editorAccessDisabled` is the shared editor-access denial
// (convex/lib/access.ts requireServiceEditorAccess); the first section holds
// the Venue write backend's ConvexError messages (convex/venue.ts, TASK-08) —
// prose the owner sees in the editor. The TASK-10 section is the editor shell
// itself (components/venue/editor/**): chrome, panels, palette, preview, save
// and publish states. Placeholders (`{product}`, `{block}`, `{max}`, …) are
// filled via fmt().
export const venueEditorSr = {
  blockLabelCountdown: "Odbrojavanje",
  blockLabelEventDateTime: "Datum i vreme",
  blockLabelProgramTimeline: "Program",
  blockLabelMap: "Mapa",
  blockLabelGallery: "Galerija",
  blockLabelProfileCards: "Profili",
  blockLabelPriceList: "Cenovnik",
  blockLabelReservation: "Rezervacije",
  blockLabelShare: "Deljenje",
  blockLabelPastEvents: "Prošli događaji",
  blockLabelRichText: "Tekst",
  blockLabelSpacer: "Razmak",
  editorAccessDisabled:
    "Uređivanje {product} stranice nije omogućeno za klijenta.",
  eventNotFound: "Događaj nije pronađen.",
  configNotFound: "Konfiguracija događaja nije pronađena.",
  eventSlugReserved: "Putanja „{slug}“ je rezervisana za arhivu.",
  eventSlugTaken: "Već postoji događaj sa tom putanjom.",
  draftChanged:
    "Nacrt je u međuvremenu izmenjen. Osvežite editor i pokušajte ponovo.",
  scheduleTimesRequired:
    "Postavite vreme početka i završetka pre zakazivanja.",
  scheduleTimesOrder: "Vreme početka mora biti pre vremena završetka.",
  schedulePublishRequired: "Objavite događaj pre zakazivanja.",
  scheduleOverlap:
    "Već postoji zakazan ili aktivan događaj u tom terminu.",
  scheduleWrongStatus:
    "Ovaj događaj se ne može zakazati u trenutnom stanju.",
  liveConflict: "Već postoji aktivan događaj za ovaj lokal.",
  blockNotAllowed: "Blok „{block}“ nije dostupan u vašem planu.",
  archiveNotEnded: "Događaj mora biti završen pre arhiviranja.",
  archiveAssetInvalid: "Izabrani medij ne pripada ovom lokalu.",
  // --- TASK-10: the editor shell --------------------------------------------
  metaEditorTitle: "Uredi Venue stranicu | ScanMe",
  editorLoading: "Učitavanje editora…",
  signInTitle: "Prijava je potrebna",
  signInBody:
    "Prijavite se nalogom koji ima pristup ovom lokalu da biste uređivali Venue stranicu.",
  signInAction: "Otvori prijavu",
  unavailableTitle: "Editor nije dostupan",
  unavailableBody:
    "Venue profil za ovaj lokal nije pronađen ili nemate dozvolu da ga uređujete.",
  noEventTitle: "Još nema događaja",
  noEventBody:
    "Kada prvi događaj bude kreiran za ovaj lokal, ovde ćete uređivati njegovu stranicu.",
  backAria: "Nazad na ScanMe admin panel",
  historyGroupAria: "Istorija izmena",
  undoAria: "Vrati prethodnu izmenu (Ctrl+Z)",
  redoAria: "Ponovi izmenu (Ctrl+Shift+Z)",
  undoTooltip: "Vrati · Ctrl+Z",
  redoTooltip: "Ponovi · Ctrl+Shift+Z",
  saveDraftAction: "Sačuvaj nacrt",
  saveActionAria: "Sačuvaj nacrt (trenutno: {state})",
  publishAction: "Objavi",
  saveStateSaved: "Sačuvano",
  saveStateSaving: "Čuvanje…",
  saveStateError: "Nije sačuvano",
  saveRetryHint: "Kliknite da pokušate ponovo.",
  saveErrorFallback: "Nacrt nije sačuvan.",
  savedToast: "Nacrt je sačuvan.",
  publishDialogTitle: "Objavi trenutni nacrt?",
  publishDialogBody:
    "Sve sačuvane izmene postaće vidljive na javnoj stranici događaja.",
  publishConfirm: "Objavi nacrt",
  publishCancel: "Odustani",
  publishSuccess: "Stranica događaja je objavljena.",
  publishErrorFallback: "Nacrt nije objavljen.",
  publishConflictTitle: "Nacrt je promenjen na drugom mestu",
  publishConflictBody:
    "Neko je u međuvremenu izmenio ili objavio ovaj nacrt. Osvežite editor da vidite najnovije stanje — vaše izmene neće ćutke prepisati tuđe.",
  publishConflictReload: "Osveži editor",
  toolsAria: "Alati editora",
  closePanelAria: "Zatvori panel",
  panelComingSoon: "Ove kontrole stižu u sledećem koraku razvoja.",
  panelBlocksTitle: "Blokovi",
  panelBlocksDescription:
    "Dodajte i rasporedite blokove; klik na blok u pregledu bira ga za uređivanje.",
  panelEventTitle: "Događaj",
  panelEventDescription: "Naziv, javna adresa i status događaja.",
  panelStyleTitle: "Stil",
  panelStyleDescription: "Celokupan vizuelni ton stranice na jednom mestu.",
  panelBackgroundTitle: "Pozadina",
  panelBackgroundDescription: "Boja, slika ili video iza sadržaja stranice.",
  panelTextTitle: "Tekst",
  panelTextDescription: "Font, veličina i poravnanje teksta.",
  panelColorTitle: "Boje",
  panelColorDescription: "Paleta stranice izvedena iz vašeg brenda.",
  panelSettingsTitle: "Podešavanja",
  panelSettingsDescription: "Javna adresa i status stranice.",
  panelAnalyticsTitle: "Analitika",
  panelAnalyticsDescription: "Posete i rezervacije objavljene stranice.",
  panelHelpTitle: "Pomoć",
  panelHelpDescription: "Kratak vodič kroz najvažnije tokove u editoru.",
  blocksListHeading: "Na stranici",
  blocksAddHeading: "Dodaj blok",
  blockCount: "{count} / {max}",
  blocksCapReached:
    "Dostigli ste najveći broj blokova ({max}). Uklonite neki blok da biste dodali novi.",
  blocksEmpty: "Stranica još nema blokova. Dodajte prvi iz liste ispod.",
  addBlockAria: "Dodaj blok „{block}“",
  blockItemAria: "Blok „{block}“. Kliknite za izbor.",
  dragHandleAria: "Promeni redosled bloka „{block}“",
  duplicateAria: "Dupliraj blok „{block}“",
  deleteAria: "Obriši blok „{block}“",
  deleteDialogTitle: "Obriši blok „{block}“?",
  deleteDialogBody:
    "Blok ima sadržaj koji će biti uklonjen iz nacrta. Na javnoj stranici promena važi tek kada objavite nacrt, a Ctrl+Z vraća blok.",
  deleteConfirm: "Obriši iz nacrta",
  deleteCancel: "Odustani",
  blockDeletedToast: "Blok je uklonjen iz nacrta.",
  blockPanelTitle: "Blok: {block}",
  blockPanelPlaceholder:
    "Kontrole za ovaj blok stižu u sledećem koraku. Za sada blok možete premestiti, duplirati ili obrisati.",
  blockPanelBack: "Nazad na listu blokova",
  eventTitleLabel: "Naziv",
  eventPathLabel: "Javna adresa",
  eventStatusLabel: "Status",
  statusDraft: "Nacrt",
  statusScheduled: "Zakazan",
  statusLive: "Uživo",
  statusEnded: "Završen",
  statusArchived: "Arhiviran",
  helpAddTitle: "Dodavanje blokova",
  helpAddBody:
    "Otvorite panel „Blokovi“ i izaberite tip. Novi blok se pojavljuje na dnu stranice.",
  helpReorderTitle: "Redosled",
  helpReorderBody:
    "Prevucite blok u pregledu ili u listi panela. Izmene se čuvaju automatski.",
  helpUndoTitle: "Poništavanje",
  helpUndoBody:
    "Ctrl+Z vraća, a Ctrl+Shift+Z ponavlja izmenu. Istorija važi dok je editor otvoren.",
  helpPublishTitle: "Objavljivanje",
  helpPublishBody:
    "Nacrt postaje javan tek kada kliknete „Objavi“. Do tada posetioci vide poslednju objavljenu verziju.",
  previewAria: "Pregled stranice događaja za {name}",
  deviceGroupAria: "Uređaj za pregled",
  devicePhoneAria: "Prikaži mobilnu verziju",
  deviceDesktopAria: "Prikaži desktop verziju",
  zoomAria: "Zum pregleda",
  previewBlockAria: "{block}. Kliknite za izbor, prevucite za promenu redosleda.",
  previewEmptyBlock: "Prazan blok „{block}“ — sadržaj se uređuje u sledećem koraku.",
  previewScrollAria: "Pomeranje pregleda",
} as const satisfies VenueEditorDict;
