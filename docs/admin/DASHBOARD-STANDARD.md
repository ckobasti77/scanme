# ScanMe standard za dashboarde i aplikacije

Važi za svaki budući ScanMe dashboard i aplikaciju: web, desktop i mobilnu, internu i za posetioce. Nastao je u lancu ADMIN v2 (11–12. 10. 2026) i opisuje ono što je u adminu napravljeno i provereno. Referentna primena je `/admin`; recept za novu stranicu je `docs/admin/ADMIN-V2-ARHITEKTURA.md`, rečnik je `docs/admin/v2/RECNIK.md`, a šta je kada odlučeno piše u `docs/admin/v2/IZVESTAJ.md`.

Kad pravilo i kod odstupe, popravlja se kod ili se pravilo menja ovde, uz razlog. Ne pravi se drugi sistem pored ovog.

## 0. Tri pravila

1. **Brutalno jednostavno.** Jedan ekran odgovara na jedno pitanje. Okvir ima malo boja, podaci više. Nema dekoracije koja ne radi posao.
2. **Kao igrica, a ne igrica.** Jasni brojevi, napredak, rangovi, prečice i trenutna povratna informacija. Bez poena, nivoa, nagrada i buke.
3. **Leti.** Klik odgovara odmah. Prelaz traje najviše 250 ms, promena okvira najviše 320 ms. Animacija nikad ne zadržava korisnika. Teški delovi se učitavaju tek kad zatrebaju.

Provera pre nego što nešto uđe u ekran: *na koje pitanje odgovara, i šta korisnik posle toga uradi?* Ako nema odgovora, ne ulazi.

## 1. Okvir

Tri dela, uvek ista, nacrtana jednom u layoutu (`app/admin/layout.tsx` → `components/admin/frame/admin-frame.tsx`). Ne remountuju se između stranica.

| Deo | Komponenta | Pravila |
|---|---|---|
| Sidebar | `frame/admin-sidebar.tsx` (`data-admin-frame="sidebar"`) | Levo, od vrha do dna prozora, fiksiran. Gore logo centriran u širini sidebara, ispod kontekst stranice (§2), na dnu HUD (§6). Širina `--admin-sidebar-w`: 17,5 rem, od 1440 px 18,5 rem. Skroluje sam, sa fade maskom od 1,5 rem gde ima još. |
| Navbar | `frame/admin-navbar.tsx` (`data-admin-frame="navbar"`) | Desno od sidebara, visina `--admin-navbar-h` (3,5 rem). Linkovi počinju uz sidebar. **Bez pozadine**: nema pilule ni popune aktivne stavke. Aktivna stavka je tekst u `--admin-nav-current` i linija `--admin-nav-line` (`#6fc05d`) koja klizi do nje. Desno: pretraga sa oznakom „Ctrl K“, podešavanja, obaveštenja, tema, profil. |
| Ekran | `frame/admin-screen.tsx` (`data-admin-frame="screen"`) | Panel sa svojom površinom i uglom `--admin-radius-screen` (1 rem), razmak 0,75 rem desno i dole. **Jedini skrol kontejner**: prozor nikad ne skroluje. Sadržaj je centriran, najviše 90 rem (1440 px). |

**Površine:** sidebar i navbar su na `--admin-app`, ekran na `--admin-surface`, paneli u ekranu na `--admin-surface-strong`. Ugnežđeni uglovi: unutrašnji je pola spoljašnjeg (`--admin-radius-inner`, 0,25 rem u panelu od 0,5 rem), a padding je jednak unutrašnjem uglu.

**Zaglavlje stranice** je u ekranu: `AdminPageHeader` (`frame/admin-page-header.tsx`).

```tsx
<AdminPageHeader
  eyebrow="Operativa"
  title="Porudžbine"
  actions={<button className={adminPrimaryButtonClass}>Novi zadatak</button>}
/>
```

