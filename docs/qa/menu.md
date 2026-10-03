# Meni — QA, pristupačnost (TASK-60b)

RFC-003 §4 TASK-60b. Isti metod kao [docs/qa/ordering.md](ordering.md)
(TASK-70b): sve provere rađene u pregledaču, na **živim** `/{slug}/meni`
stranicama servisiranim sa `next dev` (localhost:3000) protiv stvarnog Convex
deployment-a `expert-pelican-136`, nikad na `/dev/menu-public-preview`
fikstura-stranici (zadatak to eksplicitno zabranjuje).

Za merenje kontrasta na više akcentnih boja lokala (tačka 5) nije bilo moguće
proći kroz autentifikovani meni-editor: sve postojeće seed-ovane menu
poslovnice (`menu-perf-fp-basic`, `menu-perf-fp-premium`,
`menu-perf-ceiling-*`) nemaju vlasnički nalog vezan za njih (napravljene su
skriptom, `convex/menuPerfSeed.ts`), pa `/{slug}/meni/editor` vraća "Prijava
je potrebna" za trenutnu admin sesiju. Pošto `convex/lib/access.ts` ne sme da
se dira, a nema drugog pravog puta do proizvoljne akcentne boje na živoj
stranici, dodata je JEDNA nova operator-only funkcija
`menuPerfSeed.publishAccentSample` (mirroring postojećih funkcija u istom
fajlu: deploy-key gated, `internalAction`/`internalMutation`, nikad deo `npm
run check`) koja objavljuje pravi meni sa zadatom akcentnom bojom. Ovo NIJE
korisnička funkcionalnost — isti obrazac kao ostatak `menuPerfSeed.ts` — i
jedina je izmena van same QA provere/popravki. Otvorene stranice za kontrast:
`/menu-perf-accent-light/meni` (`#F5E9C8`, svetla), `/menu-perf-accent-dark/meni`
(`#1A1D22`, tamna), `/menu-perf-accent-red/meni` (`#C23B3B`, zasićena), plus
`/menu-perf-fp-basic/meni` i `/menu-perf-fp-premium/meni` (podrazumevana
`#7A5C43`) i `/menu-perf-ceiling-100/meni` (100 stavki u 2 grupe — jedini
seed sa >10 stavki po grupi, korišćen za akordeon).

Širine: 1280×800 (desktop), 375×812 (mobilni, `resize_window` preset
`mobile`). Obe teme nisu posebno provaravane za Meni — dizajn Menija (`--menu-*`
tokeni) je nezavisan od sajt-teme (svetlo/tamno dugme u uglu), pa je sajt-tema
ostavljena kako je zatečena; sve mereno kontrast je na stvarnim `--menu-*`
tokenima, ne na sajt-temi (vidi nalaz #7 ispod za grešku koju je to otkrilo u
mom SOPSTVENOM skriptu za merenje, ne u aplikaciji).

## 1. Sticky scroll-spy traka i horizontalni "Traka" red — tastatura

Provereno **stvarnim** fokusiranjem (`element.focus()` na stvarne DOM
elemente, mereno `getBoundingClientRect()` pre/posle, isto kao TASK-70b meri
48px umesto da veruje imenu klase) na `/menu-perf-fp-basic/meni`:

- **"Traka" grupa (Pića), horizontalni scroll**: `scrollWidth` 1976px >
  `clientWidth` 632px (desktop) — realno prelama. Fokusiranje poslednje
  (van-ekrana) kartice pomerilo je `scrollLeft` sa 0 na 1349px i kartica je
  posle toga **potpuno unutar** vidljive oblasti kontejnera
  (`rect.left/right` unutar `contRect.left/right`), sa vidljivim
  `outline: solid`. Radi ispravno — nativno ponašanje pregledača.
- **Sticky nav traka grupa** (`.navList`, `overflow-x: auto`): na desktop
  širini 5 čipova stane bez prelamanja (nije bio realan test). Na **375px**
  širini `scrollWidth` 604px > `clientWidth` 375px — realno prelama.
  **NALAZ, POPRAVLJENO**: fokusiranje poslednjeg čipa ("Pivo i sokovi")
  pomerilo je `scrollLeft` samo sa 0 na 12px i čip je ostao **van** vidljive
  oblasti (`rect.left` 444px, kontejner se završava na 375px) — fokus je bio
  nevidljiv na ekranu, tačno scenario koji zadatak upozorava. Traka grupa
  (isti `overflow-x: auto` obrazac) radi ispravno; nav ne — razlika je
  `scroll-snap-type: x proximity` + `scroll-snap-align: start` na nav
  čipovima (traka nema scroll-snap), što ometa nativni "scroll fokusiranog
  elementa u vidokrug" u ovom pregledaču.

  Popravljeno u [`components/menu/menu-nav.tsx`](../../components/menu/menu-nav.tsx):
  dodat `onFocus` na svaki nav-čip koji eksplicitno zove
  `scrollIntoView({ block: "nearest", inline: "nearest" })`. Provereno uživo
  posle popravke: isti test (fokusiraj poslednji čip na 375px) sada daje
  `scrollLeft` 229px i čip je potpuno vidljiv.

