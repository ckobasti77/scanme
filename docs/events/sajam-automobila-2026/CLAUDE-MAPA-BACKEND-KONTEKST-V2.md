# PROMPT ZA CLAUDE-A: Sajam automobila 2026 — mapa i backend v2

> Status: **ZAKLJUČAN KONTEKST ZA JOVANOV CLAUDE TOK**
>
> Poslednje ažuriranje: **5. oktobar 2026.**
> Vlasnik proizvodnih odluka i finalni go/no-go: **Aleksa**
> Tehnički vlasnik backend-a i produkcijske mape: **Jovan**
> Rok za operativnu spremnost: **9. oktobar 2026.**
> Integracioni test: **8. oktobar 2026.**
> Kanonski proizvodni dokument: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
> Kanonski backend ugovor: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)
> Javni UI ugovor: [`EVENT-DESIGN-SYSTEM.md`](./EVENT-DESIGN-SYSTEM.md)
> Frontend integracija: [`FRONTEND-INTEGRATION-PLAN.md`](./FRONTEND-INTEGRATION-PLAN.md)
> Najnovija traffic/share delta: [`JOVAN-DELTA-2026-10-05.md`](./JOVAN-DELTA-2026-10-05.md)

`MASTER-KONTEKST.md` definiše proizvod. `BACKEND-HANDOFF.md` definiše tehničku implementaciju. Ovaj dokument prevodi Jovanov raniji kontekst „Živa mapa” na trenutno zaključan ScanMe plan i određuje šta Claude sme da zadrži, promeni ili izbaci.

Ako dokumenti, postojeći kod, stari `docs/sajam/SPEC.md`, promptovi ili runner protivreče kanonskim dokumentima, ne rešavaj kontradikciju pretpostavkom. Zaustavi samo sporni deo i vrati ga komandnom centru. Ne menjaj poslovno pravilo zato što je stara implementacija drugačija ili jednostavnija.

---

## 0. Direktiva za Claude-a

Raniji dokument `KONTEKST-ZA-KODEKS.md` opisuje staru ideju proizvoda „Živa mapa”. Njegove tehničke činjenice o repozitorijumu, mapama organizatora, Claude CLI-ju i postojećem runneru mogu da budu korisne, ali njegove poslovne odluke i UX nisu više autoritet.

Tvoj zadatak je da:

1. uskladiš Jovanov map/backend plan sa ovim dokumentom i kanonskim ScanMe ugovorima;
2. ukloniš stare funkcionalnosti koje više nisu u opsegu;
3. zadržiš samo tehničke delove starog rada koji ne protivreče novom ugovoru;
4. podeliš rad na male proverljive checkpoint-e;
5. implementiraš backend i mapu bez preuzimanja drugih javnih event stranica;
6. nikada ne pokreneš destruktivni recovery, produkcijski deploy, live seed ili brisanje bez nove eksplicitne Aleksine odluke.

Prvi odgovor ne treba da bude novi roman niti novo nezavisno projektovanje proizvoda. Treba da bude kratak compatibility audit:

- trenutno stanje grane i radnog stabla;
- ciljni Convex DEV deployment;
- koji postojeći `docs/sajam/**` i `scripts/sajam/**` fajlovi su pronađeni;
- lista starih koraka koje treba zameniti;
- predlog prvog malog checkpoint-a;
- konflikti koje kod ili dokumentacija još imaju sa ovim ugovorom.

---

## 1. Hijerarhija izvora istine

Redosled autoriteta je:

1. nova eksplicitna Aleksina odluka;
2. `MASTER-KONTEKST.md`;
3. `BACKEND-HANDOFF.md`;
4. `EVENT-DESIGN-SYSTEM.md` za javni vizuelni jezik;
5. `FRONTEND-INTEGRATION-PLAN.md` za rute i integracione granice;
6. ovaj delta/prompt dokument;
7. postojeći kod kao opis trenutnog stanja, ne kao poslovna odluka;
8. stari `KONTEKST-ZA-KODEKS.md`, `docs/sajam/SPEC.md` i S01–S11 promptovi samo kao istorijski/tehnički materijal.

Stari plan ne sme da vrati odbačenu funkcionalnost pod drugim imenom.

---

## 2. Šta iz starog Jovanovog plana ostaje, šta se menja, a šta se briše

### 2.1 Zadržati i prilagoditi

