// Serbian copy for the four-step purchase flow shell (RFC-002 §2.3, TASK-33).
//
// The interface is co-located rather than added to lib/i18n/types.ts: the shell
// is a single surface imported directly (like `offerSr`), and keeping it out of
// the shared `DictBySurface` registry avoids widening `getDict`'s exhaustive
// switch for a scaffold. The `as const satisfies PurchaseDict` below still makes
// a missing key a compile error, exactly like every other surface.

import type { PackageId, ServiceId } from "@/lib/pricing/engine";

export interface PurchaseStepCopy {
  /** Timeline label. */
  label: string;
  /** One-line placeholder body — the real panel lands in TASK-07..10. */
  placeholder: string;
}

/** Copy for one service card (step 1). */
export interface PurchaseServiceCopy {
  name: string;
  tagline: string;
  /** "Šta se dobija" — a short, honest list. */
  benefits: readonly string[];
  /** The "…" of "Sa Premium nalogom još i: …", or `null` when Premium changes
   *  nothing this service surfaces (then the card shows no Premium line). */
  premiumExtra: string | null;
}

export interface PurchasePackageCopy {
  name: string;
  note: string;
}

/** All copy the step-1 panels need beyond the shell chrome. */
export interface PurchaseStep1Copy {
  toggleLabel: string;
  periodMonthly: string;
  periodAnnual: string;
  fromPrice: string; // "od {price} RSD {period}"
  perMonth: string; // "mesečno"
  perYear: string; // "godišnje"
  add: string;
  inCart: string;
  soon: string;
  soonNote: string;
  comboBadge: string;
  comboSoonNote: string;
  previewLabel: string; // aria: "Živi prikaz stranice usluge {name}"
  previewReadOnly: string;
  previewMenuTitle: string;
  previewMenuBody: string;
  previewReviewTitle: string;
  previewReviewBody: string;
  premiumPrefix: string; // "Sa Premium nalogom još i:"
  services: Record<ServiceId, PurchaseServiceCopy>;
  packages: Record<PackageId, PurchasePackageCopy>;
  cartTitle: string;
  cartEmpty: string;
  cartHint: string;
  cartWas: string; // aria label for a struck list price
  cartSavings: string; // "Ušteda {amount} RSD"
  cartNudge: string; // "Dodaj {service} i uštedi još {amount} RSD."
  cartPackageTag: string; // "{name} paket"
}

/** Copy for one owned-service group inside the Premium column (step 2). The
 *  service's own name (step1.services[service].name) is the small
 *  superheading — this only carries the bullet items, and an EMPTY list means
 *  the service contributes nothing beyond the universal future-services line,
 *  so its group is not rendered at all ("ništa što nije kupio se ne
 *  prikazuje" cuts both ways: nothing invented either). */
export interface PurchaseStep2Copy {
  basicTitle: string;
  basicIncludedLabel: string; // "Uključeno, ne plaćaš ništa."
  basicItems: readonly string[];
  basicCta: string; // "Izaberi Basic"
  basicSelected: string; // "Izabrano"
  premiumTitle: string;
  premiumFirstItem: string; // "Sve iz Basic-a"
  /** Per-service bullet items, keyed by ServiceId. Only rendered for a service
   *  the buyer actually owns AND whose list is non-empty. */
  premiumGroups: Record<ServiceId, readonly string[]>;
  premiumFutureLine: string; // "Sve buduće usluge automatski na Premium-u." (last, ungrouped)
  premiumCta: string; // "Nadogradi na Premium"
  premiumSelected: string; // "Izabrano"
  // The Premium price is shown as a DELTA on the buyer's current total — never
  // divided by the number of services (RFC-002 §2.3 hard rule).
  premiumDeltaWithCurrent: string; // "+{amount} {currency} {period} na trenutnih {current} {currency}"
  premiumDeltaOnly: string; // "+{amount} {currency} {period}"
  enterpriseRow: string; // "Imate 10+ lokala? Napravićemo ponudu po meri"
}

/** Step 3 (physical products + per-line service binding, RFC-002 §2.3 / TASK-36).
 *  Physical-product chrome (control headings, template names, dimensions…) is
 *  reused from `offerSr` — this only carries what step 3 adds on top: the
 *  service-binding control, the splitter line, the design-reset reason, and the
 *  read-only order-summary badge that replaced the old editable chip. */
