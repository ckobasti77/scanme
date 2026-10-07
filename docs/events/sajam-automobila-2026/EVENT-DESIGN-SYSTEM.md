# ScanMe Sajam automobila 2026 - event dizajn-sistem

> Status: **ZAKLJUČAN ZA PRVI FRONTEND VERTICAL SLICE**
>
> Poslednje ažuriranje: **7. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
>
> Backend ugovor: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)
>
> Prvi vizuelni krug: [`MOCKUP-ROUND-1.md`](./MOCKUP-ROUND-1.md)

Aleksa je 2. oktobra 2026. izabrao `Topli showroom V5` kao početni javni vizuelni pravac i odobrio prvi frontend vertical slice. Implementacija sme da razvija ovaj pravac u browseru, ali ne sme samostalno da menja proizvodna pravila, backend ugovor ili opseg mape.

`MASTER-KONTEKST.md` definiše proizvod i zaključana poslovna pravila. `BACKEND-HANDOFF.md` definiše tehnički backend ugovor. Ovaj dokument definiše javni interfejs. Kontradikcije se ne rešavaju pretpostavkom, već se vraćaju komandnom centru.

## 1. Opseg

Ovaj sistem važi za:

- javnu stranicu skeniranog modela;
- mapu i display prikaz;
- garažu i sponzorisanu rotaciju;
- ocenjivanje, Glas publike i anketu;
- forme `Zainteresovan sam` i `Probna vožnja`;
- brend pasoš;
- javna loading, empty, success, error, disabled i offline stanja.

Produkcijsku mapu implementira kolega. Ovaj dokument definiše njen integracioni i stilski ugovor; komandni centar kasnije radi audit, ali u ovoj fazi ne pravi mapu.

Ne važi automatski za:

- ScanMe prelaunch i marketing stranicu;
- admin `Događaji`;
- PDF/XLSX izveštaje;
- prodajnu ponudu za izlagače.

## 2. Design read

Mobile-first event proizvod za široku publiku u hali. Mora da bude prijatan i lako razumljiv osobi koja prvi put vidi ScanMe, brz pri slabijoj mreži i čitljiv pod promenljivim svetlom. Vizuelni jezik treba da deluje savremeno i posebno za događaj, ali ne kao tehnički ScanMe prelaunch niti kao generička automobilska reklama.

Radni dial-ovi za procenu prototipa, ne finalne vrednosti:

- design variance: **6/10**;
- motion intensity: **6/10**, sa izraženim ali funkcionalnim feedbackom Glasa publike;
- visual density: **6/10**.

### Prvi krug vizuelnog zaključavanja

Ne bira se unapred jedan `Soft Atlas` pravac. Prvi krug poredi tri namerno različite, svetle i netehničke table iste stranice modela:

1. **Mirni editorial** - neutralna bela/svetlosiva, grafit i suptilan tamnocrveni akcenat.
2. **Topli showroom** - mekše tople neutralne površine, prijatniji oblici i nenametljiv zemljani akcenat.
3. **Gradski vodič** - hladnija svetla podloga, duboki plavo-grafitni kontrast i jasniji wayfinding.

Sve tri koriste potpuno isti sadržaj i hijerarhiju. Aleksa je izabrao `Topli showroom`, a V5 refinement je odobren kao baseline za implementaciju. Paleta se inicijalno uzorkuje iz V5 table i zatim fino podešava u stvarnom mobilnom browseru kroz jedan centralni `--fair-*` token sloj.

## 3. Zaključane UX granice iz master dokumenta

- Javni event interfejs je samo u svetloj temi.
- Mobile-first je obavezan.
- Event iskustvo ima sopstveni vizuelni identitet.
- Ne kopira se industrijski izgled ScanMe prelaunch stranice.
- ScanMe zelena je rezervisana isključivo za ScanMe štand na mapi. Ne koristi se za CTA, progres, selekciju ili dekoraciju drugih javnih ekrana.
- Ne koriste se mono body tipografija, scan linije, neon, tehnički jezik niti dominantno staklo.
- Sajam automobila je primarni identitet; ScanMe je sekundarno označen kao digitalni partner.
- Globalni theme toggle i globalni text-reveal su isključeni unutar event shell-a.
- Nijedna važna funkcija ne zavisi samo od hovera.
- Motion ne sme da uspori scan, unos ili rezultat.
- `prefers-reduced-motion` mora imati statičnu alternativu.
- Posetilac nema nalog i ništa ne preuzima dok sam ne zatraži PDF ili email izvoz garaže.
- Javne funkcije moraju imati loading, retry i pošten error prikaz. Ne prikazuje se lažna potvrda kada backend upis nije uspeo.

