# Auto Moto Fest 2026: preporuke iz podataka

Za aplikaciju posetilaca na Auto Moto Festu (30. 10.–1. 11. 2026, Hala Čair, Niš). Napisano 12. 10. 2026, u koraku X7 lanca ADMIN v2.

**Izvori:**
- zbirni brojevi Sajma elektromobilnosti (9–11. 10. 2026) iz admin Analitike; privatni uzorak je `tmp/admin-v2-2026-10-11/PODACI-SAJAM-2026.md` i nije u repou;
- nova Analitika u adminu (`/admin/dogadjaji/<događaj>/analitika`; opis u `docs/admin/v2/X3.md`);
- kod javnog sajma, samo čitan (`app/r/**`, `components/fair/**`, `convex/fair*.ts`, `lib/fair-*.ts`).

**Šta ovde nije:** repo je javan, pa nema nijednog broja po izlagaču, modelu ili štandu. Piše „vodeći štand“, „jedan model“. Brojevi su zbirovi celog sajma ili su iz njih izvedeni.

**Šta nije provereno:** stanje produkcije. Lanac ne čita tajne ni produkcijska podešavanja, pa je sve o prekidačima na produkciji zaključak iz dokumenata i koda, označen kao takav.

## 0. Polazna tačka

| Šta | Ceo sajam (3 dana) |
|---|---|
| Skenovi | 460 |
| Jedinstveni posetioci | 310 |
| Skenova po posetiocu | 1,48 |
| Modela po posetiocu | 1,39 |
| Leadovi (Zainteresovan, Probna vožnja) | **0** |
| Pečati | 210 |
| Završeni pasoši | 5 |
| Glas publike | 3 glasa |
| Ankete | 2 popunjene |
| Deljenja kolekcija | 0 |
| Skenovi sa telefona | 99,6 % |
| Po danu | petak 104, subota 177, nedelja 179 |
| Najjači sat | 39 skenova |

Dve stvari izvedene iz zbirova:
- **Najmanje 61 % posetilaca je skeniralo tačno jedan model.** 310 posetilaca je napravilo 431 par posetilac–model; i da su svi ostali skenirali samo po dva, 189 njih je stalo na jednom.
- **Manje od 8 % posetilaca je uradilo išta osim skena.** Glasova, ocena, anketa i leadova je zajedno bilo manje od 25, na 310 posetilaca.

Sken radi. Sve posle skena ne radi. To je tema ovog dokumenta.

## 1. Nula leadova za tri dana

### Zašto, po verovatnoći

**1. Tok najverovatnije nije bio uključen na produkciji.** Ovo proveriti prvo.
- Lead tok ima serverski prekidač: radi samo kad je `FAIR_LEADS_ENABLED` tačno `"true"` (`convex/lib/fairLeads.ts`). `PROD-GO-CHECKLIST.md` (§2) za puštanje pred sajam kaže za taj prekidač i za `FAIR_FOLLOWUP_ENABLED`: „Ne postavljati danas (leadovi isključeni)“.
- Uz prekidač, forma traži aktivnu saglasnost za događaj i vrstu leada (`fairConsentConfigs`) i uključen lead po modelu (`fairLeadConfigs.enabled`). Tekst saglasnosti je čekao pravnu proveru (`docs/tasks/BLOCKED.md`, P3).
- Šta je posetilac tada video zavisi od podešavanja po modelu (`convex/fairPublic.ts`):
  - lead po modelu nije uključen: dugmeta nema;
  - lead po modelu jeste uključen, a prekidač ili saglasnost nisu: dugme se vidi, a sheet kaže „Trenutno nedostupno“ (`components/fair/lead-sheet.tsx`). Posetilac koji je hteo da ostavi kontakt dobio je odbijenicu.
