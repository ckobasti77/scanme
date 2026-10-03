# ScanMe `/ponuda`: fotorealistični live preview fizičkih proizvoda

Status dokumenta: handoff za nastavak u novom Codex chatu  
Datum: 2026-08-29  
Workspace: `C:\My Stuff\Posao\ScanMe\Site\scanme`

## 1. Svrha ovog dokumenta

Ovaj dokument prenosi kompletan poznati kontekst za buduću izradu sistema koji u konfiguratoru ponude prikazuje realističan završeni fizički proizvod sa opcijama iz sidebara.

Korisnik će u sledećem chatu prvo dostaviti referentne slike i PDF. Agent ne treba ponovo da postavlja pitanja na koja je ovde već odgovoreno. Treba da pregleda reference, prijavi samo stvarne konflikte ili nedostajuće informacije koje menjaju rezultat i zatim nastavi po fazama definisanim u ovom dokumentu.

Neposredni sledeći zadatak nije izrada kompletnog sistema. Sledeći zadatak je generisanje četiri fotorealistične pozadine bez fizičkih proizvoda, ali sa planski ostavljenim prostorom u koji će proizvodi kasnije biti komponovani.

## 2. Glavni cilj kompletnog sistema

Kada korisnik izabere fizički proizvod i menja opcije u sidebaru, live preview mora odmah i uverljivo da pokaže kako bi završeni proizvod izgledao u stvarnom prostoru.

Preview mora reagovati najmanje na:

- tip proizvoda;
- dimenziju;
- portretnu ili landscape orijentaciju gde je primenljivo;
- oblik gde je primenljivo;
- pozadinu ili boju proizvoda gde je primenljivo;
- završnicu, uključujući mat i sjaj;
- materijal;
- izabrani dizajn;
- druge potvrđene opcije iz konfiguratora.

Ne sme se zadržati trenutni utisak da je dizajn samo nalepljen preko generičke stock ikonice. Rezultat mora izgledati kao fotografija gotovog proizvoda.

Preview je prodajna, fotorealistična reprezentacija. Ne treba ga predstavljati kao color-proof ili štamparski dokaz, jer ekran ne može garantovati potpuno identičnu boju, transparentnost, refleksiju, teksturu i proizvodne tolerancije.

## 3. Opseg proizvoda

### ZAKLJUČANO

Prva faza kompletnog sistema obuhvata četiri proizvoda:

1. Nalepnice i stikeri
2. PVC folija za izloge i staklo
3. Dvodelni stalci
4. Kompaktni stalci

Premium gravirani stalak se za sada preskače zato što konačan fizički izgled još nije definisan.

Premium proizvod i njegov postojeći placeholder ne treba redizajnirati u ovoj fazi.

## 4. Korisnikovi potvrđeni odgovori

### 4.1 Dimenzije i orijentacije

Korisnik je potvrdio da sva četiri proizvoda treba da podrže A4, A5 i A6, kao i portretnu i landscape orijentaciju.

Ovo je potvrđena poslovna informacija, ali nije u potpunosti usklađena sa trenutnim modelom u kodu. Taj konflikt je evidentiran u odeljku `OTVORENO` i ne sme se rešiti prećutno.

### 4.2 Nalepnice i stikeri

- Nije potrebno da preview objašnjava šta tačno kupac fizički dobija, jer to zavisi od izabranih opcija.
- Postoji izbor mat ili sjajne završnice.
- Korisnik ima referentnu sliku koja pokazuje razliku između mat i sjajne PVC folije i dostaviće je u sledećem chatu.
- Preview scena za papirnatu nalepnicu je sto gledan odozgo.
- Pozadina ne sme sadržati nalepnicu. Mora ostati čista površina na koju će se proizvod kasnije postaviti.

### 4.3 PVC folija

- PVC folija ima više izbora koji već postoje ili treba da postoje u sidebaru.
- Live preview mora da se menja u skladu sa svakom izabranom opcijom.
- Korisnik će dostaviti reference koje pokazuju relevantne razlike, uključujući mat i sjaj.
- Jedina scena za ovaj proizvod je staklo vrata ili izloga kafića, gledano spolja prema unutra.
- Iza stakla treba da se vidi zamućena unutrašnjost kafića.
- Pozadina se generiše bez folije, dizajna, nalepnice, QR koda ili druge grafike na staklu.

### 4.4 Dvodelni stalak