## 4. Audit postojećeg prototipa mape

Proverena je lokalna DEV ruta `/dev/sajam-cair` 1. oktobra 2026. na desktop viewportu i na 390 x 844 px. Provera je obuhvatila render, DOM dimenzije, tap mete, tastaturne kontrole i source kod.

### Ono što vredi sačuvati

- Mapa podržava pan, pinch zoom, zoom dugmad, izbor štanda, filtere, izbor ulaza i putanju.
- Štandovi imaju tastaturnu aktivaciju i pristupačna imena.
- Interaktivne kontrole na telefonu su uglavnom visoke najmanje 44 px.
- Na 390 px nema horizontalnog overflowa.
- Postoje reduced-motion i reduced-transparency grane.
- Desktop raspored mape i detalja jasno odvaja primarni i sekundarni sadržaj.
- Brend boja je ograničena na identitet brenda, dok ScanMe izbor ima svoj akcenat.

### Problemi koje finalni sistem mora da reši

1. **Mapa nije prvi mobilni zadatak.** Na 390 x 844 px mapa počinje oko 477 px od vrha. Header i filteri zauzimaju približno 463 px pre nego što korisnik vidi mapu.
2. **Kontrole su preširoko razložene.** Mobilni filteri i izbor ulaza koriste 279 px visine. Potrebna je kompaktnija hijerarhija sa progresivnim otkrivanjem sekundarnih filtera.
3. **Lista izlagača postaje veoma duga.** Trenutna mobilna sekcija zauzima približno 1744 px za postojeći skup. Potrebni su pretraga, grupisanje i skok do rezultata, ne samo puna lista dugmadi.
4. **Fit prikaz umanjuje informacije.** Na desktopu je cela hala vidljiva, ali su pojedini nazivi mali. Izabrani rezultat mora automatski da fokusira mapu bez oduzimanja korisničke kontrole.
5. **Vizuelni jezik još nije zajednički sistem.** Mapa ima lokalno hardkodovane boje, radijuse, fontove i senke. Ostali moduli bi ih trenutno morali kopirati ručno.
6. **Font token nije dosledan učitanom fontu.** CSS traži `Space Grotesk`, dok je u projektu učitana varijabilna porodica. Finalni token mora koristiti tačno učitano ime i provereni fallback.
7. **Staklo i dekorativne pozadinske forme trenutno nose previše karaktera.** Za rad u hali važniji su kontrast, stabilna površina i jasna mapa. Blur treba čuvati za sheet/modal kontekst, ne kao osnovu svake kartice.
8. **Prototip je izolovana mapa.** Nema zajednički event shell, navigaciju ka garaži i pasošu, niti stanja vezana za backend capabilities.
9. **Sadržaj je hardkodovan.** Brendovi, štandovi i geometrija prototipa nisu produkcijski ugovor niti potvrđeni sajamski podaci.
10. **Početni ScanMe `S` znak je placeholder.** Finalni event shell mora koristiti odobreni ScanMe identitet i posebno definisan event lockup.

## 5. Preporučeni vizuelni temelji

Vrednosti u ovom odeljku su zaključani početni ugovor za prvi vertical slice. Fino podešavanje nijansi u browseru ne menja semantiku tokena.

### 5.1 Paleta i semantički tokeni

