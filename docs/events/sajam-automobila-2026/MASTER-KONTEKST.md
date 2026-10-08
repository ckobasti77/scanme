# ScanMe × Sajam automobila 2026 — master kontekst

> Status: **ZAKLJUČAN ZA DELEGIRANJE**
>
> Poslednje ažuriranje: 7. oktobar 2026.
> Vlasnik proizvodnih odluka i finalni go/no-go: **Aleksa**
> Rok za operativnu spremnost prve faze: **9. oktobar 2026.**
> Prateći tehnički dokument: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)
> Frontend plan: [`FRONTEND-INTEGRATION-PLAN.md`](./FRONTEND-INTEGRATION-PLAN.md)
> Javni UI/UX ugovor: [`EVENT-DESIGN-SYSTEM.md`](./EVENT-DESIGN-SYSTEM.md)
> Operativni paket za unos podataka: [`DATA-INTAKE-SPEC.md`](./DATA-INTAKE-SPEC.md)

## 0. Kako se koristi ovaj dokument

Ovaj dokument je početna tačka za svakog čoveka ili AI agenta koji radi na projektu Sajma automobila. Pre početka zadatka mora da se pročita ceo dokument, a zatim samo reference relevantne za konkretan zadatak.

`MASTER-KONTEKST.md` definiše proizvod, poslovna pravila, korisnička iskustva i operativni način rada. `BACKEND-HANDOFF.md` ta pravila pretvara u tehnički ugovor za Jovanovog backend agenta. Dokumenti se kolegi uvek šalju zajedno. Ako postoji kontradikcija između njih, agent ne bira tumačenje i ne menja pravilo samostalno, već prijavljuje konflikt komandnom centru.

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
- Integracioni test je planiran za **8. oktobar 2026.** i mora obuhvatiti oba događaja pomoću seedovanog budućeg drugog događaja.
- Postoji mogućnost samo jednog dana testiranja u hali pre početka sajma.
- Podaci i materijali od izlagača verovatno neće biti kompletni pre ponedeljka u nedelji pred sajam.
- Svaki model postoji kao jedan fizički izloženi primerak i dobija svoj QR kod.
- Mobilni prikaz je primarni. Posetilac sve radi telefonom.
- Veće rezolucije su potrebne prvenstveno za sajamske displeje na kojima se prikazuje mapa.
- Sistem radi na postojećem ScanMe projektu i Convex backendu, uz ograničenja besplatnog plana.
- Izlagači nemaju naloge, dashboard niti obavezu da rade u sistemu.
- ScanMe tim unosi podatke, podešava pitanja, upravlja sadržajem i šalje izveštaje.
- Potrebno je pripremiti 100 postojećih ScanMe dinamičkih QR identiteta i poslati ih u štampu do ponedeljka; krajnja destinacija modela može se dodeliti kasnije.
- Minimalni integracioni seed: oba događaja, najmanje dva izlagača, deset modela i sva tri paketa.
- Ciljni uređaji za proveru su Android, iPhone i sajamska display rezolucija.

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
- Ukupan i jedinstven broj skeniranja štanda.

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

Napredni paket sadrži Starter pogodnosti, ali je režim ocenjivanja namerna zamena: Napredni nema dodatnu četvrtu „ukupnu” ocenu. Ima tačno tri opcione ocene — izgled, specifikacije i cena.

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

### 4.6 Izlagači kao ScanMe klijenti — ZAKLJUČANO

- Izlagač se tehnički vodi kroz postojeće `accounts`, `businesses` i kontakt zapise; ne pravi se paralelni duplikat klijenta u posebnoj `fairExhibitors` tabeli.
- Novi klijent koji postoji samo zbog sajma dobija nezavisnu klasifikaciju `event_only` i pojavljuje se u admin sekciji `Događaji`, ne u redovnoj listi klijenata.
- Postojeći ScanMe klijent koji učestvuje na sajmu ostaje `standard`.
- Akcija `Prebaci u redovne klijente` menja klasifikaciju postojećeg zapisa. Ne kopira ID, kontakt, istoriju, QR ili event podatke.
- Konkretno učešće izlagača na konkretnom događaju predstavlja zaseban event zapis povezan sa njegovim postojećim business/contact podacima.

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
- Štampani kod koristi postojeći stabilni ScanMe resolver `/r/[cardCode]`; ne pravi se paralelni sajamski QR sistem.
- Resolver beleži fizički scan i zatim otvara javnu mobilnu stranicu baš tog modela.
- Javne čitljive rute su `/sajam/elektromobilnost-2026/...` i `/sajam/auto-moto-fest-2026/...`; promena sluga modela ne zahteva novu štampu jer štampani resolver kod ostaje isti.
- Za osnovni nivo stranica prikazuje naziv, cenu i specifikacije. Fotografija je opciona.
- Funkcije na stranici zavise od aktiviranog paketa tog modela.
- Aktivacija paketa važi od trenutka aktivacije; nema retroaktivnog pripisivanja funkcija pre aktivacije.
- Stranice modela mogu da se pregledaju pre početka sajma radi provere organizatora i izlagača.
- Javne event stranice su `noindex` u V1.

### Brojanje skeniranja

