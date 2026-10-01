# ScanMe × Sajam automobila 2026 — backend handoff za AI agenta

> Operativni nalog za vlasnika sajamskog Convex backenda.
>
> Datum: 1. oktobar 2026.
> Rok za prvu produkcijski upotrebljivu verziju: **9. oktobar 2026.**
> Polazna grana: `codex/sajam-automobila-2026`
> Polazni commit u trenutku pisanja: `3717f59`
> Kanonski proizvodni dokument: `docs/events/sajam-automobila-2026/MASTER-KONTEKST.md`

Preporučeni profil rada za ovaj nalog:

- model: `gpt-6-astra`;
- effort: `high` kao podrazumevani, `xhigh` za reviziju šeme, authz/PII granice i retention;
- režim: običan coding/default režim po checkpoint-ima; ne ostajati u Plan režimu nakon što je B0 ugovor pregledan;
- ne koristiti slabiji model za arhitekturu, migracije, PII, email idempotency ili produkcijski gate.

## 0. Tvoj zadatak

Ti si jedini vlasnik sajamske Convex šeme i backend implementacije za:

- događaje, izlagače, brendove, štandove i izložene modele;
- anonimni identitet posetioca;
- paket i entitlement pravila;
- QR skeniranja i analitiku;
- ocene, Glas publike, ankete i pasoš brenda;
- leadove `Zainteresovan sam` i `Probna vožnja`;
- email potvrde i Napredni follow-up;
- javne backend projekcije za model, mapu i garažu;
- dnevne preseke, izvoz podataka i retention/purge poslove.

Ne pravi izlagački nalog, dashboard ili self-service. ScanMe tim unosi sadržaj i šalje izveštaje. Javni frontend radi drugi tok rada i mora da koristi tvoj tipizirani ugovor umesto paralelnog modela.

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
8. postojeće Resend obrasce u `convex/activationRequestEmails.ts` i `convex/menuInquiryEmails.ts`

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
- `npx.cmd convex deploy`, produkcijska migracija, seed, reset ili brisanje produkcijskih podataka nisu dozvoljeni bez nove eksplicitne saglasnosti vlasnika.
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
- postojeće generičke `events`, `leads`, `scanEvents` ili `cards` tabele da bi ih na silu prilagodio sajmu;
- postojeća poslovna pravila drugih ScanMe proizvoda;
- prodajne PDF-ove;
- untracked fajlove u `.tmp/` i `output/pdf/`.

Sajamske tabele dobijaju prefiks `fair`. Razlog: postojeće `events`, `leads` i scan tabele već imaju drugačiji tenancy i semantiku; njihovo ponovno korišćenje bi spojilo nepovezane proizvode i povećalo rizik pred rok.

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
| zbirna skeniranja štanda za izlagača | da | da | da |
| analitika po modelu | ne | da | da |
| ukupna ocena 1–5 | ne | da | da |
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

Ako se Starter nadogradi na Advanced tokom dana, tog dana ukupno može imati pet pitanja Glasa publike, uključujući već iskorišćeno Starter pitanje.

### 4.2 Anonimni identitet

- Browser pri prvoj event poseti generiše najmanje 256 bita kriptografski nasumičnog `visitorToken`-a.
- Token se automatski čuva u first-party browser storage. Nema naloga, instalacije ni preuzimanja fajla.
- Raw token se nikada ne upisuje u Convex tabelu.
- Next server gateway računa SHA-256 tokena i Convexu prosleđuje samo `visitorHash`.
- Isti identitet važi kroz oba sajma; garaža i pasoš/progres se razdvajaju po događaju.
- Email i telefon nisu identitet. Nema fingerprintinga.
- Brisanje browser storage-a ili private mode stvaraju nov identitet; to je prihvaćeno ograničenje V1.

Javne Convex mutacije koje primaju `visitorHash` ne smeju da vraćaju PII niti da omogućavaju čitanje tuđeg stanja. Hash proveri kao lowercase 64-char hex. Raw token sme da prođe samo kroz Next server route i ne sme da se loguje.

