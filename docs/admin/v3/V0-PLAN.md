# V0: plan i kreativni pravac za Admin v3

Grana `codex/jovan-admin-v2-2026-10-11` @ `ce50f403`. Korak je samo čitao; nijedan fajl repoa nije menjan. Izvori: `ZADATAK-V3.md` (važi iznad v2), `ZADATAK.md`, uzorak podataka (naveden samo putanjom), `docs/admin/v2/IZVESTAJ.md`, `docs/admin/DASHBOARD-STANDARD.md`, `docs/admin/ADMIN-V2-ARHITEKTURA.md`, kod iz uputstva, dva Haiku inventara (pokret i gamifikacija; izvori podataka) i Sonnet kritika nacrta (art direktor i inženjer za performanse). Iz kritike je ugrađeno sve što se potvrdilo u kodu; spisak je u §9.3.

Važi bez izuzetka (ZADATAK-V3 §0): klik odgovara odmah, sadržaj ne zavisi od animacije, **bez zvuka**, svaki poen dolazi iz pravog rada.

## 0. Zatečeno: činjenice koje oblikuju plan

1. **`data-reveal` je zauzet.** Sajt ima svoj text-reveal (`constants/textRevealConfig.ts`), a koren admin okvira nosi `data-reveal="off"` (`components/admin/frame/admin-frame.tsx:81`). Admin engine koristi **`data-admin-reveal`**. Svaki admin portal sa tekstom nosi `className="admin-v1"` i `data-reveal="off"`.
2. **GSAP u adminu je samo core.** Nema nijednog plugina ni `registerPlugin`. `node_modules/gsap/` (3.15) ima `ScrollTrigger`, `SplitText`, `DrawSVGPlugin`, `Flip`, `CustomEase`. `@gsap/react` nije instaliran: ostaje `gsap.context`.
3. **Na pravom `/admin` sadržaj se montira posle hidratacije** (`AdminGuard` čeka `admin.me`), pa ulaz radi i pri tvrdom učitavanju, bez skrivanja u CSS-u. Dev preview crta fixtures na serveru: tamo se ulaz vidi pri klijentskoj navigaciji.
4. **Grafikoni su CSS trake i mreže.** Jedina SVG linija je grafikon Finansija (`components/admin/admin-finance.tsx:120-125`). Mete za DrawSVG su navedene tačno (§2.7).
5. **Server već vodi dnevnik admin akcija.** Svaka admin mutacija zove `writeAdminAudit` (`convex/lib/adminAudit.ts`), koja upisuje `adminAuditLog` i odmah projektuje red u `adminActivityRows` (`actorKey = "user:<id>"`, `action`, `occurredAt`, `href`). Postojeći admin upit **`adminActivity.list({ actorKey?, category?, paginationOpts })`** (`convex/adminActivity.ts:81`, do 50 redova po strani) to vraća. Zato su XP, kombo i tabela tima **serverski, bez novog upita i bez izmene šeme**. V4 ima samo `ui` putanje, pa nov upit za igru ne bi ni smeo da piše.
6. **Skenovi po štandu i satu ne stižu klijentu.** Brojači postoje (`scan_total:stand:<id>:<YYYY-MM-DD>T<HH>`), ali `getEventAnalytics.hours` vraća zbir svih štandova. Vremeplov traži **jedan nov upit samo za čitanje** (§5.2.4); V3 ima i `analitika` putanje. Ukupan brojač štanda (bez dana) uključuje i skenove pre otvaranja (`convex/lib/fairScans.ts:241`), pa se ne koristi.
7. **„Za reakciju“ nema ime klijenta.** `adminDashboard.reactions` vraća do 12 stavki sa opisom, vrstom, hitnošću, vremenom i `href`; `contextLabel` je uvek `null`. `counts.calm` su mirne **stavke** (bez roka i blokade), ne mirni klijenti.
8. **Stare granice pokreta proverava samo `lib/admin-v2/motion.test.ts`** (3 testa nad `ADMIN_DURATION`, `ADMIN_STAGGER_TOTAL`, `ADMIN_MOTION_MAX`).
9. **`AdminScreen` već animira ulaz stranice** (`admin-screen.tsx:29-40`, pretapanje 240 ms uz pomak 6 px). Engine ga zamenjuje; uz reduced motion i u tihom režimu ostaje pretapanje od 240 ms bez pomaka.
10. **Dozvoljene putanje** (`scripts/admin-v2/koraci.json`): V1, V2, V4 = `ui`; V3 = `ui` + `analitika`. `lib/i18n/types.ts` je van njih i svaka beleška koraka ga navodi sa razlogom (novi tekst mora imati ključ u `Dict` interfejsu). Koraci idu redom V1 → V2 → V3 → V4.

## 1. Kreativni pravac

**Pet rečenica.**
ScanMe admin je instrument tabla živog sistema: sve što se kreće je podatak, i klik na ono što se kreće vodi na zapis iza njega. ScanMe skenira, pa i admin „skenira“ svaku stranicu: zelena linija pređe ekran i pali ono preko čega prođe. Zelena `#6FC05D` je struja i svetli samo tamo gde se nešto upravo dešava, pa miran ekran bez zelene znači miran sistem. Vreme je materijal: Puls pokazuje poslednji minut, Sazvežđe koliko je nešto blizu roka, a Vremeplov slaže ceo sajamski dan u slojeve za 12 sekundi. Brzina ostaje svetinja: unos odgovara za najviše 250 ms, ulaz stranice traje najviše 900 ms i nikad ne blokira klik, a ceremonija traje najviše 1,8 s i nestaje na prvi taster.

**Šta je kliše, a šta novo.** Naslov iz maske, brojanje od nule, EKG linija, traka zdravlja i značke postoje u svakom „gaming dashboard“ šablonu. Sami po sebi ne bi doneli „ovo nisam video nigde“. Novo je pet stvari koje ih vezuju za podatke:
- **Skener** kao jedan princip ulaza (redosled paljenja je položaj na ekranu, a ne spisak grupa);
- **Sazvežđe sa prstenom zaostatka**, gde je orbita hitnost, a šef dana prsten oko jezgra;
- **lanac uzroka**: rešena stavka → trag zvezde → udarac u prsten → iskra u XP čip, jedan neprekinut let;
- **slojeviti stubovi** u hali: svaki sat je sloj, pa stub pokazuje i koliko i kada;
- **živi redovi**: red koji stigne dok radiš uđe sa zelenom ivicom, na svakoj listi.

### Potpisni momenti (8)

| # | Momenat | Gde | Šta korisnik vidi, po vremenu | Podaci |
|---|---|---|---|---|
| 1 | **Skener** | svaka stranica, prvi ulazak (i ponovo posle 20 min) | 0 ms: stara stranica se priguši (140 ms). 0–500 ms: zelena linija od 1,5 px ide od vrha do dna ekrana. Šta linija pređe, pali se: naslov izlazi iz maske, pločice sa brojevima se otvaraju sleva i broje od 0, kartice se dižu, grafikoni se crtaju, redovi ulaze redom. 900 ms: sve stoji, linija je nestala. Klik radi od prvog frejma. | podaci stranice |
| 2 | **Puls i živa ivica** | donja ivica navbara i ivica ekrana, sve stranice | Linija teče zdesna nalevo (60 s). Sken: mali zelen otkucaj. Rešena stavka: visok zelen. Nova: ćilibarni. Nova hitna: dupli crveni. Što je više događaja u minuti, ivica ekrana je zelenija. Bez događaja linija je ravna, a ivica siva. | HUD, brojevi „Za reakciju“, od V4 i moj dnevnik |
| 3 | **Sazvežđe sa prstenom zaostatka** | Dashboard, hero | 0–300 ms: jezgro se pali. 200–600 ms: orbite i crveni prsten oko jezgra (dužina = zdravlje šefa) se iscrtavaju. 400–900 ms: zvezde iskaču od unutrašnje orbite ka spoljnoj. Posle: orbite se sporo okreću, hitne pulsiraju. Hover na red liste crta liniju nišana do njegove zvezde. | `adminDashboard.reactions` |
| 4 | **Lanac uzroka i kombo** | Dashboard | Klik „Reši“: 0–900 ms zvezda spiralno odlazi u mirnu orbitu sa zelenim tragom; na 250 ms iskra iz nje udari u crveni prsten (prsten se skrati, iskoči broj štete); 400–1100 ms iskra leti u XP čip navbara i dopuni prsten nivoa. Treća rešena u 2 minuta: „×2“ sa prstenom koji se prazni 120 s. | moj dnevnik akcija, brojevi „Za reakciju“ |
| 5 | **Živa hala sa slojevima** | Događaji → Analitika (druga celina) i isečak na Pregledu | 0–1400 ms: kamera dolazi u izometrijski pogled, stubovi rastu od najbližeg ka najdaljem. Svaki stub je slojevit: sloj je jedan sat u boji gužve tog sata. Iz aktivnih štandova se dižu čestice; novi sken daje prsten i snop iz tog štanda. | `getEventAnalytics`, `getEventStandHours` |
| 6 | **Vremeplov** | ispod hale | „Premotaj dan“: sat kreće od 08:00, 12 s za ceo dan. Stubovi se zidaju sloj po sloj, rang štandova se preslaguje na svaki otkucaj sata (oko 0,9 s). Pauza i klizač rade u svakom trenutku. | `getEventStandHours` |
| 7 | **Ceremonija iz čipa i Vitrina** | preko ekrana; Vitrina iz XP čipa | Novi nivo: 0–380 ms 3D medalja izleće iz XP čipa u centar uz čestice, 380–1320 ms stoji i okreće se (holografski odsjaj), 1320–1620 ms vraća se u čip. Taster ili klik je preskače. U Vitrini se medalja okreće prevlačenjem. | XP iz dnevnika; pravila znački |
| 8 | **Živi red** | svaka lista | Red koji stigne dok je stranica otvorena: uđe odozgo (8 px, 240 ms) sa zelenom levom ivicom koja gasne 1,2 s; Puls u istom trenutku da otkucaj. | podaci liste |

**Šejderska aura se ne pravi.** Ceo-ekranski WebGL bi držao treći kontekst na svakoj stranici i sjaj bi išao preko teksta. Istu poruku nosi „živa ivica“ (§3.4): dva DOM elementa sa `opacity`, bez troška.

## 2. Reveal engine

### 2.1 Fajlovi

| Fajl | Šta je | Ko |
|---|---|---|
| `lib/admin-v2/motion.ts` | tokeni u tri sloja (§2.9) | vođa |
| `lib/admin-v2/reveal/registry.ts` | čisto: vrste, koreografije, `revealSchedule()`, `waveDelays()`, `countFrame()` | vođa |
| `lib/admin-v2/reveal/gate.ts` | čisto: `revealMode()`, ključ rute, dnevnik ulazaka | vođa |
| `components/admin/reveal/gsap-plugins.ts` | jedina registracija: `ScrollTrigger`, `SplitText`, `DrawSVGPlugin`, `CustomEase`, `Flip`; `CustomEase.create("adminIgnite", "0.05,0.7,0.1,1")` | vođa |
| `components/admin/reveal/admin-reveal-root.tsx` | orkestrator oko sadržaja stranice (u `AdminScreen`) | vođa |
| `components/admin/reveal/use-admin-reveal.ts` | hook `{ mode, firstVisit }` za komponente koje same crtaju (3D scene) | vođa |
| `components/admin/reveal/admin-material.ts` | svetlo za kursorom, magnet, nagib (jedan delegirani slušalac) | vođa |
| `components/admin/reveal/preview-delay.tsx` | dev: `?kasni=<ms>` drži skeleton pa pusti sadržaj (da se pretapanje vidi u kadru) | vođa |
| `app/globals.css` | CSS promenljive tokena, shimmer, linija skenera, sloj svetla | vođa |

Ne zovu se `ScrollTrigger.defaults()` ni `normalizeScroll` (sajt koristi isti plugin nad prozorom). Nema pinovanja.

### 2.2 API: atributi

Stranica samo označi elemente; engine radi ostalo.

| Atribut | Na čemu | Koreografija |
|---|---|---|
| `data-admin-reveal="title"` | blok naslova u `AdminPageHeader`; redovi su deca sa `data-admin-title-line` (nadnaslov, H1) | SplitText `type: "lines", mask: "lines"`, `yPercent 100 → 0`, 500 ms, 60 ms između redova (§2.7) |
| `data-admin-reveal="text"` | opis, uvodna rečenica, traka alata | `opacity 0 → 1`, `y 8 → 0`, 320 ms |
| `data-admin-reveal="kpi"` | pločica sa brojem | `clip-path: inset(0 100% 0 0) → inset(0)`, 420 ms `adminIgnite`; broj u njoj broji od 0 (600 ms) |
| `data-admin-reveal="card"` | panel (`AdminPanel` ga nosi sam) | `opacity 0 → 1`, `y 14 → 0`, `scale 0.985 → 1`, 400 ms `expo.out` |
| `data-admin-reveal="chart"` | `ChartFrame` (nosi ga sam) | kao `card`; marke po `data-admin-draw` |
| `data-admin-reveal="rows"` | **kontejner** redova (`tbody`, `ol`, `ul`, mreža kartica) | prvih 12 dece: `opacity 0 → 1`, `y 8 → 0`, 240 ms; ostala odmah. Kontejner se otkriva jednom. |
| `data-admin-reveal="media"` | domaćin canvasa | `opacity 0 → 1`, 300 ms; scena svoj uvod vodi sama |
| `data-admin-reveal-id="…"` | opciono | čvor sa istim ključem se u jednoj poseti otkriva jednom, i kad ga React ponovo montira |
| `data-admin-draw="bars"` | kontejner; trake su `[data-admin-bar="x|y"]` | `scaleX` ili `scaleY` od baze, 450 ms, 30 ms između |
| `data-admin-draw="cells"` | mreža dan × sat | talas od ćelije sa `data-peak`: kašnjenje = Čebiševljeva udaljenost × 18 ms, ceo talas najviše 500 ms; ćelija `opacity 0 → 1`, `scale 0.6 → 1`, 240 ms |
| `data-admin-draw="funnel"` | levak | koraci odozgo nadole, traka `scaleX 0 → 1` 450 ms, 80 ms između; procenat prelaza posle svoje trake |
| `data-admin-draw="ring"` | SVG prsten sa segmentima | SVG maska sa jednim krugom; DrawSVG na krugu maske `0 → 100 %`, 550 ms (segmenti i njihov `stroke-dasharray` ostaju netaknuti) |
| `data-admin-draw="line"` | `path` ili `polyline` | DrawSVG `"0% 0%" → "0% 100%"`, 550 ms; površina ispod `opacity 0 → 1` u drugoj polovini |
| `data-admin-count` | element čiji je ceo tekst jedan broj; `[data-admin-odometer]` unutar `kpi` se računa sam | brojanje od 0, 600 ms `power2.out`, samo u režimu `full` |
| `data-admin-glow`, `data-admin-magnet`, `data-admin-tilt` | materijal (§2.8) | |