| Uloga | Predlog | Namena |
|---|---|---|
| `event.canvas` | određuje izabrani pravac | glavna svetla pozadina |
| `event.surface` | određuje izabrani pravac | glavna puna površina |
| `event.surfaceMuted` | određuje izabrani pravac | sekundarne grupe i skeleton |
| `event.ink` | grafitni opseg | primarni tekst i glavne akcije |
| `event.inkMuted` | neutralni sivi opseg | pomoćni tekst |
| `event.line` | nizak kontrast prema canvasu | granice i separatori |
| `event.accent` | određuje izabrani pravac | akcija, izbor i fokus van mape |
| `event.accentInk` | kontrast prema akcentu | tekst preko akcenta |
| `event.focus` | određuje izabrani pravac | jasno vidljiv fokus |
| `event.scanmeStand` | `#C6FF4A` | isključivo ScanMe štand na mapi |
| `event.danger` | `#B42332` | greška |
| `event.success` | `#34734B` | uspešan upis |
| `event.warning` | `#8A5A00` | upozorenje i čekanje |

Pravila:

- svaki izabrani pravac ima jedan sopstveni akcenat kroz javne ekrane;
- `event.scanmeStand` se ne koristi van ScanMe štanda na mapi;
- brend boje automobila koriste se samo za identitet tog brenda, ne za sistemske akcije;
- status nikada ne zavisi samo od boje;
- ne mešati plavu i narandžastu unutar istog događaja niti ih koristiti kao sekundarne sistemske akcente;
- ne koristiti čistu crnu za velike površine;
- fotografija modela ne diktira boju interfejsa.

**ZAKLJUČANO 7. OKTOBRA — IDENTITET PO DOGAĐAJU:**

- `Elektromobilnost 2026` koristi plavi event akcenat i moderni digitalni pasoš u pravcu odabranog mockupa A;
- `Auto Moto Fest 2026` koristi narandžasti event akcenat, a njegov budući pasoš razvija se iz mockupa B sa fizičkim pasoš/poštanska-marka karakterom;
- semantičke uloge tokena ostaju zajedničke, ali se njihove vrednosti menjaju po `eventSlug`-u;
- pečat događaja pojavljuje se jednom u zaglavlju detalja pasoša i ne ponavlja se preko kartica modela;
- pregled pasoša prikazuje logo/naziv brenda, progres tačke i oznaku `Novo`, bez numeričkog `N/M` i bez fotografija modela;
- detalj koristi velike kartice modela; zaključana kartica ima prigušenu fotografiju, gradijent iza teksta i put ka štandu na mapi.

### 5.2 Tipografija

**ZAKLJUČANO ZA PRVI SLICE:**

- UI, body i veliki nazivi: `Archivo Variable`, fallback `Segoe UI`, `Arial`, sans-serif;
- brojevi, vremena i statistika: ista UI porodica sa `font-variant-numeric: tabular-nums`;
- monospace nije osnovni javni font.

Minimalne mobilne veličine:

- body: 16 px / 24 px;
- pomoćni tekst: 14 px / 20 px;
- labela kontrole: 13 px / 18 px, samo kada nije jedini opis akcije;
- H1 modela: 32-40 px, zavisno od dužine;
- H2: 24-28 px;
- cena: najmanje 20 px, tabularni brojevi.

### 5.3 Razmak, grid i oblik

- Osnovna spacing jedinica: 4 px.
- Najčešći razmaci: 8, 12, 16, 24, 32 i 48 px.
- Mobilni horizontalni gutter: 16 px, najmanje 12 px na vrlo uskim ekranima.
- Tablet gutter: 24 px.
- Display/desktop sadržaj: maksimalno 1440 px, sa 32-48 px gutterom.
- Kontrole: najmanje 48 px visine za glavne akcije, najmanje 44 x 44 px za ikonice.
- Glavne površine: radius 20 px.
- Polja i standardne kontrole: radius 12 px.
- Pills su dozvoljeni samo za filter/segmented control i kratka statusna stanja.
- Senke su retke i blago obojene tonom podloge. Hijerarhija se prvenstveno dobija površinom, granicom i razmakom.

## 6. Komponente

### Dugmad

- Jedna primarna akcija po prikazu.
- Primary: akcent podloga i kontrastan tekst iz izabranog pravca.
- Secondary: puna svetla površina, jasna granica i graphite tekst.
- Tertiary: tekstualna akcija sa minimalnom tap metom 44 x 44 px.
- Destructive se ne meša sa primarnom bojom.
- Loading stanje onemogućava ponovni submit i čuva širinu dugmeta.
- Disabled koristi semantiku `disabled`, ne samo nižu opacity vrednost.