Token se šalje server gatewayu samo u `POST` telu, nikada u URL/query parametru. Route handler proverava same-origin zahtev, ograničava veličinu tela, postavlja `Cache-Control: no-store` i u greškama ne ispisuje token ili kontakt. Javni model/katalog readovi kojima identitet nije potreban mogu direktno da koriste Convex query.

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
- Posetilac mora eksplicitno da prihvati jednu saglasnost. Ako odbije, kontakt se ne čuva i email se ne šalje.
- Kontakt ide ScanMe timu; izlagač nema panel.
- Posetilac dobija jednu neposrednu potvrdu.
- Advanced može imati jedan poslesajamski follow-up.
- Kontakt podaci se zadržavaju najduže do 15 dana posle završetka drugog sajma.

Finalni pravni tekst, uloge rukovaoca/obrađivača, duže čuvanje dokaza saglasnosti i bezbedan transport izlagaču još nisu zaključani. Implementiraj polja i purge seam, ali ne izmišljaj pravni tekst niti puštaj lead tok u produkciju dok vlasnik ne odobri P0 legalne odluke.

## 5. Predloženi model podataka

Nazivi ispod su ugovor za implementaciju. Odstupi samo ako stvarna šema pokaže dokaziv tehnički problem; tada prvo napiši razlog.

### 5.1 Katalog

#### `fairEvents`

Polja:

- `code`, `slug`, `title`, `venueName`, `timezone` (`Europe/Belgrade`)
- `startsAt`, `endsAt`, `status: draft | published | live | ended | archived`
- `garagePriority`
- opciono `scanWindowStartsAt`, `scanWindowEndsAt`
- opciono `piiRetentionEndsAt`
- opciono `minimumPublicVoteCount`; dok nije eksplicitno podešen, javni procenti ostaju potisnuti
- `createdAt`, `updatedAt`

Indeksi:

- `by_code`
- `by_slug`
- `by_status_and_startsAt`

#### `fairEventDays`

- `eventId`, `dateKey` (`YYYY-MM-DD` u event zoni), `label`, `startsAt`, `endsAt`, `sortOrder`
- indeks `by_eventId_and_dateKey`

#### `fairExhibitors`

- `externalKey`, `displayName`, opciono interni kontakt i email za dostavu izveštaja
- `status`, `createdAt`, `updatedAt`
- indeksi `by_externalKey`, `by_status`

#### `fairBrands`

- `externalKey`, `name`, `slug`, opciono `logoStorageId`/`logoUrl`
- `passportEnabled`, `createdAt`, `updatedAt`
- indeksi `by_externalKey`, `by_slug`

#### `fairStands`

- `eventId`, `exhibitorId`, `externalKey`, `code`, `displayName`, `mapLocationId`, `status`
- `createdAt`, `updatedAt`
- indeksi `by_eventId_and_externalKey`, `by_eventId_and_exhibitorId`, `by_eventId_and_mapLocationId`

#### `fairEventModels`

- `externalKey`
- `eventId`, `exhibitorId`, `brandId`, `standId`
- `slug`, stabilni `qrCode`
- `displayName`, opciono `variant`
- `priceText` sa fallbackom `Cena na upit`
- `specifications: Array<{ label: string; value: string; order: number }>`
- opciono `photoStorageId` ili odobreni `photoUrl`
- `packageTier`, `packageActivatedAt`
- `passportEligible`
- `status: draft | published | withdrawn`
- `sortOrder`, `createdAt`, `updatedAt`

Indeksi:

- `by_qrCode`
- `by_eventId_and_slug`
- `by_eventId_and_externalKey`
- `by_eventId_and_standId`
- `by_eventId_and_brandId`
- `by_eventId_and_packageTier`

#### `fairPackageActivations`

- `eventModelId`, `eventId`, `fromTier`, `toTier`, `activatedAt`
- `actorUserId`, opciono `note`
- indeks `by_eventModelId_and_activatedAt`

Aktivacija i audit zapis moraju nastati u istoj mutaciji. `qrCode` i identitet modela se ne menjaju.

### 5.2 Identitet i scan događaji

#### `fairVisitors`

- `visitorHash`, `firstSeenAt`, `lastSeenAt`
- jedinstveni indeks `by_visitorHash`

#### `fairScanEvents`

- `requestId`, `visitorId`, `eventId`, `eventModelId`, `standId`, `brandId`
- `occurredAt`, `dateKey`, `hourKey`
- `trafficClass: live | test | outside_window | unclassified`
- indeksi `by_requestId`, `by_eventModelId_and_occurredAt`, `by_standId_and_occurredAt`, `by_eventId_and_occurredAt`