Ugnežđavanje: unutar `card` koji se otkriva, drugi `card` i `text` se ne animiraju posebno; `kpi`, `rows` i `data-admin-draw` da. `card` koji sadrži `[data-admin-primitive="loading"]` (skeleton) se ne otkriva: stoji odmah, sa shimmer-om.

**Brojanje od nule** radi nad tekstom, bez izmene komponenti. Čista funkcija `countFrame(finalText, progress)` nalazi jedini broj u tekstu („412“, „1.234“, „12 %“, „4,5“, „412+“), menja ga u međuvrednost u istom formatu i vraća tekst. Tekst sa dva broja („3/12“) se ne broji. Tokom brojanja element ima `aria-hidden`, pored njega je privremeni `sr-only` sa konačnim tekstom, a širina je zaključana (`min-width`). `AdminOdometer` se ne menja: polling i dalje okreće cifre kao u v2.

### 2.3 Skener: raspored po položaju

Redosled paljenja nije spisak grupa nego položaj. Čista funkcija `revealSchedule(items, viewport, opts)`:

```
start    = 0.50 × clamp(top / H, 0, 1) + 0.08 × clamp(left / W, 0, 1)      // sekunde; H, W = vidljivi deo ekrana
duration = min(token vrste, budget − start)                                 // budget = 0.9
```

- Najveći mogući početak je 0,58 s, pa svakoj vrsti ostaje bar 0,32 s; sve završava do 0,90 s (test, §8.1).
- Red liste ulazi po svom položaju; za 12 redova visine 52 px to je kaskada od oko 30 ms po redu. Radni sadržaj pri vrhu zato dolazi prvi (prvi red liste kreće oko 0,10 s).
- **Linija skenera:** jedan element 1,5 px (`--admin-nav-line`, trag od 16 px na 25 %), `translateY 0 → H` za 500 ms linearno, zatim `opacity → 0` za 120 ms. Samo u režimu `full`. `pointer-events: none`, `aria-hidden`.
- Telefon: `start = 0.375 × top / H`, trajanja × 0,75, budžet 675 ms, 8 redova.
- Povratni ulaz (`short`): bez linije; naslov iz maske 320 ms; ostalo `opacity 0 → 1` 180 ms sa `start = 0.12 × top / H`; ukupno do 360 ms; bez brojanja i bez crtanja grafikona.

### 2.4 Orkestrator

`AdminRevealRoot` stoji u `AdminScreen` oko `[data-admin-page]` i zamenjuje postojeće pretapanje (`admin-screen.tsx:29-40`).

1. **Skeniranje.** U `useLayoutEffect` posle montiranja stranice i u `MutationObserver`-u (`childList`, `subtree`). Povratni poziv posmatrača je mikrozadatak, pa se početno stanje postavi pre sledećeg crtanja. Engine obeležava sopstvene privremene čvorove (`data-admin-reveal-ghost`) i ignoriše mutacije koje je sam napravio.
2. **Iznad praga** (`top < 0.92 × H`): čvor ulazi u ulaznu vremensku liniju po `revealSchedule`.
3. **Ispod praga:** `ScrollTrigger.batch(čvorovi, { scroller: main[data-admin-frame="screen"], start: "top 92%", once: true, interval: 0.08, batchMax: 6 })`; grupa ulazi sa 60 ms razmaka, cela za najviše 500 ms. Isti prag (92 %) u oba puta: nema čvora koji ne pripada nijednom.
4. **Kasni sadržaj** (upit stigne posle početka ulaza): čvor dobija svoju koreografiju odmah; ne produžava ulaz stranice.
5. **Posle ulaza.** Prozor ulaza je 1.200 ms od navigacije. Posle njega novi čvor se otkriva samo ako zamenjuje skeleton (u istom roditelju je upravo uklonjen `[data-admin-primitive="loading"]`): pretapanje 180 ms. Polling i filtriranje tako nikad ne ponavljaju ulaz.
6. **Sudar sa FLIP-om iz v2.** Ako se lista promeni dok njena kaskada traje (filter u prvih 1.200 ms), engine tu kaskadu odmah završi (`progress(1)`), pa FLIP radi kao u v2.
7. **Skrol.** `ScrollTrigger.refresh()` sa odlaganjem 120 ms posle kasnog sadržaja i posle vraćanja pozicije pri Back-u (`AdminScreen` je vraća u `useEffect`, posle engine-a).
8. **Čišćenje.** Jedan `gsap.context` po poseti stranici; `revert()` pri promeni putanje i izlasku. `clearProps` na kraju svake koreografije (`transform`, `opacity`, `clip-path`), da ništa ne ostane na elementu.
9. **StrictMode.** Engine je idempotentan (montiranje, čišćenje, montiranje u dev-u). Ulazak se upisuje u dnevnik tek na `onComplete` ulazne linije.
10. **Živi red (momenat 8).** Posle prozora ulaza engine prati dodavanje dece u `rows` kontejnere. Red je „nov“ kad: čvor nije viđen (`WeakSet`), adresa (upit) se nije menjala 1.500 ms, lista nije bila prazna i u istom frejmu su stigla najviše 3 reda. Tada: `y −8 → 0`, `opacity 0 → 1`, 240 ms, i leva ivica od 2 px (`--admin-nav-line`) čiji `opacity` gasne 1,2 s. „Učitaj još“, filtriranje i sortiranje ne ispunjavaju uslov.

### 2.5 Gating

Čista funkcija `revealMode(input)`:

| Uslov | Režim | Šta se vidi |
|---|---|---|
| `prefers-reduced-motion: reduce` | `none` | sve u konačnom stanju; pri promeni stranice pretapanje 240 ms bez pomaka (v2) |
| tihi režim (`scanme.admin.quiet`) | `none` | isto; Puls i ivica stoje, ambijent stoji, ceremonija je miran toast |
| tab nije vidljiv | `none` | konačno stanje |
| čvor postoji u trenutku hidratacije | `none` za taj čvor | već nacrtan sadržaj se ne skriva |
| Back ili Forward | `short` | bez izlaza stare stranice |
| ruta je imala pun ulaz u poslednjih 20 minuta | `short` | do 360 ms |
| prvi ulazak na rutu u sesiji, ili je prošlo više od 20 minuta | `full` | Skener, do 900 ms |

- **Dnevnik:** `sessionStorage`, ključ `scanme.admin.reveal.v1`, JSON `{ [ključRute]: vremePunogUlaza }`, `try/catch`. Ključ rute je kanonska admin putanja iz `adminRoute()`; za Događaje bez sluga (`dogadjaji/analitika`).
- **Bez JavaScript-a** je sve vidljivo: nijedno CSS pravilo ne skriva sadržaj; početno stanje postavlja engine tek posle `revealMode()`.
- Alat runnera snima sa `reducedMotion: "reduce"` i vidi konačno stanje.
- Dev pomoć (samo kad `NODE_ENV !== "production"`): događaj `scanme:admin-reveal-replay` briše dnevnik i ponavlja ulaz; `window.__adminMotion = { gsap }` za skriptu kadrova.

### 2.6 Prelaz između stranica

Okvir, sidebar i navbar stoje (v2).

1. **Na klik** na `a[href]` koji vodi na drugu admin putanju (isti izvor, bez modifikatora i `target`; prečice „G pa slovo“ šalju isti signal): `[data-admin-page]` dobija `opacity 1 → 0.55`, `scale 1 → 0.992`, **140 ms** `power2.in`. Stranica se **ne sakriva do kraja**: App Router drži staru stranicu dok nova ne stigne, pa bi potpuno gašenje dalo prazan ekran.
2. Kad se `pathname` promeni, prigušenje se prekida (`clearProps`) i kreće ulaz nove stranice.
3. Ako se putanja ne promeni za 400 ms (link je otvorio dijalog, navigacija je otkazana), sadržaj se vraća za 180 ms.
4. Promena upita na istoj putanji (filteri) nije prelaz. Back i Forward nemaju izlaz.
5. Skrol na vrh i pamćenje pozicije za Back ostaju kako su u `AdminScreen`.

### 2.7 SplitText, DrawSVG, Flip, CustomEase: tačna mesta

- **SplitText** radi nad **privremenom kopijom** naslova, ne nad čvorom koji poseduje React. Naslov se nekad menja dok je stranica otvorena (profil klijenta: „Klijenti“ pa ime; inventar lokala). Postupak: pravi H1 dobija `visibility: hidden` (zadržava mesto), preko njega stoji `aria-hidden` kopija sa istim stilom i `data-admin-reveal-ghost`; kopija se deli (`SplitText.create(kopija, { type: "lines", mask: "lines" })`) i animira; na kraju se kopija briše, a pravi naslov prikazuje. Ako se tekst pravog naslova promeni dok kopija traje, kopija se odmah briše. Ako fontovi nisu učitani (`document.fonts.status !== "loaded"`), naslov ulazi kao jedan red bez deljenja. Dva reda (nadnaslov, H1) završavaju na 560 ms, tri na 620 ms. Isto za naslov ceremonije (V4).
- **DrawSVG:** (V1) linija grafikona Finansija (ako `vector-effect: non-scaling-stroke` pokvari dužinu, zamena je `clip-path` sleva nadesno nad grupom); krug maske prstenova (`ring`); kvačica u potvrdi misije i u punom prstenu misija. (V2) linija nišana i prsten zaostatka u 2D rezervi. (V3) staza klizača Vremeplova. (V4) veze između čvorova sajamske mape misija.
- **Flip (plugin):** let iskre i medalje do XP čipa (`Flip.fit`). Sopstveni FLIP redova iz v2 ostaje.
- **CustomEase:** jedna kriva, `adminIgnite`.

### 2.8 Materijal

Jedan delegirani `pointermove` na ekranu kroz `requestAnimationFrame`, samo uz `(hover: hover) and (pointer: fine)` i u režimima koji nisu `none`. Animiraju se samo `transform` i `opacity`.

| Efekat | Mete | Kako | Brojevi |
|---|---|---|---|
| Svetlo za kursorom | `[data-admin-glow]`: `AdminPanel`, `AdminTableScroll` | Primitiv crta prvi sloj `<span data-admin-glow-layer aria-hidden>`: `absolute inset-0`, `overflow: hidden`, ugao nasleđen, `z-index: -1`, bez pokazivača; domaćin dobija `relative` i `isolation: isolate`. Engine premešta **jedan** deljeni element svetla (360 × 360 px, gotov radijalni gradijent) u sloj panela pod kursorom i pomera ga sa `translate3d`. Drugi takav element stoji u sloju ivice (maska na 1 px prsten). Sadržaj panela se ne iseca. | podloga 9 % `--admin-accent` (svetla tema 6 %), ivica 45 %; pojava i gašenje `opacity` 120 ms |
| Magnet | `[data-admin-primitive="page-header"] .admin-button-primary`, `[data-admin-magnet]` | `gsap.quickTo(x, y)` ka kursoru u krugu od 40 px | najviše 6 px, 200 ms tamo, 180 ms nazad |
| Nagib | `[data-admin-tilt]`: unutrašnji omotač pločice sa brojem (ivice mreže stoje) | `rotateX`, `rotateY`, `perspective: 800px` | najviše 3°, 150 ms |
| Shimmer | `AdminLoadingState` (umesto `animate-pulse`) | traka ima `overflow: hidden`; unutra pseudo-element sa gradijentom, `translateX −100 % → 100 %` | 1,4 s linearno dok traje učitavanje; sadržaj se pretapa preko skeletona 180 ms |

Pritisak dugmeta ostaje CSS `scale: 0.98` (posebno svojstvo, ne sudara se sa GSAP `x`, `y`).

**Mehanike iz v2 dobijaju pokret:** prsten misija se dopunjava crtanjem (DrawSVG) kad se napredak promeni; kvačica potvrde se iscrtava; medalje ranga iskaču redom (`scale 0.6 → 1`, 30 ms između) u okviru svog `rows` ulaza; značka novog rekorda dobija jedan prelaz sjaja (600 ms) i od V4 ide u red ceremonija; tačka „Uživo“ u HUD-u trepne (`opacity`, 240 ms) samo kad Puls dobije otkucaj; posle tastera `G` pored pretrage u navbaru stoji čip „G …“ dok se čeka slovo (1,5 s), što rešava poznato ograničenje v2.

### 2.9 Tokeni (tri sloja) i stare granice