- `Ukupna skeniranja`: svaki validan scan događaj, uključujući ponovljene skenove istog uređaja.
- `Jedinstvena skeniranja`: jedan uređaj koji skenira jedan konkretan QR računa se kao jedan jedinstveni scan, bez obzira na broj ponavljanja.
- Deset skeniranja istog QR-a sa istog uređaja = 10 ukupnih i 1 jedinstveno skeniranje.
- Prijavljeni ScanMe administratori Aleksa, Jovan i Teodora ne ulaze u sajamsku statistiku skeniranja.
- Sva ostala skeniranja računaju se bez obzira na radno vreme sajma, uključujući kasniji povratak preko sačuvane browser stranice.
- U V1 se ne uvodi poseban bot/preview filter za sajamske metrike.
- Direktno otvaranje modela iz garaže ili sponzorisane kartice nije QR scan; vodi se kao poseban pregled/reklamna konverzija.
- QR, direktni i deljeni ulazi ne smeju se mešati: `/r/[cardCode]` jedini proizvodi scan; običan kanonski model URL je `direct_view`; otvaranje javne deljene kolekcije je `share_open`; korišćenje akcije za deljenje je `share_action`.
- `share_action` označava uspešno predavanje sadržaja sistemskom share sheet-u, izbor WhatsApp/Viber izlaza ili uspešno kopiranje linka, ne garantuje da je poruka stvarno poslata.
- QR resolver postavlja kratkotrajnu potpisanu HttpOnly oznaku izvora kako model-page view posle 302 ne bi bio pogrešno uračunat kao direktan ulaz. Oznaka ne ulazi u URL i ne menja scan metriku.
- Deljene kolekcije i saobraćajni događaji imaju zaseban backend ugovor i nikada ne pozivaju scan pipeline.

### Anonimni identitet — ZAKLJUČANO

- Pri prvom `/r/[cardCode]` ulasku ili direktnom event bootstrap-u server generiše kriptografski nasumičan `visitorToken`.
- Raw token se čuva kao first-party `HttpOnly`, `Secure`, `SameSite=Lax` cookie na uređaju, bez naloga ili prijave; JavaScript ga ne čita.
- Backend čuva samo hash tokena; token ne sadrži ime, email, telefon niti drugi lični podatak.
- Brisanje browser podataka ili privatni režim mogu da naprave nov anonimni identitet. To je prihvaćeno ograničenje sistema bez naloga.
- Isti token važi kao anonimni identitet kroz oba sajma, dok su garaža i napredak odvojeni po događaju.
- Garaža se čuva lokalno po uređaju i događaju.
- Kontakt (ime i email/telefon) iz tokova `Zainteresovan sam`, probne vožnje i opcionog kontakta u anketi čuva se u browser skladištu samo kada posetilac sam uključi `Zapamti moj kontakt na ovom telefonu` (podrazumevano isključeno) i kada slanje uspe. Na sledećem obrascu posetilac može da ga iskoristi (`Koristi`) ili obriše (`Zaboravi`). Saglasnost, visitor token i drugi podaci se nikada ne pamte. `Prihvatam` se bira svaki put, jer saglasnost imenuje konkretnog izlagača. Ovo je odluka vlasnika proizvoda od 8. oktobra 2026. i zamenjuje ranije pravilo da se kontakt nikada ne čuva u browseru.
- Anonimni token omogućava samo rad sa sopstvenim anonimnim akcijama. Ne omogućava čitanje leadova, kontakata, izveštaja ili administratorskih podataka.
- Ocena je jedinstvena po kombinaciji `posetilac + model`; ponovni unos menja postojeću ocenu.
- Glas je jedinstven po kombinaciji `posetilac + pitanje`; ponovni unos menja postojeći glas.
- Glas za omiljeni model pasoša je jedinstven po kombinaciji `posetilac + brend + događaj`.
- Jedinstveni scan je prvi zapis kombinacije `posetilac + model`; svaki validan scan i dalje ulazi u ukupan broj skeniranja.
- Uvodi se razumno ograničenje učestalosti po tokenu i akciji. Potpuna zaštita od osobe koja obriše browser podatke i dobije novi token nije cilj V1.
- Fingerprinting, email/telefon kao identitet i obavezna registracija su odbačeni.
- Cookie ističe najkasnije 16. novembra 2026; nakon server-side purge-a njegov nasumični sadržaj više nema poveziv zapis u bazi.

### Operativni zahtev

