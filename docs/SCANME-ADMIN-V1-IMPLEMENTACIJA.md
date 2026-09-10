# ScanMe Admin V1 — autoritativna specifikacija i plan implementacije

> Status dokumenta: **AUTORITATIVAN ZA IMPLEMENTACIJU**  
> Datum preseka: **10. septembar 2026.**  
> Proizvod: **ScanMe**  
> Opseg: novi interni admin panel  
> Jezik interfejsa: srpski, latinica  
> Implementacija u ovom dokumentacionom zadatku: **nije dozvoljena**

---

## 0. Kako se ovaj dokument koristi

Ovaj fajl je jedinstveni izvor istine za prvu implementaciju novog ScanMe admin panela. Njegova namena nije da opiše svaku buduću mogućnost proizvoda, već da:

1. zabeleži šta je zaključano;
2. odvoji privremene odluke od trajnih ugovora;
3. spreči slepo kopiranje starog admin panela;
4. pretvori veliki posao u kontrolisane implementacione zadatke;
5. svakom zadatku zada jasne zavisnosti, granice i proverljive kriterijume završetka.

### 0.1 Redosled autoriteta kada se izvori ne slažu

1. **Ovaj dokument**, zajedno sa kasnijim eksplicitnim izmenama koje vlasnik unese u njega.
2. **Zaključane tekstualne odluke vlasnika** iz radionice koja je prethodila ovom dokumentu.
3. **Mockup označen kao važeći** u indeksu ovog dokumenta, ali samo za raspored, vizuelnu hijerarhiju i prikazane interakcije.
4. Postojeći kod i baza kao dokaz trenutnog stanja, a ne kao obavezni cilj.
5. Stariji mockupovi i postojeći admin UI nemaju autoritet nad stavkama iznad.

Ako mockup sadrži pogrešan naziv, izmišljeni broj, status ili funkciju koja nije tekstualno zaključana, primenjuje se tekstualno pravilo iz ovog dokumenta. Mockupovi nisu schema specifikacija.

### 0.2 Oznake odluka

- **ZAKLJUČANO** — mora biti implementirano ovako, osim ako vlasnik eksplicitno promeni odluku.
- **PRIVREMENO** — implementirati najjednostavniji navedeni oblik, uz dizajn koji dozvoljava kasniju doradu.
- **POSLE V1** — ne implementirati u početnom talasu; ne blokira V1.
- **ZATEČENO** — proverena činjenica o trenutnom repozitorijumu; nije automatski cilj.
- **ODBAČENO** — ne prenositi samo zato što postoji u starom adminu ili starom mockupu.

### 0.3 Šta znači „bez potpune paritetnosti“

Novi admin nije nova koža preko starog. Svaka postojeća funkcija mora biti klasifikovana kao:

- **Zadržati** — ponašanje je dobro i ostaje, uz eventualno novi UI.
- **Spojiti** — ponašanje ostaje, ali ulazi u nov, širi tok umesto posebnog modula.
- **Redizajnirati** — poslovna potreba ostaje, ali sadašnji model ili tok nisu odgovarajući.
- **Odbaciti** — ne prenosi se u V1 novog admina.

Trenutni klijenti i lokali su test podaci. Nije potrebno kvariti novi model radi očuvanja njihovog tačnog oblika. Ipak, nikakvo brisanje, reset ili destruktivna migracija nisu dozvoljeni bez zasebnog eksplicitnog odobrenja vlasnika.

---

## 1. Cilj, publika i merila uspeha

### ZAKLJUČANO

Admin koriste Teodora, Jovan i Aleksa. Svi su trenutno ravnopravni administratori. Sistem je interni operativni alat, optimizovan za:

- brz pregled onoga što traži reakciju;
- rad sa klijentima, lokalima, pretplatama i komunikacijom;
- naručivanje, proizvodnju, prijem, kontrolu i isporuku fizičkih proizvoda;
- upravljanje QR/NFC kanalima i njihovim destinacijama;
- klijentske zadatke i jasnu odgovornost člana tima;
- osnovni finansijski pregled, uz poseban detaljan modul Finansije;
- dubok profil klijenta kada je potrebno proveriti činjenice ili izvršiti radnju.

Admin nije namenjen praćenju zaposlenih, njihovih sesija, uređaja, browsera, vremena prijave ili odjave.

### V1 je uspešan kada

1. početni ekran odmah prikazuje stvarne stavke koje traže reakciju;
2. klijent može da se pronađe po imenu, kontaktu, SMK kodu ili poznatom lokalu;
3. sa jedne klijentske stranice mogu da se razumeju vlasništvo, kontakti, lokali, usluge, pretplate, uplate, proizvodi, komunikacija i istorija;
4. Premium i svaka usluga svakog lokala imaju nezavisne cikluse naplate;
5. fizički proizvod može da se pronađe kratkim serijskim kodom i da mu se bez nagađanja provere QR/NFC, destinacija, pozicija, dizajn, status i istorija;
6. nijedan operativni ekran ne zahteva listanje desetina hiljada nepovezanih redova;
7. svaka rizična ili finansijska ručna promena ostavlja trag ko je, šta i kada uradio;
8. tabele i radni prikazi ostaju čitljivi bez nepotrebnog horizontalnog skrola na ciljnom desktop prikazu;
9. mobilni prikaz omogućava hitne operativne radnje, ali ne pokušava da preslika svaki složeni desktop alat;
10. postojeće važne domenske funkcije nastavljaju da rade kroz novi tok ili su eksplicitno odložene/odbačene.

---

## 2. Provereno trenutno stanje repozitorijuma

### ZATEČENO — tehnološki okvir

- Next.js 16 App Router, React 19, TypeScript.
- Convex 1.44 kao backend i reaktivni sloj podataka.
- `@convex-dev/auth` i admin dozvola preko liste email adresa iz okruženja.
- Tailwind CSS 4, shadcn/Radix primitive, Lucide ikonice, Framer Motion.
- Postoje typed i18n sloj u `lib/i18n`; sve nove korisničke poruke moraju proći kroz njega.
- Worktree je veoma izmenjen i sadrži veliki broj vlasnikovih modifikovanih i novih fajlova. Prvi implementacioni zadatak mora da napravi proverljiv početni presek, bez odbacivanja postojećih izmena.

### ZATEČENO — trenutne admin rute

- `/admin` trenutno preusmerava na `/admin/scanme-links`.
- `/admin/customers`
- `/admin/customers/[businessId]`
- `/admin/customers/[businessId]/[service]`
- `/admin/scanme-links`
- `/admin/scanme-links/[businessId]/editor`
- `/admin/google-reviews`
- `/admin/page`
- `/admin/venue`
- `/admin/memories`
- `/admin/cards`
- `/admin/login`

### ZATEČENO — sadašnji model koji već vredi sačuvati

- `accounts` grupiše jedan ili više `businesses` zapisa.
- `businesses` u praksi predstavljaju lokale/tenant-e.
- `serviceProfiles` su vezani za jedan lokal i tip usluge.
- Postoje konfiguracije i analitika za Links, Review, Venue, Memories i Meni.
- Postoje kontakti, članstva i pozivnice, ali su trenutno vezani za pojedinačni lokal i članstvo ima samo ulogu `viewer`.
- `cards` imaju jedinstveni kod, status, broj skenova i trenutnu destinaciju.
- `cardTargets` čuva nepromenljivu istoriju retargetiranja; nova destinacija se dodaje, stara se ne prepisuje.
- Postoji pojedinačno i grupno kreiranje kartica, retargetiranje, deaktivacija i audit trag.
- `orders` čuva snapshot cene u trenutku prodaje, a `orderItems` razdvaja usluge i fizičke stavke.
- `payments` je istorija uplata; pogrešan unos se stornira umesto brisanja.
- `adminAuditLog` već čuva ko/šta/kada za deo osetljivih radnji.
- Postoji Resend izlazni email za pozivnice, aktivacione zahteve i pojedine upite; ne postoji pun zajednički inbox sa ulaznom poštom.

### ZATEČENO — glavna nepodudaranja sa zaključanim ciljem

1. `accounts.planValidUntil` i postojeći billing tok vode uglavnom jedan zajednički ciklus naloga. To direktno protivreči nezavisnoj Premium pretplati i nezavisnoj pretplati svake usluge svakog lokala.
2. Trenutni grace i upozorenje koriste jednu globalnu vrednost od 14 dana. Cilj je 7 dana za mesečnu i 15 dana za godišnju pretplatu, za upozorenje i za grace.
3. Kontakt i pristup su vezani za lokal, dok cilj zahteva kontakte i korisnike poslovnog naloga, uz opcioni lokalni podrazumevani kontakt.
4. `cards` predstavljaju dinamičke pristupne kodove, ali ne predstavljaju dovoljan inventar stvarnih fizičkih komada, dizajna, materijala, pozicija, QR i NFC kanala, proizvodnje i isporuke.
5. Ne postoje ciljne strukture za zajednički inbox, panel-chat, klijentske zadatke, odlaganje sa razlogom, firme/PIB, brendove, tagove, referral pravila i detaljne troškove.
6. Trenutni admin upiti često rade ograničene `take(...)` liste i N+1 učitavanja. To nije prihvatljiv krajnji model za 500+ lokala i hiljade fizičkih proizvoda.
7. Stari admin prikazuje Korisnike i sve usluge kao ravnopravne tabove u gornjoj navigaciji i otvara uslužni modul kao početni ekran. To je odbačeno.

---

## 3. Klasifikacija postojećih funkcionalnosti

| Postojeća oblast/funkcija | Odluka | Novi dom | Napomena |
|---|---|---|---|
| Admin autentikacija i serverski `requireAdmin` | **Zadržati** | ceo admin | V1 može ostati email allow-list; UI mora imati jasan nedozvoljen i neprijavljen state. |
| Praćenje login/logout/browser/session podataka | **Odbaciti** | — | Nije potrebno za sadašnji tim. |
| `/admin` preusmerava na Links | **Odbaciti** | Dashboard | Početni ekran je Dashboard. |
| Stari horizontalni spisak Korisnici + sve usluge + Kartice | **Odbaciti** | novi top navbar | Korisnički rad, operativa i usluge moraju biti odvojeni. |
| Grupisanje `account -> businesses` | **Zadržati i preimenovati u domenu UI-ja** | Klijenti | `account` je poslovni klijent/SMK; `business` je lokal/SML. |
| Legacy `business` bez `accountId` | **Odbaciti posle kontrolisane migracije** | migracija | Test podaci mogu biti premapirani; cilj ne sme trajno imati dve paralelne semantike. |
| Kreiranje lokala iz Google Review modula | **Spojiti** | Klijent / Lokali | Lokal se kreira u klijentskom kontekstu, ne u jednoj usluzi. |
| CRUD kontakata i pozivnice | **Redizajnirati** | Profil klijenta | Prebaciti na nivo naloga, dodati default kontakt, uloge, dozvole i istoriju po kontaktu. |
| `viewer` članstvo po lokalu | **Redizajnirati** | Pristup klijentskom nalogu | Uvesti četiri nivoa pristupa i opcione dozvole; jedan primarni vlasnik. |
| Tabela Korisnici sa proširenim lokalima | **Redizajnirati** | Klijenti | Nova tabela je brzi pregled; detaljan profil je zasebna puna stranica. |
| Direktno dugme „Otvori lokal“ u tabeli | **Spojiti** | meni sa tri tačke | Primarna navigacija ide klikom na ime ili duplim klikom u praznom delu reda. |
| Aktiviranje/deaktiviranje `serviceProfile` | **Zadržati jezgro, redizajnirati statusni model** | Pretplate + Usluge | Vlasništvo, naplata, konfiguracija i tehničko zdravlje ne smeju biti jedan boolean/status. |
| Service activation requests | **Spojiti** | Dashboard + Inbox/Zadaci | Zahtev mora postati operativna stavka, ne izolovan spisak u Links modulu. |
| Links editor, objava, javni link i analitika | **Zadržati** | Usluge > Links | Novi admin je operativni omotač; editor se ne prepisuje bez potrebe. |
| Review destinacija, slug, skenovi i aktivacija | **Zadržati** | Usluge > Review | Kreiranje klijenta/lokala se izmešta iz ovog modula. |
| Meni admin funkcije, uvoz, objava i izvoz | **Zadržati** | Usluge > Meni | U V1 navigaciji je jedna od tri usluge. |
| Venue i Memories admin moduli | **POSLE V1** | kasniji Usluge modul | Ne brisati domenski kod; sakriti iz V1 nove admin navigacije. |
| `cards` kod, resolver, skenovi, batch mint i immutable target history | **Zadržati** | Operativa > Proizvodi i QR kodovi | To je dobro tehničko jezgro dinamičkog QR toka. |
| Stari globalni modul Kartice | **Spojiti i redizajnirati** | Operativa | Primarni tok je izbor lokala pa rad nad inventarom; globalni QR pogled ostaje samo za tehničko pretraživanje/digitalne QR-ove. |
| `cards.status: active/disabled` | **Redizajnirati** | QR/NFC kanal | Potrebni su aktivan, neaktivan, problem i odsutan kanal, uz razlog i istoriju. |
| Order snapshot cene | **Zadržati** | Porudžbine + Finansije | Cena u trenutku prodaje ostaje nepromenljiva. |
| Jedna porudžbina sa više `orderItems` | **Zadržati** | Porudžbine | Proizvodi se grupišu pod jednom porudžbinom. |
| Postojeći order statusi pending/paid/provisioned/... | **Redizajnirati** | Porudžbine | Plaćanje, dizajn i fulfillment su paralelne ose; custom dizajn može pre ili posle uplate. |
| Jedan account billing ciklus | **Odbaciti kao ciljni model** | Pretplate | Zameniti nezavisnim pretplatama i alokacijama uplata. |
| Istorija uplata bez brisanja | **Zadržati** | Finansije + Profil klijenta | Proširiti na način plaćanja i precizne alokacije. |
| `setNextBillingAt` na celom nalogu | **Redizajnirati** | pojedinačna pretplata | Datum se menja samo na izabranoj Premium ili uslužnoj pretplati, uz audit. |
| Audit ko/šta/kada | **Zadržati i proširiti** | Aktivnost | Razlog obavezan za rizične izmene, storno i odlaganje. |
| Theme toggle | **Zadržati** | header/podešavanja | Vizuelno uskladiti sa novim navbarom. |
| Odvojeni lokalni sidebar iz starog detalja | **Redizajnirati** | Profil klijenta | Lokali su stalno vidljiva kompaktna lista u detaljnom profilu; ne ponavljati istu hijerarhiju u svakom modulu. |

---

## 4. Informaciona arhitektura i navigacija

### 4.1 Glavni navbar — ZAKLJUČANO

Novi admin koristi gornji navbar. Nema trajnog staromodnog sidebara. Redosled:

1. **Dashboard**
2. **Klijenti**
3. **Inbox**
4. **Zadaci**
5. **Operativa** — dropdown
6. **Usluge** — dropdown
7. **Finansije**
8. **Tim**

Desno su:

- globalna pretraga;
- Podešavanja;
- interna admin obaveštenja/indikator, bez browser/system push notifikacija u V1;
- trenutni član tima/profil i odjava.

Nazivi moraju biti kratki. Ne koristiti duge navigacione nazive poput „Fizički proizvodi i isporuke“, „Nedavna važna aktivnost celog tima“ ili „Naplaćeno ovog meseca“ kao tabove.

### 4.2 Operativa — ZAKLJUČANO

