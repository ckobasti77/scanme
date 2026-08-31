# Pristupačnost — TASK-25 Step 1 (WCAG 2.1 AA)

Audit na tri površine koje osoba stvarno dodiruje — gostov telefon
(`/m/[code]` + `/zid`), panel vlasnika (client panel), i javna Venue stranica
u obe teme. Nije checklist sweep svih ruta. Svaki nalaz nosi fajl, i ili
primenjenu popravku, ili razlog zašto nije popravljen. Kontrast je meren na
stvarnim izračunatim vrednostima tokena (JS u browseru na dev serveru),
ne na podrazumevanim.

Legenda: **[FIXED]** popravljeno u ovom tasku · **[ACCEPTED]** nije
popravljeno, razlog i okidač zapisani · **[PASS]** provereno, bez nalaza.

---

## 1. Gostov telefon — `/m/[code]`, `/m/[code]/moje`, `/zid/[code]`

### Kontrola vidljivosti po fotografiji — ta na kojoj stoji obećanje

`components/memories/photo-sheet.tsx` — **[PASS uz dve popravke]**. Kontrola
je fundamentalno ispravna i NIJE dvosmislena:

- Dva prava `<button>`-a sa **rečima, ne ikonama**: „Vide svi" / „Samo ja i
  domaćin", grupa označena sa „Ko vidi ovu sliku" (`lib/i18n/sr/memories.ts`).
- Stanje je programski izloženo (`aria-pressed`) i vizuelni stil je vezan za
  taj isti atribut (`.segmentButton[aria-pressed="true"]` u
  `memories.module.css`) — izgovoreno i nacrtano stanje ne mogu da se raziđu.
- Touch target 48 px (`min-height: 48px`), pola širine sheet-a — preko 44 px.
- Tastatura: nativna dugmad, `:focus-visible` prsten u modulu.

Popravke na sheet-u:

- **[FIXED]** `photo-sheet.tsx` — dijalog je nosio `aria-modal="true"` bez
  focus trap-a: Tab je izlazio na zaklonjenu stranicu (2.4.3). Dodat Tab/
  Shift-Tab wrap unutar sheet-a, uključujući povratak fokusa koji je legalno
  ispao na `<body>` (disable usred mutacije, unmount confirm para, tap na
  fotografiju) — bez toga bi trap propuštao baš u tim stanjima
  (adversarial review nalaz, potvrđen i zatvoren).
- **[FIXED]** `photo-sheet.tsx` — „Obriši" naoružava potvrdu i unmount-uje
  fokusirano dugme; fokus je padao na `<body>`. Potvrdno dugme sada prima
  fokus (ref + effect). Ista popravka u `memories-my-photos.tsx`
  (WipeAllControl).
- **[FIXED]** `photo-sheet.tsx` — greška mutacije je bila vizuelna-samo;
  sada `role="alert"`.
- **[ACCEPTED]** `role="group"` + dva `aria-pressed` dugmeta umesto
  `radiogroup`/`radio`: AA-prihvatljiv obrazac (toggle-par); `radiogroup` bi
  promenio interakcioni model (strelice umesto Tab) bez dobitka u jasnoći.
- **[ACCEPTED]** `disabled={busy}` tokom mutacije obara fokus ako korisnik
  drži fokus na dugmetu u tih ~200 ms; `aria-disabled` alternativa menja
  stilove i handler-e za rub-slučaj meren milisekundama. Okidač: žalba
  korisnika čitača ekrana.

### Ostatak gostove površine

