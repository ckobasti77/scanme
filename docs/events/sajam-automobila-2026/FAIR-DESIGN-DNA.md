# Sajam — DNA dizajna (izvučen iz koda)

> Izvor istine: `app/sajam/fair-event.css` (tokeni pod `.fair-event`) i sajamski CSS moduli
> (`components/fair/**/*.module.css`, `app/sajam/**/*.module.css`).
> Izvučeno 9. 10. 2026. (zadatak SAJAM DIZAJN, grana `codex/jovan-sajam-dizajn-2026-10-09`)
> metodom design-dna, faza 2, iz postojećeg koda, pre izmena.
>
> Ovaj dokument ne menja zaključane odluke iz [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md) §14 ni
> semantiku iz [`EVENT-DESIGN-SYSTEM.md`](./EVENT-DESIGN-SYSTEM.md). Konkretne vrednosti
> razmaka, uglova, senki i pokreta odavde zamenjuju početne predloge iz EDS §5.3 (radius 20/12)
> i EDS §8 (160/240/360 ms). Semantika ostaje ista: enter usporava, exit je brži, animiraju se
> transform i opacity, reduced motion ima statičnu alternativu.

## 0. Referenca: Garaža i Pasoši (SAJAM SUPER, 9. 10. 2026.)

Izvučeno metodom design-dna, faza 2, iz koda (`components/fair/garage/fair-garage.module.css`,
blok „Garage V2“, i `components/fair/passport/fair-passport.module.css`, `.page`) i iz
izračunatih stilova na snimcima `/sajam/<slug>/garaza` i `/sajam/<slug>/pasosi` na 390 i 1280 px.
Garaža i Pasoši su **referenca**: kad se ova tabela i ostatak dokumenta razlikuju, važi tabela.
Sve ostale sajamske strane (mapa, model, Glas publike, anketa, deli, „nije pronađeno“) i
zajednički delovi (zaglavlje, meni, sheet, prazna stanja) koriste iste vrednosti.

| Šta | Garaža i Pasoši | Token / pravilo |
|---|---|---|
| Podloga strane | hladni svetli papir `#f7f8f8` + blag sjaj akcenta gore desno (`radial-gradient(circle at 82% 5%, akcenat 7 %, providno 28 %)`) | `--fair-canvas`, `--fair-canvas-glow`; `.fair-event { background: var(--fair-canvas-glow), var(--fair-canvas) }` |
| Površine | topla krem `#fffdf8` na hladnoj podlozi | `--fair-surface` (nepromenjeno) |
| Zaglavlje | `#fffdf8`, tiha linija dole preko cele širine, 64 px, lepljivo; aktivna stavka menija: `accent-soft` + ivica akcenta, `md` | `.fair-shell` na svim stranama, i na Glasu publike; red „nazad + naslov“ toka je ispod njega, u sadržaju, kao na detalju pasoša |
| Naslov strane | akcenat, `clamp(28px, 8vw, 38px)`, 790, −0.05 em, visina reda 0.98; podnaslov 14/1.35 `ink-muted`, najviše 310 px | „Moja garaža“, „Pasoši“, „Izdvojeni modeli“, „Strana nije pronađena“ |
| Kartica strane | `surface` + tiha ivica 1 px + `xl` 24 + senka 2 (`0 8px 20px`, topla 12 %) | kartice modela u garaži, kartice deljenja, mapa, spisak, panel, kartica pitanja, specifikacije, hero modela |
| Kartica-red (traka) | `surface` + tiha ivica + `lg` 16 + senka 2 | čip pasoša u garaži, „Oceni model“ |
| Naslov kartice | 19–25 px, 790, −0.045 em; natpis iznad (brend) 10 px, 820, +0.075 em, verzal, akcenat | `.modelTopline`, `.modelContent h2` |
| Glavno dugme strane | `ink` podloga, beli tekst, `md` 12, 44 px, 780 | „Pogledaj“ (garaža, deli), „Sačuvaj u garažu“ (model) |
| Dugme u boji akcenta | akcenat, `md` 12 | poziv iz praznog stanja („Otvori mapu sajma“), slanje u formi i sheet-u |
| Sekundarno i ikonica-dugme | providno ili `surface` + **tiha** ivica (`--fair-border`), `md` 12, 44 × 44 | deli, ukloni, zatvori dijalog, kontrole mape, zatvori sheet, nazad |
| Jezičci (dva izbora) | traka `lg` 16, `surface` 92 %, tiha ivica, senka 2; izabrano: `surface` + linija akcenta 2 px dole; tekst 13 px, 780, −0.02 em | jezičci garaže; prekidač zona na mapi (indikator i dalje klizi) |
| Čip / filter | pilula 44 px, `surface` + **tiha** ivica; izabrano `ink` | filteri kategorija, čipovi mesta |
| Prazno stanje | kartica `xl` bez senke, ikonica u pločici `accent-soft` / akcenat, naslov regularne težine −0.04 em, kratak tekst, dugme akcenta | garaža bez modela, stanja mape, koraci u panelu mape |
| Sheet / dijalog | `surface`, `xl` gore, tiha ivica, senka 3 nagore; zatvaranje = ikonica-dugme `md` | `.fair-sheet`, sheet mape |
| Ivice | uvek 1 px; tiha (`line`) za kartice, dugmad i čipove; izražena (`line-strong`) samo za polja za unos i izbor u formi | |
| ScanMe zelena `#6FC05D` | samo ScanMe: ScanMe štand na mapi i dugme „Pronađi ScanMe“ | nigde drugde |

