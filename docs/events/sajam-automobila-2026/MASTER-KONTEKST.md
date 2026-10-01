# ScanMe × Sajam automobila 2026 — master kontekst

> Kanonski operativni dokument za planiranje, dizajn, implementaciju i delegiranje rada.
>
> Poslednje ažuriranje: 1. oktobar 2026.
> Rok za operativnu spremnost prve faze: **9. oktobar 2026.**

## 0. Kako se koristi ovaj dokument

Ovaj dokument je početna tačka za svakog čoveka ili AI agenta koji radi na projektu Sajma automobila. Pre početka zadatka mora da se pročita ceo dokument, a zatim samo reference relevantne za konkretan zadatak.

Oznake odluka:

- **ZAKLJUČANO** — potvrđena poslovna ili proizvodna odluka. Ne menjati i ne tumačiti drugačije bez nove odluke vlasnika.
- **PRIVREMENO** — trenutno prihvaćen radni smer koji sme da se promeni kada stignu podaci ili nova odluka.
- **OTVORENO** — odluka još nije doneta. Agent ne sme da izmisli odgovor.
- **VAN OPSEGA** — nije deo trenutne isporuke, čak i ako bi tehnički bilo korisno.

Pravila održavanja:

1. Nova odluka se prvo upisuje ovde, pa tek onda pretvara u task.
2. Kada nova odluka menja staru, stara se ne ostavlja kao paralelno važeća. Menja se tekst i dopisuje zapis u dnevnik izmena.
3. Implementirano stanje nije automatski proizvodna odluka. Ako kod odstupa od ovog dokumenta, odstupanje se prijavljuje; ne menja se ovaj dokument ćutke.
4. Nejasan odgovor ili nedostajući podatak ide u `OTVORENO`, bez nagađanja.
5. Svaki delegirani task mora da navede koje odeljke ovog dokumenta koristi i šta mu je izričito zabranjeno da menja.

---

## 1. Projekat i cilj

### ZAKLJUČANO

ScanMe je **digitalni partner** Sajma automobila u Hali Čair u Nišu. Projekat obuhvata dva događaja:

1. Sajam elektromobilnosti — 9–11. oktobar 2026.
2. Sajam auto brendova / Auto Moto Fest — 30. oktobar–1. novembar 2026.

Glavni cilj projekta nije prodaja QR kodova. ScanMe fizičkom sajmu daje novu digitalnu dimenziju:

- posetiocima daje preglednije informacije, mapu, garažu i interaktivno iskustvo;
- izlagačima daje merljive podatke, leadove i digitalne funkcionalnosti kojih nema u čistom fizičkom izlaganju;
- organizatoru daje digitalno unapređenje događaja i zbirni uvid u interesovanje.

Poslovni cilj je da plaćeni paketi izlaganja donesu prihod, a uspešno izveden događaj postane dokaz rada za buduće veće događaje, naročito u Beogradu.

### Zvanične reference

- Organizator i sajam: <https://sajamautomobila.com>
- Izlagači: <https://sajamautomobila.com/ucesnici-2026/>
- ScanMe: <https://www.scanme.rs>
- EnigmaIT: <https://www.enigmait.rs>
- Lokacija: Hala Čair, Niš

---

## 2. Rokovi i operativna ograničenja

### ZAKLJUČANO

- Sve funkcionalnosti potrebne za prvi događaj moraju da rade do **9. oktobra 2026.**
- Postoji mogućnost samo jednog dana testiranja u hali pre početka sajma.
- Podaci i materijali od izlagača verovatno neće biti kompletni pre ponedeljka u nedelji pred sajam.
- Svaki model postoji kao jedan fizički izloženi primerak i dobija svoj QR kod.
- Mobilni prikaz je primarni. Posetilac sve radi telefonom.
- Veće rezolucije su potrebne prvenstveno za sajamske displeje na kojima se prikazuje mapa.
- Sistem radi na postojećem ScanMe projektu i Convex backendu, uz ograničenja besplatnog plana.
- Izlagači nemaju naloge, dashboard niti obavezu da rade u sistemu.
- ScanMe tim unosi podatke, podešava pitanja, upravlja sadržajem i šalje izveštaje.

### Posledica za planiranje

Rad mora da bude podeljen na module koji mogu paralelno da se izrađuju, ali koriste isti zaključani model podataka, stanja, nazive i dizajn-sistem. Funkcionalni minimum za 9. oktobar ima prednost nad dodatnim poliranjem.