## 2. Caret akordeon — `aria-expanded` i fokus pri zatvaranju

`aria-expanded` je ispravan (`components/menu/blocks/more-caret.tsx`) i
menja se tačno uz otvaranje/zatvaranje — potvrđeno na `/menu-perf-ceiling-100/meni`
(2 grupe od po 50 stavki, jedini seed sa dovoljno stavki da akordeon uopšte
uradi nešto — svi ostali imaju ≤10 po grupi).

**NALAZ, POPRAVLJENO — fokus se gubio na `<body>`.** Jednootvoreni akordeon
(RFC-003 §2.1) zatvara Grupu 1 kad se otvori Grupa 2; stavke izvan prvih 10
se pri zatvaranju **potpuno uklanjaju iz DOM-a** (ne samo sakrivaju —
`components/menu/blocks/lista-group.tsx`: `shown = reveal ? group.items :
visible`). Ako je fokus bio na stavci unutar tog uklonjenog opsega u trenutku
zatvaranja, pregledač ne može da zadrži fokus nigde smisleno i vraća ga na
`<body>` — potpun gubitak konteksta za korisnika tastature/čitača ekrana.

Ovo NIJE dostiživo čistim uzastopnim `Tab` navigiranjem u ovoj implementaciji
(jedini način da se grupa zatvori jeste da se aktivira DRUGI caret, a to
zahteva da fokus prvo ode NA taj caret) — ali JESTE stvarno dostiživo čim se
caret aktivira BEZ prethodnog fokusiranja (npr. `HTMLElement.click()` ne
pomera fokus u ovom pregledaču isto kao pravi klik mišem, i ovo je poznata
razlika između pregledača — Safari po difoltu ne fokusira dugme na klik
mišem). Provereno **stvarno**, ne pretpostavkom: fokusirana stvarna DOM
stavka ("Stavka 14", unutar otvorene Grupe 1), zatim `caret2.click()` —
`document.activeElement` posle toga bio je `<body>`, `Stavka 14` potvrđeno
uklonjena iz DOM-a.

Popravljeno u [`components/menu/menu-public-view.tsx`](../../components/menu/menu-public-view.tsx):
`toggle` sada, PRE promene stanja, proverava da li se trenutni fokus nalazi
unutar kontejnera grupe koja se zatvara (`document.getElementById(groupContainerId(current))`);
ako da, posle commit-a fokus se eksplicitno prebacuje na SOPSTVENI caret te
(sada zatvorene) grupe — dodat `data-menu-caret={groupId}` atribut u
[`components/menu/blocks/more-caret.tsx`](../../components/menu/blocks/more-caret.tsx)
i pomoćna `groupContainerId()` izvezena iz
[`components/menu/blocks/group-shell.tsx`](../../components/menu/blocks/group-shell.tsx).
Provereno uživo posle popravke istim scenariom: fokus posle zatvaranja
Grupe 1 je na dugmetu "Još 40" te grupe (`aria-expanded="false"`), ne na
`<body>`.

## 3. Bottom sheet stavke (TASK-53) — focus trap, Escape, povratak fokusa

Napomena o alatu: `computer key` pritisak za `shift+Tab` i `Escape` u ovom
harnessu nije pouzdano stizao do stranice (aktivni element se nije menjao) —
ista vrsta ograničenja koju je TASK-70b zabeležio za Paint Timing API.
Zaobiđeno slanjem PRAVIH `KeyboardEvent`-a preko `dispatchEvent` (isti tip
događaja, isti `event.key`/`shiftKey`, samo drugi transportni mehanizam) —
provera je i dalje na stvarnom, izvršenom kôdu komponente, ne na pretpostavci.