- **[FIXED]** `guest-photo-grid.tsx` — `host_only` stanje na mreži bilo je
  samo `aria-hidden` EyeOff ikona: korisnik čitača ekrana nije mogao da zna
  koje su slike privatne (1.1.1/4.1.2). Stanje je sada u `aria-label`-u
  dugmeta („Uspomena N — Samo ja i domaćin").
- **[FIXED]** `memories.module.css` — dva obična linka (politika privatnosti
  na `/moje`, consent link na landing-u) nasleđivala su globalni
  `--focus-ring` koji je **crn u svetloj temi aplikacije** — nevidljiv prsten
  na uvek-tamnoj Memories površini (2.4.7). Modul sada nosi svoj amber
  prsten. Provereno u browseru: pravilo prisutno u kompajliranom CSS-u.
- **[FIXED]** `memories-landing.tsx` — red u queue-u („Sačuvano" / „Otpremanje
  nije uspelo") menjao se bez objave; sada `role="status"` (4.1.3). Procenat
  tokom slanja je namerno IZVAN live regiona (vizuelni tekst `aria-hidden`,
  region objavljuje stabilno „Šalje se…") — nethrotlovani onprogress tik po
  objavi bi udavio baš prelaze zbog kojih region postoji (adversarial
  review nalaz, potvrđen i zatvoren).
- **[FIXED]** `memories-my-photos.tsx` — `role="group"` bez imena; sada
  `aria-label={wipeDialogTitle}`.
- **[FIXED]** `memories.module.css` — `summary` („detalji saglasnosti") bio je
  ~30 px visok; sada `min-height: 44px`. `.galleryLoadMore` tranzicija dodata
  u `prefers-reduced-motion` blok (bila jedina izvan njega).
- **[ACCEPTED]** identična imena „Ukloni"/„Pokušaj ponovo" na više redova
  queue-a (2.4.6 advisory): redovi su prolazni (sekunde–minuti) i vizuelno
  vezani za sliku; ordinal u imenu dodaje šum za mali dobitak.

### Zid — `/zid/[code]`

- **[FIXED]** `app/zid/[code]/page.tsx` — `maximumScale: 1` +
  `userScalable: false` blokirali su zum (1.4.4) na URL-u koji panel vlasnika
  otvara sa telefona. Uklonjeno; projektor se ionako ne pinch-zumira.
- **[FIXED]** `wall.module.css` — „UŽIVO" i brojač su sedeli na scrim-u koji
  bledi (na svetloj fotografiji ≈3.2:1); sada solidne pilule
  `rgba(13,10,8,0.78)` (1.4.3). Provereno u browseru na wall harness-u.
- **[FIXED]** `wall-screen.tsx` — h2 („Zid je spreman") dolazio je pre h1 u
  DOM-u; masthead sad renderuje prvi (apsolutno pozicioniran — vizuelno
  nepromenjeno). Provereno u browseru: redosled h1 → h2.
- **[PASS]** `prefers-reduced-motion` kroz ceo šestočasovni loop:
  `useReducedMotion` obara scale/drift na čiste opacity fade-ove
  (`wall-screen.tsx`), CSS tranzicije mozaika ugašene u reduce bloku.
- **[ACCEPTED]** svaka stage fotografija deli isti alt („Uspomena sa
  večeras"): gostove fotografije nemaju nikakve metapodatke iz kojih bi
  smisleniji alt nastao.

## 2. Panel vlasnika — galerija, archive picker, kontrole zida

- **[FIXED]** `memories-host-gallery.tsx` — selection toggle preko cele
  pločice bio je **bezimeni** button („toggle button, not pressed" — koju
  sliku?); sada `aria-label` sa rednim brojem slike (4.1.2).
- **[FIXED]** isto — kvačica selekcije bila je skoro-crna na 30% lime preko
  proizvoljne fotografije (<3:1 na tamnoj slici); sada na solidnom lime
  disku (1.4.11).
- **[FIXED]** isto — delete dugme bilo je `opacity-0` do hover-a, a na touch
  uređaju (bez hover-a) nevidljiv-ali-tapabilan ugao svake slike; sada
  vidljivo podrazumevano, hover-reveal samo pod `@media(hover:hover)`. Ista
  popravka za „Postavi kao naslovnu".
- **[FIXED]** isto — host-only bedž je ime nosio samo kroz `title` na
  span-u; dodat `sr-only` tekst.
- **[FIXED]** `memories-panel-section.tsx` — ikona-link „Otvori /r link" bio
  je bezimeni link (dict string je postojao neiskorišćen); copy dugme je
  imalo `aria-label="Kopiraj"` koji briše vidljivi kod kartice iz imena i
  čini sve redove istoimenim (2.5.3). Oba sada nose kod kartice u imenu.
- **[FIXED]** `components/ui/dialog.tsx` — sr-only „Close" preveden u
  „Zatvori" (3.1.2); string nije u harness goldens (provereno grep-om).
- **[FIXED]** `memoriesArchive.ts` + picker — lista događaja u picker-u sekla
  se tiho na 100; sada `truncated` signal + vidljiva beleška „Prikazano je
  poslednjih {max} događaja" (Step 0 stavka 4).
- **[PASS]** destruktivne radnje: brisanje slike, završavanje događaja,
  arhiviranje, zatvaranje prozora, gašenje kartice — sve imenovane rečima na
  srpskom i potvrđene u Radix dijalogu (trap/Escape/aria-modal/Title/
  Description iz primitiva), sa `destructive` varijantom i zaključanim
  dismissal-om dok mutacija traje.
- **[PASS]** reorder nije drag-only: „Postavi kao naslovnu" je pravo dugme,
  dostupno tastaturi.
- **[ACCEPTED]** unpin sa javne stranice je jedan klik bez potvrde:
  reverzibilan (ponovni pin), jasno imenovan; potvrda bi usporila kuraciju.
  Okidač: ako se pojavi žalba da je slika nestala „sama".
- **[ACCEPTED]** fokus pada na `<body>` posle brisanja slike (okidač-pločica
  je nestala) i pri ulasku u selection mode; nadoknada zahteva ref-ove kroz
  paginiranu mrežu. Okidač: SR-korisnik u panelu.
- **[ACCEPTED]** 10 px tekst na overlay dugmadima prolazi kontrast, ali je
  na donjoj granici čitljivosti; dizajnerska odluka panela, ne AA pad.

## 3. Javna Venue stranica — obe teme, stvarne vrednosti tokena

Ključni nalaz audita: **motor je garantovao kontrast samo za `title`/`body`
na `page`/`surface`** — svaka druga upotreba boje kao teksta bila je
negarantovana. Popravka je u kompajleru tokena
(`lib/design-engine/venue-tokens.ts`), ne po blokovima: četiri izvedena,
pod-om osigurana tokena koje CSS sada koristi.

- **[FIXED]** `--venue-accent-text` = `ensureContrast(accent, [page,
  surface], 4.5)`. Accent je doslovna boja logotipa bez ikakvog poda; pet
  pravila koja ga koriste kao mali tekst (eyebrow, live bedž, labele
  datuma/programa/cenovnika) sada pokazuju na floored varijantu. Paleta koja
  već prolazi prolazi doslovno (provereno: svetla tema #7A5C43 → nepromenjen).
- **[FIXED]** `--venue-on-accent` = izvedeni čitljivi tekst NA accent-u;
  `.actionPrimary` (rezervacija, učitavanje mape) koristio je `--venue-page`
  na accent-u bez garancije.
- **[FIXED]** `--venue-body-muted` = floored prigušeni body. Svi
  `color-mix(... transparent)` muted tekstovi (placeholder 55% ≈3.0:1 — pad
  i u default paleti; footer brand 70% = 4.26:1 — pad; još 7 pravila koja
  padaju na at-floor tamnim paletama) sada pokazuju na njega.
- **[FIXED]** `--venue-input-border` = `ensureContrast(border, surface, 3)`.
  Engine border je namerno bleda linija (1.37:1) — a bila je JEDINA granica
  polja forme (1.4.11).
- Block-level color override i dalje prolazi doslovno (vlasnikova eksplicitna
  odluka — isti ugovor kao za title/body); `BlockShell` propagira override u
  izvedene tokene da vizuelni override ne bi prestao da radi.

Izmerene vrednosti posle popravke (browser, computed):

| Par | Svetla | Tamna |
|---|---|---|
| accent-text / page | 5.7:1 | 8.26:1 |
| on-accent / accent | 5.7:1 | 8.56:1 |
| body-muted / page | 5.5:1 | 6.15:1 |
| body-muted / surface | 5.1:1 | 5.48:1 |
| input-border / surface | 3.0:1 | 3.06:1 |

Ostalo na Venue stranici:

- **[FIXED]** lightbox (Radix portal na `document.body`, IZVAN `.root`) —
  kontrole su nasleđivale globalni fokus prsten, crn u svetloj temi
  aplikacije, na skoro-crnom lightbox chrome-u ≈1.1:1 (2.4.7, sve tri rute).
  Modul sada nosi beli prsten za lightbox kontrole.
- **[FIXED]** pozadinski video (`autoPlay loop`) — >5 s pokreta bez pauze i
  bez poštovanja `prefers-reduced-motion` (2.2.2); sada sakriven pod
  reduce (boja `--venue-page` ispod čuva kontrastno tlo). Vidljiva pauza za
  korisnike bez OS podešavanja ostaje **[ACCEPTED]** — novi UI element,
  okidač: prvi vlasnik koji stvarno postavi video pozadinu.
- **[FIXED]** `overlayOpacity` za media pozadinu imao je donju granicu 0 —
  tekst masthead-a i svakog ne-card bloka direktno na proizvoljnoj
  fotografiji (1.4.3 bez granice). Pod je sada 0.25
  (`VENUE_DESIGN_BOUNDS`) — isti izvor čita i editor slider.
- **[FIXED]** carousel bez lightbox-a bio je overflow scroller bez ijednog
  fokusabilnog elementa — tastatura nije mogla da ga pomeri (2.1.1); sada
  `tabIndex={0}` + `role="region"` + labela kada je `carousel && !lightbox`.
- **[FIXED]** nevalidno gnežđenje `<p>` u `<span>` unutar linkova
  (pastEvents, profileCards) — parser prepisuje takav HTML (4.1.1); sada
  `<span>` + `display:block` (vizuelno identično).
- **[FIXED]** „event ended" beleška i state body/actions sedeli su između
  landmark-a; sada unutar `<main>`. Kalendarske akcije: `aria-label` na
  generic div-u se ignoriše — dodat `role="group"`.
- **[FIXED]** copy-link share dugme sada nosi `aria-live="polite"` da objavi
  „Kopirano".
- **[PASS]** heading hijerarhija h1 → h2 → h3 bez preskoka nezavisno od
  redosleda blokova; landmarks header/main/footer; svi `alt`-ovi prisutni
  (dekorativni prazni uz susedni tekst, galerija sa owner-editable alt-om i
  numerisanim fallback-om); `.animFadeUp`/`.animReveal`/`.liveDot` svi u
  `no-preference` gate-u.
- **[PASS]** ranije prijavljeni „unscrimmed white labels" na pločicama
  galerije **ne postoje u tekućem kodu**: javne pločice su čiste slike bez
  teksta; jedini beli tekst je u lightbox-u preko fiksnog tamnog scrim-a
  (≈4.7:1+). Nalaz je predatirao današnje stanje.
- **[ACCEPTED]** share akcije su `<button>` + `window.open`, ne linkovi:
  URL se namerno gradi u click-time iz `window.location` da hidratacija
  ostane čista (komentar u fajlu); semantika „link" bi zahtevala effect-om
  računate href-ove. Advisory, ne AA pad.
- **[ACCEPTED]** fokus token je osiguran 3:1 samo prema `page`, ne prema
  `surface` — prsten na input-u u ekstremnoj paleti može pasti ispod 3:1.
  Rub-slučaj generisanih paleta; okidač: konkretna paleta koja ga pogodi.
- **[ACCEPTED]** nema skip-linka: jedan kratak header, 2.4.1 zadovoljen
  strukturom.

## 4. Verifikacija stavke 5 (Step 0) — praznina ispod profile-cards

Izmereno na stvarnom renderu (`/dev/venue-preview`, DOM rects): razmak ispod
`profileCards` bloka je **32 px** — standardni inter-block gap; blok visok
297 px sa sadržajem, galerija ispod 435 px. Praznina od ~300–400 px iz
TASK-12 **ne postoji** — koren (nepotpisani storage URL-ovi koji su se
gađali naslepo) je zatvoren u TASK-12 (`venueStorageUrl` vraća `null` za
opaque id-jeve i slika se uopšte ne renderuje).

## Šta NIJE pokriveno

- ScanMe Links površine — zamrznute, van opsega po zadatku.
- Admin konzola (`/admin/*`) — interni alat, nije jedna od tri površine.
- Host panel je auditovan u kodu (svi nalazi gore); nije vožen u browseru u
  ovom tasku jer zahteva prijavu — deljene primitive (Radix dijalozi, Tabs)
  nose semantiku, a izmene su pokrivene postojećim testovima.