```ts
// lib/admin-v2/motion.ts
// Sloj 1 — interakcija. Vrednosti iz v2, NEPROMENJENE.
export const ADMIN_DURATION = { feedback: 0.12, state: 0.18, move: 0.24, frame: 0.32 } as const;
export const ADMIN_EASE = { out: "power3.out", in: "power2.in" } as const;
export const ADMIN_STAGGER_TOTAL = 0.07;
export const ADMIN_ENTER_OFFSET = 7;
export const ADMIN_PRESS_SCALE = 0.98;
export const ADMIN_PAGE_OFFSET = 6;
export const ADMIN_MOTION_MAX = 0.4;   // ostaje: granica sloja interakcija zajedno sa okvirom (fioka 320 ms)

// Novo
export const ADMIN_LAYER_MAX = { interakcija: 0.25, reveal: 0.9, ceremonija: 1.8 } as const;
export const ADMIN_REVEAL = {
  budget: 0.9, short: 0.36, scroll: 0.5, window: 1.2, rearmMs: 20 * 60_000, threshold: 0.92,
  exit: 0.14, exitOpacity: 0.55, exitScale: 0.992, exitBack: 0.4,
  sweepY: 0.5, sweepX: 0.08, scan: 0.5, scanFade: 0.12,
  title: 0.5, titleStagger: 0.06, titleShort: 0.32,
  text: 0.32, kpi: 0.42, count: 0.6, card: 0.4, offset: 14, media: 0.3,
  row: 0.24, rowsMax: 12,
  bar: 0.45, barStagger: 0.03, cell: 0.24, cellStep: 0.018, cellWave: 0.5,
  funnel: 0.45, funnelStagger: 0.08, ring: 0.55, line: 0.55,
  liveRow: 0.24, liveEdge: 1.2,
  phone: { scale: 0.75, sweepY: 0.375, rowsMax: 8 },
} as const;
export const ADMIN_REVEAL_EASE = { out: "expo.out", ignite: "adminIgnite", in: "power2.in" } as const;
export const ADMIN_CEREMONY = {
  big: { in: 0.38, hold: 0.94, out: 0.3 },        // 1.62 s
  compact: { in: 0.24, hold: 0.72, out: 0.24 },   // 1.20 s
  gap: 0.4, maxInRow: 2,
} as const;
export const ADMIN_AMBIENT_FPS = 30;
export const ADMIN_MATERIAL = { light: 360, magnetRadius: 40, magnetMax: 6, tiltMax: 3 } as const;
```

Isti brojevi kao CSS promenljive u `.admin-v1`: `--admin-reveal-exit: 140ms`, `--admin-reveal-budget: 900ms`, `--admin-ceremony-max: 1800ms`, `--admin-shimmer: 1400ms`.

**Stare granice i testovi.** Vrednosti sloja interakcija se ne menjaju, pa sva tri testa u `lib/admin-v2/motion.test.ts` ostaju tačna. Namerne izmene: naslov trećeg testa postaje „ništa u sloju interakcija nije duže od promene okvira“, i dodaju se testovi slojeva (§8.1). Granica od 250 ms važi za `feedback`, `state` i `move`; `frame` (320 ms, fioka) je zapisan izuzetak okvira. `ADMIN_MOTION_MAX`, `ADMIN_ENTER_OFFSET` i `ADMIN_STAGGER_TOTAL` više nisu granica za sve, nego samo za sloj interakcija: to piše u komentaru fajla i u belešci V1.

### 2.10 Koreografija po stranici

Redosled je odozgo nadole (Skener). Vremena su početak → kraj u ms za 1440 × 900 u režimu `full`; izvor istine je formula iz §2.3. „Skrol“ je otkrivanje na skrol, van budžeta ulaza (grupa do 500 ms).

| Stranica | Redosled i vremena | Ukupno |
|---|---|---|
| **Dashboard** | naslov sa datumom 20–580 · Sazvežđe `media` 70–370 (scena svoj uvod do 900) · legenda: 4 signala `kpi` 100–600, brojanje do 780, traka šefa `text` 160–480 · „Za reakciju“ `card` 300–700, redovi 330–760 · prstenovi (`ring`) 320–870 · Finansije, Zadaci, Inbox: skrol | 870 |
| **Klijenti** | naslov 20–580 · prekidač prikaza `text` 70–390 · `rows` 100–700 | 700 |
| **Profil klijenta** | naslov (ime) 20–580 · činjenice `kpi` 90–560 · odeljci `card` 180–820 · liste u odeljcima: skrol | 820 |
| **Inbox** | naslov 20–580 · lista razgovora `rows` 100–700 · otvoren razgovor `card` 130–530 | 700 |
| **Zadaci** | naslov 20–580 · `rows` 100–700 | 700 |
| **Proizvodi** | naslov 20–580 · lokali `rows` 100–700; inventar lokala isto | 700 |
| **QR kodovi** | naslov 20–580 · `rows` 100–700 | 700 |
| **Porudžbine** | naslov 20–580 · `rows` 100–700 · otvoren detalj `card` 130–530 | 700 |
| **Usluge** (Links, Review, Meni) | naslov 20–580 · `rows` 100–700 · panel „Izaberi lokal“ `card` 150–550 | 700 |
| **Događaji, lista** | naslov 20–580 · kartice događaja `card` 100–640 | 640 |
| **Događaji → Pregled** | naslov 20–580 · zaglavlje faze `card` 80–480 · „Šta treba da uradim“ `card` 180–580, stavke `rows` 220–640 · 6 brojeva `kpi` 200–780, brojanje do 900 · mapa misija, isečak hale i kartice sekcija: skrol | 900 |
| **Poveži nalepnicu** | naslov 20–580 · koraci `card` 90–620 · poslednje veze `rows` 300–760 | 760 |
| **Modeli, QR, Izlagači, Leadovi, Izveštaji, Interakcije, Sponzorisano, Brisanje, Import** | naslov 20–580 · uvod `text` 70–390 · `rows` 110–710 (u prikazu Kartice 12 kartica isto) | 710 |
| **Analitika** | naslov 20–580 · uvod `text` 70–390 · 4 broja `kpi` 110–640, brojanje do 820, mini trake `bars` 130–610 · 4 mirna zbira `text` 240–560 · hala `media` 330–630 (uvod kamere poseban, do 1,4 s) · Uvidi, levak `funnel`, dubina `bars`, dan × sat `cells` (talas 500), rang modela `rows`, štandovi `rows` + `bars`, paketi `bars`, uređaji `text`: skrol | 820 |
| **Finansije** | naslov 20–580 · činjenice `kpi` 100–570, brojanje do 760 · grafikon `line` 200–750 · tabela `rows` 380–840 | 840 |
| **Tim** | naslov 20–580 · tabela tima `rows` 100–560 · kartica člana `card` 280–680 · njegovi zadaci i razgovori `rows`: skrol | 680 |
| **Pretraga** | naslov 20–580 · polje i prikaz `text` 70–390 · rezultati `rows` 130–730 | 730 |
| **Podešavanja** | naslov 20–580 · odeljci `card` 90–760 (bez brojanja) | 760 |
| **Pošta** | naslov 20–580 · lista poruka `rows` 100–700 · otvorena poruka `card` 130–530 | 700 |
| **Greška u okviru, čuvar** | bez koreografije (stanje, ne stranica) | 0 |

Starije samostalne komponente (`location-admin.tsx`, `memories-admin.tsx`, `menu-admin-subpage.tsx`, `venue-admin.tsx`) nisu stranice navigacije: dobijaju samo ono što nose primitivi.

## 3. Puls sistema

**Fajlovi:** `lib/admin-v2/pulse.ts` (čisto), `components/admin/frame/admin-pulse.tsx` (canvas 2D), `components/admin/frame/admin-pulse-feed.tsx` (čitanje). Canvas se montira u `AdminNavbar` (`header` dobija `relative`): `absolute inset-x-0 bottom-0`, visina **20 px**, `pointer-events-none`, `aria-hidden`, iza linkova. Ispod `lg` isto, na donjoj ivici gornje trake.

### 3.1 Izvori

| Izvor | Gde postoji | Pretvaranje u događaje |
|---|---|---|
| HUD: `scansToday` (stranica događaja šalje `hud`, inače okvir čita `frameHud`) | sve stranice dok sajam traje | porast za Δ između dva čitanja → Δ događaja `sken`, raspoređenih ravnomerno na narednih 55 s (do sledećeg čitanja); najviše 24 otkucaja, preko toga 24 sa većom težinom |
| HUD: `leadsToday` | dok sajam traje | porast → `lead`. Polje danas ne postoji u `HudState` (`lib/admin-v2/hud.ts:89` šalje `null`); V1 proširuje `HudDashboard` i `HudState` čitanjem `kpis.leads?.newToday` iz istog odgovora |
| Brojevi „Za reakciju“: `counts.total`, `counts.urgent` | sve stranice | `urgent` raste → `hitno`; `total` raste → `novo`; `total` pada → `promena` (neutralno: pad može biti i odlaganje) |
| Moj dnevnik akcija (živa glava), od V4 | sve stranice | svaka moja akcija koja nosi XP → `rešeno`, odmah |

- **Zašto dodatno čitanje.** Van sajma i van Dashboard-a okvir ne čita ništa o poslu, pa Puls ne bi imao izvor. Okvir zato čita **postojeći** upit `adminDashboard.reactions({ scope: "all", now: <zaokruženo na 5 min>, limit: 1 })` kao živu pretplatu: oko 20 dokumenata po izvršenju (2 stavke, stanje projekcije, do 33 reda zbirova), izvršava se kad se promeni otvorena stavka. Novog upita nema.
- **Kašnjenje se kaže.** HUD se čita na 60 s, pa otkucaji skenova prikazuju prethodni minut. Opis linije to kaže. Interval se ne skraćuje (`getEventDashboard` je skup).
- `scansCapped` (delimičan broj): razlika nije poznata, pa nema otkucaja skenova; HUD već piše „412+“.
- `counts: null` (projekcija nije spremna): brojevi se preskaču; Puls radi iz ostalih izvora.
- Prvo čitanje je stanje, ne vest: bez otkucaja.

### 3.2 Otkucaj

`beatShape(kind, weight, theme)`:

| Vrsta | Boja, tamna tema | Boja, svetla tema | Osnovna amplituda | Oblik |
|---|---|---|---|---|
| `sken` | `--admin-nav-line` | `--admin-success` | 6 px | jedan šiljak |
| `rešeno` | `--admin-nav-line` | `--admin-success` | 10 px | šiljak; u tamnoj temi sa sjajem |
| `promena` | `--admin-text-muted` | isto | 4 px | nizak šiljak |
| `novo` | `--admin-warning` | isto | 7 px | šiljak |
| `hitno` | `--admin-danger` | isto | 9 px | dva šiljka na 10 px |
| `lead` | `--admin-chart-1` | isto | 9 px | šiljak |

- Amplituda `min(12, osnovna × (1 + log2(weight)))`, samo nagore. Osnovna linija je na donjoj ivici (1 px, `--admin-border`), otkucaj je linija od 1,5 px. Canvas od 20 px ostaje ispod teksta linkova; aktivna linija navbara (6 px od dna) ostaje gde jeste.
- Oblik: mali uspon (15 %), oštar vrh, mali odjek (25 %), povratak; širina 28 px.
- Prozor 60 s: `x = širina − (sada − vreme) × širina / 60 s`.
- Zelena `#6FC05D` na svetloj površini ima kontrast oko 2:1, pa svetla tema koristi tamniju `--admin-success`.

### 3.3 Crtanje i pauza

- `requestAnimationFrame` sa preskakanjem na 30 fps. Petlja radi **samo dok u prozoru postoji bar jedan otkucaj**; inače se nacrta ravna linija i petlja staje.
- Staje na skrivenom tabu, uz reduced motion i u tihom režimu: linija je ravna i stoji.
- DPR najviše 2; `ResizeObserver` za širinu; kružni bafer od 120 događaja.
- Čitač ekrana: canvas je skriven; pored je `sr-only` opis („Puls: linija prikazuje skenove i promene iz poslednjeg minuta; skenovi kasne do jednog čitanja. Isti brojevi su u HUD-u i na Dashboard-u.“). Nema žive najave.
- Dev: `?puls=demo` (čita ga sam Puls iz `window.location` u efektu, samo u dev-u) crta pet zamrznutih otkucaja, po jedan od svake vrste, na 15, 30, 50, 70 i 85 % širine. `?uzivo=<korak>` na Događajima daje pravi Δ iz fixtures.

### 3.4 Živa ivica

- `energy = min(1, događaji u poslednjih 60 s / 12)`; upisuje se kao `--admin-energy` na koren okvira najviše jednom u sekundi.
- Dva elementa nad ekranom (`lg+`, `pointer-events: none`, `aria-hidden`): prsten od 1 px po ivici ekrana u `--admin-nav-line` sa `opacity = energy × 0.55`, i traka od 24 px uz gornju ivicu (gradijent ka providnom) sa `opacity = energy × 0.18`, samo u tamnoj temi. Prelaz `opacity` 600 ms.
- Gornjih 24 px ekrana je razmak stranice, pa sjaj ne ide preko teksta.
- Istu vrednost čita jezgro Sazvežđa. Dev: `?energija=1`.

## 4. 3D kit

### 4.1 Fajlovi i API

| Fajl | Uvozi `three`? | Šta daje |
|---|---|---|
| `lib/admin-v2/three/quality.ts` | ne | `pickQuality(env) → "off" | "low" | "high"`, `qualityParams(q)` |
| `lib/admin-v2/three/budget.ts` | ne | `particleBudget(q)`, `clampEmit(traženo, živih, budžet)`, `nextQuality(prosekRazmakaMs, ciljMs, q)` |
| `lib/admin-v2/three/loop.ts` | ne | `shouldRender({ visible, inView, dirty, ambient, lastFrameAt, now, fps })` |
| `lib/admin-v2/three/theme.ts` | ne | imena tokena po ulozi, `bloomParams(theme, q)`, `blendMode(theme)` |
| `components/admin/three/admin-stage.tsx` | **ne** (samo `import type`) | `<AdminStage load={() => import("./scenes/…")} sceneProps fallback label summary onUnavailable />`: lenji uvoz, granica grešaka, skeleton iste visine, 2D rezerva, `sr-only` ekvivalent |
| `components/admin/three/stage.ts` | da | `createStage(host, opts): Stage | null` |
| `components/admin/three/post.ts` | da | `createComposer(stage)`: `RenderPass` → `UnrealBloomPass` (pola rezolucije) → `OutputPass` |
| `components/admin/three/picking.ts` | da | `createPicker(stage, { targets, idOf, onHover, onPick })` |
| `components/admin/three/particles.ts` | da | `createParticles(stage, { max })`: jedan `THREE.Points`, kružni bafer, kretanje u šejderu iz `uTime − aBirth` |
| `components/admin/three/scenes/*.ts` | da | `constellation-scene.ts` (V2), `hall-scene.ts` (V3), `medal-scene.ts` (V4); svaka izvozi `create(stage, props): { update(props), project(id), dispose() }` |

