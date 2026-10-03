# Pristupačnost toka kupovine (/kupovina) — TASK-42

Audit četiri koraka toka kupovine u OBE teme, po zahtevu TASK-42: kontrast,
fokus, veličina meta, red naslova, i prolaznost celog toka tastaturom od prve
usluge do plaćanja. Meren je produkcijski build (`next start`, port 3010) na
1280×900 i 375×812, svetla i tamna tema (`html[data-theme]`).

Metod: izračunate boje (`getComputedStyle`) sa alfa-kompozicijom teksta preko
efektivne pozadine (WCAG relativna luminansa); pravi Tab tasteri sa `focusin`
snimačem za redosled fokusa; CSSOM sken za pokrivenost `:focus-visible`
pravilima; `scrollWidth > innerWidth` za bočno prelivanje.

**Ograničenje okruženja, zapisano pošteno:** QA browser pane ne ume da izvrši
NATIVNU tastaturnu aktivaciju dugmeta (Enter/Space na fokusiranom `<button>` ne
proizvodi klik — provereno na theme switchu; isti pane ranije nije umeo ni rAF,
TASK-35 §2). Zato su redosled fokusa i vidljivost fokusa provereni UŽIVO, a
aktivacija analizom koda. Jedina nađena prepreka aktivaciji je popravljena
(nalaz 0). Jednominutna ručna potvrda na pravom browseru je u smoke listi
(docs/qa/PURCHASE-READINESS.md).

---

## 0. POPRAVLJENO u ovom tasku — obaralo je tastaturnu kupovinu

**Kartica usluge je gutala Enter/Space sa unutrašnjeg „Dodaj" dugmeta.**
`components/purchase/step-services.tsx`: omotač kartice (`div[role="button"]`)
je u `onKeyDown` hvatao Enter/Space **bez provere `event.target`** i zvao
`event.preventDefault()`. Taster pritisnut na unutrašnjem pravom
`<button>` „Dodaj: …" bablja do omotača, `preventDefault` otkazuje nativnu
aktivaciju dugmeta — **tastaturom nije bilo moguće dodati nijednu uslugu**, pa
ni proći tok (korak 1 je vrata). Miš nije bio pogođen. Popravka: guard
`if (event.target !== event.currentTarget) return;` na obe kartice (usluga i
kombo). Ovo je bio jedini nalaz koji obara tastaturnu kupovinu; sve ostalo
ispod je zapisano i rangirano, ne popravljano (uputstvo taska).

Posle popravke tastaturni put je: Tab → „Dodaj: Venue" → Enter → Tab →
„Dodaj: Memories" → Enter → … → „Dalje" → … → „Plati". Svaka stanica je pravi
`<button>` sa vidljivim prstenom (izmereno `outline: solid 2px`).

## 1. Šta PROLAZI (izmereno)

