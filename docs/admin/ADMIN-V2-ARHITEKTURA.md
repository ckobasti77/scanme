# ADMIN v2: arhitektura okvira i recept za stranice

Ovo je recept po kome se svaka admin stranica prebacuje u novi okvir. Napisan je u koraku X1 (okvir i Događaji) i dopunjen u X2, koji je po njemu prebacio sve ostale liste. Plan je u `docs/admin/v2/X0-PLAN.md`, a beleške u `docs/admin/v2/X1.md` i `docs/admin/v2/X2.md`.

## 1. Okvir

```
app/admin/layout.tsx
└─ AdminFrameGate            components/admin/frame/admin-frame-gate.tsx
   └─ AdminGuard             (isto kao pre, jednom)
      └─ AdminFrame          components/admin/frame/admin-frame.tsx
         ├─ AdminSidebar     data-admin-frame="sidebar"   (od lg naviše)
         ├─ AdminNavbar      data-admin-frame="navbar"
         ├─ AdminScreen      data-admin-frame="screen"    (jedini skrol kontejner)
         └─ AdminDrawer      fioka ispod lg
```

- **Trajni layout.** Okvir se crta jednom u `app/admin/layout.tsx` i ne remountuje se između stranica. Stranica u `app/admin/**/page.tsx` vraća samo svoj sadržaj: bez `AdminGuard` i bez `AdminShell`.
- **Bez okvira** su samo putanje iz `lib/admin-v2/frame/routes.ts` (`isFramedAdminPath`): `/admin/login` i editor ScanMe Links stranice.
- **`AdminShell`** (`components/admin/admin-shell.tsx`) je kompatibilni omotač: unutar okvira vraća `children`, van njega crta isti `AdminFrame`. Koriste ga dev preview rute (`app/dev/admin-*-preview`) i tri starije komponente koje se same umotavaju (`location-admin`, `memories-admin`, `venue-admin`). U novom kodu se ne koristi.
- **Dev preview.** Svaka `/dev/admin-*-preview` ruta crta novi okvir oko svojih fixtures. `/dev/admin-okvir-preview/<oblast>` drži jedan trajni okvir nad svim preview površinama, na istim putanjama kao admin (`/dev/admin-okvir-preview/klijenti`, `…/operativa/qr`, `…/dogadjaji/modeli`); tu se proverava da se okvir ne remountuje i snimaju prelazi između oblasti. Nova stranica se dodaje u `app/dev/admin-okvir-preview/[[...ruta]]/page.tsx`.
- **Linkovi u preview-u.** Admin link se piše kao `/admin/...`, a okvir ga prevodi funkcijom `routeHref(href, route)` (`lib/admin-v2/frame/routes.ts`): u adminu ostaje isti, u trajnom preview-u dobija njegovu osnovu, a u pojedinačnom preview-u vodi na preview ciljne stranice (`/admin/zadaci?pogled=overdue` → `/dev/admin-tasks-preview?pogled=overdue`). Tako navbar, navigacija oblasti i „Brzi skokovi“ rade i bez prijave. Preview ruta koja prikazuje više admin stranica (`/dev/admin-services-preview?service=…`, `/dev/admin-18-preview?mode=debug`) kaže okviru koju prikazuje preko `activePathname`.
- **Pregled čuvara.** `/dev/admin-cuvar-preview/<stanje>` (`provera`, `neprijavljen`, `bez-prava`, `admin`) crta pravi `app/admin/layout.tsx` sa pravim `AdminGuard`, a upit `admin.me` dobija TEST odgovor iz `components/admin/frame/admin-guard-preview.tsx`. Tu se bez prijave vidi šta čuvar pušta i da okvir ostaje isti pri prelasku između dve stranice. Ništa se ne šalje na Convex; ruta ne postoji u produkciji.
- **Pravi `/admin`** bez prijave vraća preusmerenje na `/admin/login` (`proxy.ts`), pa se ne snima.
- **Ugovor za automatsku proveru** (`scripts/admin-v2/alati/snimi.mjs --okvir --harmonika`): tri `data-admin-frame` atributa; od 1024 px sidebar ide od vrha do dna prozora, prozor ne skroluje, sidebar i navbar stoje dok ekran skroluje; dugme grupe filtera ima `data-admin-filter-toggle` i `aria-expanded`, a otvorena je najviše jedna grupa.

