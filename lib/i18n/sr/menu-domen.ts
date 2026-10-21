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
    // K16 — translations and the AI suggestion (lib/menu/errors/translation.ts).
    "translation/language_off": "Ovaj jezik nije uključen za meni. Jezike menjate u Podešavanjima.",
    "translation/ai_disabled": "Predlog prevoda trenutno nije dostupan. Prevod možete upisati sami.",
    "translation/ai_failed": "Predlog prevoda nije stigao. Pokušajte ponovo ili upišite prevod sami.",
    "translation/source_changed": "Izvorni tekst je u međuvremenu promenjen. Zatražite predlog ponovo.",
    "translation/nothing_to_translate": "Nema teksta za prevod: polja na srpskom su prazna.",
    // K17 — the menu appearance (lib/menu/errors/presentation.ts).
    "presentation/unknown_palette": "Ova paleta ne postoji. Izaberite jednu od ponuđenih paleta.",
    "presentation/unknown_font_pair": "Ovaj par pisma ne postoji. Izaberite jedan od ponuđenih.",
    "presentation/variant_mismatch": "Ova varijanta ne pripada izabranom rasporedu.",
    "presentation/invalid_brand_colors": "Upišite boju brenda u obliku #RRGGBB, na primer #8C2633.",
    "presentation/unreadable":
      "Sa ovim bojama tekst ne bi bio dovoljno čitljiv. Izaberite tamniji tekst ili svetliju pozadinu (ili obrnuto).",
    // K20 — Lokal i QR (lib/menu/errors/floor.ts).
    "floor/position_label_taken": "Već postoji sto ili soba sa ovim nazivom. Izaberite drugi naziv ili broj.",
    "floor/zone_name_taken": "Već postoji zona sa ovim nazivom.",
    "floor/position_has_qr":
      "QR kartica i dalje otvara ovo mesto. Prvo je povežite sa drugim mestom ili je isključite.",
    "floor/position_archived": "Ovo mesto je arhivirano i ne može da se menja.",
    "floor/zone_archived": "Ova zona je arhivirana. Izaberite drugu zonu ili „Bez zone“.",
    "floor/invalid_layout": "Ovo mesto ne staje tu. Pomerite ga unutar rasporeda, na slobodno polje.",
    "floor/card_read_only": "Ovom karticom upravlja ScanMe. Za promenu se obratite podršci.",
    "floor/card_not_menu": "Ova kartica ne otvara meni, pa ne može da se veže za stranicu ili mesto.",
    "floor/page_unavailable": "Ova stranica menija je arhivirana ili ne postoji. Izaberite drugu stranicu.",
    // K21 — guest requests (lib/menu/errors/requests.ts).
    "request/invalid_input": "Zahtev nije ispravan. Proverite korpu i pokušajte ponovo.",
    "request/no_session": "Veza sa Vašim mestom je istekla. Skenirajte QR kod na stolu ili u sobi ponovo.",
    "request/action_off": "Ova radnja trenutno nije dostupna. Obratite se osoblju.",
    "request/rate_limited": "Previše zahteva u kratkom roku. Pokušajte ponovo za minut.",
    "request/menu_unavailable": "Meni trenutno nije dostupan, pa zahtev nije poslat.",
    "request/cart_unavailable": "Neki artikli su upravo postali nedostupni. Uklonite ih da biste poslali porudžbinu.",
    "request/cart_stale": "Neki artikli više nisu u meniju. Uklonite ih i pokušajte ponovo.",
    "request/cart_price_changed": "Cene su se promenile od kada ste ih videli. Proverite novi iznos i pošaljite ponovo.",
    "request/not_found": "Ovaj zahtev ne postoji.",
    "request/not_cancellable": "Ovaj zahtev je osoblje već prihvatilo. Za izmenu se obratite osoblju.",
    "request/invalid_transition": "Zahtev ne može da pređe u ovo stanje.",
    "request/too_many_open": "Više porudžbina sa ovog mesta još čeka konobara. Sačekajte da ih preuzme, pa pošaljite novu.",
    "request/taken": "Ovaj zahtev je već preuzeo neko drugi.",
    // K22 — staff, PINs and the waiter panel (lib/menu/errors/waiter.ts).
    "staff/pin_unavailable": "Prijava PIN-om trenutno nije uključena. Vlasnik i menadžer mogu da uđu svojim nalogom.",
    "staff/pin_format": "PIN ima tačno tri cifre.",
    "staff/pin_taken": "Ovaj PIN već koristi drugi član osoblja. Izaberite drugi ili neka ga sistem izabere.",
    "staff/pin_exhausted": "Nema slobodnog PIN-a. Deaktivirajte članove osoblja koji više ne rade.",
    "staff/wrong_pin": "Pogrešan PIN.",
    "staff/locked": "Previše pogrešnih pokušaja. Prijava je privremeno zaključana.",
    "staff/rate_limited": "Previše pokušaja sa ove mreže. Sačekajte malo, pa pokušajte ponovo.",
    "staff/panel_not_found": "Ovaj link konobarskog panela ne postoji ili je promenjen. Zatražite novi od menadžera.",
    "staff/name_invalid": "Upišite ime (najviše 40 znakova).",
    "staff/limit": "Lokal već ima najveći broj aktivnih članova osoblja.",
    "staff/inactive": "Ovaj član osoblja je deaktiviran.",
    "staff/signed_out": "Prijava na ovom uređaju je istekla. Prijavite se ponovo.",
    "staff/status_changed": "Zahtev se u međuvremenu promenio. Ništa nije izmenjeno.",
    "staff/occupancy_off": "Lokal ne vodi status stolova. Uključuje ga vlasnik ili menadžer u delu Funkcionalnosti.",
    // K25 — reservations (master §11).
    "reservation/off": "Lokal trenutno ne prima rezervacije preko ove forme.",
    "reservation/invalid_input": "Proverite označena polja.",
    "reservation/outside_hours": "Izaberite termin u okviru radnog vremena lokala.",
    "reservation/in_past": "Taj termin je prošao. Izaberite kasniji.",
    "reservation/too_far": "Rezervacija je moguća najviše 60 dana unapred.",
    "reservation/rate_limited": "Previše zahteva za kratko vreme. Pokušajte ponovo za nekoliko minuta.",
    "reservation/too_many_open":
      "Sa ovog telefona već imate tri otvorena zahteva za rezervaciju u ovom lokalu. Sačekajte odgovor ili otkažite jedan u delu Moji zahtevi.",
    "reservation/not_found": "Rezervacija nije pronađena.",
    "reservation/not_cancellable": "Ova rezervacija više ne može da se otkaže.",
    "reservation/status_changed": "Rezervacija se u međuvremenu promenila. Ništa nije izmenjeno.",
    "reservation/invalid_transition": "Ova radnja nije moguća u ovom stanju rezervacije.",
    "reservation/hours_missing": "ScanMe forma traži radno vreme lokala. Unesite ga u Podešavanjima.",
    "reservation/url_invalid": "Upišite ispravan link koji počinje sa https://.",
    "reservation/hours_invalid": "Proverite radno vreme: intervali ne smeju da se preklapaju, a dan ima najviše tri.",
    "reservation/position_invalid": "Taj sto više ne postoji u lokalu. Izaberite drugi.",
    "ping/no_responsible":
      "Ovaj zahtev nije preuzeo niko od osoblja, pa nema kome da se pošalje podsetnik.",
    "ping/too_soon": "Podsetnik za ovaj zahtev je već poslat. Novi možete poslati za nekoliko minuta.",
    "team/invite_exists": "Ova adresa već ima važeću pozivnicu ili je već u timu.",
    "team/invite_invalid": "Ova pozivnica više ne važi. Zatražite novu od vlasnika ili menadžera lokala.",
    "team/email_mismatch":
      "Pozivnica je poslata na drugu e-adresu. Prijavite se nalogom sa adresom na koju je pozivnica stigla.",
    "team/role_forbidden": "Ulogu Vlasnik dodeljuje i menja samo vlasnik lokala.",
    "team/self_change": "Svoju ulogu ne možete menjati niti sebe ukloniti iz tima.",
    "team/full": "Tim je popunjen. Uklonite nekoga pre novog poziva.",
    "team/email_invalid": "Upišite ispravnu e-adresu, na primer ime@example.com.",
    "analytics/invalid_period":
      "Izaberite period od najviše 366 dana, koji ne ide u budućnost i nije stariji od 24 meseca.",
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
  qrCardDefaultLabel: "Meni",
  requestStatuses: { new: "Novi", accepted: "Prihvaćen", done: "Završen", cancelled: "Otkazan" },
  requestKinds: { call: "Poziv konobara", bill: "Račun", order: "Porudžbina" },
  paymentPreferences: { cash: "Gotovina", card: "Kartica" },
  reservationStatuses: {
    new: "Nova",
    accepted: "Prihvaćena",
    declined: "Odbijena",
    change_proposed: "Predložena izmena",
    arrived: "Realizovana",
    cancelled: "Otkazana",
  },
  weekdaysShort: ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"],
  weekdays: ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"],
  relativeDays: { today: "Danas", tomorrow: "Sutra" },
  reservationTerm: "{datum} · {vreme}",
  shortDate: "{dan} {d}. {m}.",
  guests: { one: "{n} osoba", few: "{n} osobe", many: "{n} osoba" },
} as const satisfies MenuDomenDict;
