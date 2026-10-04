# ScanMe Sajam automobila 2026 - frontend integration plan

> Status: **PRVI MODEL-PAGE VERTICAL SLICE OTKLJUČAN**
>
> Poslednje ažuriranje: **2. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
>
> Backend ugovor: [`BACKEND-HANDOFF.md`](./BACKEND-HANDOFF.md)
>
> UI/UX ugovor u pripremi: [`EVENT-DESIGN-SYSTEM.md`](./EVENT-DESIGN-SYSTEM.md)

Ovaj dokument razlaže javni frontend na ograničene zadatke, beleži stvarno stanje repozitorijuma i definiše integracione granice sa Jovanovim backend radom. Ne menja poslovna pravila iz master dokumenta i ne daje agentima pravo da sami zaključaju vizuelni stil.

Ako se dokumenti ne slažu, važi sledeći red autoriteta:

1. `MASTER-KONTEKST.md` - proizvod i poslovna pravila;
2. `BACKEND-HANDOFF.md` - backend i ugovor podataka;
3. `EVENT-DESIGN-SYSTEM.md` - javni UI/UX nakon Aleksinog zaključavanja;
4. ovaj dokument - podela frontend implementacije.

Kontradikcije se ne rešavaju pretpostavkom. Vraćaju se komandnom centru.

## 1. Stvarno stanje repozitorijuma

Provereno 1-2. oktobra 2026.

### Postoji

- Stabilni štampani ulaz `app/r/[cardCode]/route.ts` poziva postojeći `cards.resolveAndRecord` i server-side preusmerava korisnika.
- `/r/[cardCode]` već generiše server request ID, određuje kategoriju uređaja i koristi no-store redirect ponašanje.
- DEV prototip mape postoji u `app/dev/sajam-cair/`.
- Prototip mape već podržava pan, pinch zoom, izbor štanda, filter, izbor ulaza, putanju, tastaturu i reduced-motion.
- Tekst prototipa je u typed i18n sloju `lib/i18n/sr/event-map.ts`.
- Projekat već ima GSAP, Framer Motion, Radix primitive, Lucide, Sonner i potrebne lokalno učitane fontove.
- Produkcijski build, namespace gate i golden harness trenutno prolaze.

### Ne postoji

- Produkcijska `/sajam/...` javna ruta.
- Produkcijska stranica sajamskog modela.
- Zajednički event shell i navigacija mapa/garaza/pasos.
- Browser store za garazu.
- Frontend gateway za anonimni fair visitor token.
- UI za ocene, Glas publike, anketu, leadove, pasos i sponzorisane rotacije.
- Produkcijski data-driven prikaz mape; trenutni standovi i brendovi su hardkodovani u DEV komponenti.
- Produkcijski fino podešen event dizajn-sistem; V5 baseline jeste zaključan za prvi slice.
- Jovanov B0 tipizirani fair ugovor na zajednickoj grani.

### Važna posledica

DEV mapa nije komponenta koju samo treba prebaciti u produkciju. Njena geometrija i gesture logika mogu da budu osnova, ali podaci, shell, mobilna hijerarhija, stil tokeni i backend capabilities moraju da se odvoje od prototipa.

## 2. Granica vlasništva

### Jovan i njegov AI agent - isključivo backend

Jovan je jedini vlasnik:

- `convex/` sajamske šeme, indeksa, funkcija, projekcija, poslova i testova;
- `lib/fair-contract.ts`;
- `lib/fair-entitlements.ts`;
- fair validatora;
- `fair_model` proširenja postojećeg QR resolvera;
- `app/api/fair/**` server gateway ruta kada obrađuju anonimni token, PII ili izvoz;
- anonimnog server identiteta, hash gateway-a, autorizacije, rate limita i PII logike;
- admin podataka, izveštaja, emaila i retention poslova.

Frontend agent ne menja ove fajlove čak ni kada mu deluje da je promena mala.

### Komandni centar / Aleksa - javni proizvod

Komandni centar zaključava:

- event dizajn-sistem i javni shell;
- informacionu arhitekturu i rute;
- sadržaj i typed i18n;
- podelu frontend modula;
- kasniji audit mape, integracioni ugovor i stilsko usklađivanje. Produkcijsku mapu implementira kolega i ovaj tok je ne preuzima.
- integracionu proveru sa Jovanovim ugovorom;
- finalni produkcijski go/no-go.

### Obavezno pravilo integracije

Frontend ne poredi `free`, `starter` ili `advanced` da bi sam izračunao prava. Renderuje isključivo server-projektovane `capabilities` iz `FairPublicModel` i pratećih view tipova.