Šta se **ne** menja ovom referencom: ponašanje i sadržaj strana, pasoš (`components/fair/passport/**`,
Aleksino područje; on je već referenca), raspored i logika režima velikih ekrana (`?prikaz=ekran`),
koji dobija samo nove boje podloge, a kartice mu ostaju bez senke.

## 1. Karakter

- **Šta je:** svetla, topla, papirna površina za posetioca sajma sa telefonom u ruci. Prijatno,
  jasno i jednostavno (MASTER §14), bez tehničkog jezika ScanMe landinga.
- **Ličnost:** smiren organizator sajma, a ne aplikacija za igru. Mapa je glavna stvar, sve
  ostalo joj služi.
- **Tri prideva:** toplo, pregledno, sigurno.
- **Mod (impeccable):** Operate. Posetilac završava zadatak (nađi štand, otvori model, sačuvaj).
  Brend živi u preciznim detaljima: papir, grafit, jedan akcenat po sajmu.
- **Šta nije:** neon, staklo, skenerske linije, mono tipografija, gradijenti bez razloga,
  ukrasne animacije koje se vrte same.

## 2. Boje

| Token | Vrednost | Uloga |
|---|---|---|
| `--fair-canvas` | `#f7f8f8` (do SAJAM SUPER `#f1eee7`) | podloga strane, kao Garaža i Pasoši |
| `--fair-canvas-glow` | radijalni sjaj akcenta 7 % gore desno | drugi sloj podloge strane |
| `--fair-surface` | `#fffdf8` | kartice, sheet, kontrole |
| `--fair-surface-muted` | `#e9e5dc` | sekundarne grupe, skeleton, segmentirani prekidač |
| `--fair-surface-warm` | `#d8c7b6` | pozadina fotografije modela bez slike |
| `--fair-ink` | `#171918` | tekst, primarna crna dugmad, izabrani čip |
| `--fair-ink-muted` | `#62615d` | pomoćni tekst (5.6:1 na `surface`, 5.0:1 na `canvas`) |
| `--fair-line` | `#d8d1c7` | tiha ivica i separator |
| `--fair-line-strong` | `#bdb4a8` | izražena ivica (polja, čipovi) |
| `--fair-accent` | Elektromobilnost `#0b73e0`, Auto Moto Fest `#bd4f39` | radnja i izbor (jedan akcenat po sajmu) |
| `--fair-accent-strong` | `#075fb9` / `#a9412e` | hover, ivica primarnog dugmeta, tekst akcenta na svetlom |
| `--fair-accent-soft` | `#e6f2ff` / `#f4d7ce` | izabrana pozadina reda |
| `--fair-accent-ink` | `#fffdf8` | tekst preko akcenta |
| `--fair-focus` | `#075fb9` / `#6f3025` | fokus prsten (3 px, odmak 2 px) |
| `--fair-danger` | `#b42332` | greška |
| `--fair-shadow` | `rgb(72 52 42 / 0.12)` | boja senke, topla, iz tona podloge |
| `--fair-map-scanme` | `#6FC05D` | **samo** ScanMe štand na mapi (postavlja se inline na jednu lokaciju) |