Postojeći `/r/[cardCode]` tok mora jednim server request ID-em da zabeleži generičku QR atribuciju i sajamski scan. Ne sme da preusmeri na drugi endpoint koji isti fizički scan ponovo broji.

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
- Postoje dve garaže, po jedna za svaki sajam, svaka na svojoj adresi `/sajam/[eventSlug]/garaza`; trenutno aktivni sajam ima prvenstvo kada adresa ne navodi sajam.
- Brisanje browser podataka ili privatni režim mogu da obrišu lokalno stanje. Posetiocu treba kratko i razumljivo upozorenje, bez nametljivosti.
- U garaži postoji posebna sponzorisana traka Naprednih modela.
- Svi modeli sa Naprednim paketom ravnopravno se rotiraju; srodnost sa sačuvanim modelima nije kriterijum.
- Kartica/traka prikazuje sliku i naziv modela, akciju `Pogledaj` i akciju `Dodaj u garažu`.
- `Pogledaj` otvara detalje modela, odakle model takođe može odmah da se doda u garažu.
- Dugi dodir na karticu uključuje režim izbora i bira taj model. U režimu izbora običan dodir bira ili uklanja ostale modele.
- Režim izbora podržava najviše pet modela i ima stalno dostupne akcije: poređenje, deljenje, uklanjanje i izlaz. Poređenje je moguće samo za tačno dva modela.
- Sponzorisana traka se privremeno sklanja dok je režim izbora aktivan, kako se dve fiksne trake ne bi preklapale i izazivale pogrešne dodire.
- Svaka kartica van režima izbora ima zasebnu akciju za deljenje jednog modela.
- Deljenje jednog modela koristi kanonski URL modela i bogat preview sa fotografijom, brendom, nazivom i cenom. Na telefonu se prvenstveno koristi sistemski share sheet; fallback je kopiranje linka.
- Deljenje dva do pet modela pravi javnu kolekciju na `/sajam/[eventSlug]/deli/[shareCode]`. Preview prikazuje do tri modela i oznaku `+N` za preostale. Kolekcija prestaje da bude javno dostupna 16. novembra 2026.
- Izvoz izabranih modela „kod sebe” znači eksplicitni PDF ili email izvoz; nije drugo lokalno čuvanje, jer su modeli već u browser garaži.

### PRIVREMENO

- Tačan vizuelni format PDF izvoza i email poruke zaključava se kroz dizajn task; ponašanje izvoza je već zaključano.
- Sponzorisani slot u garaži traje 8 sekundi i pauzira se dok korisnik aktivno koristi karticu.

---

## 7. Ocene

### ZAKLJUČANO

- Starter: jedna ukupna ocena modela od 1 do 5.
- Napredni: umesto Starter ukupne ocene ima tačno tri odvojene opcione ocene — izgled, specifikacije i cena.
- Skala je od 1 do 5 sa polovinama zvezdice (1; 1,5; 2; … 5), i za Starter i za tri Napredne ocene (odluka vlasnika proizvoda, 8. oktobar 2026.). Starter ocena se šalje čim posetilac pusti zvezdice. Potvrda se prikazuje tek posle uspešnog odgovora servera.
- Napredni nema četvrtu ukupnu ocenu i backend ne računa izvedeni ukupni prosek iz tri dimenzije.
- Isti anonimni posetilac može da izmeni svoju prethodnu ocenu.
- Izmena ne sme da napravi novu nezavisnu ocenu istog posetioca za isti model.
- Posetilac javno vidi samo sopstvenu ukupnu Starter ocenu ili svoje tri Napredne ocene. Javni prosek i broj ocena se ne prikazuju ni pre ni posle bilo kog praga.
- Broj ocena i odvojeni proseci dostupni su samo ScanMe adminu i izlagaču kroz dnevni/završni izveštaj. Napredni nema izmišljenu četvrtu ukupnu ocenu.

---

## 8. `Zainteresovan sam` i probna vožnja

### ZAKLJUČANO

`Zainteresovan sam` pripada Starter paketu. To je niži nivo namere.

Prijava za probnu vožnju pripada Naprednom paketu. To je jači, „hot lead” signal.

Za oba toka:

- posetilac unosi ime i najmanje jedan kontakt: telefon ili email;
- izlagač za probnu vožnju može da zahteva telefon, email ili oba, odnosno da označi samo preferirani kanal bez pretvaranja preference u obavezno polje;
- postoji jedna jasna saglasnost `Prihvatam` / `Odbijam` koja imenuje ScanMe i konkretnog izlagača kome se podaci prosleđuju;
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
- follow-up se šalje jednom, 24–48 sati nakon relevantnog sajma;
- neposredna potvrda objašnjava da posetilac odgovorom na ScanMe email može da otkaže taj jedini budući follow-up;
- ScanMe admin može da postavi suppression, a slanje ga proverava neposredno pre isporuke;
- slanje ide preko ScanMe email infrastrukture; postojeća Resend konfiguracija mora biti proverena u ciljnom deploymentu bez izlaganja tajni.

### Pravni tekst — PRIVREMENO do stručne provere

- ScanMe priprema nacrt saglasnosti i politike privatnosti, ali konačan tekst mora proći stručnu pravnu proveru pre produkcijskog uključivanja lead tokova.
- ScanMe prikuplja kontakt i prosleđuje ga imenovanom izlagaču; nakon predaje izlagač je odgovoran za svoje dalje korišćenje podataka.
- Ne uvodi se newsletter pretplata niti ponavljajuća kampanja.

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
- Javni rezultat se prikazuje od najmanje pet glasova. Ispod praga korisnik vidi svoj izbor i poruku da rezultat stiže nakon dovoljnog broja glasova.
- ScanMe admin ručno bira koje objavljeno pitanje/rezultat prati model u sponzorisanoj rotaciji.

### 9.2 Anketa

**ZAKLJUČANO**

