export type IconLibraryId =
  | "lucide"
  | "fa6"
  | "tabler"
  | "ionicons"
  | "phosphor";

export type IconCategoryKey =
  | "brand"
  | "contact"
  | "food"
  | "commerce"
  | "general";

export type IconLibraryMeta = {
  id: IconLibraryId;
  name: string;
  badge: string;
  prefix: string;
  description: string;
};

export const ICON_LIBRARIES: readonly IconLibraryMeta[] = [
  {
    id: "lucide",
    name: "Lucide",
    badge: "Linijske",
    prefix: "lu:",
    description: "Čiste, minimalističke linijske ikonice modernog stila",
  },
  {
    id: "fa6",
    name: "Font Awesome",
    badge: "Solid",
    prefix: "fa6:",
    description: "Solidne, prepoznatljive i upečatljive siluete",
  },
  {
    id: "tabler",
    name: "Tabler",
    badge: "Zaobljene",
    prefix: "tb:",
    description: "Savremene i prijateljske linije sa zaobljenim uglovima",
  },
  {
    id: "ionicons",
    name: "Ionicons",
    badge: "Mobile",
    prefix: "io5:",
    description: "Glatke, moderne mobilne ikonice iOS i Android stila",
  },
  {
    id: "phosphor",
    name: "Phosphor",
    badge: "Savremene",
    prefix: "pi:",
    description: "Svež, fleksibilan i geometrijski čist dizajn",
  },
] as const;

export type IconCategoryMeta = {
  key: IconCategoryKey;
  label: string;
};

export const ICON_CATEGORIES: readonly IconCategoryMeta[] = [
  { key: "brand", label: "Mreže & Brendovi" },
  { key: "contact", label: "Kontakt & Lokacija" },
  { key: "food", label: "Ugostiteljstvo & Hrana" },
  { key: "commerce", label: "Prodaja & Ponude" },
  { key: "general", label: "Opšte & Usluge" },
] as const;

export type IconDefinition = {
  key: string;
  libraryId: IconLibraryId;
  group: IconCategoryKey;
  label: string;
  keywords: readonly string[];
};

export const LUCIDE_ICONS: readonly IconDefinition[] = [
  // Brand
  { key: "lu:instagram", libraryId: "lucide", group: "brand", label: "Instagram", keywords: ["instagram", "ig", "drustvene", "mreze", "social"] },
  { key: "lu:facebook", libraryId: "lucide", group: "brand", label: "Facebook", keywords: ["facebook", "fb", "meta", "social"] },
  { key: "lu:youtube", libraryId: "lucide", group: "brand", label: "YouTube", keywords: ["youtube", "yt", "video", "kanal"] },
  { key: "lu:twitter", libraryId: "lucide", group: "brand", label: "X / Twitter", keywords: ["twitter", "x", "mreza"] },
  { key: "lu:linkedin", libraryId: "lucide", group: "brand", label: "LinkedIn", keywords: ["linkedin", "posao", "karijera"] },
  { key: "lu:github", libraryId: "lucide", group: "brand", label: "GitHub", keywords: ["github", "kod", "programiranje"] },
  // Contact
  { key: "lu:phone", libraryId: "lucide", group: "contact", label: "Telefon", keywords: ["telefon", "phone", "poziv", "call", "mobilni", "kontakt"] },
  { key: "lu:mail", libraryId: "lucide", group: "contact", label: "Email", keywords: ["email", "mail", "posta", "poruka", "inbox"] },
  { key: "lu:map-pin", libraryId: "lucide", group: "contact", label: "Lokacija", keywords: ["lokacija", "map", "pin", "adresa", "mesto", "gde"] },
  { key: "lu:navigation", libraryId: "lucide", group: "contact", label: "Navigacija", keywords: ["navigacija", "navigation", "pravac", "putokaz", "route"] },
  { key: "lu:globe", libraryId: "lucide", group: "contact", label: "Veb-sajt", keywords: ["veb", "web", "sajt", "globe", "portal", "internet"] },
  { key: "lu:calendar", libraryId: "lucide", group: "contact", label: "Kalendar / Rezervacije", keywords: ["kalendar", "calendar", "datum", "rezervacija", "termin", "booking"] },
  { key: "lu:clock", libraryId: "lucide", group: "contact", label: "Radno vreme", keywords: ["radno", "vreme", "sat", "clock", "time", "hours"] },
  { key: "lu:message-circle", libraryId: "lucide", group: "contact", label: "Poruka / Chat", keywords: ["poruka", "chat", "message", "razgovor"] },
  { key: "lu:user", libraryId: "lucide", group: "contact", label: "Profil / Korisnik", keywords: ["profil", "korisnik", "user", "osoba", "kontakt"] },
  { key: "lu:users", libraryId: "lucide", group: "contact", label: "Tim / Grupa", keywords: ["tim", "grupa", "users", "ljudi", "zajednica"] },
  { key: "lu:building", libraryId: "lucide", group: "contact", label: "Objekat / Zgrada", keywords: ["zgrada", "objekat", "building", "kancelarija", "sediste"] },
  { key: "lu:info", libraryId: "lucide", group: "contact", label: "Informacije", keywords: ["info", "informacije", "pomoc", "detalji"] },
  // Food
  { key: "lu:utensils", libraryId: "lucide", group: "food", label: "Restoran / Hrana", keywords: ["hrana", "restoran", "utensils", "viljuska", "noz", "obrok", "rucak", "vecera"] },
  { key: "lu:coffee", libraryId: "lucide", group: "food", label: "Kafa / Kafić", keywords: ["kafa", "coffee", "kafic", "solja", "espresso", "cappuccino", "napitak"] },
  { key: "lu:wine", libraryId: "lucide", group: "food", label: "Vino / Bar", keywords: ["vino", "wine", "bar", "casa", "pice", "koktel"] },
  { key: "lu:beer", libraryId: "lucide", group: "food", label: "Pivo / Pub", keywords: ["pivo", "beer", "pab", "pub", "krigla", "pice"] },
  { key: "lu:pizza", libraryId: "lucide", group: "food", label: "Pizza / Pizzerija", keywords: ["pizza", "pica", "parce", "italijanska", "hrana"] },
  { key: "lu:cup-soda", libraryId: "lucide", group: "food", label: "Sok / Piće", keywords: ["sok", "pice", "napitak", "soda", "cappuccino", "drink"] },
  { key: "lu:cake", libraryId: "lucide", group: "food", label: "Torta / Poslastičarnica", keywords: ["torta", "kolac", "cake", "slatkisi", "rodjendan"] },
  { key: "lu:chef-hat", libraryId: "lucide", group: "food", label: "Kuvarska kapa / Meni", keywords: ["kuvar", "chef", "specijalitet", "kuhinja"] },
  { key: "lu:croissant", libraryId: "lucide", group: "food", label: "Pekara / Kroasan", keywords: ["pekara", "kroasan", "pecivo", "dorucak", "bakery"] },
  { key: "lu:salad", libraryId: "lucide", group: "food", label: "Salata / Zdrava hrana", keywords: ["salata", "salad", "zdravo", "vegetarijansko", "vegan"] },
  { key: "lu:soup", libraryId: "lucide", group: "food", label: "Supa / Čorba", keywords: ["supa", "corba", "soup", "toplo", "kuvana"] },
  { key: "lu:cookie", libraryId: "lucide", group: "food", label: "Kolačić / Keks", keywords: ["keks", "kolacic", "cookie", "slatko"] },
  { key: "lu:ice-cream-bowl", libraryId: "lucide", group: "food", label: "Sladoled / Desert", keywords: ["sladoled", "icecream", "desert", "leto"] },
  // Commerce
  { key: "lu:shopping-bag", libraryId: "lucide", group: "commerce", label: "Kesa za kupovinu", keywords: ["kesa", "kupovina", "shopping", "bag", "torba", "butik"] },
  { key: "lu:shopping-cart", libraryId: "lucide", group: "commerce", label: "Korpa za kupovinu", keywords: ["korpa", "cart", "kupovina", "online", "shop"] },
  { key: "lu:store", libraryId: "lucide", group: "commerce", label: "Prodavnica / Lokal", keywords: ["prodavnica", "store", "shop", "lokal", "radnja"] },
  { key: "lu:tag", libraryId: "lucide", group: "commerce", label: "Oznaka / Cena", keywords: ["tag", "cena", "oznaka", "kategorija", "artikal"] },
  { key: "lu:percent", libraryId: "lucide", group: "commerce", label: "Popust / Akcija", keywords: ["popust", "procenat", "percent", "akcija", "snizenje", "sale"] },
  { key: "lu:gift", libraryId: "lucide", group: "commerce", label: "Poklon / Ponuda", keywords: ["poklon", "gift", "iznenadjenje", "vaucer", "paket"] },
  { key: "lu:credit-card", libraryId: "lucide", group: "commerce", label: "Platna kartica", keywords: ["kartica", "card", "placanje", "kreditna", "banka"] },
  { key: "lu:ticket", libraryId: "lucide", group: "commerce", label: "Ulaznica / Karta", keywords: ["karta", "ulaznica", "ticket", "dogadjaj", "bioskop", "koncert"] },
  { key: "lu:truck", libraryId: "lucide", group: "commerce", label: "Dostava / Kamion", keywords: ["dostava", "kamion", "truck", "isporuka", "delivery", "slanje"] },
  { key: "lu:receipt", libraryId: "lucide", group: "commerce", label: "Račun / Cenovnik", keywords: ["racun", "cenovnik", "receipt", "faktura", "cene"] },
  { key: "lu:banknote", libraryId: "lucide", group: "commerce", label: "Novac / Gotovina", keywords: ["novac", "kes", "gotovina", "banknote", "money"] },
  { key: "lu:package", libraryId: "lucide", group: "commerce", label: "Paket / Proizvod", keywords: ["paket", "posiljka", "package", "kutija"] },
  // General
  { key: "lu:star", libraryId: "lucide", group: "general", label: "Zvezda / Ocena", keywords: ["zvezda", "star", "ocena", "omiljeno", "top", "premium"] },
  { key: "lu:heart", libraryId: "lucide", group: "general", label: "Srce / Like", keywords: ["srce", "heart", "ljubav", "omiljeno", "like"] },
  { key: "lu:sparkles", libraryId: "lucide", group: "general", label: "Sjaj / Novo", keywords: ["sjaj", "sparkles", "novo", "magic", "istaknuto", "specijalno"] },
  { key: "lu:music", libraryId: "lucide", group: "general", label: "Muzika / Plejlista", keywords: ["muzika", "music", "pesma", "audio", "zvuk", "svirka"] },
  { key: "lu:camera", libraryId: "lucide", group: "general", label: "Kamera / Galerija", keywords: ["kamera", "camera", "fotografije", "slike", "foto"] },
  { key: "lu:video", libraryId: "lucide", group: "general", label: "Video", keywords: ["video", "snimak", "kamera", "film"] },
  { key: "lu:link", libraryId: "lucide", group: "general", label: "Link / Poveznica", keywords: ["link", "veza", "url", "adresa"] },
  { key: "lu:qr-code", libraryId: "lucide", group: "general", label: "QR kod", keywords: ["qr", "kod", "skeniraj", "scan"] },
  { key: "lu:house", libraryId: "lucide", group: "general", label: "Početna / Kuća", keywords: ["pocetna", "home", "kuca", "glavna"] },
  { key: "lu:bell", libraryId: "lucide", group: "general", label: "Obaveštenja / Zvono", keywords: ["zvono", "bell", "notifikacija", "obavestenje"] },
  { key: "lu:shield-check", libraryId: "lucide", group: "general", label: "Sigurnost / Garancija", keywords: ["stit", "sigurnost", "garancija", "shield", "provereno"] },
  { key: "lu:flame", libraryId: "lucide", group: "general", label: "Vatra / Hit", keywords: ["vatra", "flame", "hit", "popularno", "vruce", "trend"] },
  { key: "lu:zap", libraryId: "lucide", group: "general", label: "Grom / Brzo", keywords: ["grom", "munja", "brzo", "energija", "zap", "flash"] },
  { key: "lu:compass", libraryId: "lucide", group: "general", label: "Kompas / Istraži", keywords: ["kompas", "compass", "istrazi", "vodic"] },
  { key: "lu:bookmark", libraryId: "lucide", group: "general", label: "Obeleživač", keywords: ["obelezivac", "bookmark", "sacuvaj"] },
  { key: "lu:share-2", libraryId: "lucide", group: "general", label: "Deli / Share", keywords: ["share", "deli", "podeli", "posalji"] },
  { key: "lu:thumbs-up", libraryId: "lucide", group: "general", label: "Preporuka / Like", keywords: ["preporuka", "like", "svidja", "thumbsup"] },
  { key: "lu:circle-help", libraryId: "lucide", group: "general", label: "Pomoć / Pitanja", keywords: ["pomoc", "pitanje", "faq", "podrska"] },
];