### Mere i tokeni (`app/globals.css`, blok `.admin-v1`)

| Token | Vrednost | Šta je |
|---|---|---|
| `--admin-sidebar-w` | 17,5 rem (18,5 rem od 1440 px) | širina sidebara |
| `--admin-navbar-h` | 3,5 rem | visina navbara i reda sa logom |
| `--admin-radius-screen` | 1 rem | ugao ekrana |
| `--admin-radius-inner` | 0,25 rem | ugao reda unutar panela od 0,5 rem |
| `--admin-nav-current` | `--accent-text` (svetla `#2f6d23`, tamna `#6fc05d`) | tekst aktivne stavke navbara |
| `--admin-nav-line` | `#6fc05d` | linija ispod aktivne stavke i oznaka aktivnog reda |
| `--admin-dur-1…4` | 120, 180, 240, 320 ms | trajanja pokreta |
| `--admin-ease-out`, `--admin-ease-in` | `cubic-bezier(0.16, 1, 0.3, 1)`, `cubic-bezier(0.4, 0, 1, 1)` | krive |

Površine: sidebar i navbar su na `--admin-app`, ekran na `--admin-surface`, paneli u ekranu na `--admin-surface-strong`.

## 2. Zaglavlje stranice

`AdminPageHeader` (`components/admin/frame/admin-page-header.tsx`) je jedino zaglavlje stranice: naslov levo na fiksnoj rem skali, akcije desno.

```tsx
<AdminPageHeader
  eyebrow="Operativa"            // opciono: oblast ili kontekst
  title="Porudžbine"             // H1 ekrana, jedan po stranici
  description="…"                // opciono, jedna rečenica
  actions={<button className={adminPrimaryButtonClass}>Novi zadatak</button>}
/>
```

- Ispod `lg` zaglavlje samo dodaje dugme „Filteri (N)“ kad stranica ima pretragu, poglede, grupe ili sortiranje. Dugme otvara fioku direktno na filterima. Stranica koja u sidebaru ima samo odeljke, prikaz ili članove (bez pretrage, grupa i sortiranja) imenuje dugme po tome: „Odeljci“, „Član tima“.
- Blok naslova se sužava pre nego što akcije pređu u novi red: akcije ostaju desno dok ima mesta.
- Lista čiji bi naslov panela ponovio H1 ne dobija panel sa naslovom: `AdminDataView` stoji direktno u ekranu (primer: Modeli).
- U Događajima zaglavlje crta okvir oblasti (`AdminEventFrameView`): iznad naslova je „Događaji · naziv događaja“, H1 je naziv sekcije, a desno je jedino „Poveži nalepnicu“. Sekcije ne crtaju svoj H1.

## 3. Kontekstualni sidebar

Jedan komponent (`AdminSidebarView`), isti na svim stranicama. Šta prikazuje dolazi iz dva izvora:

1. **Registar po ruti** (`lib/admin-v2/sidebar/registry.ts`): statična konfiguracija stranice, `SidebarConfig`.
2. **Stranica** (`useAdminSidebarLive`): ono što zna samo iz podataka, `SidebarLive`.

Vrednosti filtera sidebar čita iz URL-a i sam ih piše. Stranica ne prosleđuje `onChange` za filtere; ona čita isti URL i filtrira.

### 3.1 Redosled blokova