- Admin Pregled je poslednjeg dana sajma imao stavku „Follow-up posle sajma je isključen“, što se slaže sa ovim.
- Ako je ovo tačno, nula nije ponašanje posetilaca nego podešavanje. Tada sajam ne kaže ništa o tome da li forma radi.

**2. Doseg: većina kataloga nije ni imala lead dugme.**
- „Zainteresovan“ traži Starter ili Napredni paket, „Probna vožnja“ samo Napredni (`lib/fair-entitlements.ts`). Na ovom sajmu je 11 od 15 modela bilo na besplatnom paketu.
- I sa uključenim tokom, lead je mogao da nastane samo na četiri modela.

**3. Tok: dugme je duboko i ne kaže šta posetilac dobija.**
- Redosled na stranici modela (`components/fair/fair-model-page.tsx`): fotografija i cena, traka „Nov pečat“, specifikacije, pa blok akcija (Glas publike, ocena, lead dugmad), pa „Sačuvaj u garažu“.
- Lead dugmad su treća u svom bloku, dva jednaka dugmeta, bez isticanja jednog. Nisu zalepljena za dno ekrana.
- Nigde ne piše šta sledi: ko se javlja, kada i sa čim.

**4. Forma: tri odluke pre slanja.** Ime, kontakt i izričito „Prihvatam“ na saglasnost, u sheet-u preko celog ekrana. To je razumno za pravni okvir, ali je za posetioca koji stoji pored auta najskuplji trenutak u aplikaciji.

**5. Podsticaj: ne postoji.** Posle slanja idu toast i mejl potvrde. Posetilac nema razlog da kontakt ostavi telefonu umesto čoveku na štandu.

### Predlog toka na stranici modela

**Pre sajma (uslov za sve ostalo)**
1. Uključiti tok na produkciji i objaviti saglasnost za AMF (odluka vlasnika i pravna provera teksta).
2. Uključiti lead po modelu za svaki plaćeni model.
3. **Probni lead na produkciji pre otvaranja**, sa telefona, od skena do reda u adminu (Događaji → Leadovi) i do mejla potvrde. Bez toga se sajam ne otvara.
4. Dugme se ne prikazuje dok tok nije otvoren. „Trenutno nedostupno“ posetilac ne sme da vidi.

**Na stranici**
1. **Jedna primarna akcija, zalepljena za dno ekrana.** Na Naprednom „Zakaži probnu vožnju“, na Starteru „Pošalji mi ponudu“. Druga akcija je sekundarna, u istoj traci. Traka je vidljiva bez skrola, mete su najmanje 48 px, iznad bezbedne zone telefona.
2. **Obećanje uz dugme, jedna rečenica:** šta dobijam i kada („Izlagač ti se javlja u roku od 24 h“). Rok daje izlagač; bez njegove potvrde rečenica ostaje bez roka.
3. **Forma u dva polja:** ime i jedno polje „Telefon ili e-mail“ (podešavanje `one_of` već postoji). Saglasnost je jedan jasan red, a dugme za slanje je ujedno potvrda. Tekst i oblik saglasnosti menja samo pravna provera.
4. **Drugi lead je jedan dodir.** „Zapamti moj kontakt na ovom telefonu“ već postoji; ponuditi ga kao podrazumevano uključeno, ako pravna provera dozvoli.
5. **Ponuditi u trenutku interesa**, ne samo na dnu strane:
   - posle ocene 4 ili više;
   - posle „Sačuvaj u garažu“;
   - u garaži, uz sačuvan model („Zatraži ponudu“);
   - na poslednjem koraku ankete (već postoji).
6. **Potvrda kaže šta sledi** i nudi sledeći model sa istog štanda (§2).

**Merenje.** Sada se beleži samo poslat lead, pa admin levak vidi nulu, ali ne i gde se gubi. Trebaju tri događaja: dugme prikazano, sheet otvoren, lead poslat. To je izmena backenda (Aleksa).

