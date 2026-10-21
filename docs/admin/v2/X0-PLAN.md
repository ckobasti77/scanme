# X0: plan i kritika (ADMIN v2)

Osnova: grana `codex/jovan-admin-v2-2026-10-11` @ `fa6656f3`. Next 16.2.12, React 19.2, Tailwind 4, GSAP 3.15 (bez `@gsap/react`), bez biblioteke za grafikone, `three` još nije instaliran.

**Kako je rađeno.** Ništa nije menjano. Dev server u ovom koraku ne radi, pa nema snimaka: sve tvrdnje su iz koda, a ono što mora da se vidi u pregledaču nosi oznaku „potvrditi snimkom“. Radilo je pet radnika koji ne vide jedan drugog: kritičar A (dizajn), kritičar B (tehnika, uz impeccable detektor) i tri inventara (glavne stranice, Događaji, tekstovi i naslovi). Ključne nalaze sam proverio u kodu. Skillovi dataviz, gsap-* i threejs-* nisu učitavani u X0; njihova pravila su preuzeta iz zadatka, a učitavaju ih X1, X3 i X4.

**Oznake u tabelama:** R = radio lista (do 7 opcija), S = search-select (više od 7), dyn = opcije iz podataka (R ili S po broju), broj u zagradi = broj opcija bez „Sve“, `ključ` = URL parametar, ★ = postojeći parametar koji se ne menja.

## 0. Najvažnije odluke

1. **Trajni layout je `app/admin/layout.tsx`**, a ne route group. Nijedan fajl se ne seli, pa spajanje sa Aleksinim `main` ostaje lako, a `admin-settings.test.tsx` čita `app/admin/podesavanja/page.tsx` po putanji.
2. **`AdminShell` ostaje kao tanak kompatibilni omotač.** Unutar okvira vraća samo `children`, van njega (dev preview) crta ceo novi okvir. Tako 19 stranica, tri stare komponente koje same prave okvir i svi preview-i rade bez dvostrukog okvira.
3. **Filteri pišu u URL preko `window.history.replaceState`**, ne preko `router.replace`. Nema odlaska na server po kliku, a `useSearchParams` se i dalje ažurira (potvrđeno u `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`).
4. **URL stanje je šema po stranici**, ne jedan globalni spisak ključeva. Postojeći parametri (`task`, `assignee`, `order`, `profile`, `tab`, `period`, `section`…) ostaju i više se ne brišu pri upisu filtera.
5. **Brojevi uz opcije postoje samo u Događajima.** Ostale liste filtrira Convex upit, pa bi brojevi tražili nove upite.
6. **„Poveži nalepnicu“ ostaje samo kao primarna akcija u zaglavlju ekrana** i izlazi iz navigacije sekcija. Ruta `povezi` ostaje.
7. **Finansije idu u sidebar** (prikaz, period, kategorija), sa postojećim URL parametrima.
8. **Sticky zaglavlje i vodoravni skrol se u CSS-u isključuju.** Omotač tabele je `overflow-x: clip`, a `auto` postaje samo kad tabela stvarno ne staje; tada zaglavlje nije sticky.
9. **Aktivna stavka navbara:** linija ispod je tačno `#6FC05D` u obe teme. Tekst je `#6FC05D` u tamnoj temi, a u svetloj `--accent-text` (`#2f6d23`), jer `#6FC05D` na svetloj podlozi ima kontrast 2,08:1. Sve je jedan token, `--admin-nav-active`.
10. **3D se pravi** kao opcioni prekidač uz 2D. Štandovi su nepravilni poligoni, pa nisu instanced kocke nego izdužen poligon po štandu.

## 1. Tabela po stranici

### 1.1 Stranice iz navigacije

| Stranica | Sada na vrhu | Sidebar | Zaglavlje ekrana |
|---|---|---|---|
| **Dashboard** `/admin` · `admin-dashboard-foundation.tsx` | Datum; H1 je broj stavki ili poruka greške (fluidan do 4,75 rem); segment Sve / Moje; traka signala | Pogledi `obim`: Sve, Moje. Blok „Misije danas“ iz postojećih upita. Blok „Brzi skokovi“ (linkovi sa filterima). HUD „Danas“ na dnu (X4) | H1 „Dashboard“, datum iznad. Broj stavki ide u traku signala. Bez akcija |
| **Klijenti** `/admin/klijenti` · `admin-clients.tsx` | H1 do 4,4 rem; pretraga i dva selecta sa skrivenim labelama | Pretraga `q`. Status `status` (2) R. Sortiranje `sort`: Hitnost, Naziv, Poslednja promena | „Klijenti“. Bez akcija |
| **Profil klijenta** `/admin/klijenti/[accountId]` · `admin-client-profile.tsx` | Link nazad; H1 ime; čipovi; 6 dugmadi sekcija; select kontakta | Link „Svi klijenti“. Navigacija: 6 sekcija preko `section`★. Kontakt (`contact`★) i lokal (`venue`★) ostaju u ekranu | Ime klijenta, SMK i status |
| **Inbox** `/admin/inbox` · `admin-inbox.tsx` | H1; „Evidentiraj kontakt“; pretraga na Enter; tri selecta | Pretraga `q` (debounce 250 ms). Status `status` (5) R. Kanal `kanal` (5) R. Zaduženi `assignee`★ dyn | „Inbox“ + „Evidentiraj kontakt“ |
| **Zadaci** `/admin/zadaci` · `admin-tasks.tsx` | H1; „Novi zadatak“; 5 tabova; pretraga; 4 selecta | Pogledi `pogled`: Sve, Danas, Kasni, Odloženo, Završeni. Pretraga `q`. Zaduženi `assignee`★ dyn. Klijent `klijent` dyn S. Lokal `lokal` dyn S (zavisi od klijenta). Vezani objekat `objekat` (11) S | „Zadaci“ + „Novi zadatak“. `task`★ ostaje |
| **Proizvodi** `/admin/operativa/proizvodi` · `admin-products.tsx`, `admin-products-surface.tsx` | Izbor lokala: pretraga, Filter lokala, tekst „Sortiranje: Hitnost“. Inventar: pretraga, 4 selecta, Tabela / Vizuelno | Navigacija Operativa. Izbor lokala: pretraga `q`, Lokali `status` (2) R. Inventar (`venue`★): pretraga `q`, Tip `tip` (5) R, Dizajn `dizajn` (2) R, Usluga `usluga` (2) R, Status `status` (3) R | „Proizvodi“, odnosno naziv lokala + „Svi lokali“. Tabela / Vizuelno ostaje uz listu. Tekst o sortiranju se briše |
| **QR kodovi** `/admin/operativa/qr` · `admin-qr.tsx`, `admin-qr-workspace.tsx` | H1; pretraga i tri selecta bez vidljivih labela | Navigacija Operativa. Pretraga `q` (početno iz `code`★). Povezanost `veza` (2) R. Vrsta kanala `vrsta` (2) R. Stanje `status` (3) R | „QR kodovi“ |
| **Porudžbine** `/admin/operativa/porudzbine` · `admin-orders.tsx` | H1; 3 taba; pretraga; 5 selecta; „Samo sa problemom“ | Navigacija Operativa. Pogledi `pogled`: Aktivne, Završene, Arhivirane. Pretraga `q`. Zaduženi `assignee` dyn. Uplata `uplata` (3) R. Dizajn `dizajn` (4) R. Izvršenje `izvrsenje` (10) S. Prekidač „Samo sa problemom“ `problem`. Sortiranje `sort`: Najnovije, Najstarije | „Porudžbine“. `order`★ ostaje |
| **Usluge** `/admin/usluge/{links,review,meni}` · `admin-service-operations.tsx` | Pilule Links / Review / Meni iznad naslova; 5 čipova; pretraga; select sortiranja; desni panel | Navigacija Usluge. Pogledi `pogled`: Svi, Aktivni, Grace, Pauzirani, Problem. Pretraga `q`. Sortiranje `sort` (3) | Naziv usluge. Desni panel „Izaberi lokal“ ostaje (`profile`★) |
| **Finansije** `/admin/finansije` · `admin-finance.tsx` | H1; „Unesi direktni trošak“; 3 taba; čipovi perioda i kategorije | Pogledi `tab`★: Naplaćeno, Očekivano, Profit. Period `period`★ ili `future`★ (4–5) R. Kategorija `filter`★ ili `profit`★ (3–6) R | „Finansije“ + „Unesi direktni trošak“. Tri kartice ostaju u ekranu. `account`★ ostaje |
| **Tim** `/admin/tim` · `admin-team.tsx` | H1; kartice-dugmad članova; select „Član tima“; 3 taba | Kontekst „Član tima“ `clan` dyn, uvek otvorena lista, sa brojem otvorenih zadataka. Navigacija `tab`: Pregled, Zadaci, Razgovori | Ime člana (ili e-mail, jednom) i četiri brojača. Akcije „Otvori sve zadatke“, „Otvori Inbox“ |
| **Pretraga** `/admin/pretraga` · `admin-search.tsx` | H1; Rezultati / Aktivnost; polje; 6 čipova vrste; izbor opsega | Pogledi `view`★. Rezultati: Vrsta `group`★ (6) R, Opseg `opseg` (prilagođena grupa sa predlozima). Aktivnost: Vrsta promene `kategorija` (10) S, Akter `akter` dyn, Opseg | „Pretraga“. Glavno polje (`q`★) ostaje u ekranu jer je sadržaj stranice |
| **Podešavanja** `/admin/podesavanja` · `admin-settings.tsx` | H1; 6 tabova; dijalog za nesačuvane izmene | Navigacija `tab`: Opšte, Pretplate, Plaćanja, Komunikacija, Cene i popusti, Referral. Promena prolazi kroz postojeću zaštitu nesačuvanih izmena | „Podešavanja“, naziv odeljka i oznaka „Nesačuvane izmene“ |

