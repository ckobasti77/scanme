# Sajam dizajn — 9. oktobar 2026.

Grana `codex/jovan-sajam-dizajn-2026-10-09`, napravljena od `codex/jovan-dorade-2026-10-09` (`883c411`).
Zadatak: glavna strana sajma (mapa) na viši nivo i doslednost cele sajamske aplikacije
(`tmp/sajam-dizajn-2026-10-09/ZADATAK.md`). Menjan je samo frontend sajma: nema promena
backenda, Convex-a, podataka, ruta ni `mapLocationId`. Ništa nije deployovano.

## Commitovi

| Commit | Korak | Šta |
| --- | --- | --- |
| `a31c912` | 0 | `git revert d154d2e`: mapa i desni panel su opet fiksni (bez skupljanja/širenja) |
| `da0b452` | 1 | DNA dizajna (`FAIR-DESIGN-DNA.md`) i tokeni za razmak, uglove, ivice, senke i pokret |
| `8d49228` | 2 | Mapa: pokret za svaku promenu stanja, prazan panel, pretraga sa tastature, skeleton |
| `64f76fc` | 3 | Donji sheet: dve visine, prevlačenje, lepljivo zaglavlje, dialog i fokus |
| `c34e433` | 4 | Model, Glas publike, anketa, garaža, pasoši i deli na istim tokenima |
| `b7f8b10` | — | Runda ispravki posle pregleda snimaka (prevlačenje mišem, oznaka pogotka) |
| poslednji | — | Ova beleška, FRONTEND-DELTA, tačno trajanje petlje učitavanja u pasošu |

**Važno za produkciju:** `d154d2e` iz DORADE se **ne** uzima (poništen je u `a31c912`).

## Šta je urađeno i zašto

### Korak 0 — fiksni raspored (odluka od 9. 10. u 03:47)
- `git revert d154d2e`, bez reseta. Na desktopu (≥ 1024 px) mapa i desni panel su uvek
  prisutni, fiksne širine 380 px (≥ 1440 px: dve zone + panel). Nema animacije širine.
- Bez izbora panel nije prazan (urađeno u koraku 2): kartica „Kako da izaberete štand“
  (tri kratka koraka: mapa, pretraga, spisak), sponzorisana rotacija kad je ima (ostaje na
  vrhu panela, kao i pre DORADE) i kartica „ScanMe štand“ sa mestom, kratkim tekstom
  ScanMe štanda i dugmetom „Pronađi ScanMe“. Escape vraća panel na uputstvo.
- Telefon i dalje koristi donji sheet.

### Korak 1 — DNA i tokeni
- `docs/events/sajam-automobila-2026/FAIR-DESIGN-DNA.md`: DNA izvučen iz koda (design-dna,
  faza 2) pre izmena, sa JSON profilom i motion thesis-om mape.
- `app/sajam/fair-event.css` pod `.fair-event`: razmak `--fair-space-1…12` (baza 4), uglovi
  `--fair-radius-xl/lg/md/sm/xs/2xs/pill/round` po pravilu ugnježdenja (24 → 12 → 6,
  16 → 8 → 4), ivice `--fair-border` / `--fair-border-strong` (jedna debljina), senke
  `--fair-shadow-1/2/3` (+ `3-up` za sheet), pokret `--fair-dur-*` (120/200/320/480 ms,
  korak kaskade 40, petlje 800/1200) i `--fair-ease-enter/exit/move/linear`.
- `components/fair/fair-motion.ts`: iste vrednosti za framer-motion.
- Prebrojano u svih 8 sajamskih CSS fajlova:

  | | Pre | Posle |
  | --- | --- | --- |
  | Radiusi | 35 različitih vrednosti (230 upotreba) | samo tokeni (8 tokena; plus resetovi `0`/`inherit` i `calc(token − okvir)` za koncentrične okvire) |
  | Trajanja | 33 različite vrednosti (113 upotreba) | 0 tvrdih vrednosti; samo tokeni ili umnožak tokena |
  | Krive | 9 različitih (99 upotreba, uklj. `ease`) | 0 tvrdih vrednosti; samo `--fair-ease-*` |

  Skripta: `node tmp/sajam-dizajn-2026-10-09/audit-css.mjs` (izveštaji `audit-pre.txt`, `audit-posle.txt`).