---

## 3. Publike i iskustva

### Posetilac

- ne kreira nalog i ne prijavljuje se;
- skenira QR konkretnog modela;
- vidi stranicu modela sa nazivom, cenom i specifikacijama;
- može da sačuva model u garažu;
- može da oceni model ako paket to dozvoljava;
- može da ostavi interesovanje ili zahtev za probnu vožnju ako paket to dozvoljava;
- može da odgovori na Glas publike i/ili anketu;
- može da skuplja pečate u pasošu brenda;
- koristi interaktivnu mapu događaja.

### Izlagač

- nema nalog ni panel;
- dostavlja ScanMe timu podatke i željene tekstove/pitanja;
- dobija rezultate emailom kao PDF, tabela ili drugi dogovoreni format;
- na osnovu dnevnog preseka može da prilagodi nastup tokom narednog sajamskog dana;
- može tokom sajma da doplati prelazak modela sa Starter na Napredni paket.

### Organizator

- odobrio je status ScanMe-a kao digitalnog partnera;
- odobrio je istaknuti prikaz Naprednih modela na sajamskoj mapi/displejima;
- koristi javnu mapu i zbirne uvide u interesovanje.

---

## 4. Paketi po automobilu

Paketi se obračunavaju **po automobilu/modelu**.

### 4.1 Za sve izlagače — u okviru partnerstva

**ZAKLJUČANO**

- QR nalepnica za svaki izloženi automobil.
- Digitalna stranica modela: naziv, cena i specifikacije; fotografija nije obavezna.
- Čuvanje modela u garaži posetioca.
- Poređenje sa drugim sačuvanim modelima u garaži.
- Ukupan broj skeniranja štanda.

Ovo je osnovni nivo koji ScanMe daje kroz partnerstvo sa sajmom. Ne predstavlja se kao paket od `0 RSD`, već kao pogodnost **za sve izlagače**.

### 4.2 Starter — 3.000 RSD po automobilu

**ZAKLJUČANO**

Starter sadrži sve što dobijaju svi izlagači, plus:

- ocenu modela od 1 do 5;
- `Zainteresovan sam` — ostavljanje kontakta i slanje jedne email potvrde posetiocu;
- Glas publike: **jedno pitanje po sajamskom danu**;
- dnevni presek rezultata nakon svakog sajamskog dana;
- analitiku modela;
- mogućnost da se tokom sajma doplati prelazak na Napredni paket.

Poslovna namera: Starter je glavni paket koji najviše guramo i očekujemo da će ga uzeti najveći broj izlagača/modela.

### 4.3 Napredni — 5.000 RSD po automobilu

**ZAKLJUČANO**

Napredni sadrži **sve iz Starter paketa**, plus:

- prijavu za probnu vožnju i jednu email potvrdu posetiocu;
- Glas publike: do **pet pitanja po sajamskom danu**;
- dodatnu anketu;
- odvojene ocene izgleda, specifikacija i cene modela;
- naprednu analitiku;
- automatizovani follow-up posle sajma;
- sponzorisanu ravnopravnu rotaciju modela na sajamskoj mapi/displejima;
- sponzorisanu ravnopravnu rotaciju modela u garaži posetioca.

### ZAKLJUČANA prodajna hijerarhija

Najvažnije prodajne tačke su:

1. analitika i dnevni presek;
2. `Zainteresovan sam` i prijava za probnu vožnju;
3. Glas publike i anketa kao uvid u tržište;
4. dodatna vidljivost Naprednih modela na mapi i u garaži;
5. pasoš brenda kao podstrek da posetioci obiđu sve modele brenda.

### 4.4 Model paketa i prava — ZAKLJUČANO

- Paket pripada jednom konkretnom izloženom automobilu/modelu na jednom konkretnom sajmu.
- Isti automobilski model koji učestvuje na oba sajma predstavlja dva odvojena izložena modela i paket se obračunava zasebno za svaki sajam.
- Svaki izloženi model ima jedan stabilan QR koji se ne menja pri nadogradnji paketa.
- Dozvoljen smer promene je `za sve izlagače → Starter → Napredni`.
- Nema spuštanja paketa tokom sajma.
- Nadogradnja počinje da važi odmah od trenutka aktivacije i ostaje zabeležena u istoriji aktivacija.
- Ako se Starter tokom sajamskog dana nadogradi na Napredni, model tog dana dobija ukupno do pet pitanja Glasa publike. Već iskorišćeno Starter pitanje ulazi u tih pet.
- Nove plaćene interakcije ne pripisuju se retroaktivno periodu pre aktivacije.
- Ranija skeniranja modela ostaju sačuvana i smeju da budu uključena u kasniji dnevni presek i analitiku.
- Besplatni nivo izlagaču prikazuje samo zbirni broj skeniranja njegovog štanda.
- Analitika po pojedinačnom modelu dostupna je od Starter paketa.
- Paketska prava moraju biti definisana u jednom centralnom entitlement ugovoru. UI, backend i izveštaji ne smeju zasebno da izmišljaju pravila paketa.

