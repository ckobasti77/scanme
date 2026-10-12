# ADMIN v2: arhitektura okvira i recept za stranice

Ovo je recept po kome se svaka admin stranica prebacuje u novi okvir. Napisan je u koraku X1 (okvir i Događaji); korak X2 po njemu prebacuje ostale liste. Plan je u `docs/admin/v2/X0-PLAN.md`, a beleška o X1 u `docs/admin/v2/X1.md`.

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

- Ispod `lg` zaglavlje samo dodaje dugme „Filteri (N)“ kad stranica ima pretragu, poglede, grupe ili sortiranje. Dugme otvara fioku direktno na filterima.
- Lista čiji bi naslov panela ponovio H1 ne dobija panel sa naslovom: `AdminDataView` stoji direktno u ekranu (primer: Modeli).
- U Događajima zaglavlje crta okvir oblasti (`AdminEventFrameView`): iznad naslova je „Događaji · naziv događaja“, H1 je naziv sekcije, a desno je jedino „Poveži nalepnicu“. Sekcije ne crtaju svoj H1.

## 3. Kontekstualni sidebar

Jedan komponent (`AdminSidebarView`), isti na svim stranicama. Šta prikazuje dolazi iz dva izvora:

1. **Registar po ruti** (`lib/admin-v2/sidebar/registry.ts`): statična konfiguracija stranice, `SidebarConfig`.
2. **Stranica** (`useAdminSidebarLive`): ono što zna samo iz podataka, `SidebarLive`.

Vrednosti filtera sidebar čita iz URL-a i sam ih piše. Stranica ne prosleđuje `onChange` za filtere; ona čita isti URL i filtrira.

### 3.1 Redosled blokova

1. kontekst oblasti (Događaji: izbor događaja);
2. navigacija oblasti (podstrane);
3. pogledi sa brojevima;
4. pretraga stranice (uvek vidljiva);
5. grupe filtera kao harmonika;
6. čipovi aktivnih filtera i „Očisti sve“;
7. sortiranje;
8. blok „Brzi skokovi“ (podrazumevani sidebar stranice bez konfiguracije).

### 3.2 `SidebarConfig` (`lib/admin-v2/sidebar/types.ts`)

```ts
type SidebarOption = { value: string; label: string; count?: number; hint?: string };

type SidebarGroup = {
  id: string;                         // URL ključ filtera
  label: string;
  kind?: "choice" | "custom";         // podrazumevano "choice"
  options?: readonly SidebarOption[]; // statične opcije; bez njih ih šalje stranica
  keys?: readonly string[];           // "custom": URL ključevi grupe (npr. ["od", "do"])
  chipOnly?: boolean;                 // filter bez kontrole: stiže linkom, vidi se samo čip
};

type SidebarConfig = {
  id: string;                                   // "dogadjaji/modeli"; deo pre "/" je oblast
  context?: { id: string; label: string };
  nav?: readonly AdminSubnavGroup[];
  navLabel?: string;
  views?: { key: string; label: string; items: readonly SidebarOption[]; defaultValue: string };
  search?: { key: string; label: string; placeholder?: string };
  groups?: readonly SidebarGroup[];
  sort?: { key: string; label: string; options: readonly SidebarOption[]; defaultValue: string };
  blocks?: readonly "jumps"[];
};

resolveAdminSidebar(pathname: string, search?: URLSearchParams | string): SidebarConfig;
```

- Nova stranica se dodaje kao razrešivač u nizu `RESOLVERS` u `registry.ts`, a njena konfiguracija ide u `lib/admin-v2/sidebar/configs/<oblast>.ts`. Razrešivač dobija kanonsku admin putanju (dev preview se već preveo u nju, `adminRoute` u `lib/admin-v2/frame/routes.ts`) i parametre.
- Registar i konfiguracije menja samo vođa koraka.

### 3.3 `SidebarLive` i objava sa stranice

```ts
type SidebarLive = {
  context?: { value: string; options: readonly SidebarOption[]; onChange: (value: string) => void };
  nav?: readonly AdminSubnavGroup[];                          // navigacija sa bedževima
  viewCounts?: Record<string, number>;
  options?: Record<string, readonly SidebarOption[]>;         // opcije grupa (sa brojevima), po id-u grupe
  custom?: Record<string, { summary?: string; body: ReactNode }>;
  intercept?: (patch, state) => patch | null;                 // zavisni filteri ili otkazivanje izmene
};

useAdminSidebarLive(live: SidebarLive | null): void;          // components/admin/frame/admin-sidebar-store.tsx
```