export const FA6_ICONS: readonly IconDefinition[] = [
  // Brand
  { key: "fa6:FaInstagram", libraryId: "fa6", group: "brand", label: "Instagram", keywords: ["instagram", "ig", "drustvene", "mreze", "social"] },
  { key: "fa6:FaFacebookF", libraryId: "fa6", group: "brand", label: "Facebook", keywords: ["facebook", "fb", "meta", "social"] },
  { key: "fa6:FaTiktok", libraryId: "fa6", group: "brand", label: "TikTok", keywords: ["tiktok", "video", "kratki", "social"] },
  { key: "fa6:FaYoutube", libraryId: "fa6", group: "brand", label: "YouTube", keywords: ["youtube", "yt", "video", "kanal"] },
  { key: "fa6:FaWhatsapp", libraryId: "fa6", group: "brand", label: "WhatsApp", keywords: ["whatsapp", "poruke", "chat", "poziv"] },
  { key: "fa6:FaViber", libraryId: "fa6", group: "brand", label: "Viber", keywords: ["viber", "chat", "poziv", "poruka"] },
  { key: "fa6:FaTelegram", libraryId: "fa6", group: "brand", label: "Telegram", keywords: ["telegram", "chat", "kanal", "grupa"] },
  { key: "fa6:FaLinkedinIn", libraryId: "fa6", group: "brand", label: "LinkedIn", keywords: ["linkedin", "posao", "mreza", "karijera"] },
  { key: "fa6:FaXTwitter", libraryId: "fa6", group: "brand", label: "X / Twitter", keywords: ["twitter", "x", "mreza"] },
  { key: "fa6:FaSpotify", libraryId: "fa6", group: "brand", label: "Spotify", keywords: ["spotify", "muzika", "plejlista", "pesme"] },
  { key: "fa6:FaPinterestP", libraryId: "fa6", group: "brand", label: "Pinterest", keywords: ["pinterest", "slike", "ideje", "inspiracija"] },
  { key: "fa6:FaGoogle", libraryId: "fa6", group: "brand", label: "Google", keywords: ["google", "recenzije", "ocene", "search"] },
  { key: "fa6:FaYelp", libraryId: "fa6", group: "brand", label: "Yelp", keywords: ["yelp", "recenzije", "ocene", "lokal"] },
  { key: "fa6:FaDiscord", libraryId: "fa6", group: "brand", label: "Discord", keywords: ["discord", "zajednica", "server", "chat"] },
  { key: "fa6:FaSnapchat", libraryId: "fa6", group: "brand", label: "Snapchat", keywords: ["snapchat", "snap", "social"] },
  // Contact
  { key: "fa6:FaPhone", libraryId: "fa6", group: "contact", label: "Telefon", keywords: ["telefon", "phone", "poziv", "mobilni", "kontakt"] },
  { key: "fa6:FaEnvelope", libraryId: "fa6", group: "contact", label: "Email", keywords: ["email", "mail", "posta", "poruka", "inbox"] },
  { key: "fa6:FaLocationDot", libraryId: "fa6", group: "contact", label: "Lokacija", keywords: ["lokacija", "map", "pin", "adresa", "mesto"] },
  { key: "fa6:FaLocationArrow", libraryId: "fa6", group: "contact", label: "Navigacija", keywords: ["navigacija", "putokaz", "pravac", "route"] },
  { key: "fa6:FaGlobe", libraryId: "fa6", group: "contact", label: "Veb-sajt", keywords: ["veb", "web", "sajt", "globe", "internet"] },
  { key: "fa6:FaCalendarDays", libraryId: "fa6", group: "contact", label: "Kalendar / Zakazivanje", keywords: ["kalendar", "calendar", "zakazivanje", "termin", "booking"] },
  { key: "fa6:FaClock", libraryId: "fa6", group: "contact", label: "Radno vreme", keywords: ["radno", "vreme", "sat", "time", "clock"] },
  { key: "fa6:FaCommentDots", libraryId: "fa6", group: "contact", label: "Poruka / Razgovor", keywords: ["poruka", "chat", "razgovor", "komentar"] },
  { key: "fa6:FaUser", libraryId: "fa6", group: "contact", label: "Profil / Korisnik", keywords: ["profil", "korisnik", "osoba", "kontakt"] },
  { key: "fa6:FaUsers", libraryId: "fa6", group: "contact", label: "Tim / Ljudi", keywords: ["tim", "ljudi", "users", "zajednica"] },
  { key: "fa6:FaBuilding", libraryId: "fa6", group: "contact", label: "Objekat / Kancelarija", keywords: ["zgrada", "objekat", "building", "kancelarija"] },
  { key: "fa6:FaCircleInfo", libraryId: "fa6", group: "contact", label: "Informacije", keywords: ["info", "informacije", "detalji", "pomoc"] },
  // Food
  { key: "fa6:FaUtensils", libraryId: "fa6", group: "food", label: "Restoran / Hrana", keywords: ["hrana", "restoran", "viljuska", "noz", "obrok", "rucak"] },
  { key: "fa6:FaMugHot", libraryId: "fa6", group: "food", label: "Kafa / Topli napitak", keywords: ["kafa", "coffee", "solja", "espresso", "caj", "kafic"] },
  { key: "fa6:FaWineGlass", libraryId: "fa6", group: "food", label: "Vino / Bar", keywords: ["vino", "wine", "bar", "casa", "koktel"] },
  { key: "fa6:FaBeerMugEmpty", libraryId: "fa6", group: "food", label: "Pivo / Pub", keywords: ["pivo", "beer", "krigla", "pub", "pab"] },
  { key: "fa6:FaPizzaSlice", libraryId: "fa6", group: "food", label: "Pizza / Pizzerija", keywords: ["pizza", "pica", "parce", "italijanska"] },
  { key: "fa6:FaBurger", libraryId: "fa6", group: "food", label: "Burger / Fast Food", keywords: ["burger", "pljeskavica", "sendvic", "fastfood"] },
  { key: "fa6:FaCakeCandles", libraryId: "fa6", group: "food", label: "Torta / Proslava", keywords: ["torta", "kolac", "proslava", "rodjendan"] },
  { key: "fa6:FaBookOpen", libraryId: "fa6", group: "food", label: "Meni / Jelovnik", keywords: ["meni", "jelovnik", "karta", "knjiga"] },
  { key: "fa6:FaIceCream", libraryId: "fa6", group: "food", label: "Sladoled / Desert", keywords: ["sladoled", "desert", "poslastica"] },
  { key: "fa6:FaFish", libraryId: "fa6", group: "food", label: "Riba / Seafood", keywords: ["riba", "morski", "plodovi", "fish", "restoran"] },
  { key: "fa6:FaFire", libraryId: "fa6", group: "food", label: "Roštilj / Grill", keywords: ["rostilj", "grill", "meso", "zar", "vatra"] },
  // Commerce
  { key: "fa6:FaBagShopping", libraryId: "fa6", group: "commerce", label: "Torba / Kupovina", keywords: ["kupovina", "shopping", "bag", "torba", "butik"] },
  { key: "fa6:FaCartShopping", libraryId: "fa6", group: "commerce", label: "Korpa za kupovinu", keywords: ["korpa", "cart", "prodaja", "webshop"] },
  { key: "fa6:FaShop", libraryId: "fa6", group: "commerce", label: "Prodavnica / Lokal", keywords: ["prodavnica", "shop", "radnja", "lokal"] },
  { key: "fa6:FaTag", libraryId: "fa6", group: "commerce", label: "Cena / Tag", keywords: ["cena", "tag", "oznaka", "kategorija"] },
  { key: "fa6:FaPercent", libraryId: "fa6", group: "commerce", label: "Popust / Akcija", keywords: ["popust", "akcija", "procenat", "snizenje", "sale"] },
  { key: "fa6:FaGift", libraryId: "fa6", group: "commerce", label: "Poklon / Vaučer", keywords: ["poklon", "gift", "vaucer", "iznenadjenje"] },
  { key: "fa6:FaCreditCard", libraryId: "fa6", group: "commerce", label: "Platna kartica", keywords: ["kartica", "placanje", "kreditna", "banka"] },
  { key: "fa6:FaTicket", libraryId: "fa6", group: "commerce", label: "Ulaznica / Karta", keywords: ["karta", "ulaznica", "ticket", "dogadjaj"] },
  { key: "fa6:FaTruck", libraryId: "fa6", group: "commerce", label: "Dostava / Isporuka", keywords: ["dostava", "isporuka", "kamion", "delivery"] },
  { key: "fa6:FaReceipt", libraryId: "fa6", group: "commerce", label: "Račun / Faktura", keywords: ["racun", "cenovnik", "faktura"] },
  { key: "fa6:FaCoins", libraryId: "fa6", group: "commerce", label: "Novčići / Cene", keywords: ["novac", "novcici", "coins", "cena"] },
  { key: "fa6:FaBoxOpen", libraryId: "fa6", group: "commerce", label: "Paket / Isporuka", keywords: ["paket", "kutija", "narudzbina"] },
  // General
  { key: "fa6:FaStar", libraryId: "fa6", group: "general", label: "Zvezda / Ocena", keywords: ["zvezda", "star", "ocena", "omiljeno", "top"] },
  { key: "fa6:FaHeart", libraryId: "fa6", group: "general", label: "Srce / Omiljeno", keywords: ["srce", "heart", "ljubav", "omiljeno"] },
  { key: "fa6:FaWandMagicSparkles", libraryId: "fa6", group: "general", label: "Magija / Istaknuto", keywords: ["magija", "sjaj", "sparkles", "novo", "magic"] },
  { key: "fa6:FaMusic", libraryId: "fa6", group: "general", label: "Muzika / Plejlista", keywords: ["muzika", "music", "audio", "pesma"] },
  { key: "fa6:FaCamera", libraryId: "fa6", group: "general", label: "Kamera / Foto", keywords: ["kamera", "foto", "slike", "galerija"] },
  { key: "fa6:FaVideo", libraryId: "fa6", group: "general", label: "Video snimak", keywords: ["video", "snimak", "kamera", "film"] },
  { key: "fa6:FaLink", libraryId: "fa6", group: "general", label: "Link / Linkovi", keywords: ["link", "veza", "url"] },
  { key: "fa6:FaQrcode", libraryId: "fa6", group: "general", label: "QR kod", keywords: ["qr", "kod", "skeniraj", "scan"] },
  { key: "fa6:FaHouse", libraryId: "fa6", group: "general", label: "Početna strana", keywords: ["pocetna", "home", "kuca"] },
  { key: "fa6:FaBell", libraryId: "fa6", group: "general", label: "Zvono / Obaveštenja", keywords: ["zvono", "notifikacija", "obavestenje"] },
  { key: "fa6:FaShieldHalved", libraryId: "fa6", group: "general", label: "Sigurnost", keywords: ["stit", "sigurnost", "garancija", "provereno"] },
  { key: "fa6:FaBolt", libraryId: "fa6", group: "general", label: "Munja / Brzina", keywords: ["munja", "grom", "brzo", "energija"] },
  { key: "fa6:FaCompass", libraryId: "fa6", group: "general", label: "Kompas / Istraži", keywords: ["kompas", "vodic", "istrazi"] },
  { key: "fa6:FaBookmark", libraryId: "fa6", group: "general", label: "Obeleživač", keywords: ["obelezivac", "sacuvaj", "bookmark"] },
  { key: "fa6:FaShareNodes", libraryId: "fa6", group: "general", label: "Deli / Share", keywords: ["share", "podeli", "posalji"] },
  { key: "fa6:FaThumbsUp", libraryId: "fa6", group: "general", label: "Palac gore / Preporuka", keywords: ["preporuka", "like", "svidja", "super"] },
  { key: "fa6:FaCircleQuestion", libraryId: "fa6", group: "general", label: "Pitanja / FAQ", keywords: ["pitanje", "pomoc", "faq", "podrska"] },
];