```ts
type Stage = {
  scene: THREE.Scene; renderer: THREE.WebGLRenderer; quality: "low" | "high"; theme: "light" | "dark";
  setCamera(camera: THREE.Camera): void;
  invalidate(): void;                 // jedan frejm na zahtev
  setAmbient(on: boolean): void;      // petlja na najviše 30 fps
  onFrame(fn: (dt: number, t: number) => void): () => void;
  onTheme(fn: (theme: "light" | "dark") => void): () => void;
  onResize(fn: (w: number, h: number) => void): () => void;
  track<T extends { dispose(): void }>(item: T): T;
  token(name: string, fallback: string): THREE.Color;
  frames: number;                     // za proveru budžeta
  dispose(): void;
};
```

### 4.2 Pravila

- **Lenji uvoz.** `three` kao vrednost uvoze samo `stage.ts`, `post.ts`, `picking.ts`, `particles.ts`, `scenes/**` i `heat-map-3d.tsx`. Njih sme da uveze samo drugi takav fajl ili dinamički `import()`.
- **Kad scena kreće.** `AdminStage` zove `import()` tek kad je domaćin blizu ekrana (`IntersectionObserver` sa `root: main[data-admin-frame="screen"]`, margina 300 px), **posle kraja ulaza stranice** (najranije 1.000 ms od navigacije) i kad pregledač miruje (`requestIdleCallback`; gde ga nema, `setTimeout` 200 ms). Šejderi se prevode sa `renderer.compileAsync(scene, camera)`, da prevođenje ne zakoči glavnu nit. Do tada stoji skeleton ili 2D rezerva iste visine.
- **Životni ciklus.** `createStage` u `try/catch` (bez WebGL-a vraća `null` → rezerva). `webglcontextlost` → `onUnavailable` → rezerva. `dispose()`: zaustavi petlju, otkači slušaoce i posmatrače, `dispose` svega iz `track()`, ciljeva i prolaza kompozitora, `renderer.dispose()`, `forceContextLoss()`, ukloni canvas.
- **Pauza.** Crta se samo kad je tab vidljiv i domaćin u ekranu. Bez ambijenta crta se na zahtev. Ambijent je najviše 30 fps. Scena u dijalogu (Vitrina, ceremonija) pauzira ostale preko registra scena u kitu. Najviše 2 aktivna konteksta.
- **Kvalitet** (`pickQuality`):

| Kvalitet | Kada | DPR | Bloom | Čestice | MSAA |
|---|---|---|---|---|---|
| `off` | nema WebGL-a; `hardwareConcurrency ≤ 2`; `saveData`; dva gubitka konteksta; korisnik izabrao 2D | — | — | — | — |
| `low` | širina domaćina ispod 768 px; do 4 jezgra; `deviceMemory ≤ 4`; softverski crtač (`WEBGL_debug_renderer_info`: SwiftShader, llvmpipe) | ≤ 1,25 | ne (sjaj kao sprajt) | 150 | ne |
| `high` | ostalo | ≤ 1,5 | da, u tamnoj temi, na pola rezolucije | 600 | 2 uzorka |

  ZADATAK dozvoljava DPR do 2; plan namerno staje na 1,5 jer su integrisane grafike česte, a razlika se na sceni ove veličine ne vidi.
- **Regulator.** Meri se razmak između frejmova koji su stvarno nacrtani, prema cilju (33,3 ms u ambijentu, 16,7 ms pri interakciji). Prosek preko 45 frejmova veći od cilja × 1,35 spušta `high` na `low` (bloom se gasi, čestice na pola). Tokom sesije se ne vraća.
- **Bloom po temi.** Tamna: `strength 0.85, radius 0.55, threshold 0.72`. Svetla: prolaz je isključen. `UnrealBloomPass` ne čuva providnost, pa scena briše pozadinu bojom površine domaćina (`--admin-surface-strong`), `renderer.toneMapping = NoToneMapping`, a domaćin ima `overflow: hidden` i svoj ugao. Skripta kadrova proverava da je piksel u uglu scene jednak boji domaćina.
- **Mešanje po temi.** Tamna: aditivno za tragove, oreole i snopove. Svetla: `NormalBlending` sa tamnijom, zasićenom bojom (aditivno na svetloj podlozi nestaje).
- **Tema iz tokena.** `stage.token("--admin-…")` čita izračunat stil; `MutationObserver` nad `html[data-theme]` javlja `onTheme`.
- **Jedan obrazac za hover i klik.** `createPicker`: `pointerdown` i `pointerup` sa pragom od 5 px (prevlačenje nije klik), hover kroz `requestAnimationFrame`, `InstancedMesh` preko `instanceId → id`.
- **Rezerva** je uvek prava komponenta sa istim podacima (2D SVG), ne poruka.

### 4.3 Kako se meri da `three` nije u početnom bundle-u

1. **Test granice uvoza** (`lib/admin-v2/three/import-boundary.test.ts`, čita izvore preko `node:fs` kao `lib/admin-v2/frame/titles.test.ts`): fajl koji uvozi `three` kao vrednost mora biti na dozvoljenom spisku; nijedan fajl van spiska ne uvozi te fajlove statički.
2. **Build.** Next 16 piše dev u `.next/dev`, pa `next build` sme da radi uz dev server runnera (`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`). Build pokreće **vođa V2** (radnici ne). Skripta `output/playwright/admin-v3/V2/bundle.mjs` čita manifest builda, za svaku admin i preview rutu uzima početne chunk-ove i u njima traži potpis `three` (`WebGLRenderer`). Očekivano: 0 pogodaka. Ispisuje veličinu lenjih chunk-ova sa `three`; budžet je **300 kB gzip** ukupno, a prekoračenje se zapisuje u belešku.
3. **Mreža u pregledaču** (ista skripta, dev server): za `/dev/admin-dashboard-preview` i `/dev/admin-events-preview/analitika` beleži sve JS zahteve; chunk sa potpisom `three` ne sme biti među skriptama iz početnog HTML-a ni `modulepreload`, i sme da krene tek posle `load`.

## 5. Tri velika 3D momenta

### 5.1 Sazvežđe (Dashboard)

**Podaci (postojeći upit).** `adminDashboard.reactions` sa `limit: 12` (najviše što upit dopušta; danas 8), pa lista i scena prikazuju isti skup. Stavka ima `action.causeId`, `actionItemId`, `severity`, `description`, `source.domain`, `relevantAt`, `assigneeId`, `resolutionRule`, `href`, `contextCode`. Brojevi: `counts.urgent`, `today`, `needsReply`, `waitingClient`, `calm`, `total`.

**Šta je zvezda** (`orbitLayout(items, counts, now)` u `lib/admin-v2/constellation/layout.ts`; tipove u `types.ts` piše vođa pre radnika):

| Orbita | Poluprečnik (× R) | Ko je na njoj | Boja | Pun krug za |
|---|---|---|---|---|
| jezgro | 0,11 | ScanMe | `#6FC05D`, jačina = energija (§3.4) | — |
| prsten zaostatka | 0,17 | šef dana: luk dužine `hp / hpMax` (§6.4) | `--admin-danger` | stoji |
| 1 „Hitno“ | 0,30 | stavke sa `severity = "blocking"` | `--admin-danger`, puls 1,2 s | 90 s |
| 2 „Danas“ | 0,52 | `severity = "warning"` | `--admin-warning` | 140 s |
| 3 „Čeka“ | 0,74 | ostale imenovane stavke | `--admin-text-muted` | 200 s |
| 4 „Mirno“ | 0,94 | `counts.calm` tačaka bez imena (najviše 60 nacrtanih): mirne stavke | `--admin-success`, prigušeno | 300 s |

- **Ugao** je stabilan po id-ju: `hash32(causeId) / 2³² × 2π`. Sudari na istoj orbiti se rešavaju determinističkim razmicanjem.
- **Veličina** je koliko dugo stavka čeka (`now − relevantAt`): do 1 h mala, do 24 h srednja, duže velika. Zadatak traži „aktivnost“, ali taj broj ne postoji u ovom čitanju (odluka, §9.1).
- **Višak.** Ako je `counts.urgent` veći od broja imenovanih hitnih, na orbiti 1 stoji zbirna zvezda „+N“ (hover: „Još N hitnih. Otvori listu.“; klik skroluje na listu). Isto za orbitu 2.
- **Promene** (`constellationDiff(prev, next)`): stavka nestala i `total` pao → `rešeno` (spirala do orbite 4 za 900 ms, +120° ugla, trag od 24 tačke koji gasne 600 ms); stavka nova → pada u orbitu (iz 1,3 R za 700 ms, `back.out(1.2)`, prsten pri dolasku); promena hitnosti → prelaz na drugu orbitu 500 ms. Prvo čitanje je stanje: uvod scene, bez padanja.
- `counts: null`: scena crta samo imenovane stavke; nema prstena zaostatka ni mirnih tačaka; legenda kaže da brojevi trenutno nisu dostupni.

**Scena.** Perspektivna kamera, FOV 35°, nagnuta 62° od vertikale (orbite su spljoštene elipse i staju u nisku scenu); paralaksa ±3° za kursorom na finom pokazivaču. Bez `OrbitControls` (prevlačenje bi se tuklo sa skrolom).
- Zvezde: jedan `InstancedMesh` kvadrata okrenutih kameri, `ShaderMaterial` (meki disk i oreol preko `smoothstep`), atributi po instanci: boja, veličina, faza, jačina pulsa. Jedan poziv crtanja.
- Tačke orbite 4: jedan `THREE.Points`.
- Orbite: `LineLoop` od 128 segmenata, providnost 0,32; orbita 4 isprekidana.
- Jezgro: sfera sa fresnel šejderom u zelenoj; bljesne na svaki `rešeno` otkucaj.
- Prsten zaostatka: luk (`TorusGeometry` sa uglom); skraćuje se 250 ms kad `hp` padne.
- Uz reduced motion ili tihi režim: bez okretanja i pulsa, statičan raspored.

**Interakcija.**
- Hover na zvezdu: ×1,35, prsten, okretanje staje dok hover traje (tekst se nikad ne pomera); DOM tooltip sa onim što piše u redu liste: opis (ili vrsta), kontekstni kod, „pre 2 sata“, „Hitno“ ili „Danas“, dodeljeno ili nedodeljeno.
- Klik na zvezdu radi isto što i primarna akcija reda: uz `resolutionRule = "manual_problem_resolution"` otvara isti dijalog „Reši“, inače vodi na `item.href`. Stanje dijaloga se podiže iz `ReactionRow` u `ReactionBundle`.
- **Nišan:** hover ili fokus na red liste ističe njegovu zvezdu i crta tanku liniju od reda do zvezde (SVG preko mreže Dashboard-a, DrawSVG 180 ms); hover na zvezdu ističe red. Samo fini pokazivač.
- **Lanac uzroka** (momenat 4; V2 daje trag, V4 udarac i let): scena izvozi `project(id) → { x, y }` (ekranska pozicija zvezde). Iskra je jedan DOM element (8 px, zelena, rep od 24 px) koji kreće sa te pozicije: do prstena zaostatka 250 ms, zatim `Flip.fit` do XP čipa 700 ms `expo.inOut`. Samo `transform` i `opacity`.
- Tastatura: novih tab stopova nema. Lista je tastaturni put; fokus na redu ističe zvezdu.

**Raspored.** Hero je prvi red, preko cele širine. Scena zauzima levu stranu; desno, u istom panelu, stoji legenda kao DOM tekst: rečenica sa brojem stavki, četiri signala sa odometrom (Hitno, Danas, Čeka klijenta, Mirno) i traka šefa dana (§6.4). Visina **20 rem** kad je prozor visok bar 900 px, inače **15 rem**. Lista „Za reakciju“ je odmah ispod. Prekidač „Sazvežđe | Samo lista“ u zaglavlju pamti izbor (`localStorage`, `scanme.admin.dashboard.hero`). **Uslov prijema:** na 1280 × 720 vide se bar 2 reda liste, na 1440 × 900 bar 3.

**Telefon i rezerva.** Ispod 768 px i kad je kvalitet `off`: `constellation-2d.tsx`, SVG iz iste `orbitLayout` funkcije, pogled odozgo, bez okretanja, visina 12 rem; dodir na zvezdu radi isto. Elementi su `aria-hidden` i van tab reda.

**Tekstualni ekvivalent.** `sr-only` rečenica („Sazvežđe: 3 hitne, 2 za danas, 5 čeka, 41 mirna stavka. Iste stavke su u listi Za reakciju ispod.“), brojevi legende kao tekst i sama lista.

**Fixtures.** Postojeći `components/admin/admin-dashboard-fixtures.ts`, dopunjen na 12 stavki (4 hitne, 4 za danas, 4 ostale) i 60 mirnih. Dev parametri na `/dev/admin-dashboard-preview`: `?sazvezdje=1` uklanja jednu hitnu (trag), `?sazvezdje=2` dodaje novu (pad u orbitu), `?nisan=<causeId>` drži liniju nišana bez miša. Prazno stanje: jezgro, mirne tačke i tekst „Nema stavki za reakciju“.

### 5.2 Živa hala i Vremeplov

#### 5.2.1 Hala

- `heat-map-3d.tsx` ostaje ulazna tačka (isti `default export` i props), a unutra prelazi na kit: `AdminStage` + `scenes/hall-scene.ts`. Štandovi ostaju izvučeni poligoni (nepravilni su; manje ih je od 40), ortografska izometrijska kamera, `OrbitControls` i oznake ostaju.
- **Slojeviti stubovi.** Kad su satni podaci učitani, stub je podeljen na slojeve: sloj je jedan sat, debljina je broj skenova tog sata, boja je toplotni nivo tog sata. Jedan mesh po štandu: `ShaderMaterial` bira sloj po visini fragmenta iz dva niza uniformi (do 16 granica, do 16 boja) i crta tanku tamnu liniju na granici. Bez satnih podataka (dok se ne učitaju) stub je jednobojan kao u v2. Tako 3D pokazuje ono što 2D ne može: i koliko, i kada.
- **Svetleći vrh:** gornja strana u punoj boji poslednjeg sloja (u tamnoj temi iznad praga bloom-a) i **snop**: uzan četvorougao iznad vrha, visina srazmerna aktivnosti poslednjeg sata (`heat.hour`).
- **Uvod kamere:** od azimuta −35° i zuma 0,82 do sačuvanog izometrijskog pogleda za **1,4 s** `power3.inOut`; stubovi rastu u prvih 900 ms, redom po udaljenosti od kamere. Preskače ga svaki `pointerdown`, točkić ili taster. Povratni ulazak: samo rast, 400 ms. Reduced motion i tihi režim: konačno stanje.
- **Podrazumevan prikaz:** 3D na širini domaćina od 768 px naviše kad kvalitet nije `off`; inače 2D. Izbor se pamti (`localStorage`, `scanme.admin.hall.view`). Dok se `three` učitava stoji 2D mapa iste visine.
- **Mesto na Analitici:** hala je **druga celina**, odmah posle brojeva, visine 24 rem; Uvidi su treći. Na dan sajma „Gde je gužva?“ je među prvim pitanjima, a hala se tako vidi na prvom ekranu. `lib/admin-v2/analytics/anchors.ts` prati redosled.
- **Pregled događaja:** dok sajamski dan traje, ispod „Šta treba da uradim“ stoji isečak hale (`hall-mini.tsx`, 16 rem, čestice, bez kontrola) sa linkom „Otvori Vremeplov“ na `analitika#mapa`. Čita `getEventAnalytics` samo dok je isečak u ekranu, na 60 s.