- Anketa je odvojena funkcionalnost Naprednog paketa.
- Namenjena je direktnim, praktičnim pitanjima jednom posetiocu, na primer načinu kupovine ili nameri.
- Pitanja su kratka: da/ne ili izbor između ponuđenih odgovora.
- Izlagač odlučuje kako će koristiti anketu; ne ograničavamo je isključivo na jednu vrstu istraživanja tržišta.
- Anketa ima najviše pet pitanja. Pitanja su opciona, ali je za konačno slanje potreban najmanje jedan odgovor.
- Poslata anketa se ne menja naknadno i njeni rezultati nisu javni.
- Anketa pripada izlagaču (odluka vlasnika proizvoda, 8. oktobar 2026.). Kada je posetilac pošalje na jednom modelu, oblačić ankete se više ne prikazuje ni na jednom modelu istog izlagača na tom sajmu. Backend čuva jedan odgovor po posetiocu i modelu, pa frontend dodatno pamti lokalnu oznaku po sajmu i izlagaču.
- Na poslednjem koraku ankete posetilac može, ali ne mora, da ostavi kontakt. Ako ga ostavi i izabere `Prihvatam`, posle uspešno poslate ankete šalje se i jedan zaseban `Zainteresovan sam` lead.

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
- Slot traje 12 sekundi.
- Ako pitanje nema najmanje pet glasova, prikazuju se model/štand i neutralna poruka `Glasanje je u toku`, bez izmišljanja procenta.

### 10.2 U garaži

**ZAKLJUČANO**

- Svi modeli sa Naprednim paketom ulaze u ravnopravnu sponzorisanu rotaciju u garaži.
- Prikazuju se slika i naziv modela.
- Dostupne su akcije `Pogledaj` i `Dodaj u garažu`.
- Rotacija nije personalizovana prema srodnosti modela.
- Sponzorisani model se ne dodaje automatski u garažu.
- Slot traje 8 sekundi i pauzira se dok korisnik koristi karticu.

### Zajedničko pravilo rotacije — ZAKLJUČANO

- Svi objavljeni Napredni modeli su ravnopravni: svaki se prikazuje jednom pre ponavljanja.
- Redosled je stabilno izmešan za taj dan.
- Mapa i svi sajamski displeji računaju aktivni model iz zajedničkog vremenskog slota/epohe, tako da prikazuju isto bez posebne display administracije.
- Lista Naprednih modela objavljuje se/obnavlja ručnom admin akcijom nakon nadogradnje paketa.
- Ako fotografija nedostaje, koristi se logo brenda i neutralni event placeholder; nikada fotografija drugog vozila.
- Pasivna prikazivanja na mapi, displeju i u garaži ne beleže se niti prikazuju kao impresije.
- U garaži se kao sponzorisane konverzije beleže samo eksplicitne akcije `Pogledaj` i `Dodaj u garažu`. Mapa i displej ne proizvode metriku prikazivanja.

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
- Pasoš se aktivira samo kada brend ima najmanje dva izložena modela i svi imaju najmanje Starter paket.
- Eligible skup modela zamrzava se pre otvaranja događaja.
- Ako se model hitno povuče, admin može da ga ukloni iz potrebnog skupa bez poništavanja već stečenog napretka.
- Rezultat izbora omiljenog modela prikazuje se od najmanje pet glasova.
- Nema fizičke nagrade u V1.
- Svi aktivni pasoši imaju zaseban pregled u event navigaciji i prikazuju se i kada posetilac nema nijedan pečat; detalj brenda prikazuje modele, nove pečate i izbor favorita.
- Mapa označava brendove koji imaju aktivan pasoš i lični napredak posetioca `N/M`.
- Posetilac može da promeni omiljeni model nakon kompletiranja pasoša.
- Nakon izbora favorita posetilac može eksplicitno da sačuva lokalni digitalni badge. Badge ostaje samo na uređaju i može koristiti zvanični logo brenda.

---

## 12. Analitika i izveštavanje

### ZAKLJUČANO

Analitika je glavni prodajni argument paketa.

Izlagači nemaju dashboard. ScanMe im šalje podatke kada je operativno prikladno.

Dnevni presek se šalje nakon završetka svakog sajamskog dana i treba da bude dovoljno kratak da izlagač može da reaguje sledećeg dana.

- Dataset mora biti spreman najkasnije 60 minuta nakon zatvaranja dana.
- Izveštaj se generiše automatski, ali se uvek ručno proverava i odobrava pre automatizovanog slanja.
- Podržani izlazi su PDF i pregledan XLSX/CSV.
- PII lead export je odvojen od agregatnog izveštaja.
- Organizator dobija agregat bez PII i bez poverljivih pojedinačnih odgovora ankete.
- Od drugog sajamskog dana izveštaj sadrži kratak uporedni presek prema prethodnom danu.
- Admin može ponovo da pošalje izveštaj ili označi i pošalje korigovanu verziju.

Zaključane metrike/segmenti:

- ukupna skeniranja;
- jedinstvena skeniranja;
- interesovanje (`Zainteresovan sam`);
- zahtevi za probnu vožnju;
- ocene;
- odgovori Glasa publike;
- odgovori ankete;
- podaci po modelu;
- podaci po danu;
- raspodela skeniranja po satima.
- broj primljenih ocena i odvojene proseke dozvoljene paketom;
- sponzorisane garažne konverzije `Pogledaj` i `Dodaj u garažu`, bez pasivnih impression brojeva.

Starter dobija dnevni presek i analitiku modela. Napredni dobija sve to, plus detaljnije podatke iz dodatnih funkcionalnosti i automatizovani follow-up.

Podaci se dostavljaju emailom u terminu dogovorenom sa konkretnim izlagačem. Metrike za funkcionalnost koju paket nema ne prikazuju se kao lažne nule, već se izostavljaju.

### PRIVREMENO

- Tačan vizuelni template PDF-a i struktura XLSX/CSV-a zaključavaju se u zasebnom report dizajn tasku; dataset i rokovi su zaključani.

---

## 13. Podaci, privatnost i zadržavanje

### ZAKLJUČANO

- Za javno korišćenje nema registracije niti naloga.
- Lični podaci se prikupljaju samo u tokovima u kojima ih posetilac namerno ostavlja.
- Saglasnost je jedna jasna odluka: prihvata ili odbija.
- Kontakt podaci idu prvo ScanMe timu, koji ih zatim dostavlja odgovarajućem izlagaču.
- Pristup PII podacima imaju samo Aleksa, Jovan i Teodora.
- Svi leadovi moraju biti isporučeni izlagačima najkasnije **15. novembra 2026.**
- **16. novembra 2026.** trajno se brišu iz cloud baze i svih ScanMe lokalnih kopija: ime i prezime, telefon, email, odgovori povezivi sa osobom, visitor hash/identifikator, snapshot/dokaz saglasnosti, suppression i drugi podaci koji mogu identifikovati lice.
- Ne postoji dodatni PII grace period nakon 16. novembra.
- Posle brisanja ostaju samo nepovratno anonimizovani agregati i operativni zapis da je brisanje izvršeno, bez kontakta ili drugog PII u logu.
- Ako izlagač izgubi prethodno isporučene podatke nakon roka, ScanMe ne može ponovo da ih dostavi.
- Javni event sadržaj može 16. novembra da postane arhiviran/neinteraktivan, dok neosetljivi sadržaj i agregatna statistika mogu ostati sačuvani.

### Produkcijski gate

- Finalni tekst saglasnosti i politike privatnosti mora biti stručno proveren pre produkcijskog uključivanja lead tokova.
- Purge posao mora raditi u ograničenim batch-evima, imati ručni dry-run/preview i završni audit rezultat, ali nakon odobrenog pokretanja 16. novembra ne ostavlja PII.
- Bezbedan kanal dostave PII i tačan primalac dogovaraju se sa svakim izlagačem pre prvog izvoza.

---

## 14. Dizajn i UX pravila

### ZAKLJUČANO

- Mobile-first je obavezan.
- Javni interfejs događaja koristi samo svetlu temu.
- Sajamsko iskustvo dobija poseban event vizuelni identitet.
- Ne kopira se tehnički/industrijski stil ScanMe prelaunch landing stranice na sve korisničke ekrane.
- ScanMe zelena koristi se isključivo za označavanje ScanMe štanda na sajamskoj mapi. Nije opšti akcenat javnih event ekrana.
- Van ScanMe prelaunch stranice ne koriste se mono body tipografija, scan linije, neon, tehnički jezik niti dominantno staklo.
- Sajam automobila je primarni identitet event shell-a; ScanMe je sekundarno označen kao digitalni partner.
- Globalni theme toggle i globalni text-reveal ne prikazuju se na javnim sajamskim rutama.
- Interfejsi za obične posetioce treba da budu prijatni, jasni i jednostavni.
- Dizajn svih paralelno izrađenih modula mora da koristi isti sistem boja, tipografije, razmaka, komponenti, stanja i animacija.
- Nikakva važna funkcija ne sme da zavisi samo od hovera.
- Animacije ne smeju da uspore skeniranje, unos ili prikaz rezultata i moraju da poštuju reduced-motion.

### Zaključana javna arhitektura

- mapa/event home: `/sajam/[eventSlug]`;
- model: `/sajam/[eventSlug]/model/[modelSlug]`;
- Glas publike: `/sajam/[eventSlug]/model/[modelSlug]/glas-publike`;
- anketa: `/sajam/[eventSlug]/model/[modelSlug]/anketa` je deep link, a ne posebna stranica: otvara stranicu modela sa već otvorenom anketom. Ako anketa nije dostupna (model je nema, već je poslata ili pripada izlagaču koji je već dobio odgovore), adresa se svodi na stranicu modela;
- pregled pasoša: `/sajam/[eventSlug]/pasosi`;
- pasoš brenda: `/sajam/[eventSlug]/pasosi/[brandSlug]`;
- garaža sajma: `/sajam/[eventSlug]/garaza`;
- poređenje najviše dva modela: `/sajam/[eventSlug]/garaza/poredjenje`;
- deljena kolekcija: `/sajam/[eventSlug]/deli/[shareCode]`.