Operativa sadrži:

- **Proizvodi** — primarni venue-first inventar fizičkih proizvoda sa punom kontrolom povezanih QR/NFC kanala;
- **QR kodovi** — sekundarni tehnički pregled svih pristupnih tačaka, posebno digitalnih SMQ zapisa, problema i globalne pretrage; ne sme da duplira kompletan Proizvodi tok;
- **Porudžbine** — prodaja, dizajn, štamparija, prijem, QC i isporuka.

Dashboard može koristiti kratku karticu **Kartice** za operativni broj fizičkih primeraka/problema. U navigaciji i radnom modulu koristi se **Proizvodi**.

### 4.3 Usluge — ZAKLJUČANO za V1

- **Links**
- **Review**
- **Meni**

ScanMe Venue i ScanMe Memories nisu deo prvog talasa novog admin panela. Njihov postojeći domenski kod se ne briše; samo se ne prikazuju kao aktivne V1 usluge u novoj navigaciji.

### 4.4 Predložene ciljne rute

| Ruta | Namena |
|---|---|
| `/admin` | Dashboard |
| `/admin/klijenti` | tabela klijenata |
| `/admin/klijenti/[accountId]` | puni profil klijenta |
| `/admin/inbox` | zajednički email inbox i panel-chat |
| `/admin/zadaci` | klijentski zadaci |
| `/admin/operativa/proizvodi` | izbor lokala, zatim inventar |
| `/admin/operativa/qr` | digitalni/globalni QR tehnički pregled |
| `/admin/operativa/porudzbine` | porudžbine, proizvodnja i isporuke |
| `/admin/usluge/links` | operativni Links pregled |
| `/admin/usluge/review` | operativni Review pregled |
| `/admin/usluge/meni` | operativni Meni pregled |
| `/admin/finansije` | Naplaćeno, Očekivano i Profit |
| `/admin/tim` | raspodela klijentskog rada |
| `/admin/podesavanja` | poslovna pravila i integracije |

Stare rute mogu privremeno preusmeravati na nove ekvivalente. Ne održavati dva puna admin interfejsa.

---

## 5. Vizuelni i UX ugovor

### ZAKLJUČANO

- Moderan, miran interni alat; ne kopirati prenaglašeni izgled javne ScanMe landing stranice.
- Svetla topla osnova, veoma kontrolisan lime akcenat, crna za primarne aktivne kontrole, jasne statusne boje.
- Zaobljenja su moderna ali umerena; panel ne sme izgledati kao zbir naduvanih mehurića.
- Transparentnost i blur mogu biti diskretni, ali čitljivost i radna gustina imaju prednost. Ne ponavljati loš „glass container“ starog Korisnici modula.
- Ikonice su funkcionalne i dosledne; jedna ista stvar svuda koristi istu ikonicu i naziv.
- Boja sama nije jedini dostupni signal u dubokom prikazu: desktop hover/focus tooltip, tekstualni status u proširenju ili detalju i odgovarajući accessible label.
- Klijenti tabela mora stati bez horizontalnog skrola na standardnom desktop prikazu.
- Vizuelni prikaz proizvoda nije galerija. Slika je dovoljno velika da se proizvod prepozna, ali ne dominira karticom.
- Selektovana kartica proizvoda ne menja veličinu; dobija samo border/checkbox state.
- Sažetak proizvoda koristi tanak horizontalni pill: ikonica + broj + kratak naziv, vertikalni separatori; crveno samo za probleme.
- Novi tekst ide kroz typed i18n sloj.
- Keyboard focus, čitljiv kontrast, smanjen motion i korisni loading/empty/error state su obavezni.

### Statusne boje — globalni jezik

- zelena: aktivno, zdravo, završeno ili potvrđeno;
- narandžasta: grace, čeka, neaktivno sa već podešenom destinacijom ili upozorenje koje traži pažnju;
- crvena: problem, suspendovano, zakasnelo ili blokirajući neuspeh;
- siva: odsutno, nema kanala, arhivirano ili neutralno;
- plava/ljubičasta mogu označavati faze operativnog toka (štamparija/kod nas), ali ne menjaju semantiku četiri osnovne boje.

---

## 6. Jedinstveni identifikatori

### ZAKLJUČANO

Svaki domenski zapis ima dva identiteta:

1. nepromenljivi interni ID baze, koji veze koriste kao izvor istine;
2. kratak ljudski kod za pretragu, podršku i fizičku oznaku.

Prefiksi:

- `SMK` — klijent/poslovni nalog;
- `SML` — lokal;
- `SMF` — pojedinačni fizički primerak;
- `SMQ` — digitalni QR koji postoji bez fizičkog proizvoda;
- `SMP` — **PRIVREMENO** ime koda porudžbine, dok se ne potvrdi konačna nomenklatura.

Kod lokala može vizuelno nositi deo SMK koda, a SMF deo lokala i kratak redni sufiks. Ipak, backend veze se nikada ne izvode parsiranjem koda. Pogrešno povezivanje se može ispraviti bez promene nepromenljivog ID-ja i istorije.

### Fizička štampa SMF koda

- Kod je običan tekst; nije QR, barcode niti drugi skenirajući element.
- Nalazi se nenametljivo na poleđini/proizvodno prikladnom mestu.
- Mora biti dovoljno kratak da klijent, kada su klijent i lokal već poznati, može pročitati samo poslednji sufiks poput `009`.
- U kontekstu izabranog lokala admin jedanput prikazuje zajednički SMF koren, a na pojedinačnim karticama/redovima samo `#009`, `#010` itd.
- Jedan fizički komad ima jedan jedinstveni SMF kod, čak i kada je deo porudžbine od 50 jednakih komada.

### SMQ i fizički proizvod

SMQ se koristi za digitalni QR bez fizičkog primerka. Ako se takav QR kasnije poveže sa fizičkim proizvodom, SMF postaje primarni operativni/support identifikator. Raniji SMQ ostaje u istoriji i može ostati interno pretraživ, ali se ne mora štampati niti isticati klijentu.

### PRIVREMENO

Tačna dužina, padding i format koda nisu zaključani. Implementacija mora centralizovati generator i parser prikaza tako da se format kasnije menja bez migracije poslovnih veza.

---

## 7. Ciljni model podataka

Ovo je logički model. Implementacioni zadatak bira konačne Convex nazive, ali ne sme menjati odnose i granice bez dopune ovog dokumenta.

### 7.1 Klijent i organizacija

#### `clientAccounts` / evoluirani `accounts` — SMK

Predstavlja poslovni nalog i stvarnog klijenta, ne lokal.

Obavezne odgovornosti:

- ljudski SMK kod;
- prikazni naziv zasnovan na imenu vlasnika;
- status `active | archived`;
- primarni vlasnik i podrazumevani kontakt;
- datum kreiranja/izmene;
- računovodstvene i komercijalne oznake koje nisu vezane za jedan lokal.

Starter nije badge niti plaćena stavka. Premium badge se izvodi iz Premium pretplate: nema badge-a za Starter; aktivan Premium je lime/istaknut, Premium u grace-u je narandžast. Enterprise je komercijalni dogovor/cena, a ne treći badge ili treći klijentski plan u V1.

#### `legalEntities`

Jedan klijent može imati više firmi. Polja ostavljaju prostor za naziv firme, PIB, matični broj, adresu i budući račun/predračun. V1 ne generiše zvaničan račun ili predračun; podatke čuva kao internu evidenciju i buduću ekstenzionu tačku.

#### `contacts`

Kontakt je na nivou klijentskog naloga:

- ime, prezime;
- email, telefon;
- pozicija/uloga;
- oznaka vlasnika;
- aktivan/neaktivan kontakt;
- kanal i istorija komunikacije se vezuju za konkretan kontakt.

Jedan kontakt je `defaultContactId` naloga. Lokal opciono ima `defaultContactOverrideId`. Promena default kontakta automatski menja ono što tabela klijenata prikazuje; podaci se ne kopiraju u red tabele.

#### `clientMembers` / evoluirani memberships

Povezuje auth korisnika sa SMK nalogom i jednom od uloga:

- `full_access` — puni pristup; samo ova uloga može otkazati uslugu;
- `venue_management` — upravljanje dozvoljenim lokalima i sadržajem;
- `finance` — finansijski pregled i dozvoljene naplate;
- `view_only` — pregled.

Dodatne dozvole:

- kupovina i plaćanje usluga;
- kupovina i plaćanje Premium-a;
- skup lokala kojima član pristupa, kada nije ceo nalog.

Jedna osoba je primarni vlasnik; može postojati više osoba sa punim pristupom.

#### `accountTags`

Interni tagovi olakšavaju grupisanje i filtriranje. Tag `Prijatelj` aktivira posebno komercijalno pravilo opisano u odeljku Finansije. Tagovi nisu zamena za status ili ulogu.

#### `brands` i `venueGroups`

Jedan nalog može imati više brendova i grupa. ScanMe može da ih uređuje za klijenta; klijent ih vidi i može lako da izabere postojeći brend ili napravi novi tokom rada na dizajnu usluge.

Promena brenda nikada automatski i tiho ne menja postojeće usluge. Sistem pokazuje koje aktivne konfiguracije koriste taj branding i nudi:

- promeni svuda;
- promeni samo izabrane;
- ostavi postojeće bez izmene.

### 7.2 Lokali i usluge

#### `venues` / evoluirani `businesses` — SML

- pripada tačno jednom SMK nalogu;
- ljudski SML kod;
- naziv, grad/adresa i status;
- opciona firma, brend i grupa;
- opcioni default kontakt override;
- arhiviranje čuva istoriju i sve veze.

Klijentov prikazni naziv je ime vlasnika, dok lokali imaju sopstvene nazive. Dva nepovezana lokala mogu imati isti naziv; SML i SMK rešavaju dvosmislenost.

#### `serviceInstances` / evoluirani `serviceProfiles`

Jedan zapis predstavlja jednu uslugu na jednom lokalu. U V1 tip je:

- `scanme_links`;
- `scanme_review`/postojeći `google_review` uz jedan kanonski interni mapirani naziv;
- `scanme_menu`.

Mora odvojiti:

- posedovanje/aktivaciju usluge;
- stanje pretplate;
- stanje konfiguracije (`not_configured | draft | published` ili ekvivalent);
- tehničko zdravlje/problem;
- klijentsku dozvolu uređivanja.

Jedan opšti status ne sme glumiti sva četiri podatka.

### 7.3 Pretplate, cene i uplate

#### `subscriptions`

Jedna pretplata ima jedan target:

- `account_premium`, ili
- `service_instance` za jednu uslugu jednog lokala.

Polja:

- period `monthly | annual`;
- stanje ciklusa;
- `currentPeriodStart`, `paidThrough`, `graceEndsAt`, opcioni `cancelAtPeriodEnd`;
- referentna i stvarno dogovorena cena;
- auto-renew/payment setup kada postoji;
- razlog i actor za ručne override-e;
- datum otkazivanja/suspenzije.

Premium je jedna nezavisna pretplata na nivou SMK naloga i otključava Premium mogućnosti za sve usluge i sve lokale tog naloga. Starter se ne plaća. Premium referentna cena je **PRIVREMENO 1.490 RSD mesečno** i mora biti podešavanje, ne rasuta konstanta.

Pretplate različitih usluga i lokala ne dele datum obnove. Jedna objedinjena uplata je poželjan UX, ali ne sme spojiti njihove cikluse.

#### `payments`

Append-only istorija stvarno primljenog novca:

- iznos i valuta;
- datum uplate;
- način: `payment_card | bank_transfer | cash | other`;
- provider/reference;
- ko je evidentirao;
- storno podaci i obavezan razlog.

#### `paymentAllocations`

Jedna uplata može biti raspodeljena na više stavki. Svaka alokacija precizno navodi:

- Premium pretplatu;
- konkretnu uslugu konkretnog lokala;
- porudžbinu/fizičku stavku;
- popust/waiver/refund kada je primenljivo;
- iznos i period koji pokriva.

Zbir alokacija mora odgovarati uplati ili imati eksplicitno evidentiran neraspoređeni ostatak. Bez ovog sloja nije moguće tačno odgovoriti šta je klijent platio.

#### `priceAgreements` i `discountRules`

Podržavaju:

- standardnu cenu;
- founders cenu sa opcionim datumom isteka ili doživotnim važenjem;
- enterprise dogovor;
- individualnu cenu;
- referral popust;
- `Prijatelj` waiver.

Snapshot efektivne cene ulazi u prodajnu/pretplatničku istoriju; kasnija promena cenovnika ne menja staru transakciju.

#### `referrals`

Minimalni V1:

- ko je preporučio;
- koji novi SMK nalog je preporučen;
- status `pending | qualified | rewarded | cancelled`;
- kvalifikacija nastaje tek posle prve uspešne uplate preporučenog klijenta;
- nagrada je popust na izabranu uslugu/usluge ili Premium, nikada kreditni novčanik.

### 7.4 Porudžbine, proizvodnja i isporuka

#### `orders`

Jedna porudžbina pripada klijentu, može obuhvatiti jedan ili više lokala i više fizičkih proizvoda. Ima ljudski kod porudžbine i odvojene ose:

- payment status;
- design status;
- fulfillment status;
- zaduženi admin;
- prioritet i napomene.

#### `orderLines`

Čuva proizvod, količinu, konfiguraciju, vezane usluge, cenu i snapshot dizajna. Linija od 50 komada kasnije proizvodi 50 individualnih SMF zapisa.

#### `printJobs`

Grupiše ono što se šalje štampariji. V1 radi sa jednom štamparijom, ali veza mora biti podatak, ne hardkodiran tekst. Štamparija šalje isključivo ScanMe timu, nikada direktno klijentu.

#### `deliveries`

Isporuka je odvojena od porudžbine jer jedna porudžbina može imati više paketa/isporuka. Način:

- kurir — klijent plaća dostavu kuriru pri preuzimanju;
- lična dostava — ne naplaćuje se.

Čuva ko je preuzeo/pripremio/dostavio, datume, status i dokaz/napomenu.

### 7.5 Fizički proizvodi, QR/NFC i destinacije

#### `physicalProducts` — SMF

Jedan red po fizičkom komadu:

- lokal/SML;
- porudžbina i order line;
- SMF kod i lokalni sufiks;
- kanonski tip proizvoda;
- trajni snapshot dizajna, materijala i fizičke konfiguracije;
- pozicija;
- životni ciklus proizvoda;
- datum proizvodnje, prijema, QC-a i aktivacije;
- ko je izvršio relevantne radnje.

Naziv dizajna je ime šablona ili `Custom design`. Dizajn odštampanog komada se ne verzionira kao da se može zameniti; promena štampe znači nov fizički proizvod.

#### Kanonski nazivi proizvoda

Jedan zajednički katalog hrani konfigurator, porudžbine i admin. U adminu se koriste dosledni jedninski nazivi, uključujući:

- Dvodelni stalak;
- Jednodelni stalak;
- Nalepnica;
- PVC folija;
- Premium gravirani stalak.

Ne uvoditi sinonime poput „stoni stalak (2 dela)“, „kartica (papir)“ ili druga imena za isti proizvod.

#### `accessChannels`

Jedan fizički proizvod mora imati bar QR ili NFC kanal. Svaki kanal čuva:

- vrstu `qr | nfc`;
- status i razlog;
- javni resolver token/slug ili NFC podatak;
- trenutnu destinaciju;
- tehničke provere i poslednju izmenu;
- istoriju vezivanja.