- Jedan H1 po stranici, na fiksnoj rem skali (1,75 rem od `lg`, 1,5 rem ispod), ne fluidnoj, na istoj visini na svim stranicama.
- H1 je naziv stranice ili zapisa. Nikad broj, poruka ni greška.
- Primarne akcije su desno, u redu sa H1. Jedna akcija postoji na jednom mestu.

**Ispod `lg` (1024 px):** navbar je gornja traka sa dugmetom menija, a sidebar je fioka sleva (`frame/admin-drawer.tsx`) sa istim sadržajem. Dugme „Filteri (N)“ u zaglavlju otvara fioku direktno na filterima. Fioka ima fokus zamku, zatvara se na Escape, prevlačenjem i pri promeni stranice; posle zatvaranja fokus se vraća na dugme koje ju je otvorilo. Podnožje je jedan red ikonica od 44 px.

**Ugovor koji se proverava automatski** (`scripts/admin-v2/alati/snimi.mjs --okvir --harmonika`): tri `data-admin-frame` atributa; od 1024 px sidebar ide od vrha do dna prozora, prozor ne skroluje, sidebar i navbar stoje dok ekran skroluje.

**Desktop i mobilna aplikacija** koriste isti okvir: na širokom prozoru sidebar, navbar i ekran, na uskom gornja traka i fioka. Prelom je širina prozora, ne vrsta uređaja.

## 2. Sidebar i harmonika

Jedan komponent za sve stranice (`frame/admin-sidebar-view.tsx`). Šta prikazuje određuje **registar po ruti** (`lib/admin-v2/sidebar/registry.ts`, konfiguracije u `lib/admin-v2/sidebar/configs/`), a podatke koje zna samo stranica ona šalje hook-om `useAdminSidebarLive` (`frame/admin-sidebar-store.tsx`).

**Redosled blokova, uvek isti:**
1. kontekst oblasti (izbor događaja, član tima);
2. navigacija oblasti (podstrane);
3. pogledi sa brojevima;
4. pretraga stranice, uvek vidljiva, nikad u harmonici;
5. grupe filtera kao harmonika;
6. čipovi aktivnih filtera i „Očisti sve“;
7. sortiranje;
8. blokovi stranice („Misije danas“, „Brzi skokovi“).

**Harmonika** (`lib/admin-v2/sidebar/accordion.ts`):

| Pravilo | Kako |
|---|---|
| **Otvorena je najviše jedna grupa** | `accordionReducer`: otvaranje druge zatvara prethodnu, klik na otvorenu je zatvara. Važi i za sklopljenu navigaciju oblasti (`navFold`). |
| **Do 7 opcija radio lista, više od 7 search-select** | `groupControlKind(n)`, prag `SIDEBAR_RADIO_MAX = 7`; „Sve“ se ne broji. Search-select je `frame/admin-search-select.tsx`, u toku dokumenta (nije `absolute`). |
| Zaglavlje grupe pokazuje izbor | „Status · Aktivni“, strelica se okreće 180° za 180 ms. |
| Izbor važi odmah | Bez dugmeta „Primeni“. Lista se filtrira, URL se ažurira. |
| Broj uz opciju | Samo gde podatak već postoji. Bez novog upita radi broja. Ograničen broj piše da je ograničen („12+“). |
| Tastatura | Enter i Space otvaraju grupu, strelica nadole ulazi u opcije, strelice idu kroz opcije, Escape zatvara grupu i vraća fokus na zaglavlje. |
| Pristupačnost | Zaglavlje je `<button data-admin-filter-toggle aria-expanded aria-controls>`; opcije su pravi `<input type="radio">` u `role="radiogroup"`; zatvoreno telo je `inert`. |

**Stanje filtera je u URL-u** (`lib/admin-v2/query/url-state.ts`, hook `useAdminUrlState`). Link se deli, Back radi, osvežavanje čuva filtere.
- Upis ide preko `history.replaceState`, bez odlaska na server. Korak koji Back mora da poništi piše se sa `"push"`.
- Podrazumevana vrednost se ne piše. Nevažeća vrednost se čita kao da je nema; grupa čije su vrednosti id-jevi prima samo oblik id-ja (`ids`).
- Pretraga se piše 250 ms posle kucanja. Pretraga koja zove spoljni servis piše se na Enter (`submit: true`).
- Vrednosti u URL-u su one koje upit već prima. Bez tabela prevoda.