Odluka vlasnika proizvoda (7. oktobar 2026.): svaka javna sajamska ruta živi pod slugom događaja. Javni link uvek koristi javni slug (`elektromobilnost-2026`, `auto-moto-fest-2026`), nikada DEV slug sa prefiksom `test-`. Kratka adresa `/sajam` (za postere i panele) privremeno (307) preusmerava na aktivni sajam. Stare adrese bez sajma (`/sajam/garaza`, `/sajam/garaza/poredjenje`, `/sajam/deli/[shareCode]`) ne postoje, jer nijedan link ka njima nije objavljen. Štampani QR kodovi se ne menjaju jer idu kroz `/r/[cardCode]`, koji već vodi na `/sajam/[eventSlug]/model/[modelSlug]`.

Sve javne sajamske rute su `noindex`. Event shell koristi kompaktan sticky header sa Sajmom automobila kao primarnim identitetom, ScanMe oznakom digitalnog partnera i stalnim akcijama `Mapa`, `Pasoši` i `Garaža` sa brojem sačuvanih modela. Lead forme se kasnije otvaraju kao bottom sheet.

Zaključani redosled stranice modela je: event/brend kontekst, kompaktna opciona fotografija, naziv/varijanta/cena, najviše četiri ključne specifikacije, sticky čuvanje u garažu, Glas publike, grupisane pune specifikacije, ocenjivanje, lead akcije, anketa i pasoš brenda.

Garaža prikazuje jedan sajam, onaj iz adrese, sa istim event shell-om kao mapa i pasoši (`Mapa`, `Pasoši`, `Garaža` i broj sačuvanih modela tog sajma); prebacivanje na drugi sajam, kada se uključi, vodi na njegovu adresu garaže. Garaža čuva poslednje poznate podatke za offline čitanje, poredi najviše dva modela i rezerviše bottom inset za fixed sponzorisanu traku visine približno 88-104 px plus safe-area. Pasoš nije dupliran u Garaži, već je dostupan kao ravnopravna event navigacija. Lokalni garage dokument čuva V1 modele kroz V2 migraciju i kolekciju lokalno sačuvanih passport badge-eva.

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
- **Jovan** radi preko svog AI agenta na drugom računaru i polazi od zajedničke Git grane `codex/sajam-automobila-2026`.
- Jovan je jedini vlasnik sajamske Convex šeme i backend implementacije: anonimni identitet, entitlement pravila, skeniranja, ocene, glasovi, ankete, leadovi, analitika, izveštaji, email i retention funkcije.
- Za Jovanov backend zadatak preporučeni su `gpt-6-astra` i `high`; `xhigh` se koristi za završnu proveru šeme, authz/PII granica i retention logike.
- **Aleksa** je vlasnik proizvoda, javnog UX-a, QR štampe, produkcijskog deploya i konačnog go/no-go odobrenja.
- **Teodora** je primarna osoba za kontakt sa izlagačima i prikupljanje podataka; Aleksa je rezerva.
- Unos modela i QR mapiranje proveravaju dve osobe: jedna unosi, druga fizički skenira i potvrđuje model/destinaciju. Aleksa daje finalnu potvrdu.
- Aleksa i Jovan su tehnički on-call tokom sajma.
- Drugi agenti ne menjaju sajamske tabele, indekse ili Convex funkcije bez usaglašenog backend ugovora i koordinacije sa backend vlasnikom.
- Ovaj komandni centar vodi proizvodne odluke, prioritete, dizajn-sistem, javne mobilne interfejse i integracionu kontrolu.
- Produkcijsku mapu izrađuje kolega u svom toku. Komandni centar je ne preuzima, već kasnije radi audit, usaglašava integracioni ugovor i proverava stilsko uklapanje sa javnim event shell-om.
- Backend vlasnik prvo objavljuje tipizirani ugovor podataka/funkcija; frontend taskovi se grade prema tom ugovoru umesto da izmišljaju paralelni model.
- Nijedan agent ne sme sam da promeni paket, poslovno pravilo ili UX tok zato što mu je lakše za implementaciju.
- Svaki task mora da navede ulaze, izlaze, zabranjene izmene, kriterijume prihvatanja i proveru.
- Zajednički ugovori i tipovi se zaključavaju pre paralelnog rada da dva agenta ne naprave različite modele iste funkcije.

### Redosled implementacionih tokova — ZAKLJUČANO

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
6. **Mapa i display rotacija - kolegin implementacioni tok**
   - prikaz štandova, rezultat pitanja, reveal i animacija lokacije;
   - komandni centar isporučuje ugovor i radi kasniji audit, ne paralelnu implementaciju mape.
7. **Pasoš brenda**
   - pečati, kompletiranje i glas za omiljeni model.
8. **Analitika i izveštaji**
   - metričke definicije, dnevni presek, PDF/tabele i brisanje podataka.
9. **Dizajn-sistem i integracioni QA**
   - jedinstven vizuelni ugovor, responsive/accessibility provera i end-to-end tokovi.

### Admin sekcija `Događaji` — ZAKLJUČANO