Pravila:

- Akcenat je samo za radnju i izbor (primarno dugme, izabrani štand i red, fokus). Nikad dekoracija.
- Izabrani čip i aktivni filter su grafitni (`ink`), a ne akcenat: filter je alat, ne izbor objekta.
- ScanMe zelena nije sistemska boja. Van ScanMe štanda na mapi ne postoji.
- Pasoš (`components/fair/passport/**`, Aleksino područje) ima svoje `--passport-*` boje; ovaj
  dokument ih ne menja.

## 3. Tipografija

- Jedna porodica: **Archivo Variable** (rezerva Segoe UI, Arial). Brojevi `tabular-nums`.
- Težine su varijabilne, od 450 (pomoćno) do 780 (naslovi). Naslovi imaju negativan tracking
  (−0.02 do −0.055 em); natpisi iznad naslova su verzal sa +0.04 em.

| Uloga | Veličina / visina reda | Težina | Primer |
|---|---|---|---|
| Display (model H1) | clamp(27, 8vw, 35) px → 38 px od 768 | 760 | naziv modela |
| H1 strane / pitanje | 22 → 26 px (desktop), 1.15 | 780 | „Mapa sajma“ |
| H2 kartice | 20–22 px, 1.2 | 760 | „Štand 9 · Hala · 110 m²“ |
| H3 red | 16–17 px, 1.25 | 680–720 | izlagač u spisku |
| Body | 16 / 24 px | 400–620 | tekst, input |
| Pomoćno | 14 / 20 px | 450–650 | hint, meta |
| Labela | 13 / 18 px | 620–650 | labela polja, natpis |
| Natpis (overline) | 13 px, verzal, +0.04 em | 650 | „IZABRANI ŠTAND“ |

## 4. Razmak (baza 4)

| Token | Vrednost | Tipična upotreba |
|---|---|---|
| `--fair-space-1` | 4 px | ikona–tekst u čipu, unutrašnji odmak prekidača |
| `--fair-space-2` | 8 px | razmak između tap meta (najmanje), red u grupi |
| `--fair-space-3` | 12 px | razmak sekcija na telefonu, unutrašnji odmak reda |
| `--fair-space-4` | 16 px | gutter na telefonu, odmak kartice |
| `--fair-space-6` | 24 px | odmak velike kartice, razmak blokova na desktopu |
| `--fair-space-8` | 32 px | gutter na desktopu |
| `--fair-space-12` | 48 px | razmak velikih celina |

Ritam: tesno unutar grupe (4–8), srednje između grupa (12–16), široko između celina (24+).
Gutter: 16 px na telefonu (12 px ispod 375 px), 32 px od 1024 px.

## 5. Uglovi (pravilo ugnježdenja)

Unutrašnji radius je **pola** spoljašnjeg, a razmak između ivica je **jednak unutrašnjem**:
24 → 12 → 6 i 16 → 8 → 4. Tako su uglovi koncentrični.

| Token | Vrednost | Gde |
|---|---|---|
| `--fair-radius-xl` | 24 px | kartice strane (uvod, mapa, spisak, panel), sheet, dijalog, hero modela |
| `--fair-radius-lg` | 16 px | srednje kartice na podlozi (specifikacije, obaveštenja, saglasnost) |
| `--fair-radius-md` | 12 px | dugmad, polja, redovi, kartice unutar `xl` |
| `--fair-radius-sm` | 8 px | elementi unutar `lg`, male oznake, linije skeletona |
| `--fair-radius-xs` | 6 px | slike i logotipi unutar `md` kartica |
| `--fair-radius-2xs` | 4 px | trake, crtice, sitni markeri |
| `--fair-radius-pill` | 999 px | samo čipovi, filteri, segmentirani prekidač, bedževi i dugmad koja su pilule po dizajnu |
| `--fair-radius-round` | 50 % | krugovi (avatari, tačke, „chat head“) |