**Šta nije filter i ostaje u ekranu:** kontrola koja menja prikaz (Tabela | Kartice, 2D | 3D), kontrola koja menja jedan zapis, i glavno polje stranice čiji je sadržaj sama pretraga.

Primer konfiguracije:

```ts
// lib/admin-v2/sidebar/configs/clients.ts
{
  id: "klijenti",
  search: { key: "q", label: dict.clientsSearchLabel },
  groups: [{ id: "status", label: ui.filters.status, options: [{ value: "active", label: dict.clientsStatusActive }, …] }],
  sort: { key: "sort", label: ui.filters.sort, defaultValue: "urgency", options: […] },
}
```

Ključ grupe je URL parametar (`?status=active`), a vrednost je ona koju upit već prima.

## 3. Tabele

Komponente: `AdminDataView` (`admin-ui/admin-data-view.tsx`: Tabela | Kartice, sortiranje, grupe), `AdminTable` (`admin-primitives.tsx`), omotač `AdminTableScroll` (`admin-ui/admin-table-scroll.tsx`).

- Tabela skroluje **sa ekranom**, nikad uspravno u svojoj kutiji. Bez `max-h` i bez `overflow-hidden` oko nje.
- Zaglavlje je sticky uz vrh ekrana (`top: 0`).
- Vodoravni skrol postoji samo dok tabela stvarno ne staje (`data-overflow-x`); tada zaglavlje nije sticky. Zato tabela treba da stane već na 56 rem.
- Prelomi prate **širinu liste**, ne prozora (container query): kartice ispod 56 rem, tabela od 56 rem, sporedne kolone od 72 rem (`hideBelow`).
- Red i kartica imaju iste akcije. Kolona koja imenuje red je `<th scope="row">`.
- Brojevi su desno poravnati, `tabular-nums`. Prazna vrednost je prazna, bez „—“ i „/“.
- Lista čiji bi naslov panela ponovio H1 stoji direktno u ekranu, bez panela.
- Stanja imaju jedan oblik (`admin-primitives.tsx`): `AdminLoadingState` (skeleton po obliku sadržaja, `shape="table"` za liste), `AdminEmptyState` (šta je prazno, zašto, šta je sledeće, akcija), `AdminErrorState` (šta nije uspelo, šta da uradi, „Pokušaj ponovo“). Prazno posle filtriranja nudi „Očisti filtere“ (`admin-ui/admin-clear-filters.tsx`).

## 4. Grafikoni i paleta

Komplet je `components/admin/events/analytics/chart-kit.tsx`; šta grafikon crta računaju čiste funkcije u `lib/admin-v2/analytics/`. Komponenta ne računa.

**Svaki grafikon odgovara na jedno pitanje.** `ChartFrame` nosi mali naslov, pitanje kao glavni red, legendu, napomenu i tabelu:

```tsx
<ChartFrame id="dan-sat" title="Dan i sat" question="Kad je gužva?" table={matrixTable}>
  …
</ChartFrame>
```

- **Svaki grafikon ima „Prikaži kao tabelu“** (`ChartTable`) i tooltip na hover, fokus i dodir (`useChartTip`); Escape ga zatvara.
- Ono što je jedna rečenica nije grafikon (uređaji, uvidi).
- Nula koja je problem označava se ikonicom i tekstom, uz „šta proveriti“ (`ChartProblem`), ne samo bojom.
- Korelacija se tako i zove. Uz poređenje koje ne dokazuje uzrok piše „korelacija, ne uzrok“; grupa sa jednim članom nosi „samo 1, nije prosek“.
- Ograničeno čitanje se kaže na ekranu (`capped`), ne prikazuje se kao tačan broj.

### Kategorijska paleta (tačne boje)