- Uvodi se zaseban glavni admin tab `Događaji`, ne pod `Usluge` ili `Operacije`.
- Sadrži pregled događaja, event-only i standardnih izlagača, modele/pakete, QR inventar i dodelu, interakcije/leadove, izveštaje, sponsored snapshot i operativne akcije.
- Izlagači nemaju pristup ovoj sekciji; sve radi ScanMe tim.
- Aleksa i komandni centar zaključavaju `EVENT-DESIGN-SYSTEM.md`; agenti ne izmišljaju nezavisne vizuelne jezike.

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

### Tehnički handoff

- Jovanov obavezni prateći dokument: `docs/events/sajam-automobila-2026/BACKEND-HANDOFF.md`.
- Master i handoff se uvek šalju zajedno. Master definiše šta proizvod radi; handoff definiše kako backend to bezbedno implementira.

### Event dizajn-sistem

- Radni audit i predlog: `docs/events/sajam-automobila-2026/EVENT-DESIGN-SYSTEM.md`.
- Dokument je trenutno draft i nije dozvola za paralelnu finalnu UI implementaciju dok ga Aleksa ne potvrdi i status ne postane `ZAKLJUČAN`.
- Frontend podela rada i integracione granice: `docs/events/sajam-automobila-2026/FRONTEND-INTEGRATION-PLAN.md`.
- Frontend plan ne prenosi vlasništvo B0 ugovora sa Jovana i ne otključava finalni UI pre zaključenog dizajn-sistema.

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
- jedan fizički `/r/[cardCode]` zahtev ne pravi dva sajamska skena;
- prijavljeni ScanMe admin skenovi su isključeni, dok se ostali skenovi računaju 24/7;
- lead i probna vožnja čuvaju saglasnost i šalju tačnu potvrdu;
- dnevni presek koristi stvarne podatke i ne meša izlagače/modele;
- sponzorisane rotacije su ravnopravne i ne dodaju model automatski;
- mapa/displej ne prikazuje glasanje, već rezultat i animaciju štanda;
- dva sajma su razdvojena u garaži, uz prvenstvo aktivnog;
- error/loading/empty stanja su razumljiva običnom posetiocu;
- svetla tema radi na ciljanim telefonima i sajamskom displayu;
- bar jedan pun prolaz se testira sa realnim QR kodovima pre otvaranja.
- purge preview i test potvrđuju da 16. novembra mogu biti obrisani svi PII zapisi bez brisanja anonimnih agregata.

---

## 19. Otvorena pitanja — prioritet

### P0 — blokira produkcijsko uključivanje leadova

1. Stručna potvrda konačnog teksta saglasnosti i politike privatnosti.
2. Dogovor bezbednog kanala i tačnih primalaca PII izvoza za svakog izlagača.

### P1 — potrebno pre integracionog testa

1. Finalni tekstovi email potvrda i poslesajamskog follow-upa.
2. Primalac i dogovoreno vreme isporuke leadova/izveštaja po izlagaču.
3. Konačni vizuelni template PDF i XLSX/CSV izveštaja.
4. Stvarni spisak izlagača, modela, pitanja, paketa i kontakt preferenci.

### P2 — može posle funkcionalne osnove

1. Konačan izgled PDF izvoza garaže.
2. Fina animacija kompletiranog pasoša.
3. Vizuelno poliranje reveal animacije na displayu.
4. Fino poliranje event vizuala nakon funkcionalne osnove.

---

## 20. Dnevnik izmena

### 8. oktobar 2026.

- Odluka vlasnika proizvoda O4 (rešeno): više različitih izlagača sme da deli istu lokaciju na mapi. Na `hala-6` su AUTO MIG/Foton i Grand Motors/Mazda+Chery, isti tim na štandu 6, ali odvojeni izlagači sa posebnim izveštajima i leadovima. Validacija deljenu lokaciju prijavljuje samo kao upozorenje (`JOVAN-DELTA-2026-10-08.md`).
- Pravi događaj `elektromobilnost-2026` je postavljen na DEV-u: 5 `event_only` izlagača i 15 objavljenih modela iz ispravljenog intake-a. JMEV je jedini brend sa pasošem. Postupak za produkciju je u `RUNBOOK-EVENT-SETUP.md`.
- Odluka vlasnika proizvoda (7/8. 10.): ocene su na skali od 1 do 5 sa polovinama zvezdice, za Starter i za tri Napredne dimenzije (§7). Backend validacija je proširena (`JOVAN-DELTA-2026-10-08.md`).
- Odluka vlasnika proizvoda (7/8. 10.): kontakt se pamti u browseru samo uz izričit opt-in `Zapamti moj kontakt na ovom telefonu` i samo posle uspešnog slanja. Saglasnost se nikada ne pamti. Ovo zamenjuje raniju zabranu iz §5. Tekst saglasnosti i dalje čeka stručnu pravnu proveru (§19 P0).
- Odluka vlasnika proizvoda (7/8. 10.): anketa pripada izlagaču. Posle slanja oblačić nestaje sa svih modela istog izlagača na tom sajmu (§9.2).
- Stranica modela šalje ocene, Glas publike, ankete i leadove preko pravog `/api/fair/*` gateway-a. Probna vožnja nema izbor datuma. Lead obrasci traže kontakt prema pravilu izlagača sa servera. Kada server lead ne prima, obrazac prikazuje `Trenutno nedostupno`. Glas publike više ne koristi lokalni fixture tok; fixture postoji samo u DEV režimu.
- Ruta `/anketa` iz §14 je deep link koji otvara stranicu modela sa otvorenom anketom.