## 3. Predložena arhitektura javnog frontenda

Ovo je tehnički predlog, ne odobren finalni raspored fajlova.

```text
app/sajam/
  [eventSlug]/
    page.tsx                 # mapa / event home
    model/
      [modelSlug]/
        page.tsx             # javna stranica modela
        glas-publike/page.tsx
        anketa/page.tsx
  garaza/page.tsx            # zajednička garaza sa dva event taba
  garaza/poredjenje/page.tsx # poređenje najviše dva modela

components/fair/
  shell/
  model/
  map/
  garage/
  rating/
  audience/
  survey/
  leads/
  passport/
  sponsored/
  states/

lib/fair-client/
  garage-store.ts
  garage-store.test.ts
  rotation-slot.ts
  rotation-slot.test.ts
  errors.ts

lib/i18n/sr/
  fair-shell.ts
  fair-model.ts
  fair-map.ts
  fair-garage.ts
  fair-interactions.ts
```

Pravila:

- Server Component je podrazumevan za početno javno čitanje.
- `use client` postoji samo na granici interakcije, browser storage-a, gesture mape ili lokalne animacije.
- Nijedan novi korisnički tekst ne ostaje inline; dodaje se u typed dictionary sloj.
- Shared shell, tokeni i primitive imaju jednog vlasnika. Feature agent ih koristi, ne kopira.
- Javni fair CSS tokeni ne koriste `--links-*`, `--venue-*`, `--menu-*` ili prelaunch namespace.
- Finalni namespace se zaključava pre prvog produkcijskog CSS-a, predlog je `--fair-*`.

## 4. Rute i navigacija

Master je zaključao čitljive URL-ove pod:

- `/sajam/elektromobilnost-2026/...`
- `/sajam/auto-moto-fest-2026/...`

### ZAKLJUČANO

| Površina | Predložena ruta | Napomena |
|---|---|---|
| mapa / event home | `/sajam/[eventSlug]` | javna, mobile-first, display varijanta istih podataka |
| model | `/sajam/[eventSlug]/model/[modelSlug]` | cilj postojećeg `/r/[cardCode]` resolvera |
| Glas publike | `/sajam/[eventSlug]/model/[modelSlug]/glas-publike` | zaseban full-screen tok |
| anketa | `/sajam/[eventSlug]/model/[modelSlug]/anketa` | zaseban kratki tok |
| garaža | `/sajam/garaza` | jedna površina sa dva event taba |
| poređenje | `/sajam/garaza/poredjenje` | eksplicitno poređenje najviše dva modela |

Pasoš nema zasebnu javnu rutu u V1. Progres se prikazuje na modelu, svi aktivni pasoši u garaži, a eligibility i lični `N/M` na mapi. Format display moda ostaje tehnički detalj koleginog map toka.

Sve javne event rute u V1 imaju `noindex`. Ne smeju biti slučajno preusmerene na prelaunch početnu stranu u produkciji.

## 5. Data flow ugovor

### 5.1 QR ulaz

```text
fizički QR
  -> GET /r/[cardCode]
  -> cards.resolveAndRecord (jedan requestId)
  -> generički card događaj + najviše jedan fair scan
  -> 302 na čitljivu stranicu modela
  -> stranica modela beleži view, nikada drugi scan
```

Frontend ne uvodi `/api/fair/scan`, `recordScan` effect niti drugi mehanizam koji scan beleži pri renderu.

### 5.2 Početno čitanje

- Server učitava published event/model kroz Jovanovu read funkciju.
- Neprosleđeni ili unpublished model dobija javno, razumljivo not-found stanje.
- `FairPublicModel.capabilities` upravlja vidljivim funkcijama.
- Fotografija je opciona; model stranica ne sme da ima slomljen hero kada je nema.
- Cena se prikazuje iz `priceText`; fallback dolazi iz odobrenog podatka, ne iz frontend nagađanja.

### 5.3 Visitor-specifične akcije

- Raw visitor token ostaje u `HttpOnly`, `Secure`, `SameSite=Lax` cookie-ju.
- Client JavaScript ne dobija raw token i ne stavlja hash/token u URL.
- Ocena, glas, pasoš, anketa i lead koriste server `POST` gateway prema B0/B2 ugovoru.
- UI nikada ne prikazuje success pre uspešnog odgovora.
- Retry koristi istu bezbednu semantiku koju backend podržava; ne izmišlja client-side idempotency pravila.