QR i NFC istog SMF-a vode na istu aktuelnu destinaciju, ali imaju odvojeno tehničko stanje i analitiku.

#### `digitalQrCodes` — SMQ

Omogućava SaaS bez fizičkog proizvoda. Može kasnije biti vezan za budući SMF. Primarni početni filteri su **Digitalni** i **Problem**, uz globalnu pretragu.

#### `destinations` i `destinationHistory`

Jedan fizički primerak u svakom trenutku vodi na jedan link. Taj link može biti:

- direktna usluga;
- ScanMe Links stranica;
- generički ScanMe razdelnik kada je proizvod vezan za više usluga;
- drugi validan dinamički target.

Ako proizvod predstavlja Links + Review + Meni, QR vodi na Links kao razdelnik. Ako predstavlja Review + Meni bez Links usluge, vodi na generički razdelnik sa te dve opcije. Promena destinacije dodaje istorijski zapis; ne briše prethodni.

#### `placements` i `placementHistory`

Pozicija može biti `Sto 4`, `Terasa`, `Šank`, `Ulaz` i slično. Premestanje ne briše staru analitiku. Podrazumevani klijentski prikaz pokazuje analitiku trenutne pozicije; prethodni period se skriva iz glavnog pogleda, ali je lako dostupan kroz istoriju pozicija.

### 7.6 Komunikacija, zadaci i aktivnost

#### `conversations`

Jedinstven operativni omotač za kanale:

- `email`;
- `panel_chat`;
- `phone_note`;
- `message_copy`;
- `in_person_note`.

Vezuje se za klijenta, konkretan kontakt, opcioni lokal i opcioni predmet (usluga, uplata, porudžbina, proizvod). Email i chat ostaju jasno odvojeni kanali u UI-ju.

#### `messages`

Čuva smer, kanal, puni sadržaj, očišćen preview, attachment metadata, external provider ID i autora. Email potpis/disclaimer/logo se ne smeju izgubiti iz raw poruke, ali se u zbijenom chat/pregledu prikazuju skraćeno ili sklopljeno.

Panel-chat nije live-chat obećanje. Za adminovu odlaznu poruku:

- `sent` — sačuvana/poslata, jedna siva kvačica;
- `delivered` — klijent je učitao panel i poruka je dostupna, dve sive kvačice;
- `read` — klijent je otvorio chat, dve lime kvačice.

Klijent ne vidi da li je ScanMe tim pročitao njegovu poruku niti adminove delivery/read detalje.

#### `tasks`

Samo klijentski zadaci. Polja:

- naslov i opis;
- klijent, opcioni kontakt/lokal/usluga/uplata/porudžbina/isporuka/SMF;
- jedan glavni zaduženi;
- opcioni učesnici;
- prioritet;
- rok kao datum ili datum+vreme;
- status;
- istorija odlaganja.

Odlaganje zahteva obavezno obrazloženje, ko je odložio, kada i do kada.

#### `actionItems`

Materijalizovan ili deterministički izveden red za Dashboard „Za reakciju“. Svaka stavka ima stvarni uzrok, severity, vlasnika, link ka mestu rešavanja i pravilo razrešenja. Ne nestaje klikom na „Reši“, već tek kada se promeni činjenica koja ju je izazvala ili admin iz relevantnog menija izvrši validnu radnju.

#### `activityLog`

Append-only trag poslovno važnih promena:

- actor;
- objekat i klijent/lokal;
- tip radnje;
- pre/posle ili strukturisan detalj;
- obavezan razlog gde je propisano;
- vreme.

Ne beleži login/logout, browser, uređaj ili sesiju.

---

## 8. Statusi i prelazi

### 8.1 Pretplate — ZAKLJUČANO

| Izvedeni UI status | Boja | Uslov | Dozvoljena radnja |
|---|---|---|---|
| Aktivna | zelena | period je plaćen i nije istekao | pregled, otkaži na kraju perioda, ručna korekcija uz audit |
| Grace | narandžasta | `paidThrough` je prošao, `graceEndsAt` nije | podseti, evidentiraj uplatu, produži grace uz razlog, otkaži/suspenduj po pravilu |
| Suspendovana | crvena | grace je istekao ili je ručno suspendovana | evidentiraj uplatu/reaktiviraj, ručno reši uz razlog |
| Otkazana/neaktivna | siva | nema aktivnog budućeg perioda ili je otkazana | ponovo aktiviraj/kupi |

Upozorenje pre isteka nije poseban status. Ono je informativni/action signal:

- mesečna pretplata: 7 dana pre isteka;
- godišnja pretplata: 15 dana pre isteka.

Grace traje:

- mesečna pretplata: 7 dana;
- godišnja pretplata: 15 dana.

Ista pravila važe za Premium i uslužne pretplate, ali svaki zapis ima sopstvene datume. Ručno produženje grace-a je moguće kroz akciju „Reši“ i zahteva audit razlog.

### 8.2 QR/NFC kanal — ZAKLJUČANO

| UI stanje | Boja | Značenje |
|---|---|---|
| Aktivan | zelena | kanal postoji, redirect je dozvoljen, destinacija postoji i zdravstvena provera je dobra |
| Neaktivan | narandžasta | kanal i destinacija postoje, ali redirect nije dozvoljen |
| Problem | crvena | prijavljen kvar, nedostaje/greši destinacija, resolver ne radi ili postoji druga blokirajuća greška |
| Nema kanal | siva ikonica | fizički proizvod nema QR ili nema NFC zapis |

Admin može ručno prebaciti aktivan/neaktivan i označiti/razrešiti problem. Svaka promena čuva ko/šta/kada; problem ima razlog. U vizuelnoj kartici nije potreban tekstualni chip „Problem“ ako crvena ikonica već jasno označava stanje; tooltip/detalj daje objašnjenje.

### 8.3 Razgovori — ZAKLJUČANO

- Novo
- Potreban naš odgovor
- U obradi
- Čeka se klijent
- Završeno

Odgovor klijenta automatski ponovo otvara završen razgovor u `Potreban naš odgovor` ili `Novo`, prema kanalu. `Čeka se klijent` može ručno da se promeni u `Završeno` kada tim zna da je razgovor završen.

### 8.4 Zadaci — ZAKLJUČANO

- Otvoren
- U toku
- Odložen
- Završen
- Otkazan

Kašnjenje je izvedeno iz roka, ne ručno upisan status. Zadatak može imati samo datum ili tačno vreme. Nema browser/system notifikacija u V1.

### 8.5 Porudžbine — ZAKLJUČANA logika, PRIVREMENI nazivi statusa

Jedan linearni status nije dovoljan jer se custom dizajn može raditi pre ili posle uplate. Čuvaju se tri ose:

**Plaćanje**

- čeka uplatu;
- plaćeno;
- stornirano/refundirano.

**Dizajn**

- nije potreban / šablon izabran;
- u izradi;
- čeka odobrenje;
- odobren.

**Izrada i isporuka**

- čeka uslove;
- SMF dodeljen;
- spremno za štampariju;
- kod štamparije;
- kod nas;
- QC;
- spremno za isporuku;
- u isporuci;
- isporučeno;
- otkazano.

SMF se dodeljuje i posao šalje u proizvodnju tek kada su istovremeno ispunjeni uslovi:

1. uplata je primljena unapred;
2. dizajn je odobren.

Štamparija šalje ScanMe timu. ScanMe radi prijem/QC i odmah aktivira ispravne QR/NFC kanale. Tek zatim ide lična ili kurirska isporuka klijentu.

### 8.6 Klijent i lokal

- Aktivno
- Arhivirano

Arhiviranje je reverzibilno kroz kontrolisanu radnju i ne menja SMK/SML niti briše istoriju. Operativni signal klijenta nije ručni status; računa se iz najhitnijeg otvorenog uzroka njegovih pretplata, poruka, zadataka, porudžbina i proizvoda.

---

## 9. Ekrani i ključne interakcije

### 9.1 Dashboard — ZAKLJUČANO

Početni ekran prikazuje ceo tim, sa brzim prebacivanjem **Sve / Moje**.

Sastav:

1. naslov sa ukupnim brojem stavki za reakciju i datumom;
2. horizontalni pregled: Hitno, Čeka se klijent, Danas, Mirno;
3. lista **Za reakciju**, svaka stavka sa uzrokom, klijentom/lokalom ili SMF-om, zaduženim, vremenom/rokom i direktnim linkom;
4. kružni pregled **Pretplate**;
5. isti kružni element **Kartice**, sa brojem problema i raspodelom aktivno/problem/neaktivno;
6. mali blok **Finansije**: Naplaćeno i Profit za tekući period, Očekivano samo za budući period;
7. kratka lista **Zadaci**;
8. kratka lista **Inbox** sa pošiljaocem, predmetom/preview-em i vremenom.

Ne dodavati zasebne gornje brojke koje samo dupliraju Inbox, Zadaci ili Kartice. „Reši“ otvara kontekstualne akcije kao što su podsetnik, produženje grace-a, evidentiranje uplate ili odlazak na izvor problema; samo otvaranje ne zatvara stavku.

### 9.2 Klijenti tabela — ZAKLJUČANO

Tabela je uvek popunjena trenutnim klijentima; klijenti se ne pojavljuju tek nakon search-a. Podrazumevano sortiranje je po hitnosti, uz ručni sort.

Kolone:

1. signal tačkica;
2. Klijent — ime vlasnika, SMK, diskretan Premium badge samo ako postoji;
3. Podrazumevani kontakt — email i telefon;
4. Lokali — prvi naziv i `+N`;
5. Usluge i naplata — ikone usluga sa agregiranim bojama;
6. Aktivnost — samo nerešene/akcione promene, ne beznačajan log tipa „QR promenjen pre četiri dana“;
7. meni sa tri tačke.

Ako tri lokala imaju istu uslugu, dva aktivna a jedan u grace-u, agregirana ikona koristi najgori relevantni status i jasno pokazuje `2 aktivna / 1 grace` kroz tooltip/proširenje. Klik na usluge otvara inline detalj po lokalu bez odlaska u profil.

Interakcije:

- klik na ime vlasnika otvara profil;
- dupli klik na prazan deo reda otvara profil;
- tri tačke sadrže klijentski panel/debug pristup i sekundarne radnje;
- nema posebnog stalnog dugmeta za klijentski panel;
- Premium badge ne sme gurati ime horizontalno; pozicionirati ga diskretno u okviru identity ćelije;
- Starter nema badge.

Kolona Aktivnost ne glumi detekciju novih eksternih poruka bez integracije. Nepročitana poruka postoji samo ako je zaista primljena kroz email webhook/sync ili panel-chat.

### 9.3 Profil klijenta — ZAKLJUČANO

Puna stranica, ne mali modal. Brzi pregled ostaje tabela; profil ima dubinu.

Header/prvi ekran:

- ime vlasnika, SMK, status/Premium;
- broj lokala i sažetak otvorenih problema;
- default kontakt sa emailom i telefonom;
- dropdown svih kontakata; izbor menja prikazane podatke i istoriju bez menjanja default kontakta;
- jasna posebna akcija za postavljanje novog default kontakta;
- relevantne hitne radnje.

Sekcije/tabovi:

- **Pregled**
- **Lokali i usluge**
- **Finansije**
- **Proizvodi**
- **Komunikacija**
- **Aktivnost**

Lokali su kompaktna, ali stalno dostupna lista. Svaki lokal otvara detalje firme/brenda/grupe, default kontakta, usluga, pojedinačnih pretplata, proizvoda i akcija. Ne skrivati dubinu samo radi minimalizma.

Komunikacija može imati chat u profilu ili upućivati na isti deljeni conversation komponent u Inbox-u. Odluku o tačnoj fizičkoj poziciji donosi UI zadatak, ali se podaci i ponašanje ne dupliraju.

### 9.4 Inbox — ZAKLJUČANO ponašanje

Jedna zajednička poslovna email adresa. Cilj je da tim čita, šalje i odgovara iz ScanMe admina; eksterni mailbox se otvara samo kada je potrebno.

Inbox objedinjuje:

- pune email prepiske;
- panel-chat;
- ručno dodate beleške/prekopirane poruke iz drugih kanala.

Svaki razgovor pokazuje kanal, kontakt, klijenta/lokal, status, zaduženog i poslednju relevantnu poruku. Ako email bude poslat direktno iz spoljnog zajedničkog sandučeta i nije moguće utvrditi autora, audit prikazuje „Poslato iz zajedničkog sandučeta“.

Potrebna je inbound integracija ili pouzdan sync da bi „novo/nepročitano“ bilo stvarna činjenica. Sam izlazni Resend nije dovoljan.

### 9.5 Zadaci — ZAKLJUČANO

- default prikaz svih otvorenih klijentskih zadataka;
- filteri Sve, Danas, Kasni, Odloženo, Završeni;
- filter po zaduženom, klijentu, lokalima i vezanom objektu;
- jedan glavni zaduženi, opcioni učesnici;
- rok može biti samo dan ili tačno vreme;
- odlaganje zahteva razlog;
- zadatak se otvara u bočnom panelu/detalju bez gubitka liste.

### 9.6 Proizvodi — ZAKLJUČANO

Prvi ekran bira lokal. Lokali koji pripadaju istom klijentu stoje uzastopno i diskretno dele jednu usku klijent kolonu. Klijent nije velika accordion grupa i njegovi lokali ne zauzimaju dodatni vertikalni prostor.

Kolone prvog ekrana:

- Klijent (SMK i diskretan Premium badge);
- Lokal i SML;
- grad;
- broj proizvoda;
- broj QR/NFC;
- ikone aktivnih usluga;
- najvažniji status/problem;
- chevron za ulazak.

Pretraga: klijent, lokal, SMK, SML, SMF ili SMQ. Filteri: svi, problem, aktivni. Podrazumevani sort je hitnost. Lista je paginirana i ne učitava 500+ lokala odjednom. Ponovni ulazak u modul ne otvara poslednji lokal automatski.

Nakon izbora lokala postoje **Tabela / Vizuelno** prikazi nad istim query/filter/selection stanjem.

Vizuelno:

- kompaktne jednake kartice;
- prepoznatljiva slika proizvoda;
- samo lokalni `#suffix`;
- kanonski naziv tipa i dizajna;
- pozicija;
- QR/NFC ikonice sa statusnom bojom;
- ikone vezanih usluga i kratka destinacija;
- tri tačke.

Tabela:

- checkbox;
- ID sufiks;
- ikonica + naziv proizvoda;
- pozicija;
- QR/NFC dve stalne ikonice;
- usluge;
- destinacija;
- status koji se vidi i menja;
- izmenjeno;
- tri tačke.

Multi-select otvara stabilan desni sidebar. Selektovane kartice ostaju iste veličine. Bulk akcije: status proizvoda/kanala, QR status, NFC status, destinacija, vezane usluge i pozicija. Rizična promena traži potvrdu i po potrebi razlog.

### 9.7 QR kodovi — ZAKLJUČANA granica

QR modul nije druga kopija Proizvodi modula. Služi za:

- digitalne SMQ zapise bez fizičkog proizvoda;
- globalnu pretragu koda;
- pregled svih problema pristupnih kanala;
- napredni tehnički pregled i istoriju destinacije.

Kada QR pripada SMF-u, sve svakodnevne radnje moraju biti dostupne i iz Proizvodi modula. Korisnik se ne primorava da pređe u QR modul da bi aktivirao, deaktivirao, proverio ili retargetirao QR fizičkog proizvoda.

