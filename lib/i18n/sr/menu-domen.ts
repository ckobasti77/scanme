import type { MenuDomenDict } from "../types";

// ScanMe Menu V1 — shared domain words (K02). Placeholders are filled via fmt().
export const menuDomenSr = {
  defaultPageName: "Kompletan meni",
  pageCopyName: "{name} (kopija)",
  modes: {
    hospitality: "Ugostiteljstvo",
    services: "Usluge",
    retail: "Prodaja i preuzimanje",
  },
  serviceLabel: "ScanMe Menu · {mode}",
  roles: {
    owner: "Vlasnik",
    manager: "Menadžer",
    editor: "Urednik",
    staff: "Osoblje",
    admin: "ScanMe administrator",
  },
  modeChangeNotice:
    "Podaci i podešavanja se ne prenose slepo između režima. Funkcije koje novi režim ne podržava biće isključene, a ništa se ne briše.",
  errors: {
    "menu/unauthenticated": "Prijavite se da biste nastavili.",
    "menu/not_found": "Traženi meni ili stavka ne postoji.",
    "menu/forbidden": "Nemate dozvolu za ovu radnju.",
    "menu/service_inactive": "ScanMe Menu trenutno nije aktivan za ovaj lokal.",
    "menu/editing_disabled":
      "Uređivanje menija je trenutno isključeno. Obratite se ScanMe timu.",
    "menu/mode_not_available": "Ovaj režim rada još nije dostupan.",
    "menu/service_exists": "Ovaj lokal već ima ScanMe Menu.",
    "menu/invalid_input": "Proverite unete podatke.",
    "menu/conflict":
      "Neko je u međuvremenu sačuvao drugačiju vrednost. Pogledajte novu vrednost i pokušajte ponovo.",
    "menu/limit_reached": "Dostignuta je tehnička granica za ovaj meni.",
    "menu/page_has_qr":
      "Ova stranica je povezana sa QR kodom. Prvo preusmerite ili isključite taj QR kod.",
    "menu/last_page": "Meni mora imati bar jednu aktivnu stranicu.",
    "menu/page_archived": "Stranica je arhivirana. Vratite je da biste je menjali.",
    "menu/placement_exists": "Artikal je već prikazan u ovoj sekciji.",
  },
} as const satisfies MenuDomenDict;