Tokeni `--admin-chart-1…8` u `app/globals.css`, pristup preko `lib/admin-v2/analytics/palette.ts`. Uvek istim redom.

| Slot | Svetla tema | Tamna tema |
|---|---|---|
| 1 | `#2a78d6` | `#3987e5` |
| 2 | `#eb6834` | `#d95926` |
| 3 | `#1baf7a` | `#199e70` |
| 4 | `#eda100` | `#c98500` |
| 5 | `#e87ba4` | `#d55181` |
| 6 | `#008300` | `#008300` |
| 7 | `#6250d6` | `#9085e9` |
| 8 | `#e34948` | `#e66767` |
| Ostalo | `#8f9490` | `#7d837e` |

Validirano na površinama admina (svetla `#fdfdf8`, tamna `#272c29` i `#292e2b`): najslabiji susedni par ima CVD ΔE 9,1 u svetloj i 8,4 u tamnoj temi (normalan vid 19,6 i 19,3). Ispod kontrasta 3:1 su slotovi 3, 4 i 5 u svetloj i slot 6 u tamnoj temi, pa su **vidljive oznake ili tabela obavezne**.

- **Boja prati entitet, nikad rang.** `entityColors(keys)` sortira ključeve, pa isti skup uvek dobija iste boje.
- Jedna serija je uvek slot 1. Više od 8 serija: deveta i dalje idu u „Ostalo“ ili u male višestruke prikaze. Scatter: najviše 3 serije.
- Legenda postoji za dve i više serija (`ChartLegend`).

### Sekvencijalna skala (matrice, uređene kategorije)

Jedna plava, `--admin-seq-100…700`. U tamnoj temi skala je obrnuta (više je svetlije). Tekst na ćeliji je `--admin-seq-on-*`.

| Korak | 100 | 200 | 300 | 400 | 500 | 600 | 700 |
|---|---|---|---|---|---|---|---|
| Svetla | `#cde2fb` | `#9ec5f4` | `#6da7ec` | `#3987e5` | `#256abf` | `#184f95` | `#0d366b` |
| Tamna | `#0d366b` | `#184f95` | `#256abf` | `#3987e5` | `#6da7ec` | `#9ec5f4` | `#cde2fb` |

### Toplotna skala (mapa hale)

Ista skala kao „Gde je gužva“ na javnoj mapi, iz `lib/fair-heat.ts` (`FAIR_HEAT_STOPS`), u 2D i u 3D: `#2f6fe4` → `#11aec4` → `#1fae7a` → `#f2c318` → `#f0862a` → `#e0362c`. Zelena je namerno hladan smaragd: ScanMe zelena ostaje samo na ScanMe stvarima.

### Medalje i status

- Medalje (`RankMedal`): `--admin-medal-1…3`, svetla `#b8890f`, `#7f878b`, `#a8623a`; tamna `#e0b84a`, `#b4bbbf`, `#d08a5c`. Prsten u boji sa `role="img"` i nazivom, nikad emoji.
- **Statusne boje nisu boje serija**: `--admin-success`, `--admin-warning`, `--admin-danger` idu samo uz ikonicu i tekst. Pad je siv, ne crven; zelena ide tek uz rast od 5 %.
- **Tekst je uvek u tekstualnim tokenima** (`--admin-text`, `--admin-text-muted`), nikad u boji serije. Boju nosi oznaka pored teksta.

### Marke

Jedna y osa, nikad dve. Trake 8–12 px, linije 2 px, zaobljen samo kraj podatka, 2 px razmaka u boji površine između segmenata. Bez animacije pri prvom prikazu i pri osvežavanju.

## 5. Pokret

Tokeni su na jednom mestu: `lib/admin-v2/motion.ts` (sekunde, za GSAP) i isti u `app/globals.css` (CSS).