- četiri izvorne mape kroz dva događaja i geometriju zasnovanu na materijalima organizatora;
- mobile-first mapu i prikaz iste mape na sajamskim displejima;
- postojeći Next.js/Convex/TypeScript/Tailwind/GSAP stack;
- typed i18n, postojeće `AGENTS.md` smernice i obavezno čitanje `convex/_generated/ai/guidelines.md`;
- Playwright/screenshot proveru na telefonu i display rezoluciji;
- ideju anonimnog uređajskog identiteta, ali po novom token ugovoru bez profila i prenosa naloga;
- garažu, glasanje i pasoš samo u obliku opisanom u ovom dokumentu;
- postojeću pripremu geometrije mape ako se može odvojiti od stare igre i starih tabela;
- runner kao tehnički okvir samo nakon što se uklone destruktivni recovery i zastareli promptovi.

### 2.2 Potpuno zameniti

- `PRO/PREMIUM`, cene u evrima i dodatne prodajne stavke zameniti nivoima `included`, `starter`, `advanced` i zaključanim cenama u RSD;
- `/sajam/v/[oznaka]` i druge stare javne rute zameniti zaključanim rutama iz §5;
- direktne sajamske QR kodove zameniti postojećim stabilnim `/r/[cardCode]` resolverom;
- server-side garažu zameniti lokalnom browser garažom po događaju;
- „ponudu” kao generički lead zameniti sa `Zainteresovan sam` i `Probna vožnja`, sa različitim paketnim pravima;
- izlagački panel zameniti ScanMe admin sekcijom `Događaji` i email/PDF/XLSX isporukom;
- javne rating agregate zameniti prikazom samo lične ocene posetioca;
- stare TV top-liste i heat map koncepte zameniti Advanced rotacijom rezultata na istoj mapi/displeju;
- stari pasoš-stanice/nagrada model zameniti pasošem brenda po skeniranim modelima, bez fizičke nagrade.

### 2.3 Izbaciti iz V1

- nadimak, avatar, profil, nivoe, poene, bedževe, misije, rank, top 5 i zajednički cilj;
- „Tvoj ključ”, prenos naloga QR-om/ključem, passkey i 400-dnevni cookie;
- Dijkstra putanju, „Sledeće”, „Vodi me” i procenu hodanja;
- poseban QR za stanicu pasoša ili oznaku štanda;
- bojenje posećenog štanda kao deo bodovanja;
- leaderboard i ticker sa nadimcima na displeju;
- poseban exhibitor panel, token panela i live self-service metrike;
- passport stanicu koja se prodaje za 60 €, fizičku nagradu i info-pult validaciju;
- `Mesto na ekranu 120 €`, dodatno vozilo 15 €, stalke, NFC vizitke i video/foto ponude kao deo softverskog ugovora;
- poddomen `sajam.scanme.rs` i kratke direktne `/v017` linkove;
- pasivne sponsored impression metrike;
- nenaručenu heat mapu i sve javne brojeve/algoritme koji nisu zaključani.

---

## 3. Zaključan proizvod i poslovna ponuda

ScanMe je digitalni partner dva događaja u Hali Čair:

1. `elektromobilnost-2026` — 9–11. oktobar 2026;
2. `auto-moto-fest-2026` — 30. oktobar–1. novembar 2026.

Ponuda se obračunava po konkretnom izloženom modelu na konkretnom događaju.

### Za sve izlagače (`included`)

- QR nalepnica za svaki izloženi automobil;
- stranica modela: naziv, cena i uređene specifikacije, fotografija opciona;
- lokalno čuvanje i poređenje najviše dva modela u garaži;
- zbir ukupnih i jedinstvenih skeniranja štanda.

Ne prikazuj ovo kao `0 RSD`; naziv je „Za sve izlagače”.

### Starter — 3.000 RSD po modelu

Sve iz `included`, plus:

- jedna ukupna ocena 1–5;
- `Zainteresovan sam`;
- jedno pitanje Glasa publike po sajamskom danu;
- dnevni presek;
- analitika po modelu;
- učešće u pasošu brenda kada ceo brend ispunjava uslov;
- mogućnost nadogradnje tokom sajma.

Starter je glavni paket koji se prodajno najviše gura.

### Advanced — 5.000 RSD po modelu

Sve poslovne pogodnosti Startera, plus:

- prijava za probnu vožnju bez izbora termina;
- tri opcione ocene: izgled, specifikacije i cena; one zamenjuju Starter overall ocenu i nema četvrte ukupne ocene;
- do pet pitanja Glasa publike po sajamskom danu;
- odvojena anketa do pet kratkih pitanja;
- proširena analitika;
- jedan follow-up email 24–48 sati posle relevantnog sajma;
- ravnopravna sponzorisana rotacija na mapi/displejima;
- ravnopravna sponzorisana rotacija u Garaži.

Dozvoljena je samo nadogradnja `included -> starter -> advanced`. Važi od trenutka aktivacije. Raniji scanovi ostaju u analitici, ali plaćene interakcije nisu retroaktivne.

---

## 4. Granica odgovornosti

### Jovan i Claude

Vlasnici su:

- sajamske Convex šeme, indeksa, funkcija, projekcija i testova;
- centralnog entitlement ugovora i `lib/fair-contract.ts`;
- anonimnog identiteta, QR hook-a, scan metrike, ocena, glasova, ankete, pasoša, leadova, emaila, izveštaja i retention-a;
- ScanMe admin sekcije `Događaji` za ove podatke;
- produkcijske mape `/sajam/[eventSlug]` i njenog display ponašanja;
- povezivanja mape sa backend projekcijama i zajedničkim event dizajn-sistemom.

### Komandni centar / Aleksa

Vlasnik je:

- proizvoda, paketa, tekstova i poslovnih odluka;
- javnog event shell-a, model stranice, Garaže i drugih javnih UX tokova van same mape;
- dizajn-sistema i finalnog vizuelnog audita mape;
- QR štampe, produkcijskog deploya i konačnog go/no-go.

### Teodora

- komunikacija sa izlagačima i prikupljanje podataka; Aleksa je rezerva.

Mapa ne sme da izmisli zaseban vizuelni sistem, rute, podatke ili paketne funkcije. Drugi frontend tok ne menja mapu niti backend bez Jovanove koordinacije.

---

## 5. Zaključane javne rute i shell

- mapa/event home: `/sajam/[eventSlug]`;
- model: `/sajam/[eventSlug]/model/[modelSlug]`;
- Glas publike: `/sajam/[eventSlug]/model/[modelSlug]/glas-publike`;
- anketa: `/sajam/[eventSlug]/model/[modelSlug]/anketa`;
- zajednička Garaža: `/sajam/garaza`;
- poređenje najviše dva modela: `/sajam/garaza/poredjenje`.

Sve javne sajamske rute su `noindex` i rade na glavnom ScanMe domenu. Nema novog domena ili poddomena.

Event shell je svetao, mobile-first i event-first: Sajam automobila je primarni identitet, ScanMe je sekundarno označen kao digitalni partner. ScanMe zelena je rezervisana isključivo za ScanMe štand na mapi. Ne koristi prelaunch mono tipografiju, scan linije, neon, tehnički jezik, globalni theme toggle ili dominantno staklo.

---

## 6. Produkcijska mapa

Mapa je jedna od glavnih javnih funkcija, ali nije igra niti navigacioni simulator.

### Obavezno

- koristi geometriju i raspored organizatora za odgovarajući događaj;
- mobile-first pan/zoom/tap iskustvo bez horizontalnog UI overflowa;
- štand/model podaci dolaze iz zajedničkog fair ugovora i `mapLocationId` veze, bez duplog kataloga;
- jasan izbor štanda i prikaz relevantnog izlagača/brenda/modela;
- označavanje brendova sa aktivnim pasošem i ličnog progresa `N/M`;
- ScanMe štand jedini koristi ScanMe zelenu kao specijalan akcenat;
- Advanced modeli ulaze u 12-sekundnu ravnopravnu rotaciju;
- rotacija prikazuje model, rezultat jednog admin-izabranog pitanja i zatim diskretno ističe lokaciju štanda;
- ako pitanje nema pet glasova, prikazuje `Glasanje je u toku`, bez izmišljenog procenta;
- na mapi se ne glasa;
- svi sajamski displeji i mapa računaju isti aktivni model iz zajedničkog vremenskog slota/epohe;
- pasivni prikaz ne pravi impression događaj niti analytics write;
- veća rezolucija koristi istu mapu/podatke; poseban display URL ili query je implementacioni detalj koji ne sme da napravi drugi proizvod.

### Nije dozvoljeno bez nove odluke

