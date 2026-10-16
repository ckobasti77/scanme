# AMF mapa — izveštaj za 17. oktobar 2026.

Rad je završen u `C:\My Stuff\Posao\ScanMe\Site\scanme-amf-pasos`, na grani `feature/amf-pasos-markice`. Provere su izvršene 16. oktobra. Mapa je spremna za lokalni pregled i probu na fizičkom telefonu.

Heat ostaje u posetilačkom prikazu, sa nazivom **„Gde je gužva“**, prema izričitoj odluci vlasnika tokom rada. AMF dobija papirni prikaz, prepoznatljive oznake brendova, sopstveni napredak i spisak u jednom dodiru. Produkcijski prekidač mape ostaje isključen.

## Šta je postojalo i kako podaci stižu do posetioca

`app/sajam/[eventSlug]/page.tsx` razrešava događaj i temu. Njegov `MapSection` paralelno čita `fairPublic.getEventMap`, katalog pasoša i početnu sponzorisanu rotaciju. `buildFairMapView` spaja te podatke sa geometrijom iz `lib/fair-map` preko stabilnog `mapLocationId`.

Javni katalog prikazuje aktivne štandove aktivnih učešća, njihove izlagače i objavljene modele. Jednu lokaciju može da deli više izlagača. Izlagači bez postavljenog štanda ostaju u spisku; ne izmišlja im se položaj. Nepotvrđeni AMF ScanMe placeholder se ne crta.

Admin/import menja katalog i vezu štanda sa `mapLocationId` kroz postojeći `fairAdmin.upsertStand` i katalog/import funkcije. Javna mapa promenu preuzima pri sledećem otvaranju ili osvežavanju. Već otvorena geometrija/katalog nema live pretplatu; sponzorisana rotacija je ima. Ovaj rad nije menjao admin interfejs, geometriju, ID-eve lokacija, validaciju ni Convex funkcije. Njihovi postojeći testovi su prošli u punom paketu.

Sopstveni napredak stiže postojećim `POST /api/fair/passport`. Mapa ga samo čita i ne dodeljuje markice. Prikaz mape ne upisuje impresije ili nove evidencije poseta.

Slabosti prethodnog prikaza bile su sitni logotipi, veliki prostor rezervisan za brojeve štandova, više redova komandi iznad crteža i spisak daleko ispod mape. Markeri pasoša prikazivali su broj, ali završeno i novo mesto nisu bili jasno različiti. Učitavanje nije pratilo novi mobilni raspored.

## Rani prototip i vizuelni pravac

Traženi raniji pravac pronađen je na `/dev/sajam-cair`: `cair-map.tsx` i `cair-map.module.css`. Prototip je ponovo otvoren i snimljen. Preuzeta je ideja mape kao glavne radne površine, jasnih oznaka brendova i neposrednog otvaranja detalja.

Git istorija dostupna u ovom checkout-u pokazuje:

- `f6281c6`, 1. oktobar: zajednička osnova koja već sadrži prototip;
- `548d748`, 3. oktobar: preuzeta osnova zajedničke grane;
- `109696f`, 8. oktobar: „Mapa v2: izgled test mape, mobile-first“.

Prethodne radne beleške vezuju izradu ranog prototipa za 19. septembar. To je istorijski kontekst iz beleške; originalni septembarski commit nije pronađen u dostupnoj istoriji ove grane.

Novi prikaz koristi postojeću AMF temu: topli papir i teksturu, tamno mastilo i narandžasti akcenat. Izbor hijerarhije i kontrola vođen je postupkom Taste → UI UX Pro Max → Frontend Design. Organizatorske slike korišćene su samo kroz postojeće poligone geometrije. Nema organizatorske slike ispod nove mape, novog GPS-a ili izmišljene putanje kroz halu.

## Heat: šta zaista radi i odluka

Izvor je postojeća analitika `scan_unique`, jedinstvena po posetiocu i modelu. Skeniranje više različitih modela istog izlagača doprinosi aktivnosti njegovog štanda. Ponovljeno skeniranje istog modela istog posetioca nije novi jedinstveni sken. Zajedničke lokacije sabiraju aktivnost svojih štandova.

