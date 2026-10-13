# ScanMe standard za dashboarde i aplikacije

Važi za svaki budući ScanMe dashboard i aplikaciju: web, desktop i mobilnu, internu i za posetioce. Nastao je u lancu ADMIN v2 (11–12. 10. 2026) i opisuje ono što je u adminu napravljeno i provereno. Referentna primena je `/admin`; recept za novu stranicu je `docs/admin/ADMIN-V2-ARHITEKTURA.md`, rečnik je `docs/admin/v2/RECNIK.md`, a šta je kada odlučeno piše u `docs/admin/v2/IZVESTAJ.md`.

Kad pravilo i kod odstupe, popravlja se kod ili se pravilo menja ovde, uz razlog. Ne pravi se drugi sistem pored ovog.

**Dopuna v3 (13. 10. 2026, „živi kokpit“).** Lanac ADMIN v3 je nadogradio pokret, dodao 3D kit i zamenio blagu gamifikaciju pravom igrom. Odeljci 1–11 su standard v2 i važe i dalje, osim rečenica označenih sa „**Zamenjeno u v3**“. Novo je u §12 (pokret v3), §13 (3D kit), §14 (gamifikacija v3) i §15 (tihi režim i reduced motion). Šta je kada odlučeno piše u `docs/admin/v3/IZVESTAJ.md`.

## 0. Tri pravila

1. **Brutalno jednostavno.** Jedan ekran odgovara na jedno pitanje. Okvir ima malo boja, podaci više. Nema dekoracije koja ne radi posao.
2. **Kao igrica, a ne igrica.** Jasni brojevi, napredak, rangovi, prečice i trenutna povratna informacija. ~~Bez poena, nivoa, nagrada i buke.~~
   - **Zamenjeno u v3:** poeni (XP), nivoi, niz, kombo, šef dana, značke i ceremonije postoje (§14). Ostaje: sve daje pravi rad, nijedan broj se ne izmišlja, bez zvuka.
3. **Leti.** Klik odgovara odmah. ~~Prelaz traje najviše 250 ms, promena okvira najviše 320 ms.~~ Animacija nikad ne zadržava korisnika. Teški delovi se učitavaju tek kad zatrebaju.
   - **Zamenjeno u v3:** pokret ima tri sloja (§12): interakcija do 250 ms, ulaz stranice do 900 ms, ceremonija do 1,8 s. Granica od 250 ms i dalje važi za sve što je odgovor na klik, a nijedan sloj ne blokira unos.

Provera pre nego što nešto uđe u ekran: *na koje pitanje odgovara, i šta korisnik posle toga uradi?* Ako nema odgovora, ne ulazi.

**Važi bez izuzetka i u v3:**
- Klik odgovara odmah; sadržaj je klikabilan od prvog frejma.
- Sadržaj ne zavisi od animacije: bez JavaScript-a, uz reduced motion i u tihom režimu sve je vidljivo u konačnom stanju.
- Bez zvuka.
- Svaki poen, nivo i značku daje pravi rad.

## 1. Okvir

Tri dela, uvek ista, nacrtana jednom u layoutu (`app/admin/layout.tsx` → `components/admin/frame/admin-frame.tsx`). Ne remountuju se između stranica.

| Deo | Komponenta | Pravila |
|---|---|---|
| Sidebar | `frame/admin-sidebar.tsx` (`data-admin-frame="sidebar"`) | Levo, od vrha do dna prozora, fiksiran. Gore logo, **poravnat levo**: leva ivica mu je na istoj liniji kao tekst ispod (isti padding kao sadržaj sidebara: `px-3` skrola pa `px-2` reda), a red sa logom je visok `--admin-navbar-h`, u ravni sa navbarom. I u fioci na telefonu logo je levo, na liniji stavki menija. Ispod kontekst stranice (§2), na dnu HUD (§6). Širina `--admin-sidebar-w`: 17,5 rem, od 1440 px 18,5 rem. Skroluje sam, sa fade maskom od 1,5 rem gde ima još. |
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

Jedna y osa, nikad dve. Trake 8–12 px, linije 2 px, zaobljen samo kraj podatka, 2 px razmaka u boji površine između segmenata. ~~Bez animacije pri prvom prikazu i pri osvežavanju.~~

