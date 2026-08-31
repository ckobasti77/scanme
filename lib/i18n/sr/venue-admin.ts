import type { VenueAdminDict } from "../types";

// Admin Venue provisioning console copy (components/admin/venue-admin.tsx). The
// operator grants Venue to a business, picks its plan tier, deactivates it, and
// opens the editor / public page from here. Plan/status labels are their own keys
// (not shared with venue-editor) so the surface ships self-contained. `{...}`
// placeholders are filled via fmt().
export const venueAdminSr = {
  eyebrow: "ScanMe Venue",
  title: "Lokali i Venue stranice",
  listLabel: "Lista lokala",
  listCount: "Lokali ({count})",
  listEmpty: "Još nema lokala. Dodajte lokal u ScanMe Links pa mu ovde aktivirajte Venue.",
  selectPrompt: "Izaberite lokal da biste videli ili aktivirali Venue.",
  loadError: "Podaci nisu učitani.",
  venueActive: "Venue je aktivan",
  venueInactive: "Venue je deaktiviran",
  venueNone: "Venue nije aktiviran",
  planLabel: "Plan",
  planPickerLabel: "Plan za Venue",
  planBasic: "Basic",
  planPremium: "Premium",
  currentEventLabel: "Trenutni događaj",
  noEventYet: "Još nema događaja.",
  statusDraft: "Nacrt",
  statusScheduled: "Zakazan",
  statusLive: "Uživo",
  statusEnded: "Završen",
  statusArchived: "Arhiviran",
  grantAction: "Aktiviraj Venue",
  grantActionExisting: "Ponovo aktiviraj Venue",
  deactivateAction: "Deaktiviraj Venue",
  openEditor: "Otvori editor",
  openPublic: "Otvori javnu stranicu",
  grantSuccess: "Venue je aktiviran. Prvi događaj je spreman za uređivanje.",
  grantSuccessExisting: "Venue je ponovo aktiviran. Sadržaj je sačuvan.",
  grantError: "Venue nije aktiviran.",
  deactivateSuccess: "Venue je deaktiviran. Događaji i sadržaj su sačuvani.",
  deactivateError: "Venue nije deaktiviran.",
  deactivateDialogTitle: "Deaktivirati Venue za ovaj lokal?",
  deactivateDialogBody:
    "Javna stranica prikazuje neaktivno stanje, ali događaji i objavljeni sadržaj ostaju sačuvani. Ponovnom aktivacijom se sve vraća.",
  deactivateConfirm: "Deaktiviraj",
  deactivateCancel: "Otkaži",
} as const satisfies VenueAdminDict;
