# Stranica modela - high-fidelity mockup krug 1

> Status: **TOPLI SHOWROOM V5 ODOBREN ZA PRVI FRONTEND VERTICAL SLICE**
>
> Poslednje ažuriranje: **2. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
>
> UI/UX ugovor: [`EVENT-DESIGN-SYSTEM.md`](./EVENT-DESIGN-SYSTEM.md)

`MASTER-KONTEKST.md` definiše proizvod, a `BACKEND-HANDOFF.md` tehničku implementaciju. Ovaj dokument samo predstavlja prvi vizuelni izbor za javnu stranicu modela. Kontradikcije se ne rešavaju pretpostavkom, već se vraćaju komandnom centru.

## Table

### 1. Mirni editorial

![Mirni editorial](./mockups/model-page-round-1/01-mirni-editorial.png)

Neutralna bela i hladna svetlosiva, grafit i kontrolisan tamnocrveni akcenat. Najstroža tipografska hijerarhija i najmanje dekorativnih površina.

### 2. Topli showroom

![Topli showroom](./mockups/model-page-round-1/02-topli-showroom.png)

Svetli mineralni neutralni tonovi, hladni grafit i prigušen terakota akcenat. Mekši oblici i površine koje podsećaju na diskretno osvetljene showroom postamente, bez stakla i luksuznih klišea.

Aleksa je 2. oktobra izabrao ovaj pravac kao baseline za dalju razradu. V5 je istog dana odobren kao osnova prvog frontend vertical slice-a; dalje fino podešavanje izgleda i UX-a radi se u browseru pre produkcijskog deploya.

#### Topli showroom V2 - razjašnjena hijerarhija

![Topli showroom V2](./mockups/model-page-round-1/02-topli-showroom-v2.png)

V2 je radni refinement sa tri ciljane promene:

- fotografija je niža, nema tekst preko sebe i ostaje sekundarna u odnosu na naziv, cenu i ključne podatke;
- `Glas publike` je jasno predstavljen kao zaseban kratki interaktivni tok sa pitanjima i rezultatima;
- `Oceni ovaj model` je odvojena lična radnja posle specifikacija, sa tri opcione ocene i objašnjenjem privatnosti rezultata.

#### Topli showroom V3 - action-first

![Topli showroom V3 - action-first](./mockups/model-page-round-1/02-topli-showroom-v3-action-first.png)

V3 zamenjuje pogrešnu V2 pretpostavku da posetilac ima dovoljno vremena za duže listanje. Dizajnirana je za korišćenje u hali, u pokretu:

- naziv modela, cena i kompaktan Audi znak vraćeni su u fotografiju, bez zasebnog visokog identitetskog bloka;
- event header je sveden na jednu kompaktnu traku bez datuma i velikog partnerskog potpisa;
- početni ekran istovremeno prikazuje fotografiju, četiri ključne specifikacije i svih pet važnih radnji;
- `Glas publike` je kompaktno naglašeno dugme, a ne velika sadržajna sekcija;
- `Oceni model`, `Zainteresovan sam` i `Probna vožnja` dostupni su bez skrola;
- zasebni telefoni prikazuju full-screen Glas publike i bottom sheet za tri lične ocene.

#### Topli showroom V4 - compact flow

![Topli showroom V4 - compact flow](./mockups/model-page-round-1/02-topli-showroom-v4-compact-flow.png)

V4 dodatno sabija prvi ekran i uklanja prerano uvedene dekorativne efekte:

- kompaktan logo, naziv i cena preklapaju fotografiju automobila umesto da zauzimaju poseban blok;
- `Sve specifikacije i opis` je vidljiv disclosure odmah ispod ključnih podataka;
- `Glas publike` je ravan, čist CTA bez radijalnog gradijenta i dekorativnog pulsa;
- tri sekundarne akcije koriste isti gabarit i vizuelnu hijerarhiju;
- izbor odgovora u Glasu publike odmah beleži glas i prikazuje rezultate unutar istih opcija, bez dodatnog submit koraka;
- rating bottom sheet nema objašnjavajući pasus, već samo tri ocene i potvrdu.

#### Topli showroom V5 - ready to build kandidat

![Topli showroom V5 - ready to build](./mockups/model-page-round-1/02-topli-showroom-v5-ready-to-build.png)

V5 zadržava V4 raspored i precizira dva vizuelna ugovora:

- ikone za `Oceni model`, `Zainteresovan sam` i `Probna vožnja` koriste isti akcenat, veličinu i stroke;
- rezultat Glasa publike nema checkmark ni izdvojeni progress bar: pozadina celog odgovora puni se sleva nadesno srazmerno procentu, dok samo izabrani odgovor dobija tanak border i snažniji tonalitet.

Planirano motion ponašanje za rezultat:

1. dodir odgovora odmah beleži glas;
2. sva tri elementa prelaze u result stanje bez dodatne potvrde;
3. ispuna svakog elementa raste sleva nadesno do svog procenta;
4. broj procenta raste istovremeno;
5. i ispuna i broj koriste brži početak i kontrolisani ramp-down pred završetak;
6. reduced-motion stanje odmah prikazuje krajnje vrednosti bez animiranog rasta.

Zaključani detalji za prenos u kod:

- Glas publike koristi GSAP timeline za sinhronizovanu ispunu i rast procenta, približno 750 ms, sa brzim početkom i kontrolisanim ramp-down završetkom;
- pressed/selected stanje pojavljuje se odmah po tapu, dok se realni procenti prikazuju tek nakon uspešnog upisa;
- `Garaža` u headeru dobija zaseban, nedvosmislen badge sa brojem sačuvanih modela;
- `Archivo Variable` je početna porodica za javni event UI;
- hero podržava logo/naziv/cenu preko fotografije i tri jednostavna presentation položaja;
- bez fotografije koristi se završena tonalna površina sa identitetom modela, bez generičke ilustracije;
- akcijske ikonice imaju jedan zajednički grafitno-terakota sistem;
- `Sačuvaj u garažu` se elegantno preoblikuje u `Sačuvano`, a header badge dobija diskretan scale feedback;
- sadržaj se optimizuje za 375 x 667 i 390 x 844, dok 320-374 px ostaje funkcionalan fallback bez obaveze da sve stane iznad prevoja;
- DEV kontrola svih fixture stanja dostupna je isključivo preko diskretnog `dev` ulaza uz `Powered by ScanMe` na dnu stranice.

### 3. Gradski vodič

![Gradski vodič](./mockups/model-page-round-1/03-gradski-vodic.png)

Hladna svetla osnova, duboki plavo-grafitni tekst i kobaltni wayfinding akcenat. Najizraženija orijentacija i najbrže skeniranje sekcija.

## Zajednički sadržaj

Sve tri finalne table nastale su iz iste strukturalne osnove. Sadrže ista tri scroll stanja, iste podatke i iste akcije:

1. Audi RS 3 Sportback, `Cena na upit`, fotografija, četiri ključne specifikacije i `Sačuvaj u garažu`;
2. Glas publike, dve grupe specifikacija i tri lične ocene bez javnog proseka;
3. probna vožnja, kratka anketa i Audi pasoš `1 / 4 modela`.

Specifikacije 294 kW (400 KS), 500 Nm, 0-100 km/h za 3,8 s i 250 km/h proverene su prema zvaničnim Audi materijalima. Cena nije izmišljena i zato koristi odobreni fallback `Cena na upit`.

## Generativni prompt set

Vizuali su napravljeni ugrađenim Imagegen alatom kao `ui-mockup`/`style-transfer` bitmap artefakti.

Zajednički prompt je zahtevao:

- tri 390 px telefona kao uzastopna scroll stanja iste stranice;
- event-first sticky header, ScanMe samo kao sekundarni digitalni partner;
- isti Audi sadržaj, paket Advanced i event `Auto Moto Fest`;
- minimum 44 px tap mete, svetlu temu i realnu izvodljivost na 375-390 px;
- zabranu ScanMe zelene, mono tipografije, scan linija, neona, dominantnog stakla, tehničkog dashboard jezika, javnih rating agregata i impression metrika.

`Topli showroom` i `Gradski vodič` generisani su kao stroge style-transfer varijante table `Mirni editorial`, uz zahtev da se ne menjaju tekst, vrednosti, modeli pasoša, scroll stanja ili semantička mesta elemenata.

## Vizuelna provera

- [x] isti sadržaj i hijerarhija u sve tri finalne table;
- [x] nema ScanMe zelene;
- [x] nema mono fonta, scan linija, neona ili tehničkog UI jezika;
- [x] Sajam je primarni, ScanMe sekundarni identitet;
- [x] cena, ključne specifikacije i čuvanje su odmah vidljivi;
- [x] Glas publike je uočljiv, ali ne potiskuje podatke o automobilu;
- [x] probna vožnja je posle specifikacija;
- [x] passport progres je čitljiv bez dodatног objašnjenja;
- [x] fotografija je sekundarna i blok nije konstruktivno zavisan od nje;
- [x] layout je realno prenosiv na 375-390 px;
- [x] sticky header i sticky CTA imaju rezervisan prostor i ne prekrivaju sadržaj.

## Gate

Vizuelni pravac i V5 interaction contract su odobreni za prvi frontend vertical slice. Ovo nije produkcijski go/no-go. Sledeći gate je stvarni browser pregled na 375 x 667, 390 x 844 i 412 x 915, posle kog Aleksa može da traži fino podešavanje pre povezivanja sa backendom i deploya.
