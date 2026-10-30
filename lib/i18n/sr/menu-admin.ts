import type { MenuAdminDict } from "../types";

// Admin Menu management and migration console copy (RFC-003 §2.9, §2.11 — TASK-57).
// The operator tracks client menu onboarding (primljeno → u izradi → na potvrdi → objavljeno),
// exports PDF and Excel representations of the items, activates/deactivates the menu,
// and manages publish states.
// Placeholders are filled via fmt().
export const menuAdminSr = {
  // Screen chrome & navigation.
  eyebrow: "ScanMe Meni",
  title: "Meni lokala",
  description: "Upravljanje menijem, unosom podataka i izvozom.",
  loadError: "Podaci o meniju nisu učitani.",
  backAction: "Nazad na lokal",

  // Activation states.
  menuActive: "Meni je aktivan",
  menuInactive: "Meni je deaktiviran",
  menuNone: "Meni nije kreiran",
  menuDraft: "Nacrt",
  menuPublished: "Objavljen",

  // Actions.
  grantAction: "Aktiviraj Meni",
  grantActionExisting: "Ponovo aktiviraj Meni",
  deactivateAction: "Deaktiviraj Meni",
  openEditor: "Otvori editor",
  openPublic: "Otvori javnu stranicu",

  // Plans & Tiers (§2.7).
  planLabel: "Plan",
  planPickerLabel: "Plan za Meni",
  planBasic: "Basic",
  planPremium: "Premium",
  planEnterprise: "Enterprise",

  // Migration SLA & stages (§2.9).
  migrationHeading: "Status unosa menija",
  migrationSlaNote: "Besplatan unos menija u roku od 2 radna dana.",
  stageLabel: "Faza obrade",
  stageReceived: "Primljeno",
  stageInProgress: "U izradi",
  stageReview: "Na potvrdi",
  stagePublished: "Objavljeno",
  stageChangeAction: "Promeni fazu",
  stageChangeSuccess: "Faza obrade je uspešno promenjena.",
  stageChangeError: "Promena faze nije uspela.",

  // Stats and metrics.
  groupsCount: "Grupe: {count}",
  itemsCount: "Stavke: {count}",
  lastPublished: "Poslednja objava: {date}",
  neverPublished: "Još nije objavljeno",

  // Export action (§2.9 PDF & Excel).
  exportHeading: "Izvoz menija",
  exportPdfAction: "Preuzmi PDF",
  exportExcelAction: "Preuzmi Excel",
  exportPdfLoading: "Generisanje PDF dokumenta…",
  exportExcelLoading: "Generisanje Excel tabele…",
  exportSuccess: "Izvoz je uspešno završen.",
  exportError: "Došlo je do greške prilikom izvoza menija.",

  // Warnings (TASK-58: waiter "nema više" overwrite risk, §3 Risk 10).
  unsavedChangesWarning:
    "Nacrt sadrži nesačuvane izmene. Objavljivanje može poništiti dostupnost stavki koju je konobar postavio u sali.",
  overwriteAvailabilityConfirm: "Objavi i prepiši dostupnost",

  // TASK-58 — status block.
  statusLabel: "Status",
  draftDirtyNote: "Nacrt ima neobjavljene izmene.",
  receivedLabel: "Primljeno",
  deadlineLabel: "Rok (2 radna dana)",
  deadlineOverdue: "Rok je probijen",
  stageChangedAt: "Faza promenjena: {date}",

  // TASK-58 — data entry on the client's behalf (the line import).
  importHeading: "Unos menija u ime klijenta",
  importHelp:
    "Jedna linija = jedna stavka. „# Naziv grupe | tip“ otvara grupu (tip je podrazumevani tip stavki, npr. piće, jelo); „Naziv | cena | opis“ je stavka (cena prazna kad se naplaćuje po varijantama); „- 0.3 l | 250“ je varijanta prethodne stavke. Uvoz zamenjuje ceo nacrt; oblike grupa, ikonice i dnevne ponude doterajte u editoru.",
  importPlaceholder:
    "# Piće | piće\nDomaća kafa | 180\nŠljivovica | | domaća, 45%\n- 0.3 l | 250\n- 0.5 l | 390\n\n# Jela | jelo\nĆevapi | 890 | deset komada",
  importPreview: "{groups} grupa · {items} stavki · {variants} varijanti",
  importWarnings: "Preskočene linije: {count}",
  importAction: "Uvezi u nacrt",
  importReplaceConfirm:
    "Nacrt već sadrži {count} stavki. Uvoz zamenjuje ceo nacrt. Nastaviti?",
  importSuccess: "Nacrt je uvezen: {items} stavki.",
  importError: "Uvoz nije uspeo.",
  importTooLarge:
    "Uvoz odbijen: {count} stavki prelazi granicu od {max} stavki po meniju. Javna stranica menija ne može da učita veći meni — podelite ga ili smanjite broj stavki.",
  importEmpty: "Nema stavki za uvoz.",

  // TASK-58 — publish on the client's behalf.
  publishForClientAction: "Objavi u ime klijenta",
  publishForClientSuccess: "Meni je objavljen u ime klijenta.",
  publishForClientKept: "Zadržano „nema više“ iz sale za: {names}",
  publishForClientError: "Objava nije uspela.",

  // TASK-58 — export labels the writers stamp into the files (lib/menu-export).
  // PLACEHOLDER (RFC-003 §5 Q7): internal tool, draft-sourced, plain template.
  exportInternalNote:
    "Interni alat: izvoz trenutnog nacrta, samo za administratore (klijentski izvoz čeka odluku vlasnika).",
  exportSubtitle: "Izvoz nacrta: {date}",
  exportUnavailable: "(nema više)",
  exportPageOf: "Strana {page} od {pages}",
  exportColGroup: "Grupa",
  exportColShape: "Oblik grupe",
  exportColName: "Naziv",
  exportColDescription: "Opis",
  exportColProductType: "Tip",
  exportColPrice: "Cena (RSD)",
  exportColVariants: "Varijante",
  exportColAvailable: "Dostupno",
  exportColDaypart: "Dnevna ponuda",
  exportYes: "Da",
  exportNo: "Ne",
  exportSheetName: "Meni",

  // Dialogs & toasts.
  grantSuccess: "Meni je uspešno aktiviran.",
  grantSuccessExisting: "Meni je ponovo aktiviran. Sadržaj je sačuvan.",
  grantError: "Aktivacija menija nije uspela.",
  grantSlugConflict: "Izvedeni slug Menija se već koristi.",
  deactivateSuccess: "Meni je deaktiviran. Podaci su sačuvani.",
  deactivateError: "Deaktivacija menija nije uspela.",
  deactivateDialogTitle: "Deaktivirati Meni za ovaj lokal?",
  deactivateDialogBody:
    "Javna stranica menija biće nedostupna posetiocima, ali sve grupe, stavke i uneti podaci ostaju sačuvani.",
  deactivateConfirm: "Deaktiviraj",
  deactivateCancel: "Odustani",
} as const satisfies MenuAdminDict;
