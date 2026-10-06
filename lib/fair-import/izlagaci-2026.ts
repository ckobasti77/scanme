// Izlagači 2026 — the exhibitors of Sajam elektromobilnosti (9–11. 10. 2026.)
// exactly as the organizer lists them on https://sajamautomobila.com/ucesnici-2026/
// (stanje 6. 10. 2026.): the hall under the map, the entrance area ("ulazni
// deo") and the rear area ("zadnji deo"), in the page order, without
// duplicates. `websiteUrl` is the link the organizer gives; the logo is the
// organizer's image, saved under public/fair/izlagaci/2026/. Nothing else is
// invented: no contact, no e-mail, no package (everyone starts on the free
// tier; Starter/Napredni belong to a car model).
//
// convex/fairExhibitorImport.ts writes them idempotently (event-only client +
// participation) by the stable codes below.

export type FairSiteExhibitorZone = "hala" | "ulaz" | "zadnji-deo";

export type FairSiteExhibitor = {
  /** Stable lowercase key: the SMK/SML codes and the participation key derive from it. */
  key: string;
  name: string;
  websiteUrl?: string;
  /** File in public/fair/izlagaci/2026/. */
  logoFile: string;
  zone: FairSiteExhibitorZone;
};

export const FAIR_SITE_EXHIBITORS_SOURCE = "https://sajamautomobila.com/ucesnici-2026/";
export const FAIR_SITE_LOGO_BASE = "/fair/izlagaci/2026";