Na `/menu-perf-fp-basic/meni`, stavka "Stavka 1" (bez varijanti/uparivanja,
2 fokusabilna elementa u listu: dugme za zatvaranje i dugme "Pošaljite
upit"):

- Otvaranje (Enter na stavci): `role="dialog"`, `aria-modal="true"`,
  `aria-labelledby="menu-item-sheet-title"` → tekst naslova "Stavka 1".
  Fokus ide na dugme za zatvaranje. Sve potvrđeno.
- **Trap unazad** (Shift+Tab sa prvog fokusabilnog): omotava na POSLEDNJI
  ("Pošaljite upit"), ostaje unutar dijaloga.
- **Trap unapred** (Tab sa poslednjeg): omotava na PRVI (dugme za
  zatvaranje).
- **Escape**: zatvara dijalog (`role="dialog"` nestaje iz DOM-a).
- **Povratak fokusa**: posle zatvaranja, aktivni element je tačno stavka
  koja je otvorila sheet ("Stavka 1"), ne neki drugi element niti `<body>`.

Sve ispravno, bez izmene. Kôd (`components/menu/menu-item-sheet.tsx`)
namerno pamti opener eksplicitno (`event.currentTarget` u
`useMenuItemTrigger`, ne `document.activeElement` u trenutku klika) — to je
tačno isti pattern koji je akordeonu (nalaz #2) nedostajao, i ovde je već
ispravno urađen.

## 4. Pločice sa ikonicama (stavke bez fotografije) — tekstualna alternativa

Na `/menu-perf-fp-basic/meni`, DOM stavke bez fotografije:
`<li role="button" tabindex="0" aria-haspopup="dialog">` sadrži
`<svg aria-hidden="true">` (ikonica, dekorativna) i vidljiv `<h3>Stavka 1</h3>`
tekst unutar iste stavke. Pristupačno ime `li[role="button"]` elementa se
računa iz CELOG vidljivog teksta unutar njega (ime, cena, opis) — čitač
ekrana čuje "Stavka 1, 550 RSD, Test stavka..." a ne prazninu. Isto važi za
pločicu u bottom sheet-u (`components/menu/item-icon-tile.tsx` — glyph
`aria-hidden`, naslov `<h2 id="menu-item-sheet-title">` nosi ime).
Potvrđeno, bez izmene — dizajn već ispravno ne oslanja se na samu ikonicu za
prenos informacije.

## 5. Kontrast — AA na više akcentnih boja lokala

Automatska provera skriptom u pregledaču (WCAG relativna luminantnost,
kompozitovanje kroz providne roditelje), nad svim vidljivim tekstualnim
čvorovima, PLUS posebna provera za akcentnu pločicu (`--menu-icon` pozadina i
`--menu-on-accent` glyph, RFC-003 §2.4 — tačno mesto koje zadatak imenuje kao
najverovatnije da padne).

| Stranica (akcentna boja) | Neuspešnih tekstualnih čvorova | Pločica (glyph na `--menu-icon`) |
|---|---:|---:|
| `menu-perf-fp-basic` (`#7A5C43`, podrazumevana) | 0 | — (nije posebno mereno, isti mehanizam) |
| `menu-perf-accent-light` (`#F5E9C8`, svetla) | 0 | **15.56:1** |
| `menu-perf-accent-dark` (`#1A1D22`, tamna) | 0 | **15.10:1** |
| `menu-perf-accent-red` (`#C23B3B`, zasićena) | 0 | **4.71:1** (najniže izmereno, i dalje ≥ AA 4.5) |

Nula neuspeha na sve tri netrivijalne boje — mehanizam iz
`lib/design-engine/menu-tokens.ts` (`ensureContrast` za `--menu-accent-text`,
`deriveReadableTextVariant` za `--menu-on-accent`) stvarno radi u renderovanoj
stranici, ne samo u jediničnom testu (`menu-tokens.test.ts`). Provereno i
`.inquiryButton` (upit dugme u sheet-u, `background: var(--menu-accent)`,
`color: var(--menu-on-accent, ...)`) — koristi floor-ovanu varijantu, nije
zahvaćen.

**Nalaz #7 (u mom alatu za merenje, ne u aplikaciji):** prva verzija skripte
za kontrast je lažno prijavila 55 neuspeha na `/menu-perf-accent-light/meni`.
Uzrok: `.root` element postavlja pozadinu Menija preko
`background-image: linear-gradient(var(--menu-page), var(--menu-page))`
(vidi `components/menu/menu-template.module.css` i
`components/menu/menu-template.tsx`), NE preko `background-color` — moja
prva skripta je čitala samo `backgroundColor`, pa je "providan" `.root`
propustio merenje do `<body>`-a čija je pozadina sajt-teme (u tom trenutku
tamna, jer sam ranije dodirnuo prekidač teme), potpuno nezavisno od Menija.
Popravljeno u samoj skripti (prepoznaje `linear-gradient(boja, ista boja)`
kao punu pozadinu) pre nego što je bilo koji nalaz zabeležen — zabeleženo
ovde da buduća provera ne ponovi istu grešku, isto kao TASK-70b beleži svoja
ograničenja alata.

## 6. Dijalog iz TASK-58 ("Zadrži nema više" / "Objavi i vrati u ponudu")

Nije dostignut uživo: dijalog je u `/{slug}/meni/editor`
(`components/menu/editor/menu-editor.tsx`), gated `requireBusinessAccess`, a
nijedna seed-ovana menu poslovnica nema vlasnički nalog vezan za trenutnu
admin sesiju (ista prepreka kao za tačku 5, i tu nije zaobiđena — dodavanje
naloga/članstva bi zahtevalo diranje šire nego jedne QA seed funkcije, i nije
urađeno).

Provereno **statički, iz izvora** (ne uživo): dijalog koristi
`components/ui/dialog.tsx`, koji je tanka obavijena verzija
`@radix-ui/react-dialog` (`DialogPrimitive.Root/Content/Title/...`) — ISTI
mehanizam koji ceo ostatak aplikacije već koristi za dijaloge, ne
ručno-pisan trap kao u tačci 3. Radix Dialog garantuje focus trap, Escape,
`role="dialog"`, `aria-modal="true"` i `aria-labelledby`/`aria-describedby`
vezano za `DialogTitle`/`DialogDescription` po difoltu. Oba dugmeta u
`availabilityConflict` dijalogu (`components/menu/editor/menu-editor.tsx`
~991-1007) imaju vidljiv tekstualni sadržaj (ne samo ikonicu) kao
pristupačno ime: `dict.availabilityKeepLive` ("Zadrži nema više") i
`dict.availabilityPublishOverwrite`-tipa tekst ("Objavi i vrati u ponudu"),
sa `LoaderCircle` spinerom koji se dodaje UZ tekst, ne umesto njega.

Zabeleženo kao ograničenje pristupa (kao tačka 5), ne kao potvrđen nalaz —
mehanizam je isti, već dokazano ispravan (Radix), pa je rizik nizak, ali nije
lično pritisnuto dugme u pravom pregledaču.

## Sažetak nalaza

| # | Nalaz | Status |
|---|---|---|
| 1a | Traka grupa (horizontalni scroll) — fokus ostaje vidljiv, nativno radi | Potvrđeno, bez izmene |
| 1b | Sticky nav traka grupa — fokus poslednjeg čipa nevidljiv na 375px (scroll-snap ometa nativni scroll-into-view) | **Popravljeno** (`onFocus` + `scrollIntoView` u `menu-nav.tsx`) |
| 2 | Zatvaranje akordeon-grupe brisalo je fokusiranu stavku iz DOM-a → fokus padao na `<body>` | **Popravljeno** (fokus se prebacuje na caret zatvorene grupe, `menu-public-view.tsx` + `more-caret.tsx` + `group-shell.tsx`) |
| 3 | Bottom sheet: trap, Escape, aria-modal, povratak fokusa | Potvrđeno, bez izmene |
| 4 | Pločice bez fotografije imaju tekstualnu alternativu (ime stavke u pristupačnom imenu) | Potvrđeno, bez izmene |
| 5 | Kontrast AA na 3 akcentne boje (svetla/tamna/zasićena) + podrazumevana, tekst i pločica | Potvrđeno, bez izmene u aplikaciji (izmena samo u mom mernom skriptu) |
| 6 | TASK-58 dijalog (Zadrži/Objavi) | Nije dostignuto uživo (nema vlasnički nalog); potvrđeno statički da koristi Radix Dialog + tekstualna imena dugmadi |

## Van dometa / namerno neizvedeno

- Nije dodavan nalog/članstvo ni za jednu seed poslovnicu radi pristupa
  editoru — `convex/lib/access.ts` ostaje netaknut, kako preambula nalaže.
- `menuPerfSeed.ts` dobio je jednu novu operator-only funkciju
  (`publishAccentSample` + pomoćni `setAccent`) isključivo radi ove QA
  provere (tačka 5) — deploy-key gated, nikad deo `npm run check`, isti
  obrazac kao ostatak fajla. Nije nova korisnička funkcionalnost.
- MENU_EXISTS i ORDERING_EXISTS nisu dirani.

## Gejtovi (tačka 4 preambule)

```
npm run check       → lint (0 errors, 2 preexisting warnings) + build OK + tsc OK
npm run harness:namespace → passed, no cross-namespace tokens
npm run harness:check     → passed — 177 cases × 2 viewports match the goldens byte-for-byte
git diff --stat components/scanme-links lib/scanme-links* → prazno
```

## Otvorene stranice u pregledaču

`/menu-perf-fp-basic/meni`, `/menu-perf-fp-premium/meni`,
`/menu-perf-ceiling-100/meni` (1280×800 i 375×812),
`/menu-perf-accent-light/meni`, `/menu-perf-accent-dark/meni`,
`/menu-perf-accent-red/meni` (1280×800). `/menu-perf-fp-basic/meni/editor`
otvoren i vratio "Prijava je potrebna" (očekivano, dokumentovano gore).
`/dev/menu-public-preview` NIJE korišćen za proveru (zadatak to zabranjuje) —
pomenut samo kao mesto gde `DARK_MENU_DESIGN` fikstura živi, radi konteksta.
