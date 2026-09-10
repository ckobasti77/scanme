import type { AdminDomainDict } from "../types";

/** Single source of canonical names for offers, orders and Admin V1. */
export const adminDomainSr = {
  services: { scanme_links: "ScanMe Links", scanme_review: "ScanMe Review", scanme_menu: "ScanMe Meni" },
  products: {
    "two-piece-stand": "Dvodelni stalak",
    "compact-stand": "Jednodelni stalak",
    stickers: "Nalepnica",
    "window-film": "PVC folija",
    "premium-engraved-stand": "Premium gravirani stalak",
  },
  customDesign: "Custom design",
  friendTag: "Prijatelj",
} as const satisfies AdminDomainDict;