### 4.5 Ulazni podaci od izlagača — ZAKLJUČANO

- Izlagači ne moraju da rade u našem sistemu niti da popunjavaju složen tehnički formular.
- ScanMe prima podatke telefonom, emailom ili kroz materijale izlagača i normalizuje ih u jedan interni radni dokument/import format.
- Interni format razdvaja: izlagače i kontakte, štandove i brendove, izložene modele i pakete, specifikacije, pitanja Glasa publike, ankete i email tekstove.
- Jedan red/model mora najmanje da identifikuje događaj, izlagača, brend, naziv/varijantu modela, cenu i aktivni paket.
- Cena se očekuje za svaki model. Sistem ipak ima fallback `Cena na upit` kako nedostajući podatak ne bi oborio stranicu.
- Specifikacije se čuvaju kao uređeni parovi `naziv–vrednost`, jer različiti tipovi vozila nemaju ista polja.
- Fotografija nije obavezan ulazni podatak za stranicu specifikacija.
- Stranica specifikacija mora da izgleda završeno i funkcioniše bez fotografije, jer je posetilac pri skeniranju fizički ispred automobila.
- Fotografije su prvenstveno namenjene garaži i sponzorisanim prikazima, gde posetilac ne mora da bude blizu modela.
- Ako fotografija nije dostupna, garaža i sponzorisani prikaz moraju imati dosledan fallback; ne smeju da koriste izmišljenu ili pogrešnu fotografiju.
- ScanMe radi internu proveru i objavljuje stranicu bez obaveznog formalnog odobrenja izlagača.
- Naknadne ispravke izlagača unosimo kontrolisano, bez menjanja QR identiteta modela.

### VAN OPSEGA ponude

- Nema kupovine paketa kroz javni sajt.
- Nema javno prikazanih cena/paketa na prelaunch landing stranici.
- Izlagači se kontaktiraju telefonom i dobijaju prodajni PDF.
- Nema poređenja Naprednog modela sa modelima iste kategorije na sajmu.
- Nema izbora termina probne vožnje na licu mesta.
- Nema dugmeta „razgovor sa prodavcem” kao posebne funkcionalnosti.
- Nema konfiguratora kao glavne prodajne tačke ovih sajamskih paketa.

---

## 5. Stranica modela i QR tok

### ZAKLJUČANO

- Svaki automobil/model ima svoj jedinstveni QR.
- Sken otvara javnu mobilnu stranicu baš tog modela.
- Za osnovni nivo stranica prikazuje naziv, cenu i specifikacije. Fotografija je opciona.
- Funkcije na stranici zavise od aktiviranog paketa tog modela.
- Aktivacija paketa važi od trenutka aktivacije; nema retroaktivnog pripisivanja funkcija pre aktivacije.

### Brojanje skeniranja

- `Ukupna skeniranja`: svaki validan scan događaj, uključujući ponovljene skenove istog uređaja.
- `Jedinstvena skeniranja`: jedan uređaj koji skenira jedan konkretan QR računa se kao jedan jedinstveni scan, bez obzira na broj ponavljanja.
- Deset skeniranja istog QR-a sa istog uređaja = 10 ukupnih i 1 jedinstveno skeniranje.

### Anonimni identitet — ZAKLJUČANO