#### 5.2.2 Čestice skena

Čiste funkcije u `lib/admin-v2/hall/impulses.ts`:
- `scanImpulses(prev, next)`: razlika `scans.today` po `mapLocationId` između dva polla → `{ locationId, count }[]`. Prvo čitanje ne daje impulse.
- Impuls: po štandu najviše 12 čestica po pollu, raspoređenih na 8 s, plus prsten na vrhu (600 ms).
- Mirno stanje: stopa po štandu `0,8 čestica/s × (jedinstveni u poslednjem satu) / (najveći takav)`; štand bez skena u poslednjem satu ne emituje.
- Život čestice 2,4 s, diže se 0,12 širine hale i gasne.
- Budžet iz kita: 600 (`high`), 150 (`low`); `clampEmit` odbacuje višak, impulsi imaju prednost.
- Petlja radi samo dok je hala u ekranu i tab vidljiv, na 30 fps.

#### 5.2.3 Vremeplov

Čiste funkcije u `lib/admin-v2/hall/timelapse.ts` nad `StandHours = { hours: number[]; stands: { locationId, standCode, scans: number[], unique: number[] }[] }`:
- `cumulativeAt(stand, t)`: zbir skenova do trenutka `t` (sati od prvog sata, razlomljeno): celi sati plus linearni deo tekućeg.
- `heightsAt(t)`: kumulativ / najveći kumulativ na kraju dana. Skala se ne menja tokom premotavanja, pa stubovi rastu ka konačnoj visini bez skoka.
- `layersAt(stand, t)`: granice i boje slojeva do trenutka `t`.
- `levelsAt(t)`: toplotni nivo iz `unique` tog sata (`fairHeatLevel`, `fairHeatCap(..., "hour")` iz `lib/fair-heat.ts`), linearno između dva sata. Ista mera kao „Poslednji sat“.
- `rankAt(t)`: štandovi po kumulativu, izjednačeni po šifri.
- `playT(elapsedMs, hours)`: `t = min(H, elapsedMs / 12000 × H)`; `clockText(t)` → „14:20“.

**Kontrole** (ispod hale, rade i uz 2D mapu):
- izbor dana (segment, sajamski dani);
- klizač sata `<input type="range">` (korak 1 sat; strelice pomeraju sat, Home i End idu na početak i kraj);
- dugme „Premotaj dan“ / „Pauza“ (Space i Enter);
- veliki sat (`tabular-nums`);
- dugme „Uživo“ vraća živi prikaz.
- Tokom premotavanja brojevi i rang se osvežavaju 4 puta u sekundi (običan tekst, ne odometar po frejmu); rang se preslaguje FLIP-om iz v2. Na granici sata: otkucaj sata i kratak bljesak vrhova.
- Čestice u premotavanju: emisija po štandu srazmerna skenovima tog sata, u budžetu.
- Reduced motion i tihi režim: „Premotaj dan“ ne animira; klizač skače sat po sat.

**Mobilna verzija.** 2D mapa je podrazumevana. Vremeplov radi i tu: boje i brojevi po štandu prate klizač, premotavanje ide na 4 Hz. Mete 44 px.

**Tekstualni ekvivalent.** „Prikaži kao tabelu“: štandovi × sati za izabrani dan. Živa najava (`aria-live="polite"`) samo na pauzu i na pomeranje klizača: „14:00. Vodi štand TEST-A1, 57 skenova.“

#### 5.2.4 Novi upit: `fairEventAnalytics.getEventStandHours`

```ts
export const getEventStandHours = query({
  args: { eventId: v.id("fairEvents"), dateKey: v.string(), at: v.number() },
  returns: v.object({
    at: v.number(),
    dateKey: v.string(),
    hours: v.array(v.number()),                       // beogradski sati serije, rastuće
    stands: v.array(v.object({
      standCode: v.string(), mapLocationId: v.string(),
      scans: v.array(v.number()),                     // po satu, iste dužine kao hours
      uniquePerModel: v.array(v.number()),            // prazan niz kad nije čitan (budžet)
    })),
    unread: v.number(),                               // štandovi koji nisu stali u budžet
    capped: v.boolean(),
  }),
});
```

- **Samo čitanje, admin** (`requireAdmin`, `requireFairEvent`). Agregacija je `loadFairStandHours(ctx, input, caps)` u `convex/lib/fairEventAnalytics.ts`, sa granicama kao parametrom (test ih smanjuje).
- **Sati:** od `max(dan.startsAt + 8 h, cutoff)` dok je `< dan.endsAt` i `≤ at`, korak 1 h, najviše 16. Ista petlja kao `getEventAnalytics`, pa su pre-event i budući sati izostavljeni. Ključ sata je beogradski (`fairTimeKeys`).
- **Štandovi:** isti izbor kao `getEventAnalytics` (`scannedStands`): štandovi nedraft modela, najviše 150 modela (`MODELS_CAP`). Tako je zbir po satu jednak `getEventAnalytics.hours`.
- **Dnevni zbir štanda = zbir njegove satne serije.** Ukupan brojač štanda se ne čita (uključuje pre-event). Štand čiji je zbir serije nula se ne vraća.
- **Koraci i granice:**
  1. Predizbor, samo kad dan počinje posle `cutoff`-a: dnevni brojač po štandu (`scan_total:stand:<id>:<dateKey>`), 1 opseg po štandu, najviše 150. Štand sa nulom ispada, ostali idu po dnevnom zbiru opadajuće. Na dan otvaranja (kad je `cutoff` unutar dana) predizbora nema; štandovi idu po šifri.
  2. Satni `scan_total` za štandove redom dok ima budžeta: najviše **1.200 opsega** (75 štandova × 16 sati).
  3. Satni `scan_unique` za štandove sa skenom tog dana: najviše **800 opsega** (50 štandova × 16 sati); ostali dobijaju prazan `uniquePerModel` i boju iz skenova.
  4. Štandovi koji nisu stali broje se u `unread`, uz `capped: true`.
- **Procena čitanja:** najviše 150 + 1.200 + 800 = **2.150 opsega indeksa** (granica 4.096). Dokumenti: do 150 modela i štandova, plus šardovi brojača (do 8 po ključu): oko 17.200 + 300 = **do 17.500 dokumenata** u najgorem slučaju (granica 32.000). Sajam sa 4 štanda sa skenovima: ispod 150 opsega.
- **Kad se čita:** nije na tajmeru. Čita se kad se hala prvi put prikaže za današnji dan (zbog slojeva), kad se izabere dan i na „Premotaj dan“. Završen dan se pamti u memoriji stranice po `eventId:dateKey`.
- **Nepoznat `dateKey`:** prazan rezultat (`hours: []`), ne greška.
- **Testovi** (`convex/fairEventAnalyticsV3.test.ts`, po uzoru na `fairEventAnalyticsV2.test.ts`): prazan događaj; `at` pre otvaranja (nema sati); pre-event sken se ne broji i serija počinje u 08:00; **štand sa samo pre-event skenovima nije u rezultatu**; admin sken se ne broji; zahtev bez posetioca ne pravi brojač; beogradsko vreme (sken u 23:30 po Beogradu pripada tom danu; dan po zimskom vremenu, UTC+1, jer je ceo AMF posle prelaska 25. 10.); zbir po štandovima za svaki sat jednak je `getEventAnalytics.hours`; granice (`capped`, `unread`, prazan `uniquePerModel`); neadmin je odbijen; trošak (opsezi i dokumenti) izmeren u testu.
- `convex/fairAuthz.test.ts` (tabela zaštite) dobija novi upit: fajl je van dozvoljenih putanja, navodi se u belešci sa razlogom (kao u X3). Convex DEV: po pravilima lanca (`npx convex dev --once` samo ka DEV-u iz STANJE.md kad je funkcija dodata; push inače pušta runner i ne čeka se). „Delta za Aleksu“ ide u `docs/admin/v3/V3.md`.

**Fixtures.** `previewStandHours(dateKey)` u `components/admin/events/preview-analytics-fixtures.ts`: 4 TEST štanda (`test-loc-em-a1` … `d1`), sati 08–20, izmišljeni brojevi. Zbir po satu jednak je postojećem zbirnom nizu po satu iz fixtures, zbir po štandu dnevnom broju štanda iz fixtures (raspodela fiksnim težinama, ostatak najjačem); test to proverava. Dev parametri: `?vremeplov=<sat>` otvara Vremeplov na satu, `?vremeplov=auto` pokreće premotavanje, `?uzivo=auto` menja korak fixtures svake 3 s (čestice).

### 5.3 Vitrina

- **Mesto:** dijalog „Vitrina“ (Radix, `admin-v1`, `data-reveal="off"`, do 64 rem), otvara se klikom na XP čip, stavkom u meniju profila i prečicom `G V`. Nije nova ruta (navbar je pun).
- **Scena:** jedna scena sa **izabranom** medaljom (velika, okreće se prevlačenjem sa inercijom, naginje se ±8° za kursorom). Mreža svih znački je 2D (CSS medalje): jedan kontekst, jedan mesh.
- **Geometrija:** valjak (poluprečnik 1, debljina 0,12, 64 segmenta) sa zakošenim obodom (`LatheGeometry`). Znak značke je putanja nacrtana u 2D canvas (256 px) i korišćena kao tekstura reljefa; nema spoljnih fajlova.
- **Materijal** (`ShaderMaterial`, bez svetala; okolina je analitički gradijent):

| Retkost | Izgled | Šejder ukratko |
|---|---|---|
| obična | mat | difuzno + meka ivica, prigušena boja |
| retka | metal | odraz analitičkog neba preko `reflect(view, normal)`, oštar odsjaj; čelik, bronza ili zlato |
| epska | holo | iridescencija: nijansa iz `dot(normal, view)`, `uv` i nagiba kroz kosinusnu paletu, pomešana sa metalom po fresnelu; difrakcione pruge |
| legendarna | holo + sjaj | epska + iskre iz šuma u vremenu; u tamnoj temi iznad praga bloom-a; sporo okretanje |
| zaključana | tamna silueta | samo obod i oblik, bez reljefa; ispod stoji uslov |

- **Rezerva i telefon:** `medal-2d.tsx`, CSS medalja (konusni gradijent za holo), bez WebGL-a.
- **Tekstualni ekvivalent:** mreža je lista dugmadi sa punim nazivom: „Nula hitnih. Retka. Osvojena 12. 10. 2026.“ ili „Zaključano: Pet u nizu. Uslov: pet radnih dana zaredom sa upisanim danom.“ Scena je `aria-hidden`.

## 6. Gamifikacija v3

Osam novih mehanika: XP i nivo, niz dana, kombo, šef dana, značke sa Vitrinom, nedeljna tabela tima, sajamske misije sa dnevnim izazovima, ceremonije. Mehanike iz v2 ostaju i dobijaju pokret (§2.8).

### 6.1 Izvor istine

| Izvor | Šta daje | Kako se čita |
|---|---|---|
| **Dnevnik akcija (server)** `adminActivity.list({ actorKey: "user:<id>" })` | ko, šta (`action`), kada (`occurredAt`), na čemu (`href`) | moja glava: jedna živa pretplata u okviru (50 najnovijih redova; izvršava se samo kad ja nešto uradim); ostalo jednokratno (`convex.query`) |
| **Ko sam** `adminCommunications.me` | `id`, `name` | postojeći upit |
| **Zaostatak (server)** `adminDashboard.reactions.counts` | `urgent`, `needsReply`, `today`, `total` | okvir (§3.1) i Dashboard |
| **Tim** `adminTasks.listAdmins` | članovi | postojeći upit |
| **Sajam** `getEventDashboard`, `getEventAnalytics`, `getEventEngagement` | priprema i brojevi dana | postojeći polling |
| **Lokalni dnevnik** (`localStorage`, `try/catch`) | ono što server ne pamti kroz vreme: da li je „Hitno“ danas palo na 0, najveći zaostatak dana, datumi lokalno osvojenih znački, keš XP-a | ključevi u §6.9 |

Tipove (`ActivityRow`, `XpResult`, `DayRecord`, `BadgeInput`, `CeremonyEvent`) piše vođa u `lib/admin-v2/game/types.ts` pre prvog talasa radnika.

### 6.2 XP

**Tabela vrednosti** (`lib/admin-v2/game/xp.ts`; ključ je `action` iz dnevnika; svi nazivi su potvrđeni u kodu mutacija):