Primer: sheet `xl` 24 → kartica modela u njemu `md` 12 sa odmakom 12 → slika u kartici `xs` 6
sa odmakom 6. Uvodna kartica `xl` 24 sa odmakom 12 → dugme „Pronađi ScanMe“ `md` 12.

`0` i `inherit` su resetovanja, ne vrednosti skale. Okvir koji obavija karticu sa ivicom
koristi `calc(var(--fair-radius-xl) - <debljina okvira>)` (garaža, sponzorisani okvir).

Prevod starih vrednosti (35 različitih → 8 tokena): 20/22/24/25/26 → `xl`; 15–19 → `lg`;
14 → `lg` za kartice, `md` za dugmad; 10–13 → `md`; 7–9 → `sm`; 5–6 → `xs`; 2–4 → `2xs`;
110/999 → `pill`; 50 % → `round`.

## 6. Ivice

- Jedna debljina: `--fair-border-width` 1 px (anketa i kontakt su imali 1.5 px; sada 1 px).
- Dve nijanse: `--fair-border` (tiha, `line`) za kartice i separatore; `--fair-border-strong`
  (izražena, `line-strong`) za polja, čipove i sekundarna dugmad.
- Izabrano stanje menja boju ivice u akcenat (ili grafit za filter), nikad debljinu, da nema skoka.

## 7. Senke

Retke, tople i meke; hijerarhiju prvo nose površina, ivica i razmak.

| Token | Vrednost | Gde |
|---|---|---|
| `--fair-shadow-1` | `0 1px 3px` | kontrola koja miruje (izabrani segment, dugmad mape) |
| `--fair-shadow-2` | `0 8px 20px` | podignuto (plutajuće dugme, oblačić na mapi, kartica pri dodiru) |
| `--fair-shadow-3` | `0 16px 40px` | preko sadržaja (rezultati pretrage, dijalog, toast) |
| `--fair-shadow-3-up` | `0 -16px 40px` | donji sheet (isti nivo, okrenut nagore) |

Sve koriste `--fair-shadow` (topla, 12 %).

## 8. Pokret

| Token | Vrednost | Za šta |
|---|---|---|
| `--fair-dur-feedback` | 120 ms | povratna reakcija (pritisak, hover, boja) |
| `--fair-dur-state` | 200 ms | promena stanja (izbor, filter, izlaz overlay-a) |
| `--fair-dur-overlay` | 320 ms | overlay i raspored (sheet, rezultati, spisak, kamera mape) |
| `--fair-dur-focal` | 480 ms | jedan fokalni momenat po prikazu |
| `--fair-dur-stagger` | 40 ms | korak kaskade u listi (ukupno najviše 200 ms) |
| `--fair-dur-spin` / `--fair-dur-loop` | 800 / 1200 ms | samo beskonačne rotacije, progres i čekanje |
| `--fair-dur-instant` | 0.01 ms | reduced motion: keyframe staje odmah |
| `--fair-ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | ulaz i promena stanja (usporava, bez odskoka) |
| `--fair-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | izlaz (ubrzava, kraći od ulaza) |
| `--fair-ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` | pomeranje po ekranu i ciklusi čekanja |
| `--fair-ease-linear` | `linear` | samo beskonačna rotacija i progres |

Pravila:

- Svaka promena stanja ima prelaz; nijedna animacija se ne vrti sama radi ukrasa.
- Izlaz je brži od ulaza (ulaz 320 → izlaz 200).
- Animiraju se `transform`, `opacity`, boja; otvaranje sadržaja ide trikom sa gridom
  (`grid-template-rows: 0fr → 1fr`), ne visinom.
- JS animacije (framer-motion) čitaju iste vrednosti iz `components/fair/fair-motion.ts`.
- Trajanje u CSS-u je uvek token ili umnožak tokena (`calc(var(--fair-dur-loop) * 1.5)`).
- **Reduced motion:** bez pomeranja. Globalno pravilo u `fair-event.css` zaustavlja keyframe
  animacije na krajnjem stanju i ograničava prelaze na boju, providnost i stanje (`opacity`,
  `color`, `background-color`, `border-color`, `box-shadow`, `fill`, `stroke`…). Kamera mape,
  sheet i rotacija u JS-u zamenjuju pomak pretapanjem.