### 1.2 Događaji (referentna oblast u X1)

**Zajedničko, sada:** oznaka „Događaji“, H1 je naziv događaja, veliko „Poveži nalepnicu“, select „Događaj“ gore desno, `AdminSubnav` koji ne ostaje na mestu, a na telefonu red pilula.

**Zajedničko, novo:**
- Sidebar: kontekst „Događaj“ (isti prelaz kao sada, `switchEventHref`), pa navigacija sekcija u grupama Katalog, Sajam i Posle sajma, sa bedževima hitnosti.
- Zaglavlje: iznad naslova naziv događaja, H1 je naziv sekcije, desno „Poveži nalepnicu“ i akcije sekcije.

| Sekcija | Sidebar ispod navigacije | Akcije u zaglavlju |
|---|---|---|
| Pregled | — | — |
| Poveži nalepnicu | — (tok ostaje u ekranu) | — |
| Modeli | Pretraga `q` (jedina; proširuje se na naziv izlagača). Izlagač `izlagac` dyn sa brojevima. Brend `brend` dyn (zavisi od izlagača). Paket `paket` (3) R. Status `status` (3) R. Problemi `problemi` (3) R. QR `qr` (2) R. Fotografija `foto` (2) R. Sve sa brojevima | „Import kataloga“ |
| Detalj modela | Kao Modeli, da „Nazad na listu“ čuva filtere | Prethodni / Sledeći, Objavi / Povuci |
| QR kodovi | Pretraga `q`. Izlagač, Brend, Model `model` dyn S. Stanje `stanje` (5) R sa brojevima | „Dodela u većem broju“ |
| Izlagači | Pretraga `q`. Segment `segment` (2) R sa brojevima | — |
| Import | — | — |
| Interakcije, lista | Pogledi `paket` (5, sa brojevima). Pretraga `q` | — |
| Interakcije, izlagač | „Na ovoj strani“ (4 sidra). Status pitanja `status` (4) R. Stanje pasoša `stanje` (5) R | „Svi izlagači“ |
| Sponzorisano | — | „Osveži listu“ |
| Analitika | „Na ovoj strani“ (sidra delova). `model` otvara detalj | „Osveži“, „Izvezi CSV“ |
| Leadovi | Izlagač, Brend, Model dyn. Period `od`, `do` (dva datuma). Tip `tip` (2) R. Isporuka `isporuka` (2) R | — |
| Follow-up, Saglasnost | — | — |
| Izveštaji | Dan `dan` R, Izlagač `izlagac` dyn, Stanje `status` (6) R, sve sa brojevima | „Preuzmi zbirno“ |
| Brisanje | — | — |

U Modelima se combobox „Model“ uklanja, a `?model=` iz starih linkova ostaje kao čip koji se može ukloniti. Prekidač Tabela / Kartice (`prikaz`) ostaje uz listu jer menja prikaz, ne sadržaj.

### 1.3 Stranice van navigacije

| Stranica | Odluka |
|---|---|
| `/admin/posta` (nema link u navigaciji) | Radi u okviru i dobija zaglavlje ekrana. Folderi, „Sve / Nepročitane“ i pretraga ostaju u ekranu; selidba u sidebar je otvorena stavka |
| `/admin/debug/[contextId]` | Okvir i zaglavlje. Traka `sticky top-[4.5rem]` postaje `top-0` |
| `/admin/memories`, `/admin/venue`, `/admin/customers/**` | U okviru preko kompatibilnog `AdminShell`. Sidebar pokazuje podrazumevani blok „Brzi skokovi“ |
| `/admin/login`, `/admin/scanme-links/[id]/editor` | Bez okvira |
| `/admin/cards`, `/admin/page`, `/admin/google-reviews`, `/admin/scanme-links`, `/admin/customers` | Samo preusmeravaju |

## 2. Arhitektura

### 2.1 Trajni layout

- **`app/admin/layout.tsx`** (server): `metadata.title = "ScanMe Admin"` kao rezerva i `<AdminFrameGate>{children}</AdminFrameGate>`. Šablon naslova se ne uvodi, jer stranice već pišu pun naslov; naslove sređuje X5.
- **`AdminFrameGate`** (klijent) čita `usePathname()` i pita `isFramedAdminPath()`:
  - bez okvira su `/admin/login` i `/admin/scanme-links/*/editor`, i tu vraća samo `children`;
  - sve ostalo dobija `<AdminGuard><AdminFrame>{children}</AdminFrame></AdminGuard>`.