| Token | Vrednost | Za šta |
|---|---|---|
| `--admin-dur-1` / `ADMIN_DURATION.feedback` | 120 ms | pritisak, hover, boja |
| `--admin-dur-2` / `.state` | 180 ms | promena stanja (harmonika, čip) i svaki izlaz |
| `--admin-dur-3` / `.move` | 240 ms | pokret unutar okvira (linija navbara, fioka, prelaz stranice) |
| `--admin-dur-4` / `.frame` | 320 ms | promena samog okvira |
| `--admin-ease-out` / `ADMIN_EASE.out` | `cubic-bezier(0.16, 1, 0.3, 1)` / `power3.out` | ulaz i promena stanja |
| `--admin-ease-in` / `ADMIN_EASE.in` | `cubic-bezier(0.4, 0, 1, 1)` / `power2.in` | izlaz |
| `ADMIN_STAGGER_TOTAL` | 70 ms | ceo stagger jedne grupe (180 + 70 = 250 ms) |
| `ADMIN_ENTER_OFFSET`, `ADMIN_PAGE_OFFSET` | 7 px, 6 px | pomak bloka i stranice pri ulazu |
| `ADMIN_PRESS_SCALE` | 0,98 | pritisnuto dugme |
| `ADMIN_MOTION_MAX` | 400 ms | ništa ne traje duže |

**Pravila:**
- Animiraju se samo `transform` i `opacity`. Izuzetak je visina harmonike preko `grid-template-rows`.
- Izlaz je kraći od ulaza.
- **Ništa se ne kreće pri prvom učitavanju ni kad polling donese iste podatke.** Kreće se ono što je korisnik pokrenuo ili što se stvarno promenilo.
- Unos se nikad ne zaključava dok animacija traje.
- `prefers-reduced-motion`: ništa se ne pomera, ostaje pretapanje od 120 ms.
- Sadržaj je vidljiv i bez JavaScript-a; nema početnog skrivanja u CSS-u.
- Jedna biblioteka po stablu: novi kod koristi GSAP kroz `frame/use-admin-gsap.ts` (`gsap.context`, `revert` pri izlasku). Šta može u CSS-u, ide u CSS (harmonika, strelica, fioka, pritisak).

**Fokalni momenti** (ostalo je podrška): linija navbara klizi do aktivne stavke; sadržaj sidebara se pretapa pri promeni stranice; harmonika se otvara. Podrška: prelaz stranice u ekranu, FLIP redova pri filtriranju (`admin-ui/use-admin-flip.ts`, do 80 redova), čipovi (`frame/use-chip-motion.ts`), odometar, meniji i paleta iz tačke porekla.

## 6. Blaga gamifikacija

Sve je izvedeno iz pravog rada i pravih podataka, i svaka „igra“ nešto informiše.

| Da | Kako | Gde |
|---|---|---|
| **Misije sa napretkom** | Krug i „1 od 4 misije rešeno“. Jedinica piše u tekstu. Zatečeno stanje nije napredak; promena obima ili faze nije rešen posao. | `lib/admin-v2/missions.ts`, `admin-ui/admin-missions.tsx` |
| **Potvrda rešenog** | Kratko „Rešeno: naziv“, 1,2 s, pa se napredak vrati. Ne tvrdi više nego što jeste. | isto |
| **„Sve čisto“** | Proslava najviše jednom dnevno po oblasti; posle toga miran red. | isto |
| **HUD „Danas“** | Dno sidebara, samo dok događaj traje: dan, traka dana, „Uživo“, ključni broj. Star podatak (preko 3 min) piše „Podatak od 14:32“, ne „Uživo“. | `lib/admin-v2/hud.ts`, `frame/admin-hud.tsx` |
| **Odometar** | Broj se okrene samo kad se vrednost promeni; nikad pri prvom prikazu. | `lib/admin-v2/odometer.ts`, `admin-ui/admin-odometer.tsx` |
| **Rangovi** | Medalje za prva tri i strelica promene mesta, uz objašnjenje šta se meri. | `chart-kit.tsx` (`RankMedal`, `RankMove`) |
| **Rekordi i značke** | Činjenica iz brojeva, uz grafikon na koji se odnosi. Toast samo za ono što se desilo dok je stranica otvorena, jednom po rekordu. | `lib/admin-v2/analytics/records.ts` |
| **Prečice** | Ctrl K, G pa slovo, `/`, `?`. Hint u tooltipu. Ne rade u polju u koje se kuca. | `lib/admin-v2/shortcuts.ts`, `frame/admin-shortcuts.tsx` |
| **Tihi režim** | Gasi potvrde, proslave i toastove. Brojevi, napredak i značke ostaju, jer su informacija. Pamti se lokalno, u try/catch. | `lib/admin-v2/quiet-mode.ts` |

