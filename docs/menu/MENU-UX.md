# ScanMe Menu V1 — UX standard

> Ugovor za svaki UI korak runa MENI (K08–K33), uz recept `docs/menu/MENU-ARHITEKTURA.md`. Nastao u K07.
> Izvori, ovim redom: master §13.3, §15 i §20 (`ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md`), korekcije u `mockups/README.md`, `docs/MENI-PLAN.md` §3, `docs/admin/DASHBOARD-STANDARD.md`, AGENTS.md „Design and UX process".
> Mockupovi su smer, ne piksel: hijerarhiju i tokove uzimamo, boje, brojke i dimenzije ne.
> Kad korak promeni nešto što ovaj dokument opisuje, menja i dokument.

Skillovi korišćeni u K07, redom iz `rules.md`: `anthropic-skills:design-taste-frontend` (podtip: radna aplikacija, gustina 4–5, pokret 2–3, bez stalnih animacija), `anthropic-skills:ui-ux-pro-max` (pravila pristupačnosti, dodira i stanja; njegov predlog stila „Liquid Glass" sa teget-zlatnom paletom i Google fontovima je odbačen jer krši identitet ScanMe-a i pravilo o fontovima sa sopstvenog servera), `frontend-design:frontend-design` (plan tokena, jedan potpisni detalj po površini, tekst).

## 1. Tri površine, tri identiteta, jedan kvalitet

| | Klijentski panel i editor | Javni meni | Konobarski panel |
|---|---|---|---|
| Publika | vlasnik, menadžer i urednik lokala; netehnički; desktop u kancelariji, tablet za šankom, telefon u prolazu | gost za stolom, u sobi ili na ulici; telefon, jednom rukom, često slaba veza | konobar u smeni; telefon i tablet u ruci, desktop na pultu; prekidan rad |
| Jedan posao ekrana | Početna: „da li nešto traži pažnju?"; Editor: „uredi meni bezbedno, objavi kad si spreman" | „šta ima, koliko košta, šta mogu da uradim" | „šta je sledeće i koliko već čeka" |
| Identitet | ScanMe: topao svetao okvir, crna i ScanMe zelena kao jaki akcenti, mirne zaobljene kartice (master §13.3, mockup 00 i 01) | identitet lokala; ScanMe paleta se nikad ne nudi (master §15.2) | ScanMe, operativno: veći kontrast, mete 48 px, stanje uvek ikonica + boja + tekst |
| Tema | tema aplikacije (`data-theme` i klasa `dark` na `<html>`) | paleta lokala (svetla ili tamna); tema aplikacije je ne menja (P13) | tema aplikacije |
| Tokeni | `--mp-*` (`components/menu/zajednicko/tokeni.module.css`) | `--menu-*` (`lib/design-engine/menu-tokens.ts`) | `--mp-*` sa `data-povrsina="konobar"` |
| Potpisni detalj | **šav objave** (§1.1) | **cena kao tipografija** (§1.2) | **živi tajmer** (§1.3) |

### 1.1 Klijentski panel i editor

Jedan pažljivo osmišljen način rada (master §15.1): kontekstualne kontrole, napredno tek kad zatreba, bez gamifikacije i 3D-a (to je potpis admina, DASHBOARD-STANDARD §11). Režim se prikazuje nenametljivo („ScanMe Menu · Ugostiteljstvo"), nikad kao kontrola. Od K08 ga nosi shell, jednom po ekranu: tihi red ispod naziva lokala u bočnoj navigaciji, u gornjoj traci i u naslovu fioke ispod 1024 px. Naslovi sekcija ga ne ponavljaju.

**Shell klijentskog panela (K08, `components/menu/panel/`).** Bočna navigacija je mirna zaobljena površina na toplom okviru: znak ScanMe, naziv lokala i red režima (uz oznaku „Premium nalog" kad postoji), osam sekcija tačnim redom (master §13.1), 8 px razmaka, pa uloga („Vaša uloga: Vlasnik"; kad je lista kraća i „Ostale sekcije vide vlasnik i menadžer."), „Nazad na klijentski panel" (`LayoutGrid`) i „Skupi navigaciju". Uloga samo skraćuje listu, nikad je ne preuređuje (`lib/menu/panel-nav.ts`): Urednik vidi Početnu i Editor; sekcija van uloge otvorena linkom kaže ko je vidi i koga da zamoli. Izabrana stavka nosi i tanak zeleni prsten, jer meka zelena u tamnoj temi skoro nestaje. Osoblje nema klijentski panel: i ekran prijave i ekran „Ovaj nalog ne otvara ScanMe Menu" imaju karticu „Radite u smeni?" sa linkom „Kako da uđem u konobarski panel" (`/[slug]/konobar`); ekran bez pristupa ima i karticu za vlasnika na pogrešnom nalogu. Sekcija čiji ekran gradi kasniji korak ima oznaku „U pripremi" uz naslov i jednu karticu: šta ćete ovde raditi, „Otvori Editor" (jedino što danas radi) i šta će biti ovde, bez brojki; stavke koje uloga neće videti se ne obećavaju, a stavke koje otključava Premium nose oznaku „Premium" (katanac na Standardu uz jednu rečenicu, kvačica na Premium-u). Prijava ostaje u postojećem klijentskom panelu: shell ne crta svoju formu ni dugme za odjavu.

**Potpisni detalj — šav objave** (`SavObjave`, `components/menu/zajednicko/sav-objave.tsx`). Jedan red spaja ono što gosti vide (objavljena verzija i vreme) i ono što se uređuje (broj neobjavljenih izmena). Između je „šav": prošivena (isprekidana) linija dok se nacrt razlikuje od javne verzije, puna linija kad se ne razlikuje. Na telefonu je šav linija preko cele širine između dva reda, od 640 px elastičan šav u redu. Uz to ide stanje čuvanja (`Sačuvano`, `Čuva se…`, `Nije sačuvano`) kao tihi živi region; neuspeh nudi „Pokušaj ponovo" odmah pored (`onPonovo` ili `akcija`). Vreme objave dolazi već izrečeno („danas u 14:32", „12. 10. u 9:05"), nikad samo sat. Šav stoji u zaglavlju Editora (K10, K18) i na Početnoj (K27): to je master §13.2 „jasan status objavljene i radne verzije" i §6.1 „jasno stanje ima/nema neobjavljenih izmena". Ne ponavlja se na istom ekranu dvaput.

### 1.2 Javni meni

Brz, čitljiv, mobilni prvi; ne sme da izgleda kao generički template. Prestižni lokal dobija miran, tipografski rezultat (bez ikonica, sa jakom tipografijom i prostorom). Layouti `Tok`, `Kategorije` i `Kompaktno` (Kompaktno je samo tekst, bez slike i ikonice). Detalje grade K13 (linkovi, razdelnik, layouti, detalj), K14 (pretraga, alergeni, jezici, valuta) i K17 (izgled).

**Potpisni detalj — cena kao tipografija.** Cena je uvek u istom obliku i na istom mestu: cele cifre sa tačkom za hiljade i „RSD" (`1.490 RSD`), cifre iste širine (`tabular-nums`), poravnate uz desnu ivicu reda artikla, u boji naslova lokala. Akcija pokazuje regularnu cenu precrtanu i akcijsku pored nje, nikad samo procenat. EUR je sekundarni red, informativan: `~ 12,70 EUR`, samo uz svež kurs. Cena se nikad ne lomi u dva reda.

### 1.3 Konobarski panel

Operativan: jedan glavni ekran, najmanje koraka do radnje, glavne radnje najmanje 48 px, statusi `Novi → Prihvaćen → Završen` i poseban ishod `Otkazan` (master §10). Neutralan sto je crta, nikad „slobodan"; zauzetost postoji samo uz uključen modul.

**Potpisni detalj — živi tajmer.** Svaki zahtev pokazuje isti par svuda (red, sala, tabela, detalj): tačno vreme i proteklo vreme, `18:43 · čeka 08:12` (do sat vremena `mm:ss`, posle toga `h:mm:ss`). Tajmer se računa na klijentu iz `createdAt` i tika jednom u sekundi. Posle praga lokala (podrazumevano 15 min, podešava se u Podešavanjima) tajmer dobija boju opasnosti, ikonicu sata i reč „kasni", a čip jednom blago pulsira na svakih 10 s; uz `prefers-reduced-motion` nema pulsa, ostaju boja, ikonica i reč. Gradi ga K22, a pravila praga K23.

## 2. Boje

### 2.1 Tokeni panela i editora (`--mp-*`)

Tokeni su u CSS modulu `components/menu/zajednicko/tokeni.module.css`, pod sopstvenim prefiksom `--mp-` („Menu panel"). Svaka boja je alias admin tokena (`var(--admin-…, rezerva)`); van admina važi rezerva, a ona je jednaka admin vrednosti iste teme. Test `components/menu/zajednicko/tokeni.test.tsx` čita `app/globals.css` i pada čim se rezerva i admin vrednost razidu. `app/globals.css` nije menjan. Koren površine je `MenuPovrsina` (`povrsina.tsx`); portal (fioka, dijalog) nosi istu klasu sam (`MENU_TOKENI_KLASA`).

| Uloga | Token | Svetla | Tamna |
|---|---|---|---|
| okvir (pozadina aplikacije) | `--mp-okvir` | `#f8f7ef` | `#1d211f` |
| površina (kartica, panel) | `--mp-povrsina` | `#fffefa` | `#292e2b` |
| utišana površina | `--mp-povrsina-utisana` | `#eeeee8` | `#343a36` |
| tekst | `--mp-tekst` | `#171918` | `#f2f4ee` |
| sporedni tekst | `--mp-tekst-sporedni` | `#5f6462` | `#b0b6af` |
| mastilo (primarno dugme, izabrano) | `--mp-mastilo` / `--mp-na-mastilu` | `#202221` / `#ffffff` | `#f2f4ee` / `#171918` |
| ScanMe zelena (samo popuna) | `--mp-akcent` / `--mp-na-akcentu` | `#6fc05d` / `#171918` | isto |
| zelena kao tekst | `--mp-akcent-tekst` | `#2f6d23` | `#6fc05d` |
| meka zelena (izabrana stavka) | `--mp-akcent-meko` | `#e9f5e4` | `#22321f` |
| linija | `--mp-ivica` | `rgb(23 25 24 / 0.1)` | `rgb(242 244 238 / 0.12)` |
| ivica kontrole (polje, prekidač) | `--mp-ivica-kontrole` | `#7c817e` | `#8a918b` |
| istaknuta kartica (jedna po ekranu) | `--mp-istaknuto` / `--mp-na-istaknutom` | `#202221` / `#f2f4ee` | `#121513` / `#f2f4ee` |
| uspeh | `--mp-uspeh` (+ `-meko`, `-ivica`) | `#477d12` | `#a9dc70` |
| upozorenje | `--mp-upozorenje` | `#9a5b00` | `#ffc45f` |
| opasnost | `--mp-opasnost` / `--mp-na-opasnosti` | `#c72b37` / `#ffffff` | `#ff8b92` / `#171918` |
| info | `--mp-info` | `#2459b3` | `#8db7f5` |
| fokus | `--mp-fokus` (i globalni `--focus-ring`) | `#202221` | `#f2f4ee` |
| kostur učitavanja | `--mp-kostur` | `rgb(23 25 24 / 0.09)` | `rgb(242 244 238 / 0.1)` |

**Pravila:**
- ScanMe zelena `#6fc05d` ima 2,08:1 na svetloj površini: nikad nije tekst ni jedina oznaka izbora u svetloj temi. Zelena je popuna (dugme `akcent`, uključen prekidač) uz crno mastilo (7,9:1); zeleni tekst je `--mp-akcent-tekst`.
- Zelena ide samo na ScanMe stvari (akcent, izbor). Status „uspeh" je druga, tamnija zelena (`--mp-uspeh`) i uvek ide uz ikonicu i tekst.
- Status nikad nije samo boja: boja je na ikonici, tekst je u `--mp-tekst` (`StatusOznaka`). Mapa statusa proizvoda je u §5.2.
- Jedna istaknuta (tamna) kartica po ekranu: master §13.3 je daje analitici poslednjih 7 dana na Početnoj. Ona preuzima tokene teksta, pa primitivi u njoj ostaju čitljivi.
- Kontrast (test `tokeni.test.tsx`, u obe teme i na konobarskoj površini): tekst najmanje 4,5:1; ikonice statusa, ivice kontrola i fokus najmanje 3:1.

### 2.2 Konobarski panel

Ista tema i isti tokeni, uz `data-povrsina="konobar"`: okvir `#f3f4f1` / `#161917`, površina `#ffffff` / `#202422`, jača linija, meta `--mp-meta: 3rem` (48 px).

Vrste zahteva imaju sopstvenu boju, ikonicu i reč (oblik ikonice je glavni znak, boja pomaže):

| Vrsta | Ikonica (lucide) | Token | Svetla | Tamna |
|---|---|---|---|---|
| Poziv konobara | `Bell` | `--mp-vrsta-poziv` | `#c4323d` | `#ff8b92` |
| Račun (gotovina ili kartica) | `ReceiptText` | `--mp-vrsta-racun` | `#2459b3` | `#8db7f5` |
| Porudžbina (zahtev konobaru) | `ConciergeBell` | `--mp-vrsta-porudzbina` | `#0f7a68` | `#5fd0b8` |
| Rezervacija | `CalendarClock` | `--mp-vrsta-rezervacija` | `#9a5b00` | `#ffc45f` |

Porudžbina je smaragdna, ne ScanMe zelena i ne zelena uspeha, da se vrsta ne pomeša sa stanjem `Završen`. Tabela sale ima legendu vrsta (master §10). Kašnjenje je stanje tajmera (§1.3), ne nova vrsta.

### 2.3 Javni meni: kako nastaje paleta lokala

Javni meni ne koristi `--mp-*` ni temu aplikacije. Njegova paleta ima 8 uloga (`page`, `surface`, `title`, `body`, `accent`, `border`, `focus`, `icon`; `MENU_ROLES` u `lib/design-engine/menu-tokens.ts`) i nastaje ovako:

1. Lokal bira u Izgledu (K17) jednu od kuriranih paleta (`menuPresentation.paletteId`), svetlu ili tamnu, namenjenu hrani, piću i ugostiteljstvu, ili unosi do 3 boje brenda (`brandColors`).
2. Iz boja brenda `deriveMenuRoleColors` izvodi svih 8 uloga.
3. `compileMenuTokens` izvodi pratioce sa pragovima: `accent-text` i `body-muted` najmanje 4,5:1 prema stranici i površini, `on-accent` 4,5:1 na akcentu, `input-border` 3:1. Rezultat su promenljive `--menu-*` na korenu javnog menija.
4. Bez izbora važi paleta `default` (`MENU_DEFAULT_PRESENTATION`): topla neutralna (stranica `#F7F8F3`, akcent `#7A5C43`), ne ScanMe crno-zelena.

Lokal bira svetlu ili tamnu paletu; gostova tema uređaja i tema aplikacije je ne menjaju. Izlog pokazuje tamnu paletu lokala sa postojećim `?design=dark`; `?tema=` tu menja samo temu aplikacije (dugme teme), ne meni. Opcija „ScanMe" se ne nudi kao paleta javnog menija.

## 3. Tipografija

Panel, editor i konobarski panel koriste **DM Sans** (variable, već se učitava sa sopstvenog servera u `app/layout.tsx`, isto kao admin). Jedna porodica; hijerarhiju nose veličina, debljina i boja, ne druga porodica. Brojke koje se porede (cene, tajmeri, brojači) imaju `tabular-nums`. Bez verzala za oznake i bez nadnaslova iznad svakog naslova.

| Uloga | Panel i editor | Konobarski panel |
|---|---|---|
| Naslov ekrana (jedan H1) | 1,5 rem, od 1024 px 1,75 rem; 600; `-0.02em` | 1,5 rem; 700 |
| Naslov sekcije (H2) | 1,25 rem; 600 | 1,25 rem; 700 |
| Naslov kartice (H3) | 1 rem; 600 | 1,125 rem; 700 |
| Telo | 0,9375 rem (15 px) na desktopu, 1 rem na telefonu; visina reda 1,55 | 1 rem; 1,5 |
| Sporedni tekst | 0,875 rem; `--mp-tekst-sporedni` | 0,9375 rem |
| Oznaka statusa | 0,8125 rem (mala 0,75); 600 | 0,875 rem; 700 |
| Dugme | 0,9375 rem (kompaktno 0,875); 600 | 1 rem; 700 |
| Vreme i tajmer | — | 1,25 rem; 700; `tabular-nums` |
| Cena u editoru | 0,9375 rem; 600; `tabular-nums`; desno | — |

- Dužina reda najviše 65 znakova za opise (`max-w-[65ch]`).
- Polje za unos na telefonu ima najmanje 16 px, da iOS ne uvećava stranicu.
- Javni meni: par fontova lokala iz kuriranog spiska (`fontPairId`, K17; svi fontovi su lokalni, `@fontsource`). Telo najmanje 16 px. Serifni naslovi su dozvoljeni samo na javnom meniju (prestižni lokal), nikad u panelu.

## 4. Razmak, uglovi i senke

- Ritam 4 px: koraci 4, 8, 12, 16, 24, 32, 48. Unutar kartice 16 px na telefonu, 20 na tabletu, 24 na desktopu (`Kartica`). Između kartica 12–16 px, između sekcija 32–40 px.
- Uglovi: okvir ekrana 1,25 rem (`--mp-radius-okvir`), kartica 1 rem, unutrašnji element 0,5 rem (unutrašnji ugao je pola spoljašnjeg), polje 0,625 rem, dugme i oznaka su pilula. Tailwind `rounded-md/lg/xl` su u aplikaciji 2 px (`@theme inline` u `app/globals.css`), zato Menu uvek koristi `rounded-[var(--mp-radius-…)]`.
- **Dva globalna pravila van slojeva** u `app/globals.css` gaze svaku Tailwind klasu (`@layer utilities`): `* { border-color: var(--border) }` i `button { border-radius: var(--button-radius) }`. Zato Menu boju ivice zadaje promenljivom (`[--border:var(--mp-…)]`, podrazumevano `--border: var(--mp-ivica)` na korenu površine), a oblik dugmeta promenljivom `[--button-radius:…]` (`Dugme`). Klase `border-[boja]` i `border-transparent` u Menu komponentama ne rade; test `tokeni.test.tsx` ih zabranjuje. `app/globals.css` se ne menja.
- Dugme je pilula u panelu i editoru; u konobarskom panelu zaobljen pravougaonik 0,75 rem (`--mp-radius-dugme`, mockup 10 i 13), uz veće mete.
- Senke su obojene okvirom (`--mp-senka-xs/sm/md`, iste kao admin). Kartica ima liniju i najmanju senku; fioka i dijalog srednju. Bez sjaja i bez gradijenata kao ukrasa.
- Mete: `--mp-meta` = 44 px u panelu i editoru (i na desktopu), 48 px u konobarskom panelu. Između susednih meta najmanje 8 px.

## 5. Kontrole, stanja kontrola i primitivi

### 5.1 Primitivi (`components/menu/zajednicko/`)

| Primitiv | Fajl | Kada |
|---|---|---|
| `MenuPovrsina` | `povrsina.tsx` | koren svake Menu površine sa temom aplikacije; `povrsina="konobar"` za konobarski panel |
| `OkvirSekcije` | `okvir-sekcije.tsx` | imenovana oblast ekrana (H2 + rečenica + radnje); sama nema kutiju |
| `Kartica` | `kartica.tsx` | `obicna`, `utisana`, `istaknuta` (jedna po ekranu) |
| `ZaglavljeSaStatusom` | `zaglavlje-sa-statusom.tsx` | jedan H1 ekrana, red konteksta, status pored naslova, glavne radnje desno (na telefonu ispod) |
| `SavObjave` | `sav-objave.tsx` | stanje objave i čuvanja (§1.1) |
| `Dugme`, `IkonicaDugme` | `dugme.tsx` | radnje; ikonica-dugme uvek ima ime (`oznaka`) i opis na prelazu |
| `StatusOznaka` | `status-oznaka.tsx` | stanje: ikonica + boja + tekst |
| `PraznoStanje`, `GreskaStanje`, `UcitavanjeStanje`, `OfflineTraka` | `stanja.tsx` | §8 |
| `Prekidac`, `PoljePotvrde` | `prekidac.tsx` | pravi `<input type="checkbox">` (prekidač sa `role="switch"`) |
| `Fioka` | `fioka.tsx` (klijentska) | sporedni sadržaj ispod 1024 px (struktura editora, filteri, detalj stola na telefonu) |
| `TrakaRadnji` | `traka-radnji.tsx` | grupa radnji; `pozicija="dno"` je pričvršćena za dno ekrana ispod 1024 px |
| `IzlogTema` | `izlog-tema.tsx` (klijentska) | samo izlog: `?tema=` |

Pregled svih primitiva u svim stanjima: `/dev/menu-panel-preview?sekcija=primitivi` (`&fioka=otvorena` otvara fioku).

### 5.2 Stanja kontrola

| Stanje | Kako izgleda | Kako se oglašava |
|---|---|---|
| mirno | dugme: `primarno` mastilo, `akcent` zelena sa mastilom, `sekundarno` površina sa ivicom kontrole, `tiho` bez pozadine, `opasno` crvena | — |
| prelaz mišem | malo tamnija ili utišana pozadina, 120 ms | — |
| fokus | obris 2 px u `--mp-fokus`, razmak 3 px (globalno pravilo `:focus-visible`); kod prekidača i polja za potvrdu obris je na vidljivoj stazi | — |
| pritisak | `scale(0.98)`; bez toga uz reduced motion | — |
| onemogućeno | 50 % neprozirnosti, kursor „zabranjeno" | `disabled`; razlog stoji u tekstu pored (npr. oznaka „Premium") |
| radi se | oznaka ostaje (bez skoka), ikonica postaje kružić koji se okreće (uz reduced motion stoji) | `aria-busy`, `aria-disabled`, skriven tekst „Radi se…"; klik se ignoriše, fokus ostaje |
| pritisnuto (prekidačko dugme) | ivica mastila i meka zelena | `aria-pressed` |
| uključeno (prekidač) | zelena staza sa ivicom mastila, kružić desno sa kvačicom | `role="switch"` + `checked` |
| zaključano (Premium) | posvetljeni su samo staza i naziv; razlog (`opis`) ostaje pune čitljivosti, a pored naziva je oznaka „Premium" sa katancem (`oznaka`) | `disabled` + `aria-describedby` na razlog |
| izabrana stavka (navigacija, stranica u strukturi) | meka zelena podloga + linija mastila 3 px sa leve strane + podebljan tekst; nikad samo boja | `aria-current` |
| greška polja | crvena ivica i poruka ispod | `aria-invalid`, poruka sa `role="alert"` i u `aria-describedby` |

**Statusi proizvoda → ton `StatusOznaka`:**

| Stanje | Ton | Ikonica |
|---|---|---|
| Objavljeno, Završen | `uspeh` | `CircleCheck` |
| Nacrt ima izmene | `upozorenje` | `PencilLine` |
| Novi (zahtev, rezervacija) | `info` | `CircleDot` |
| Prihvaćen | `neutralno` | `Hand` |
| Otkazan | `neutralno` | `CircleSlash` |
| Nije sačuvano, objava odbijena | `opasnost` | `OctagonAlert` |
| Premium (zaključano) | `neutralno` | `Lock` |
| Privremeno nedostupno (artikal) | `upozorenje` | `CircleSlash` |

## 6. Ikonice

- Samo `lucide-react`, linija 1,75 (statusi 2), 20 px u dugmetu, 16 px u oznaci, 24 px u konobarskom panelu i praznim stanjima.
- Ukrasna ikonica ima `aria-hidden="true"`. Ikonica bez teksta je `IkonicaDugme` sa obaveznim imenom (`aria-label` i `title`).
- Ista stvar ima istu ikonicu svuda (npr. `Upload` za Objavi, `Eye` za Pregled, `PanelLeft` za strukturu). Bez emodžija.
- Ikonice artikala na javnom meniju su poseban set lokala (`components/menu/menu-glyph-map.ts`, K13/K15), ne lucide.

## 7. Pokret

Pokret samo objašnjava promenu stanja (master §15.1) i nikad ne zadržava rad.

| Šta | Trajanje | Kriva |
|---|---|---|
| prelaz mišem, pritisak, boja | 120 ms (`--mp-trajanje-1`) | `--mp-kriva-ulaz` `cubic-bezier(0.16, 1, 0.3, 1)` |
| promena stanja (prekidač, harmonika), svaki izlaz | 180 ms (`--mp-trajanje-2`) | ulaz kao gore, izlaz `--mp-kriva-izlaz` |
| pokret u okviru (fioka, premeštanje kartice) | 240 ms (`--mp-trajanje-3`) | isto |

- Animiraju se samo `transform` i `opacity`. Izlaz je kraći od ulaza. Nema ulaza stranice ni animacije pri prvom prikazu i kad pretplata donese iste podatke.
- Jedina stalna animacija je odsjaj kostura učitavanja (staje uz reduced motion) i puls tajmera koji kasni (§1.3).
- Prevlačenje (K11): podignuta kartica dobija senku `md` i blagi nagib 1°, mesto spuštanja je linija; uz reduced motion bez nagiba.
- `prefers-reduced-motion: reduce`: ništa se ne pomera ni ne okreće; ostaju promene boje i pretapanje do 120 ms. Sadržaj nikad ne zavisi od animacije.
- Biblioteka: CSS za sve što može (prelaz, fioka iz shadcn/ui), Framer Motion za lokalne prelaze rasporeda (K11 premeštanje). GSAP se ne uvodi u Menu panel.

## 8. Responsive pravila

Prelom je širina prozora, ne vrsta uređaja. Bez vodoravnog skrola stranice na svakoj širini; unutrašnji skrol samo za široku tabelu, uz vidljivu ivicu.

| Širina | Klijentski panel | Editor | Javni meni | Konobarski panel |
|---|---|---|---|---|
| **1440** | bočna navigacija (8 stavki, Analitika pretposlednja) + ekran do 90 rem | tri kolone: struktura ~18 rem, rad, pregled uživo ~25 rem (master §13.4) | kolona čitanja do ~40 rem po sredini; `Kategorije` mreža 3–4 | sala levo, radni red kao bočna kolona ~26 rem desno; jedan kontekstualni sidebar (bez stola: događaji i rezervacije; sa stolom: detalj stola) |
| **1024** | bočna navigacija; u Editoru se skuplja u traku ikonica | struktura i rad; pregled kao preklop (dugme `Pregled`) | kao 1440, uža kolona | sala + radni red jedno pored drugog, sala kraća |
| **768** | gornja traka sa dugmetom menija, navigacija u fioci sleva | rad preko cele širine; struktura u fioci sleva; pregled kao preklop | jedna kolona, veće slike | radni red preko cele širine; sala kao drugi prikaz (prekidač `Raspored / Tabela`), detalj kao fioka sdesna |
| **390** | gornja traka, fioka; kartice u jednoj koloni; glavne radnje u traci na dnu | jedan sadržaj i brzo prebacivanje `Struktura / Uredi / Pregled`; radnje nad artiklom u traci na dnu | mobilni prvi: jedna kolona, lepljiva navigacija sekcija, mete 44 px | radni red sa donjom navigacijom `Radni red / Sala`; glavne radnje 48 px desno u kartici zahteva |

- Globalno dugme teme aplikacije (`components/theme-toggle.tsx`, fiksirano dole desno, 44 px) postoji na svakoj stranici. `TrakaRadnji pozicija="dno"` zato ostavlja 4,25 rem slobodno desno, da dugme nikad ne pokrije glavnu radnju. K08: shell NE dobija svoj prekidač teme (dva prekidača za istu stvar bi zbunila); globalno dugme ostaje jedino, a sadržaj panela ima 6 rem slobodno na dnu ispod 1024 px.
- Shell (K08): od 1024 px bočna navigacija od 16 rem; „Skupi navigaciju" je pretvara u traku ikonica od 4,75 rem (naziv ostaje za čitač ekrana i kao opis na prelazu), a dok je otvoren Editor traka je podrazumevana. U traci se ne vide naziv lokala ni red režima, pa ih Editor (K10) nosi u svom zaglavlju. Ispod 1024 px gornja traka (dugme „Otvori navigaciju", naziv lokala i režim) i ista lista u fioci sleva; izbor sekcije zatvara fioku. Donja navigacija se ne koristi: osam stavki ne staje u nju bez skrivanja.
- Ispod 1024 px sporedni sadržaj ide u `Fioka` (sleva za strukturu i navigaciju, sdesna za detalj, odozdo za kratke izbore na telefonu).
- Editor (K10): raspored bira širina prozora (`components/menu/studio/shell/use-sirina.ts`) i montira se samo izabrani, pa se stranica od 400 artikala crta jednom: od 1280 px tri kolone (struktura 17 rem, rad, pregled 24 rem); 1024–1279 struktura i rad, pregled kao fioka sdesna; 768–1023 rad, struktura u fioci sleva (dugme „Stranica: …“), pregled kao fioka sdesna; ispod 768 `Struktura / Uredi / Pregled` (u `Izgled` režimu `Podešavanja / Pregled`). Dok je Editor otvoren shell širi sadržaj do 100 rem (`px-6`, bez gornjeg razmaka). Zaglavlje editora je lepljivo (ispod gornje trake shell-a na telefonu i tabletu) i uvek nosi `Objavi`; od 768 px u njemu je šav objave (`SavObjave` sa `neobjavljeneIzmene="ima"`, jer status nacrta zna da izmene postoje, ne koliko ih je), na telefonu jedna linija istog stanja. Sekcija sa više od 60 artikala počinje skupljena; pretraga otvara ono što nađe. Pregled uživo je samo za gledanje: `inert` i skriven od čitača ekrana, jer je isti sadržaj urediv i najavljen u radnom delu; do K13 ga crta postojeći javni renderer bez svojih orijentira (`pregled-sadrzaj.tsx`: bez `main` i `h1`).
- Raspored koji je na desktopu asimetričan na telefonu postaje jedna kolona.
- Izlog se snima na 1440 i 390 (svetla i tamna); tablet koraci dodaju 1024 i 768 (K32).

## 9. Obrasci stanja

| Stanje | Oblik | Primitiv |
|---|---|---|
| Učitavanje | kostur u obliku sadržaja (`lista`, `kartice`, `tabela`, `forma`), nikad sam kružić; `role="status"` sa skrivenim „Učitava se…" | `UcitavanjeStanje` |
| Prazno | ikonica u mekom zelenom krugu (motiv mockupova 01 i 02) + šta je prazno + zašto ili šta je sledeće + radnja koja ga puni | `PraznoStanje` |
| Prazno posle filtera | isti naslov svuda + „Očisti filtere" | `PraznoStanje` |
| Greška | šta nije uspelo + šta da uradite + „Pokušaj ponovo"; `role="alert"` | `GreskaStanje` |
| Bez veze | traka iznad sadržaja: „Nema veze sa internetom", od kada je prikaz, radnje koje traže vezu čekaju; ništa se ne pretvara da je poslato; `role="status"` | `OfflineTraka` |
| Čuvanje nacrta | `Čuva se…` → `Sačuvano`; neuspeh `Nije sačuvano` sa „Pokušaj ponovo", izmena ostaje na ekranu | `SavObjave` |
| Konflikt | obe vrednosti (sačuvana i vaša) i izbor, nikad tiho gaženje (K18) | — |
| Premium | zaključana kontrola ostaje vidljiva sa oznakom „Premium" i jednom rečenicom šta otključava | `StatusOznaka` + `Prekidac disabled` |

- Konobarski panel bez veze: tajmeri nastavljaju da teku lokalno, a radnje `Preuzmi` i `Završi` su onemogućene uz razlog; posle povratka veze stanje se ponovo čita (K23).
- Gost bez veze (K21): zahtev se ne šalje dok veze nema i to piše na dugmetu; gost nikad ne vidi „poslato" za nešto što nije stiglo.

## 10. Pristupačnost (WCAG 2.1 AA)

- Kontrast: tekst 4,5:1, ikonice, ivice kontrola i fokus 3:1, u obe teme (test tokena). Javni meni: pragovi iz `compileMenuTokens`.
- Tastatura: sve radi bez miša; „Pređi na sadržaj" je prvi element shell-a (K08), odmah posle globalnog dugmeta teme, koje `app/layout.tsx` stavlja prvo na svaku stranicu; redosled Tab-a prati vizuelni.
- Fokus je uvek vidljiv; posle zatvaranja fioke, dijaloga ili menija vraća se na element koji ga je otvorio (Radix uz `SheetTrigger`; bez okidača uzor je `components/admin/frame/admin-drawer.tsx`). Escape zatvara najbliži sloj.
- Semantika: jedan H1 po ekranu, oblasti (`main`, `nav`, `section` sa imenom), `aria-current` na izabranoj stavci, pravi `button`, `a`, `input`. Grupa radnji je `role="group"` sa imenom (ne `toolbar`, jer nema navigacije strelicama).
- Signal nikad nije samo boja: ikonica i tekst idu uz boju.
- Živi regioni: čuvanje i bez veze `polite`; greška koja blokira `alert`. Novi zahtev u konobarskom panelu se oglašava `polite` regionom sa vrstom i stolom (K22); zvuk je kratak, opcion i isključiv.
- Mete 44 px (konobar 48 px); 8 px razmaka između susednih.
- Zum 200 % i tekst 1,5× bez gubitka sadržaja i bez vodoravnog skrola na 390 px.
- `prefers-reduced-motion` (§7). Jezik dokumenta je `sr-Latn`; sav tekst za čitač ekrana je na srpskom.

## 11. Tekst

- Svaki nov tekst ide kroz `lib/i18n`. Površine: `menu-zajednicko` (primitivi, stanja, izlog; K07), `menu-panel` (K08), `menu-studio` (K10), `menu-javni` (K13), `menu-gost` (K21, K25), `menu-konobar` (K22), `menu-lokal` (K20), `menu-analitika` (K30), `menu-domen` (zajedničke reči i kodovi grešaka).
- Obraćanje je „Vi" u rečenicama, kao u postojećim Menu tekstovima (`menu-domen`, `menu-editor`, `ordering-panel`); dugmad su kratki glagoli („Objavi", „Pokušaj ponovo"). Admin (DASHBOARD-STANDARD §7) koristi „ti", jer je interni alat.
- Bez tehničkog jezika; ista radnja ima isto ime kroz ceo tok („Objavi" → „Objavljeno"). Jedinica uz broj i ispravan padež (`srPluralCategory`).
- Brojke u izlogu i mockupovima nisu podaci (master §20); izlog nosi oznaku „Izlog · izmišljeni podaci".

## 12. Izlog

Pet dev ruta (`docs/MENI-PLAN.md` §7, recept §9): `/dev/menu-panel-preview`, `/dev/menu-editor-preview`, `/dev/menu-public-preview`, `/dev/menu-lokal-preview`, `/dev/menu-konobar-preview`.

- Svaka ruta: `notFound()` kad je `NODE_ENV=production`, `metadata.robots = { index: false, follow: false }`, bez Convex poziva i bez prijave.
- Parametri se čitaju samo kroz `lib/menu/izlog-params.ts` (test `lib/menu/izlog-params.test.ts`): nepoznata vrednost daje podrazumevano stanje, ponovljen parametar važi po prvoj vrednosti.
- `?tema=svetla|tamna`: `IzlogTema` dok je ruta otvorena postavlja `data-theme` i klasu `dark` na `<html>`; pri izlasku vraća temu aplikacije (sačuvan izbor, inače sistemsku). Ništa ne upisuje u storage. Bez parametra važi tema aplikacije.
- Postojeći parametri i dalje rade: editor `state=empty`, `design=dark`; javni meni `state=long`, `design=dark`.
- Ekran koji gradi kasniji korak pokazuje iskreno stanje „Ovaj ekran gradi korak K..", sa linkovima na ostale ekrane rute, nikad lažan ekran.
- Fixtures: `components/menu/fixtures/` (mali oko 20, srednji oko 80 i veliki oko 400 artikala kao `MenuDraftSnapshot`; lokal sa stolovima, sobama i zonama; zahtevi, rezervacije i tim). Samo izmišljeni podaci (`gost@example.com`, `+381 60 000 0000`).

## 13. Provera

- Render testovi primitiva: `components/menu/zajednicko/*.test.tsx`, `components/menu/izlog/izlog.test.tsx` (`renderToStaticMarkup`, bez DOM-a).
- Tokeni: `components/menu/zajednicko/tokeni.test.tsx` (bez odstupanja od admina, kontrast u obe teme).
- Statički pregled kad dev server nije dostupan (K07): `node tmp/meni/k07-pregled/build.mjs` gradi klijentski paket istih komponenti (esbuild iz repoa, Tailwind preko `@tailwindcss/postcss`, fontovi lokalno) u `tmp/meni/k07-pregled/out/index.html`, a `snimi.mjs`, `iseci.mjs` i `ivice.mjs` u istom folderu ga snimaju preko `file://`. Dokazuje komponente, teme i interakcije, ne statuse ruta. Alat je lokalan (`tmp/` nije u gitu); ako zatreba trajno, premešta se u `scripts/` uz odluku.
- Snimci: `node .nocni-run/meni/alati/snimi.mjs --url http://localhost:3170 --rute "<rute>" --sirine 1440,390 --teme svetla,tamna --izlaz output/playwright/meni/<ID>`; snimak se pogleda pre bilo kakve tvrdnje o njemu. Ponašanje (tastatura, fokus, fioka) proverava Playwright skripta.