- Korisnik će dostaviti referentnu sliku tačnog izgleda.
- Trenutni placeholder ima nerealan, prevelik razmak između dva prozirna dela. Papir ne bi mogao pravilno da stoji u takvoj konstrukciji.
- Konstrukcija i razmak moraju se izvesti iz reference, bez nagađanja.
- Fizička konstrukcija se menja sa dimenzijom.
- Preview scena je sto gosta u kafiću.
- Budući proizvod može biti postavljen pod vrlo blagim uglom, dovoljno da se vidi dubina konstrukcije, ali da dizajn ostane gotovo frontalno čitljiv.

### 4.5 Kompaktni stalak

- To je stalak od savijenog materijala.
- Korisnik je naveo FOREX, odnosno PVC plastiku, i klirit, odnosno akril.
- Postoje i razlike u bojama.
- Korisnik će dostaviti PDF sa ponudom i referencama koje definišu materijale, boje i druge stvarne varijante.
- Preview scena je pult kafića.
- Budući proizvod može stajati pod blagim uglom, uz dominantno vidljivu prednju površinu.

### 4.6 Dizajni

- Izabrani dizajn se automatski prilagođava orijentaciji.
- Za svaki dizajn biće pripremljena zasebna portretna i landscape verzija iza scene.
- Trenutno postoji pet šablona.
- Sistem ne treba da improvizuje landscape verziju običnim nasumičnim cropovanjem ako postoje namenski pripremljene varijante.

### 4.7 Logo

- Dodavanje i pozicioniranje korisničkog logoa biće rešeno kao zaseban kasniji zadatak.
- Logo nije deo neposredne izrade pozadina.
- Generisane pozadine ne smeju sadržati ScanMe logo, tuđe logoe, QR kodove, natpise ili lažni branding.

### 4.8 Desktop i mobile

- Kompletan sistem proizvoda i iste pozadine koristiće se i na desktopu i na mobilnom.
- Mobilna verzija će imati drugačije aranžiran UI, ali ne i drugi vizuelni identitet proizvoda ili druge scene.
- Asseti treba da omoguće siguran crop i na desktop i na mobilnom.
- Prva puna implementacija konfiguratora ostaje desktop-first, uz obaveznu mobile regresionu proveru.

## 5. ZAKLJUČANA pravila za četiri pozadine

Sve pozadine moraju biti fotorealistične, konzistentne po kvalitetu i dovoljno neutralne da različiti dizajni proizvoda ostanu dominantni.

### Globalna pravila

- Apsolutno nijedna osoba ne sme biti vidljiva.
- Nisu dozvoljeni ljudi u fokusu, zamućeni ljudi, siluete, odrazi ljudi, delovi tela, ruke, lica ili figure u dubini scene.
- Nisu dozvoljeni fizički proizvodi koji se kasnije dodaju: nema nalepnice, folije, dvodelnog stalka ni kompaktnog stalka.
- Nema QR kodova, logotipa, natpisa, menija, cenovnika, brendiranih čaša ili čitljivog teksta.
- Ne generisati lažni beli pravougaonik ili placeholder koji izgleda kao proizvod.
- Ostaviti prirodno prazan prostor za proizvod, ali taj prostor mora ostati deo stvarne površine scene.
- Svetlo mora jasno definisati površinu i omogućiti kasniji kontaktni shadow, refleksiju ili kompoziting.
- Perspektiva površine mora biti jasna i stabilna.
- Dubinska oštrina treba da podrži proizvod: zona budućeg proizvoda oštra, pozadina mirnija i po potrebi zamućena.
- Scene ne smeju biti prenatrpane dekoracijom.
- Izbegavati jake šare, kontrastne fuge, vizuelno agresivno drvo i predmete koji seku rezervisanu zonu.
- Paleta treba da ostane kompatibilna sa postojećim toplim, neutralnim ScanMe konfiguratorom.
- Svaka scena mora funkcionisati bez promene boje teme. Sama scena ostaje ista u svetloj i tamnoj temi; UI slojevi rešavaju kontrast.

### 5.1 Pozadina za nalepnice i stikere

Predloženi naziv asseta: `stickers-tabletop-v1.webp`

- Kamera tačno iznad stola, top-down kadar.
- Sto treba da bude neutralan, mat i realističan.
- Preporučena površina je miran kamen, mikrocement ili vrlo suptilno drvo bez dominantnih godova.
- Centralna ili blago pomerena zona mora ostati potpuno slobodna za nalepnicu.
- Dozvoljen je samo veoma diskretan kontekst na periferiji, na primer mali deo neutralnog tanjira ili šoljice, ako ne ugrožava crop i ne odvlači pažnju.
- Nema papira, kartica, podmetača, stikera, trake ili predmeta koji mogu biti pogrešno protumačeni kao proizvod.
- Pošto je kadar odozgo, budući proizvod ne zahteva yaw ugao.