**Otvorena pitanja (tuđe odluke):**
- pravni tekst i oblik saglasnosti, i da li kontakt sme da bude zapamćen podrazumevano;
- rok u kome se izlagač javlja;
- da li modeli na besplatnom paketu dobijaju neku vrstu „Zainteresovan“ (kome ide kontakt i ko ga plaća).

## 2. 1,48 skena po posetiocu

Posetilac skenira jedan auto, pogleda stranicu i ode. Stranica modela mu danas ne nudi sledeći korak: nema „još na ovom štandu“, nema mape, nema preporuke (`components/fair/fair-model-page.tsx`). Javna mapa je ugašena (`FAIR_PUBLIC_MAP_ENABLED = false` u `lib/fair-contract.ts`), jer je sajam imao samo nekoliko štandova.

**Kako podstaći drugi sken**

| Poluga | Šta | Gde danas |
|---|---|---|
| **Pasoš** | Odmah posle skena: „1 od 3 · još 2 modela ovog brenda“, sa nazivima i mestom na štandu. Pasoš je najjači razlog za drugi sken, jer je cilj blizu. | Traka „Nov pečat“ postoji, ali ne kaže šta je sledeće |
| **Štand** | Blok „Još na ovom štandu“ na stranici modela: ostali modeli istog izlagača, sa oznakom skeniranih. | Ne postoji |
| **Garaža** | Posle „Sačuvaj“: „Uporedi sa…“. Poređenje traži dva modela, pa samo po sebi traži drugi sken. | Poređenje postoji u garaži, ali se ne nudi sa stranice modela |
| **Mapa** | Uključiti javnu mapu za AMF (više štandova, hala i prostor ispred). Na mapi označiti posećene štandove i „Gde je gužva“. | Kod postoji, javno ugašen; geometrija AMF-a je nacrt (`lib/fair-map/auto-moto-fest-2026.ts`) |
| **Ulaz** | QR na ulazu koji otvara mapu i objašnjava pasoš, pre prvog skena. | Predviđen uz mapu |

**Redosled po vrednosti i trošku:** „Još na ovom štandu“ i sledeći korak pasoša su male izmene jedne stranice. Mapa traži potvrđenu geometriju i odluku. Garaža je već tu, fali joj ulaz.

**Šta ne raditi:** ne slati posetioca na drugu stranicu pre nego što vidi auto koji je skenirao. Sledeći korak ide posle prvog ekrana.

## 3. Pasoš: 5 završenih na 210 pečata

**Kako danas radi** (`convex/lib/fairScans.ts`, `lib/fair-entitlements.ts`, `convex/lib/fairInteractions.ts`):
- Pečat nastaje **sam**, pri skenu. 210 pečata nije 210 odluka posetilaca.
- Pasoš je **po brendu**, i postoji samo za brend sa najmanje dva modela, svi na Starter ili Naprednom paketu, svi kod jednog izlagača. Model na besplatnom paketu ne daje pečat.
- Završen je kad posetilac skenira **sve** modele brenda.
- Nagrada je animacija, izbor omiljenog modela i prikaz glasova (od pet glasova naviše). Fizičke nagrade nema.
- Na stranici pasoša svaki pečat se „otključava“ držanjem prsta 1,3 s.
- Pasoš se ne vidi u garaži. Mapa je ugašena.

Uz 1,39 modela po posetiocu, pasoš koji traži sve modele brenda završava malo ko, po konstrukciji. Udeo od 2,4 % po pečatu zato nije mera; admin meri ljude prema ljudima (posetioci sa pečatom → završeni pasoši, deo „Pasoš“ u Analitici).

**Šta promeniti u nagradi**
1. **Nagrada mora da postoji van telefona** i da se dobija odmah, na štandu: ekran „Pokaži ovo na štandu“ posle završenog pasoša. Šta se dobija odlučuje izlagač (poklon, prioritet za probnu vožnju, popust).
2. **Međunagrada na pola puta.** Prvi pečat daje napredak, a već drugi nešto otključava (na primer poređenje ta dva modela ili glas za omiljeni).
3. Nagradna igra sa izvlačenjem je pravno pitanje (pravila, prijava) i odluka organizatora; ovde se ne predlaže kao gotova stvar.