- poeni, +10 animacije, level/rank/misije;
- top 5, nadimci i event ticker;
- Dijkstra/vođenje/udaljenost/minuti;
- heat map;
- glasanje direktno na mapi;
- passport QR stanice;
- poseban TV leaderboard;
- drugačiji paketni ili visitor model od ostatka sajamskog proizvoda.

Ako postojeća SVG/map geometrija može da se izdvoji iz stare igre, zadrži je. Ako je čvrsto vezana za stare tabele i rute, napravi tanku adaptaciju prema `fair` ugovoru; ne dupliraj katalog podataka samo da bi se stari kod lakše sačuvao.

### Postojeći map materijal koji prvo treba proveriti

Stari kontekst navodi četiri lokalna izvora u `docs/sajam/mape/`:

- `elektro-hala.jpg` — 1375×1080;
- `elektro-ispred.jpg` — 1120×1080;
- `amf-hala.jpg` — 1375×1080;
- `amf-ispred.jpg` — 1120×1080.

Navodi i ideju SVG viewBox-a jednakog dimenzijama slike radi vizuelnog preklapanja i provere geometrije. To je korisna tehnička tehnika i sme da ostane. Međutim, prepisani spisak izlagača/štandova iz 30. septembra nije konačni izvor podataka: tretiraj ga kao radni nacrt koji mora proći `mapLocationId` validaciju i proveru sa aktuelnim materijalom organizatora. Ne kodiraj imena izlagača direktno u SVG.

U starom repou proveri i sledeće pre nego što praviš duplikate:

- `scripts/sajam/SajamRun.ps1`, `PUSTI.cmd`, `PRIPREMI.cmd`, `RULES.md` i S01–S11 promptove;
- `scripts/sajam/tools/shot.mjs` za vizuelni QA;
- `docs/sajam/SPEC.md`, `DNEVNIK.md` i postojeću map geometriju;
- postojeći `/r/[cardCode]`, `proxy.ts` i catch-all rute da nova event ruta ne promeni druge ScanMe proizvode.

---

## 7. QR, anonimni identitet i Garaža

### QR

- jedina štampana ruta je postojeći `/r/[cardCode]`;
- priprema se 100 postojećih dinamičkih ScanMe QR identiteta u dve dozvoljene serije od 50, tek uz eksplicitnu produkcijsku saglasnost;
- QR inventar se atomski dodeljuje modelu uz audit istoriju;
- promena paketa ili model sluga ne menja štampani kod;
- jedan resolver request ID beleži generički i najviše jedan fair scan; model page load ne beleži novi scan;
- nema `/sajam/v/[oznaka]`, `/sajam/s/[kod]` ili posebnog sajamskog scan endpointa kao štampanog ulaza.

### Brojanje

- 10 scanova istog modela istog uređaja = 10 ukupnih, 1 jedinstveni;
- identičan `requestId` retry ne dodaje scan;
- autentifikovani ScanMe admini Aleksa, Jovan i Teodora ne ulaze u fair statistiku;
- svi ostali validni scanovi računaju se 24/7;
- otvaranje iz Garaže ili sponsored kartice nije scan.

### Identitet

- najmanje 256-bitni nasumični `visitorToken` u `HttpOnly; Secure; SameSite=Lax` first-party cookie-ju;
- raw token nikad ne ide u Convex, URL ili klijentski JavaScript;
- backend čuva samo domen-specifični hash;
- nema naloga, nadimka, avatara, profila, transfer ključa, fingerprintinga ili identifikacije emailom;
- cookie i svi visitor-linkable server podaci ističu/brišu se najkasnije 16. novembra 2026.

### Garaža

- čuva se u browser storage-u po događaju, ne u Convexu;
- dva event taba, aktivni događaj prvi;
- PDF/email izvoz samo na eksplicitan zahtev;
- Advanced traka rotira ravnopravno na 8 sekundi, pauzira tokom interakcije i nudi `Pogledaj` i `Dodaj u garažu`;
- samo te dve eksplicitne akcije se mere; nema impression događaja;
- sponzorisani model se nikad ne dodaje automatski.

---

## 8. Interakcije i pasoš

### Ocene

- Starter: jedan `overall` 1–5;
- Advanced: opciono `appearance`, `specifications`, `price`; bez `overall` i bez izvedene četvrte ocene;
- ponovni unos menja postojeći red;
- posetilac vidi samo svoje ocene;
- count i proseci postoje samo u admin/report projekcijama.

