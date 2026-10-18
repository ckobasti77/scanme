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
    "migration/legacy_menu_missing": "Ovaj lokal nema stari meni koji bi se prebacio.",
    "migration/legacy_menu_mismatch":
      "Usluga je povezana sa drugim starim menijem od onog koji gosti vide. Proverite vezu pre migracije.",
    "migration/default_page_missing":
      "Meni nema aktivnu stranicu „Kompletan meni“ u koju bi se uvezao sadržaj.",
    // K15 — the article image (lib/menu/errors/media.ts).
    "media/too_large": "Slika je veća od 10 MB. Izaberite manju sliku.",
    "media/wrong_type": "Ovaj fajl nije slika u formatu JPG, PNG ili WebP.",
    "media/heic": "HEIC fotografije nisu podržane. Sačuvajte sliku kao JPG pa je izaberite ponovo.",
    "media/empty": "Fajl je prazan ili nije stigao do servera. Izaberite sliku ponovo.",
    "media/wrong_state": "Ova slika je već obrađena ili je otpremanje prekinuto. Izaberite sliku ponovo.",
    "media/too_many": "Previše slika u kratkom roku. Pokušajte ponovo za sat vremena.",
    "media/unreadable": "Ova slika ne može da se pročita. Sačuvajte je ponovo kao JPG ili PNG i pokušajte opet.",
    "media/disabled": "Otpremanje slika trenutno ne radi. Javite se ScanMe timu.",
    "media/invalid_secret": "Otpremanje slika trenutno ne radi. Javite se ScanMe timu.",
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
  migrationIssues: {
    source_changed:
      "Stari meni je izmenjen posle početka migracije. Prvo uklonite prebačen sadržaj, pa pokrenite migraciju ponovo.",
    sections_limit: "Stranica bi imala više od 100 sekcija. Spojite grupe pre migracije.",
    articles_limit: "Meni bi imao više od 2.000 artikala.",
    placements_limit: "Stranica bi imala više od 4.000 prikaza artikala.",
    import_target_not_empty:
      "Nacrt već ima artikle. Uvoz ide samo u nacrt bez artikala.",
    import_too_large: "Uvoz je prevelik za jedan korak. Podelite ga na manje delove.",
    cutover_active:
      "Stari meni je već isključen. Prvo poništite prelazak, pa uklonite prebačen sadržaj.",
    not_migrated: "Migracija još nije završena.",
    not_published:
      "Novi meni još nije objavljen. Stari meni se isključuje tek kada gosti imaju novi.",
    source_empty: "Stari meni nema nijednu stavku.",
    draft_has_unpublished_changes:
      "Stari meni ima neobjavljene izmene. Prebačen je nacrt, ne javna verzija.",
    target_not_empty: "Nacrt već ima artikle koji ne dolaze iz starog menija.",
    item_name_empty: "Stavka bez naziva nije prebačena.",
    section_untitled: "Grupa nema naziv. Sekcija je dobila privremen naziv.",
    variant_name_empty: "Varijanta nema naziv. Dobila je privremen naziv.",
    text_whitespace_changed: "Prelom teksta ili višestruki razmaci su sažeti. Proverite tekst.",
    text_cut: "Tekst je bio predug i skraćen je. Proverite tekst.",
    text_encoding_suspect:
      "Tekst izgleda kao da je izgubio dijakritiku (npr. „Ä‡“ umesto „ć“). Proverite tekst.",
    diacritics_absent:
      "Nijedan naziv nema dijakritiku (č, ć, š, ž, đ). Proverite da li se izgubila pri unosu.",
    price_missing: "Artikal nema cenu ni varijantu sa cenom. Ne može da se objavi dok se ne dopuni.",
    price_zero: "Cena je 0 RSD. Proverite da li je tačna.",
    price_rounded: "Cena nije bila u celim dinarima i zaokružena je.",
    price_invalid: "Cena nije ispravna i nije prebačena.",
    variants_truncated: "Artikal ima više od 20 varijanti. Prebačeno je prvih 20.",
    duplicate_name: "Više artikala ima isti naziv. Proverite da li je to isti proizvod.",
    duplicate_source_id:
      "Stavka je u starom meniju imala ponovljen ili prazan identifikator. Proverite da nije prebačena dvaput.",
    image_pending: "Slika je sačuvana i čeka obradu. Do tada se prikazuje ikonica.",
    unavailable_from_live:
      "Na javnom meniju je označeno „nema više“. Artikal je prebačen kao privremeno nedostupan.",
    video_unmapped: "Video se ne prenosi u novi meni.",
    pairings_unmapped: "Preporuke „Ide uz“ se ne prenose u novi meni.",
    daypart_unmapped: "Delovi dana (doručak, ručak, večera) se ne prenose. Sekcije se prikazuju stalno.",
    group_shape_unmapped:
      "Oblik grupe se ne prenosi. Izgled celog menija se bira u editoru.",
    name_differs: "Naziv se razlikuje od starog menija.",
    price_differs: "Cena se razlikuje od starog menija.",
    variants_differ: "Varijante se razlikuju od starog menija.",
    placement_missing: "Artikal nije u sekciji u koju je prebačen.",
    order_differs: "Redosled artikala u sekciji se razlikuje od starog menija.",
  },
  migrationManualChecks: {
    image_rights: "Proverite da lokal ima pravo da koristi svaku sliku.",
    allergens_provided:
      "Unesite alergene samo tamo gde ih je lokal dostavio. Stari meni ih nema.",
    phone_layout: "Pogledajte pregled menija na telefonu pre objave.",
    preview_before_publish: "Lokal ili ScanMe pregleda nacrt pre objave.",
  },
  migrationFallbacks: {
    sectionName: "Bez naziva",
    variantName: "Varijanta",
  },
} as const satisfies MenuDomenDict;