- **Zamenjeno u v3:** pri punom ulazu stranice grafikon se crta (trake rastu od baze, ćelije se pale talasom, levak se puni, prsten i linija se iscrtavaju; §12.2). Pri osvežavanju (polling) se i dalje ništa ne crta ponovo.

## 5. Pokret (v2: sloj interakcije)

U v3 je ovo prvi od tri sloja pokreta; reveal i ceremonija su u §12. Vrednosti ovog sloja nisu menjane.

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
| `ADMIN_ENTER_OFFSET` | 7 px | pomak bloka pri ulazu (v2 je imao i `ADMIN_PAGE_OFFSET`, 6 px; **uklonjen u v3**, jer ulaz stranice sada vodi reveal engine) |
| `ADMIN_PRESS_SCALE` | 0,98 | pritisnuto dugme |
| `ADMIN_MOTION_MAX` | 400 ms | ~~ništa ne traje duže~~ **Zamenjeno u v3:** gornja granica samo sloja interakcije zajedno sa okvirom (fioka, 320 ms) |

**Pravila:**
- Animiraju se samo `transform` i `opacity`. Izuzetak je visina harmonike preko `grid-template-rows`. **Dopuna v3:** reveal sme i `clip-path`, a `filter` samo na malim elementima.
- Izlaz je kraći od ulaza.
- ~~**Ništa se ne kreće pri prvom učitavanju ni kad polling donese iste podatke.**~~ Kreće se ono što je korisnik pokrenuo ili što se stvarno promenilo.
  - **Zamenjeno u v3:** stranica ima ulaz (§12.2). I dalje važi druga polovina: polling koji donese iste podatke ne pokreće ništa, a ulaz se ne ponavlja na polling.
- Unos se nikad ne zaključava dok animacija traje.
- ~~`prefers-reduced-motion`: ništa se ne pomera, ostaje pretapanje od 120 ms.~~ **Zamenjeno u v3:** §15.
- Sadržaj je vidljiv i bez JavaScript-a; nema početnog skrivanja u CSS-u.
- Jedna biblioteka po stablu: novi kod koristi GSAP kroz `frame/use-admin-gsap.ts` (`gsap.context`, `revert` pri izlasku). Šta može u CSS-u, ide u CSS (harmonika, strelica, fioka, pritisak). **Dopuna v3:** plugini se registruju na jednom mestu, `components/admin/reveal/gsap-plugins.ts`; Framer Motion se ne uvodi u admin.

**Fokalni momenti** (ostalo je podrška): linija navbara klizi do aktivne stavke; sadržaj sidebara se pretapa pri promeni stranice; harmonika se otvara. Podrška: ~~prelaz stranice u ekranu~~ (v3: §12.3), FLIP redova pri filtriranju (`admin-ui/use-admin-flip.ts`, do 80 redova), čipovi (`frame/use-chip-motion.ts`), odometar, meniji i paleta iz tačke porekla. Potpisni momenti v3 su u §12–§14.

## 6. Blaga gamifikacija (v2: osnova koja ostaje)

Mehanike iz ove tabele postoje i u v3. Zabrane ispod tabele su zamenjene; igra v3 je u §14.

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
| **Tihi režim** | Gasi potvrde, proslave i toastove. Brojevi, napredak i značke ostaju, jer su informacija. Pamti se lokalno, u try/catch. **Dopuna v3:** gasi i pokret (§15). | `lib/admin-v2/quiet-mode.ts` |

~~**Ne:** poeni, nivoi korisnika, nizovi („streak“), rang-liste ljudi, nagrade, zvuk, konfete preko ekrana, maskote, emoji umesto ikonica, animacije koje se ponavljaju, pulsirajuće tačke.~~