### Glas publike

- Starter: najviše 1 pitanje po sajamskom danu;
- Advanced: najviše 5 po sajamskom danu;
- najmanje 2 opcije, jedan odgovor, glas promenljiv;
- rezultat javno od 5 glasova; ispod praga samo lični izbor i neutralno stanje;
- admin ručno bira jedan rezultat za Advanced map/display rotaciju.

### Anketa

- samo Advanced;
- najviše 5 kratkih da/ne ili choice pitanja;
- najmanje jedan odgovor za submit;
- nije javna i ne menja se nakon slanja.

### Pasoš brenda

- aktivan samo ako brend ima najmanje 2 modela i svi izloženi modeli brenda imaju Starter ili Advanced;
- eligible skup se zaključava pre otvaranja;
- scan svakog modela daje pečat;
- kompletiranje otključava promenljiv izbor omiljenog modela;
- nema fizičke nagrade;
- rezultat favorita ima prag 5;
- model, Garaža i mapa koriste isti passport katalog i visitor progres;
- svi aktivni pasoši se vide u Garaži i na `0/N`;
- lokalni digitalni badge čuva se samo kada ga korisnik eksplicitno sačuva.

---

## 9. Leadovi, email, izveštaji i retention

### Leadovi

- `Zainteresovan sam` je Starter+;
- `Probna vožnja` je samo Advanced i nema izbor termina;
- ime i najmanje telefon ili email;
- saglasnost eksplicitno imenuje ScanMe i konkretnog izlagača;
- izlagač nema panel; ScanMe prima i isporučuje lead;
- potvrda se prikazuje/šalje samo nakon uspešnog backend upisa;
- Advanced ima tačno jedan follow-up 24–48 sati nakon svog sajma, uz suppression proveru.

Lead tok ne ide u produkciju pre stručne potvrde pravnog teksta i dogovorenog bezbednog kanala/primaoca po izlagaču.

### Izveštaji

- ScanMe admin sekcija `Događaji`, bez exhibitor pristupa;
- dnevni dataset spreman najkasnije 60 minuta nakon zatvaranja;
- PDF i XLSX/CSV;
- dnevni i satni scanovi, unique scanovi i metrike dozvoljene paketom;
- od drugog dana kratko poređenje sa prethodnim;
- PII export odvojen od agregatnog izveštaja;
- organizer dobija samo agregate;
- automatska izrada, ali obavezna ručna provera i odobrenje pre slanja;
- correction/resend podrška.

### Retention

- sve leadove isporučiti najkasnije 15. novembra 2026;
- 16. novembra trajno obrisati iz cloud-a i svih ScanMe lokalnih kopija: kontakte, visitor hash/identifikatore, individualne odgovore povezive sa licem, consent snapshot, suppression i druge PII/linkable podatke;
- nema dodatnog grace perioda;
- ostaju samo nepovratno anonimizovani agregati i audit da je purge izvršen;
- purge mora imati bounded batch, preview/dry-run i retry-safe izvršenje.

---

## 10. Backend arhitektura koju mapa mora da koristi

Ne pravi paralelne `sajam*` tabele samo zato što su postojale u starom SPEC-u. Kanonski prefiks je `fair`.

Obavezne jezgrene celine:

- `fairEvents`, `fairEventDays`;
- postojeći `accounts`, `businesses`, `accountContacts`, `brands` + `fairParticipations`;
- `fairStands`, `fairEventModels`;
- `fairQrAssignments`, `fairPackageActivations`;
- `fairVisitors`, `fairScanEvents`, `fairUniqueScans`, fair sharded counters;
- ratings, audience questions/votes, surveys/responses;
- leads, consent configs, email deliveries/templates;
- passport config/eligible models/stamps/favorites;
- report runs;
- immutable sponsored snapshots/items i samo eksplicitni garažni sponsored events.

Ne pravi `fairExhibitors`. Novi sajamski klijent koristi postojeći client/business/contact zapis sa nezavisnim `clientSegment: standard | event_only`. Konverzija u redovnog klijenta patchuje isti zapis.

`lib/fair-entitlements.ts` je jedini autoritet za paketna prava. `lib/fair-contract.ts` je čisti TypeScript ugovor bez React/Next/Node zavisnosti. Frontend renderuje server-projektovane `capabilities`; ne računa prava poređenjem package stringa.