- Objekat mora biti memoizovan (`useMemo`). Nov objekat pri svakom renderu ponovo crta sidebar.
- Više komponenti jedne stranice sme da objavljuje; rezultati se spajaju (Događaji: okvir događaja šalje `context` i `nav`, sekcija šalje `options`).
- Bez okvira hook ne radi ništa, pa komponenta i dalje radi sama u testu.
- Brojevi uz opcije se šalju samo kad ih stranica već ima u podacima. Liste koje filtrira Convex upit ih nemaju.

### 3.4 Harmonika

Pravila su u `lib/admin-v2/sidebar/accordion.ts`:

- `accordionReducer`: otvorena je najviše jedna grupa; klik na otvorenu je zatvara.
- `groupControlKind(n)`: do 7 opcija radio lista, više od 7 search-select (`SIDEBAR_RADIO_MAX`). „Sve“ se ne broji.
- Zaglavlje grupe pokazuje izbor: „Status · Aktivni“.
- Izbor važi odmah. Čip uklanja jedan filter, „Očisti sve“ pretragu i sve grupe; pogled, sortiranje i kontekst ostaju.
- Tastatura: Enter i Space otvaraju grupu, strelice idu kroz opcije, Escape zatvara grupu i vraća fokus na njeno zaglavlje. U search-selectu prvi Escape briše upisan tekst.

## 4. URL stanje

Šema se izvodi iz konfiguracije (`sidebarUrlFields`, `lib/admin-v2/query/url-state.ts`): pogled, pretraga, svaka grupa, sortiranje.

```ts
readUrlState(fields, search)          // važeće vrednosti; podrazumevano i nevažeće se izostavlja
writeUrlState(fields, search, patch)  // "?a=b" ili ""; tuđi parametri ostaju netaknuti
useAdminUrlState(fields)              // [state, set]  components/admin/admin-ui/use-admin-query-state.ts
useAdminQueryState()                  // Događaji: fiksni ključevi iz lib/admin-v1/query-state.ts
```

- Upis ide preko `window.history.replaceState`. Next ga drži usklađenim sa `useSearchParams`, a lista odgovara odmah, bez odlaska na server.
- Filter zamenjuje stavku istorije. Sekcije i detalji su linkovi, pa Back vraća na prethodnu stranicu sa filterima u URL-u.
- Podrazumevana vrednost se ne piše. Parametri koje šema ne poznaje (`?task=`, `?profile=`, `?order=`) se ne brišu.
- Vrednosti u URL-u su vrednosti koje stranica već koristi za upit. Bez tabela prevoda: isti izbor mora da da iste argumente upita kao pre.
- Stranica čita stanje hook-om iste šeme (`useAdminUrlState(sidebarUrlFields(config))`) ili, u Događajima, postojećim `useAdminQueryState()`.

## 5. Kako se stranica prebacuje, korak po korak

1. **Konfiguracija** (vođa): u `lib/admin-v2/sidebar/configs/<oblast>.ts` opiši navigaciju, poglede, pretragu, grupe i sortiranje, pa je uključi u `registry.ts`. Ključevi grupa su URL parametri. Postojeći parametri stranice se ne preimenuju.
2. **Skini filter blok** sa vrha stranice: pretragu, selecte, tabove pogleda, čipove i „Očisti“. Kontrole koje menjaju prikaz, a ne sadržaj (Tabela / Kartice), ostaju uz listu.
3. **Čitaj stanje iz URL-a** umesto iz `useState`. Podrazumevane vrednosti primenjuje stranica kad ključa nema.
4. **Objavi podatke** hook-om `useAdminSidebarLive`: opcije dinamičkih grupa, brojeve, kontekst. Sastavi ih čistom izvezenom funkcijom (`<nesto>SidebarLive(...)`), da može da se testira.
5. **Zaglavlje**: `AdminPageHeader` sa naslovom i primarnim akcijama. Jedan H1 po stranici.
6. **Tabela**: bez `max-h` i bez uspravnog skrola u kutiji. `AdminDataView` i `AdminTable` to već rade (odeljak 6).
7. **Testovi**: čista funkcija koja URL stanje pretvara u argumente upita ili filtrira redove; markup sidebara kroz `AdminSidebarView` sa konfiguracijom iz registra; test da stranica više nema filter blok.
8. **Snimak** dev preview rute na 1440, 1280, 390 i 360, plus otvorena fioka na telefonu.

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