export interface PurchaseStep3Copy {
  productsHeading: string;
  productsHint: string;
  quantity: string;
  add: string;
  inCart: string;
  remove: string; // "Ukloni {product}"
  empty: string; // shown when no products are in the cart yet
  // The service-binding control — the FIRST sidebar item, above Orientation.
  bindingHeading: string; // "Za koju uslugu?"
  bindingRequired: string; // "obavezno"
  bindingHint: string; // "Kartica vodi na izabranu uslugu."
  splitterNote: string; // shown when a line is bound to 2+ services (§2.4)
  designResetNote: string; // "Prethodni dizajn ne postoji za novu uslugu — vraćen na „{template}“."
  // The read-only order summary that opens the cart (NOT a control anymore).
  summaryBadgeLabel: string; // aria: "Pregled porudžbine — otvori korpu"
  serviceCountOne: string; // "{count} usluga"
  serviceCountFew: string; // "{count} usluge"
  serviceCountMany: string; // "{count} usluga"
  cartTitle: string;
  cartServicesHeading: string;
  cartPlanHeading: string;
  cartProductsHeading: string;
  cartProductsEmpty: string;
  cartClose: string;
  designHeading: string; // "Dizajn"
}

export interface PurchaseDict {
  metaTitle: string;
  metaDescription: string;
  skipToFlow: string;
  eyebrow: string;
  title: string;
  steps: readonly [PurchaseStepCopy, PurchaseStepCopy, PurchaseStepCopy, PurchaseStepCopy];
  stepIndicator: string; // "Korak {current} od {total}"
  goToStep: string; // aria for a timeline button: "Idi na korak {n}: {label}"
  back: string;
  next: string;
  finish: string;
  // Split-total bar (money never summed — RFC-002 §2.3).
  currency: string;
  perMonth: string;
  perYear: string;
  oneTime: string;
  planOnRequest: string;
  emptyRecurring: string;
  totalLabel: string;
  // Header order summary.
  summaryEmpty: string;
  planBasic: string;
  planPremium: string;
  planEnterprise: string;
  soonTag: string;
  step1: PurchaseStep1Copy;
  step2: PurchaseStep2Copy;
  step3: PurchaseStep3Copy;
}

