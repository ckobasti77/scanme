import type { MenuDict } from "../types";

// The public Menu surface (RFC-003 §2.11 — TASK-57 owns its full copy). TASK-51
// seeds only what the five group-shape renderers (components/menu/blocks/**)
// say on the page: the collapsed-items caret label, the "nema više" badge, the
// price format, the footer brand and the empty-menu note. TASK-52/53/57 extend
// this surface; nothing here is editor copy (that is sr/menu-editor.ts).
export const menuSr = {
  // Route metadata.
  metaTitle: "{name} · Meni",
  metaDescription: "Pogledajte meni i ponudu lokala {name}.",
  // 404 / empty state.
  notFoundTitle: "Meni nije pronađen",
  notFoundBody:
    "Ovaj lokal još uvek nema objavljen meni ili link nije ispravan.",
  emptyMenu: "Meni se priprema.",
  emptyGroup: "U ovoj grupi trenutno nema stavki.",
  // Navigation & accordion chrome.
  navAria: "Grupe menija",
  moreItems: "Još {count}",
  showLess: "Prikaži manje",
  // Item badges & pricing.
  unavailableBadge: "Nema više",
  priceRsd: "{price} RSD",
  poweredBy: "ScanMe Meni",
  // Variants & item details.
  variantsTitle: "Varijante",
  variantsAria: "Varijante stavke {name}",
  itemDetailsAria: "Detalji o stavci {name}",
  videoAria: "Video za {name}",
  sheetClose: "Zatvori",
  // Pairings "Ide uz".
  pairingsTitle: "Ide uz",
  pairItemAria: "Pogledaj stavku {name}",
  // In-sheet inquiry action.
  inquiryAction: "Pošaljite upit",
  inquiryAria: "Pošaljite upit za stavku {name}",
  inquirySuccess: "Upit je uspešno poslat.",
  inquiryError: "Slanje upita nije uspelo.",
} as const satisfies MenuDict;