Postoje periodi „Danas“ i „Poslednji sat“. Klijent čita podatke kada se prekidač uključi, potom najviše jednom u 60 sekundi dok je stranica vidljiva. Promena perioda koristi isti odgovor. Server ima memoizaciju i CDN keš od 60 sekundi, uz `stale-while-revalidate=300`. Sat se računa iz vremenskih bucket-a, pa nije sekundno precizna mera.

Kod malo podataka postoje pragovi: ukupno najmanje 5 jedinstvenih skenova za dan, odnosno 3 za sat. Minimalna vrednost za vrh skale je 8, odnosno 4; koristi se i približni 95. percentil. Jedan sken zato ne postaje najviša vrednost. Mali uzorak ipak može brzo da promeni relativni raspored aktivnosti. U tom slučaju prikaz ostaje miran ili prikazuje postojeću poruku da nema dovoljno podataka.

Odluka je **zadržati heat**, bez promene metrike ili backend-a. Korisnički naziv „Gde je gužva“ ostaje. AMF koristi intenzitet iste narandžaste umesto višebojnog spektra; elektromobilnost zadržava postojeću skalu. Logotipi ostaju čitljivi, a sopstvene markice imaju zaseban simbol i oznaku. Na interfejs nije dodat tehnički opis metrike.

Javni odgovor sadrži samo normalizovane nivoe 0–1, bez broja skenova, identiteta posetilaca i kontakata. Postojeće izdvajanje admin/pre-event aktivnosti ostaje. Heat ne uvodi novu evidenciju posetilaca. Lokalni, nemockovani `GET /api/fair/heat/test-auto-moto-fest-2026` vratio je HTTP 200 i `enough: false` za oba perioda. Popunjena heat stanja u browser QA-u simulirana su samo presretanjem odgovora u browseru, bez upisa u bazu.

Za slabiji telefon zadržani su jedan vektorski crtež po zoni, mali postojeći logotipi, motion vrednosti bez React renderovanja po svakom pomeranju prsta i povremeno čitanje heat-a. Nisu dodate velike fotografije, WebGL ili novi paketi. Prošao je smoke test sa 4× usporenim CPU-om; to nije fizički Android benchmark.

## Šta je novo

- Cela hala se otvara uklopljena u raspoloživu širinu/visinu. CSS računa visinu zaglavlja i safe-area inset-e; dodatno ostaju pinch, pan, približavanje i povratak na ceo prikaz.
- AMF ne prikazuje brojeve štandova ni u crtežu, spisku, pretrazi, detalju, sponzorisanoj lokaciji ni tekstu linka sa modela. Interni ID u URL-u ostaje isti radi postojećeg ugovora i admin podataka.
- Poznati brendovi koriste postojeći `FairBrandMark` sa `simple-icons`; ostali dobijaju čist naziv ili postojeći logo. Prostor koji su ranije zauzimali brojevi sada koriste oznake izlagača.
- „Spisak“ se otvara iz prvog reda jednim dodirom. Kategorije su odmah otvorene; izbor izlagača vraća mapu na njegovu lokaciju i otvara detalj.
- Detalj sadrži izlagača, modele i linkove. Postojeći modalni panel zadržava zatvaranje, Escape, fokus i drag ponašanje. Ispravljena je hydration greška pri direktnom otvaranju detalja uz `prefers-reduced-motion`.
- Sopstveni pasoš daje tri stanja: „Novo“ kada nema markica, `N/M` kada je započet i narandžasti check kada su pasoši te lokacije završeni. Zajednička lokacija ne duplira isti pasoš. Nepoznato stanje tokom učitavanja ne glumi završen napredak; greška nudi ponovni pokušaj.
- Učitavanje već prikazuje tihu geometriju hale. Prazan katalog objašnjava stanje, greška ima povratak, a pretraga bez rezultata ima izlaz iz tog stanja.
- Sponzorisana kartica ostaje, ali u AMF-u nema automatskog pulsiranja izdvojenog štanda preko osnovnog pregleda.