- **Stranice.** X1 skida `AdminGuard` i `AdminShell` iz 19 fajlova u `app/admin/**`, uključujući `dogadjaji/[eventSlug]/layout.tsx`. `location-admin.tsx`, `memories-admin.tsx` i `venue-admin.tsx` se ne diraju.
- **`AdminGuard`** štiti isto kao sada, samo jednom, u layoutu.
- **Dev preview.** Postojeće rute ostaju i crtaju novi okvir preko `AdminShell`. Dodaje se `app/dev/admin-okvir-preview/layout.tsx` i `[[...ruta]]/page.tsx`: jedan trajni okvir nad svim preview površinama. Samo tu se bez prijave može proveriti da se okvir ne remountuje i snimiti prelaz između oblasti.

### 2.2 Novi fajlovi

**`components/admin/frame/`**

| Fajl | Uloga |
|---|---|
| `admin-frame.tsx` | Koren `.admin-v1`, `h-[100dvh] overflow-hidden`, provajderi, skip link |
| `admin-frame-gate.tsx` | Kapija iz 2.1 |
| `admin-navbar.tsx` | `data-admin-frame="navbar"`. Linkovi iz `ADMIN_NAV_ITEMS`, meniji Operativa i Usluge preneti bez izmene, klizna linija, pretraga sa „Ctrl K“, podešavanja, obaveštenja, tema, profil |
| `admin-sidebar.tsx` | `<aside data-admin-frame="sidebar">`: logo, skrol sa fade maskama, mesto za HUD |
| `admin-sidebar-content.tsx` | Sadržaj iz registra i živih podataka; isti u sidebaru i u fioci |
| `admin-sidebar-accordion.tsx` | Harmonika filtera |
| `admin-search-select.tsx` | Combobox i lista u toku dokumenta |
| `admin-sidebar-store.tsx` | Provajder i `useAdminSidebarLive()` |
| `admin-screen.tsx` | `<main id="main-content" data-admin-frame="screen">`: jedini skrol kontejner, sadržaj do 90 rem, jedan `<Suspense>` oko `children`, vraćanje skrola pri promeni rute |
| `admin-page-header.tsx` | `AdminPageHeader({ title, eyebrow?, description?, badge?, actions? })` i dugme „Filteri (N)“ ispod `lg` |
| `admin-drawer.tsx` | Fioka na telefonu |
| `use-admin-gsap.ts` | Jedino mesto gde okvir uvozi GSAP |

**`lib/admin-v2/`** (čiste funkcije, testovi `*.test.ts`)

| Fajl | Uloga |
|---|---|
| `frame/routes.ts` | `isFramedAdminPath`, `adminRouteKey` (preview ruta → kanonska admin ruta), `previewHref` |
| `sidebar/types.ts`, `sidebar/registry.ts`, `sidebar/configs/*.ts` | Registar i konfiguracija po stranici |
| `sidebar/accordion.ts` | Reducer harmonike, `groupControlKind(n)` sa pragom 7, tekst zaglavlja, čipovi |
| `query/url-state.ts` | Čitanje i pisanje URL stanja po šemi |
| `motion.ts` | Tokeni pokreta |

**Menjaju se:** `components/admin/admin-shell.tsx`, `components/admin/admin-ui/use-admin-query-state.ts`, `admin-ui/admin-data-view.tsx`, `components/admin/admin-primitives.tsx`, `components/admin/events/**`, `components/admin/admin-events-preview.tsx`, `app/globals.css`, `lib/i18n/sr/admin-ui.ts`.

**Van dozvoljenih putanja, uz razlog u belešci:** `lib/i18n/types.ts`. AGENTS.md traži da svaki novi tekst ima ključ u `Dict` interfejsu, a interfejsi žive samo tu. Menja ga isključivo vođa i samo dodaje.

### 2.3 Registar sidebara po ruti

```ts
// lib/admin-v2/sidebar/types.ts
export type SidebarOption = { value: string; label: string; count?: number };
export type SidebarGroup = {
  id: string;                               // URL ključ
  label: string;
  kind?: "choice" | "toggle" | "dates" | "custom";   // podrazumevano "choice"
  options?: readonly SidebarOption[];       // bez njih: opcije stižu uživo
  anyLabel?: string;                        // „Sve“; bez njega grupa uvek ima vrednost
  defaultValue?: string;                    // ne piše se u URL
  dependsOn?: string;                       // promena roditelja briše ovu grupu
  keys?: readonly string[];                 // "dates": ["od", "do"]
};
export type SidebarConfig = {
  id: string;
  context?: { id: string; label: string; open?: boolean };
  nav?: readonly AdminSubnavGroup[];        // tip iz lib/admin-v1/subnav.ts
  views?: { key: string; label: string; items: readonly SidebarOption[]; defaultValue: string };
  search?: { key: string; label: string; placeholder?: string };
  groups?: readonly SidebarGroup[];
  sort?: { key: string; label: string; options: readonly SidebarOption[]; defaultValue: string };
  blocks?: readonly ("missions" | "jumps")[];
};
export function resolveAdminSidebar(pathname: string, search: URLSearchParams | string): SidebarConfig;

// components/admin/frame/admin-sidebar-store.tsx
export type SidebarLive = {
  context?: { value: string; options: readonly SidebarOption[]; onChange: (value: string) => void };
  nav?: readonly AdminSubnavGroup[];                        // sa bedževima
  viewCounts?: Record<string, number>;
  options?: Record<string, readonly SidebarOption[]>;       // dinamičke opcije
  counts?: Record<string, Record<string, number>>;          // brojevi uz statične opcije
  disabled?: Record<string, string | false>;                // razlog, npr. „Prvo izaberi klijenta“
  custom?: Record<string, { summary?: string; body: ReactNode }>;
  missions?: readonly Mission[];
  guard?: (patch: Record<string, string | null>) => boolean;   // Podešavanja
};
export function useAdminSidebarLive(live: SidebarLive | null): void;   // bez provajdera ne radi ništa
```

- Registar prima i putanju i parametre, jer Proizvodi i Pretraga menjaju sadržaj po parametru.
- Stranica bez konfiguracije dobija podrazumevanu: samo blok „Brzi skokovi“.
- Stranica objavljuje samo ono što zna iz podataka. Sidebar čita i piše URL sam, pa stranica ne prosleđuje `onChange` za filtere.
- Hook bez provajdera ne radi ništa. To je uslov da postojeći testovi koji renderuju `Admin*Preview` sa `renderToStaticMarkup` i dalje prolaze.

### 2.4 Harmonika i opcije

- **Jedna otvorena grupa.** `accordionReducer(openId, { type: "toggle", id })`. Podrazumevano su sve zatvorene. Izbor događaja deli isto stanje.
- **Zaglavlje grupe** je `<button data-admin-filter-toggle aria-expanded aria-controls>` sa tekstom „Status · Aktivni“ i strelicom koja se okreće za 180° (180 ms, ease out).
- **Telo grupe.** Visina ide preko `grid-template-rows: 0fr → 1fr` u CSS-u. Zatvoreno telo ima `inert`, da skrivene opcije ne primaju fokus.
- **Prag 7.** `groupControlKind(n)`: do 7 opcija radio lista, više od 7 search-select. „Sve“ se ne broji. Dinamičke grupe odlučuju po broju opcija koje stignu.
- **Radio lista** su pravi `<input type="radio">` u `role="radiogroup"`, pa strelice rade same. Broj stoji desno, `tabular-nums`.
- **Search-select:** `role="combobox"` sa `aria-activedescendant` i lista `role="listbox"` u toku dokumenta, najviše 16 rem visine i 50 pogodaka uz „Suzi pretragu“. Nije `absolute`, jer bi ga skrol sidebara odsekao.
- **Tastatura:** Enter i Space otvaraju grupu, strelice idu kroz opcije, Enter bira, Escape zatvara grupu i vraća fokus na zaglavlje.
- **Izbor važi odmah.** Čipovi pokrivaju grupe i pretragu. „Očisti sve“ ne dira pogled, sortiranje ni kontekst.
- **Mete:** najmanje 44 px ispod `lg`, 36 px od `lg` naviše.