### 9.8 Porudžbine — ZAKLJUČANO

Aktivne/Završene/Arhivirane, zatim kratki filteri po operativnoj fazi. Tabela prikazuje porudžbinu, klijenta/lokal, broj stavki, agregirani status, isporuku i zaduženog. Proširenje reda prikazuje sve order lines i dodeljene SMF opsege. Desni detalj pokazuje payment/design/fulfillment timeline, štampariju, očekivani povrat, način isporuke, zaduženog i napomene.

### 9.9 Usluge — ZAKLJUČANO za početnu implementaciju

Svaki modul ima:

- pregled lokala koji imaju tu uslugu;
- filtere aktivno, grace, pauzirano/neaktivno, problem;
- pretragu po klijentu, lokalu ili ID-ju;
- status, pretplatu, povezane QR/proizvode i samo važnu aktivnost;
- desni pregled izabranog lokala sa linkom ka pravom editoru/javnoj stranici/klijentskom panelu;
- tri tačke za debug, slanje naloga i pauziranje/aktiviranje.

Mockupovi za Links, Review i Meni su funkcionalni temelj. Duboke funkcije ovih modula mogu se razvijati nakon prve implementacije školjke i osnovnih radnji.

### 9.10 Finansije — ZAKLJUČANO

Tri glavna prikaza:

- **Naplaćeno** — stvarno primljen novac;
- **Očekivano** — projekcija budućeg prihoda ako postojeći klijenti i pretplate ostanu isti, bez novih ili izgubljenih klijenata;
- **Profit** — prihod umanjen za poznate direktne troškove u definisanom opsegu.

Periodi za Naplaćeno/Profit: mesec, 3 meseca, 6 meseci, godina, oduvek. Očekivano koristi buduće periode: sledeći mesec, 3 meseca, 6 meseci, godina.

Filter Naplaćeno i Očekivano:

- ukupno;
- fizički proizvodi;
- SaaS;
- Premium;
- pojedinačna usluga.

Filter Profit:

- ukupno;
- fizički proizvodi;
- SaaS;
- Premium.

Profit se ne filtrira po pojedinačnoj usluzi jer se zajednički infrastrukturni troškovi ne mogu pošteno jednostavno raspodeliti. Prihod po usluzi vidi se kroz Naplaćeno.

Formula fizičkih proizvoda uključuje naplaćeno minus trošak štampe/izrade i refundacije. SaaS profit oduzima poznate troškove hostinga i backenda. Premium nema poseban dodatni rashod, pa prihod može ući direktno u Premium profit. Godišnja uplata se u celosti vodi kao prihod/profit meseca kada je naplaćena; period plaćanja ostaje vidljiv radi razlikovanja mesečnih i godišnjih uplata.

Tag `Prijatelj` automatski izuzima odabrane usluge i/ili Premium iz finansija. Druge stavke nisu automatski besplatne; admin ih eksplicitno označava.

Finansije nisu kompletno računovodstvo. V1 ostavlja prostor za račune i predračune, ali ih ne generiše.

### 9.11 Tim — ZAKLJUČANO

Tim prikazuje samo rad sa klijentima:

- otvoreni i zakasneli zadaci;
- razgovori za koje je član zadužen;
- trenutno operativno opterećenje;
- pregled i preuzimanje zadataka/razgovora.

Nema uređaja, sesija, vremena prijave, plate, praćenja prisutnosti niti deaktivacije člana tima u V1. Ako sistem kasnije služi zaposlenima, dobija zasebnu strukturu.

### 9.12 Podešavanja — PRIVREMENO prihvaćen temelj

Sekcije mogu biti:

- Opšte;
- Pretplate;
- Plaćanja;
- Komunikacija;
- Cene i popusti;
- Referral.

Podešavanja moraju sadržati centralna pravila upozorenja/grace-a i Premium referentnu cenu, ali implementacija ne sme omogućiti opasnu promenu pravila bez validacije i audit traga. Načini plaćanja: kartica je poželjna ali možda nije dostupna odmah; uplata na račun mora biti podržana; gotovina može biti opciona.

### 9.13 Debug pristup klijentskom nalogu — ZAKLJUČANO

Admin može ući u svaki klijentski nalog radi podrške i debugovanja, bez vremenskog ograničenja. Dok je u klijentskom kontekstu mora postojati nepromašiv banner sa:

- klijentom i lokalom;
- identitetom admina;
- jasnom akcijom za izlazak.

Sam pristup ne zahteva posebno odobrenje klijenta, ali poslovno važne izmene i dalje koriste audit log.

---

## 10. Operativni signal i „Za reakciju“

### 10.1 Jedan izvor istine

Dashboard, signal u tabeli klijenata, Tim i pojedinačni moduli ne smeju svaki zasebno izmišljati hitnost. Koriste jedan server-authoritative action read model. Izvor može biti kombinacija materijalizovanih `actionItems` i deterministički izvedenih činjenica, ali rezultat mora imati stabilan ID uzroka.

Primeri uzroka:

- usluga ili Premium u grace-u;
- grace istekao i usluga suspendovana;
- klijent poslao novu poruku;
- razgovor zahteva naš odgovor;
- zadatak kasni ili dospeva danas;
- porudžbina čeka uplatu/odobrenje/prijem/QC/isporuku;
- QR/NFC ima prijavljen ili automatski otkriven problem;
- plaćeno, a usluga još nije podešena;
- štampa je stigla i čeka potvrdu prijema.

### 10.2 Prioritet

Podrazumevani redosled:

1. crveni blokirajući problem ili zakasnela obaveza;
2. stavka sa rokom danas, najraniji rok prvi;
3. poruka na koju tim treba da odgovori;
4. grace i upozorenje po preostalom vremenu;
5. operativna stavka koja čeka ScanMe;
6. stavka koja čeka klijenta;
7. ostalo po poslednjoj relevantnoj promeni.

Klijentska tabela preuzima severity najhitnijeg otvorenog uzroka. Tooltip navodi konkretan razlog. Ako nema otvorenog uzroka, signal je zelen ili neutralan prema izabranom vizuelnom pravilu, ali ne sme izmišljati „aktivnost“.

### 10.3 Razrešenje i odlaganje

- „Reši“ je ulaz u kontekstualni meni ili izvorni ekran, ne univerzalno dugme koje naslepo zatvara problem.
- Automatski uzrok se zatvara kada se promeni činjenica: evidentirana uplata, uspešan redirect, odgovor poslat, zadatak završen itd.
- Ručno prijavljen problem može se ručno razrešiti uz napomenu.
- Odlaganje je dozvoljeno celom timu, ali zahteva razlog i datum/vreme do kada je odloženo.
- Odložena stavka ostaje u istoriji i vraća se u radni red kada odlaganje istekne.

---

## 11. Skaliranje i read modeli

### ZAKLJUČANO

Sistem se dizajnira za najmanje:

- 50+ aktivnih klijenata u bliskom periodu;
- 500+ lokala;
- desetine hiljada fizičkih primeraka/QR/NFC kanala;
- rast istorije poruka, uplata i audit događaja bez učitavanja cele istorije.

### 11.1 Obavezni query obrasci

- Sve velike liste su serverski filtrirane, sortirane i paginirane.
- Query ne učitava prvo sve naloge pa za svaki radi više dodatnih upita u petlji.
- Za tabele se uvode namerni read modeli/agregati i indeksi, umesto client-side spajanja velikih skupova.
- Global search koristi normalizovana polja/indekse za SMK, SML, SMF, SMQ, email, telefon i naziv.
- Dashboard dobija jedan ili mali broj ograničenih operativnih query-ja, ne celu bazu pa client-side agregaciju.
- Brojači i statusni sažeci moraju biti inkrementalni ili jeftino izvedeni iz ograničenih indeksiranih skupova.
- Detaljna istorija koristi cursor pagination; podrazumevano učitava najnoviji deo.
- Pretplatnički cron/scheduler radi u batch-evima i idempotentno.

### 11.2 Minimalni indeksi po domenu

Konačan schema zadatak proverava stvarne Convex upite, ali cilj zahteva ekvivalente:

- klijenti: by SMK, status, normalized owner/default contact;
- lokali: by SML, account, account+status, normalized name/city;
- kontakti: by account, normalized email, normalized phone;
- usluge: by venue+type, type+operational status;
- pretplate: by target, lifecycle status+paidThrough, account+status;
- uplate: by account+paidAt, reference, non-voided read path;
- alokacije: by payment, subscription, order;
- razgovori: by account+updatedAt, status+updatedAt, assignee+status;
- poruke: by conversation+createdAt, provider message ID;
- zadaci: by assignee+status+dueAt, account+status, status+dueAt;
- action items: by state+severity+dueAt, assignee+state, account+state;
- porudžbine: by account+createdAt, fulfillment status+updatedAt, assignee+status;
- proizvodi: by SMF, venue+status, venue+type/design/service, order line;
- kanali: by physical product+kind, SMQ, operational status, current destination;
- pozicije/analitika: by product+time, placement+time.

### 11.3 Kriterijumi performansi za V1

- Prvi paginirani ekran ne zavisi od ukupnog broja redova.
- Promena filtera ili strane ne šalje neograničene kolekcije klijentu.
- Dashboard i Klijenti ne koriste obrazac `take(200)` kao skrivenu zamenu za pravu paginaciju.
- Pri 500 lokala i najmanje 10.000 proizvoda seed/fixture test potvrđuje tačan broj, sort, filtriranje i stabilan cursor.
- Interakcija select/bulk nad proizvodima ne menja veličinu kartica i ne gubi izbor pri učitavanju sledeće stranice unutar jasno definisanog opsega.

---

## 12. Bezbednost, dozvole i audit

### 12.1 Serverska autorizacija

- Svaki admin query/mutation proverava administratorski pristup na serveru.
- Svaki klijentski query/mutation proverava članstvo, ulogu, dozvoljene lokale i specifičnu capability dozvolu.
- UI skrivanje dugmeta nije autorizacija.
- Objekat dobijen po ID-ju uvek se proverava da pripada očekivanom SMK/SML kontekstu.
- Samo `full_access` može otkazati uslugu; opciona dozvola kupovine/plaćanja ne daje pravo otkaza.
- Admin debug pristup ne sme oslabiti klijentske ownership provere za javne funkcije.

### 12.2 Rizične radnje

Potvrda i/ili razlog su obavezni za:

- storno uplate;
- ručnu izmenu perioda/grace-a;
- promenu dogovorene cene/popusta;
- otkazivanje/suspenziju usluge;
- bulk retarget QR/NFC;
- označavanje ili razrešenje problema;
- arhiviranje klijenta/lokala;
- promenu uloge/punog pristupa;
- odlaganje operativne stavke.

### 12.3 PII i poruke

- Ne logovati pune email sadržaje, telefone ili finansijske reference u tehničke logove bez potrebe.
- Email raw sadržaj i attachment-i imaju kontrolisan pristup.
- Search rezultat prikazuje samo minimum potreban za identifikaciju.
- Audit čuva strukturisanu poslovnu promenu, ne tajne, auth tokene ili kompletne poruke.

### 12.4 Admin tim

Teodora, Jovan i Aleksa imaju ista ovlašćenja u V1. Ne praviti hijerarhiju ili deaktivaciju članova samo radi buduće fleksibilnosti. Ako se kasnije pojave zaposleni sa drugim pravima, to je nova struktura i poseban zadatak.

---

## 13. Responsive granice

### Desktop — puni radni opseg

Desktop je primarno okruženje za:

- sve tabele, bulk selekciju i side panel;
- detaljan profil klijenta;
- porudžbine i fulfillment;
- finansijske grafikone;
- podešavanja i cene;
- uslužne operativne preglede.

### Mobilni admin — ZAKLJUČANO fokusiran opseg

Mobilni prikaz mora omogućiti:

- Dashboard i „Za reakciju“;
- globalnu pretragu po kodu;
- pronalaženje i osnovni profil klijenta;
- Inbox i panel-chat;
- Zadaci;
- status pretplate i relevantnu brzu radnju;
- QR/NFC proveru, prijavu/razrešenje problema;
- prijem/QC i evidenciju isporuke.

Mobilni V1 ne mora nuditi:

- složene bulk izmene nad velikim brojem proizvoda;
- kompletne finansijske grafikone i napredne filtere;
- masovno upravljanje cenama/podešavanjima;
- punu gustu desktop tabelu smanjenu na širinu telefona.

Na telefonu se redovi pretvaraju u radne kartice/detalje sa jasnim nazivom statusa. Hover tooltip dobija tap/focus ekvivalent.

---

## 14. Indeks mockupova

Svi putanje su relativne na repozitorijum.

### 14.1 Važeći vizuelni temelji

| Fajl | Autoritet | Šta zaključava | Poznate korekcije teksta/podataka |
|---|---|---|---|
| `docs/mockups/scanme-admin-dashboard-locked-v1.png` | **ZAKLJUČAN** | navbar, hijerarhija Dashboard-a, Za reakciju, kružni Pretplate/Kartice, mali Finansije/Zadaci/Inbox blokovi | Očekivano je budući period; nema dodatnih redundantnih gornjih brojki. |
| `docs/mockups/scanme-admin-finansije-v1.png` | prihvaćen temelj | raspored Finansija, tabovi, grafikon, način plaćanja, uplate | Poslovna pravila iz §9.10 imaju prednost nad demo podacima. |
| `docs/mockups/scanme-admin-porudzbine-v1.png` | prihvaćen temelj | tabela+proširenje, desni detalj i timeline | Koristiti tri statusne ose iz §8.5; nazivi proizvoda moraju biti kanonski. |
| `docs/mockups/scanme-admin-links-v1.png` | prihvaćen temelj | uslužni pregled, tabela, desni detalj i akcije | „Standard/Osnovni“ nisu ciljna nomenklatura; pretplata i Premium prate ovaj dokument. |
| `docs/mockups/scanme-admin-review-v1.png` | prihvaćen temelj | Review varijanta istog uslužnog obrasca | Tekstualne odluke imaju prednost. |
| `docs/mockups/scanme-admin-meni-v1.png` | prihvaćen temelj | Meni varijanta istog uslužnog obrasca | Tekstualne odluke imaju prednost. |
| `docs/mockups/scanme-admin-tim-v1.png` | prihvaćen temelj | timske kartice, zaduženja i razgovori | Bez HR/session/device podataka. |
| `docs/mockups/scanme-admin-podesavanja-v1.png` | prihvaćen temelj | navigacija Podešavanja i grupisanje poslovnih pravila | Premium cena je privremena; kartično plaćanje možda nije odmah dostupno. |
| `docs/mockups/scanme-admin-proizvodi-lokali-suptilno-grupisani-v5.png` | **VAŽEĆI PRVI KORAK** | kompaktno venue-first pronalaženje; klijenti su samo diskretna kolona | Naslov može biti skraćen; Proizvodi ostaju pod Operativa. |
| `docs/mockups/scanme-admin-proizvodi-inventar-vizuelno-v8.png` | **VAŽEĆI VIZUELNI PRIKAZ** | kompaktne jednake kartice, mali product preview, filteri, QR/NFC ikone | Ne pisati dodatni „Problem“ chip; koristiti kanonske nazive. |
| `docs/mockups/scanme-admin-proizvodi-inventar-tabela-v8.png` | **VAŽEĆI TABELARNI PRIKAZ** | QR/NFC ikonice, status kontrola, bulk bar, table/visual switch | Tanak sažetak iz najnovije odluke ima prednost nad debljom varijantom na slici. |
| `docs/mockups/scanme-admin-proizvodi-brze-izmene-v8.png` | **VAŽEĆI BULK TOK** | stabilan desni sidebar i multi-select | Selektovane kartice jednake veličine; Proizvodi nisu top-level navbar stavka. |