**Zamenjeno u v3.** Dozvoljeno je, po pravilima §14: XP, nivoi, niz, kombo, tabela tima, značke, čestice u ceremoniji. Ambijentalna petlja je dozvoljena samo za WebGL i Puls (§12.5, §13). **I dalje ne:** zvuk, maskote, emoji umesto ikonica, izmišljen broj, beskonačna CSS animacija (jedina je shimmer skeletona, i staje u tihom režimu).

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
- **Crta se na promenu, ne u petlji.** ~~3D scena nema stalni loop;~~ pri izlasku oslobađa geometrije, materijale i renderer.
  - **Zamenjeno u v3:** scena bez ambijenta i dalje crta samo na zahtev. Scena sa ambijentom (orbite, čestice) sme petlju od najviše 30 fps, koja staje na skrivenom tabu i van ekrana (§13).
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
- **Dopuna v3, pokret:** alat za snimke radi sa reduced motion i vidi samo konačno stanje. Pokret dokazuju kadrovi sopstvene skripte sa lažnim satom (`page.clock`), na tačnim milisekundama, i video u pravom vremenu. Okidač ulaza je klijentska navigacija; tvrdo učitavanje preview rute ulaz ne pokazuje. Softverski WebGL headless pregledača nije merilo FPS-a.
- **Dopuna v3, alat:** zbir `problema` alata ne uključuje polje `prelivanjeEkrana`; čita se posebno, a 360 px se snima ručno.
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
| v3: tri sloja pokreta i gating ulaza (§12, §15) | v3: Skener, Puls i živa ivica kao izgled (to je potpis admina) |
| v3: pravila 3D kita (§13): lenji uvoz, 2D rezerva, pauza, tekstualni ekvivalent | v3: XP, rangovi operatera, šef dana i tabela tima (igra operatera, ne posetioca) |
| v3: poštenje igre (§14.3): prvo čitanje je stanje, ne vest; ceremonija se preskače i ne krade fokus | |

Šta podaci sa Sajma elektromobilnosti traže od te aplikacije piše u `docs/events/sajam-automobila-2026/AMF-PREPORUKE-IZ-PODATAKA.md`.

## 12. Pokret v3

Zamenjuje granicu „ništa preko 400 ms“ iz §5. Tokeni su i dalje u jednom fajlu, `lib/admin-v2/motion.ts`, sa istim vrednostima u `app/globals.css`; test `lib/admin-v2/reveal/css-contract.test.ts` čita CSS sa diska i poredi brojeve.

### 12.1 Tri sloja tokena

| Sloj | Šta pokriva | Granica | Tokeni |
|---|---|---|---|
| **interakcija** | pritisak, hover, harmonika, čip, traka XP-a | ≤ 250 ms (fioka okvira 320 ms je jedini izuzetak) | `ADMIN_DURATION`, `ADMIN_EASE` (§5) |
| **reveal** | ulaz stranice, grafikoni, skrol, živi red | ≤ 900 ms za celu stranicu; na telefonu ≤ 675 ms | `ADMIN_REVEAL`, `ADMIN_REVEAL_EASE`, kriva `adminIgnite` |
| **ceremonija** | nivo, rang, značka, rekord, šef; komet XP-a | ≤ 1,8 s, preskočivo | `ADMIN_CEREMONY`, `ADMIN_SPARK` |

`ADMIN_LAYER_MAX = { interakcija: 0.25, reveal: 0.9, ceremonija: 1.8 }` je granica svakog sloja, a `lib/admin-v2/motion.test.ts` je čuva. Novo trajanje ne ide u komponentu, nego u `motion.ts` (v3 blok CSS-a nema nijedno trajanje u milisekundama; i to čuva test).

Ostali tokeni: `ADMIN_AMBIENT_FPS = 30`, `ADMIN_MATERIAL` (magnet, nagib), `ADMIN_SHIMMER` (1,4 s), `ADMIN_STAGE_MOTION` (pozornica 3D kita), `ADMIN_GAME_MOTION`, `ADMIN_EDGE_FADE`.

### 12.2 Reveal engine

Jedan mehanizam za ulaz svake stranice. Stranica ne piše animaciju: nosi atribute, a engine ih čita.

| Šta | Gde |
|---|---|
| vrste, koreografije i raspored (čisto) | `lib/admin-v2/reveal/registry.ts` |
| kada se ulaz igra (čisto) | `lib/admin-v2/reveal/gate.ts` |
| jedna poseta stranice: vremenska linija, `ScrollTrigger`, `SplitText`, `DrawSVG`, brojanje | `components/admin/reveal/reveal-engine.ts` |
| hook korena (ekran je koren engine-a) | `components/admin/reveal/admin-reveal-root.tsx`, `components/admin/frame/admin-screen.tsx` |
| za komponentu koja sama crta (scena) | `components/admin/reveal/use-admin-reveal.ts` → `{ mode, firstVisit, enteredAt }` |
| jedina registracija GSAP plugina | `components/admin/reveal/gsap-plugins.ts` |