export const TABLER_ICONS: readonly IconDefinition[] = [
  // Brand
  { key: "tb:TbBrandInstagram", libraryId: "tabler", group: "brand", label: "Instagram", keywords: ["instagram", "ig", "social"] },
  { key: "tb:TbBrandFacebook", libraryId: "tabler", group: "brand", label: "Facebook", keywords: ["facebook", "fb", "social"] },
  { key: "tb:TbBrandTiktok", libraryId: "tabler", group: "brand", label: "TikTok", keywords: ["tiktok", "video", "social"] },
  { key: "tb:TbBrandYoutube", libraryId: "tabler", group: "brand", label: "YouTube", keywords: ["youtube", "yt", "video"] },
  { key: "tb:TbBrandWhatsapp", libraryId: "tabler", group: "brand", label: "WhatsApp", keywords: ["whatsapp", "chat", "poruke"] },
  { key: "tb:TbBrandTelegram", libraryId: "tabler", group: "brand", label: "Telegram", keywords: ["telegram", "chat", "kanal"] },
  { key: "tb:TbBrandLinkedin", libraryId: "tabler", group: "brand", label: "LinkedIn", keywords: ["linkedin", "posao", "karijera"] },
  { key: "tb:TbBrandX", libraryId: "tabler", group: "brand", label: "X / Twitter", keywords: ["twitter", "x", "mreza"] },
  { key: "tb:TbBrandSpotify", libraryId: "tabler", group: "brand", label: "Spotify", keywords: ["spotify", "muzika", "pesme"] },
  { key: "tb:TbBrandPinterest", libraryId: "tabler", group: "brand", label: "Pinterest", keywords: ["pinterest", "slike", "ideje"] },
  { key: "tb:TbBrandGoogle", libraryId: "tabler", group: "brand", label: "Google", keywords: ["google", "ocene", "search"] },
  { key: "tb:TbBrandTripadvisor", libraryId: "tabler", group: "brand", label: "TripAdvisor", keywords: ["tripadvisor", "putovanja", "ocene", "restorani"] },
  { key: "tb:TbBrandDiscord", libraryId: "tabler", group: "brand", label: "Discord", keywords: ["discord", "chat", "server"] },
  { key: "tb:TbBrandSnapchat", libraryId: "tabler", group: "brand", label: "Snapchat", keywords: ["snapchat", "social"] },
  // Contact
  { key: "tb:TbPhone", libraryId: "tabler", group: "contact", label: "Telefon", keywords: ["telefon", "phone", "poziv", "mobilni"] },
  { key: "tb:TbMail", libraryId: "tabler", group: "contact", label: "Email", keywords: ["email", "mail", "posta", "inbox"] },
  { key: "tb:TbMapPin", libraryId: "tabler", group: "contact", label: "Lokacija", keywords: ["lokacija", "map", "pin", "adresa", "mesto"] },
  { key: "tb:TbNavigation", libraryId: "tabler", group: "contact", label: "Navigacija", keywords: ["navigacija", "pravac", "putokaz"] },
  { key: "tb:TbWorld", libraryId: "tabler", group: "contact", label: "Veb-sajt", keywords: ["veb", "web", "sajt", "portal", "internet"] },
  { key: "tb:TbCalendar", libraryId: "tabler", group: "contact", label: "Kalendar / Zakazivanje", keywords: ["kalendar", "calendar", "datum", "termin", "booking"] },
  { key: "tb:TbClock", libraryId: "tabler", group: "contact", label: "Radno vreme", keywords: ["radno", "vreme", "sat", "time"] },
  { key: "tb:TbMessageCircle", libraryId: "tabler", group: "contact", label: "Poruka / Chat", keywords: ["poruka", "chat", "razgovor"] },
  { key: "tb:TbUser", libraryId: "tabler", group: "contact", label: "Profil / Korisnik", keywords: ["profil", "korisnik", "osoba"] },
  { key: "tb:TbUsers", libraryId: "tabler", group: "contact", label: "Tim / Grupa", keywords: ["tim", "grupa", "ljudi"] },
  { key: "tb:TbBuilding", libraryId: "tabler", group: "contact", label: "Objekat / Zgrada", keywords: ["zgrada", "objekat", "kancelarija"] },
  { key: "tb:TbInfoCircle", libraryId: "tabler", group: "contact", label: "Informacije", keywords: ["info", "informacije", "detalji"] },
  // Food
  { key: "tb:TbToolsKitchen2", libraryId: "tabler", group: "food", label: "Restoran / Hrana", keywords: ["hrana", "restoran", "viljuska", "noz", "obrok"] },
  { key: "tb:TbCoffee", libraryId: "tabler", group: "food", label: "Kafa / Kafić", keywords: ["kafa", "coffee", "kafic", "solja", "espresso"] },
  { key: "tb:TbGlassFull", libraryId: "tabler", group: "food", label: "Piće / Koktel", keywords: ["pice", "koktel", "casa", "bar"] },
  { key: "tb:TbBeer", libraryId: "tabler", group: "food", label: "Pivo / Pub", keywords: ["pivo", "beer", "krigla", "pub"] },
  { key: "tb:TbPizza", libraryId: "tabler", group: "food", label: "Pizza / Pizzerija", keywords: ["pizza", "pica", "parce"] },
  { key: "tb:TbBurger", libraryId: "tabler", group: "food", label: "Burger / Pljeskavica", keywords: ["burger", "sendvic", "fastfood"] },
  { key: "tb:TbCake", libraryId: "tabler", group: "food", label: "Torta / Poslastičarnica", keywords: ["torta", "kolac", "slatko"] },
  { key: "tb:TbBook", libraryId: "tabler", group: "food", label: "Meni / Cenovnik", keywords: ["meni", "jelovnik", "karta"] },
  { key: "tb:TbIceCream", libraryId: "tabler", group: "food", label: "Sladoled / Desert", keywords: ["sladoled", "desert", "slatko"] },
  { key: "tb:TbFish", libraryId: "tabler", group: "food", label: "Riba / Morski plodovi", keywords: ["riba", "morski", "fish"] },
  { key: "tb:TbFlame", libraryId: "tabler", group: "food", label: "Roštilj / Vatra", keywords: ["rostilj", "vatra", "grill"] },
  // Commerce
  { key: "tb:TbShoppingBag", libraryId: "tabler", group: "commerce", label: "Kupovina / Kesa", keywords: ["kesa", "kupovina", "shopping", "torba"] },
  { key: "tb:TbShoppingCart", libraryId: "tabler", group: "commerce", label: "Korpa za kupovinu", keywords: ["korpa", "cart", "prodaja"] },
  { key: "tb:TbBuildingStore", libraryId: "tabler", group: "commerce", label: "Prodavnica / Radnja", keywords: ["prodavnica", "store", "radnja"] },
  { key: "tb:TbTag", libraryId: "tabler", group: "commerce", label: "Oznaka / Cena", keywords: ["tag", "cena", "oznaka"] },
  { key: "tb:TbPercentage", libraryId: "tabler", group: "commerce", label: "Popust / Procenat", keywords: ["popust", "akcija", "procenat", "sale"] },
  { key: "tb:TbGift", libraryId: "tabler", group: "commerce", label: "Poklon / Vaučer", keywords: ["poklon", "gift", "vaucer"] },
  { key: "tb:TbCreditCard", libraryId: "tabler", group: "commerce", label: "Platna kartica", keywords: ["kartica", "placanje", "banka"] },
  { key: "tb:TbTicket", libraryId: "tabler", group: "commerce", label: "Ulaznica / Karta", keywords: ["karta", "ulaznica", "ticket"] },
  { key: "tb:TbTruckDelivery", libraryId: "tabler", group: "commerce", label: "Dostava / Isporuka", keywords: ["dostava", "isporuka", "kamion"] },
  { key: "tb:TbReceipt", libraryId: "tabler", group: "commerce", label: "Račun / Faktura", keywords: ["racun", "cenovnik"] },
  { key: "tb:TbCoin", libraryId: "tabler", group: "commerce", label: "Novac / Cene", keywords: ["novac", "novcic", "cena"] },
  { key: "tb:TbPackage", libraryId: "tabler", group: "commerce", label: "Paket / Pošiljka", keywords: ["paket", "posiljka", "kutija"] },
  // General
  { key: "tb:TbStar", libraryId: "tabler", group: "general", label: "Zvezda / Ocena", keywords: ["zvezda", "star", "ocena", "top"] },
  { key: "tb:TbHeart", libraryId: "tabler", group: "general", label: "Srce / Omiljeno", keywords: ["srce", "heart", "ljubav"] },
  { key: "tb:TbSparkles", libraryId: "tabler", group: "general", label: "Sjaj / Novo", keywords: ["sjaj", "sparkles", "novo", "magic"] },
  { key: "tb:TbMusic", libraryId: "tabler", group: "general", label: "Muzika / Plejlista", keywords: ["muzika", "music", "zvuk"] },
  { key: "tb:TbCamera", libraryId: "tabler", group: "general", label: "Kamera / Foto", keywords: ["kamera", "foto", "slike"] },
  { key: "tb:TbVideo", libraryId: "tabler", group: "general", label: "Video snimak", keywords: ["video", "snimak"] },
  { key: "tb:TbLink", libraryId: "tabler", group: "general", label: "Link / Linkovi", keywords: ["link", "url", "veza"] },
  { key: "tb:TbQrcode", libraryId: "tabler", group: "general", label: "QR kod", keywords: ["qr", "kod", "skeniraj"] },
  { key: "tb:TbHome", libraryId: "tabler", group: "general", label: "Početna strana", keywords: ["pocetna", "home", "kuca"] },
  { key: "tb:TbBell", libraryId: "tabler", group: "general", label: "Zvono / Obaveštenja", keywords: ["zvono", "notifikacija"] },
  { key: "tb:TbShieldCheck", libraryId: "tabler", group: "general", label: "Sigurnost", keywords: ["stit", "sigurnost", "garancija"] },
  { key: "tb:TbBolt", libraryId: "tabler", group: "general", label: "Munja / Brzo", keywords: ["munja", "grom", "brzo"] },
  { key: "tb:TbCompass", libraryId: "tabler", group: "general", label: "Kompas / Istraži", keywords: ["kompas", "vodic"] },
  { key: "tb:TbBookmark", libraryId: "tabler", group: "general", label: "Obeleživač", keywords: ["obelezivac", "bookmark"] },
  { key: "tb:TbShare", libraryId: "tabler", group: "general", label: "Deli / Share", keywords: ["share", "podeli"] },
  { key: "tb:TbThumbUp", libraryId: "tabler", group: "general", label: "Palac gore", keywords: ["like", "preporuka"] },
  { key: "tb:TbHelp", libraryId: "tabler", group: "general", label: "Pomoć / FAQ", keywords: ["pomoc", "faq", "pitanje"] },
];