1. kontekst oblasti (Događaji: izbor događaja kao grupa harmonike; Tim: članovi kao uvek otvorena lista);
2. navigacija oblasti (podstrane: Operativa, Usluge, sekcije Događaja, „Nazad na klijente“ u profilu);
3. pogledi sa brojevima (i odeljci stranice: Podešavanja, profil klijenta);
4. pretraga stranice (uvek vidljiva);
5. grupe filtera kao harmonika;
6. čipovi aktivnih filtera i „Očisti sve“;
7. sortiranje;
8. blok „Misije danas“ (Dashboard);
9. blok „Brzi skokovi“ (Dashboard sa svojim linkovima; podrazumevani sidebar stranice bez konfiguracije).

### 3.2 `SidebarConfig` (`lib/admin-v2/sidebar/types.ts`)

```ts
type SidebarOption = { value: string; label: string; count?: number; hint?: string };

type SidebarGroup = {
  id: string;                         // URL ključ filtera
  label: string;
  kind?: "choice" | "custom";         // podrazumevano "choice"
  options?: readonly SidebarOption[]; // statične opcije; bez njih ih šalje stranica
  keys?: readonly string[];           // "custom": URL ključevi grupe (npr. ["od", "do"])
  textKeys?: readonly string[];       // "custom": koji od ključeva nose slobodan tekst (naziv), a ne id
  chipOnly?: boolean;                 // filter bez kontrole: stiže linkom, vidi se samo čip
  defaultValue?: string;              // grupa uvek ima vrednost (period, kategorija): nema „Sve“
  emptyText?: string;                 // tekst umesto opcija dok ih nema („Prvo izaberi klijenta.“)
};

type SidebarConfig = {
  id: string;                                   // "dogadjaji/modeli"; deo pre "/" je oblast
  context?: { id: string; label: string; list?: boolean };   // list: uvek otvorena lista (Tim)
  nav?: readonly AdminSubnavGroup[];
  navLabel?: string;
  views?: { key: string; label: string; items: readonly SidebarOption[]; defaultValue: string };
  search?: { key: string; label: string; placeholder?: string; submit?: boolean };   // submit: piše se na Enter (Pošta → Zoho)
  groups?: readonly SidebarGroup[];
  sort?: { key: string; label: string; options: readonly SidebarOption[]; defaultValue: string };
  blocks?: readonly ("missions" | "jumps")[];
  jumps?: readonly { href: string; label: string }[];        // brzi skokovi stranice (admin putanje)
};

resolveAdminSidebar(pathname: string, search?: URLSearchParams | string): SidebarConfig;
resolveSidebar(route: AdminRoute, search: URLSearchParams): SidebarConfig;   // okvir: ruta je već razrešena
```

- Nova stranica se dodaje kao razrešivač u nizu `RESOLVERS` u `registry.ts`, a njena konfiguracija ide u `lib/admin-v2/sidebar/configs/<oblast>.ts`. Razrešivač dobija razrešenu rutu (`AdminRoute`: kanonska admin putanja u `key`; dev preview se već preveo u nju) i parametre. Stranica sa jednom konfiguracijom na jednoj putanji je `page("/admin/klijenti", clientsSidebar)`.
- Jedna ruta sme da ima više stanja po parametru: Proizvodi (`?venue=` → inventar), Finansije (`?tab=`), Pretraga (`?view=`). Svako stanje ima svoj `id`.
- Navigaciju oblasti (Operativa, Usluge) pravi `areaNav(area, route)` iz iste liste koju koriste meniji navbara.
- Uz konfiguraciju se izvozi šema URL-a stranice: `<STRANICA>_URL_FIELDS` (`sidebarUrlFields(config)` plus ključevi koje poseduje sama stranica, npr. `venue`, `q` Pretrage). Stranica čita stanje tom šemom. Ključ uvek otvorene liste konteksta (`clan` Tima, `folder` Pošte) je već u `sidebarUrlFields`.
- Registar i konfiguracije menja samo vođa koraka.