### 5.4 Sponzorisane rotacije

- Backend vraća ručno objavljeni snapshot, seed/version/epoch i bounded kartice.
- Client iz tih podataka računa aktivni slot; ne poll-uje backend na svakih 8 ili 12 sekundi.
- Mapa/display koristi slot od 12 sekundi.
- Garaža koristi slot od 8 sekundi i pauzira lokalnu prezentaciju tokom interakcije.
- Pasivno prikazivanje se ne beleži ni na mapi/displeju ni u garaži.
- U garaži su `Pogledaj` (`open_model`) i `Dodaj u garažu` (`garage_add`) jedine sponzorisane konverzije i nikad nisu scan. Mapa/displej nema sponsored write.

## 6. Lokalni model garaže

### Zaključano ponašanje

- Bez naloga, prijave, instalacije i automatskog preuzimanja.
- Stanje se automatski čuva u first-party browser storage-u.
- Dva event taba; aktivni događaj ima prednost.
- PDF/email postoje samo kao izričite akcije korisnika.
- Brisanje browser podataka ili private mode mogu da uklone garažu.

### ZAKLJUČAN ciljni V2 zapis za sledeću implementacionu fazu

Sačuvati versioned, ne-PII dokument:

```ts
type FairGarageDocument = {
  version: 2;
  events: Record<
    string,
    Array<{
      modelId: string;
      savedAt: number;
      lastKnown?: {
        eventSlug: string;
        modelSlug: string;
        brandName: string;
        displayName: string;
        priceText: string;
        photoUrl?: string;
      };
    }>
  >;
  passportBadges: Array<{
    eventId: string;
    brandId: string;
    brandName: string;
    brandLogoUrl?: string;
    favoriteModelId: string;
    savedAt: number;
  }>;
};
```

Razlog za `lastKnown`: garaža ostaje čitljiva pri privremenom mrežnom problemu i jasno označava da podaci možda nisu sveži. Kada mreža radi, `getModelsByIds` je izvor istine i osvežava prikaz. Store ne sadrži visitor token, ocene, glasove, lead kontakt ili saglasnost. V1 -> V2 migracija mora sačuvati sve postojeće modele i dodati praznu `passportBadges` kolekciju.

Pravila implementacije:

- jedan stabilan storage ključ sa eksplicitnom verzijom;
- bounded broj ID-eva usklađen sa backend limitom, trenutno planirano najviše 50 po read pozivu;
- dedupe po `eventId + modelId`;
- `Dodaj` je idempotentno, `Ukloni` eksplicitno;
- ne rušiti celu garažu zbog jednog više neobjavljenog modela;
- storage parse greška vraća prazno bez rušenja stranice i čuva mogućnost da se nečitljiv payload dijagnostikuje samo lokalno;
- `storage` event osvežava drugi tab istog browsera, ali cross-device sync ne postoji.

## 7. Frontend radni paketi

### F0 - zajednički event shell i tokeni

**Status:** otključano 2. oktobra 2026. za prvi model-page vertical slice.

Isporučuje:

- fair token sloj;
- javni header/navigation;
- page/container primitive;
- loading, empty, error, offline i retry primitive;
- typed i18n module i test da nema inline novih stringova u fair površini.

Ne radi:

- backend;
- funkcionalnosti paketa;
- mapu i model detalje.

### F1 - browser garaža core

**Status 2. oktobra:** core je implementiran u `lib/fair-client/garage-store.ts` sa unit testovima. Nema UI, backend hydration niti export.

**Može početi posle:** potvrde tehničkog zapisa gore; ne čeka kompletan vizuelni stil.

Isporučuje:

- pure TypeScript store i migraciju verzije;
- add/remove/dedupe/event tabs;
- corrupt-payload fallback;
- cross-tab sync;
- unit testove.

Ne radi:

- PDF/email export;
- sponsored UI;
- backend model hydration adapter dok B0 nije dostupan.

### F2 - frontend adapter za visitor gateway

**Čeka:** Jovan B0+B2.

Isporučuje:

- typed client adapter koji poziva Jovanove `app/api/fair/**` gateway rute;
- typed mapiranje backend error code -> i18n poruka;
- adaptere za public read i visitor write;
- test da token/hash nikad ne ulazi u client payload ili URL.

Ne radi:

- server cookie/hash gateway;
- PII obradu;
- Convex funkcije ili fair ugovor.

### F3 - javna stranica modela

**Status:** vizuelna implementacija može početi posle F0 preko tipiziranog fixture adaptera. Produkcijsko čitanje i visitor upisi i dalje čekaju B0+B2.