`requestId` obezbeđuje idempotentnost jednog QR ulaska. Refresh ili novo fizičko skeniranje dobija nov `requestId` i računa se kao novo ukupno skeniranje. React render/retry sa istim `requestId` ne pravi duplikat.

Dok vlasnik ne zaključa pravila scan prozora, dozvoljeno je zapisati događaj kao `unclassified`, ali ga dnevni izveštaj ne sme ćutke uključiti ili isključiti. Pre integracionog testa mora postojati eksplicitna odluka i test tog filtera.

#### `fairUniqueScans`

- `visitorId`, `eventId`, `eventModelId`, `firstScannedAt`, `lastScannedAt`, `totalScanCount`
- indeks `by_visitorId_and_eventModelId` mora davati najviše jedan red
- indeks `by_eventModelId_and_firstScannedAt`

Prvi red za kombinaciju posetilac+model uvećava unique metriku. Svaki validan `fairScanEvents` red uvećava total.

#### `fairMetricCountShards`

- `key`, `shard`, `value`
- indeks `by_key_and_shard`

Koristi zaseban sajamski sharded-counter helper, po uzoru na `convex/lib/countShards.ts`, za vruće brojače: scan total/unique po modelu, štandu, danu i satu; broj opcija glasanja; count/sum ocena. Ne koristi postojeću `memoriesCountShards` tabelu.

Raw događaji i odgovor/ocena redovi su izvor istine. Shards su čitalačka projekcija. Svaka promena glasa/ocene primenjuje korektan negativni i pozitivni delta u istoj transakciji.

### 5.3 Ocene, pitanja i ankete

#### `fairRatings`

- `visitorId`, `eventId`, `eventModelId`
- `overall`
- opciono `appearance`, `specifications`, `price`
- `createdAt`, `updatedAt`
- indeks `by_visitorId_and_eventModelId` (jedna ocena)
- indeks `by_eventModelId_and_updatedAt`

Starter prihvata samo `overall`. Advanced prihvata overall i odvojene ocene. Ponovni unos patchuje isti red.

#### `fairAudienceQuestions`

- `eventId`, `eventDayId`, `eventModelId`
- `prompt`, `options: Array<{ id: string; label: string; order: number }>` sa najmanje dve opcije
- `status: draft | published | closed`
- `sortOrder`, `startsAt`, opciono `endsAt`
- `showOnSponsoredRotation`
- `createdAt`, `updatedAt`
- indeksi `by_eventModelId_and_eventDayId`, `by_eventDayId_and_status`

Admin publish mutacija proverava dnevni entitlement: Starter najviše 1, Advanced najviše 5. Na dan nadogradnje već postojeće pitanje se računa u limit 5.

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

#### `fairSurveyResponses`

- `submissionId`, `visitorId`, `eventId`, `eventModelId`, `surveyId`
- `answers`, `submittedAt`
- indeksi `by_submissionId`, `by_surveyId_and_submittedAt`, `by_visitorId_and_surveyId`

Ponašanje ponovnog popunjavanja ankete nije zaključano. Napravi idempotentnost po `submissionId`, ali pre finalne mutacije prijavi da vlasnik treba da odluči da li jedan posetilac može kasnije da menja kompletan odgovor.

Published verzija ankete koja već ima odgovore ne menja pitanja/opcije u mestu. Nova struktura dobija novu verziju kako stari odgovori ne bi promenili značenje.

### 5.4 Leadovi i email

#### `fairConsentConfigs`

- `eventId`, `leadKind: interest | test_drive`, `version`, `text`
- `status: draft | active | retired`, `activatedAt`, `createdAt`, `updatedAt`
- indeks `by_eventId_and_leadKind_and_status`
- indeks `by_eventId_and_leadKind_and_version`

Klijent šalje samo da je korisnik prihvatio i verziju koju je prikazao. Server učitava aktivnu konfiguraciju i sam upisuje tačan `consentTextSnapshot`; ne veruje proizvoljnom tekstu iz browsera. Dok pravni tekst nije odobren i jedna verzija aktivirana, lead mutacija mora vratiti kontrolisani `CONSENT_NOT_CONFIGURED` i ne sme čuvati PII.

#### `fairLeads`