**Ne:** poeni, nivoi korisnika, nizovi („streak“), rang-liste ljudi, nagrade, zvuk, konfete preko ekrana, maskote, emoji umesto ikonica, animacije koje se ponavljaju, pulsirajuće tačke.

**Poštenje je deo pravila.** Igra ne sme da slaže: ne proglašava „Sve čisto“ dok podaci još stižu, ne javlja isti rekord dvaput, ne prikazuje ograničen broj kao tačan, ne broji kao napredak ono što korisnik nije uradio.

## 7. Tekst

Rečnik i zabranjeni izrazi: `docs/admin/v2/RECNIK.md`. Test `lib/admin-v2/text-vocabulary.test.ts` pada na svaki zabranjen izraz u rečnicima.

- **Bez programerskog jezika.** Tekst kaže šta se dešava i šta korisnik da uradi. Tehnički detalj ide u tooltip (`title`) ili u prikaz podrške.
- Obraćanje je „ti“. Srpski, sa dijakritikom.
- **Svaki tekst je u tipizovanom rečniku** (`lib/i18n`, `getDict`), ne u komponenti.
- Jedinica uz broj i ispravan oblik imenice („1 sken“, „2 skena“, „39 skenova“; `plural` u `lib/admin-v2/analytics/format.ts`).
- `<title>` je „Naziv | ScanMe Admin“ (`lib/admin-v2/frame/titles.ts`, sa testom).
- Probni podaci nose značku „Probni prikaz · nisu stvarni podaci“ i TEST imena.

| Stanje | Oblik | Primer |
|---|---|---|
| Prazno | šta je prazno + zašto i šta je sledeće + akcija | „Nema porudžbina“ · „Nove porudžbine se pojavljuju čim klijent poruči.“ |
| Prazno posle filtera | isti naslov svuda + „Očisti filtere“ | „Nema rezultata za izabrane filtere“ |
| Greška | šta nije uspelo + šta da uradi + „Pokušaj ponovo“ | „Porudžbine nisu učitane“ · „Pokušaj ponovo. Ako se ponovi, javi se timu.“ |
| Učitavanje | skeleton po obliku sadržaja | — |

## 8. Pristupačnost

- **Kontrast:** tekst najmanje 4,5:1, oznake i ivice kontrola najmanje 3:1, u obe teme. ScanMe zelena `#6fc05d` na svetloj podlozi ima 2,08:1, pa **nije boja teksta ni oznake izbora u svetloj temi**: tekst je `--admin-nav-current` (svetla `#2f6d23`, tamna `#6fc05d`).
- **Mete:** najmanje 44 px ispod `lg`, najmanje 36 px od `lg` naviše.
- **Tastatura:** sve radi bez miša. Prvi Tab je „Pređi na sadržaj“. Svaki stop ima vidljiv fokus (`--admin-focus`).
- **Fokus se vraća** na element koji je otvorio dijalog, fioku ili meni. Dijalog bez `Trigger`-a to ne radi sam: zapamti `document.activeElement` u `onOpenAutoFocus` i vrati ga u `onCloseAutoFocus` (uzor `frame/admin-drawer.tsx`).
- **Escape** zatvara najbliži sloj (tooltip, grupu, dijalog), ne sve odjednom.
- **Signal nikad nije samo boja:** uz boju idu ikonica i tekst.
- **Semantika:** jedan H1, landmark-i, `aria-current` na aktivnoj stavci, `aria-sort` na koloni, `role="status"` za toast, pravi `radio` i `button` umesto `div`.
- **Čitač ekrana dobija isto što i oko:** tabela uz grafikon, tekst uz odometar dok se okreće, naziv uz medalju.
- **Portali** (meni, dijalog, fioka) moraju da nose klasu teme (`admin-v1`), inače gube tokene.