### Inputi

- Vidljiva labela iznad polja.
- Helper tekst ispod labele ili polja kada je potreban.
- Greška direktno ispod problematičnog polja.
- Validacija nakon blur-a ili pokušaja slanja, ne agresivno pri svakom karakteru.
- `email`, `tel` i odgovarajući `inputMode` otvaraju ispravnu mobilnu tastaturu.
- Prvo nevalidno polje dobija fokus nakon submit-a.

### Sheet i modal

- Na telefonu se za kratke akcije koristi bottom sheet sa jasnim naslovom i close kontrolom.
- Rezultat skeniranja/model nije modal. To je prava ruta koja može da se ponovo otvori.
- Glas publike može biti full-screen tok, ali uvek ima jasan izlaz i čuva već poslate glasove.
- Ne zatvarati sheet sa nepotvrđenim unosom bez upozorenja.

### Toast

- Koristi se samo za kratku potvrdu ili prolaznu grešku.
- Kritična greška i retry ostaju inline u kontekstu funkcije.
- Toast ne krade fokus i koristi `aria-live="polite"`.

## 7. Sistem stanja

| Stanje | Obavezno ponašanje |
|---|---|
| loading | skeleton koji čuva konačne dimenzije; spinner samo unutar male akcije |
| empty | kratko objašnjenje i sledeća moguća akcija, bez dekorativnog praznog ekrana |
| success | jasno potvrđuje šta je sačuvano ili poslato |
| error | navodi šta nije uspelo i nudi `Pokušaj ponovo` kada je bezbedno |
| disabled | objašnjivo iz konteksta; kontrola nije interaktivna |
| offline | postojeći lokalni sadržaj ostaje čitljiv; mrežne akcije jasno čekaju ili nude retry |
| rating saved | prikazuje samo lične ocene; javni prosek i broj ocena ne postoje |
| vote below threshold | prikazuje lični odgovor i neutralno čekanje, bez procenta drugih glasova |
| not entitled | funkcija se ne prikazuje kao pokvareno dugme; capabilities određuje šta postoji |

## 8. Motion

Motion mora da objasni hijerarhiju, feedback ili promenu stanja.

**Osnovni tokeni:**

- `fast`: 160 ms;
- `base`: 240 ms;
- `slow`: 360 ms;
- `audienceResult`: oko 750 ms;
- enter: ease-out;
- exit: oko 70% trajanja enter animacije;
- animirati samo transform i opacity kada je moguće.

Sinhronizovana ispuna odgovora i rast procenta u Glasu publike koriste namensku GSAP timeline animaciju: brz početak, kontrolisan ramp-down pri kraju i potpuno statičan krajnji prikaz u `prefers-reduced-motion` režimu. React/server odgovor ostaje izvor podataka; GSAP ne odlučuje koji je glas sačuvan.

Dozvoljena upotreba:

- kratki state transition pri čuvanju ili promeni prikaza;
- promena ocene i glasa;
- pečat u pasošu;
- `Dodato u garažu` feedback;
- sponsored map reveal i isticanje štanda;
- prelaz između pitanja u Glasu publike.

Nije dozvoljeno:

- blokirati input do kraja animacije;
- automatski skrolovati korisnika bez jasnog razloga;
- beskonačno pulsiranje više elemenata;
- pomerati layout animiranjem width/height/top/left;
- custom kursor;
- motion koji se ne gasi u reduced-motion režimu.

## 9. Informaciona arhitektura po površini

### Stranica modela

Redosled na telefonu:

1. kompaktan event-first header sa `Mapa` i `Garaža`;
2. opciona fotografija preko koje mogu da stoje logo, naziv, varijanta i cena;
3. tri do četiri ključne specifikacije;
4. vidljiv disclosure `Sve specifikacije i opis`;
5. kompaktan CTA za Glas publike;
6. ujednačene akcije `Oceni model`, `Zainteresovan sam` i `Probna vožnja`, isključivo prema capability-jima;
7. sticky `Sačuvaj u garažu`;
8. proširene grupisane specifikacije i opcioni opis;
9. kratka anketa i pasoš kada postoje.

Fotografija nije obavezna. Bez fotografije raspored mora da deluje završen, jer korisnik stoji ispred automobila.