| Stranica | Konfiguracija | Lista (čiste funkcije) |
|---|---|---|
| Dashboard, profil klijenta, Tim, Podešavanja | `configs/pages.ts` | `lists/dashboard-missions.ts`, `lists/team.ts` |
| Klijenti | `configs/clients.ts` | `lists/clients.ts` |
| Inbox | `configs/inbox.ts` | `lists/inbox.ts` |
| Zadaci | `configs/tasks.ts` | `lists/tasks.ts` |
| Proizvodi, QR kodovi, Porudžbine | `configs/operations.ts` | `lists/products.ts`, `lists/qr.ts`, `lists/orders.ts` |
| Usluge (Links, Review, Meni) | `configs/services.ts` | `lists/services.ts` |
| Finansije | `configs/finance.ts` | `lists/finance.ts` |
| Pretraga | `configs/search.ts` | `lists/search.ts` |
| Pošta | `configs/mail.ts` | `lists/mail.ts` |
| Događaji | `configs/events.ts` | `lib/admin-v1/*-filters.ts` |

### 3.3 `SidebarLive` i objava sa stranice

```ts
type SidebarLive = {
  context?: { value: string; options: readonly SidebarOption[]; onChange: (value: string) => void };
  nav?: readonly AdminSubnavGroup[];                          // navigacija sa bedževima
  viewCounts?: Record<string, number>;
  options?: Record<string, readonly SidebarOption[]>;         // opcije grupa (sa brojevima), po id-u grupe
  defaults?: Record<string, string>;                          // vrednost grupe dok ključa nema, kad je zna samo stranica
  custom?: Record<string, { summary?: string; body: ReactNode }>;
  missions?: readonly { id: string; label: string; count: number; tone: "hitno" | "uskoro" | "info"; href?: string }[];
  intercept?: (patch, state) => patch | null;                 // zavisni filteri ili otkazivanje izmene
};

useAdminSidebarLive(live: SidebarLive | null): void;          // components/admin/frame/admin-sidebar-store.tsx
```

- Objekat mora biti memoizovan (`useMemo`). Nov objekat pri svakom renderu ponovo crta sidebar.
- Više komponenti jedne stranice sme da objavljuje; rezultati se spajaju (Događaji: okvir događaja šalje `context` i `nav`, sekcija šalje `options`).
- Bez okvira hook ne radi ništa, pa komponenta i dalje radi sama u testu.
- Brojevi uz opcije se šalju samo kad ih stranica već ima u podacima. Liste koje filtrira Convex upit ih nemaju.
- `intercept` služi za zavisne filtere (Zadaci: izmena klijenta briše lokal; Finansije: promena pogleda briše kategoriju drugog pogleda) i za zaštitu (Podešavanja: sa nesačuvanim izmenama vraća `null` i otvara dijalog).
- `missions` („Misije danas“) sme da pošalje svaki widget stranice za sebe; sidebar ih sabira, ređa po hitnosti i ne prikazuje one sa nulom. Dok stranica ništa ne pošalje, bloka nema.
- `context` uz `list: true` je uvek otvorena lista: stranica šalje opcije (sa brojevima), izabranu vrednost i `onChange`, i sama piše svoj ključ u URL. Ključ je u šemi sidebara, pa ga `intercept` sme da obriše (Pošta: drugo sanduče briše folder).
- `defaults` je isto što i `defaultValue` grupe, za vrednost koju konfiguracija ne može da zna (Pošta: prvo povezano sanduče). Grupa tada nema „Sve“. Stranica u `intercept` pazi da se ta vrednost ne upiše u URL.

### 3.4 Harmonika

Pravila su u `lib/admin-v2/sidebar/accordion.ts`:

- `accordionReducer`: otvorena je najviše jedna grupa; klik na otvorenu je zatvara.
- `groupControlKind(n)`: do 7 opcija radio lista, više od 7 search-select (`SIDEBAR_RADIO_MAX`). „Sve“ se ne broji.
- Zaglavlje grupe pokazuje izbor: „Status · Aktivni“.
- Grupa sa `defaultValue` nema „Sve“: u zaglavlju stoji podrazumevana vrednost („Period · Ovaj mesec“), a čip i broj u „Filteri (N)“ postoje samo kad je izabrano nešto drugo.
- Jedan izbor „da / ne“ je grupa sa jednom opcijom (Porudžbine: „Problem · Samo sa problemom“), bez posebne vrste kontrole.
- Izbor važi odmah. Čip uklanja jedan filter, „Očisti sve“ pretragu i sve grupe; pogled, sortiranje i kontekst ostaju.
- Tastatura: Enter i Space otvaraju grupu, strelice idu kroz opcije, Escape zatvara grupu i vraća fokus na njeno zaglavlje. U search-selectu prvi Escape briše upisan tekst.

## 4. URL stanje

Šema se izvodi iz konfiguracije (`sidebarUrlFields`, `lib/admin-v2/query/url-state.ts`): ključ liste konteksta, pogled, pretraga, svaka grupa, sortiranje.

```ts
readUrlState(fields, search)          // važeće vrednosti; podrazumevano i nevažeće se izostavlja
writeUrlState(fields, search, patch)  // "?a=b" ili ""; tuđi parametri ostaju netaknuti
useAdminUrlState(fields)              // [state, set]  components/admin/admin-ui/use-admin-query-state.ts
useAdminQueryState()                  // Događaji: fiksni ključevi iz lib/admin-v1/query-state.ts
```

- Upis ide preko `window.history.replaceState`. Next ga drži usklađenim sa `useSearchParams`, a lista odgovara odmah, bez odlaska na server.
- Filter zamenjuje stavku istorije. Sekcije i detalji su linkovi, pa Back vraća na prethodnu stranicu sa filterima u URL-u.
- Korak koji Back mora da poništi piše se sa `set(patch, "push")` (Proizvodi: ulazak u lokal i povratak na listu lokala).
- Filtere piše sidebar. Stranica zove `set` samo za ključeve koje sama poseduje (`venue`, `clan`, `contact`, `q` Pretrage) i za izmenu koju je `intercept` odložio (Podešavanja posle potvrde).
- Pretraga liste se piše 250 ms posle kucanja (`SearchField` u sidebaru), bez tastera Enter.
- Pretraga koja zove spoljni servis ima `submit: true`: piše se na Enter, ispod polja stoji „Enter pokreće pretragu.“, a pražnjenje polja je uklanja odmah (Pošta: jedan poziv Zoho-u po pretrazi).
- Stari link sa pretragom u sopstvenom parametru (`?code=` QR kodova, `?smf=` Proizvoda) stranica jednom preusmeri na `?q=` (`legacySearchHref`, `lib/admin-v2/query/legacy-param.ts`, u `app/admin/operativa/*/page.tsx`).
- Podrazumevana vrednost se ne piše. Parametri koje šema ne poznaje (`?task=`, `?profile=`, `?order=`) se ne brišu.
- Vrednosti u URL-u su vrednosti koje stranica već koristi za upit. Bez tabela prevoda: isti izbor mora da da iste argumente upita kao pre.
- Stranica čita stanje hook-om iste šeme (`useAdminUrlState(sidebarUrlFields(config))`) ili, u Događajima, postojećim `useAdminQueryState()`.

## 5. Kako se stranica prebacuje, korak po korak