### 14.2 Posebno zaključan tanak sažetak proizvoda

Referenca iz razgovora: tanak horizontalni element sa četiri segmenta:

- ikonica proizvoda + broj proizvoda;
- QR ikonica + broj QR;
- NFC ikonica + broj NFC;
- crveni trougao + broj problema.

Ovaj tanji izgled zamenjuje deblje varijante istog elementa u pojedinim mockupovima.

### 14.3 Tekstualno zaključani ekrani bez sačuvanog PNG-a

Sledeće radionice su prihvaćene ponašanjem, ali odgovarajući finalni PNG nije pronađen u `docs/mockups` na datum preseka:

- Klijenti tabela;
- puni profil klijenta;
- Zadaci;
- Inbox je namerno preskočen kao poseban mockup.

Za njih su §9.2–§9.5 autoritativan ugovor. Implementacioni UI zadatak može prvo napraviti repo-native fixture/preview i tražiti vizuelni pregled, ali ne sme izmišljati nova poslovna pravila.

### 14.4 Nevažeće iteracije — ne implementirati

Sledeći fajlovi ostaju samo kao istorija radionice:

- `scanme-admin-proizvodi-v1.png`;
- `scanme-admin-proizvodi-01-izbor-klijenta-v1.png`;
- `scanme-admin-proizvodi-02-izbor-lokala-v1.png`;
- `scanme-admin-proizvodi-navigator-v2.png`;
- `scanme-admin-proizvodi-radni-pregled-v2.png`;
- `scanme-admin-proizvodi-hijerarhija-sklopljeno-v3.png`;
- `scanme-admin-proizvodi-hijerarhija-prosireno-v3.png`;
- sve product inventar/brze izmene varijante pre v8;
- svi zasebni QR izbor/navigator/radni mockupovi v1–v2.

Razlog: koriste veliki accordion/pop-up ili globalnu tabelu koja samo skriva problem skaliranja, dupliraju Proizvodi tok, menjaju veličine selektovanih kartica, koriste pogrešne nazive/tekstualne statuse ili pogrešno izmeštaju Proizvode iz Operative.

### 14.5 Mockup nedoslednosti koje implementer mora ignorisati

- Ako neki product v8 mockup izostavlja Inbox i Zadaci u navbaru, to je greška slike; koristi pun navbar iz §4.1.
- Ako mockup prikazuje staru/netačnu godinu, cenu, klijenta, broj ili domen, to je demo sadržaj.
- Ako mockup piše „Standard“, „Osnovni“ ili pogrešan naziv proizvoda, koristi kanonske nazive ovog dokumenta.
- Ako mockup prikaže `Problem` i crvenom ikonicom i dodatnim chip-om u vizuelnoj kartici, zadrži samo crvenu ikonicu i dostupno objašnjenje.
- Ako mockup prikazuje puni SMF na svakom proizvodu unutar već izabranog lokala, koristi zajednički koren jednom i lokalni sufiks po proizvodu.

---

## 15. ZAKLJUČANO, PRIVREMENO i POSLE V1 — sažetak

### 15.1 ZAKLJUČANO

- Klijent je SMK poslovni nalog, iznad lokala.
- Jedan nalog može imati više firmi, brendova, grupa, kontakata i lokala.
- Ime vlasnika je prikazni identitet klijenta; SMK uklanja dvosmislenost.
- Default kontakt se bira ručno i tabela ga uvek čita uživo.
- Premium je plaćen na nivou naloga i važi za sve usluge/lokale; Starter je besplatan i nema badge.
- Premium i svaka usluga svakog lokala imaju nezavisnu pretplatu i datum.
- Mesečno upozorenje/grace 7 dana; godišnje 15 dana.
- Jedna uplata može pokriti sve, neke ili jednu pretplatu, uz precizne alokacije.
- Sve se plaća unapred.
- Klijent može imati auto-payment, uplatu na račun i eventualno gotovinu; model nije vezan za jednog provajdera.
- Dashboard je početni ekran i pregled celog tima, sa `Moje` filterom.
- Nema redundantnih dashboard brojki koje ponavljaju sadržaj blokova.
- Klijenti tabela je brz pregled bez horizontalnog skrola; profil je puna duboka stranica.
- Email i panel-chat su odvojeni kanali u zajedničkom Inbox-u.
- Chat nije live obećanje i koristi admin-only sent/delivered/read signalizaciju.
- Zadaci su isključivo vezani za klijente; odlaganje zahteva razlog.
- Proizvodi su venue-first i pod Operativa; izabrani lokal otvara tabelu ili kompaktan vizuelni prikaz.
- QR/NFC se kontrolišu iz Proizvodi modula kada pripadaju SMF-u.
- Jedan fizički komad ima jedinstveni SMF; serijski tekst je nenametljiv i nije skenirajući.
- Jedan komad uvek ima jedan aktuelni link, koji može biti razdelnik za više usluga.
- QR/NFC imaju aktivan/neaktivan/problem/odsutan vizuelni jezik.
- Dizajn odštampanog proizvoda je trajni snapshot, bez lažne verzije dizajna.
- Porudžbina može imati više proizvoda; SMF se dodeljuje tek posle uplate i odobrenja dizajna.
- Štamparija šalje ScanMe timu; QC i aktivacija su kod nas; zatim isporuka.
- Finansije: Naplaćeno, Očekivano, Profit; nisu puno knjigovodstvo.
- Godišnja uplata u celosti ulazi u mesec naplate.
- Teodora, Jovan i Aleksa imaju ista admin prava.
- Admin može u klijentski panel za debug bez vremenskog ograničenja.
- U V1 aktivne admin usluge su Links, Review i Meni.

### 15.2 PRIVREMENO

- Premium referentna cena 1.490 RSD mesečno.
- Tačan model referral popusta, procenat/iznos i trajanje.
- Founders popust: vremenski ograničen ili doživotan.
- Enterprise i individualne cene se podržavaju strukturno, ali konkretni ugovori nisu zadati.
- Tačan SMP format i konačne dužine SMK/SML/SMF/SMQ kodova.
- Koji payment provider podržava kartice i kada se uključuje.
- Tačan vizuelni položaj panel-chat-a u profilu klijenta, pod uslovom da Inbox i profil dele isti izvor podataka.
- Fina nomenklatura porudžbinskih faza; tri nezavisne statusne ose su zaključane.
- Formula operativnog `opterećenja` na Tim kartici; mora se zasnivati samo na klijentskom radu.

### 15.3 POSLE V1

- Zvanično generisanje računa i predračuna.
- Puno knjigovodstvo, poreske prijave ili zamena za računovodstveni sistem.
- Browser/system/push notifikacije.
- Napredna HR struktura, zaposleni sa hijerarhijom i deaktivacija kroz UI.
- Posebna nova implementacija admin modula Venue i Memories.
- POS integracija. Analitika porudžbina iz ScanMe Menija koristi samo porudžbine poslate i prihvaćene kroz naš sistem.
- Napredna pravila referral programa izvan minimalnog V1 toka.
- Automatsko uklanjanje email potpisa pomoću složenog ML sistema; V1 može koristiti bezbedno skraćivanje/collapsing uz očuvan raw email.
- Potpuna mobilna paritetnost sa složenim desktop bulk/finance/settings alatima.

---

## 16. Strategija implementacije

### 16.1 Odgovor na pitanje Codex ili Claude Cowork

**ZAKLJUČANO: kompletnu V1 implementaciju admin panela vodi Codex kroz niz zasebnih, kontrolisanih Goal taskova. Claude ostaje raspoloživ za odvojeni rad na ScanMe Meniju.**

Nije potreban veliki Claude Cowork prompt koji bi ponovo razlagao već razložen posao. Ovaj dokument je upravo orkestracioni sloj. Uvođenje drugog sistema da ponovo tumači sve odluke povećalo bi mogućnost da:

- promeni već zaključane granice;
- napravi drugi model podataka;
- pomeša stare i važeće mockupove;
- dodeli paralelne zadatke koji menjaju istu Convex schemu;
- teže sačuva jedan testiran redosled migracije.

Nije potrebno trošiti Claude kontekst na ponovno razlaganje ovog dokumenta. Nezavisna revizija može se po potrebi uraditi drugim Codex taskom sa modelom navedenim u ovom dokumentu.

### 16.2 Model, effort i mode pravilo

- **Ne menjati model usred aktivnog taska.** Za svaki novi task prvo otvoriti nov Codex task, izabrati navedeni model/effort, pa tek onda poslati prompt.
- **Goal mode** se koristi za svaki implementacioni zadatak jer mora da završi kod, testove i browser proveru, a ne samo da napravi plan.
- **Plan mode** koristiti samo ako vlasnik želi da promeni ovaj dokument ili otvori novu neodlučenu proizvodnu oblast. Plan mode se ne koristi za izvršavanje zadataka iz §18.
- `gpt-6-astra xhigh` se koristi na četiri ključna checkpointa na kojima greška može promeniti više domena ili zahtevati skupu preradu: izvršni domenski ugovori, nezavisne pretplate i naplata, SMF/QR/NFC model i završno scale/failure hardening testiranje.
- `gpt-5.6-sol xhigh` je glavni implementacioni model za složene backend, autorizacione, integracione i cross-domain zadatke nakon što su ugovori zaključani.
- `gpt-5.6-sol high` se koristi za preflight, provider-specifičan adapter kada je ugovor poznat i završni kontrolisani cutover.
- `gpt-5.6-terra high` se koristi za jasno ograničene UI zadatke čiji su podaci, ponašanje i acceptance kriterijumi već definisani. UI zadatak i dalje mora da uradi pun browser QA; Terra ne dobija pravo da menja domenski model da bi pojednostavio ekran.
- `ultra` se ne koristi unapred. Uključuje se samo novim taskom ako konkretan, dokazani problem ostane nerešen posle xhigh pokušaja.

Promena modela ili efforta važi tek za sledeći zaseban implementacioni task; završeni dokumentacioni rad se ne ponavlja zbog promene podešavanja.

### 16.3 Git i radni tok

1. Pre prvog koda napraviti eksplicitno odobren checkpoint trenutnog worktree-a. Ne resetovati i ne odbacivati postojeće izmene.
2. Nakon checkpoint-a koristiti jednu glavnu implementacionu granu, predlog `codex/admin-v1`.
3. Schema i migracioni zadaci se rade strogo sekvencijalno na istoj grani.
4. Jedan Codex task radi jedan ID iz §18 i završava se sopstvenim proverama i preglednim diff-om.
5. Sledeći task počinje tek kada je prethodni završen, lokalno commitovan i njegov verification report je zelen.
6. Dva dostupna GPT naloga predstavljaju dva odvojena usage fonda, ali se na ovom računaru koriste sekvencijalno. Ne pokretati paralelne Codex taskove niti praviti worktree samo radi paralelizacije admin implementacije.
7. Ne praviti privremeni drugi kompletan admin. Nova školjka može postepeno preuzimati rute, ali samo jedan tok je autoritativan za korisnika.
8. Stare admin komponente se uklanjaju tek u završnom cutover zadatku, kada su klasifikovane funkcije provereno preseljene ili odbačene.

### 16.4 Predloženi sekvencijalni tok preko dva GPT naloga

Ovo je plan rada, ne obećanje da task mora biti završen u zadatom satu. Kvalitet i zelene provere imaju prednost nad veštačkim rokom.

Kada jedan nalog potroši raspoloživi usage, rad se nastavlja sledećim nezapočetim taskom na drugom nalogu. Promena naloga ne menja granu, redosled niti sadržaj prompta.

**Prvi deo — temelj i prvi vidljivi rezultat**

1. ADMIN-00, zatim ADMIN-01.
2. ADMIN-02, ADMIN-03 i ADMIN-04 rade se redom, svaki kao zaseban task.
3. ADMIN-05 počinje tek kada je ADMIN-04 završen i zajedničko stanje ponovo provereno.

**Drugi deo — vertikalne celine, integracija i hardening**

1. Nastaviti po broju taska i njegovim deklarisanim zavisnostima, bez preplitanja izvršilaca.
2. ADMIN-09 ostaje van kritične putanje dok se ne izabere email provider; ako je i dalje blokiran, evidentira se i prelazi na ADMIN-10.
3. ADMIN-18, ADMIN-19 i ADMIN-20 rade se tek nad jednim stabilnim stanjem svih prethodnih završenih taskova.

Ako dvodnevni prozor istekne pre ADMIN-20, ne preskaču se provere i ne radi se nasilni cutover. Zadržava se poslednji zeleni checkpoint i nastavlja sledećim taskom.

### 16.5 Minimalni prompt za svaki task

Za svaki novi Codex task dovoljno je poslati:

```text
Implementiraj TASK ADMIN-XX iz docs/SCANME-ADMIN-V1-IMPLEMENTACIJA.md.
Taj dokument je autoritativan; pročitaj §0, relevantne domenske odeljke i ceo opis TASK ADMIN-XX.
Ne širi opseg i ne započinji sledeći task. Sačuvaj nepovezane izmene.
Pre Convex rada pročitaj convex/_generated/ai/guidelines.md; pre Next.js rada pročitaj relevantnu lokalnu Next dokumentaciju.
Završi sve kriterijume verifikacije iz taska, pokreni npm run check i uradi desktop/mobilni browser QA kada postoji UI.
Ako naiđeš na kontradikciju koja menja proizvod, ne nagađaj: zapiši je u docs/tasks/BLOCKED.md i prijavi je.
```

Ne kopirati ceo ovaj dokument u prompt; implementer ga čita iz repozitorijuma. Tako se štedi kontekst i smanjuje mogućnost da stara kopija specifikacije nadjača aktuelni fajl.

### 16.6 Obavezni izlaz svakog taska

Svaki task završava kratkim izveštajem:

- šta je promenjeno;
- koje su granice poštovane;
- koji testovi su dodati;
- rezultat `npm run check`;
- browser QA desktop + mobilni ako ima UI;
- poznata otvorena pitanja ili odložene stavke;
- potvrda da sledeći task nije započet.

---

## 17. Graf zavisnosti

```text
ADMIN-00 Presek i zaštita worktree-a
  └─ ADMIN-01 Izvršni ugovori i test-fixtures
      ├─ ADMIN-02 SMK/SML, organizacija, kontakti i pristup
      │   ├─ ADMIN-03 Nezavisne pretplate, uplate, cene i referral
      │   │   ├─ ADMIN-04 Operativni action/search read modeli
      │   │   ├─ ADMIN-14 Finansije
      │   │   └─ ADMIN-16 Podešavanja
      │   ├─ ADMIN-08 Komunikaciono jezgro i panel-chat
      │   │   └─ ADMIN-09 Email inbox adapter
      │   ├─ ADMIN-10 Zadaci i Tim
      │   └─ ADMIN-11 Porudžbine, proizvodnja i isporuke
      │       └─ ADMIN-12 Fizički proizvodi, QR/NFC i destinacije
      │           └─ ADMIN-13 Proizvodi/QR radni UI
      ├─ ADMIN-05 Nova admin školjka i navigacija
      │   ├─ ADMIN-06 Klijenti tabela
      │   ├─ ADMIN-07 Profil klijenta
      │   └─ ADMIN-15 Uslužni moduli
      └──────────────────────────────────────────────┐
                                                     ├─ ADMIN-17 Dashboard integracija
ADMIN-04 + 06 + 08/09 + 10 + 11/12/13 + 14 ─────────┘
  └─ ADMIN-18 Global search, audit i debug pristup
      └─ ADMIN-19 Mobile, a11y, scale i failure hardening
          └─ ADMIN-20 Cutover i uklanjanje odbačenog legacy UI-ja
```