**Atributi.** Atribut je `data-admin-reveal` (`data-reveal` pripada sajtu i koren admina ga gasi).

| Atribut | Vrednosti | Šta radi |
|---|---|---|
| `data-admin-reveal` | `title`, `text`, `kpi`, `card`, `chart`, `rows`, `media`; `off` isključuje | koreografija bloka |
| `data-admin-draw` | `bars`, `cells`, `funnel`, `ring`, `line` | crtanje marke grafikona |
| `data-admin-bar="x\|y"`, `data-admin-cell` | — | traka koja raste od baze; ćelija u talasu |
| `data-admin-count` | — | broj koji pri punom ulazu broji od nule |
| `data-admin-tilt`, `data-admin-magnet` | — | materijal (§12.4) |

Deljeni primitivi ih već nose (`AdminPageHeader`, `AdminPanel`, `AdminDataView`, `AdminKpiRow`, `ChartFrame`, `HBar`, `StackedBar`, `MiniBars`, `AdminMissionRing`), pa stranica sastavljena od njih ulazi sama. Ručno se dodaje samo tamo gde stranica ne koristi primitiv:

```tsx
<div data-admin-reveal="kpi" data-admin-tilt="">
  <dt>Skenovi</dt>
  <dd data-admin-count="">179</dd>
</div>
<ul data-admin-reveal="rows">…</ul>
<div data-admin-draw="bars"><span data-admin-bar="x" /></div>
```

**Skener.** Redosled ulaza je položaj na ekranu, a ne spisak grupa: zelena linija pređe ekran od vrha do dna (oko 0,5 s) i pali ono preko čega prođe. Naslov izlazi iz maske po redovima, pločice se otvaraju i broje od nule, kartice se dižu, grafikoni se crtaju, prvih 12 redova liste ulazi kaskadom (na telefonu 8), ostali odmah. Na 900 ms sve stoji.

**Kada se igra** (`revealMode`):

| Okolnost | Režim |
|---|---|
| prvi ulazak na rutu u sesiji, i ponovo posle 20 minuta | `full` (do 900 ms) |
| ruta sa punim ulazom u poslednjih 20 minuta; Back i Forward | `short` (do 360 ms) |
| reduced motion, tihi režim, skriven tab, stranica koju je nacrtao server | `none` (konačno stanje odmah) |

**Pravila:**
- Skriveno početno stanje postavlja engine u `useLayoutEffect`, tek posle `revealMode()`. **Nijedno CSS pravilo ne sme da cilja `data-admin-*` atribute otkrivanja.**
- Na kraju svake koreografije ide `clearProps`: na elementu ne ostaje `transform`, `opacity` ni `clip-path`.
- `SplitText` deli privremenu kopiju naslova, nikad čvor koji poseduje React.
- **Polling ne ponavlja ulaz.** Prvo čitanje jednog mesta stranice dobija svoju koreografiju i kad stigne kasno (`lateReveal`); kasnije čitanje istog mesta i čitanje posle filtera samo se pretapa.
- Kartice ispod prvog ekrana se otkrivaju na skrol, jednom (`ScrollTrigger.batch`, skroler je `main[data-admin-frame="screen"]`).
- **Sadržaj nikad ne zavisi od okidača.** Uz `ScrollTrigger` rade `IntersectionObserver`, `beforeprint` i osigurač 30 s posle navigacije (`ADMIN_REVEAL.fuse`). Greška bilo gde u poseti završava posetu sa svim u konačnom stanju.
- Broj koji je link se ne sakriva od čitača dok broji; link nosi `aria-label` sa konačnom vrednošću.
- **Živi red:** red koji stigne dok je stranica otvorena ulazi sa zelenom levom ivicom koja gasne 1,2 s; više redova odjednom ulazi bez ivice.

### 12.3 Prelaz između stranica

Okvir stoji. Na klik na link ka drugoj admin putanji (i na „G pa slovo“) stara stranica se **priguši, ne sakrije**: `opacity 0,55` i `scale 0,992` za 140 ms. Kad se putanja promeni, kreće ulaz nove. Ako se putanja ne promeni za 400 ms, sadržaj se vraća. Promena filtera (upit u URL-u) nije prelaz.