1. **Konfiguracija** (vođa): u `lib/admin-v2/sidebar/configs/<oblast>.ts` opiši navigaciju, poglede, pretragu, grupe i sortiranje, izvezi `<STRANICA>_URL_FIELDS`, pa je uključi u `registry.ts`. Ključevi grupa su URL parametri. Postojeći parametri stranice se ne preimenuju, a vrednosti su one koje upit već prima.
2. **Skini filter blok** sa vrha stranice: pretragu, selecte, tabove pogleda, čipove i „Očisti“. Kontrole koje menjaju prikaz, a ne sadržaj (Tabela / Kartice, Tabela / Vizuelno), ostaju uz listu. Kontrola koja menja jedan zapis (status otvorenog razgovora, preraspodela zadatka) nije filter i ostaje uz taj zapis.
3. **Čitaj stanje iz URL-a** umesto iz `useState`: `useAdminUrlState(<STRANICA>_URL_FIELDS)`. Pretvaranje stanja u argumente upita je čista funkcija u `lib/admin-v2/lists/<stranica>.ts` (`<stranica>ListArgs(state)`); ona primenjuje podrazumevane vrednosti kad ključa nema. Prazno stanje mora dati iste argumente kao stranica pre izmene.
4. **Objavi podatke** hook-om `useAdminSidebarLive`: opcije dinamičkih grupa, brojeve, kontekst, misije. Sastavi ih čistom izvezenom funkcijom (`<nesto>SidebarLive(...)`), da može da se testira.
5. **Preview** koristi isto URL stanje i filtrira fixtures čistom funkcijom iz istog fajla (`filterPreview…`), da sidebar radi i bez Convex-a.
6. **Zaglavlje**: `AdminPageHeader` sa naslovom i primarnim akcijama. Jedan H1 po stranici, i dok se podaci učitavaju; H1 je naziv stranice ili zapisa, nikad broj ni poruka greške. Oznaka „Demo prikaz“ ide u `badge` kao `AdminStatus tone="waiting"`.
7. **Tabela**: bez `max-h` i bez uspravnog skrola u kutiji. `AdminDataView` i `AdminTable` to već rade (odeljak 7). Izbor tabela ili kartice prati širinu liste, ne prozora (zamka 15).
8. **Testovi**: `lib/admin-v2/lists/<stranica>.test.ts` (argumenti upita za prazno stanje i za svaki izbor, nevažeće vrednosti kroz `readUrlState`, filtriranje fixtures); `components/admin/<stranica>.test.tsx` (jedan H1, nema filter bloka, filtriran preview za zadati URL, markup sidebara kroz `AdminSidebarView` sa konfiguracijom iz registra).
9. **Snimak** dev preview rute na 1440, 1280, 390 i 360, plus otvorena fioka na telefonu.

## 6. Primer: Događaji → Modeli

Konfiguracija (`lib/admin-v2/sidebar/configs/events.ts`):

```ts
modeli: {
  search: { key: "q", label: dict.modelList.searchLabel, placeholder: dict.modelList.searchPlaceholder },
  groups: [
    { id: "izlagac", label: "Izlagač" },                 // opcije šalje lista
    { id: "brend", label: "Brend" },
    { id: "model", label: "Model", chipOnly: true },     // stiže starim linkom, samo čip
    { id: "paket", label: "Paket", options: [...] },     // statične opcije, brojeve šalje lista
    ...
  ],
}
```

Lista (`components/admin/events/sections/modeli-view.tsx`):

```tsx
export function modelsSidebarLive(models, hierarchy, query): SidebarLive {
  const counts = modelFacetCounts(models, query);
  return {
    options: {
      ...hierarchySidebarOptions(hierarchy, query, hierarchyCountedIds(models, query)),
      ...Object.fromEntries(MODEL_FACETS.map((facet) => [facet, /* opcije sa brojevima */])),
    },
    intercept: hierarchyIntercept(hierarchy),            // brend postavlja svog izlagača
  };
}

const sidebar = useMemo(() => modelsSidebarLive(models, hierarchy, query), [models, hierarchy, query]);
useAdminSidebarLive(models.length ? sidebar : null);
```

