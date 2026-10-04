# ScanMe × Sajam automobila 2026 — backend handoff za AI agenta

> Status: **ZAKLJUČAN ZA DELEGIRANJE — B0 JE PRVI DOZVOLJENI KODNI KORAK**
>
> Poslednje ažuriranje: 2. oktobar 2026.
> Vlasnik proizvodnih odluka i finalni go/no-go: **Aleksa**
> Backend vlasnik: **Jovan**
> Rok za prvu produkcijski upotrebljivu verziju: **9. oktobar 2026.**
> Polazna grana: `codex/sajam-automobila-2026`
> Kanonski proizvodni dokument: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md)
> Operativni paket za unos podataka: [`DATA-INTAKE-SPEC.md`](./DATA-INTAKE-SPEC.md)
> Obavezna delta pre nastavka B0/B3/B5: [`JOVAN-DELTA-2026-10-02.md`](./JOVAN-DELTA-2026-10-02.md)

`MASTER-KONTEKST.md` definiše proizvod i poslovna/UX pravila. Ovaj dokument definiše tehničku implementaciju tih pravila. Jovan i njegov AI agent moraju dobiti i pročitati oba dokumenta. Ako se dokumenti ili kod razilaze, ne biraj tumačenje i ne menjaj pravilo samostalno: zaustavi sporni deo i vrati konflikt komandnom centru.

Preporučeni profil rada za ovaj nalog:

- model: `gpt-6-astra`;
- effort: `high` kao podrazumevani, `xhigh` za reviziju šeme, authz/PII granice i retention;
- režim: običan coding/default režim po checkpoint-ima; ne ostajati u Plan režimu nakon što je B0 ugovor pregledan;
- ne koristiti slabiji model za arhitekturu, migracije, PII, email idempotency ili produkcijski gate.

## 0. Tvoj zadatak

Jovan i njegov AI agent su jedini vlasnici sajamske Convex šeme i backend implementacije za:

- događaje, učešća postojećih ScanMe klijenata, brendove, štandove i izložene modele;
- anonimni identitet posetioca;
- paket i entitlement pravila;
- QR skeniranja i analitiku;
- ocene, Glas publike, ankete i pasoš brenda;
- leadove `Zainteresovan sam` i `Probna vožnja`;
- email potvrde i Napredni follow-up;
- javne backend projekcije za model, mapu i garažu;
- dnevne preseke, izvoz podataka i retention/purge poslove.

Ne pravi izlagački nalog, dashboard ili self-service. Ne pravi dupli `fairExhibitors` model klijenata i ne pravi paralelni QR sistem. ScanMe tim unosi sadržaj i šalje izveštaje. Javni frontend radi drugi tok rada i mora da koristi tvoj tipizirani ugovor umesto paralelnog modela.

Prvo napravi i objavi backend ugovor i testiranu osnovu. Ne pokušavaj da u jednom ogromnom commitu završiš ceo sistem.

## 1. Obavezno pre bilo kakve izmene

Pročitaj u celosti, ovim redom:

1. `AGENTS.md`
2. `docs/events/sajam-automobila-2026/MASTER-KONTEKST.md`
3. `convex/_generated/ai/guidelines.md`
4. `convex/schema.ts`
5. `convex/convex.config.ts`
6. `convex/lib/access.ts`
7. `convex/lib/rateLimits.ts`
8. postojeće QR/access tokove u `convex/cards.ts`, `convex/adminProducts.ts`, `convex/lib/accessValidators.ts`, `convex/lib/accessResolution.ts` i `/r/[cardCode]` Next ruti
9. postojeće Resend obrasce u `convex/activationRequestEmails.ts` i `convex/menuInquiryEmails.ts`

Važeća pravila:

- Sve što je u master dokumentu označeno kao `ZAKLJUČANO` je zahtev, ne predlog.
- Za `OTVORENO` ne izmišljaj poslovnu odluku. Napravi lako promenljiv tehnički seam ili prijavi blokadu.
- Pročitaj aktuelnu Next.js dokumentaciju iz `node_modules/next/dist/docs/` pre dodavanja route handlera.
- Sve Convex funkcije koriste object form, `args` i `returns` validatore.
- Indeksirani upiti i ograničeni rezultati su obavezni. Nema neograničenog `.collect()` ni N+1 čitanja.
- Public funkcija postoji samo kada je stvarno potrebna klijentu. PII, izveštaji, administracija i pomoćne funkcije ostaju `internal` ili zahtevaju `requireAdmin`.
- Ne uvodi novu bazu, auth sistem, mail servis ili paket kada postojeći Convex, Auth, rate-limiter i Resend obrasci rešavaju potrebu.
- Ne menjaj postojeće ADMIN, Links, Venue, Memories, Menu ili Ordering ponašanje osim kada je minimalna zajednička izmena neophodna za ovaj backend.

## 2. Git i Convex radno okruženje

Kolega radi na drugom računaru. Početak:

```powershell
git fetch origin
git switch --track origin/codex/sajam-automobila-2026
git switch -c codex/sajam-backend-2026
npm.cmd install
npx.cmd convex dev
```

Ako lokalna `codex/sajam-automobila-2026` već postoji:

```powershell
git switch codex/sajam-automobila-2026
git pull --ff-only
git switch -c codex/sajam-backend-2026
```

Convex pravila:

- Poveži se na postojeći team/project `aleksadjor3 / scanme`, ali koristi svoj razvojni deployment.
- `dev:perfect-ant-98` je razvojni deployment ovog računara; ne prepisuj tuđi `.env.local` i ne vezuj se ručno za taj deployment.
- `npx.cmd convex dev --once` je dozvoljen tek nakon lokalnog type/test prolaza i samo ka tvom DEV deploymentu.
- `npx.cmd convex deploy`, produkcijska migracija, pravljenje stvarnih 100 QR kodova, seed, reset ili brisanje produkcijskih podataka nisu dozvoljeni bez nove eksplicitne saglasnosti vlasnika.
- Ne commituj `.env.local`, ključeve, tokene ili export baze.

Pre prve izmene zabeleži u komentaru/statusu:

- branch i `git rev-parse --short HEAD`;
- naziv ciljnog Convex deploymenta;
- koje postojeće korisničke izmene ostavljaš netaknute.

## 3. Granica odgovornosti i dozvoljeni fajlovi

Primarno smeš da menjaš/dodaš:

- `convex/schema.ts`
- `convex/convex.config.ts` samo za potrebne server env deklaracije
- `convex/crons.ts` samo za sajamske zakazane poslove
- `convex/fair*.ts`
- `convex/lib/fair*.ts`
- `convex/fair*.test.ts`
- `lib/fair-contract.ts`
- `lib/fair-entitlements.ts`
- `app/api/fair/**` samo kada je server gateway potreban za anonimni token, PII ili izvoz
- `.env.example` samo sa nazivima novih promenljivih, bez vrednosti
- dokumentaciju ugovora unutar ovog event foldera

Ne menjaj bez koordinacije:

- javni event UI, mapu, garažu ili dizajn;
- prelaunch stranicu;
- postojeće generičke tabele nevezanih proizvoda; minimalne aditivne izmene `accounts`, admin read modela i postojećeg QR/access resolvera jesu potrebne, ali ne smeju menjati ponašanje drugih ScanMe proizvoda;
- postojeća poslovna pravila drugih ScanMe proizvoda;
- prodajne PDF-ove;
- untracked fajlove u `.tmp/` i `output/pdf/`.

Nove event-specifične tabele dobijaju prefiks `fair`. Postojeći `accounts`, `businesses`, `accountContacts`, `brands`, `cards`, `cardTargets`, `accessSubjects`, `accessChannels` i `digitalQrCodes` ostaju autoritet za klijente, brendove i QR identitete. Fair tabele ih povezuju sa event funkcionalnostima; ne kopiraju ih.

## 4. Zaključani poslovni ugovor

### 4.1 Nivoi paketa

Koristi tačno tri vrednosti:

```ts
type FairPackageTier = "included" | "starter" | "advanced";
```

Prava moraju da budu definisana jednom u `lib/fair-entitlements.ts`. UI, mutacije i izveštaji čitaju isti ugovor.

| Pravo | included | starter | advanced |
|---|---:|---:|---:|
| javna stranica modela | da | da | da |
| čuvanje/poređenje u lokalnoj garaži | da | da | da |
| ukupna i jedinstvena skeniranja štanda | da | da | da |
| analitika po modelu | ne | da | da |
| ukupna ocena 1–5 | ne | da | ne — zamenjena sa 3 dimenzije |
| `Zainteresovan sam` | ne | da | da |
| Glas publike po sajamskom danu | 0 | 1 pitanje | do 5 pitanja |
| dnevni presek | ne | da | da |
| prijava za probnu vožnju | ne | ne | da |
| odvojene ocene izgleda/specifikacija/cene | ne | ne | da |
| dodatna anketa | ne | ne | da |
| automatizovani follow-up posle sajma | ne | ne | da |
| sponzorisana rotacija mapa/displeji | ne | ne | da |
| sponzorisana rotacija u garaži | ne | ne | da |

Nadogradnja je samo `included -> starter -> advanced`. Nema spuštanja tokom sajma. Promena važi od trenutka aktivacije. Plaćene interakcije se ne stvaraju retroaktivno, ali ranija skeniranja ostaju u analitici.

Advanced nasleđuje Starter poslovne pogodnosti osim samog rating oblika: nema ukupnu četvrtu ocenu i ne računa se izvedeni overall. Prihvata samo opcione `appearance`, `specifications` i `price` ocene.

Ako se Starter nadogradi na Advanced tokom dana, tog dana ukupno može imati pet pitanja Glasa publike, uključujući već iskorišćeno Starter pitanje.

### 4.2 Anonimni identitet