Isporučuje:

- naziv, varijantu, cenu i fleksibilne specifikacije;
- završeno stanje bez fotografije;
- dodavanje u garažu;
- capability slotove bez lokalnog tier računanja;
- view konverziju odvojenu od scan-a;
- mobile loading/not-found/error stanja.

Prvi slice koristi pravi `/sajam/[eventSlug]/model/[modelSlug]` URL i nije deo javne navigacije. Ruta ostaje `noindex` i ne deployuje se u produkciju bez Aleksinog go/no-go.

### F4 - audit i integracija produkcijske mape kolege

**Čeka:** F0, B0/B1 public event podatke, potvrđenu geometriju i display rezoluciju.

Kolega implementira mapu. Naš task ne preuzima njegov kodni opseg, već proverava da mapa poštuje zajednički contract i event stil.

Isporučuje:

- zajedničke event tokene bez ScanMe zelene kao opšteg akcenta;
- ScanMe zelenu isključivo za ScanMe štand;
- passport eligibility i lični progres `N/M`;
- display composition i Advanced 12s reveal bez impression metrike;
- integracioni i stilski audit na telefonu i stvarnoj display rezoluciji.

### F5 - ocene, Glas publike i anketa

**Status:** vizuelni tok ocena i Glasa publike može da se implementira preko fixture adaptera posle F0. Pravi upisi, rezultati i promena glasa čekaju F2 i Jovan B3.

Isporučuje odvojene tokove:

- Starter overall ocena;
- Advanced tri opcione dimenzije, bez četvrte ukupne ocene;
- izmena postojeće ocene;
- prikaz isključivo sopstvenih ocena posetiocu, bez javnog proseka i broja ocena;
- Glas publike sa promenom glasa i threshold stanjem;
- obična anketa sa finalnim submit-om koji se ne menja;
- progress za najviše pet pitanja;
- retry bez lažnog success-a.

Za Glas publike je zaključano: tap odmah daje pressed/selected feedback; dozvoljeni rezultati se animiraju tek nakon uspešnog odgovora; GSAP timeline sinhronizuje ispunu elementa i rast celobrojnog procenta; promena glasa animira prelaz sa starih na nove vrednosti; reduced-motion odmah prikazuje kraj.

### F6 - `Zainteresovan sam` i probna vožnja

**Čeka:** F0, F2, Jovan B4 i finalnu pravnu proveru teksta.

Isporučuje:

- dve jasno različite forme;
- ime + najmanje jedan kontakt;
- exhibitor-specific required/preferred kanal;
- jednu saglasnost koja imenuje ScanMe i konkretnog izlagača;
- probnu vožnju bez termina;
- neposrednu potvrdu tek nakon uspešnog upisa.

### F7 - brend pasoš

**Čeka:** F0, F2 i Jovan B2/B3.

Isporučuje:

- katalog zaključanih modela;
- osvojene/nedostajuće pečate;
- stanje kompletnog pasoša;
- svi aktivni pasoši u garaži uključujući `0/N`, promenljiv izbor omiljenog modela i eksplicitno lokalno čuvanje badge-a;
- bez fizičke nagrade i bez izmišljanja uslova na clientu.

### F8 - sponzorisane rotacije

**Status 2. oktobra:** pure vremenski slot kalkulator je implementiran u `lib/fair-client/rotation-slot.ts` sa testovima za 12s/8s sinhronizaciju. Snapshot, UI, pause i analitika i dalje čekaju B5 i ostale frontend module.

**Čeka:** F3/F4, browser garažu i Jovan B5.

Isporučuje:

- pure slot kalkulator sa zajedničkom epohom;
- map/display 12s reveal i isticanje štanda;
- garaža 8s karticu sa `Pogledaj` i `Dodaj u garažu`;
- ravnopravan dnevno stabilan redosled;
- fallback bez fotografije;
- samo `open_model` i `garage_add` instrumentaciju iz garažne trake; bez pasivnih impression događaja.

### F9 - garaža UI, poređenje i export ulazi

**Čeka:** F0, F1, F3 i public hydration read.

Isporučuje:

- dva event taba;
- listu sačuvanih modela;
- eksplicitno poređenje najviše dva modela;
- sve aktivne pasoše i lokalno sačuvane passport badge-eve;
- nenametljivu storage/private-mode napomenu;
- PDF/email akcije povezane sa kasnijim server endpointom;
- sponsored traku iz F8.

### F10 - integracioni QA

**Čeka:** sve P0 module.