Mapi su najmanje potrebne bounded projekcije za:

- event po slugu;
- objavljene štandove i njihove map location ID-jeve;
- bezbedne izlagač/brend/model kartice;
- passport eligibility i lični `N/M` progres preko server gateway-a;
- ručno objavljeni Advanced snapshot, selected audience rezultat, seed/version/epoch;
- neutralna stanja kada fotografija ili dovoljan broj glasova nedostaju.

Visitor-specifični read/write ide kroz same-origin server `POST` gateway da `visitorHash` ne završi u URL-u, cache ključu ili analytics-u. Javni katalog readovi bez identiteta mogu koristiti direktan bounded Convex query.

---

## 11. Admin `Događaji`

Dodaje se poseban glavni admin tab `Događaji`. Sadrži:

- oba događaja i dane;
- postojeće standardne i `event_only` klijente;
- učešća, štandove, brendove, modele i pakete;
- QR inventar, atomsku dodelu/release i resolve test;
- pitanja, ankete, pasoše i ručno biranje sponsored rezultata;
- ručno objavljivanje Advanced snapshot-a;
- leadove, interakcije i paketne metrike;
- import dry-run/commit i validation issues;
- report build/review/approve/send/retry;
- retention preview i audit bez PII u logu.

Izlagači nemaju nalog, dashboard niti self-service pristup.

---

## 12. Kako prepraviti postojeći noćni lanac

Stari S01–S11 lanac se ne pokreće dok se promptovi i pravila ne usklade. Posebno su zastareli S03, S04, S05, S07 i S08 jer bi napravili stari nalog, igru, panel i poddomen.

### Obavezne izmene runnera

- zabrani `git reset --hard`, `git clean`, stash, checkout/restore tuđih izmena i svaki automatski destructive recovery;
- neuspeo korak ostavlja radno stablo i diff netaknute, piše status i zaustavlja lanac;
- ne pokreći više agenata nad istim fajlovima;
- pre svakog koraka zabeleži branch, HEAD, dirty fajlove i ciljni Convex deployment;
- `npx.cmd convex dev --once` samo ka potvrđenom Jovanovom DEV deploymentu, posle type/test prolaza;
- nikada `convex deploy`, live seed/migracija, kreiranje stvarnih 100 QR kodova, reset ili brisanje bez nove eksplicitne saglasnosti;
- ne commituj `.env*`, tajne, export baze ili privremene slike;
- svaki checkpoint ima ciljane testove, `git diff --check`, relevantan build/check i status izveštaj;
- vizuelni map checkpoint proveriti najmanje na 390 px, 1280 px i 1920×1080, uz console/overflow proveru;
- globalni `npm.cmd run check` pokrenuti pre predaje checkpoint-a, ali ne tvrditi da pokriva sve ciljane Vitest/Convex testove.

### Preporučen novi redosled

1. **C0 — audit i ugovor**: sačuvaj postojeći rad, pročitaj kanonske dokumente, ukloni stale plan iz aktivnih promptova, objavi compatibility report.
2. **B0 — contract/schema**: `fair-contract`, entitlements, validatori, aditivna šema i testovi. Ne prelazi dalje pre pregleda.
3. **B1 — katalog/admin/import/QR assignment**.
4. **B2 — anonymous gateway i `/r/[cardCode]` scan pipeline**.
5. **M0 — map geometry adapter**: postojeća geometrija + `mapLocationId`, bez igre i bez paralelnog kataloga.
6. **B3 — ratings, Glas publike, survey i passport**.
7. **M1 — javna mapa**: stands, passport progres, mobile/display ponašanje.
8. **B4 — lead/email**, sa produkcijskim feature gate-om dok pravni tekst nije odobren.
9. **B5/M2 — sponsored snapshot i 12s map/display reveal**, bez impression write-a.
10. **B6 — analytics/report dataset**.
11. **B7 — retention, authz, performance i integracioni test**.

Ne pokušavaj da sve ovo završiš jednim višesatnim autonomnim korakom. Svaki korak mora da ostavi proverljiv diff i kratak handoff. Ako rok zahteva rez, prvo radi tačan backend contract, QR/model tok i funkcionalnu mapu; ne vraćaj igru kao „bržu” zamenu.

---

## 13. Git i radno stablo

