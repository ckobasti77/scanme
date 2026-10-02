# ScanMe Sajam automobila 2026 - event dizajn-sistem

> Status: **DRAFT ZA ALEKSIN PREGLED - NIJE ZAKLJUČAN ZA IMPLEMENTACIJU**
>
> Poslednje ažuriranje: **2. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
>
> Backend ugovor: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)

Ovaj dokument priprema jedinstven vizuelni i UX ugovor za javno sajamsko iskustvo. Dok Aleksa ne potvrdi stavke označene kao **PREDLOG**, dokument nije dozvola agentima da samostalno implementiraju finalni izgled.

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

Ne važi automatski za:

- ScanMe prelaunch i marketing stranicu;
- admin `Događaji`;
- PDF/XLSX izveštaje;
- prodajnu ponudu za izlagače.

## 2. Design read

Mobile-first event proizvod za široku publiku u hali. Mora da bude prijatan i lako razumljiv osobi koja prvi put vidi ScanMe, brz pri slabijoj mreži i čitljiv pod promenljivim svetlom. Vizuelni jezik treba da deluje savremeno i posebno za događaj, ali ne kao tehnički ScanMe prelaunch niti kao generička automobilska reklama.

Radni dial-ovi za procenu prototipa, ne finalne vrednosti:

- design variance: **6/10**;
- motion intensity: **5/10**;
- visual density: **6/10**.

### PREDLOG: `Soft Atlas`

Preporučeni pravac je svetli, taktilni digitalni vodič kroz sajam. Osnova je precizna mapa i jasna hijerarhija, ublažena prijatnim površinama i kontrolisanom dubinom. ScanMe zelena služi za akciju, izbor i progres, ne kao velika dekorativna površina.

Razlika koju korisnik treba da zapamti: sadržaj sa fizičkog štanda prirodno prelazi u ličnu digitalnu kolekciju. Taj prelaz se dosledno prikazuje kratkom scan/reveal animacijom i jasnim stanjem `sačuvano`, a ne dekorativnim automobilskim efektima.

## 3. Zaključane UX granice iz master dokumenta

- Javni event interfejs je samo u svetloj temi.
- Mobile-first je obavezan.
- Event iskustvo ima sopstveni vizuelni identitet.
- Ne kopira se industrijski izgled ScanMe prelaunch stranice.
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

Sve vrednosti u ovom odeljku su **PREDLOG** dok ih Aleksa ne potvrdi.

### 5.1 Paleta i semantički tokeni

| Uloga | Predlog | Namena |
|---|---|---|
| `event.canvas` | `#F3F1EC` | glavna svetla pozadina |
| `event.surface` | `#FFFDFC` | glavna puna površina |
| `event.surfaceMuted` | `#EAE7E0` | sekundarne grupe i skeleton |
| `event.ink` | `#202624` | primarni tekst i glavne akcije |
| `event.inkMuted` | `#606864` | pomoćni tekst |
| `event.line` | `rgb(32 38 36 / 0.14)` | granice i separatori |
| `event.accent` | `#C6FF4A` | ScanMe izbor, progres i primarni CTA |
| `event.accentInk` | `#202624` | tekst preko akcenta |
| `event.focus` | `#476D00` | fokus koji je vidljiv i na svetloj podlozi |
| `event.danger` | `#B42332` | greška |
| `event.success` | `#34734B` | uspešan upis |
| `event.warning` | `#8A5A00` | upozorenje i čekanje |

Pravila:

- jedna ScanMe akcent boja kroz sve javne ekrane;
- brend boje automobila koriste se samo za identitet tog brenda, ne za sistemske akcije;
- status nikada ne zavisi samo od boje;
- ne koristiti plavu i narandžastu kao dodatne sistemske akcente;
- ne koristiti čistu crnu za velike površine;
- fotografija modela ne diktira boju interfejsa.

### 5.2 Tipografija

**PREDLOG:**

- UI i body: `DM Sans Variable`, fallback `Segoe UI`, `Arial`, sans-serif;
- display i veliki nazivi: `Space Grotesk Variable`, fallback `Arial`, sans-serif;
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
- Primary: akcent podloga i graphite tekst.
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
| below threshold | prikazuje lični odgovor i neutralno čekanje, bez procenta drugih glasova |
| not entitled | funkcija se ne prikazuje kao pokvareno dugme; capabilities određuje šta postoji |

## 8. Motion

Motion mora da objasni hijerarhiju, feedback ili promenu stanja.

**PREDLOG tokena:**

- `fast`: 160 ms;
- `base`: 240 ms;
- `slow`: 360 ms;
- enter: ease-out;
- exit: oko 70% trajanja enter animacije;
- animirati samo transform i opacity kada je moguće.

Dozvoljena upotreba:

- kratki scan/reveal pri otvaranju modela;
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