Obuhvata:

- oba događaja;
- najmanje dva izlagača, deset modela i sva tri paketa;
- pravi `/r/[cardCode]` tok;
- Android, iPhone, 375/390 px i potvrđenu display rezoluciju;
- online, usporena mreža, retry i refresh;
- reduced motion;
- tačne capabilities nakon upgrade-a;
- scan/view i dve garažne sponsored konverzije bez dupliranja i bez pasivnih impression događaja;
- privatnost i odsustvo tokena/PII u URL-u, client logu i error tekstu.

## 8. Šta može da se radi paralelno

Pre B0 checkpointa:

- završiti i zaključati event dizajn-sistem;
- zaključati route IA;
- napraviti wireframe modela, garaže, mape i Glasa publike;
- implementirati F1 pure garage store tek nakon potvrde njegovog zapisa;
- pripremiti typed i18n strukturu bez finalnih marketinških tekstova;
- prikupiti i validirati exhibitors/models CSV podatke.

Posle B0 checkpointa:

- F2 adapter počinje prvi;
- F3 i F4 mogu paralelno kada postoje public read ugovori;
- F5/F6/F7 čekaju svoje backend funkcije, ali koriste isti F0 shell i F2 adapter;
- F8 čeka objavljeni sponsored snapshot ugovor;
- F9 sklapa F1, F3 i F8 bez dupliranja logike.

## 9. Pravila za više agenata

Svaki frontend task mora da navede:

- tačan direktorijum/fajlove koje poseduje;
- koje fajlove ne sme da menja;
- B0/Bn checkpoint koji čeka;
- konkretne input i output tipove;
- user states koje mora da pokrije;
- komande i browser viewportove za proveru.

Zabranjeno:

- dva agenta menjaju event shell ili tokene istovremeno;
- feature agent dodaje lokalne kopije dugmeta, inputa, toast-a ili error state-a;
- frontend agent menja `convex/`, resolver ili fair ugovor;
- agent uvodi inline srpski tekst mimo typed i18n sloja;
- agent koristi DEV hardkodovane standove kao produkcijske podatke;
- agent dodaje novu biblioteku bez dokazive potrebe;
- agent proglašava owner sign-off koji nije dat.

## 10. Checkpointovi

### C0 - produkt spreman za frontend

- master nema kontradikcije;
- route IA zaključan;
- dizajn-sistem status `ZAKLJUČAN`;
- ključni mobile wireframeovi odobreni.

### C1 - backend contract dostupan

- Jovanov B0 je na zajedničkoj grani;
- `lib/fair-contract.ts` i entitlements testovi prolaze;
- nema paralelnog QR ili exhibitor modela;
- frontend može da se kompajlira prema realnim tipovima.

### C2 - vertical slice

Jedan realni QR mora da prođe:

```text
scan -> resolver -> model -> dodaj u garazu -> vrati se u garazu
```

Za Starter model dodatno:

```text
ocena -> zainteresovan sam -> potvrda -> promena ocene
```

Tek nakon ovog dokaza ima smisla širiti sve feature module.

### C3 - kompletan P0

- sva tri paketa;
- oba eventa;
- Glas publike, anketa, pasoš i sponsored rotacije;
- leadovi i test-drive;
- report dataset dostupan adminu;
- pravi telefoni i display.

### C4 - produkcijski go/no-go

Aleksa jedini daje go/no-go nakon QR matrice, browser provere, PII pregleda, error-state provere i backup/rollback procedure.

## 11. Otvorene odluke koje trenutno blokiraju određene module

1. Stvarna rezolucija i orijentacija sajamskih displaya.
2. Finalni pravni tekst saglasnosti pre F6 produkcije.
3. Jovanov B0/B2/B3 ugovor na zajedničkoj grani za produkcijsko povezivanje.

## 12. Sledeći preporučeni potez

Ne počinjati masovno frontend kodiranje. Sledeći bezbedan potez je jedan kontrolisan model-page vertical slice:

1. Implementirati F0 event shell/tokene i jednu pravu `/sajam/.../model/...` rutu sa tipiziranim fixture adapterom.
2. Pregledati prvi ekran u stvarnom browseru pre ostalih interakcija.
3. Implementirati Glas publike, rating sheet, browser garažu i vizuelne lead sheetove bez lažnog backend uspeha.
4. Proveriti sve fixture režime preko diskretnog DEV ulaza na dnu stranice.
5. Tek posle Aleksinog browser odobrenja i Jovanovog B0/B2/B3 povezati produkcijske read/write adaptere.