## 9. Komponente (zajednički rečnik)

| Komponenta | Oblik |
|---|---|
| Primarno dugme | akcenat, `md`, min. visina 48 (44 za sekundarne), težina 700 |
| Crno dugme (alat) | `ink` podloga, `md`, `--fair-shadow-2` samo kad pluta |
| Sekundarno dugme | `surface` + `--fair-border` (tiha, kao garaža), `md` |
| Ikonica-dugme | 44 × 44, `md`, `--fair-border` |
| Čip / filter | `pill`, 44 visine, `--fair-border` (tiha); izabrano = `ink` podloga |
| Prekidač zona (jezičci) | kao jezičci garaže: traka `lg`, `surface` 92 %, senka 2; izabrano `surface` + linija akcenta; indikator klizi |
| Kartica | `surface`, `--fair-border`, `xl` + `--fair-shadow-2` (strana) ili `lg` + senka 2 (traka) |
| Red liste | 56 visine, `md`, hover `canvas`, izabrano `accent-soft` + ivica akcenta |
| Input | 48 visine, `md`, `--fair-border-strong`, fokus prsten 3 px |
| Sheet | `xl` gore, `--fair-shadow-3-up`, ručka 40 × 4, lepljivo zaglavlje |
| Skeleton | `surface-muted`, isti uglovi i dimenzije kao konačni sadržaj |

Stanja su ista svuda: hover (samo gde pokazivač stvarno lebdi), fokus (prsten 3 px `focus`),
aktivno (pritisak, 120 ms), izabrano (akcenat ili grafit), onemogućeno (`disabled`, prigušeno,
bez kursora).

## 9a. Motion thesis glavne strane (mapa)

- **Fokalni momenat: izbor štanda.** Obris štanda se podebljava u akcentu, meki oreol se smiri, a
  jedan puls ode od obrisa (720 ms, jednom). Istovremeno kamera glatko dovodi štand u vidno polje
  (480 ms, `enter`), a panel (desktop) ili sheet (telefon) uđe sa izabranim štandom (320 ms).
- **Kontinuitet:** indikator zona klizi do izabrane zone (320 ms, `move`), a mapa zone se pretapa
  (200 ms). Grupa u spisku se otvara trikom sa gridom (320 ms, zatvaranje 200 ms), a redovi pri
  prvom otvaranju dolaze jedan za drugim (40 ms korak, najviše 200 ms). Rezultati pretrage ulaze
  (200 ms) i izlaze brže (120 ms). Stavke rotacije se pretapaju jedna u drugu (320 / 200 ms).
  Originalna mapa organizatora se pretapa umesto da se prebaci.
- **Povratna reakcija:** pritisak (skala 0.95–0.98) i boja za 120 ms; izabran filter menja samo
  boju (bez skoka); hover samo gde pokazivač stvarno lebdi.
- **Budžet:** kamera i oblačić su `transform` (framer-motion vrednosti, bez re-rendera po
  frejmu); puls je jedna SVG animacija koja se ne ponavlja; ništa se ne vrti samo.
- **Reduced motion:** kamera skače i kratko se pretopi (200 ms providnosti), puls i kaskada
  izostaju, indikator i spisak se menjaju odmah; boje, providnost i stanje ostaju.

## 10. Režim ekrana (`?prikaz=ekran`)

Zamrznut. Ne menja se u ovom zadatku: raspored, veličine i boje ostaju. Jedina tehnička
razlika je da `.root[data-display="on"]` vraća `--fair-radius-xl` na 20 px, da bi kartice na
ekranu zadržale ugao koji su imale pre skale.

## 11. Design DNA (JSON, design-dna šema)

