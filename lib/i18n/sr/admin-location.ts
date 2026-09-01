import type { AdminLocationDict } from "../types";

// Admin podstranice po lokalu + sidebar lokala (components/admin/location-admin.tsx,
// TASK-41, RFC-002 §2.6). Ispod tabele korisnika (TASK-40): uđeš u jedan lokal i
// vidiš SAMO podstranice za usluge koje su na njemu aktivne; za lanac (nalog sa
// više lokala) sa strane stoji sidebar za skok između lokala. `{...}` kroz fmt().
export const adminLocationSr = {
  eyebrow: "Lokal",
  backToCustomers: "Svi korisnici",
  backToCustomersAria: "Nazad na tabelu korisnika",
  notFoundTitle: "Ova stranica ne postoji",
  notFoundBody:
    "Lokal ili podstranica koju tražiš ne postoji — ili usluga nije aktivna na ovom lokalu. Vrati se na tabelu korisnika.",
  loadError: "Podaci nisu učitani.",

  planBasic: "Basic",
  planPremium: "Premium",
  planEnterprise: "Enterprise",
  planNone: "—",
  periodMonthly: "Mesečno",
  periodAnnual: "Godišnje",
  periodNone: "—",
  statusActive: "Aktivan",
  statusInactive: "Neaktivan",

  sidebarHeading: "Lokali u lancu",
  sidebarServiceCount: "{count} usluga",
  sidebarCurrentAria: "{name} — trenutni lokal",

  subpagesHeading: "Podstranice",
  subpageLinks: "ScanMe Links",
  subpageReview: "Google Review",
  subpageVenue: "ScanMe Venue",
  subpageMenuComing: "ScanMe Page",
  subpageMenuLive: "Meni",
  noActiveSubpages: "Nijedna podstranica nije aktivna",
  noActiveSubpagesBody:
    "Ovaj lokal još nema nijednu uslugu sa podstranicom (Links, Review, Venue). Aktiviraj uslugu iz tabele korisnika pa će se podstranica pojaviti ovde.",
  overviewHeading: "Aktivne podstranice",
  overviewIntro:
    "Prikazuju se samo podstranice za usluge koje su stvarno aktivne na ovom lokalu.",
  openSubpage: "Otvori",

  bodyLinksIntro:
    "ScanMe Links stranica ovog lokala — javni prikaz i editor.",
  bodyReviewIntro:
    "Google Review tok ovog lokala — kartica i klijentski panel.",
  bodyVenueIntro:
    "ScanMe Venue stranica ovog lokala — javni prikaz i editor događaja.",
  openPublic: "Otvori javnu stranicu",
  openEditor: "Otvori editor",
  openClientPanel: "Otvori klijentski panel",
  serviceStatusLabel: "Status usluge",

  inactiveNoticeTitle: "Usluga nije aktivna",
  inactiveNoticeBody:
    "Ova usluga nije aktivna na ovom lokalu, pa podstranica ne postoji.",
} as const satisfies AdminLocationDict;