### 2.5 URL stanje

```ts
// lib/admin-v2/query/url-state.ts
export type UrlField = { key: string; values?: readonly string[]; pattern?: RegExp; defaultValue?: string; maxLength?: number };
export function sidebarUrlFields(config: SidebarConfig): UrlField[];
export function readUrlState(fields: readonly UrlField[], search: URLSearchParams | string): Record<string, string>;
export function writeUrlState(fields: readonly UrlField[], search: URLSearchParams | string, patch: Record<string, string | null>): string;

// components/admin/admin-ui/use-admin-query-state.ts
export function useAdminUrlState(fields: readonly UrlField[]): [Record<string, string>, (patch: Record<string, string | null>) => void];
export function useAdminQueryState(): [AdminQueryState, (patch: AdminQueryPatch) => void];   // Događaji, isti potpis
```

- **Greška koja se usput ispravlja:** današnji `setQuery` serijalizuje samo poznate ključeve, pa prvi upis filtera briše sve tuđe parametre.
- Podrazumevana vrednost se ne piše u URL. Nevažeća vrednost se čita kao da je nema.
- Vrednosti u URL-u su postojeće interne vrednosti (npr. `needs_reply`), bez tabela prevoda. Tako isti izbor daje iste argumente upita kao pre.
- Novi ključevi su na srpskom, kao u Događajima. Postojeći se ne preimenuju.
- Pretraga čeka 250 ms, logika se prenosi iz `AdminFilterBar`.
- Filteri zamenjuju stavku istorije. Sekcije i detalji su linkovi, pa Back vodi na prethodnu stranicu sa sačuvanim filterima.

### 2.6 Okvir, telefon i fioka

- **Mere.** Sidebar je 17,5 rem (18,5 rem od 1440 px). Navbar je 3,5 rem. Ekran ima ugao 1 rem i razmak 0,75 rem desno i dole. Naslov je fiksnih 1,75 rem (1,5 rem na telefonu).
- **Površine.** Sidebar i navbar su na `--admin-app`, ekran na `--admin-surface`, paneli na `--admin-surface-strong`. Žuto-zeleni sjaj `.admin-v1-frame` se uklanja.
- **Navbar od 1024 do 1279 px.** Devet stavki i alati ne staju po računu. Red linkova tada skroluje vodoravno bez trake, sa fade maskom, a aktivna stavka se dovodi u vidno polje. Lupa je bez oznake „Ctrl K“, profil je ikonica. Potvrditi snimkom na 1024 i 1280.
- **`ThemeToggle` mora stalno da bude u DOM-u.** `app/layout.tsx` ima globalni plutajući prekidač koji se sakriva samo dok postoji lokalni.
- **Okvir nosi `data-reveal="off"`**, inače globalni `TextRevealGlobal` sakriva tekst.
- **Ispod `lg`:** gornja traka sa dugmetom menija i ekran ispod nje; ekran i tu skroluje sam.
- **Fioka** je Radix Dialog (fokus zamka i Escape), sleva, `className="admin-v1"`. Sadrži logo, glavnu navigaciju i isti sadržaj sidebara. „Filteri (N)“ otvara je sa fokusom na pretrazi ili prvoj grupi. Zatvara se prevlačenjem ulevo (30 % širine ili brz potez). Otvaranje traje 240 ms, zatvaranje 180 ms; `ui/sheet.tsx` (500 i 300 ms) se ne koristi.
- **Prelomi lista** prate širinu ekrana kao kontejnera, ne viewport. `AdminDataView` danas bira tabelu ili kartice po viewportu, što sa sidebarom više ne važi.

### 2.7 Pokret

- **Tokeni** su u `lib/admin-v2/motion.ts`: trajanja 0,12, 0,18, 0,24 i 0,32 s; ulaz `power3.out` (`cubic-bezier(0.16, 1, 0.3, 1)`), izlaz `power2.in`, kraći od ulaza. Isti tokeni stoje u `globals.css` kao `--admin-dur-1…4` i `--admin-ease-out`.
- **GSAP živi u** `components/admin/frame/**`, a od X3 i X4 u `components/admin/events/analytics/**` i `admin-ui/admin-odometer.tsx`. Uvek kroz `use-admin-gsap.ts`: `gsap.context()` u `useLayoutEffect`, `ctx.revert()` pri izlasku, `gsap.matchMedia()` za reduced motion. `useGSAP` ne postoji u projektu.
- **CSS, bez GSAP-a:** visina harmonike, strelica i pritisak dugmeta.
- **GSAP u X1:** linija navbara (`x` i `scaleX`, bez širine), pretapanje sadržaja sidebara pri promeni rute (izlaz 120 ms, ulaz 220 ms, pomak 6–8 px, stagger do 120 ms) i fioka.
- Bez animacije pri prvom učitavanju i bez početnog skrivanja u CSS-u.
- Novi kod u adminu ne uvozi framer-motion.

### 2.8 `AdminSubnav` i `AdminFilterBar`

- **`AdminSubnav`** se briše u X1; jedini korisnik je `event-frame-view.tsx`. Test `admin-subnav.test.tsx` zamenjuje test navigacije u sidebaru.
- **`AdminFilterBar`** se briše u X1, kad se prebaci svih 8 mesta upotrebe, a sva su u Događajima.
- **`AdminHierarchyPicker`** ostaje za `mode="select"` (forme). Grana `filter` se briše jer ostaje bez korisnika.
- Kraj X1: jedan sistem navigacije oblasti i filtera.

### 2.9 Tokeni u `app/globals.css`

- **Definisati ono što se koristi a ne postoji:** `--admin-focus` (103 upotrebe), `--admin-accent-soft` (6), `--admin-nav-active` (4), `--admin-accent-border` (2), `--admin-link` (1). Zbog `--admin-nav-active` aktivan tab u Zadacima i Timu danas ima providnu pozadinu i beo tekst.
- **Novi:** `--admin-sidebar-w`, `--admin-navbar-h`, `--admin-radius-screen` (1 rem), `--admin-radius-inner` (0,25 rem), tokeni pokreta. U X3: `--admin-chart-1…8` i `--admin-seq-100…700` za obe teme.
- **Zaglavlje tabele centralno:** `[data-admin-primitive="table"] thead` dobija `position: sticky; top: 0`, pa `AdminTable` (Klijenti, Zadaci, Porudžbine, Proizvodi, QR, Usluge) dobija sticky zaglavlje bez izmene stranica.
- **Ne dira se u X1:** pravilo `[class*="bg-[var(--admin-ink)]"]` koje svako „ink“ dugme boji u zeleno. Novi kod ne koristi `bg-[var(--admin-ink)]`. Uklanjanje je za X5.