| `action` | Naziv u UI | XP | Kombo | Ponavljanje |
|---|---|---|---|---|
| `admin_v1_problem_resolved` | Rešena stavka | 30 | da | svaki red (stavka se ne može rešiti dvaput) |
| `admin_v1_task_completed` | Završen zadatak | 25 | da | isti zadatak (`href`) jednom u 24 h |
| `admin_order_delivery_completed` | Isporuka završena | 30 | da | svaki red |
| `admin_v1_conversation_reply_sent` | Poslat odgovor | 15 | da | isti razgovor (`href`) jednom u 10 min |
| `admin_order_payment_recorded` | Evidentirana uplata | 15 | da | isti red u 60 s se ne broji dvaput |
| `admin_order_design_approved` | Odobren dizajn | 15 | da | svaki red |
| `admin_order_quality_control_recorded` | Kontrola kvaliteta | 15 | da | svaki red |
| `admin_order_sent_to_printer` | Poslato u štampu | 10 | da | svaki red |
| `access_channel_changed`, `access_channels_bulk_changed` | Izmena QR ili NFC kanala | 10 | da | isti kanal (`href`) jednom u 24 h |
| `fair_qr_assigned`, `fair_qr_reassigned` | Povezana nalepnica | 10 | da | `fair_qr_link_undone` u roku od 5 min poništava poslednju |
| `digital_qr_linked` | Povezan digitalni QR | 10 | ne | svaki red |
| `admin_v1_manual_communication_logged` | Upisana komunikacija | 5 | ne | svaki red |
| `admin_v1_task_created` | Kreiran zadatak | 3 | ne | svaki red |
| sve ostalo (odlaganje, dodela, beleška, poništavanje, arhiva) | — | 0 | ne | — |

- Red čiji `actorKind` nije `admin` ne nosi XP.
- „Izmena QR ili NFC kanala“ se tako i zove: dnevnik ne kaže da li je izmena bila ispravka.
- Sve je u jednoj čistoj funkciji `xpRows(rows)`.

**Ukupan XP** je funkcija dnevnika. Pri prvom otvaranju na uređaju čita se do 20 strana (1.000 redova) unazad; rezultat se pamti kao snimak, a posle se dodaju samo novi redovi. Ako je istorija duža, ili ako stariji redovi nisu projektovani u dnevnik, piše „XP se računa od 3. 9. 2026.“

**Nivoi i rangovi** (`levels.ts`):
- XP potreban za nivo n: `xpZaNivo(n) = 50 × (n − 1) × n`.
- Obrnuto: `nivo(xp) = floor((1 + sqrt(1 + xp / 12,5)) / 2)`.

| Rang | Nivoi | XP na ulazu | Okvirno radnih dana (300–450 XP dnevno) |
|---|---|---|---|
| Pripravnik | 1–5 | 0 | — |
| Operater | 6–10 | 1.500 | 4–5 |
| Dispečer | 11–15 | 5.500 | 13–18 |
| Komandant | 16–20 | 12.000 | 27–40 |
| Legenda | 21+ | 21.000 | 47–70 |

### 6.3 Kombo

- Lanac čine akcije koje „ulaze u kombo“ sa razmakom do **120 s**.
- Množilac: 1. i 2. akcija ×1, 3. i 4. ×2, od 5. ×3. Razmak duži od 120 s prekida lanac.
- Dodatak iz komba je najviše **200 XP dnevno**.
- Računa se iz vremena na serveru (`occurredAt`), pa je isti na svakom uređaju.
- Prikaz: brojač se pojavi od 2. akcije („još 1 do ×2“), prsten se prazni 120 s (jedna animacija konačnog trajanja), gasi se pretapanjem.

### 6.4 Šef dana

- **Zdravlje:** `hp = 3 × urgent + 2 × needsReply + 1 × today` (brojevi obima „Sve“: šef je zajednički za tim).
- **Najveće zdravlje dana:** najveći `hp` viđen danas na ovom uređaju (lokalni dnevnik). Dužina = `hp / hpMax`.
- **Gde se vidi:** crveni prsten oko jezgra Sazvežđa i traka sa brojem u legendi hero-a (DOM, `role="progressbar"`). U 2D rezervi samo traka.
- **Udarac:** `hp` je pao između dva čitanja; broj štete je pad. Ako je u prethodnih 10 s u mom dnevniku akcija koja nosi XP, udarac je moj (iskra, broj štete, trzaj 250 ms); inače se traka samo skrati uz „tim“.
- **Odlaganje nije udarac:** ako je pad došao uz moj `admin_v1_action_snoozed`, traka se skrati bez štete i piše „Odloženo: vraća se kad istekne.“
- **Novi zaostatak:** `hp` raste → traka raste uz ćilibarni bljesak i „+N: novi zaostatak“; `hpMax` raste ako je premašen.
- **Poražen:** `hp = 0` uz `hpMax > 0` → ceremonija jednom dnevno i značka dana. Ako je `hpMax = 0` ceo dan: „Danas nema šefa“, bez pobede.
- **`counts: null`:** „Zaostatak trenutno nije dostupan“, bez trake i bez udaraca.
- Bez lika i maskote: šef je prsten i traka sa naslovom „Šef dana: zaostatak“.

### 6.5 Niz dana

- Dan je **upisan** kad su oba tačna: (a) imam bar jednu akciju koja nosi XP tog dana (server), (b) tog dana je na ovom uređaju viđeno „Hitno“ = 0, ili poražen šef, ili „Sve čisto“ na Dashboard-u (lokalno).
- Niz broji uzastopne radne dane (ponedeljak–petak). Vikend ne prekida niz; upisan vikend ga produžava.
- Propušten radni dan prekida niz: „Niz prekinut u utorak, 13. 10. Rekord: 7 dana.“ Današnji dan bez upisa još ne prekida: „danas još nije upisan“.
- Plamen ima 5 veličina: 1–2, 3–4, 5–9, 10–19, 20+ dana. Plamen je statičan znak; ne treperi.
- Deo (b) postoji samo na uređaju koji ga je video: piše „Niz se vodi na ovom uređaju od 13. 10.“

### 6.6 Značke (16 ličnih i 4 sajamske)

| # | Značka | Retkost | Uslov | Izvor |
|---|---|---|---|---|
| 1 | Prvi korak | obična | prva akcija koja nosi XP | server |
| 2 | Šef je pao | obična | šef dana poražen (broji se koliko puta) | brojevi + lokalni dan |
| 3 | Inbox nula | obična | „čeka odgovor“ pao na 0 danas, uz bar jedan moj odgovor danas | server |
| 4 | Nula hitnih | retka | „Hitno“ palo na 0 danas, uz bar jednu moju rešenu stavku | server |
| 5 | Šef pao pre podne | retka | šef poražen pre 12:00 po Beogradu | server + lokalno |
| 6 | Kombo ×3 | retka | lanac od 5 akcija | server |
| 7 | Pet u nizu | retka | niz od 5 dana | lokalno |
| 8 | Stotka | retka | 100 akcija koje nose XP | server |
| 9 | Kurir | retka | 10 završenih isporuka | server |
| 10 | Operater | retka | nivo 6 | server |
| 11 | Dispečer | epska | nivo 11 | server |
| 12 | Dvadeset u nizu | epska | niz od 20 dana | lokalno |
| 13 | Prvi u nedelji | epska | prvo mesto u tabeli tima na kraju nedelje | server |
| 14 | Komandant | epska | nivo 16 | server |
| 15 | Savršena nedelja | legendarna | pet radnih dana zaredom sa poraženim šefom | lokalno |
| 16 | Legenda | legendarna | nivo 21 | server |

Sajamske značke (zbirka „Sajam“, zajedničke za tim; činjenice događaja, ne lični rad; ne nose XP):

| # | Značka | Retkost | Uslov | Izvor |
|---|---|---|---|---|
| S1 | Sajam spreman | retka | svi čvorovi mape misija upaljeni pre otvaranja | `getEventDashboard` |
| S2 | Prvi lead | retka | prvi lead događaja | `getEventEngagement` (kao v2) |
| S3 | Rekord sata | retka | nov rekord sata viđen dok je stranica otvorena | `getEventAnalytics` (kao v2) |
| S4 | 100 skenova za sat | epska | rekord sata ≥ 100 | `getEventAnalytics` |

Datum osvajanja: za serverske uslove vreme reda koji je ispunio uslov; za lokalne trenutak viđenja. Serverske značke se na novom uređaju izvode ponovo iz dnevnika; lokalne ne, i to piše u Vitrini.

### 6.7 Nedeljna tabela tima

- Nedelja je od ponedeljka 00:00 po Beogradu.
- Za svakog člana (`adminTasks.listAdmins`) čita se `adminActivity.list({ actorKey })` unazad do početka nedelje, najviše 4 strane (200 redova). Ako 200 redova ne stigne do ponedeljka, piše „200+ akcija“ i XP je „najmanje“.
- Kolone: mesto (medalja za prva tri, `RankMedal` iz v2), član, nedeljni XP, broj akcija, najduži kombo, promena mesta od kraja jučerašnjeg dana (`RankMove`).
- Isti `xpRows` i isti kombo kao za mene.
- Osvežavanje: na 5 minuta dok je tab vidljiv, i kad se moja glava dnevnika promeni.
- Gde: Tim (panel iznad detalja člana) i Dashboard (traka igre: prva tri i ja).

### 6.8 Sajamske misije (Događaji → Pregled)

**Mapa misija pred sajam** (`lib/admin-v2/game/fair-missions.ts`, `fairChain(dashboard)`; sve iz `getEventDashboard`). Čvor je `zaključan`, `otvoren` (sa napretkom) ili `upaljen`.

| Čvor | Upaljen kad | Napredak |
|---|---|---|
| Katalog | svi modeli objavljeni i nijedan sa greškom | objavljeni / ukupno |
| Nalepnice | nijedan objavljen model bez QR-a, nijedna nalepnica na povučenom modelu | dodeljene / objavljeni |
| Izlagači | svi izlagači aktivni | aktivni / ukupno |
| Pitanja | pitanja Glasa publike pokrivaju prvi dan | pokriveno / potrebno |
| Leadovi i forme | follow-up tekstovi aktivni za izlagače kojima trebaju | aktivno / potrebno |
| Spremno | svi prethodni upaljeni | — |

Veze između čvorova se iscrtavaju (DrawSVG) kad se čvor upali. Čvor „test skenovi“ iz zadatka se ne pravi: broj skenova pre otvaranja ne stiže klijentu (otvoreno pitanje, §9.4).

**Dnevni izazovi tokom sajma** (`fairChallenges(analytics, engagement)`), napredak uživo iz pollinga:
- prvi dan: pragovi 10, 50 i 100 skenova, i „50 skenova pre podne“;
- od drugog dana, iz jučerašnjih brojeva: „Prestigni jučerašnje prepodne (N skenova do 12:00)“, „Obori rekord sata (R)“, „Prvi lead danas“, „Svi hitni zadaci događaja na nuli do 14:00“.
- Ciljevi su pravila nad pravim brojevima; nijedan podatak nije izmišljen.

### 6.9 Lokalni ključevi

| Ključ | Sadržaj |
|---|---|
| `scanme.admin.game.xp.v1.<userId>` | snimak: `{ xp, counted, newestAt, tail (poslednjih 5 vremena za kombo), oldestAt, complete }` |
| `scanme.admin.game.days.v1.<userId>` | po danu: `{ work, clear, bossMax, bossDown }`, poslednjih 60 dana |
| `scanme.admin.game.badges.v1.<userId>` | `{ [id]: osvojenoAt }` za lokalno osvojene |
| `scanme.admin.game.seen.v1.<userId>` | šta je već proslavljeno (nivo, značke, šef po danu), da se ceremonija ne ponovi |
| `scanme.admin.dashboard.hero`, `scanme.admin.hall.view` | izbor prikaza |

Sve u `try/catch`; pokvarena vrednost se odbacuje, nikad greška (kao dnevnik misija u v2).

### 6.10 Ceremonije

- **Vrste i veličina:**

| Događaj | Oblik | Trajanje |
|---|---|---|
| novi nivo; novi rang; poražen šef; epska ili legendarna značka | **velika**: medalja ili znak u centru, čestice | 1,62 s (ulaz 380, stoji 940, izlaz 300) |
| obična ili retka značka; novi rekord | **kartica** 280 × 96 px ispod navbara desno, uz XP čip | 1,20 s (240, 720, 240) |

- **Poreklo.** Velika medalja izleće iz XP čipa i u njega se vraća (`Flip.fit`); kartica izlazi iz čipa. Ceremonija tako ne pokriva listu u kojoj korisnik upravo radi.
- **Red** (`lib/admin-v2/game/ceremonies.ts`, čista funkcija `ceremonyQueue(events, state)`):
  1. prioritet: nivo, šef, značka (po retkosti naniže), rekord;
  2. isti ključ se ne ponavlja (`seen`);
  3. najviše **2** zaredom sa pauzom 400 ms, ukupno do 3,7 s; ostalo ide u jedan toast („i još 2 značke“ sa linkom na Vitrinu);
  4. novi rang i njegova značka su jedna ceremonija.
- **Čestice** na 2D canvas (do 120). 3D medalja iz kita za značku i nivo; dok traje, ostale scene pauziraju.
- **Preskakanje:** bilo koji taster ili klik (slušalac na `window`, bez `preventDefault`: klik stiže i do onoga na šta je kliknuto). Sloj je `pointer-events: none`, `aria-hidden`, van tab reda.
- **Fokus:** ako je fokus u polju za unos, `contenteditable` ili je otvoren dijalog, ceremonija se prikazuje kao toast.
- **Najava:** `aria-live="polite"` rečenica („Novi nivo: 7, Operater.“).
- **Telefon:** uvek kartica (1,20 s), 2D medalja.
- **Tihi režim i reduced motion:** bez sloja i čestica; ostaje jedan miran toast za nivo, značku i šefa (to je lična informacija, ne proslava). Rekordi u tihom režimu ostaju bez toasta, kao u v2.
- Portal nosi `admin-v1` i `data-reveal="off"`.

### 6.11 Prikaz

- **XP čip u navbaru** (levo od profila): prsten nivoa i „Nv 7“, od `xl`; između `lg` i `xl` samo prsten oko ikonice profila. Klik otvara Vitrinu. Dobitak XP-a: iskra uleti u čip, prsten se dopuni (240 ms).
- **HUD na dnu sidebara** dobija stalan red „Operater“: rang, nivo, traka do sledećeg nivoa, plamen niza. Deo „Danas“ (sajam) ostaje ispod njega samo dok sajam traje. Na telefonu u fioci.
- **Hero Dashboard-a:** prsten zaostatka u sceni; u legendi traka šefa i kombo. Ispod hero-a tanak red: prva tri u timu i ja.
- **Tim:** nedeljna tabela.
- **Pregled događaja:** mapa misija pred sajam, dnevni izazovi tokom sajma.
- **Dev preview:** nova `/dev/admin-igra-preview` sa `?igra=nivo|znacka|sef|kombo|niz|tim|vitrina` i dugmadima koja okidaju stanja nad TEST dnevnikom (`components/admin/game/game-fixtures.ts`, TEST imena). Okvir u preview-u dobija `previewGame` (kao `previewHud`).