- **Reduced motion (globalno, `fair-event.css`):** keyframe animacije staju na krajnjem
  stanju, a prelazi zadržavaju samo boju, providnost i stanje (`transition-property`
  ograničen na opacity/color/background/border/box-shadow/fill/stroke/visibility). Ranije
  su se gasili *svi* prelazi. Isto pravilo je i u garaži.
- Režim ekrana (`?prikaz=ekran`) zadržava ugao kartica 20 px (`.root[data-display="on"]`
  vraća `--fair-radius-xl` na 20 px).

### Korak 2 — glavna strana (mapa)
- **Fokalni momenat, izbor štanda:** obris se podebljava u akcentu, oreol se smiri, jedan
  puls (jednom); kamera dovodi štand u vidno polje (480 ms); izabrani štand ulazi u panel.
- **Zaglavlje detalja:** oznaka štanda (čip u akcentu = izbor) + naziv izlagača (ili
  „N izlagača“ za deljen štand). „Izabrani štand“ je ostao kao tekst za čitač ekrana u
  naslovu, umesto natpisa iznad naslova.
- **Modeli kao bogati redovi:** pločica, naziv, varijanta (ili „Otvori stranicu modela“),
  strelica; ceo red otvara model. Model na mapi nema fotografiju u podacima, pa je pločica
  ikona automobila.
- **Pretraga:** combobox (strelice, Enter, Escape), označen pogodak (reči od 2+ slova, u
  nazivu, brendu i modelu), broj rezultata za čitač ekrana, animiran ulaz/izlaz, prazno
  stanje sa savetom i dugmetom „Obriši pretragu“.
- **Zone:** indikator klizi, mapa zone se pretapa. **Filteri:** menja se samo boja (bez
  skoka). **Spisak:** grupe se otvaraju trikom sa gridom (0fr → 1fr), redovi kaskadno samo
  pri prvom otvaranju (≤ 200 ms). **Rotacija:** stavke se pretapaju (režim ekrana zadržava
  svoj ulaz). **Originalna mapa** se pretapa.
- Hover samo gde pokazivač stvarno lebdi; sve vidljive mete na mapi ≥ 44 px (provereno
  skriptom na 390), razmak ≥ 8 px; placeholder pretrage 5:1.
- Skeleton prati konačni raspored, uključujući fiksni panel na desktopu.
- Reduced motion: kamera skače i kratko se pretopi, puls i kaskada izostaju.

### Korak 3 — donji sheet (`FairMapSheet`)
- Dve visine: pregled (~45 %, izabrani štand ostaje vidljiv iznad sheeta) i pun prikaz
  (~90 %, samo tu skroluje). Kratak štand ima jednu visinu.
- Prevlačenje: ručka (dugme 44 px, tap menja visinu), zaglavlje i u pregledu ceo sheet;
  prag 96 px i brzina zamaha. Zatvaranje: prevlačenje nadole, tap na pozadinu, Escape,
  dugme 44 px. Ulaz 320 ms bez odskoka, izlaz 200 ms; pozadina blago zatamnjena.
- `role="dialog"`, `aria-modal`, fokus ulazi kad je sheet vidljiv i vraća se, Tab ostaje
  unutra; skrol strane zaključan (`overflow: hidden` na `<html>`, `scrollbar-gutter:
  stable`), `overscroll-behavior: contain`, `env(safe-area-inset-bottom)`.
- Uglovi: sheet 24 → redovi 12 (razmak 12) → pločica 6 (razmak 6).