**Šta promeniti u toku**
1. **Sledeći korak posle svakog pečata** („još 2“, sa nazivima), na stranici modela, bez odlaska na stranicu pasoša.
2. **Manji prag.** Pasoš brenda sa mnogo modela završava se sa N od M (na primer 3), ne sa svima.
3. **Sajamski pasoš pored pasoša brenda:** pečat po štandu, koji daje svaki sken, i na besplatnom paketu. Tako svaki posetilac ima pasoš od prvog skena, a cilj je obilazak hale. To je izmena pravila i backenda (odluka vlasnika i Alekse).
4. **Bez držanja 1,3 s kao uslova.** Otključavanje može da ostane kao trenutak, ali napredak se vidi i bez njega.
5. **Pasoš u garaži i na mapi**, da se napredak vidi tamo gde posetilac već jeste.

## 4. Glas publike (3 glasa) i ocene

**Zašto je glasova tri**
- Ulaz je kartica „Glas publike · pitanje dana“ u bloku akcija, ispod specifikacija; glasa se na **posebnoj stranici**.
- Postoji samo na plaćenim paketima i samo ako je admin **tog dana objavio pitanje**. Bez pitanja nema ni kartice.
- Rezultat je javan tek od pet glasova (`FAIR_PUBLIC_VOTE_THRESHOLD`). Sa tri glasa za ceo sajam niko nije video rezultat, pa glas nije dao ništa nazad.

**Predlog**
1. **Glas na samoj stranici modela, jedan dodir**, bez odlaska na drugu stranicu.
2. **Trenutak:** odmah posle prvog ekrana, pre specifikacija. To je najlakša radnja u aplikaciji i treba da bude prva.
3. **Povratna informacija odmah:** „Tvoj glas je zabeležen. Rezultat se vidi posle još N glasova.“ Prag od pet ostaje, ali se vidi koliko fali.
4. **Pitanje dana je misija u adminu:** pre otvaranja svakog dana Pregled događaja pokazuje „Pitanje dana nije objavljeno“ kao hitno. Pitanja za sva tri dana pripremiti unapred.

**Ocene** (manje od dvadeset za ceo sajam)
- Starter ima jedan red zvezdica na stranici; Napredni otvara sheet sa tri ocene. Besplatan paket nema ocenu.
- **Predlog:** jedna ocena na stranici za sve plaćene modele, a tri dimenzije kao drugi, opcioni korak. Ocena 4 ili više nudi lead (§1).

**Ankete** (2 popunjene): oblačić se pojavi 0,9 s posle učitavanja, pre nego što je posetilac išta video. Ponuditi je posle ocene ili glasa, kad je već nešto uradio.

**Red radnji na stranici modela, od najlakše ka najtežoj:** glas (jedan dodir) → ocena (jedan dodir) → garaža → lead (forma). Danas je lead u istom bloku sa prve dve, bez ijednog koraka pre njega.

## 5. Vikend i sati gužve

- Subota i nedelja su imale po oko 1,7× više skenova nego petak, i međusobno su skoro iste (177 i 179).
- Najjači sat je imao 39 skenova: oko jedan sken na minut i po, na sajmu od 310 posetilaca.
- AMF pada na iste dane u nedelji (petak, subota, nedelja) i očekuje se mnogo više ljudi.