Implementacija se na ovom računaru vodi sekvencijalno. Broj taska je podrazumevani redosled; deklarisane zavisnosti ostaju dodatna kontrola da nijedan task ne počne prerano. ADMIN-09 se može preskočiti samo dok je dokumentovano blokiran izborom email providera.

---

## 18. Kontrolisani implementacioni zadaci

## ADMIN-00 — Presek, inventar i zaštita početnog stanja

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** nema

### Cilj

Napraviti proverljiv početni presek pre velikih izmena i potvrditi šta je već živo, bez promene funkcionalnosti admina.

### U opsegu

- zabeležiti commit/branch, `git status`, aktivne admin rute i relevantne testove;
- uz vlasnikovo eksplicitno odobrenje napraviti bezbedan checkpoint/commit ili drugu dogovorenu tačku povratka;
- pokrenuti početni `npm run check` i evidentirati postojeće padove;
- proveriti koji localhost/deployment koristi razvojno okruženje, bez promene deployment podataka;
- napraviti kratak baseline report u `docs/tasks/`.

### Van opsega

- UI ili schema izmene;
- čišćenje „mrtvog“ koda;
- reset baze, brisanje test podataka ili hard reset;
- rešavanje postojećih nepovezanih test padova.

### Verifikacija

- postoji čitljiv baseline report sa tačnim commitom i dirty statusom;
- nijedan postojeći fajl nije odbačen ili prepisan;
- početni check rezultat je ponovljiv;
- vlasnik može jasno da se vrati na početnu tačku.

---

## ADMIN-01 — Izvršni domenski ugovori, fixture-i i migracioni test plan

**Izvršilac:** Codex  
**Model:** `gpt-6-astra`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-00

### Cilj

Pre schema izmene pretvoriti zaključani model u testabilne TypeScript ugovore i minimalne fixture scenarije, bez izgradnje ekrana.

### U opsegu

- kanonski tipovi za SMK/SML, usluge, periode, statuse, uloge i audit akcije;
- centralni katalog naziva usluga i fizičkih proizvoda;
- fixture scenario: jedan klijent, četiri lokala, prva tri sa mesečnom uslugom A, četvrti sa tri godišnje usluge, nezavisni datumi i selektivno neplaćanje;
- fixture-i za Premium na nivou naloga, više kontakata, više firmi/brendova, prijatelj tag, referral i individualnu cenu;
- fixture-i za porudžbinu sa više linija/komada i QR/NFC stanja;
- plan widen-migrate-narrow i test matrica.

### Van opsega

- produkciona schema migracija;
- finalni UI;
- novi provider/integracija;
- određivanje privremenih cena/referral procenata.

### Verifikacija

- TypeScript/test fixture-i mogu predstaviti sve zaključane use case-ove bez `any` poslovnih shortcut-a;
- ne postoje dva različita prikazna naziva za isti proizvod/uslugu;
- test plan eksplicitno pokriva nezavisne cikluse i parcijalnu uplatu;
- `npm run check` prolazi ili izveštaj precizno razdvaja baseline pad.

---

## ADMIN-02 — SMK/SML, firme, brendovi, kontakti i pristup

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-01

### Cilj

Uskladiti osnovni tenancy model sa `klijent -> lokali`, bez održavanja legacy account-less puta kao trajnog rešenja.

### U opsegu

- additive schema za SMK/SML kodove, legal entities, account contacts, default kontakt i venue override;
- brands/groups/tags, uključujući `Prijatelj` oznaku bez finansijske logike ovog taska;
- account-level membership uloge i opcione dozvole kupovine/plaćanja;
- jedan primarni vlasnik, više full-access članova;
- migracija/test seed postojećih test account/business/contact podataka;
- serverska ownership/autorizacija;
- kompatibilni adapteri samo gde su potrebni da build ostane zelen do narednih taskova.

### Van opsega

- pretplate i finansije;
- Inbox i zadaci;
- finalni Klijenti UI;
- brisanje Venue/Memories domenskog koda;
- samostalno resetovanje baze.

### Verifikacija

- test dokazuje jedan SMK sa više SML i više firmi/brendova/kontakata;
- promena default kontakta odmah menja read model bez kopiranja kontakt podataka;
- venue override ne menja account default;
- samo full access može otkazati uslugu; manager sa posebnom dozvolom može kupiti/platiti, ali ne otkazati;
- duplikati ljudskih kodova su odbijeni, interne veze ne zavise od parsiranja koda;
- negativni auth testovi odbijaju pristup tuđem nalogu/lokalu;
- `npm run check` prolazi.

---

## ADMIN-03 — Nezavisne pretplate, uplate, cene, popusti i referral

**Izvršilac:** Codex  
**Model:** `gpt-6-astra`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-02

### Cilj

Zameniti zajednički account billing ciklus tačnim modelom Premium + per-service/per-venue pretplata, uz objedinjenu ili parcijalnu uplatu.

### U opsegu

- `subscriptions`, `payments`, `paymentAllocations`, price agreements/discounts i referral minimalni model;
- mesečni/godišnji warning i grace 7/15 dana;
- nezavisni datumi početka i obnove;
- objedinjena uplata sa više alokacija i pojedinačna uplata;
- bank transfer, payment card, cash, other kao provider-neutral metode;
- append-only uplata, storno sa razlogom i audit;
- Premium badge read fact; Starter nema plaćenu pretplatu;
- prijatelj waiver za eksplicitno odabrane usluge/Premium;
- referral reward tek posle prve uspešne uplate;
- founders/enterprise/individual pricing seams;
- idempotentni batch lifecycle sweep.

### Van opsega

- UI Finansija;
- konkretna payment provider integracija;
- zvanični račun/predračun;
- konačna referral kampanja ili konačna Premium cena;
- profit agregacije.

### Verifikacija

- glavni scenario sa četiri lokala dokazuje da neplaćanje četvrtog lokala ne utiče na prva tri;
- usluge kupljene 15. februara i 15. septembra ostaju na različitim godišnjim datumima;
- jedna uplata može pokriti sve, a druga samo izabranu uslugu;
- grace/warning 7/15 i suspenzija imaju boundary testove;
- Premium važi za sve lokale bez menjanja njihovih uslužnih datuma;
- referral se ne nagrađuje pre prve uspešne uplate;
- storno ne briše istoriju i ne pravi neobjašnjivu retroaktivnu promenu;
- svi auth/audit i `npm run check` testovi prolaze.

---

## ADMIN-04 — Operativni action engine, statusni agregati i skalabilna pretraga

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-03; po potrebi ugovori ADMIN-08/10/11 mogu prvo biti minimalno stubovani, ne lažirani

### Cilj

Napraviti jedan server-authoritative izvor za hitnost, action items, globalni search i paginirane sažetke.

### U opsegu

- actionItem model/derivacija, severity, owner, due/snooze i resolution rule;
- `Sve/Moje` query;
- agregirani klijentski signal i uslužna ikona po najgorem relevantnom stanju;
- paginirani client/venue/product search read modeli;
- normalizovani search po nazivima, emailu, telefonu i SM kodovima;
- seed/scale fixture za 500 lokala i 10.000 proizvoda;
- deduplikacija istog uzroka na Dashboard-u, Klijentu i modulu.

### Van opsega

- finalni Dashboard UI;
- samostalno slanje notifikacija;
- izmišljanje inbox/task/order uzroka koji još ne postoje — pripremiti adapter ugovor;
- browser push.

### Verifikacija

- isti uzrok ima isti stabilan ID kroz sve read modele;
- „Reši“/čitanje ne zatvara automatski uzrok;
- promena osnovne činjenice razrešava action item idempotentno;
- snooze bez razloga je odbijen, po isteku se stavka vraća;
- default sortiranje prati §10.2;
- scale test nema neograničeno učitavanje i ne koristi N+1 po svakom redu;
- `npm run check` prolazi.

### Implementacioni zapis — 2026-09-11

**ZAKLJUČANO (implementirano):**

- `actionItems` je jedini operativni zapis uzroka. `causeId` je stabilan, verzionisan i sastavljen od length-prefixed `sourceDomain + sourceRecordId + causeKind`, pa isti uzrok ne može da se udvostruči zbog separatora niti površine sa koje je pročitan;
- `actionItemEvents` je append-only istorija otvaranja, promene izvora, zaduženja, snooze-a, povratka i razrešenja. `resolutionContext` je read-only; automatski uzrok zatvara samo njegov source adapter, a ručni problem zahteva napomenu;
- postoje indexed `Sve/Moje`, account/venue/product worst-open signal i subscription adapter vezan za postojeći `reconcileSubscription`. Inbox, task, order i QR/NFC imaju samo minimalan typed input ugovor bez izmišljenih zapisa ili statusa;
- `adminClientReadModels`, `adminVenueReadModels` i `adminProductReadModels` su paginirani, serverski filtrirani/sortirani read modeli sa normalizovanim search tokenima za nazive, email, telefon i SMK/SML/SMF/SMQ;
- status uslužne ikonice se održava inkrementalno u najviše tri account/service agregata i koristi redosled `problem → suspended → grace → warning → inactive → active`.

**Dokumentovani bounded-read razlog:** direktorijumi namerno čuvaju po jedan sažeti dokument po klijentu, lokalu ili proizvodu. List/search query radi jedan paginirani index/search-index read i mapiranje rezultata bez per-row `get`, join-a ili `collect`. Source joinovi postoje samo u eksplicitnim sync mutacijama; broj service profila po lokalu je ograničen na 10, account service agregat na tri V1 usluge, a action liste na najviše 100 redova. Ovo je kontrolisana denormalizacija potrebna da 500 lokala i 10.000 proizvoda ne naprave read amplification.

**Test-only scale dokaz:** fixture pravi tačno 500 venue i 10.000 product read-model zapisa. Svaka stranica radi pod convex-test limitom od 4 DB upita i 250 pročitanih dokumenata; cela kolekcija se broji isključivo prolaskom kroz stabilne cursore, a ne neograničenim produkcionim učitavanjem. Fixture nikada ne ide u deployment.

**OTVORENO:** source adapteri za Inbox, zadatke, porudžbine i QR/NFC namerno ostaju za njihove domenske taskove. ADMIN-04 ne zaključava njihove buduće statuse, događaje ili storage model.

---

## ADMIN-05 — Nova admin školjka, design tokens i navigacija

**Izvršilac:** Codex  
**Model:** `gpt-5.6-terra`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-01; preporučeno ADMIN-02 za realan identitet admina

### Cilj

Implementirati novi top navbar i zajednički vizuelni sistem bez implementacije sadržaja svih modula.

### U opsegu

- `/admin` školjka i Dashboard kao početna ruta;
- pun navbar iz §4.1, Operativa/Usluge dropdown, settings/search/profile kontrole;
- responsive ponašanje i mobile nav;
- dosledni panel/table/status/tooltip/loading/empty/error primitive-i;
- tanak summary pill primitive;
- typed i18n copy;
- fixture/demo page za browser QA, ako realni podaci još nisu spremni;
- bezbedni legacy redirect hook-ovi.

### Van opsega

- business funkcije modula;
- menjanje ScanMe Links editora ili javnih stranica;
- generički redizajn celog sajta;
- fake dashboard metrike u produkcionoj ruti.

### Verifikacija

- navbar sadrži tačno Dashboard, Klijenti, Inbox, Zadaci, Operativa, Usluge, Finansije, Tim;
- Proizvodi je pod Operativa, ne top-level;
- Venue/Memories nisu V1 uslužni tabovi;
- keyboard, focus, reduced motion, desktop i mobilni prikaz provereni u browseru;
- nema horizontalnog page overflow-a;
- vizuelno je blisko zaključanom Dashboard mockupu, bez preteranog landing-page ScanMe stila;
- `npm run check` prolazi.

---

## ADMIN-06 — Klijenti tabela

**Izvršilac:** Codex  
**Model:** `gpt-5.6-terra`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05

### Cilj

Napraviti skalabilan brzi pregled klijenata sa zaključanim kolonama i interakcijama.

### U opsegu

- paginirana tabela sa signalom, identity/SMK/Premium, default kontaktom, lokalima, uslugama+naplatom, akcionom Aktivnošću i kebab menijem;
- email+telefon u kontaktu;
- agregirane uslužne ikone, tooltip i inline proširenje po lokalima;
- pretraga i sortiranje, default hitnost;
- klik na ime i dupli klik praznog dela reda;
- klijentski/debug panel u tri tačke;
- desktop bez horizontalnog skrola i mobilna radna kartica.

### Van opsega

- puni profil;
- chat/inbox implementacija;
- beznačajna poslednja aktivnost;
- posebno stalno dugme za klijentski panel;
- Starter badge.

### Verifikacija

- dva klijenta istog imena ostaju nedvosmislena zbog SMK/lokala;
- promena default kontakta u backend fixture-u odmah menja red;
- slučaj 2 aktivna + 1 grace prikazuje najgoru boju i tačne brojke u tooltip/proširenju;
- Premium badge ne menja širinu imena; Starter badge ne postoji;
- nije moguće prikazati „nova poruka“ bez realnog unread podatka;
- desktop/mobile browser QA i `npm run check` prolaze.

---

## ADMIN-07 — Puni profil klijenta

**Izvršilac:** Codex  
**Model:** `gpt-5.6-terra`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-02, ADMIN-03, ADMIN-05, ADMIN-06; data adapteri za kasnije sekcije mogu imati iskren empty state

### Cilj

Napraviti punu client-centric stranicu sa dubinom informacija, bez kopiranja lokalnih/uslužnih konzola.

### U opsegu

- header i prvi ekran;
- default kontakt + dropdown drugih kontakata + eksplicitna promena defaulta;
- sekcije Pregled, Lokali i usluge, Finansije, Proizvodi, Komunikacija, Aktivnost;
- kompaktna stalno dostupna lista lokala;
- kontakt CRUD, firma/PIB placeholder podaci, brend/grupa/tag pregled;
- per-location usluge i pretplate;
- context links ka povezanim modulima;
- loading/empty/error/not-found.

### Van opsega

- kompletan Inbox, Products ili Finance modul unutar profila;
- kopiranje svih njihovih tabela;
- finalna fakturacija;
- skriven panel sa svim kontaktima stalno otvoren.

### Verifikacija

- promena odabranog kontakta menja njegove podatke i istoriju, ali ne default;
- posebna akcija za default radi i auditovana je;
- više lokala je pregledno bez accordion lavirinta;
- svaka sekcija koristi isti izvor podataka kao njen glavni modul ili iskren empty state;
- profil je direktno linkabilan i radi refresh/back;
- desktop/mobile browser QA i `npm run check` prolaze.

---

## ADMIN-08 — Komunikaciono jezgro, ručni kanali i panel-chat

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-02, ADMIN-05

### Cilj

Napraviti zajednički conversation/message model, panel-chat i Inbox osnovu nezavisnu od konkretnog email provajdera.

### U opsegu