### 2.10 Zamke (ulaze u recept)

1. **Sticky i vodoravni skrol.** `overflow-x: auto` pravi skrol kontejner i za uspravnu osu, pa `thead` lepi za omotač, ne za ekran. `AdminDataView` i `AdminTable` zato dobijaju `overflow-x: clip` i hook koji meri `scrollWidth` i tek tada stavlja `auto`. `md:max-h-[70vh] md:overflow-y-auto` se briše (`admin-data-view.tsx:276`, `interakcije-glas-publike-view.tsx:310`).
2. **`border-collapse` i sticky.** Ivice sticky ćelija ne putuju sa njima; linija ispod zaglavlja ide kao `box-shadow`.
3. **Skrol posle navigacije.** Next vraća na vrh samo prozor. Ekran sam vraća `scrollTop` na 0 pri promeni putanje i pamti poziciju za Back.
4. **`sticky top-24` i `top-[4.5rem]`** računaju na visinu starog zaglavlja. U ekranu je to `top-0`.
5. **`useSearchParams` traži `<Suspense>`**, inače build pada na statičkim stranicama. Postoji jedan, u `AdminScreen`.
6. **Testovi mockuju `next/navigation` samo sa `useRouter`.** Kad stranica dobije URL hook, mock mora da ima i `usePathname` i `useSearchParams`.
7. **Ugrađene površine ne registruju sidebar** (Inbox u profilu klijenta, sažetak Finansija).
8. **Polling ne animira.** Objava živih podataka u sidebar poredi vrednosti, inače svaki poll od 60 s pokreće pretapanje.
9. **Portali** (meni, dijalog, fioka) idu u `body` i moraju da nose `className="admin-v1"`.
10. **`eslint-plugin-react-hooks` 7** ne dozvoljava `setState` u efektu ni čitanje ref-a u renderu. Uzor je `SearchField` u `admin-filter-bar.tsx`.

### 2.11 Testovi u X1

- `lib/admin-v2/sidebar/accordion.test.ts`: najviše jedna otvorena grupa; prag 7 na 7 i 8 opcija.
- `lib/admin-v2/query/url-state.test.ts`: upis, čitanje, podrazumevano se ne piše, tuđi parametri ostaju, nevažeće se odbacuje, krug upis–čitanje (Back).
- `lib/admin-v2/sidebar/registry.test.ts`: svaka ruta iz navigacije ima konfiguraciju, sekcije Događaja, preview putanje, login bez okvira.
- `components/admin/frame/admin-sidebar.test.tsx`: markup sa `data-admin-filter-toggle`, `aria-expanded`, `aria-controls`, `role="radiogroup"`.
- **Namerno se menjaju:** `event-sections.test.ts` (navigacija bez „Poveži nalepnicu“) i testovi pogleda koji proveravaju filter blok (`modeli-view`, `qr-view`, `izlagaci-view`, `interakcije-izlagaci-view`, `interakcije-glas-publike-view`, `interakcije-pasos-view`, `leadovi-view`, `admin-events-reports`).

## 3. Analitika v2

**Upiti.** Postojeći `getEventAnalytics` (A) i `getEventAudience` (B) se ne menjaju. Dodaju se dva nova u `convex/fairEventAnalytics.ts`, sa čistim agregacijama u novom `convex/lib/fairEventAnalytics.ts`. Oba samo čitaju, na postojećim indeksima i sa ograničenjima.

| Upit | Vraća | Čita |
|---|---|---|
| **C** `getEventEngagement({ eventId, at })` | Skenove po modelu i danu; posetioce i leadove po danu; raspodelu modela po posetiocu; angažovane posetioce po vrsti; posetioce sa pečatom | `fairUniqueScans` (do 5000), brojače po modelu i danu, `fairRatings`, `fairAudienceVotes`, `fairSurveyResponses` (do 2000), `fairPassportStamps` (do 2500), `fairLeads` (do 3000) |
| **D** `getModelAnalytics({ eventId, eventModelId, at })` | Skenove modela po danu i satu, ocene 1–5, glasove, leadove po vrsti | Brojače modela po danu i satu, `fairRatings` modela (do 500), pitanja (do 30), `fairLeads` modela (do 500) |

**Procena čitanja na uzorku sa sajma** (15 modela, 4 štanda, 3 dana; procena, X3 je meri):

| Upit | Dokumenata | Kada |
|---|---|---|
| A (postojeći) | oko 3.500–5.000 | Na otvaranju i na 60 s |
| B (postojeći) | oko 1.600 | Na otvaranju i na 60 s |
| C (novi) | oko 1.400–1.600; najviše oko 15.500 uz sva ograničenja | Na otvaranju i na 5 min |
| D (novi) | oko 300–800 | Samo kad se otvori detalj modela i na „Osveži“ |

| # | Deo i pitanje | Izvor | Nova čitanja | Fixtures |
|---|---|---|---|---|
| 1 | KPI traka: koliko je danas i kuda ide? | A `kpis` i `days`; B `visitors`; C posetioci i leadovi po danu | U okviru C | Dani 104, 177, 179; KPI celog sajma |
| 2 | Levak: gde se gubi? | A skenovi; B posetioci; C angažovani i leadovi | U okviru C | 460 → 310 → angažovani (izmišljeno) → 0 |
| 3 | Dan × sat: kad je gužva? | A `hours` (već nosi sve dane) | 0 | Tri dana × 08–21, zbir po danu, vrh 39 |
| 4 | Rang modela: ko vodi i ko raste? | A `models`; C skenovi po modelu i danu | U okviru C | 15 TEST modela; vodeći oko petine skenova |
| 4a | Detalj modela | D; proseci štanda i sajma iz A | D | `previewModelAnalytics(id)` |
| 5 | Rang štandova i paketi: šta paket donosi? | `analyticsStandRows` nad A | 0 | 4 štanda, tri paketa, izmišljeni brojevi |
| 6 | Dubina: koliko modela posetilac pogleda? | C raspodela; B pečati i završeni pasoši | U okviru C | Izmišljena raspodela koja daje 310 posetilaca i 431 par; 210 pečata; 5 pasoša |
| 7 | Mapa hale: gde je gužva? | A `heat` i redovi štandova; geometrija `fairMapForEventCode` | 0 | Postojeće TEST lokacije |
| 8 | Uređaji, jedna rečenica | B `devices` | 0 | 454 telefon, 2 računar, 0 tablet, 4 bota |
| 9 | Uvidi: 3–6 rečenica | Pravila nad A, B i C | 0 | Proizlazi iz ostalih |
| 10 | CSV i „Prikaži kao tabelu“ | `analyticsCsv` sa novim blokovima; svaki grafikon u `ChartFrame` | 0 | — |