- Pri prvoj poseti generiše se kriptografski nasumičan `visitorToken`.
- Token se čuva u first-party browser skladištu na uređaju, bez naloga ili prijave.
- Backend čuva samo hash tokena; token ne sadrži ime, email, telefon niti drugi lični podatak.
- Brisanje browser podataka ili privatni režim mogu da naprave nov anonimni identitet. To je prihvaćeno ograničenje sistema bez naloga.
- Isti token važi kao anonimni identitet kroz oba sajma, dok su garaža i napredak odvojeni po događaju.
- Garaža se čuva lokalno po uređaju i događaju.
- Kontakt podaci iz tokova `Zainteresovan sam` i probne vožnje ne čuvaju se u browser skladištu nakon uspešnog slanja.
- Anonimni token omogućava samo rad sa sopstvenim anonimnim akcijama. Ne omogućava čitanje leadova, kontakata, izveštaja ili administratorskih podataka.
- Ocena je jedinstvena po kombinaciji `posetilac + model`; ponovni unos menja postojeću ocenu.
- Glas je jedinstven po kombinaciji `posetilac + pitanje`; ponovni unos menja postojeći glas.
- Glas za omiljeni model pasoša je jedinstven po kombinaciji `posetilac + brend + događaj`.
- Jedinstveni scan je prvi zapis kombinacije `posetilac + model`; svaki validan scan i dalje ulazi u ukupan broj skeniranja.
- Uvodi se razumno ograničenje učestalosti po tokenu i akciji. Potpuna zaštita od osobe koja obriše browser podatke i dobije novi token nije cilj V1.
- Fingerprinting, email/telefon kao identitet i obavezna registracija su odbačeni.

### OTVORENO

- Vremenski prozor i pravila za filtriranje botova, preview skenova i operativnih testova.
- Pravila za scan koji nastaje pre zvaničnog otvaranja ili posle zatvaranja dana.

---

## 6. Garaža

### ZAKLJUČANO

- Garaža radi bez naloga.
- Stanje se automatski pamti unutar first-party browser skladišta na tom uređaju.
- Lokalno čuvanje ne znači preuzimanje fajla na telefon: posetilac ne instalira aplikaciju, ne preuzima podatke i ne potvrđuje čuvanje pri svakom dodavanju modela.
- Dodavanje u garažu odmah ažurira browser stanje u pozadini.
- PDF se preuzima samo kada posetilac izričito izabere izvoz.
- Email se šalje samo kada posetilac izričito izabere slanje garaže sebi i unese adresu.
- Posetilac može da izveze garažu u PDF i/ili da je pošalje sebi na email.
- Postoje dva taba/garaže, po jedan za svaki sajam; trenutno aktivni sajam ima prvenstvo u prikazu.
- Brisanje browser podataka ili privatni režim mogu da obrišu lokalno stanje. Posetiocu treba kratko i razumljivo upozorenje, bez nametljivosti.
- U garaži postoji posebna sponzorisana traka Naprednih modela.
- Svi modeli sa Naprednim paketom ravnopravno se rotiraju; srodnost sa sačuvanim modelima nije kriterijum.
- Kartica/traka prikazuje sliku i naziv modela, akciju `Pogledaj` i akciju `Dodaj u garažu`.
- `Pogledaj` otvara detalje modela, odakle model takođe može odmah da se doda u garažu.

### OTVORENO

- Tačan format PDF izvoza i email poruke.
- Učestalost i trajanje rotacije sponzorisanih modela.

---

## 7. Ocene

### ZAKLJUČANO

- Starter: jedna ukupna ocena modela od 1 do 5.
- Napredni: pored svega iz Startera, odvojene ocene izgleda, specifikacija i cene.
- Isti anonimni posetilac može da izmeni svoju prethodnu ocenu.
- Izmena ne sme da napravi novu nezavisnu ocenu istog posetioca za isti model.

### OTVORENO

- Da li se javnosti prikazuje prosečna ocena i broj glasova u realnom vremenu ili tek nakon minimalnog broja odgovora.

---

## 8. `Zainteresovan sam` i probna vožnja

### ZAKLJUČANO

`Zainteresovan sam` pripada Starter paketu. To je niži nivo namere.

Prijava za probnu vožnju pripada Naprednom paketu. To je jači, „hot lead” signal.

Za oba toka:

- posetilac ostavlja kontakt podatke;
- postoji jedna jasna saglasnost `Prihvatam` / `Odbijam`;
- ScanMe prima podatke i dostavlja ih izlagaču;
- izlagač nema panel;
- posetilac dobija samo jednu potvrdu neposredno nakon prijave.

Za probnu vožnju:

- posetilac ne bira datum ni termin;
- prijava je zahtev;
- diler naknadno kontaktira posetioca i dogovara termin.

Za Napredni paket:

- postoji jedan automatizovani follow-up posle sajma;
- izlagač može da dostavi tekst poruke;
- slanje ide preko ScanMe email infrastrukture (postojeća Resend integracija treba da se proveri pre oslanjanja na nju).