export const IONICONS_ICONS: readonly IconDefinition[] = [
  // Brand
  { key: "io5:IoLogoInstagram", libraryId: "ionicons", group: "brand", label: "Instagram", keywords: ["instagram", "ig", "social"] },
  { key: "io5:IoLogoFacebook", libraryId: "ionicons", group: "brand", label: "Facebook", keywords: ["facebook", "fb", "social"] },
  { key: "io5:IoLogoTiktok", libraryId: "ionicons", group: "brand", label: "TikTok", keywords: ["tiktok", "video", "social"] },
  { key: "io5:IoLogoYoutube", libraryId: "ionicons", group: "brand", label: "YouTube", keywords: ["youtube", "yt", "video"] },
  { key: "io5:IoLogoWhatsapp", libraryId: "ionicons", group: "brand", label: "WhatsApp", keywords: ["whatsapp", "chat", "poruke"] },
  { key: "io5:IoLogoTwitter", libraryId: "ionicons", group: "brand", label: "X / Twitter", keywords: ["twitter", "x", "mreza"] },
  { key: "io5:IoLogoLinkedin", libraryId: "ionicons", group: "brand", label: "LinkedIn", keywords: ["linkedin", "posao", "karijera"] },
  { key: "io5:IoLogoGoogle", libraryId: "ionicons", group: "brand", label: "Google", keywords: ["google", "search", "ocene"] },
  { key: "io5:IoLogoPinterest", libraryId: "ionicons", group: "brand", label: "Pinterest", keywords: ["pinterest", "slike", "ideje"] },
  { key: "io5:IoLogoDiscord", libraryId: "ionicons", group: "brand", label: "Discord", keywords: ["discord", "chat", "server"] },
  { key: "io5:IoLogoSnapchat", libraryId: "ionicons", group: "brand", label: "Snapchat", keywords: ["snapchat", "social"] },
  // Contact
  { key: "io5:IoCallOutline", libraryId: "ionicons", group: "contact", label: "Telefon", keywords: ["telefon", "phone", "poziv", "mobilni", "call"] },
  { key: "io5:IoMailOutline", libraryId: "ionicons", group: "contact", label: "Email", keywords: ["email", "mail", "posta", "inbox"] },
  { key: "io5:IoLocationOutline", libraryId: "ionicons", group: "contact", label: "Lokacija", keywords: ["lokacija", "map", "pin", "adresa", "mesto"] },
  { key: "io5:IoNavigateOutline", libraryId: "ionicons", group: "contact", label: "Navigacija", keywords: ["navigacija", "pravac", "putokaz"] },
  { key: "io5:IoGlobeOutline", libraryId: "ionicons", group: "contact", label: "Veb-sajt", keywords: ["veb", "web", "sajt", "globe", "internet"] },
  { key: "io5:IoCalendarOutline", libraryId: "ionicons", group: "contact", label: "Kalendar / Zakazivanje", keywords: ["kalendar", "calendar", "datum", "termin", "booking"] },
  { key: "io5:IoTimeOutline", libraryId: "ionicons", group: "contact", label: "Radno vreme", keywords: ["radno", "vreme", "sat", "time", "clock"] },
  { key: "io5:IoChatbubbleOutline", libraryId: "ionicons", group: "contact", label: "Poruka / Chat", keywords: ["poruka", "chat", "razgovor"] },
  { key: "io5:IoPersonOutline", libraryId: "ionicons", group: "contact", label: "Profil / Korisnik", keywords: ["profil", "korisnik", "osoba"] },
  { key: "io5:IoPeopleOutline", libraryId: "ionicons", group: "contact", label: "Tim / Grupa", keywords: ["tim", "grupa", "ljudi"] },
  { key: "io5:IoBusinessOutline", libraryId: "ionicons", group: "contact", label: "Objekat / Kancelarija", keywords: ["zgrada", "objekat", "kancelarija", "sediste"] },
  { key: "io5:IoInformationCircleOutline", libraryId: "ionicons", group: "contact", label: "Informacije", keywords: ["info", "informacije", "detalji"] },
  // Food
  { key: "io5:IoRestaurantOutline", libraryId: "ionicons", group: "food", label: "Restoran / Hrana", keywords: ["hrana", "restoran", "viljuska", "noz", "obrok"] },
  { key: "io5:IoCafeOutline", libraryId: "ionicons", group: "food", label: "Kafa / Kafić", keywords: ["kafa", "coffee", "kafic", "solja", "espresso"] },
  { key: "io5:IoWineOutline", libraryId: "ionicons", group: "food", label: "Vino / Piće", keywords: ["vino", "wine", "casa", "pice", "koktel"] },
  { key: "io5:IoBeerOutline", libraryId: "ionicons", group: "food", label: "Pivo / Pub", keywords: ["pivo", "beer", "krigla", "pub"] },
  { key: "io5:IoPizzaOutline", libraryId: "ionicons", group: "food", label: "Pizza / Pizzerija", keywords: ["pizza", "pica", "parce"] },
  { key: "io5:IoFastFoodOutline", libraryId: "ionicons", group: "food", label: "Burger / Fast Food", keywords: ["burger", "sendvic", "fastfood", "hrana"] },
  { key: "io5:IoIceCreamOutline", libraryId: "ionicons", group: "food", label: "Sladoled / Desert", keywords: ["sladoled", "desert", "slatko"] },
  { key: "io5:IoFishOutline", libraryId: "ionicons", group: "food", label: "Riba / Seafood", keywords: ["riba", "morski", "fish"] },
  { key: "io5:IoFlameOutline", libraryId: "ionicons", group: "food", label: "Roštilj / Vatra", keywords: ["rostilj", "vatra", "grill"] },
  { key: "io5:IoBookOutline", libraryId: "ionicons", group: "food", label: "Meni / Cenovnik", keywords: ["meni", "jelovnik", "karta", "knjiga"] },
  // Commerce
  { key: "io5:IoBagOutline", libraryId: "ionicons", group: "commerce", label: "Kesa za kupovinu", keywords: ["kesa", "kupovina", "shopping", "torba", "butik"] },
  { key: "io5:IoCartOutline", libraryId: "ionicons", group: "commerce", label: "Korpa za kupovinu", keywords: ["korpa", "cart", "prodaja", "shop"] },
  { key: "io5:IoStorefrontOutline", libraryId: "ionicons", group: "commerce", label: "Prodavnica / Radnja", keywords: ["prodavnica", "store", "radnja", "lokal"] },
  { key: "io5:IoPricetagOutline", libraryId: "ionicons", group: "commerce", label: "Oznaka / Cena", keywords: ["tag", "cena", "oznaka"] },
  { key: "io5:IoPricetagsOutline", libraryId: "ionicons", group: "commerce", label: "Popust / Akcija", keywords: ["popust", "akcija", "cene", "sale"] },
  { key: "io5:IoGiftOutline", libraryId: "ionicons", group: "commerce", label: "Poklon / Vaučer", keywords: ["poklon", "gift", "vaucer"] },
  { key: "io5:IoCardOutline", libraryId: "ionicons", group: "commerce", label: "Platna kartica", keywords: ["kartica", "placanje", "banka"] },
  { key: "io5:IoTicketOutline", libraryId: "ionicons", group: "commerce", label: "Ulaznica / Karta", keywords: ["karta", "ulaznica", "ticket"] },
  { key: "io5:IoReceiptOutline", libraryId: "ionicons", group: "commerce", label: "Račun / Faktura", keywords: ["racun", "cenovnik"] },
  { key: "io5:IoCashOutline", libraryId: "ionicons", group: "commerce", label: "Gotovina / Novac", keywords: ["novac", "kes", "cena"] },
  // General & Services
  { key: "io5:IoCutOutline", libraryId: "ionicons", group: "general", label: "Salon / Šišanje", keywords: ["salon", "frizerski", "sisanje", "makaze", "berberin"] },
  { key: "io5:IoFitnessOutline", libraryId: "ionicons", group: "general", label: "Fitnes / Teretana", keywords: ["fitnes", "teretana", "trening", "sport", "gym"] },
  { key: "io5:IoCarOutline", libraryId: "ionicons", group: "general", label: "Auto / Prevoz", keywords: ["auto", "vozilo", "prevoz", "parking", "rentacar"] },
  { key: "io5:IoBedOutline", libraryId: "ionicons", group: "general", label: "Smeštaj / Hotel", keywords: ["hotel", "smestaj", "krevet", "prenociste", "apartman"] },
  { key: "io5:IoPawOutline", libraryId: "ionicons", group: "general", label: "Ljubimci / Vet", keywords: ["ljubimci", "pas", "macka", "veterinar", "petshop"] },
  { key: "io5:IoShirtOutline", libraryId: "ionicons", group: "general", label: "Moda / Butik", keywords: ["moda", "butik", "garderoba", "odeca", "stil"] },
  { key: "io5:IoColorPaletteOutline", libraryId: "ionicons", group: "general", label: "Dizajn / Umetnost", keywords: ["dizajn", "art", "umetnost", "boje", "paleta"] },
  { key: "io5:IoStarOutline", libraryId: "ionicons", group: "general", label: "Zvezda / Ocena", keywords: ["zvezda", "star", "ocena", "top"] },
  { key: "io5:IoHeartOutline", libraryId: "ionicons", group: "general", label: "Srce / Omiljeno", keywords: ["srce", "heart", "ljubav"] },
  { key: "io5:IoSparklesOutline", libraryId: "ionicons", group: "general", label: "Sjaj / Novo", keywords: ["sjaj", "novo", "magic", "istaknuto"] },
  { key: "io5:IoMusicalNotesOutline", libraryId: "ionicons", group: "general", label: "Muzika / Plejlista", keywords: ["muzika", "music", "zvuk"] },
  { key: "io5:IoCameraOutline", libraryId: "ionicons", group: "general", label: "Kamera / Foto", keywords: ["kamera", "foto", "slike"] },
  { key: "io5:IoVideocamOutline", libraryId: "ionicons", group: "general", label: "Video snimak", keywords: ["video", "snimak"] },
  { key: "io5:IoLinkOutline", libraryId: "ionicons", group: "general", label: "Link / Linkovi", keywords: ["link", "url", "veza"] },
  { key: "io5:IoQrCodeOutline", libraryId: "ionicons", group: "general", label: "QR kod", keywords: ["qr", "kod", "skeniraj"] },
  { key: "io5:IoHomeOutline", libraryId: "ionicons", group: "general", label: "Početna strana", keywords: ["pocetna", "home", "kuca"] },
  { key: "io5:IoNotificationsOutline", libraryId: "ionicons", group: "general", label: "Zvono / Obaveštenja", keywords: ["zvono", "notifikacija"] },
  { key: "io5:IoShieldCheckmarkOutline", libraryId: "ionicons", group: "general", label: "Sigurnost", keywords: ["stit", "sigurnost", "garancija"] },
  { key: "io5:IoFlashOutline", libraryId: "ionicons", group: "general", label: "Munja / Brzo", keywords: ["munja", "grom", "brzo"] },
  { key: "io5:IoCompassOutline", libraryId: "ionicons", group: "general", label: "Kompas / Istraži", keywords: ["kompas", "vodic"] },
  { key: "io5:IoBookmarkOutline", libraryId: "ionicons", group: "general", label: "Obeleživač", keywords: ["obelezivac", "bookmark"] },
  { key: "io5:IoShareSocialOutline", libraryId: "ionicons", group: "general", label: "Deli / Share", keywords: ["share", "podeli"] },
  { key: "io5:IoThumbsUpOutline", libraryId: "ionicons", group: "general", label: "Palac gore", keywords: ["like", "preporuka"] },
  { key: "io5:IoHelpCircleOutline", libraryId: "ionicons", group: "general", label: "Pomoć / FAQ", keywords: ["pomoc", "faq", "pitanje"] },
];