**Odluke o analitici**
- **Angažovani** su posetioci sa ocenom, glasom, anketom ili leadom. Pečati se prikazuju odvojeno, jer nastaju sami pri skenu (`convex/lib/fairScans.ts:131`). Garaža se ne broji: server nema red po posetiocu.
- **Nula leadova** je u levku označena kao problem, ikonicom i tekstom, uz „šta proveriti“ i link na Leadovi → Saglasnost.
- **Dva stubičasta grafikona se uklanjaju:** dani prelaze u KPI trend, sati u matricu. Parametar `dan` Analitici više ne treba.
- **Pregled događaja ne dobija nijedan novi upit.** Dobija HUD i misije u X4, iz postojećeg `getEventDashboard`, i link „Otvori analitiku“.
- **Pravila Uvida** su u `lib/admin-v2/analytics/insights.ts`, po prioritetu, najviše 6: nema leadova; odnos vikenda i prvog dana od 1,3× naviše; udeo vodećeg štanda danas od 40 %; najjači sat; udeo posetilaca sa jednim modelom od 60 %; završenost pasoša ispod 5 %; razlika paketa od 2× (uz „korelacija, ne uzrok“); udeo vodećeg modela od 20 %.
- **Boje.** Paleta od 8 boja ide u `--admin-chart-1…8`. Boja prati entitet po stabilnom ključu, nikad rang. Matrica koristi plavu 100–700, a mapa skalu iz `lib/fair-heat.ts`. Današnje `#2f6fe4` i `#11aec4` u `analitika-view.tsx` se zamenjuju.
- **Fajlovi.** Komponente u `components/admin/events/analytics/`: `chart-kit.tsx` (drži vođa), `kpi-strip`, `funnel`, `day-hour-matrix`, `model-leaderboard`, `model-detail-drawer`, `stand-ranking`, `depth`, `heat-map-2d`, `heat-map-3d`, `insights`. Logika u `lib/admin-v2/analytics/*.ts`.
- **Fixtures.** `preview-analytics-fixtures.ts` dobija `previewEngagement` i `previewModelAnalytics`. `preview-dashboard-fixtures.ts` dobija treći dan sajma za HUD.

## 4. Gamifikacija

| Šta | Već postoji | Novo | Gde | Korak |
|---|---|---|---|---|
| **Misije** | `Todo` u `pregled-view.tsx:129` (Hitno, Uskoro, Info, link na filtriranu sekciju, „Sve je spremno“). Dashboard: lista „Za reakciju“, traka signala, widget Zadaci | `lib/admin-v2/missions.ts`: misije iz akcija događaja i iz Dashboard brojača; napredak prema dnevnoj polaznoj tački u `localStorage`. `admin-ui/admin-missions.tsx` sa krugom napretka | Sidebar Dashboard-a (X2 lista, X4 napredak) i Pregled događaja | X2, X4 |
| **„Sve čisto“** | Poruka bez ograničenja | Najviše jednom dnevno, ključ sa datumom | Isto | X4 |
| **HUD „Danas“** | `Header` u `pregled-view.tsx:55`: faza, dani, odbrojavanje | `frame/admin-hud.tsx` na dnu sidebara: „Dan 3 / 3 · do kraja dana…“, traka napretka, tačka „uživo“, skenovi danas. Samo dok traje sajamski dan | Sidebar, sve stranice | X4 |
| **Odometar** | Nema | `admin-ui/admin-odometer.tsx`: okreće se samo kad se vrednost promeni, nikad pri prvom prikazu | KPI redovi, HUD, rangovi | X4 |
| **Medalje i strelice** | Nema; rang je obična tabela | `AdminRankBadge` (1–3 kao prsten u boji, bez emoji) i `RankDelta` | Rang modela (X3), rang štandova (X4) | X3, X4 |
| **Rekordi** | Nema | `lib/admin-v2/analytics/records.ts`: rekord sata, najjači štand dana, prvi lead. Toast samo kad vrednost poraste tokom dana | Uz grafikone u Analitici | X4 |
| **Prečice** | Ctrl K u `admin-search-command.tsx:56`, bez vidljivog traga | X1: dugme sa „Ctrl K“. X4: `lib/admin-v2/shortcuts.ts`, lista na `?`, G pa D, K, I, Z, E, F, a `/` fokusira pretragu stranice | Okvir | X1, X4 |
| **Tihi režim** | Nema | `lib/admin-v2/quiet-mode.ts` i prekidač u meniju profila. Gasi potvrde i toastove; odometar ostaje | Meni profila | X4 |

**HUD i trošak.** Okvir stalno čita samo spisak događaja. `getEventDashboard` se čita na 60 s samo dok je sajamski dan otvoren, a `AdminEventFrame` koristi isti rezultat kad je to isti događaj.

**Krug napretka** se ne animira (`stroke-dashoffset` nije `transform`), menja se odmah. Animira se samo potvrda rešene misije.

## 5. 3D toplotna mapa

- **Izvodljivo.** Geometrija postoji: `fairMapForEventCode(eventCode)` vraća zone sa obrisom i poligonima štandova u pikselima izvorne slike. `lib/fair-map/**` se samo čita.
- **Vrednost.** 2D prikazuje jednu veličinu (jedinstveni po štandu). 3D dodaje drugu: visina je broj skenova, boja ostaje toplotna skala. Tako se u jednom pogledu vidi doseg naspram obima.
- **Geometrija.** Jedna scena. Svaki štand je `ExtrudeGeometry` jedinične visine iz svog poligona, a visina ide preko `scale.y`. To je odstupanje od „instanced mesh“: `InstancedMesh` traži istu geometriju, a štandovi su nepravilni. Elektromobilnost ima manje od 40 lokacija, pa je to manje od 40 poziva crtanja. Preko 150 lokacija se sve spaja u jednu geometriju sa bojom po temenu.
- **Kamera.** Ortografska, izometrijski početni ugao, `OrbitControls` iz `three/examples/jsm` bez damping-a. Crta se samo na promenu kontrola, podataka ili veličine. Uz reduced motion nema animacije kamere.
- **Oznake** štandova su HTML sloj preko platna.
- **Klik** ide preko `Raycaster` na `pointerup` bez prevlačenja i otvara isti detalj štanda kao 2D.
- **Tastatura** koristi listu štandova ispod mape.
- **Učitavanje.** `next/dynamic(() => import("./heat-map-3d"), { ssr: false })`, tek kad se pritisne „3D“. `three` ne ulazi u glavni bundle.
- **Rezerva.** 2D je podrazumevan. Ako `WebGLRenderer` ne može da se napravi ili se kontekst izgubi, prikaz se vraća na 2D uz kratku poruku.
- **Čišćenje:** geometrije, materijali, kontrole, `renderer.dispose()` i `ResizeObserver`.
- **Test.** Čista funkcija `heatBlocks()` u `lib/admin-v2/analytics/heat-blocks.ts` ima vitest. Sama scena se proverava snimkom; ako headless Chromium nema WebGL, snimak pokazuje rezervu i to ide u belešku.
- **Uslov.** Ako `three` nije u `package.json` kad X3 krene, 3D se preskače i to se zapisuje.

## 6. Podela rada za X2

**Vođa pre radnika (deljeni fajlovi, samo vođa):**
- `lib/admin-v2/sidebar/configs/*.ts` za sve stranice iz 1.1 i `registry.ts`;
- `lib/i18n/sr/admin-*.ts` i `lib/i18n/types.ts`;
- `app/globals.css`, `components/admin/frame/**`, `components/admin/admin-ui/**`, `components/admin/admin-primitives.tsx`;
- `app/admin/**` i `app/dev/**`.