### OTVORENO

- Koja su minimalna obavezna kontakt polja po toku.
- Konačan tekst saglasnosti i politika privatnosti.
- Trenutak slanja poslesajamskog follow-upa.
- Pravila neuspešne isporuke, ponovnog slanja i odjave.

---

## 9. Glas publike i anketa

### 9.1 Glas publike

**ZAKLJUČANO**

- Glas publike je interaktivno glasanje koje treba da bude zanimljivo posetiocu i korisno izlagaču.
- Starter dobija jedno pitanje po sajamskom danu.
- Napredni dobija do pet pitanja po sajamskom danu.
- Pitanje formuliše izlagač; ScanMe tim ga unosi.
- Svako pitanje mora da ima najmanje dve ponuđene opcije.
- Posetilac može da promeni svoj glas.
- Pitanja se prikazuju u kratkom mobilnom toku.
- Kada postoji više pitanja, prikazuju se tačkice/progres, korisnik može da izađe, a završeni odgovori se pamte.
- Posetilac može ponovo da vidi rezultat pitanja na koje je već odgovorio.
- Novo pitanje kreće od nule; evidencija prethodnog pitanja ostaje sačuvana.

### 9.2 Anketa

**ZAKLJUČANO**

- Anketa je odvojena funkcionalnost Naprednog paketa.
- Namenjena je direktnim, praktičnim pitanjima jednom posetiocu, na primer načinu kupovine ili nameri.
- Pitanja su kratka: da/ne ili izbor između ponuđenih odgovora.
- Izlagač odlučuje kako će koristiti anketu; ne ograničavamo je isključivo na jednu vrstu istraživanja tržišta.

### Razlika koja se mora čuvati u komunikaciji

- `Glas publike` ima rezultat koji je zanimljiv i drugim posetiocima da vide.
- `Anketa` prikuplja odgovore korisne izlagaču, čak i kada zbirni rezultat nije zabavan ili relevantan publici.

---

## 10. Sponzorisana rotacija Naprednih modela

### 10.1 Na mapi i sajamskim displejima

**ZAKLJUČANO**

- Svi modeli sa Naprednim paketom ulaze u ravnopravnu rotaciju.
- Na mapi/displeju se periodično prikazuju model, rezultat jednog odabranog pitanja i pozicija štanda.
- Na mapi se više ne glasa.
- Prikazuje se samo rezultat već prikupljenih glasova.
- Reveal animacija privlači pažnju, a zatim lokacija štanda zasija/animira se.
- Prikaz ne zavisi od toga da li je posetilac otvorio mapu i kliknuo glasanje; rotacija radi automatski na sajamskim displejima.

### 10.2 U garaži

**ZAKLJUČANO**

- Svi modeli sa Naprednim paketom ulaze u ravnopravnu sponzorisanu rotaciju u garaži.
- Prikazuju se slika i naziv modela.
- Dostupne su akcije `Pogledaj` i `Dodaj u garažu`.
- Rotacija nije personalizovana prema srodnosti modela.
- Sponzorisani model se ne dodaje automatski u garažu.

### OTVORENO

- Dužina slota i precizan algoritam ravnopravne rotacije.
- Izbor pitanja/rezultata koji se prikazuje uz model na mapi.
- Ponašanje kada Napredni model još nema dovoljno glasova.
- Redosled, preload i fallback kada nedostaje slika modela.

---

## 11. Pasoš brenda

### ZAKLJUČANO

- Pasoš postoji na nivou brenda.
- Svaki skenirani model tog brenda popunjava jedan pečat.
- Svrha je da posetioci imaju podstrek da pogledaju svaki izloženi model brenda.
- Kada posetilac prikupi sve pečate, pasoš dobija završnu animaciju i postaje aktivno dugme.
- Posetilac zatim bira omiljeni model brenda i vidi koliko posetilaca deli njegov izbor.
- Izlagač dobija dodatni uvid u interesovanje za sve modele i u izbor favorita.
- Funkcionalnost ima smisla samo kada su svi relevantni modeli brenda uključeni/validni za pasoš.

### OTVORENO

- Uslov paketa da bi brend pasoš bio aktivan za ceo brend.
- Ponašanje ako se model doda ili ukloni nakon početka sajma.

---

## 12. Analitika i izveštavanje

### ZAKLJUČANO

Analitika je glavni prodajni argument paketa.