### 7. oktobar 2026.

- Odluka vlasnika proizvoda: sve javne sajamske rute žive pod `/sajam/[eventSlug]`. Garaža, poređenje i deljena kolekcija su premešteni na `/sajam/[eventSlug]/garaza`, `/sajam/[eventSlug]/garaza/poredjenje` i `/sajam/[eventSlug]/deli/[shareCode]`; samo `/sajam` privremeno (307) preusmerava na aktivni sajam, stare adrese bez sajma su uklonjene jer ništa nije objavljeno, a štampani QR kodovi ostaju nepromenjeni kroz `/r/[cardCode]`. Link deljene kolekcije uvek sadrži slug sajma; ako se sajam ne može pročitati, deljenje vraća grešku umesto linka.
- Garaža, poređenje i deljena kolekcija koriste isti event shell kao mapa i pasoši; tema se uvek uzima iz sluga u adresi.
- Broj u `Garaža` akciji sada broji iste modele koje garaža prikazuje. Ranije je brojao samo modele sačuvane pod tačnim ID-jem događaja, pa je pokazivao 0 za modele sačuvane pod javnim slugom ili pod ranijim zapisom istog sajma.
- Nazivi modela se prikazuju tačno kako su uneti (`eWind`, `eLight`, `EV3`); velika slova smeju samo nadnaslovi brenda.
- U detalju pasoša brenda dugme za povratak je u gornjem levom uglu.
- Pasoš je izdvojen iz Garaže na zasebne javne rute pregleda i detalja brenda, uz stalnu akciju `Pasoši` u event shell-u.
- Pregled prikazuje brend i progres tačke bez fotografija i brojčanog `N/M`; detalj zadržava velike model kartice i reveal novog pečata tek pri prvom otvaranju posle skena.
- Zaključani model vodi do štanda izlagača na mapi; ne obećava preciznu poziciju vozila unutar štanda.
- `Elektromobilnost` koristi plavi A/digitalni pravac, dok `Auto Moto Fest` zadržava narandžasti akcenat i kasnije dobija B/papirni pravac pasoša.
- Event pečat se prikazuje jednom u vrhu detalja, bez ponavljanja preko model kartica; zvuk se ne koristi, a haptika je samo progressive enhancement.

### 5. oktobar 2026.

- Zaključan je mobilni režim izbora u Garaži: dugi dodir ulazi u režim, običan dodir bira naredne modele, poređenje zahteva tačno dva, a deljenje podržava najviše pet modela.
- Zaključane su akcije deljenja jednog modela i javne kolekcije `/sajam/deli/[shareCode]`: podržan telefon direktno koristi native share sheet, a sopstveni panel sa WhatsApp/Viber izlazima i kopiranjem linka ostaje fallback.
- Razdvojene su metrike `direct_view`, `share_action` i `share_open` od QR scan metrike; `/r/[cardCode]` ostaje jedini izvor scanova.
- Zaključana je kratkotrajna server-side QR attribution oznaka bez query parametra i gašenje javnih deljenih kolekcija 16. novembra 2026.

### 2. oktobar 2026.

- Zaključano je da ScanMe zelena pripada isključivo ScanMe štandu na mapi i da ostali javni event ekrani koriste zaseban, netehnički vizuelni jezik.
- Zaključane su javne rute, event-first shell i redosled sadržaja stranice modela.
- Ukinut je javni zbirni prikaz ocena: posetilac vidi samo svoje ocene, dok broj i proseci ostaju u izveštajima za izlagača.
- Ukinute su pasivne sponsored impression metrike. Garaža beleži samo `Pogledaj` i `Dodaj u garažu`; mapa i displej ne mere prikazivanja.
- Zaključani su svi aktivni pasoši u garaži, lični `N/M` napredak na mapi, promenljiv favorit i eksplicitno lokalno čuvanje digitalnog badge-a.
- Produkcijska mapa ostaje kolegin zadatak; komandni centar radi ugovor, audit i stilsko usklađivanje.
- Pokrenut je prvi high-fidelity krug sa tri vizuelna pravca stranice modela; do Aleksinog izbora nema produkcijskog frontend kodiranja.

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
- Zaključan P0.4: kolega je vlasnik celog sajamskog Convex backenda i šeme, dok komandni centar vodi odluke, dizajn-sistem, javni frontend i integraciju preko zajedničke sajamske Git grane.
- Dokument zaključan za delegiranje zajedno sa `BACKEND-HANDOFF.md`; dodati status, vlasnik odluka i pravilo rešavanja konflikta.
- Zaključano korišćenje postojećeg `/r/[cardCode]` sistema, event-only segment postojećih klijenata i zabrana paralelnih izlagačkih/QR modela.
- Zaključani pragovi od pet glasova, rotacije 12s/8s, pravila pasoša, dnevni/satni izveštaji i ručno odobravanje slanja.
- Zaključano trajno brisanje svih PII podataka 16. novembra 2026. bez dodatnog perioda čuvanja.

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