- Next `/r/[cardCode]` handler pri prvom scan-u, odnosno event bootstrap gateway pri direktnoj poseti, generiše najmanje 256 bita kriptografski nasumičnog `visitorToken`-a.
- Raw token se čuva samo kao first-party `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Nema naloga, instalacije ni preuzimanja fajla; frontend JavaScript ne čita token.
- Raw token se nikada ne upisuje u Convex tabelu.
- Next server gateway računa domen-specifično saltovan/HMAC hash tokena i Convexu prosleđuje samo `visitorHash`.
- Isti identitet važi kroz oba sajma; garaža i pasoš/progres se razdvajaju po događaju.
- Email i telefon nisu identitet. Nema fingerprintinga.
- Brisanje browser storage-a ili private mode stvaraju nov identitet; to je prihvaćeno ograničenje V1.
- Cookie ističe najkasnije 16. novembra 2026. Server-side purge briše mapiranje/hash i sve visitor-linkable source redove.

Javne Convex mutacije koje primaju `visitorHash` ne smeju da vraćaju PII niti da omogućavaju čitanje tuđeg stanja. Hash proveri kao lowercase 64-char hex. Raw token sme da prođe samo kroz Next server route i ne sme da se loguje.

Raw token se ne šalje iz klijentskog JavaScript-a. Gateway ga čita iz HttpOnly cookie-ja, nikada iz URL/query parametra, računa hash i poziva Convex. Route handler proverava same-origin zahtev za write akcije, ograničava veličinu tela, postavlja `Cache-Control: no-store` i u greškama ne ispisuje token ili kontakt. Javni model/katalog readovi kojima identitet nije potreban mogu direktno da koriste Convex query.

### 4.3 Garaža

Garaža se ne čuva u Convexu. Frontend lokalno čuva samo identifikatore sačuvanih modela, po događaju. Backend daje:

- javne kartice modela za poznate ID-eve;
- javnu ravnopravnu rotaciju Advanced modela;
- podatke za eksplicitni PDF/email izvoz kada taj task dođe na red.

Nikada ne dodaj sponzorisani model automatski u garažu. `Pogledaj` i `Dodaj u garažu` su dve eksplicitne akcije.

### 4.4 Leadovi i PII

- `interest` je Starter+.
- `test_drive` je samo Advanced.
- Probna vožnja je zahtev; nema izbora termina.
- Osnovno pravilo je ime i najmanje jedan od `email`/`phone`. Konfiguracija modela može za probnu vožnju zahtevati email, telefon ili oba; preferirani kanal bez oznake `required` nije obavezan.
- Posetilac mora eksplicitno da prihvati jednu saglasnost. Ako odbije, kontakt se ne čuva i email se ne šalje.
- Aktivna saglasnost imenuje ScanMe i konkretan business/izlagača kome se podaci prosleđuju.
- Kontakt ide ScanMe timu; izlagač nema panel.
- Posetilac dobija jednu neposrednu potvrdu.
- Advanced može imati jedan poslesajamski follow-up, zakazan 24–48 sati nakon relevantnog događaja.
- Potvrda navodi da korisnik odgovorom na ScanMe email može otkazati taj follow-up. Admin suppression se proverava neposredno pre slanja.
- Leadovi moraju biti isporučeni do 15. novembra 2026.
- Svi PII i visitor-linkable source redovi trajno se brišu 16. novembra 2026. Nema dodatnog grace perioda niti lokalne PII arhive.

ScanMe priprema pravni nacrt, ali lead tok ne ide u produkciju dok finalna saglasnost/politika ne prođu stručnu proveru. Tehnički model je: ScanMe prikuplja i prosleđuje kontakt imenovanom izlagaču, koji je posle predaje odgovoran za svoje dalje korišćenje. Bezbedan kanal i primalac izvoza konfigurišu se po izlagaču.

## 5. Predloženi model podataka

Nazivi ispod su ugovor za implementaciju. Odstupi samo ako stvarna šema pokaže dokaziv tehnički problem; tada prvo napiši razlog.

### 5.1 Katalog

#### `fairEvents`

Polja:

- `code`, `slug`, `title`, `venueName`, `timezone` (`Europe/Belgrade`)
- `startsAt`, `endsAt`, `status: draft | published | live | ended | archived`
- `garagePriority`
- `piiPurgeAt` sa zaključanom vrednošću 16. novembar 2026. za oba događaja
- `minimumPublicVoteCount: 5`
- `robotsIndexable: false` za V1
- `createdAt`, `updatedAt`

Indeksi:

- `by_code`
- `by_slug`
- `by_status_and_startsAt`

#### `fairEventDays`

- `eventId`, `dateKey` (`YYYY-MM-DD` u event zoni), `label`, `startsAt`, `endsAt`, `sortOrder`
- indeks `by_eventId_and_dateKey`

#### Postojeći klijent i `fairParticipations`

Ne uvodi `fairExhibitors`. Izlagač je postojeći `account` + `business` + `accountContact`, a brend je postojeći `brands` zapis.

Aditivno proširi account/admin projekcije nezavisnim poljem:

- `clientSegment: standard | event_only` — opciono u widen fazi; odsutno znači `standard` radi kompatibilnosti;
- redovni Clients upiti isključuju `event_only`, dok ih `Događaji` čita kroz event projekciju;
- admin akcija `convertEventClientToStandard` patchuje isti account/projekciju i ostavlja business, kontakt, QR i istoriju netaknute.

`fairParticipations`:

- `externalKey`, `eventId`, `accountId`, `businessId`;
- opciono `primaryContactId`, `reportRecipientEmail`, `leadDeliveryNote`;
- `status: draft | active | withdrawn`, `createdAt`, `updatedAt`;
- indeksi `by_eventId_and_externalKey`, `by_eventId_and_businessId`, `by_accountId_and_eventId`.

Jedan business može učestvovati na oba događaja kroz dva participation reda. Logo i identitet brenda dolaze iz postojeće `brands` tabele; event-specifična podešavanja pasoša pripadaju participation/event konfiguraciji, ne duplom globalnom brendu.

#### `fairStands`

- `eventId`, `participationId`, `externalKey`, `code`, `displayName`, `mapLocationId`, `status`
- `createdAt`, `updatedAt`
- indeksi `by_eventId_and_externalKey`, `by_eventId_and_participationId`, `by_eventId_and_mapLocationId`

#### `fairEventModels`

- `externalKey`
- `eventId`, `participationId`, postojeći `brandId`, `standId`
- `slug`
- `displayName`, opciono `variant`
- `priceText` sa fallbackom `Cena na upit`
- `specifications: Array<{ id: string; groupId: string; groupLabel: string; groupOrder: number; label: string; value: string; order: number; isHighlight: boolean }>`; najviše četiri stavke po modelu mogu biti highlight
- opciono `photoStorageId` ili odobreni `photoUrl`
- `packageTier`, `packageActivatedAt`
- `passportEligible`
- `status: draft | published | withdrawn`
- `sortOrder`, `createdAt`, `updatedAt`

Indeksi:

- `by_eventId_and_slug`
- `by_eventId_and_externalKey`
- `by_eventId_and_standId`
- `by_eventId_and_brandId`
- `by_eventId_and_packageTier`

#### `fairQrAssignments`

Povezuje unapred napravljen postojeći QR identitet sa event modelom:

- `eventId`, `eventModelId`, `accessChannelId`, `accessSubjectId`, `cardId`, `resolverCode`;
- `status: assigned | released`, `assignedAt`, opciono `releasedAt`;
- `assignedByUserId`, opciono `releasedByUserId`, `reason`;
- indeksi `by_eventModelId_and_status`, `by_accessChannelId_and_status`, `by_eventId_and_status`.

Dodela/oslobađanje i novi immutable target/history zapis nastaju atomski. Aktivni channel ili model mogu imati najviše jednu aktivnu dodelu.

#### `fairPackageActivations`

- `eventModelId`, `eventId`, `fromTier`, `toTier`, `activatedAt`
- `actorUserId`, opciono `note`
- indeks `by_eventModelId_and_activatedAt`

Aktivacija i audit zapis moraju nastati u istoj mutaciji. QR identitet/dodela se ne menjaju pri package upgrade-u.

#### Postojeći QR/access ugovor — aditivna izmena

- Proširi `cardTargetKind` sa `fair_model` i `cardTargets` opcionim `fairEventModelId`; validator mora sprečiti target bez odgovarajućeg ID-a.
- Access destination priprema/rezolucija dobija event-aware input koji vodi do tog targeta, bez zaobilaženja `accessDestinationHistory`.
- `/r/[cardCode]` ostaje jedina štampana ulazna ruta i vraća čitljivu event-model destinaciju.
- Dodela koristi postojeće `cards`, `accessSubjects`, `accessChannels` i `digitalQrCodes` napravljene pod internim account/business inventarom `Sajam automobila 2026 — QR inventar`.
- Postojeći batch limit je 50: 100 kodova se kasnije, uz eksplicitnu produkcijsku saglasnost, prave u dve proverljive serije od 50.
- Ne menjaj vlasništvo postojećeg QR asseta pri dodeli modelu. `fairQrAssignments` povezuje inventarski asset sa participation/model kontekstom.

### 5.2 Identitet i scan događaji

#### `fairVisitors`

- `visitorHash`, `firstSeenAt`, `lastSeenAt`
- jedinstveni indeks `by_visitorHash`

Ovo je privremeni pseudonimni izvor za unique/upsert ponašanje, ne trajni profil. Redovi se brišu u PII purge-u 16. novembra.

#### `fairScanEvents`

- `requestId`, `visitorId`, `eventId`, `eventModelId`, `standId`, `brandId`
- `occurredAt`, `dateKey`, `hourKey`
- `isAdminExcluded`, opciono server-derived `adminUserId`
- indeksi `by_requestId`, `by_eventModelId_and_occurredAt`, `by_standId_and_occurredAt`, `by_eventId_and_occurredAt`

`requestId` obezbeđuje idempotentnost jednog QR ulaska. Refresh ili novo fizičko skeniranje dobija nov `requestId` i računa se kao novo ukupno skeniranje. React render/retry sa istim `requestId` ne pravi duplikat.

Sva skeniranja se računaju 24/7 osim kada server iz autentifikovane ScanMe sesije utvrdi da je skener admin. Ne prihvataj javni `isAdmin` boolean. U V1 ne filtriraj fair metrike po radnom vremenu, `deviceCategory`, bot/preview klasifikaciji ili lokaciji. Postojeće generičko ponašanje drugih card metrika ostaje nepromenjeno.

Postojeći `/r/[cardCode]` resolver proširi `fair_model` targetom i event hook-om tako da isti `requestId` u istoj transakciji upiše generički card događaj i najviše jedan fair scan. Ne pravi drugi javni scan endpoint u redirect odredištu. Čitljiva stranica modela beleži `view`, ne scan.

#### `fairUniqueScans`

- `visitorId`, `eventId`, `eventModelId`, `firstScannedAt`, `lastScannedAt`, `totalScanCount`
- indeks `by_visitorId_and_eventModelId` mora davati najviše jedan red
- indeks `by_eventModelId_and_firstScannedAt`

Prvi neadministratorski red za kombinaciju posetilac+model uvećava unique metriku. Svaki neadministratorski `fairScanEvents` red uvećava total. Admin-excluded događaj može ostati kratkoročni audit za testiranje, ali ne ulazi u metrike i briše se sa ostalim visitor-linkable izvorima.

#### `fairMetricCountShards`

- `key`, `shard`, `value`
- indeks `by_key_and_shard`

Koristi zaseban sajamski sharded-counter helper, po uzoru na `convex/lib/countShards.ts`, za vruće brojače: scan total/unique po modelu, štandu, danu i satu; broj opcija glasanja; count/sum ocena. Ne koristi postojeću `memoriesCountShards` tabelu.

Raw događaji i odgovor/ocena redovi su izvor istine. Shards su čitalačka projekcija. Svaka promena glasa/ocene primenjuje korektan negativni i pozitivni delta u istoj transakciji.

### 5.3 Ocene, pitanja i ankete

#### `fairRatings`

- `visitorId`, `eventId`, `eventModelId`
- opciono `overall`
- opciono `appearance`, `specifications`, `price`
- `createdAt`, `updatedAt`
- indeks `by_visitorId_and_eventModelId` (jedna ocena)
- indeks `by_eventModelId_and_updatedAt`

Starter prihvata tačno `overall`. Advanced ne prihvata `overall`, već bilo koju nepraznu kombinaciju `appearance`, `specifications`, `price`; sve tri dimenzije su pojedinačno opcione. Ne računaj izvedeni overall. Ponovni unos patchuje isti red i korektno ažurira agregate samo za poslate dimenzije.

Visitor projekcija vraća isključivo ocene tog posetioca za dati model. Javni endpoint nikada ne vraća zbirni prosek ili broj ocena. Count/sum/prosek ostaju admin/report projekcija za izlagača, odvojena od javnog modela i visitor state-a.

#### `fairAudienceQuestions`

- `eventId`, `eventDayId`, `eventModelId`
- `prompt`, `options: Array<{ id: string; label: string; order: number }>` sa najmanje dve opcije
- `status: draft | published | closed`
- `sortOrder`, `startsAt`, opciono `endsAt`
- `showOnSponsoredRotation`
- `createdAt`, `updatedAt`
- indeksi `by_eventModelId_and_eventDayId`, `by_eventDayId_and_status`

Admin publish mutacija proverava dnevni entitlement: Starter najviše 1, Advanced najviše 5. Na dan nadogradnje već postojeće pitanje se računa u limit 5.

Samo jedno pitanje po Advanced modelu može biti ručno označeno za map/display rezultat. Javni rezultat se otkriva od 5 glasova; ispod praga projekcija vraća `Glasanje je u toku` stanje bez procenta.

Kada published pitanje dobije prvi glas, njegov prompt i opcije su nepromenljivi. Ispravka koja menja smisao pravi novo pitanje/ID i počinje od nule; stari rezultat ostaje u istoriji.

#### `fairAudienceVotes`

- `visitorId`, `eventId`, `eventModelId`, `questionId`, `optionId`
- `createdAt`, `updatedAt`
- indeks `by_visitorId_and_questionId` (jedan promenljiv glas)
- indeks `by_questionId_and_updatedAt`

Promena glasa patchuje red i pomera brojače sa stare na novu opciju. Novo pitanje ima sopstveni ID i počinje od nule; prethodno ostaje u istoriji.

#### `fairSurveys`

- `eventId`, `eventModelId`, `title`, `status`
- `questions: Array<{ id; prompt; kind: yes_no | single_choice; options; required; order }>`
- `version`
- `createdAt`, `updatedAt`
- indeks `by_eventModelId_and_status`

Najviše pet pitanja. U V1 pitanja su opciona, ali submit zahteva najmanje jedan odgovor.

#### `fairSurveyResponses`

- `submissionId`, `visitorId`, `eventId`, `eventModelId`, `surveyId`
- `answers`, `submittedAt`
- indeksi `by_submissionId`, `by_surveyId_and_submittedAt`, `by_visitorId_and_surveyId`

Napravi idempotentnost po `submissionId`. Jedan visitor može finalno poslati jednu verziju ankete za model; nakon uspešnog submit-a odgovor se ne menja. Rezultati nisu javni.

Published verzija ankete koja već ima odgovore ne menja pitanja/opcije u mestu. Nova struktura dobija novu verziju kako stari odgovori ne bi promenili značenje.

### 5.4 Leadovi i email

#### `fairConsentConfigs`

- `eventId`, `leadKind: interest | test_drive`, `version`, `text`
- `status: draft | active | retired`, `activatedAt`, `createdAt`, `updatedAt`
- indeks `by_eventId_and_leadKind_and_status`
- indeks `by_eventId_and_leadKind_and_version`

Klijent šalje samo da je korisnik prihvatio i verziju koju je prikazao. Server učitava aktivnu konfiguraciju i sam upisuje tačan `consentTextSnapshot`; ne veruje proizvoljnom tekstu iz browsera. Dok pravni tekst nije odobren i jedna verzija aktivirana, lead mutacija mora vratiti kontrolisani `CONSENT_NOT_CONFIGURED` i ne sme čuvati PII.

#### `fairLeadConfigs`

- `eventModelId`, `leadKind: interest | test_drive`;
- `contactRequirement: one_of | email | phone | both`;
- opciono `preferredContact: email | phone`, bez uticaja na validaciju kada nije required;
- `enabled`, `updatedByUserId`, `createdAt`, `updatedAt`;
- jedinstveni indeks `by_eventModelId_and_leadKind`.

#### `fairLeads`

- `submissionId`
- `kind: interest | test_drive`
- `visitorId`, `eventId`, `eventModelId`, `participationId`
- `contactName`, opciono `email`, `phone`; server proverava aktivni `fairLeadConfigs`
- `consentAccepted: true`, `consentVersion`, `consentTextSnapshot`, `consentedAt`
- `status: received | delivered`, opciono `deliveredAt`
- `followUpSuppressed`, opciono `suppressedAt`, `suppressedByUserId`
- `createdAt`, `purgeAt` postavljen na 16. novembar 2026.
- indeksi `by_submissionId`, `by_eventModelId_and_createdAt`, `by_participationId_and_createdAt`, `by_status_and_purgeAt`

`submissionId` je idempotency key. Mutacija u istoj transakciji proverava entitlement, contact requirement i aktivnu saglasnost, upisuje lead i zakazuje potvrdu. Ne dozvoli `consentAccepted: false` kao sačuvan lead.

#### `fairMessageTemplates`

- `eventModelId`, `kind: immediate_confirmation | post_event_follow_up`
- `subject`, `plainText`, opciono `html`
- `status: draft | active | retired`, `version`, `createdAt`, `updatedAt`
- indeks `by_eventModelId_and_kind_and_status`

Izlagač može da dostavi follow-up tekst, ali ga unosi ScanMe admin. Nijedan proizvoljan HTML iz javnog klijenta ne ulazi u email.

#### `fairEmailDeliveries`

- `dedupeKey`, `leadId`, `kind: immediate_confirmation | post_event_follow_up | exhibitor_delivery | daily_report`
- `recipient`, `status: queued | sent | failed | suppressed`
- `scheduledFor`, `attemptCount`, opciono `providerMessageId`, `lastError`
- `createdAt`, `updatedAt`
- indeksi `by_dedupeKey`, `by_status_and_scheduledFor`, `by_leadId_and_kind`

Slanje radi Node `internalAction` preko postojećeg Resend seam-a. Svaka poruka ima stabilni Resend `Idempotency-Key`. Ne šalji direktno iz mutacije. Mutacija kreira outbox/delivery red i scheduler pokreće action.

Follow-up se zakazuje jednom 24–48 sati nakon relevantnog događaja. Neposredno pre slanja ponovo učitaj lead i odbaci slanje ako je `followUpSuppressed`. Reply-based zahtev za otkazivanje ScanMe admin evidentira kroz authz-protected suppression mutaciju. Nema newsletter unsubscribe stanja jer nema narednih kampanja.

Potrebno je pre oslanjanja na email dokazati u ciljnom DEV deploymentu da postoje `RESEND_API_KEY` i `RESEND_FROM_EMAIL`, bez ispisivanja njihovih vrednosti.

### 5.5 Pasoš brenda

#### `fairPassportStamps`

- `visitorId`, `eventId`, `brandId`, `eventModelId`, `scannedAt`
- indeks `by_visitorId_and_eventId_and_brandId`
- indeks `by_visitorId_and_eventModelId`

Dodaj `fairPassportConfigs` i zasebne bounded `fairPassportEligibleModels` redove. Pasoš se može objaviti samo ako brend ima najmanje dva modela i svi tada izloženi modeli imaju Starter ili Advanced. Eligible skup se zamrzava pre otvaranja. Hitna admin mutacija sme da ukloni povučeni model bez brisanja postojećih pečata.

Scan modela idempotentno dodaje pečat samo ako je model u objavljenom eligible skupu. Ne oslanjaj se na broj scan događaja.

#### `fairBrandFavoriteVotes`

- `visitorId`, `eventId`, `brandId`, `eventModelId`
- `createdAt`, `updatedAt`
- indeks `by_visitorId_and_eventId_and_brandId` (jedan promenljiv favorit)
- indeks `by_eventId_and_brandId`

Favorite se može postaviti tek kada backend utvrdi da je posetilac skenirao sve zaključane eligible modele brenda. Favorit je promenljiv. Javni zbirni favorite rezultat ima prag 5; ispod njega vrati korisnikov izbor i `waiting_for_minimum` bez procenta. Visitor passport projekcija mora da podrži model stranicu, garažu i mapu: katalog svih aktivnih pasoša, eligible modele, lični `N/M` progres, kompletirano stanje i izabrani favorit.

### 5.6 Izveštaji i retention

#### `fairReportRuns`

- `eventId`, `eventDayId`, `participationId`
- `status: queued | building | pending_review | approved | sent | failed`
- `dataThrough`, `format: pdf | xlsx | csv`, opciono `storageId`, `recipient`, `providerMessageId`, `error`
- opciono `reviewedByUserId`, `reviewedAt`, `approvedByUserId`, `approvedAt`, `correctionOfReportRunId`
- `createdAt`, `updatedAt`
- indeks `by_eventDayId_and_participationId`, `by_status_and_createdAt`

Dataset mora biti spreman do 60 minuta nakon kraja dana, sa dnevnim i satnim scanovima i od drugog dana kratkim poređenjem sa prethodnim. Generisanje je automatsko, ali slanje je zabranjeno pre ručnog pregleda i odobrenja. Podrži PDF i XLSX/CSV, resend i korigovanu verziju. PII lead export je zaseban artefakt; organizer export je agregatan bez PII i poverljivih survey redova. Izveštaj ne sme da meša participation/business podatke.

Retention posao:

- automatski počinje 16. novembra 2026. i radi u ograničenim batch-evima;
- pre produkcije mora imati DEV dry-run/preview i fixture-proven test, ali izvršenje na zaključani datum ne čeka naknadni grace period;
- hard-deleteuje `fairLeads`, PII email delivery/outbox redove, consent snapshotove, suppression, `fairVisitors` i sve visitor-linkable raw scan/rating/vote/survey/passport/favorite redove;
- redosled batch-eva mora sačuvati referencijalnu mogućnost brisanja i završiti bez orphan PII;
- ne briše nepovratno anonimizovane count/sum agregate i report agregate bez PII;
- vodi samo operativni audit: start, kraj, kategorija, broj obrisanih redova i status, bez identifikatora/contact vrednosti;
- mora biti bezbedan za retry i nastaviti od poslednjeg završenog batch-a.

### 5.7 Sponzorisani snapshot i konverzije

#### `fairSponsoredSnapshots` i `fairSponsoredSnapshotItems`

- snapshot: `eventId`, `version`, `dayKey`, `seed`, `status: draft | published | retired`, `publishedAt`, `publishedByUserId`;
- item: `snapshotId`, `eventModelId`, `order`, opciono `audienceQuestionId`;
- objavljivanje ručno formira novu immutable listu svih trenutno published Advanced modela, stabilno izmešanu po dayKey/seed-u;
- indeksi moraju omogućiti jedan aktivni snapshot po eventu i bounded čitanje itema po redu.

#### `fairSponsoredEvents`

- `requestId`, `eventId`, `eventModelId`, `surface: map | display | garage`;
- `kind: open_model | garage_add`, `occurredAt`, `dateKey`, `hourKey`;
- opciono `visitorId` za dedupe/upis pre purge-a;
- indeksi po requestId, modelu/vremenu i eventu/vremenu.

Pasivni prikaz nije događaj i ne upisuje se ni za mapu/displej ni za garažu. `open_model` i `garage_add` postoje samo za eksplicitne akcije u garažnoj sponzorisanoj traci, nikada ne pozivaju QR scan pipeline i posle PII purge-a ostaju samo agregati. Mapa/displej nema sponsored event write.

## 6. Tipizirani ugovor koji frontend čeka

Pre frontend integracije napravi `lib/fair-contract.ts` kao čist TypeScript modul bez React/Next/Node zavisnosti. Mora da izveze:

- `FairPackageTier`
- `FairEntitlements`
- `FairPublicModel`
- `FairModelCapabilities`
- `FairAudienceQuestionView`
- `FairAudienceResultView`
- `FairRatingState`
- `FairPassportState`
- `FairSponsoredModelCard`
- `FairLeadKind`
- `FairClientSegment`
- `FairReportStatus`
- stabilne error code unije

`FairPublicModel` najmanje sadrži:

```ts
type FairPublicModel = {
  id: string;
  eventId: string;
  eventSlug: string;
  participationId: string;
  exhibitorName: string;
  brandId: string;
  brandName: string;
  standId: string;
  standMapLocationId: string;
  slug: string;
  displayName: string;
  variant?: string;
  priceText: string;
  specificationGroups: Array<{
    id: string;
    label: string;
    order: number;
    items: Array<{
      id: string;
      label: string;
      value: string;
      order: number;
      isHighlight: boolean;
    }>;
  }>;
  photoUrl?: string;
  capabilities: FairModelCapabilities;
};
```

Capabilities dolaze sa servera, npr. `ratingMode: none | overall | dimensions`, `canSubmitInterest`, `canRequestTestDrive`, `hasAudienceQuestions`, `hasSurvey`, `isSponsored`. Frontend ne poredi string paketa da bi sam zaključio prava.

Publish validacija dozvoljava najviše četiri `isHighlight: true` specifikacije po modelu. Redosled grupa i stavki dolazi sa servera; frontend ih ne preslaguje po nazivu. Fotografija ostaje opciona.

Ne stavljaj korisnički tekst greške u ugovor. Vrati stabilan code (`FAIR_MODEL_NOT_FOUND`, `FEATURE_NOT_ENTITLED`, `CONSENT_REQUIRED`, `RATE_LIMITED`, `SUBMISSION_DUPLICATE`, `EVENT_NOT_ACTIVE`) i detalje koji nisu PII; frontend ih mapira kroz typed i18n sloj.

## 7. Potrebna funkcijska površina

Tačna imena mogu minimalno da se prilagode postojećem stilu, ali odgovornosti ne smeju da se spoje u jednu ogromnu datoteku.

### `convex/fairPublic.ts`

Public, read-only, bez PII:

- `getEventBySlug`
- `getModelBySlug`
- `getModelsByIds` — bounded, npr. maksimalno 50 ID-eva za lokalnu garažu
- `listAudienceQuestionsForModel`
- `getAudienceQuestionResult`
- `getSponsoredMapRotation`
- `getSponsoredGarageRotation`
- `getPassportCatalog`
- `getMyPassportProgress` ili server-gateway ekvivalent za bounded visitor state

Sponzorisane projekcije vraćaju samo modele iz ručno objavljenog Advanced snapshot-a, sa seed/version/epoch vrednostima potrebnim za dnevno stabilan ravnopravan round-robin. Mapa koristi slot 12s, garaža 8s. Backend vraća fallback logo/event placeholder kada fotografija nedostaje i podatak za ručno izabrani audience rezultat ili `Glasanje je u toku` stanje. Projekcije ne vraćaju niti obećavaju impression metriku.

### `convex/fairInteractions.ts`

Public write površina bez PII čitanja:

- `getMyModelState` ili server-gateway ekvivalent
- `upsertRating`
- `upsertAudienceVote`
- `submitSurvey`
- `upsertBrandFavorite`
- `recordSponsoredAction` (`open_model | garage_add`, samo eksplicitna garažna akcija)

QR scan nije zasebna javna funkcija ove datoteke: postojeći `cards.resolveAndRecord` dobija minimalni fair hook i isti requestId. Time se fizički scan ne može slučajno duplirati sa model page load-om.

Svaka mutacija:

1. validira hash/token gateway format i input granice;
2. učitava published event-model preko indeksa;
3. server-side proverava entitlement;
4. primenjuje rate-limit po visitoru i akciji;
5. upisuje source row i projekciju u istoj transakciji;
6. vraća samo podatke potrebne UI-ju.

Visitor-specifično čitanje (`getMyModelState`, moj glas, moja ocena, moj pasoš) ide kroz isti `POST` server gateway kako hash identiteta ne bi završio u URL-u, analytics alatima ili browser cache ključevima.

### `convex/fairLeads.ts` i `convex/fairEmails.ts`

- public/server-gateway `submitLead`
- internal `getConfirmationEmailData`
- internal mutatione za `markSent`/`markFailed`
- Node internal action za slanje potvrde
- internal zakazivanje i slanje Advanced follow-upa
- internal/admin export leadova po izlagaču i eventu, paginiran
- admin suppression follow-upa pre zakazanog slanja

Kontakt se nikad ne vraća javnoj query funkciji. Nemoj dozvoliti da anonimni visitor hash služi kao ključ za čitanje kontakta.

### `convex/fairAdmin.ts`

Sve funkcije zahtevaju `requireAdmin`:

- upsert event/day/participation/stand/model uz link ka postojećem account/business/contact/brand zapisu
- create/list event-only klijenta i `convertEventClientToStandard` bez kopiranja podataka
- list/manage QR inventory, atomski assign/release QR-a i resolve test
- publish/withdraw model
- upgrade package
- upsert/publish/close audience question
- upsert/publish survey
- set sponsored-result question
- publish sponsored snapshot nakon ručne izmene Advanced liste
- dry-run i commit import
- list validation issues
- build/review/approve/send/retry report i email poslove
- preview retention obuhvata bez vraćanja PII u log

Admin mutacije moraju biti idempotentne preko `externalKey`/stabilnih ključeva i ne smeju menjati QR kod postojećeg modela.

### `convex/fairAnalytics.ts` i `convex/fairReports.ts`

- internal/admin bounded metric queries po eventu, izlagaču, štandu, modelu, danu i satu
- daily dataset po participation/business-u
- Advanced detalji za ratings/votes/survey/test-drive
- Starter ne dobija Advanced kolone kao lažne nule; projekcija jasno označava koja prava postoje
- report build/review/approve/send orkestracija; send odbija sve osim `approved`
- organizer aggregate bez PII i poverljivih survey odgovora

## 8. Interni import format

Pošto podaci stižu telefonom, emailom i kroz različite materijale, obezbedi jedan verzionisan JSON format. Ne pravi izlagački formular.

Minimalna struktura:

```json
{
  "version": 1,
  "eventCode": "...",
  "participations": [
    {
      "externalKey": "...",
      "accountExternalKey": "...",
      "businessExternalKey": "...",
      "clientSegment": "event_only",
      "reportEmail": "...",
      "brands": [
        {
          "externalKey": "...",
          "name": "...",
          "stand": {
            "externalKey": "...",
            "code": "...",
            "mapLocationId": "..."
          },
          "models": [
            {
              "externalKey": "...",
              "displayName": "...",
              "variant": "...",
              "priceText": "...",
              "packageTier": "included",
              "assignedResolverCode": "...",
              "specifications": [
                { "label": "Snaga", "value": "...", "order": 1 }
              ],
              "photoUrl": "...",
              "passportEligible": true
            }
          ]
        }
      ]
    }
  ]
}
```

Import mora imati:

- `dryRun` koji vraća greške i upozorenja bez upisa;
- `commit` koji radi idempotentni upsert po event+externalKey;
- hard error za nepostojeći/konfliktni account-business-brand link, dupli aktivni QR assignment, slug ili externalKey u eventu;
- upozorenje/fallback kada cena ili fotografija nedostaju;
- validaciju da stand mapLocationId postoji u ugovoru sa mapom pre finalnog publish-a;
- nikada automatsko izmišljanje specifikacije, cene ili fotografije.

Import ne generiše novi paralelni QR kod. `assignedResolverCode` mora da referencira postojeći slobodan channel/card iz event QR inventara. Kasnija izmena modela ne menja resolver kod; eventualna reassignment akcija ostavlja audit istoriju.

## 9. Rate-limit i zaštita od duplikata

Dodaj sajamske buckete u postojeći `convex/lib/rateLimits.ts`; vrednosti dokumentuj aritmetikom, ne osećajem. Početne vrednosti agent sme da predloži, ali mora da ih potvrdi kroz test opterećenja pre produkcije.

Minimalno odvojeni bucketi:

- `fairScan` — po visitor hash-u; dovoljno širok za obilazak hale
- `fairRating` — po visitoru
- `fairAudienceVote` — po visitoru
- `fairSurveySubmit` — po visitoru
- `fairLeadSubmit` — po visitoru i modelu, stroži
- opciono gateway/IP bucket samo ako se sirov IP ne čuva i zajednički sajamski NAT ne može da blokira legitimne posetioce

Zaštita od duplikata nije isto što i rate-limit:

- scan: `requestId`
- lead: `submissionId`
- email: `dedupeKey` + Resend idempotency key
- rating: unique visitor+model upsert
- vote: unique visitor+question upsert
- favorite: unique visitor+event+brand upsert

## 10. Analitika — definicije koje testovi moraju da zaključaju

- 10 scanova istog QR-a istog visitora = 10 total, 1 unique.
- Autentifikovani scan Alekse/Jovana/Teodore = 0 total i 0 unique u fair metrici; javni boolean ne može da aktivira ovo izuzeće.
- Svaki drugi scan se računa 24/7, bez event-hour ili bot filtera.
- Isti visitor drugi model = novi unique za taj model.
- Isti visitor isti model na drugom eventu = drugi event-model, dakle zaseban unique.
- Identičan `requestId` retry = bez novog total ili unique.
- Direktno otvaranje modela iz garaže/sponzorisane kartice nije QR scan.
- Promena ratinga ne povećava count; menja sum/prosek.
- Javni model/visitor state nikada ne vraća count/sum/prosek ocena; ti agregati su dostupni samo admin/report čitanjima.
- Promena audience glasa smanjuje staru i povećava novu opciju; total broj glasača ostaje isti.
- Lead nastao pre upgrade-a se ne pretvara retroaktivno u Advanced lead.
- Scan pre upgrade-a ostaje vidljiv u kasnijoj model analytics projekciji.
- Besplatni nivo dobija zbir ukupnih i jedinstvenih skeniranja štanda, ne redove po modelu.
- Starter dobija model analytics i dnevni presek.
- Advanced dobija sve Starter podatke plus svoje dodatne interaction podatke.

`dateKey` i `hourKey` se prikupljaju od početka. Dnevni izveštaj uključuje satnu raspodelu i od drugog dana kratko poređenje sa prethodnim danom.

## 11. Redosled implementacije i checkpoint-i

### B0 — ugovor i šema

Isporuka:

- `lib/fair-contract.ts`
- `lib/fair-entitlements.ts`
- fair validatori
- tabele i indeksi
- aditivni `clientSegment`, admin projection i `fair_model` QR target ugovori
- schema/entitlement testovi
- kratak `FAIR-BACKEND-CONTRACT.md` generisan/održavan iz stvarne funkcijske površine

Checkpoint: commituj i pushuj pre business mutacija, da frontend može da krene prema stabilnim tipovima.

### B1 — postojeći klijenti, katalog, import i admin komande

- event/day/participation/stand/model CRUD povezan sa postojećim account/business/contact/brand zapisima
- event-only filtriranje i konverzija u standard klijenta
- dry-run/commit import
- inventar, atomska QR dodela/release i stabilni `/r/[cardCode]` identitet
- package upgrade + audit istorija
- publish validation

### B2 — anonimni identitet i scan pipeline

- server hash gateway
- visitor upsert
- minimalna izmena postojećeg resolvera: jedan requestId, generički + fair zapis bez dupliranja
- server-derived admin exclusion i idempotent total/unique scan 24/7
- passport stamp
- scan metric projections
- javni model resolver

### B3 — ocene, Glas publike, anketa i pasoš

- entitlement-gated upsert tokovi
- promena ocene/glasa
- bounded rezultati/projekcije
- kompletiranje pasoša i favorite glas

### B4 — leadovi i email

- schema/outbox prvo
- interest i test-drive gating
- consent snapshot
- jedna potvrda
- DEV Resend proof
- follow-up seam, bez produkcijskog uključivanja pre legal/copy odluka

### B5 — sponsored/read projekcije

- mapa/displej Advanced lista
- rezultat iz eksplicitno izabranog pitanja
- garaža Advanced lista
- ručno objavljen immutable snapshot, dnevno stabilan ravnopravan redosled
- 12s mapa/display i 8s garaža preko zajedničkog epoch ugovora; animacija ostaje frontend
- samo `open_model` i `garage_add` događaji iz garaže, odvojeni od QR skena; nema pasivnog impression događaja ni map/display write-a

### B6 — analitika i dnevni dataset

- tačne aggregate funkcije
- dnevni/satni segmenti
- export po izlagaču
- report run lifecycle
- ručni review/approve gate pre slanja, correction/resend i odvojeni PII export

### B7 — retention, hardening i integracioni dokaz

- bounded retry-safe purge svih PII i visitor-linkable source redova 16. novembra
- authz pregled svih public funkcija
- performance/read-limit pregled
- end-to-end test sa realističnim seed-om oba eventa

Svaka faza dobija zaseban commit. Ne nastavljaj na sledeću ako prethodna nema prolazne ciljane testove.

## 12. Obavezni testovi

Koristi `convex-test`; registruj rate-limiter komponentu kao postojeći testovi.

Najmanje pokriti:

### Entitlements i aktivacije

- sva prava sva tri paketa;
- zabranu downgrade-a;
- neposredan upgrade;
- limit 1/5 audience pitanja i upgrade usred dana;
- ne-retroaktivnost paid interakcija;
- očuvanje ranijih scanova.

### Identitet i scanovi

- raw token se ne pojavljuje u tabelama;
- visitor upsert po hash-u;
- request retry je idempotentan;
- postojeći `/r/[cardCode]` upisuje najviše jedan fair scan uz isti generički scan;
- admin session je isključena bez javnog override-a;
- non-admin scanovi se računaju van radnog vremena i bez bot filtera;
- total/unique definicije;
- dva event-modela istog komercijalnog modela su razdvojena;
- passport stamp se ne duplira.

### Interakcije

- Starter rating prihvata samo overall; Advanced prihvata samo tri opcione dimenzije i nikad overall;
- visitor javno dobija samo svoj rating state; count i proseci dostupni su samo admin/report projekcijama;
- vote upsert i tačan counter delta;
- javni rezultati ostaju skriveni do 5 glasova, uz očuvan sopstveni odgovor;
- survey samo Advanced, najviše 5 pitanja, najmanje jedan odgovor i bez izmene posle submit-a;
- favorite tek po kompletiranom pasošu;
- pokušaj funkcije bez entitlementa vraća stabilan code, bez parcijalnog upisa.

### Leadovi/email

- odbijena saglasnost ne pravi lead;
- interest Starter+, test drive samo Advanced;
- submission retry ne duplira lead ni email;
- immediate potvrda tačno jednom;
- follow-up samo za Advanced i tačno jednom;
- suppressed lead ne dobija follow-up;
- public funkcije ne vraćaju kontakte;
- purge batch ne prelazi limit, briše sve PII/visitor-linked izvore i ne dira ne-PII agregate.

### Izveštaji i izolacija

- izlagač A nikada ne dobija model/lead/odgovor izlagača B;
- event-only klijent nije u standard Clients listi, a konverzija ne duplira nalog/business/kontakt/QR;
- included vidi samo stand total i unique;
- Starter/Advanced projekcije odgovaraju ugovoru;
- day/event granice koriste `Europe/Belgrade`, ne lokalnu zonu servera;
- report send odbija `pending_review`, a prihvata samo ručno `approved`;
- sponzorisani snapshot prikazuje svaki Advanced model jednom pre ponavljanja i sve display instance računaju isti slot;
- query pagination/cap ponašanje na većem seed-u.

## 13. Verifikacija pre svakog push-a

Minimalno:

```powershell
npx.cmd tsc --noEmit
npx.cmd vitest run convex/fair*.test.ts
npm.cmd run check
git diff --check
```

Pre DEV Convex push-a:

```powershell
npx.cmd convex dev --once
npx.cmd convex function-spec
```

Ako puna komanda ne prihvati shell glob, navedi test fajlove eksplicitno. Ne tvrdi da je nešto provereno ako komanda nije zaista prošla.

Za svaki checkpoint izvesti:

- commit SHA;
- promenjene fajlove;
- ciljni DEV deployment;
- tačne komande i rezultat;
- javne/internal funkcije koje su dodate;
- migraciju/seed koji je pokrenut, ako je vlasnik prethodno odobrio;
- otvorena pitanja ili odstupanja od ovog dokumenta.

## 14. Produkcijski gate

Backend nije spreman za produkciju dok sve ispod nije dokazano:

- realni QR svakog test modela otvara tačan published model;
- `/r/[cardCode]` ne duplira fair scan i ostaje retargetable bez ponovne štampe;
- package capabilities server vraća tačno;
- total/unique scan test prolazi;
- rating/vote izmene ne dupliraju podatke;
- lead ima odobren consent tekst i retention pravilo;
- Resend env i sender su provereni bez izlaganja tajni;
- email retry ne šalje duplikate;
- dnevni dataset ne meša izlagače;
- Advanced sponsored projekcije sadrže samo validne published modele;
- pasivno prikazivanje sponzorisanog modela ne pravi događaj; prihvataju se samo garažne akcije `open_model` i `garage_add`;
- izveštaj ne može da se pošalje pre ručnog odobrenja;
- purge dry-run/test dokazuje potpuno brisanje PII uz očuvanje anonimnih agregata;
- javne funkcije ne otkrivaju PII ni admin podatke;
- realan mobile scan tok testiran je bar jednom pre otvaranja hale;
- seed za test 8. oktobra pokriva oba eventa, najmanje 2 izlagača, 10 modela i sva 3 paketa na Androidu, iPhoneu i display rezoluciji;
- produkcijski deployment je posebno odobren.

## 15. Otvorene odluke koje agent ne sme da izmisli

### Blokiraju produkciju leadova

1. Konačni tekst saglasnosti i privacy policy.
2. Bezbedan kanal i tačni primaoci PII izvoza po izlagaču.
3. Finalni tekst immediate potvrde i jednog follow-upa.

### Ne blokiraju B0–B3, ali moraju biti popunjene pre stvarnog sadržaja

1. Stvarni account/business/contact/brand linkovi izlagača.
2. Modeli, specifikacije, cene, fotografije i paketi.
3. Pitanja Glasa publike, ankete i ručno izabrani sponsored rezultat.
4. Vizuelni template PDF/XLSX izveštaja.

Za sadržajne tačke pripremi validiran import/admin seam, ali ne izmišljaj podatke niti javni tekst. Dodaj nedostajuće stavke u status izveštaj vlasniku.

## 16. Zabranjeno

- Nema visitor naloga, prijave, fingerprintinga ili identifikacije emailom/telefonom.
- Nema exhibitor dashboarda ili naloga.
- Nema `fairExhibitors` duplikata postojećih account/business/contact klijenata.
- Nema novog paralelnog QR resolvera, sajamskog QR tokena ili scan endpointa koji zaobilazi `/r/[cardCode]`.
- Nema duplog brojanja jednog fizičkog resolver requesta.
- Nema izbora termina probne vožnje.
- Nema glasanja na mapi.
- Nema automatskog dodavanja modela u garažu.
- Nema personalizacije sponsored rotacije po srodnosti.
- Nema pasivne sponsored impression metrike, čak ni kada je kartica ili mapa vidljiva.
- Nema online kupovine paketa.
- Nema retroaktivnog otključavanja interakcija.
- Nema fotografije/specifikacije/cene koju je agent izmislio.
- Nema neograničenih query čitanja i per-row join petlji.
- Nema produkcijskog deploya, resetovanja ili brisanja bez eksplicitne saglasnosti.
- Nema menjanja/fomatiranja nevezanog postojećeg koda.
- Nema tvrdnje „vlasnik je odobrio” ako odluka nije u master dokumentu ili novoj poruci.

## 17. Prvi konkretan zadatak za agenta

Pošto pročitaš sve reference, uradi samo B0:

1. potvrdi postojeće stanje grane/deploymenta;
2. napravi čist tipizirani ugovor i centralni entitlement katalog, uključujući Advanced rating zamenu;
3. dizajniraj aditivni `clientSegment`, fair participation model, QR assignment i `fair_model` target bez duplih klijenata ili QR sistema;
4. dodaj fair tabele/indekse i validatore bez seeda/migracije live podataka;
5. napiši schema/entitlement testove;
6. pokreni verifikacije;
7. commituj kao mali checkpoint i pushuj svoju backend granu;
8. pošalji vlasniku funkcijsku/tabelarnu površinu i sve konflikte ili otvorene odluke.

Ne prelazi na B1 dok vlasnik/integracioni tok ne pregleda B0 ugovor. Ovo je namerna kontrolna tačka: frontend i ostatak backenda zavise od istih tipova i prava.