### 6.12 Šta je pošteno, a šta procena

| Mehanika | Pošteno (mereno) | Procena ili ograničenje (piše u UI) |
|---|---|---|
| XP, nivo | svaka akcija je red serverskog dnevnika | istorija preko 1.000 redova ili pre projekcije: „računa se od datuma“; „izmena kanala“ nije nužno ispravka |
| Kombo | vremena sa servera | dodatak do 200 XP dnevno |
| Šef dana | trenutni zaostatak je tačan broj sa servera | najveće zdravlje dana je najveće viđeno na ovom uređaju; pad koji nije moj je „tim“; odlaganje se prepoznaje samo kad je moje |
| Niz | „radio sam tog dana“ je sa servera | „Hitno je bilo 0“ je viđeno samo na ovom uređaju |
| Značke | serverske se izvode ponovo | lokalne postoje samo na uređaju koji ih je video |
| Tabela tima | isti dnevnik za sve | do 200 redova po članu nedeljno („200+“) |
| Sajamske misije | brojevi iz `getEventDashboard` | čvor „test skenovi“ ne postoji (nema podatka) |

## 7. Podela rada

Deljene fajlove menja samo vođa: `lib/admin-v2/motion.ts`, `app/globals.css`, `lib/admin-v2/reveal/**`, `components/admin/reveal/**`, `components/admin/frame/**`, `components/admin/admin-primitives.tsx`, `components/admin/admin-ui/**`, `components/admin/events/analytics/chart-kit.tsx`, `components/admin/three/{stage,post,picking,particles,admin-stage}*`, svi `types.ts` u novim `lib/admin-v2/*` folderima, `lib/admin-v2/hud.ts`, `lib/admin-v2/sidebar/**`, `lib/admin-v2/shortcuts.ts`, rečnici `lib/i18n/sr/admin*.ts` i `lib/i18n/types.ts` (van putanja, sa razlogom). Test pripada vlasniku fajla koji testira. Radnici ne pokreću testove, build ni dev server. Ugovor props-a komponente koju radnik pravi, a drugi je montira, vođa zapiše pre talasa.

### V1 (pokret, reveal, Puls)

Vođa prvo: tokeni, engine, Skener, prelaz stranica, materijal, živi red, Puls sa živom ivicom, proširenje HUD-a (`leadsToday`), i atributi u deljenim primitivima (`AdminPageHeader` → `title`; `AdminPanel` → `card` + sloj svetla; `AdminDataView`, `AdminTable`, `AdminTableScroll` → `rows` + sloj svetla; `AdminKpiRow` → `kpi` + `tilt`; `ChartFrame` → `chart`; `HBar`, `StackedBar`, `MiniBars` → `bars`; `AdminLoadingState` → shimmer; `AdminMissionRing` → crtanje). Zatim jedan talas od 5 radnika:

| Radnik | Fajlovi (i njihovi testovi) | Zadatak |
|---|---|---|
| R1 | `components/admin/admin-dashboard-foundation.tsx`, `admin-team.tsx`, `admin-finance.tsx` | atributi po tabeli §2.10; prstenovi (`ring`), linija Finansija (`line`), signali (`kpi`) |
| R2 | `admin-clients.tsx`, `admin-client-profile.tsx`, `admin-inbox.tsx`, `admin-tasks.tsx` | `rows`, `card`, `kpi` na činjenicama profila |
| R3 | `admin-products.tsx`, `admin-products-surface.tsx`, `admin-qr.tsx`, `admin-qr-workspace.tsx`, `admin-orders.tsx`, `admin-service-operations.tsx`, `admin-search.tsx`, `admin-settings.tsx`, `admin-debug-support.tsx`, `admin-module-foundation.tsx`, `admin-pending-page.tsx`, `components/admin/mail/**` | isto |
| R4 | `components/admin/events/sections/*.tsx` osim `analitika-view.tsx`; `components/admin/events/{event-frame-view,event-frame,event-section,event-ui,event-entry}.tsx`; `admin-events.tsx`, `admin-events-interactions.tsx`, `admin-events-leads.tsx`, `admin-events-reports.tsx`, `admin-events-retention.tsx`, `admin-events-sponsored.tsx` | isto; Pregled: brojevi i stavke |
| R5 | `events/analytics/{kpi-strip,insights,funnel,depth,day-hour-matrix,model-leaderboard,stand-ranking,packages,model-detail-drawer}.tsx`, `events/sections/analitika-view.tsx` | `funnel`, `cells` (sa `data-peak`), `bars`, `rows`; hala se ne dira |

Kriterijum radnika: stranica u `renderToStaticMarkup` nosi atribute iz tabele, nijedan postojeći test ne pada, nema novog teksta van rečnika. Admin-provera (Haiku): snimci alatom runnera i kadrovi (§8.3).

### V2 (3D kit, Sazvežđe)

| Ko | Fajlovi |
|---|---|
| Vođa | `components/admin/three/**` (kit i `scenes/constellation-scene.ts`), `lib/admin-v2/three/theme.ts`, `lib/admin-v2/constellation/types.ts`, `components/admin/dashboard/constellation.tsx`, `components/admin/admin-dashboard-foundation.tsx` (hero, legenda, `limit: 12`, podignut dijalog, nišan), rečnici, `next build` za merenje |
| R1 | `lib/admin-v2/constellation/{layout,diff,colors}.ts` + testovi |
| R2 | `lib/admin-v2/three/{quality,budget,loop}.ts` + testovi, `lib/admin-v2/three/import-boundary.test.ts` |
| R3 | `components/admin/dashboard/{constellation-2d,constellation-summary}.tsx` + testovi; `components/admin/admin-dashboard-fixtures.ts`; `app/dev/admin-dashboard-preview/page.tsx` (`?sazvezdje=`, `?nisan=`) |
| Haiku | kadrovi, `output/playwright/admin-v3/V2/bundle.mjs` |

`heat-map-3d.tsx` se u V2 ne dira. Prsten zaostatka u V2 čita `hp` iz brojeva (formula iz §6.4 kao čista funkcija u `lib/admin-v2/constellation/layout.ts`); V4 je seli u `lib/admin-v2/game/boss.ts` i dodaje dnevnik dana.

### V3 (Živa hala, Vremeplov)

| Ko | Fajlovi |
|---|---|
| Vođa | `components/admin/three/scenes/hall-scene.ts`, `events/analytics/heat-map-3d.tsx`, `events/analytics/heat-map.tsx`, `events/sections/analitika-view.tsx`, `events/sections/analitika-section.tsx`, `lib/admin-v2/analytics/{anchors,types}.ts`, `lib/admin-v2/hall/types.ts`, rečnici |
| R1 | `convex/fairEventAnalytics.ts`, `convex/lib/fairEventAnalytics.ts`, `convex/fairEventAnalyticsV3.test.ts`; van putanja sa razlogom: `convex/fairAuthz.test.ts` |
| R2 | `lib/admin-v2/hall/{timelapse,impulses}.ts` + testovi |
| R3 | `components/admin/events/analytics/{timelapse-controls,timelapse-rank,hall-mini}.tsx` + testovi |
| R4 | `components/admin/events/preview-analytics-fixtures.ts` (+ test), `components/admin/admin-events-preview.tsx` (`?vremeplov=`, `?uzivo=auto`), `components/admin/events/sections/pregled-view.tsx` (montira `hall-mini`) |
| Haiku | kadrovi uvoda kamere i premotavanja |

### V4 (igra, Vitrina, ceremonije)

| Ko | Fajlovi |
|---|---|
| Vođa | rečnici; `lib/admin-v2/game/types.ts`; `components/admin/game/{game-provider,ceremony-layer,cause-chain}.tsx`; `components/admin/frame/{admin-frame,admin-navbar,admin-sidebar,admin-drawer,admin-hud,admin-pulse-feed}.tsx`; `lib/admin-v2/shortcuts.ts`; `components/admin/admin-dashboard-foundation.tsx` i `components/admin/dashboard/constellation.tsx` (šef, kombo, lanac uzroka); `app/dev/admin-igra-preview/page.tsx`; `components/admin/game/game-fixtures.ts` |
| R1 (talas 1) | `lib/admin-v2/game/{xp,levels,combo,activity,snapshot,team}.ts` + testovi |
| R2 (talas 1) | `lib/admin-v2/game/{boss,streak,badges,ceremonies,fair-missions,ledger}.ts` + testovi |
| R3 (talas 1) | `components/admin/game/{vitrina,medal-2d}.tsx`, `components/admin/three/scenes/medal-scene.ts`, `lib/admin-v2/game/medal-art.ts` + testovi |
| R4 (talas 2) | `components/admin/game/{xp-chip,operator-row,boss-bar,combo-meter,streak-flame,team-board,fair-chain,fair-challenges}.tsx` + testovi; uključivanje u `components/admin/admin-team.tsx` i `components/admin/events/sections/pregled-view.tsx` |
| Haiku | kadrovi ceremonija |

### Šta se iz v2 ne sme pokvariti

- **Okvir:** tri `data-admin-frame` atributa; prozor nikad ne skroluje; sidebar i navbar stoje; svaki novi sloj (canvas Pulsa, živa ivica, linija skenera, hero, sloj ceremonije) je u `relative` roditelju i ne produžava prozor.
- **Harmonika:** najviše jedna otvorena grupa, `data-admin-filter-toggle`, `aria-expanded`; visina preko `grid-template-rows`. Reveal ne dira sidebar.
- **URL stanje:** filter je `replaceState`; promena upita nije prelaz stranice ni novi ulaz.
- **Čuvar:** `admin-frame-gate.test.tsx` prolazi; `/admin` bez prijave vodi na `/admin/login`.
- **Testovi:** nijedan se ne isključuje. `text-vocabulary.test.ts` čita i nove tekstove; `titles.test.ts` traži `<title>` na novoj preview ruti; `admin-odometer.test.tsx` (prvi prikaz je običan tekst) ostaje tačan. Test Dashboard-a koji očekuje `limit: 8` menja se namerno na 12, uz razlog u belešci V2.
- **Sticky zaglavlja tabela:** nema `overflow-hidden` oko tabele; sloj svetla ne iseca sadržaj; `clearProps` posle svake koreografije.
- **Polling:** ne ponavlja ulaz; objekat za sidebar ostaje memoizovan.
- **Prečice:** ne rade u polju za unos; nova `G V` isto.
- **Okvir ne čita parametre adrese** (`useSearchParams` u okviru ruši statički build): dev parametre Puls čita iz `window.location` u efektu.
- **`lib/i18n/types.ts`:** uvozi samo tipove iz fajlova bez uvoza; pokrenuti i Convex typecheck.
- **Zabranjene putanje** i javni sajam se ne diraju. `lib/fair-heat.ts` i `lib/fair-map/**` se samo čitaju.

### Šta V6 upisuje u standard

`docs/admin/DASHBOARD-STANDARD.md`: tri sloja pokreta umesto „ništa preko 400 ms“; Skener i pravila ulaza (zamenjuju „ništa se ne kreće pri prvom učitavanju“ i „bez animacije pri prvom prikazu grafikona“); atributi `data-admin-reveal`; Puls i živa ivica; 3D kit (lenji uvoz, kvalitet, pauza, rezerva); gamifikacija v3 (izvor istine, poštenje, zabrane koje ostaju: zvuk, maskote, izmišljeni brojevi); ceremonije; tihi režim koji gasi i pokret.

## 8. Provere

### 8.1 Testovi čistih funkcija

| Fajl | Šta proverava |
|---|---|
| `lib/admin-v2/motion.test.ts` | postojeća 3 testa; slojevi: `feedback`, `state`, `move` ≤ 0,25; izlaz ≤ 0,16; zbir velike ceremonije ≤ 1,8; dve zaredom ≤ 3,7; `ADMIN_AMBIENT_FPS = 30` |
| `lib/admin-v2/reveal/registry.test.ts` | svaka vrsta ima koreografiju; `revealSchedule` za svaki položaj i vrstu završava ≤ 900 ms (telefon ≤ 675 ms); najveći početak 0,58 s; viši element nikad ne kreće posle nižeg; samo 12 redova (telefon 8); `short` ≤ 360 ms; `waveDelays` ≤ 500 ms i kreće od vrha; `countFrame` (formati, tekst sa dva broja se ne dira, kraj je tačno konačni tekst) |
| `lib/admin-v2/reveal/gate.test.ts` | reduced motion, tihi režim, skriven tab, hidratacija → `none`; prvi ulazak → `full`; drugi u 20 minuta → `short`; posle 20 minuta opet `full`; `popstate` → `short`; ključ rute bez sluga događaja; pokvaren `sessionStorage` ne baca; pravilo živog reda (najviše 3, bez promene adrese, lista nije bila prazna) |
| `lib/admin-v2/pulse.test.ts` | prvo čitanje bez otkucaja; Δ skenova → otkucaji raspoređeni u 55 s, najviše 24; delimičan broj ne daje otkucaje; rast i pad brojeva → `novo`, `hitno`, `promena`; `rešeno` samo iz dnevnika; amplituda ≤ 12 px; boja po vrsti i temi; ispadanje posle 60 s; energija 0–1 |
| `lib/admin-v2/hud.test.ts` | postojeći testovi; `leadsToday` iz dashboarda |
| `lib/admin-v2/three/{quality,budget,loop}.test.ts` | izbor kvaliteta i rezerve (softverski crtač je `low`, ne `off`); budžet čestica i `clampEmit`; regulator spušta i ne vraća, i ne spušta na 30 fps ambijentu koji drži cilj; `shouldRender` (skriven tab, van ekrana, 30 fps) |
| `lib/admin-v2/three/import-boundary.test.ts` | granica uvoza `three` |
| `lib/admin-v2/constellation/*.test.ts` | hitnost → poluprečnik; stabilan ugao po id-ju; bez preklapanja; zbirna zvezda; boje po statusu; `constellationDiff` (rešeno, novo, promena orbite, prvo čitanje); prsten zaostatka; `counts: null` |
| `lib/admin-v2/hall/timelapse.test.ts` | kumulativ i interpolacija; visine sa nepromenjenom skalom; slojevi; rang u svakom trenutku i izjednačeni; `playT` (12 s); sat kao tekst |
| `lib/admin-v2/hall/impulses.test.ts` | sken → impuls; prvo čitanje bez impulsa; ograničenje po štandu; stopa mirnih čestica |
| `convex/fairEventAnalyticsV3.test.ts` | §5.2.4 |
| `lib/admin-v2/game/*.test.ts` | XP tabela i pravila ponavljanja po akciji; nivoi i rangovi (obe formule, granice); kombo prozor i dnevna granica; zdravlje šefa, udarac, odlaganje, rast, poraz, `counts: null`; niz (radni dani, vikend, prekid, danas); 16 + 4 značke sa uslovom i retkošću; tabela tima (nedelja po Beogradu, „200+“, promena mesta); red ceremonija (prioritet, najviše 2, spajanje, bez ponavljanja, velika ili kartica); sajamska mapa i izazovi; snimak XP-a (dopuna, praznina, pokvaren zapis) |
| markup (`components/admin/**/*.test.tsx`) | atributi u primitivima i stranicama; sloj svetla ne iseca sadržaj; ceremonija se ne crta u tihom režimu ni dok je fokus u polju; sloj nema tab stop; Vitrina kao lista sa nazivima; rezerva Sazvežđa i hale bez WebGL-a; prečica `G V` ne radi u polju |