1. event/brand kontekst i povratak na mapu;
2. naziv, varijanta i cena;
3. primarna specifikacija i grupisane ostale specifikacije;
4. `Sačuvaj u garažu`;
5. package capabilities: ocena, `Zainteresovan sam`, probna vožnja, Glas publike i anketa;
6. status svake već završene akcije.

Fotografija nije obavezna. Bez fotografije raspored mora da deluje završen, jer korisnik stoji ispred automobila.

### Mapa

- Mapa mora biti vidljiva u prvom mobilnom viewportu.
- Search/izlagač je primarna prečica.
- Filteri su sekundarni i ne smeju da potisnu mapu ispod prevoja.
- Izabrani štand ima istovremeno tekstualni detalj i vizuelno isticanje.
- Display koristi isti sadržaj, ali drugi layout i bez mobilnih touch kontrola.

### Garaža

- Dva event taba, trenutno aktivni sajam je prvi.
- Lista sačuvanih modela je primarni sadržaj.
- Poređenje je eksplicitna akcija, ne podrazumevana tabela preko cele strane.
- Sponsored traka je jasno označena, ravnopravno rotira modele i ima odvojene akcije `Pogledaj` i `Dodaj u garažu`.
- Dodavanje nikada nije automatsko.
- PDF/email izvoz se prikazuje kao sekundarna akcija na zahtev.

### Glas publike i anketa

- Jedno pitanje po ekranu.
- Jasne progress tačke kada postoji više pitanja.
- Tap meta celog odgovora, ne mali radio krug.
- Nakon glasa odmah se prikazuje dozvoljeni rezultat ili stanje čekanja.
- Glas se može promeniti; obična anketa se nakon finalnog slanja ne menja.

### Brend pasoš

- Jasno prikazuje ukupan broj potrebnih i osvojenih pečata.
- Svaki pečat odgovara stvarnom modelu, bez generičke dekoracije.
- Kompletiranje otključava izbor omiljenog modela.
- Ne obećava fizičku nagradu.

## 10. Breakpoint ugovor

**PREDLOG:**

| Režim | Širina | Pravilo |
|---|---:|---|
| mali telefon | 320-389 px | jedna kolona, 12-16 px gutter, bez horizontalnog overflowa |
| telefon | 390-767 px | jedna kolona, mapa i primary akcije prioritet |
| tablet | 768-1023 px | dve kolone samo kada čuvaju čitljivost |
| desktop | 1024-1439 px | kontrolisana dva panela, bez rastezanja teksta |
| veliki display | 1440 px i više | poseban display composition, isti podaci i tokeni |

Obavezne provere: 375 px telefon, 390 px telefon, iPhone Safari, Android Chrome, landscape telefon i stvarna display rezolucija kada bude poznata.

## 11. Šta je odbačeno iz automatske preporuke dizajn alata

Automatski UI alat je predložio App Store landing strukturu, narandžasto-plavu paletu, dominantni glassmorphism i Inter/Playfair kombinaciju. To se ne prihvata zato što:

- ovo nije download landing stranica niti native app listing;
- narandžasta i plava uvode dva nova akcenta bez veze sa ScanMe identitetom;
- serif body smanjuje brzinu čitanja operativnog interfejsa;
- staklo na svim površinama smanjuje kontrast u hali;
- predlog ne uzima u obzir mapu, garažu, scan tok i event-only svetlu temu.

## 12. Otvorene odluke za zajedničko zaključavanje

1. Potvrditi ili odbaciti pravac `Soft Atlas`.
2. Potvrditi tačne palette vrednosti i koliko ScanMe zelena sme da dominira.
3. Potvrditi DM Sans + Space Grotesk kombinaciju ili izabrati drugu učitanu sans kombinaciju.
4. Odrediti finalni event lockup/logo i odnos ScanMe/Sajam automobila identiteta.
5. Zaključati javni shell i primarnu navigaciju između mape, garaže i pasoša.
6. Zaključati tačan compact mobilni filter/search obrazac za mapu.
7. Zaključati model-page wireframe bez fotografije i sa fotografijom.
8. Zaključati izgled vote rezultata, pečata pasoša i sponsored oznake.
9. Dobiti stvarnu rezoluciju i fizičku orijentaciju sajamskih displaya.
10. Napraviti vizuelne mockupove ključnih ekrana pre paralelne frontend implementacije.

## 13. Gate za implementaciju

Dok status nije promenjen u `ZAKLJUČAN`:

- dozvoljeni su audit, wireframe, token probe i izolovani neprodukcijski mockup;
- nije dozvoljeno da agent proglasi sopstveni stil finalnim;
- nije dozvoljeno paralelno kodiranje javnih modula sa različitim lokalnim bojama i komponentama;
- backend B0/B1 može da napreduje nezavisno prema svom ugovoru;
- svaka implementacija mora kasnije da čita jedan zajednički event token sloj.