**Za osoblje na štandovima**
- **Petak je proba.** Tog dana proveriti svaki QR, svaku stranicu modela i jedan pravi lead po izlagaču. Greška nađena u petak ne košta vikend.
- **Vikend traži više ljudi u jakim satima.** Koji su to sati vidi se u Analitici, deo „Dan i sat“, već u subotu u podne; nedelju planirati po suboti.
- **Čovek na štandu je deo toka.** Posetilac koji je skenirao stoji pored auta sa otvorenom stranicom. Osoblje treba da zna šta je na toj stranici i da kaže jednu rečenicu: „Ostavite kontakt tu, zovemo vas sutra.“ To je jedini podsticaj koji danas postoji.
- **Dnevni izveštaj odobriti isto veče.** Izlagač na plaćenom paketu dobija izveštaj tek kad ga tim odobri (poslednjeg dana Elektromobilnosti četiri su čekala odobrenje). Izveštaj koji stigne u subotu uveče menja nedelju; onaj koji stigne posle sajma ne menja ništa.

**Za uživo HUD u adminu** (`components/admin/frame/admin-hud.tsx`, `docs/admin/v2/X4.md`)
- HUD „Danas“ je na dnu sidebara na svakoj stranici dok sajam traje: dan, traka dana, „Uživo“, skenovi danas. Na telefonu je u fioci, a traka „Uživo“ je na Pregledu događaja.
- **Jedna osoba iz tima prati admin tokom sajma**, na telefonu. Gleda tri stvari: da je HUD „Uživo“ (ne „Podatak od …“), da leadovi nisu na nuli, i „Šta treba da uradim“ na Pregledu.
- „Rekord sata“ i „Najjači štand dana“ stižu kao toast; tihi režim ih gasi.
- **Predlog za HUD, nije napravljeno:**
  - uz „Skenovi danas“ i „Leadovi danas“, jer je to broj koji je ovog puta bio nula tri dana;
  - upozorenje kad u radno vreme 15 minuta nema nijednog skena (pao je internet u hali, ili stranica);
  - upozorenje „Nijedan lead“ posle prvih 50 posetilaca dana.

## 6. Paketi: šta korelacija znači za prodaju

**Šta podaci kažu:** modeli na Naprednom paketu su imali višestruko više skenova po modelu nego modeli na besplatnom (iznad praga od 2× iz pravila Uvida).

**Šta ne kažu:** da paket donosi skenove.
- **Uzorak je premali.** Plaćene pakete je imalo premalo izlagača i samo 4 od 15 modela, pa to nije prosek paketa nego nekoliko štandova.
- **Paket skoro da nema put do skena.** Sken nastaje samo skeniranjem nalepnice na štandu, a nalepnica je ista na svakom paketu. Paket bi mogao da dovede ljude do štanda jedino preko sponzorisane preporuke (mapa i garaža), a javna mapa je bila ugašena.
- Razliku jednako objašnjavaju mesto štanda, brend, broj ljudi na štandu i sam auto. Izlagač koji ozbiljnije ulaže u sajam verovatnije kupuje i veći paket.
- Zato Analitika uz ovaj broj uvek piše „korelacija, ne uzrok“, a paket sa jednim modelom nosi „samo 1 model, nije prosek“.

**Šta se izlagaču pošteno može reći**
- **Paket ne prodaje skenove, nego ono što se desi posle skena:** lead dugmad, ocene, Glas publike, anketu, pasoš, dnevni izveštaj, follow-up posle sajma.
- **Na ovom sajmu ti ishodi još nisu dokazani:** nula leadova, tri glasa, dve ankete. Obećanje „dobićete leadove“ danas nema pokriće u podacima.
- Dokazano je sledeće: nalepnica se skenira (460 skenova, 310 ljudi, skoro sve sa telefona), i zna se koliko ljudi je gledalo koji model, kog dana i u koji sat. Besplatan paket po katalogu prava dobija zbir skenova štanda, a analitiku po modelu i dnevni izveštaj Starter i Napredni (`lib/fair-entitlements.ts`).
- **Predlog za AMF:** prodavati veći paket uz konkretan, proveren tok (lead radi, probni lead poslat pre otvaranja) i posle sajma pokazati izlagaču njegov levak. Tek sa AMF-a, sa više izlagača po paketu, može se reći nešto o razlici paketa.