Izlagači nemaju dashboard. ScanMe im šalje podatke kada je operativno prikladno.

Dnevni presek se šalje nakon završetka svakog sajamskog dana i treba da bude dovoljno kratak da izlagač može da reaguje sledećeg dana.

Zaključane metrike/segmenti:

- ukupna skeniranja;
- jedinstvena skeniranja;
- interesovanje (`Zainteresovan sam`);
- zahtevi za probnu vožnju;
- ocene;
- odgovori Glasa publike;
- odgovori ankete;
- podaci po modelu;
- podaci po danu.

Starter dobija dnevni presek i analitiku modela. Napredni dobija sve to, plus detaljnije podatke iz dodatnih funkcionalnosti i automatizovani follow-up.

Podaci se dostavljaju emailom kao PDF, tabela ili drugi format koji ScanMe tim pripremi.

### OTVORENO

- Da li dnevni presek prikazuje i raspodelu po satima. Preporuka za odluku: prikazati bar skeniranja po satu jer omogućavaju korekciju osoblja i aktivnosti tokom narednog dana, ali ne obećavati metriku dok se ne potvrdi implementacioni trošak.
- Tačan format dnevnog preseka i završnog izveštaja.
- Minimalan broj odgovora pre prikaza procentualnih rezultata.
- Da li se organizatoru dostavlja agregat svih izlagača i u kom formatu.

---

## 13. Podaci, privatnost i zadržavanje

### ZAKLJUČANO

- Za javno korišćenje nema registracije niti naloga.
- Lični podaci se prikupljaju samo u tokovima u kojima ih posetilac namerno ostavlja.
- Saglasnost je jedna jasna odluka: prihvata ili odbija.
- Kontakt podaci idu prvo ScanMe timu, koji ih zatim dostavlja odgovarajućem izlagaču.
- Podaci se čuvaju do **15 dana nakon završetka drugog sajma**.

### OTVORENO — blokira produkcijsku potvrdu lead tokova

- Pravna formulacija saglasnosti i ko je rukovalac/obrađivač podataka u svakom toku.
- Precizan automatski postupak brisanja/anonymizacije nakon roka.
- Da li se dokaz saglasnosti čuva duže od samih kontakt podataka i na kom pravnom osnovu.
- Kontrola pristupa ScanMe tima ličnim podacima.
- Bezbedan transport izveštaja izlagaču.

---

## 14. Dizajn i UX pravila

### ZAKLJUČANO

- Mobile-first je obavezan.
- Javni interfejs događaja koristi samo svetlu temu.
- Sajamsko iskustvo dobija poseban event vizuelni identitet.
- Ne kopira se tehnički/industrijski stil ScanMe prelaunch landing stranice na sve korisničke ekrane.
- Interfejsi za obične posetioce treba da budu prijatni, jasni i jednostavni.
- Dizajn svih paralelno izrađenih modula mora da koristi isti sistem boja, tipografije, razmaka, komponenti, stanja i animacija.
- Nikakva važna funkcija ne sme da zavisi samo od hovera.
- Animacije ne smeju da uspore skeniranje, unos ili prikaz rezultata i moraju da poštuju reduced-motion.

### Obavezan dizajn artefakt pre paralelnog kodiranja

Potrebno je napraviti i zaključati jedan `EVENT-DESIGN-SYSTEM.md` ili ekvivalentan Figma/spec dokument koji sadrži:

- paletu i semantičke tokene;
- tipografske uloge;
- spacing skalu i grid;
- kartice, dugmad, inpute, modal/sheet i toast;
- loading, empty, success, error i disabled stanja;
- motion pravila;
- mobilni i display breakpoint;
- primere stranice modela, glasanja, garaže, mape i pasoša.

Dok taj artefakt nije zaključan, agenti mogu da rade model podataka, API ugovore i testove, ali ne treba nezavisno da izmišljaju finalne UI stilove.

---

## 15. Način rada i delegiranje

### ZAKLJUČANO

- Ovaj razgovor/task je komandni centar: odluke, prioriteti, zavisnosti i prihvatanje rezultata.
- Implementacija se deli na zasebne, ograničene taskove.
- Kolega radi takođe preko AI agenta i može da preuzme tehnički zahtevne module i obimnije promptove.
- Nijedan agent ne sme sam da promeni paket, poslovno pravilo ili UX tok zato što mu je lakše za implementaciju.
- Svaki task mora da navede ulaze, izlaze, zabranjene izmene, kriterijume prihvatanja i proveru.
- Zajednički ugovori i tipovi se zaključavaju pre paralelnog rada da dva agenta ne naprave različite modele iste funkcije.