Stari kontekst pominje granu `feat/venue-memories` i netražene `docs/sajam/**`/`scripts/sajam/**`. Kanonski zajednički pravac koristi `codex/sajam-automobila-2026`, ali nemoj automatski prebacivati ili čistiti granu dok Jovan ne vidi preflight.

Prvo uradi samo read-only proveru:

```powershell
git status --short
git branch --show-current
git rev-parse --short HEAD
git remote -v
```

Zatim prijavi:

- koji rad je commitovan, a koji nije;
- da li postoje lokalni runner/spec fajlovi koji nisu u shared grani;
- predlog bezbedne integracione grane;
- koje fajlove treba preneti ručno ili kroz poseban commit.

Ne koristi reset/clean/stash kao metod usaglašavanja. Ne briši ništa što je korisnik ili drugi agent napravio. Ako zajednička grana nedostaje ili je istorija divergentna, stani posle dijagnoze i traži odluku.

---

## 14. Kriterijumi prihvatanja

Pre produkcije mora biti dokazano:

- realni `/r/[cardCode]` vodi na pravi objavljeni model;
- jedan resolver request ne pravi dva fair scan-a;
- package capabilities su server-side tačne;
- 10 ponovljenih scanova istog modela/uređaja daje 10 total i 1 unique;
- autentifikovani ScanMe admin scanovi su isključeni, drugi važe 24/7;
- rating/vote promena patchuje postojeći unos;
- javni rating ne otkriva agregate;
- leadovi imaju pravilan entitlement i consent, a email retry ne duplira slanje;
- mapa koristi pravi katalog, pokazuje passport `N/M` i nema stari game/profile sloj;
- Advanced snapshot je ravnopravan, ručno objavljen i sinhronizovan na displayima;
- mapa/displej ne beleži impressions i ne prikazuje glasanje;
- Garaža beleži samo `open_model` i `garage_add` sponsored akcije;
- dnevni dataset ne meša izlagače, modele ili događaje;
- report ne može da se pošalje pre ručnog odobrenja;
- purge preview/test dokazuje potpuno brisanje PII i visitor-linkable redova 16. novembra;
- javne funkcije ne vraćaju PII ili admin podatke;
- mobilna mapa nema horizontalni overflow i radi na telefonu;
- display prikaz radi na 1920×1080;
- seed za 8. oktobar pokriva oba događaja, najmanje 2 izlagača, 10 modela i sva 3 paketa.

Aleksa je jedini produkcijski deploy owner i finalni go/no-go.

---

## 15. Otvorene stavke koje Claude ne sme da izmisli

Blokiraju produkcijsko uključivanje leadova:

- finalni tekst saglasnosti i politike privatnosti;
- bezbedan kanal i primalac PII izvoza po izlagaču;
- finalni tekst neposredne potvrde i jednog follow-up emaila.

Ne blokiraju contract/schema rad, ali nedostaju za stvarni sadržaj:

- stvarni account/business/contact/brand linkovi;
- konačni modeli, specifikacije, cene, fotografije i paketi;
- pitanja Glasa publike, ankete i selected sponsored rezultat;
- finalni PDF/XLSX report template;
- konačna potvrda geometrije i `mapLocationId` mapiranja na obe mape.

Za ove tačke pripremi validiran seam, import ili placeholder stanje koje nije javno obećanje. Ne izmišljaj podatke, rezultate, fotografije ili vlasničko odobrenje.

---

## 16. Očekivani odgovor Claude-a nakon čitanja

Vrati Jovan-u i Aleksi:

1. tabelu `zadržava se / menja se / briše se` za postojeći SPEC i S01–S11;
2. read-only git/deployment preflight;
3. preciznu listu fajlova koje bi prvi checkpoint menjao;
4. predlog novog runner koraka bez destruktivnog recovery-ja;
5. sve preostale kontradikcije ili otvorene odluke;
6. potvrdu da nije pokrenut deploy, live seed, reset, clean ili brisanje;
7. tek zatim predlog da se započne C0/B0 ili, ako je B0 već delimično urađen, audit stvarnog diff-a prema kanonskom ugovoru.

Nemoj početi mapu od nule dok ne utvrdiš šta od postojeće geometrije zaista postoji i može bezbedno da se zadrži. Nemoj nastaviti stari noćni lanac samo zato što je tehnički spreman: njegovi promptovi trenutno opisuju drugi proizvod.