### 5.2 Pozadina za PVC foliju

Predloženi naziv asseta: `window-film-storefront-door-v1.webp`

- Kamera se nalazi spolja i gleda ka staklenim vratima ili staklenom delu izloga kafića.
- Staklena površina mora biti dovoljno frontalna da se dizajn jasno čita.
- Maksimalno dozvoljeno vizuelno odstupanje kamere je veoma malo, približno 0-3 stepena.
- Centralni deo stakla ostaje čist i slobodan za buduću foliju.
- Unutrašnjost kafića iza stakla je prirodno zamućena i prazna.
- Mogu postojati diskretni odrazi u staklu, ali ne odrazi ljudi i ne refleksije koje uništavaju čitljivost proizvoda.
- Okvir vrata treba da omogući razumevanje stvarne razmere, ali ne sme suziti rezervisanu zonu.
- Nema postojeće signalizacije, radnog vremena, nalepnica, ručki preko centralne zone, logotipa ili teksta.

### 5.3 Pozadina za dvodelni stalak

Predloženi naziv asseta: `two-piece-stand-cafe-table-v1.webp`

- Scena prikazuje sto gosta u praznom kafiću.
- Kamera je približno u sedećoj visini ili malo iznad nivoa budućeg proizvoda.
- Na stolu ostaviti jasnu praznu zonu za stalak.
- Površina mora imati dovoljno prostora za buduću kontaktnu senku i vidljivo oslanjanje baze.
- Kompozicija treba da podrži budući yaw proizvoda približno 7-9 stepeni.
- Pozadina kafića može imati prazne stolice ili enterijer, ali bez ljudi i bez silueta.
- Pozadinski elementi ostaju blago zamućeni.
- Na rezervisanoj zoni nema čaša, pribora, salveta, tanjira, menija ili drugih predmeta.

### 5.4 Pozadina za kompaktni stalak

Predloženi naziv asseta: `compact-stand-cafe-counter-v1.webp`

- Scena prikazuje pult kafića bez osoblja i gostiju.
- Ostaviti jasnu praznu zonu na pultu za kompaktni stalak.
- Perspektiva pulta mora omogućiti prirodno oslanjanje proizvoda i kontaktnu senku.
- Kompozicija treba da podrži budući yaw proizvoda približno 8-11 stepeni.
- U pozadini mogu biti aparat za kafu, police ili diskretna svetla, ali samo kao bokeh ili miran kontekst.
- Nema brendiranih šolja, flaša sa čitljivim etiketama, menija, cenovnika, osoblja ili gostiju.
- Ne generisati prazan držač, karticu ili drugi predmet koji liči na kompaktni stalak.

## 6. Zahtevi za kadar i responsive crop

Pozadine se prvo generišu u visokoj rezoluciji i širem kadru, sa dodatnim bezbednim prostorom oko rezervisane zone.

Preporučeni master format je landscape 16:10 ili format dovoljno širok za postojeći desktop stage. Ne treba prerano seći master na konačan CSS crop.

Za svaku pozadinu treba proveriti najmanje:

- desktop prikaz oko 1280 px širine;
- uži desktop oko 1024 px;
- mobilni portrait crop oko 375 px;
- da rezervisana zona ne padne ispod product raila, sidebara, preview copy panela ili donjeg price docka;
- da se važni okviri scene ne seku neprirodno pri `object-fit: cover`.

Ako jedan master asset ne može da podrži i desktop i mobile bez gubitka rezervisane zone, dozvoljena je izvedena mobile crop varijanta iz istog mastera. Ne generisati potpuno drugu scenu bez potrebe.

## 7. PRIVREMENO postojeće stanje u repozitorijumu

Pozadine već postoje i trenutno se koriste kao placeholder scene:

- `public/offer/scenes/counter-studio.webp`
- `public/offer/scenes/storefront-glass.webp`
- `public/offer/scenes/premium-reception.webp`

Trenutna mapa u `components/offer-configurator.tsx` koristi:

- `counter-studio.webp` za nalepnice;
- `storefront-glass.webp` za PVC foliju;
- `counter-studio.webp` za dvodelni stalak;
- `counter-studio.webp` za kompaktni stalak;
- `premium-reception.webp` za premium gravirani stalak.