```json
{
  "meta": {
    "name": "ScanMe Sajam automobila 2026 — event UI",
    "description": "Topla papirna površina za posetioce sajma: mapa štandova, model, garaža, pasoši.",
    "source_references": ["app/sajam/fair-event.css", "components/fair/map/fair-event-map.module.css", "components/fair/garage/fair-garage.module.css", "components/fair/passport/fair-passport.module.css"],
    "created_at": "2026-10-09"
  },
  "design_system": {
    "color": {
      "palette_type": "topla neutralna + jedan akcenat po događaju",
      "primary": { "hex": "#171918", "role": "tekst, crna dugmad, izabrani čip" },
      "secondary": { "hex": "#62615d", "role": "pomoćni tekst i ikone" },
      "accent": { "hex": "#0b73e0", "role": "radnja i izbor (Auto Moto Fest: #bd4f39)" },
      "neutral": { "scale": ["#fffdf8", "#f1eee7", "#e9e5dc", "#d8d1c7", "#bdb4a8", "#62615d", "#171918"], "usage": "površina → podloga → tiho → ivice → tekst" },
      "semantic": { "success": "#34734B", "warning": "#8A5A00", "error": "#b42332", "info": "#0b73e0" },
      "surface": { "background": "#f7f8f8 + radijalni sjaj akcenta 7 % (Garaža i Pasoši)", "card": "#fffdf8 + tiha ivica + --fair-shadow-2", "elevated": "#fffdf8 + --fair-shadow-3" },
      "contrast_strategy": "tekst ≥ 4.5:1; akcenat samo za radnju i izbor; status nikad samo bojom"
    },
    "typography": {
      "type_scale": {
        "display": { "size": "clamp(27px, 8vw, 35px)", "weight": "760", "line_height": "1.02", "tracking": "-0.055em" },
        "heading_1": { "size": "22px / 26px desktop", "weight": "780", "line_height": "1.15", "tracking": "-0.03em" },
        "heading_2": { "size": "20–22px", "weight": "760", "line_height": "1.2", "tracking": "-0.02em" },
        "heading_3": { "size": "16–17px", "weight": "680–720", "line_height": "1.25", "tracking": "0" },
        "body": { "size": "16px", "weight": "400", "line_height": "24px", "tracking": "0" },
        "body_small": { "size": "14px", "weight": "450–650", "line_height": "20px", "tracking": "0" },
        "caption": { "size": "13px", "weight": "620–650", "line_height": "18px", "tracking": "0" },
        "overline": { "size": "13px", "weight": "650", "line_height": "18px", "tracking": "0.04em, verzal" }
      },
      "font_families": { "heading": "Archivo Variable", "body": "Archivo Variable", "mono": "nema (tabular-nums umesto mono)" },
      "font_style_notes": "jedna varijabilna porodica; hijerarhija težinom i veličinom, ne drugim fontom"
    },
    "spacing": { "base_unit": "4px", "scale": [4, 8, 12, 16, 24, 32, 48], "content_density": "srednja (telefon), gušća u spisku", "section_rhythm": "12 px telefon, 16–20 px desktop" },
    "layout": {
      "grid_system": "jedna kolona na telefonu; od 1024 px mapa + fiksni desni panel 380 px; od 1440 px dve zone + panel 400 px",
      "max_content_width": "1440px (mapa), 560px (model, tokovi)",
      "columns": "1 / 2 / 3",
      "gutter": "16px telefon, 32px desktop",
      "breakpoints": ["375", "768", "1024", "1440"],
      "alignment_tendency": "levo poravnato, sadržaj u karticama"
    },
    "shape": {
      "border_radius": { "small": "6–8px", "medium": "12px", "large": "16–24px", "pill": "999px" },
      "border_usage": "1px, tiha (line) za kartice, izražena (line-strong) za polja i čipove",
      "divider_style": "1px line, bez senke"
    },
    "elevation": {
      "shadow_style": "retke, tople, meke senke sa pomakom",
      "levels": { "low": "0 1px 3px", "medium": "0 8px 20px", "high": "0 16px 40px" },
      "depth_cues": "površina i ivica pre senke; senka samo za ono što pluta"
    },
    "iconography": { "style": "outline", "stroke_weight": "1.8–2", "size_scale": "16 / 18 / 20 / 24px", "preferred_set": "lucide-react" },
    "motion": {
      "easing": "enter cubic-bezier(0.16, 1, 0.3, 1); exit cubic-bezier(0.4, 0, 1, 1); move cubic-bezier(0.65, 0, 0.35, 1)",
      "duration_scale": { "micro": "120ms", "normal": "200ms", "macro": "320ms (fokalno 480ms)" },
      "entrance_pattern": "pretapanje + mali pomak (8px) ili otvaranje gridom",
      "exit_pattern": "brže od ulaza (200ms), ubrzava",
      "philosophy": "pokret objašnjava stanje; nijedna animacija se ne vrti sama radi ukrasa"
    },
    "components": {
      "button_style": "md 12px; primarno akcenat, alat grafit, sekundarno ivica",
      "input_style": "48px, md, izražena ivica, fokus prsten 3px",
      "card_style": "surface + tiha ivica, xl 24px (strana) ili lg 16px",
      "navigation_pattern": "kompaktan lepljivi header: Mapa · Pasoši · Garaža",
      "modal_style": "donji sheet na telefonu, dijalog u garaži",
      "list_style": "redovi 56px sa logotipom, oznakom štanda i strelicom",
      "component_notes": "tap mete ≥ 44px sa razmakom ≥ 8px"
    }
  },
  "design_style": {
    "aesthetic": {
      "mood": "toplo, mirno, uslužno",
      "visual_metaphor": "štampana mapa sajma na papiru",
      "era_influence": "savremeni wayfinding",
      "genre": "event utility",
      "personality_traits": ["pregledan", "prijateljski", "pouzdan"],
      "adjectives": ["toplo", "pregledno", "sigurno"]
    },
    "visual_language": {
      "complexity": "niska",
      "ornamentation": "minimalna (papirna mreža na mapi)",
      "whitespace_usage": "umereno",
      "visual_weight_distribution": "mapa nosi težinu, alati su lagani",
      "focal_strategy": "izabrani štand: prsten akcenta, oblačić i panel",
      "contrast_level": "srednje-visok za tekst, nizak za ivice",
      "texture_usage": "fina mreža na papiru mape"
    },
    "composition": {
      "hierarchy_method": "veličina i težina, kartice",
      "balance_type": "asimetrično na desktopu (mapa + panel)",
      "flow_direction": "odozgo nadole: uvod → pretraga → zone → filteri → mapa → spisak",
      "grouping_strategy": "kartice i blizina",
      "negative_space_role": "odvaja alate od mape"
    },
    "imagery": {
      "photo_treatment": "fotografija modela sa toplim scrimom",
      "illustration_style": "vektorska mapa organizatora",
      "graphic_elements": "logotipi izlagača u belim kutijama",
      "pattern_usage": "mreža i šrafura na mapi",
      "image_shape": "zaobljeni pravougaonik po skali"
    },
    "interaction_feel": {
      "feedback_style": "tiha promena boje i blag pritisak",
      "hover_behavior": "samo gde pokazivač stvarno lebdi",
      "transition_personality": "brzo i mekano, bez odskoka",
      "loading_style": "skeleton u konačnim dimenzijama",
      "microinteraction_density": "niska"
    },
    "brand_voice_in_ui": {
      "tone": "jasno i ljubazno, srpski",
      "formality": "Vi-forma",
      "cta_style": "glagol + objekat (Pronađi ScanMe, Prikaži štand)",
      "empty_state_approach": "kaže šta da se uradi sledeće",
      "error_tone": "kaže šta nije uspelo i nudi Pokušaj ponovo"
    }
  },
  "visual_effects": {
    "overview": { "effect_intensity": "niska", "performance_tier": "lagano (telefon na sajmu)", "fallback_strategy": "reduced motion: bez pomeranja", "primary_technology": "CSS + framer-motion + SVG" },
    "background_effects": { "type": "nema", "description": "puna papirna podloga", "technology": "CSS", "params": { "color_palette": "canvas", "speed": "0", "density": "0", "opacity": "1", "blend_mode": "normal" } },
    "particle_systems": { "enabled": false },
    "notes": "Pasoš ima sopstvene efekte pečata (Aleksino područje); garaža ima animirani okvir sponzorisane trake."
  }
}
```
