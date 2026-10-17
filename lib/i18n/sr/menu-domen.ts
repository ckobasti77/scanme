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
    "plan/premium_required": "Ova mogućnost je deo Premium naloga.",
    "plan/language_limit":
      "Standard paket ima najviše dva jezika po meniju, uključujući srpski. Za više jezika potreban je Premium nalog.",
    "room_service/category_not_empty":
      "Kategorija nije prazna. Prvo premestite ili uklonite artikle iz nje.",
    "article/promo_invalid":
      "Akcijska cena mora biti niža od regularne, a popust između 1 i 99 %. Akcija sa unetom cenom ne može da se koristi uz varijante.",
    "article/allergens_disabled":
      "Alergeni nisu uključeni za ovaj meni. Uključite ih da biste ih unosili.",
    "article/combo_component_invalid":
      "Kombo može da sadrži samo postojeće obične artikle ovog menija, svaki jednom, sa količinom od 1 do 20.",
    "article/not_combo": "Ova radnja nije dostupna za ovu vrstu artikla.",
    "article/addon_rules_invalid":
      "Proverite pravila grupe: najmanji broj izbora ne sme biti veći od najvećeg.",
    "article/addon_group_attached": "Ova grupa je već dodata na artikal.",
    "article/addon_group_not_attached": "Ova grupa nije dodata na artikal.",
    "menu/publish_too_large":
      "Meni je prevelik za jednu objavu. Javni meni nije promenjen. Obratite se ScanMe timu.",
    "menu/restore_too_large":
      "Ova verzija je prevelika da bi se vratila odjednom. Nacrt nije promenjen. Obratite se ScanMe timu.",
  },
  allergens: {
    gluten: "Žitarice koje sadrže gluten",
    crustaceans: "Rakovi i proizvodi od rakova",
    eggs: "Jaja",
    fish: "Riba",
    peanuts: "Kikiriki",
    soybeans: "Soja",
    milk: "Mleko i mlečni proizvodi (uključujući laktozu)",
    nuts: "Orašasti plodovi",
    celery: "Celer",
    mustard: "Slačica",
    sesame: "Susam",
    sulphites: "Sumpor-dioksid i sulfiti",
    lupin: "Lupina",
    molluscs: "Mekušci",
    other: "Drugo",
  },
  allergenKinds: {
    contains: "Sadrži",
    mayContain: "Može sadržati tragove",
  },
  allergenDisclaimer:
    "Informacije o alergenima unosi lokal i mogu biti nepotpune. Ako imate alergiju ili intoleranciju, obavezno proverite sastav sa osobljem pre poručivanja.",
  tags: {
    vegan: "Vegansko",
    vegetarian: "Vegetarijansko",
    spicy: "Ljuto",
    recommended: "Preporuka",
    new: "Novo",
    house_special: "Specijalitet kuće",
    homemade: "Domaće",
  },
  promoLabels: {
    promo: "Akcija",
    recommended: "Preporuka",
  },
  unavailable: "Privremeno nedostupno",
  publishIssues: {
    name_missing: "Artikal nema naziv.",
    section_missing: "Artikal nije ni u jednoj sekciji.",
    price_missing: "Artikal nema cenu ni varijantu sa cenom.",
    variants_empty: "Varijante su uključene, ali nijedna nije dodata. Prikazuje se osnovna cena.",
    variant_price_missing: "Varijanta nema cenu, a artikal nema osnovnu cenu.",
    addon_group_empty: "Grupa dodataka nema nijedan dodatak.",
    addon_group_unsatisfiable: "Grupa traži više izbora nego što ima dodataka.",
    promo_invalid: "Akcija ne može da se primeni, pa se prikazuje regularna cena.",
    promo_schedule_premium:
      "Zakazana akcija je deo Premium naloga. Bez Premium-a se neće zakazati.",
    combo_price_check: "Promenjena je cena artikla iz komboa. Proverite cenu komboa.",
    combo_empty: "Kombo nema nijedan artikal.",
    article_unplaced: "Artikal nije ni na jednoj stranici, pa ga gosti neće videti.",
    translation_missing:
      "Neki tekstovi nemaju potvrđen prevod. Gosti će na tom jeziku videti tekst na srpskom.",
    room_service_premium:
      "Room service je deo Premium naloga. Bez Premium-a neće biti objavljen.",
    language_premium:
      "Ovaj jezik prelazi broj jezika u Standard paketu i neće biti objavljen.",
  },
  publishRefusals: {
    stale_draft:
      "Nacrt je izmenjen posle vašeg pregleda. Pregledajte najnovije izmene pa objavite ponovo.",
    no_changes: "Nema neobjavljenih izmena. Javni meni je već ažuran.",
    validation_failed: "Objava nije moguća dok se ne isprave označene greške.",
    confirmation_required: "Pregledajte upozorenja i potvrdite da želite da objavite.",
  },
} as const satisfies MenuDomenDict;