### 8.2 Preview rute za snimke

`/dev/admin-dashboard-preview` (`?state=`, `?sazvezdje=`, `?nisan=`, `?puls=demo`, `?energija=1`, `?kasni=<ms>`), `/dev/admin-clients-preview`, `/dev/admin-tasks-preview`, `/dev/admin-orders-preview`, `/dev/admin-team-preview`, `/dev/admin-inbox-preview`, `/dev/admin-finance-preview`, `/dev/admin-settings-preview`, `/dev/admin-events-preview/pregled` (`?faza=`, `?uzivo=`), `/dev/admin-events-preview/analitika` (`?uzivo=`, `?vremeplov=`), `/dev/admin-okvir-preview/<oblast>` (prelazi u trajnom okviru), nova `/dev/admin-igra-preview` (`?igra=`).

Konačno stanje: alat runnera na 1440, 1280, 1280 × 720, 390, 360 u obe teme, uz `--okvir --harmonika` (pokretati sa `MSYS_NO_PATHCONV=1`). Alat snima sa reduced motion, pa pokret, Puls, scene u pokretu i ceremonije **ne vidi**: njih dokazuju samo kadrovi iz §8.3.

### 8.3 Skripta za kadrove i video

`output/playwright/admin-v3/<KORAK>/kadrovi.mjs` (svaki korak svoju; ne u `scripts/`).

- Kontekst: `reducedMotion: "no-preference"`, tema preko `localStorage` (`scanme-theme`), 1440 × 900 i 390 × 844, Chromium sa softverskim WebGL-om.
- **Kadrovi su tačni u milisekundu:** `page.clock.install()` pre učitavanja; posle okidača `page.clock.pauseAt(sada)`, snimak, pa `page.clock.runFor(Δ)` do sledećeg kadra. GSAP, `requestAnimationFrame` i `performance.now` tada idu po lažnom satu. Skripta u dev-u zove `window.__adminMotion.gsap.ticker.lagSmoothing(0)`.
- **Okidač ulaza** je klijentska navigacija: učitaj stranicu A, sačekaj mir, klikni link navbara na stranicu B; nulti kadar je promena adrese. Tvrdo učitavanje preview rute ne pokazuje ulaz (§0.3).
- Kadrovi po koraku: V1 `0, 150, 400, 900, 1600`; V2 `0, 400, 900, 1600`; V3 `0, 400, 1600, 6000, 12000`; V4 `0, 300, 900, 1800`.
- **Šta mora da se vidi u kadru, i čime:** linija skenera (kadar 150); skeleton pa sadržaj (`?kasni=600`); pet otkucaja Pulsa (`?puls=demo`); živa ivica (`?energija=1`); svetlo, nagib i magnet (`mouse.move` u skripti); nišan (`?nisan=`); trag i pad u orbitu (`?sazvezdje=1|2`); čestice (`?uzivo=auto`); slojevi i premotavanje (`?vremeplov=auto`, kadar 6.000 je sredina dana); ceremonije (`?igra=`).
- **Tvrdnje u skripti** (JSON red po kadru): na 900 ms svaki `[data-admin-reveal]` ima `opacity 1` i nema `transform` ni `clip-path`; klik na red u kadru 0 radi; uz reduced motion i uz tihi režim kadar 0 je konačno stanje; drugi ulazak na istu rutu je gotov do 400 ms; `scrollTop` ekrana se ne menja posle `ScrollTrigger.refresh()` na pola stranice; prozor i ekran bez prelivanja; piksel u uglu scene jednak je boji domaćina; na 1280 × 720 vide se bar 2 reda liste „Za reakciju“.
- **Video:** drugi prolaz u pravom vremenu sa `recordVideo` (prelaz dve stranice, rešena stavka u Sazvežđu, premotavanje dana, ceremonija).
- Kadar se pogleda (Read na PNG) pre svake tvrdnje u belešci. Kadrovi se snimaju u obe teme; sjaj postoji samo u tamnoj.

### 8.4 Bundle, FPS, budžet

- **Bundle:** §4.3 (test granice, build koji pokreće vođa, mreža).
- **Budžet crtanja:** `stage.frames` se u dev-u upisuje u `data-stage-frames` domaćina. Skripta proverava: scena bez ambijenta ne crta nijedan frejm za 2 s mirovanja; sa ambijentom najviše 62 frejma za 2 s; na skrivenom tabu 0; posle napuštanja stranice canvas ne postoji.
- **FPS:** brojač `requestAnimationFrame` kroz 3 s u pravom vremenu i 95. percentil trajanja frejma. Softverski WebGL u headless pregledaču nije merilo pravog uređaja; broj se zapisuje kao takav, a pravu meru daju regulator kvaliteta i ručni pregled na pravom `/admin`.
- **Puls:** 0 frejmova u mirovanju; najviše 30 fps dok ima otkucaja.
- **Svetlo za kursorom:** 95. percentil frejma dok miš ide preko kartice i preko tabele; cilj do 16,7 ms u dev-u na 1440.
- **INP:** vreme od `pointerdown` do sledećeg crtanja za klik na red tokom ulaza (cilj do 100 ms u dev-u).

## 9. Rizici i odluke

### 9.1 Odluke donete umesto vlasnika

1. **Atribut je `data-admin-reveal`**, ne `data-reveal` (zauzet).
2. **Skener:** redosled ulaza je položaj na ekranu, ne grupe. Radni sadržaj pri vrhu zato dolazi prvi.
3. **Pun ulaz pri prvom ulasku na rutu i ponovo posle 20 minuta;** između je kratak ulaz do 360 ms. Razlog: 900 ms na svakoj navigaciji usporava rad, a „samo jednom u sesiji“ bi opet delovalo kao da pokreta nema.
4. **Stara stranica se prigušuje, ne gasi** (do 55 %, 140 ms): potpuno gašenje bi dalo prazan ekran dok nova ruta stiže.
5. **Tihi režim sada gasi i pokret** (ulaz, Puls, ivicu, ambijent, ceremonije), kako traži ZADATAK-V3 §0. Tekst uz prekidač se menja.
6. **Aura je živa ivica u DOM-u,** ne šejder (§1).
7. **XP je iz serverskog dnevnika akcija.** Lokalno je samo ono što server ne pamti kroz vreme.
8. **Zvezde su stavke „Za reakciju“,** ne klijenti (ime klijenta ne stiže); veličina je starost stavke; „Mirno“ su mirne stavke.
9. **Dashboard traži 12 stavki** umesto 8, da lista i scena budu isti skup.
10. **Hero je visok 20 rem (15 rem na niskom prozoru)** i ima prekidač „Samo lista“.
11. **Šef dana je prsten u Sazvežđu i traka u legendi,** bez lika. Maskote ostaju zabranjene.
12. **Hala je druga celina Analitike;** 3D je podrazumevan na desktopu, 2D ostaje izbor, rezerva i telefon.
13. **Stubovi su slojeviti po satima;** Vremeplov radi i u 2D.
14. **DPR scena je najviše 1,5** (zadatak dozvoljava 2).
15. **Vitrina je dijalog** sa jednom 3D medaljom i 2D mrežom.
16. **Niz broji radne dane;** vikend ne prekida.
17. **Rang-lista ljudi postoji** (tabela tima), jer je v3 izričito traži; v2 ju je zabranjivao.
18. **Čvor „test skenovi“ se ne pravi** (nema podatka).
19. **Okvir čita `adminDashboard.reactions` (limit 1) na svakoj stranici** radi Pulsa: postojeći upit, oko 20 dokumenata po izvršenju.
20. **Male ceremonije su kartica uz XP čip,** ne preko centra; klik preskače ceremoniju i istovremeno radi svoj posao.
21. **Kombo dodaje najviše 200 XP dnevno.**

### 9.2 Rizici

| Rizik | Šta se radi |
|---|---|
| SplitText i DOM koji poseduje React | deli se privremena kopija, ne pravi naslov |
| `MutationObserver` nad velikom stranicom | samo `childList`; obrada jednom po frejmu; sopstvene mutacije se ignorišu; posle prozora ulaza gleda samo zamenu skeletona i žive redove |
| StrictMode u dev-u (dvostruko montiranje) | idempotentan engine; ulazak se upisuje na kraju linije |
| Kaskada i FLIP nad istim redovima | engine završi kaskadu čim se lista promeni |
| Ostatak `clip-path` ili `transform` na elementu | `clearProps` na kraju; skripta proverava kadar od 900 ms |
| ScrollTrigger sajta i admina dele plugin | svaki admin okidač ima svoj `scroller`; bez globalnih podešavanja; `refresh` ne sme da pomeri skrol (tvrdnja u skripti) |
| Bloom ne čuva providnost | pozadina scene je boja površine, bez tone mapping-a; u svetloj temi bez bloom-a |
| Prevođenje šejdera koči glavnu nit | scena kreće posle ulaza, uz `compileAsync` |
| Integrisana grafika | DPR 1,5, bloom na pola rezolucije, regulator koji spušta kvalitet |
| WebGL u headless pregledaču | softverski crtač je `low` (kadrovi postoje); FPS se ne tvrdi iz njega |
| Hero gura listu | 15 ili 20 rem, prekidač „Samo lista“, uslov prijema u skripti |
| Veličina `three` chunk-a | lenji uvoz; budžet 300 kB gzip, mereno u V2 |
| Dnevnik akcija nema stare redove (projekcija možda nije popunjena unazad) | XP kreće od najstarijeg reda; piše od kog datuma |
| Puls kasni do 60 s za skenom | piše u opisu; interval se ne skraćuje |
| `getEventAnalytics` blizu granice od 4.096 opsega na većem sajmu (zatečeno) | Vremeplov ima svoj budžet (2.150); zatečeni rizik ostaje za backend |
| Naduvavanje XP-a | pravila po akciji i dnevna granica komba; tabela je jedan fajl |
| Pokret na telefonu | kraći ulaz, 8 redova, bez materijala; 3D je 2D; ceremonija je kartica |

### 9.3 Šta je ugrađeno iz kritike

Ispravljeno prema dokazu u kodu: Vremeplov više ne koristi ukupan brojač štanda (uključuje pre-event) i bira štandove kao `getEventAnalytics`; XP pravilo ponavljanja je po akciji (rešena stavka nema `href` po stavci); izlaz stranice ne gasi sadržaj; SplitText radi nad kopijom; skeleton paneli se ne otkrivaju dvaput; postojeće pretapanje u `AdminScreen` se zamenjuje; izvor `lead` u HUD-u ne postoji i dodaje se; pad brojeva nije „rešeno“; „Mirno“ nisu klijenti; test granice od 250 ms ne obuhvata `frame`; svetlo, shimmer i prsten animiraju samo `transform` i `opacity` (ili DrawSVG); Puls ne ulazi u linkove i ima čitljivu boju u svetloj temi; aditivno mešanje samo u tamnoj temi; regulator kvaliteta meri prema cilju; scena kreće posle ulaza; radna lista ulazi prva; pun ulaz se vraća posle 20 minuta; tipovi i ugovori imaju vlasnika; dodati su dev parametri da se sve vidi u kadru.

Usvojeni predlozi: lanac uzroka kao jedan let, živa ivica umesto aure, živi red na listama. Moji dodaci posle kritike: Skener kao princip ulaza, prsten zaostatka u Sazvežđu, slojeviti stubovi, ceremonija iz XP čipa.

Nije usvojeno: skraćivanje HUD pollinga na 20 s (trošak `getEventDashboard`); klasa `low` za svaku integrisanu grafiku (izgubila bi se dubina tamne teme na većini laptopova; umesto toga regulator).

### 9.4 Otvorena pitanja (za vlasnika i backend)

1. Ime klijenta i broj aktivnosti po klijentu uz stavke „Za reakciju“: tada zvezde mogu biti klijenti sa veličinom po aktivnosti.
2. Istorija zaostatka po danu na serveru: tada su niz i najveće zdravlje šefa isti na svakom uređaju.
3. Broj test skenova pre otvaranja po događaju: tada mapa misija dobija čvor „test skenovi“.
4. Da li su stari redovi `adminAuditLog` projektovani u `adminActivityRows` na produkciji: od toga zavisi od kog datuma XP kreće.
5. Da li zahtev bez kolačića posetioca (bot) ikad pravi sajamski sken: komentar u `convex/lib/fairHeat.ts` kaže da ne pravi, kod to ne potvrđuje izričito (zatečeno; tiče se svih brojeva skenova).
6. Potvrda XP vrednosti, imena rangova i dnevne granice komba.
7. Da li prvi pogled na v3 treba da bude u tamnoj temi (sjaj i dubina postoje samo tamo).