- `query` stiže iz kontejnera sekcije (`useAdminQueryState()`), isti onaj po kome lista filtrira.
- `hierarchySidebarOptions` i `hierarchyIntercept` su u `lib/admin-v2/sidebar/hierarchy.ts` i služe svakoj listi sa filterima Izlagač → Brend → Model (Modeli, QR, Leadovi). `AdminHierarchyPicker` je ostao samo kao birač modela u formama.
- Ostale sekcije rade isto: `qrSidebarLive`, `exhibitorsSidebarLive`, `interactionExhibitorsSidebarLive` (brojevi pogleda, `viewCounts`), `audienceSidebarLive`, `passportsSidebarLive`, `leadsSidebarLive` (grupa „Period“ vrste `custom`, sa dva polja za datum u telu grupe) i `reportsSidebarLive`.
- Test (`modeli-view.test.tsx`) crta sidebar ovako:

```tsx
renderToStaticMarkup(
  <AdminSidebarView config={resolveAdminSidebar(`${BASE}/modeli`)} live={modelsSidebarLive(models, hierarchy, query)} state={query} onPatch={() => undefined} />,
);
```

## 7. Tabele

- Tabela skroluje sa ekranom, nikad uspravno u svojoj kutiji. Zaglavlje je sticky uz gornju ivicu ekrana.
- Omotač je `AdminTableScroll` (`components/admin/admin-ui/admin-table-scroll.tsx`); koriste ga `AdminDataView` i `AdminTable`. Pravila su u `app/globals.css` (`[data-admin-table-wrap]`).
- Prelomi `AdminDataView` (Tabela ili Kartice, `hideBelow` kolone) prate širinu same liste (container query), ne prozora: `md` = 42 rem, `lg` = 56 rem, `xl` = 72 rem, `2xl` = 80 rem.

## 8. Pokret

- Tokeni: `lib/admin-v2/motion.ts` i isti u CSS-u (`--admin-dur-*`, `--admin-ease-*`).
- GSAP se uvozi samo u `components/admin/frame/**` (linija navbara, pretapanje sadržaja sidebara). Uvek u `gsap.context()` ili sa `killTweensOf` pri izlasku; `@gsap/react` nije u projektu.
- Harmonika (visina preko `grid-template-rows`), strelica i fioka su CSS, na istim tokenima.
- Animiraju se samo `transform` i `opacity` (izuzetak: visina harmonike preko grid redova). Ništa se ne kreće pri prvom učitavanju ni kad polling donese nove podatke. Uz `prefers-reduced-motion` ostaje samo pretapanje.
- Novi kod u adminu ne uvozi framer-motion.

## 9. Zamke

