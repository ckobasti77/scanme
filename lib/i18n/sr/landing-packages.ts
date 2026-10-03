// Serbian copy for the landing page's packages section (RFC-002 §2.3, TASK-39).
//
// The landing stays MARKETING — this section's job is to get a visitor into
// the purchase flow (/kupovina) with a head start, never to price or compute
// anything itself. Co-located like purchase.ts/offer.ts rather than added to
// the shared DictBySurface registry: the landing page is a single surface
// imported directly. The `as const satisfies LandingPackagesDict` below still
// makes a missing key a compile error.
//
// Copy is PROBLEM-first for the five services (a visitor knows "I have a party
// Saturday," not "I need Venue") and NAME-first for the three packages (the fast
// lane — a visitor who already knows what they want skips straight to the
// price). Package member sets and availability are never duplicated here: they
// come from components/purchase/service-catalog.ts, which itself reads the
// engine's own package table, so this dict carries only prose.

import type { PackageId, ServiceId } from "@/lib/pricing/engine";

export interface LandingPackageCopy {
  name: string;
  sentence: string;
  cta: string;
}

export interface LandingServiceCopy {
  name: string;
  problem: string;
}

export interface LandingPackagesDict {
  eyebrow: string;
  heading: string;
  intro: string;
  packages: Record<PackageId, LandingPackageCopy>;
  soonBadge: string;
  soonNote: string;
  buildOwnLabel: string;
  buildOwnCta: string;
  servicesHeading: string;
  servicesIntro: string;
  services: Record<ServiceId, LandingServiceCopy>;
}

export const landingPackagesSr = {
  eyebrow: "ScanMe paketi",
  heading: "Izaberite paket i krenite.",
  intro:
    "Tri gotova paketa za najčešće potrebe. Otvaraju konfigurator sa već izabranim uslugama — ostalo menjate kako želite.",
  packages: {
    lokal: {
      name: "Lokal",
      sentence: "Tvoja tabla i tvoj meni. Jedan QR na stolu.",
      cta: "Izaberi Lokal",
    },
    dogadjaj: {
      name: "Događaj",
      sentence: "Stranica za žurku i slike koje gosti sami naprave.",
      cta: "Izaberi Događaj",
    },
    kompletan: {
      name: "Kompletan ScanMe",
      sentence: "Svih pet usluga na jednoj pretplati — sve što lokal, sto i proslava mogu da zatraže.",
      cta: "Izaberi kompletan ScanMe",
    },
  },
  soonBadge: "uskoro",
  soonNote: "Stiže sa Menijem.",
  buildOwnLabel: "Ili sastavi svoje",
  buildOwnCta: "Otvori konfigurator",
  servicesHeading: "Pet usluga, svaka rešava svoj problem.",
  servicesIntro: "Ne morate da znate nazive — prepoznajte situaciju u kojoj se lokal svakodnevno nađe.",
  services: {
    links: {
      name: "ScanMe Links",
      problem: "Sto pun linkova za meni, rezervaciju i mreže? Jedan QR vodi na sve odjednom.",
    },
    venue: {
      name: "Venue",
      problem: "Žurka je u subotu, a gosti ne znaju gde, kada i kako da stignu.",
    },
    memories: {
      name: "Memories",
      problem: "Posle proslave slike ostanu razbacane po tuđim telefonima. Skupite ih na jedno mesto.",
    },
    menu: {
      name: "Meni",
      problem: "Cena se promenila, a stara štampana kartica i dalje kruži po stolovima.",
    },
    review: {
      name: "Google recenzije",
      problem: "Gost je zadovoljan, ali ne zna kako do Google ocene. Jedan dodir umesto traženja.",
    },
  },
} as const satisfies LandingPackagesDict;