Fajlovi pasoša/markica i ruta `/pasosi/*` nisu menjani. Vizuelna pravila su ograničena na AMF. Za elektromobilnost su sačuvani numeracija, spisak, osnovne boje i heat skala; dodat je regresioni snimak.

## Dokazi provere

| Provera | Rezultat |
| --- | --- |
| `npm.cmd run check` | Prošao: ESLint, Next production build sa TypeScript proverom, namespace gate i golden harness |
| `npx.cmd tsc --noEmit --incremental false` | Prošao |
| `$env:CI='1'; npm.cmd test` | 264 test fajla prošla, 2 preskočena; 2.384 testa prošla, 2 preskočena |
| Golden harness | 177 slučajeva × 2 širine, bajt-za-bajt isto |
| `node scripts/events/verify-amf-map.mjs` | Prošao; rezultati u `output/amf-mapa/qa-results.json` |
| `git diff --check` | Prošao |

ESLint ima dve postojeće nepovezane opomene: nekorišćen `useMemo` u `components/admin/venue-admin.tsx` i `price` u `convex/purchaseLifecycle.test.ts`. One nisu menjane. Browser QA ima nula grešaka i nula neočekivanih upozorenja; Motion-ovo razvojno obaveštenje da je smanjeno kretanje uključeno evidentirano je odvojeno.

Na početnom mobilnom pregledu izmereno je:

| Ekran | Donja ivica cele mape sa komandama | Horizontalni preliv |
| --- | --- | --- |
| 360×640 | 574 px | Ne |
| 375×812 | 594 px | Ne |
| 390×844 | 606 px | Ne |
| 430×932 | 637 px | Ne |

Browser QA proverava dodir štanda, model linkove, fokus unutar detalja, Escape, spisak i povratak na mapu, direktni `?stand=` link, heat i promenu perioda, učitavanje, prazno stanje, grešku i retry. Dodatno proverava pinch/pan, dugme za uklapanje, pretragu tastaturom i oporavak iz prazne pretrage uz 4× CPU throttle. Kod sirovog CDP drag-a Chromium potiskuje sledeći compatibility click, pa je dugme za uklapanje u tom testu aktivirano zasebnim pravim click događajem. Dodir posle prevlačenja ostaje obavezna fizička proba.

TEST modeli u izolovanom pregledu nisu upisani u Convex. Njihovi linkovi provereni su kao ciljevi odgovarajućih model ruta; ti izmišljeni modeli ne moraju postojati na tim rutama. Pravi tok QR → model → „Na mapi“ nije proglašen produkcijski testiranim dok je javna mapa isključena. Njegov URL ugovor pokriven je unit testovima za oba stanja prekidača, a fokus proverom direktnog linka u DEV prikazu.

## Snimci