export const purchaseSr = {
  metaTitle: "Kupovina | ScanMe",
  metaDescription:
    "Sastavite ScanMe u četiri koraka: usluge, plan, fizički proizvodi, plaćanje. Iznos se računa uživo.",
  skipToFlow: "Pređi na tok kupovine",
  eyebrow: "ScanMe kupovina",
  title: "Sastavite svoj ScanMe.",
  steps: [
    { label: "Usluge", placeholder: "Izbor usluga i paketa stiže u koraku 1 (TASK-07)." },
    { label: "Plan", placeholder: "Basic i Premium kolone stižu u koraku 2 (TASK-08)." },
    { label: "Proizvodi", placeholder: "Konfigurator fizičkih proizvoda stiže u koraku 3 (TASK-09)." },
    { label: "Plaćanje", placeholder: "Zaključivanje porudžbine stiže u koraku 4 (TASK-10)." },
  ],
  stepIndicator: "Korak {current} od {total}",
  goToStep: "Idi na korak {n}: {label}",
  back: "Nazad",
  next: "Dalje",
  finish: "Zaključi",
  currency: "RSD",
  perMonth: "mesečno",
  perYear: "godišnje",
  oneTime: "jednokratno",
  planOnRequest: "plan na upit",
  emptyRecurring: "Izaberite uslugu",
  totalLabel: "Ukupno",
  summaryEmpty: "Nijedna usluga još nije izabrana",
  planBasic: "Basic",
  planPremium: "Premium",
  planEnterprise: "Enterprise",
  soonTag: "uskoro",
  step1: {
    toggleLabel: "Način plaćanja",
    periodMonthly: "Mesečno",
    periodAnnual: "Godišnje",
    fromPrice: "od {price} RSD {period}",
    perMonth: "mesečno",
    perYear: "godišnje",
    add: "Dodaj",
    inCart: "U korpi",
    soon: "uskoro",
    soonNote: "Meni uskoro stiže — biće deo iste kupovine.",
    comboBadge: "Paket",
    comboSoonNote: "Dostupno čim Meni krene.",
    previewLabel: "Živi prikaz stranice usluge {name}",
    previewReadOnly: "Živi prikaz — samo za pregled",
    previewMenuTitle: "Meni uskoro",
    previewMenuBody: "Digitalni jelovnik sa slikama i cenama, bez ponovne štampe.",
    previewReviewTitle: "Google recenzije",
    previewReviewBody: "Gost skenira i otvara se vaša Google stranica za ocenu — jedan dodir do recenzije.",
    premiumPrefix: "Sa Premium nalogom još i:",
    services: {
      links: {
        name: "ScanMe Links",
        tagline: "Jedna stranica sa svim vašim linkovima.",
        benefits: [
          "Meni, rezervacije i društvene mreže na jednom mestu",
          "Izaberite temu koja liči na vaš lokal",
          "Radi sa QR nalepnicom ili stalkom na stolu",
        ],
        premiumExtra: "sve buduće usluge automatski na Premium-u, bez doplate",
      },
      venue: {
        name: "Venue",
        tagline: "Živa stranica događaja za vaše goste.",
        benefits: [
          "Odbrojavanje, raspored, mapa i galerija",
          "Sama prelazi iz najave u događaj pa u arhivu",
          "Gosti sve vide skeniranjem jednog koda",
        ],
        premiumExtra: "sve buduće usluge automatski na Premium-u, bez doplate",
      },
      memories: {
        name: "Memories",
        tagline: "Uspomene cele proslave na jednom mestu.",
        benefits: [
          "Gosti šalju fotografije skeniranjem koda",
          "Zajednička galerija koju svi vide",
          "Zid uživo za projekciju na proslavi",
        ],
        premiumExtra: "do 10 fotografija po gostu i duže čuvanje uspomena",
      },
      menu: {
        name: "Meni",
        tagline: "Digitalni jelovnik bez ponovne štampe.",
        benefits: [
          "Slike, cene i opisi na telefonu gosta",
          "Izmene se vide odmah, bez novog štampanja",
        ],
        premiumExtra: null,
      },
      review: {
        name: "Google recenzije",
        tagline: "Gost stigne pravo na Google ocenu.",
        benefits: [
          "Jedan dodir do recenzije, bez traženja",
          "Više ocena za vaš lokal",
          "Nalepnica ili stalak na svakom stolu",
        ],
        premiumExtra: "sve buduće usluge automatski na Premium-u, bez doplate",
      },
    },
    packages: {
      dogadjaj: { name: "Događaj", note: "Venue + Memories za jednu proslavu" },
      lokal: { name: "Lokal", note: "Links + Meni za svakodnevni sto" },
      kompletan: { name: "Kompletan ScanMe", note: "Svih pet usluga na jednom mestu" },
    },
    cartTitle: "Korpa",
    cartEmpty: "Izaberite uslugu sa leve strane da vidite cenu.",
    cartHint: "Cene se računaju uživo dok birate.",
    cartWas: "puna cena {price} RSD",
    cartSavings: "Ušteda {amount} RSD",
    cartNudge: "Dodaj {service} i uštedi još {amount} RSD.",
    cartPackageTag: "{name} paket",
  },
  step2: {
    basicTitle: "Basic",
    basicIncludedLabel: "Uključeno, ne plaćaš ništa.",
    basicItems: [
      "Sve usluge koje kupite rade odmah — nalog sam po sebi ništa ne naplaćuje.",
      "Standardne granice svake usluge (npr. broj fotografija po gostu na Memories).",
      "Dodajete ili menjate usluge kad god poželite, bez menjanja plana.",
    ],
    basicCta: "Izaberi Basic",
    basicSelected: "Izabrano",
    premiumTitle: "Premium",
    premiumFirstItem: "Sve iz Basic-a",
    premiumGroups: {
      links: [],
      venue: [
        "Rezervacije sa kapacitetom — gost šalje upit za sto, a kad se zona popuni piše „popunjeno“.",
        "Svi blokovi: rezervacije, prošli događaji, kartice ljudi, cenovnik, galerija.",
        "Više događaja zakazanih unapred.",
        "Analitika događaja.",
      ],
      memories: [
        "Do 10 fotografija po gostu umesto 3.",
        "Uspomene se čuvaju godinu dana umesto 30 dana.",
      ],
      menu: [],
      review: [],
    },
    premiumFutureLine: "Sve buduće usluge automatski na Premium-u.",
    premiumCta: "Nadogradi na Premium",
    premiumSelected: "Izabrano",
    premiumDeltaWithCurrent: "+{amount} {currency} {period} na trenutnih {current} {currency}",
    premiumDeltaOnly: "+{amount} {currency} {period}",
    enterpriseRow: "Imate 10+ lokala? Napravićemo ponudu po meri",
  },
  step3: {
    productsHeading: "Fizički proizvodi",
    productsHint: "Kombinujte tipove — svaki pamti svoj tiraž, dizajn i uslugu.",
    quantity: "Tiraž",
    add: "Dodaj",
    inCart: "U korpi",
    remove: "Ukloni {product}",
    empty: "Dodajte proizvod sa leve strane da ga podesite.",
    bindingHeading: "Za koju uslugu?",
    bindingRequired: "obavezno",
    bindingHint: "Kartica vodi na izabranu uslugu — ona određuje i dostupne dizajne.",
    splitterNote:
      "Vezano za više usluga: kartica vodi na razdelnik, gde gost bira uslugu na jednom ekranu.",
    designResetNote: "Prethodni dizajn ne postoji za novu uslugu — vraćen na „{template}“.",
    summaryBadgeLabel: "Pregled porudžbine — otvori korpu",
    serviceCountOne: "{count} usluga",
    serviceCountFew: "{count} usluge",
    serviceCountMany: "{count} usluga",
    cartTitle: "Korpa",
    cartServicesHeading: "Usluge",
    cartPlanHeading: "Plan",
    cartProductsHeading: "Fizički proizvodi",
    cartProductsEmpty: "Još nema fizičkih proizvoda.",
    cartClose: "Zatvori korpu",
    designHeading: "Dizajn",
  },
} as const satisfies PurchaseDict;