To znači da tri različita proizvoda trenutno dele istu counter scenu. Novi sistem treba da dobije zasebnu pozadinu za svaki od četiri proizvoda, jer se razlikuju kamera, površina, rezervisana zona i budući ugao proizvoda.

Postojeće scene ne brisati niti prepisivati pre vizuelnog odobrenja novih asseta. Nove verzije sačuvati pod zasebnim, opisnim imenima.

Postojeći placeholder proizvodi su:

- `public/offer/products/stickers.png`
- `public/offer/products/window-film.png`
- `public/offer/products/two-piece-stand.png`
- `public/offer/products/compact-stand.png`
- `public/offer/products/premium-engraved-stand.png`

U neposrednoj fazi generisanja pozadina ove fajlove ne menjati i ne ugrađivati u generisane slike.

Trenutni preview koristi jedan raster proizvoda i pravougaoni design plane definisan procentima. Dimenzija se trenutno simulira skalama `1`, `0.88` i `0.76`. To je placeholder ponašanje, a ne potvrđena fizička tačnost.

## 8. Trenutne opcije u kodu

Ovo je zatečeno implementaciono stanje, ne automatski konačna poslovna specifikacija.

### Nalepnice i stikeri

- oblik: Kvadrat, Pravougaonik, Krug;
- dimenzija: Mala, Srednja, Velika;
- trenutno nema završnice i orijentacije u `controlIds`.

### PVC folija

- pozadina: Bela, Providna;
- završnica: Mat, Sjaj;
- dimenzija: Mala, Srednja, Velika;
- trenutno nema orijentacije u `controlIds`.

### Dvodelni stalak

- orijentacija: Portret, Landscape;
- dimenzija: A4, A5, A6.

### Kompaktni stalak

- pozadina: Bela, Crna;
- materijal u trenutnom kodu: Plastika, Aluminijum;
- dimenzija: A4, A5, A6;
- trenutno nema orijentacije u `controlIds`.

### Premium gravirani stalak

- van trenutnog opsega;
- postoje oblik, tip drveta i Mala/Srednja/Velika.

## 9. OTVORENO: konflikti koje reference moraju da razreše

Ove stavke ne treba ponovo pitati kao široka produktna pitanja. Agent treba da uporedi dostavljene reference i PDF sa njima i zatraži samo precizno razrešenje ako konflikt ostane.

1. Korisnik je potvrdio A4/A5/A6 i obe orijentacije za sva četiri proizvoda, dok trenutni kod koristi Mala/Srednja/Velika za nalepnice i foliju i ne prikazuje orijentaciju za sve proizvode.
2. Korisnik je za kompaktni stalak naveo FOREX i klirit, dok trenutni sidebar prikazuje Plastika i Aluminijum.
3. Korisnik je naveo da nalepnice imaju mat i sjajnu završnicu, dok trenutni kod taj control ne prikazuje za nalepnice.
4. Tačne boje i varijante kompaktnog stalka čekaju PDF.
5. Tačna geometrija, materijal i razmak dvodelnog stalka čekaju referentnu sliku.
6. Tačan vizuelni efekat svake kombinacije bele/providne i mat/sjajne PVC folije čeka referentne slike.
7. Stvarne fizičke mere svakog proizvoda i svake dimenzije treba preuzeti iz PDF-a ili tehničkih podataka, ne iz trenutnih CSS skala.

## 10. Reference koje korisnik treba da dostavi u sledećem chatu

- referentnu sliku dvodelnog stalka;
- referentnu sliku kompaktnog stalka;
- PDF sa kompaktnim stalcima, FOREX/klirit materijalima, bojama i varijantama;
- referentnu sliku razlike mat i sjajne PVC folije;
- reference za belu i providnu PVC foliju, ako nisu u istom materijalu;
- tehničke mere za A4, A5 i A6 varijante, ako PDF ne sadrži sve mere;
- eventualne referentne scene samo ako korisnik želi precizan enterijer ili tip površine.

Agent treba prvo da pregleda sve reference. Ne generisati pozadine pre tog pregleda ako reference utiču na kadar, boju, refleksiju ili rezervisanu zonu.

## 11. Preporučena arhitektura budućeg proizvoda

Ne preporučuje se pun interaktivni 3D/WebGL konfigurator kao početno rešenje. Za ovu potrebu je primereniji modularni fotorealistični 2.5D kompoziting sistem.