### Korak 4 — ostale stranice
- Razmak na tokenima (samo vrednosti tačno na skali; isti pikseli) u `fair-event.css`,
  garaži, lead formi, deljenoj kolekciji i pasošu.
- Jedno polje za unos (kontakt, lead, forme u sheetu = pretraga na mapi): 48 px, md,
  izražena ivica, hover, fokus prsten 3 px. Placeholder lead forme je bio ispod 4.5:1.
- Ista stanja dugmadi (hover u `(hover: hover)`, kratak pritisak, isti fokus) u
  `fair-event.css`; hover pravila u garaži su takođe u `(hover: hover)`.
- framer-motion na stranici modela (sheet, toast, koraci ankete) čita `fair-motion.ts`;
  izlaz je brži od ulaza. Dugme „Sačuvaj u garažu“ se vraća na ugao 12 (bilo 14).

## Provere

- `npx tsc --noEmit`: bez novih grešaka; 39 postojećih grešaka su u nedirnutim test fajlovima (`convex/*.test.ts`, `lib/memories-*`), nijedna u sajamskom kodu.
- `npm run lint`: 0 grešaka (3 postojeća upozorenja van sajma: `admin-clients.tsx`, `venue-admin.tsx`, `purchaseLifecycle.test.ts`).
- `npm run build`: uspešan (i ponovljen posle poslednje izmene CSS-a).
- `npx vitest run fair`: 75 fajlova, 674 testa prolaze (bilo 671; novi testovi za označavanje pogotka i broj rezultata).
- Snimci pre i posle (Playwright, nisu u gitu): `tmp/sajam-dizajn-2026-10-09/snimci/pre|posle`,
  montaže u `snimci/montaze/`:
  - mapa na 360, 390, 412, 768, 1280 i 1440: ništa izabrano, izabran štand, otvorena
    pretraga, otvoren spisak;
  - sheet na 390, pregled i puna visina;
  - model, garaža i pasoši na 390 i 1280;
  - režim ekrana 1920 × 1080: **nepromenjen** (SSIM 0.99998 prema snimku pre, razlika crna).
- Jedan pregled, jedna runda ispravki (`b7f8b10`), jedna potvrda.
- Reduced motion proveren (Playwright emulacija): prelazi samo boja/providnost, sheet se
  pretapa, indikator i spisak se menjaju odmah.
- ui-ux-pro-max pre-delivery checklist: SVG ikone (lucide), cursor pointer, hover bez
  pomeranja rasporeda, prelazi 120–320 ms, vidljiv fokus, kontrast ≥ 4.5:1, bez
  horizontalnog skrola na 360/390/412/768, `prefers-reduced-motion` poštovan.

## Šta Aleksa treba da pregleda

1. **Panel bez izbora na desktopu** (1280/1440): uputstvo + ScanMe kartica, i sa
   rotacijom (`/dev/sajam-mapa`). Kartica ScanMe štanda namerno **nema** ScanMe zelenu
   (MASTER §14: zelena samo na štandu na mapi); ako treba zeleni znak, to je odluka vlasnika.
2. **Sheet na pravom telefonu:** prevlačenje (prag i zamah), home indicator (safe area),
   zaključan skrol iza sheeta, prelaz pregled ↔ puna visina.
3. **Globalno reduced-motion pravilo** sada pušta prelaze boje i providnosti na svim
   sajamskim stranicama, i u pasošu (ranije su svi prelazi bili ugašeni).
4. **EDS:** `FAIR-DESIGN-DNA.md` zamenjuje početne vrednosti iz `EVENT-DESIGN-SYSTEM.md`
   §5.3 (radius 20/12) i §8 (160/240/360 ms). EDS nije menjan; semantika je ista.
5. **Režim ekrana:** izgled je isti; jedina razlika je u pokretu isticanja štanda u
   rotaciji (1,4 s → 1,44 s, kašnjenje 0,4 s → 0,32 s, oba sa tokena).