export const ELEKTROMOBILNOST_2026_EXHIBITORS: readonly FairSiteExhibitor[] = [
  // Hala (lista ispod mape sajma)
  { key: "ferum-baw", name: "Ferum BAW", websiteUrl: "https://www.ferum-doo.com/", logoFile: "ferum-baw.jpg", zone: "hala" },
  { key: "ferum-yudo", name: "Ferum Yudo", websiteUrl: "https://www.ferum-doo.com/", logoFile: "ferum-yudo.jpg", zone: "hala" },
  { key: "bentu", name: "Bentu", websiteUrl: "https://bentu.rs/", logoFile: "bentu.jpg", zone: "hala" },
  { key: "xtreme-motors", name: "Xtreme Motors", websiteUrl: "https://xtreme.rs/", logoFile: "xtreme-motors.jpg", zone: "hala" },
  { key: "dualtron", name: "Dualtron", websiteUrl: "https://www.dualtron.rs/", logoFile: "dualtron.jpg", zone: "hala" },
  { key: "toyota", name: "Toyota", websiteUrl: "https://www.toyota.rs/retailers/raavex-group-doo", logoFile: "toyota.jpg", zone: "hala" },
  {
    key: "citroen",
    name: "Citroën",
    websiteUrl: "https://www.citroen.rs/alati/pronadji-prodajno-servisni-centar.html?searchTerm=raavex&path=L2NvbnRlbnQvY2l0cm9lbi93b3JsZHdpZGUvc2VyYmlhL3Jz&searchType=name",
    logoFile: "citroen.jpg",
    zone: "hala",
  },
  { key: "byd", name: "BYD", websiteUrl: "https://byd-auto.rs/", logoFile: "byd.jpg", zone: "hala" },
  { key: "geely", name: "Geely", websiteUrl: "https://www.geelyauto.rs/zastupnici", logoFile: "geely.jpg", zone: "hala" },
  { key: "motogrini", name: "Motogrini", websiteUrl: "http://motogrini.rs/", logoFile: "motogrini.jpg", zone: "hala" },
  { key: "farizon", name: "Farizon", websiteUrl: "https://farizon.rs/", logoFile: "farizon.jpg", zone: "hala" },
  { key: "ford", name: "Ford", websiteUrl: "https://ford.rs/", logoFile: "ford.jpg", zone: "hala" },
  { key: "mg", name: "MG", websiteUrl: "https://www.mgmotor.rs/", logoFile: "mg.jpg", zone: "hala" },
  { key: "foton", name: "Foton", websiteUrl: "https://fotonserbia.rs/", logoFile: "foton.jpg", zone: "hala" },
  { key: "mazda", name: "Mazda", websiteUrl: "https://www.automg.mazda.rs/o-nama/kompanija", logoFile: "mazda.jpg", zone: "hala" },
  { key: "chery", name: "Chery", websiteUrl: "https://www.cheryauto.rs/", logoFile: "chery.jpg", zone: "hala" },
  { key: "jmev", name: "JMEV", websiteUrl: "https://www.jmev.rs/", logoFile: "jmev.jpg", zone: "hala" },
  { key: "jac", name: "JAC", websiteUrl: "https://jacmotors.rs/", logoFile: "jac.jpg", zone: "hala" },
  { key: "changan", name: "Changan", websiteUrl: "https://changanbalkans.com/rs/dilerska-mreza/", logoFile: "changan.jpg", zone: "hala" },
  { key: "skoda", name: "Škoda", websiteUrl: "https://www.skoda-auto.rs/content/acp-nis", logoFile: "skoda.jpg", zone: "hala" },
  { key: "venera-bike", name: "Venera Bike", websiteUrl: "https://www.venerabike.rs/", logoFile: "venera-bike.jpg", zone: "hala" },
  { key: "hotel-lotos", name: "Hotel Lotos", websiteUrl: "https://hotellotos.rs/", logoFile: "hotel-lotos.jpg", zone: "hala" },
  { key: "restoran-vidovdan", name: "Restoran Vidovdan", websiteUrl: "https://restoranvidovdan.rs/", logoFile: "restoran-vidovdan.jpg", zone: "hala" },
  // Ulazni deo (Venera Bike je i u hali — upisan jednom)
  { key: "aster-marketing", name: "Aster Marketing", websiteUrl: "https://www.instagram.com/aster.event.design/", logoFile: "aster-marketing.jpg", zone: "ulaz" },
  { key: "zepter", name: "Zepter", websiteUrl: "https://www.zepter.rs/", logoFile: "zepter.jpg", zone: "ulaz" },
  { key: "makete", name: "Makete", logoFile: "makete.jpg", zone: "ulaz" },
  { key: "detailing-store", name: "Detailing Store", websiteUrl: "https://detailingstore.rs/", logoFile: "detailing-store.jpg", zone: "ulaz" },
  { key: "enigma-it", name: "Enigma IT", websiteUrl: "https://www.enigmait.rs/", logoFile: "enigma-it.jpg", zone: "ulaz" },
  { key: "scanme", name: "ScanMe", websiteUrl: "https://www.scanme.rs/", logoFile: "scanme.jpg", zone: "ulaz" },
  { key: "ets-mija-stanimirovic", name: "ETŠ Mija Stanimirović", websiteUrl: "https://etsmijanis.edu.rs/", logoFile: "ets-mija-stanimirovic.jpg", zone: "ulaz" },
  { key: "turisticka-organizacija-nis", name: "Turistička organizacija Niš", websiteUrl: "https://visitnis.org/", logoFile: "turisticka-organizacija-nis.jpg", zone: "ulaz" },
  { key: "jkp-direkcija-za-javni-prevoz", name: "JKP Direkcija za javni prevoz grada Niša", websiteUrl: "https://jgpnis.rs/", logoFile: "jkp-direkcija-za-javni-prevoz.jpg", zone: "ulaz" },
  { key: "bracinac-artvark", name: "Bračinac / Artvark Electric & Solar", websiteUrl: "https://www.facebook.com/artvark.solar/", logoFile: "bracinac-artvark.jpg", zone: "ulaz" },
  { key: "kostic-rent-a-car", name: "Kostić Rent a Car", websiteUrl: "https://www.instagram.com/rentacar_kostic/", logoFile: "kostic-rent-a-car.jpg", zone: "ulaz" },
  { key: "ev-charging-solutions", name: "EV Charging Solutions", websiteUrl: "https://www.evchargingsolutions.rs/", logoFile: "ev-charging-solutions.jpg", zone: "ulaz" },
  { key: "markus-pro", name: "Auto servis Markus Pro", websiteUrl: "https://www.autoservismarkus.rs/", logoFile: "markus-pro.jpg", zone: "ulaz" },
  { key: "jkp-parking-servis-nis", name: "JKP Parking servis Niš", websiteUrl: "https://www.nisparking.rs/sr/", logoFile: "jkp-parking-servis-nis.jpg", zone: "ulaz" },
  // Zadnji deo — 9–11. 10. bez linka; link je onaj koji organizator daje za AUTO1 u terminu 30. 10.
  { key: "auto1", name: "AUTO1.com", websiteUrl: "https://www.auto1.com/sr/home", logoFile: "auto1.png", zone: "zadnji-deo" },
];

/** Stable human codes of one exhibitor (accounts.smkCode, businesses.smlCode, participation key, business slug). */
export function fairSiteExhibitorCodes(key: string) {
  const upper = key.toUpperCase();
  return {
    smkCode: `SMK-IZL26-${upper}`,
    smlCode: `SML-IZL26-${upper}`,
    participationKey: `izl26-${key}`,
    slug: `izlagac-2026-${key}`,
  };
}

export function fairSiteLogoUrl(exhibitor: Pick<FairSiteExhibitor, "logoFile">) {
  return `${FAIR_SITE_LOGO_BASE}/${exhibitor.logoFile}`;
}