- `submissionId`
- `kind: interest | test_drive`
- `visitorId`, `eventId`, `eventModelId`, `exhibitorId`
- opciono `contactName`, `email`, `phone`; konačna pravila koja kombinacija je obavezna donose se kasnije i sprovode u mutaciji, bez nove migracije šeme
- `consentAccepted: true`, `consentVersion`, `consentTextSnapshot`, `consentedAt`
- `status: received | delivered | deleted`
- `createdAt`, `purgeAt`, opciono `deletedAt`
- indeksi `by_submissionId`, `by_eventModelId_and_createdAt`, `by_exhibitorId_and_createdAt`, `by_status_and_purgeAt`

`submissionId` je idempotency key. Mutacija u istoj transakciji proverava entitlement, upisuje lead i zakazuje potvrdu. Ne dozvoli `consentAccepted: false` kao sačuvan lead.

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

Potrebno je pre oslanjanja na email dokazati u ciljnom DEV deploymentu da postoje `RESEND_API_KEY` i `RESEND_FROM_EMAIL`, bez ispisivanja njihovih vrednosti.

### 5.5 Pasoš brenda

#### `fairPassportStamps`

- `visitorId`, `eventId`, `brandId`, `eventModelId`, `scannedAt`
- indeks `by_visitorId_and_eventId_and_brandId`
- indeks `by_visitorId_and_eventModelId`

Scan modela idempotentno dodaje pečat samo ako je model `passportEligible`. Ne oslanjaj se na broj scan događaja.

#### `fairBrandFavoriteVotes`

- `visitorId`, `eventId`, `brandId`, `eventModelId`
- `createdAt`, `updatedAt`
- indeks `by_visitorId_and_eventId_and_brandId` (jedan promenljiv favorit)
- indeks `by_eventId_and_brandId`

Favorite se može postaviti tek kada backend utvrdi da je posetilac skenirao sve trenutno zaključane eligible modele brenda. Pravilo šta se dešava ako se lista eligible modela naknadno promeni još je otvoreno; zato ne menjaj eligible set usred live događaja bez vlasničke odluke.

### 5.6 Izveštaji i retention

#### `fairReportRuns`

- `eventId`, `eventDayId`, `exhibitorId`
- `status: queued | building | ready | sent | failed`
- `dataThrough`, opciono `storageId`, `recipient`, `providerMessageId`, `error`
- `createdAt`, `updatedAt`
- indeks `by_eventDayId_and_exhibitorId`, `by_status_and_createdAt`

V1 obećava dnevni presek, ne novi „završni izveštaj”. Nije obavezno da backend dizajnira lep PDF. Mora da isporuči tačan, tipiziran dnevni dataset/CSV ili tabelu iz koje drugi tok može napraviti PDF. Izveštaj ne sme da meša izlagače.

Retention posao:

- radi u ograničenim batch-evima preko `by_status_and_purgeAt`;
- briše/anonymizuje PII prema finalnoj pravnoj odluci;
- ne briše agregatne ne-PII metrike;
- vodi minimalan operativni audit bez čuvanja kontakta u poruci greške;
- za sada se ne aktivira u produkciji dok nije zaključano da li dokaz saglasnosti živi duže od kontakta.

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
- stabilne error code unije

`FairPublicModel` najmanje sadrži:

```ts
type FairPublicModel = {
  id: string;
  eventId: string;
  eventSlug: string;
  exhibitorName: string;
  brandId: string;
  brandName: string;
  standId: string;
  standMapLocationId: string;
  slug: string;
  qrCode: string;
  displayName: string;
  variant?: string;
  priceText: string;
  specifications: Array<{ label: string; value: string }>;
  photoUrl?: string;
  capabilities: FairModelCapabilities;
};
```

Capabilities dolaze sa servera, npr. `canRate`, `canSubmitInterest`, `canRequestTestDrive`, `hasAudienceQuestions`, `hasSurvey`, `isSponsored`. Frontend ne poredi string paketa da bi sam zaključio prava.

Ne stavljaj korisnički tekst greške u ugovor. Vrati stabilan code (`FAIR_MODEL_NOT_FOUND`, `FEATURE_NOT_ENTITLED`, `CONSENT_REQUIRED`, `RATE_LIMITED`, `SUBMISSION_DUPLICATE`, `EVENT_NOT_ACTIVE`) i detalje koji nisu PII; frontend ih mapira kroz typed i18n sloj.

## 7. Potrebna funkcijska površina

Tačna imena mogu minimalno da se prilagode postojećem stilu, ali odgovornosti ne smeju da se spoje u jednu ogromnu datoteku.

### `convex/fairPublic.ts`

Public, read-only, bez PII:

- `getEventBySlug`
- `getModelByQrCode`
- `getModelBySlug`
- `getModelsByIds` — bounded, npr. maksimalno 50 ID-eva za lokalnu garažu
- `listAudienceQuestionsForModel`
- `getAudienceQuestionResult`
- `getSponsoredMapRotation`
- `getSponsoredGarageRotation`
- `getPassportCatalog`

Sponzorisane projekcije vraćaju samo published Advanced modele. Redosled treba da bude stabilan i ravnopravan; frontend može animirati rotaciju. Slot trajanje je otvoreno i ne pripada backend poslovnoj logici.

### `convex/fairInteractions.ts`

Public write površina bez PII čitanja:

- `recordQrScan`
- `getMyModelState` ili server-gateway ekvivalent
- `upsertRating`
- `upsertAudienceVote`
- `submitSurvey`
- `upsertBrandFavorite`

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

Kontakt se nikad ne vraća javnoj query funkciji. Nemoj dozvoliti da anonimni visitor hash služi kao ključ za čitanje kontakta.

### `convex/fairAdmin.ts`

Sve funkcije zahtevaju `requireAdmin`:

- upsert event/day/exhibitor/brand/stand/model
- publish/withdraw model
- upgrade package
- upsert/publish/close audience question
- upsert/publish survey
- set sponsored-result question
- dry-run i commit import
- list validation issues
- trigger/retry report i email poslove

Admin mutacije moraju biti idempotentne preko `externalKey`/stabilnih ključeva i ne smeju menjati QR kod postojećeg modela.

### `convex/fairAnalytics.ts` i `convex/fairReports.ts`

- internal/admin bounded metric queries po eventu, izlagaču, štandu, modelu, danu i satu
- daily dataset po izlagaču
- Advanced detalji za ratings/votes/survey/test-drive
- Starter ne dobija Advanced kolone kao lažne nule; projekcija jasno označava koja prava postoje
- report build/send orkestracija

## 8. Interni import format

Pošto podaci stižu telefonom, emailom i kroz različite materijale, obezbedi jedan verzionisan JSON format. Ne pravi izlagački formular.

Minimalna struktura:

```json
{
  "version": 1,
  "eventCode": "...",
  "exhibitors": [
    {
      "externalKey": "...",
      "displayName": "...",
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
- hard error za dupli `qrCode`, slug ili externalKey u eventu;
- upozorenje/fallback kada cena ili fotografija nedostaju;
- validaciju da stand mapLocationId postoji u ugovoru sa mapom pre finalnog publish-a;
- nikada automatsko izmišljanje specifikacije, cene ili fotografije.

QR kod generiši jednom pri prvom kreiranju modela iz nepredvidivog stabilnog koda. Import izmene ga ne menjaju.

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
- Isti visitor drugi model = novi unique za taj model.
- Isti visitor isti model na drugom eventu = drugi event-model, dakle zaseban unique.
- Identičan `requestId` retry = bez novog total ili unique.
- Direktno otvaranje modela iz garaže/sponzorisane kartice nije QR scan.
- Promena ratinga ne povećava count; menja sum/prosek.
- Promena audience glasa smanjuje staru i povećava novu opciju; total broj glasača ostaje isti.
- Lead nastao pre upgrade-a se ne pretvara retroaktivno u Advanced lead.
- Scan pre upgrade-a ostaje vidljiv u kasnijoj model analytics projekciji.
- Besplatni nivo dobija samo zbir štanda, ne redove po modelu.
- Starter dobija model analytics i dnevni presek.
- Advanced dobija sve Starter podatke plus svoje dodatne interaction podatke.

Preporuka: prikupljaj `dateKey` i `hourKey` od početka. Time je satna raspodela skoro besplatna za kasniju odluku, ali je ne obećavaj u javnom izveštaju dok vlasnik ne potvrdi.

## 11. Redosled implementacije i checkpoint-i

### B0 — ugovor i šema

Isporuka:

- `lib/fair-contract.ts`
- `lib/fair-entitlements.ts`
- fair validatori
- tabele i indeksi
- schema/entitlement testovi
- kratak `FAIR-BACKEND-CONTRACT.md` generisan/održavan iz stvarne funkcijske površine

Checkpoint: commituj i pushuj pre business mutacija, da frontend može da krene prema stabilnim tipovima.

### B1 — katalog, import i admin komande

- event/day/exhibitor/brand/stand/model CRUD za admina
- dry-run/commit import
- stabilni QR identitet
- package upgrade + audit istorija
- publish validation

### B2 — anonimni identitet i scan pipeline

- server hash gateway
- visitor upsert
- idempotent total/unique scan
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
- ravnopravni stabilni redosled; animacija i timing ostaju frontend

### B6 — analitika i dnevni dataset

- tačne aggregate funkcije
- dnevni/satni segmenti
- export po izlagaču
- report run lifecycle

### B7 — retention, hardening i integracioni dokaz

- bounded purge seam
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
- total/unique definicije;
- dva event-modela istog komercijalnog modela su razdvojena;
- passport stamp se ne duplira.

### Interakcije

- rating upsert i detaljne ocene samo Advanced;
- vote upsert i tačan counter delta;
- survey samo Advanced;
- favorite tek po kompletiranom pasošu;
- pokušaj funkcije bez entitlementa vraća stabilan code, bez parcijalnog upisa.

### Leadovi/email

- odbijena saglasnost ne pravi lead;
- interest Starter+, test drive samo Advanced;
- submission retry ne duplira lead ni email;
- immediate potvrda tačno jednom;
- follow-up samo za Advanced i tačno jednom;
- public funkcije ne vraćaju kontakte;
- purge batch ne prelazi limit i ne dira ne-PII metrike.

### Izveštaji i izolacija

- izlagač A nikada ne dobija model/lead/odgovor izlagača B;
- included vidi samo stand total;
- Starter/Advanced projekcije odgovaraju ugovoru;
- day/event granice koriste `Europe/Belgrade`, ne lokalnu zonu servera;
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
- package capabilities server vraća tačno;
- total/unique scan test prolazi;
- rating/vote izmene ne dupliraju podatke;
- lead ima odobren consent tekst i retention pravilo;
- Resend env i sender su provereni bez izlaganja tajni;
- email retry ne šalje duplikate;
- dnevni dataset ne meša izlagače;
- Advanced sponsored projekcije sadrže samo validne published modele;
- javne funkcije ne otkrivaju PII ni admin podatke;
- realan mobile scan tok testiran je bar jednom pre otvaranja hale;
- produkcijski deployment je posebno odobren.

## 15. Otvorene odluke koje agent ne sme da izmisli

### Blokiraju produkciju leadova

1. Konačni tekst saglasnosti i privacy policy.
2. Rukovalac/obrađivač po toku.
3. Minimalna obavezna kontakt polja.
4. Da li se dokaz saglasnosti zadržava duže od kontakta.
5. Bezbedan način dostave PII izlagaču.
6. Follow-up vreme, unsubscribe i retry pravila.

### Blokiraju finalni javni rezultat, ne osnovnu šemu

1. Minimalan broj glasova pre javnog procenta.
2. Koje pitanje/rezultat se prikazuje uz Advanced model na mapi.
3. Fallback kada nema dovoljno glasova ili slike.
4. Pravilo scanova pre/posle zvaničnog prozora i operativnih testova.
5. Da li survey odgovor može da se promeni.
6. Passport uslov paketa i ponašanje pri promeni eligible modela.
7. Tačan format/vreme dnevnog preseka i da li se javno obećava satna raspodela.

Za ove tačke pripremi konfigurabilna polja/seam gde je jeftino, ali nemoj birati vrednost niti javni tekst. Dodaj ih u status izveštaj vlasniku.

## 16. Zabranjeno

- Nema visitor naloga, prijave, fingerprintinga ili identifikacije emailom/telefonom.
- Nema exhibitor dashboarda ili naloga.
- Nema izbora termina probne vožnje.
- Nema glasanja na mapi.
- Nema automatskog dodavanja modela u garažu.
- Nema personalizacije sponsored rotacije po srodnosti.
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
2. napravi čist tipizirani ugovor i centralni entitlement katalog;
3. dodaj fair tabele/indekse i validatore bez seeda/migracije live podataka;
4. napiši schema/entitlement testove;
5. pokreni verifikacije;
6. commituj kao mali checkpoint i pushuj svoju backend granu;
7. pošalji vlasniku funkcijsku/tabelarnu površinu i sve konflikte ili otvorene odluke.

Ne prelazi na B1 dok vlasnik/integracioni tok ne pregleda B0 ugovor. Ovo je namerna kontrolna tačka: frontend i ostatak backenda zavise od istih tipova i prava.