## 7. Metrike za praćenje uživo

Polazna vrednost je Sajam elektromobilnosti. **Ciljevi su predlog tima za AMF, ne prognoza**; služe da se u subotu uveče zna da li nešto treba menjati.

| Metrika | Gde u adminu | Elektromobilnost | Cilj za AMF | Reaguj kad |
|---|---|---|---|---|
| Leadovi | Analitika → Brojevi, Levak | 0 | prvi lead u prvom satu petka; 3–5 % posetilaca do kraja sajma | nijedan posle prvih 50 posetilaca dana |
| Posetioci → angažovani | Analitika → Levak | ispod 8 % | 25 % | ispod 10 % u subotu u podne |
| Modela po posetiocu | Analitika → Dubina | 1,39 | 2,0 | ispod 1,5 na kraju petka |
| Posetioci sa jednim modelom | Analitika → Dubina, Uvidi | najmanje 61 % | ispod 50 % | iznad 60 % |
| Završeni pasoši (ljudi sa pečatom koji su završili) | Analitika → Pasoš | 5 ljudi | 15 % | ispod 5 % (pravilo Uvida) |
| Glas publike | Analitika → Brojevi | 3 glasa | 10 % posetilaca | pitanje dana nije objavljeno do otvaranja |
| Ocene | Rang modela, detalj modela | ispod 20 | 15 % posetilaca | — |
| Deljenja kolekcija | Analitika → Brojevi | 0 | bar jedno dnevno | — |
| Skenovi po satu | Analitika → Dan i sat, Rekord sata | najviše 39 | prati se, nema cilja | 15 minuta bez skena u radno vreme |
| Udeo vodećeg štanda | Uvidi, Rang štandova | visok | prati se | jedan štand nosi većinu: proveriti QR na ostalima |
| Stanje podataka | HUD „Danas“ | — | „Uživo“ | „Podatak od …“ duže od 3 minuta |
| Granice čitanja | napomena uz grafikon | nije dostignuta | nije dostignuta | napomena o ograničenom čitanju (§8) |

Leadovi i angažovani se računaju prema posetiocima modela koji tu radnju imaju. Dok većina kataloga nema lead dugme, udeo prema svim posetiocima potcenjuje tok.

## 8. Za backend pre AMF-a (Aleksa)

Lanac ADMIN v2 nije menjao postojeće upite. Ovo su nalazi koji postaju problem na većem sajmu:

1. **`getEventAnalytics` i granica od 4.096 opsega indeksa po upitu.** Na TEST podacima u obliku Elektromobilnosti (4 štanda, 3 dana) čita 1.090 opsega; serija po satu raste kao štandovi × dani × sati × 2. Sa 40 štandova samo sati bi bili oko 3.800. Predlog: sate čitati po danu na zahtev, ili iz brojača po događaju. **Pre AMF-a pustiti test sa TEST podacima u obliku AMF-a** (uzor: `convex/fairEventAnalyticsV2.test.ts`, „cost on a fair-shaped data set“).
2. **Granice čitanja nisu slučajan uzorak.** `getEventEngagement` čita do 5.000 redova jedinstvenih skenova, do 2.500 pečata i do 1.500 skenova za uređaje. Elektromobilnost je imala 431 red; AMF sa deset puta više posetilaca dolazi do granice. Posle granice dubina i angažovani važe samo za prve modele po redu, pa su pristrasni. Ekran to kaže napomenom, ali broj tada ne treba čitati kao tačan. Predlog: brojati pri upisu.
3. **Levak leada nema korake** (§1): fale događaji „dugme prikazano“ i „sheet otvoren“.
4. **Garaža nema brojač na serveru** (čuva se samo na telefonu), pa „sačuvano u garažu“ ne može u levak ni u detalj modela.
5. **„Skenovi danas“ dolaze iz dva upita** (HUD i Pregled iz `getEventDashboard`, Analitika iz `getEventAnalytics`). Ako ne broje isto, brojevi će se razlikovati na ekranu.
6. **Dva nova admin upita** (`getEventEngagement`, `getModelAnalytics`; samo čitanje) su opisana u `docs/admin/v2/X3.md`, odeljak 7. Prenos u `FRONTEND-DELTA-<datum>.md` čeka, jer lanac taj fajl nije smeo da piše.
7. **Beogradsko vreme:** AMF je posle prelaska na zimsko računanje (25. 10.). Dan i sat u analitici su pokriveni testom za oba računanja i za noć promene (`convex/lib/fairEventAnalytics.test.ts`).