## 9. Performanse

- **Trajni okvir.** Layout se ne remountuje; menja se samo sadržaj ekrana.
- **Teško se učitava na zahtev.** 3D (`three`) preko dinamičkog uvoza tek na klik; grafikoni Analitike preko `next/dynamic`. Lenji uvoz ima granicu grešaka i rezervu (2D mapa).
- **Crta se na promenu, ne u petlji.** 3D scena nema stalni loop; pri izlasku oslobađa geometrije, materijale i renderer.
- **Čitanja su ograničena.** Convex upiti koriste indekse i `take()` pod granicom, bez `.collect()`. Trošak novog upita se meri testom (dokumenti i opsezi indeksa) i zapisuje. Granice Convex-a su 32.000 dokumenata i 4.096 opsega indeksa po upitu.
- **Polling umesto žive pretplate za brojače:** 60 s za brojeve, 5 min za teže agregacije, i samo dok je tab vidljiv (`admin-ui/use-polled-query.ts`). Detalj se čita samo dok je otvoren.
- **Polling ne crta ponovo ono što se nije promenilo.** Objekat koji stranica šalje u sidebar je memoizovan.
- **Filter ne ide na server zbog URL-a** (`replaceState`); pretraga čeka 250 ms.
- **Prelomi su container query**, bez merenja u JavaScript-u.
- **Bez novih paketa** bez odluke. Jedini dodati u ovom lancu su `three` i `@types/three`.

## 10. Kako se proverava

- **Logika je u čistim funkcijama** (`lib/**`) sa testom: reducer harmonike, prag 7, URL stanje, registar, pravila uvida, misije, rekordi, prečice. Markup se proverava kroz `renderToStaticMarkup`.
- **Svaka stranica ima probni prikaz** sa TEST podacima (`/dev/admin-*-preview`), na kome se snima i proverava bez prijave.
- **Snimci:** 1440, 1280, 1280×720, 390 i 360, u obe teme. Snimak se pogleda pre nego što se o njemu išta tvrdi.
- **Ponašanje** (tastatura, fokus, pokret, URL) proverava Playwright skripta, ne oko.
- **Javni repo:** fixtures koriste TEST imena i izmišljene brojeve. Pravi brojevi po klijentu, izlagaču, modelu ili štandu ne ulaze u kod, testove ni dokumenta.

## 11. Šta važi za aplikaciju posetilaca

Aplikacija posetilaca je samo mobilna i ima svoj vizuelni identitet (`docs/events/sajam-automobila-2026/EVENT-DESIGN-SYSTEM.md`). Iz ovog standarda preuzima pravila, ne izgled admina.

| Važi | Ne važi |
|---|---|
| Tri pravila (§0): jedan ekran, jedno pitanje, jedna glavna akcija | Sidebar, navbar i okvir admina |
| Tokeni pokreta i pravila pokreta (§5), reduced motion | Prečice sa tastature |
| Gamifikacija koja ne laže (§6): napredak iz pravih radnji, proslava jednom, bez buke | Harmonika filtera i URL filteri |
| Tekst (§7): šta se dešava i šta da uradim; prazna stanja sa sledećim korakom | Admin paleta grafikona (posetilac ne gleda grafikone) |
| Pristupačnost (§8): mete 44 px, kontrast, signal nije samo boja | |
| Performanse (§9): teško na zahtev, ograničena čitanja | |
| Toplotna skala „Gde je gužva“ je ista u adminu i na javnoj mapi | |

Šta podaci sa Sajma elektromobilnosti traže od te aplikacije piše u `docs/events/sajam-automobila-2026/AMF-PREPORUKE-IZ-PODATAKA.md`.