**Radnik na svojoj stranici:**
1. briše filter blok na vrhu;
2. čita stanje preko `useAdminUrlState`;
3. objavljuje dinamičke opcije preko `useAdminSidebarLive`;
4. prelazi na `AdminPageHeader`;
5. piše `lib/admin-v2/lists/<stranica>.ts` (URL stanje → argumenti upita) sa testom;
6. doteruje preview da filtrira lokalno, gde je to nekoliko redova.

**Talas 1 (6 radnika, paralelno)**

| Radnik | Fajlovi | Usput |
|---|---|---|
| R1 Klijenti | `components/admin/admin-clients.tsx`, `admin-client-profile.tsx`, `lib/admin-v2/lists/clients.ts` i test, `lib/admin-v1/admin-clients-ui.test.ts` | Preview: status i sortiranje danas ne rade |
| R2 Inbox | `components/admin/admin-inbox.tsx`, `lib/admin-v2/lists/inbox.ts` i test | Ugrađena varijanta ne registruje sidebar |
| R3 Zadaci | `components/admin/admin-tasks.tsx`, `lib/admin-v2/lists/tasks.ts` i test | Lažni `role="tab"` nestaje; filter „Lokal“ u preview-u |
| R4 Porudžbine | `components/admin/admin-orders.tsx`, `lib/admin-v2/lists/orders.ts` i test | Sortiranje isključeno dok ima pretrage, kao sada |
| R5 Proizvodi i QR | `components/admin/admin-products.tsx`, `admin-products-surface.tsx`, `admin-qr.tsx`, `admin-qr-workspace.tsx`, `lib/admin-v1/products-workspace.ts`, `lib/admin-v1/admin-products-ui.test.ts`, `lib/admin-v2/lists/products.ts`, `qr.ts` i testovi | Šum „/“ i „—“; status „Aktivan · Nije dostupno“; tabele od 64–70 rem danas seče `overflow-hidden` |
| R6 Usluge | `components/admin/admin-service-operations.tsx`, `lib/admin-v2/lists/services.ts` i test | Pilule Links / Review / Meni se brišu; sortiranje u preview-u |

**Talas 2 (do 6 radnika, paralelno)**

| Radnik | Fajlovi | Usput |
|---|---|---|
| R7 Pretraga | `components/admin/admin-search.tsx`, `admin-debug-support.tsx`, `lib/admin-v2/lists/search.ts` i test | `view` i `group` se danas čitaju, ali ne pišu |
| R8 Podešavanja | `components/admin/admin-settings.tsx`, `admin-settings.test.tsx` | Test traži niz `pendingTab` u izvoru; zadržati ga ili test promeniti namerno |
| R9 Tim | `components/admin/admin-team.tsx`, `lib/admin-v2/lists/team.ts` i test | E-mail samo jednom; prazna stanja danas koriste naslov stranice kao tekst |
| R10 Finansije | `components/admin/admin-finance.tsx`, `admin-finance.test.tsx`, `lib/admin-v2/lists/finance.ts` i test | Postojeći parametri i vrednosti ostaju |
| R11 Dashboard | `components/admin/admin-dashboard-foundation.tsx`, `admin-dashboard-fixtures.ts`, `lib/admin-v2/lists/dashboard-missions.ts` i test | H1 „Dashboard“ i dok učitava; `now` na celu minutu, da se pretplata ne obnavlja svakog minuta |
| R12 Pošta | `components/admin/mail/admin-mail.tsx`, `mail/mail-view.tsx` | Samo okvir i zaglavlje |

**Redosled:** vođa → talas 1 → vođa čita diff i pušta `tsc` i testove → talas 2 → isto → admin-provera snima → vođa rešava listu razlika.

**Predlog za X1.** Vođa pravi okvir, registar, URL stanje i Modele kao primer. Zatim do 5 radnika prebacuje ostale sekcije: QR (`qr-view.tsx`, `qr-section.tsx`), Izlagači, Interakcije (tri pogleda), Leadovi, Izveštaji (`admin-events-reports.tsx`). Fioka (`admin-drawer.tsx`) može kao izolovan zadatak.

## 7. Provere i snimci

**Alat:**
```
node scripts/admin-v2/alati/snimi.mjs --rute <rute> --sirine 1440,1280,1280x720,390,360 --teme svetla,tamna --izlaz output/playwright/admin-v2/<KORAK> --okvir --harmonika
```
Alat snima uz reduced motion. Pokret, tastatura i fioka traže sopstvenu Playwright skriptu u `output/playwright/admin-v2/<KORAK>/`.

| Stranica | Dev preview ruta |
|---|---|
| Dashboard | `/dev/admin-dashboard-preview` (`?state=empty`, `unavailable`, `error`, `loading`) |
| Klijenti | `/dev/admin-clients-preview` (`?state=loading`, `empty`, `error`) |
| Profil klijenta | `/dev/admin-client-profile-preview` |
| Inbox | `/dev/admin-inbox-preview` |
| Zadaci | `/dev/admin-tasks-preview` |
| Porudžbine | `/dev/admin-orders-preview` |
| Proizvodi | `/dev/admin-products-preview` |
| QR | `/dev/admin-qr-preview` |
| Usluge | `/dev/admin-services-preview?service=links`, `review`, `meni` |
| Finansije | `/dev/admin-finance-preview` |
| Tim | `/dev/admin-team-preview` |
| Pretraga, Debug | `/dev/admin-18-preview`, `/dev/admin-18-preview?mode=debug` |
| Podešavanja | `/dev/admin-settings-preview` |
| Pošta | `/dev/admin-mail-preview` (`?stanje=…`) |
| Događaji | `/dev/admin-events-preview/<sekcija>`, `?faza=pre`, `sajam`, `posle` |
| Trajni okvir (novo u X1) | `/dev/admin-okvir-preview/<oblast>` |

**Sopstvene skripte u X1:**
1. na `/dev/admin-okvir-preview` obeleži čvor sidebara, klikni tri stavke navbara i proveri da je čvor isti;
2. fioka na 390: meni, „Filteri (N)“, fokus zamka, Escape, prevlačenje;
3. harmonika samo tastaturom;
4. filter → detalj → Back → filteri su tu; osvežavanje ih čuva;
5. navbar na 1024 i 1280.

**Bez dev preview-a:**
- `/admin/login` i editor: test da `isFramedAdminPath` vraća `false`;
- `/admin/memories`, `/admin/venue`, `/admin/customers/**`: test da `AdminShell` unutar okvira vraća samo `children`, uz `tsc` i build;
- pravi `/admin` sa podacima se ne snima; ručna provera na DEV-u posle lanca je otvorena stavka za Jovana.

**Pre kraja svakog koraka:** `npx tsc --noEmit`, `npm test -- --testTimeout=30000 --hookTimeout=60000`, `npm run lint`.

## 8. Rizici i odluke umesto vlasnika