### Preporučena podela implementacionih tokova — PRIVREMENO

1. **Osnova događaja i model podataka**
   - događaji, dani, izlagači, brendovi, modeli, štandovi, paketi i aktivacije;
   - javni/admin ugovori i seed/import format.
2. **QR i javna stranica modela**
   - scan evidencija, specifikacije, paketom uslovljene akcije.
3. **Anonimni identitet i garaža**
   - lokalno čuvanje, dva sajma, export/email, sponzorisana rotacija.
4. **Ocene, Glas publike i anketa**
   - promene odgovora, progres, rezultati i istorija pitanja.
5. **Leadovi i email automatizacija**
   - zainteresovanost, probna vožnja, saglasnost, potvrde i follow-up.
6. **Mapa i display rotacija**
   - prikaz štandova, rezultat pitanja, reveal i animacija lokacije.
7. **Pasoš brenda**
   - pečati, kompletiranje i glas za omiljeni model.
8. **Analitika i izveštaji**
   - metričke definicije, dnevni presek, PDF/tabele i brisanje podataka.
9. **Dizajn-sistem i integracioni QA**
   - jedinstven vizuelni ugovor, responsive/accessibility provera i end-to-end tokovi.

### OTVORENO pre konačne raspodele

- Koje module radi kolega, a koje ovaj Codex tok.
- Tačan redosled taskova i kritični put do 9. oktobra.
- Ko je vlasnik finalnog dizajn-sistema i ko odobrava odstupanja.
- Ko radi unos podataka pristiglih od izlagača i ko radi završnu proveru svakog QR-a.

---

## 16. Zabranjena nagađanja za agente

Agent ne sme da uvede sledeće bez nove eksplicitne odluke:

- nalog ili prijavu za posetioca;
- nalog, dashboard ili self-service panel za izlagača;
- izbor termina probne vožnje;
- automatsko dodavanje sponzorisanog modela u garažu;
- personalizaciju sponzorisanih modela prema „srodnosti”;
- glasanje direktno na mapi;
- poređenje Naprednog modela sa svim modelima iste kategorije;
- prodaju ili online plaćanje paketa na javnom sajtu;
- prikaz brojeva ili algoritma toplotne mape koji nije naknadno dogovoren;
- izmišljene podatke, fotografije, specifikacije, cene ili rezultate;
- tvrdnju da je nešto odobrio vlasnik ili organizator ako to nije navedeno kao `ZAKLJUČANO`.

Ako je detalj potreban za implementaciju, a nije zaključen, agent ga upisuje kao otvoreno pitanje i bira samo bezbedan, lako promenljiv tehnički placeholder koji nije javno obećanje.

---

## 17. Aktuelni artefakti

### Prodajni i interni dokumenti

- Aktuelna spoljašnja ponuda: `output/pdf/scanme-ponuda-za-izlagace-sajam-automobila-2026-v10.pdf`
- Aktuelni interni vodič: `output/pdf/scanme-interni-vodic-ponuda-izlagacima-sajam-automobila-2026-v6.pdf`

PDF je prodajni sažetak. Ovaj Markdown je kanonski dokument za detaljna pravila. Ako se razlikuju, razlika se ne rešava ćutke: prijavljuje se vlasniku i usklađuju se oba dokumenta.

### Postojeći sajam/mapa prototip

- DEV ruta: `/dev/sajam-cair`
- Relevantni fajlovi trenutno uključuju `app/dev/sajam-cair/` i `lib/i18n/sr/event-map.ts`.
- Ovo je postojeće implementaciono stanje, ne dokaz da su svi UX i poslovni detalji zaključani.

### Prelaunch

- ScanMe prelaunch implementacija je odvojena od event korisničkog interfejsa.
- Postojeći fajlovi uključuju `app/prelaunch/`, `components/prelaunch-*`, `lib/i18n/sr/prelaunch.ts` i `lib/prelaunch-mode.ts`.
- Ne koristiti prelaunch vizuelni jezik kao automatski template za mapu, garažu i stranice modela.

---

## 18. Minimalni kriterijumi prihvatanja pre sajma

Pre produkcije mora da bude dokazano najmanje sledeće:

- svaki QR vodi na tačan model;
- paket modela otključava samo pripadajuće funkcije;
- mobilni tokovi rade bez horizontalnog overflowa;
- anonimno stanje garaže, ocene i glasovi ponaša se prema pravilima;
- promena ocene/glasa menja prethodni zapis umesto dupliranja;
- ukupna i jedinstvena skeniranja daju očekivane rezultate;
- lead i probna vožnja čuvaju saglasnost i šalju tačnu potvrdu;
- dnevni presek koristi stvarne podatke i ne meša izlagače/modele;
- sponzorisane rotacije su ravnopravne i ne dodaju model automatski;
- mapa/displej ne prikazuje glasanje, već rezultat i animaciju štanda;
- dva sajma su razdvojena u garaži, uz prvenstvo aktivnog;
- error/loading/empty stanja su razumljiva običnom posetiocu;
- svetla tema radi na ciljanim telefonima i sajamskom displayu;
- bar jedan pun prolaz se testira sa realnim QR kodovima pre otvaranja.

---

## 19. Otvorena pitanja — prioritet

### P0 — blokira bezbednu ili osnovnu implementaciju

1. Pravna saglasnost, politika privatnosti i brisanje podataka.
2. Konačna podela modula između kolege i ovog Codex toka.

### P1 — potrebno pre integracionog testa

1. Slot/algoritam obe sponzorisane rotacije.
2. Pravila pasoša kada nisu svi modeli uključeni.
3. Format i vreme slanja dnevnog preseka.
4. Minimalni broj glasova pre javnog procentualnog rezultata.
5. Tekstovi email potvrda i poslesajamskog follow-upa.
6. Koji rezultat Glasa publike se vezuje za model na mapi.

### P2 — može posle funkcionalne osnove

1. Konačan izgled PDF izvoza garaže.
2. Fina animacija kompletiranog pasoša.
3. Vizuelno poliranje reveal animacije na displayu.
4. Dodatna segmentacija dnevne analitike po satima.

---

## 20. Dnevnik izmena

### 1. oktobar 2026.

- Napravljen prvi kanonski master dokument iz dosadašnjih potvrđenih odluka i odgovora.
- Razdvojeni su zaključani, privremeni i otvoreni detalji.
- Evidentirane su obe odvojene sponzorisane rotacije: na mapi/displejima i u garaži.
- Evidentirano je da Starter ima `Zainteresovan sam`, a Napredni probnu vožnju.
- Evidentirano je da Starter ima jedno, a Napredni do pet pitanja Glasa publike po danu.
- Evidentirano je da se na mapi ne glasa; prikazuje se rezultat i animira lokacija štanda.
- Zaključan P0.1: kriptografski nasumičan anonimni token uređaja, hash na backendu, bez naloga i fingerprintinga; njime se upsertuju jedinstveni skenovi, ocene i glasovi.
- Zaključan P0.2: paket pripada modelu na konkretnom sajmu; dozvoljena je samo nadogradnja, ranija skeniranja ostaju u analitici, a plaćene interakcije važe od aktivacije.
- Precizirano lokalno čuvanje garaže: automatsko browser stanje bez instalacije ili preuzimanja; PDF i email postoje samo kao dobrovoljne akcije.
- Zaključan P0.3: ScanMe normalizuje podatke izlagača; specifikacije su fleksibilni parovi naziv–vrednost, cena je očekivana uz fallback, fotografija nije obavezna za stranicu modela, a objava prolazi internu proveru.

---

## 21. Obavezni uvod za svaki delegirani task

U svaki novi agentski zadatak uključiti sledeće:

> Pre rada pročitaj `docs/events/sajam-automobila-2026/MASTER-KONTEKST.md` u celosti. On je kanonski izvor poslovnih i UX odluka za Sajam automobila 2026. Ne menjaj stavke označene kao ZAKLJUČANO i ne izmišljaj odgovore za OTVORENO. Radi samo opseg ovog taska, sačuvaj postojeće korisničke izmene i prijavi svaki konflikt između koda, PDF ponude i master dokumenta. Na kraju navedi šta je implementirano, šta je provereno i koja otvorena pitanja ostaju.

Uz ovaj uvod task mora da sadrži i:

- konkretan cilj;
- relevantne odeljke master dokumenta;
- fajlove koje sme da menja;
- fajlove/oblasti koje ne sme da menja;
- očekivane ulaze i izlaze;
- proverljive kriterijume prihvatanja;
- zavisnosti od drugih taskova.