### 12.4 Materijal

`components/admin/reveal/admin-material.ts`: jedan delegirani `pointermove` kroz `requestAnimationFrame`.

| Šta | Pravilo |
|---|---|
| **Svetlo za kursorom** | **Uklonjeno (2026-10-13).** Kružnog svetla koje prati kursor preko panela i tabela više nema: nema sloja `.admin-glow`, atributa `data-admin-glow` ni tokena `--admin-glow-strength`. Ne vraćati ga. |
| **Magnet** | glavno dugme u zaglavlju stranice i `[data-admin-magnet]`, najviše 6 px |
| **Nagib** | `[data-admin-tilt]` (KPI pločice), najviše 3° |
| **Shimmer** | skeleton (`AdminLoadingState`), 1,4 s; sadržaj koji ga zameni ulazi svojom koreografijom |

Samo uz `(hover: hover) and (pointer: fine)`; nikad uz reduced motion ni u tihom režimu. Na telefonu materijala nema.

### 12.5 Puls sistema i živa ivica

| Šta | Gde |
|---|---|
| događaj → otkucaj (čisto) | `lib/admin-v2/pulse.ts` |
| canvas 2D na donjoj ivici navbara | `components/admin/frame/admin-pulse.tsx` |
| izvori | `components/admin/frame/admin-pulse-feed.tsx` |

- Otkucaj daje samo pravi događaj: sken, lead, nova stavka, nova hitna, promena, rešeno. Boja i amplituda zavise od vrste. Ravna linija znači miran sistem.
- **Izvor su podaci koje admin već čita** (HUD, brojevi „Za reakciju“, dnevnik akcija). Za Puls se ne pravi nov upit.
- Prvo čitanje je stanje, ne vest: ne daje otkucaj.
- Crta najviše 30 puta u sekundi i samo dok na liniji ima otkucaja; na skrivenom tabu ne crta.
- Canvas je `aria-hidden`, uz `sr-only` rečenicu.
- **Živa ivica:** Puls piše `--admin-energy` (0–1) na koren okvira; prsten od 1 px oko ekrana i traka uz gornju ivicu (samo tamna tema) su zeleniji što je više događaja. To je zamena za šejdersku auru preko celog ekrana, koja se ne pravi.

**Zelena `#6FC05D` je energija:** svetli tamo gde se nešto upravo dešava (Puls, ivica, čestice, komet, živi red). Na svetloj temi ispuna u zelenoj ide kroz `--admin-energy-ink`, da ostane iznad 3:1.

## 13. 3D kit

`components/admin/three/` (kod koji uvozi `three`) i `lib/admin-v2/three/` (čiste funkcije bez `three`).

| Fajl | Šta je |
|---|---|
| `admin-stage.tsx` | React strana: lenji uvoz, 2D rezerva, tekstualni ekvivalent, čišćenje. Ne uvozi `three`. |
| `stage.ts` | jedan renderer, petlja, pauza, tema, regulator kvaliteta, `track` i `dispose` |
| `post.ts`, `picking.ts`, `particles.ts` | bloom, jedan obrazac za hover i klik, čestice |
| `scenes/*.ts` | scena: `create(stage, props, run) → { update, project, dispose }` |
| `lib/admin-v2/three/{quality,budget,loop,theme,start,exclusive,ignite}.ts` | izbor kvaliteta, budžeti, kada se crta, tema, start, ekskluzivne scene, paljenje |

Primer (Sazvežđe, `components/admin/dashboard/constellation.tsx`):

```tsx
<AdminStage
  load={() => import("@/components/admin/three/scenes/constellation-scene")}
  sceneProps={sceneProps}
  flatBelow={768}
  ignite
  summary={<ConstellationSummary counts={counts} />}
  fallback={<Constellation2D layout={layout} onPick={pick} />}
/>
```

### 13.1 Kad 3D

3D ulazi samo kad dimenzija nosi podatak koji 2D ne može da pokaže u istoj slici, i kad klik na ono što se vidi vodi na zapis iza njega. U adminu su to tri mesta:

| Momenat | Šta nosi treća dimenzija | Gde |
|---|---|---|
| **Sazvežđe** (Dashboard) | udaljenost od jezgra je hitnost; prsten oko jezgra je zaostatak (šef dana) | `components/admin/dashboard/`, `lib/admin-v2/constellation/` |
| **Živa hala i Vremeplov** (Analitika, isečak na Pregledu) | visina stuba je broj skenova, sloj je sat, boja je gužva | `components/admin/events/analytics/heat-map*.tsx`, `lib/admin-v2/hall/` |
| **Vitrina** | materijal medalje je retkost značke | `components/admin/game/vitrina.tsx`, `scenes/medal-scene.ts` |

Ne pravi se: 3D kao dekoracija, ceo-ekranski WebGL iza teksta, WebGL kontekst za trenutak kraći od par sekundi (ceremonija zato crta 2D medalju).

### 13.2 Budžeti

| Šta | Granica |
|---|---|
| `three` u početnom bundle-u | **nikad.** Vrednost `three` uvoze samo `stage.ts`, `post.ts`, `picking.ts`, `particles.ts` i `scenes/*`; čuva `lib/admin-v2/three/import-boundary.test.ts`, a build se meri po ruti |
| Lenji chunk-ovi sa `three` | ukupno do 300 kB gzip |
| Start scene | tek kad je domaćin blizu ekrana, pregledač miran (`requestIdleCallback`) i prošla 1 s od navigacije (`ADMIN_STAGE_MOTION.startAfter`). Scena koju pali Skener (`ignite`) sme od 0,35 s; ako ne stigne za 2,5 s, 2D slika ostaje u punoj snazi. Proba WebGL-a ide tek pred start, nikad uz 2D. |
| DPR | najviše 1,5 (`high`) ili 1,25 (`low`); tvrda granica 2 |
| Ambijentalna petlja | najviše 30 fps; frejm na zahtev (hover, podatak, tema) crta se odmah |
| Čestice | 600 na `high`, 150 na `low`, 0 na `off`; višak se ne emituje |
| WebGL konteksti | najviše 2 u kartici; ekskluzivna scena (dijalog) pauzira ostale |
| Bloom | samo u tamnoj temi na `high`; u svetloj temi ga nema |
| Kvalitet | regulator meri frejmove i trajno spušta `high` na `low`; pauza (skriven tab) nije spor frejm |

**Pauza:** crta se samo kad je tab vidljiv i domaćin u ekranu. Scena bez ambijenta ne crta nijedan frejm dok se nešto ne promeni.

**Čišćenje:** sve što scena napravi ide kroz `stage.track(…)`; `dispose` je u `try/finally` i oslobađa resurse, renderer, kontekst i platno. Test čuva da nijedan GPU resurs scene ne zaobiđe `track`.

**Tema iz tokena:** boje se čitaju iz CSS promenljivih (`parseCssColor`), pozadina scene je boja površine, mešanje je aditivno samo u tamnoj temi.

### 13.3 Rezerva

Kad WebGL ne radi, kad je uređaj slab, kad se izgubi kontekst, kad chunk ne stigne ili kad scena baci grešku (i u `update` i u frejmu), ostaje ili se vraća **prava 2D slika istih podataka**, sa istim klikom.

- Dok se scena ne učita stoji 2D slika, ne skeleton; server i prikaz bez JavaScript-a šalju 2D.
- Ispod 768 px širine prozora ide 2D.
- Korisnik uvek ima izbor: „Sazvežđe / Samo lista“, „2D | 3D“; izbor se pamti u pregledaču.
- Kad 3D ne može da radi, piše zašto, jednom rečenicom.

### 13.4 Dostupnost

- **Svaka scena ima tekstualni ekvivalent:** `sr-only` rečenicu sa brojevima (`summary`) i listu ili tabelu istih podataka (lista „Za reakciju“, rang štandova i „Prikaži kao tabelu“, mreža znački).
- Platno i 2D slika su `aria-hidden` i nemaju tab stop. **Put tastature je lista**, ne scena.
- Hover u sceni kaže isto što i red liste; klik radi isto što i glavna akcija reda.
- Kamera sa uvodom: uvod traje najviše 1,6 s i prekida ga svaki pritisak, točkić ili taster.
- Običan točkić skroluje stranicu; zum je Ctrl i točkić ili dva prsta.
- Na dodir se bira najbliža meta u dometu od 44 px.
- Tekst u sceni se ne pomera: oznake su DOM preko platna i sklanjaju se dok se scena kreće.