Svi snimci su u `C:\My Stuff\Posao\ScanMe\Site\scanme-amf-pasos\output\amf-mapa\`.

| Stanje | 375×812 | 390×844 |
| --- | --- | --- |
| Početni pregled | `overview-375x812.png` | `overview-390x844.png` |
| Izabrani izlagač | `selected-375x812.png` | `selected-390x844.png` |
| Spisak | `directory-375x812.png` | `directory-390x844.png` |
| Učitavanje | `loading-375x812.png` | `loading-390x844.png` |
| Heat | `heat-375x812.png` | `heat-390x844.png` |
| Prazno | `empty-375x812.png` | `empty-390x844.png` |
| Greška | `error-375x812.png` | `error-390x844.png` |

Dodatni snimci: `overview-360x640.png`, `overview-430x932.png`, `desktop-1280x900.png`, `electromobility-regression-390x844.png`.

Pre promene sačuvani su `before-current-375x812.png` (stari DEV prikaz elektromobilnosti, tadašnji podaci pregleda) i `before-prototype-375x812.png` (rani Čair prototip). To su vizuelne reference, ne poređenje istih podataka piksel-za-piksel. Razvojni Next indikator je skriven na završnim QA snimcima, bez promene aplikacije.

## Kako otvoriti lokalno

```powershell
Set-Location -LiteralPath 'C:\My Stuff\Posao\ScanMe\Site\scanme-amf-pasos'
npm.cmd run dev -- --port 3227
```

Osnovni pregled: <http://localhost:3227/dev/sajam-mapa>.

Korisne adrese:

- izabran izlagač: <http://localhost:3227/dev/sajam-mapa?stand=hala-1>;
- spisak: <http://localhost:3227/dev/sajam-mapa?pogled=spisak>;
- učitavanje: <http://localhost:3227/dev/sajam-mapa?stanje=ucitavanje>;
- prazno: <http://localhost:3227/dev/sajam-mapa?stanje=prazno>;
- greška: <http://localhost:3227/dev/sajam-mapa?stanje=greska>;
- stari događaj: <http://localhost:3227/dev/sajam-mapa?dogadjaj=elektromobilnost-2026>.

Server se zaustavlja sa `Ctrl+C`. Ako je već pokrenut u ovom checkout-u, koristi postojeći port; Next ne dozvoljava dva dev servera nad istim checkout-om.

Za ponavljanje browser provere, u drugom terminalu iz istog foldera:

```powershell
node scripts/events/verify-amf-map.mjs http://127.0.0.1:3227
```

Skript koristi instalirani Edge i lokalni DEV server. Presreće samo heat odgovor u svom browseru i snima TEST stanja. Običan DEV pregled za živi heat koristi postojeći gateway/DEV događaj; kada nema dovoljno podataka, pokazuje odgovarajuće prazno stanje. Osnovni fixture pregled ne zahteva novi env ili seed.

## Commit-i i šta još treba uraditi

- `84ebbb4` — `feat(fair): derive map progress and AMF place labels`
- `570a61a` — `feat(fair): redesign the AMF visitor map around paper and progress`
- `b1b2a86` — `test(fair): add AMF preview states and browser verification`
- Ovaj izveštaj i završni QA artefakti su u zasebnom završnom docs commitu; vidi `git log -1` pri predaji.

Autor novih commit-a je `Aleksa Đorđević <aleksadjor3@gmail.com>`.

**Nije potreban novi env, promena šeme ili Convex deploy za ovaj frontend rad.** Nije rađen push, deploy ili upis u Convex deployment. `FAIR_PUBLIC_MAP_ENABLED` ostaje `false`. `public/prototip/` nije menjan, stage-ovan niti commit-ovan; postojeći rad na pasošu je sačuvan.

Za stvarno javno uključivanje ostaju postojeći produkcijski uslovi: potvrđen i objavljen katalog/raspored, konačna AMF ScanMe lokacija ako se želi taj punkt, pa zasebna odluka o uključivanju javne mape. Ovaj rad to ne uključuje samostalno.

Otvorena pitanja za završnu pripremu događaja: da li su organizatorski poligoni sa 30. septembra i dalje konačni, gde je potvrđen ScanMe punkt i koliko je brendova zaista na svakoj deljenoj AMF lokaciji. TEST pozicije pet brendova služe lokalnom pregledu i nisu tvrdnja o stvarnom rasporedu.

## Kratka proba na fizičkom telefonu

1. Otvori DEV URL preko `Network` adrese koju ispiše Next, sa telefona na istoj Wi-Fi mreži. Proveri da se cela hala vidi odmah, sa otvorenom adresnom trakom i sistemskim bezbednim zonama.
2. Dodirni male i velike punktove, uključi/isključi heat, približi sa dva prsta, prevuci, pa jednim dodirom vrati ceo prikaz.
3. Otvori/zatvori detalj više puta; probaj dugme, prevlačenje i povratak, kao i duži spisak modela.
4. Proveri „Spisak“ → izlagač → fokus na mapi, pretragu sa srpskim dijakriticima i pretragu bez rezultata.
5. Proveri sopstvena stanja 0/M, N/M i završeno sa stvarnim DEV pasošem kada odgovarajući katalog bude dostupan. Ne menjati produkcijske podatke zbog probe.
6. Uključi smanjeno kretanje i probaj direktan `?stand=` link; zatim slabiju vezu/prekid veze i ponovni pokušaj.
7. Pre javnog uključivanja proveri stvarni QR → model → „Na mapi“ tok sa odobrenom DEV konfiguracijom i konačnim katalogom.