6. **Nije dirano:** GSAP koreografija u garaži (let modela u garažu, kartice) i „chat head“
   ankete zadržavaju svoja trajanja (autorski momenti u JS-u); `/r/**`; backend.

## Izmene u `components/fair/passport/` (Aleksino područje)

Samo vrednosti preko tokena; struktura, selektori, JSX i ponašanje nisu menjani.

`fair-passport.module.css`:
- Uglovi: `999px` ×11 → `--fair-radius-pill`; `50%` ×6 → `--fair-radius-round`;
  `26px` (`.finaleCard`), `24px` (`.favoriteSection`, `.empty`), `22px` (`.passportCard`,
  `.detailHeadingPhoto`), `20px` (`.modelCard`) → `--fair-radius-xl` (24);
  `19px`/`16px` (`.runner`), `17px` (`.modelCard` u detalju, `.favoriteGrid button`),
  `15px` (`.errorBanner`) → `--fair-radius-lg` (16); `14px` (`.brandLogoPresentation`,
  `.finaleActions button`), `11px` (`.errorBanner button`), `10px` (`.newBadge`,
  `.unlockCellsFlash`, `.finaleThumbs > span`) → `--fair-radius-md` (12);
  `2px` (`.spark`) → `--fair-radius-2xs` (4); `0 5px 5px 0` (`.modelAccent`) →
  `0 var(--fair-radius-xs) var(--fair-radius-xs) 0` (6).
- Trajanja i krive: 80/120 ms → `--fair-dur-feedback`; 160 ms → `feedback`; 180/200/240 ms →
  `--fair-dur-state`; 300/400 ms → `--fair-dur-overlay`; 500 ms → `--fair-dur-focal`;
  petlje `passport-loading` 900 ms → `--fair-dur-loop` (1,2 s), `passport-dot-core` i
  `passport-dot-wait` 1,8 s → `calc(var(--fair-dur-loop) * 1.5)` (1,8 s), reduced-motion
  `.loadingLine::after` 1,8 s → `calc(var(--fair-dur-loop) * 1.5)`; `ease`/`ease-out`/
  `cubic-bezier(0.22, 1, 0.36, 1)` → `--fair-ease-enter`, `ease-in-out` → `--fair-ease-move`.
- Razmak: 30 vrednosti tačno na skali (4/8/12/16/24/32/48 px) → `--fair-space-*` (isti pikseli).
- Senke, boje (`--passport-*`) i `:hover` pravila nisu menjani. Preporuka: hover pravila
  `.passportCard:hover` i `.backButton:hover` staviti u `@media (hover: hover)` kao ostatak
  sajma (nije urađeno jer menja strukturu).

`new-stamp-card.module.css`:
- Uglovi: `18px` (`.card`) → `--fair-radius-lg`; `13px` (`.tile`, `.link`), `12px`
  (`.action`, `.dismiss`) → `--fair-radius-md`; `999px` → `--fair-radius-pill`.
- `new-stamp-shine` 3,2 s sa kašnjenjem 1,4 s → `calc(var(--fair-dur-loop) * 2.5)` (3 s) sa
  kašnjenjem `--fair-dur-loop` (1,2 s); kriva → `--fair-ease-move`.
- Razmak: 2 vrednosti → `--fair-space-*`.

## Pokretanje lokalno

- Mapa: <http://localhost:3000/sajam/elektromobilnost-2026> (izbor: `?stand=hala-6`,
  zona: `?zona=ispred`, režim ekrana: `?prikaz=ekran`)
- DEV pregled sa rotacijom: <http://localhost:3000/dev/sajam-mapa>
- Model: <http://localhost:3000/sajam/elektromobilnost-2026/model/jmev-ev3>
- Garaža: <http://localhost:3000/sajam/elektromobilnost-2026/garaza>
- Pasoši: <http://localhost:3000/sajam/elektromobilnost-2026/pasosi>