## 14. Gamifikacija v3

Zamenjuje zabrane iz §6. Model je u `lib/admin-v2/game/` (čiste funkcije), prikaz u `components/admin/game/`. Jedan čist reduktor (`engine.ts`) računa sve; React strana ga hrani i pušta efekte. Isti motor radi u adminu i u `/dev/admin-igra-preview`, pa je preview dokaz ponašanja, a ne slika.

### 14.1 Mehanike

| Mehanika | Pravilo | Gde |
|---|---|---|
| **XP** | daje ga red serverskog dnevnika admin akcija; tabela vrednosti je jedan fajl. Jeftine akcije imaju pravilo ponavljanja i dnevnu granicu (`XP_DAILY_MAX`); poništena akcija vraća XP. | `xp.ts`, `xp-chip.tsx`, `operator-row.tsx` |
| **Nivoi i rangovi** | XP za nivo n je `50 × (n − 1) × n`. Pripravnik (1–5), Operater (6–10), Dispečer (11–15), Komandant (16–20), Legenda (21+). | `levels.ts` |
| **Niz dana** | dan se upisuje kad imam bar jednu akciju koja nosi XP i kad je „Hitno“ tog dana viđeno na nuli (ili je šef pao). Broje se radni dani; vikend ne prekida. Prekinut niz se prikazuje kao prekinut. | `streak.ts`, `streak-flame.tsx` |
| **Kombo** | akcije sa razmakom do 120 s: treća i četvrta ×2, od pete ×3. Dodatak je najviše 200 XP dnevno. | `combo.ts`, `combo-meter.tsx` |
| **Šef dana** | zdravlje je zaostatak: `3 × hitno + 2 × čeka odgovor + 1 × danas`. Moja rešena stavka je udarac sa brojem štete; tuđi pad piše „· tim“. Novi zaostatak vraća zdravlje. | `boss.ts`, `boss-bar.tsx` |
| **Značke** | 20 (16 ličnih, 4 sajamske), četiri retkosti, datum osvajanja; sve iz dnevnika ili lokalne knjige. Zaključana značka je silueta sa uslovom i napretkom. | `badges.ts`, `vitrina.tsx` |
| **Tabela tima** | nedeljni XP po članu po istim pravilima za sve, medalje i promena mesta. | `team.ts`, `team-board.tsx` |
| **Sajamske misije** | pre sajma mapa misija (čvor je zaključan, u toku ili upaljen); tokom sajma dnevni izazovi sa napretkom iz svakog čitanja. | `fair-missions.ts`, `fair-chain.tsx`, `fair-challenges.tsx` |
| **Lanac uzroka** | XP koji je moja akcija donela je jedan let: od rešene stavke do trake šefa, pa u XP čip. | `spark.ts`, `cause-chain.tsx` |
| **Ceremonije** | §14.2 | `ceremonies.ts`, `ceremony-layer.tsx` |

Primer pravila XP-a (`lib/admin-v2/game/xp.ts`; ključ je `action` reda dnevnika, sve što nije navedeno nosi 0 XP):

```ts
admin_v1_problem_resolved: rule("resena_stavka", 30, true, EVERY),
admin_v1_task_completed: rule("zavrsen_zadatak", 25, true, perHref(24 * HOUR_MS)),
```

**Izvor istine.** Igra čita samo postojeće upite i ne menja šemu. Serversko je sve što se može izvesti iz dnevnika akcija (XP, nivo, kombo, tabela tima). Lokalno (`localStorage`, uvek u `try/catch`, pokvaren zapis se odbacuje) je samo ono što server ne pamti kroz vreme: knjiga dana, datumi znački koje su trenutak, šta je već proslavljeno. Zbir XP-a u pregledaču je keš: kad se obriše, izvodi se ponovo iz dnevnika.

### 14.2 Ceremonije

| Oblik | Kada | Trajanje |
|---|---|---|
| velika: medalja iz XP čipa u centar, prsten, čestice (canvas 2D), natpis | nivo, rang, šef, epska ili legendarna značka | 1,62 s |
| kartica uz XP čip | obična ili retka značka, rekord; na telefonu svaka | 1,20 s |