- **Red naslova**: bez preskoka na sva četiri koraka. h1 „Sastavite svoj
  ScanMe." → h2 po koraku (Korpa / Basic / Premium / Fizički proizvodi /
  Pregled porudžbine / Porudžbina je primljena.) → h3 samo na korku 3
  (kontrole sidebara: „Za koju uslugu?" PRVA, iznad Orijentacije) i koraku 4
  (sekcije pregleda/sažetka).
- **Tamna tema — kontrast ceo čist**: svih 14 sondi koraka 1 PASS
  (5,18–16,62), korak 2 PASS (uklj. Enterprise red 5,18), korak 4 PASS.
- **Fokus prsten (gde postoji)**: jak u obe teme — `--focus-ring` #000 na
  svetloj (≈13:1 prema ramu), #c6ff4a na tamnoj (12,96:1). Sva prava dugmad
  (timeline, period toggle, Dodaj, Dalje/Plati, čipovi vezivanja, akordeon)
  dobijaju ga kroz globalno `:focus-visible` pravilo.
- **Veličina meta**: nijedan interaktivni element < 24 px ni na 1280 ni na
  375 (WCAG 2.5.8).
- **Mobilni 375 px**: bez bočnog prelivanja na sva četiri koraka
  (`scrollWidth === innerWidth`).
- **Reduced motion**: `useReducedMotion` u shell-u i koracima 1–3 +
  `prefers-reduced-motion` blokovi u svih pet purchase CSS modula.
- **Skip-link** („Pređi na tok kupovine") postoji i prvi je u DOM-u;
  indikator koraka i ukupan iznos su `aria-live="polite"`.
- **Novac dosledan na ekranu**: korpa = bar = pregled (2.390 mesečno za
  Događaj; 3.380 sa Premium linijom — potvrđeno na koracima 1→4).

## 2. NALAZI — zapisani, rangirani, NE popravljani

Rangirano po šteti za korisnika; ništa od ovoga ne obara kupovinu mišem, a
posle popravke 0 ni tastaturom.

1. **Kartice usluga nemaju vidljiv fokus indikator** (WCAG 2.4.7, obe teme).
   `div[role="button"]` omotači kartica nisu pokriveni NIJEDNIM
   `:focus-visible` pravilom (CSSOM sken: 0 poklapanja; globalno pravilo u
   `app/globals.css` cilja `a, button, input… , .focus-signal`, a purchase
   moduli nemaju nijedno `focus` pravilo). Tastaturni korisnik ne vidi gde je
   dok prelazi preko kartice; unutrašnje „Dodaj" dugme prsten IMA, pa je put
   upotrebljiv. Najjeftinija popravka: `className="focus-signal"` na omotač.
2. **Četiri tab-stopa duha u telefonskom preview-u** (WCAG 2.4.3/4.1.2).
   Preview je `aria-hidden` + `pointer-events:none`, ali NE i `inert` — pravi
   linkovi šablona (Bloom Café: „Meni", „Rezerviši sto", „Instagram", „Sajt")
   primaju realan tastaturni fokus (snimljeno `focusin` logom, `inHidden:
   true`): fokus „nestane" za čitač ekrana 4 pritiska zaredom. Popravka:
   `inert` na stage element (postoji od Chrome 102+/Safari 15.5+).
3. **Svetla tema — 5 kontrastnih padova na sitnom sekundarnom tekstu**
   (WCAG 1.4.3; tamna tema NEMA nijedan):
   | Element | Izmereno | Prag |
   |---|---|---|
   | tagline kartice („Jedna stranica sa…") | 3,95:1 | 4,5 |
   | neaktivno dugme period toggle-a | 4,35:1 | 4,5 |
   | budući korak u timeline-u | 3,56:1 | 4,5 |
   | tekst prazne korpe | 4,20:1 | 4,5 |
   | Enterprise red (korak 2) | 3,56:1 | 4,5 |
   Sve su varijante `rgba(24,20,17,α)` sa α 0,55–0,62 preko svetlog rama —
   podizanje α na ~0,70 rešava svih pet odjednom.
4. **Dialog korpe (korak 3) nije dialog po ponašanju**: `role="dialog"` se
   otvara bez premeštanja fokusa unutra, bez fokus-trap-a i bez Escape
   zatvaranja (provereno uživo: Escape ne zatvara). Dugme za zatvaranje jeste
   dostupno Tab-om. Uporediti sa ručnim trap-om Memories photo-sheet-a
   (docs/qa/accessibility.md §1) — isti obrazac primeniti ovde.
5. **„Plati" nestaje ispod fokusa**: po aktivaciji se forward dugme
   unmount-uje (`showForward` false) i fokus pada na `<body>`; naslov
   „Porudžbina je primljena." ne dobija fokus niti postoji live najava
   uspeha. Popravka: `tabIndex={-1}` + `focus()` na naslov sažetka.
6. **Fokus se ne premešta pri promeni koraka** — ostaje na perzistentnom
   „Dalje" (podnošljivo: dugme ne nestaje, a `aria-live` „Korak X od 4"
   najavljuje promenu), ali čitač ne dobija početak novog sadržaja. Uz nalaz
   5 rešava se istim obrascem (fokus na naslov koraka).
7. **Semantika `aria-pressed` na karticama**: odražava koji je preview
   aktivan, ne da li je usluga U KORPI (`data-selected` je samo vizuelni);
   čitaču „pressed" sugeriše članstvo u korpi. Plan dugmad (korak 2) nemaju
   `aria-pressed`, ali stanje nosi tekst („Izabrano") — prihvatljivo.
8. **Sitno**: `<nav>` timeline-a i `<section>` shell-a dele istu aria-labelu
   („Sastavite svoj ScanMe."); skriveni h1/h2 šablona žive u aria-hidden
   preview-u (ne čitaju se, ali stoje u DOM-u).

## 3. Kako je meren kontrast

Efektivna pozadina = kompozicija svih predačkih pozadina sa α>0 do prve
neprozirne (staklo `--os-glass-bg` uključeno); tekst sa α<1 se prvo komponuje
preko te pozadine, pa se računa odnos. Pragovi: 4,5:1 normalan tekst, 3:1
veliki (≥24 px ili ≥18,66 px bold). Aktivni period pill meren prema svojoj
kliznoj pozadini (motion span), ne prema ramu.