Event shell je kompaktan sticky header. Sadrži primarni identitet Sajma automobila i stalne akcije `Mapa` i `Garaža`. Broj sačuvanih modela je jasno oblikovan kao badge vezan za ikonicu Garaže, a ne kao deo naziva. ScanMe potpis se diskretno prikazuje niže na stranici i ne zauzima prvi ekran. Na telefonu shell poštuje safe-area i tap mete od najmanje 44 px.

### Mapa

- Mapa mora biti vidljiva u prvom mobilnom viewportu.
- Search/izlagač je primarna prečica.
- Filteri su sekundarni i ne smeju da potisnu mapu ispod prevoja.
- Izabrani štand ima istovremeno tekstualni detalj i vizuelno isticanje.
- Display koristi isti sadržaj, ali drugi layout i bez mobilnih touch kontrola.
- ScanMe zelena označava samo ScanMe štand. Ostali elementi koriste zajedničke event tokene.
- Brend sa aktivnim pasošem ima eligibility oznaku i lični progres `N/M`.
- Advanced rotacija ne prikazuje niti beleži pasivne impression metrike.

### Garaža

- Dva event taba, trenutno aktivni sajam je prvi.
- Lista sačuvanih modela je primarni sadržaj.
- Poređenje je eksplicitna akcija za najviše dva modela, ne podrazumevana tabela preko cele strane.
- Poslednji poznati naziv, cena i fotografija ostaju čitljivi bez mreže uz jasnu oznaku da podaci možda nisu sveži.
- Svi aktivni pasoši prikazuju se i kada imaju `0/N` pečata.
- Nakon kompletiranja, izbora favorita i eksplicitnog čuvanja prikazuje se lokalni digitalni badge sa zvaničnim logom brenda.
- Sponsored traka je jasno označena, ravnopravno rotira modele i ima odvojene akcije `Pogledaj` i `Dodaj u garažu`.
- Dodavanje nikada nije automatsko.
- Traka je fixed na dnu, približno 88-104 px plus safe-area; stranica dobija isti bottom inset. Rotira na 8 sekundi i pauzira se tokom interakcije.
- Mere se samo eksplicitne akcije `Pogledaj` i `Dodaj u garažu`, nikada pasivno prikazivanje.
- PDF/email izvoz se prikazuje kao sekundarna akcija na zahtev.

### Glas publike i anketa

- Jedno pitanje po ekranu.
- Jasne progress tačke kada postoji više pitanja.
- Glas publike je zasebna full-screen ruta sa jasnim izlazom.
- Tap meta celog odgovora, ne mali radio krug.
- Nakon glasa odmah se prikazuje dozvoljeni rezultat ili stanje čekanja.
- Nakon rezultata korisnik bira `Sledeće`; tok ga ne prebacuje automatski.
- Glas se može promeniti; obična anketa se nakon finalnog slanja ne menja.
- Tap odmah daje pressed/selected feedback. Procenti i ispune počinju tek nakon uspešnog server odgovora, ali prelaz mora subjektivno delovati neprekinuto.
- Ispod praga od pet glasova prikazuje se samo lični izbor i diskretno `Rezultati uskoro`, bez izmišljenih procenata.
- Iznad praga ceo element odgovora puni se sleva nadesno do celobrojnog procenta. Izabrani odgovor dobija tanak border i snažniji tonalitet; nema checkmarka niti zasebnog progress bara.
- Posle poslednjeg pitanja prikazuje se jednostavna akcija `Nazad na model`, bez automatskog preusmeravanja.

### Brend pasoš

- Jasno prikazuje ukupan broj potrebnih i osvojenih pečata.
- Svaki pečat odgovara stvarnom modelu, bez generičke dekoracije.
- Kompletiranje otključava izbor omiljenog modela.
- Favorit može da se promeni.
- Posle izbora favorita korisnik može eksplicitno da sačuva badge u lokalnoj garaži.
- Ne obećava fizičku nagradu.

## 10. Prvi high-fidelity mockup krug

Prave se tri zasebne vizuelne table, bez HTML prototipa. Svaka table koristi telefon širine približno 390 px, isti Audi RS 3 Sportback sadržaj, Napredni paket, event `Auto Moto Fest` i tri uzastopna scroll stanja iste stranice:

1. model, cena, kompaktna fotografija, highlights i čuvanje;
2. Glas publike, grupisane specifikacije i tri lične ocene;
3. probna vožnja, kratka anketa i Audi pasoš.

Fotografija je sekundarna i mora moći potpuno da nestane bez rupe u rasporedu. Prvi krug samo prikazuje lead akciju, ne otvorenu formu. Sadržaj i hijerarhija moraju biti isti u sva tri pravca, bez ScanMe zelene, mono fonta, scan linija, neon efekta, tehničkog jezika ili dominantnog stakla.

Kriterijumi pre predstavljanja:

- cena, najviše četiri ključne specifikacije i čuvanje vide se bez traženja;
- Glas publike je uočljiv, ali ne potiskuje podatke o vozilu;
- probna vožnja dolazi tek posle specifikacija;
- passport progres je razumljiv bez dodatnog objašnjenja;
- sticky header i sticky CTA ne prekrivaju sadržaj;
- tap mete su najmanje 44 px, a raspored je realno izvodljiv na 375-390 px;
- ScanMe ostaje sekundarni potpis digitalnog partnera.

## 11. Breakpoint ugovor

**ZAKLJUČANO:**

| Režim | Širina | Pravilo |
|---|---:|---|
| mali telefon | 320-374 px | funkcionalan fallback bez horizontalnog overflowa; ne žrtvovati glavni 375-390 px raspored da bi sve stalo iznad prevoja |
| ciljni telefon | 375-767 px | jedna kolona; na 375 x 667 prvi ekran prikazuje podatke i sve dostupne primarne akcije |
| tablet | 768-1023 px | dve kolone samo kada čuvaju čitljivost |
| desktop | 1024-1439 px | kontrolisana dva panela, bez rastezanja teksta |
| veliki display | 1440 px i više | poseban display composition, isti podaci i tokeni |

Obavezne provere: 375 px telefon, 390 px telefon, iPhone Safari, Android Chrome, landscape telefon i stvarna display rezolucija kada bude poznata.

## 12. Šta je odbačeno iz automatske preporuke dizajn alata

Automatski UI alat je predložio App Store landing strukturu, istovremenu narandžasto-plavu paletu, dominantni glassmorphism i Inter/Playfair kombinaciju. To se ne prihvata zato što:

- ovo nije download landing stranica niti native app listing;
- istovremena narandžasta i plava razvodnjavaju identitet jednog događaja; svaka se koristi samo kao sopstveni event akcenat prema zaključanom pravilu iz 5.1;
- serif body smanjuje brzinu čitanja operativnog interfejsa;
- staklo na svim površinama smanjuje kontrast u hali;
- predlog ne uzima u obzir mapu, garažu, scan tok i event-only svetlu temu.

## 13. Otvorene odluke za zajedničko zaključavanje

1. Kolegin map tok naknadno prolazi audit zajedničkih tokena, passport stanja i stvarne display rezolucije.
2. Finalni pravni tekst lead sheet-a zaključava se pre produkcijskog uključivanja formi.
3. Tačne produkcijske fotografije i logotipi stižu od izlagača; Audi materijal iz mockupa je samo razvojni fixture.

## 14. Gate za implementaciju

Dozvoljeno je implementirati prvi frontend vertical slice direktno pod `/sajam/...`, uz sledeće granice:

- sve event rute ostaju `noindex`, nisu deo javne navigacije i ne deployuju se u produkciju bez Aleksinog go/no-go;
- backend B0/Bn se ne izmišlja niti menja; dok nije dostupan koristi se tipizirani fixture adapter;
- frontend agent ne menja `convex/`, `/r/[cardCode]`, `lib/fair-contract.ts`, `lib/fair-entitlements.ts` ili `app/api/fair/**`;
- jedan centralni event token i primitive sloj je obavezan; nema lokalnih kopija dizajna po feature-u;
- lead sheet može biti vizuelno implementiran, ali ne prikazuje lažan uspeh niti šalje podatke bez backend ugovora;
- nema push-a, deploya ni produkcijskog povezivanja u ovoj fazi.