Svaka varijanta proizvoda treba konceptualno da ima:

1. pozadinu scene;
2. zadnji deo proizvoda ili osnovnu konstrukciju;
3. dinamički design plane;
4. masku i perspektivno mapiranje dizajna;
5. prednji sloj proizvoda, kao što su staklo, ivice, refleksije ili providni materijal;
6. kontaktnu senku i po potrebi refleksiju na površini;
7. kalibraciju položaja, dimenzije i orijentacije.

Preporučen je asset manifest po proizvodu i varijanti. Manifest treba da omogući kasniju zamenu privremenog rendera pravom fotografijom bez prepisivanja poslovne logike konfiguratora.

Za blago ukošene proizvode design plane mora pratiti perspektivu površine, najbolje pomoću četiri kalibrisana ugla ili ekvivalentne transformacije. Obično CSS skaliranje pravougaonika nije dovoljno za fotografsku tačnost.

Kod stakla, akrila i folije dizajn mora biti ispod kontrolisanog sloja refleksija i ivica. Kod papirne nalepnice mora izgledati fizički zalepljeno na površinu, uz odgovarajući kontakt, mikro-senku i mat ili sjajni odziv.

## 12. Buduća zamena rendera pravim fotografijama

Sistem mora biti pripremljen da kasnije primi fotografije stvarnih proizvoda.

Preporučeni uslovi fotografisanja:

- stativ;
- fiksna kamera i žižna daljina;
- meko, kontrolisano svetlo;
- maksimalna dostupna rezolucija ili RAW;
- neutralan ili prazan umetak gde je primenljivo;
- fotografija svake stvarne dimenzije i orijentacije;
- referentna mera ili tehničke dimenzije;
- ista ili kompatibilna perspektiva sa zaključanom scenom;
- bez jakih pregorelih refleksija preko design plane-a.

Posle zamene treba ponovo kalibrisati uglove design plane-a, masku prednjeg sloja i kontaktnu senku. Poslovna logika izbora ne treba da se menja.

## 13. Redosled rada u sledećim fazama

### Faza A: reference i zaključavanje scena

1. Pregledati sve slike i PDF.
2. Uskladiti poznate konflikte iz odeljka `OTVORENO`.
3. Potvrditi kadar i rezervisanu zonu za svaku pozadinu.
4. Ne menjati kod proizvoda u ovoj fazi.

### Faza B: generisanje pozadina

1. Generisati četiri master pozadine bez proizvoda.
2. Generisati jednu po jednu, ne sve u jednom kolažu.
3. Posle svake generacije proveriti zabranu ljudi, proizvoda, teksta i brendinga.
4. Proveriti perspektivu, slobodnu zonu i responsive crop.
5. Iterirati dok svaki asset nije dovoljno čist.
6. Sačuvati nove assete pod zasebnim imenima. Ne prepisivati placeholder scene pre odobrenja.

### Faza C: privremeni fotorealistični proizvodi

1. Na osnovu referenci napraviti verne privremene rendere četiri proizvoda.
2. Dvodelni stalak mora imati realan razmak i konstrukciju.
3. Kompaktni stalak mora pratiti stvarne FOREX/klirit/boja varijante iz PDF-a.
4. Premium proizvod ostaje van opsega.

### Faza D: 2.5D live preview sistem

1. Uvesti asset manifest i mapiranje varijanti.
2. Povezati sve potvrđene sidebar opcije sa vizuelnim stanjem.
3. Uvesti perspektivni design plane, maske, refleksije i senke.
4. Dodati zasebne portrait/landscape dizajne.
5. Logo ostaviti za zaseban zadatak.
6. Sačuvati postojeći URL/order state i pricing ponašanje osim kada je eksplicitno promenjeno.

### Faza E: prava fotografija

1. Fotografisati prave proizvode po dogovorenom protokolu.
2. Zameniti privremene rendere.
3. Ponovo kalibrisati masku, perspektivu i senke.
4. Izvršiti vizuelni QA svih kombinacija.

## 14. Kriterijumi uspeha za pozadine

Pozadina je prihvatljiva samo ako:

- nema nijednu osobu, siluetu, odraz čoveka ili deo tela;
- nema fizički proizvod koji tek treba dodati;
- nema teksta, QR koda, logoa ili tuđeg brendinga;
- jasno postoji prirodna prazna zona za proizvod;
- površina i perspektiva podržavaju prirodan kontakt proizvoda;
- desktop crop zadržava rezervisanu zonu;
- mobile crop zadržava rezervisanu zonu ili postoji izvedena crop varijanta;
- scena izgleda kao realna fotografija, a ne generički AI enterijer;
- pozadina ne preuzima vizuelnu pažnju od budućeg dizajna;
- četiri scene deluju kao deo istog ScanMe kvalitativnog sistema, iako imaju različite prostore i kamere.

## 15. Kriterijumi uspeha za kompletan sistem

Kompletan sistem se ne smatra završenim dok:

- svaki izbor u sidebaru proizvodi tačnu i vidljivu promenu;
- dimenzija menja ceo fizički proizvod gde se stvarna konstrukcija menja;
- landscape stalak nije samo portretni stalak sa rotiranim dizajnom;
- mat i sjaj imaju fizički uverljivo različit odziv svetla;
- providna i bela folija imaju uverljivo različito ponašanje;
- dizajn prati perspektivu proizvoda i ne lebdi preko njega;
- staklo, akril i providni slojevi pravilno prekrivaju dizajn;
- senka vezuje proizvod za sto, pult ili staklo;
- nema layout shift-a pri promeni opcije;
- prelaz između stanja je kratak i nenametljiv;
- `prefers-reduced-motion` dobija trenutnu ili statičnu promenu;
- desktop i mobile koriste iste zaključane assete i istu logiku;
- mobile UI može biti drugačije aranžiran bez dupliranja poslovne logike;
- postojeći order state, URL encoding i obračun nisu regresirani;
- `npm.cmd run test` i `npm.cmd run check` prođu ili se svako postojeće infrastrukturno ograničenje precizno dokumentuje;
- browser QA pokrije sve proizvode i reprezentativne kombinacije opcija.

## 16. Relevantni fajlovi

- `components/offer-configurator.tsx`
- `components/offer-configurator.module.css`
- `lib/scanme-pricing.ts`
- `lib/offer-url.ts`
- `lib/offer-contact.ts`
- `lib/i18n/sr/offer.ts`
- `public/offer/scenes/*`
- `public/offer/products/*`
- `public/offer/templates/*`

Pre Convex izmene obavezno pročitati `convex/_generated/ai/guidelines.md`, ali ovaj sistem verovatno može ostati pretežno frontend/asset posao dok se ne menja upload ili persistence.

Pre Next.js izmene pročitati relevantnu dokumentaciju iz instaliranog `node_modules/next/dist/docs/`, u skladu sa repozitorijumskim `AGENTS.md`.

## 17. Granice ovlašćenja za sledeći chat

- Pregled referenci i generisanje traženih pozadina jesu u opsegu kada korisnik to eksplicitno zatraži.
- Generisanje pozadina ne ovlašćuje automatski implementaciju kompletnog proizvoda.
- Ne menjati premium gravirani stalak.
- Ne implementirati logo u istoj fazi.
- Ne brisati postojeće placeholder assete.
- Ne prepravljati pricing, order flow ili nepovezani UI.
- Ne donositi poslovne odluke umesto PDF-a i referenci ako bi to promenilo stvarni proizvod.

## 18. Preporučeni reasoning effort

- Za čitanje ovog handoff-a, pregled referenci i preciziranje promptova za četiri pozadine: `high` je dovoljan.
- Za samo generisanje i iteriranje četiri pozadine: koristiti `high`. Kvalitet će više zavisiti od dobrih referenci, jasnog prompta i vizuelnih iteracija nego od prelaska na najviši reasoning effort.
- Za kasniju kompletnu implementaciju 2.5D sistema, povezivanje svih kombinacija, responsive QA i zamenu pravim fotografijama: koristiti `xhigh`.
- `max` nije preporučen kao početna vrednost. Čuvati ga samo ako se tokom najteže integracije pokaže da `xhigh` propušta merljive probleme.

## 19. Kratka instrukcija za novog agenta

Pročitaj ovaj dokument u celosti. Zatim pregledaj sve reference koje je korisnik poslao. Ne postavljaj ponovo zaključana pitanja. Najpre sažeto prijavi šta reference potvrđuju i da li razrešavaju stavke iz odeljka `OTVORENO`. Kada korisnik zatraži pozadine, generiši tačno četiri scene bez fizičkih proizvoda, jednu po jednu, po pravilima iz odeljaka 5, 6 i 14. Ne prelazi na rendere proizvoda ili implementaciju live preview sistema bez novog eksplicitnog zahteva.