**Odluke**
1. **Boja aktivne stavke u svetloj temi** je `#2f6d23`, ne `#6FC05D`. To je odstupanje od zadatka; razlog je kontrast 2,08:1 naspram 5,86:1. Linija je `#6FC05D`. Vraćanje je jedan token.
2. **Layout bez route group**: nema seljenja fajlova.
3. **„Poveži nalepnicu“ samo u zaglavlju.** Na telefonu je tu na jedan dodir; u fioci bi bila na dva.
4. **Finansije u sidebar**, zbog doslednosti i 16 kontrola na vrhu.
5. **Tim:** članovi su kontekst (stalno otvorena lista), a tabovi navigacija.
6. **Pretraga:** glavno polje ostaje u ekranu.
7. **Pošta:** u X2 samo okvir i zaglavlje.
8. **Model u Modelima** nema kontrolu; pretraga pokriva i naziv izlagača.
9. **Upit C se osvežava na 5 minuta**, ne na 60 s.
10. **Pečati nisu angažovanje**, jer nastaju sami pri skenu.
11. **3D bez instanced mesh-a**, zbog nepravilnih poligona.
12. **Inbox pretraga** prelazi sa Enter na debounce od 250 ms. Više upita, isti rezultati.
13. **Dekorativni sjaj okvira se uklanja.**

**Rizici**
1. **X1 je velik:** okvir, registar, URL stanje, 8 pogleda Događaja i oko 10 testova. Ublažavanje: radnici za sekcije i kompatibilni `AdminShell`.
2. **Tabele šire od ekrana.** Sa sidebarom ekran na 1280 ima oko 950 px, a neke tabele traže 64–70 rem. Bez prelaza na širinu kontejnera dobijaju vodoravni skrol i gube sticky zaglavlje. Potvrditi snimkom na 1024, 1280 i 1440.
3. **Postojeći `getEventAnalytics` može da pređe Convex granicu čitanja na Auto Moto Festu.** Serija po satima raste kao štandovi × dani × sati × shardovi; procena za 40 štandova je oko 27.000 dokumenata samo za sate. Granicu (oko 32.000 po upitu) treba proveriti u dokumentaciji. Ovo je Aleksin backend: lanac ga ne menja, a stavka ide kao otvoreno pitanje u belešku X3 i u AMF preporuke.
4. **Pravilo o `FRONTEND-DELTA` fajlu.** AGENTS.md traži zapis u `docs/events/sajam-automobila-2026/` kad se menjaju Convex izvozi, a lanac tu putanju ne sme da dira. X3 piše deltu u `docs/admin/v2/X3.md`, a prenos je otvorena stavka.
5. **`lib/i18n/types.ts`** je van dozvoljenih putanja i menja se u X1–X5. Svaka beleška ga navodi sa razlogom.
6. **Preview nije svuda funkcionalan.** Na nekoliko stranica kontrole u preview-u ne filtriraju (Proizvodi inventar, Finansije, Inbox), pa „isti rezultati kao pre“ na njima dokazuje test argumenata upita, ne snimak.
7. **Fixture imena van Događaja** nisu TEST (izmišljene osobe, adrese i telefoni u `admin-client-profile.tsx`, `admin-clients.tsx`). Zatečeno pre lanca; test `admin-clients-ui.test.ts` zavisi od njih. Ne dira se bez odluke.
8. **Tekst `consentHelp`** u `admin-events.ts:1089` pominje imena i „Convex okruženje“. Zatečeno; kandidat za X5.
9. **Headless WebGL** možda ne radi, pa snimak 3D prikaza može da pokaže rezervu.
10. **Koren učitava 13 familija fontova** na svakoj stranici. Van dozvoljenih putanja; samo zabeleženo.

## 9. Sažetak kritika

### Kritika A: dizajn (Nielsen, 0–4)

| # | Heuristika | Ocena | Zašto |
|---|---|---|---|
| 1 | Vidljivost stanja | 2 | Isti skeleton svuda; „Ažurirano u“ samo u Događajima |
| 2 | Jezik korisnika | 2 | Žargon u praznim stanjima |
| 3 | Kontrola i sloboda | 2 | Filteri u `useState`; Back i osvežavanje ih gube |
| 4 | Doslednost | 1 | Bar šest rešenja za filter, tab, naslov i tabelu |
| 5 | Sprečavanje grešaka | 3 | Potvrde, isključena dugmad, zaštita nesačuvanih izmena |
| 6 | Prepoznavanje | 2 | Selecti bez vidljive labele; lupa bez „Ctrl K“ |
| 7 | Fleksibilnost i brzina | 2 | Ctrl K postoji, ali se ne vidi; nema drugih prečica |
| 8 | Estetika i minimalizam | 2 | Pilule svuda, kartica u kartici, senka na svakom panelu |
| 9 | Oporavak od greške | 2 | Generičke poruke; „Pokušaj ponovo“ osvežava celu stranicu |
| 10 | Pomoć | 2 | Definicije metrika u Analitici; nema liste prečica |

**Zbir: 20 od 40.**

**Kontrola iznad sadržaja:** Finansije 16; Zadaci 11; Modeli 11; Porudžbine 10; Usluge 10; Pretraga oko 10.

### Kritika B: tehnika (0–4)

| Oblast | Ocena | Zašto |
|---|---|---|
| Pristupačnost | 2 | Dobri landmark-i i Radix dijalozi; padaju zelen tekst na svetloj (2,08:1), ivice polja (1,22:1) i četiri lažna `role="tab"` |
| Performanse | 2 | Nema teških animacija; sve se remountuje pri navigaciji; nema `dynamic()`; Dashboard svakog minuta menja argumente upita |
| Responsive | 2 | `AdminDataView` ima kartice; okvir prelama tek na 1280; `AdminTable` seče široke tabele |
| Teme i tokeni | 2 | Obe teme postoje; pet tokena se koristi bez definicije |
| Anti-obrasci | 3 | Malo ih je: dekorativni gradijent, `backdrop-blur`, fluidni H1 |

**Impeccable detektor** (`detect.mjs`, bez instalacije i bez upisa, 115 fajlova): 4 nalaza, od toga jedan stvaran i nizak (`border-l-4` u `pregled-view.tsx:109`).

### Najvažniji problemi

1. **Filteri su gomila kontrola iznad liste, svaka stranica na svoj način i van URL-a.** Rešava sidebar sa harmonikom (X1, X2).
2. **Nema trajnog layouta.** 19 stranica i 3 komponente same prave okvir. Rešava 2.1.
3. **Tabele.** `AdminDataView` skroluje u kutiji od 70vh, `AdminTable` seče sadržaj i nema sticky zaglavlje. Rešava 2.9 i 2.10.
4. **Nedefinisani tokeni i kontrast.** Aktivan tab u Zadacima i Timu je po CSS-u nevidljiv na svetloj temi (potvrditi snimkom). Rešava 2.9.
5. **Zaglavlje stranice nema sistem.** Naslovi idu od 20 do 76 px, a Dashboard za H1 ima poruku greške. Rešava `AdminPageHeader`.

### Šta valja i čuva se

- Tokeni `--admin-*` u paru za obe teme, sa posebnim tonom za „sponzorisano“.
- `AdminDataView`: sortiranje, grupe, kartica sa istim akcijama kao red, zapamćen prikaz, `aria-sort`.
- `usePolled`: čita samo dok je tab vidljiv.
- `AdminViewToggle` kao ispravan radiogroup; uzor za sve segmente.
- Signal koji ne zavisi samo od boje (ikona, broj i tekst u „Šta treba da uradim“), zaštita nesačuvanih izmena i granice grešaka po widgetu.
- Logika filtera Događaja u čistim funkcijama sa testovima (`model-filters.ts`, `qr-filters.ts`); novi sidebar je samo čita.