export const PHOSPHOR_ICONS: readonly IconDefinition[] = [
  // Brand
  { key: "pi:PiInstagramLogo", libraryId: "phosphor", group: "brand", label: "Instagram", keywords: ["instagram", "ig", "social"] },
  { key: "pi:PiFacebookLogo", libraryId: "phosphor", group: "brand", label: "Facebook", keywords: ["facebook", "fb", "social"] },
  { key: "pi:PiTiktokLogo", libraryId: "phosphor", group: "brand", label: "TikTok", keywords: ["tiktok", "video", "social"] },
  { key: "pi:PiYoutubeLogo", libraryId: "phosphor", group: "brand", label: "YouTube", keywords: ["youtube", "yt", "video"] },
  { key: "pi:PiWhatsappLogo", libraryId: "phosphor", group: "brand", label: "WhatsApp", keywords: ["whatsapp", "chat", "poruke"] },
  { key: "pi:PiTelegramLogo", libraryId: "phosphor", group: "brand", label: "Telegram", keywords: ["telegram", "chat", "kanal"] },
  { key: "pi:PiLinkedinLogo", libraryId: "phosphor", group: "brand", label: "LinkedIn", keywords: ["linkedin", "posao", "karijera"] },
  { key: "pi:PiXLogo", libraryId: "phosphor", group: "brand", label: "X / Twitter", keywords: ["twitter", "x", "mreza"] },
  { key: "pi:PiSpotifyLogo", libraryId: "phosphor", group: "brand", label: "Spotify", keywords: ["spotify", "muzika", "pesme"] },
  { key: "pi:PiPinterestLogo", libraryId: "phosphor", group: "brand", label: "Pinterest", keywords: ["pinterest", "slike", "ideje"] },
  { key: "pi:PiGoogleLogo", libraryId: "phosphor", group: "brand", label: "Google", keywords: ["google", "search", "ocene"] },
  { key: "pi:PiDiscordLogo", libraryId: "phosphor", group: "brand", label: "Discord", keywords: ["discord", "chat", "server"] },
  { key: "pi:PiSnapchatLogo", libraryId: "phosphor", group: "brand", label: "Snapchat", keywords: ["snapchat", "social"] },
  // Contact
  { key: "pi:PiPhone", libraryId: "phosphor", group: "contact", label: "Telefon", keywords: ["telefon", "phone", "poziv", "mobilni"] },
  { key: "pi:PiEnvelopeSimple", libraryId: "phosphor", group: "contact", label: "Email", keywords: ["email", "mail", "posta", "inbox"] },
  { key: "pi:PiMapPin", libraryId: "phosphor", group: "contact", label: "Lokacija", keywords: ["lokacija", "map", "pin", "adresa", "mesto"] },
  { key: "pi:PiNavigationArrow", libraryId: "phosphor", group: "contact", label: "Navigacija", keywords: ["navigacija", "pravac", "putokaz"] },
  { key: "pi:PiGlobe", libraryId: "phosphor", group: "contact", label: "Veb-sajt", keywords: ["veb", "web", "sajt", "globe", "internet"] },
  { key: "pi:PiCalendar", libraryId: "phosphor", group: "contact", label: "Kalendar / Termin", keywords: ["kalendar", "calendar", "datum", "termin", "booking"] },
  { key: "pi:PiClock", libraryId: "phosphor", group: "contact", label: "Radno vreme", keywords: ["radno", "vreme", "sat", "time"] },
  { key: "pi:PiChatCircleDots", libraryId: "phosphor", group: "contact", label: "Poruka / Chat", keywords: ["poruka", "chat", "razgovor"] },
  { key: "pi:PiUser", libraryId: "phosphor", group: "contact", label: "Profil / Korisnik", keywords: ["profil", "korisnik", "osoba"] },
  { key: "pi:PiUsers", libraryId: "phosphor", group: "contact", label: "Tim / Grupa", keywords: ["tim", "grupa", "ljudi"] },
  { key: "pi:PiBuildings", libraryId: "phosphor", group: "contact", label: "Objekat / Zgrada", keywords: ["zgrada", "objekat", "kancelarija"] },
  { key: "pi:PiInfo", libraryId: "phosphor", group: "contact", label: "Informacije", keywords: ["info", "informacije", "detalji"] },
  // Food
  { key: "pi:PiForkKnife", libraryId: "phosphor", group: "food", label: "Restoran / Hrana", keywords: ["hrana", "restoran", "viljuska", "noz", "obrok"] },
  { key: "pi:PiCoffee", libraryId: "phosphor", group: "food", label: "Kafa / Kafić", keywords: ["kafa", "coffee", "kafic", "solja", "espresso"] },
  { key: "pi:PiWine", libraryId: "phosphor", group: "food", label: "Vino / Piće", keywords: ["vino", "wine", "casa", "pice", "koktel"] },
  { key: "pi:PiBeerBottle", libraryId: "phosphor", group: "food", label: "Pivo / Pub", keywords: ["pivo", "beer", "flasa", "pub"] },
  { key: "pi:PiPizza", libraryId: "phosphor", group: "food", label: "Pizza / Pizzerija", keywords: ["pizza", "pica", "parce"] },
  { key: "pi:PiHamburger", libraryId: "phosphor", group: "food", label: "Burger / Fast Food", keywords: ["burger", "sendvic", "fastfood"] },
  { key: "pi:PiCake", libraryId: "phosphor", group: "food", label: "Torta / Slatkiši", keywords: ["torta", "kolac", "slatko"] },
  { key: "pi:PiBookOpen", libraryId: "phosphor", group: "food", label: "Meni / Cenovnik", keywords: ["meni", "jelovnik", "karta"] },
  { key: "pi:PiIceCream", libraryId: "phosphor", group: "food", label: "Sladoled / Desert", keywords: ["sladoled", "desert", "slatko"] },
  { key: "pi:PiFish", libraryId: "phosphor", group: "food", label: "Riba / Seafood", keywords: ["riba", "morski", "fish"] },
  { key: "pi:PiFire", libraryId: "phosphor", group: "food", label: "Roštilj / Vatra", keywords: ["rostilj", "vatra", "grill"] },
  // Commerce
  { key: "pi:PiBag", libraryId: "phosphor", group: "commerce", label: "Kesa za kupovinu", keywords: ["kesa", "kupovina", "shopping", "torba"] },
  { key: "pi:PiShoppingCart", libraryId: "phosphor", group: "commerce", label: "Korpa za kupovinu", keywords: ["korpa", "cart", "prodaja"] },
  { key: "pi:PiStorefront", libraryId: "phosphor", group: "commerce", label: "Prodavnica / Radnja", keywords: ["prodavnica", "store", "radnja"] },
  { key: "pi:PiTag", libraryId: "phosphor", group: "commerce", label: "Oznaka / Cena", keywords: ["tag", "cena", "oznaka"] },
  { key: "pi:PiPercent", libraryId: "phosphor", group: "commerce", label: "Popust / Akcija", keywords: ["popust", "akcija", "procenat", "sale"] },
  { key: "pi:PiGift", libraryId: "phosphor", group: "commerce", label: "Poklon / Vaučer", keywords: ["poklon", "gift", "vaucer"] },
  { key: "pi:PiCreditCard", libraryId: "phosphor", group: "commerce", label: "Platna kartica", keywords: ["kartica", "placanje", "banka"] },
  { key: "pi:PiTicket", libraryId: "phosphor", group: "commerce", label: "Ulaznica / Karta", keywords: ["karta", "ulaznica", "ticket"] },
  { key: "pi:PiTruck", libraryId: "phosphor", group: "commerce", label: "Dostava / Isporuka", keywords: ["dostava", "isporuka", "kamion"] },
  { key: "pi:PiReceipt", libraryId: "phosphor", group: "commerce", label: "Račun / Faktura", keywords: ["racun", "cenovnik"] },
  { key: "pi:PiCoins", libraryId: "phosphor", group: "commerce", label: "Novac / Cene", keywords: ["novac", "cena", "novcici"] },
  { key: "pi:PiPackage", libraryId: "phosphor", group: "commerce", label: "Paket / Pošiljka", keywords: ["paket", "posiljka", "kutija"] },
  // General
  { key: "pi:PiStar", libraryId: "phosphor", group: "general", label: "Zvezda / Ocena", keywords: ["zvezda", "star", "ocena", "top"] },
  { key: "pi:PiHeart", libraryId: "phosphor", group: "general", label: "Srce / Omiljeno", keywords: ["srce", "heart", "ljubav"] },
  { key: "pi:PiSparkle", libraryId: "phosphor", group: "general", label: "Sjaj / Novo", keywords: ["sjaj", "novo", "magic"] },
  { key: "pi:PiMusicNotes", libraryId: "phosphor", group: "general", label: "Muzika / Plejlista", keywords: ["muzika", "music", "zvuk"] },
  { key: "pi:PiCamera", libraryId: "phosphor", group: "general", label: "Kamera / Foto", keywords: ["kamera", "foto", "slike"] },
  { key: "pi:PiVideoCamera", libraryId: "phosphor", group: "general", label: "Video snimak", keywords: ["video", "snimak"] },
  { key: "pi:PiLink", libraryId: "phosphor", group: "general", label: "Link / Linkovi", keywords: ["link", "url", "veza"] },
  { key: "pi:PiQrCode", libraryId: "phosphor", group: "general", label: "QR kod", keywords: ["qr", "kod", "skeniraj"] },
  { key: "pi:PiHouse", libraryId: "phosphor", group: "general", label: "Početna strana", keywords: ["pocetna", "home", "kuca"] },
  { key: "pi:PiBell", libraryId: "phosphor", group: "general", label: "Zvono / Obaveštenja", keywords: ["zvono", "notifikacija"] },
  { key: "pi:PiShieldCheck", libraryId: "phosphor", group: "general", label: "Sigurnost", keywords: ["stit", "sigurnost", "garancija"] },
  { key: "pi:PiLightning", libraryId: "phosphor", group: "general", label: "Munja / Brzo", keywords: ["munja", "grom", "brzo"] },
  { key: "pi:PiCompass", libraryId: "phosphor", group: "general", label: "Kompas / Istraži", keywords: ["kompas", "vodic"] },
  { key: "pi:PiBookmark", libraryId: "phosphor", group: "general", label: "Obeleživač", keywords: ["obelezivac", "bookmark"] },
  { key: "pi:PiShareNetwork", libraryId: "phosphor", group: "general", label: "Deli / Share", keywords: ["share", "podeli"] },
  { key: "pi:PiThumbsUp", libraryId: "phosphor", group: "general", label: "Palac gore", keywords: ["like", "preporuka"] },
  { key: "pi:PiQuestion", libraryId: "phosphor", group: "general", label: "Pitanja / FAQ", keywords: ["pomoc", "faq", "pitanje"] },
];