- conversations/messages schema, status, contact/account/venue veze i assignee;
- panel-chat slanje i admin-only sent/delivered/read stanje;
- klijentski chat UI bez prikaza admin read statusa;
- ručni phone/in-person/message-copy zapisi;
- Inbox list/detail UI sa realnim read/unread fact-om;
- reopen na novu klijentsku poruku;
- statusi i ručno završavanje `Čeka se klijent`;
- shared component za Inbox/profil.

### Van opsega

- inbound/outbound email provider adapter;
- live socket/presence obećanje;
- browser/system notifikacije;
- automatsko kopiranje WhatsApp/Viber/SMS poruka.

### Verifikacija

- sent/delivered/read prelazi nastaju tačno po zaključanim događajima;
- klijent ne vidi ScanMe read receipt;
- nova klijentska poruka ponovo otvara razgovor;
- promena statusa/zaduženog je auditovana;
- kontaktni filter prikazuje samo istoriju izabranog kontakta;
- nema fake unread-a;
- auth negativni testovi, desktop/mobile QA i `npm run check` prolaze.

---

## ADMIN-09 — Poslovni email inbox adapter

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-08; **blokiran dok nisu poznati provider, domen i inbound mogućnosti zajedničkog mailbox-a**

### Cilj

Omogućiti čitanje, slanje i odgovor sa zajedničke poslovne email adrese unutar admina, kroz provider adapter koji ne zaključava domenski model.

### U opsegu

- dokumentovana odluka o provideru i inbound mehanizmu (webhook, API sync ili drugo);
- inbound verifikacija, idempotency po provider message ID-ju i threading;
- outbound send/reply sa author auditom;
- attachment metadata i bezbedno čuvanje;
- raw email + očišćen/collapsed preview potpisa/disclaimera;
- status, unread i reopen integracija;
- fallback „Poslato iz zajedničkog sandučeta“ kada autor nije poznat;
- failure/retry i delivery state.

### Van opsega

- migracija čitave istorije starog mailbox-a bez posebne odluke;
- ML klasifikacija potpisa;
- marketing kampanje/newsletter;
- browser push.

### Verifikacija

- realan inbound test email ulazi tačno jednom u pravi thread;
- reply iz admina stiže sa zajedničke adrese i ostaje u istoriji;
- provider retry ne duplira poruku;
- potpis je sklopljen u preview-u, raw poruka dostupna;
- nepoznat eksterni sender/author se prikazuje iskreno;
- secret-i nisu u repozitorijumu;
- failure/retry, auth i `npm run check` prolaze.

---

## ADMIN-10 — Zadaci i Tim

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-02, ADMIN-04, ADMIN-05; integracija sa ADMIN-08 kada postoji conversation link

### Cilj

Implementirati klijentske zadatke i timski operativni pregled bez HR nadogradnji.

### U opsegu

- tasks schema, veze, jedan assignee, učesnici, prioritet, datum ili datum+vreme;
- filteri i desni detalj;
- snooze/postpone sa obaveznim razlogom;
- Tim kartice i tabovi Pregled/Zadaci/Razgovori;
- preuzimanje i preraspodela;
- Dashboard adapter za danas/kasni/moje.

### Van opsega

- nevezani interni zadaci;
- calendar workforce planner;
- payroll, session, device, login tracking;
- browser/system notifikacije;
- deaktivacija člana tima.

### Verifikacija

- task bez klijenta ne može biti kreiran;
- tačno jedan primarni assignee, nula ili više učesnika;
- rok bez vremena i rok sa vremenom ispravno sortiraju danas/kasni;
- odlaganje bez razloga je odbijeno i istorija je vidljiva;
- Tim brojevi se slažu sa istim zadacima/razgovorima, ne posebnim duplikatima;
- desktop/mobile QA i `npm run check` prolaze.

---

## ADMIN-11 — Porudžbine, dizajn, štamparija, prijem i isporuka

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-02, ADMIN-03, ADMIN-04, ADMIN-05

### Cilj

Proširiti postojeći immutable order snapshot u realan operativni tok sa tri nezavisne statusne ose.

### U opsegu

- orders/orderLines migracija i ljudski kod;
- payment/design/fulfillment state mašine;
- custom design pre ili posle uplate;
- gating: plaćeno + odobreno pre SMF/proizvodnje;
- printJobs i jedna inicijalna štamparija kao podatak;
- prijem kod ScanMe, QC, aktivacija signal i deliveries;
- kurir vs lična dostava i ko je izvršio radnju;
- tabela, proširenje reda i desni detalj po prihvaćenom mockupu;
- action/task audit adapteri.

### Van opsega

- generisanje konačnog SMF/kanala (ADMIN-12);
- direktna isporuka iz štamparije klijentu;
- POS;
- zvanični račun/predračun;
- višedobavljački marketplace.

### Verifikacija

- custom dizajn napreduje nezavisno od uplate;
- sistem ne dodeljuje SMF niti šalje u proizvodnju dok oba gate-a nisu ispunjena;
- jedna porudžbina ima više linija i više isporuka;
- štamparija ne može imati client kao direktnu destinaciju u V1;
- kurirska dostava ne ulazi kao ScanMe naplaćena dostava; lična je 0;
- svaki prelaz ima actor/time i invalidni prelaz je odbijen;
- browser QA i `npm run check` prolaze.

---

## ADMIN-12 — SMF inventar, QR/NFC kanali, destinacije i analitika pozicije

**Izvršilac:** Codex  
**Model:** `gpt-6-astra`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-11, ADMIN-03; zadržati postojeći cards resolver i immutable target istoriju gde je bezbedno

### Cilj

Uvesti individualni fizički inventar i odvojene QR/NFC kanale bez gubitka dobrog dinamičkog resolvera.

### U opsegu

- physicalProducts po komadu, SMF generator i local suffix;
- provisioning količine N u N individualnih zapisa, idempotentno;
- accessChannels QR/NFC, status/reason/health i shared destination ugovor;
- digital SMQ bez proizvoda i kasnije vezivanje za SMF uz istoriju;
- immutable destination history, splitter pravila i bulk retarget transakcije;
- placement i placementHistory;
- analitika po proizvodu/kanalu/poziciji i skrivanje stare pozicije u default klijentskom pregledu;
- migracioni adapter za postojeće `cards/cardTargets/cardScanEvents`;
- audit i action items za problem.

### Van opsega

- finalni Products UI (ADMIN-13);
- izmišljanje NFC hardverskog provisioning protokola ako nije definisan;
- brisanje postojeće card scan istorije;
- automatsko prepisivanje odštampanog dizajna.

### Verifikacija

- porudžbina količine 50 stvara tačno 50 jedinstvenih SMF komada jednom;
- svaki komad ima bar QR ili NFC, a odsutan kanal se čita kao siv;
- QR i NFC istog SMF-a dele destinaciju, ali imaju nezavisan status/analitiku;
- aktivan/neaktivan/problem prelazi i razlozi su testirani;
- multi-service proizvod vodi na Links ili generički splitter prema §7.5;
- stari target ostaje u istoriji posle retargeta;
- promena pozicije ne briše analitiku, a default read odvaja staru;
- 10.000 product scale test, auth i `npm run check` prolaze.

---

## ADMIN-13 — Proizvodi i QR radni interfejs

**Izvršilac:** Codex  
**Model:** `gpt-5.6-terra`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-04, ADMIN-05, ADMIN-12

### Cilj

Implementirati važeći venue-first Products tok, tabelu/vizuelni prikaz, bulk sidebar i sekundarni QR pregled.

### U opsegu

- prvi ekran iz `...lokali-suptilno-grupisani-v5`;
- paginacija, search i filteri;
- selected venue header i tanak summary pill;
- vizuelni v8 i tabelarni v8 nad istim stanjem;
- stabilan multi-select i desni bulk sidebar v8;
- kanonski naziv/ikona proizvoda;
- QR/NFC ikone i editable status;
- globalni QR modul samo za digitalne/problem/tehničke slučajeve;
- mobile QR/QC/support tok.

### Van opsega

- veliki client accordion ili popup navigator;
- globalna tabela svih 50.000 proizvoda kao početni ekran;
- galerijski velike slike;
- dupliciranje Products CRUD-a u QR modulu;
- menjanje veličine selektovane kartice;
- dodatan `Problem` chip uz već crvenu ikonicu.

### Verifikacija

- ponovni ulazak počinje izborom lokala, ne poslednjim lokalom;
- isti klijent zauzima jednu diskretnu kolonu za uzastopne lokale;
- product visual/table switch čuva filtere i selekciju;
- sve kartice su iste veličine pre/posle selekcije;
- ceo SMF koren se prikazuje jednom, redovi koriste `#suffix`;
- bulk status/destination/service/position radi samo nad izabranima i auditovan je;
- thin summary tačno prati zaključanu referencu;
- desktop/mobile browser QA i `npm run check` prolaze.

---

## ADMIN-14 — Finansije

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-03, ADMIN-11; direct cost inputs moraju postojati ili imati eksplicitno „nije uneto“, ne nulu po pretpostavci

### Cilj

Implementirati operativni finansijski modul sa tačnim Naplaćeno/Očekivano/Profit ugovorima.

### U opsegu

- server agregacije i grafikoni;
- filteri i periodi iz §9.10;
- payment method raspodela;
- uplate lista sa periodom i alokacijama;
- trošak fizičke izrade/refund i infrastrukturni SaaS troškovi;
- Premium profit bez dodatnog rashoda;
- prijatelj waiver i individualne cene u izveštajima;
- client profile finansijski sažetak koristi iste agregate.

### Van opsega

- knjigovodstvo, porezi, računi i predračuni;
- profit po pojedinačnoj usluzi;
- ravnomerno razlaganje godišnje uplate po mesecima;
- izmišljeni troškovi ako nema ulaza.

### Verifikacija

- godišnja uplata ulazi cela u mesec prijema, ali je označena kao godišnja;
- Naplaćeno po usluzi se slaže sa payment allocations;
- Očekivano nikad nije prikazano kao stvarno naplaćeno i koristi samo buduće periode;
- Profit filter nema individualne usluge, Naplaćeno/Očekivano imaju;
- fizički profit odbija izradu/refund, SaaS poznate troškove, Premium nema lažni rashod;
- `Prijatelj` izuzete stavke ne ulaze u prihod/profit;
- grafikon i sume se slažu kroz period/filter testove;
- desktop browser QA i `npm run check` prolaze.

---

## ADMIN-15 — Links, Review i Meni operativni moduli

**Izvršilac:** Codex  
**Model:** `gpt-5.6-terra`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-03, ADMIN-04, ADMIN-05, ADMIN-12

### Cilj

Smestiti postojeće domenske funkcije tri V1 usluge u prihvaćeni zajednički operativni obrazac.

### U opsegu

- zajednička tabela/filter/detail osnova;
- realni per-location status, pretplata i QR/proizvod count;
- važna aktivnost/upozorenja;
- otvori editor/javnu stranicu/klijentski panel;
- debug pristup, aktiviranje/pauziranje i slanje relevantnog naloga;
- očuvanje postojećih Links/Review/Menu editora i admin mutacija koje su dobre;
- specifični adapteri, ne kopiranje tri skoro ista sistema.

### Van opsega

- potpuni redizajn uslužnih editora;
- Venue/Memories;
- kreiranje klijenta/lokala iz jednog service modula;
- izmišljeni „Standard/Osnovni“ planovi;
- duboke napredne funkcije koje nisu potrebne za prvu školjku.

### Verifikacija

- samo Links/Review/Meni su u V1 dropdown-u;
- statusi i datumi dolaze iz nove subscriptions strukture;
- postojeći editor/public links rade;
- service activation ne menja druge usluge/lokale;
- tri modula koriste isti layout/status primitive bez gubitka specifičnih akcija;
- desktop/mobile browser QA i `npm run check` prolaze.

---

## ADMIN-16 — Podešavanja, cene i poslovna pravila

**Izvršilac:** Codex  
**Model:** `gpt-5.6-terra`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-03, ADMIN-05, ADMIN-08; ADMIN-09 za realni email status

### Cilj

Napraviti centralno mesto za pravila koja su zaista podešiva, bez pretvaranja svake konstante u komplikovanu administraciju.

### U opsegu

- sekcije Opšte, Pretplate, Plaćanja, Komunikacija, Cene i popusti, Referral;
- warning/grace 7/15 prikaz i kontrola samo ako je poslovno potvrđeno da treba runtime izmena; inače read-only potvrda konstante;
- Premium referentna cena, payment method availability;
- founders/enterprise/individual agreements i prijatelj pravila;
- email integration health;
- unsaved changes, validacija i audit.

### Van opsega

- browser notifikacije;
- HR administracija;
- provider izbor bez vlasnikove odluke;
- računovodstveni setup;
- konfigurabilnost „za svaki slučaj“.

### Verifikacija

- promena pravila utiče samo na buduće obračune, ne prepisuje istorijske snapshot-e;
- 1.490 je jasno označeno kao privremena referentna cena dok nije potvrđena;
- unavailable payment method ne može biti ponuđen klijentu;
- unsaved/invalid state se ne gubi tiho;
- audit i `npm run check` prolaze.

---

## ADMIN-17 — Dashboard integracija

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-04, ADMIN-05, ADMIN-06, ADMIN-08, ADMIN-10, ADMIN-11/12/13, ADMIN-14; ADMIN-09 za puni email inbox

### Cilj

Povezati zaključani Dashboard mockup sa stvarnim operativnim izvorima bez dupliranja i fake brojki.

### U opsegu

- header count/date i severity bar;
- Za reakciju Sve/Moje;
- Pretplate i Kartice isti kružni element;
- mali Finansije, Zadaci i Inbox blok;
- direktna navigacija ka izvoru i kontekstualno „Reši“;
- loading/empty/partial failure state po widget-u;
- real-time/reactive osvežavanje gde je primereno.

### Van opsega

- dodatne redundantne top KPI brojke;
- zatvaranje stavke samim klikom;
- „važna aktivnost celog tima“ kao neodređen blok;
- očekivano za tekući mesec;
- browser/system notifikacije.

### Verifikacija

- svaki prikazani broj može se pratiti do konkretnog query-ja i reda;
- Pretplate i Kartice su isti vizuelni tip;
- Kartice problem pokazuje stvarne QR/NFC/SMF probleme;
- Sve/Moje menja i listu i povezane relevantne counts prema definisanom ugovoru;
- widget failure ne ruši ceo dashboard;
- layout se poklapa sa locked mockupom uz tekstualne korekcije;
- desktop/mobile browser QA i `npm run check` prolaze.

---

## ADMIN-18 — Globalna pretraga, objedinjeni audit i debug pristup

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-04, ADMIN-06/07, ADMIN-08/10/11/12/13

### Cilj

Omogućiti da admin iz jednog mesta pronađe SMK/SML/SMF/SMQ, kontakt ili lokal i vidi dosledan trag odgovornosti.

### U opsegu

- global search command UI i paginirani server search;
- grupisani rezultati sa minimumom identifikacionih podataka;
- direktan odlazak u pravi klijent/lokal/proizvod/QR/porudžbinu;
- objedinjeni activity/audit read model sa actor imenima;
- klijentski debug/impersonation ulaz sa jasnim stalnim admin bannerom i serverski nametnutim admin kontekstom;
- akcije ko je poslao, primio, dostavio, evidentirao ili promenio.

### Van opsega

- praćenje login/logout/device/session;
- vremensko ograničenje debug pristupa;
- indeksiranje punog sadržaja privatnih emailova u global search bez posebne potrebe;
- proizvoljna promena podataka iz search rezultata.