- **Preskače se** svakim tasterom ili klikom; događaj se ne zaustavlja, pa klik uradi i svoj posao.
- **Ne krade fokus:** sloj nema pokazivač ni tab stop i skriven je od čitača; jedna rečenica je najavljuje preko `aria-live="polite"`.
- **Dok je fokus u polju, dok je otvoren dijalog ili je tab skriven** ceremonija je jedan miran toast. To se proverava pre svake ceremonije u redu, ne samo pre prve.
- Najviše **dve zaredom**; ostatak je jedan red „I još N“.
- Medalja u ceremoniji je uvek 2D; 3D medalja je u Vitrini.
- Tihi režim i reduced motion: §15.

### 14.3 Šta je pošteno

Dopunjuje „Poštenje je deo pravila“ iz §6.

- **Prvo čitanje je stanje, ne vest.** Nivo dostignut na drugom uređaju, značka koju pregledač već zna i prvi brojevi zaostatka ne daju ceremoniju ni iskru; samo ono što se desi dok je admin otvoren.
- **Nijedna značka ne nastaje bez rada.** Šef je timski, a ceremoniju i značke šefa dobija samo onaj ko je tog dana imao bar jednu akciju koja nosi XP.
- **Odlaganje nije pobeda.** Zaostatak koji je na nuli samo zato što je odložen ne daje ni ceremoniju ni značku.
- **Ograničenje piše na ekranu.** Šta se vodi samo na ovom uređaju (niz, najveći zaostatak dana, lokalne značke) kaže se tamo gde se prikazuje. Ograničeno čitanje piše „najmanje N“ i „200+“, ne tačan broj.
- **Nepoznato nije nula.** Član čiji dnevnik nije pročitan ne postaje „0 XP“; tabela zadržava ono što je imala, a nagrada koja od toga zavisi se ne dodeljuje.
- **Sajamska značka je vezana za događaj.** Završen događaj je ne daje; činjenica koja je već tačna pri otvaranju stranice se upiše bez ceremonije.
- **Jeftin XP ima granicu.** Akcija koja se može ponavljati bez posla ne sme da puni tabelu tima.
- **TEST podaci igre ne ulaze u pravi admin:** okvir uvozi samo `game-preview.ts` bez podataka; `game-fixtures.ts` uvoze samo dev rute.
- **Bez zvuka, bez maskote.** Šef je traka i prsten sa naslovom.

## 15. Tihi režim i reduced motion

Dva prekidača sa istim ishodom za pokret: sve je odmah u konačnom stanju, i ništa ne nedostaje.

| | Reduced motion (`prefers-reduced-motion`) | Tihi režim (meni profila; `lib/admin-v2/quiet-mode.ts`) |
|---|---|---|
| Ulaz stranice, Skener | ne igra se: kadar 0 je konačno stanje | isto |
| Prelaz stranice, materijal, shimmer | nema | nema |
| Puls i živa ivica | linija je ravna i stoji | isto |
| 3D scene | ista slika, mirna: bez uvoda, okretanja, pulsa i čestica; ne crta frejm dok se nešto ne promeni | isto |
| Vremeplov | premotavanje skače sat po sat | isto |
| Ceremonija | bez sloja i čestica; jedan toast | bez sloja; jedan toast za nivo, značku i šefa |
| Rekord sajma | toast | ništa (kao u v2) |
| Brojevi, napredak, XP, značke, traka šefa | ostaju | ostaju |

- **Tihi režim gasi i pokret**, ne samo proslave (to je promena prema v2). Tekst uz prekidač: „Bez pokreta, proslava i obaveštenja o rekordima. Brojevi i napredak ostaju.“
- Lični toast (nivo, značka, šef) prolazi i u tihom režimu, jer je informacija o operateru.
- Oba prekidača važe i kad se uključe dok stranica radi: scena se pokreće ponovo, mirna, a Puls sluša promenu sistemskog podešavanja.
- Novi pokret mora da prođe kroz `revealMode()` ili da sam pita za oba prekidača; test (`gate.test.ts`, `css-contract.test.ts`) čuva gating i to da je shimmer jedina beskonačna CSS animacija.
- Alat za snimke radi sa reduced motion: ono što vidi je ono što vidi korisnik sa tim podešavanjem.
