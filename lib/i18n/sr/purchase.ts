// Serbian copy for the four-step purchase flow shell (RFC-002 §2.3, TASK-33).
//
// The interface is co-located rather than added to lib/i18n/types.ts: the shell
// is a single surface imported directly (like `offerSr`), and keeping it out of
// the shared `DictBySurface` registry avoids widening `getDict`'s exhaustive
// switch for a scaffold. The `as const satisfies PurchaseDict` below still makes
// a missing key a compile error, exactly like every other surface.

export interface PurchaseStepCopy {
  /** Timeline label. */
  label: string;
  /** One-line placeholder body — the real panel lands in TASK-07..10. */
  placeholder: string;
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
} as const satisfies PurchaseDict;