### Verifikacija

- partial SMF suffix radi samo kada je klijent/lokal kontekst poznat i ne vraća pogrešan komad bez disambiguation-a;
- isti naziv lokala kod različitih vlasnika prikazuje SMK/SML razliku;
- svaki rezultat proverava admin auth;
- impersonation je vizuelno nedvosmislen i ne može se pomešati sa običnim adminom;
- audit povezuje actor i objekat bez session/device podataka;
- desktop/mobile QA i `npm run check` prolaze.

---

## ADMIN-19 — Mobile, accessibility, scale i failure hardening

**Izvršilac:** Codex  
**Model:** `gpt-6-astra`  
**Effort:** `xhigh`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-05 do ADMIN-18

### Cilj

Pre cutover-a dokazati da celina radi na realnim veličinama, sa tastaturom, mobilno i u delimičnim failure stanjima.

### U opsegu

- automated a11y gde je dostupno i ručna keyboard/focus provera;
- 500 venues/10.000 products/velika message/payment history seed test;
- query/read amplification profilisanje i uklanjanje N+1 obrazaca;
- mobile critical flows iz §13;
- loading/empty/error/retry/permission-denied/not-found;
- reduced motion, kontrast i status signal bez oslanjanja samo na boju;
- cross-module link/back/refresh state;
- bezbedni bulk i double-submit testovi.

### Van opsega

- nove funkcije;
- vizuelni redizajn već prihvaćenih ekrana;
- puna mobilna paritetnost;
- produkcioni deploy.

### Verifikacija

- `npm run check` potpuno zelen;
- relevantni integration/e2e tokovi zeleni;
- nema neograničenih list query-ja ili poznatog N+1 na glavnim ekranima;
- desktop i definisani mobilni tokovi ručno prođeni bez console error-a/overflow-a;
- error state ne gubi korisnički unos bez upozorenja;
- statusi imaju tekstualni/tap/focus ekvivalent;
- nalazi i popravljene regresije dokumentovani.

---

## ADMIN-20 — Cutover i uklanjanje odbačenog legacy admin UI-ja

**Izvršilac:** Codex  
**Model:** `gpt-5.6-sol`  
**Effort:** `high`  
**Mode:** `Goal`  
**Zavisnosti:** ADMIN-19 i vlasnikov vizuelni pregled ključnih ekrana

### Cilj

Učiniti novi admin jedinim aktivnim V1 admin tokom, uz uklanjanje samo onoga što je dokazano zamenjeno ili odbačeno.

### U opsegu

- finalne rute/redirecti;
- uklanjanje starog admin shell-a i UI komponenti koje više nemaju caller;
- uklanjanje legacy adaptera tek kada test potvrdi da više nisu potrebni;
- očuvanje Venue/Memories domenskog koda za POSLE V1;
- dead-link, bundle i i18n provera;
- finalni smoke tok svih modula;
- dokumentovan rollback/cutover korak.

### Van opsega

- brisanje baze/test podataka bez eksplicitnog odobrenja;
- uklanjanje javnih/client funkcija samo zato što njihov stari admin UI nestaje;
- dodavanje novih feature-a;
- produkcioni deploy bez posebnog naloga.

### Verifikacija

- `/admin` otvara Dashboard;
- sve nove nav rute rade i stare relevantne rute bezbedno redirectuju ili su eksplicitno uklonjene;
- nema dva aktivna admin interfejsa za isti tok;
- klasifikaciona tabela iz §3 je stavku po stavku označena kao ostvarena;
- Links/Review/Meni i klijentski panel nisu regresirali;
- Venue/Memories domenski kod nije slučajno obrisan;
- full `npm run check`, desktop/mobile smoke i console provera zeleni;
- rollback instrukcija je proverljiva.

---

## 19. Mapa zatečenog backenda za implementere

Ovaj odeljak je read-only presek trenutnog koda. Namenjen je da spreči ponovno izmišljanje već dobrih funkcija i da istovremeno spreči pogrešno proglašavanje trenutnog modela ciljnim.

### 19.1 Admin pristup

`convex/lib/access.ts` trenutno pruža:

- `requireAdmin` preko auth korisnika i `SCANME_ADMIN_EMAILS`;
- admin bypass za pristup klijentskim lokalima;
- `requireBusinessAccess` za admina ili aktivno članstvo;
- service editor access sa proverom članstva i `clientEditingEnabled`.

**Zadržati:** serverski gate i admin debug mogućnost.  
**Redizajnirati:** client membership je sada samo `viewer` po lokalu i ne može izraziti ciljne account uloge/dozvole.

### 19.2 Klijenti i lokali

`convex/admin.ts` trenutno ima javne admin query/mutation funkcije:

- `me`, `listBusinesses`, `createBusiness`;
- `getBusinessMetrics`;
- promene destinacije, imena, sluga i active/archive stanja;
- resend/revoke invitation;
- add/update/delete/replace contact;
- approve activation;
- `customers`, `location`, `setServiceProfileActive`.

Sve relevantne funkcije koriste `requireAdmin`, što je dobra osnova. `customers` već pokušava grupisanje account-a i lokala, ali:

- ima legacy account-less put;
- koristi ograničene `take` vrednosti umesto pune paginacije;
- izvodi dodatne query-je po redu;
- kontakt dolazi iz lokala;
- ne poseduje ciljni action/read model.

**Odluka:** sačuvati validaciju i domenske radnje koje i dalje imaju smisla; redizajnirati query shape i vlasništvo podataka.

### 19.3 Kartice/QR

`convex/cardsAdmin.ts` trenutno ima:

- `createCard`;
- `createCardBatch` do 50 komada;
- `retargetCard` uz novu nepromenljivu `cardTargets` istoriju;
- `disableCard`;
- `listBusinessCards`;
- `listCardTargetOptions`.

Postojeći resolver i validation dele ista pravila sa admin mutacijama. Audit se piše za promene, a no-op ne piše lažan događaj.

**Zadržati:** generator javnog resolver koda, target validation, immutable target history, batch princip, scan events i audit.  
**Proširiti/redizajnirati:** individualni SMF inventar, NFC, kanal health/status, pozicije, dizajn, porudžbine i venue-first paginaciju.

### 19.4 Naplata

`convex/billing.ts` trenutno ima:

- `recordManualPayment`;
- interni `applyProviderPayment` adapter seam;
- `voidPayment`;
- `setNextBillingAt`;
- `listPayments`, `listAuditLog`, `billingOverview`;
- interni dnevni `sweepBillingCycles`.

Dobre osobine:

- uplata je istorijski red, ne samo `lastPaid` polje;
- storno ne briše red;
- provider seam je odvojen;
- audit postoji;
- calendar period advance je testabilan.

Neodgovarajuće za cilj:

- uplata pomera `accounts.planValidUntil`;
- status/grace se računaju na celom nalogu;
- services se tretiraju kao deo jednog recurring računa;
- globalno upozorenje/grace je 14 dana;
- `billingOverview` radi više per-account/per-business query-ja i ograničava se na 200 naloga.

**Odluka:** sačuvati append-only, provider-neutral, audit i calendar principe; zameniti account-cycle model `subscriptions + paymentAllocations` modelom.

### 19.5 Porudžbine i cene

Schema već ima:

- `orders` sa immutable `priceSnapshot`;
- `orderItems` za service i physical linije;
- `boundServices` i splitter provisioning seam;
- `payments` vezane za opcioni order;
- `entitlements` za capability pristup.

**Zadržati:** snapshot cene, odvajanje linija, idempotent provisioning ideju i entitlement granicu.  
**Redizajnirati:** operativne faze, individualne physicalProducts zapise, payment allocations i nezavisne subscription targete.

### 19.6 Email i spoljne ivice

Postoje Resend actions za:

- pozivnicu klijentskom kontaktu;
- obaveštenje o activation request-u;
- pojedine Meni upite.

`convex/http.ts` trenutno registruje auth HTTP rute, ali nema potvrđen inbound business-email webhook niti payment-provider webhook. `convex/convex.config.ts` ima Resend/outbound env vrednosti.

**Zadržati:** postojeći bezbedni outbound seam gde odgovara.  
**Nedostaje:** izbor i implementacija punog inbound/sync mailbox adaptera iz ADMIN-09.

### 19.7 Cron/scheduled rad

Postoje cron-ovi za entitlement expiry, Venue/Memories održavanje, ordering i jedan account-level billing sweep.

**Zadržati:** batch, idempotent, resumable obrazac.  
**Zameniti:** account billing sweep nezavisnim subscription lifecycle sweep-om.  
**Ne dirati:** Venue/Memories/ordering cron-ove u admin V1 taskovima osim ako test dokaže direktnu neophodnost.

### 19.8 UI koji se ne sme slučajno prepisati

- ScanMe Links editor i njegov javni render nisu cilj redizajna admin školjke.
- Meni editor/public render i postojeća analitika nisu cilj redizajna osim ulaznih admin linkova/read modela.
- Venue/Memories javne i klijentske funkcije nisu „legacy admin“ samo zato što njihovi admin tabovi nisu u V1.
- Postojeći resolver `/r/[cardCode]` i scan istorija moraju preživeti migraciju.

---

## 20. Šta mora biti odlučeno pre implementacije

### Može odmah da počne

ADMIN-00 do ADMIN-08, ADMIN-10 do ADMIN-13 i ADMIN-15 mogu početi iz ovog dokumenta, uz poštovanje zavisnosti. Nema preostale velike UI/UX odluke koja blokira temelj, client model, subscription model, novu školjku ili venue-first Products tok.

### Mora pre tačno određenog taska

| Odluka/ulaz | Potrebno pre | Zašto |
|---|---|---|
| Bezbedan git checkpoint trenutnog dirty worktree-a | ADMIN-00 završetak | omogućava rollback bez odbacivanja vlasnikovog rada |
| Provider i inbound način zajedničkog poslovnog mailbox-a | ADMIN-09 | bez njega se ne može dokazati realan unread/inbound/threading |
| Payment provider i dostupnost kartičnog plaćanja | konkretan provider adapter posle ADMIN-03 | core model radi provider-neutral i ne mora čekati |
| Stvarni direktni troškovi hostinga/backenda/štampe | ADMIN-14 konačne Profit brojke | bez njih UI mora prikazati „nije uneto“, ne lažnu nulu |
| Vizuelni pregled repo-native Klijenti/Profile fixture-a | pre finalnog merge-a ADMIN-06/07 | PNG nije sačuvan, tekstualni ugovor jeste; vlasnik proverava izgled, ne ponovo poslovni model |
| Vlasnikov vizuelni pregled ključnih novih ekrana | ADMIN-20 | cutover uklanja stari UI tek posle pregleda |

### Ne mora biti odlučeno pre temelja

- konačna Premium cena;
- referral procenat i trajanje;
- founders cena doživotno ili vremenski;
- konkretni enterprise ugovori;
- konačan SM kod padding;
- računi/predračuni;
- browser notifikacije;
- Venue/Memories novi admin.

Za ove stavke postoje privremene vrednosti ili ekstenzione tačke. Implementer ih ne sme sam „zaključati“ kroz rasute konstante ili nepovratnu schemu.

---

## 21. Globalni Definition of Done

Nijedan pojedinačni zeleni ekran ne znači da je ceo admin završen. V1 je spreman za cutover tek kada su ispunjeni svi sledeći uslovi.

### Funkcionalno

- Dashboard koristi realne, deduplikovane action items.
- Klijenti i profil koriste SMK account model i default kontakt.
- Premium + per-venue/per-service pretplate i parcijalne/objedinjene uplate rade.
- Inbox/chat/task/order/product/QR tokovi čuvaju actor i istoriju.
- Products venue-first tok radi u tabeli i vizuelno, sa bulk sidebar-om.
- QR/NFC status i retarget rade iz Products modula za SMF-linked kanale.
- Finansijske sume slede zaključane formule.
- Links/Review/Meni postojeće ključne funkcije nisu regresirale.

### Podaci i bezbednost

- Nema trajnog account-less klijentskog puta.
- Ljudski kodovi su jedinstveni; interne veze ne parsiraju te kodove.
- Sve velike liste su indeksirane i paginirane.
- Authz negativni testovi pokrivaju tuđi account/venue/object.
- Uplate i target istorija nisu destruktivno prepisane.
- Rizične radnje imaju audit i propisani razlog.
- Nema login/device/session employee praćenja.

### UX

- Pun top navbar je dosledan na svim admin ekranima.
- Klijenti nema desktop horizontalni scroll.
- Statusi su vizuelno brzi i dostupno objašnjeni.
- Product kartice su kompaktne, jednake i nisu galerija.
- Thin summary pill je dosledan.
- Mobilni kritični tokovi iz §13 rade.
- Loading, empty, error, retry i permission-denied stanja postoje.

### Verifikacija

- svaki ADMIN-00…ADMIN-20 ima završni verification report;
- `npm run check` je zelen na cutover commit-u;
- desktop i mobile browser smoke je dokumentovan;
- 500 venues/10.000 products scale fixture prolazi;
- nema console error-a u ključnim tokovima;
- klasifikaciona tabela iz §3 je zatvorena stavku po stavku;
- rollback je dokumentovan;
- produkcioni deploy ostaje zasebno eksplicitno odobrena radnja.

---

## 22. Matrica sledljivosti zahteva

| Zahtev iz autoritativnog naloga | Dokaz u ovom dokumentu | Implementacioni dokaz |
|---|---|---|
| Analiza postojećeg admina i backenda | §2, §3, §19 | ADMIN-00/01 report |
| Zadržati/spojiti/redizajnirati/odbaciti | §3 | ADMIN-20 stavka-po-stavka audit |
| Potpuna paritetnost nije cilj | §0.3, §3 | cutover uklanja samo klasifikovano |
| ZAKLJUČANO | §1, §4–§9, §15.1 | task acceptance kriterijumi |
| PRIVREMENO | §6, §8.5, §9.12, §15.2 | centralizovane podesive vrednosti |
| POSLE V1 | §15.3 | ADMIN-20 potvrđuje da nije slučajno uvučeno/obrisano |
| Model podataka | §7 | ADMIN-01–03, 08, 10–12 |
| Statusi i prelazi | §8, §10 | unit/integration state-machine testovi |
| Navigacija | §4 | ADMIN-05 browser QA |
| Indeks mockupova | §14 | ADMIN-05/13/14/15/17 visual QA |
| Kontrolisani zadaci | §18 | zaseban Codex task/report po ID-ju |
| Zavisnosti | §17 i svaki task | redosled merge-ova |
| Granice | `U opsegu` / `Van opsega` svakog taska | diff audit u završnom reportu |
| Kriterijumi verifikacije | `Verifikacija` svakog taska + §21 | test/check/browser dokazi |
| Model/effort/mode po promptu | §16.2 i svaki task | task se otvara sa navedenim podešavanjem |

---

## 23. Pravilo izmene ovog dokumenta

Kada vlasnik kasnije promeni odluku:

1. promeniti relevantni glavni odeljak;
2. ažurirati §15 klasifikaciju;
3. ažurirati pogođene taskove i zavisnosti;
4. zabeležiti kratku odluku ispod ovog odeljka sa datumom;
5. ne ostavljati dve kontradiktorne „autoritativne“ verzije u istom fajlu.

### Evidencija izmena

- **10.09.2026.** — inicijalni autoritativni V1 dokument, zasnovan na pregledu repozitorijuma, zaključanim mockupovima i vlasnikovim odlukama iz admin radionice.