1. **Sticky zaglavlje i vodoravni skrol se isključuju.** Omotač sa `overflow-x: auto` postaje skrol kontejner i za uspravnu osu, pa zaglavlje lepi za njega, a ne za ekran. Zato omotač podrazumevano ima `overflow-x: clip`, a `auto` dobija samo dok je tabela stvarno šira od njega (`data-overflow-x`); tada zaglavlje nije sticky. Ne vraćaj `overflow-x-auto` ni `max-h` na omotač tabele.
2. **`sticky top-*` u ekranu.** Skroluje ekran, ne prozor, i iznad sadržaja nema zaglavlja koje treba preskočiti: `top-0`.
3. **Apsolutno pozicioniran sadržaj i skrol prozora.** `sr-only` je `position: absolute`. U skrol kontejneru koji nije pozicioniran takav element se vezuje za prozor i produžava ga, pa prozor počne da skroluje (ugovor okvira pada sa „skroluje ceo prozor“). Zato su ekran, skrol sidebara i fioke `relative`. Svaki novi unutrašnji skrol kontejner mora biti isto.
4. **Skrol posle navigacije.** Next vraća na vrh samo prozor. `AdminScreen` sam vraća ekran na vrh na novoj stranici i pamti poziciju za Back.
5. **`useSearchParams` i `<Suspense>`.** Jedan `<Suspense>` je u `AdminScreen`, oko sadržaja stranice. Ne dodaji ga po stranici zbog URL stanja.
6. **Hidratacija.** Sidebar na serveru crta samo statičnu konfiguraciju; opcije sa stranice stižu posle montiranja. Ne čitaj `window` ni `localStorage` u renderu.
7. **Polling.** Objava u sidebar se menja samo kad se promeni memoizovan objekat. Pretapanje sadržaja sidebara je vezano za promenu stranice, ne za podatke.
8. **Testovi.** Okruženje je bez DOM-a. Komponenta koja koristi URL hook traži u testu `vi.mock("next/navigation", …)` sa `usePathname` i `useSearchParams`. Čiste funkcije idu u `lib/**` (`*.test.ts`), markup u `components/admin/**` (`*.test.tsx`).
9. **Ugrađene površine.** Komponenta koja se crta i unutar druge stranice (Inbox u profilu klijenta) ne objavljuje ništa u sidebar kad je ugrađena.
10. **Portali.** Meni, dijalog i fioka idu u `body` i ne nasleđuju tokene: sadržaj mora da nosi `className="admin-v1"`.
11. **`bg-[var(--admin-ink)]` na dugmetu ili linku** globalno pravilo boji u zeleno (primarno dugme). Ne koristi tu klasu za aktivno stanje u navigaciji.
12. **`ThemeToggle` mora da ostane u DOM-u** (može biti skriven klasom). Sajt ima plutajući prekidač teme koji se sakriva samo dok postoji lokalni.
13. **`eslint-plugin-react-hooks` 7.** Bez `setState` direktno u efektu i bez čitanja ref-a u renderu. Uzor za izvedeno stanje je `SearchField` u `admin-sidebar-view.tsx`.
14. **Javni repo.** Fixtures koriste TEST imena i izmišljene brojeve; pravi brojevi po izlagaču, modelu ili štandu ne ulaze u kod, testove ni beleške.
15. **Prelomi po širini kontejnera.** Uz sidebar je ekran uži od prozora (oko 950 px na prozoru od 1280). Lista koja bira tabelu ili kartice klasama `hidden xl:block` gleda prozor i dobija pogrešan prikaz: roditelj dobija `@container`, a deca `hidden @4xl:block` / `@4xl:hidden` (`@2xl` = 42 rem, `@4xl` = 56 rem, `@6xl` = 72 rem). Tabela treba da stane već na 56 rem; sporedne kolone se pojavljuju od 72 rem (`hidden @6xl:table-cell`).
16. **Okvir ne čita parametre.** `AdminFrame` je u layoutu, van `<Suspense>`: `useSearchParams` u njemu bi oborio statički build. Parametre čitaju samo sadržaj sidebara i stranica (oboje pod `<Suspense>`).
17. **`overflow-hidden` oko tabele** gasi sticky zaglavlje. Panel oko liste ga ne nosi; lista čiji bi naslov panela ponovio H1 stoji direktno u ekranu.
18. **Ugrađena lista i URL.** Hook se zove bezuslovno, ali ugrađena varijanta (Inbox i sažetak Finansija u profilu klijenta) ignoriše njegovo stanje i ne objavljuje ništa.
19. **Pomoćne skripte se lintuju.** `npm run lint` obuhvata i `output/playwright/**`: skripta sa neupotrebljenom promenljivom diže broj upozorenja.
20. **Git Bash i putanje.** `/dev/...` kao argument alata postaje Windows putanja; alat za snimke pokreći sa `MSYS_NO_PATHCONV=1`.
21. **URL stiže pre podataka.** Filter iz URL-a važi od prvog crtanja, i pre nego što stignu podaci od kojih zavisi (Inbox: `?assignee=mine` pre upita `me`). Dok takav podatak nije poznat, upit liste se preskače (`"skip"`); lista bez tog filtera ne sme ni na trenutak da se učita, jer stranica otvara prvi red i označava ga pročitanim.