export const ICONS_BY_LIBRARY: Record<IconLibraryId, readonly IconDefinition[]> = {
  lucide: LUCIDE_ICONS,
  fa6: FA6_ICONS,
  tabler: TABLER_ICONS,
  ionicons: IONICONS_ICONS,
  phosphor: PHOSPHOR_ICONS,
};

export const ALL_LIBRARY_ICONS: readonly IconDefinition[] = [
  ...LUCIDE_ICONS,
  ...FA6_ICONS,
  ...TABLER_ICONS,
  ...IONICONS_ICONS,
  ...PHOSPHOR_ICONS,
];

export const ALL_LIBRARY_ICON_KEYS = ALL_LIBRARY_ICONS.map((icon) => icon.key);

export function getLibraryForIconKey(iconKey: string): IconLibraryId {
  if (iconKey.startsWith("fa6:")) return "fa6";
  if (iconKey.startsWith("tb:")) return "tabler";
  if (iconKey.startsWith("io5:")) return "ionicons";
  if (iconKey.startsWith("pi:")) return "phosphor";
  // Default and legacy keys (e.g. "instagram", "globe", "lu:coffee") map to lucide
  return "lucide";
}

export function searchIcons(
  libraryId: IconLibraryId,
  rawQuery: string,
): readonly IconDefinition[] {
  const query = rawQuery.trim().toLowerCase();
  const list = ICONS_BY_LIBRARY[libraryId] ?? LUCIDE_ICONS;
  if (!query) return list;

  return list.filter((item) => {
    if (item.label.toLowerCase().includes(query)) return true;
    if (item.key.toLowerCase().includes(query)) return true;
    return item.keywords.some((kw) => kw.toLowerCase().includes(query));
  });
}