## 9. Kontrolna lista pre AMF-a

**Odluke (vlasnik), najkasnije nedelju dana pre**
- [ ] Leadovi se uključuju za AMF: da ili ne. Ako da, tekst saglasnosti je pravno proveren.
- [ ] Follow-up posle sajma: da ili ne.
- [ ] Javna mapa: da ili ne. Ako da, geometrija je potvrđena prema planu organizatora.
- [ ] Nagrada pasoša: šta izlagač daje i kako se preuzima.
- [ ] Šta se od §1–§4 pravi pre AMF-a, a šta posle.

**Podešavanje (tim), tri dana pre**
- [ ] Katalog AMF-a uvezen; svaki model ima cenu, fotografiju i paket.
- [ ] Svaka nalepnica je povezana i proverena skenom sa telefona.
- [ ] Lead je uključen po modelu za svaki plaćeni model; saglasnost za AMF je aktivna.
- [ ] Pitanja Glasa publike su pripremljena za sva tri dana.
- [ ] Pasoši su objavljeni; skup modela svakog pasoša je proveren pre otvaranja.
- [ ] Tekst follow-up mejla po izlagaču je napisan i odobren.
- [ ] „Šta treba da uradim“ na Pregledu događaja nema hitnih stavki.

**Provera na produkciji, dan pre**
- [ ] **Probni lead** od skena do reda u adminu i mejla potvrde, za obe vrste. Probni lead ne sme da ostane u brojevima sajma (admin test podaci se isključuju, `JOVAN-DELTA-2026-10-09.md`).
- [ ] Jedan glas, jedna ocena, jedna anketa, jedan pečat i jedan završen pasoš, sa pravog telefona.
- [ ] Analitika se otvara bez greške sa katalogom AMF-a (§8, tačka 1).
- [ ] HUD „Danas“ se pojavljuje kad se dan otvori i piše „Uživo“.
- [ ] Brojevi pre otvaranja ne ulaze u analitiku (granica analitike je postavljena na otvaranje hale).

**Ljudi**
- [ ] Osoblje svakog izlagača zna šta posetilac vidi posle skena i šta da mu kaže.
- [ ] Jedna osoba iz tima prati admin na telefonu sva tri dana; zna prečice i gde je Levak.
- [ ] Dogovoreno je ko i kako reaguje kad HUD nije „Uživo“ ili kad nema skenova.

**Svaki dan sajma**
- [ ] Pre otvaranja: pitanje dana objavljeno, misije na Pregledu čiste.
- [ ] Sat posle otvaranja: ima skenova na svakom štandu; ima bar jedan lead.
- [ ] U podne: Levak i Dubina prema ciljevima iz §7.
- [ ] Uveče: dnevni izveštaji izlagačima odobreni; šta se menja za sutra.

**Posle sajma**
- [ ] Follow-up poslat u roku od 24–48 h, ako je uključen.
- [ ] Izvezen CSV analitike; brojevi po paketu upoređeni između više izlagača (§6).
- [ ] Lični podaci se brišu 16. 11. 2026 (`FAIR_PII_PURGE_AT_MS`); leadovi su pre toga predati izlagačima.
